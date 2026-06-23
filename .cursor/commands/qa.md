---
description: "its-magic QA: test plan, findings, verify fixes."
---

# /qa

## Subagents
- qa

## Execution model
- Run `/qa` in a fresh QA subagent context.
- After writing outputs, stop and hand off to `/execute` (if issues) or
  `/verify-work` (if clear) in a new subagent/chat.
- Each QA pass in the implementation loop must be a new QA subagent.

## Isolation evidence write requirement (US-0048 / DEC-0029)

At the end of `/qa`, append an isolation evidence entry to
`docs/engineering/state.md`:

- `phase_id=qa`
- `role=qa`
- `fresh_context_marker=<new marker for this subagent>`
- `timestamp=<ISO UTC>`
- `evidence_ref=<primary output ref>` (recommended: `sprints/Sxxxx/qa-findings.md` and/or `handoffs/qa_to_dev.md`)

In an execute↔QA implementation loop (`AUTO_IMPLEMENTATION_LOOP=1`), each new
`/qa` cycle must have a new `fresh_context_marker` (marker reuse is treated as
stale isolation evidence).

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `handoffs/dev_to_qa.md`
- `sprints/S0001/summary.md`

## Outputs (artifacts)
- `sprints/S0001/qa-findings.md`
- `handoffs/qa_to_dev.md` (if issues)
- `docs/engineering/state.md`

## Stop conditions
- Critical defects require decision
- Missing test plan coverage

## Release gate prerequisite (US-0039)

QA completion evidence is required before `/release` may proceed. Record findings in
`sprints/Sxxxx/qa-findings.md`; unresolved blocking findings block release with
`RELEASE_QA_BLOCKERS_OPEN`. When clear, handoff to `/verify-work` so release gate can
verify no unresolved blockers.

## Self-verify UAT probes (US-0092 / DEC-0078)

Share the **`scripts/uat_probe_lib.py`** resolver with **`/verify-work`**: derive
acceptance steps, execute probes where stack profile resolves, record evidence in
**`sprints/Sxxxx/uat.json`** `probe_results[]` and **`sprints/Sxxxx/qa-findings.md`**.
Fail closed with **`UAT_PROBE_UNRESOLVED`** (not PASS) when no probe maps.
Forbidden: auto-read **`.env`**, mutate intake evidence — **`UAT_PROBE_FORBIDDEN`**.

Reason codes extend with **`UAT_BROWSER_UNAVAILABLE`**, **`UAT_BROWSER_PROBE_FAILED`**,
**`UAT_BROWSER_PROBE_TIMEOUT`** (**US-0093** / **DEC-0079**).

### Browser UAT self-test (US-0093)

When **`UAT_BROWSER_PROBE_MODE=cursor`** (default) and step classifies as **`browser_smoke`**
(or automatable **`manual_operator`** reclassified per **DEC-0079** §4), execute the **Cursor
browser MCP** sequence — **lib never calls MCP directly** (**BUG-0006**):

1. **Resolve target URL** — `docs/engineering/runtime-connectivity.md` first `http(s)://`; else
   dev-server port from `package.json` + scratchpad **`DEV_SERVER_PORT`**.
2. **`browser_navigate`** — load health/app URL; respect enterprise origin allowlist.
3. **Step plan** — map acceptance verbs to **`browser_click`** / **`browser_type`** /
   **`browser_scroll`** when automatable; **never** fill password/credential fields or read **`.env`**.
4. **`browser_screenshot`** — write to **`sprints/Sxxxx/evidence/browser/<probe_id>-<seq>.png`**
   (max **5** per probe).
5. **Console + network evidence** — counts + summary path refs only (no inline secrets).
6. **Verdict** — set **`passed`**, **`reason_code`**, **`browser_evidence_refs`** in
   **`uat.json`** `probe_results[]`; **`passed=true`** in **`cursor`** mode **requires** non-empty
   **`navigation_url`** + at least one screenshot or console/network summary path — else
   **`UAT_BROWSER_PROBE_FAILED`**. Mirror under **`qa-findings.md`** **Runtime browser evidence**.
7. **Fallback** — MCP unavailable → record **`UAT_BROWSER_UNAVAILABLE`**, run stdlib fallback when
   **`UAT_BROWSER_FALLBACK_CHAIN=1`**; validate via
   **`python scripts/uat_probe_lib.py --merge-result <fragment.json>`**.

