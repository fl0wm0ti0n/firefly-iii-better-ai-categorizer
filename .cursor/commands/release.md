---
description: "its-magic release: prepare release notes and runbook updates."
---

# /release

## Subagents
- release

## Execution model
- Run `/release` in a fresh Release subagent context.
- After writing outputs, stop and optionally hand off to `/refresh-context` in a
  new subagent/chat.

## Isolation evidence write requirement (US-0048 / DEC-0029)

At the end of `/release`, append an isolation evidence entry to
`docs/engineering/state.md`:

- `phase_id=release`
- `role=release`
- `fresh_context_marker=<new marker for this subagent>`
- `timestamp=<ISO UTC>`
- `evidence_ref=<primary output ref>` (recommended: `sprints/Sxxxx/release-findings.md` and `handoffs/releases/Sxxxx-release-notes.md`)

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `sprints/Sxxxx/summary.md` (target sprint)
- `sprints/Sxxxx/qa-findings.md` (target sprint)
- `sprints/Sxxxx/release-findings.md` (target sprint; create/update during release gate evaluation)
- `sprints/Sxxxx/uat.json`
- `sprints/Sxxxx/uat.md`
- `docs/engineering/runbook.md`
- `docs/engineering/state.md`
- `handoffs/release_notes.md` (legacy compatibility pointer)
- `handoffs/release_queue.md` (canonical queue tracker)

## Outputs (artifacts)
- `handoffs/releases/Sxxxx-release-notes.md` (canonical per-sprint notes)
- `handoffs/release_queue.md` (canonical queue state)
- `handoffs/release_notes.md`
- `sprints/Sxxxx/release-findings.md` (canonical post-QA release issue log)
- `handoffs/release_to_dev.md` (if release gate blocks and remediation is needed)
- `docs/engineering/runbook.md`
- `docs/engineering/state.md`

## Stop conditions
- Deploy command missing for requested environment
- Decision gate triggered
- Sprint identity unresolved
- Queue/notes mismatch detected with no safe auto-remediation

## Canonical release artifacts (US-0040 / DEC-0020)

- Canonical release history is sprint-scoped:
  `handoffs/releases/Sxxxx-release-notes.md`.
- Canonical release state tracker is `handoffs/release_queue.md`.
- Legacy compatibility file `handoffs/release_notes.md` remains supported as a
  latest-release pointer/summary (not canonical history storage).
- Never overwrite release notes for non-target sprints.

## Release queue schema contract

Each queue row must include at minimum:
- `sprint_id`
- `story_refs`
- `status` (`planned|ready|unreleased|released|blocked`)
- `last_updated` (ISO timestamp)
- `release_notes_ref` (`handoffs/releases/Sxxxx-release-notes.md`)
- `gate_snapshot` (gate summary or deterministic reason code)
- `release_version` (optional until finalization)

## Deterministic target-sprint-only transition rules

Allowed transitions per target sprint:
- `planned -> ready -> unreleased -> released`
- `blocked` may be set for deterministic failure conditions.

Strict mutation semantics:
- During one `/release` run, only the target sprint row may be created/updated.
- Do not mutate unrelated sprint rows in `handoffs/release_queue.md`.
- Do not write/update `handoffs/releases/Syyyy-release-notes.md` when target is
  `Sxxxx`.

## Release gate chain (US-0039 / DEC-0019)

Mandatory gate order (strict, deterministic). No step may be skipped or reordered:

