# Sprint S0005 Summary

## Sprint metadata

| Field | Value |
|-------|-------|
| Sprint ID | S0005 |
| Work item | US-0003 |
| Goal | OpenAI Structured Outputs migration |
| Task count | 6 required |
| Sprint cap | 12 (SPRINT_MAX_TASKS) |
| Split required | No |
| Orchestrator run | auto-20260614T161000Z-us0003 |

## Task roster

| ID | Title | Depends on | AC mapping |
|----|-------|-----------|------------|
| T-0018 | Pin `openai@^4` in `package.json` | — | prerequisite |
| T-0019 | Constructor + `createForTest` + v4 error mapping | T-0018 | DEC-0009, AC-5 |
| T-0020 | `#buildCategorySchema` + `classify()` Structured Outputs | T-0019 | AC-1, AC-2 |
| T-0021 | `matchAccount` + `extractTransactionsFromText` v4 call path | T-0019 | DEC-0010 |
| T-0022 | `tests/openAiService.test.js` (oai-1–oai-5) | T-0020 | unit coverage |
| T-0023 | Full `bash tests/run-tests.sh` green | T-0021, T-0022 | AC-3 |

## Dependency chain

```
T-0018 → T-0019 → T-0020 → T-0022 → T-0023
                  → T-0021 ↗
```

## AC coverage matrix

| AC | Covered by |
|----|-----------|
| AC-1 | T-0020 |
| AC-2 | T-0020, T-0022 (oai-1) |
| AC-3 | T-0023 |
| AC-4 | T-0019 (constructor preserves OPENAI_MODEL), T-0020 (classify uses this.#model) |
| AC-5 | T-0019 (maxRetries: 0), T-0022 (oai-5 429 exception) |

## Key decisions

- **DEC-0009:** Injectable `client` via `createForTest` — mirrors DEC-0006 pattern.
- **DEC-0010:** Partial v4 migration — `classify()` gets schema; siblings get v4 call-path only.
- **R-0015:** `openai@^4` ESM; `maxRetries: 0` for single retry policy.
- **R-0016:** `json_schema` + `strict: true` + runtime enum from Firefly categories.
- **R-0017:** Unit test matrix (oai-1–oai-5) with mock client.

## Risks

| ID | Risk | Mitigation |
|----|------|-----------|
| O1 | Constructor shared by 3 methods | Unit tests + unchanged resolveCategory stubs |
| O2 | SDK + app double-retry on 429 | `maxRetries: 0` on client |
| O3 | `gpt-3.5-turbo` classify 400 | Acceptable; default `gpt-4o-mini` |
| O4 | v4 APIError shape drift | Map to `OpenAiException.code` at boundary |
| O5 | Long category names inflate schema | <50 cats typical; 15k char gate (R-0016) |
| O6 | Unit tests over-mock wiring | oai-1 asserts runtime enum on captured request |

## Task completion status

| ID | Status | Notes |
|----|--------|-------|
| T-0018 | done | `openai@^4` installed; v4 `OpenAI` class importable |
| T-0019 | done | Constructor uses `new OpenAI({ apiKey, maxRetries: 0 })`; `createForTest(deps)` added; v4 `APIError.status` → `OpenAiException.code` |
| T-0020 | done | `#buildCategorySchema` returns runtime enum schema; `classify()` sends `response_format: { type: 'json_schema', json_schema: { name: 'transaction_category', strict: true, schema } }`; UNKNOWN/refusal → null |
| T-0021 | done | `matchAccount()` + `extractTransactionsFromText()` use `chat.completions.create`; `.data` accessor removed |
| T-0022 | done | `tests/openAiService.test.js` — 5 cases (oai-1–oai-5) all pass |
| T-0023 | done | `bash tests/run-tests.sh` exits 0; 9/9 pass (4 existing + 5 new) |

## Definition of Done

- [x] All 6 tasks done (T-0018–T-0023)
- [x] `bash tests/run-tests.sh` exits 0
- [x] `tests/resolveCategory.test.js` 4/4 unchanged
- [x] `tests/openAiService.test.js` 5/5 new cases pass
- [x] `classify()` uses `json_schema` with `strict: true`
- [x] `OPENAI_MODEL` env still selects model
- [x] `#retryWithBackoff` still applies on 429 (error.code === 429 preserved)
- [x] `/plan-verify` coverage recorded

## References

- `docs/engineering/architecture.md` (# US-0003)
- `decisions/DEC-0009.md`, `decisions/DEC-0010.md`
- `docs/engineering/research.md` (R-0015–R-0017)
- `docs/product/acceptance.md` (US-0003 AC-1–AC-5)
