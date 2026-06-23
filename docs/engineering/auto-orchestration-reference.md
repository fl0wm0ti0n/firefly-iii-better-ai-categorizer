# /auto — full orchestration specification (reference)

> **US-0080 / DEC-0062**: Expanded contract for `/auto`. The slim `.cursor/commands/auto.md` is the default injected surface; load this file when full prose, tables, and step detail are required.

## Subagents
- curator
- tech-lead

## Execution model
- `/auto` is a **spawn-only orchestrator**: it schedules materialization, spawns
  fresh **phase-role** subagents, and verifies phase boundaries—it **must not**
  execute lifecycle phase work, perform phase-role duties, or author **phase
  deliverables** in the orchestrator context.
- For each phase, **spawn a fresh subagent** for that phase’s canonical role;
  phase output must arrive only via artifacts and handoff files (no in-turn
  orchestrator execution of that phase).
- Phase context transfer happens only through artifacts and handoff files.
- Scope is process/workflow orchestration only. Do not claim runtime product
  orchestration changes.
- **Bug-queue mode** (**`US-0087`**) uses the same **spawn-only** model: schedule
  materialization and spawn phase-role subagents per bug segment — **never** in-turn
  **`execute`**, **`qa`**, or other lifecycle work in the orchestrator context.
  Missing spawn → **`AUTO_ORCHESTRATOR_PHASE_EXECUTION`** (**`BUG-0006`**,
  **`US-0069`**, **`DEC-0051`**).

## Spawn-boundary integrity (BUG-0006 / US-0080)

This gate is **orthogonal** to per-phase isolation (**DEC-0029**, see
`decisions/DEC-0029.md`) and strict runtime proof (**DEC-0038**, see
`decisions/DEC-0038.md`): satisfying one does not excuse skipping the others.

- **Forbidden**: using the orchestrator context to **perform** a lifecycle phase
  instead of **spawning** the required role subagent (for example in-turn
  **`architecture`**, **`execute`**, or **`qa`** work attributed to the
  orchestrator).
- **Fail fast** with **`AUTO_ORCHESTRATOR_PHASE_EXECUTION`**. **Remediation**:
  stop; spawn a **fresh** subagent for the canonical **`phase_id`** and **`role`**
  per the phase→role matrix (**DEC-0051**); continue only through artifacts and
  handoffs. **Do not** overload **`PHASE_CONTEXT_ISOLATION_VIOLATION`** or
  **`RUNTIME_PROOF_*`** for a spawn-boundary violation—those address wrong-writer
  isolation breaks and attestation failures, not missing spawn.

## Per-phase isolation enforcement (US-0048 / DEC-0029)

`/auto` must enforce fresh-context isolation as a fail-closed contract:

- `/auto` must not write phase deliverables itself. If phase work is performed in
  the orchestrator context, stop immediately with reason code
  `PHASE_CONTEXT_ISOLATION_VIOLATION`.
- Each spawned phase must write isolation evidence with required fields
  (`phase_id`, `role`, `fresh_context_marker`, `timestamp`, `evidence_ref`) to
  the canonical evidence store (`docs/engineering/state.md`) before `/auto`
  proceeds to the next phase.
- `/auto` must fail closed when evidence is missing/invalid/stale (see reason
  codes below). No silent continuation.

Reason codes (deterministic):
- `PHASE_CONTEXT_ISOLATION_MISSING`
- `PHASE_CONTEXT_ISOLATION_VIOLATION`
- `ISOLATION_EVIDENCE_STALE`
- `ISOLATION_EVIDENCE_INVALID`

## Strict runtime proof enforcement (US-0056 / DEC-0038)

`/auto` must enforce strict runtime attestation in addition to artifact-level
isolation evidence:

- Each completed phase must provide a runtime attestation tuple linked to the
  phase checkpoint evidence:
  - `orchestrator_run_id`
  - `runtime_proof_id`
  - `phase_id`
  - `role`
  - `proof_issued_at` (ISO UTC / RFC3339)
  - `proof_ttl_seconds`
  - `proof_hash`
- `runtime_proof_id` must be unique per phase run; reused proof IDs are invalid.
- Proof freshness must be validated against `proof_issued_at` + TTL policy.
- Proof linkage must be deterministic and auditable to checkpoint evidence refs.
- Fail closed on any strict-proof violation; no silent continuation.

Strict-proof reason codes:
- `RUNTIME_PROOF_MISSING`
- `RUNTIME_PROOF_INVALID`
- `RUNTIME_PROOF_REUSED`
- `RUNTIME_PROOF_STALE`
- `RUNTIME_PROOF_AMBIGUOUS_LINK`

## Strict phase role enforcement (US-0069 / DEC-0051)

`/auto` must enforce a deterministic **phase→role contract** with **preflight
admission** before each phase spawn, **fail-closed checkpoint validation** after
each phase completes, and **aligned strict-proof `role`** values. Post-hoc
isolation markers alone are insufficient.

### Canonical phase→role matrix (fixed defaults)

| phase_id | Allowed roles | Default when no valid alternate policy |
|----------|-----------------|----------------------------------------|
| `intake` | `po` | `po` |
| `discovery` | `po` | `po` |
| `research` | `po`, `tech-lead` | `tech-lead` |
| `architecture` | `tech-lead` | `tech-lead` |
| `sprint-plan` | `tech-lead` | `tech-lead` |
| `plan-verify` | `qa`, `tech-lead` | `qa` |
| `execute` | `dev` (override path only) | `dev` |
| `qa` | `qa` | `qa` |
| `verify-work` | `qa` | `qa` |
| `release` | `release` | `release` |
| `refresh-context` | `curator`, `po` | `curator` |

### Alternate-role scratchpad policy (single-valued resolution)

Resolve **exactly one** expected role for phases with alternates using merged
scratchpad (active + `.cursor/scratchpad.local.md`; template parity on install):

- `AUTO_ROLE_RESEARCH`: `po` \| `tech-lead` — when **unset or empty**, default
  `tech-lead`; when set to any other value, fail closed with diagnostics (no
  unrelated-role fallback).
- `AUTO_ROLE_PLAN_VERIFY`: `qa` \| `tech-lead` — when **unset or empty**,
  default `qa`; otherwise only `qa` or `tech-lead` allowed (else fail closed).
- `AUTO_ROLE_REFRESH_CONTEXT`: `curator` \| `po` — when **unset or empty**,
  default `curator`; otherwise only `curator` or `po` allowed (else fail closed).

### Preflight capability gate (before spawn)

Before spawning phase work, `/auto` must:

1. Resolve `phase_id` → expected canonical `role` (matrix + policy keys above).
2. For `execute`, apply **default deny**: expected role is `dev` unless **both**
   `AUTO_EXECUTE_ROLE_OVERRIDE=allowed_non_dev_execute` **and**
   `EXECUTE_OVERRIDE_GOVERNANCE_REF` point to a **parseable** approved exception
   record (for example `DEC-xxxx` or a documented anchor in
   `docs/engineering/state.md`).
3. Evaluate **role capability availability** for that boundary (subagent/tooling
   can satisfy the resolved role).
