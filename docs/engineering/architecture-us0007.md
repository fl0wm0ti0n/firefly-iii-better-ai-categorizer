# Architecture — US-0007 Keyword mapping direct-assign mode

- **phase_id**: architecture
- **role**: tech-lead
- **work_item**: US-0007
- **fresh_context_marker**: architecture-us0007-keyword-direct-assign
- **timestamp**: 2026-06-28T14:25:00+02:00
- **status**: accepted
- **decisions referenced**:
  - **DEC-0021** — Additive `directAssign?: boolean` schema, no migration
  - **DEC-0022** — Pipeline placement at the AI-hint slot (intake option c)

## 1. Summary

Add an opt-in `directAssign` boolean to each keyword mapping. When `true` **and** the transaction loosely matches an enabled mapping's keyword, the pipeline short-circuits before OpenAI with `autoRule: 'category_mapping_direct'` and returns the target category directly. When `false`, `undefined`, or no match, behavior is unchanged (AI-hint path continues to OpenAI).

This feature is a single vertical slice across five surfaces:

1. `src/CategoryMappingService.js` — new `getDirectAssignment(transaction)` + CRUD field support.
2. `src/App.js` `#resolveCategory()` — insert direct-assign call at the AI-hint slot (line 1214 of current code).
3. `public/index.html` keyword mapping panel — per-row toggle + form checkbox.
4. `data/category-mappings.json` — additive schema, no migration.
5. `tests/resolveCategory.test.js` + `tests/fixtures/stubs.js` — 3 new cases + stub refactor.

No new files, no new services, no new endpoints.

## 2. Decisions

| ID | Topic | Status |
|---|---|---|
| DEC-0021 | Additive `directAssign?: boolean`; missing ≡ `false`; no migration script | Accepted |
| DEC-0022 | Pipeline placement at AI-hint slot (intake option c) | Accepted |

Full records: `decisions/DEC-0021.md`, `decisions/DEC-0022.md`. Both are bounded-scope decisions with a single clear alternative each. See decision records for full rationale; summaries below.

## 3. Component-by-component design

### 3.1 `src/CategoryMappingService.js`

#### 3.1.1 New method: `getDirectAssignment(transaction)`

Signature and return shape (mirrors `getAiHint` for consistency):

```js
getDirectAssignment(transaction) {
    const firstTx = transaction?.attributes?.transactions?.[0];
    if (!firstTx) return { assigned: false };

    const searchText = this.#getTransactionSearchText(firstTx);

    for (const mapping of this.#mappings) {
        if (!mapping.enabled) continue;
        if (!mapping.directAssign) continue;   // skip AI-hint-style rules

        for (const keyword of mapping.keywords) {
            if (!this.#looselyMatchesKeyword(keyword, searchText)) continue;
            return {
                assigned: true,
                category: mapping.targetCategory,
                mappingName: mapping.name,
                matchedKeyword: keyword,
                reason: `Direct-assign from mapping "${mapping.name}" via keyword "${keyword}" → ${mapping.targetCategory}`,
            };
        }
    }
    return { assigned: false };
}
```

Key behavior notes:

- Return shape is an object (not `null`) on purpose: the App-side call site does not need to guard against `null?.assigned` and the existing `account_category_mapping` returns `null`-ish; we stay consistent with the `AccountCategoryMappingService.categorizeTransaction()` contract by returning `{assigned: false}` on no-match so the App call site has a trivial predicate.
- Disabled mappings and mappings without `directAssign: true` are **skipped** by the outer loop. `getAiHint()` (unchanged) still iterates all enabled mappings regardless of `directAssign`. This produces a clean separation: `getAiHint` is the "hint" path; `getDirectAssignment` is the "assign" path.
- Reuses the existing `#looselyMatchesKeyword` algorithm (line 86). No algorithm change.
- Does **not** perform category-existence validation here. Validation happens in `App.#resolveCategory()`. See §3.2 for the fall-through rule.

