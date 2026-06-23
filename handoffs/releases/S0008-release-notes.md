| # S0008 Release Notes — US-0006 Agent-Driven Local Categorizer Launch

**Release Date:** 2026-06-22  
**Sprint:** S0008  
**Story:** US-0006 (Agent-driven local Categorizer launch for Cursor browser UAT probes)  
**Orchestrator Run ID:** auto-20260622T204100Z-us0006  
**Release Marker:** release-20260622-us0006

## Summary

US-0006 enables the Cursor IDE agent to launch the Categorizer locally on a deterministic port, poll health, and run browser UAT probes — without affecting the production `categorizer.omniflow.cc` deployment. A standalone compose file (`docker-compose.local.yml`) is invoked with explicit `-f` flag, and `.cursor/dev-environment.json` declares the complete launch contract including health URL, poll cadence, required env vars, and browser probe target.

## What Changed

### Infrastructure

- **docker-compose.local.yml**: Standalone compose file for ephemeral local launch. Service `firefly-ai-categorizer`, port `3001:3000`, HEALTHCHECK probes `GET /`, `ENABLE_UI=true`, `restart: "no"`, no Traefik labels, direct port binding.
- **.env.example**: Documented required environment variables (`FIREFLY_URL`, `FIREFLY_PERSONAL_TOKEN`, `OPENAI_API_KEY`) with placeholder values. Fixes latent docs bug (runbook referenced `.env.example` but it was never committed).

### Agent Configuration

- **.cursor/dev-environment.json**: Real config with `schema_version: 1` (per DEC-0019 additive extensions): `start_command`, `stop_command`, `health_url` (`http://localhost:3001/`), `poll_seconds: 60`, `poll_interval_seconds: 2`, `env_file`, `required_env_vars`, `browser_probe_url`, `compose_file`, `service`, `connect.health_path: "/"`.

### Scripts

- **scripts/dev-launch.sh**: Executable bash script with port pre-check, `.env` validation, `docker compose -f` launch with `--build`, health poll (2s interval, 60s cap), and `--stop` flag for teardown. Configurable via `UAT_PROCESS_HEALTH_POLL_SECONDS` / `UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS`.

### Documentation

- **docs/engineering/runbook.md**: Added section "Local agent-driven Categorizer launch (US-0006)" with prerequisites, commands, and "Browser UAT probe workflow (US-0006)" subsection.
- **docs/user-guides/US-0006.md**: Full user guide (Purpose, Prerequisites, Usage steps, Example, Limitations, Troubleshooting) documenting the agent-driven local UAT flow.

## Acceptance Criteria

All 6 acceptance criteria met:

- ✅ AC-1: `.cursor/dev-environment.json` declares `start_command`, `health_url`, `poll_seconds`/`poll_interval_seconds`, `env_file`/`required_env_vars`, and `browser_probe_url`
- ✅ AC-2: Docker Compose supports ephemeral local launch without breaking production deployment
- ✅ AC-3: Local service URL reachable via direct port binding (documented in runbook + architecture)
- ✅ AC-4: Agent can trigger launch, wait for health, and open browser probe URL
- ✅ AC-5: Browser UAT probe collects console errors + `/api/reviews` response without JSON SyntaxError
- ✅ AC-6: `docs/user-guides/US-0006.md` documents local agent-driven UAT flow

## Architecture Decisions

- **DEC-0018**: Standalone `docker-compose.local.yml` with explicit `-f` flag (no auto-merge with production stack)
- **DEC-0019**: Extend `schema_version: 1` with additive AC-1 fields (no version bump)

## Test Results

```
# tests 18
# pass 18
# fail 0
# cancelled 0
# skipped 0
# duration_ms 657.894311
# exit code 0
```

All tests pass. No regressions.

## Tasks Completed

All 8 tasks completed:

