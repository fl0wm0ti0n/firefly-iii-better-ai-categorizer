# Research

## R-0024 — BUG-0002: /api/reviews HTML 404 root cause

- **Status:** current
- **Bug:** BUG-0002
- **Phase:** research (tech-lead, fresh context)
- **Date:** 2026-06-23

---

### Background

BUG-0002 reports that `loadPendingReviews` in `public/index.html` fetches `GET /api/reviews` and throws `SyntaxError: Unexpected token '<', "<!DOCTYPE ..." is not valid JSON`. The route **is** registered in current `src/App.js` at line 199 (`this.#express.get('/api/reviews', ...)`) and implemented at `src/App.js:1467-1475`. S0008 UAT evidence (`sprints/S0008/qa-evidence/api-reviews.json`) proves that a freshly built image returns the expected `{"success":true,"reviews":[...]}`. Therefore the 404 is a runtime/deployment artifact, not a missing-route code defect.

The discovery phase narrowed the root cause to three hypotheses: stale deployed image (H1), Traefik/proxy HTML 404 (H2), and static middleware shadowing (H3). This research confirms **H1** is the root cause.

---

### Evidence gathered

| # | Evidence | Source |
|---|----------|--------|
| E1 | Production container `categorizer` running image `firefly-categorizer:latest` (ID `sha256:31779c985e5a2cb566b7d468e7b21a3fc99464bfb1ec82a0fa17216664d1a3b6`), created `2026-06-12 18:54:12 +02:00` | `docker images`, `docker inspect` on running container |
| E2 | Container `categorizer` created `2026-06-14T17:11:39Z`, started last `2026-06-22T18:30:40Z` | `docker inspect --format='{{.Created}}'` etc. |
| E3 | US-0004 released `2026-06-14T20:23:00Z` (archive S0006) | `docs/engineering/state-archive/state-pack-20260614.md` |
| E4 | Inside the production container, `GET http://127.0.0.1:3000/api/reviews` returns HTTP 404 HTML "Cannot GET /api/reviews" with `X-Powered-By: Express` | `docker exec categorizer node -e "http.get(...)` runtime probe |
| E5 | Fresh local build from current source (`docker compose -f docker-compose.local.yml up --build`) returns HTTP 200 JSON for `/api/reviews` | Local runtime test, `2026-06-23` |
| E6 | Express 4 default 404 for unmatched routes is HTML (`<!DOCTYPE html><body><pre>Cannot GET ...`) | Local runtime test `/api/nonexistent` |
| E7 | Production Traefik router applies `auth` middleware (`basicauth.usersfile=credentials.passwd`); unauthenticated public requests to `https://categorizer.omniflow.cc/api/reviews` now return HTTP 401 with `WWW-Authenticate: Basic realm="traefik"` | `docker-compose.yml:126-127`, public curl probe |
| E8 | Production compose builds image from local context `./categorizer/firefly-iii-ai-categorize` and does **not** auto-redeploy on source changes (`restart: unless-stopped`) | `/workdir/firefly/docker-compose.yml:80-128` |

---

### H1 — Stale deployed image

**Prediction:** Production container predates US-0004; `src/App.js` inside the running image does **not** register `GET /api/reviews`, so Express returns its default HTML 404.

**Observed (E1–E4):**

- Image `firefly-categorizer:latest` was built on **2026-06-12**, two days before US-0004 release (E3).
- The running container was created **2026-06-14T17:11:39Z**, ~3 hours **before** the US-0004 release at 20:23 (E2/E3).
- Last container restart was `2026-06-22T18:30:40Z`; because the compose file sets `restart: unless-stopped`, Docker reused the old image rather than rebuilding (E8).
- Direct probe inside the container bypasses Traefik and proves the **backend itself** returns `404 Cannot GET /api/reviews` with an Express HTML body (E4).

**Verdict:** **Confirmed.** The running backend does not know the route exists.

---

### H2 — Traefik returns HTML 404

**Prediction:** Traefik or another reverse-proxy component intercepts `/api/reviews` and returns an HTML 404 page, causing the JSON parse error.

**Observed (E4, E7):**

