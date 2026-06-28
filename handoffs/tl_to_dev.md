# Tech Lead → Dev handoff: US-0007

## Handoff metadata

- **Story ID**: US-0007
- **Sprint ID**: S0010
- **Handoff type**: sprint-plan → plan-verify
- **Orchestrator run**: auto-20260628T120000Z-us0007-us0008
- **Timestamp**: 2026-06-28T14:35:00+02:00
- **Role**: tech-lead (sprint-plan)

## Sprint summary

Sprint S0010 planned for US-0007 (Keyword mapping direct-assign mode). 7 tasks (T-0062..T-0068), well under capacity (12 tasks/sprint). No split required.

**Goal**: Enable per-keyword-mapping direct category assignment (bypass AI) via additive `directAssign` boolean flag with UI toggle, pipeline integration, and full test coverage.

**Expected outcome**: All 21 tests pass (18 existing + 3 new). Direct-assign mappings work end-to-end from UI configuration to pipeline behavior with correct precedence and backward compatibility.

## Task breakdown

### Phase 1: Foundation (no dependencies)

**T-0062**: Implement CategoryMappingService.getDirectAssignment() and add directAssign field to schema
- **Component**: src/CategoryMappingService.js, data/category-mappings.json
- **Complexity**: low
- **Description**: Add `getDirectAssignment(transaction)` method returning `{assigned, category, mappingName, matchedKeyword, reason}` when an enabled direct-assign mapping matches, or `{assigned: false}` when no match or disabled. Add `directAssign?: boolean` field to CRUD methods (addMapping/updateMapping) with default false. Additive schema — missing field treated as false. Add whitelist `#MAPPING_FIELDS` to prevent arbitrary field injection.
- **Acceptance**: Method returns correct shape for match/no-match/disabled cases; CRUD methods persist field correctly; whitelist prevents field injection.
- **Decision refs**: DEC-0021 (additive schema), DEC-0022 (pipeline placement)

### Phase 2: Parallel tasks (all depend on T-0062)

**T-0063**: Insert direct-assign check into #resolveCategory() pipeline
- **Component**: src/App.js
- **Complexity**: low
- **Description**: Insert direct-assign check at line 1214 (AI-hint slot) in `#resolveCategory()`, before existing AI-hint call. When `assigned: true` AND target category exists, return `{category, autoRule: 'category_mapping_direct'}` immediately without calling AI. When target category missing, fall through to AI-hint path with warning.
- **Dependencies**: T-0062
- **Acceptance**: Pipeline returns early on direct-assign match; AI not called; precedence preserved (account > auto-cat > direct-assign > AI-hint).
- **Decision refs**: DEC-0022 (pipeline placement option c)

**T-0064**: Add per-row direct-assign toggle and UI controls
- **Component**: public/index.html
- **Complexity**: low
- **Description**: Add per-row toggle "Direct assign" in mapping list (checkbox/switch), form checkbox in add/edit dialog, and "DIRECT" badge for enabled mappings. Wire to existing CRUD endpoints.
- **Dependencies**: T-0062
- **Acceptance**: UI allows enabling/disabling direct-assign per mapping; changes persist; visual indicators shown when enabled.

**T-0065**: Refactor test stubs to support direct-assign testing
- **Component**: tests/fixtures/stubs.js
- **Complexity**: low
- **Description**: Add `getDirectAssignment()` to `makeNoHintCategoryMapping()` (return `{assigned: false}` for backward compat). Create new `makeCategoryMappingStub({directAssignment, aiHint})` helper.
- **Dependencies**: T-0062
- **Acceptance**: Existing test cases still pass; new helper supports configurable direct-assign and AI-hint returns.

**T-0067**: Add persistence round-trip test for directAssign field
- **Component**: tests/categoryMappingService.test.js (new file)
- **Complexity**: medium
- **Description**: Add test verifying `directAssign` field survives save/load cycle via JSON file.
- **Dependencies**: T-0062
- **Acceptance**: Test passes; field correctly persisted and reloaded.
- **Decision refs**: DEC-0021

### Phase 3: Test cases (depends on T-0063, T-0065)

**T-0066**: Add 3 new test cases for direct-assign behavior
- **Component**: tests/resolveCategory.test.js
- **Complexity**: medium
- **Description**: Add three new test cases: case-5 (direct-assign match), case-6 (direct-assign miss), case-7 (mixed direct-assign and AI-hint scenario). Verify pipeline behavior and precedence.
- **Dependencies**: T-0063, T-0065
- **Acceptance**: All three test cases pass; verify OpenAI not called on direct-assign match; verify fall-through on miss; verify precedence.

