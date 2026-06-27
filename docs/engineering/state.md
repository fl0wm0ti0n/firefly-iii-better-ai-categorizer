## Phase boundary: intake US-0007 — Keyword mapping direct-assign mode (2026-06-27T14:19:00+02:00)

- `phase_id`: intake
- `role`: po
- `work_item`: US-0007
- `sprint_id`: (not yet planned — next phase will be discovery or sprint-planning)
- `fresh_context_marker`: intake-us0007-keyword-direct-assign
- `timestamp`: 2026-06-27T14:19:00+02:00
- `verdict`: pass
- `next_scheduled_phase`: discovery (or sprint-planning when discovery is bypassed)
- `summary`: Intake completed for US-0007 — Keyword mapping direct-assign mode. Triggered by operator report that "INTERSPAR 2361 K4 03.06." withdrawal remained uncategorized despite "interspar" being present in the "Supermarkets & Groceries" keyword mapping. Root cause: keyword mappings currently only provide AI hints via `CategoryMappingService.getAiHint()`; they cannot directly assign categories. User confirmed via AskQuestion option (c): direct-assign check **replaces** the existing AI-hint slot in `#resolveCategory()` (same position, different behavior based on `directAssign` flag). Backward-compatible additive boolean (default `false`); existing mappings continue to work as AI hints. Single vertical-slice story, no split.
- `acceptance_met`: true
- `intake_evidence`:
  - `selected_pack`: small-intake-pack
  - `topic_coverage`: outcome_success_criteria (INTERSPAR case resolves directly when directAssign=true), impacted_components (CategoryMappingService.js, App.js #resolveCategory, public/index.html, admin CRUD endpoints), constraints_compatibility_risks (backward compat via default false), required_tests_acceptation_checks (existing regression suite + new precedence test), done_definition (directAssign supported, pipeline uses it, UI toggle present, tests green).
  - `pipeline_placement_decision`: option (c) — replaces existing AI-hint slot. User explicitly chose.
- `files_created`: (none at this phase — sprint artifacts created in next phase)
- `files_modified`:
  - docs/engineering/state.md (this boundary prepended)
  - docs/product/backlog.md (US-0007 story appended above Bug issues section)
  - docs/product/acceptance.md (US-0007 AC-1..AC-7 added)
  - handoffs/po_to_tl.md (US-0007 section appended with corrected pipeline precedence per option (c))

---

## Phase boundary: quick Q0001 — Transaction Scope selector fix + Skip Deposits removal (2026-06-26T17:05:00+02:00)

- `phase_id`: quick
- `role`: dev
- `work_item`: Q0001
- `sprint_id`: quick/Q0001
- `fresh_context_marker`: quick-q0001-scope-selector-fix
- `timestamp`: 2026-06-26T17:05:00+02:00
- `verdict`: pass
- `next_scheduled_phase`: none (quick task, no further QA gate)
- `summary`: Fixed Transaction Scope segmented control visual feedback (blue pill highlight) by adding JS change listener that toggles `.selected` class on parent `.scope-pill` label. Removed legacy "Skip Deposits from categorization" checkbox and all related UI wiring (`auto-skip-deposits`, `btn-save-general-settings`, load/save config references). Removed `skipDeposits` logic from `#processUncategorizedTransactions`, `#processAllTransactions`, and `#onWebhook` handler — scope selector now drives all transaction filtering. Changed `AutoCategorizationService` default `skipDeposits: true` → `false`. Marked `autoCategorize()` deposit skip as legacy.
- `acceptance_met`: true
- `tasks`:
  - T-0054: JS change listener toggles `.selected` class on scope pill — done
  - T-0055: Remove "Skip Deposits" checkbox HTML — done
  - T-0056: Remove `autoSkipDeposits` const + load/save wiring — done
  - T-0057: Remove `btn-save-general-settings` button (single-purpose) — done
  - T-0058: Update scope selector `<small>` text — done
  - T-0059: Remove `skipDeposits` batch filtering from both `#process*` methods — done
  - T-0060: Remove `skipDeposits` early-exit from webhook handler — done
  - T-0061: Default `skipDeposits: false`, mark `autoCategorize()` skip as legacy — done
- `files_created`:
  - sprints/quick/Q0001/task.json
  - sprints/quick/Q0001/summary.md
- `files_modified`:
  - docs/engineering/state.md (this boundary prepended)
  - public/index.html (scope selector JS + "Skip Deposits" removal)
  - src/App.js (skipDeposits logic removed from batch + webhook paths)
  - src/AutoCategorizationService.js (default changed to false, legacy comment)

---

## Phase boundary: verify-work BUG-0002 S0009 (2026-06-24T23:45:00+02:00)

- `phase_id`: verify-work
- `role`: qa
- `work_item`: BUG-0002
- `sprint_id`: S0009
- `fresh_context_marker`: verify-work-bug0002-s0009
- `timestamp`: 2026-06-24T23:45:00+02:00
- `orchestrator_run_id`: auto-20260624T233500Z-bug0002
- `verdict`: pass
- `next_scheduled_phase`: close (none — bug-fix release gate attested)
- `summary`: Independent verify-work pass over S0009/BUG-0002. Regression suite re-run 18/18. Production `/api/reviews` (curl -i http://127.0.0.1:3000/api/reviews) returned HTTP 200 JSON (`{"success":true,"reviews":[]}`) with `Content-Type: application/json`. Local ephemeral instance launched via `bash scripts/dev-launch.sh` on port 3001; seeded review served via `/api/reviews`. Browser MCP navigated to http://localhost:3001/, installed runtime error collector (window.addEventListener('error') + console.error wrapper); page load + panel expansion produced `syntaxErrors: []`. Pending Reviews panel rendered all AC-4 fields (description, date/account/IDs, history category Groceries/confidence 92.0%, AI category Restaurants/confidence 45.0%, recommendation Groceries, reason, Accept & Reject buttons). AC-3 verification: monkey-patched `window.fetch` to return HTTP 404 text/html, invoked global `loadPendingReviews()`; result `syntaxErrors: []`, toast surfaced "Error loading reviews: Server returned an unexpected response for pending reviews (HTTP 404 Not Found). Please check that the categorizer service is running and up to date.". DEC-0020 three-tier closure criteria all satisfied. Local service stopped via `bash scripts/dev-launch.sh --stop`; data file restored to pre-verification content (unchanged — no Accept/Reject click occurred).
- `evidence_ref`:
  - sprints/S0009/uat-report.md (this phase output)
  - sprints/S0009/qa-findings.md
  - sprints/S0009/execution-summary.md
  - sprints/S0009/qa-evidence/T-0053-evidence.md
  - sprints/S0009/qa-evidence/T-0050-probe.txt
  - sprints/S0009/qa-evidence/T-0053-local-probe.json
  - sprints/S0009/qa-evidence/T-0053-console.log
  - sprints/S0009/qa-evidence/T-0053-ui-hardening.log
  - sprints/S0009/qa-evidence/T-0053-panel-render.log
  - sprints/S0009/qa-evidence/T-0052-regression.txt
  - handoffs/dev_to_qa.md
  - decisions/DEC-0020.md
  - docs/engineering/research.md (R-0024)
  - public/index.html:3461-3485 (loadPendingReviews defensive guard)
- `tasks`:
  - T-0050: done (production redeploy; re-confirmed in verify-work)
  - T-0051: done (UI hardening; re-confirmed in verify-work)
  - T-0052: done (regression 18/18; independently re-run in verify-work)
  - T-0053: done (AC verification; independently re-verified in verify-work via browser MCP)
- `ac_cross_check`:
  - AC-1: pass (regression + runtime collector evidence)
  - AC-2: pass (production curl 200 JSON + local curl 200 JSON)
  - AC-3: pass (404 text/html simulation → showToast, no SyntaxError)
  - AC-4: pass (panel text extracted via CDP)
- `dec_cross_check`:
  - DEC-0020 closure criterion 1 (production 200 JSON): pass
  - DEC-0020 closure criterion 2 (no SyntaxError on page load): pass
  - DEC-0020 closure criterion 3 (error toast on structured error): pass
- `files_created`:
  - sprints/S0009/uat-report.md
- `files_modified`:
  - docs/engineering/state.md (this boundary prepended, traceability index updated)
  - docs/product/acceptance.md (BUG-0002 AC-1…AC-4 checkboxes marked [x])
  - docs/product/backlog.md (BUG-0002 Status: OPEN → DONE, sprint S0009, completion_date added)

### Isolation evidence (US-0048 / DEC-0029)

- `phase_id`: verify-work
- `role`: qa
- `fresh_context_marker`: verify-work-bug0002-s0009
- `timestamp`: 2026-06-24T23:45:00+02:00
- `evidence_ref`:
  - sprints/S0009/uat-report.md
  - sprints/S0009/qa-findings.md
  - sprints/S0009/execution-summary.md
  - handoffs/dev_to_qa.md
  - sprints/S0009/qa-evidence/T-0053-evidence.md (and supporting T-0050/probe/console/ui-hardening/panel-render files)
  - decisions/DEC-0020.md
  - docs/product/acceptance.md (BUG-0002 lines 64-69)
  - public/index.html:3461-3485 (loadPendingReviews)
- `strict_runtime_proof`:
  - Command: `bash tests/run-tests.sh` → 18/18 pass, exit 0
  - Command: `docker ps --filter "name=categorizer"` → production container `Up 2 hours (healthy)`
  - Command: `curl -i http://127.0.0.1:3000/api/reviews` → HTTP 200 JSON with `Content-Type: application/json`
  - Command: `bash scripts/dev-launch.sh` → service healthy after 2s (HTTP 200)
  - Command: `curl -s http://localhost:3001/api/reviews` → HTTP 200 JSON with fully-shaped review
  - Browser MCP Runtime.evaluate (CDP): page load + panel expansion → `syntaxErrors: []`, `consoleErrors: []` after load
  - Browser MCP Runtime.evaluate (CDP): fetch-monkey-patched 404 text/html → `loadPendingReviews()` surfaced showToast, `syntaxErrors: []`
  - Command: `bash scripts/dev-launch.sh --stop` → container + network removed; data file unchanged (no Accept/Reject click)
- `context_isolation`: verify-work used only the sprint artifacts, handoff, decision DEC-0020, research R-0024, and the listed evidence files. No prior chat history was carried forward. The regression suite, production endpoint, local ephemeral launch, browser MCP probes, panel render extraction, and error-response simulation were executed in this fresh QA (verify-work) context.

---

## Phase boundary: qa BUG-0002 S0009 (2026-06-24T00:36:04+02:00)

- `phase_id`: qa
- `role`: qa
- `work_item`: BUG-0002
- `sprint_id`: S0009
- `fresh_context_marker`: qa-bug0002-s0009
- `timestamp`: 2026-06-24T00:36:04+02:00
- `verdict`: pass
- `next_scheduled_phase`: verify-work
- `summary`: Independent QA pass completed. Regression suite 18/18 pass. Production `/api/reviews` returns JSON 200. Local dev-launch instance served a fully-shaped pending review; Pending Reviews panel rendered all required fields. UI error simulation with 404 text/html produced a `showToast` error without `SyntaxError`. `data/pending-category-reviews.json` was restored after verification.
- `evidence_ref`:
  - sprints/S0009/qa-findings.md
  - handoffs/dev_to_qa.md
  - sprints/S0009/execution-summary.md
  - sprints/S0009/qa-evidence/T-0053-evidence.md
  - docs/product/acceptance.md (BUG-0002 ACs)
- `tasks`:
  - T-0050: Production redeploy and verify `/api/reviews` returns JSON 200 — done
  - T-0051: Defensive UI hardening in `loadPendingReviews` — done
  - T-0052: Regression tests after UI change — done
  - T-0053: Verify all BUG-0002 acceptance criteria — done
- `files_created`:
  - sprints/S0009/qa-findings.md

### Isolation evidence (US-0048 / DEC-0029)

- `phase_id`: qa
- `role`: qa
- `fresh_context_marker`: qa-bug0002-s0009
- `timestamp`: 2026-06-24T00:36:04+02:00
- `evidence_ref`:
  - sprints/S0009/qa-findings.md
  - handoffs/dev_to_qa.md
  - sprints/S0009/execution-summary.md
  - sprints/S0009/qa-evidence/T-0053-evidence.md
  - docs/product/acceptance.md (BUG-0002 ACs)
- `strict_runtime_proof`:
  - Command: `bash tests/run-tests.sh` → 18/18 pass, exit 0
  - Command: `curl -i http://127.0.0.1:3000/api/reviews` → HTTP 200 JSON
  - Command: `bash scripts/dev-launch.sh` → service healthy on `localhost:3001`
  - Command: `curl -s http://localhost:3001/api/reviews` → HTTP 200 JSON
  - Browser MCP CDP evaluation: `loadPendingReviews` 404 text/html simulation → `showToast` error, `syntaxError: false`
  - Command: `bash scripts/dev-launch.sh --stop` → stopped and data file restored
- `context_isolation`: QA verification used only the sprint artifacts, handoff, and acceptance criteria provided in this phase; no prior chat history was carried forward. The regression suite, production endpoint, local launch, browser probes, and error simulation were executed in a fresh QA context.

---

## Phase boundary: execute BUG-0002 S0009 (2026-06-24T00:30:00+02:00)

- `phase_id`: execute
- `role`: dev
- `work_item`: BUG-0002
- `sprint_id`: S0009
- `fresh_context_marker`: execute-bug0002-s0009
- `timestamp`: 2026-06-24T00:30:00+02:00
- `verdict`: pass
- `next_scheduled_phase`: qa
- `summary`: Production redeploy completed and container healthy; /api/reviews returned JSON 200. UI hardening in public/index.html loadPendingReviews verified with response.ok and content-type guards. Regression suite passed 18/18. AC verification passed against a local ephemeral launch: no SyntaxError, structured errors surfaced via showToast, and Pending Reviews panel rendered all required fields.