#### 3.1.2 CRUD: `addMapping` / `updateMapping` whitelist

Current `updateMapping` (line 150) uses spread-merge from `req.body` via `#onUpdateCategoryMapping`. This allows arbitrary field injection from the wire. To satisfy the risk identified in discovery (admin CRUD field leakage), we introduce a whitelist:

Add to `CategoryMappingService.js`:

```js
#MAPPING_FIELDS = new Set(['name', 'targetCategory', 'keywords', 'enabled', 'directAssign']);

#stripFields(raw) {
    const out = {};
    for (const k of this.#MAPPING_FIELDS) {
        if (k in raw) out[k] = raw[k];
    }
    return out;
}
```

Update `addMapping()`:

```js
addMapping(mappingData) {
    const clean = this.#stripFields(mappingData);
    const mapping = {
        id: uuid(),
        name: clean.name || 'New Mapping',
        targetCategory: clean.targetCategory || '',
        keywords: this.#parseKeywords(clean.keywords || ''),
        enabled: clean.enabled !== false,
        directAssign: Boolean(clean.directAssign ?? false),
        created: new Date().toISOString(),
    };
    this.#mappings.push(mapping);
    this.saveMappings();
    // ...
}
```

Update `updateMapping()`:

```js
updateMapping(id, updates) {
    const index = this.#mappings.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Mapping not found');
    const clean = this.#stripFields(updates);
    const current = this.#mappings[index];
    const mapping = { ...current, ...clean };
    if ('keywords' in clean) mapping.keywords = this.#parseKeywords(clean.keywords);
    if ('directAssign' in clean) mapping.directAssign = Boolean(clean.directAssign);
    mapping.updated = new Date().toISOString();
    this.#mappings[index] = mapping;
    this.saveMappings();
    // ...
}
```

**Risk**: this is a slight behavior change — previously arbitrary extra keys were persisted; now they are dropped. Mitigated by the fact that the frontend only ever posts the whitelisted fields, and the only "extra" fields currently in the file are `created` / `updated` (which are managed server-side, not via the update endpoint). **Backward-compatible at the API layer.**

#### 3.1.3 `getAiHint` unchanged except for direct-assign skip (optional)

Per discovery recommendation, `getAiHint` should skip mappings with `directAssign: true` so that a direct-assign mapping never also produces an AI hint for the same keyword. **Accept at this time**: when a mapping has `directAssign: true` AND the keyword matches, direct-assign wins in the pipeline, so any subsequent `getAiHint` call is unreachable anyway. But for **safety when the direct-assign target is invalid** (fall-through scenario, §3.2), we want `getAiHint` to still see the mapping. Therefore we **do NOT** skip in `getAiHint`; the App-side fall-through logic handles this by calling `getDirectAssignment` first, and on miss (or target-not-found) calling `getAiHint`. The two calls remain independent.

### 3.2 `src/App.js` — `#resolveCategory()` insertion

Current code at 1212–1222:

```js
let mappedDescription = this.#wordMapping.applyMappings(description);
const mappedDestinationName = this.#wordMapping.applyMappings(destinationName);
const aiHint = this.#categoryMappingService.getAiHint(transaction);
const classifyOptions = {};
if (aiHint?.descriptionHint) {
    mappedDescription = aiHint.descriptionHint;
    classifyOptions.suggestedCategory = aiHint.suggestedCategory;
    // ...
}
```

Insertion plan — replace the AI-hint slot **before** the history analysis and OpenAI call:

