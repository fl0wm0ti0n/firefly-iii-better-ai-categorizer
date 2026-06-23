# Design Concept — US-0003 OpenAI Structured Outputs migration

## Summary

Migrate `OpenAiService.classify()` from OpenAI SDK v3 free-text parsing to v4
Structured Outputs with a runtime category enum, while preserving the external
`{ category, prompt, response }` contract and existing `#resolveCategory` regression
tests.

## Goals

- Enforce valid category names at the API layer via `json_schema` + `strict: true` (AC-1, AC-2).
- Upgrade shared client to `openai@^4` ESM with `maxRetries: 0` so `#retryWithBackoff` owns 429 policy (AC-5).
- Preserve `OPENAI_MODEL` env and `setModel()` allowlist (AC-4).
- Add maintainer unit tests with injectable mock client — no live API in CI (R-0017).
- Keep `tests/resolveCategory.test.js` 4/4 green without stub changes (AC-3).

## Non-goals

- Structured Outputs on `matchAccount()` or `extractTransactionsFromText()` (v4 call-path only).
- Fine-tuning, alternative LLM providers, prompt UI changes.
- Extending classify return shape with confidence (US-0004 adjacency).
- Live OpenAI integration tests in CI.

## Key decisions

- **DEC-0009** — Injectable OpenAI client via `OpenAiService.createForTest({ client })`.
- **DEC-0010** — Partial v4 migration: schema-locked `classify()`; sibling methods legacy parse.
- **R-0015** — v4 ESM init, API mapping, contract preservation, `maxRetries: 0`.
- **R-0016** — Runtime enum builder, UNKNOWN mapping, schema size limits.
- **R-0017** — Unit test matrix (oai-1–oai-5) + regression layer unchanged.
