# QA Findings — Sprint S0009 / BUG-0002

**Phase:** qa  
**Work item:** BUG-0002 — Pending Reviews endpoint returns HTTP 404 HTML → `loadPendingReviews` JSON parse error  
**Sprint:** S0009  
**Role:** qa  
**Timestamp:** 2026-06-24T00:36:04+02:00  
**Browser view ID:** 79d0b0  
**Verdict:** **PASS**

---

## QA Plan

1. Read dev→qa handoff, execution summary, and T-0053 AC verification evidence.
2. Re-run regression suite: `bash tests/run-tests.sh`.
3. Probe production `/api/reviews` for JSON 200.
4. Launch local ephemeral instance via `bash scripts/dev-launch.sh`, probe `/api/reviews`, and expand the Pending Reviews panel.
5. Simulate a non-JSON (404 text/html) `/api/reviews` response and verify a user-facing `showToast` error without a JSON parse `SyntaxError`.
6. Verify the Pending Reviews panel renders all required fields when populated with a fully-shaped review.
7. Stop local service and restore `data/pending-category-reviews.json`.

---

## Acceptance Criteria Matrix

| AC | Criteria | Status | Evidence |
|----|----------|--------|----------|
| AC-1 | Page load produces no `GET /api/reviews 404` and no `SyntaxError: Unexpected token '<'` from `loadPendingReviews`. | **PASS** | Production endpoint returns JSON 200; local page loads; browser runtime collector reports `syntaxError: false` before and after expanding the panel. |
| AC-2 | `GET /api/reviews` returns HTTP 200 JSON `{ success: true, reviews: [...] }` when healthy. | **PASS** | Production: `{"success":true,"reviews":[]}`; local (seeded): one fully-shaped pending review, HTTP 200. |
| AC-3 | A structured `{ success: false, error: "..." }` or non-JSON HTML response surfaces in the UI without a JSON parse `SyntaxError`. | **PASS** | Monkey-patched `fetch` returned `404 text/html`; `showToast` displayed the error and `window.__syntaxError` remained `false`. |
| AC-4 | Pending Reviews panel renders each item with transaction summary, history category + confidence, AI category + confidence, recommended choice, and Accept/Reject actions. | **PASS** | Panel text contains description, account/transaction IDs, history category/confidence, AI category/confidence, recommendation, reason, and Accept/Reject buttons. |

---

## 1. Regression Tests

Command: `bash tests/run-tests.sh`

