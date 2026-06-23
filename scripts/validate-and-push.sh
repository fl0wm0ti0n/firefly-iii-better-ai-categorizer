#!/usr/bin/env bash
# -------------------------------------------------------------------
# validate-and-push.sh — local test-fix-push loop
#
# Part of the its-magic quality chain:
#   Cursor AI loop  →  validate-and-push  →  CI auto-fix (GitHub)
#
# Bash is required for safe eval + optional timeout wrapping (DEC-0058 / parity
# with validate-and-push.ps1).
#
# Reads merged scratchpad (installer merge) for sync policy and runbook keys
# for commands. Opt-in push only when policy allows. See runbook (DEC-0058).
# -------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
  shift
fi

MAX_ATTEMPTS="${1:-5}"
BRANCH="${2:-}"
AUTO_COMMIT="${3:-true}"

pass_color="\033[1;32m"
fail_color="\033[1;31m"
info_color="\033[1;36m"
warn_color="\033[1;33m"
reset="\033[0m"

log_info()  { printf "${info_color}[info]${reset}  %s\n" "$*"; }
log_pass()  { printf "${pass_color}[pass]${reset}  %s\n" "$*"; }
log_fail()  { printf "${fail_color}[fail]${reset}  %s\n" "$*"; }
log_warn()  { printf "${warn_color}[warn]${reset}  %s\n" "$*"; }

resolve_python() {
  if command -v python >/dev/null 2>&1; then printf "%s" "python"; return; fi
  if command -v python3 >/dev/null 2>&1; then printf "%s" "python3"; return; fi
  printf "%s" ""
}

run_with_timeout() {
  local sec="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$sec" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$sec" "$@"
  else
    "$@"
  fi
}

# Run runbook command string from repo root; optional wall-clock cap.
run_runbook_cmd() {
  local cmd="$1"
  local kind="$2"
  local sec="$3"
  if command -v timeout >/dev/null 2>&1 || command -v gtimeout >/dev/null 2>&1; then
    if ! run_with_timeout "$sec" bash -c 'cd "$1" && eval "$2"' _ "$ROOT" "$cmd"; then
      local ec=$?
      if [ "$kind" = "test" ]; then
        if [ "$ec" = "124" ] || [ "$ec" = "143" ]; then log_fail "reason_code=TEST_TIMEOUT"; else log_fail "reason_code=TEST_FAILED"; fi
      else
        log_fail "reason_code=OPTIONAL_CHECK_FAILED"
      fi
      return 1
    fi
  else
    if ! ( cd "$ROOT" && eval "$cmd" ); then
      if [ "$kind" = "test" ]; then log_fail "reason_code=TEST_FAILED"; else log_fail "reason_code=OPTIONAL_CHECK_FAILED"; fi
      return 1
    fi
  fi
  return 0
}

RUNBOOK="$ROOT/docs/engineering/runbook.md"

read_runbook_key() {
  local key="$1"
  if [ ! -f "$RUNBOOK" ]; then return; fi
  local value
  value=$(sed -n "s/^${key}:[[:space:]]*\(.\{1,\}\)$/\1/p" "$RUNBOOK" | head -n 1)
  case "$value" in
    ""|"..."|"<...>"|"TODO") return ;;
  esac
  printf "%s" "$value"
}

run_sync_gate() {
  local sub="$1"
  local out err line gate_ok gate_rc
  out="$(mktemp)"
  err="$(mktemp)"
  set +e
  "$PY" "$GATE_SCRIPT" "$sub" --root "$ROOT" --branch "$BRANCH" >"$out" 2>"$err"
  set -e
  if [ -s "$err" ]; then cat "$err" >&2; fi
  line="$(grep '^{' "$out" | tail -n 1)"
  rm -f "$out" "$err"
  if [ -z "$line" ]; then
    log_fail "reason_code=SYNC_GATE_EMPTY_RESPONSE"
    return 1
  fi
  gate_ok="$("$PY" -c "import json,sys; print(1 if json.loads(sys.argv[1]).get('ok') else 0)" "$line" 2>/dev/null || echo 0)"
  gate_rc="$("$PY" -c "import json,sys; print(json.loads(sys.argv[1]).get('reason_code') or '')" "$line" 2>/dev/null || true)"
  if [ "$gate_ok" != "1" ]; then
    log_fail "reason_code=${gate_rc:-SYNC_GATE_BLOCK}"
    return 1
  fi
  return 0
}

PY="$(resolve_python)"
if [ -z "$PY" ]; then
  log_fail "reason_code=PYTHON_NOT_ON_PATH"
  log_warn "Install Python 3 and ensure it is on PATH for merged scratchpad policy gates."
  exit 1
fi

GATE_SCRIPT="$ROOT/scripts/sync_push_gates.py"
if [ ! -f "$GATE_SCRIPT" ]; then
  log_fail "reason_code=SYNC_GATE_SCRIPT_MISSING"
  exit 1
