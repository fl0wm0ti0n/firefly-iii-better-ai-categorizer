# Tasks — Sprint S0005 (US-0003)

| ID | Status | Title | Files | Acceptance mapping |
|----|--------|-------|-------|-------------------|
| T-0018 | pending | Pin `openai@^4` in `package.json` | `package.json`, `package-lock.json` | prerequisite (DEC-0010) |
| T-0019 | pending | Constructor + `createForTest` + v4 error mapping | `src/OpenAiService.js` | DEC-0009; AC-5 |
| T-0020 | pending | `#buildCategorySchema` + `classify()` Structured Outputs | `src/OpenAiService.js` | AC-1, AC-2 |
| T-0021 | pending | `matchAccount` + `extractTransactionsFromText` v4 call path | `src/OpenAiService.js` | DEC-0010 |
| T-0022 | pending | `tests/openAiService.test.js` (oai-1–oai-5) | `tests/openAiService.test.js` | unit coverage (R-0017) |
| T-0023 | pending | Full `bash tests/run-tests.sh` green | `tests/run-tests.sh` | AC-3 |

## T-0018 — Pin `openai@^4` in `package.json`

**Goal:** Upgrade SDK dependency to v4 per **DEC-0010** and **R-0015**.

**Requirements:**

1. Update `package.json` `dependencies.openai` from `^3.2.1` to `^4`.
2. Run `npm install` to update `package-lock.json`.
3. Verify ESM import: `node -e "import('openai').then(m => console.log(typeof m.OpenAI))"` prints `function`.
4. No peer dependency conflicts.

**Done when:** `openai@^4` installed and v4 `OpenAI` class importable.

## T-0019 — Constructor + `createForTest` + v4 error mapping

**Goal:** v4 client initialization with injectable test seam per **DEC-0009**.

**Requirements:**

1. Replace v3 `Configuration`/`OpenAIApi` with v4 `new OpenAI({ apiKey, maxRetries: 0 })`.
2. Import: `import OpenAI from 'openai'` (v4 ESM default export).
3. Constructor accepts `deps = {}`; `deps.client ?? new OpenAI({ apiKey, maxRetries: 0 })`.
4. Add `static createForTest(deps)` returning `new OpenAiService(deps)`.
5. Map `OpenAI.APIError.status` → `OpenAiException.code` for 429/401/400.
6. Non-APIError → `OpenAiException(null, null, 'Network error: ...')`.
7. `maxRetries: 0` disables SDK built-in retry; `#retryWithBackoff` sole policy (AC-5).

**Done when:** Constructor initializes v4 client; `createForTest` injectable; error mapping preserves `error.code === 429`.

## T-0020 — `#buildCategorySchema` + `classify()` Structured Outputs

**Goal:** Schema-locked classification per **AC-1** and **AC-2**.

**Requirements:**

1. Add private `#buildCategorySchema(categories)` returning JSON Schema with runtime enum `[...categories.filter(Boolean), 'UNKNOWN']`.
2. Schema: `{ type: 'object', properties: { category: { type: 'string', enum: ..., description: '...' } }, required: ['category'], additionalProperties: false }`.
3. `classify()` sends `response_format: { type: 'json_schema', json_schema: { name: 'transaction_category', strict: true, schema: this.#buildCategorySchema(categories) } }`.
4. Response mapping:
   - `parsed.category === 'UNKNOWN'` → `{ category: null, response: 'UNKNOWN', prompt }`
   - Valid enum → `{ category: guess, response: guess, prompt }`
   - `message.refusal` set → `{ category: null, response: refusal, prompt }`
   - JSON parse failure → `{ category: null, response: rawContent, prompt }` + `console.warn`
5. Remove post-hoc `categories.indexOf(guess)` — schema enforcement replaces it.
6. Preserve external contract `{ category, prompt, response }`.

**Done when:** `classify()` uses `json_schema` with `strict: true`; UNKNOWN/refusal → null; no indexOf validation.

## T-0021 — `matchAccount` + `extractTransactionsFromText` v4 call path

**Goal:** Shared client migration per **DEC-0010** (partial migration policy).

**Requirements:**

1. Update `matchAccount()` to use `this.#openAi.chat.completions.create(...)` without `.data` accessor.
2. Update `extractTransactionsFromText()` to use `this.#openAi.chat.completions.create(...)` without `.data` accessor.
3. Response parsing logic unchanged (legacy prompt+parse preserved).
4. **No** Structured Outputs schema on sibling methods (scope_out per DEC-0010).

**Done when:** All three methods use v4 call path; only `classify()` has schema.

## T-0022 — `tests/openAiService.test.js` (oai-1–oai-5)

**Goal:** Unit coverage for schema construction, response mapping, error propagation per **R-0017**.

**Requirements:**

1. Create `tests/openAiService.test.js` using `node:test` + `node:assert/strict`.
2. Import `OpenAiService` from `../src/OpenAiService.js`.
3. Use `OpenAiService.createForTest({ client: { chat: { completions: { create: t.mock.fn(...) } } } })`.
4. Test cases:
   - **oai-1-schema-enum:** Captured `response_format.json_schema.schema.properties.category.enum` === `[...categories, 'UNKNOWN']`; `strict: true`.
   - **oai-2-valid-category:** Mock returns `{"category":"Groceries"}` → `{ category: 'Groceries', response: 'Groceries', prompt }`.
   - **oai-3-unknown-null:** Mock returns `{"category":"UNKNOWN"}` → `{ category: null, response: 'UNKNOWN', prompt }`.
   - **oai-4-refusal:** Mock returns `{ refusal: '...' }` → `{ category: null, response: refusal, prompt }`.
   - **oai-5-429-exception:** Mock rejects with `OpenAI.APIError(429, ...)` → thrown error `.code === 429`.
5. No `OPENAI_API_KEY` required (pure mock client).
6. Picked up by existing `node --test tests/` runner.

**Done when:** 5 test cases pass; schema enum asserted on captured request.

## T-0023 — Full `bash tests/run-tests.sh` green

**Goal:** AC-3 regression gate — all tests pass after SDK migration.

**Requirements:**

1. Run `bash tests/run-tests.sh`.
2. Verify exit 0.
3. `tests/resolveCategory.test.js` 4/4 cases pass (no regression from SDK migration).
4. `tests/openAiService.test.js` 5 cases pass (oai-1–oai-5).
5. No `OPENAI_API_KEY` required in test environment.
6. Fix any regressions before marking done.

**Done when:** `bash tests/run-tests.sh` exits 0 with all tests green.