```js
let mappedDescription = this.#wordMapping.applyMappings(description);
const mappedDestinationName = this.#wordMapping.applyMappings(destinationName);

// US-0007: Direct-assign check at the AI-hint slot
const directAssignment = this.#categoryMappingService.getDirectAssignment(transaction);
if (directAssignment?.assigned && categories.has(directAssignment.category)) {
    console.info(
        `🎯 Direct-assign: "${description}" → category "${directAssignment.category}" ` +
        `(mapping "${directAssignment.mappingName}", keyword "${directAssignment.matchedKeyword}")`
    );
    return {
        category: directAssignment.category,
        prompt: directAssignment.reason,
        response: `Direct-assign: "${directAssignment.category}" via keyword mapping "${directAssignment.mappingName}"`,
        autoRule: 'category_mapping_direct',
    };
}
if (directAssignment?.assigned && !categories.has(directAssignment.category)) {
    console.warn(
        `⚠️ Direct-assign matched mapping "${directAssignment.mappingName}" but category ` +
        `"${directAssignment.category}" was not found in Firefly — falling through to AI hint`
    );
}

// Existing AI-hint path (unchanged)
const aiHint = this.#categoryMappingService.getAiHint(transaction);
const classifyOptions = {};
if (aiHint?.descriptionHint) {
    mappedDescription = aiHint.descriptionHint;
    classifyOptions.suggestedCategory = aiHint.suggestedCategory;
    console.info(
        `🔍 AI keyword hint: "${description}" → description "${aiHint.descriptionHint}" (mapping "${aiHint.mappingName}")`
    );
}
```

**Fall-through rule on unknown target category**: when `directAssignment.assigned === true` but `categories.has(directAssignment.category) === false`, we fall through to the existing AI-hint path. This mirrors the existing account-mapping miss semantics at line 1197–1200 (warn + skip, fall through). See DEC-0022 §3 for rationale.

The history analysis block (line 1224+) and OpenAI call (line 1245+) are **unchanged**. They are simply unreachable when direct-assign returns early — which is the desired behavior per AC-2 (no AI, no history comparison, authoritative assignment).

### 3.3 `public/index.html` — UI changes

Three small UI additions in the keyword mappings panel:

1. **Per-row toggle** in `renderCategoryMappings()` (line 3726+). Add a "Direct assign" label or inline checkbox-style badge in the mapping stats line. **Decision: read-only indicator + inline toggle switch**. The existing enabled/disabled toggle remains the gate; the direct-assign toggle is an opt-in flag within any enabled mapping.

2. **Form checkbox** for `directAssign`. Add `<input type="checkbox" id="mappingDirectAssign">` to the add/edit form. Update `saveCategoryMapping()` to include `directAssign: mappingDirectAssign.checked` in the payload. Update `editCategoryMapping()` to accept a 5th `directAssign` argument and populate the checkbox.

3. **Visual indicator**: mappings with `directAssign: true` get a small "DIRECT" pill next to the mapping name in `renderCategoryMappings()`.

Detailed placement:

#### `renderCategoryMappings()` change (line ~3740)

```js
<div class="category-mapping-header">
    <span class="category-mapping-name">
        ${mapping.name}
        ${mapping.directAssign ? '<span class="badge badge-direct" title="Direct assign: bypasses AI">DIRECT</span>' : ''}
    </span>
    <span class="category-mapping-category">${mapping.targetCategory}</span>
</div>
```

#### Add form: new checkbox row (after the keywords input)

```html
<div class="form-group">
    <label class="checkbox-label">
        <input type="checkbox" id="mappingDirectAssign">
        <span>Direct assign (bypass AI)</span>
    </label>
    <small style="color: var(--text-secondary); font-size: 0.85em;">
        When enabled, transactions matching these keywords are assigned the target category
        immediately without calling OpenAI.
    </small>
</div>
```

#### `saveCategoryMapping()` payload change (line 3636)

```js
const mappingData = {
    name: mappingName.value.trim(),
    targetCategory: mappingTargetCategory.value.trim(),
    keywords: mappingKeywords.value.trim(),
    directAssign: document.getElementById('mappingDirectAssign').checked,
};
```

#### `editCategoryMapping()` change (line 3774)

Extend signature to 5 args and set the checkbox:

