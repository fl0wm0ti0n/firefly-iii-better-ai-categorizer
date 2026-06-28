# Architecture — BUG-0003: Bulk assign POST `/api/account-category-mappings/bulk` returns 404 on production

**Phase**: architecture
**Role**: tech-lead
**Work item**: BUG-0003
**Fresh context marker**: architecture-bug0003-bulk-assign-404
**Timestamp**: 2026-06-28T21:16:00+02:00
**Verdict**: PASS — no architectural changes required

## Decision

**No architectural changes are required for BUG-0003.**

This bug is a pure deployment defect. The root cause is that the production `categorizer` container was built from source **before** US-0008 was released (container created 2026-06-26T14:18:50Z, US-0008 released 2026-06-28T20:35:00+02:00). The code is correct and verified locally.

## Architecture unchanged

The existing architecture (documented in `docs/engineering/architecture.md`) remains valid:

- **Route layer**: `src/App.js` handles HTTP routing. The bulk POST route is registered at line 194.
- **Service layer**: `src/AccountCategoryMappingService.js` provides `bulkAssign(items)` with upsert semantics per DEC-0023.
- **Handler**: `src/App.js:3070-3096` — `#onBulkAssignAccountCategoryMappings()` validates input, delegates to service, returns structured response.
- **Deployment**: Docker container (`Dockerfile`) builds from source; `docker-compose.local.yml` defines service.

None of these layers have defects. The architecture already supports the bulk assign feature correctly.

## Root cause summary

| Factor | Detail |
|--------|--------|
| **What broke** | `POST /api/account-category-mappings/bulk` → 404 on production |
| **Root cause** | Stale production container image predating US-0008 release |
| **Code defect** | None |
| **Architecture defect** | None |
| **Evidence** | `docker inspect categorizer` → container created 2026-06-26T14:18:50Z |
| **Evidence** | `docker exec categorizer grep` → only 5 routes, bulk POST missing |
| **Evidence** | Local source `src/App.js:194` → bulk route present and correct |
| **Evidence** | Local UAT (S0011) → 26/26 tests pass |

## Deploy path (fix)

The fix is a standard rebuild-and-redeploy operation:

1. **Rebuild** the Docker image from current source (includes US-0007 + US-0008).
   - Reference: `Dockerfile` in project root.
   - Reference: `docker-compose.local.yml` for service definition.
2. **Redeploy** the production `categorizer` container with the new image.
3. **Verify** `POST /api/account-category-mappings/bulk` returns HTTP 200 JSON on production.
4. **Verify** bulk assign UI flow works end-to-end on production.

## New decisions

**None.** No architectural decisions are needed for a deployment-only fix.

## Risks

| Risk | Mitigation |
|------|-----------|
| Redeploy introduces regression from other features since 2026-06-26 | Mitigated: 26/26 tests pass locally. US-0007 and US-0008 both fully verified (QA + UAT). |
| Container rebuild picks up stale layers | Use `--no-cache` if needed; reference existing Dockerfile for build context. |
| Production data migration needed | None — US-0007 and US-0008 decisions (DEC-0021, DEC-0022, DEC-0023) explicitly state no migration required. |

## Artifacts produced

- `docs/engineering/architecture-bug0003.md` (this file)
- `docs/engineering/state.md` (architecture phase boundary prepended)
- `handoffs/resume_brief.md` (architecture pass status prepended)

## Next phase

**Execute (redeploy).** The operator should rebuild and redeploy the production container. No code changes, no sprint tasks, no new DEC entries.