4. On missing capability: stop with `PHASE_ROLE_CAPABILITY_MISSING` including
   `phase_id`, expected role, observed capability result, and remediation. **Do
   not** spawn under a substitute unrelated role.

### Post-completion boundary validation

When a phase completes, before advancing:

- Isolation evidence `role` must equal the **same** preflight-resolved expected
  role for that `phase_id`. Else stop with `PHASE_ROLE_MISMATCH`.
- Strict-proof tuple `role` must equal isolation `role` and the expected role.
- `proof_hash` must be SHA-256 over canonical sorted-key JSON of
  `orchestrator_run_id`, `runtime_proof_id`, `phase_id`, `role`,
  `proof_issued_at`, `proof_ttl_seconds` (`DEC-0038` / architecture US-0069).

### Resume / `start-from` parity

Every `/auto` invocation (explicit `start-from`, `resume_brief`, or conservative
`state.md` fallback) must **recompute** policy resolution and preflight from
scratch; stale continuation artifacts must not bypass the gate.

### Role-enforcement reason codes (deterministic)

- `PHASE_ROLE_CAPABILITY_MISSING`
- `PHASE_ROLE_MISMATCH`

## Configurable phase selection policy (US-0070 / DEC-0052)

`/auto` must treat the **resolved phase plan** as a first-class, fail-closed
schedule: a single ordered subset of canonical phases computed from merged
scratchpad (active + `.cursor/scratchpad.local.md`; template parity on install),
**before** resume/`start-from` intersection and **before** any phase spawn.

### Canonical lifecycle order (baseline `full` plan)

Unless narrowed by policy, the canonical ordered phase list is:

`intake` → `discovery` → `research` → `architecture` → `sprint-plan` →
`plan-verify` → `execute` → `qa` → `verify-work` → `release` →
`refresh-context`

When `SECURITY_REVIEW=1`, insert `/security-review` in **design** mode
immediately after `architecture` and before `sprint-plan`, and in **code** mode
immediately after `execute` and before `qa`, as documented in **Steps** below.
Record these inserts in `resolved_phase_plan` breadcrumbs using the same
deterministic labels the orchestrator already uses for security boundaries.

### Scratchpad selectors (exactly one active policy mode)

At most one of the following may be materially active after merge. If two or
more non-default selectors conflict, fail closed with `PHASE_POLICY_CONFLICT`
and **do not** materialize a plan:

- `AUTO_PHASE_PLAN=full` — full canonical lifecycle (including security-review
  inserts when enabled). Default when unset and no other selector is set.
- `AUTO_PHASE_EXCLUDE=<csv>` — start from `full`, remove listed phase IDs
  (validate each token; unknown id → `PHASE_PLAN_UNKNOWN_PHASE`).
- `AUTO_PHASE_INCLUDE=<csv>` — schedule **only** listed ids, then **re-sort**
  into canonical lifecycle order. Unknown id → `PHASE_PLAN_UNKNOWN_PHASE`.
  Empty result after parsing → `PHASE_PLAN_EMPTY_INCLUDE`.
- `AUTO_PHASE_PROFILE=<name>` — expand a **named profile** from the registry
  below. Unknown profile → `PHASE_PLAN_UNKNOWN_PROFILE`.

**Conflict rule**: `AUTO_PHASE_PLAN` is default-only when it is unset, empty, or
exactly `full`. Any explicit non-`full` `AUTO_PHASE_PLAN` value is invalid
(fail closed with `PHASE_PLAN_INVALID_AUTO_PHASE_PLAN`) — use `INCLUDE` /
`EXCLUDE` / `PROFILE` instead.

### Profile registry (baseline)

- `default` — equivalent to `full` (optional explicit alias; same behavior as
  unset policy).

**High-risk profile sketch** (illustrative; `R-0049`): `profile_high_risk_dev_fast`
may only be selected when **both** hold: `AUTO_PHASE_PROFILE=profile_high_risk_dev_fast`
and `AUTO_PHASE_HIGH_RISK_ACK=<operator_token>` matches the profile spec
version documented in `decisions/DEC-0052.md` / research `R-0049`. Missing ack →
`PHASE_PLAN_HIGH_RISK_ACK_REQUIRED`. High-risk profiles may define **narrower**
reinstatement rules **only** as documented for that profile; default profile
behavior applies otherwise.

### Plan materialization pipeline (evaluation order)

On every `/auto` entry (including resume, backlog-drain, bug-queue, bulk execute, and
team-mode runs), **recompute** from merged scratchpad:

1. Parse merged scratchpad policy inputs for phase selection + `SECURITY_REVIEW`.
2. Detect active policy mode; on conflict → `PHASE_POLICY_CONFLICT` (no plan).
3. Expand mode to a **candidate** ordered phase list in canonical order.
4. Apply **non-skippable reinstatement** for the **default profile** (and for
   any profile that does not explicitly document a narrower exception with ack):
   - **Safety gates**: always reinstate if removed: `qa`, `verify-work`,
     `release`.
   - **Evidence-chain closure**: if the candidate retains any phase from
     `execute` onward (`execute`, optional `security-review-code`, `qa`,
     `verify-work`, `release`, `refresh-context`), reinstate (if removed) the
     contiguous canonical prefix from `intake` through `plan-verify` so later
     gates retain valid upstream isolation + strict-proof chain semantics.
   - When `SECURITY_REVIEW=1`, reinstate the corresponding `security-review-*`
     insert when the adjacent retained phases would otherwise violate the
     documented security boundary contract.
   Record each reinstatement in breadcrumbs with reason `non_skippable_gate`
   (or a more specific documented code).
5. Record **operator-visible plan breadcrumbs** to `docs/engineering/state.md`
   **before** first spawn (append-bottom per `DEC-0040`):
   - `phase_policy_mode` (`full|exclude|include|profile`)
   - `resolved_phase_plan` (ordered `phase_id` list)
   - `skipped_phases` (id + reason: `policy_exclude`, `non_skippable_gate`,
     `default_full_plan`, etc.)
   - `orchestrator_run_id` (when known for this run)
6. **Do not** silently revive phases omitted by policy on continuation: every
   entry re-reads scratchpad bytes and recomputes the plan class.

### `start-from` and resume intersection with the resolved plan

After computing the **resolved phase plan**, resolve the **nominal** start
phase using **Deterministic resume-source precedence** (explicit `start-from`
→ **`bug-target=`** argv (when present) → merged scratchpad → `resume_brief` →
`state` fallback → fail-fast).

Then **intersect**:

- Keep phases that appear in the resolved plan **in plan order**, starting at
  the first plan phase whose canonical position is **at or after** the nominal
  anchor phase (canonical order matches the baseline list above, including
  security inserts when enabled).
- If the intersection is empty, fail closed with
  `START_FROM_PHASE_PLAN_EMPTY_INTERSECTION` and diagnostics listing
  `resolved_phase_plan` vs `requested_start_phase` / resume inference.

### Compatibility with `US-0069` / `DEC-0051`

- Role resolution and preflight apply **only** to phases present in the
  intersected schedule. Skipping `research` does **not** change the expected
  role for `architecture` or any other retained phase.
- Skipped phases produce **no** spawn and **no** alternate-role substitution
  for a different phase.

