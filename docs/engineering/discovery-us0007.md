# Discovery: US-0007 — Keyword mapping direct-assign mode

## Summary

Add an optional `directAssign` boolean (default `false`) to keyword mappings. When enabled *and* the transaction loosely matches a keyword, the pipeline **assigns the target category immediately** (`autoRule: 'category_mapping_direct'`) without calling OpenAI. When disabled, existing AI-hint behavior is preserved unchanged. Schema migration is additive-noop; existing mappings continue to work as AI hints.

## Impacted components

| Component | Changes required |
|---|---|
| `src/CategoryMappingService.js` | Add `getDirectAssignment(transaction)` method; accept `directAssign` in `addMapping` / `updateMapping`; persist flag unchanged via existing JSON writer. |
| `src/App.js` `#resolveCategory` (line ~1214) | Insert direct-assign check **at the AI-hint slot** (replaces logic, not position). If `getDirectAssignment()` returns `{assigned: true, ...}`, return `{category, autoRule: 'category_mapping_direct'...}`; else fall through to existing `aiHint` + OpenAI flow. |
| `public/index.html` keyword panel (line ~1220, 1252–1290) | Add per-mapping toggle checkbox "Direct assign (bypass AI)" in the mapping row template; wire into `saveCategoryMapping()` add/edit payloads. |
| `data/category-mappings.json` | Additive schema: optional `directAssign: bool` key per entry. Missing key ≡ false. |
| Tests (`tests/resolveCategory.test.js` + stubs) | New stubs: `makeDirectAssignCategoryMapping()`; new tests: direct-assign-match (OpenAI not called, `autoRule === 'category_mapping_direct'`), direct-assign-miss (falls through to AI), mixed (one mapping direct, another hint-only). Existing cases still green. |

## Integration points

1. **Data model**: additive boolean on mapping record. No new file/table. `saveMappings()` already writes full array via `JSON.stringify` — no serializer change needed.
2. **Pipeline step**: `#resolveCategory` precedence becomes **account mapping → auto-cat → [direct keyword assign OR AI hint] → OpenAI**. The `[direct assign OR AI hint]` slot is single-choice per transaction: direct-assign wins if any enabled mapping matches with `directAssign: true`; otherwise the existing AI-hint path runs unchanged.
3. **Admin endpoints**: existing `POST/PUT /api/category-mappings` already pass request body through to `addMapping`/`updateMapping`. Adding `directAssign` to body is sufficient — no new routes.
4. **UI state**: existing `renderCategoryMappings()` needs to render the toggle reflecting current `directAssign` value; existing `saveCategoryMapping()` already collects form fields — add a `directAssign` checkbox.
5. **Test harness**: use existing `App.createForTest({ categoryMappingService })` seam; add a new stub helper in `tests/fixtures/stubs.js`.

## Design / UX references

- **Toggle placement**: inside each mapping row (same row as the enable/disable checkbox). Consistent with `AccountCategoryMappingService` UI pattern (line 3398).
- **Label**: "Direct assign (bypass AI)" — matches intake wording and makes the consequence explicit.
- **HITL pattern**: Direct-assign = operator pre-decided rule (no review); the mapping is authoritative. Review queue (US-0004) is **not** invoked for direct-assign matches — same as account mapping behavior.
- **Default off**: preserves conservative operator expectation — existing mappings never change behavior until the operator flips the toggle.

## Schema backward compatibility

- **Additive**: `directAssign?: boolean`. `undefined` / missing ≡ `false`.
- **Reader contract**: `getDirectAssignment()` treats missing field as `false`. `getAiHint()` ignores the field entirely; mappings with `directAssign: true` are skipped by AI-hint path (so an enabled direct-assign match never also produces a description hint).
- **Writer contract**: `addMapping` stores `directAssign: Boolean(updates.directAssign ?? false)`; `updateMapping` merges via existing `{ ...old, ...updates }`.
- **No migration script required**: file is read-and-parsed on service startup; unknown keys are tolerated by `JSON.parse`.
- **Save coalesce**: existing `saveMappings()` writes full array — no per-item overwrite risk.

## Risks not covered by intake

1. **Admin CRUD field leakage**: `updateMapping` uses spread `...updates` — an attacker could POST arbitrary fields. Already mitigated by the fact that `loadMappings()` just re-reads what's in the file; but recommend explicitly whitelisting `directAssign` in `addMapping`/`updateMapping` to avoid polluting schema.
2. **Direct-assign target validity**: intake mentions verifying target category exists in Firefly — but direct-assign short-circuits before OpenAI, so there's no external confirmation step. Recommend: when `directAssign: true` and target category not found in current `categories` map, fall through to AI hint (same as account-mapping miss semantics in `#resolveCategory`). Document this in AC.
3. **UI rendering race**: `loadCategoryMappings()` and `loadCategoriesForKeywordMappings()` run in parallel at line 1727–1728. The toggle state only depends on the mapping data, not the categories list — no race risk. Safe.
4. **Test coverage gap for `updateMapping` round-trip**: `resolveCategory.test.js` doesn't test persistence; recommend one small round-trip test (new mapping with `directAssign: true` → save → reload → field preserved) in a new or existing CategoryMappingService test if one exists. If not, note for architecture phase.
5. **Direct-assign vs. auto-cat precedence interaction**: already resolved at intake (auto-cat wins — checked first). Confirm discovery agrees: yes, placement is **after** auto-cat. Correct.

## Test plan

Extend `tests/resolveCategory.test.js` + `tests/fixtures/stubs.js`:

- New stub: `makeDirectAssignCategoryMapping({ directAssign: bool, category, keywords })` returning object with `getAiHint()` and `getDirectAssignment()` methods.
- New case: `case-5-direct-assign-match` — OpenAI `classify` call count must be 0, `autoRule === 'category_mapping_direct'`, category equals target.
- New case: `case-6-direct-assign-miss` — no keyword match, falls through to OpenAI, `classify` called once.
- New case: `case-7-mixed` — multiple mappings; one has `directAssign: false`, another `directAssign: true`; only the direct one's keywords match → direct assign; only the hint's keywords match → AI hint path.
- Verify existing `case-1..4` still green (no hint change).
- Existing regression suite (18/18) unchanged at this phase; architecture will schedule task for test execution.

## Existing tests inventory

- `tests/resolveCategory.test.js` — 4 cases (account wins, auto-cat wins, AI wins, account beats AI).
- `tests/openAiService.test.js`
- `tests/pendingReviewService.test.js`
- `tests/historyAnalysisService.test.js`
- `tests/fixtures/{categories.js, transactions.js, stubs.js}`

Run command: `bash tests/run-tests.sh` (18/18 current baseline).

## What's out of scope

- Account mapping logic (DEC-0001 step 1).
- Auto-categorization rules (step 2).
- Review queue (US-0004) — direct-assign matches do not enter the review queue.
- Bulk editing of `directAssign` across many mappings (can be a future story if requested).
- Schema migration script — not needed.

## Recommendation to architecture phase

- Single-service change (CategoryMappingService) + App.js `#resolveCategory` insert + UI row-template extension + test stubs + 2–3 new test cases.
- No new files, no new services, no new endpoints.
- Recommend: whitelist `directAssign` in `addMapping`/`updateMapping`; fall-through on unknown target category in Firefly; document direct-assign's HITL semantics in the admin UI tooltip.

## Files to be considered by architecture

- `src/CategoryMappingService.js`
- `src/App.js`
- `public/index.html`
- `tests/resolveCategory.test.js`
- `tests/fixtures/stubs.js`
