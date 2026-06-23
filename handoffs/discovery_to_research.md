# Discovery → Research handoff: BUG-0002

## Bug

- **ID:** BUG-0002
- **Title:** Pending Reviews endpoint returns HTTP 404 HTML → `loadPendingReviews` JSON parse error
- **Phase:** discovery (PO role, fresh context)
- **Prior phase boundary:** intake BUG-0002 (2026-06-22T20:33:00+02:00)
- **Intake evidence:** `handoffs/intake_evidence/intake-20260622-bug0002-reviews-404.json`

## Verdict

- **pass** — discovery complete; integration points mapped; scope for research bounded.

## Integration point map (narrow-read)

### 1. `loadPendingReviews` in `public/index.html:3461-3475`

```3461:3475:public/index.html
    async function loadPendingReviews() {
        try {
            const response = await fetch('/api/reviews');
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

- Fetches `GET /api/reviews` with no `response.ok` guard before `.json()`.
- If the server returns HTTP 404 with an HTML body, `.json()` throws `SyntaxError: Unexpected token '<'`.
- The `catch` block logs the raw error (JSON parse jargon) and shows a toast — neither is actionable.
- **Defensive hardening needed (BUG-0002 AC-3):** add `response.ok` check + wrap `.json()` in try/catch for non-JSON content-type.

### 2. `GET /api/reviews` route registration — `src/App.js:198-201`

```198:201:src/App.js
        // Review queue endpoints (US-0004)
        this.#express.get('/api/reviews', this.#onGetReviews.bind(this));
        this.#express.post('/api/reviews/:id/accept', this.#onAcceptReview.bind(this));
        this.#express.post('/api/reviews/:id/reject', this.#onRejectReview.bind(this));
```

- Route IS registered in source code.
- NOT a missing-route defect — the 404 is a runtime/deployment artifact.

### 3. `#onGetReviews` handler — `src/App.js:1467-1475`

```1467:1475:src/App.js
    async #onGetReviews(req, res) {
        try {
            const reviews = this.#pendingReviewService.getPendingReviews();
            res.json({ success: true, reviews });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }
```

- If `#pendingReviewService.getPendingReviews()` throws, returns HTTP 500 with structured JSON (not HTML).
- On success, returns HTTP 200 with `{ success: true, reviews: [...] }`.
- Express would return HTML 404 only if the route is NOT registered (e.g., different code version) or an upstream proxy intercepts.

### 4. Static middleware ordering — `src/App.js:128-135`

```128:136:src/App.js
            this.#express.use('/', (req, res, next) => {
                if (req.path === '/' || req.path === '/index.html') {
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                }
                next();
            }, express.static('public', { etag: false, lastModified: false }))
```

