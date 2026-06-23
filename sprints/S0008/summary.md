# Sprint S0008 Summary — US-0006 Agent-Driven Local Categorizer Launch

**Sprint ID:** S0008  
**Story:** US-0006 (Agent-driven local Categorizer launch for Cursor browser UAT probes)  
**Status:** Planned  
**Date:** 2026-06-22  
**Orchestrator Run ID:** auto-20260622T204100Z-us0006

## Sprint Goal

Enable the Cursor IDE agent to launch the Categorizer locally on a deterministic port, poll health, and run browser UAT probes — without affecting the production `categorizer.omniflow.cc` deployment. Compose file is standalone (explicit `-f`), health probe targets `GET /` (not `/health`), and `.cursor/dev-environment.json` declares the complete launch contract.

## Tasks Planned

8 tasks (T-0040 through T-0047):

- **T-0040**: Create `docker-compose.local.yml` (standalone compose, service `firefly-ai-categorizer`, port `3001:3000`, HEALTHCHECK `GET /`, ENABLE_UI=true, restart:no)
- **T-0041**: Create `.cursor/dev-environment.json` (real config per DEC-0019: schema_version 1 + AC-1 fields)
- **T-0042**: Create `.env.example` (document required env vars: FIREFLY_URL, FIREFLY_PERSONAL_TOKEN, OPENAI_API_KEY, ENABLE_UI, PORT)
- **T-0043**: Create local launch script `scripts/dev-launch.sh` (docker compose -f + health poll)
- **T-0044**: Document local launch in runbook — add section to `docs/engineering/runbook.md`
- **T-0045**: Verify browser UAT probe against local instance — runbook / scripts integration test
- **T-0046**: User guide `docs/user-guides/US-0006.md` (USER_GUIDE_MODE=1)
- **T-0047**: Test — verify local launch health poll + browser probe end-to-end

## Execution Order

```
Phase 1: Parallel (no dependencies)
├── T-0040: docker-compose.local.yml         ← AC-2
├── T-0041: dev-environment.json             ← AC-1
├── T-0042: .env.example                     ← AC-1 (env_file)
└── T-0043: dev-launch.sh                    ← AC-4

Phase 2: Documentation (depends on Phase 1)
├── T-0044: Runbook local-launch section     ← AC-3
└── T-0046: User guide US-0006.md            ← AC-6

Phase 3: Integration Test (depends on all above)
├── T-0045: Runbook / scripts integration test ← AC-3, AC-4
└── T-0047: E2E health poll + browser probe    ← AC-4, AC-5
```

## Acceptance Criteria Mapping

| AC | Task(s) | Description |
|----|---------|-------------|
| AC-1 | T-0041 | dev-environment.json declares start_command, health_url, poll_seconds, env_file, required_env_vars, browser_probe_url |
| AC-2 | T-0040 | docker-compose.local.yml supports ephemeral launch without breaking production |
| AC-3 | T-0043, T-0044 | Local service URL reachable via direct port binding (documented in architecture + runbook) |
| AC-4 | T-0043 | Agent can trigger launch, wait for health, open browser probe URL |
| AC-5 | T-0045, T-0047 | Browser UAT probe collects console errors + GET /api/reviews response |
| AC-6 | T-0046 | User guide documents local agent-driven UAT flow |

## Architecture Decisions Implemented

- **DEC-0018**: Standalone `docker-compose.local.yml` with explicit `-f docker-compose.local.yml` flag
- **DEC-0019**: Extend `schema_version: 1` with additive AC-1 fields (no version bump)

## Scope Out (not in sprint)

- Production deployment changes (`categorizer.omniflow.cc`)
- Traefik labels / reverse-proxy
- New `/health` route in App.js
- Playwright/Selenium harness
- `src/`, `public/` modifications

## Risks Mitigated

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| L1 | Port 3001 in use | Medium | Port check in launch script; document troubleshooting |
| L2 | .env missing | High | dev-environment.json declares required_env_vars; agent pre-checks |
| L3 | Image build failure | Medium | Document `--build` flag for first run |
| L4 | GET / returns non-200 | Medium | start_period: 20s grace; 60s poll cap |
| L5 | Port conflict with operator | Low | restart: "no" + explicit agent lifecycle |
| L6 | BUG-0002 runtime /api/reviews HTML | Medium | Agent must not throw SyntaxError — surface structured error |

## Sprint Size

- 8 tasks (under SPRINT_MAX_TASKS=12 cap)
- No split required

## References

- Architecture: `docs/engineering/architecture.md` (# US-0006)
- Decisions: `decisions/DEC-0018.md`, `decisions/DEC-0019.md`
- Research: `docs/engineering/research.md` (R-0023)
- Acceptance: `docs/product/acceptance.md` (US-0006 AC-1–AC-6)
- Backlog: `docs/product/backlog.md` (US-0006)
- Handoff: `handoffs/po_to_tl.md`
