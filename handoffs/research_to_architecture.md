# Research → Architecture handoff: BUG-0002

## Executive summary

BUG-0002 (`GET /api/reviews` returns HTTP 404 HTML → `loadPendingReviews` JSON parse error) is caused by a **stale production container image**. The running `categorizer` container is using image `firefly-categorizer:latest` built on 2026-06-12 and created on 2026-06-14T17:11:39Z — before US-0004 (released 2026-06-14T20:23:00Z) added the `GET /api/reviews` route. Because the parent Docker Compose (`/workdir/firefly/docker-compose.yml`) builds from a local context and uses `restart: unless-stopped`, the container kept running the old image until it was restarted on 2026-06-22, but Docker reused the same stale image rather than rebuilding.

The HTML body reported by the operator (`<!DOCTYPE ...>`, `Cannot GET /api/reviews`) is Express 4's default 404 page, emitted by the stale backend itself when no route matches. Traefik is in the path and currently enforces Basic Auth, so unauthenticated public probes now return 401, but authenticated requests that reach the backend return the same HTML 404.

Full research record: `docs/engineering/research.md` section **R-0024**.

---

## Root cause verdict

| Hypothesis | Verdict | Key evidence |
|------------|---------|--------------|
| **H1 — Stale deployed image** | **CONFIRMED** | Production container `categorizer` image ID `sha256:31779c985e5a`, created 2026-06-12; container created 2026-06-14T17:11:39Z, before US-0004 release; internal probe `http://127.0.0.1:3000/api/reviews` returns `404 Cannot GET /api/reviews` HTML with `X-Powered-By: Express`. |
| H2 — Traefik HTML 404 | Ruled out | Unauthenticated public requests return 401 (auth middleware), not 404. The observed HTML body is Express's default 404, not Traefik's error page. |
| H3 — Static middleware shadowing | Ruled out | `express.static` falls through for missing files; local fresh build with static middleware mounted before API routes correctly serves `/api/reviews` as JSON 200. |

**Root cause:** Production image predates US-0004, so `src/App.js` in the running container does not register `/api/reviews`.

---

## Recommended fix

### 1. Primary fix: rebuild and redeploy production (required)

From the parent stack directory:

```bash
cd /workdir/firefly
docker compose up -d --build --force-recreate categorizer
```

This rebuilds the image from the current repo source (`./categorizer/firefly-iii-ai-categorize`) and recreates the container, ensuring `src/App.js:198-201` and `#onGetReviews` are present.

**Verification:**

```bash
docker exec categorizer node -e \
  "require('http').get('http://127.0.0.1:3000/api/reviews', (res) => { let b=''; res.on('data', c=>b+=c); res.on('end', () => console.log(res.statusCode, b)); });"
```

Expected: HTTP 200 JSON `{"success":true,"reviews":[...]}`.

### 2. Secondary fix: defensive UI hardening in `public/index.html` (strongly recommended)

Modify `loadPendingReviews` at `public/index.html:3461-3475` to guard `response.ok` before calling `.json()`:

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

Because production live-mounts `public/` from the host (`/workdir/firefly/categorizer/firefly-iii-ai-categorize/public:/app/public:ro`), this frontend change does **not** require a container rebuild to take effect.

### 3. Not needed

- **Backend code change:** route already exists in source; no defect in `src/App.js`.
- **Traefik config change:** current labels and auth middleware are correct.
- **`docker-compose.yml` update:** compose already references the right build context.

---

## AC coverage

| AC | Requirement | How the fix satisfies it |
|----|-------------|--------------------------|
| BUG-0002 AC-1 | Page load — no `GET /api/reviews 404` and no `SyntaxError` on a healthy deployment | Rebuild registers the route; deployment returns JSON. UI guard prevents parse errors during transient failures. |
| BUG-0002 AC-2 | `GET /api/reviews` returns HTTP 200 JSON when healthy, or structured `{success:false,error:...}` (not HTML) when the endpoint fails | Route is present after rebuild; `#onGetReviews` already returns structured JSON on internal errors. |
| BUG-0002 AC-3 | If `GET /api/reviews` returns a structured `{success:false,error:...}`, `loadPendingReviews` surfaces the error and does not throw a JSON parse `SyntaxError` | `if (!response.ok)` stops `.json()` for non-success statuses; `result.success` branch already surfaces backend errors. |
| BUG-0002 AC-4 | Pending Reviews panel renders each item with transaction summary, history category + confidence, AI category + confidence, recommended choice, Accept/Reject | `renderPendingReviews` is unchanged and receives valid JSON after redeploy. |

**Acceptance can be closed after:** production redeploy + smoke test + UI hardening merged.

---

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| RA-1 | Redeploy reuses cached image layer; route still missing | Low | High | Use `--force-recreate --build`; verify via internal `127.0.0.1:3000/api/reviews` probe before declaring success. |
| RA-2 | Production Basic Auth middleware blocks validation probes if credentials are missing/unavailable | Medium | Medium | Confirm `credentials.passwd` exists and is referenced by Traefik; perform authenticated external curl or access UI from an authenticated browser session. |
| RA-3 | UI hardening masks future backend regressions by swallowing all fetch errors | Low | Low | Keep `console.error` with full error; only the user-facing toast is friendlier. |
| RA-4 | Any later backend route change is silently missed because of `restart: unless-stopped` + live `public/` mount | Medium | High | Document operational runbook rule: "Any change under `src/` requires `docker compose up -d --build categorizer`." |
| RA-5 | Redeploy introduces unrelated regressions (dependency drift, environment drift) | Low | Medium | Regression test `tests/run-tests.sh` passes in CI before deploy; post-deploy smoke `/api/reviews`, `/api/categories`, and `/api/version`. |

---

## Decision gates for architecture

1. **Confirm no new DEC record is needed** for BUG-0002: the fix is a rebuild + small UI guard with clear tradeoffs already documented in R-0024.
2. **Decide whether to include the UI guard in the same sprint** as the redeploy or treat it as a quick follow-up.
3. **Decide whether to add an automated smoke test** for `/api/reviews` route presence to prevent future stale-image regressions.

---

## Linked artifacts

| Artifact | Role |
|----------|------|
| `docs/engineering/research.md` R-0024 | Full research record |
| `handoffs/discovery_to_research.md` | Discovery hypothesis ranking |
| `docs/product/acceptance.md` | BUG-0002 ACs |
| `docs/product/backlog.md` | BUG-0002 backlog entry |
| `src/App.js:198-201` | Route registration |
| `src/App.js:1467-1475` | `#onGetReviews` handler |
| `public/index.html:3461-3475` | `loadPendingReviews` |
| `/workdir/firefly/docker-compose.yml` | Production compose |
| `sprints/S0008/qa-evidence/api-reviews.json` | Proof fresh image works |

## Next phase

**`/architecture`** — confirm fix scope, decide on automated smoke test, and prepare sprint plan for BUG-0002.