### Phase 4: Final verification (depends on T-0067)

**T-0068**: Run full regression suite and verify 21/21 tests pass
- **Component**: bash tests/run-tests.sh
- **Complexity**: low
- **Description**: Run full test suite and verify 21/21 tests pass (18 existing + 3 new). Expected exit code 0.
- **Dependencies**: T-0067
- **Acceptance**: Exit code 0; no regressions; all tests pass.

## Critical path

T-0062 → T-0063 → T-0066 → T-0068

## Implementation order

1. **T-0062** (Service + Schema) — no dependencies, start here
2. **T-0063, T-0064, T-0065, T-0067** — can run in parallel after T-0062
3. **T-0066** (Test cases) — after T-0063 and T-0065 complete
4. **T-0068** (Regression gate) — final gate, after all other tasks

## Decisions to implement

### DEC-0021: Additive schema (no migration)

- **Decision**: Add optional `directAssign?: boolean` field to mapping schema. Missing key treated as `false`. No migration script required.
- **Implementation**: In `addMapping()` and `updateMapping()`, store `directAssign: Boolean(value ?? false)`. Backward compatible — existing mappings without field continue working.
- **Risks**: Field injection via spread-merge (mitigated by whitelist in T-0062).

### DEC-0022: Pipeline placement (option c from intake)

- **Decision**: Insert direct-assign check at AI-hint slot (line 1214 in `src/App.js`), after account mapping (line 1187) and auto-categorization (line 1202).
- **Implementation**: In `#resolveCategory()`, call `categoryMappingService.getDirectAssignment(transaction)`. When `assigned: true` AND target category exists, return `{category, autoRule: 'category_mapping_direct'}` immediately. When target category missing, fall through to AI-hint path with warning.
- **Precedence**: account mapping → auto-categorization → **direct-assign** → AI-hint → history analysis → OpenAI
- **Risks**: Target category validity (mitigated by fall-through rule).

## Risks to monitor

1. **R6: Target category validity** — mitigated by fall-through rule in T-0063 (if category not found in Firefly, warn and fall through)
2. **R7: UI render race** — confirmed safe in discovery (toggle state independent of category list load)
3. **R8: Whitelist breaks existing clients** — mitigated by audit showing no clients send non-whitelisted fields

## Architecture reference

Full architecture document: `docs/engineering/architecture-us0007.md`

Key implementation patterns:
- **Service method**: `CategoryMappingService.getDirectAssignment(transaction)` returns `{assigned: true, category, mappingName, matchedKeyword}` or `{assigned: false}` (not null)
- **Whitelist enforcement**: `addMapping`/`updateMapping` use `#MAPPING_FIELDS` whitelist to prevent arbitrary field injection
- **Fall-through rule**: when target category missing from Firefly, log warning and proceed to AI-hint path
- **Return shape**: includes `autoRule: 'category_mapping_direct'` on match

## Acceptance criteria mapping

| AC | Coverage |
|---|---|
| AC-1 | T-0062 (schema field), T-0067 (persistence test) |
| AC-2 | T-0063 (pipeline early return), T-0066 (test case-5) |
| AC-3 | T-0063 (fall-through on disabled), T-0066 (test case-6) |
| AC-4 | T-0063 (insert at AI-hint slot) |
| AC-5 | T-0064 (UI toggle, form checkbox, DIRECT badge) |
| AC-6 | T-0062 (additive schema, default false) |
| AC-7 | T-0066 (test cases), T-0068 (regression gate) |

## Sprint artifacts

- `sprints/S0010/sprint.json` — sprint metadata
- `sprints/S0010/tasks.md` — task summary
- `sprints/S0010/tasks/T-0062.json` through `T-0068.json` — individual task definitions

## Next phase

`plan-verify` — verify that the sprint plan is complete, well-formed, and ready for execution.

## Handoff location

`handoffs/tl_to_dev.md` (this file)
`sprints/S0010/sprint.json` (sprint metadata)
`sprints/S0010/tasks.md` (task summary)

## Resume

When continuing, start from: `sprints/S0010/sprint.json`
Then proceed to: `/plan-verify` for US-0007
After US-0007 lifecycle complete, drain-advance to US-0008.