1. **Check-in test gate** — Verify latest `TEST_COMMAND` result is passing; block on missing, stale, or failing evidence. When `TEST_COMMAND` runs the consolidated repo runner (`tests/run-tests.*`), passing results must include **US-0071** user-visible metadata guard coverage (positive, leak detection, idempotence); otherwise treat as incomplete release evidence for this repository (`METADATA_SANITIZATION_POLICY_MISSING` / missing regression row).
2. **QA completion gate** — Require no unresolved blocking findings in current sprint context before proceeding.
3. **UAT completion gate** — Require UAT artifacts populated and verified; block on placeholder, incomplete, or unresolved-fail state.
4. **Isolation compliance gate** — Require valid per-phase isolation evidence (US-0048 / DEC-0029); block on missing/invalid/stale evidence or violation.
4b. **Strict runtime proof gate** — Require valid strict runtime attestation tuples (US-0056 / DEC-0038); block on missing/invalid/reused/stale/ambiguous proof linkage.
5. **Release finalization** — Only after gates 1–4 pass: write release notes, update queue, reconcile backlog/runbook/state.

Optional runbook keys (`LINT_COMMAND`, `TYPECHECK_COMMAND`) are not mandatory release gates. When blank, they must not cause release to fail; report as `skipped`. Mandatory gates remain check-in test + QA + UAT + isolation only (US-0039 AC-10, US-0048).

Default: no bypass. Override only via explicit decision gate with documented rationale and evidence (see Override evidence contract below).

## No-bypass default (US-0039)

Release gates are mandatory by default. Bypass is not allowed unless an
explicit decision gate is approved and evidence is recorded.

Check-in test evidence: canonical source `tests/report.md`; valid = present + fresh + passing. Fail reasons: `RELEASE_TEST_EVIDENCE_MISSING`, `RELEASE_TEST_STALE`, `RELEASE_TEST_FAILED`. QA gate: no unresolved blocking findings; `RELEASE_QA_BLOCKERS_OPEN`, `RELEASE_QA_EVIDENCE_MISSING`. UAT gate: no placeholder/incomplete/unresolved-fail; `RELEASE_UAT_INCOMPLETE`, `RELEASE_UAT_FAILED`. Override evidence: decision record, rationale, approver, risk acceptance; `RELEASE_GATE_OVERRIDE_APPROVED`.

## QA completion evidence gate (US-0039)

Release may not proceed until QA completion evidence shows no unresolved blocking findings for the target sprint.

- **Evidence source**: `sprints/Sxxxx/qa-findings.md` (and optionally `handoffs/qa_to_dev.md` for handoff context).
- **Pass condition**: No unresolved blocking or critical findings; QA phase has been run and findings recorded.
- **Fail condition**: Unresolved blocking findings exist, or QA evidence is missing for target sprint — block with `RELEASE_QA_BLOCKERS_OPEN` or `RELEASE_QA_EVIDENCE_MISSING`; remediation: resolve blockers, re-run `/qa`, then rerun `/release`.

## Generated-test evidence prerequisite (US-0066 / DEC-0048)

For generated-project scope, release evidence must include deterministic
generated-test auto-run references:

- **Execution evidence source**: `sprints/Sxxxx/summary.md` generated baseline
  test section (stack profile, generated paths, scaffold actions).
- **QA evidence source**: `sprints/Sxxxx/qa-findings.md` generated-test auto-run
  fields (`generated_test_command`, `generated_test_result`,
  `generated_test_output_ref`, `generated_test_paths_ref`,
  `generated_test_reason_code`).
- **Pass condition**: generated-test evidence exists, is traceable, and does not
  contradict QA/runtime verdicts.
- **Fail condition**: missing/ambiguous generated-test evidence or unresolved
  scaffold failure reason code; block release with
  `TEST_SCAFFOLD_GENERATION_FAILED` and rerun `/execute` and/or `/qa`.

## UAT completion gate (US-0039)

Release may not proceed until UAT artifacts are in verified state (no placeholder, incomplete, or unresolved-fail).

- **Evidence sources**: `sprints/Sxxxx/uat.json`, `sprints/Sxxxx/uat.md` (per DEC-0009).
- **Pass condition**: All UAT steps populated with results; `passed` + `failed` = total; no unresolved fail state; not placeholder-only content.
- **Fail conditions** (block release with remediation):
  - **Placeholder**: UAT steps empty or template-only — `RELEASE_UAT_INCOMPLETE`; run `/verify-work`, populate steps, rerun `/release`.
  - **Incomplete**: Steps exist but not all have results or counts inconsistent — `RELEASE_UAT_INCOMPLETE`; complete UAT, rerun `/release`.
  - **Unresolved fail**: One or more steps recorded as failed and not resolved — `RELEASE_UAT_FAILED`; resolve failures or document acceptance, then rerun `/release`.

