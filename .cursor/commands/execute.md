---
description: "its-magic execute: implement tasks with artifacts and state updates."
---

# /execute

## Subagents
- dev

## Execution model
- Run `/execute` in a fresh Dev subagent context.
- After writing outputs, stop and hand off to `/qa` in a new subagent/chat.
- When fixing QA findings, each new `/execute` run is a new Dev subagent.

## Isolation evidence write requirement (US-0048 / DEC-0029)

At the end of `/execute`, append an isolation evidence entry to
`docs/engineering/state.md`:

- `phase_id=execute`
- `role=dev`
- `fresh_context_marker=<new marker for this subagent>`
- `timestamp=<ISO UTC>`
- `evidence_ref=<primary output ref>` (recommended: `handoffs/dev_to_qa.md` and the target sprint `sprints/Sxxxx/summary.md`)

In an execute↔QA implementation loop (`AUTO_IMPLEMENTATION_LOOP=1`), each new
`/execute` cycle must have a new `fresh_context_marker` (marker reuse is treated
as stale isolation evidence).

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `sprints/S0001/tasks.md`
- `handoffs/tl_to_dev.md`
- Optional: `handoffs/qa_to_dev.md` when fixing QA findings
- Optional (remote-enabled mode only): `.cursor/remote.json`

## Outputs (artifacts)
- Code changes
- `sprints/S0001/summary.md`
- `docs/engineering/state.md`
- `handoffs/dev_to_qa.md` (if ready)
- Optional (when enabled):
  - `docs/engineering/compatibility-signals.md`
  - `docs/engineering/compatibility-report.md`

## Stop conditions
- Decision gate triggered
- Missing task definition or unclear scope

Release gate semantics (US-0039): mandatory gates (check-in test, QA, UAT) and no-bypass/override contract are enforced at `/release`; see `.cursor/commands/release.md` and `.cursor/commands/qa.md`.

### Browser UAT self-test (US-0093)

When **`UAT_BROWSER_PROBE_MODE=cursor`** (default) and acceptance steps classify as **`browser_smoke`**
(or automatable **`manual_operator`** re-routed per **DEC-0079** §4), execute the **Cursor browser MCP**
sequence during `/execute` when web UI verification applies (**BUG-0006**: **`scripts/uat_probe_lib.py`**
never invokes MCP — subagent only):

1. **Resolve target URL** — `docs/engineering/runtime-connectivity.md` first `http(s)://`; else
   `package.json` dev/start + **`DEV_SERVER_PORT`** scratchpad override.
2. **`browser_navigate`** — load URL; respect enterprise origin allowlist.
3. **Step plan** — map automatable verbs to **`browser_click`** / **`browser_type`** / **`browser_scroll`**;
   **never** fill password/credential fields; **never** read **`.env`** paths.
4. **`browser_screenshot`** — write to **`sprints/Sxxxx/evidence/browser/<probe_id>-<seq>.png`** (max **5**).
5. **Console + network evidence** — counts + summary path refs only (no inline secrets).
6. **Verdict** — set **`passed`**, **`reason_code`**, **`browser_evidence_refs`** on the matching
   **`probe_results[]`** row in **`uat.json`**. **`passed=true`** in **`cursor`** mode requires
   non-empty **`navigation_url`** + at least one screenshot or console/network summary path — else
   downgrade to **`UAT_BROWSER_PROBE_FAILED`**.
7. **Fallback trigger** — MCP unavailable → record **`UAT_BROWSER_UNAVAILABLE`**; when
   **`UAT_BROWSER_FALLBACK_CHAIN=1`**, stdlib HTTP/Playwright fallback runs via **`uat_probe_lib.py`**.
   Both fail → **`UAT_BROWSER_PROBE_FAILED`** (no silent PASS).

Optional validation: **`python scripts/uat_probe_lib.py --merge-result <fragment.json>`** —
evidence-required-on-PASS in **`cursor`** mode. No auto-read **`.env`**, no credential auto-fill,
no intake evidence mutation.

## Intake evidence tooling reference (US-0078 / DEC-0060)

Stories that harden intake persistence ship **`scripts/intake_evidence_lib.py`**,
**`scripts/intake_evidence_validate.py`**, and **`tests/intake_evidence_fixtures_test.py`**
(invoked from **`tests/run-tests.ps1`** / **`tests/run-tests.sh`** §26k). See
**`docs/engineering/architecture.md`** **`# US-0078`** and **`decisions/DEC-0060.md`**.

## Bug issue tooling reference (US-0079 / DEC-0061)

