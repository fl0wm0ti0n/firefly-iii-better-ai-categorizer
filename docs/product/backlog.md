# Backlog

## Decomposition (intake 2026-06-12)

- **Decision:** Split into 3 stories (not 1).
- **Rationale:** Brownfield codebase with distinct risk boundaries — quality
  gates, documentation hygiene, and AI reliability are independently deliverable.
- **Axes:** quality-engineering, documentation, ai-reliability.
- **Deferred areas:** categorization-pipeline (operational per DEC-0001),
  deployment (stable per DEC-0002).
- **Evidence:** `handoffs/intake_evidence/intake-20260612-product-backfill.json`

## US-0001 — Bootstrap automated test harness

- Status: DONE
- Priority: 1
- user_visible: false
- summary: Add runnable test suite and wire runbook TEST_COMMAND so CI and local dev can verify categorization pipeline safely.
- scope_in: Unit/integration tests for #resolveCategory precedence, service mocks, Linux shell runner (`tests/run-tests.sh`), runbook update.
- scope_out: Full App.js decomposition, E2E against live Firefly/OpenAI.
- depends_on: none
- blocks: US-0003
- risks: Runbook currently references missing `tests/run-tests.ps1` (R6).
- intake_evidence: `handoffs/intake_evidence/intake-20260613-us0001.json` (drain-advance 2026-06-13)
- discovery (2026-06-13): Single vertical-slice story (no split). Test seam: private `#resolveCategory` on `App.js` (~1098) — recommend minimal injectable-deps factory (not full route extraction). Mock strategy: stub `OpenAiService.classify()`; real or fixture-backed mapping services via temp `DATA_DIR`; categories as in-memory `Map`. Runner: Node native `node:test` (no new npm deps). ≥4 precedence cases documented in handoff.

## Decomposition (intake 2026-06-13 — US-0001 drain-advance)

- **Decision:** Single story (unchanged from product backfill).
- **Rationale:** Quality-engineering vertical slice remains atomic — Linux runner + precedence tests + runbook/CI wiring ship together.
- **Scope refresh:** AC-1 prioritizes `tests/run-tests.sh` (Linux CI); optional `run-tests.ps1` documented in AC-3.
- **Prior evidence confirmed:** `handoffs/intake_evidence/intake-20260612-product-backfill.json` (US-0001 plan_area `quality-engineering`).
- **Evidence:** `handoffs/intake_evidence/intake-20260613-us0001.json`

## US-0002 — Product and user documentation alignment

- Status: DONE
- Priority: 2
- user_visible: true
- summary: Align product docs with shipped features; refresh stale analysis; create per-story user guides where USER_GUIDE_MODE=1.
- scope_in: Refresh `docs/CODEBASE_ANALYSIS.md` (gpt-4o-mini, DEC-0001 mapping layers, API v1.1.0, test harness post-US-0001); ensure `validate_readme_feature_coverage.py --report` green (`README_FEATURE_COVERAGE_ENFORCE=1`); reconcile `docs/product/vision.md` pipeline with README; add operator doc-map user guide `docs/user-guides/US-0002.md`; cross-check runbook `TEST_COMMAND` vs vision test-harness section.
- scope_out: Marketing site, non-English translations, runtime/API code changes.
- depends_on: none
- risks: README_FEATURE_COVERAGE_ENFORCE=1 and PROJECT_README_ENFORCE=1 may surface backlog/README gaps; CODEBASE_ANALYSIS cites GPT-3.5 and simplified pipeline (R-0009).
- intake_evidence: `handoffs/intake_evidence/intake-20260613-us0002.json` (drain-advance 2026-06-13)
- drift_audit (R-0009): model mismatch, missing account-mapping step 1, no `/api/version`, no test-harness section in analysis doc.
- discovery (2026-06-13): Single vertical-slice story (no split). CODEBASE_ANALYSIS refresh outline confirmed (5 drift rows, R-0009); README coverage report PASS with 0 in-scope DONE `user_visible` items (US-0002 still OPEN); template parity fails (missing `template/` paths — research must confirm AC-2 runner path); US-0002 guide = operator doc map (README + 6 legacy guides + runbook/dev README) — not duplicate README prose; vision/README AC-4 gap is terminology-only (add explicit 5-step pipeline cross-ref in vision or defer to doc map).