```js
window.editCategoryMapping = function(id, name, targetCategory, keywords, directAssign) {
    // ...
    document.getElementById('mappingDirectAssign').checked = Boolean(directAssign);
    // ...
};
```

Call site in `renderCategoryMappings()` line 3758 must pass `mapping.directAssign`:

```js
onclick="editCategoryMapping('${mapping.id}', '${mapping.name}', '${mapping.targetCategory}', '${keywordsString}', ${!!mapping.directAssign})"
```

### 3.4 `data/category-mappings.json` — additive schema

- Additive optional key `directAssign?: boolean` per entry.
- Missing key or `directAssign: false` → AI-hint behavior.
- `directAssign: true` → direct-assign mode.
- Existing entries in the current file have no `directAssign` key → continue as AI-hint (AC-6 satisfied).
- No migration script required — `JSON.parse` tolerates unknown/missing keys at startup.

### 3.5 Tests — `tests/resolveCategory.test.js` + `tests/fixtures/stubs.js`

#### Stub refactor in `tests/fixtures/stubs.js`

Add a new `makeCategoryMappingStub({ directAssignment, aiHint })` helper that exposes both `getDirectAssignment()` and `getAiHint()`. Keep `makeNoHintCategoryMapping()` backward-compatible by having it also expose `getDirectAssignment: () => ({ assigned: false })` so existing 4 cases (`case-1..4`) continue to work without modification.

```js
export function makeNoHintCategoryMapping() {
    return {
        getAiHint: () => null,
        getDirectAssignment: () => ({ assigned: false }),
    };
}

export function makeCategoryMappingStub({
    directAssignment = { assigned: false },
    aiHint = null,
} = {}) {
    return {
        getAiHint: () => aiHint,
        getDirectAssignment: () => directAssignment,
    };
}
```

#### Test cases to add

Three new cases in `tests/resolveCategory.test.js`:

1. **`case-5-direct-assign-match`**
   - Stub: account=null, autoCat=null, categoryMapping with `assigned: true, category: 'Groceries', mappingName: 'Supermarkets', matchedKeyword: 'interspar'`.
   - Transaction: description containing "interspar".
   - Assert: `result.category === 'Groceries'`, `result.autoRule === 'category_mapping_direct'`, `classify.mock.callCount() === 0` (OpenAI never called).
   - Categories map must include `'Groceries'`.

2. **`case-6-direct-assign-miss`**
   - Stub: account=null, autoCat=null, categoryMapping with `assigned: false` (no direct-assign enabled mapping matched).
   - Transaction: description "RANDOM STORE".
   - Assert: OpenAI classify called once, `result.autoRule` differs from `'category_mapping_direct'`.

3. **`case-7-mixed`**
   - Two logical mappings simulated by two sequential calls (one direct enabled, one AI-hint only). The stub simulates a scenario where:
     - For a **first transaction** with keyword matching the direct-assign mapping → `case-5`-like behavior (direct wins).
     - For a **second transaction** with a different keyword matching only the hint mapping → AI-hint path runs.
   - Asserts cover that the two modes coexist without interference.

Existing cases `case-1..4` must remain green since `getDirectAssignment: () => ({ assigned: false })` is now part of the stub contract.

## 4. Pipeline precedence (resolved)

Final order after US-0007:

1. **Step 1 — Account → Category Mapping** (highest tier, line 1187–1200, unchanged)
2. **Step 2 — Auto-categorization** (line 1202–1210, unchanged)
3. **Step 3 — [Direct Keyword Assign OR AI Hint]** (line 1214 area):
   - If `getDirectAssignment` returns `{assigned: true}` AND target category exists → **assign** (new)
   - Else → existing AI-hint path (unchanged)
4. **Step 4 — History analysis** (line 1224–1243, unchanged, unreachable on direct-assign)
5. **Step 5 — OpenAI classify** (line 1245–1253, unchanged, unreachable on direct-assign)
6. **Step 6 — History-vs-AI comparison, review queue** (US-0004, unchanged)

