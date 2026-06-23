---
description: "its-magic auto: deterministic continuation orchestrator."
---

# /auto

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
- **Bug-queue mode** (**`US-0087`**) uses the same **spawn-only** contract: the
  orchestrator schedules materialization and spawns phase-role subagents per
  bug segment—it **must not** run **`execute`**, **`qa`**, or other lifecycle
  phases in the orchestrator turn. Violations → **`AUTO_ORCHESTRATOR_PHASE_EXECUTION`**
  (**`BUG-0006`**, **`US-0069`**, **`DEC-0051`**).

## Spawn-boundary integrity (BUG-0006)

- **Forbidden**: treating the orchestrator turn as the executor of a lifecycle
  phase (for example running **`architecture`**, **`execute`**, **`qa`**, or any
  other **`phase_id`** in the orchestrator instead of spawning the required
  subagent).
- **Fail fast** with **`AUTO_ORCHESTRATOR_PHASE_EXECUTION`**. **Remediation**:
  stop; spawn a **fresh** subagent for the canonical **`phase_id`** and **`role`**
  per the phase→role matrix (**DEC-0051**); do not merge phase output into
  orchestrator turns. **Distinct from** **`PHASE_CONTEXT_ISOLATION_VIOLATION`**
  (wrong writer / isolation break) and **`RUNTIME_PROOF_*`** / **`PHASE_ROLE_*`**
  families—do not overload those codes for a missing-spawn violation.

## Orchestrator post-subagent continuation mandate (BUG-0012 / DEC-0081)

**Orchestrator context only** — phase-role commands still **stop** and hand off via
artifacts (**BUG-0006**). When **`/auto`** runs as orchestrator, **post-subagent continuation**
is **not** optional when the next phase, drain-advance target, or relaxable retry within
budget is schedulable.

After any foreground phase-role subagent returns, orchestrator **MUST Task-spawn** the next
phase-role subagent per **US-0069** preflight. Orchestrator **must not** treat phase-role
handoff as run terminal; **phase-role stop is not run terminal** for the orchestrator when
continuation is schedulable.

| Actor | After phase completes |
|-------|----------------------|
| Phase-role subagent (`po`, `tech-lead`, `dev`, `qa`, …) | **Stop** — hand off via artifacts only (**BUG-0006**) |
| **`/auto` orchestrator** | **Continue** — orchestrator **MUST Task-spawn** when schedulable (**DEC-0080** / **BUG-0012**) |

Orchestrator **must not** emit mandatory re-**`/auto`**, mandatory **`auto_outer_driver.py`**, or
**`segment exhausted`** terminal prose when continuation is schedulable.

**Required contract literals** (regression anchors): **`orchestrator MUST Task-spawn`**,
**`post-subagent continuation`**, **`phase-role stop is not run terminal`**,
**`native chain supersedes Option B`**.

## Continuous multi-phase execution (US-0088)

A single `/auto` orchestrated run advances through **all phases** in the
**intersected resolved schedule** (reference **Step 5**) until a
**deterministic stop condition** fires. The orchestrator does **not** stop after
spawning one phase unless the stop matrix requires it.

**native chain supersedes Option B** under **`AUTO_FLOW_MODE=full_autonomy`** + IDE + Task
available — native in-chat chain is **primary**; **Outer-driver equivalence (AC-1, Option B)**
applies **only** when **`NATIVE_CHAIN_UNAVAILABLE`** or headless/CI/`--invoke-cmd` context.
When a single Cursor `/auto` invocation cannot schedule multiple fresh subagent turns
(product/runtime constraint), a **documented outer driver** (operator script or manual
re-invocation with `start-from` / refreshed `resume_brief`) is **deterministically equivalent**
(**fallback only**) provided: same intersected phase order, same isolation + strict-proof
attestation per phase (**DEC-0038**), same stop reasons, and same `resume_brief` + `state.md`
refresh at every boundary. Operators must follow the runbook recipe
(**`docs/engineering/runbook.md`** § Continuous `/auto` + backlog drain).

**Deterministic stop matrix** (see also architecture `# US-0088`):