## Decomposition (intake 2026-06-13 — US-0002 drain-advance)

- **Decision:** Single story (unchanged from product backfill).
- **Rationale:** Documentation vertical slice — analysis refresh, README gate, user guide, and vision/README consistency must ship together or enforce gates stay red.
- **Alternative rejected:** Split CODEBASE_ANALYSIS vs README/user-guide — partial delivery leaves operators with conflicting surfaces.
- **Prior evidence confirmed:** `handoffs/intake_evidence/intake-20260612-product-backfill.json` (plan_area `documentation` → US-0002).
- **Evidence:** `handoffs/intake_evidence/intake-20260613-us0002.json`

## US-0003 — OpenAI Structured Outputs migration

- Status: DONE
- Priority: 3
- user_visible: false
- summary: Migrate OpenAiService to Structured Outputs (JSON Schema + enum category) per R-0002 and DEC-0003 unblock criteria.
- scope_in: SDK upgrade path (openai ^3.2.1 → v4+), `classify()` schema-locked response with category enum from Firefly list, preserve `{ category, prompt, response }` return shape, US-0001 regression tests (4/4), `OPENAI_MODEL` env + `#retryWithBackoff` on 429.
- scope_out: Fine-tuned custom model, multi-provider LLM support, `matchAccount()` / `extractTransactionsFromText()` Structured Outputs (follow-up).
- depends_on: US-0001 (DONE — S0003)
- risks: SDK v3→v4 breaking API; schema must include UNKNOWN/null path for no-fit cases; other OpenAiService methods remain on legacy prompt+parse until follow-up.
- intake_evidence: `handoffs/intake_evidence/intake-20260614-us0003.json` (drain-advance 2026-06-14)
- unblock_note: DEC-0003 revisit trigger met — `tests/run-tests.sh` green (US-0001/S0003).

## Decomposition (intake 2026-06-14 — US-0003 drain-advance)

- **Decision:** Single story (unchanged from product backfill).
- **Rationale:** AI-reliability vertical slice — SDK upgrade, schema-locked `classify()`, and regression coverage must ship atomically; partial delivery risks v3/v4 client mismatch.
- **Alternative rejected:** Split SDK upgrade vs classify migration — technical-layer split without independent operator value.
- **Scope refresh:** `classify()` only; `matchAccount` / `extractTransactionsFromText` deferred; manual `json_schema` preferred over Zod to avoid new deps (R-0014).
- **Prior evidence confirmed:** `handoffs/intake_evidence/intake-20260612-product-backfill.json` (plan_area `ai-reliability` → US-0003).
- **Evidence:** `handoffs/intake_evidence/intake-20260614-us0003.json`

## US-0004 — Account history suggestions with AI comparison and review queue

- Status: DONE
- Priority: 4
- user_visible: true
- summary: Analyze expense-account transaction history for dominant category (default ≥80%); compare with AI classification using confidence scores; queue suggestions for operator review — apply only after explicit Accept.
- scope_in: FireflyService history aggregation per account, configurable dominance threshold, AI vs history comparison, pending-review persistence (`data/pending-category-reviews.json`), REST API + UI review panel, webhook/bulk integration (no silent auto-assign).
- scope_out: Auto-assign without user approval, merchant-level (payee) history (account-level only in v1), ML model training on corrections.
- depends_on: US-0001
- blocks: none
- risks: Extra Firefly API pagination for history; review queue growth if operator ignores panel; pipeline ordering must preserve DEC-0001 hard rules.

## Decomposition (intake 2026-06-12 — US-0004)