### Phase-plan reason codes (deterministic)

Add to operator diagnostics and breadcrumb records:

- `PHASE_POLICY_CONFLICT`
- `PHASE_PLAN_UNKNOWN_PHASE`
- `PHASE_PLAN_EMPTY_INCLUDE`
- `PHASE_PLAN_UNKNOWN_PROFILE`
- `PHASE_PLAN_INVALID_AUTO_PHASE_PLAN`
- `PHASE_PLAN_HIGH_RISK_ACK_REQUIRED`
- `START_FROM_PHASE_PLAN_EMPTY_INTERSECTION`

### Phase boundary operator visibility (AC-10)

At each phase boundary (after completing a scheduled phase), record a compact
**phase boundary status** entry (for example in `docs/engineering/state.md`
continuation breadcrumbs) including:

- `resolved_phase_plan` snapshot (or stable hash pointer to the run’s plan record)
- `skipped_phases` summary (id + reason code)
- `phase_boundary` (completed `phase_id`)
- `next_scheduled_phase` (or `none` when complete/stopped)

**`US-0087` bug-queue extensions** (when bug scheduler is active or segment is
bug-scoped; see **`architecture.md`** **`# US-0087`**):

- `segment_work_item_kind` (`story|bug`)
- `active_bug_id` (`BUG-####` or `(none)`)
- `bug_queue_position` (1-based into **OPEN** ordering for `all-open`, or `(none)`)
- `bug_queue_remaining` (integer or `(none)`)
- `backlog_drain_active` (boolean — story **`AUTO_BACKLOG_DRAIN`** drives **this** run)
- `bug_queue_active` (boolean — bug scheduler drives **this** run)

**Invariant**: `backlog_drain_active` and `bug_queue_active` must **not** both be
true for the same materialized run (scheduler mutex).

## Inputs
- Merged scratchpad policy (`US-0073` / `DEC-0055`): resolve flags from **local >
  materialized `.cursor/scratchpad.md` > `.cursor/scratchpad.local.example.md`**
  (installers materialize baseline when missing; missing required keys after merge
  must fail closed with `[SCRATCHPAD_MERGE_ERROR]` diagnostics, not silent defaults).
- `AUTO_FLOW_MODE` and `PHASE_MODE` from merged scratchpad
- `AUTO_IMPLEMENTATION_LOOP`, `AUTO_LOOP_MAX_CYCLES` from merged scratchpad
- `AUTO_PAUSE_REQUEST`, `AUTO_PAUSE_POLICY` from merged scratchpad
- `SECURITY_REVIEW`, `COMPLIANCE_PROFILES` from merged scratchpad
- `AUTO_EXECUTE_BULK`, `AUTO_EXECUTE_MAX_ITEMS`, `AUTO_EXECUTE_ON_BLOCK`,
  `AUTO_EXECUTE_SELECTION`, `AUTO_TEAM_SCOPE_ENFORCE` from merged scratchpad
- `AUTO_ROLE_RESEARCH`, `AUTO_ROLE_PLAN_VERIFY`, `AUTO_ROLE_REFRESH_CONTEXT`,
  `AUTO_EXECUTE_ROLE_OVERRIDE`, `EXECUTE_OVERRIDE_GOVERNANCE_REF` from merged
  scratchpad (US-0069 / DEC-0051)
- `AUTO_PHASE_PLAN`, `AUTO_PHASE_EXCLUDE`, `AUTO_PHASE_INCLUDE`,
  `AUTO_PHASE_PROFILE`, `AUTO_PHASE_HIGH_RISK_ACK` from merged scratchpad
  (US-0070 / DEC-0052)
- `TEAM_MODE`, `TEAM_MEMBER`, `ACTIVE_TASK_IDS` from merged scratchpad context
- Current product and engineering docs
- Optional explicit argument: `start-from=<phase>`
- Optional explicit argument: **`bug-target=BUG-####`** or **`bug-target=all-open`**
  (**`US-0087`**; parsed before merged scratchpad scheduler keys)
- Optional explicit argument: `--execute-bulk` (one-run explicit override)
- `AUTO_BUG_QUEUE`, `AUTO_BUG_TARGET`, `AUTO_BUG_MAX_ITEMS`, `AUTO_BUG_ON_BLOCK`
  from merged scratchpad (**`US-0087`**)
- Resume-source artifacts:
  - `handoffs/resume_brief.md`
  - `docs/engineering/state.md`

## Automation remote routing contract (US-0086)

This contract is deterministic and default-off. It composes with `US-0064`,
`DEC-0070`, `US-0085`, and `DEC-0071`.

Automation profile controls (merged scratchpad):

- `AUTO_REMOTE_AUTOMATION_PROFILE`: `off|deterministic_v1`
- `AUTO_REMOTE_ENVIRONMENT_LABEL`: `local|docker|ssh` (names-only evidence)
- `REMOTE_EXECUTION`: `0|1` (remote config validation gate from `US-0084`)
- `REMOTE_CONFIG`: canonical remote config path

Mode split:

- `AUTO_REMOTE_AUTOMATION_PROFILE=off` -> preserve manual/local behavior; no
  silent remote reroute.
- `AUTO_REMOTE_AUTOMATION_PROFILE=deterministic_v1` -> routing policy may resolve
  Docker/SSH/local targets for automation workflows.

NL intent resolution (v1 literal):

- Parse only the exact phrase `start container <target_id>`.
- Resolve `<target_id>` against canonical enabled `targets[].id`.
- Unknown id -> fail closed `REMOTE_TARGET_UNKNOWN`.
- Known but disabled id -> fail closed `REMOTE_TARGET_DISABLED`.

Routing precedence when profile is enabled:

1. Explicit NL intent target (`start container <target_id>`).
2. Canonical target validation (`targets[].id`, enabled state).
3. Heuristic fallback (documented file-class matrix).
4. Local default when no remote target is selected.

Fail-closed reason codes (locked by `architecture.md` `# US-0086`):

- `REMOTE_AUTOMATION_MODE_OFF`
- `REMOTE_TARGET_UNKNOWN`
- `REMOTE_TARGET_DISABLED`
- `REMOTE_TARGET_UNROUTABLE`

Evidence tuple contract for execute/qa/release handoffs and `state.md`:

- `target_id`
- `environment_label`
- `automation_profile`
- `routing_source` (`explicit_intent|heuristic_fallback|local_default`)
- `secret_surface=names_only`

Security continuity:

- Automation must not read `.env` directly.
- Output remains names-only; do not print secret values in logs, handoffs, or
  state artifacts.

## Canonical status contract (US-0045)

- Story status authority is `docs/product/backlog.md` only.
- `docs/product/acceptance.md` and `docs/engineering/state.md` are derived views.
- `/auto` must not infer implementation readiness from non-canonical status
  artifacts when they conflict with backlog status.

## Outputs (artifacts)
- Updated phase artifacts for each step
- `docs/engineering/state.md`
- `handoffs/resume_brief.md` if stopped
- `sprints/S0001/qa-findings.md` and `handoffs/qa_to_dev.md` when loop finds issues
- Deterministic continuation breadcrumbs in relevant artifacts

