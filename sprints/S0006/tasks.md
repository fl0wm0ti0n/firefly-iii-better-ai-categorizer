# Tasks — Sprint S0006 (US-0004)

| ID | Status | Title | Files | Acceptance mapping |
|----|--------|-------|-------|-------------------|
| T-0024 | pending | `FireflyService.getAccountHistory()` with pagination + 1-hour cache | `src/FireflyService.js` | DEC-0011; AC-1 |
| T-0025 | pending | Dominance calculator module with 80% threshold + 10 min tx | `src/HistoryAnalysisService.js` | DEC-0012; AC-1, AC-2 |
| T-0026 | pending | Extend `OpenAiService.classify()` with confidence field | `src/OpenAiService.js` | DEC-0014; AC-3 |
| T-0027 | pending | `App.js` `#resolveCategory` integration — history + AI comparison + queue | `src/App.js` | AC-4, AC-7 |
| T-0028 | pending | Review queue persistence — `data/pending-category-reviews.json` | `src/PendingReviewService.js` | DEC-0013; AC-4 |
| T-0029 | pending | REST API endpoints — `GET /api/reviews`, `POST` accept/reject | `src/App.js` | AC-5, AC-6 |
| T-0030 | pending | UI review panel — sidebar entry, transaction summary, accept/reject buttons | `public/index.html` | AC-5, AC-6 |
| T-0031 | pending | Tests — dominance algorithm, queue persistence, API endpoints, UI smoke test | `tests/historyAnalysisService.test.js`, `tests/pendingReviewService.test.js`, `tests/resolveCategory.test.js` | AC-1 through AC-8 |

## T-0024 — `FireflyService.getAccountHistory()` with pagination + 1-hour cache

**Goal:** Paginated account history fetch with in-memory cache per **DEC-0011** and **R-0018**.

**Requirements:**

1. Add `getTransactionsByAccountId(accountId, { limit = 500, type = 'withdrawal' } = {})` method.
2. Paginate through all pages using `page` + `limit` query params on `/api/v1/accounts/{id}/transactions`.
3. Request headers: `Authorization: Bearer ${this.#PERSONAL_TOKEN}`, `Accept: application/json`.
4. Non-ok responses throw `FireflyException(response.status, response, await response.text())`.
5. Add `getCachedAccountHistory(accountId)` wrapper with in-memory `Map<accountId, {data, timestamp}>`.
6. Cache TTL: 3600000 ms (1 hour) per DEC-0011.
7. Return cached data when `Date.now() - cached.timestamp < CACHE_TTL_MS`.
8. Fetch fresh data when cache expired or missing; update cache.
9. Add private `#accountHistoryCache` field initialized to `new Map()`.

**Done when:** `getTransactionsByAccountId()` paginates correctly; `getCachedAccountHistory()` returns cached data within TTL.

## T-0025 — Dominance calculator module with 80% threshold + 10 min tx

**Goal:** Account history dominance calculation per **DEC-0012** and **R-0020**.

**Requirements:**

1. Create `src/HistoryAnalysisService.js` with `analyzeAccountHistory(transactions)` method.
2. Filter transactions with non-null `category_id` (from `tx.attributes.transactions[0].category_id`).
3. Return `{ dominantCategory: null, insufficientData: true, categorizedCount }` when `categorizedCount < minTransactionCount` (default 10).
4. Count category occurrences; find max count category.
5. Calculate `dominance = maxCount / categorizedCount`.
6. Return `{ dominantCategory, belowThreshold: true, dominance, categorizedCount }` when `dominance < dominanceThreshold` (default 0.80).
7. Return `{ dominantCategory, dominance, confidence: dominance, categorizedCount, categoryCounts }` when threshold met.
8. `confidence = dominance` (dominant share) per AC-2.
9. Default threshold 0.80 (80%) per DEC-0012.
10. Default `minTransactionCount` 10 per DEC-0012.
11. Optional `data/dominance-config.json` overrides defaults.
12. `getThreshold()` returns current dominance threshold.
13. Tie-breaking: first encountered category wins (document behavior).

**Done when:** `analyzeAccountHistory()` returns correct dominance + confidence; threshold + min tx enforced.

