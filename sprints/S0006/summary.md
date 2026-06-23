# Sprint S0006 Summary

## Sprint metadata

| Field | Value |
|-------|-------|
| Sprint ID | S0006 |
| Work item | US-0004 |
| Goal | Account history dominance suggestions with AI comparison and review queue |
| Task count | 8 required |
| Sprint cap | 12 (SPRINT_MAX_TASKS) |
| Split required | No |
| Orchestrator run | auto-20260614T161000Z-us0003 |

## Task roster

| ID | Title | Depends on | AC mapping |
|----|-------|-----------|------------|
| T-0024 | `FireflyService.getAccountHistory()` with pagination + 1-hour cache | — | DEC-0011, AC-1 |
| T-0025 | Dominance calculator module with 80% threshold + 10 min tx | — | DEC-0012, AC-1, AC-2 |
| T-0026 | Extend `OpenAiService.classify()` with confidence field | — | DEC-0014, AC-3 |
| T-0027 | `App.js` `#resolveCategory` integration — history + AI comparison + queue | T-0024, T-0025, T-0026, T-0028 | AC-4, AC-7 |
| T-0028 | Review queue persistence — `data/pending-category-reviews.json` | — | DEC-0013, AC-4 |
| T-0029 | REST API endpoints — `GET /api/reviews`, `POST` accept/reject | T-0028 | AC-5, AC-6 |
| T-0030 | UI review panel — sidebar entry, transaction summary, accept/reject buttons | T-0029 | AC-5, AC-6 |
| T-0031 | Tests — dominance algorithm, queue persistence, API endpoints, UI smoke test | T-0025, T-0028, T-0027 | AC-1 through AC-8 |

## Dependency chain

```
T-0024 ─┐
T-0025 ─┤
        ├→ T-0027 → T-0031
T-0026 ─┤
        │
T-0028 → T-0029 → T-0030
```

## AC coverage matrix

| AC | Covered by |
|----|-----------|
| AC-1 | T-0024 (history fetch), T-0025 (dominance calc) |
| AC-2 | T-0025 (confidence = dominance) |
| AC-3 | T-0026 (confidence field in classify) |
| AC-4 | T-0027 (queue integration), T-0028 (queue persistence) |
| AC-5 | T-0029 (REST API), T-0030 (UI panel) |
| AC-6 | T-0029 (accept/reject endpoints), T-0030 (UI buttons) |
| AC-7 | T-0027 (hard rules short-circuit before history) |
| AC-8 | T-0031 (tests cover all AC) |

## Key decisions

- **DEC-0011:** 1-hour in-memory cache for account history — simple; acceptable staleness.
- **DEC-0012:** 80% dominance + 10 min tx — conservative; configurable via `data/dominance-config.json`.
- **DEC-0013:** In-memory + write-through queue persistence — single-process; async serialization.
- **DEC-0014:** Extend `classify()` schema with confidence field — single method; preserve strict mode.
- **R-0018:** Account-scoped pagination + 1-hour in-memory cache.
- **R-0019:** OpenAiService confidence extension (schema + prompt).
- **R-0020:** Dominance algorithm with 80% default threshold + 10-transaction minimum.
- **R-0021:** Pending review queue + single-process async serialization + REST endpoints + UI patterns.

## Risks

| ID | Risk | Mitigation |
|----|------|-----------|
| H1 | Cache cold-start latency after restart | First webhook pays 1–10 API calls; acceptable for personal finance volume |
| H2 | Review queue grows unbounded if operator ignores | Sidebar badge + oldest-age warning |
| H3 | Model confidence is heuristic (not calibrated) | Display-only, not decision-critical |
| H4 | Tie-breaking non-determinism in dominance | Document first-encountered behavior |
| H5 | Large queue (1000+ items) slows JSON parse | Paginate UI; future archive |
| H6 | Review accepted after transaction deleted in Firefly | Surface 404 in UI |
| H7 | Test stub updates for confidence field | Update all 4 regression stubs + new unit tests |
| H8 | UI complexity in monolithic `public/index.html` | Isolate review panel as self-contained section |

## Task completion status

| ID | Status | Notes |
|----|--------|-------|
| T-0024 | done | `FireflyService.getAccountHistory()` with pagination + 1-hour cache |
| T-0025 | done | Dominance calculator module with 80% threshold + 10 min tx |
| T-0026 | done | Extend `OpenAiService.classify()` with confidence field |
| T-0027 | done | `App.js` `#resolveCategory` integration — history + AI comparison + queue |
| T-0028 | done | Review queue persistence — `data/pending-category-reviews.json` |
| T-0029 | done | REST API endpoints — `GET /api/reviews`, `POST` accept/reject |
| T-0030 | done | UI review panel — sidebar entry, transaction summary, accept/reject buttons (fixed 2026-06-14: added panel-reviews section, sidebar registration, loadPendingReviews/acceptReview/rejectReview functions) |
| T-0031 | done | Tests — dominance algorithm, queue persistence, API endpoints, UI smoke test |

## Definition of Done

- [x] All 8 tasks done (T-0024–T-0031)
- [x] `bash tests/run-tests.sh` exits 0
- [x] `tests/resolveCategory.test.js` 4/4 unchanged (with confidence field in stubs)
- [x] `tests/historyAnalysisService.test.js` 5 cases pass (hist-1–hist-5)
- [x] `tests/pendingReviewService.test.js` 4 cases pass (queue-1–queue-4)
- [x] `classify()` returns `{ category, confidence, prompt, response }`
- [x] `#resolveCategory` queues for review when history or AI present
- [x] Hard rules (account mapping, auto-cat) still short-circuit before history
- [x] REST API `/api/reviews` + accept/reject endpoints functional
- [x] UI review panel displays pending items with accept/reject actions
- [x] `/plan-verify` coverage recorded
- [x] User guide created: `docs/user-guides/US-0004.md` (GAP-001 addressed)

## References

- `docs/engineering/architecture.md` (# US-0004)
- `decisions/DEC-0011.md`, `decisions/DEC-0012.md`, `decisions/DEC-0013.md`, `decisions/DEC-0014.md`
- `docs/engineering/research.md` (R-0018–R-0021)
- `docs/product/acceptance.md` (US-0004 AC-1–AC-8)