| Condition | Behavior |
|-----------|----------|
| Next phase exists, no hard stop | **Continue** — preflight US-0069, spawn next phase |
| `decision_gate` | **Stop** (non-suppressible) |
| `error` / missing critical input | **Stop** (non-suppressible) |
| `AUTO_PAUSE_REQUEST` / `pause` | **Stop** at safe boundary (non-suppressible) |
| `AUTO_LOOP_MAX_CYCLES` / `loop_max` | **Stop** (non-suppressible) |
| `blocked` (sync/scope gate) | **Stop** (non-suppressible) |
| US lifecycle DONE / sprint segment complete | **IDE `full_autonomy`**: orchestrator **must** drain-advance in-chat (no operator re-`/auto`). **Other modes / fallback**: stop segment; `AUTO_BACKLOG_DRAIN=1` may advance (recompute phase plan — **reference Step 5**) |
| `BACKLOG_MAX_STORIES_REACHED` | **Stop** (non-suppressible) |

`stop_reason` vocabulary: `completed`, `decision_gate`, `missing_input`,
`pause_request`, `loop_max`, `error`, `blocked`.

## Native in-chat auto-chain (US-0095 / DEC-0080)

When **`AUTO_FLOW_MODE=full_autonomy`** runs in **Cursor IDE**, the orchestrator
**self-chains in-chat** across intersected lifecycle phases and backlog-drain
segment boundaries via a **foreground sequential** Task/subagent loop in the
**same /auto orchestrator session** — without mandatory outer driver or manual
re-invocation between segments.

### Activation gate

| # | Condition |
|---|-----------|
| 1 | Merged scratchpad **`AUTO_FLOW_MODE=full_autonomy`** (exact literal) |
| 2 | Invocation context = **Cursor IDE** (default Agent panel `/auto` without `--invoke-cmd`) |
| 3 | Task tool available for foreground subagent spawn |

Set **`native_chain_active=true`** in `state.md` phase boundary when all hold.
Set **`native_chain_continuing=true`** when orchestrator scheduled next spawn/advance **this**
boundary. Set **`drain_advance_action=spawned|skipped|not_applicable`** on drain-advance
boundaries (**`skipped`** when budget > 0 + OPEN item exists is **invalid**). When
**`native_chain_continuing=true`**, **`stop_reason`** must **not** be
**`completed (segment exhausted)`** and operator prose must **not** mandate re-**`/auto`**.

### Continuation loop (reference Step 5 — IDE primary)

1. Resolve next `phase_id` from intersected schedule or drain-advance target.
2. **US-0069** preflight (role matrix + capability gate).
3. **Spawn fresh subagent** (Task tool, foreground — blocks until done).
4. Verify isolation evidence + **DEC-0038** strict-proof tuple in `state.md`.
5. Increment **`outer_cycle_index`**; check **`AUTO_LOOP_MAX_CYCLES`**.
6. Branch stop matrix → continue spawn, drain-advance, block-retry, or hard stop.

**Loop invariants** (spawn-only — **BUG-0006** unchanged):

1. Orchestrator **must not** stop after one phase or one story segment solely due to Cursor turn boundaries when continuation is schedulable.
2. Each phase completes only via **fresh subagent spawn** + artifacts — orchestrator **must not** execute phase-role work in-band (**`AUTO_ORCHESTRATOR_PHASE_EXECUTION`** forbidden).
3. **`stop_reason=completed (segment exhausted)`** is **invalid** when next phase, drain target, or relaxable retry is schedulable.

Preflight/post checks per **US-0069** / **DEC-0051** at every boundary.

### Fail-closed: `NATIVE_CHAIN_UNAVAILABLE`

Emit when Task tool denied, spawn depth limit hit, or IDE context cannot schedule foreground subagent. Hard stop for native path. Optional fallback hint only: `python scripts/auto_outer_driver.py --repo .` (**optional** / **fallback** for headless/CI). **Non-suppressible** under **`AUTO_QUIET=1`**.

### IDE drain-advance-without-pause