- **Decision:** Single story (vertical slice).
- **Rationale:** History analysis, AI comparison, and review UI are one operator workflow.
- **Alternative rejected:** Split backend vs UI — deferred; deliver end-to-end in one sprint slice.
- **Evidence:** `handoffs/intake_evidence/intake-20260612-us0004-account-history.json`

## Decomposition (discovery 2026-06-14 — US-0004)

- **Decision:** Single vertical slice (unchanged from intake).
- **Rationale:** History analysis, AI comparison, and review UI are one operator workflow. Split backend vs UI deferred.
- **Integration points identified:**
  - `FireflyService` — history fetch (pagination, account filtering; new method needed for per-account categorized transactions)
  - `OpenAiService` — `classify()` with confidence (may need extension to return confidence score)
  - `App.js` — pipeline integration (after DEC-0001 hard rules, before/alongside AI)
  - Data persistence — `data/pending-category-reviews.json` (new file)
  - REST API — new endpoints for review queue (list, accept, reject)
  - UI — review panel in `public/index.html` (human-in-the-loop approval pattern)
- **UX/design references:** Industry HITL patterns (confidence-based routing, one-tap approve/reject, structured diff views, context-rich handoffs) — see `docs/product/vision.md` § UX References.
- **Prior research:** R-0004 (Account-level category history heuristics) — current.
- **Evidence:** `handoffs/intake_evidence/intake-20260614-us0004.json`

## US-0005 — Admin UI consolidation (run, monitor, expense/income scope)

- Status: DONE
- Priority: 5
- user_visible: true
- summary: Consolidate chaotic admin UI — unify expense/income categorization controls and merge Bulk Categorization, Batch Jobs, and Individual Jobs into one Run & Monitor panel with coherent side-nav IA.
- scope_in: Refactor `public/index.html` side-panel entries and panel layout; unified categorization workspace (start bulk uncategorized/all, test webhook, scope selector for withdrawals/deposits/both aligned with skip-deposits); integrated job monitor listing batch jobs and individual jobs with type/status badges; preserve Socket.io events and existing REST endpoints; user guide `docs/user-guides/US-0005.md`.
- scope_out: Full visual redesign/CSS theme overhaul; CC Statement Splitter internal single/batch mode merge (separate tool); backend pipeline changes; US-0004 review-queue implementation (must remain reachable when added).
- depends_on: none
- blocks: none
- risks: Large monolithic HTML/JS refactor without US-0001 UI tests; regression in batch pause/resume/cancel or webhook test flow.

## Decomposition (intake 2026-06-13 — US-0005)

- **Decision:** Single story (vertical slice).
- **Rationale:** Navigation IA and unified run/monitor are one operator workflow; splitting sidebar vs monitor would deliver incomplete UX.
- **Alternative rejected:** IA-only pass without job monitor merge — leaves “Batch Jobs / Individual Jobs separate from execution” confusion.
- **UI audit findings:** Sidebar lists 9 Categorizer panels including separate **Bulk Categorization**, **Batch Jobs**, **Individual Jobs**; bulk start auto-jumps to Batch Jobs while Test Webhook (Maintenance group) tells user to check “individual jobs below”; withdrawal/deposit scope split across General Settings skip-deposits, bulk “Process All” copy, and Test Webhook type select.
- **Evidence:** `handoffs/intake_evidence/intake-20260613-us0005-ui-consolidation.json`

## Decomposition (intake 2026-06-14 — US-0005 drain-advance)

