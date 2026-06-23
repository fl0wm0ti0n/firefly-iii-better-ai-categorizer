# Sprint S0009 Tasks — BUG-0002 Pending Reviews 404 Fix

## Task Overview

| ID | Title | Dependencies | Complexity | Status |
|----|-------|--------------|------------|--------|
| T-0050 | Production redeploy and verify `/api/reviews` | — | high | pending |
| T-0051 | Defensive UI hardening in `loadPendingReviews` | — | medium | pending |
| T-0052 | Regression test run after UI change | T-0051 | low | pending |
| T-0053 | Verify all BUG-0002 acceptance criteria | T-0050, T-0051, T-0052 | medium | pending |

---

## T-0050: Production redeploy and verify `/api/reviews`

**Goal:** Rebuild and recreate the production `categorizer` container from the parent Firefly stack so the stale image (predating US-0004) is replaced and `GET /api/reviews` returns JSON.

**Acceptance Criteria:** BUG-0002 AC-1, AC-2  
**Decision References:** DEC-0020  
**Dependencies:** None  
**Complexity:** High  
**Files:** `/workdir/firefly/docker-compose.yml` (target of command; not modified)

**Requirements:**
1. Run from `/workdir/firefly`:
   ```bash
   docker compose -f /workdir/firefly/docker-compose.yml up -d --build --force-recreate categorizer
   ```
2. Wait for the container to reach a healthy state.
3. Probe the endpoint from inside the container:
   ```bash
   docker exec categorizer node -e \
     "require('http').get('http://127.0.0.1:3000/api/reviews', (res) => { let b=''; res.on('data', c=>b+=c); res.on('end', () => console.log(res.statusCode, b)); });"
   ```
4. Expected result: HTTP 200 with a JSON body of `{"success":true,"reviews":[...]}`.
5. Record probe output (status code + body) in sprint evidence.
6. If the probe returns HTML 404, do not proceed; investigate build cache or image tag issues.

**Done When:**
- Container is recreated and reports healthy.
- Internal probe returns HTTP 200 JSON from `/api/reviews`.
- Evidence is recorded in `sprints/S0009/qa-evidence/api-reviews.json` or equivalent.

---

## T-0051: Defensive UI hardening in `loadPendingReviews`

**Goal:** Make `public/index.html:3461-3485` (`loadPendingReviews`) resilient to non-JSON responses so an HTML 404 body cannot cause a `SyntaxError`, and surface any structured backend error in the UI.

**Acceptance Criteria:** BUG-0002 AC-1, AC-3  
**Decision References:** DEC-0020  
**Dependencies:** None  
**Complexity:** Medium  
**Files:** `public/index.html`

**Requirements:**
1. Before calling `.json()`, check `response.ok`.
2. Inspect the `Content-Type` response header; if it does not include `application/json`, throw an actionable error instead of attempting to parse.
3. Parse JSON inside a `try/catch` block (or rely on the content-type guard).
4. If the parsed JSON has `success: false`, log `result.error` to `console.error` and display it via `showToast`.
5. If the fetch throws for any reason (network, non-JSON body, HTTP error), log the full error to `console.error` and show a user-facing `showToast` message using the error message.
6. Keep the existing `renderPendingReviews(result.reviews || [])` call on success.

**Target shape:**
```javascript
async function loadPendingReviews() {
    try {
        const response = await fetch('/api/reviews');
        if (!response.ok) {
            throw new Error(`Reviews service unavailable (HTTP ${response.status}).`);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`Unexpected response type for reviews: ${contentType}`);
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

**Done When:**
- `public/index.html` contains `response.ok` and content-type checks in `loadPendingReviews`.
- Structured errors from the endpoint are surfaced via `showToast`.
- No raw JSON-parse jargon reaches the UI toast.

---

## T-0052: Regression test run after UI change

**Goal:** Ensure the existing automated test harness still passes after the UI hardening change.

**Acceptance Criteria:** BUG-0002 AC-1 (stability)  
**Decision References:** DEC-0020  
**Dependencies:** T-0051  
**Complexity:** Low  
**Files:** `tests/run-tests.sh`

**Requirements:**
1. Run the canonical test command:
   ```bash
   ./tests/run-tests.sh
   ```
2. Expect exit code `0` and all tests passing (18/18 at time of writing).
3. Capture the test-run output and exit code in sprint evidence.
4. If any test fails, triage whether it is related to the UI change or a pre-existing/environment issue; do not override failures.

**Done When:**
- `tests/run-tests.sh` exits 0.
- Regression evidence is recorded in sprint artifacts.

---

## T-0053: Verify all BUG-0002 acceptance criteria

**Goal:** Confirm that all four BUG-0002 acceptance criteria are satisfied after redeploy and UI hardening.

**Acceptance Criteria:** BUG-0002 AC-1, AC-2, AC-3, AC-4  
**Decision References:** DEC-0020  
**Dependencies:** T-0050, T-0051, T-0052  
**Complexity:** Medium  
**Files:** `docs/product/acceptance.md` (verification target); `public/index.html`

**Requirements:**
1. **AC-1** — Reload the authenticated admin UI; confirm the browser console shows no `GET /api/reviews 404` and no `SyntaxError: Unexpected token '<'` from `loadPendingReviews`.
2. **AC-2** — Verify `GET /api/reviews` returns HTTP 200 JSON (`{ success: true, reviews: [...] }`) on a healthy deployment, or a structured `{ success: false, error: "..." }` (not HTML) when the endpoint fails.
3. **AC-3** — If the endpoint returns a structured `{ success: false, error: "..." }`, confirm `loadPendingReviews` surfaces it in the UI via `showToast` without throwing a JSON parse error. (If production is healthy, this can be simulated on a local instance by temporarily misconfiguring the route or by reviewing the code path.)
4. **AC-4** — With real review data present, confirm the Pending Reviews panel renders each item showing:
   - transaction summary,
   - history category + confidence,
   - AI category + confidence,
   - recommended choice,
   - Accept and Reject actions.
5. Record verification results for each AC, including any caveats or environment notes.

**Done When:**
- All four ACs are checked and documented.
- Any failures are filed as new issues or blockers.
- Verification report is attached to the sprint evidence.

---

## Execution Order

**Phase 1: Parallel**
- T-0050: Production redeploy and verify `/api/reviews`
- T-0051: Defensive UI hardening in `loadPendingReviews`

**Phase 2: Validation**
- T-0052: Regression test run after UI change
- T-0053: Verify all BUG-0002 acceptance criteria

---

## References

- Architecture: `docs/engineering/architecture.md` (BUG-0002 section)
- Decision: `decisions/DEC-0020.md`
- Research: `docs/engineering/research.md` (R-0024)
- Acceptance: `docs/product/acceptance.md` (BUG-0002 ACs)
- Backlog: `docs/product/backlog.md` (BUG-0002 entry)
- Handoff: `handoffs/po_to_tl.md`