Do not infer pass from missing or placeholder UAT; block and emit the appropriate reason code.

## Backlog reconciliation contract (US-0043 / DEC-0021)

At release finalization boundary, reconcile backlog state for target sprint
stories using canonical release evidence precedence.

Canonical evidence precedence:
1. `handoffs/release_queue.md` target sprint row (`released` required)
2. `handoffs/releases/Sxxxx-release-notes.md` gate summary
3. `sprints/Sxxxx/qa-findings.md`
4. `sprints/Sxxxx/uat.json` and `sprints/Sxxxx/uat.md`
5. `sprints/Sxxxx/release-findings.md` (if present)

Deterministic reconciliation behavior:
- mutate only target sprint story blocks in `docs/product/backlog.md`
- set target story `Status: DONE` when mandatory release evidence is PASS
- reconcile target story acceptance checkboxes to checked state
- never mutate unrelated backlog stories
- if contradiction is detected (for example sprint is `released` but backlog
  story remains OPEN/unchecked), fail safe with reason code
  `BACKLOG_STATUS_DRIFT` and remediation guidance

## Canonical status source and global drift guard (US-0045 / DEC-0025)

Canonical ownership:
- Story status (`OPEN|DONE`) is authoritative in `docs/product/backlog.md`.
- `docs/product/acceptance.md` and `docs/engineering/state.md` are derived views.

Deterministic reconciliation precedence:
1. `docs/product/backlog.md` story status (canonical status owner)
2. target sprint release evidence (`handoffs/release_queue.md`,
   `handoffs/releases/Sxxxx-release-notes.md`, `sprints/Sxxxx/qa-findings.md`,
   `sprints/Sxxxx/uat.json`, `sprints/Sxxxx/uat.md`, `sprints/Sxxxx/release-findings.md`)
3. derived-view updates (`docs/product/acceptance.md`, `docs/engineering/state.md`)

Guardrails:
- Mutations remain target-scoped; never rewrite unrelated stories/sprints.
- On contradictory canonical vs release evidence at reconciliation boundary,
  fail closed with `CANONICAL_STATUS_CONFLICT` and remediation guidance.
- Normalization and reconciliation outputs must be auditable in
  `docs/engineering/status-normalization-report.md`.

## Steps
1. Resolve target sprint identity from current sprint context.
   - If unresolved, fail closed:
     - do not write any sprint-scoped notes file,
     - do not mutate another sprint queue row,
     - record/update blocked queue row keyed as `UNKNOWN` with reason
       `RELEASE_SPRINT_UNRESOLVED`,
     - include remediation guidance (set explicit sprint context and rerun).
2. Verify sync-policy prerequisite evidence (US-0038):
   - Latest sync verdict must include deterministic evidence fields:
     `phase_boundary`, `policy_mode`, `checks`, `push_decision`, `reason_code`,
     `evidence_refs`.
   - `TEST_COMMAND` baseline evidence is mandatory for any push-eligible path.
   - Optional checks (`LINT_COMMAND`, `TYPECHECK_COMMAND`) are required only when
     configured; missing optional commands must be reported as `skipped`, not fail.
   - If baseline test evidence fails, append/update `sprints/Sxxxx/release-findings.md`
     with `RELEASE_TEST_FAILED`, include evidence refs/remediation, write
     `handoffs/release_to_dev.md`, and stop.
3. Enforce blocker-aware release safety:
   - If unresolved blocking QA findings or unresolved critical issues exist,
     require `no_push` semantics (`BLOCKING_QA_FINDINGS`) and hold release until
     remediation evidence is present.
   - Record blocking findings in `sprints/Sxxxx/release-findings.md` and handoff
     in `handoffs/release_to_dev.md` before stopping.