## T-0026 — Extend `OpenAiService.classify()` with confidence field

**Goal:** Confidence-bearing classification per **DEC-0014** and **R-0019**.

**Requirements:**

1. Extend `#buildCategorySchema(categories)` to add `confidence: { type: 'number', minimum: 0, maximum: 1 }` to `properties`.
2. Update `required` array to include both `'category'` and `'confidence'`.
3. Update `classify()` return shape: `{ category, confidence, prompt, response }`.
4. Response mapping:
   - `parsed.category === 'UNKNOWN'` → `{ category: null, confidence: parsed.confidence || 0, response: 'UNKNOWN', prompt }`
   - Valid enum → `{ category: parsed.category, confidence: parsed.confidence || 0.5, response: parsed.category, prompt }`
   - `message.refusal` set → `{ category: null, confidence: 0, response: refusal, prompt }`
   - JSON parse failure → `{ category: null, confidence: 0, response: rawContent, prompt }` + `console.warn`
5. Update `#generatePrompt()` with confidence scoring instructions:
   - 0.9–1.0: Clear match, high certainty
   - 0.6–0.8: Reasonable match, moderate certainty
   - 0.3–0.5: Uncertain match, low certainty
   - 0.0–0.2: Very uncertain, likely wrong
6. Preserve `strict: true` + `additionalProperties: false`.

**Done when:** `classify()` returns `{ category, confidence, prompt, response }`; schema includes confidence field.

## T-0027 — `App.js` `#resolveCategory` integration — history + AI comparison + queue

**Goal:** Pipeline integration with history + AI comparison per **AC-4** and **AC-7**.

**Requirements:**

1. Insert history dominance check in `#resolveCategory()` after word/keyword hints and before AI classification.
2. Fetch cached account history via `this.#firefly.getCachedAccountHistory(accountId)` where `accountId = firstTx.source_id`.
3. Run `this.#historyAnalysisService.analyzeAccountHistory(accountHistory)`.
4. If `analysis.dominantCategory` and `analysis.dominance >= this.#historyAnalysisService.getThreshold()`, build `historySuggestion = { category, confidence, basis }`.
5. History fetch failure logs warning and continues without history suggestion (non-blocking).
6. After AI `classify()`, call `#compareHistoryAndAi(historySuggestion, aiResult, transaction, categories)`.
7. `#compareHistoryAndAi()` creates review entry with `transactionSummary`, `historySuggestion`, `aiSuggestion`, `recommendation`.
8. Recommendation logic: higher confidence wins; tie-break prefers history (empirical).
9. Recommendation reasons: `history_and_ai_agree`, `history_and_ai_disagree`, `history_only`, `ai_only`.
10. Returns `{ category: null, queuedForReview: true, reviewId }` when queued.
11. `#processTransaction()` checks `queuedForReview` flag and skips `setCategory` + `addTag`.
12. Hard rules (account mapping step 1, auto-cat step 2) still short-circuit before history (AC-7).
13. Duplicate `transactionId` check prevents duplicate queue entries.

**Done when:** `#resolveCategory` queues for review when history or AI present; hard rules short-circuit; `#processTransaction` skips Firefly mutation when queued.

## T-0028 — Review queue persistence — `data/pending-category-reviews.json`

**Goal:** JSON-backed review queue per **DEC-0013** and **DEC-0004**.

**Requirements:**

1. Create `src/PendingReviewService.js` with JSON file persistence at `data/pending-category-reviews.json`.
2. Use `storage.js` `dataFile()` + `ensureDataDir()` pattern (DEC-0004).
3. `loadReviews()` reads file on constructor; handles `ENOENT` gracefully (empty array).
4. `saveReviews()` writes JSON with 2-space indent.
5. `addReview(review)` checks for duplicate (same `transactionId` + `status='pending'`) — returns existing.
6. `addReview()` prepends new review (`unshift`) and saves.
7. `acceptReview(id, chosenCategory)` sets `status='accepted'`, `resolvedAt`, `resolvedBy='operator'`, `resolvedChoice=chosenCategory || review.recommendation.preferredCategory`.
8. `rejectReview(id)` sets `status='rejected'`, `resolvedAt`, `resolvedBy='operator'`, `resolvedChoice=null`.
9. `getPendingReviews()` returns only `status='pending'` items.
10. `getAllReviews()` returns all items (copy).

