# Discovery — BUG-0003: Bulk assign POST `/api/account-category-mappings/bulk` returns 404 on production

**Phase**: discovery
**Role**: po
**Work item**: BUG-0003
**Fresh context marker**: discovery-bug0003-bulk-assign-404
**Timestamp**: 2026-06-28T21:10:00+02:00
**Verdict**: PASS — root cause confirmed, no code fix required

## Summary

BUG-0003 is a **stale deployment image** issue, not a code defect. The bulk assign route `POST /api/account-category-mappings/bulk` is correctly implemented in the local source code and was verified working in local UAT (S0011). The production Docker container `categorizer` was created **before** US-0008 was released, so it does not contain the bulk route. The fix is purely operational: rebuild and redeploy the production container from current source.

## Findings

### 1. Source code has the bulk route (CONFIRMED)

- **Route registration**: `src/App.js:194` — `this.#express.post('/api/account-category-mappings/bulk', this.#onBulkAssignAccountCategoryMappings.bind(this))`
- **Handler implementation**: `src/App.js:3070-3096` — `async #onBulkAssignAccountCategoryMappings(req, res)` validates items array, delegates to `AccountCategoryMappingService.bulkAssign()`, returns structured `{ success, created, updated, skipped, errors }`.
- The route is registered between `POST /api/account-category-mappings` (line 193) and `PUT /api/account-category-mappings/:id` (line 195), in the correct position within the account-category mapping endpoint group.

### 2. Local UAT passed (CONFIRMED)

- Sprint S0011 UAT report (`sprints/S0011/uat-report.md`) confirms all 7 acceptance criteria verified:
  - Regression suite: 26/26 pass, exit code 0
  - Local service healthy on port 3001
  - POST `/api/account-category-mappings/bulk` tested with: empty items, create, upsert, field whitelist injection — all returned structured JSON responses
  - Production smoke: GET `/api/account-category-mappings` on port 3000 returned HTTP 200
  - Static HTML verification confirmed all UI elements
- US-0008 release completed at 2026-06-28T20:30:00+02:00

### 3. Production container is stale (CONFIRMED)

- **Container created**: `2026-06-26T14:18:50.944431795Z` (from `docker inspect categorizer --format '{{.Created}}'`)
- **US-0008 release timestamp**: `2026-06-28T20:30:00+02:00`
- **Gap**: Container is ~2 days older than the US-0008 release. The container image does NOT include the bulk assign route.
- **Container evidence**: `docker exec categorizer grep -n account-category-mappings /app/src/App.js` shows only 5 routes (GET, POST, PUT, DELETE, PATCH at lines 192-196) — the bulk POST route is absent.
- **Local source**: `src/App.js:194` has 6 routes including the bulk POST — confirming the code was written but not deployed.

### 4. Root cause: stale deployment image (CONFIRMED)

- The production container was built from source that predates US-0008.
- Route registration, handler, service method, UI, and tests are all correct in the current local source.
- No code change is needed to fix this bug.
- The fix is: rebuild the Docker image from current source and redeploy the production `categorizer` container.

### 5. Impact assessment

- US-0008 bulk assign feature (live search, multi-select, bulk assign) is **NOT available on production** despite being released locally.
- The 5 existing account-category mapping CRUD endpoints (GET, POST, PUT, DELETE, PATCH) work correctly on production — only the bulk endpoint is missing.
- The UI on production shows the bulk assign panel (if the static HTML was updated), but the POST to `/api/account-category-mappings/bulk` returns 404 HTML (from Traefik/static fallback).
- If the UI was also not updated (container is fully stale), then the entire US-0008 feature is absent on production.

### 6. Fix path

1. Rebuild the Docker image from current source (includes US-0007 direct-assign + US-0008 bulk assign).
2. Redeploy the production `categorizer` container with the new image.
3. Verify `POST /api/account-category-mappings/bulk` returns HTTP 200 JSON on `categorizer.omniflow.cc`.
4. Verify UI bulk assign flow works end-to-end on production.

**No code changes required.** This is purely an operational deployment task.

## Evidence references

| Evidence | Source | Finding |
|----------|--------|---------|
| Route registration | `src/App.js:194` | `POST /api/account-category-mappings/bulk` registered |
| Handler | `src/App.js:3070-3096` | `#onBulkAssignAccountCategoryMappings` with validation + structured response |
| UAT report | `sprints/S0011/uat-report.md` | 26/26 tests pass, all ACs verified |
| Container created | `docker inspect categorizer` | 2026-06-26T14:18:50.944431795Z |
| US-0008 release | `docs/product/backlog.md` | 2026-06-28T20:35:00+02:00 |
| Container routes | `docker exec categorizer grep` | Only 5 routes (bulk missing) |
| Decision | `decisions/DEC-0023.md` | Bulk assign upsert semantics (implemented in code, not in container) |

## Conclusion

- **Root cause**: Stale Docker image on production (container created 2026-06-26, US-0008 released 2026-06-28).
- **Code fix required**: No.
- **Architecture changes required**: No.
- **Fix**: Rebuild and redeploy production container from current source.
- **Risk**: Low — the code is verified working locally with full test coverage (26/26).
- **Next phase**: Architecture phase is trivial for this bug — document that no architectural changes are needed and proceed directly to operator action (redeploy).