- Traefik is in the path and currently enforces Basic Auth; public unauthenticated requests get **401 Unauthorized**, not 404 (E7). This is a symptom change caused by the `auth` middleware, but not the original bug.
- The original HTML 404 body matched Express's default HTML 404 (`Cannot GET /api/reviews`) rather than a Traefik-branded error page. A Traefik default 404 typically shows a `404 page not found` plaintext or custom page, not an Express `Cannot GET` message.
- Probing the backend **directly inside the container** (bypassing Traefik) reproduces the exact same HTML 404 (E4).

**Verdict:** **Ruled out as root cause.** Traefik only adds authentication gating; the 404 originates from the stale backend image.

---

### H3 — Static middleware shadowing

**Prediction:** `express.static('public')` mounted on `/` before API routes intercepts `/api/reviews` because of ordering or fall-through behavior (possibly a directory named `api/reviews` under `public/`).

**Observed:**

- `express.static` default behavior is to `next()` when a file is not found; since there is no `public/api/reviews` file, the request falls through to subsequent routes (confirmed by Express/serve-static docs, see Web search).
- Local fresh build with `ENABLE_UI=true`, static middleware mounted on `/` before API routes, correctly serves `/api/reviews` as JSON 200 (E5).
- Express 4's default 404 handler emits HTML if **no** route matches (E6). This explains the observed HTML body, but only because the route is missing, not because static middleware shadowed it.

**Verdict:** **Ruled out.** Static middleware is correctly ordered and does not shadow named API paths.

---

### Root cause verdict

**H1 — Stale deployed image.** The production `categorizer` container is running an image built on 2026-06-12, before US-0004 (released 2026-06-14) added `GET /api/reviews`. The image was never rebuilt after US-0004, so the backend route does not exist at runtime. Express's default 404 handler returns HTML, which the browser then tries to parse as JSON.

The failure chain is:

```text
Browser (authenticated) → Traefik → categorizer:3000 → Express
                                    → no /api/reviews route registered in old image
                                    → Express default 404 HTML
                                    → fetch response.json() throws SyntaxError
```

---

### Minimal fix scope

| Fix | Needed? | Notes |
|-----|---------|-------|
| **Redeploy/rebuild production** | **Yes** — root cause | Run `docker compose -f /workdir/firefly/docker-compose.yml up -d --build categorizer` from current source. This rebuilds `src/App.js` and registers `/api/reviews`. |
| **Defensive UI hardening** | **Strongly recommended** | Guards against future proxy/auth/server outages that return HTML for API calls. |
| Backend code change | No | Route already exists in source. |
| Traefik config change | No | Auth middleware works as intended. The 404 is a backend route-missing problem. |
| `docker-compose.yml` change | No | Compose already builds from correct context. Current stale state is due to lack of rebuild, not misconfiguration. |

#### Tradeoff analysis

- **Option A — Redeploy only.** Fixes every AC except AC-3 resilience guarantees. Leaves BUG-0002 open to future HTML-404 regressions if authentication/proxy/backend hiccups recur.
- **Option B — UI hardening only.** Eliminates the JSON parse symptom but the endpoint remains broken; AC-1 and AC-2 fail.
- **Option C — Redeploy + UI hardening.** Fixes root cause **and** closes AC-3. Recommended. UI change is small and does not require a backend rebuild because `public/` is live-mounted in production.

---

### Defensive UI hardening recommendation

BUG-0001 precedent (R-0007 / DEC-0005) established that blind `response.json()` on HTML bodies must be guarded. Apply the same pattern to `loadPendingReviews` in `public/index.html:3461-3475`:

```javascript
async function loadPendingReviews() {
    try {
        const response = await fetch('/api/reviews');
        if (!response.ok) {
            throw new Error(`Reviews service unavailable (HTTP ${response.status}).`);
        }
        const result = await response.json();
        if (result.success) {
            renderPendingReviews(result.reviews || []);
        } else {
            console.error('Failed to load reviews:', result.error);
            showToast('Failed to load pending reviews', 'error');
        }
    } catch (error) {
        console.error('Error loading reviews:', error);
        showToast('Error loading reviews: ' + error.message, 'error');
    }
}
```

- **`!response.ok` guard** intercepts HTTP 401, 404, 5xx, and any other non-success status before `.json()` is called.
- **Actionable message** replaces raw `Unexpected token '<'` with something operators can understand.
- Because `/api/reviews` is an internal app endpoint on the same origin, the backend should always return JSON when healthy; `response.ok` is the right boundary.
- No change needed to `renderPendingReviews`; it already handles empty lists.