- **Decision:** Single story (vertical slice, unchanged from 2026-06-13).
- **Rationale:** Navigation IA and unified run/monitor remain one operator workflow; splitting sidebar vs monitor would deliver incomplete UX.
- **Alternative rejected:** IA-only pass without job monitor merge — leaves "Batch Jobs / Individual Jobs separate from execution" confusion.
- **Scope refresh (post-US-0004 / S0006):**
  - Sidebar Categorizer group now has **10** panels (was 9): `panel-reviews` (Pending Reviews) added by US-0004. Consolidation targets remain `panel-manual`, `panel-batch`, `panel-individual`.
  - Test Webhook section (line 1008, Maintenance group) still emits stale alert copy "Check the individual jobs section below" (line 1617) — must be removed.
  - Bulk start still auto-jumps to Batch Jobs via `window.__showPanel('panel-batch')` (lines 1551, 1573).
  - Scope controls still scattered: General Settings `auto-skip-deposits` (line 943), Bulk "Process All" copy (line 974), Test Webhook type select (line 1003), Transaction Management type filter (line 1302).
- **US-0004 adjacency constraint:** Pending Reviews panel must remain reachable after sidebar consolidation — either as its own sidebar entry or as a section within the unified Categorization workspace. No re-splitting of run/monitor.
- **Prior evidence confirmed + refreshed:** `handoffs/intake_evidence/intake-20260613-us0005-ui-consolidation.json` → `handoffs/intake_evidence/intake-20260614-us0005-ui-consolidation.json` (UI audit refresh with post-S0006 line numbers).
- **Evidence:** `handoffs/intake_evidence/intake-20260614-us0005-ui-consolidation.json`

## US-0006 — Agent-driven local Categorizer launch for Cursor browser UAT probes

- Status: DONE
- Priority: 6
- user_visible: false
- summary: Enable the agent to launch the Categorizer locally so it can run Cursor IDE browser UAT probes (`UAT_BROWSER_PROBE_MODE=cursor`) by itself, via deterministic Docker Compose / dev-environment configuration, without touching production deployment.
- scope_in: Repo-local Docker Compose or override for ephemeral local `categorizer` service on stable port (e.g. 3000/3001); `GET /health` and admin UI `/` reachable at `http://localhost:<port>`; local Traefik router labels or direct port binding documented; `.cursor/dev-environment.json` populated with `start_command`, `health_url`, `poll_seconds`, `env_file`/`required_env_vars`, `browser_probe_url`; browser UAT self-test end-to-end (launch → wait health → open Cursor browser → collect console errors and `/api/reviews` response); user guide `docs/user-guides/US-0006.md` for local agent-driven UAT flow.
- scope_out: Application pipeline logic changes; production `categorizer.omniflow.cc` Traefik or Docker changes; CI deployment automation beyond local dev launch; Playwright/http fallback probe implementation (only enable Cursor MCP path).
- depends_on: none
- blocks: BUG-0001 AC-4 operator PAT UAT (local browser probe can validate), BUG-0002 resolution verification
- risks: Existing production Docker Compose must not regress; local port may conflict with parent Firefly stack; `ENABLE_UI`/static middleware behavior must remain compatible; Cursor browser MCP may require host networking or explicit port exposure.
- intake_evidence: `handoffs/intake_evidence/intake-20260622-us0006-local-browser-uat.json`
- decomposition (2026-06-22): Single bounded enabler story. No split — the work is a vertical slice across dev-env config, compose/traefik, browser probe, and docs. Alternative (separate compose vs browser probe stories) rejected because the value is the end-to-end agent self-test.

## US-0007 — Keyword mapping direct-assign mode