3a. Optional compatibility critical gate (US-0034):
   - If `CROSS_REPO_OBSERVABILITY=0`, skip with zero required overhead.
   - If `CROSS_REPO_OBSERVABILITY=1`, read
     `docs/engineering/compatibility-report.md`.
   - If unresolved `critical` compatibility findings exist and
     `COMPATIBILITY_GATE_ON_CRITICAL=1`, trigger decision gate and stop release
     progression with reason code `COMPATIBILITY_CRITICAL_OPEN`.
3b. Optional component-scope gate (US-0035):
   - If `COMPONENT_SCOPE_MODE=0`, skip with zero required overhead.
   - If `COMPONENT_SCOPE_MODE=1`, read
     `docs/engineering/component-scope-report.md`.
   - If unapproved out-of-scope impact remains open, trigger decision gate and
     stop release progression with reason code
     `COMPONENT_SCOPE_VIOLATION_UNAPPROVED`.
3c. Optional spec-pack completeness gate (US-0031):
   - If `SPEC_PACK_MODE=0`, skip with zero required overhead.
   - If `SPEC_PACK_MODE=1`, validate target-story spec-pack artifacts per
     runbook (Design Concept, CRS, Technical Specification); required sections
     must be present and non-empty. If any required section is missing, block
     release with reason code `SPEC_PACK_INCOMPLETE` and remediation guidance.
3d. Optional user-guide completeness gate (US-0032):
   - If `USER_GUIDE_MODE=0`, skip with zero required overhead.
   - If `USER_GUIDE_MODE=1`, validate target-story user guide at
     `docs/user-guides/US-xxxx.md` per runbook (minimum required sections);
     if guide missing or required sections absent, block release with reason
     code `USER_GUIDE_INCOMPLETE` and remediation guidance.
3e. Legacy drift guard (US-0049 / DEC-0031):
   - Run legacy-drift detection over DONE stories (backlog DONE and acceptance
     unchecked OR traceability/state lacks entry OR release artifacts lack
     representation). If legacy drift is detected, either block with reason code
     (`BACKLOG_DONE_ACCEPTANCE_UNCHECKED`, `BACKLOG_DONE_TRACEABILITY_MISSING`,
     `BACKLOG_DONE_RELEASE_ARTIFACT_MISSING`) and remediation, or perform
     target-scoped repair and append entry to `docs/engineering/legacy-drift-audit.md`.
   - Behavior is deterministic and documented in runbook; do not mutate
     unrelated stories.
3f. README feature coverage gate (US-0091 / DEC-0074):
   - Read merged scratchpad `README_FEATURE_COVERAGE_ENFORCE` (default `0`).
   - When `0`: skip with `skipped` evidence in `sprints/Sxxxx/release-findings.md`
     § doc gates (grandfathering / migration pass).
   - When `1`: run
     `python scripts/validate_readme_feature_coverage.py --repo . --enforce`.
   - On failure: emit `README_FEATURE_COVERAGE_BLOCKED` plus sub-codes on stderr;
     remediation lists each missing id and target `root_h2` / `dev_h2` from
     `docs/engineering/context/readme-section-affinity.json`.
   - Active + `template/.cursor/commands/release.md` byte-identical step **3f**
     block (full-file parity per US-0017).
3g. Project README coverage gate (US-0097 / DEC-0083):
   - Read merged scratchpad `PROJECT_README_ENFORCE` (default `1` post-bootstrap).
   - When `0`: skip with `PROJECT_README_ENFORCE_SKIPPED` evidence in
     `sprints/Sxxxx/release-findings.md` § doc gates (migration/grandfathering only).
   - When `1`: run
     `python scripts/validate_project_readme_coverage.py --repo . --enforce`.
   - On failure: emit `PROJECT_README_COVERAGE_BLOCKED` plus sub-codes
     (`PROJECT_README_COVERAGE_GAP:<US-xxxx>`, `PROJECT_README_MIGRATION_AMBIGUOUS`,
     `PROJECT_README_INPUT_INVALID`) on stderr; remediation lists each missing id.
   - Gate order is strict: **3e → 3f (framework / US-0091) → 3g (project / US-0097) → 4 (UAT)**.
     Framework and project enforce toggles are independent (`README_FEATURE_COVERAGE_ENFORCE`
     vs `PROJECT_README_ENFORCE`).
   - Active + `template/.cursor/commands/release.md` byte-identical step **3g**
     block (full-file parity per US-0017).