---

### AC coverage mapping

| AC | Requirement | How the recommended fix covers it |
|----|-------------|--------------------------------|
| BUG-0002 AC-1 | Page load — no `GET /api/reviews 404` and no `SyntaxError` on healthy deployment | Rebuild/redeploy adds the route; production returns JSON instead of HTML 404. |
| BUG-0002 AC-2 | `GET /api/reviews` returns 200 JSON when healthy, structured JSON error (not HTML) when the endpoint fails | `#onGetReviews` already returns structured JSON on internal error; deployment fix ensures the route is present. |
| BUG-0002 AC-3 | If `GET /api/reviews` returns structured `{success:false,error:...}`, no JSON parse `SyntaxError`; UI surfaces the error | `response.ok` guard stops `.json()` for non-success statuses; the existing `result.success` branch already surfaces backend errors. |
| BUG-0002 AC-4 | Pending Reviews panel renders accepted items correctly | `renderPendingReviews` is unchanged and continues to work once `/api/reviews` returns JSON. |

---

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| RR24-1 | Redeploy still uses old cached layer or stale context; `/api/reviews` remains absent | Low | High | Force rebuild with `docker compose ... up -d --build --no-deps --force-recreate categorizer`; verify with internal `http://127.0.0.1:3000/api/reviews` probe. |
| RR24-2 | After rebuild, Traefik auth middleware blocks requests because credentials are stale or missing | Medium | Medium | Have the `credentials.passwd` file and valid basic-auth credentials ready before validating. |
| RR24-3 | UI hardening hides legitimate JSON parse failures from backend bugs, making debugging harder | Low | Low | Keep `console.error` logging full error; only user-facing toast is friendlier. |
| RR24-4 | Future regression where `/api/reviews` is removed or renamed; ACC slips | Low | Medium | Add a lightweight smoke test to `tests/run-tests.sh` or CI that asserts route presence (US-0001 harness supports this). |
| RR24-5 | Production compose uses `restart: unless-stopped` and live-mounts `public/`; someone edits only `public/index.html` and forgets backend rebuild is needed for route changes | Medium | High | Document in runbook: "backend changes in `src/` require `--build`; UI changes in `public/` do not because of live mount." |

---

### Linked artifacts

| ID | Role |
|----|------|
| `handoffs/discovery_to_research.md` | Discovery hypothesis ranking and integration point map |
| `docs/product/acceptance.md` | BUG-0002 acceptance criteria |
| `docs/product/backlog.md` | BUG-0002 backlog entry |
| `src/App.js:198-201` | Review queue route registration |
| `src/App.js:1467-1475` | `#onGetReviews` implementation |
| `public/index.html:3461-3475` | `loadPendingReviews` fetch logic |
| `/workdir/firefly/docker-compose.yml` | Production deployment compose (build context, Traefik labels) |
| `sprints/S0008/qa-evidence/api-reviews.json` | Proof that fresh image returns JSON 200 |
| `handoffs/intake_evidence/intake-20260622-bug0002-reviews-404.json` | Original operator report |

---

## R-0023 — Agent-driven local Categorizer launch (US-0006)

- **Status:** current
- **Story:** US-0006
- **Phase:** research (tech-lead, fresh context)
- **Date:** 2026-06-22

---

### Q1 — Health endpoint route mismatch

**Question:** Compose healthchecks (`docker-compose.yml:39`, `docker-compose.dev.yml:27`) and the dev-environment example (`health_path: /health`) all assume a `/health` route exists, but `src/App.js:218-221` only registers `GET /` returning `"OK"`. Should we add `/health`, use `GET /`, or reverse-proxy rewrite?

**Evidence:**

| Surface | Health probe target | Source |
|---------|--------------------|------|
| `src/App.js:218-221` | `GET /` → `"OK"` | Route registration |
| `Dockerfile:44-45` | `GET /` (Node http.get on `http://127.0.0.1:3000/`) | HEALTHCHECK line |
| `docker-compose.yml:39` | `GET /health` (Node http.get) | Standalone-dev healthcheck |
| `docker-compose.dev.yml:27` | `curl -f http://localhost:3000/health` | Legacy dev healthcheck |
| `.cursor/dev-environment.json.example:11` | `health_path: "/health"` | Connect template |
| `docs/product/acceptance.md:50` (AC-1) | `health_url` at `GET http://localhost:<port>/health` | AC literal |

