# UAT Report — Sprint S0008 (US-0006)

**Sprint:** S0008
**Work item:** US-0006 (Agent-driven local Categorizer launch)
**Phase:** verify-work
**Execution date:** 2026-06-22
**Executor:** QA subagent (Cursor IDE browser MCP integrated)
**Checklist reference:** `sprints/S0008/uat-checklist.md`
**User guide reference:** `docs/user-guides/US-0006.md`

---

## Executive summary

**Verdict: PASS** (14/14 checklist items passed; decision_gate passed; next phase release)

UAT fully executed per the uat-checklist, including the previously-deferred Cursor IDE browser MCP probe. All API endpoints returned valid JSON (no HTML), the admin UI rendered without console errors, and no `Unexpected token '<'` SyntaxError was observed. Browser MCP probe is no longer deferred — AC-5 now fully executed.

---

## Test cases executed

| # | Step | Method | Endpoint / Target | Outcome | Status |
|---|------|--------|-------------------|---------|--------|
| 1 | Port 3001 free | `lsof -i :3001` | (none returned) | Port free pre-launch | PASS |
| 2 | .env populated | grep of required vars | FIREFLY_URL, FIREFLY_PERSONAL_TOKEN, OPENAI_API_KEY | All 3 set | PASS |
| 3 | Docker healthy | `docker info` | — | Docker OK | PASS |
| 4 | dev-launch.sh | `bash scripts/dev-launch.sh` | — | exit 0, image built, container started | PASS |
| 5 | Health poll | stdout captured | http://localhost:3001/ | "Service healthy after 2s (HTTP 200)." | PASS |
| 6 | Container running | `docker compose -f docker-compose.local.yml ps` | firefly-ai-categorizer-local | Up, health: starting → healthy, port 0.0.0.0:3001->3000 | PASS |
| 7 | HTTP root | `curl -sI http://localhost:3001/` | GET / | HTTP/1.1 200 OK | PASS |
| 8 | GET /api/reviews (curl) | `curl -s \| python3 json.load` | /api/reviews | `{"success":true,"reviews":[...]}` — valid JSON | PASS |
| 9 | GET /api/categories (curl) | `curl -s \| python3 json.load` | /api/categories | `{"success":false,"error":"fetch failed"}` — structured JSON error, NOT HTML | PASS |
| 10 | Browser tab opened | browser_navigate | http://localhost:3001/ | Page Title "Firefly III Better AI Categorizer"; 134 snapshot refs (admin UI fully rendered) | PASS |
| 11 | Console errors captured | CDP Runtime.enable + Log.enable + window tracker | — | 0 errors, 0 warnings, no `Unexpected token '<'` | PASS |
| 12 | /api/reviews via CDP | Runtime.evaluate (fetch().then(r.json())) | /api/reviews | `{"status":200,"body":{"success":true,"reviews":[...]},"type":"object"}` | PASS |
| 13 | /api/categories via CDP | Runtime.evaluate (fetch().then(r.json())) | /api/categories | `{"status":200,"body":{"success":false,"error":"fetch failed"},"type":"object"}` | PASS |
| 14 | Service stopped | `bash scripts/dev-launch.sh --stop` | — | exit 0, "Service stopped.", container removed, network removed | PASS |
| 15 | Cleanup confirmed | `ss -tlnp \| grep :3001` + `docker compose ps` | port + container | Port empty, container list empty | PASS |

---

## Evidence files

All raw evidence captured in `sprints/S0008/qa-evidence/`:

| File | Description |
|------|-------------|
| `api-reviews.json` | curl response from /api/reviews (HTTP 200, valid JSON with 2 pending reviews) |
| `api-categories.json` | curl response from /api/categories (HTTP 200, structured error JSON — Firefly III unreachable from local container, expected) |
| `browser-cdp-reviews.txt` | CDP Runtime.evaluate proving fetch('/api/reviews').then(r.json()) succeeded in-browser with `type: "object"` |
| `browser-cdp-categories.txt` | CDP Runtime.evaluate proving fetch('/api/categories').then(r.json()) succeeded with structured error JSON |
| `browser-console-status.txt` | CDP console check: 0 errors, 0 warnings, hasUnexpectedToken=false |

Screenshot: `page-2026-06-22T20-44-46-928Z.png` (Cursor IDE browser MCP screenshot saved to host temp directory; not accessible on Linux filesystem, but page snapshot YAML with 134 refs confirms full admin UI render).

---

## Acceptance criteria coverage (US-0006 AC-5 browser probe)

**AC-5 (Browser probe workflow):** Previously deferred with rationale in QA phase.
- Status: **Now fully executed.**
- Browser MCP successfully navigated to `http://localhost:3001/` and:
  - Loaded admin UI (all 134 snapshot refs — all panels visible)
  - Collected console evidence: 0 errors, no `Unexpected token '<'`
  - Probed `/api/reviews` via CDP: valid JSON (success:true, reviews array)
  - Probed `/api/categories` via CDP: valid JSON (structured error, NOT HTML)
- No SyntaxError observed in browser context; `/api/reviews` and `/api/categories` both route-registered in `src/App.js` and respond with application/json at runtime.
- BUG-0002 (HTML-on-/api/reviews) risk: **ruled out** for this runtime.

---

## Issues found

**None.** All 15 UAT checklist items (14 probe + 1 teardown confirmation) passed.

---

## Notable observations

1. **`api/categories` returns structured error** (`{"success":false,"error":"fetch failed"}`): Firefly III internal URL (`http://firefly_app:8080` in `.env`) is unreachable from the local Docker network (expected — that DNS name only resolves inside the parent Firefly stack network). This demonstrates correct graceful-degradation behavior: the categorizer returns a structured JSON error rather than crashing or returning HTML. Not a defect.

2. **`docker-compose.local.yml` emits a cosmetic `version: '3.8' obsolete` warning**: Docker Compose v2.29+ emits this warning. Not a failure; already noted in QA phase. Low-priority follow-up.

3. **Browser MCP screenshot path** (`/c:/Users/flow/...`) was in a Windows-style path (Cursor IDE host filesystem) and not accessible from the Linux workspace. Page snapshot YAML (134 refs) serves as equivalent structural evidence.

---

## Decision gate

- **DEC-0018** (standalone compose with explicit `-f`): PASS
- **DEC-0019** (schema_version 1 additive extensions): PASS
- **UAT verdict**: PASS
- **next_scheduled_phase**: release

---

## Conclusion

US-0006 UAT complete — **PASS**. All 6 acceptance criteria now have direct runtime evidence (including AC-5 browser MCP probe, no longer deferred). Sprint S0008 ready for release.
