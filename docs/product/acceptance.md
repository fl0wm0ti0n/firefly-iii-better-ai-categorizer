# Acceptance

## US-0001 — Bootstrap automated test harness

- [x] AC-1: `tests/run-tests.sh` exists, is executable, and exits 0 on Linux CI.
- [x] AC-2: Tests cover `#resolveCategory` precedence (account mapping beats auto-cat beats AI mock) with at least 4 cases.
- [x] AC-3: `docs/engineering/runbook.md` `TEST_COMMAND` points to the working runner (OS-aware or dual sh/ps documented).
- [x] AC-4: `npm test` delegates to the test runner or documents the canonical command.
- [x] AC-5: CI workflow `checks` job runs TEST_COMMAND when set and reports pass/fail.

## US-0002 — Product and user documentation alignment

- [x] AC-1: `docs/CODEBASE_ANALYSIS.md` reflects current stack (gpt-4o-mini, DEC-0001 mapping layers including account mappings, API v1.1.0, test harness reference post-US-0001).
- [x] AC-2: `python scripts/validate_readme_feature_coverage.py --report` exits 0 (or documents known gaps with enforce off).
- [x] AC-3: `docs/user-guides/US-0002.md` exists with required schema (Purpose, Prerequisites, Usage steps, Example, Limitations, Troubleshooting) — operator documentation map for the categorizer.
- [x] AC-4: `docs/product/vision.md` and README categorization pipeline descriptions are consistent (same step order and terminology).

## US-0003 — OpenAI Structured Outputs migration

- [x] AC-1: `OpenAiService.classify()` uses Structured Outputs with category enum derived from Firefly category list.
- [x] AC-2: Invalid/hallucinated category names cannot be returned (schema enforcement).
- [x] AC-3: Existing webhook, bulk, and test-webhook paths pass US-0001 regression tests without behavior regression on happy path.
- [x] AC-4: `OPENAI_MODEL` env still selects model; default remains `gpt-4o-mini`.
- [x] AC-5: Rate-limit backoff (`#retryWithBackoff`) still applies on 429 responses.

## US-0004 — Account history suggestions with AI comparison and review queue

- [x] AC-1: System loads categorized transaction history per expense account from Firefly and computes dominant category share; default threshold 80% (configurable via UI or `data/` config).
- [x] AC-2: When dominance threshold met, a **history suggestion** is produced with confidence = dominant share (e.g. 0.85 for 85%).
- [x] AC-3: AI classification still runs; result includes AI category and AI confidence (from OpenAiService or explicit compare step).
- [x] AC-4: When history and AI disagree (or both present), item enters **pending review queue** — category is **not** written to Firefly until operator clicks Accept.
- [x] AC-5: UI panel lists pending items showing transaction summary, history category + confidence, AI category + confidence, recommended choice, Accept and Reject actions.
- [x] AC-6: Accept applies category + optional tag in Firefly and removes item from queue; Reject dismisses without Firefly mutation.
- [x] AC-7: Hard account mappings (DEC-0001 step 1) and existing auto-cat rules still take precedence — no review queue entry when pipeline stops earlier.
- [x] AC-8: `docs/user-guides/US-0004.md` documents review workflow (USER_GUIDE_MODE=1).

## US-0005 — Admin UI consolidation (run, monitor, expense/income scope)

- [x] AC-1: Sidebar **Categorizer** group no longer exposes separate **Bulk Categorization**, **Batch Jobs**, and **Individual Jobs** entries — replaced by one **Categorization** (or equivalent) panel for run + monitor.
- [x] AC-2: Unified panel provides run actions for **Process Uncategorized**, **Process All**, and **Test Webhook** without navigating to a different sidebar section.
- [x] AC-3: Single **transaction scope** control expresses expense/income intent (e.g. withdrawals only, deposits only, both) and honors **Skip Deposits** from General Settings when applicable — no conflicting duplicate controls across panels.
- [x] AC-4: Integrated **job monitor** on the same panel lists **batch jobs** and **individual jobs** together (distinguishable by type badge), with live Socket.io updates, batch pause/resume/cancel controls, and individual job classification details.
- [x] AC-5: Starting a bulk run or webhook test keeps the operator on the unified panel (progress visible without manual sidebar hunt); stale copy referencing “individual jobs section below” is removed.
- [x] AC-6: Existing REST endpoints (`/api/process-uncategorized`, `/api/process-all`, `/api/test-webhook`, batch-job control routes) remain callable without contract change.
- [x] AC-7: Side-panel nav groups (**Categorizer / Special tools / Maintenance**) and collapsible-section interaction model from vision are preserved.
- [x] AC-8: `docs/user-guides/US-0005.md` documents the consolidated workflow (USER_GUIDE_MODE=1).

## US-0006 — Agent-driven local Categorizer launch for Cursor browser UAT probes

