# Sprint S0008 Tasks — US-0006 Agent-Driven Local Categorizer Launch

## Task Overview

| ID | Title | Dependencies | Complexity | Status |
|----|-------|--------------|------------|--------|
| T-0040 | Create `docker-compose.local.yml` | — | medium | pending |
| T-0041 | Create `.cursor/dev-environment.json` | — | medium | pending |
| T-0042 | Create `.env.example` | — | low | pending |
| T-0043 | Create local launch script `scripts/dev-launch.sh` | — | medium | pending |
| T-0044 | Document local launch in runbook | T-0040, T-0041 | low | pending |
| T-0045 | Verify browser UAT probe against local instance | T-0043 | medium | pending |
| T-0046 | User guide `docs/user-guides/US-0006.md` | T-0040, T-0041, T-0043 | low | pending |
| T-0047 | Test — verify local launch + browser probe E2E | T-0043, T-0044, T-0045 | medium | pending |

---

## T-0040: Create `docker-compose.local.yml`

**Goal:** Create a standalone Docker Compose file for ephemeral local launch of the Categorizer service, invoked with explicit `-f` flag.

**Acceptance Criteria:** AC-2  
**Decision References:** DEC-0018  
**Dependencies:** None  
**Complexity:** Medium  
**Files:** `docker-compose.local.yml`

**Requirements:**
1. Service name: `firefly-ai-categorizer`
2. Port: `"3001:3000"` (host 3001 → container 3000)
3. Build context: `.` (repo root)
4. Dockerfile: `Dockerfile` (production image)
5. `env_file: .env`
6. `environment: ENABLE_UI: "true"` (required for browser UAT)
7. `restart: "no"` (ephemeral — agent controls lifecycle)
8. Healthcheck: probe `GET /` (not `/health`) — matching Dockerfile + App.js
   - interval: 5s, timeout: 3s, start_period: 20s, retries: 3
9. Volumes: `./data:/app/data` (persist categorization data)
10. No Traefik labels (direct port binding)
11. No profiles (explicit `-f` is the seam)
12. Network: simple bridge or none

**Launch command:** `docker compose -f docker-compose.local.yml up -d`  
**Stop command:** `docker compose -f docker-compose.local.yml down`

**Done When:**
- File created with all fields per architecture spec
- HEALTHCHECK probes `GET /` (not `/health`)
- No cross-contamination with parent stack or dev compose

---

## T-0041: Create `.cursor/dev-environment.json`

**Goal:** Create the real `.cursor/dev-environment.json` (not `.example`) with deterministic launch shape per DEC-0019.

**Acceptance Criteria:** AC-1  
**Decision References:** DEC-0019  
**Dependencies:** None  
**Complexity:** Medium  
**Files:** `.cursor/dev-environment.json`

**Requirements:**
1. `schema_version: 1` (keep — add fields as extensions per DEC-0019)
2. `detected_mode: "docker-host-local"`
3. `operator_seeded: true`
4. `compose_file: "docker-compose.local.yml"`
5. `service: "firefly-ai-categorizer"`
6. `start_command: "docker compose -f docker-compose.local.yml up -d"`
7. `stop_command: "docker compose -f docker-compose.local.yml down"`
8. `health_url: "http://localhost:3001/"`
9. `poll_seconds: 60` (matches scratchpad `UAT_PROCESS_HEALTH_POLL_SECONDS`)
10. `poll_interval_seconds: 2` (matches scratchpad `UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS`)
11. `env_file: ".env"`
12. `required_env_vars: ["FIREFLY_URL", "FIREFLY_PERSONAL_TOKEN", "OPENAI_API_KEY"]`
13. `browser_probe_url: "http://localhost:3001/"`
14. `connect.endpoint: "http://localhost:3001"`
15. `connect.health_path: "/"` (not `"/health"`)
16. `env_refs: ["DEV_HOST", "DEV_PORT", "DEV_PROTOCOL"]`
17. `evidence_refs: ["docs/engineering/research.md#r-0023"]`

**Done When:**
- All AC-1 fields present in JSON
- schema_version remains 1 (additive extensions)
- health_url and connect.health_path both point to `"/"`

---

## T-0042: Create `.env.example`

**Goal:** Document required environment variables with safe placeholder values (no secrets committed).

**Acceptance Criteria:** AC-1 (env_file + required_env_vars contract)  
**Decision References:** None  
**Dependencies:** None  
**Complexity:** Low  
**Files:** `.env.example`

**Requirements:**
1. Document required vars per architecture env contract:
   - `FIREFLY_URL=http://localhost:8080` (Firefly III base URL)
   - `FIREFLY_PERSONAL_TOKEN=your-personal-access-token`
   - `OPENAI_API_KEY=sk-your-openai-api-key`
   - `ENABLE_UI=true` (needed for browser UAT)
   - `PORT=3000` (container-internal default; host port 3001 via compose)
