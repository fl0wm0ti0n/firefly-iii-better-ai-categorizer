# Sprint S0003 — US-0001

ID: S0003  
Work item: US-0001  
Orchestrator run: `auto-20260613T124124Z-us0001`

## Goal

Bootstrap the automated test harness for `#resolveCategory` precedence regression
and CI/local quality gates. per **DEC-0006** (Option A injectable-deps factory) and
**R-0008** (`node:test` + ESM on Node 18).

**Unblocks:** US-0003 (Structured Outputs regression), US-0004 (history pipeline tests).

## Scope

| In scope | Out of scope |
|----------|--------------|
| `App.createForTest(deps)` + `App.resolveCategoryForTest()` test seam | Live Firefly/OpenAI E2E |
| `tests/fixtures/` — categories, transactions, service stubs | `App.js` route extraction |
| `tests/resolveCategory.test.js` — ≥4 precedence cases (AC-2) | Browser/UI tests |
| `tests/run-tests.sh` executable Linux runner (AC-1) | Option B `CategorizationPipeline.js` extract |
| Optional `tests/run-tests.ps1` (AC-3 Windows parity) | Real service instances with async load races |
| Runbook `TEST_COMMAND` + `npm test` delegation (AC-3, AC-4) | |
| CI `checks` job runs `TEST_COMMAND` when set (AC-5) | |

## Tasks

| ID | Title | Required |
|----|-------|----------|
| T-0005 | App test seam (`createForTest`, `resolveCategoryForTest`) | Yes |
| T-0006 | Test fixtures (`categories`, `transactions`, `stubs`) | Yes |
| T-0007 | Precedence tests — required cases 1–4 | Yes |
| T-0008 | Linux shell runner (`run-tests.sh`) | Yes |
| T-0009 | Runbook `TEST_COMMAND` + `npm test` | Yes |
| T-0010 | CI checks job verification | Yes |
| T-0011 | Optional stretch cases 5–6 | Optional |

**Task count:** 6 required + 1 optional = 7 (under `SPRINT_MAX_TASKS=12`; no split).

## Risks

- **T1:** Minimal test-only surface on `App` (~15–25 LOC); explicit `*ForTest` naming.
- **T2:** Runner must use `node --test tests/` — no `**` glob on Node 18 (R-0008).
- **T3:** Precedence tests use stub deps, not real mapping services with async constructors.
- **T4:** Runbook currently points to missing `tests/run-tests.ps1` — fix in T-0009.
- **T6:** DEC-0006 locks Option A; reject pipeline extraction mid-sprint.

## Definition of Done

- All US-0001 acceptance rows (AC-1 through AC-5) covered by tasks T-0005–T-0010.
- `bash tests/run-tests.sh` exits 0 on Linux with all 4 required precedence cases green.
- `npm test` delegates to canonical runner.
- Runbook `TEST_COMMAND` points to working Linux runner; Windows ps1 documented (AC-3).
- CI `checks` job conditionally runs `TEST_COMMAND` — verified green after runbook update.
- `/plan-verify` coverage recorded in `plan-verify.json` (next phase).

## References

- `docs/engineering/architecture.md` (# US-0001)
- `decisions/DEC-0006.md`
- `docs/engineering/research.md` (R-0008)
- `docs/product/acceptance.md` (US-0001 AC-1–AC-5)
- `docs/engineering/spec-pack/US-0001-crs.md`
- `handoffs/po_to_tl.md` (discovery mock matrix)
