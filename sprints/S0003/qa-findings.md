# QA Findings — Sprint S0003 (US-0001)

**Verdict:** PASS  
**Verified at:** 2026-06-13T12:51:00Z  
**Role:** qa  
**Orchestrator run:** `auto-20260613T124124Z-us0001`  
**Work item:** US-0001

## Scope

Verify US-0001 acceptance criteria: bootstrap automated test harness for
`#resolveCategory` precedence (account mapping → auto-cat → AI mock), canonical
Linux runner, runbook `TEST_COMMAND`, `npm test` delegation, and CI `checks`
integration. No live Firefly or OpenAI required.

## Test plan

| # | Check | Method |
|---|-------|--------|
| 1 | AC-1 — `tests/run-tests.sh` exists, executable, exits 0 | `ls -la`, independent `bash tests/run-tests.sh` |
| 2 | AC-2 — `#resolveCategory` precedence (≥4 cases) | Code review + test output (case ids + mock call counts) |
| 3 | AC-3 — runbook `TEST_COMMAND` + OS-aware docs | Read `docs/engineering/runbook.md`; verify Windows `run-tests.ps1` |
| 4 | AC-4 — `npm test` delegates to runner | Independent `npm test` |
| 5 | AC-5 — CI `checks` runs `TEST_COMMAND` when set | Code review `.github/workflows/ci.yml` + runbook parser simulation |
| 6 | Baseline `TEST_COMMAND` (US-0066) | Mandatory re-run (rows 1 + 4) |
| 7 | Optional lint/typecheck | Runbook keys blank → `skipped` |
| 8 | Metadata sanitizer (US-0071) | `scripts/check-user-visible-metadata.py` presence |
| 9 | Runtime autopilot (US-0065) | Out of scope — unit-test harness only; no app startup required |
| 10 | UAT probes (US-0092) | No user-visible acceptance steps; `uat.json` placeholder |

## Acceptance criteria results

| AC | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| AC-1 | `tests/run-tests.sh` exists, executable, exits 0 on Linux CI | **PASS** | `-rwxr-xr-x tests/run-tests.sh`; QA re-run exit 0, 4/4 pass |
| AC-2 | Tests cover `#resolveCategory` precedence with ≥4 cases | **PASS** | `tests/resolveCategory.test.js` cases 1–4; `App.createForTest` / `resolveCategoryForTest` in `src/App.js` |
| AC-3 | Runbook `TEST_COMMAND` points to working runner; dual sh/ps documented | **PASS** | `TEST_COMMAND: bash tests/run-tests.sh`; Windows `run-tests.ps1` + notes in runbook |
| AC-4 | `npm test` delegates to test runner | **PASS** | `package.json` `"test": "bash tests/run-tests.sh"`; QA `npm test` exit 0, 4/4 |
| AC-5 | CI `checks` job runs `TEST_COMMAND` when set | **PASS** | `ci.yml` parses runbook → conditional Test step runs `${{ steps.runbook.outputs.TEST_COMMAND }}` |

## Independent test evidence (QA re-run)

```
bash tests/run-tests.sh — exit 0, 4/4 pass (~457ms)
npm test              — exit 0, 4/4 pass (~445ms)

Cases:
  case-1-account-wins       — Groceries / account_category_mapping
  case-2-auto-cat-wins      — Travel & Foreign; classify callCount=0
  case-3-ai-wins            — Restaurants; classify callCount=1
  case-4-account-beats-ai   — Groceries; classify callCount=0
```

Output refs: `/tmp/qa-run-tests-sh.out`, `/tmp/qa-npm-test.out` (QA session).

## Generated baseline test evidence (US-0066)

- `generated_test_stack_profile`: node
- `generated_test_command`: `bash tests/run-tests.sh` (runbook); `npm test` delegates
- `generated_test_result`: pass
- `generated_test_output_ref`: 4/4 TAP pass (QA re-run 2026-06-13T12:51:00Z)
- `generated_test_paths_ref`: `tests/run-tests.sh`, `tests/resolveCategory.test.js`, `tests/fixtures/`
- `generated_test_reason_code`: (none — pass)

## Optional checks

| Check | Result | Notes |
|-------|--------|-------|
| `LINT_COMMAND` | skipped | Blank in runbook |
| `TYPECHECK_COMMAND` | skipped | Blank in runbook |
| Metadata sanitizer | skipped | `scripts/check-user-visible-metadata.py` absent → `METADATA_SANITIZATION_POLICY_MISSING` (informational) |

## Runtime QA evidence (US-0065)

Not required for US-0001 scope (unit-test harness; dev handoff explicitly excludes live stack).

- `runtime_startup_command`: n/a
- `runtime_stack_profile`: node
- `runtime_mode`: local
- `runtime_health_target`: n/a
- `runtime_health_result`: skipped
- `runtime_log_summary`: n/a
- `runtime_retry_count`: 0
- `runtime_retry_ledger`: []
- `runtime_final_verdict`: skipped
- `runtime_reason_code`: `RUNTIME_NOT_IN_SCOPE_US0001`
- `runtime_evidence_refs`: `handoffs/dev_to_qa.md` (unit tests only)

## UAT probe evidence (US-0092)

- `uat.json`: placeholder (`phase: placeholder`); no mapped operator steps for US-0001 (`user_visible: false`)
- `reason_code`: `UAT_PROBE_NOT_APPLICABLE` (non-blocking; verify-work may confirm harness docs only)

## Findings

### Informational (non-blocking)

| ID | Severity | Finding | Reason code |
|----|----------|---------|-------------|
| QA-INFO-1 | info | T-0011 optional stretch cases 5–6 not implemented | `OPTIONAL_TASK_DEFERRED` |
| QA-INFO-2 | info | Metadata sanitizer script absent | `METADATA_SANITIZATION_POLICY_MISSING` |

### Blocking QA findings

None.

## Sync policy snapshot

- `qa_status`: clear
- `reason_code`: (not evaluated — QA phase only)
- Open blockers for auto-push: none from QA

## Next phase

**`/verify-work`** — fresh subagent context; UAT placeholder resolution for US-0001 (harness-only).
