# Tasks — Sprint S0002 (BUG-0001)

| ID | Status | Title | Files | Acceptance mapping |
|----|--------|-------|-------|-------------------|
| T-0001 | done | FireflyService.getCategories() guard | `src/FireflyService.js` | BUG-0001 AC: Accept header + content-type validation |
| T-0002 | done | App.js #getCategories structured errors | `src/App.js` | BUG-0001 AC: structured `{ success: false, error }` (not parse jargon) |
| T-0003 | done | UI dropdown error surfacing (optional) | `public/index.html` | BUG-0001 AC: dropdown populate + no console parse error |
| T-0004 | done | Manual verification checklist | — | BUG-0001 AC: mock smoke pass; live Firefly deferred to QA |

## T-0001 — FireflyService.getCategories() guard

**Goal:** Copy pattern C from `createTransactions` / `updateTransactions` into
`getCategories()` only (DEC-0005).

**Requirements:**

1. Add `Accept: 'application/json'` to fetch headers (keep Bearer auth).
2. After `response.ok` check, read `content-type` (lowercase).
3. If content-type includes `json`: parse JSON and build Map as today.
4. Else: read body as text once; optional trim heuristic (`{` / `[` → try JSON.parse).
5. On non-JSON: throw `FireflyException` with message mentioning **FIREFLY_URL**
   and **PAT** (500-char body snippet max).
6. Do **not** introduce shared `#fetchJson` helper.

**Done when:** Misconfigured Firefly URL returns actionable `FireflyException`, not
`SyntaxError` from blind `response.json()`.

## T-0002 — App.js #getCategories structured errors

**Goal:** Preserve existing route contract; ensure catch returns operator-actionable
`error.message` from `FireflyException`.

**Requirements:**

1. No route signature change (`GET /api/categories`).
2. Success: `{ success: true, categories: [...] }` (sorted names).
3. Failure: `{ success: false, error: "<actionable message>" }` — never raw
   `Unexpected token <` strings.
4. Log full error server-side; return trimmed message to client.
5. Optional HTTP 502 not required (default remains 200 + `{ success: false }`).

**Done when:** `curl /api/categories` with bad Firefly config returns structured JSON error.

## T-0003 — UI dropdown error surfacing (optional polish)

**Goal:** When backend returns `{ success: false, error }`, show message in dropdown
instead of generic "Failed to load categories".

**Requirements:**

1. `loadCategoriesForKeywordMappings` (~3054): on `!j.success`, set `#mappingTargetCategory`
   option text from `j.error` (truncate ~120 chars); return without throw.
2. `loadAccountsAndCategoriesForAccountMappings` (~3163): on `!catJson.success`, set
   `#acmTargetCategory` option from `catJson.error`; keep account path independent.
3. Use existing `escapeHtml` if available; avoid console.error on expected misconfiguration.
4. Healthy Firefly: dropdowns populate as before.

**Done when:** Bad Firefly config shows backend error in dropdown; no parse exception in console.

## T-0004 — Manual verification checklist

**Goal:** Execute architecture # BUG-0001 manual checklist; record results in
`sprints/S0002/summary.md` and UAT placeholders.

**Checklist:**

1. Healthy Firefly: keyword-mapping + account-mapping dropdowns populate.
2. Bad `FIREFLY_URL`: `GET /api/categories` → `{ success: false, error: "...FIREFLY_URL..." }`;
   no `Unexpected token <` in browser console.
3. Invalid PAT: structured error (401 or non-JSON guard).
4. Empty categories: `{ success: true, categories: [] }`.
5. Regression: test webhook and bulk job still resolve categories when Firefly healthy.

**Done when:** All five checks pass or documented with env blockers.