## Stop conditions

Deterministic stop reasons for continuous and looping runs (aligned with
**Deterministic stop matrix (US-0088)** above):

- `completed` — all intersected phases finished; segment done.
- `decision_gate` — decision gate triggered; non-suppressible.
- `missing_input` — missing critical input; non-suppressible.
- `pause_request` — `AUTO_PAUSE_REQUEST=1` reached at a safe boundary; non-suppressible.
- `loop_max` — `AUTO_LOOP_MAX_CYCLES` reached with unresolved defects; non-suppressible.
- `error` — runtime or configuration error; non-suppressible.
- `blocked` — sync/scope gate or external blocker; non-suppressible.

## Optional backlog-drain mode (US-0044 / DEC-0022)

`/auto` supports an optional multi-story backlog-drain mode. Default behavior
remains unchanged unless explicitly enabled.

Canonical controls from `.cursor/scratchpad.md`:
- `AUTO_BACKLOG_DRAIN`: `0|1` (default `0`)
- `AUTO_BACKLOG_MAX_STORIES`: integer `>=1` (default `1`)
- `AUTO_BACKLOG_ON_BLOCK`: `stop|skip` (default `stop`)
- `AUTO_STORY_SELECTION`: `priority_then_backlog_order` (default)

Deterministic behavior when enabled (`AUTO_BACKLOG_DRAIN=1`):
- Select next eligible OPEN story via `AUTO_STORY_SELECTION`.
- **Advance through multiple phases** of the resolved lifecycle per story
  (**reference Step 5**) — the orchestrator does not stop after one phase
  unless a deterministic stop condition fires (see **Deterministic stop matrix
  (US-0088)**).
- After each story's terminal boundary (`refresh-context` completion or policy
  stop), **recompute the materialized phase plan** by reloading merged
  scratchpad phase-selection inputs at the story boundary (**US-0044** /
  **US-0088**). The next eligible OPEN story starts with a fresh plan class —
  no silent revival of omitted phases from the prior story's plan.
- Continue to next eligible OPEN story until:
  - `AUTO_BACKLOG_MAX_STORIES` limit reached (`BACKLOG_MAX_STORIES_REACHED`), or
  - no eligible stories remain, or
  - stop condition / decision gate occurs.
- On blocked story:
  - `AUTO_BACKLOG_ON_BLOCK=stop` → stop immediately.
  - `AUTO_BACKLOG_ON_BLOCK=skip` → record skip reason and continue to next story.
- Track `backlog_drain_stories_remaining_budget` across boundaries; notify
  operator on segment handoff / drain advance (non-routine, non-suppressible
  even when `AUTO_QUIET=1`).

Default-safe behavior:
- With `AUTO_BACKLOG_DRAIN=0`, preserve existing single-segment continuation.

## Optional bug-queue mode (US-0087)

`/auto` supports an optional, **default-off** bug-queue scheduler for **OPEN**
defects in **`docs/product/backlog.md`** **`## Bug issues (canonical)`**,
orthogonal to story-only **`AUTO_BACKLOG_DRAIN`** (**`US-0044`** / **`DEC-0022`**).
Bug-queue mode is **spawn-only** — same **`AUTO_ORCHESTRATOR_PHASE_EXECUTION`**
contract as other phases (**`BUG-0006`**, **`US-0069`** / **`DEC-0051`**).

### Canonical argv literals (AC-1)

Exact tokens (**no aliases** in v1; contract-tested):

- **`bug-target=BUG-####`** — single **OPEN** bug (example: **`bug-target=BUG-0007`**).
- **`bug-target=all-open`** — deterministic **OPEN**-only queue.

### Scratchpad keys (merged; `template/` parity)

Default-off when unset (see **`architecture.md`** **`# US-0087`**):

- **`AUTO_BUG_QUEUE`**: `0|1`
- **`AUTO_BUG_TARGET`**: `all-open` | **`BUG-####`** — required when **`AUTO_BUG_QUEUE=1`**
  unless **`bug-target=`** argv supplies the target for this invocation.
- **`AUTO_BUG_MAX_ITEMS`**: non-negative integer — optional cap on bugs consumed per
  orchestrator run for **`all-open`**; **`0`** or unset = no cap beyond queue length.
- **`AUTO_BUG_ON_BLOCK`**: `stop|skip` — queue behavior when a bug segment stops at a
  pause/stop boundary.

### Scheduler mutex and argv precedence (AC-3)

**One active scheduler** per materialized run:

- If merged scratchpad has **`AUTO_BACKLOG_DRAIN=1`** **and** **`AUTO_BUG_QUEUE=1`**
  **and** this invocation has **no** explicit **`bug-target=`** argv token → fail
  closed with **`[AUTO_RESUME_ERROR] AUTO_SCHEDULER_CONFLICT: ...`**.
- When **`bug-target=`** argv is present, it **selects** the bug scheduler for this
  run; **`AUTO_BACKLOG_DRAIN`** must **not** drive story selection for the same
  materialized run (story drain keys ignored for scheduler selection; record
  **`backlog_drain_active=false`**, **`bug_queue_active=true`** in **AC-10** for
  that run).

**Parsing order** before nominal resume resolution: **`start-from`** → **`bug-target=`**
argv → merged scratchpad (**`AUTO_BACKLOG_DRAIN`**, **`AUTO_BUG_*`**) →
**`resume_brief.md`** → **`state.md`** fallback (**`architecture.md`** **`# US-0087`**).

### OPEN queue semantics (AC-4)

- **OPEN** rows only in the canonical bug section — exclude **DONE** and non-matching ids.
- **Ordering**: ascending **numeric** sort on **`BUG-####`** (stable document-order
  tie-break if needed).
- **`AUTO_BUG_MAX_ITEMS`**: when set to positive integer *N*, consume at most *N*
  bugs from the head of the ordered queue this run; record **`bug_queue_remaining`**
  for operator visibility.
- **Empty queue** when **`bug-target=all-open`** (or equivalent) and zero **OPEN**
  bugs → **`[AUTO_RESUME_ERROR] AUTO_BUG_QUEUE_EMPTY: ...`** (or equivalent
  deterministic envelope).

### Fail-closed reason codes (AC-1, AC-4, AC-8)

| Code | When |
|------|------|
| **`AUTO_BUG_QUEUE_EMPTY`** | **`all-open`** and zero **OPEN** bugs. |
| **`AUTO_BUG_TARGET_UNKNOWN`** | Malformed id / pattern, or id missing from canonical bug section. |
| **`AUTO_BUG_TARGET_NOT_OPEN`** | Known id, status not **OPEN**. |
| **`AUTO_SCHEDULER_CONFLICT`** | **`AUTO_BACKLOG_DRAIN=1`** ∧ **`AUTO_BUG_QUEUE=1`** without **`bug-target=`** argv. |

Do **not** overload **`PHASE_POLICY_CONFLICT`** or backlog-drain codes for these.

### Bug segment fields: `resume_brief.md` + `state.md` (`DEC-0069` / AC-5)

Default: **paired** refresh at segment boundaries — update **`handoffs/resume_brief.md`**
**and** append **`docs/engineering/state.md`** breadcrumbs together so continuation
without **`start-from`** avoids false **`RESUME_BRIEF_STALE`**.