4. Verify UAT completeness (DEC-0009): confirm all sprint UAT artifacts (`uat.json`,
   `uat.md`) are in populated/verified state per DEC-0009. All steps must have
   recorded results. If any UAT is placeholder or incomplete, block release and
   recommend `/verify-work`.
   - Record `RELEASE_UAT_INCOMPLETE` in `sprints/Sxxxx/release-findings.md` with
     remediation and evidence refs before stop.
4a. Isolation compliance gate (US-0048 / DEC-0029): verify per-phase isolation
    evidence is present and valid in `docs/engineering/state.md` for the target
    sprint lifecycle (at minimum: `execute`, `qa`, `verify-work`).
    - Missing evidence: block with `PHASE_CONTEXT_ISOLATION_MISSING`
    - Invalid schema/fields: block with `ISOLATION_EVIDENCE_INVALID`
    - Stale/reused evidence: block with `ISOLATION_EVIDENCE_STALE`
    - Orchestrator/phase executed without fresh subagent: block with
      `PHASE_CONTEXT_ISOLATION_VIOLATION`
    - **Phase role alignment (US-0069 / DEC-0051)**: each entry's `role` must
      match the canonical expected role for its `phase_id` (matrix + scratchpad
      alternates as documented in `/auto`). Mismatch → `PHASE_ROLE_MISMATCH`.
    - Remediation: re-run the affected phase(s) in fresh subagent contexts,
      write new isolation evidence, then rerun `/release`.
4b. Strict runtime proof gate (US-0056 / DEC-0038): verify strict runtime-proof
    tuples are present and valid for target lifecycle phases (`execute`, `qa`,
    `verify-work`) and deterministically linked to checkpoint evidence.
    - Missing tuple: block with `RUNTIME_PROOF_MISSING`
    - Invalid tuple/hash/linkage: block with `RUNTIME_PROOF_INVALID`
    - Reused `runtime_proof_id`: block with `RUNTIME_PROOF_REUSED`
    - Expired/stale proof: block with `RUNTIME_PROOF_STALE`
    - Ambiguous proof-to-checkpoint linkage: block with
      `RUNTIME_PROOF_AMBIGUOUS_LINK`
    - **Strict-proof role alignment (US-0069 / DEC-0051)**: tuple `role` must
      equal the sibling isolation evidence `role` and the expected phase contract
      role; `proof_hash` must be consistent with sorted-key JSON of the tuple
      fields per `DEC-0038`. Violation → `RUNTIME_PROOF_INVALID` or
      `PHASE_ROLE_MISMATCH` as applicable.
    - Remediation: rerun affected phase(s), write fresh runtime proof tuples,
      then rerun `/release`.
5. Ensure target queue row exists; set status to `unreleased` before finalization.
   - Create row if missing.
   - Set `release_notes_ref` to target sprint notes path.
   - Keep all non-target rows unchanged.
6. Write/update only target sprint notes at:
   `handoffs/releases/Sxxxx-release-notes.md`.
   - Preserve any existing historical sprint file content unless explicitly
     working on that same sprint.
7. Perform legacy migration/backfill check (one-time, non-destructive):
   - If legacy content exists only in `handoffs/release_notes.md` and target
     sprint can be resolved, backfill target sprint file without deleting legacy.
   - If legacy sprint context is unresolved, keep legacy file unchanged and
     record `LEGACY_NOTES_SPRINT_UNRESOLVED` with manual migration guidance.
   - Migration must be idempotent; do not overwrite existing target sprint notes
     as part of backfill.