2. Add comments (# prefix) explaining each variable
3. Do NOT include real values — placeholder strings only
4. Template should match what `.env` would look like for local launch

**Notes:**
- Runbook references `.env.example` (latent docs bug) — this task fixes it
- `ENABLE_UI` is also set `"true"` in compose, but document it here for completeness

**Done When:**
- File created with all required vars documented
- No real secrets committed
- Comments explain each variable

---

## T-0043: Create local launch script `scripts/dev-launch.sh`

**Goal:** Create a deterministic launch script that starts the local Categorizer and polls health until ready.

**Acceptance Criteria:** AC-4  
**Decision References:** DEC-0018  
**Dependencies:** None  
**Complexity:** Medium  
**Files:** `scripts/dev-launch.sh`

**Requirements:**
1. Script starts with `#!/usr/bin/env bash` and `set -euo pipefail`
2. Runs `docker compose -f docker-compose.local.yml up -d --build` (first-run aware)
3. Polls `http://localhost:3001/` every 2 seconds (`POLL_INTERVAL=2`)
4. Fails after 60 seconds (`POLL_TIMEOUT=60`) — matches scratchpad
5. Prints status messages: "Waiting for categorizer to become healthy..."
6. On success: prints "Categorizer healthy at http://localhost:3001/"
7. On timeout: prints error, exits 1
8. Optional: check port 3001 availability before launch (fail fast if occupied)
9. Make script executable: `chmod +x scripts/dev-launch.sh`

**Health check:**
```bash
for i in $(seq 1 $((POLL_TIMEOUT / POLL_INTERVAL))); do
  if curl -sf http://localhost:3001/ > /dev/null 2>&1; then
    echo "OK"
    exit 0
  fi
  sleep "$POLL_INTERVAL"
done
echo "TIMEOUT"
exit 1
```

**Notes:**
- This script is the `start_command` equivalent for manual use
- Agent reads `start_command` from `dev-environment.json`, but script provides canonical reference
- Consider adding `scripts/dev-stop.sh` as companion (or document inline)

**Done When:**
- Script created and executable
- Health poll works (curl-based, 60s cap, 2s interval)
- Clear error messages on timeout

---

## T-0044: Document local launch in runbook

**Goal:** Add a dedicated section to `docs/engineering/runbook.md` documenting the local agent-driven Categorizer launch.

**Acceptance Criteria:** AC-3  
**Decision References:** DEC-0018  
**Dependencies:** T-0040, T-0041  
**Complexity:** Low  
**Files:** `docs/engineering/runbook.md`

**Requirements:**
1. Add section "## Local Categorizer Launch (Agent-Driven)" to runbook
2. Document:
   - Prerequisites: Docker + Docker Compose available; `.env` populated (see `.env.example`)
   - Launch command: `docker compose -f docker-compose.local.yml up -d`
   - Health URL: `http://localhost:3001/`
   - Poll cadence: 2s interval, 60s timeout
   - Stop command: `docker compose -f docker-compose.local.yml down`
3. Document that this is ephemeral / agent-driven — not production
4. Note: direct port binding (no Traefik); Cursor browser MCP reaches `localhost:3001` without restriction
5. Note: production deployment unaffected (`categorizer.omniflow.cc` via parent stack)
6. Cross-reference: `docs/user-guides/US-0006.md` for full agent UAT flow
7. Cross-reference: `docs/engineering/architecture.md` (US-0006 section) for design rationale

**Notes:**
- Runbook already has header structure (Commands section at top); add local launch section in a natural location
- Do NOT modify existing production commands or deploy targets

**Done When:**
- Section added to runbook
- Prerequisites, commands, URLs, and scope documented
- No production content modified

---

## T-0045: Verify browser UAT probe against local instance

**Goal:** Document and (where possible) validate the browser UAT probe workflow — agent launches local Categorizer, opens browser MCP to `http://localhost:3001/`, collects console errors and `GET /api/reviews` response.

**Acceptance Criteria:** AC-5  
**Decision References:** None  
**Dependencies:** T-0043  
**Complexity:** Medium  
**Files:** `docs/engineering/runbook.md` (add probe verification section)

**Requirements:**
1. Document the agent browser probe workflow:
   a. Execute `start_command` (or `scripts/dev-launch.sh`)
   b. Poll `health_url` until HTTP 200 (60s cap, 2s interval)
   c. Open `browser_probe_url` via Cursor browser MCP (`browser_navigate`)
   d. Collect console errors via CDP (`Runtime.evaluate` or `browser_cdp`)
   e. Fetch `GET /api/reviews` response body (success or structured error)
   f. Assert: no `JSON SyntaxError` on HTML response (AC-5)
   g. Execute `stop_command`
2. Document expected outcomes:
   - If `/api/reviews` returns JSON → success
   - If `/api/reviews` returns HTML (BUG-0002) → agent surfaces structured error, no SyntaxError
3. Note: BUG-0002 is a runtime/deployment concern; local fresh build should serve JSON

**Notes:**
- This is integration test documentation; actual probe execution happens in T-0047
- Reference BUG-0002 for context on HTML 404 risk

**Done When:**
- Workflow documented in runbook
- Expected outcomes documented
- BUG-0002 reference included

---

## T-0046: User guide — `docs/user-guides/US-0006.md`

**Goal:** Create user guide documenting the local agent-driven UAT flow (USER_GUIDE_MODE=1).

**Acceptance Criteria:** AC-6  
**Decision References:** None  
**Dependencies:** T-0040, T-0041, T-0043  
**Complexity:** Low  
**Files:** `docs/user-guides/US-0006.md`

**Requirements:**
1. Standard user guide schema:
   - **Purpose:** Enable agent to launch Categorizer locally for browser UAT probes
   - **Prerequisites:** Docker + Compose, `.env` populated, Cursor IDE with browser MCP
   - **Usage steps:** Launch → wait health → browser probe → collect evidence → stop
   - **Example:** Full agent workflow with commands
   - **Limitations:** Ephemeral (no persistence beyond `./data`); port 3001 must be free; production unaffected
   - **Troubleshooting:** Port conflict, .env missing, image build failure, health timeout
2. Document `dev-environment.json` fields and what the agent reads
3. Cross-reference AC-4/AC-5 workflow (agent launch → health poll → browser probe → evidence)
4. Cross-reference `docker-compose.local.yml` for compose details
5. Cross-reference `docs/product/acceptance.md` US-0006 AC-1 through AC-6

**Notes:**
- USER_GUIDE_MODE=1 is enabled in scratchpad
- Guide should be operator-facing but also serve as agent documentation

**Done When:**
- File created with all schema sections
- Workflow documented end-to-end
- CROSS-references to architecture and decisions

---

## T-0047: Test — verify local launch health poll + browser probe end-to-end

**Goal:** Execute end-to-end integration test: run `scripts/dev-launch.sh`, verify health poll succeeds, verify browser UAT probe reaches `http://localhost:3001/` and collects `/api/reviews` response.

**Acceptance Criteria:** AC-4, AC-5  
**Decision References:** DEC-0018  
**Dependencies:** T-0043, T-0044, T-0045  
**Complexity:** Medium  
**Files:** Test report (document in summary.md or sprint-level artifact)

**Requirements:**
1. Run `scripts/dev-launch.sh` — verify container starts and health poll succeeds
2. Verify `curl -sf http://localhost:3001/` returns HTTP 200 with `"OK"`
3. Verify `GET /api/reviews` returns content (JSON expected; HTML 404 indicates BUG-0002 regression)
4. (Optional) Use Cursor browser MCP to validate `browser_probe_url` is navigable
5. Run `docker compose -f docker-compose.local.yml down` — verify teardown
6. Report results in sprint summary

**Test cases:**
| # | Scenario | Expected |
|---|----------|----------|
| 1 | Launch with valid `.env` | Container starts, health poll succeeds within 60s |
| 2 | Launch without `.env` | Container fails to start (or starts unhealthy); poll times out |
| 3 | Port 3001 occupied | Script exits with clear error |
| 4 | GET /api/reviews | Returns JSON (not HTML 404) |
| 5 | Browser navigate localhost:3001 | Page loads without error |

**Notes:**
- Requires Docker daemon and network access to build image
- If Docker unavailable locally, document as "not executed — requires Docker"
- Do NOT modify production deployment

**Done When:**
- Health poll verified (or documented as not-executed with rationale)
- Test results recorded
- Any failures linked to bugs or environment issues

---

## Execution Order

**Phase 1: Parallel (no dependencies)**
- T-0040: docker-compose.local.yml
- T-0041: dev-environment.json
- T-0042: .env.example
- T-0043: scripts/dev-launch.sh

**Phase 2: Documentation (depends on Phase 1)**
- T-0044: Runbook section
- T-0046: User guide

**Phase 3: Integration Test (depends on all above)**
- T-0045: Runbook / scripts integration test
- T-0047: E2E health poll + browser probe

---

## References

- Architecture: `docs/engineering/architecture.md` (# US-0006)
- Decisions: `decisions/DEC-0018.md`, `decisions/DEC-0019.md`
- Research: `docs/engineering/research.md` (R-0023)
- Acceptance: `docs/product/acceptance.md` (US-0006 AC-1–AC-6)
- Handoff: `handoffs/po_to_tl.md`
