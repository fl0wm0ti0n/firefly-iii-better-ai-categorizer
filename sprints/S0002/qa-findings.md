# QA Findings — Sprint S0002 (BUG-0001)

**Verdict:** PASS (with deferred live-Firefly healthy-path checks)  
**Verified at:** 2026-06-13T12:36:52Z  
**Role:** qa  
**Orchestrator run:** `auto-20260613T122818Z-bug0001`  
**Work item:** BUG-0001

## Scope

Verify BUG-0001 acceptance criteria: category dropdown JSON-parse failure when Firefly
returns HTML; structured API errors; `Accept: application/json` + content-type guard;
dropdown population when Firefly healthy.

## Test plan

| # | Check | Method |
|---|-------|--------|
| 1 | AC-1 — no `Unexpected token <` console error on page load | Browser smoke (port 3001, updated code) + code review |
| 2 | AC-2 — structured `GET /api/categories` contract | Mock HTTP server (5 cases) + live curl (3000 vs 3001) |
| 3 | AC-3 — `Accept` header + content-type guard in `getCategories()` | Code review + mock Accept-header probe |
| 4 | AC-4 — dropdown `<select>` populate when Firefly healthy | Deferred — Firefly API reachable but PAT not auto-read |
| 5 | T-0004 row 5 — webhook/bulk regression | Deferred — requires healthy Firefly + PAT |
| 6 | Baseline `TEST_COMMAND` | `npm test` (expected fail — US-0001 open) |
| 7 | Metadata sanitizer | `scripts/check-user-visible-metadata.py` missing → `METADATA_SANITIZATION_POLICY_MISSING` (informational) |
| 8 | UI error surfacing (T-0003) | Browser dropdown inspection on misconfigured Firefly |

## Acceptance criteria results

| AC | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| AC-1 | No `Unexpected token < in JSON` from `loadCategoriesForKeywordMappings` | **PASS** | Browser: 0 console errors, dropdown shows `fetch failed` not parse jargon; `hasUnexpectedTokenInDom: false` |
| AC-2 | Structured `{ success, categories\|error }` from `GET /api/categories` | **PASS** | Mock HTML 200 → `FIREFLY_URL` in error; port 3001 → `{"success":false,"error":"fetch failed"}`; port 3000 (stale Docker) still returns old parse error — deployment not refreshed |
| AC-3 | `getCategories()` sends `Accept: application/json` + content-type guard | **PASS** | `src/FireflyService.js:21-50`; mock Accept-header probe |
| AC-4 | Keyword + account-mapping dropdowns populate when Firefly returns categories | **DEFERRED** | Firefly reachable on `localhost:888` (401 unauthenticated); valid PAT in `.env` not auto-read per `UAT_PROBE_FORBIDDEN` |

## Findings

### Resolved (implementation verified)

1. **FireflyService guard (T-0001)** — `Accept: application/json` sent; non-JSON HTML bodies throw
   `FireflyException` with `FIREFLY_URL/token` guidance instead of `response.json()` parse failure.
2. **App.js structured errors (T-0002)** — `#getCategories` returns sorted success payload or trimmed
   `{ success: false, error }` without raw JSON-parse strings.
3. **UI polish (T-0003)** — `truncateDropdownError()` surfaces backend error text in dropdown options
   (`fetch failed` observed) instead of generic "Failed to load categories".

### Informational (non-blocking)

| ID | Severity | Finding | Reason code |
|----|----------|---------|-------------|
| QA-INFO-1 | info | Stale Docker `categorizer` on port 3000 (started Jun 12) still serves pre-fix code | `RUNTIME_DEPLOYMENT_STALE` |
| QA-INFO-2 | info | No automated test suite (`npm test` exits 1; `tests/run-tests.ps1` missing) | `TEST_SCAFFOLD_UNSUPPORTED_STACK` |
| QA-INFO-3 | info | Metadata sanitizer script absent | `METADATA_SANITIZATION_POLICY_MISSING` |

### Deferred (verify-work scope)

| ID | Severity | Finding | Reason code |
|----|----------|---------|-------------|
| QA-DEF-1 | deferred | Healthy Firefly dropdown population (AC-4) | `UAT_PROBE_FORBIDDEN` (PAT) |
| QA-DEF-2 | deferred | Webhook/bulk category resolution regression (T-0004 row 5) | `UAT_PROBE_FORBIDDEN` (PAT) |

## Mock verification (QA re-run)

```
FireflyService mock HTTP server: 5/5 PASS
  html-200, valid-json, 401-unauthorized, empty-categories, accept-header

App route proxy (HTML mock): PASS
  { success: false, error: "...FIREFLY_URL/token..." }
```

## Generated baseline test evidence (US-0066)

- `generated_test_stack_profile`: node
- `generated_test_command`: `npm test` (runbook references missing `tests/run-tests.ps1`)
- `generated_test_result`: fail
- `generated_test_output_ref`: npm exit 1 — "Error: no test specified"
- `generated_test_paths_ref`: none (US-0001 open)
- `generated_test_reason_code`: `TEST_SCAFFOLD_UNSUPPORTED_STACK`

## Runtime QA evidence (US-0065)

- `runtime_startup_command`: `PORT=3001 node index.js` (QA ephemeral instance with workspace source)
- `runtime_stack_profile`: node
- `runtime_mode`: local
- `runtime_health_target`: `http://localhost:3001/` (HTTP 200)
- `runtime_health_result`: pass (updated code); port 3000 stale Docker still serves old behavior
- `runtime_log_summary`: `Error getting categories: fetch failed` (ENOTFOUND firefly_app) — no critical parse errors
- `runtime_retry_count`: 0
- `runtime_retry_ledger`: []
- `runtime_final_verdict`: pass
- `runtime_reason_code`: `RUNTIME_STARTUP_OK`
- `runtime_evidence_refs`: `sprints/S0002/evidence/browser/console-summary.json`

## Runtime browser evidence (US-0093)

- `UAT_BROWSER_PROBE_MODE`: cursor (scratchpad)
- `navigation_url`: `http://localhost:3001/`
- `browser_evidence_refs`:
  - `sprints/S0002/evidence/browser/console-summary.json`
  - Browser MCP snapshot (Keyword + Account mapping panels)
- `probe_results`: see `sprints/S0002/uat.json` `probe_results[]`
- Console: 0 errors; no `Unexpected token <` messages
- Dropdowns: keyword + account mapping show `fetch failed` (backend error surfaced)

## Blocking QA findings

None. Implementation meets acceptance for misconfigured/HTML-response scenarios.
Deferred healthy-Firefly checks are environmental (PAT policy), not code defects.

## Sync policy

- `reason_code`: `SYNC_PUSHED` not evaluated (QA phase only)
- Open blockers for auto-push: none from QA

## Next phase

**`/verify-work`** — operator PAT-backed UAT for AC-4 and T-0004 row 5; redeploy/restart
`categorizer` Docker to pick up fix on port 3000.
