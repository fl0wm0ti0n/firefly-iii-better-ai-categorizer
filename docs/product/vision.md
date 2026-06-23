# Vision

## Problem

Firefly III users accumulate uncategorized bank transactions. Manual categorization
is repetitive, and Firefly's built-in rules only handle simple keyword matches — not
semantic cases like merchant name variations or foreign travel expenses.

Operators need a sidecar service that:

- Reacts automatically when new transactions arrive (webhook)
- Applies deterministic rules first (**Account → Category Mappings**, then auto-categorization heuristics)
- Falls back to AI only when rules cannot decide
- **Learns from account history:** When an expense account's past transactions
  strongly favor one category (e.g. ≥80%), surface that as a suggestion — compared
  with AI and shown for explicit operator approval before applying
- Provides a web UI for bulk processing, configuration, and maintenance tools

## Audience

- **Primary:** Personal finance users running self-hosted Firefly III who want
  hands-off expense categorization with optional fine-grained control.
- **Secondary:** Operators maintaining the categorizer in Docker alongside their
  Firefly stack (single-user, PAT-authenticated).

## Value

| Benefit | How |
|---------|-----|
| Time saved | Webhook + bulk modes categorize without opening Firefly for every tx |
| Cost control | Pre-AI rule layers skip OpenAI for obvious cases |
| Accuracy over time | Word mappings, keyword hints, account-history suggestions vs AI, failed-tx review |
| Operator visibility | Real-time job progress, test webhook, failed-tx enrich from Firefly |
| Beyond categorization | CC statement splitter, duplicate cleanup, drag-drop transaction UI |

## Look and Feel

- **Admin UI** (`ENABLE_UI=true`): Light gray background, white content panels,
  left side-panel navigation grouped as Categorizer / Special tools / Maintenance.
- **Interaction model:** Collapsible sections with item counters; drag-and-drop
  for transaction categorization; live Socket.io progress for batch jobs.
- **UI consolidation (US-0005):** Categorization **run + monitor** belongs in one
  workspace — not split across separate sidebar entries for bulk actions, batch
  progress, and individual/webhook jobs. Expense (withdrawal) vs income (deposit)
  scope is chosen once per run and respects global skip-deposits; operators should
  not hunt across panels to start a job and read its outcome.
- **Tone:** Practical operator tool — not a consumer fintech app. Emoji used
  sparingly in UI labels and logs for scanability.
- **Error surfacing (BUG-0001 fix scope):** Keyword-mapping and account→category
  mapping category dropdowns must load silently when Firefly is healthy. When
  Firefly is unreachable or misconfigured, operators see **actionable** failure
  copy in the dropdown (or existing toast pattern) — not cryptic JSON-parse
  messages in the browser console. Backend detects non-JSON Firefly responses
  before parsing and returns structured `{ success: false, error: "<actionable>" }`
  from `/api/categories` (R-0006).

## Test harness (developer / operator — US-0001)

US-0001 is **not** user-facing (`user_visible: false`). Operators and contributors
verify categorization pipeline behavior via CLI and CI only.

| Surface | Operator expectation |
|---------|-------------------|
| **Canonical command** | `TEST_COMMAND` in `docs/engineering/runbook.md` — sole source for local pre-push (`scripts/validate-and-push.sh`) and GitHub Actions `checks` job |
| **Linux (primary)** | `./tests/run-tests.sh` — executable, exits 0 when green (AC-1) |
| **Windows (optional)** | `tests/run-tests.ps1` documented alongside shell runner when dual-runner is supported (AC-3) |
| **npm alias** | `npm test` delegates to the same runner — one mental model, no duplicate docs |
| **Automation** | Scratchpad `LOOP_UNTIL_GREEN=1` / `RUN_TESTS_ON_EDIT=1` assume a working `TEST_COMMAND` |
| **Scope** | Mocked `#resolveCategory` precedence tests — no live Firefly or OpenAI in CI |
| **Evidence (future)** | Passing runs may emit `tests/report.md` per its-magic release gates (runbook references) |

**Tone:** Practical maintainer tooling — fast feedback on pipeline changes, not a
test dashboard. Failures should name the precedence case and expected vs actual
category (not stack traces alone).