8. Run mismatch fail-safe checks before finalization:
   - If queue row missing for resolved sprint: reason `QUEUE_ENTRY_MISSING`.
   - If queue row missing `release_notes_ref`: reason `NOTES_REF_MISSING`.
   - If attempted transition is invalid: reason `STATUS_TRANSITION_INVALID`.
   - For any mismatch: fail closed, preserve existing notes, keep queue in
     `unreleased` or `blocked`, and include remediation guidance.
   - Append/update `sprints/Sxxxx/release-findings.md` and
     `handoffs/release_to_dev.md` for blocked outcomes.
9. On successful finalization, transition only target sprint:
   `unreleased -> released`.
   - Update `last_updated`, `release_version` (when available), and gate summary.
10. Reconcile target story backlog status + acceptance checkboxes in
    `docs/product/backlog.md` using US-0043 and US-0045 contracts.
    - Apply only to target sprint-linked stories.
    - If contradictory states remain after reconciliation attempt, fail closed
      with `BACKLOG_STATUS_DRIFT` or `CANONICAL_STATUS_CONFLICT`, write
      remediation guidance, and stop.
11. Reconcile derived status views from canonical backlog status:
    - update linked rows/checklists in `docs/product/acceptance.md`,
    - append deterministic status checkpoint in `docs/engineering/state.md`,
    - preserve non-target entries unchanged.
12. If one-time normalization baseline is missing, run the documented
    normalization pass and write auditable report rows to
    `docs/engineering/status-normalization-report.md` (story id, prior values,
    resolved values, evidence refs, timestamp).
13. Update backward-compatible legacy file `handoffs/release_notes.md` as
    latest-release pointer and summary:
    - include latest released sprint id,
    - include pointer to canonical sprint-scoped notes file,
    - include visibility section for unreleased queue entries.
14. Update runbook/state readiness and evidence references for release outcome.
    - On pass, ensure `sprints/Sxxxx/release-findings.md` records release outcome
      (`PASS`) and references final evidence artifacts.
15. If `AUTO_RELEASE_NOTES=1` in `.cursor/scratchpad.md`, generation logic must
    still target sprint-scoped notes first and update legacy pointer second.
16. Optional configurable publish targets (US-0054 / DEC-0036):
    - Read `.cursor/scratchpad.md`:
      - `RELEASE_PUBLISH_MODE=disabled|confirm|auto`
      - `RELEASE_TARGETS_FILE`
      - `RELEASE_TARGETS_DEFAULT`
    - If `RELEASE_PUBLISH_MODE=disabled`, skip publish target execution with
      deterministic no-op evidence.
    - Validate target schema in `RELEASE_TARGETS_FILE` before execution:
      - stable `id`, `type`, `enabled`, `order`,
      - supported `type`: `npm|choco|brew|git|docker|cloud|custom|ssh`,
      - env-reference-only secret fields (`*Env`) for sensitive values.
      - fail fast on invalid/missing required fields with
        `PUBLISH_TARGET_CONFIG_INVALID`.
    - Resolve selected targets (explicit request, else
      `RELEASE_TARGETS_DEFAULT`), filter `enabled=true`, and execute in
      deterministic order (`order`, then `id`).
    - If `RELEASE_PUBLISH_MODE=confirm`, require explicit operator confirmation
      before execution; if confirmation is denied/absent, stop with
      `PUBLISH_CONFIRMATION_REQUIRED`.
    - For `ssh` targets, require `hostEnv`, `userEnv`, `authEnv`, and
      `remoteCommand`. Missing required fields fail with
      `PUBLISH_TARGET_CONFIG_INVALID`.
    - If target execution fails, emit `PUBLISH_TARGET_EXECUTION_FAILED` with
      target ID and remediation; do not mutate unrelated release artifacts.