Deterministic **7-step** algorithm when **`full_autonomy`** + drain policy active (**`AUTO_BACKLOG_DRAIN=1`** or bug-queue per **US-0087** mutex).

**Trigger** (all required): `stop_phase=refresh-context`; `stop_reason=completed`; drain enabled; budget remaining.

| Step | Action |
|------|--------|
| **1** | **READ** latest phase-boundary block in `docs/engineering/state.md` |
| **2** | **ASSERT** **DEC-0069** pairing — completed phase refreshed **`resume_brief`** + **`state.md`**; stale → **`RESUME_BRIEF_STALE`** (fail-closed, no advance) |
| **3** | **SELECT** next work item (story or bug per drain mutex) |
| **4** | **RELOAD** scratchpad; **MATERIALIZE** `resolved_phase_plan` (**US-0070**) |
| **5** | **PREPEND** `handoffs/resume_brief.md` with segment pointers |
| **6** | **APPEND** `state.md` materialization breadcrumb for new segment |
| **7** | **IMMEDIATELY** spawn first phase subagent — **without operator re-`/auto`**, **no** mandatory outer-driver instruction |

**Between steps 6 and 7** (no operator stop): orchestrator **must not** emit operator wait
instructions, set **`stop_reason=completed (segment exhausted)`** when drain budget > 0 and
eligible OPEN item exists, or skip Task-spawn for step **7**. Attest
**`drain_advance_action=spawned|skipped|not_applicable`** on `state.md` phase boundary;
**`skipped`** when budget > 0 + OPEN item exists is **invalid** (regression).

**DEC-0069 pairing mandate**: every phase boundary and drain advance **must** refresh **`resume_brief`** + **`state.md`** before scheduling in-chat continuation. Stale brief → **`RESUME_BRIEF_STALE`** fail-closed (no advance). Orchestrator **MUST Task-spawn** next phase — **`/auto`** is orchestrator context label, not operator re-invocation instruction.

### Native-chain stop matrix (US-0095)

Native chain **does not weaken** **DEC-0078** hard gates. Hard stops (no relaxation): **`decision_gate`**, isolation/strict-proof violations, security deny, **`BACKLOG_MAX_STORIES_REACHED`**, **`AUTO_LOOP_MAX_CYCLES`**, unrecoverable **`error`**, **`pause_request`**. Relaxable transient stops per **DEC-0078** when configured.

### `AUTO_QUIET` under native chain (US-0095)

| Event | `AUTO_QUIET=0` | `AUTO_QUIET=1` |
|-------|----------------|----------------|
| Routine phase PASS | May notify | **Suppress** |
| In-chat phase continuation | Compact breadcrumb OK | **Suppress** |
| Drain advance | Segment notify OK | **Suppress** routine prose; **no** outer-driver wait |
| Gates, caps, errors, **`NATIVE_CHAIN_UNAVAILABLE`** | **Always** | **Always** |

**Forbidden** in IDE-primary `full_autonomy` prose: mandatory `run the outer driver`; `re-run /auto` between drain segments; `segment exhausted` as terminal when continuation pending; unqualified `python scripts/auto_outer_driver.py`.

Full detail: **`docs/engineering/auto-orchestration-reference.md`**.

## Full-autonomy mode + outer driver (US-0092 / DEC-0078)

**`AUTO_FLOW_MODE=full_autonomy`** (exact literal, default-off) enables hands-off
orchestration. **IDE primary path** (US-0095): run **`/auto` once in Cursor** —
native in-chat auto-chain above. **Optional fallback**: stdlib outer driver
**`scripts/auto_outer_driver.py`** for headless/CI or when **`NATIVE_CHAIN_UNAVAILABLE`**.

The driver **loops hook invocations** — spawn-only preserved (**BUG-0006**); it
never performs phase-role work. Headless/CI recipe: set scratchpad keys → run
`python scripts/auto_outer_driver.py --repo .` once (**fallback** for headless/CI) → interpret exit table in
**`docs/engineering/runbook.md`** § **Full-autonomy outer driver (US-0092)** (**fallback**).

