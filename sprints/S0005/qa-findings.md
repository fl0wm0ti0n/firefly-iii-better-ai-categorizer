# QA Findings — S0005 (US-0003)

**Phase:** qa  
**Date:** 2026-06-14  
**Role:** qa  
**Fresh context marker:** qa-20260614-us0003  
**Work item:** US-0003 (OpenAI Structured Outputs migration)  
**Orchestrator run:** auto-20260614T161000Z-us0003

## Verdict: PASS — all 5 acceptance criteria verified

## AC Verification Matrix

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC-1 | `classify()` uses Structured Outputs with category enum derived from Firefly category list | **PASS** | `src/OpenAiService.js:121-128` — `response_format: { type: 'json_schema', json_schema: { name: 'transaction_category', strict: true, schema: this.#buildCategorySchema(categoryNames) } }`. `#buildCategorySchema` (lines 187-201) builds enum from `[...categories.filter(Boolean), 'UNKNOWN']`. Test oai-1 asserts `response_format.type === 'json_schema'`, `strict === true`, and runtime enum matches expected values. |
| AC-2 | Invalid/hallucinated category names cannot be returned (schema enforcement) | **PASS** | Schema uses `strict: true` with `enum` constraint — OpenAI API enforces output conforms to schema. `additionalProperties: false` and `required: ['category']` prevent extra fields. Only valid enum values (Firefly categories + UNKNOWN) can be returned. Post-hoc `categories.indexOf(guess)` removed — schema enforcement replaces it. |
| AC-3 | Existing webhook, bulk, and test-webhook paths pass US-0001 regression tests without behavior regression on happy path | **PASS** | `bash tests/run-tests.sh` exits 0. **9/9 tests pass** (4 existing resolveCategory + 5 new openAiService). resolveCategory cases 1-4 unchanged and passing. External contract `{ category, prompt, response }` preserved. No changes to `App.js` `#resolveCategory` pipeline. |
| AC-4 | `OPENAI_MODEL` env still selects model; default remains `gpt-4o-mini` | **PASS** | `src/OpenAiService.js:6` — `#model = "gpt-4o-mini"` (field default). Lines 19-22 — constructor reads `getConfigVariable("OPENAI_MODEL", false)` and calls `setModel(envModel)` if present. `setModel()` validates against `["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"]`. `classify()` uses `this.#model` at line 105. |
| AC-5 | Rate-limit backoff (`#retryWithBackoff`) still applies on 429 responses | **PASS** | `src/OpenAiService.js:158-167` — `error.status === 429` → `throw new OpenAiException(status, error, ...)` where `status` (429) becomes `this.code`. `src/App.js:1195` — `#retryWithBackoff` checks `error.code === 429` with exponential backoff. Constructor uses `maxRetries: 0` to prevent SDK-level retry interference. Test oai-5 confirms `err.code === 429`. |

## Test Execution Results

```
# tests 9
# pass 9
# fail 0
# cancelled 0
# skipped 0
# duration_ms 563.944143
```

### Test breakdown

| Test file | Cases | Pass | Fail |
|-----------|-------|------|------|
| `tests/openAiService.test.js` | oai-1 through oai-5 | 5/5 | 0 |
| `tests/resolveCategory.test.js` | case-1 through case-4 | 4/4 | 0 |
| **Total** | **9** | **9** | **0** |

## Detailed verification notes

### AC-1 — Structured Outputs

- `classify()` at line 104 sends `response_format` with `type: 'json_schema'`
- `json_schema.name` = `'transaction_category'`
- `json_schema.strict` = `true`
- `json_schema.schema` = dynamic JSON Schema built from runtime category list
- Schema shape: `{ type: 'object', properties: { category: { type: 'string', enum: [...cats, 'UNKNOWN'] } }, required: ['category'], additionalProperties: false }`
- Test oai-1 captures the actual request and asserts all schema properties

### AC-2 — Schema enforcement prevents hallucination

- `strict: true` means OpenAI guarantees output conforms to schema
- Enum is built from actual Firefly categories passed at runtime: `[...categories.filter(Boolean), 'UNKNOWN']`
- No post-hoc validation needed (old `categories.indexOf(guess)` removed)
- UNKNOWN is the only non-category value, mapped to `{ category: null }` at line 151

### AC-3 — Regression gate

- All 4 existing `resolveCategory` tests pass unchanged
- `resolveCategory` pipeline in `App.js` unchanged — calls `this.#openAi.classify()` via `#retryWithBackoff`
- External contract `{ category, prompt, response }` preserved
- `matchAccount()` and `extractTransactionsFromText()` use v4 call path but don't affect resolveCategory

### AC-4 — Model selection

- Field default `#model = "gpt-4o-mini"` (line 6)
- Constructor reads `OPENAI_MODEL` env var (line 19)
- `setModel()` validates against supported list (lines 226-234)
- `classify()` uses `this.#model` in API call (line 105)

### AC-5 — Rate-limit backoff compatibility

- OpenAI v4 `APIError.status` mapped to `OpenAiException.code` at error boundary (line 167)
- `#retryWithBackoff` in `App.js` (line 1195) checks `error.code === 429` — chain intact
- `maxRetries: 0` on OpenAI client (line 17) prevents SDK double-retry
- Test oai-5 constructs `OpenAI.APIError(429, ...)` and asserts `err.code === 429`

## Findings

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| — | — | No blocking findings | — |

## Recommendations

- None. Implementation is clean and all ACs pass.

## Stop condition

QA phase complete. Handoff to verify-work phase.