| Field | Purpose |
|-------|---------|
| **`bug_id`** | Active **`BUG-####`** for this segment (**OPEN**), or **`(none)`**. |
| **`bug_queue_position`** | 1-based index into **OPEN** ordering for **`all-open`**; else **`(none)`**. |
| **`bug_queue_remaining`** | Count of **OPEN** bugs after current position; **`(none)`** when not queue-scoped. |
| **`intended_resume_phase`** | Next phase for this segment (align with **`next_scheduled_phase`** on `state.md`). |

Mirror the **AC-10** tuple (`segment_work_item_kind`, `active_bug_id`,
`backlog_drain_active`, `bug_queue_active`, etc.) in both surfaces per
**`architecture.md`** **`# US-0087`**.

## Optional bulk execute mode (US-0047 / DEC-0024)

`/auto` supports an explicit bulk execute orchestration mode for continuous
planned-item delivery. Default behavior remains unchanged unless explicitly
enabled.

Canonical controls from `.cursor/scratchpad.md`:
- `AUTO_EXECUTE_BULK`: `0|1` (default `0`)
- `AUTO_EXECUTE_MAX_ITEMS`: integer `>=1` (default `1`)
- `AUTO_EXECUTE_ON_BLOCK`: `stop|skip` (default `stop`)
- `AUTO_EXECUTE_SELECTION`: `planned_then_priority` (default)
- `AUTO_TEAM_SCOPE_ENFORCE`: `0|1` (default `1`)

Explicit activation contract:
- Bulk execute mode is activated when either:
  - explicit argument `--execute-bulk` is present for this run, or
  - `AUTO_EXECUTE_BULK=1` in scratchpad.
- Without explicit activation, preserve current non-bulk continuation behavior.

Deterministic behavior when enabled:
- Select next eligible planned work item via `AUTO_EXECUTE_SELECTION`.
- Process each item with strict isolation:
  - fresh subagent per phase boundary
  - fresh subagent per execute<->QA loop cycle
- Apply bounded stop criteria:
  - stop at `AUTO_EXECUTE_MAX_ITEMS`, or
  - stop/skip on blocked item per policy, or
  - stop when no eligible items remain.

Team mode guardrails (`TEAM_MODE=1`):
- Snapshot and record team context inputs:
  - `TEAM_MODE`, `TEAM_MEMBER`, `ACTIVE_TASK_IDS`
- If `AUTO_TEAM_SCOPE_ENFORCE=1`, only tasks in current member scope are
  executable.
- Out-of-scope tasks must be deterministically handled with no writes:
  - `stop` policy -> `EXEC_TEAM_SCOPE_BLOCKED`
  - `skip` policy -> `EXEC_TEAM_SCOPE_SKIPPED`

## Sync policy contract (US-0038 / DEC-0018)

`/auto` may evaluate sync eligibility only at phase-completion boundaries.
It remains process-level guidance (no runtime git orchestrator changes).

Canonical policy controls from `.cursor/scratchpad.md`:
- `SYNC_POLICY_MODE`:
  `disabled|manual|by_phase|by_milestone|custom_phase_list`
- `SYNC_CUSTOM_PHASES`: comma-separated canonical phase IDs for
  `custom_phase_list` mode
- `ALLOW_AUTO_PUSH`: `0|1`
- `AUTO_PUSH_BRANCH_ALLOWLIST`: comma-separated branches/patterns

Deterministic policy semantics:
- `disabled`: skip sync evaluation entirely (`SYNC_DISABLED`).
- `manual`: no auto-sync attempts (`MANUAL_MODE_NO_AUTO`).
- `by_phase`: evaluate at every phase completion boundary.
- `by_milestone`: evaluate only at milestone completion boundary.
- `custom_phase_list`: evaluate only when completed phase is listed.
- Unset/invalid mode fails closed to `manual`.

Guarded auto-push eligibility chain (all required):
1. Boundary is eligible for configured mode.
2. `ALLOW_AUTO_PUSH=1`.
3. QA-first safety passes (feature work cannot auto-push before QA pass;
   manual user-invoked sync remains allowed).
4. No unresolved blocking QA findings / critical unresolved issues.
5. Branch safety passes: protected/default branches are denied by default unless
   explicitly allowlisted.
6. Mandatory pre-push checks pass:
   - `TEST_COMMAND` is required
   - optional `LINT_COMMAND` / `TYPECHECK_COMMAND` run only when configured
   - failures or timeout result in `no_push`

If any condition fails, verdict is deterministic `no_push` with reason code.

Reason-code baseline:
- `SYNC_DISABLED`
- `MANUAL_MODE_NO_AUTO`
- `SYNC_TRIGGER_NOT_ELIGIBLE`
- `AUTO_PUSH_NOT_ENABLED`
- `PRE_QA_AUTOPUSH_FORBIDDEN`
- `BLOCKING_QA_FINDINGS`
- `BRANCH_NOT_ALLOWLISTED`
- `TEST_COMMAND_MISSING`
- `TEST_FAILED`
- `TEST_TIMEOUT`
- `OPTIONAL_CHECK_FAILED`
- `SYNC_PUSHED`
- `BACKLOG_DRAIN_DISABLED`
- `BACKLOG_STORY_BLOCKED_STOP`
- `BACKLOG_STORY_BLOCKED_SKIPPED`
- `BACKLOG_MAX_STORIES_REACHED`
- `BACKLOG_NO_ELIGIBLE_STORIES`
- `EXEC_BULK_DISABLED`
- `EXEC_BULK_ITEM_BLOCKED_STOP`
- `EXEC_BULK_ITEM_BLOCKED_SKIPPED`
- `EXEC_BULK_MAX_ITEMS_REACHED`
- `EXEC_BULK_NO_ELIGIBLE_ITEMS`
- `EXEC_TEAM_SCOPE_BLOCKED`
- `EXEC_TEAM_SCOPE_SKIPPED`
- `RUNTIME_PROOF_MISSING`
- `RUNTIME_PROOF_INVALID`
- `RUNTIME_PROOF_REUSED`
- `RUNTIME_PROOF_STALE`
- `RUNTIME_PROOF_AMBIGUOUS_LINK`
- `PHASE_ROLE_CAPABILITY_MISSING`
- `PHASE_ROLE_MISMATCH`
- `PHASE_POLICY_CONFLICT`
- `PHASE_PLAN_UNKNOWN_PHASE`
- `PHASE_PLAN_EMPTY_INCLUDE`
- `PHASE_PLAN_UNKNOWN_PROFILE`
- `PHASE_PLAN_INVALID_AUTO_PHASE_PLAN`
- `PHASE_PLAN_HIGH_RISK_ACK_REQUIRED`
- `START_FROM_PHASE_PLAN_EMPTY_INTERSECTION`

## Canonical `start-from` contract

- Accepted canonical phase IDs:
  - `intake`
  - `discovery`
  - `research`
  - `architecture`
  - `sprint-plan`
  - `plan-verify`
  - `execute`
  - `qa`
  - `verify-work`
  - `release`
  - `refresh-context`
