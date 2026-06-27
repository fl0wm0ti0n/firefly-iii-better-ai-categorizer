# PO → Tech Lead handoff: US-0006

## Story

- **ID:** US-0006
- **Title:** Agent-driven local Categorizer launch for Cursor browser UAT probes
- **Status:** OPEN
- **Priority:** 6
- **user_visible:** false
- **Intake evidence:** `handoffs/intake_evidence/intake-20260622-us0006-local-browser-uat.json`
- **Intake pack:** small-intake-pack
- **Validated by:** `python3 scripts/intake_evidence_validate.py --file handoffs/intake_evidence/intake-20260622-us0006-local-browser-uat.json` → `[INTAKE_EVIDENCE_VALIDATION_OK]`

## Summary

Enable the agent to launch the Categorizer locally so it can run Cursor IDE browser UAT probes (`UAT_BROWSER_PROBE_MODE=cursor`) by itself. This is an infrastructure/dev-experience enabler: no application pipeline logic changes, only deterministic local launch wiring.

Blocks/reason:
- BUG-0001 AC-4 operator PAT UAT can use this local launch for browser validation.
- BUG-0002 resolution verification needs a reachable local instance plus `/api/reviews` probe evidence.

## Scope in

- Repo-local Docker Compose or override for ephemeral local `categorizer` service on a stable host port (e.g., `3000` or `3001`).
- `GET /health` and admin UI `/` reachable at `http://localhost:<port>`.
- Local Traefik router/labels or direct port binding, documented and reachable from the Cursor browser MCP.
- `.cursor/dev-environment.json` populated with:
  - `start_command`
  - `health_url`
  - `poll_seconds` / `poll_interval_seconds`
  - `env_file` / required env vars
  - `browser_probe_url`
- End-to-end agent self-test: launch → wait for health → open Cursor browser to probe URL → collect console errors and `GET /api/reviews` response.
- User guide `docs/user-guides/US-0006.md` documenting the local agent-driven UAT flow (USER_GUIDE_MODE=1).

## Scope out

- Application pipeline logic changes (e.g., `#resolveCategory`, mapping services, AI classification).
- Production `categorizer.omniflow.cc` Traefik or Docker stack modifications.
- CI deployment automation beyond the local dev launch path.
- Primary implementation of HTTP/Playwright fallback probes (only enable Cursor MCP path).

## Constraints & compatibility risks

- **No breaking changes** to existing production Docker Compose services.
- **No application code changes** beyond what is strictly needed to support local launch.
- **Port conflict:** local port `3000` is used by the parent Firefly stack; prefer `3001` or make it overridable via env.
- **Static middleware ordering:** when `ENABLE_UI=true`, Express static middleware is mounted on `/` before API routes in `src/App.js` (per BUG-0002 discovery). Local launch must not alter this ordering in a way that shadows `/api/reviews` or `/health`.
- **Cursor browser reachability:** the Cursor IDE browser MCP may need explicit host/port exposure; direct port binding is acceptable if Traefik local labels are too heavy.
- **Environment parity:** ensure `.env` or `.env.local` template covers required variables (Firefly URL/PAT, OpenAI key, `ENABLE_UI`, `PORT`, etc.) without committing secrets.

## Key acceptance criteria (see `docs/product/acceptance.md` for full list)

1. `dev-environment.json` declares deterministic local launch command + health URL.
2. Docker Compose supports ephemeral local launch without breaking production.
3. Local service URL reachable from Cursor browser (Traefik or direct binding).
4. Agent triggers launch, waits for health, opens browser probe URL.
5. Browser probe collects console errors and `/api/reviews` response evidence.
6. User guide documents local agent-driven UAT flow.

## Engineering notes

- `DEV_AUTO_LAUNCH_PROFILE=on` and `DEV_ENVIRONMENT_CONFIG=.cursor/dev-environment.json` are already set in `.cursor/scratchpad.md`.
- Scratchpad browser UAT flags: `UAT_BROWSER_PROBE_MODE=cursor`, `UAT_BROWSER_FALLBACK_CHAIN=1`, `UAT_PROCESS_HEALTH_POLL_SECONDS=60`, `UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS=2`.
- Existing `.cursor/dev-environment.json.example` uses `docker-compose.yml`/`service: app` with endpoint `/health` — the real `dev-environment.json` must point at the `categorizer` service or override and use the correct local port.
- Architecture notes: production runs as `categorizer` in the parent Firefly stack (`/workdir/firefly/docker-compose.yml`, port 3000, Traefik); repo-local `docker-compose.yml` is deprecated standalone-dev only (per `docs/engineering/architecture.md`). Recommend creating a repo-local override/profile rather than editing the parent stack.