Ship **`scripts/bug_issue_lib.py`**, **`scripts/bug_issue_validate.py`**, **`scripts/intake_bug_routing_guard.py`**, and **`tests/bug_issue_fixtures_test.py`** (§26L in **`tests/run-tests.ps1`** / **`tests/run-tests.sh`**). See **`docs/engineering/architecture.md`** **`# US-0079`** and **`decisions/DEC-0061.md`**.

## Token-cost evidence (US-0080 / DEC-0062)

When persisting token metrics for an orchestrated run: use append-only
**`handoffs/token_cost_runs/<orchestrator_run_id>.md`** (or **`.jsonl`**) per
**`DEC-0062`** §3; set **`token_cost_evidence_ref`** on **`docs/engineering/state.md`**
checkpoints when rows exist. **`run_class_hash`** comparability for **AC-2** uses
**`scripts/token_cost_lib.py`** / **`scripts/token_cost_compare.py`**; active/`template/`
parity for listed paths: **`python scripts/check_token_cost_parity.py --repo .`**
(§26M in **`tests/run-tests.ps1`** / **`tests/run-tests.sh`**).

## Canonical status contract (US-0045)

- Story status authority is `docs/product/backlog.md` (including **`BUG-####`** under **`## Bug issues (canonical)`** per **DEC-0061**).
- `docs/product/acceptance.md` and `docs/engineering/state.md` are derived and
  must not be treated as canonical readiness sources when contradictory.
- `/execute` must not start/continue implementation solely based on
  non-canonical status evidence.

## Browser UAT self-test (US-0093)

When acceptance steps classify as **`browser_smoke`** (or automatable **`manual_operator`**
reclassified per **DEC-0079** §4) and **`UAT_BROWSER_PROBE_MODE=cursor`**, execute the **Cursor
browser MCP** sequence during execute-phase verification — **lib never calls MCP directly**
(**BUG-0006**):

1. **Resolve target URL** — `docs/engineering/runtime-connectivity.md` first `http(s)://`; else
   dev-server port from `package.json` + scratchpad **`DEV_SERVER_PORT`**.
2. **`browser_navigate`** — respect origin allowlist.
3. **Step plan** — **`browser_click`** / **`browser_type`** / **`browser_scroll`** when
   automatable; **never** fill password/credential fields or read **`.env`**.
4. **`browser_screenshot`** → **`sprints/Sxxxx/evidence/browser/<probe_id>-<seq>.png`** (max **5**).
5. Console + network summary path refs only (no inline secrets).
6. Write **`browser_evidence_refs`** to **`uat.json`** `probe_results[]`; mirror
   **Runtime browser evidence** in **`qa-findings.md`**.
7. MCP unavailable → **`UAT_BROWSER_UNAVAILABLE`** + stdlib fallback when
   **`UAT_BROWSER_FALLBACK_CHAIN=1`**; validate with
   **`python scripts/uat_probe_lib.py --merge-result <fragment.json>`**.

Reason codes: **`UAT_BROWSER_UNAVAILABLE`**, **`UAT_BROWSER_PROBE_FAILED`**,
**`UAT_BROWSER_PROBE_TIMEOUT`**. **No silent PASS** without agent evidence in **`cursor`** mode.

## Steps
1. Implement one task at a time.
2. Update summary and engineering state.
3. Handoff to QA when ready.
4. If `AUTO_INSTALL_DEPS=1` in `.cursor/scratchpad.md`, install dependencies
   via the appropriate package manager without prompting.
5. Mode-aware remote-config validation (DEC-0016):
   - If `REMOTE_EXECUTION=0`, skip all remote-config checks (zero overhead).
   - If `REMOTE_EXECUTION=1`, fail fast on `.cursor/remote.json` contract errors
     before remote execution is attempted.
   - Required root fields: `version` (integer), `defaultTarget` (string),
     `targets` (array).
   - Required target fields: `id` (string), `type` (`docker|ssh|vm`),
     `enabled` (boolean), `host` (string), `port` (integer 1..65535),
     `workspaceRoot` (string).
   - Optional target field: `auth` object with `mode` (`none|env`).
   - If `auth.mode=env`, sensitive values must be env-var references only
     (for example `tokenEnv`, `passwordEnv`, `privateKeyPathEnv`).
   - `defaultTarget` must match an existing enabled target `id`.
   - Secret-like inline literals are forbidden in committed config.