**Analysis (three alternatives):**

| Option | Description | App change? | Risk | Verdict |
|--------|-------------|-------------|------|---------|
| (a) Add `/health` alias | Register `GET /health` alongside `GET /` in `src/App.js` | Yes (tiny — 3 LOC) | Drifts from "no application logic changes" scope_out | Rejected for US-0006 |
| (b) Use `GET /` as health target | Point `health_url` at `http://localhost:<port>/` | No | AC-1 literal says `/health`; needs documented override | **Recommended** |
| (c) Reverse-proxy rewrite | Add local proxy that maps `/health` → `/` | No app code | Adds infra complexity with zero value | Rejected — over-engineered |

**Recommendation:** Option (b). `GET /` on port 3000/3001 is the existing health signal — the Dockerfile already uses it. US-0006 should set `health_url` to `http://localhost:<port>/` (NOT `/health`), and note the AC-1 literal as satisfied by functional equivalence. Compose overrides should probe `GET /` (matching the Dockerfile convention). Future follow-up: optionally add `/health` alias for consistency (separate story or tech-debt item).

---

### Q2 — `dev-environment.json` schema versioning

**Question:** Are AC-1 fields (`start_command`, `health_url`, `poll_seconds`, `poll_interval_seconds`, `env_file`, `required_env_vars`, `browser_probe_url`) part of `schema_version: 1` or do they require `schema_version: 2`?

**Evidence:**

- `.cursor/dev-environment.json.example` declares `schema_version: 1` with fields: `detected_mode`, `operator_seeded`, `last_updated`, `compose_file`, `service`, `target_id`, `connect{endpoint,health_path,hostEnv,portEnv,protocolEnv}`, `rebuild_recipe`, `env_refs`, `evidence_refs`.
- AC-1 requires fields NOT present in the example: `start_command`, `health_url`, `poll_seconds`, `poll_interval_seconds`, `env_file`, `required_env_vars`, `browser_probe_url`.
- The `connect.health_path` in the example maps semantically to `health_url` in AC-1, but with different naming and structure.

**Analysis:** The example fields are a template for the general concept; the AC-1 fields are application-specific launch parameters. They don't structurally conflict — they extend the schema. Since the consumer (`DEV_AUTO_LAUNCH_PROFILE=deterministic_v1` per US-0098) is new and has no existing reader, we should keep `schema_version: 1` and treat the AC-1 fields as additive to the existing schema, not as a breaking change. The example file was aspirational, not functional — there is no existing working consumer to break.

**Recommendation:** Keep `schema_version: 1` and add the AC-1 fields as extensions. Update the `.example` file to include them with documented defaults. This avoids a `schema_version: 2` bump for what is effectively the first real consumer of the schema. Document in `dev-environment.json` that `health_url` supersedes `connect.health_path` when both present (or remove `connect.health_path` from the example to eliminate ambiguity).

---

### Q3 — `.env.example` missing from repo

**Question:** `docs/engineering/runbook.md:2063` says `cp .env.example .env`. `docs/engineering/runtime-connectivity.md:43` references `.env.example` for "the full 20-name inventory". No `.env.example` exists in the repo.

**Evidence:**

- Glob `**/.env.example` returns 0 results.
- Runbook §"Operator `.env` setup" (line 2063) instructs `cp .env.example .env`.
- `runtime-connectivity.md:43` says "See `.env.example` for the full 20-name inventory."
- `.env` exists at repo root but is gitignored (agent must not read per DEC-0071).
- Architecture §"Environment contract" lists 8 variables: `FIREFLY_URL`, `FIREFLY_PERSONAL_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ENABLE_UI`, `PORT`, `FIREFLY_TAG`, `DATA_DIR`.

**Analysis:** The `.env.example` file was expected to exist but was never committed. This is a latent documentation bug — the runbook, runtime-connectivity doc, and possibly other surfaces all reference it. For US-0006 AC-1, we need `required_env_vars` populated with the right names.