```text
TAP version 13
# Subtest: hist-1-dominance-clear-winner: >80% threshold returns dominant category with confidence
ok 1 - hist-1-dominance-clear-winner: >80% threshold returns dominant category with confidence
  ---
  duration_ms: 5.405054
  ...
# Subtest: hist-2-below-threshold: 60% dominance returns belowThreshold flag
ok 2 - hist-2-below-threshold: 60% dominance returns belowThreshold flag
  ---
  duration_ms: 0.542357
  ...
# Subtest: hist-3-insufficient-data: < 10 transactions returns insufficientData flag
ok 3 - hist-3-insufficient-data: < 10 transactions returns insufficientData flag
  ---
  duration_ms: 0.426221
  ...
# Subtest: hist-4-empty-list: empty transaction list returns insufficientData
ok 4 - hist-4-empty-list: empty transaction list returns insufficientData
  ---
  duration_ms: 0.358562
  ...
# 📁 Using data directory: /workdir/firefly/categorizer/firefly-iii-ai-categorize/data
# 📊 No dominance config found, using defaults (threshold=0.80, minTx=10)
# 📊 No dominance config found, using defaults (threshold=0.80, minTx=10)
# 📊 No dominance config found, using defaults (threshold=0.80, minTx=10)
# 📊 No dominance config found, using defaults (threshold=0.80, minTx=10)
# 📊 History analysis config loaded: threshold=0.5, minTx=5
# Subtest: hist-5-configurable-threshold: data/dominance-config.json overrides defaults
ok 5 - hist-5-configurable-threshold: data/dominance-config.json overrides defaults
  ---
  duration_ms: 122.345706
  ...
# ✅ Successfully classified transaction as: Groceries
# ✅ Successfully classified transaction as: Groceries
# 🚨 OpenAI Rate Limit/Quota exceeded:
#    - You may have exceeded your API quota
#    - Try again in a few minutes
#    - Check your OpenAI billing dashboard
# 📊 Current session stats: 0 requests, 0 tokens, 1 rate limits
# Subtest: oai-1-schema-enum: schema includes all categories + UNKNOWN with strict:true
ok 6 - oai-1-schema-enum: schema includes all categories + UNKNOWN with strict:true
  ---
  duration_ms: 6.428683
  ...
# Subtest: oai-2-valid-category: valid category returns { category, prompt, response }
ok 7 - oai-2-valid-category: valid category returns { category, prompt, response }
  ---
  duration_ms: 0.657256
  ...
# Subtest: oai-3-unknown-null: UNKNOWN response maps to { category: null, response: "UNKNOWN", prompt }
ok 8 - oai-3-unknown-null: UNKNOWN response maps to { category: null, response: "UNKNOWN", prompt }
  ---
  duration_ms: 0.647235
  ...
# Subtest: oai-4-refusal: refusal maps to { category: null, response: refusal, prompt }
ok 9 - oai-4-refusal: refusal maps to { category: null, response: refusal, prompt }
  ---
  duration_ms: 0.508746
  ...
# Subtest: oai-5-429-exception: 429 APIError sets error.code = 429 for retryWithBackoff
ok 10 - oai-5-429-exception: 429 APIError sets error.code = 429 for retryWithBackoff
  ---
  duration_ms: 2.45705
  ...
# 📁 Using data directory: /tmp/queue-test-A16NkI
# 📋 No pending reviews file found, starting empty
# 📝 Added pending review for transaction tx-123
# Subtest: queue-1-add-review: addReview adds review to queue
ok 11 - queue-1-add-review: addReview adds review to queue
  ---
  duration_ms: 66.955865
  ...
# 📋 No pending reviews file found, starting empty
# 📝 Added pending review for transaction tx-1
# 📝 Added pending review for transaction tx-2
# Subtest: queue-2-get-pending-reviews: getPendingReviews returns only pending items
ok 12 - queue-2-get-pending-reviews: getPendingReviews returns only pending items
  ---
  duration_ms: 56.909927
  ...
# 📋 No pending reviews file found, starting empty
# 📝 Added pending review for transaction tx-1
# Subtest: queue-3-accept-review: acceptReview marks as accepted and applies category
ok 13 - queue-3-accept-review: acceptReview marks as accepted and applies category
  ---
  duration_ms: 58.167093
  ...
# 📋 No pending reviews file found, starting empty
# 📝 Added pending review for transaction tx-1
# Subtest: queue-4-reject-review: rejectReview marks as rejected and removes from pending
ok 14 - queue-4-reject-review: rejectReview marks as rejected and removes from pending
  ---
  duration_ms: 55.15999
  ...
# Subtest: case-1-account-wins
ok 15 - case-1-account-wins
  ---
  duration_ms: 3.96712
  ...
# Subtest: case-2-auto-cat-wins
ok 16 - case-2-auto-cat-wins
  ---
  duration_ms: 0.645502
  ...
# Subtest: case-3-ai-wins
ok 17 - case-3-ai-wins
  ---
  duration_ms: 1.131477
  ...
# Subtest: case-4-account-beats-ai
ok 18 - case-4-account-beats-ai
  ---
  duration_ms: 0.429538
  ...
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 657.419744
```

**Result:** 18/18 pass, exit code 0.

---

## 2. Production `/api/reviews` Smoke Test

Command: `curl -i http://127.0.0.1:3000/api/reviews`

```text
HTTP/1.1 200 OK
X-Powered-By: Express
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
Expires: 0
Surrogate-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 29
ETag: W/"1d-AaFOkrC4/GTKknFVVyp3ltN6LBU"
Date: Tue, 23 Jun 2026 22:31:42 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"success":true,"reviews":[]}
```

**Result:** Production endpoint alive, returns HTTP 200 JSON, empty reviews queue.

---

## 3. Local Instance Launch & `/api/reviews`

Command: `bash scripts/dev-launch.sh`
- Build completed; container healthy after 2s.
- Local port `3001` responded HTTP 200.