6. Remote validation errors must use actionable fail-fast format:
   `[REMOTE_CONFIG_ERROR] <path>: expected <rule>, got <actual>. Fix: <hint>.`
   - Missing file: `.cursor/remote.json` not found.
   - Malformed JSON: parse failure with syntax location.
   - Invalid enum/type/value: include field path and allowed/expected values.
   - Security violation: inline secret-like value detected.
   Use remediation hints that either fix config or disable remote mode
   (`REMOTE_EXECUTION=0`) when remote execution is not needed.
7. If `RUN_TESTS_ON_EDIT=1`, run configured tests after meaningful edits.
8. If `LOOP_UNTIL_GREEN=1`, fix failing tests in small iterations until green,
   or stop and document blockers in `docs/engineering/state.md`.
9. If `AUTO_PAUSE_REQUEST=1` and boundary rules permit, checkpoint via `/pause`.
10. Sync policy evaluation contract (US-0038):
   - Evaluate sync eligibility only at completed phase boundaries.
   - Do not evaluate on partial/intra-phase edits (deterministic boundary-only behavior).
   - If policy mode is `disabled|manual`, keep near-zero overhead and do not
     auto-trigger push behavior.
11. Team-scope guardrails for bulk execute mode (US-0047 / DEC-0024):
   - When `TEAM_MODE=1` and `AUTO_TEAM_SCOPE_ENFORCE=1`, only execute tasks that
     match current member scope (`TEAM_MEMBER`, `ACTIVE_TASK_IDS`).
   - For out-of-scope tasks, do not write code or artifacts; emit deterministic
     reason code and follow configured stop/skip policy.
12. When ready to push, suggest `scripts/validate-and-push` to run the full
    quality chain locally before CI.
13. Optional compatibility observability execution contract (US-0034):
   - If `CROSS_REPO_OBSERVABILITY=0`, skip all compatibility checks (zero
     required overhead).
   - If `CROSS_REPO_OBSERVABILITY=1`, append/update compatibility signals and
     findings in canonical artifacts (`compatibility-signals.md`,
     `compatibility-report.md`) including severity, impacted modules,
     evidence refs, and recommended actions.
14. Optional component-scoped execution guardrails (US-0035):
   - If `COMPONENT_SCOPE_MODE=0`, add zero required scope overhead.
   - If `COMPONENT_SCOPE_MODE=1`, enforce scope-first execution:
     - do not intentionally modify out-of-scope components unless escalation is
       explicitly approved and recorded,
     - any detected unapproved out-of-scope impact must be flagged for decision
       gate handling before release.
15. Optional spec-pack (US-0031):
   - If `SPEC_PACK_MODE=0`, add no required spec-pack steps (zero overhead).
   - If `SPEC_PACK_MODE=1`, update Technical Specification artifact for target
     story at canonical path when implementation details change; see runbook
     for required sections and ownership.
16. Optional user-guide (US-0032):
   - If `USER_GUIDE_MODE=0`, add no required user-guide steps or blocking checks (zero overhead).
   - If `USER_GUIDE_MODE=1`, create or update user guide at
     `docs/user-guides/US-xxxx.md` for target story; see runbook for minimum schema.
17. Optional remote runtime execution context (US-0064):
   - If release target runtime metadata indicates `runtime.mode=remote`, record
     remote execution/debug context in handoff outputs and state evidence
     references.
   - If remote execution is required but connectivity metadata is incomplete,
     fail fast with `REMOTE_CONNECTIVITY_CONFIG_INVALID`.
   - Never expose secrets in execution outputs; only sanitized endpoint data and
     env-reference names are allowed.
17b. Remote evidence cues (US-0084):
   - When `REMOTE_EXECUTION=1`, cite an **environment label** in
     `handoffs/dev_to_qa.md` (e.g. `WSL`, `ssh:SSH_HOST` as the **env var name**,
     `dockerOverSsh`) and state **where tests ran** (local vs remote host).
   - Do not paste private keys, tokens, or resolved secret **values**; use
     `python scripts/remote_config_summary.py` for a names-only summary when needed.
