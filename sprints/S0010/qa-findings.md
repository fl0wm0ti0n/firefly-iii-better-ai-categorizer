# QA Findings: US-0007 — Keyword mapping direct-assign mode (Sprint S0010)

**Phase:** qa
**Role:** qa (independent subagent)
**Date:** 2026-06-28
**Verdict:** PASS

---

## Regression test run

```
TAP version 13
# tests 21
# suites 0
# pass 21
# fail 0
# cancelled 0
# skipped 0
# duration_ms 631.08317
```

Exit code: 0. 21/21 pass. Includes new cases case-5-direct-assign-match, case-6-direct-assign-miss, case-7-mixed.

---

## AC verification

### AC-1 — `directAssign` field in data model

**Verdict: PASS**

Evidence: `src/CategoryMappingService.js`

- Line 8: `#MAPPING_FIELDS = new Set(['name', 'targetCategory', 'keywords', 'enabled', 'directAssign'])` — field whitelisted.
- Lines 175 (`addMapping`): `directAssign: Boolean(clean.directAssign ?? false)` — defaults to `false` on creation.
- Lines 199-201 (`updateMapping`): coerces to `Boolean(clean.directAssign)` when present.
- `data/category-mappings.json`: existing mappings have no `directAssign` field, consistent with additive/optional semantics (absent ≡ false).

### AC-2 — `directAssign: true` + keyword match → direct assign, no OpenAI

**Verdict: PASS**

Evidence: `src/App.js` lines 1215–1228:

```js
const directAssignment = this.#categoryMappingService.getDirectAssignment(transaction);
if (directAssignment?.assigned && categories.has(directAssignment.category)) {
    return {
        category: directAssignment.category,
        prompt: directAssignment.reason,
        response: `Direct-assign: "${directAssignment.category}" via keyword mapping "${directAssignment.mappingName}"`,
        autoRule: 'category_mapping_direct',
    };
}
```

Returns immediately with `autoRule: 'category_mapping_direct'`, skipping `getAiHint` and OpenAI classify. Confirmed by test case-5-direct-assign-match (OPENAI classify `callCount === 0`).

### AC-3 — `directAssign: false`/undefined → AI-hint preserved

**Verdict: PASS**

Evidence:

- `src/CategoryMappingService.js` line 151: `if (!mapping.directAssign) continue;` — mappings without directAssign=true are skipped by `getDirectAssignment`.
- `src/App.js` lines 1236–1245: existing `getAiHint` call remains untouched after the direct-assign block. When no direct match, control falls through to AI-hint.
- Test case-7-mixed confirms one direct mapping bypasses while a hint-only mapping still provides AI hints.
- Tests case-3-ai-wins and case-6-direct-assign-miss confirm fall-through to OpenAI when no direct match.

### AC-4 — Pipeline placement at AI-hint slot (DEC-0022)

**Verdict: PASS**

Evidence: `src/App.js` `#resolveCategory()` precedence order:

1. Lines 1187–1200: Account mapping (step 1)
2. Lines 1202–1210: Auto-categorization (step 2)
3. Lines 1215–1228: **Direct-assign (US-0007, new — inserts at former AI-hint position)**
4. Lines 1237–1245: AI-hint (existing, preserved when direct-assign doesn't fire)
5. Lines 1248+: History dominance → OpenAI (remaining pipeline)

Insertion is at the AI-hint slot as specified by DEC-0022. Account mapping and auto-categorization retain first-tier precedence.

### AC-5 — Admin UI toggle

**Verdict: PASS**

Evidence: `public/index.html`

- Lines 1271–1277: Add/edit form has `<input type="checkbox" id="mapping-direct-assign">` with label "Direct assign (bypass AI)" and helper text.
- Line 3651: `saveCategoryMapping` includes `directAssign: document.getElementById('mapping-direct-assign').checked` in POST/PUT payload.
- Lines 3748–3771: `renderCategoryMappings` shows a purple "DIRECT" pill badge next to mapping name when `mapping.directAssign` is truthy.
- Lines 3771, 3787–3796: `editCategoryMapping` passes and pre-fills the `directAssign` checkbox from existing mapping data.

### AC-6 — Backward compatible (existing mappings without `directAssign` still work)

**Verdict: PASS**

Evidence:

- `data/category-mappings.json`: all 8 existing mappings have no `directAssign` field.
- `src/CategoryMappingService.js` line 151: `if (!mapping.directAssign) continue;` — undefined is falsy, so `getDirectAssignment` skips them.
- `getAiHint` (lines 109–133) does not reference `directAssign` at all — behavior unchanged.
- `addMapping` default `Boolean(clean.directAssign ?? false)` = false — new mappings default to hint mode.
- No migration script required (additive boolean field).

### AC-7 — Regression suite passes

**Verdict: PASS**

`bash tests/run-tests.sh`: 21/21 pass, exit 0. Suite grew from 18 (pre-US-0007) to 21 with three new cases:

- case-5-direct-assign-match: direct-assign fires, no OpenAI call
- case-6-direct-assign-miss: no direct match → AI-hint / OpenAI path
- case-7-mixed: combination of direct and hint-only mappings

All 18 pre-existing tests remain green (no behavior regression).

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| AC-1 | `directAssign` field in data model | PASS |
| AC-2 | `directAssign: true` + match → direct assign, no OpenAI | PASS |
| AC-3 | `directAssign: false`/undefined → AI-hint preserved | PASS |
| AC-4 | Pipeline placement at AI-hint slot | PASS |
| AC-5 | Admin UI toggle | PASS |
| AC-6 | Backward compatible | PASS |
| AC-7 | Regression tests pass (21/21) | PASS |

**Overall verdict: PASS — recommend advance to verify-work.**

## Blockers

None.