This preserves DEC-0001 (single pipeline), DEC-0011–DEC-0014 (US-0004 history/review), and the account-mapping/auto-cat precedence guarantees.

## 5. Risks and mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Operator creates a direct-assign mapping with invalid target category | Low | `#resolveCategory` falls through to AI hint with a warning log, same behavior as account-mapping miss |
| R2 | Spread-merge in `updateMapping` allows arbitrary field injection | Medium | Whitelist fields via `#MAPPING_FIELDS` (this architecture). See DEC-0021. |
| R3 | Operator expects OpenAI to validate direct-assign assignments | Low | UI tooltip explicitly says "bypasses AI"; documented HITL semantics: direct-assign = operator pre-decided rule |
| R4 | Multiple direct-assign mappings match the same transaction | Low | First-match-wins semantics (same as `getAiHint`); deterministic based on mapping array order |
| R5 | Existing 4 test cases break after stub refactor | Low | `makeNoHintCategoryMapping()` extended (not replaced) to also expose `getDirectAssignment: () => ({ assigned: false })` |
| R6 | UI rendering race between `loadCategoryMappings` and `loadCategoriesForKeywordMappings` | None (confirmed in discovery) | Toggle state depends only on mapping data, not the categories list |
| R7 | `editCategoryMapping` call site in `renderCategoryMappings` passes 4 args — 5th `directAssign` arg will be `undefined` for old code | Low | Call site updated at the same time as the function signature; no rollout window where they diverge |
| R8 | Operator enables direct-assign on a mapping, later decides to revert | None | UI toggle + edit form allow flipping back to `false`. Existing behavior preserved because `directAssign: false` ≡ missing key |

## 6. Test strategy summary

- **Unit tests**: 3 new `node:test` cases (`case-5..7`) + extended stub helper.
- **Regression**: existing 18/18 suite runs via `bash tests/run-tests.sh`. Expected to remain green.
- **Manual verify (sprint-level)**: run the categorizer locally, enable `directAssign: true` on "Supermarkets & Groceries" → "Lebensmittel - Lebensmittelhandel", resubmit the INTERSPAR 2361 K4 withdrawal, confirm category is assigned directly. (Out of scope for automated tasks; deferred to QA if requested.)

## 7. Out of scope (reiterated from discovery)

- Account mapping logic (step 1).
- Auto-categorization rules (step 2).
- Review queue (US-0004) — direct-assign matches do not enter the review queue; same policy as account mapping.
- Bulk editing `directAssign` across many mappings.
- Schema migration script (DEC-0021).
- Changes to `getAiHint()` algorithm or semantics.

## 8. Sprint sizing recommendation

- 5 component tasks + 1 regression task + 1 manual verification task = **7 tasks**, well under the default `SPRINT_MAX_TASKS=12` threshold.
- No split required. Recommend single sprint `S0010` (next free slot).
- No `/quick` — this is a full vertical slice with pipeline impact.

## 9. Acceptance criteria cross-reference

| AC | Coverage in this architecture |
|---|---|
| AC-1 | §3.1 (additive schema), §3.4 |
| AC-2 | §3.1.1 `getDirectAssignment`, §3.2 early-return with `autoRule: 'category_mapping_direct'` |
| AC-3 | §3.1.3 (no change to `getAiHint`), §3.2 fall-through to existing line 1214+ |
| AC-4 | §3.2 explicit insertion at AI-hint slot |
| AC-5 | §3.3 per-row toggle + form checkbox |
| AC-6 | §3.4 additive schema, missing ≡ false |
| AC-7 | §3.5 three new test cases + stub refactor, §6 regression strategy |

## 10. Next phase

`sprint-plan` — break the architecture into concrete sprint tasks with owners, dependencies, and acceptance criteria.