**No silent PASS** — stdlib alone does **not** PASS **`browser_smoke`** in **`cursor`** mode
without agent **`browser_evidence_refs`**. Security: no auto-read **`.env`**, no credential
auto-fill, no intake evidence mutation — **`UAT_PROBE_FORBIDDEN`** unchanged.

## Steps
0. If `SECURITY_REVIEW=1`, verify `docs/engineering/security-review.md` exists
   and has no unresolved `critical` findings before proceeding. If unresolved
   critical findings exist, stop at a decision gate.
1. Define a test plan and run verification using the runbook commands
   (`TEST_COMMAND`, `LINT_COMMAND`, `TYPECHECK_COMMAND` in `docs/engineering/runbook.md`).
   - `TEST_COMMAND` is mandatory baseline evidence for push eligibility.
   - Optional checks run only when configured and should be reported as
     `pass|fail|skipped` deterministically.
   - **User-visible metadata guard (US-0071 / DEC-0053):** run
     `python scripts/check-user-visible-metadata.py` (see runbook). On failure,
     record blocking findings with reason `USER_VISIBLE_INTERNAL_METADATA_DETECTED`,
     cite `path:line:column` evidence, token class, and remediation per runbook.
     If the checker entrypoint is missing, fail closed with
     `METADATA_SANITIZATION_POLICY_MISSING`.
2. Record findings and severity.
   - Explicitly classify blockers that must prevent auto-push:
     unresolved blocking QA findings and unresolved critical issues.
3. Update state and handoff to dev if needed.
   - For sync-policy evidence, include deterministic `reason_code` guidance:
     - `PRE_QA_AUTOPUSH_FORBIDDEN` (feature work before QA completion)
     - `BLOCKING_QA_FINDINGS` (open blockers/criticals)
     - `SYNC_PUSHED` (eligible + checks passed + branch safe)
4. If `AUTO_IMPLEMENTATION_LOOP=1` and blocking issues exist, handoff to dev and
   return to `/execute` automatically (bounded by `AUTO_LOOP_MAX_CYCLES`).
5. Follow with `/verify-work` for user acceptance when blocking issues are closed.
6. If `AUTO_PAUSE_REQUEST=1` at safe boundary, run `/pause` before next phase.
7. Before pushing, suggest running `scripts/validate-and-push` to catch failures
   locally before they reach CI. If CI fails, the auto-fix job in
   `.github/workflows/ci.yml` attempts automatic lint/format fixes and retries.
8. Optional compatibility observability QA checks (US-0034):
   - If `CROSS_REPO_OBSERVABILITY=0`, add zero required compatibility overhead.
   - If `CROSS_REPO_OBSERVABILITY=1`, verify compatibility artifacts exist and
     are current (`docs/engineering/compatibility-signals.md`,
     `docs/engineering/compatibility-report.md`) with traceable references to
     story/sprint/task context.
   - If unresolved critical compatibility findings exist and
     `COMPATIBILITY_GATE_ON_CRITICAL=1`, mark as release-blocking and require
     decision gate before `/release`.
9. Optional component-scope protection checks (US-0035):
   - If `COMPONENT_SCOPE_MODE=0`, add zero required protection overhead.
   - If `COMPONENT_SCOPE_MODE=1`, verify unaffected-component protection checks
     for declared `non_target_components` and record evidence in
     `docs/engineering/component-scope-report.md`.
   - If unapproved out-of-scope impact is detected, mark as blocking and require
     decision gate before `/release`.
10. Optional spec-pack verification (US-0031):
   - If `SPEC_PACK_MODE=0`, add no required spec-pack checks (zero overhead).
   - If `SPEC_PACK_MODE=1`, verify target-story spec-pack artifacts exist and
     required sections are populated; report gaps in qa-findings; see runbook
     for minimum sections and traceability.
11. Optional user-guide verification (US-0032):
   - If `USER_GUIDE_MODE=0`, add no required user-guide checks or blocking (zero overhead).
   - If `USER_GUIDE_MODE=1`, verify target-story user guide exists at
     `docs/user-guides/US-xxxx.md` and required sections are present; report
     gaps in qa-findings; see runbook for minimum schema.