**Drain-advance-without-pause**: with **`full_autonomy`** + **`AUTO_BACKLOG_DRAIN=1`**
(or bug-queue policy), segment completion schedules the next OPEN story/bug
**immediately** **without operator re-`/auto`**; **`resume_brief`** +
**`state.md`** refresh per **DEC-0069** at every boundary.

### Full-autonomy stop matrix (US-0092)

**Invariant**: **`full_autonomy`** relaxes recoverable transient stops and operator
re-invocation, not governance gates. **`RELEASE_PUBLISH_MODE=auto`** remains
explicit opt-in for publish (unchanged default-off).

| Condition | US-0088 (all modes) | `full_autonomy` delta |
|-----------|---------------------|------------------------|
| Next phase, no hard stop | Continue inner `/auto` | Native chain continues in-chat; outer driver **re-invokes** only on **`NATIVE_CHAIN_UNAVAILABLE`** / headless **fallback** |
| `decision_gate` | Hard stop | **No change — hard** |
| Unrecoverable `error` | Hard stop | **No change — hard** |
| Critical `missing_input` | Hard stop | **No change — hard** |
| Transient `missing_input` (recoverable) | Hard stop | **Relaxable** — bounded block-retry (`AUTO_BLOCK_RETRY_MAX`) |
| `pause_request` / `AUTO_PAUSE_REQUEST` | Hard stop | **No change — hard** |
| `loop_max` / `AUTO_LOOP_MAX_CYCLES` | Hard stop | **No change — hard** |
| `blocked` — transient/sync | Hard stop | **Relaxable** when ledger classifies recoverable |
| `blocked` — isolation / strict-proof / ownership | Hard stop | **No change — hard** |
| UAT/QA fail | Hard stop (operator) | **Relaxable** when `AUTO_IMPLEMENTATION_LOOP=1` |
| Segment complete + `AUTO_BACKLOG_DRAIN=1` | Advance (may need manual re-`/auto` in non-native modes) | **Drain-without-pause** — immediate in-chat continuation; **no** operator re-`/auto` |
| `BACKLOG_MAX_STORIES_REACHED` | Hard stop | **No change — hard** |
| `AUTO_SCHEDULER_CONFLICT` | Hard stop | **No change — hard** |
| Security deny (`.env`, intake evidence mutation) | Hard deny | **No change — hard** |

Block-retry ledger: append-only **`handoffs/auto_block_retry/<orchestrator_run_id>.jsonl`**
(names-only; cap exhaustion → exit **6** `BLOCK_RETRY_CAP_EXHAUSTED`). See architecture
**`# US-0092`** and **`docs/engineering/auto-orchestration-reference.md`**.

## Full specification (US-0080 / DEC-0062)

Long prose, expanded mode semantics, and **Steps 1–13** detail live in
**`docs/engineering/auto-orchestration-reference.md`** (jointly normative). This file
keeps **contract excerpts** required for regression parity and default `/auto` loads.

## Per-phase isolation enforcement (US-0048 / DEC-0029)

- Orchestrator must not write phase deliverables (`PHASE_CONTEXT_ISOLATION_VIOLATION`).
- Each spawned phase appends isolation evidence to `docs/engineering/state.md`
  with `phase_id`, `role`, `fresh_context_marker`, `timestamp`, `evidence_ref`.
- Fail closed on missing/invalid/stale evidence.

Reason codes: `PHASE_CONTEXT_ISOLATION_MISSING`, `PHASE_CONTEXT_ISOLATION_VIOLATION`,
`ISOLATION_EVIDENCE_STALE`, `ISOLATION_EVIDENCE_INVALID`.

## Strict runtime proof enforcement (US-0056 / DEC-0038)

- Each completed phase supplies tuple: `orchestrator_run_id`, `runtime_proof_id`,
  `phase_id`, `role`, `proof_issued_at`, `proof_ttl_seconds`, `proof_hash`
  (hash = SHA-256 sorted-key JSON per **DEC-0038**).
- `runtime_proof_id` unique per phase run; enforce TTL freshness and linkage.

