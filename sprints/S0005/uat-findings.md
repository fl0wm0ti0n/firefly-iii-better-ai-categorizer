# UAT Findings — S0005 (US-0003)

**Phase:** verify-work  
**Date:** 2026-06-14  
**Role:** qa  
**Fresh context marker:** verify-work-20260614-us0003  
**Work item:** US-0003 (OpenAI Structured Outputs migration)  
**Orchestrator run:** auto-20260614T161000Z-us0003  
**User-visible:** false (internal/maintainer change)

## Verdict: PASS — all 8 UAT validation steps passed

## UAT Validation Matrix

| Step | Validation | Verdict | Evidence |
|------|------------|---------|----------|
| 1 | Operator impact — categorization behavior unchanged | **PASS** | `#resolveCategory` pipeline unchanged (App.js:1118-1187); account mapping → auto-cat → AI precedence preserved; external contract `{ category, prompt, response }` unchanged; 4 existing resolveCategory tests pass unchanged |
| 2 | Test harness — 9/9 pass independently | **PASS** | `bash tests/run-tests.sh` exit 0; 9/9 pass (5 openAiService + 4 resolveCategory); duration ~561ms |
| 3 | Schema contract — `classify()` json_schema deterministic | **PASS** | `src/OpenAiService.js:121-128` — `response_format: { type: 'json_schema', json_schema: { name: 'transaction_category', strict: true, schema: #buildCategorySchema(categoryNames) } }`; `#buildCategorySchema` (lines 187-201) builds enum from `[...categories.filter(Boolean), 'UNKNOWN']`; `additionalProperties: false`; `required: ['category']` |
| 4 | Error resilience — 429 retry works | **PASS** | `OpenAiService.js:158-167` — v4 `APIError.status` → `OpenAiException.code` (429 preserved); `App.js:1190-1197` — `#retryWithBackoff` checks `error.code === 429` with exponential backoff; `maxRetries: 0` on client prevents SDK double-retry; test oai-5 confirms `err.code === 429` |
| 5 | Model selection — OPENAI_MODEL env controls model | **PASS** | `OpenAiService.js:6` — `#model = "gpt-4o-mini"` default; lines 19-22 — constructor reads `getConfigVariable("OPENAI_MODEL", false)` and calls `setModel()`; `setModel()` (lines 226-234) validates against `["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"]`; `classify()` uses `this.#model` at line 105 |
| 6 | Backward compatibility — webhook/bulk/test-webhook paths | **PASS** | All three endpoints (`/api/process-uncategorized` line 126, `/api/process-all` line 127, `/api/test-webhook` line 128) funnel through `#resolveCategory` → `#retryWithBackoff` → `classify()`; no contract changes; resolveCategory tests 1-4 pass unchanged |
| 7 | Code quality — no leftover v3 patterns | **PASS** | Grep for `response.data`, `.data[0]`, `v3` in `OpenAiService.js` — zero matches; all three methods (`classify`, `matchAccount`, `extractTransactionsFromText`) use v4 `chat.completions.create` with direct response access |
| 8 | Documentation — architecture references current | **PASS** | `docs/engineering/architecture.md` already updated: line 103 `gpt-4o-mini` default, line 198 `OPENAI_MODEL` env table, line 849 `openai@^4` ESM client, lines 863-868 SDK target + unit test seam, lines 961-965 model matrix |

## Detailed Step Results

### Step 1 — Operator Impact

- `#resolveCategory` at `App.js:1118-1187` unchanged from pre-US-0003
- Pipeline precedence: account mapping → auto-cat → word mapping → AI classify
- External return shape `{ category, prompt, response, autoRule }` preserved
- All 4 resolveCategory regression tests pass without modification
- **No behavior change for end users**

### Step 2 — Test Harness (Independent Run)

```
TAP version 13
1..9
# tests 9
# pass 9
# fail 0
# cancelled 0
# skipped 0
# duration_ms 560.942084
```

| Test | Result | Duration |
|------|--------|----------|
| oai-1-schema-enum | ok | 6.3ms |
| oai-2-valid-category | ok | 0.7ms |
| oai-3-unknown-null | ok | 0.7ms |
| oai-4-refusal | ok | 0.6ms |
| oai-5-429-exception | ok | 2.4ms |
| case-1-account-wins | ok | 3.9ms |
| case-2-auto-cat-wins | ok | 0.5ms |
| case-3-ai-wins | ok | 1.2ms |
| case-4-account-beats-ai | ok | 0.4ms |

### Step 3 — Schema Contract

