# Sprint S0002 — BUG-0001

ID: S0002  
Work item: BUG-0001  
Orchestrator run: `auto-20260613T122818Z-bug0001`

## Goal

Fix category dropdown JSON parse failure when Firefly returns HTML instead of JSON:API.
Harden `FireflyService.getCategories()` per architecture # BUG-0001 and DEC-0005;
ensure `GET /api/categories` returns structured `{ success, error }`; optionally
surface backend errors in admin UI dropdowns.

## Scope

| In scope | Out of scope |
|----------|--------------|
| `FireflyService.getCategories()` Accept header + content-type guard (pattern C) | Shared `#fetchJson` helper (DEC-0005) |
| `App.js #getCategories` error passthrough | Sibling methods (`getTags`, etc.) — post-US-0001 |
| Optional UI: `loadCategoriesForKeywordMappings`, `loadAccountsAndCategoriesForAccountMappings` | HTTP 502 mapping (optional, not required) |
| Manual verification checklist (architecture # BUG-0001) | Automated test harness (US-0001) |

## Tasks

| ID | Title | Required |
|----|-------|----------|
| T-0001 | FireflyService.getCategories() guard | Yes |
| T-0002 | App.js #getCategories structured errors | Yes |
| T-0003 | UI dropdown error surfacing (optional polish) | Optional |
| T-0004 | Manual verification checklist | Yes |

## Risks

- **B1:** Fix only `getCategories()` — document follow-up for R-0007 pattern A/B methods.
- **B2:** Misleading content-type with HTML body — trim heuristic + 500-char snippet.
- **B4:** No automated tests until US-0001 — manual QA gates acceptance.

## Definition of Done

- All BUG-0001 acceptance rows in `docs/product/acceptance.md` covered by tasks T-0001–T-0004.
- Manual checklist (T-0004) executed and recorded in sprint summary / UAT.
- No `Unexpected token <` in browser console on page load when Firefly misconfigured.
- `/plan-verify` coverage recorded in `plan-verify.json` (next phase).

## References

- `docs/engineering/architecture.md` (# BUG-0001)
- `decisions/DEC-0005.md`
- `docs/engineering/research.md` (R-0001, R-0006, R-0007)
- `docs/product/acceptance.md` (BUG-0001 rows)
