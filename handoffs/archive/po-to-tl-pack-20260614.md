# PO to TL archive pack (2026-06-14)

- Rollover trigger: `PO_TO_TL_HOT_MAX_LINES=650, PO_TO_TL_HOT_MAX_SECTIONS=60`
- Source: `handoffs/po_to_tl.md`
- Archived units (oldest first, contiguous prefix): 2
- Retained units in hot file: 50
- First archived heading: `## Summary (2026-06-14 — US-0003 discovery complete)`
- Last archived heading: `## Intake + discovery evidence`
- Verification tuple (mandatory):
  - archived_body_lines=97
  - retained_body_lines=641

---

## Summary (2026-06-14 — US-0003 discovery complete)

**Story:** **US-0003** — OpenAI Structured Outputs migration (Priority 3, OPEN,
`user_visible: false`).

**Discovery phase:** Integration points and maintainer test expectations confirmed.
No operator UX surfaces; single ai-reliability vertical slice unchanged.

| Field | Value |
|-------|-------|
| Primary deliverable | Migrate `OpenAiService.classify()` to Structured Outputs (`json_schema`, `strict: true`, category enum from Firefly list) |
| Operator impact | **None** — categorization outcomes unchanged on happy path; no admin UI, copy, or workflow changes |
| Maintainer impact | New `tests/openAiService.test.js` unit layer; existing `tests/resolveCategory.test.js` 4/4 must stay green |
| SDK path | `openai@^3.2.1` → v4+; constructor shared by all methods; only `classify()` gets schema lock |
| Return contract | Preserve `{ category, prompt, response }`; map `UNKNOWN` enum → `{ category: null, … }` |
| scope_in (unchanged) | `classify()` only + US-0001 regression (4/4) + `OPENAI_MODEL` env + `#retryWithBackoff` on 429 |
| scope_out (unchanged) | `matchAccount()`, `extractTransactionsFromText()` stay legacy prompt+parse |

**Decomposition decision:** Keep as one story — SDK upgrade and schema-locked
`classify()` without regression signal is an incomplete deliverable.

**Alternative rejected:** Split SDK upgrade vs classify — technical-layer split with
no independent operator value.

### UX / design references

| Surface | Discovery note |
|---------|----------------|
| **Operator UI** | No change — `user_visible: false`; webhook/bulk/test-webhook behavior identical on happy path (AC-3) |
| **Logs** | Existing `console.info` / `console.warn` on classify success/failure may shift wording; no new operator-facing panels |
| **Failed transactions** | Unchanged — null category still routes to failed-tx queue when AI cannot classify |
| **Test harness** | Maintainer-only — `bash tests/run-tests.sh` canonical; stubbed `classify()` contract is the regression seam (vision § Test harness) |

No vision.md delta required — backend reliability story with no Look and Feel change.

### Integration points (confirmed brownfield)

#### Primary mutation surface

| Component | Location | Role |
|-----------|----------|------|
| `OpenAiService.classify()` | `src/OpenAiService.js` ~101–185 | **Migrate target** — v3 `createChatCompletion` + free-text parse → v4 `json_schema` enum |
| `#generatePrompt()` | `src/OpenAiService.js` ~187–208 | Prompt text for user message; may simplify system message when schema carries enum |
| Constructor / `#openAi` init | `src/OpenAiService.js` ~14–28 | v3 `Configuration`/`OpenAIApi` → v4 `OpenAI` client — **shared** by `matchAccount`, `extractTransactionsFromText` |
| `OpenAiException` | `src/OpenAiService.js` ~271–283 | 429/401/400 throw path — must remain for AC-5 |

#### Callers (contract must not change)

| Caller | Location | Path |
|--------|----------|------|
| `#resolveCategory` | `App.js` ~1118–1187 | Sole production entry — calls `classify(categoryNames, mappedDestinationName, mappedDescription, transactionType, classifyOptions)` via `#retryWithBackoff` |
| `#retryWithBackoff` | `App.js` ~1190–1204 | Retries on `error.code === 429`; **unchanged** per AC-5 |

**Call args (stable):** `categoryNames` = `Array.from(categories.keys())`; word-mapping and keyword-hint options pass through `classifyOptions.suggestedCategory`.

**Return consumption:** Caller checks `aiResult.category && categories.has(aiResult.category)`; null/UNKNOWN → failed-tx path downstream.

#### Pipeline paths exercising `classify()` (AC-3 regression scope)

| Path | Entry | Chain to `#resolveCategory` |
|------|-------|----------------------------|
| **Webhook** | `POST /webhook` → `#onWebhook` → `#handleWebhook` | Queue job ~328–349 |
| **Bulk** | `#processAllTransactions` → `#processTransaction` | ~1212 |
| **Test webhook** | `POST /api/test-webhook` → `#onTestWebhook` | Builds fake payload → `#handleWebhook` ~450 |
| **Split / CC items** | Per-item fake tx in split handlers | ~1523, ~2513 — same `#resolveCategory`; covered indirectly by pipeline tests |

**Not in scope:** `matchAccount()` (~1537, ~2525 revenue-side merchant match) and `extractTransactionsFromText()` — legacy v4 chat on shared client, no schema migration.

#### Test seams (maintainer UX)

| Layer | File | Discovery expectation |
|-------|------|---------------------|
| **Regression (AC-3)** | `tests/resolveCategory.test.js` | 4 cases stub `openAi: { classify }` via `App.createForTest` — **must not change** when `classify()` internals migrate |
| **Unit (new)** | `tests/openAiService.test.js` (planned) | Mock v4 client or inject fetch; assert runtime enum includes Firefly categories + `UNKNOWN`; refusal/UNKNOWN → null mapping |
| **Runner** | `tests/run-tests.sh` | Canonical gate — exit 0 when all pass |

### Current vs target `classify()` behavior

| Aspect | Current (brownfield) | Target (acceptance) |
|--------|---------------------|---------------------|
| API | v3 `createChatCompletion`, free-text `message.content` | v4 chat + `response_format: { type: 'json_schema', strict: true, … }` |
| Validation | Post-hoc `categories.indexOf(guess)` | Schema enum enforcement (AC-2) |
| UNKNOWN | Free-text `"UNKNOWN"` → null if not in list | Enum value `UNKNOWN` → `{ category: null, response: 'UNKNOWN', prompt }` |
| 429 | `OpenAiException` thrown | Same — `#retryWithBackoff` unchanged |
| Model | `#model` from `OPENAI_MODEL` / default `gpt-4o-mini` | Preserved (AC-4); `setModel()` allowlist may need snapshot review in research |

## Intake + discovery evidence

- **Intake pack:** `small-intake-pack`
- **Intake run ID:** `intake-20260614-us0003`
- **Discovery marker:** `discovery-20260614-us0003`
- **Orchestrator:** `auto-20260614T161000Z-us0003`
- **Bundle:** `handoffs/intake_evidence/intake-20260614-us0003.json`
- **Research:** R-0002 (classification patterns), R-0014 (SDK migration path)
- **Decision refs:** DEC-0003 (defer-until-harness — unblocked)
- **Spec-pack CRS:** `docs/engineering/spec-pack/US-0003-crs.md` (SPEC_PACK_MODE=1)

