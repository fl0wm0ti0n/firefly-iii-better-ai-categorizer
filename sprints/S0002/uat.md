# UAT — Sprint S0002 (BUG-0001)

**Phase:** verify-work  
**Verified at:** 2026-06-13T12:38:16Z  
**Verdict:** PASS with deferred operator UAT (AC-4, T-0004 row 5)

## Target

- **BUG-0001** — Keyword mappings category load fails with JSON parse error

## Acceptance criteria mapping

| AC | Criterion | UAT step | Result |
|----|-----------|----------|--------|
| AC-1 | No `Unexpected token < in JSON` from `loadCategoriesForKeywordMappings` | uat-2 | **PASS** |
| AC-2 | Structured `{ success, categories\|error }` from `GET /api/categories` | uat-2, uat-3, uat-4 | **PASS** |
| AC-3 | `getCategories()` sends `Accept: application/json` + content-type guard | Code + mock (execute/QA) | **PASS** |
| AC-4 | Keyword + account-mapping `<select>` populate when Firefly returns categories | uat-1 | **DEFERRED** |

## UAT steps

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Healthy Firefly — dropdown population | **DEFERRED** | Firefly on `:888` reachable; PAT not auto-read (`UAT_PROBE_FORBIDDEN`) |
| 2 | Misconfigured Firefly — structured error, no console parse error | **PASS** | Port 3001 browser + API; 0 console errors; dropdown shows `fetch failed` |
| 3 | Invalid PAT — structured error | **PASS** | Mock 401 + live Firefly JSON 401 with `Accept: application/json` |
| 4 | Empty categories | **PASS** | Mock `{ data: [] }` → `{ success: true, categories: [] }` |
| 5 | Webhook / bulk regression | **DEFERRED** | Requires healthy Firefly + PAT |

## What verify-work confirmed without PAT

- **Firefly reachability:** `localhost:888` responds; from `categorizer` Docker, `firefly:8080` is reachable.
- **Unauthenticated API contract:** `GET /api/v1/categories` with `Accept: application/json` returns JSON `401 Unauthenticated` (not HTML redirect).
- **Updated code (port 3001):** `GET /api/categories` → `{"success":false,"error":"fetch failed"}`; browser dropdown surfaces backend error; no `Unexpected token <` in console.
- **Stale deployment (port 3000):** Docker `categorizer` container (Up 20h) still returns pre-fix `Unexpected token < in JSON at position 0` — **redeploy required**.

## What cannot be verified without PAT (operator action)

1. **AC-4** — Keyword-mapping and account-mapping dropdowns populated with real Firefly category names.
2. **T-0004 row 5** — Test webhook and bulk categorization resolve categories against live Firefly.

### Operator checklist (post-release / pre-close)

1. Rebuild/restart `categorizer` Docker so port 3000 serves the fix.
2. Ensure `FIREFLY_URL` and `FIREFLY_PAT` (or equivalent env names) are valid in deployment.
3. Load admin UI → Keyword Mappings + Account Mappings → confirm category dropdowns list Firefly categories.
4. Run Test Webhook smoke → confirm category resolution succeeds.

## Results summary

| Metric | Count |
|--------|-------|
| Passed | 3 |
| Failed | 0 |
| Deferred | 2 |

**Release readiness:** Code fix verified for misconfigured/HTML-response paths. Bug segment **ready for release** with documented operator follow-up for PAT-backed AC-4 and webhook/bulk smoke.

Evidence: `sprints/S0002/uat.json`, `sprints/S0002/qa-findings.md`, `sprints/S0002/evidence/browser/verify-work-console-summary.json`
