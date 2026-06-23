# -------------------------------------------------------------------
# validate-and-push.ps1 — local test-fix-push loop
#
# Part of the its-magic quality chain:
#   Cursor AI loop  →  validate-and-push  →  CI auto-fix (GitHub)
#
# Reads merged scratchpad (installer merge / DEC-0055) for sync policy and
# runbook keys for commands. Opt-in push only when policy allows; reason codes
# on stdout/stderr. See docs/engineering/runbook.md (executable wiring: DEC-0058).
# -------------------------------------------------------------------

Param(
  [int]$MaxAttempts = 5,
  [string]$Branch,
  [switch]$NoCommit,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Log-Info  { param($Msg) Write-Host "[info]  $Msg" -ForegroundColor Cyan }
function Log-Pass  { param($Msg) Write-Host "[pass]  $Msg" -ForegroundColor Green }
function Log-Fail  { param($Msg) Write-Host "[fail]  $Msg" -ForegroundColor Red }
function Log-Warn  { param($Msg) Write-Host "[warn]  $Msg" -ForegroundColor Yellow }

function Resolve-PythonExe {
  foreach ($name in @("python", "python3")) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}

function Invoke-GateJson {
  param(
    [string]$PythonExe,
    [string]$GateScript,
    [string]$SubCommand,
    [string]$RepoRoot,
    [string]$BranchName
  )
  $outFile = [System.IO.Path]::GetTempFileName()
  $errFile = [System.IO.Path]::GetTempFileName()
  try {
    $p = Start-Process -FilePath $PythonExe `
      -ArgumentList @($GateScript, $SubCommand, "--root", $RepoRoot, "--branch", $BranchName) `
      -Wait -PassThru -NoNewWindow `
      -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $stderr = if (Test-Path $errFile) { Get-Content -Raw -Path $errFile } else { "" }
    $stdout = if (Test-Path $outFile) { Get-Content -Raw -Path $outFile } else { "" }
    if ($stderr.Trim().Length -gt 0) { Write-Host $stderr.TrimEnd() }
    return @{ ExitCode = $p.ExitCode; StdOut = $stdout.Trim() }
  }
  finally {
    Remove-Item -Path $outFile, $errFile -ErrorAction SilentlyContinue
  }
}

function Read-RunbookKey {
  param([string]$Key)
  $runbook = Join-Path $root "docs\engineering\runbook.md"
  if (-not (Test-Path $runbook -PathType Leaf)) { return "" }
  $content = Get-Content -Path $runbook -Raw
  $m = [regex]::Match($content, "(?m)^${Key}:[ \t]*(.+)$")
  if (-not $m.Success) { return "" }
  $val = $m.Groups[1].Value.Trim()
  if ($val -in @("", "...", "<...>", "TODO")) { return "" }
  return $val
}

$py = Resolve-PythonExe
if (-not $py) {
  Log-Fail "reason_code=PYTHON_NOT_ON_PATH"
  Log-Warn "Install Python 3 and ensure it is on PATH for merged scratchpad policy gates."
  exit 1
}

$gateScript = Join-Path $root "scripts\sync_push_gates.py"
if (-not (Test-Path $gateScript -PathType Leaf)) {
  Log-Fail "reason_code=SYNC_GATE_SCRIPT_MISSING"
  exit 1
}

if (-not $Branch) {
  $Branch = (git -C $root rev-parse --abbrev-ref HEAD 2>$null)
  if (-not $Branch) { $Branch = "main" }
}

Log-Info "validate-and-push loop"
Log-Info "Branch: $Branch  |  Max attempts: $MaxAttempts"
if ($DryRun) { Log-Info "Dry-run: no git push will run." }
Write-Host ""

$pol = Invoke-GateJson -PythonExe $py -GateScript $gateScript -SubCommand "policy" -RepoRoot $root -BranchName $Branch
try {
  $polObj = $pol.StdOut | ConvertFrom-Json
} catch {
  Log-Fail "reason_code=SYNC_POLICY_PARSE_FAILED"
  exit 1
}
if (-not $polObj.ok) {
  Log-Fail ("reason_code=" + $polObj.reason_code)
  exit 1
}

$TestCmd      = Read-RunbookKey "TEST_COMMAND"
$LintCmd      = Read-RunbookKey "LINT_COMMAND"
$TypecheckCmd = Read-RunbookKey "TYPECHECK_COMMAND"
$LintFixCmd   = Read-RunbookKey "LINT_FIX_COMMAND"
$FormatCmd    = Read-RunbookKey "FORMAT_COMMAND"
$timeoutRaw   = Read-RunbookKey "TEST_TIMEOUT_SECONDS"
$TestTimeoutSec = 120
if ($timeoutRaw -match '^\d+$') { $TestTimeoutSec = [int]$timeoutRaw }

if (-not $TestCmd) {
  Log-Fail "reason_code=TEST_COMMAND_MISSING"
  Log-Warn "TEST_COMMAND is required by sync policy for push-eligible paths."
  exit 1
}

if ($TestCmd)    { Log-Info "TEST_COMMAND:     $TestCmd" }
if ($LintCmd)    { Log-Info "LINT_COMMAND:     $LintCmd" }
if ($TypecheckCmd) { Log-Info "TYPECHECK_COMMAND: $TypecheckCmd" }
if ($LintFixCmd) { Log-Info "LINT_FIX_COMMAND: $LintFixCmd" }
if ($FormatCmd)  { Log-Info "FORMAT_COMMAND:   $FormatCmd" }
Log-Info "TEST_TIMEOUT_SECONDS: $TestTimeoutSec"
Write-Host ""

function Run-Cmd {
  param([string]$Cmd, [int]$TimeoutSec = 0)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($TimeoutSec -le 0) {
      Invoke-Expression $Cmd
      return @{ Ok = ($LASTEXITCODE -eq 0); TimedOut = $false }
    }
    $job = Start-Job -ScriptBlock {
      param($c, $r)
      Set-Location $r
      try {
        Invoke-Expression $c | Out-Null
      } catch {
        return 1
      }
      if ($null -eq $LASTEXITCODE) { return 0 }
      return $LASTEXITCODE
    } -ArgumentList $Cmd, $root
    $finished = Wait-Job -Job $job -Timeout $TimeoutSec
    if (-not $finished -or $job.State -eq "Running") {
      Stop-Job -Job $job -ErrorAction SilentlyContinue
      Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
      return @{ Ok = $false; TimedOut = $true }
    }
    $code = Receive-Job -Job $job
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    $exitNum = 1
    if ($null -ne $code) { $exitNum = [int]$code[-1] }
    return @{ Ok = ($exitNum -eq 0); TimedOut = $false }
  } finally {
    $ErrorActionPreference = $prev
  }
}

$passed = $false
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  Log-Info "--- Attempt $attempt / $MaxAttempts ---"

  Push-Location $root
  $allOk = $true

  if ($FormatCmd) {
    Log-Info "Running formatter..."
    $r = Run-Cmd -Cmd $FormatCmd -TimeoutSec 0
    if ($r.Ok) { Log-Pass "Format OK" } else { Log-Warn "Formatter reported issues (non-blocking)" }
  }

  if ($LintFixCmd) {
    Log-Info "Running lint auto-fix..."
    Run-Cmd -Cmd $LintFixCmd -TimeoutSec 0 | Out-Null
  }

  if ($LintCmd) {
    Log-Info "Running lint check..."
    $r = Run-Cmd -Cmd $LintCmd -TimeoutSec $TestTimeoutSec
    if ($r.TimedOut) {
      Log-Fail "reason_code=OPTIONAL_CHECK_FAILED"
      $allOk = $false
    } elseif ($r.Ok) { Log-Pass "Lint OK" } else {
      Log-Fail "reason_code=OPTIONAL_CHECK_FAILED"
      $allOk = $false
    }
  }

  if ($TypecheckCmd) {
    Log-Info "Running typecheck..."
    $r = Run-Cmd -Cmd $TypecheckCmd -TimeoutSec $TestTimeoutSec
    if ($r.TimedOut) {
      Log-Fail "reason_code=OPTIONAL_CHECK_FAILED"
      $allOk = $false
    } elseif ($r.Ok) { Log-Pass "Typecheck OK" } else {
      Log-Fail "reason_code=OPTIONAL_CHECK_FAILED"
      $allOk = $false
    }
  }

  if ($TestCmd) {
    Log-Info "Running tests..."
    $r = Run-Cmd -Cmd $TestCmd -TimeoutSec $TestTimeoutSec
    if ($r.TimedOut) {
      Log-Fail "reason_code=TEST_TIMEOUT"
      $allOk = $false
    } elseif ($r.Ok) { Log-Pass "Tests OK" } else {
      Log-Fail "reason_code=TEST_FAILED"
      $allOk = $false
    }
  }

  Pop-Location

  if ($allOk) {
    Log-Pass "All checks passed on attempt $attempt."
    $passed = $true
    break
  }

  if ($attempt -ge $MaxAttempts) {
    Log-Fail "Reached max attempts ($MaxAttempts). Aborting push."
    Write-Host ""
    Log-Warn "Fix the issues above, then re-run:"
    Log-Warn "  powershell scripts\validate-and-push.ps1"
    exit 1
  }

  Write-Host ""
  Log-Warn "Fix the failing checks, then press Enter to retry (or Ctrl+C to abort)..."
  Read-Host | Out-Null
}

if (-not $passed) { exit 1 }

$post = Invoke-GateJson -PythonExe $py -GateScript $gateScript -SubCommand "post" -RepoRoot $root -BranchName $Branch
try {
  $postObj = $post.StdOut | ConvertFrom-Json
} catch {
  Log-Fail "reason_code=SYNC_POST_PARSE_FAILED"
  exit 1
}
if (-not $postObj.ok) {
  Log-Fail ("reason_code=" + $postObj.reason_code)
  exit 1
}

Write-Host ""

if ($DryRun -or $NoCommit) {
  if ($DryRun) {
    Log-Pass "reason_code=SYNC_PUSHED (dry-run; no git push)"
  } else {
    Log-Info "Auto-commit disabled (--NoCommit). Push manually when ready."
    Log-Pass "reason_code=SYNC_PUSHED (checks only; push skipped by flag)"
  }
  exit 0
}

Push-Location $root
$status = git status --porcelain
if ($status) {
  Log-Info "Staging and committing changes..."
  git add -A
  git commit -m "fix: address check failures (validate-and-push)"
} else {
  Log-Info "Working tree clean, nothing to commit."
}

Log-Info "Pushing to origin/$Branch..."
git push origin $Branch
Log-Pass "reason_code=SYNC_PUSHED"
Pop-Location