**Done when:** Queue CRUD functional; duplicate check prevents re-queue; JSON persistence works.

## T-0029 — REST API endpoints — `GET /api/reviews`, `POST` accept/reject

**Goal:** REST API for review queue per **AC-5** and **AC-6**.

**Requirements:**

1. Add routes in `App.js` `run()` method.
2. `GET /api/reviews` returns `{ success: true, reviews: [...pending], count }`.
3. `GET /api/reviews/all` returns `{ success: true, reviews: [...all], count }`.
4. `POST /api/reviews/:id/accept` applies chosen category to Firefly via `setCategory(review.transactionJournalId, chosenCategory)`.
5. `POST /api/reviews/:id/accept` adds `FIREFLY_TAG` via `addTag(review.transactionJournalId, this.#FIREFLY_TAG)`.
6. `POST /api/reviews/:id/accept` returns `{ success: true, review }` with updated status.
7. `POST /api/reviews/:id/reject` returns `{ success: true, review }` without Firefly mutation.
8. Both accept/reject return 404 `{ success: false, error: 'Review not found' }` for missing id.
9. Both accept/reject return 500 with error message on Firefly API failure.
10. `req.body.category` optional on accept (falls back to `review.recommendation.preferredCategory`).

**Done when:** REST endpoints functional; accept applies category + tag; reject dismisses without mutation.

## T-0030 — UI review panel — sidebar entry, transaction summary, accept/reject buttons

**Goal:** Operator review UI per **AC-5** and **AC-6**.

**Requirements:**

1. Add sidebar entry "Pending Reviews" with icon (`fa-clipboard-check`) and badge (`#review-queue-badge`) under Categorizer group.
2. Badge shows pending count; hidden when 0.
3. Panel layout: summary (pending count + oldest item age) + review list.
4. Review item displays: description, account name, amount + currency, date.
5. History badge shows category + confidence percentage with color coding (green ≥80%, amber ≥50%, red <50%).
6. AI badge shows category + confidence percentage with same color coding.
7. Recommendation shows preferred category and source (history or ai).
8. Accept button calls `POST /api/reviews/:id/accept` and reloads queue.
9. Reject button calls `POST /api/reviews/:id/reject` and reloads queue.
10. Error handling: alert on fetch failure or API error response.

**Done when:** UI panel displays pending items; accept/reject buttons functional; badge shows count.

## T-0031 — Tests — dominance algorithm, queue persistence, API endpoints, UI smoke test

**Goal:** Test coverage for all AC per **AC-1** through **AC-8**.

**Requirements:**

1. Create `tests/historyAnalysisService.test.js` using `node:test` + `node:assert/strict`.
2. Test cases:
   - **hist-1-no-transactions:** Empty array → `{ dominantCategory: null, insufficientData: true }`.
   - **hist-2-below-min-count:** 5 categorized tx → `{ dominantCategory: null, insufficientData: true }`.
   - **hist-3-below-threshold:** 100 tx, 65% dominance → `{ dominantCategory: 'X', belowThreshold: true }`.
   - **hist-4-above-threshold:** 100 tx, 85% dominance → `{ dominantCategory: 'X', dominance: 0.85, confidence: 0.85 }`.
   - **hist-5-perfect-dominance:** 50 tx, 100% → `{ dominantCategory: 'X', dominance: 1.0 }`.
3. Create `tests/pendingReviewService.test.js`.
4. Test cases:
   - **queue-1-add-review:** `addReview()` → review in `getPendingReviews()`.
   - **queue-2-accept-review:** `acceptReview(id)` → `status='accepted'`, `resolvedAt` set.
   - **queue-3-reject-review:** `rejectReview(id)` → `status='rejected'`, `resolvedChoice` null.
   - **queue-4-duplicate-check:** `addReview()` same `transactionId` → returns existing.
5. Update `tests/resolveCategory.test.js` stubs to include `confidence` field in `classify()` return.
6. Run `bash tests/run-tests.sh` — verify exit 0 with all tests passing.

**Done when:** 9 new test cases pass; 4 existing precedence tests still pass; full suite green.