12. Optional remote runtime QA/debug contract (US-0064):
   - When remote runtime metadata exists in
     `docs/engineering/release-targets.json` for active target context,
     validate remote endpoint reachability/debug evidence per configured
     `runtime.mode`.
   - Include local vs remote QA context and sanitized endpoint details in
     `sprints/Sxxxx/qa-findings.md`.
   - If remote connectivity config is incomplete for required remote checks,
     mark blocking with deterministic reason code
     `REMOTE_CONNECTIVITY_CONFIG_INVALID`.
   - **US-0084**: when `REMOTE_EXECUTION=1`, expect **`handoffs/dev_to_qa.md`**
     to carry an **environment label** (`WSL`, `ssh:<hostEnv>`, `dockerOverSsh`, …)
     and **test locus** (local vs remote); reject evidence that pastes secret
     values (keys/passwords) — **names-only** refs align with
     `python scripts/remote_config_summary.py` output.
13. Runtime QA autopilot contract (US-0065 / DEC-0047):
   - Runtime truth path is mandatory for generated-project QA:
     `startup -> readiness/connectivity -> log scan -> bounded retry -> verdict`.
   - PASS requires runtime startup and endpoint/process reachability evidence.
   - Deterministic failure outcomes:
     - startup command/process fails: `RUNTIME_STARTUP_FAILED`
     - endpoint/process unreachable after retries:
       `RUNTIME_ENDPOINT_UNREACHABLE`
     - critical runtime log signals detected:
       `RUNTIME_LOG_CRITICAL_DETECTED`
     - retry budget exhausted without recovery:
       `RUNTIME_RETRY_BUDGET_EXHAUSTED`
     - stack profile unresolved for runtime checks:
       `RUNTIME_STACK_PROFILE_UNRESOLVED`
   - Runtime profile resolution must be stack-aware for:
     `node|python|go|java|dotnet` at minimum.
   - Unknown/ambiguous stacks must fail closed with
     `RUNTIME_STACK_PROFILE_UNRESOLVED` (no silent generic PASS fallback).
   - Bounded retry loop requirements:
     - retry only transient startup/connectivity failures,
     - enforce configured attempt cap (`attempt <= max`),
     - write per-attempt ledger evidence (`attempt`, `delay_ms`, `outcome`),
     - stop retrying on non-transient critical log failures.
   - Required QA runtime evidence schema fields in `sprints/Sxxxx/qa-findings.md`:
     - `runtime_startup_command`
     - `runtime_stack_profile`
     - `runtime_mode` (`local|remote`)
     - `runtime_health_target` (process/endpoint)
     - `runtime_health_result`
     - `runtime_log_summary` (severity counts + key signals)
     - `runtime_retry_count`
     - `runtime_retry_ledger`
     - `runtime_final_verdict` (`pass|fail`)
     - `runtime_reason_code`
     - `runtime_evidence_refs`
   - Webapp runtime verification path (when applicable):
     - run browser-surface check for expected app load path,
     - capture console error summary and failed network request summary,
     - include results in runtime evidence fields.
   - Optional debug escalation path:
     - use only for reproducible runtime failures,
     - keep instrumentation bounded and reversible,
     - record debug actions/evidence and cleanup confirmation.
14. Generated baseline test auto-run contract (US-0066 / DEC-0048):
   - For generated-project QA scope, run baseline tests automatically using the
     resolved `TEST_COMMAND`; do not treat baseline tests as optional.
   - Deterministic generated-test evidence fields in `sprints/Sxxxx/qa-findings.md`:
     - `generated_test_stack_profile`
     - `generated_test_command`
     - `generated_test_result` (`pass|fail`)
     - `generated_test_output_ref`
     - `generated_test_paths_ref`
     - `generated_test_reason_code`
   - Deterministic scaffold failure outcomes:
     - unresolved profile: `TEST_SCAFFOLD_STACK_UNRESOLVED`
     - unsupported profile: `TEST_SCAFFOLD_UNSUPPORTED_STACK`
     - generation/run failure: `TEST_SCAFFOLD_GENERATION_FAILED`
   - Non-destructive baseline guardrails:
     - preserve user-authored tests/config/commands,
     - validate generated scaffold behavior as fill-missing/idempotent only.
   - Runtime integration boundary:
     - generated-test PASS does not override runtime-autopilot failures from
       `US-0065`; non-starting apps cannot PASS QA.