- Status: OPEN
- Priority: 7
- user_visible: true
- summary: Add a per-keyword-mapping `directAssign` boolean (default `false`) so operators can opt specific keyword rules into hard category assignment — bypassing the OpenAI round-trip, mirroring how Account → Category mappings behave today.
- scope_in: Extend `CategoryMappingService` with a new `categorizeTransaction()` method that returns `{ category, reason, autoRule, mappingName, matchedKeyword }` when an enabled direct-assign mapping loosely matches; add `directAssign` field persistence + admin CRUD defaults; pipeline `#resolveCategory()` in `src/App.js` uses the direct-assign result in place of the existing AI-hint path when `directAssign: true`; admin UI toggle "Direct assign" per keyword mapping in `public/index.html`; regression tests updated.
- scope_out: Reworking the loose-match algorithm itself; changing account-mapping behavior; modifying auto-categorization (foreign/travel); multi-keyword priority rules beyond first-match-wins (keep current semantics); changing the AI-hint path behavior when `directAssign: false`.
- depends_on: none
- blocks: none
- risks: Pipeline precedence — direct-assign keyword mapping now sits in the AI-hint slot (same position per intake decision); if a direct-assign rule matches an unexpected transaction, the category is assigned without AI confirmation; mitigated by per-mapping opt-in and per-mapping enable/disable toggle already present. Backward compatibility — `directAssign` defaults to `false`/undefined, so all existing mappings stay in AI-hint mode.
- intake_evidence: inline (intake 2026-06-27). Operator-confirmed requirements in chat; AskQuestion confirmation of AC-1..AC-7 and pipeline placement option (c).
- selected_pack: small-intake-pack.
- intake_evidence_coverage: `outcome_success_criteria` (INTERSPAR 2361 K4 transaction categorized as "Groceries" when mapping directAssign=true), `impacted_components` (CategoryMappingService, App.js #resolveCategory, public/index.html keyword-mapping UI, admin CRUD endpoints), `constraints_compatibility_risks` (backward compat via default false), `required_tests_acceptance_checks` (existing suite + new precedence test for direct-assign), `done_definition` (directAssign supported, pipeline uses it, UI toggle present, runbook updated, tests green).
- decomposition (2026-06-27): Single vertical-slice story. No split — the feature value is the end-to-end "configure once, bypass AI" operator workflow. Splitting backend vs UI would deliver only half the value.
- pipeline_placement: Option (c) — direct-assign check replaces the existing AI-hint step in `#resolveCategory()` (line 1212–1222 of `src/App.js`). Auto-categorization still runs first; account mapping still runs first of first. When `directAssign: true` matches, return immediately with the target category; when `directAssign: false` or no match, existing AI-hint + OpenAI path proceeds unchanged.
- trigger_case: Operator reported INTERSPAR 2361 K4 withdrawal (44,61 EUR, 05.06.2026) failed to categorize despite "interspar" being listed in the "Supermarkets & Groceries" → "Groceries" keyword mapping. The keyword match fired the AI hint but OpenAI did not assign the category. Confirmed the gap is structural (AI-dep), not a matching bug.

## Bug issues (canonical)

### BUG-0001 — Keyword mappings category load fails with JSON parse error

- Status: DONE
- completion_date: 2026-06-26T16:46:00+02:00
- release_note: Fix released S0002 (2026-06-13). Status OPEN until 2026-06-26 — operator AC-4 (PAT dropdown UAT) + redeploy with fresh token confirmed on port 3000.
- environment: Admin UI (`ENABLE_UI=true`), browser console on page load; backend `GET /api/categories` → Firefly `GET /api/v1/categories` via `FireflyService.getCategories()`
- steps_to_reproduce: 1) Open admin UI (e.g. categorizer on port 3000). 2) Open browser devtools console. 3) Reload page. 4) Observe `loadCategoriesForKeywordMappings` error during initial data load (~line 1622 in `public/index.html`).
- expected: Keyword-mapping category dropdown loads Firefly categories silently; no console error on page load.
- actual: Console error `Error loading categories for keyword mappings: Error: Unexpected token < in JSON at position 0`. Dropdown shows "Failed to load categories". Same root failure affects account→category mapping dropdowns (`loadAccountsAndCategoriesForAccountMappings`).
- evidence_refs: User report (2026-06-13); `public/index.html:3054-3075`, `src/FireflyService.js:21-40`, `src/App.js:205-214`; intake bundle `handoffs/intake_evidence/intake-20260613-bug0001-categories.json`; R-0006
- discovery (2026-06-13): Single vertical-slice bug fix — no story split. UX scope: backend Accept header + content-type guard + actionable `FireflyException`; API structured error (optional HTTP 502); UI may map `j.error` to dropdown label instead of generic "Failed to load categories" and avoid console JSON-parse jargon.