Reason codes: `RUNTIME_PROOF_MISSING`, `RUNTIME_PROOF_INVALID`, `RUNTIME_PROOF_REUSED`,
`RUNTIME_PROOF_STALE`, `RUNTIME_PROOF_AMBIGUOUS_LINK`.

## Strict phase role enforcement (US-0069 / DEC-0051)

Post-hoc markers alone are insufficient: preflight expected role, capability gate,
post-completion match of isolation + strict-proof `role`, execute default deny unless
override governance is satisfied.

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

Alternate-role keys (merged scratchpad): `AUTO_ROLE_RESEARCH`, `AUTO_ROLE_PLAN_VERIFY`,
`AUTO_ROLE_REFRESH_CONTEXT` — single-valued resolution per **DEC-0051** (see reference).

Execute override: requires `AUTO_EXECUTE_ROLE_OVERRIDE=allowed_non_dev_execute` **and**
parseable `EXECUTE_OVERRIDE_GOVERNANCE_REF`.

Role reason codes: `PHASE_ROLE_CAPABILITY_MISSING`, `PHASE_ROLE_MISMATCH`.

## Mode-scoped delivery resolver — step 0 (US-0096 / DEC-0082)

**Before** **Configurable phase selection policy (US-0070 / DEC-0052)**, **resolve_delivery_mode**
from precedence: argv `delivery-mode=` → backlog row `delivery_mode` (when
`AUTO_DELIVERY_ROUTING=backlog_then_scratchpad`) → scratchpad `DELIVERY_MODE` → **`standard`**.

| `delivery_mode` | `resolved_phase_plan` | `reinstatement_mode` | `memory_layer` |
|-----------------|----------------------|---------------------|----------------|
| `standard` | Full **DEC-0052** chain | `dec0052_default` | `standard` |
| `ultra_lean` | `[spec, plan, build+verify, ship]` | `none` | `pack` |
| `mega_quick` | `[quick]` when eligible (+1 on test failure) | `none` | `quick` |

**reinstatement applies only when delivery_mode=standard**. **`AUTO_PHASE_*`** applies **only**
when `delivery_mode=standard`; non-standard + non-default **`AUTO_PHASE_*`** →
**`PHASE_POLICY_CONFLICT`** (fail closed).

**`DELIVERY_MODE_SWITCH_MID_STORY`**: fail closed — complete segment in one mode.

Persist breadcrumbs at each phase boundary in `state.md` + top `resume_brief` pointer:
**`delivery_mode`**, **`resolved_phase_plan`**, **`reinstatement_mode`**, **`memory_layer`**.

### `ultra_lean` macro-phases (US-0096 / DEC-0082)

Four macro-phases — **no** eleven-phase reinstatement when `delivery_mode=ultra_lean`:

| Macro | Merged canonical phases | Default role |
|-------|------------------------|--------------|
| **`spec`** | intake + discovery | **po** |
| **`plan`** | research + architecture + sprint-plan | **tech-lead** |
| **`build+verify`** | execute + qa + verify-work | **dev** / **qa** |
| **`ship`** | release + refresh-context | **release** / **curator** |

**`AUTO_IMPLEMENTATION_LOOP`** preserved inside **`build+verify`**. QA merges AC checklist + UAT
in one spawn.

### `mega_quick` routing (US-0096 / DEC-0082)

When `DELIVERY_MODE=mega_quick` and eligible, materialize **`["quick"]`** only. Ineligible →
**`DELIVERY_MODE_INELIGIBLE`** + specific **`MEGA_QUICK_*`** code:

| Code | Rule |
|------|------|
| **`MEGA_QUICK_BUG_SEGMENT`** | Story-only (no bug segment) |
| **`MEGA_QUICK_AC_TOO_BROAD`** | AC ≤ 3 |
| **`MEGA_QUICK_ARCHITECTURE_REQUIRED`** | No companion DEC required |
| **`MEGA_QUICK_SPRINT_EXISTS`** | No active `sprints/Sxxxx/` for story |
| **`MEGA_QUICK_STORY_OVERRIDE`** | Row `delivery_mode` consistent when routing enabled |
| **`MEGA_QUICK_MULTI_COMPONENT`** | Single component or `COMPONENT_SCOPE_MODE=0` |
| **`MEGA_QUICK_GATE_ESCALATION`** | No elevated gates beyond default `/quick` |

