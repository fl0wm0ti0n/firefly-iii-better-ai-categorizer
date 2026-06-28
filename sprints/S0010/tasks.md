# Sprint S0010 Tasks

**Work Item**: US-0007  
**Sprint Goal**: Keyword mapping direct-assign mode  
**Status**: planned  
**Created**: 2026-06-28T14:30:00Z  
**Total Tasks**: 7  
**Estimated Effort**: S (small)  
**Sprint Cap**: 12 tasks (from SPRINT_MAX_TASKS)  

---

## Task Summary

| ID | Title | Component | Complexity | Dependencies | Status |
|---|---|---|---|---|---|
| T-0062 | Implement CategoryMappingService.getDirectAssignment() and add directAssign field to schema | src/CategoryMappingService.js, data/category-mappings.json | low | — | planned |
| T-0063 | Insert direct-assign check into #resolveCategory() pipeline | src/App.js | low | T-0062 | planned |
| T-0064 | Add per-row direct-assign toggle and UI controls | public/index.html | low | T-0062 | planned |
| T-0065 | Refactor test stubs to support direct-assign testing | tests/fixtures/stubs.js | low | T-0062 | planned |
| T-0066 | Add 3 new test cases for direct-assign behavior | tests/resolveCategory.test.js | medium | T-0063, T-0065 | planned |
| T-0067 | Add persistence round-trip test for directAssign field | tests/categoryMappingService.test.js (new) | medium | T-0062 | planned |
| T-0068 | Run full regression suite and verify 21/21 tests pass | bash tests/run-tests.sh | low | T-0067 | planned |

---

## Task Dependencies

```
T-0062 (Service + Schema)
  ├─> T-0063 (Pipeline insert)
  │     └─> T-0066 (Test cases) ─> T-0068 (Regression gate)
  ├─> T-0064 (UI toggle)
  ├─> T-0065 (Stub refactor) ─> T-0066
  └─> T-0067 (Persistence test) ─> T-0068
```

---

## Task Details

### T-0062: Service method + schema field (low complexity)
**Component**: src/CategoryMappingService.js, data/category-mappings.json  
**Description**: Add `getDirectAssignment(transaction)` method returning `{assigned: true, category, mappingName, matchedKeyword}` when an enabled direct-assign mapping matches, or `{assigned: false}` when no match or disabled. Add `directAssign?: boolean` to CRUD methods (addMapping/updateMapping) with default false. Additive schema — missing field treated as false.  
**Acceptance**: Method returns correct shape for match/no-match/disabled cases; CRUD methods persist field correctly.  
**Decision refs**: DEC-0021 (additive schema), DEC-0022 (pipeline placement)  

### T-0063: Pipeline insertion (low complexity)
**Component**: src/App.js  
**Description**: Insert direct-assign check at line 1214 in `#resolveCategory()`, before existing AI-hint call. When `assigned: true` AND target category exists, return `{category, autoRule: 'category_mapping_direct'}` immediately without calling AI. When target category missing, fall through to AI-hint path with warning.  
**Acceptance**: Pipeline returns early on direct-assign match; AI not called; precedence preserved (account > auto-cat > direct-assign > AI-hint).  
**Decision refs**: DEC-0022 (pipeline placement option c)  

### T-0064: UI toggle (low complexity)
**Component**: public/index.html  
**Description**: Add per-row toggle "Direct assign" in mapping list (checkbox/switch), form checkbox in add/edit dialog, and "DIRECT" badge for enabled mappings. Wire to existing CRUD endpoints.  
**Acceptance**: UI allows enabling/disabling direct-assign per mapping; changes persist; visual indicators shown when enabled.  
**Decision refs**: DEC-0021 (additive schema)  

### T-0065: Stub refactor (low complexity)
**Component**: tests/fixtures/stubs.js  
**Description**: Add `getDirectAssignment()` to `makeNoHintCategoryMapping()` (return `{assigned: false}` for backward compat). Create new `makeCategoryMappingStub({directAssignment, aiHint})` helper.  
**Acceptance**: Existing test cases still pass; new helper supports configurable direct-assign and AI-hint returns.  
**Decision refs**: —  

### T-0066: Test cases (medium complexity)
**Component**: tests/resolveCategory.test.js  
**Description**: Add three new test cases: case-5 (direct-assign match), case-6 (direct-assign miss), case-7 (mixed direct-assign and AI-hint scenario). Verify pipeline behavior and precedence.  
**Acceptance**: All three test cases pass; verify OpenAI not called on direct-assign match; verify fall-through on miss; verify precedence.  
**Dependencies**: T-0063, T-0065  
**Decision refs**: DEC-0022  

### T-0067: Persistence test (medium complexity)
**Component**: tests/categoryMappingService.test.js (new file)  
**Description**: Add test verifying `directAssign` field survives save/load cycle via JSON file.  
**Acceptance**: Test passes; field correctly persisted and reloaded.  
**Decision refs**: DEC-0021  

### T-0068: Regression gate (low complexity)
**Component**: bash tests/run-tests.sh  
**Description**: Run full test suite and verify 21/21 tests pass (18 existing + 3 new).  
**Acceptance**: Exit code 0; no regressions; all tests pass.  
**Dependencies**: T-0067  

---

## Implementation Order

1. **T-0062** (Service + Schema) — no dependencies, start here
2. **T-0063, T-0064, T-0065, T-0067** — can run in parallel after T-0062
3. **T-0066** (Test cases) — after T-0063 and T-0065 complete
4. **T-0068** (Regression gate) — final gate, after all other tasks

---

## Scope (from architecture)

- src/CategoryMappingService.js
- src/App.js
- public/index.html
- data/category-mappings.json
- tests/resolveCategory.test.js
- tests/fixtures/stubs.js
- tests/categoryMappingService.test.js (new)

---

## Risks

1. **R6: Target category validity** — mitigated by fall-through rule in T-0063 (if category not found in Firefly, warn and fall through)
2. **R7: UI render race** — confirmed safe in discovery (toggle state independent of category list load)
3. **R8: Whitelist breaks existing clients** — mitigated by audit showing no clients send non-whitelisted fields

---

## Success Criteria

All 7 tasks completed, all 21 tests pass (18 existing + 3 new), direct-assign mappings work end-to-end from UI configuration to pipeline behavior with correct precedence and backward compatibility.