### BUG-0002 — Pending Reviews endpoint returns HTTP 404 HTML → `loadPendingReviews` JSON parse error

- Status: DONE
- completion_date: 2026-06-24T23:45:00+02:00
- sprint: S0009
- release_note: Fix complete per DEC-0020 three-tier approach. Production redeployed (T-0050); defensive UI hardening in `public/index.html:3461-3485` (T-0051); regression tests 18/18 (T-0052); all ACs verified via browser MCP UAT (T-0053). Evidence: `sprints/S0009/uat-report.md`.
- environment: Admin UI (`ENABLE_UI=true`), browser console on page load; backend endpoint `GET /api/reviews`; deployment `https://categorizer.omniflow.cc`
- steps_to_reproduce: 1) Open admin UI at `https://categorizer.omniflow.cc`. 2) Open browser devtools console. 3) Reload page. 4) Observe Pending Reviews panel stays empty and console shows `GET /api/reviews 404 (Not Found)` and `SyntaxError: Unexpected token '<', "<!DOCTYPE ..." is not valid JSON` at `loadPendingReviews`.
- expected: `GET /api/reviews` returns HTTP 200 JSON `{ success: true, reviews: [...] }` (or `{ success: false, error: "..." }` on failure); `loadPendingReviews` renders pending reviews without a JSON parse error.
- actual: `GET /api/reviews` returns HTTP 404 with an HTML `<!DOCTYPE ...>` body; `loadPendingReviews` logs the HTTP 404 then throws a `SyntaxError` trying to parse the HTML as JSON.
- evidence_refs: Operator report (2026-06-22); `public/index.html:3461-3475` (`loadPendingReviews` fetch/catch); `src/App.js:198-201` (review queue route registration), `src/App.js:1467-1475` (`#onGetReviews` implementation), `src/App.js:128-135` (static middleware mounted before API routes when `ENABLE_UI=true`); intake bundle `handoffs/intake_evidence/intake-20260622-bug0002-reviews-404.json`
- discovery (2026-06-22): The source code **does** register `GET /api/reviews` and implements `#onGetReviews`, so the 404 is a runtime/execution symptom rather than a missing-route defect. Likely causes: stale deployed image; reverse proxy / ingress returning HTML 404; or static middleware interaction. No story split — single bug fix.

## Bug acceptance (canonical)

- [x] BUG-0001: Page load — no `Unexpected token < in JSON` console error from `loadCategoriesForKeywordMappings`.
- [x] BUG-0001: `GET /api/categories` returns `{ success: true, categories: [...] }` when Firefly is reachable, or a structured `{ success: false, error: "<actionable message>" }` (not a raw JSON-parse exception string) when Firefly is unreachable or misconfigured.
- [x] BUG-0001: `FireflyService.getCategories()` sends `Accept: application/json` (per R-0001) and validates response content-type before parsing JSON.
- [x] BUG-0001: Keyword-mapping and account-mapping category `<select>` elements populate when Firefly returns categories. *(operator PAT UAT completed 2026-06-26)*
- [x] BUG-0002: Page load — no `GET /api/reviews 404 (Not Found)` and no `SyntaxError: Unexpected token '<'` console error from `loadPendingReviews` on a healthy deployment.
- [x] BUG-0002: `GET /api/reviews` returns HTTP 200 JSON `{ success: true, reviews: [...] }` when healthy, or a structured `{ success: false, error: "..." }` (not HTML) when the endpoint fails.
- [x] BUG-0002: If `GET /api/reviews` returns a structured `{ success: false, error: "..." }`, `loadPendingReviews` surfaces the error in the UI and does not throw a JSON parse `SyntaxError`.
- [x] BUG-0002: When the endpoint returns a review list, the Pending Reviews panel renders each item with transaction summary, history category + confidence, AI category + confidence, recommended choice, and Accept/Reject actions.
