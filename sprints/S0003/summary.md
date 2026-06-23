# Summary — Sprint S0003 (US-0001)

**Status:** released 2026-06-13 (`handoffs/releases/S0003-release-notes.md`)

## Goal

Bootstrap automated test harness for `#resolveCategory` precedence regression per
**DEC-0006** (Option A injectable-deps factory) and **R-0008** (`node --test tests/`).

## Completed

| Task | Status | Notes |
|------|--------|-------|
| T-0005 | done | `App.createForTest(deps)` + `resolveCategoryForTest()` on `App.js` |
| T-0006 | done | `tests/fixtures/` — categories, transactions, service stubs |
| T-0007 | done | `tests/resolveCategory.test.js` — cases 1–4 (AC-2) |
| T-0008 | done | `tests/run-tests.sh` (+ `run-tests.ps1`); executable; `node --test tests/` |
| T-0009 | done | Runbook `TEST_COMMAND`; `npm test` delegation; Windows runner documented |
| T-0010 | done | CI `checks` reads runbook `TEST_COMMAND`; local proxy PASS |
| T-0011 | pending | Optional stretch cases 5–6 (not implemented) |

### Files changed

- `src/App.js` — test seam (`createForTest`, `resolveCategoryForTest`)
- `tests/fixtures/categories.js`, `transactions.js`, `stubs.js`
- `tests/resolveCategory.test.js`
- `tests/run-tests.sh`, `tests/run-tests.ps1`
- `docs/engineering/runbook.md` — `TEST_COMMAND: bash tests/run-tests.sh`
- `package.json` — `"test": "bash tests/run-tests.sh"`

## Test results (execute 2026-06-13)

```
bash tests/run-tests.sh — 4/4 pass
npm test — 4/4 pass (delegates to run-tests.sh)

Cases:
  case-1-account-wins
  case-2-auto-cat-wins (classify not called)
  case-3-ai-wins (classify called once)
  case-4-account-beats-ai (classify.mock.callCount() === 0)
```

## CI verification (T-0010)

- Runbook parser: `TEST_COMMAND='bash tests/run-tests.sh'` → CI `checks` test step runs
- No `.github/workflows/ci.yml` edit required

## Open items

- T-0011 optional stretch cases (stale mapping, AI invalid category) — deferred post-release