Command: `curl -s http://localhost:3001/api/reviews` (after seeding one fully-shaped pending review)

```json
{
  "success": true,
  "reviews": [
    {
      "id": "review-ac4-1",
      "transactionId": "tx-demo-001",
      "description": "Whole Foods Market",
      "accountId": "acc-42",
      "timestamp": "2026-06-24T00:20:00.000Z",
      "status": "pending",
      "historyCategory": "Groceries",
      "historyConfidence": 0.92,
      "aiCategory": "Restaurants",
      "aiConfidence": 0.45,
      "recommendation": "Groceries",
      "reason": "Account history strongly matches Groceries.",
      "recommendationData": {
        "preferredCategory": "Groceries",
        "historyConfidence": 0.92,
        "aiCategory": "Restaurants",
        "aiConfidence": 0.45
      }
    }
  ]
}
```

**Result:** Local endpoint returns JSON 200 with a fully-shaped review item.

---

## 4. Browser Verification

### 4.1 Page load & runtime error check (AC-1)

After navigating to `http://localhost:3001/` and installing a runtime error collector:

```json
{
  "consoleErrors": [],
  "errors": [],
  "syntaxError": false,
  "toasts": []
}
```

**Result:** No `SyntaxError`, no console errors, page loads successfully.

### 4.2 Pending Reviews panel render (AC-4)

After clicking the **Pending Reviews** panel button and refreshing with the seeded review:

```text
Pending Reviews
1 pending Oldest: just now
🔄 Refresh
Whole Foods Market
6/24/2026, 2:20:00 AM • Account ID: acc-42 • Transaction ID: tx-demo-001
History Suggestion
Groceries
Confidence: 92.0%
AI Suggestion
Restaurants
Confidence: 45.0%
Recommendation
Groceries
Account history strongly matches Groceries.
❌ Reject
✅ Accept
```

The panel contains:
- Transaction summary (description, date, account, transaction ID).
- History category + confidence (`Groceries`, `92.0%`).
- AI category + confidence (`Restaurants`, `45.0%`).
- Recommended choice (`Groceries`) + reason.
- **Reject** and **Accept** actions.

**Result:** AC-4 satisfied.

---

## 5. UI Error-Response Simulation (AC-3)

With the page loaded and the Pending Reviews panel expanded, `fetch` was temporarily monkey-patched so that `GET /api/reviews` returned:

```text
HTTP 404 Not Found
Content-Type: text/html
Body: <!doctype html><html><body>Not Found</body></html>
```

Runtime collector output after `loadPendingReviews()` ran:

```json
{
  "consoleErrors": [
    "Error loading reviews: Error: Server returned an unexpected response for pending reviews (HTTP 404 Not Found). Please check that the categorizer service is running and up to date.",
    "Error loading reviews: Error: Server returned an unexpected response for pending reviews (HTTP 404 Not Found). Please check that the categorizer service is running and up to date."
  ],
  "errors": [],
  "syntaxError": false,
  "toasts": [
    {
      "message": "Error loading reviews: Server returned an unexpected response for pending reviews (HTTP 404 Not Found). Please check that the categorizer service is running and up to date.",
      "type": "error"
    },
    {
      "message": "Error loading reviews: Server returned an unexpected response for pending reviews (HTTP 404 Not Found). Please check that the categorizer service is running and up to date.",
      "type": "error"
    }
  ]
}
```

**Result:** The defensive `response.ok` + `Content-Type` guard in `public/index.html:3461-3485` caused `loadPendingReviews` to throw a descriptive `Error` and route it through the existing `catch` block, surfacing a `showToast` error **without** any JSON parse `SyntaxError`. AC-3 satisfied.

---

## 6. Cleanup

- Stopped the local ephemeral container: `bash scripts/dev-launch.sh --stop`.
- Restored `data/pending-category-reviews.json` to its pre-verification contents.

---

## Summary

All four BUG-0002 acceptance criteria passed in an independent QA pass. The production container is healthy and returns JSON 200; the hardened `loadPendingReviews` function correctly handles non-JSON error responses; and the Pending Reviews panel renders fully-shaped review items with all expected fields. Regression test suite remains green at 18/18.

**Next phase:** `verify-work`.