17. Remote runtime connectivity contract (US-0064 / DEC-0044):
    - Extend target interpretation with runtime metadata from
      `RELEASE_TARGETS_FILE`:
      - `runtime.mode` (`local|remote`),
      - endpoint fields (`domainEnv|ipEnv|hostEnv`, `port`, `protocol`),
      - optional ingress metadata (`traefik.enabled`, `router`, `entrypoint`,
        `tls`),
      - optional `dockerOverSsh` contract for ssh targets.
    - Validate remote connectivity fields for remote-mode targets; fail with
      `REMOTE_CONNECTIVITY_CONFIG_INVALID` on missing/invalid requirements.
    - Write/update canonical operator doc:
      `docs/engineering/runtime-connectivity.md` with sanitized endpoint summary
      and local vs remote execution context.
    - In release output/handoffs, include operator connection guidance
      (where hosted, how to connect) without exposing secrets.
18. Release operator Run/Connect/Verify hints contract (US-0067 / DEC-0049):
    - `handoffs/releases/Sxxxx-release-notes.md` must include a deterministic
      operator section order and required fields:
      1) `## Run`:
         - `start_command`
         - `runtime_mode` (`local|remote`)
         - `runtime_context_ref` (link to `docs/engineering/runtime-connectivity.md`
           when available)
      2) `## Connect`:
         - `service_url`
         - `service_port`
         - `health_endpoint`
      3) `## Verify`:
         - `verification_steps` (deterministic numbered list)
         - `expected_health_signal`
      4) `## Credentials`:
         - env-reference-only credential source refs (for example `API_TOKEN_ENV`)
         - expected value source location guidance (for example CI secret store,
           operator shell profile) with no inline secret values
      5) `## Known Issues`:
         - concise deterministic known issues list, or explicit `None`.
    - `handoffs/release_notes.md` must include a concise latest release operator
      summary (start command + endpoint + verify pointer) and link to canonical
      sprint notes.
    - Fail closed when required operator hints are missing/ambiguous or contain
      inline secrets:
      - `RELEASE_OPERATOR_HINTS_MISSING`
      - `RELEASE_OPERATOR_HINTS_AMBIGUOUS`
      - `RELEASE_OPERATOR_HINTS_SECRET_EXPOSURE`
    - Remediation: populate required fields in canonical sprint notes with
      sanitized env-ref-only credential guidance, then rerun `/release`.
19. Version changelog derivation (US-0100 / DEC-0085):
    - Runs **only after** step **9** successful finalization (`unreleased → released`)
      and step **18** operator hints (**US-0067**). Doc writes are **not** publish
      execution — **`RELEASE_PUBLISH_MODE=disabled`** remains valid (**US-0054**).
    - **19a — Resolve semver**: read target queue row **`release_version`**; when
      blank, workflow-only release → **`[Unreleased]`** path only (no per-version file).
    - **19b — Derive work items**: `derive_work_items` for target sprint + coalesce
      peer **`released`** rows sharing normalized semver when semver known
      (`coalesce_sprints_by_semver`).
    - **19c — Write docs**: when semver known → `build_version_doc` +
      `promote_unreleased` + `bind_queue_release_version`; else `append_unreleased`
      only. Per-version SOT = `handoffs/releases/{semver}-release-notes.md` (stem
      without leading **`v`**). Never pass `Sxxxx-release-notes.md` to **`gh -F`**.
    - **19d — Validate (optional enforce)**: when scratchpad
      **`RELEASE_CHANGELOG_ENFORCE=1`** (default **`1`** post-bootstrap), run
      `python scripts/release_changelog_validate.py --repo . --enforce`; record
      outcome in `sprints/Sxxxx/release-findings.md` § version-doc gates. When
      **`0`**, report `skipped` evidence only.

## Fail-safe reason codes and remediation guidance

