# S0005 Release Notes — US-0003 OpenAI Structured Outputs migration

**Sprint:** S0005
**Story:** US-0003
**Date:** 2026-06-14
**User-visible:** false (internal/maintainer change)
**Orchestrator run:** auto-20260614T161000Z-us0003
**Version:** 1.0.0
**Publish:** skipped (RELEASE_PUBLISH_MODE=disabled)

## Summary

Migrated `OpenAiService.classify()` to OpenAI Structured Outputs (JSON Schema with `strict: true`). The SDK upgrade from `openai@^3` to `openai@^4` enables schema-locked responses that prevent hallucinated category names by API enforcement rather than post-hoc validation.

## Key changes

- **SDK upgrade:** `openai@^3.2.1` → `openai@^4` (ESM client, `maxRetries: 0`)
- **Structured Outputs:** `classify()` sends `response_format: { type: 'json_schema', json_schema: { name: 'transaction_category', strict: true, schema: #buildCategorySchema(categoryNames) } }`
- **Dynamic enum:** Schema enum built from runtime Firefly categories + `UNKNOWN`; `additionalProperties: false`; `required: ['category']`
- **v4 error mapping:** `APIError.status` → `OpenAiException.code` (429 preserved for `#retryWithBackoff`)
- **Injectable client:** `createForTest` factory for unit test seam (DEC-0009)
- **Sibling methods:** `matchAccount()` and `extractTransactionsFromText()` migrated to v4 call path (DEC-0010)

## Test coverage

| Test file | Cases | Pass | Fail |
|-----------|-------|------|------|
| `tests/openAiService.test.js` | oai-1 through oai-5 | 5/5 | 0 |
| `tests/resolveCategory.test.js` | case-1 through case-4 | 4/4 | 0 |
| **Total** | **9** | **9** | **0** |

Duration: ~561ms. Exit 0.

## Breaking changes

**None.** External contract `{ category, prompt, response }` preserved. All three endpoints (`/api/process-uncategorized`, `/api/process-all`, `/api/test-webhook`) funnel through `#resolveCategory` → `classify()` without behavior change.

## Gate snapshot

| Gate | Verdict | Evidence |
|------|---------|----------|
| Check-in test | PASS | `bash tests/run-tests.sh` exit 0; 9/9 pass |
| QA completion | PASS | AC-1–AC-5 all verified; no blocking findings |
| UAT completion | PASS | 8/8 validation steps passed |
| Isolation compliance | PASS | All phase isolation evidence present and valid |
| Finalization | PASS | Backlog/acceptance/queue/state reconciled |

## Non-blocking observations

1. **gpt-3.5-turbo limitation:** Does not support `json_schema` response format (returns 400). Documented in architecture.md model matrix. Acceptable since default is `gpt-4o-mini`.
2. **Schema size:** For typical deployments (<50 categories), schema payload is well within limits (15k char gate per R-0016).

---

## Run

- **Start command:** `bash tests/run-tests.sh`
- **Runtime mode:** local (Node.js)
- **Runtime context ref:** `docs/engineering/architecture.md`

## Connect

- **Service URL:** n/a (internal change; no new endpoints)
- **Service port:** existing (3000)
- **Health endpoint:** existing

## Verify

1. `bash tests/run-tests.sh` — expect 9/9 TAP pass, exit 0
2. Verify `classify()` sends `response_format.type === 'json_schema'` with `strict: true`
3. Verify 429 retry chain: `error.code === 429` triggers `#retryWithBackoff`
4. Verify `OPENAI_MODEL` env var selects model (default `gpt-4o-mini`)

## Credentials

- **Env names only:** `OPENAI_API_KEY`, `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- **No new credentials required** for this release

## Known Issues

- BUG-0001 AC-4: operator PAT dropdown UAT deferred — see `handoffs/releases/S0002-release-notes.md`