- Mounted on `/` BEFORE API route registrations (lines 138+).
- **Per Express semantics:** `express.static` only serves files that exist in `public/`. It calls `next()` for unmatched paths — it does NOT send a 404 for `/api/reviews` (there is no `public/api/reviews` file).
- **Hypothesis 3 (static middleware shadowing) is LIKELY INCORRECT.** Express static middleware fallthrough is safe for named API paths.
- However, there is a subtle risk: if `public/index.html` exists (which it does), and Express's `express.static` is mounted as a catch-all on `/`, then a request to a path that doesn't match any registered route but looks like a file path could potentially be served by the SPA catch-all... but only if there were an explicit SPA fallback (which there isn't — no `app.get('*', ...)` after the routes).

### 5. Health endpoint — `src/App.js:218-221`

```218:221:src/App.js
        // Health check endpoint
        this.#express.get("/", (req, res) => {
            res.send("OK");
        });
```

- Health is at `GET /` (returns `"OK"`), not `/health`.
- Registered AFTER API routes, so no conflict.

### 6. Dockerfile HEALTHCHECK — `Dockerfile:44-45`

```44:45:Dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1
```

- Probes `GET /` (matches source). Consistent.

### 7. docker-compose.yml (deprecated standalone-dev) — healthcheck at `docker-compose.yml:39`

- Probes `http://localhost:3000/health` — **inconsistent with source** (`/health` doesn't exist; should be `/`).
- Latent docs/config bug (separate from BUG-0002, not blocking).

### 8. docker-compose.local.yml (US-0006) — `docker-compose.local.yml:33-38`

```33:38:docker-compose.local.yml
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 20s
```

- Probes `GET /` (matches source, consistent with Dockerfile).
- This is the compose file used for local S0008 UAT — `/api/reviews` returned valid JSON in S0008 QA evidence.

### 9. S0008 UAT evidence — `sprints/S0008/qa-evidence/api-reviews.json`

- QA UAT probe via `docker-compose.local.yml` returned valid JSON `{"success":true,"reviews":[...]}`.
- **Proves the route works when the image is freshly built from current source.**
- This is the strongest evidence that the production 404 is a deployment/image-staleness issue, not a code defect.

### 10. Production deployment path

- `https://categorizer.omniflow.cc` runs via parent stack: `/workdir/firefly/docker-compose.yml` (out-of-repo).
- Traefik routes `categorizer.omniflow.cc` → container on port 3000.
- No evidence of when the production image was last rebuilt/redeployed.
- **If the production image predates US-0004 (which added `/api/reviews`), the route simply doesn't exist at runtime.**

### 11. Intake bundle evidence

```json
{
  "operator_report": {
    "url": "https://categorizer.omniflow.cc",
    "console_error": "GET https://categorizer.omniflow.cc/api/reviews 404 (Not Found)",
    "secondary_error": "SyntaxError: Unexpected token '<', \"<!DOCTYPE ...\" is not valid JSON",
    "trigger": "page load / right at the start"
  }
}
```

- HTML `<!DOCTYPE ...` body confirms an HTML 404 page, not a JSON structured error.
- The HTML is consistent with either: (a) Traefik default 404 page, (b) Express default 404 when no route matches (but Express doesn't produce HTML by default — it produces plaintext), or (c) a reverse proxy / ingress controller returning HTML.

## Hypothesis ranking (most to least likely)

1. **H1 — Stale deployed image (most likely).** Production image predates US-0004 (which added `/api/reviews` at `src/App.js:199`). S0008 UAT proves fresh image works. An HTML 404 from Traefik is consistent with the container not having the route registered.
2. **H2 — Traefik returning HTML 404.** If Traefik's backend health check fails or the container is down, Traefik serves its default HTML 404 page. The `<!DOCTYPE` body is consistent with Traefik's default error page.
3. **H3 — Static middleware interaction (unlikely).** `express.static` on `/` does not shadow `/api/reviews` because there's no `public/api/reviews` file. Express static middleware calls `next()` for unmatched paths. Ruled out as root cause.

## UX/design references

### Pending Reviews panel expected behavior (BUG-0002 AC-4)

- `renderPendingReviews` (`public/index.html:3477+`) renders each item with:
  - Transaction summary
  - History category + confidence
  - AI category + confidence
  - Recommended choice
  - Accept / Reject actions
- When the API fails with a structured `{ success: false, error: "..." }`, the panel should show an empty state with an error toast (not a JSON parse exception).

### BUG-0001 precedent (R-0006)

- Same "HTML body → JSON parse error" pattern affected `/api/categories`.
- Root cause was Firefly returning HTML (auth failure) → FireflyService didn't check content-type → JSON parse exception.
- Fix: Accept header + content-type guard + structured `FireflyException`.
- **Difference for BUG-0002:** the Categorizer's own `/api/reviews` route IS registered. The HTML is coming from outside the app (Traefik or stale image), not from a downstream service.

### Error handling pattern recommendation

Regardless of root cause, `loadPendingReviews` should:
1. Check `response.ok` before calling `.json()`.
2. Check `Content-Type` header contains `application/json` before parsing.
3. On non-JSON response, surface "Service unavailable — reviews could not be loaded" instead of raw parse error.
4. This matches the BUG-0001 fix pattern (R-0001: Accept header + content-type guard).

## Scope for research

Research must determine and persist findings as an `R-0024` entry in `docs/engineering/research.md`:

1. **Production deployment recency.** When was `https://categorizer.omniflow.cc` last rebuilt/redeployed? Does the running container include the US-0004 route? Command: inspect container image digest or exec `curl localhost:3000/api/reviews` from inside the container.
2. **Traefik behavior.** Is Traefik's default 404 an HTML `<!DOCTYPE>` page? If the container is unreachable or unhealthy, does Traefik serve HTML? Can we check Traefik dashboard or logs?
3. **Static middleware verification.** While analysis shows it should not shadow `/api/*`, confirm with a runtime test: deploy fresh image locally with `ENABLE_UI=true` and `curl /api/reviews` — does it return JSON or HTML?
4. **Defensive hardening.** Minimal change to `loadPendingReviews` to prevent JSON parse errors on non-JSON responses (AC-3). Recommend: `if (!response.ok)` check + `Content-Type` guard + try/catch around `.json()`.
5. **Verification strategy.** How to prove the root cause once identified:
   - H1 proof: `docker exec categorizer curl localhost:3000/api/reviews` → if 404 inside container, image is stale.
   - H2 proof: `curl -v https://categorizer.omniflow.cc/api/reviews` → inspect response headers (`Server: Traefik` vs `X-Powered-By: Express`).
   - H3 proof: Launch fresh image locally with `ENABLE_UI=true` and confirm `/api/reviews` returns JSON.

## Open questions

1. **Deployment environment:** Is `https://categorizer.omniflow.cc` rebuilt on each merge to main, or manually deployed? When was the last deploy? (Determines whether image predates US-0004.)
2. **Production access:** Can we exec into the running container or inspect its image tag/digest to confirm staleness? (Determines H1 vs H2.)

## Recommendation

1. **Immediate fix (defensive hardening):** Update `loadPendingReviews` in `public/index.html` to guard against non-JSON responses (BUG-0002 AC-3). This is a small UI-only change that eliminates the user-visible symptom regardless of root cause.
2. **Root cause fix:** Confirm H1 (stale image) and redeploy `https://categorizer.omniflow.cc` with a fresh build that includes US-0004 routes. Alternatively confirm H2 (Traefik) and fix routing.
3. **Deferred:** Fix `docker-compose.yml` healthcheck to probe `/` instead of `/health` (latent inconsistency, not part of BUG-0002).

## Files read (narrow-read policy)

- `docs/product/backlog.md` (BUG-0002 section, lines 174-183)
- `docs/product/acceptance.md` (BUG-0002 ACs, lines 64-69)
- `handoffs/intake_evidence/intake-20260622-bug0002-reviews-404.json` (full intake bundle)
- `public/index.html` (loadPendingReviews, lines 3461-3475; renderPendingReviews, 3477+)
- `src/App.js` (route registration 198-201, #onGetReviews 1467-1475, static middleware 128-136, listen 218-225)
- `Dockerfile` (HEALTHCHECK probes GET /)
- `docker-compose.yml` (deprecated standalone-dev, healthcheck probes /health — inconsistent)
- `docker-compose.local.yml` (US-0006 local launch, healthcheck probes GET /)
- `.cursor/dev-environment.json` (US-0006 agent launch config)
- `docs/engineering/state.md` (current state — refresh-context at top)

## Next phase

**`/research`** — prove root cause hypothesis (H1 vs H2), determine production image recency, verify Traefik behavior, confirm defensive hardening approach. Persist findings as R-0024 in `docs/engineering/research.md`.