18. Runtime QA autopilot execution contract (US-0065 / DEC-0047):
   - Treat runtime verification as mandatory for generated-project scope; static
     checks alone are not sufficient evidence for PASS readiness.
   - Follow canonical stage order:
     `startup -> readiness/connectivity -> log scan -> bounded retry -> verdict`.
   - Record runtime execution evidence in execute outputs:
     - startup command and selected stack profile,
     - runtime mode (`local|remote`) and endpoint/health snapshot,
     - retry ledger (`attempt`, `delay_ms`, `outcome`),
     - log severity summary (`info|warn|error|fatal` counts),
     - final runtime verdict with deterministic reason code.
   - Supported stack profiles (minimum): `node`, `python`, `go`, `java`, `dotnet`.
   - If stack profile cannot be resolved deterministically, fail closed with
     `RUNTIME_STACK_PROFILE_UNRESOLVED` and remediation guidance.
   - Bounded retry policy:
     - retries are allowed only for transient startup/connectivity failures,
     - retry attempts must not exceed configured max,
     - critical log signals are non-transient and fail closed immediately.
   - Runtime failure reason-code baseline:
     - `RUNTIME_STARTUP_FAILED`
     - `RUNTIME_ENDPOINT_UNREACHABLE`
     - `RUNTIME_LOG_CRITICAL_DETECTED`
     - `RUNTIME_RETRY_BUDGET_EXHAUSTED`
     - `RUNTIME_STACK_PROFILE_UNRESOLVED`
   - When HTTP/UI context is detected, include webapp runtime evidence path for
     QA handoff (browser-surface checks plus console/network error signals).
19. Generated baseline test scaffolding contract (US-0066 / DEC-0048):
   - Resolve deterministic stack/project profile before scaffold generation:
     `node|python|go|java|dotnet` (minimum supported set).
   - Generate baseline tests only when missing; create minimal runnable assets for
     unit, integration, and acceptance layers using stable paths.
   - Record generated-test evidence in execute outputs:
     - resolved stack profile,
     - generated paths inventory (`unit|integration|acceptance`),
     - scaffold command/actions and outcome.
   - Deterministic runbook baseline wiring:
     - if `TEST_COMMAND` is missing/unset, write stack baseline command,
     - if `TEST_COMMAND` is user-authored and non-empty, preserve it.
   - Fail-closed diagnostics for generation/profile failures:
     - `TEST_SCAFFOLD_STACK_UNRESOLVED`
     - `TEST_SCAFFOLD_UNSUPPORTED_STACK`
     - `TEST_SCAFFOLD_GENERATION_FAILED`
   - Non-destructive precedence is mandatory:
     - preserve existing user-authored test files and config by default,
     - fill only missing baseline scaffold assets.
   - Rerun behavior must be idempotent:
     - no duplicate scaffold files on repeated `/execute`,
     - no oscillating `TEST_COMMAND` rewrites between runs.
   - Runtime boundary:
     - static generated-test PASS is necessary but not sufficient for QA PASS;
       runtime startup/connectivity/log verdict remains governed by `US-0065`.
20. User-visible internal metadata guard (US-0071 / DEC-0053):
   - Before completing `/execute`, run `python scripts/check-user-visible-metadata.py`
     from the repository root (or `python scripts/check-user-visible-metadata.py --repo <root>`).
   - On failure, stop with `USER_VISIBLE_INTERNAL_METADATA_DETECTED` and use the
     remediation contract in `docs/engineering/runbook.md` (evidence ref, token
     class, neutral operator copy). Do not ship planning tokens in scanned
     operator-visible strings.
   - If you add a new operator-facing script or binary path, update inclusive
     scan roots in `scripts/check-user-visible-metadata.py` **and** this runbook
     section together or fail closed with `METADATA_SANITIZATION_SCOPE_AMBIGUOUS`
     semantics at QA/release.
21. Documentation profile validation (US-0077 / DEC-0059):
   - When you change `README.md`, `docs/developer/README.md`, scratchpad profile keys
     (`DOC_AUDIENCE_PROFILE`, `DOC_DETAIL_LEVEL`), or `scripts/doc_profile_lib.py` /
     `scripts/validate_doc_profile.py`, run `python scripts/validate_doc_profile.py --repo <root>`.
   - Fail closed on `DOC_PROFILE_INVALID`, `DOC_PROFILE_MERGE_ERROR`,
     `DOC_SECTION_MISSING:*`, `DOC_SECTION_BUDGET_EXCEEDED`, or `DOC_TEMPLATE_PARITY_FAIL`
     (see `docs/engineering/runbook.md`).
22. Triad hot-surface enforcement (DEC-0054):
   - Before completing `/execute`, run
     `python scripts/enforce-triad-hot-surface.py --check` from repository root
     (or `--repo <root>`).
   - If the check fails, run `python scripts/enforce-triad-hot-surface.py --rollover`
     then `--check` again; if still failing, stop with `STATE_ARCHIVE_REQUIRED` or
     `ARTIFACT_HOT_SURFACE_OVERSIZE` (no successful execute completion on oversize
     triad hot files).
   - When your edits touched any triad path (`docs/engineering/state.md`,
     `handoffs/po_to_tl.md`, `docs/engineering/architecture.md`), ensure rollover
     evidence (`boundary`, `moved`, `retained`, `pack_ref`) is recorded in the
     execute checkpoint when packs were written.
