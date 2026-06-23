# Technical Specification — US-0003 OpenAI Structured Outputs migration

## Overview

Single-file primary mutation (`src/OpenAiService.js`) plus `package.json` dependency
pin and new unit test file. Architecture: `docs/engineering/architecture.md` (# US-0003).
No `App.js` changes expected.

## Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| SDK dependency | `package.json` | `openai@^4` (ESM default import) |
| OpenAI service | `src/OpenAiService.js` | v4 client, `classify()` schema, sibling v4 paths, `createForTest` |
| Unit tests | `tests/openAiService.test.js` (new) | Schema enum, UNKNOWN, refusal, 429 mapping |
| Regression tests | `tests/resolveCategory.test.js` | Unchanged — 4 precedence stubs |
| Test runner | `tests/run-tests.sh` | Picks up new file via `node --test tests/` |

## Interfaces

### External `classify()` contract (stable — AC-3)

```javascript
async classify(categories, destinationName, description, transactionType = 'withdrawal', options = {})
// Returns: { category: string | null, prompt: string, response: string }
```

| Input | Notes |
|-------|-------|
| `categories` | `string[]` from `Array.from(categories.keys())` |
| `options.suggestedCategory` | Keyword hint; remains in user prompt |

| Output case | Mapping |
|-------------|---------|
| Valid category | `{ category, response: category, prompt }` |
| Enum `UNKNOWN` | `{ category: null, response: 'UNKNOWN', prompt }` |
| Refusal | `{ category: null, response: refusal, prompt }` |
| 429 | throws `OpenAiException` with `.code === 429` |

### Internal schema builder

Private method `#buildCategorySchema(categories)` returns JSON Schema object with
`enum: [...categories.filter(Boolean), 'UNKNOWN']`, `required: ['category']`,
`additionalProperties: false`.

### v4 request (`classify()` only)

```javascript
response_format: {
  type: 'json_schema',
  json_schema: {
    name: 'transaction_category',
    strict: true,
    schema: this.#buildCategorySchema(categories),
  },
}
```

### v4 client init

```javascript
import OpenAI from 'openai';

constructor(deps = {}) {
  const apiKey = getConfigVariable('OPENAI_API_KEY');
  this.#openAi = deps.client ?? new OpenAI({ apiKey, maxRetries: 0 });
  // OPENAI_MODEL / setModel unchanged
}

static createForTest(deps = {}) {
  return new OpenAiService(deps);
}
```

### Sibling methods (DEC-0010 — no schema)

| Method | v4 change |
|--------|-----------|
| `matchAccount()` | `this.#openAi.chat.completions.create(...)`; `response.choices[0].message.content` |
| `extractTransactionsFromText()` | Same |

Error handling in sibling methods: preserve existing swallow-and-return-empty behavior.

### Unit test cases (R-0017)

| ID | Mock behavior | Assertion |
|----|---------------|-----------|
| oai-1-schema-enum | Capture `create` params | enum includes categories + `UNKNOWN`; `strict: true` |
| oai-2-valid-category | `content: '{"category":"Groceries"}'` | `{ category: 'Groceries', ... }` |
| oai-3-unknown-null | `content: '{"category":"UNKNOWN"}'` | `{ category: null, response: 'UNKNOWN' }` |
| oai-4-refusal | `message.refusal` set | `{ category: null, ... }` |
| oai-5-429-exception | reject `OpenAI.APIError(429, ...)` | `err.code === 429` |

### Regression gate (AC-3)

```bash
bash tests/run-tests.sh
```

Expect exit 0: 4 resolveCategory cases + ≥5 openAiService cases.

## Non-functional

- **No CI API key:** All tests use injected mock client.
- **Operator UX:** No visible change on happy path.
- **Model compat:** `gpt-3.5-turbo` unsupported for Structured Outputs — document; default `gpt-4o-mini`.
- **Enum limits:** Safe for <50 Firefly categories (500 enum / 15k schema char caps per R-0016).
