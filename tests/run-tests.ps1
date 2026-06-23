$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
node --test tests/
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