23. Project README bootstrap + per-story catalog delta (US-0097 / DEC-0083):
   - **23 preamble**: Read merged scratchpad `FRAMEWORK_KIT_REPO` (default `0`).
     When `1` (its-magic kit repo only), skip **23a** and **23b** — consumer repos
     never set `FRAMEWORK_KIT_REPO=1`. Read `PROJECT_README_ENFORCE` for delta context.
   - **23a Bootstrap**: When root `README.md` is missing or matches placeholder
     sentinels **S1–S4** (framework H1, `<!-- readme-feature-coverage-catalog -->`,
     `Feature coverage catalog (US-0091)` heading, or byte-match to `template/README.md`),
     materialize the project scaffold from `docs/product/vision.md` (H1 + 1–3 sentence
     purpose, `## For users`, `## For developers`, `## Features`,
     `<!-- project-readme-feature-catalog -->`, pointer to `its_magic/README.md`).
     Operator-authored roots (**S5**) are never overwritten. Fail closed →
     `PROJECT_README_BOOTSTRAP_SKIPPED` when bootstrap required but not performed.
   - **23b Per-story delta (mandatory)**: Before `/execute` PASS for a shipped story,
     add or update ≥1 user-facing catalog bullet under
     `<!-- project-readme-feature-catalog -->` containing `\bUS-xxxx\b` for each
     `user_visible: true` story in scope. Fail closed → `PROJECT_README_DELTA_SKIPPED`.
     Hybrid/ambiguous roots → `PROJECT_README_MIGRATION_AMBIGUOUS` or
     `PROJECT_README_SENTINEL_CONFLICT` (see runbook migration §). Inconclusive
     classifier → `PROJECT_README_PLACEHOLDER_UNRESOLVED`.
   - **23c Hygiene compose**: Prose edits in root `README.md` are subject to step **20**
     (**US-0071**) — do not run duplicate hygiene when README is unchanged this phase.
   - Active + `template/.cursor/commands/execute.md` byte-identical step **23** block.

24. Dev environment auto-launch profile (US-0098 / DEC-0084):
   - **24 preamble**: Read merged scratchpad `DEV_AUTO_LAUNCH_PROFILE` (default `off`) and
     optional `DEV_ENVIRONMENT_CONFIG` (default `.cursor/dev-environment.json`). When `off`,
     skip **24a–24d** with zero overhead — manual workflows unchanged.
   - **24a Gate + profile load**: Validate profile path via `scripts/dev_environment_lib.py`
     `load_profile`; names-only schema check. Fail closed → `DEV_ENV_PROFILE_INVALID` or
     `DEV_ENV_PROFILE_MISSING`. Never read `.env`.
   - **24b Detect + persist**: Run `detect_mode(repo, profile, scratchpad)` per detection
     precedence (**US-0086** remote wins over **docker-host-local**). Merge fields idempotently
     into profile file.
   - **24c Relaunch (bounded)**: When touched files match Tier A/B/C via `classify_touched_files`
     or explicit operator refresh (**exact literal** `refresh dev environment` — case-sensitive
     whole phrase): run `build_relaunch_plan` recipe; bounded retries (`retry_count` max **2**;
     delays **5s** then **15s**). Bind-mount skip default: source-only docker changes emit
     `DEV_ENV_RELAUNCH_SKIPPED_NO_SURFACE` unless `rebuild_recipe.restart_on_source_change=true`
     or explicit refresh.
   - **24d Connect + handoff**: Append **Dev environment relaunch** + **Connect** sections to
     `handoffs/dev_to_qa.md` with evidence tuple fields: `dev_auto_launch_profile`,
     `runtime_mode`, `relaunch_tier`, `relaunch_command`, `relaunch_outcome`, `retry_count`,
     `reason_code`. Use `format_connect_block` — mandatory fields: `runtime_mode`,
     `connect_endpoint`, `health_path`, `service_id`/`container_id`, `target_id`, `env_refs`,
     `relaunch_outcome`. Names-only — no secret values.
   - Orthogonal to step **18** (**US-0065**) runtime QA autopilot and step **17** (**US-0084**)
     remote cues (compose when both fire).
   - Active + `template/.cursor/commands/execute.md` byte-identical step **24** block.

