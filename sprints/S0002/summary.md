# Summary — Sprint S0002 (BUG-0001)

## Context pack (refresh-context 2026-06-13)

- **Status:** released (`handoffs/releases/S0002-release-notes.md`)
- **Backlog:** BUG-0001 OPEN — operator AC-4 deferred (PAT dropdown UAT post-redeploy)
- **Segment:** terminal (`stop_reason=completed` at refresh-context)
- **Next:** US-0001 via `AUTO_BACKLOG_DRAIN=1`

## Goal

Fix category dropdown failure when Firefly returns HTML instead of JSON by hardening
`FireflyService.getCategories()`, surfacing structured errors through `GET /api/categories`,
and showing backend error text in mapping dropdowns.

## Completed

| Task | Status | Notes |
|------|--------|-------|
| T-0001 | done | `getCategories()` — `Accept: application/json` + content-type guard (pattern C) |
| T-0002 | done | `#getCategories` — sorted success payload; trimmed actionable `error` on failure |
| T-0003 | done | Dropdown loaders surface truncated `j.error` / `catJson.error` via `escapeHtml` |
| T-0004 | done | Mock-server verification below; live Firefly checks deferred to QA |

### Files changed

- `src/FireflyService.js` — content-type guard in `getCategories()`
- `src/App.js` — structured error passthrough + sorted categories
- `public/index.html` — `truncateDropdownError()` + dropdown error surfacing

## Manual verification (T-0004)

Executed 2026-06-13 via Node mock HTTP server (no live Firefly in execute environment).

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Healthy Firefly — dropdowns populate | **Deferred to QA** | Requires live Firefly + browser UI |
| 2 | Bad `FIREFLY_URL` — structured API error, no parse jargon | **PASS** | Mock HTML 200 → `{ success: false, error: "...FIREFLY_URL..." }`; no `Unexpected token` |
| 3 | Invalid PAT — structured error | **PASS** | Mock 401 → `FireflyException` with status 401 in message |
| 4 | Empty categories — `{ success: true, categories: [] }` | **PASS** | Mock JSON `{ data: [] }` → Map size 0 |
| 5 | Webhook / bulk regression | **Deferred to QA** | Requires live Firefly instance |

### Automated smoke (execute)

```
node mock-server tests (4/4 pass):
  html-200, valid-json, 401, empty-categories

App route proxy test (1/1 pass):
  GET /api/categories with HTML mock → success:false + FIREFLY_URL in error
```

### npm test

`npm test` — no test suite configured (expected; US-0001 blocked).

## Open items

- Operator AC-4: live Firefly PAT dropdown UAT + redeploy on port 3000 (closes BUG-0001)
- Deferred T-0004 row 5: webhook/bulk regression on operator host