- Only canonical IDs are accepted. Alias values (for example `sprint_plan`,
  `verifywork`) are invalid and must fail fast.

## Deterministic resume-source precedence

Resolve nominal start phase and scheduler inputs in strict order (**`US-0087`**
extends ordering vs legacy two-step resume):

1. Explicit `/auto start-from=<phase>`
2. Explicit **`bug-target=`** argv token when present (`bug-target=BUG-####` or
   `bug-target=all-open`) — parsed **before** merged scratchpad scheduler keys;
   selects bug scheduler for this run when applicable.
3. Merged scratchpad (**`US-0073`** / **`DEC-0055`**) — `AUTO_BACKLOG_DRAIN`,
   **`AUTO_BUG_QUEUE`**, **`AUTO_BUG_TARGET`**, related flags.
4. `handoffs/resume_brief.md`
5. Conservative `docs/engineering/state.md` fallback
6. Fail fast on ambiguity/conflict/unrecoverable inputs (including
   **`AUTO_SCHEDULER_CONFLICT`** when **`AUTO_BACKLOG_DRAIN=1`** ∧
   **`AUTO_BUG_QUEUE=1`** without **`bug-target=`** argv).

Deterministic precedence behavior:
- If explicit `start-from` is valid, it wins for the **nominal start phase** anchor;
  scheduler mutex (**`AUTO_SCHEDULER_CONFLICT`**) is still evaluated when scratchpad
  enables both drains without **`bug-target=`** argv resolution.
- **`bug-target=`** argv when present overrides conflicting scratchpad scheduler
  selection for **this** run (bug queue active; story drain inactive for scheduling).
- `state.md` fallback applies only per the ordered chain above when higher-priority
  sources do not supply a trustworthy anchor.
- If `resume_brief.md` is present but stale or unparseable, fail fast instead
  of silently falling back.

## Conflict and stale/unparseable policy

- Explicit valid override always wins and is logged as override.
- **`AUTO_BACKLOG_DRAIN=1`** and **`AUTO_BUG_QUEUE=1`** together without explicit
  **`bug-target=`** argv → **`AUTO_SCHEDULER_CONFLICT`** (fail fast; do not pick a
  silent default scheduler).
- No override + `resume_brief` conflicts with `state` inference: fail fast.
- `resume_brief` exists but stale: fail fast.
- `resume_brief` exists but unparseable: fail fast.
- `state` fallback yields multiple candidate phases: fail fast.
- `state` fallback yields no trustworthy boundary: fail fast.

## Fail-fast error code contract

All resume-resolution failures must use:

`[AUTO_RESUME_ERROR] <code>: <summary>. Source=<source>. Fix: <action>.`

Required codes:
- `INVALID_START_FROM`
- `RESUME_BRIEF_MISSING`
- `RESUME_BRIEF_STALE`
- `RESUME_BRIEF_UNPARSEABLE`
- `RESUME_STATE_CONFLICT`
- `STATE_PHASE_AMBIGUOUS`
- `STATE_PHASE_UNRECOVERABLE`

Bug-queue extensions (**`US-0087`**; use the same **`[AUTO_RESUME_ERROR]`** envelope
for resolver/materialization failures):

- `AUTO_SCHEDULER_CONFLICT`
- `AUTO_BUG_QUEUE_EMPTY`
- `AUTO_BUG_TARGET_UNKNOWN`
- `AUTO_BUG_TARGET_NOT_OPEN`

## Continuous multi-phase execution (US-0088)

A single `/auto` orchestrated run (or a **documented equivalent outer driver** —
see **AC-1 equivalence** below) advances through **all phases** in the
**intersected resolved schedule** (**Step 5** below — cross-anchor:
**"reference Step 5"**) until a **deterministic stop condition** fires. The
orchestrator does **not** stop after spawning one phase unless the stop matrix
requires it.

### Outer-driver equivalence (AC-1, Option B)

When a single Cursor `/auto` invocation cannot schedule multiple fresh subagent
turns (product/runtime constraint), a **documented outer driver** (operator
script or manual re-invocation with `start-from` / refreshed `resume_brief`) is
**deterministically equivalent** provided all of the following hold:

- Same intersected phase order as a single-invocation run.
- Same per-phase isolation evidence (**DEC-0029**) + strict-proof attestation
  (**DEC-0038**).
- Same deterministic stop reasons and stop matrix evaluation.
- Same `resume_brief` + `state.md` refresh at every materialized phase boundary.
- Operators must follow the runbook recipe
  (**`docs/engineering/runbook.md`** § Continuous `/auto` + backlog drain).

### Deterministic stop matrix (US-0088)

| Condition | Behavior | Operator notify (AC-2) |
|-----------|----------|------------------------|
| Next phase exists, no hard stop | **Continue** — preflight US-0069, spawn next phase | Quiet OK when `AUTO_QUIET=1` |
| `decision_gate` | **Stop** until resolved | **Always** (non-suppressible) |
| `error` / missing critical input | **Stop** | **Always** (non-suppressible) |
| `AUTO_PAUSE_REQUEST` / `pause` | **Stop** at safe boundary | **Always** (non-suppressible) |
| `AUTO_LOOP_MAX_CYCLES` / `loop_max` | **Stop** | **Always** (non-suppressible) |
| `blocked` (sync/scope gate) | **Stop** | **Always** (non-suppressible) |
| US lifecycle DONE / sprint segment complete | **Stop** segment; `AUTO_BACKLOG_DRAIN=1` may advance to next OPEN story (recompute phase plan — **Step 5**) | Notify on segment handoff (non-routine) |
| `BACKLOG_MAX_STORIES_REACHED` | **Stop** | **Always** (non-suppressible) |

`stop_reason` vocabulary: `completed`, `decision_gate`, `missing_input`,
`pause_request`, `loop_max`, `error`, `blocked`.

### Full-autonomy stop matrix (US-0092)

**`AUTO_FLOW_MODE=full_autonomy`** enables **`scripts/auto_outer_driver.py`**
(spawn-only outer driver). **TOKEN_PROFILE controls context breadth / token cost only**
— never automation level, drain, or outer-driver invocation.

| Condition | US-0088 | `full_autonomy` delta | Operator notify |
|-----------|---------|------------------------|-----------------|
| Next phase, no hard stop | Continue inner `/auto` | Outer driver **re-invokes** when Cursor ends turn early | Quiet OK when `AUTO_QUIET=1` |
| `decision_gate` | Hard stop | **No change — hard** | Always |
| Unrecoverable `error` | Hard stop | **No change — hard** | Always |
| Critical `missing_input` | Hard stop | **No change — hard** | Always |
| Transient `missing_input` (recoverable) | Hard stop | **Relaxable** — bounded block-retry | Notify on cap |
| `pause_request` | Hard stop | **No change — hard** | Always |
| `loop_max` | Hard stop | **No change — hard** | Always |
| `blocked` — transient/sync | Hard stop | **Relaxable** when recoverable | Notify on cap |
| `blocked` — isolation/strict-proof/ownership | Hard stop | **No change — hard** | Always |
| UAT/QA fail | Hard stop (operator) | **Relaxable** when `AUTO_IMPLEMENTATION_LOOP=1` | Notify on cap |
| Segment complete + `AUTO_BACKLOG_DRAIN=1` | Advance (may need manual re-`/auto`) | **Drain-advance-without-pause** — immediate next item | Segment handoff notify |
| `BACKLOG_MAX_STORIES_REACHED` | Hard stop | **No change — hard** | Always |
| `AUTO_SCHEDULER_CONFLICT` | Hard stop | **No change — hard** | Always |
| `RELEASE_PUBLISH_MODE=auto` | Explicit opt-in | **No change — hard default-off** | Always on publish |
| Security deny (`.env`, intake mutation) | Hard deny | **No change — hard** | Always |

