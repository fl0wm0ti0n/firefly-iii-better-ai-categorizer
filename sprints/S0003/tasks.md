# Tasks — Sprint S0003 (US-0001)

| ID | Status | Title | Files | Acceptance mapping |
|----|--------|-------|-------|-------------------|
| T-0005 | pending | App test seam | `src/App.js` | DEC-0006; enables AC-2 test invocation |
| T-0006 | pending | Test fixtures | `tests/fixtures/*.js` | AC-2 stub wiring per architecture matrix |
| T-0007 | pending | Precedence tests cases 1–4 | `tests/resolveCategory.test.js` | AC-2 (≥4 cases) |
| T-0008 | pending | Linux shell runner | `tests/run-tests.sh` | AC-1 |
| T-0009 | pending | Runbook + npm test | `docs/engineering/runbook.md`, `package.json` | AC-3, AC-4 |
| T-0010 | pending | CI checks verification | `.github/workflows/ci.yml` (verify only) | AC-5 |
| T-0011 | pending | Optional stretch cases 5–6 | `tests/resolveCategory.test.js` | AC-2 stretch (optional) |

## T-0005 — App test seam

**Goal:** Add minimal injectable-deps factory and test wrapper on `App` per DEC-0006
and architecture # US-0001. No `run()` call; no env gates.

**Requirements:**

1. Add static `App.createForTest(deps = {})` inside `App` class body.
2. Assign injected deps to private fields when non-null:
   `#openAi`, `#accountCategoryMappingService`, `#autoCategorizationService`,
   `#wordMapping`, `#categoryMappingService`.
3. Add async instance method `resolveCategoryForTest(transaction, categories)` delegating
   to `#resolveCategory`.
4. Do **not** extract pipeline to separate module (Option B rejected).
5. Do **not** call `run()` or bootstrap Express/Socket.io/Firefly.

**Done when:** Test file can `App.createForTest({...})` and await
`resolveCategoryForTest(tx, categoriesMap)` without HTTP bootstrap.

## T-0006 — Test fixtures

**Goal:** Shared fixture modules for categories Map, Firefly-shaped transactions, and
service stub factories.

**Requirements:**

1. Create `tests/fixtures/categories.js` — `makeCategoriesMap(overrides)` with
   Groceries, Travel & Foreign, Restaurants, Utilities (string ids).
2. Create `tests/fixtures/transactions.js` — `makeWithdrawalTx({...})` with
   `attributes.transactions[0]` Firefly webhook shape.
3. Create `tests/fixtures/stubs.js` — `makeOpenAiStub`, `makeAccountMappingStub`,
   `makeAutoCatStub`, `makePassthroughWordMapping`, `makeNoHintCategoryMapping`.
4. Stubs return same shapes production services expose (see architecture # US-0001).
5. Prefer plain objects; tests may wrap with `t.mock.fn()` where call counts matter.

**Done when:** Fixtures import cleanly from ESM test files; no repo `data/` mutation.

## T-0007 — Precedence tests cases 1–4

**Goal:** `tests/resolveCategory.test.js` with four required precedence cases per
DEC-0001 / architecture AC-2 matrix.

**Requirements:**

1. Use `import { test } from 'node:test'` and `import assert from 'node:assert/strict'`.
2. Import `App` from `../src/App.js`; import fixtures from `./fixtures/`.
3. Implement cases with stable ids in assert messages:
   - **case-1-account-wins** — account → Groceries beats auto + AI stubs.
   - **case-2-auto-cat-wins** — no account; foreign tx + auto stub → Travel & Foreign;
     assert `classify` not called.
   - **case-3-ai-wins** — account + auto null; AI stub → Restaurants; assert
     `classify` called once.
   - **case-4-account-beats-ai** — account → Groceries; AI stub unused;
     `classify.mock.callCount() === 0`.
4. Failure messages include case id and `expected` vs `actual` category (vision UX).
5. Remove `tests/_poc/` if present after tests pass.
6. Wire stubs per architecture stub-wiring table (word/category mapping passthrough).

**Done when:** `node --test tests/resolveCategory.test.js` passes all 4 cases locally.

## T-0008 — Linux shell runner

**Goal:** Canonical executable Linux test runner (AC-1).

**Requirements:**

1. Create `tests/run-tests.sh` with `#!/usr/bin/env bash`, `set -euo pipefail`.
2. `cd` to repo root (script dir parent); `exec node --test tests/` (directory path).
3. `chmod +x` on the script.
4. Optional: create `tests/run-tests.ps1` invoking `node --test tests/` for Windows
   parity (document in runbook T-0009 even if ps1 added here).

**Done when:** `bash tests/run-tests.sh` exits 0 on Linux with T-0007 tests green.

## T-0009 — Runbook + npm test

**Goal:** Align operator surfaces with canonical runner (AC-3, AC-4).

**Requirements:**

1. Update `docs/engineering/runbook.md` frontmatter `TEST_COMMAND` to
   `bash tests/run-tests.sh` (Linux primary).
2. Document Windows runner in runbook body:
   `powershell -ExecutionPolicy Bypass -File tests/run-tests.ps1`.
3. Replace `package.json` `scripts.test` stub with delegation to shell runner
   (e.g. `bash tests/run-tests.sh`).
4. Remove reference to missing-only ps1 as sole command.

**Done when:** Runbook and `npm test` both invoke working runner; AC-3 dual-runner documented.

## T-0010 — CI checks verification

**Goal:** Confirm CI workflow runs updated `TEST_COMMAND` (AC-5).

**Requirements:**

1. Verify `.github/workflows/ci.yml` `checks` job reads `TEST_COMMAND` from runbook
   (no workflow edit required if runbook updated — confirm conditional step).
2. Run `bash tests/run-tests.sh` locally as CI proxy; record pass in sprint summary.
3. If runbook bootstrap scripts exist, ensure they accept new `TEST_COMMAND`.

**Done when:** Local runner green; CI step would execute `bash tests/run-tests.sh` when
runbook frontmatter updated (AC-5 satisfied by wiring, not workflow change).

## T-0011 — Optional stretch cases 5–6 (optional)

**Goal:** Stretch coverage for stale mapping fall-through and invalid AI category.

**Requirements:**

1. **case-5-stale-mapping** — account maps to category absent from Map; auto stub wins.
2. **case-6-ai-invalid** — AI returns category absent from Map → `{ category: null }`.
3. Optional `t.capture` on stderr for case-5 warn path.

**Done when:** Both optional cases pass; not blocking sprint DoD.