fi

if [ -z "$BRANCH" ]; then
  BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
fi

log_info "validate-and-push loop"
log_info "Branch: $BRANCH  |  Max attempts: $MAX_ATTEMPTS"
if [ "$DRY_RUN" = "1" ]; then log_info "Dry-run: no git push will run."; fi
printf "\n"

if ! run_sync_gate policy; then exit 1; fi

TEST_CMD=$(read_runbook_key "TEST_COMMAND")
LINT_CMD=$(read_runbook_key "LINT_COMMAND")
TYPECHECK_CMD=$(read_runbook_key "TYPECHECK_COMMAND")
LINT_FIX_CMD=$(read_runbook_key "LINT_FIX_COMMAND")
FORMAT_CMD=$(read_runbook_key "FORMAT_COMMAND")
TIMEOUT_RAW=$(read_runbook_key "TEST_TIMEOUT_SECONDS")
TEST_TIMEOUT_SEC=120
case "$TIMEOUT_RAW" in
  ''|*[!0-9]*) ;;
  *) TEST_TIMEOUT_SEC="$TIMEOUT_RAW" ;;
esac

if [ -z "$TEST_CMD" ]; then
  log_fail "reason_code=TEST_COMMAND_MISSING"
  log_warn "TEST_COMMAND is required by sync policy for push-eligible paths."
  exit 1
fi

[ -n "$TEST_CMD" ] && log_info "TEST_COMMAND:     $TEST_CMD"
[ -n "$LINT_CMD" ] && log_info "LINT_COMMAND:     $LINT_CMD"
[ -n "$TYPECHECK_CMD" ] && log_info "TYPECHECK_COMMAND: $TYPECHECK_CMD"
[ -n "$LINT_FIX_CMD" ] && log_info "LINT_FIX_COMMAND: $LINT_FIX_CMD"
[ -n "$FORMAT_CMD" ] && log_info "FORMAT_COMMAND:   $FORMAT_CMD"
log_info "TEST_TIMEOUT_SECONDS: $TEST_TIMEOUT_SEC"
printf "\n"

attempt=0
while [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  log_info "--- Attempt $attempt / $MAX_ATTEMPTS ---"

  cd "$ROOT"
  all_ok=true

  if [ -n "$FORMAT_CMD" ]; then
    log_info "Running formatter..."
    if eval "$FORMAT_CMD"; then log_pass "Format OK"; else log_warn "Formatter reported issues (non-blocking)"; fi
  fi

  if [ -n "$LINT_FIX_CMD" ]; then
    log_info "Running lint auto-fix..."
    eval "$LINT_FIX_CMD" || true
  fi

  if [ -n "$LINT_CMD" ]; then
    log_info "Running lint check..."
    if run_runbook_cmd "$LINT_CMD" "optional" "$TEST_TIMEOUT_SEC"; then log_pass "Lint OK"; else all_ok=false; fi
  fi

  if [ -n "$TYPECHECK_CMD" ]; then
    log_info "Running typecheck..."
    if run_runbook_cmd "$TYPECHECK_CMD" "optional" "$TEST_TIMEOUT_SEC"; then log_pass "Typecheck OK"; else all_ok=false; fi
  fi

  if [ -n "$TEST_CMD" ]; then
    log_info "Running tests..."
    if run_runbook_cmd "$TEST_CMD" "test" "$TEST_TIMEOUT_SEC"; then log_pass "Tests OK"; else all_ok=false; fi
  fi

  if [ "$all_ok" = "true" ]; then
    log_pass "All checks passed on attempt $attempt."
    break
  fi

  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    log_fail "Reached max attempts ($MAX_ATTEMPTS). Aborting push."
    printf "\n"
    log_warn "Fix the issues above, then re-run:"
    log_warn "  bash scripts/validate-and-push.sh"
    exit 1
  fi

  printf "\n"
  log_warn "Fix the failing checks, then press Enter to retry (or Ctrl+C to abort)..."
  read -r _unused
done

if ! run_sync_gate post; then exit 1; fi

printf "\n"

if [ "$DRY_RUN" = "1" ] || [ "$AUTO_COMMIT" != "true" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    log_pass "reason_code=SYNC_PUSHED (dry-run; no git push)"
  else
    log_info "Auto-commit disabled. Push manually when ready."
    log_pass "reason_code=SYNC_PUSHED (checks only; push skipped by flag)"
  fi
  exit 0
fi

cd "$ROOT"
if [ -n "$(git status --porcelain)" ]; then
  log_info "Staging and committing changes..."
  git add -A
  git commit -m "fix: address check failures (validate-and-push)"
else
  log_info "Working tree clean, nothing to commit."
fi

log_info "Pushing to origin/$BRANCH..."
git push origin "$BRANCH"
log_pass "reason_code=SYNC_PUSHED"