## Research needed (recommended)

- Confirm current repo-local `docker-compose.yml` service names, labels, and ports.
- Confirm whether Traefik is available locally or if direct port binding is preferred.
- Verify `ENABLE_UI`, `PORT`, and health endpoint behavior from the Dockerfile/entrypoint.

## Next phase

**`/discovery`** - map current Docker Compose, Traefik, and dev-environment surfaces; confirm the minimal local launch seam and draft the architecture plan.

---

# US-0007: Keyword mapping direct-assign (bypass AI)

## Intake metadata

- **Story ID**: US-0007
- **Intake run**: intake-20260627-us0007-keyword-direct-assign
- **Pack**: small-intake-pack
- **Decomposition**: Single story - bounded vertical slice (data model + service + pipeline + UI + tests)
- **User authority**: User confirmed "yes make it like said" - proceeding with proposed assumptions and ACs

## Story summary

Add an optional `directAssign` flag to keyword mappings that, when enabled, bypasses AI categorization and directly assigns the mapped category. Similar to `AccountCategoryMappingService` hard-assignment behavior but scoped to keyword mappings.

## Requirements

- `CategoryMappingService.getDirectAssignment()` returns `{assigned: true, category, mappingName, matchedKeyword}` when flag is enabled and keywords match; otherwise `null`
- `#resolveCategory` checks direct-assign after account mapping (step 1) and auto-cat (step 2) but before OpenAI
- Admin UI: per-mapping toggle "Direct assign (bypass AI)" (default: off)
- Persistence: flag stored per mapping (JSON/DB), additive boolean with default `false`
- Pipeline precedence: account mapping > auto-cat > [direct keyword assign OR AI hint] > OpenAI. Direct-assign check replaces the existing AI-hint slot in `#resolveCategory()` — same position, user chose option (c) at intake. When an enabled mapping matches, direct assign; otherwise fall through to AI hint path as before.

## Assumptions committed (per intake-evidence bundle)

1. **outcome_success_criteria**: Transaction "INTERSPAR 2361 K4 03.06." with keyword mapping "Supermarkets & Groceries" -> "Groceries" assigns category directly when direct-assign is enabled (no AI call).
2. **impacted_components**: `CategoryMappingService.js`, `App.js #resolveCategory`, `public/index.html`, keyword mapping data model, REST endpoints.
3. **constraints_compatibility_risks**: Account mapping (step 1) still highest precedence; backward-compatible (existing mappings without flag behave as before); backward-compatible schema migration (additive boolean `directAssign=false`); direct-assign must verify target category exists in Firefly (same as account mapping).
4. **required_tests_acceptance_checks**: US-0001 regression tests updated: direct-assign match (AI not called), direct-assign miss (falls through to AI), mixed scenario (one mapping direct, another hint-only).
5. **done_definition**: Admin UI toggle enables direct category assignment per keyword mapping; when enabled + keywords match -> assigned immediately (no AI); when disabled -> existing hint behavior unchanged.

## Key acceptance criteria

- **AC-1**: `CategoryMappingService.getDirectAssignment()` returns `{assigned: true, category, mappingName, matchedKeyword}` when flag is enabled and keywords match; `null` otherwise
- **AC-2**: `#resolveCategory` checks direct-assign after account mapping and auto-cat but before OpenAI
- **AC-3**: Admin UI provides per-mapping toggle "Direct assign (bypass AI)" (default: off)
- **AC-4**: Persistence: flag stored per keyword mapping, survives restarts, backward-compatible
- **AC-5**: US-0001 regression tests updated (direct-assign match, miss, mixed)
- **AC-6**: Pipeline precedence preserved: account mapping > auto-cat > [direct keyword assign OR AI hint] > OpenAI. Direct-assign check replaces the existing AI-hint slot.

## Scope out

- Changes to account mapping logic (step 1)
- Auto-categorization rules (step 2)
- AI hint logic when direct-assign is disabled
- Changes to review queue (US-0004)

## Risks

1. JSON schema backward compatibility: additive boolean with default `false` ensures existing mappings continue to work as before
2. Target category validity: direct-assign must verify category exists in Firefly (same validation as account mapping)

## Next phase

**`/discovery`** - map affected services, data model, and pipeline integration points; confirm schema backward compatibility approach.