**Recommendation:** Create `.env.example` as a separate deliverable (or as part of US-0006 execute). Canonical names per architecture env contract + US-0006 additions: `FIREFLY_URL`, `FIREFLY_PERSONAL_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ENABLE_UI`, `PORT`, `FIREFLY_TAG`, `DATA_DIR`. For `required_env_vars` in `dev-environment.json`, list the three strictly required vars: `FIREFLY_URL`, `FIREFLY_PERSONAL_TOKEN`, `OPENAI_API_KEY`. Flag the missing `.env.example` as a follow-up fix in the architecture handoff.

---

### Q4 — `service` name in dev-environment.json

**Question:** `.cursor/dev-environment.json.example` uses `service: "app"`. The actual compose service is `firefly-ai-categorizer` (per `docker-compose.yml:18`). Should the real file reference `firefly-ai-categorizer` or a new local service name?

**Evidence:**

- `docker-compose.yml:18` — service name is `firefly-ai-categorizer` (profile `standalone-dev`).
- `docker-compose.dev.yml:4` — service name is `firefly-ai-categorizer-dev` (legacy).
- `.cursor/dev-environment.json.example:7` — `service: "app"` (generic template placeholder).
- Production parent stack (out of repo) uses service name `categorizer`.

**Analysis:** The `.example` uses `"app"` as a generic placeholder for the template. In this repo, the deterministic service name for local launch is `firefly-ai-categorizer` (the only service in the repo-local compose that uses profiles and port 3001). Creating a new service name would add complexity without value.

**Recommendation:** Use `firefly-ai-categorizer` in the real `dev-environment.json`. This matches `docker-compose.yml:18` and is the existing standalone-dev service. No new service name needed.

---

### Q5 — `docker-compose.override.yml` vs `docker-compose.local.yml`

**Question:** Does `docker-compose.override.yml` risk being auto-merged during production-style `docker compose up` invocations? Is `docker-compose.local.yml` + `-f` safer?

**Evidence:**

- `docker-compose.yml` uses `profiles: [standalone-dev]` — a plain `docker compose up` starts nothing (safe default per DEC-0002).
- Docker Compose auto-merges `docker-compose.override.yml` when present in the same directory.
- Production runs from `/workdir/firefly/docker-compose.yml` (parent stack, out of repo) — NOT from this repo.
- `docker compose --profile standalone-dev up -d` is the current deprecated manual launch.

**Analysis (three alternatives):**

| Option | Description | Auto-merge risk? | Agent determinism | Verdict |
|--------|-------------|-------------------|-------------------|---------|
| (i) `docker-compose.override.yml` | Auto-merged by `docker compose up` in repo dir | Yes — if operator runs `docker compose up` in this repo, override merges silently | Low — implicit | Rejected — implicit merge risk |
| (ii) `docker-compose.local.yml` + explicit `-f` | New file, invoked only via `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` | No — explicit opt-in | High — deterministic | **Recommended** |
| (iii) Reuse `--profile standalone-dev` | Keep existing file, document launch as `docker compose --profile standalone-dev up -d` | No — profile-gated | Medium — requires fixing healthcheck probe in existing file | Acceptable as fallback |

**Recommendation:** Option (ii) — create `docker-compose.local.yml` used explicitly with `-f docker-compose.local.yml`. This avoids the auto-merge hazard of `.override` and gives the agent a deterministic, documented launch command. The local file should set `ENABLE_UI=true`, port `3001:3000`, healthcheck probing `GET /`, and `restart: "no"`. It can reference the existing `firefly-ai-categorizer` service or define a new lightweight `categorizer-local` service name for clarity.

---

### Q6 — Cursor browser MCP localhost reachability

**Question:** Can Cursor IDE browser MCP navigate to `http://localhost:<port>/` without sandbox/permission issues?

**Evidence:**

- `cursor-ide-browser` MCP server contract provides `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_cdp`, etc.
- No explicit localhost/private-IP restriction documented in the MCP server contract.
- MCP runs in the same Cursor IDE process as the agent → `http://localhost:<port>/` is host-localhost, same network namespace.
- BUG-0006 (referenced in scratchpad) addresses UAT probe ownership — agent uses MCP sequence.
- Scratchpad `UAT_BROWSER_PROBE_MODE=cursor` expects the Cursor MCP path as primary.

**Analysis:** The cursor-ide-browser MCP server operates within the Cursor IDE Electron process and controls a real Chromium browser instance via CDP. There is no sandbox isolation between the browser and the host machine. `localhost` resolves to the same machine running Cursor. Published container ports (`3001:3000`) are reachable at `http://localhost:3001/` from the host.