- [x] AC-1: `.cursor/dev-environment.json` exists and declares a deterministic local launch `start_command`, a `health_url` reachable at `GET http://localhost:<port>/health`, a `poll_seconds` / `poll_interval_seconds` matching scratchpad (`60` / `2`), required env vars / `env_file`, and a `browser_probe_url` pointing to `http://localhost:<port>/`.
- [x] AC-2: Docker Compose service config supports ephemeral local launch of the `categorizer` service without breaking the existing production `categorizer.omniflow.cc` deployment (e.g., repo-local override or isolated profile, stable host port `3000`/`3001`, unchanged production compose labels).
- [x] AC-3: Local service URL is reachable from the Cursor IDE browser MCP — either via a local Traefik router/label set documented in the compose/override, or via direct port binding with explicit notes in `docs/engineering/architecture.md` or runbook.
- [x] AC-4: The agent can trigger the launch command, wait for `health_url` to return HTTP 200, and open the `browser_probe_url` through the Cursor browser MCP.
- [x] AC-5: Browser UAT probe collects console error evidence and the `GET /api/reviews` response body (success or structured error) without throwing a JSON `SyntaxError` on HTML responses.
- [x] AC-6: `docs/user-guides/US-0006.md` documents the local agent-driven UAT flow (Purpose, Prerequisites, Usage steps, Example, Limitations, Troubleshooting) with `USER_GUIDE_MODE=1`.

## US-0007 — Keyword mapping direct-assign mode

- [x] AC-1: Keyword mapping data model supports an optional `directAssign` boolean field; when absent, behavior is identical to today (AI-hint mode).
- [x] AC-2: When `directAssign: true` on an enabled mapping and a keyword loosely matches the transaction, the target category is assigned directly without calling OpenAI — the pipeline returns immediately with `autoRule: 'category_mapping_direct'`.
- [x] AC-3: When `directAssign: false` or undefined (default), existing AI-hint behavior is preserved — keyword match replaces description hint for OpenAI as before.
- [x] AC-4: Direct-assign check is placed at the existing AI-hint slot in `#resolveCategory()` (after account mapping and auto-categorization, where `#categoryMappingService.getAiHint()` is currently called). Account mapping and auto-categorization retain first-tier precedence.
- [x] AC-5: Admin UI provides a per-mapping "Direct assign" toggle for each keyword mapping in the Keyword → Category Mappings panel.
- [x] AC-6: All existing keyword mappings without the `directAssign` field continue to function as AI hints (backward compatible, no migration required).
- [x] AC-7: Regression tests pass (existing 18/18 suite plus new precedence test(s) covering direct-assign vs AI-hint paths).

## US-0008 — Account → Category Mappings UI: live search + multi-select bulk assign

- [x] AC-1: Account → Category Mappings form exposes a live search input that filters the displayed account list by case-insensitive substring match; results update as the user types (no form submit required).
- [x] AC-2: Each visible account row in the filtered list has a checkbox; multi-select is supported across any number of visible rows.
- [x] AC-3: A "Select all filtered" action (checkbox or button) toggles all accounts that currently match the filter. Deselect clears the current selection.
- [x] AC-4: A target-category dropdown plus a "Bulk assign" button sends a single request to `POST /api/account-category-mappings/bulk` that creates account→category mappings for all selected accounts in one round-trip.
- [x] AC-5: Already-mapped accounts are displayed in the list (no longer hidden from the dropdown) and visually highlighted with a yellow row background and a "MAPPED" badge; hover or inline text shows the current target category. Clicking "Bulk assign" on an already-mapped account updates (upserts) the mapping rather than failing.
- [x] AC-6: After bulk assign, the UI shows per-account feedback (count of created/updated mappings, any per-item failures with reason).
- [x] AC-7: Existing regression suite (18/18) remains green. New coverage: bulk endpoint tests (happy path, duplicate-skip or upsert, unknown category, partial failure) via `node:test`.

## Bug acceptance (canonical)

- [x] BUG-0003: `POST /api/account-category-mappings/bulk` returns HTTP 200 JSON on production (`categorizer.omniflow.cc`) with a valid mapping payload.
- [x] BUG-0003: The UI toast shows "Bulk assign complete!" with created/updated/skipped counts instead of a JSON parse error.
- [x] BUG-0003: Production container runs the US-0008 image (route present in running `App.js`).

- [x] BUG-0001: Page load — no `Unexpected token < in JSON` console error from `loadCategoriesForKeywordMappings`.
- [x] BUG-0001: `GET /api/categories` returns `{ success: true, categories: [...] }` when Firefly is reachable, or a structured `{ success: false, error: "<actionable message>" }` (not a raw JSON-parse exception string) when Firefly is unreachable or misconfigured.
- [x] BUG-0001: `FireflyService.getCategories()` sends `Accept: application/json` (per R-0001) and validates response content-type before parsing JSON.
- [x] BUG-0001: Keyword-mapping and account-mapping category `<select>` elements populate when Firefly returns categories. *(operator PAT UAT completed 2026-06-26 — fresh token confirmed category dropdowns populate from live Firefly)*

## BUG-0002 — Pending Reviews endpoint returns HTTP 404 HTML → `loadPendingReviews` JSON parse error

- [x] BUG-0002: Page load — no `GET /api/reviews 404 (Not Found)` and no `SyntaxError: Unexpected token '<'` console error from `loadPendingReviews` on a healthy deployment.
- [x] BUG-0002: `GET /api/reviews` returns HTTP 200 JSON `{ success: true, reviews: [...] }` when healthy, or a structured `{ success: false, error: "..." }` (not HTML) when the endpoint fails.
- [x] BUG-0002: If `GET /api/reviews` returns a structured `{ success: false, error: "..." }`, `loadPendingReviews` surfaces the error in the UI and does not throw a JSON parse `SyntaxError`.
- [x] BUG-0002: When the endpoint returns a review list, the Pending Reviews panel renders each item with transaction summary, history category + confidence, AI category + confidence, recommended choice, and Accept/Reject actions.
        