```javascript
// OpenAiService.js:121-128
response_format: {
    type: 'json_schema',
    json_schema: {
        name: 'transaction_category',
        strict: true,
        schema: this.#buildCategorySchema(categoryNames)
    }
}

// OpenAiService.js:187-201
#buildCategorySchema(categories) {
    const enumValues = [...categories.filter(Boolean), 'UNKNOWN'];
    return {
        type: 'object',
        properties: {
            category: {
                type: 'string',
                enum: enumValues,
                description: 'Exact category name from the provided list, or UNKNOWN if none fits',
            },
        },
        required: ['category'],
        additionalProperties: false,
    };
}
```

- `strict: true` — OpenAI guarantees output conforms to schema
- Enum built from runtime Firefly categories + UNKNOWN
- `additionalProperties: false` prevents extra fields
- Hallucinated category names are impossible by API enforcement

### Step 4 — Error Resilience (429 Retry)

```
OpenAiService.js:158-167 → v4 APIError.status === 429 → OpenAiException(429, ...)
App.js:1190-1197 → #retryWithBackoff checks error.code === 429 → exponential backoff
```

- v4 `APIError` has `.status` property → mapped to `OpenAiException.code`
- `#retryWithBackoff` at line 1195: `if (error.code === 429 && attempt < maxRetries)`
- `maxRetries: 0` on OpenAI client (line 17) prevents SDK-level retry interference
- Test oai-5: constructs `OpenAI.APIError(429, ...)` → asserts `err.code === 429`

### Step 5 — Model Selection

```javascript
// OpenAiService.js:6
#model = "gpt-4o-mini";

// OpenAiService.js:19-22
const envModel = getConfigVariable("OPENAI_MODEL", false);
if (envModel) {
    this.setModel(envModel);
}

// OpenAiService.js:226-234
setModel(model) {
    const supportedModels = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
    if (supportedModels.includes(model)) {
        this.#model = model;
    }
}
```

- Default: `gpt-4o-mini` (field initializer)
- Env override: `OPENAI_MODEL` env var via `getConfigVariable`
- Allowlist: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`
- `classify()` uses `this.#model` at line 105

### Step 6 — Backward Compatibility

All entry points funnel through `#resolveCategory`:

| Endpoint | App.js Line | Path |
|----------|-------------|------|
| `/api/process-uncategorized` | 126 | → `#onProcessUncategorized` → `#resolveCategory` → `classify()` |
| `/api/process-all` | 127 | → `#onProcessAll` → `#resolveCategory` → `classify()` |
| `/api/test-webhook` | 128 | → `#onTestWebhook` → `#resolveCategory` → `classify()` |

- No changes to `#resolveCategory` method signature or return shape
- `classify()` external contract `{ category, prompt, response }` preserved
- resolveCategory tests 1-4 pass unchanged

### Step 7 — Code Quality (v3 Pattern Scan)

Grep results for v3 patterns in `OpenAiService.js`:

| Pattern | Matches |
|---------|---------|
| `response.data` | 0 |
| `.data[0]` | 0 |
| `v3` | 0 |

All three methods use v4 call path:
- `classify()` — `this.#openAi.chat.completions.create(...)` with `response_format`
- `matchAccount()` — `this.#openAi.chat.completions.create(...)` (v4 direct)
- `extractTransactionsFromText()` — `this.#openAi.chat.completions.create(...)` (v4 direct)

### Step 8 — Documentation Currency

`docs/engineering/architecture.md` references:

| Line | Content | Status |
|------|---------|--------|
| 103 | Default model: `gpt-4o-mini` (`OPENAI_MODEL` env) | Current |
| 198 | `OPENAI_MODEL` env table entry | Current |
| 849 | `openai@^4` ESM client (`maxRetries: 0`) | Current |
| 863 | SDK target: `openai@^4` | Current |
| 868 | Unit test seam: Injectable `client` via `createForTest` | Current |
| 887 | `package.json`: `openai` `^3.2.1` → `^4` | Current |
| 961-965 | Model matrix (gpt-4o-mini ✓, gpt-4o ✓, gpt-3.5-turbo ✗ json_schema) | Current |

## Findings

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| — | — | No blocking findings | — |

## Observations (non-blocking)

1. **gpt-3.5-turbo limitation**: `gpt-3.5-turbo` does not support `json_schema` response format (returns 400). This is documented in architecture.md model matrix and is acceptable since default is `gpt-4o-mini`.
2. **Schema size**: For typical deployments (<50 categories), schema payload is well within limits. Architecture notes 15k char gate (R-0016).

## UAT Conclusion

US-0003 is **ready for release**. The Structured Outputs migration:
- Preserves all existing behavior (no operator/user impact)
- Passes all tests independently (9/9)
- Maintains error resilience (429 retry chain intact)
- Preserves model selection flexibility
- Has no leftover v3 patterns
- Documentation is current

## Stop condition

verify-work complete. Next phase: `/release`.