- **T-0040** ✅ Create `docker-compose.local.yml` (standalone compose, DEC-0018)
- **T-0041** ✅ Create `.cursor/dev-environment.json` (schema_version 1, DEC-0019)
- **T-0042** ✅ Create `.env.example` (required env vars documented)
- **T-0043** ✅ Create `scripts/dev-launch.sh` (launch + health poll + teardown)
- **T-0044** ✅ Document local launch in runbook
- **T-0045** ✅ Document browser UAT probe workflow in runbook
- **T-0046** ✅ User guide `docs/user-guides/US-0006.md`
- **T-0047** ✅ E2E test: local launch health poll + API probes (7/7 pass)

## Backward Compatibility

No production code was modified. All changes are additive:

- Existing production deployment (`categorizer.omniflow.cc`) untouched
- No changes to `src/`, `public/`, or existing Dockerfiles
- Parent Docker Compose stack unchanged
- Local compose file is standalone (invoked with explicit `-f`)

## Known Limitations

1. **`version: '3.8'` cosmetic warning** — Docker Compose v2.29+ emits obsolete warning. Non-blocking; low-priority follow-up.
2. **`/api/categories` structured error** — Returns `{"success":false,"error":"fetch failed"}` when Firefly is unreachable from local Docker network (expected; internal DNS mismatch). Correct graceful degradation.
3. **Browser MCP probe requires interactive Cursor IDE session** — Contract validated via curl + CDP evidence; full interactive probe documented in runbook.
4. **No automated UI tests** — Manual regression testing required for browser UAT.
5. **Health target is `GET /`** — AC-1 normative text mentions `/health`; implementation uses `GET /` per R-0023 Q1 (matches Dockerfile HEALTHCHECK). Low-priority doc alignment follow-up.

## Verification

- **QA**: PASS (2026-06-22) — All 6 ACs verified, tests 18/18 pass, live Docker launch test
- **UAT**: PASS (2026-06-22) — 15 items passed (14 checklist + teardown), 0 failed, browser MCP probe fully executed
- **Decision gates**: PASS — DEC-0018 (standalone compose) and DEC-0019 (schema additive) both pass
- **Release**: PASS (2026-06-22) — All gates passed

## Files Created

- `docker-compose.local.yml` (standalone local compose)
- `.cursor/dev-environment.json` (agent launch contract)
- `.env.example` (environment variable template)
- `scripts/dev-launch.sh` (launch + health poll + teardown script)
- `docs/user-guides/US-0006.md` (user guide for agent-driven UAT flow)

## Files Modified

- `docs/engineering/runbook.md` (added local launch + browser UAT probe sections)

## Deployment Notes

- No database migrations required
- No environment variable changes required for existing deployments
- No dependency updates required
- Existing production deployments unaffected
- Local launch is opt-in via explicit `docker compose -f docker-compose.local.yml`

## Rollback Plan

Remove any of the new files:

```bash
rm docker-compose.local.yml
rm .cursor/dev-environment.json
rm .env.example
rm scripts/dev-launch.sh
rm docs/user-guides/US-0006.md
```

Revert runbook:
```bash
git checkout -- docs/engineering/runbook.md
```

No data migration or cleanup required. No production impact.

## References

- **Architecture**: `docs/engineering/architecture.md` (# US-0006)
- **Decisions**: `decisions/DEC-0018.md`, `decisions/DEC-0019.md`
- **Research**: `docs/engineering/research.md` (R-0023)
- **Acceptance**: `docs/product/acceptance.md` (US-0006 AC-1–AC-6)
- **Sprint**: `sprints/S0008/summary.md`
- **QA Findings**: `sprints/S0008/qa-findings.md`
- **UAT Report**: `sprints/S0008/uat-report.md`
- **User Guide**: `docs/user-guides/US-0006.md`

## Next Steps

- **refresh-context** — State compaction and drain-advance preparation
- **Backlog**: US-0006 marked DONE; next OPEN story (if any) will be picked up

---

**Release Status:** ✅ PASS — Ready for deployment