Required deterministic reason codes:
- `RELEASE_SPRINT_UNRESOLVED`
- `RELEASE_TEST_FAILED`
- `RELEASE_QA_BLOCKERS_OPEN`
- `RELEASE_QA_EVIDENCE_MISSING`
- `RELEASE_UAT_INCOMPLETE`
- `RELEASE_UAT_FAILED`
- `PHASE_CONTEXT_ISOLATION_MISSING`
- `PHASE_CONTEXT_ISOLATION_VIOLATION`
- `ISOLATION_EVIDENCE_STALE`
- `ISOLATION_EVIDENCE_INVALID`
- `RUNTIME_PROOF_MISSING`
- `RUNTIME_PROOF_INVALID`
- `RUNTIME_PROOF_REUSED`
- `RUNTIME_PROOF_STALE`
- `RUNTIME_PROOF_AMBIGUOUS_LINK`
- `RELEASE_GATE_OVERRIDE_APPROVED`
- `LEGACY_NOTES_SPRINT_UNRESOLVED`
- `QUEUE_ENTRY_MISSING`
- `NOTES_REF_MISSING`
- `STATUS_TRANSITION_INVALID`
- `BACKLOG_STATUS_DRIFT`
- `CANONICAL_STATUS_CONFLICT`
- `COMPATIBILITY_CRITICAL_OPEN`
- `COMPONENT_SCOPE_VIOLATION_UNAPPROVED`
- `SPEC_PACK_INCOMPLETE`
- `USER_GUIDE_INCOMPLETE`
- `BACKLOG_DONE_ACCEPTANCE_UNCHECKED`
- `BACKLOG_DONE_TRACEABILITY_MISSING`
- `BACKLOG_DONE_RELEASE_ARTIFACT_MISSING`
- `PUBLISH_TARGET_CONFIG_INVALID`
- `PUBLISH_CONFIRMATION_REQUIRED`
- `PUBLISH_TARGET_EXECUTION_FAILED`
- `REMOTE_CONNECTIVITY_CONFIG_INVALID`
- `RUNTIME_CONNECTIVITY_DOC_WRITE_FAILED`
- `RELEASE_OPERATOR_HINTS_MISSING`
- `RELEASE_OPERATOR_HINTS_AMBIGUOUS`
- `RELEASE_OPERATOR_HINTS_SECRET_EXPOSURE`
- `PHASE_OWNERSHIP_VIOLATION`
- `PHASE_OVERRIDE_EVIDENCE_MISSING`
- `TEST_SCAFFOLD_STACK_UNRESOLVED`
- `TEST_SCAFFOLD_UNSUPPORTED_STACK`
- `TEST_SCAFFOLD_GENERATION_FAILED`

When any reason code is emitted:
- Preserve existing release note artifacts (non-destructive default).
- Do not auto-reconcile by deleting/rebuilding unrelated sprint history.
- Provide actionable remediation steps and require rerun after correction.

## Deterministic artifact ordering contract (US-0058 / DEC-0040)

- Mutations in `/release` must comply with
  `docs/engineering/artifact-ordering-policy.md`.
- Ordering expectations:
  - `docs/engineering/state.md`: append-bottom checkpoint entries only.
  - `docs/product/backlog.md` + `docs/product/acceptance.md`: target story
    normalization while preserving sorted-canonical order.
  - `handoffs/release_queue.md`: append one target sprint row/update in-place for
    that row only.
  - `handoffs/release_notes.md`: update latest pointer section first; keep
    historical list stable.
- Missing/ambiguous placement anchors must fail with
  `ARTIFACT_ORDERING_ANCHOR_AMBIGUOUS` and no partial mutation.

## Cross-phase ownership guard (US-0061 / DEC-0043)

- `/release` mutations must also satisfy
  `docs/engineering/artifact-ownership-policy.md`.
- Release may mutate only release-owned scopes (target sprint queue row, release
  notes pointer/sprint notes, and target story reconciliation surfaces).
- Cross-phase non-owned section rewrites/deletions fail closed with
  `PHASE_OWNERSHIP_VIOLATION`.
- If an override-authorized mutation path is configured but override evidence is
  missing, fail closed with `PHASE_OVERRIDE_EVIDENCE_MISSING`.

