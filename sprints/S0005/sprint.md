# Sprint S0005 — US-0003

ID: S0005  
Work item: US-0003  
Orchestrator run: `auto-20260614T161000Z-us0003`

## Goal

OpenAI Structured Outputs migration — SDK v4 upgrade with schema-locked `classify()`
only. per **DEC-0009** (injectable client test seam), **DEC-0010** (partial v4
migration policy), and research **R-0015–R-0017**. Implements deferred scope from
**DEC-0003** (unblocked by US-0001/S0003).

**Unblocks:** US-0004 confidence-shape extension (adjacent; not in AC).

## Scope

| In scope | Out of scope |
|----------|--------------|
| `OpenAiService.classify()` → `json_schema` + runtime enum + `UNKNOWN` | Fine-tuning, multi-provider LLM |
| `openai@^4` ESM client (`maxRetries: 0`) shared by all methods | Structured Outputs on `matchAccount` / `extractTransactionsFromText` |
| Preserve `{ category, prompt, response }` external contract | Prompt UI / operator workflow changes |
| `tests/openAiService.test.js` (mock client, no live API) | Live OpenAI integration tests in CI |
| `tests/resolveCategory.test.js` 4/4 unchanged (stub seam) | `App.js` / `#retryWithBackoff` changes |

## Tasks

| ID | Title | Required |
|----|-------|----------|
| T-0018 | Pin `openai@^4` in `package.json` | Yes |
| T-0019 | Constructor + `createForTest` + v4 error mapping | Yes |
| T-0020 | `#buildCategorySchema` + `classify()` Structured Outputs | Yes |
| T-0021 | `matchAccount` + `extractTransactionsFromText` v4 call path | Yes |
| T-0022 | `tests/openAiService.test.js` (oai-1–oai-5) | Yes |
| T-0023 | Full `bash tests/run-tests.sh` green | Yes |

**Task count:** 6 required (under `SPRINT_MAX_TASKS=12`; no split).

## Risks

- **O1:** Constructor shared by 3 methods — unit tests + unchanged resolveCategory stubs mitigate partial migration regression.
- **O2:** `maxRetries: 0` on client ensures `#retryWithBackoff` remains sole 429 policy (DEC-0010).
- **O3:** `gpt-3.5-turbo` classify will 400 on `json_schema` — acceptable; default `gpt-4o-mini`.
- **O4:** Map `OpenAI.APIError.status` → `OpenAiException.code` at boundary for retry compatibility.
- **O5:** <50 categories → schema well under 15k char API limit (R-0016).
- **O6:** oai-1 asserts runtime enum on captured request to prevent over-mocking.

## Definition of Done

- All US-0003 acceptance rows (AC-1 through AC-5) covered by tasks T-0018–T-0023.
- `bash tests/run-tests.sh` exits 0 with 4/4 precedence + new unit tests (oai-1–oai-5).
- `OpenAiService.classify()` uses `json_schema` with `strict: true` and runtime enum.
- `tests/resolveCategory.test.js` 4/4 unchanged (stub seam invisible to SDK migration).
- `OPENAI_MODEL` env still selects model; default `gpt-4o-mini`.
- `#retryWithBackoff` still applies on 429 (error.code === 429 preserved).
- `/plan-verify` coverage recorded in `plan-verify.json` (next phase).

## References

- `docs/engineering/architecture.md` (# US-0003)
- `decisions/DEC-0009.md`, `decisions/DEC-0010.md`
- `docs/engineering/research.md` (R-0015–R-0017)
- `docs/product/acceptance.md` (US-0003 AC-1–AC-5)
- `docs/engineering/spec-pack/US-0003-crs.md`
- `docs/engineering/spec-pack/US-0003-design-concept.md`
- `docs/engineering/spec-pack/US-0003-technical-specification.md`
- `handoffs/po_to_tl.md` (discovery integration points)