## Documentation alignment (operator — US-0002)

US-0002 is **user-visible** (`user_visible: true`) — operators rely on accurate
docs when configuring mappings, running bulk jobs, and troubleshooting Firefly
connectivity.

| Surface | Operator expectation |
|---------|---------------------|
| **README (canonical features)** | Feature list and pipeline diagram match shipped behavior; passes `validate_readme_feature_coverage.py` when `README_FEATURE_COVERAGE_ENFORCE=1` |
| **CODEBASE_ANALYSIS.md** | Maintainer-oriented architecture summary aligned with README and DEC-0001 — not stale model names or simplified pipelines |
| **vision.md** | Product narrative (pipeline order, UI IA, test harness) consistent with README |
| **User guides** | Per-story how-tos at `docs/user-guides/US-xxxx.md`; US-0002 guide is the **documentation map** (where to find setup, pipeline, feature guides) |
| **Runbook / developer README** | `TEST_COMMAND` and quality gates documented; no contradiction with vision test-harness section post-US-0001 |

**Pipeline order (DEC-0001):** Account → Category Mappings → auto-categorization → word mappings → keyword hints → AI. Numbered diagram and step detail live in [README § Categorization Process Flow](../../its_magic/README.md#categorization-process-flow).

**Tone:** Practical operator reference — docs should answer "where do I look?" and
"does this match my deployment?" without requiring codebase access.

## UX References

### Admin UI

- Existing UI: `public/index.html` (reference implementation)
- Side-panel IA: Categorizer / Special tools / Maintenance (US-0005 consolidation target)
- Real-time job progress via Socket.io; collapsible sections with item counters

### Documentation (operator — US-0002)

Operators should answer **“where do I look?”** without opening the codebase.
The US-0002 user guide is a **documentation map** — not a duplicate of README
feature prose.

| Need | Canonical surface | Notes |
|------|-------------------|-------|
| Setup, env vars, webhook | `README.md` § Installation, webhook images | PAT + Firefly URL |
| Pipeline order (5 steps) | `README.md` § Categorization Process Flow | Account → Category Mappings → auto-cat → word mappings → keyword hints → AI |
| Bulk / precedence detail | `docs/BULK_CATEGORIZATION_GUIDE.md` | Linked from README pipeline section |
| Foreign/travel rules | `docs/AUTO_CATEGORIZATION_GUIDE.md` | Auto-cat step 3 |
| Word / keyword mappings | `docs/WORD_MAPPING_GUIDE.md` | Steps 4–5 hints |
| Drag-drop tx UI | `docs/TRANSACTION_MANAGEMENT_GUIDE.md` | Special tools |
| Docker deploy | `docs/DOCKER_GUIDE.md` | Production stack |
| Duplicate cleanup | `docs/DUPLICATE_CLEANUP_GUIDE.md` | Maintenance |
| Product narrative | `docs/product/vision.md` (this file) | IA, pipeline intent, test harness |
| Maintainer deep-dive | `docs/CODEBASE_ANALYSIS.md` | Post-refresh: gpt-4o-mini, DEC-0001, API v1.1.0, test harness |
| Quality gates / tests | `docs/developer/README.md`, `docs/engineering/runbook.md` | `TEST_COMMAND`; README coverage validators |
| Per-story how-tos | `docs/user-guides/US-xxxx.md` | USER_GUIDE_MODE=1; US-0002 establishes map pattern |

**Legacy vs canonical guides:** Feature how-tos live at `docs/*_GUIDE.md` today;
new user-visible stories add `docs/user-guides/US-xxxx.md` at execute time.
US-0002 links both layers in one operator map.

**Tone:** Practical reference — tables and links over narrative duplication;
troubleshooting points to README § Troubleshooting and guide-specific sections.

### Developer / maintainer

- README feature overview and categorization pipeline diagram (`README.md` /
  `its_magic/README.md` — identical; coverage gate reads `its_magic/README.md`)
- Developer workflow: `docs/developer/README.md` (quality gates, `TEST_COMMAND`)
- Docs-as-code sync pattern: R-0009 (validator-driven done, in-repo only)