**Drain-advance-without-pause**: outer driver schedules next OPEN story/bug immediately;
paired **`resume_brief`** + **`state.md`** refresh per **DEC-0069** at every boundary.

### Block-retry ledger + cap interaction (US-0092)

Append-only **`handoffs/auto_block_retry/<orchestrator_run_id>.jsonl`** — names-only;
no secrets. Cap interaction:

| Cap | Scope |
|-----|-------|
| `AUTO_LOOP_MAX_CYCLES` | Outer-driver `/auto` invocations (incl. drain advances) |
| `AUTO_IMPLEMENTATION_LOOP` | Inner `execute`↔`qa`↔`verify-work` when `1` |
| `AUTO_BLOCK_RETRY_MAX` | Per `(story_id, stop_reason)` recoverable retries |
| `AUTO_BACKLOG_MAX_STORIES` | Drain breadth — outer driver exit **4** |

Cap exhaustion → exit **6** `BLOCK_RETRY_CAP_EXHAUSTED`. Ordering: outer driver checks
`AUTO_LOOP_MAX_CYCLES` first; orchestrator checks `AUTO_IMPLEMENTATION_LOOP` +
`AUTO_BLOCK_RETRY_MAX` before scheduling remediation.

### `AUTO_QUIET` vs `TOKEN_PROFILE` (US-0088 / AC-2)

| Key | Values | Role |
|-----|--------|------|
| `AUTO_QUIET` | `0` \| `1` (default `0`) | `1` = suppress routine per-phase success chatter; must **not** suppress `decision_gate`, errors, pause, `loop_max`, `blocked`, or missing inputs. |
| `TOKEN_PROFILE` | `lean` \| `balanced` \| `full` | **TOKEN_PROFILE controls context breadth / token cost only** — **DEC-0035** / **US-0080** / **US-0092**; **orthogonal** to `AUTO_QUIET`, drain, and outer-driver invocation. |

### `TOKEN_PROFILE` × `CAVEMAN_MODE` non-substitution (US-0089 / DEC-0072 §1)

`TOKEN_PROFILE` controls context breadth. `CAVEMAN_MODE` controls reply voice. Neither substitutes for the other; setting one does not change the other. Combine freely.

`CAVEMAN_MODE` and `CAVEMAN_LEVEL` live in `.cursor/scratchpad.md` (default
`CAVEMAN_MODE=0`, `CAVEMAN_LEVEL=` empty). `CAVEMAN_COMPRESS_INPUT` and
`CAVEMAN_FILE_SCOPE` are reserved for **US-0090** and remain **documented
no-ops** in US-0089. The literal-region invariant, the five canonical
operator toggle phrases (`caveman on`, `caveman off`, `stop caveman`,
`normal mode`, `caveman: lite|full|ultra`), and the `CAVEMAN_LEVEL_UNKNOWN`
fail-closed contract live in `.cursor/rules/caveman.mdc`. Default-off is
enforced by the `test_caveman_default_off_*` subtests in
`tests/auto_command_contract_test.py` (**DEC-0072** §6).

### `TOKEN_PROFILE` × `CAVEMAN_MODE` × `CAVEMAN_COMPRESS_INPUT` non-substitution (US-0090 / DEC-0073 §1)

`TOKEN_PROFILE` controls context breadth. `CAVEMAN_MODE` controls reply voice. `CAVEMAN_COMPRESS_INPUT` controls input-side file compression. All three axes are orthogonal: setting one does not change the others, and none substitutes for another.

`CAVEMAN_COMPRESS_INPUT` and `CAVEMAN_FILE_SCOPE` live in
`.cursor/scratchpad.md` (defaults: `CAVEMAN_COMPRESS_INPUT=0`,
`CAVEMAN_FILE_SCOPE=` empty). Activation also requires the operator to
invoke `scripts/caveman_compress_input.py --write`; absent any of the three
conditions the script is a no-op and the fail-closed reason codes from
**DEC-0073** §7 apply. Default-off is enforced by the
`test_caveman_compress_input_*` subtests in
`tests/auto_command_contract_test.py` (**DEC-0073** §11).

## Steps
1. Read automation flags from merged scratchpad and **materialize the resolved
   phase plan** per **Configurable phase selection policy (US-0070 / DEC-0052)**:
   detect exactly-one policy mode, expand, apply non-skippable reinstatement,
   validate tokens/profile/ack requirements, and append plan breadcrumbs
   (`phase_policy_mode`, `resolved_phase_plan`, `skipped_phases` + reasons) to
   `docs/engineering/state.md` **before** any phase spawn. On failure, emit
   deterministic phase-plan reason codes and stop (no partial schedule).
2. Parse optional `start-from=<phase>` and validate canonical phase ID rules.
   Parse optional **`bug-target=`** argv literals (**`US-0087`**) and evaluate
   **scheduler mutex** (`AUTO_SCHEDULER_CONFLICT` when **`AUTO_BACKLOG_DRAIN=1`**
   ∧ **`AUTO_BUG_QUEUE=1`** without **`bug-target=`** argv).
   Parse optional `--execute-bulk` and treat it as explicit one-run override.
3. Resolve **nominal** start phase using deterministic precedence:
   - explicit `start-from` → **`bug-target=`** argv (when present) → merged scratchpad
     → resume brief → state fallback → fail-fast.
   - Emit `[AUTO_RESUME_ERROR] ...` message on resolver failure.
3a. **Intersect** the nominal start anchor with the resolved phase plan (plan
   order preserved; drop scheduled phases strictly before the anchor in canonical
   order). **Empty intersection** → fail fast with
   `START_FROM_PHASE_PLAN_EMPTY_INTERSECTION` and diagnostics listing
   `resolved_phase_plan` vs `requested_start_phase` / inferred resume anchor.
   Set the executable schedule to this intersection.
4. Record continuation breadcrumb metadata in `docs/engineering/state.md`:
   - `invocation_mode=auto`
   - `requested_start_from`
   - `resolved_start_phase` (first phase of the intersected schedule)
   - `resolution_source` (`argument|resume_brief|state_fallback`)
   - `resolution_status` (`resolved|fail-fast`)
   - `timestamp`