Artifacts: **`sprints/quick/Qxxxx/task.json`** + **`summary.md`**. Second spawn on test
failure only. Closure requires **`acceptance_met: true`** + green tests.

## Configurable phase selection policy (US-0070 / DEC-0052)

Treat **resolved phase plan** as fail-closed schedule from merged scratchpad **before**
resume / `start-from` intersection. Canonical lifecycle:

`intake` → `discovery` → `research` → `architecture` → `sprint-plan` →
`plan-verify` → `execute` → `qa` → `verify-work` → `release` → `refresh-context`

Selectors and reinstatement: see reference. Phase-plan reason codes include
`PHASE_POLICY_CONFLICT`, `PHASE_PLAN_UNKNOWN_PHASE`, `START_FROM_PHASE_PLAN_EMPTY_INTERSECTION`.

Phase boundary visibility (**AC-10**): record `resolved_phase_plan` snapshot,
`skipped_phases`, `phase_boundary`, `next_scheduled_phase` on `state.md`. For
bug-queue segments, also record **`segment_work_item_kind`**, **`active_bug_id`**,
**`bug_queue_position`**, **`bug_queue_remaining`**, **`backlog_drain_active`**,
**`bug_queue_active`** per **`docs/engineering/architecture.md`** **`# US-0087`**
and **`docs/engineering/auto-orchestration-reference.md`**.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at `docs/engineering/phase-context.md`
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.

Merged scratchpad (**US-0073** / **DEC-0055**), automation flags (`AUTO_*`, `SECURITY_REVIEW`,
`TEAM_*`), phase-plan keys `AUTO_PHASE_PLAN`, `AUTO_PHASE_EXCLUDE`, `AUTO_PHASE_INCLUDE`,
`AUTO_PHASE_PROFILE`, `AUTO_PHASE_HIGH_RISK_ACK`, product/engineering docs,
optional `start-from=<phase>`, optional **`bug-target=BUG-####`** or
**`bug-target=all-open`**, optional `--execute-bulk`, `handoffs/resume_brief.md`,
`docs/engineering/state.md`.

## Automation remote routing contract (US-0086)

- Automation-only gate: `AUTO_REMOTE_AUTOMATION_PROFILE=deterministic_v1` enables
  target routing; `off` keeps manual/local behavior unchanged.
- Explicit intent literal is constrained to: `start container <target_id>`.
- Deterministic precedence when profile is enabled:
  1. explicit intent target id resolution,
  2. canonical target validation (`targets[].id` exists and is enabled),
  3. documented heuristic fallback,
  4. local default when no remote target is selected.
- Fail-closed reason codes (do not overload):
  `REMOTE_AUTOMATION_MODE_OFF`, `REMOTE_TARGET_UNKNOWN`,
  `REMOTE_TARGET_DISABLED`, `REMOTE_TARGET_UNROUTABLE`.
- Mode-off guardrail: never silently reroute `TEST_COMMAND` to remote when
  automation profile is disabled.

## Canonical status contract (US-0045)

Story status authority: `docs/product/backlog.md` only; do not infer readiness from
contradictory derived views.

## Outputs (artifacts)

Phase artifacts, `docs/engineering/state.md`, `handoffs/resume_brief.md` when stopped,
QA loop handoffs when applicable, continuation breadcrumbs including `resolution_source`
(`argument|resume_brief|state_fallback`) and related resume metadata per reference.

## Stop conditions

Deterministic stop reasons (see **Stop matrix** in `## Continuous multi-phase
execution (US-0088)` above): `completed`, `decision_gate`, `missing_input`,
`pause_request`, `loop_max`, `error`, `blocked`.

## Optional backlog-drain mode (US-0044 / DEC-0022)

