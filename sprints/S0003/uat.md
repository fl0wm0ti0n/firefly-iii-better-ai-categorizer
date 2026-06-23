# UAT — Sprint S0003 (US-0001)

**Phase:** verify-work  
**Verified at:** 2026-06-13T12:51:44Z  
**Verdict:** PASS  
**Work item:** US-0001 — Bootstrap automated test harness (`user_visible: false`)

## Target

Developer/operator CLI UAT for the bootstrap test harness — no live Firefly or OpenAI required.

## Acceptance criteria mapping

| AC | Criterion | UAT step | Result |
|----|-----------|----------|--------|
| AC-1 | `tests/run-tests.sh` exists, executable, exits 0 on Linux CI | uat-1 | **PASS** |
| AC-2 | Tests cover `#resolveCategory` precedence with ≥4 cases | uat-2 | **PASS** |
| AC-3 | Runbook `TEST_COMMAND` points to working runner (OS-aware sh/ps) | uat-3 | **PASS** |
| AC-4 | `npm test` delegates to canonical runner | uat-4 | **PASS** |
| AC-5 | CI `checks` job runs `TEST_COMMAND` when set | uat-5 | **PASS** |

## UAT steps

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Operator runs `bash tests/run-tests.sh` | **PASS** | Exit 0, 4/4 TAP pass; executable `-rwxr-xr-x` |
| 2 | Precedence matrix — 4 cases with mock call counts | **PASS** | case-1 through case-4 in test output |
| 3 | Runbook `TEST_COMMAND` + Windows runner docs | **PASS** | `TEST_COMMAND: bash tests/run-tests.sh`; `run-tests.ps1` documented |
| 4 | Operator runs `npm test` | **PASS** | Delegates to shell runner; exit 0, 4/4 pass |
| 5 | CI workflow reads runbook and runs tests | **PASS** | `.github/workflows/ci.yml` conditional Test step |

## Operator perspective

An operator or developer can verify the harness without external services:

1. Clone the repo and run `bash tests/run-tests.sh` (or `npm test` on Linux).
2. Expect four passing subtests covering `#resolveCategory` precedence.
3. On Windows, use `powershell -ExecutionPolicy Bypass -File tests/run-tests.ps1`.
4. CI will run the same `TEST_COMMAND` from the runbook on push/PR.

## Probe evidence (US-0092)

| Probe | Kind | Result | Reason |
|-------|------|--------|--------|
| us0001-verify-work-ac1-test-runner | test | PASS | `UAT_PROBE_PASS` — `/tmp/uat-run-tests-sh.out` |
| us0001-verify-work-ac4-npm-test | test | PASS | `UAT_PROBE_PASS` — `/tmp/uat-npm-test.out` |
| us0001-verify-work-ac3-runbook | cli_smoke | PASS | `UAT_PROBE_PASS` — runbook resolves to working command |
| us0001-verify-work-ac5-ci | manual_operator | PASS | `UAT_PROBE_PASS` — ci.yml runbook integration |
| us0001-verify-work-ac2-precedence | test | PASS | `UAT_PROBE_PASS` — 4 cases in TAP output |

No browser probes required (`user_visible: false`).

## Results summary

| Metric | Count |
|--------|-------|
| Passed | 5 |
| Failed | 0 |
| Deferred | 0 |

**Overall verdict:** PASS — all US-0001 acceptance criteria (AC-1 through AC-5) satisfied from operator/CLI perspective.

**Traceability:** `docs/product/acceptance.md` § US-0001; QA baseline `sprints/S0003/qa-findings.md`; machine-readable `sprints/S0003/uat.json`.

**Next phase:** `/release` in fresh subagent context.