5. **(reference Step 5 — continuous multi-phase spawn)** Spawn a fresh subagent
   for each remaining phase in **the intersected resolved schedule order** (not
   the full canonical list when phases are omitted), starting at
   `resolved_start_phase`, and **advance through all subsequent phases** until a
   **deterministic stop condition** fires (see **Deterministic stop matrix
   (US-0088)** above). The orchestrator does **not** stop after a single phase
   spawn unless the stop matrix requires it; outer-driver equivalence applies
   when a single invocation cannot schedule multiple subagent turns (see
   **Outer-driver equivalence (AC-1, Option B)** above):
   default full path:
   intake -> discovery -> research -> architecture -> sprint plan ->
   plan verify -> execute -> QA -> verify work -> release -> refresh context.
   If `SECURITY_REVIEW=1`, run `/security-review` in a fresh security subagent:
   - in `design` mode immediately after architecture and before sprint plan,
   - in `code` mode immediately after execute and before QA.
   If `SECURITY_REVIEW=0` (default), skip both checks with zero overhead.
   - If `AUTO_BACKLOG_DRAIN=1`, repeat story lifecycle for next eligible OPEN
     story using deterministic selection policy until bounded stop criteria.
     **Reload merged scratchpad phase-selection inputs and recompute the phase
     plan at each story boundary** (same policy class as single-segment runs).
   - If bug-queue mode is active (**`bug-target=`** argv or **`AUTO_BUG_QUEUE=1`**
     with resolved target), iterate **OPEN** bugs per **Optional bug-queue mode
     (US-0087)** — ascending numeric **`BUG-####`** order, **`AUTO_BUG_MAX_ITEMS`**
     cap, **`AUTO_BUG_ON_BLOCK`** stop/skip — running the same **resolved phase plan**
     per bug segment with fresh spawns only. **Reload scratchpad and revalidate
     mutex at each bug boundary.** Empty **OPEN** queue → **`AUTO_BUG_QUEUE_EMPTY`**.
   - If bulk execute mode is active (`--execute-bulk` or
     `AUTO_EXECUTE_BULK=1`), iterate eligible planned items using
     `AUTO_EXECUTE_SELECTION` with bounded item count
     (`AUTO_EXECUTE_MAX_ITEMS`) and deterministic block/skip semantics.
     **Reload merged scratchpad phase-selection inputs and recompute the phase
     plan at each item boundary** (no silent revival of omitted phases).
   - In team mode with enforcement enabled, run pre-mutation scope checks against
     `TEAM_MEMBER` and `ACTIVE_TASK_IDS`; out-of-scope tasks produce deterministic
     reason codes and no writes.
   - **US-0069 / DEC-0051**: Before each phase spawn, resolve the single-valued
     expected role (matrix + `AUTO_ROLE_RESEARCH`, `AUTO_ROLE_PLAN_VERIFY`,
     `AUTO_ROLE_REFRESH_CONTEXT`), enforce execute default deny / override
     contract, and run the preflight capability gate; on failure stop with
     `PHASE_ROLE_CAPABILITY_MISSING` (no unrelated-role spawn).
   - **US-0069 / DEC-0051**: After each phase completes, validate isolation
     `role` and strict-proof `role` against the preflight-resolved expected
     role; on conflict stop with `PHASE_ROLE_MISMATCH`.
6. Pass only the phase input files and current objective to each spawned
   subagent. Do not pass prior conversational reasoning as phase context.
7. If `AUTO_IMPLEMENTATION_LOOP=1`, alternate fresh subagents for execute and QA
   (`dev`, then `qa`, then new `dev`, then new `qa`) until no blocking findings
   or `AUTO_LOOP_MAX_CYCLES` is reached.
   - After each cycle, verify that both phases wrote new isolation evidence
     entries (distinct `fresh_context_marker` per phase per cycle).
8. If `AUTO_PAUSE_REQUEST=1`, stop at the next safe boundary
   (`AUTO_PAUSE_POLICY`) and spawn `/pause` in a fresh curator subagent.
9. Preserve existing stop conditions and gates without bypass:
   - decision gate
   - missing critical input
   - pause request at safe boundary
   - loop max cycles reached
10. On stop (or completion), write breadcrumbs:
   - `stop_reason` (`completed|decision_gate|missing_input|pause_request|loop_max`)
   - `stop_phase`
   - `timestamp`
11. If stopped before completion, update `handoffs/resume_brief.md` with the
    intended next phase and stop metadata.
11a. At each phase boundary, verify isolation evidence exists for the completed
    phase in `docs/engineering/state.md` and includes all required fields. If
    missing/invalid/stale, stop with the appropriate reason code and remediation
    guidance (run the phase again in a fresh subagent context and write new
    evidence). Append **phase boundary status** per **Configurable phase
    selection policy (US-0070 / DEC-0052)** (selected/skipped summary + next
    scheduled phase).
11b. At each phase boundary, verify strict runtime attestation tuple exists and
    is valid for the completed phase (`orchestrator_run_id`,
    `runtime_proof_id`, `phase_id`, `role`, `proof_issued_at`,
    `proof_ttl_seconds`, `proof_hash`).
    - Missing tuple: `RUNTIME_PROOF_MISSING`
    - Invalid schema/hash/linkage: `RUNTIME_PROOF_INVALID`
    - Reused `runtime_proof_id`: `RUNTIME_PROOF_REUSED`
    - Expired proof TTL / stale proof: `RUNTIME_PROOF_STALE`
    - Ambiguous proof-to-checkpoint linkage: `RUNTIME_PROOF_AMBIGUOUS_LINK`
    - Remediation: rerun affected phase in fresh subagent context, write new
      strict-proof tuple + checkpoint evidence, then continue.
12. At each phase boundary, evaluate sync policy only when mode requires it and
    record a deterministic sync verdict entry with:
    - `phase_boundary`
    - `policy_mode`
    - `trigger_source` (`manual|auto`)
    - `branch`
    - `checks` (`test|lint|typecheck`: `pass|fail|skipped`)
    - `qa_status_snapshot`
    - `push_decision` (`pushed|blocked|not_eligible`)
    - `reason_code`
    - `evidence_refs`
13. When backlog-drain mode, bug-queue mode, or bulk execute mode is enabled,
    append per-item run summary entries:
    - `item_id`
    - `item_kind` (`story|sprint|bug`)
    - `story_id`
    - `bug_id` (when `item_kind=bug`)
    - `sprint_id`
    - `story_start_phase`
    - `story_stop_phase`
    - `story_outcome` (`released|blocked|skipped`)
    - `story_reason_code`
    - `team_context_snapshot` (`TEAM_MODE`, `TEAM_MEMBER`, `ACTIVE_TASK_IDS`)
    - `timestamp`

## Backward compatibility

- Manual and interactive workflows remain unchanged by default.
- `/resume` remains valid for context loading and guided continuation.
- Deterministic precedence and fail-fast behavior apply when `/auto` continuation
  is invoked.

## Deterministic artifact ordering guard (US-0058 / DEC-0040)

- When `/auto` coordinates phases that write mutable artifacts, each phase must
  follow `docs/engineering/artifact-ordering-policy.md`.
- Ordering policies are mandatory:
  - `state.md`: append-bottom
  - `backlog.md` / `acceptance.md`: sorted-canonical
  - release/handoff surfaces: policy-specific (prepend/append) as documented.
- If a required placement anchor is missing or ambiguous, fail closed with
  `ARTIFACT_ORDERING_ANCHOR_AMBIGUOUS` and do not continue.