Canonical controls: `AUTO_BACKLOG_DRAIN`, `AUTO_BACKLOG_MAX_STORIES`, `AUTO_BACKLOG_ON_BLOCK`,
`AUTO_STORY_SELECTION`. When `AUTO_BACKLOG_DRAIN=1`, each story advances through
**multiple phases** until its terminal boundary (**reference Step 5**); the
orchestrator **recomputes** the materialized phase plan at each **story boundary**
and selects the **next eligible OPEN story** per `AUTO_STORY_SELECTION`.
Reason codes include `BACKLOG_MAX_STORIES_REACHED`. Full semantics: reference.

## Optional bug-queue mode (US-0087)

Canonical **argv** literals (exact strings; **no aliases** in v1):
- **`bug-target=BUG-####`** (example: **`bug-target=BUG-0007`**) — single defect from
  **`docs/product/backlog.md`** **`## Bug issues (canonical)`** with status **OPEN**.
- **`bug-target=all-open`** — deterministic **OPEN**-only queue, ascending **numeric**
  **`BUG-####`** sort, optional cap **`AUTO_BUG_MAX_ITEMS`** (see reference).

Scratchpad keys (**default-off**): **`AUTO_BUG_QUEUE`**, **`AUTO_BUG_TARGET`**,
**`AUTO_BUG_MAX_ITEMS`**, **`AUTO_BUG_ON_BLOCK`** — full semantics: reference +
**`architecture.md`** **`# US-0087`**.

**Scheduler mutex**: if merged scratchpad has **`AUTO_BACKLOG_DRAIN=1`** **and**
**`AUTO_BUG_QUEUE=1`** **and** this invocation has **no** explicit **`bug-target=`**
argv token → fail closed with **`AUTO_SCHEDULER_CONFLICT`** (use
**`[AUTO_RESUME_ERROR] AUTO_SCHEDULER_CONFLICT: ...`** form per reference). When
**`bug-target=`** argv is present, it **selects** the bug scheduler for this run;
**`AUTO_BACKLOG_DRAIN`** must **not** also drive story selection for that same
materialized run.

Fail-closed codes (orthogonal to existing resume/phase codes; do **not** overload):
- **`AUTO_BUG_QUEUE_EMPTY`** — **`all-open`** (or equivalent) and zero **OPEN** bugs.
- **`AUTO_BUG_TARGET_UNKNOWN`** — malformed id, wrong pattern, or id missing from canonical bug section.
- **`AUTO_BUG_TARGET_NOT_OPEN`** — known id exists but status is not **OPEN** (e.g. **DONE**).

## Optional bulk execute mode (US-0047 / DEC-0024)

Explicit `--execute-bulk` or `AUTO_EXECUTE_BULK=1`. Reason codes include
`EXEC_BULK_MAX_ITEMS_REACHED`, `EXEC_TEAM_SCOPE_BLOCKED`, `EXEC_TEAM_SCOPE_SKIPPED`. Full
semantics: reference.

## Sync policy contract (US-0038 / DEC-0018)

Phase-completion boundary evaluation only. **Guarded auto-push eligibility chain**
(checklist in reference). Reason codes include `BRANCH_NOT_ALLOWLISTED`, `TEST_COMMAND_MISSING`,
`SYNC_PUSHED`. Full list: reference.

## Canonical `start-from` phase IDs

`intake`, `discovery`, `research`, `architecture`, `sprint-plan`, `plan-verify`,
`execute`, `qa`, `verify-work`, `release`, `refresh-context` — aliases invalid.

## Deterministic resume-source precedence

Resolve nominal start phase and scheduler inputs in strict order (**`US-0087`**
extends scratchpad vs **`resume_brief`** ordering — full matrix: reference):

1. Explicit `/auto start-from=<phase>`
2. Explicit **`bug-target=`** argv token when present (parsed **before** merged
   scratchpad scheduler keys; selects bug scheduler for this run).
3. Merged scratchpad (**`US-0073`** / **`DEC-0055`**) — including **`AUTO_BACKLOG_DRAIN`**,
   **`AUTO_BUG_QUEUE`**, **`AUTO_BUG_TARGET`**, etc.