**Recommendation:** `http://localhost:<port>/` is reachable from the Cursor browser MCP without restrictions. No workaround needed. Document this assumption in `docs/engineering/architecture.md` for AC-3.

---

### Q7 — AC-1 poll field exact names

**Question:** What are the exact JSON field names the consumer reads for polling? AC-1 says `poll_seconds` / `poll_interval_seconds`; scratchpad uses `UAT_PROCESS_HEALTH_POLL_SECONDS=60` and `UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS=2`.

**Evidence:**

- `docs/product/acceptance.md:50` (AC-1): `poll_seconds` / `poll_interval_seconds` matching scratchpad (`60` / `2`).
- `.cursor/scratchpad.md:284` — `UAT_PROCESS_HEALTH_POLL_SECONDS=60`
- `.cursor/scratchpad.md:285` — `UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS=2`
- Scratchpad keys use `_SECONDS` suffix; JSON field names should be snake_case without suffix.

**Recommendation:** Use exact field names from AC-1 in `dev-environment.json`:

```json
{
  "poll_seconds": 60,
  "poll_interval_seconds": 2
}
```

These map to scratchpad `UAT_PROCESS_HEALTH_POLL_SECONDS` and `UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS` respectively. The consumer reads from `dev-environment.json` first, falls back to scratchpad defaults.

---

### Summary table (Q1–Q7)

| Q | Topic | Decision | Evidence refs |
|---|-------|----------|---------------|
| Q1 | Health route | Use `GET /` as health target; set `health_url` to `http://localhost:<port>/` | `src/App.js:218-221`, `Dockerfile:44-45` |
| Q2 | Schema version | Keep `schema_version: 1`; add AC-1 fields as extensions | `.cursor/dev-environment.json.example` |
| Q3 | `.env.example` | Missing from repo; create as follow-up or during execute | Runbook:2063, runtime-connectivity.md:43 |
| Q4 | Service name | Use `firefly-ai-categorizer` (actual compose service) | `docker-compose.yml:18` |
| Q5 | Compose seam | New `docker-compose.local.yml` + explicit `-f` flag | Existing profile isolation |
| Q6 | Browser MCP localhost | Reachable; no sandbox restriction | MCP server contract |
| Q7 | Poll field names | `poll_seconds: 60`, `poll_interval_seconds: 2` | AC-1 literal, scratchpad keys |

---

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| RR1 | Compose healthchecks in existing files probe `/health` (which doesn't exist) — Docker containers may report unhealthy | High | Medium | US-0006 execute must fix healthcheck in local compose file to probe `GET /` |
| RR2 | `.env.example` missing — agent can't enumerate all env vars from a committed file | Certain | Low | Hardcode 3 required + 5 optional from architecture env contract |
| RR3 | Existing `standalone-dev` profile may conflict with parent stack if operator runs `docker compose up` in repo dir | Low | Medium | Profile already prevents this; local compose file avoids the risk entirely |
| RR4 | Browser MCP may fail on `localhost:3001` if container isn't fully started | Low | Low | Poll `health_url` with `poll_interval_seconds: 2` for up to `poll_seconds: 60` before probe |
| RR5 | S0002 release notes reference `curl -sf http://localhost:3000/health` — wrong for this repo (latent docs bug) | Certain | Low | Flag as follow-up docs fix in architecture handoff |

---

### Linked artifacts

| ID | Role |
|----|------|
| `handoffs/discovery_to_research.md` | Discovery findings (integration point map) |
| `handoffs/po_to_tl.md` | PO→TL handoff |
| `docs/product/acceptance.md` | US-0006 AC-1 through AC-6 |
| `docs/product/backlog.md` | US-0006 story scope |
| `.cursor/dev-environment.json.example` | Schema template |
| `.cursor/scratchpad.md` | Poll defaults + probe mode |
| `docker-compose.yml` | Standalone-dev compose |
| `docker-compose.dev.yml` | Legacy dev compose |
| `Dockerfile` | Production HEALTHCHECK |
| `src/App.js` | Route registration + PORT binding |
| `docs/engineering/architecture.md` | Env contract + deployment context |
| `docs/engineering/runbook.md` | `.env.example` reference |
| `handoffs/research_to_architecture.md` | Architecture handoff (this phase output) |
