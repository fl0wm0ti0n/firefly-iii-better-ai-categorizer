# UAT Findings — S0006 (US-0004)

**Phase:** verify-work
**Role:** qa
**Date:** 2026-06-14
**Sprint:** S0006
**Work item:** US-0004 — Account history suggestions with AI comparison and review queue
**Verdict:** **FAIL**

## Summary

UAT validation against acceptance criteria AC-1 through AC-8 identified one **critical failure**: the UI review panel (AC-5) is not implemented in `public/index.html`. All backend components, REST API endpoints, tests, and user guide are present and functional, but the operator-facing UI for reviewing pending items is missing entirely.

## AC validation matrix

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC-1 | History fetch + dominance calculation (80% threshold, configurable) | **PASS** | `FireflyService.getCachedAccountHistory()` with 1-hour TTL; `HistoryAnalysisService.analyzeAccountHistory()` with configurable threshold via `data/dominance-config.json`; test hist-5 confirms config override |
| AC-2 | History suggestion with confidence = dominant share | **PASS** | `HistoryAnalysisService` returns `confidence: dominance` when threshold met; test hist-1 validates clear winner scenario |
| AC-3 | AI classification with confidence field | **PASS** | `OpenAiService.classify()` returns `{ category, confidence, prompt, response }`; schema includes `confidence` in required array; test oai-1 validates schema |
| AC-4 | Review queue when history and AI disagree | **PASS** | `App.js` `#compareHistoryAndAi()` creates review entry; `PendingReviewService` persists to `data/pending-category-reviews.json`; tests queue-1 through queue-4 validate CRUD |
| AC-5 | **UI panel with pending items, accept/reject actions** | **FAIL** | **No review panel section in `public/index.html`; no "Pending Reviews" sidebar entry; no accept/reject buttons in UI** |
| AC-6 | Accept applies category; Reject dismisses | **PARTIAL** | REST API `/api/reviews/:id/accept` and `/api/reviews/:id/reject` endpoints exist and function correctly (validated via code inspection); however, UI buttons to trigger these endpoints are missing |
| AC-7 | Hard rules (account mapping, auto-cat) take precedence | **PASS** | `App.js` `#resolveCategory` checks account mapping (step 1) and auto-cat rules (step 2) before history analysis; tests case-1 and case-2 validate short-circuit behavior |
| AC-8 | User guide documents review workflow | **PASS** | `docs/user-guides/US-0004.md` exists with all six required sections (Purpose, Prerequisites, Usage, Example, Limitations, Troubleshooting) |

## Test results

```
# tests 18
# pass 18
# fail 0
# duration_ms 695
```

All tests pass, including:
- 5 history analysis tests (hist-1 through hist-5)
- 4 pending review queue tests (queue-1 through queue-4)
- 5 OpenAI service tests (oai-1 through oai-5)
- 4 resolveCategory regression tests (case-1 through case-4)

## Critical issue

### ISSUE-001: UI review panel missing (AC-5)

**Severity:** Critical
**Impact:** Operator cannot interact with review queue via UI; backend functionality is inaccessible to end users
**Evidence:**
- `public/index.html` (5804 lines) contains no review panel section
- No "Pending Reviews" sidebar entry found
- No accept/reject buttons in UI
- Grep for `review|Review|pending` in `public/index.html` returns only unrelated matches (job history review, preview sections)

**Expected (per AC-5):**
- Sidebar entry "Pending Reviews" with badge count
- Panel displaying pending items with:
  - Transaction summary (date, description, amount, account)
  - History category + confidence percentage
  - AI category + confidence percentage
  - Recommended choice
  - Accept and Reject buttons

**Actual:**
- No UI elements for review queue
- REST API endpoints exist but have no UI consumer

**Resolution required:**
Implement UI review panel in `public/index.html` per T-0030 task specification:
1. Add "Pending Reviews" sidebar entry with badge
2. Create review panel section with pending count + oldest age
3. Render review items with transaction details, history/AI badges, recommendation
4. Add Accept/Reject buttons that call `/api/reviews/:id/accept` and `/api/reviews/:id/reject`

## Backend validation (all PASS)

### History analysis service
- `HistoryAnalysisService.js` implements dominance calculation
- Default threshold 0.80, min transactions 10
- Configurable via `data/dominance-config.json`
- Returns `{ dominantCategory, dominance, confidence, categorizedCount, categoryCounts }`

### Firefly service history fetch
- `FireflyService.getCachedAccountHistory(accountId)` with 1-hour in-memory cache
- Paginated fetch via `getTransactionsByAccountId()`
- Cache TTL 3600000ms (1 hour)

### OpenAI service confidence
- `OpenAiService.classify()` schema extended with `confidence` field
- Returns `{ category, confidence, prompt, response }`
- Confidence mapping: UNKNOWN → 0, valid → parsed || 0.5, refusal → 0

### Pending review service
- `PendingReviewService.js` persists to `data/pending-category-reviews.json`
- CRUD operations: `addReview()`, `acceptReview()`, `rejectReview()`, `getPendingReviews()`, `getAllReviews()`
- Duplicate check on `transactionId` + `status='pending'`

### App.js integration
- `#resolveCategory` calls history analysis after word/keyword hints, before AI
- `#compareHistoryAndAi()` creates review entry when both history and AI present
- Recommendation logic: higher confidence wins; tie-break prefers history
- Returns `{ queuedForReview: true, reviewId }` when queued
- Hard rules (account mapping, auto-cat) short-circuit before history

### REST API endpoints
- `GET /api/reviews` — returns pending reviews
- `POST /api/reviews/:id/accept` — applies category to Firefly
- `POST /api/reviews/:id/reject` — dismisses without mutation

### User guide
- `docs/user-guides/US-0004.md` complete with six schema sections
- Documents review workflow, accept/reject actions, troubleshooting

## UAT verdict

**FAIL** — AC-5 not met. Backend implementation is complete and tested, but UI review panel is missing. Operator cannot access review queue functionality without UI.

## Recommendation

Return to execute phase to implement T-0030 (UI review panel). Re-run verify-work after UI implementation.

## Next phase

`/execute` — implement missing UI review panel (AC-5).