4. `handoffs/resume_brief.md`
5. Conservative `docs/engineering/state.md` fallback
6. Fail fast on ambiguity/conflict/unrecoverable inputs (including
   **`AUTO_SCHEDULER_CONFLICT`** when both schedulers are enabled in scratchpad
   without **`bug-target=`** argv resolution).

If `resume_brief.md` is present but stale or unparseable, fail fast instead
of silently falling back.

## Fail-fast error code contract

All resume-resolution failures must use:

[AUTO_RESUME_ERROR] <code>: <summary>. Source=<source>. Fix: <action>.

Required codes:
- `INVALID_START_FROM`
- `RESUME_BRIEF_MISSING`
- `RESUME_BRIEF_STALE`
- `RESUME_BRIEF_UNPARSEABLE`
- `RESUME_STATE_CONFLICT`
- `STATE_PHASE_AMBIGUOUS`
- `STATE_PHASE_UNRECOVERABLE`

Bug-queue extensions (**`US-0087`**; same **`[AUTO_RESUME_ERROR]`** envelope when
used for resume/materialization failures):

- `AUTO_SCHEDULER_CONFLICT`
- `AUTO_BUG_QUEUE_EMPTY`
- `AUTO_BUG_TARGET_UNKNOWN`
- `AUTO_BUG_TARGET_NOT_OPEN`

## Steps (compact; full detail in reference)

1. Read automation flags from merged scratchpad and **materialize the resolved
   phase plan** per **Configurable phase selection policy (US-0070 / DEC-0052)**; append
   plan breadcrumbs to `docs/engineering/state.md` **before** first spawn.
2. Parse `start-from` / **`bug-target=`** / `--execute-bulk`; resolve scheduler
   mutex (**`AUTO_SCHEDULER_CONFLICT`** when applicable); resolve nominal start phase;
   intersect with plan.
3. Record continuation metadata (`invocation_mode=auto`, `requested_start_from`,
   `resolved_start_phase`, `resolution_source`, `resolution_status`, `timestamp`).
4. Spawn fresh subagents per intersected schedule; enforce **US-0069** preflight/post checks.
5. **Multi-phase continuation** (normative detail: **reference Step 5** in
   **`docs/engineering/auto-orchestration-reference.md`** `## Steps` item 5):
   advance through **all remaining phases** in the intersected resolved schedule
   order until a **deterministic stop condition** fires (see **Stop matrix** in
   `## Continuous multi-phase execution (US-0088)` above). When
   `AUTO_BACKLOG_DRAIN=1`, repeat the story lifecycle for the next eligible OPEN
   story, **reloading** scratchpad and **recomputing** the materialized phase
   plan at each story boundary.
   Outer-driver equivalence applies when **`NATIVE_CHAIN_UNAVAILABLE`**, headless/CI, or
   `--invoke-cmd` prevents in-chat scheduling (**AC-1 Option B** — **fallback only**;
   **native chain supersedes Option B** in IDE **`full_autonomy`**).
   `stop_reason`: `completed|decision_gate|missing_input|pause_request|loop_max|error|blocked`.
6. Isolation evidence verification at each boundary (**reference** step 11a).
7. At each phase boundary, verify strict runtime attestation tuple exists
   and is valid for the completed phase (`orchestrator_run_id`, `runtime_proof_id`,
   `phase_id`, `role`, `proof_issued_at`, `proof_ttl_seconds`, `proof_hash`)
   (**reference** step 11b).
8. Sync verdict recording when eligible — reference step 12.
9. Backlog-drain / bulk per-item summaries when enabled — reference step 13.

## Backward compatibility

Default manual/interactive unchanged; `/resume` remains valid; deterministic precedence
applies for `/auto` continuation.

## Deterministic artifact ordering guard (US-0058 / DEC-0040)

Follow `docs/engineering/artifact-ordering-policy.md` (`state.md` append-bottom, etc.);
`ARTIFACT_ORDERING_ANCHOR_AMBIGUOUS` fail-closed.
