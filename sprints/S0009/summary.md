# Sprint S0009 Summary — BUG-0002 Pending Reviews 404 Fix

**Sprint ID:** S0009  
**Bug:** BUG-0002 (Pending Reviews endpoint returns HTTP 404 HTML → `loadPendingReviews` JSON parse error)  
**Status:** Executed  
**Date:** 2026-06-23  
**Orchestrator Run ID:** auto-20260623T235900Z-bug0002

## Sprint Goal

Close BUG-0002 through a three-tier fix per DEC-0020: rebuild and recreate the production `categorizer` container from the parent Firefly stack, apply defensive fetch/content-type handling to `loadPendingReviews` in `public/index.html`, run the existing regression suite, and verify all four BUG-0002 acceptance criteria.

## Tasks Planned

4 tasks (T-0050 through T-0053):

- **T-0050**: Production redeploy — run `docker compose -f /workdir/firefly/docker-compose.yml up -d --build --force-recreate categorizer` and verify `/api/reviews` returns JSON 200
- **T-0051**: Defensive UI hardening — add `response.ok` + content-type guard to `loadPendingReviews`; surface structured error via `showToast`
- **T-0052**: Regression tests — run existing test harness and confirm 18/18 pass after the UI change
- **T-0053**: Verify BUG-0002 acceptance criteria — check all 4 ACs

## Execution Order

```
Phase 1: Parallel (no mandatory execution dependencies)
├── T-0050: Production redeploy                ← AC-1, AC-2
└── T-0051: Defensive UI hardening             ← AC-1, AC-3

Phase 2: Validation (depends on Phase 1)
├── T-0052: Regression test run                  ← AC-1 stability
└── T-0053: BUG-0002 AC verification            ← AC-1 through AC-4
```

> Note: T-0050 and T-0051 are logically parallel because the live `public/` mount means the UI change can take effect without an image rebuild; however, AC-4 (panel renders real review data) requires T-0050 to be complete.

## Acceptance Criteria Mapping

| AC | Task(s) | Description |
|----|---------|-------------|
| AC-1 | T-0050, T-0051 | Page load — no `GET /api/reviews 404` and no JSON `SyntaxError` from `loadPendingReviews` |
| AC-2 | T-0050 | `GET /api/reviews` returns HTTP 200 JSON `{ success: true, reviews: [...] }` (or structured `{ success: false, error: ... }`) |
| AC-3 | T-0051 | Structured error response is surfaced in the UI; `SyntaxError` on HTML responses eliminated |
| AC-4 | T-0053 | Pending Reviews panel renders items with transaction summary, history + AI categories with confidence, recommended choice, and Accept/Reject actions |

## Architecture Decisions Implemented

- **DEC-0020**: Three-tier stale-image remediation + defensive fetch handling for BUG-0002

## Scope Out (not in sprint)

- New `/api/version` or image-digest probe (tertiary recommendation; defer to follow-up quick item)
- Production Traefik or reverse-proxy changes
- Backend code changes (`src/App.js` already registers `/api/reviews`)
- New test cases specifically for `loadPendingReviews` UI behavior

## Risks Mitigated

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| RA-1 | Cached image leaves route missing | High | Internal container probe before declaring success |
| RA-2 | Basic Auth blocks external probe | Medium | Use authenticated browser session or supply credentials |
| RA-3 | UI hardening masks backend regressions | Low | Keep `console.error`; toast is user-friendly only |
| RA-4 | Future `src/` changes missed due to `restart: unless-stopped` | High | Runbook rule: any `src/` change requires `--build --force-recreate` |
| RA-5 | Environment drift after redeploy | Medium | Regression pass + post-deploy smoke `/api/reviews`, `/api/categories`, `/api/version` |

## Sprint Size

- 4 tasks (under SPRINT_MAX_TASKS=12 cap)
- No split required

## References

- Architecture: `docs/engineering/architecture.md` (BUG-0002 section)
- Decision: `decisions/DEC-0020.md`
- Research: `docs/engineering/research.md` (R-0024)
- Acceptance: `docs/product/acceptance.md` (BUG-0002 ACs)
- Backlog: `docs/product/backlog.md` (BUG-0002 entry)
- Handoff: `handoffs/po_to_tl.md`
