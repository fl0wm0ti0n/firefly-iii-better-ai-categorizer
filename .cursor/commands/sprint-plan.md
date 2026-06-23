---
description: "its-magic sprint plan: create sprint and atomic tasks."
---

# /sprint-plan

## Subagents
- tech-lead

## Execution model
- Run `/sprint-plan` in a fresh Tech Lead subagent context.
- After writing outputs, stop and hand off to `/plan-verify` in a new
  subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- Architecture and decisions
- Current backlog priorities
- `.cursor/scratchpad.md` — read SPRINT_MAX_TASKS and SPRINT_AUTO_SPLIT
- Optional explicit argument: `--bulk` (US-0046)

## Optional bulk mode (US-0046 / DEC-0023)

`/sprint-plan` supports an explicit bulk planning mode. Default behavior remains
single-scope unless bulk mode is explicitly requested.

Bulk trigger:
- `--bulk` argument enables deterministic multi-story planning.

Bulk policy controls from `.cursor/scratchpad.md`:
- `SPRINT_BULK_MAX_STORIES`: integer `>=1` (max candidate stories per run)
- `SPRINT_BULK_MAX_SPRINTS`: integer `>=1` (max generated sprints per run)
- `SPRINT_BULK_SELECTION`: `priority_then_backlog_order` (default)

Bulk behavior when enabled:
- Select eligible OPEN stories deterministically via `SPRINT_BULK_SELECTION`.
- Generate one or more sprints until a bound is reached or no eligible stories remain.
- Preserve sizing controls for each generated sprint (`SPRINT_MAX_TASKS`,
  `SPRINT_AUTO_SPLIT`).
- Emit deterministic stop reason when bounded:
  - `SPRINT_BULK_MAX_STORIES_REACHED`
  - `SPRINT_BULK_MAX_SPRINTS_REACHED`
  - `SPRINT_BULK_NO_ELIGIBLE_STORIES`
  - `SPRINT_BULK_MISSING_ACCEPTANCE`

Default-safe behavior:
- Without `--bulk`, keep existing non-bulk planning semantics.

## Planning source clarification (US-0045)

- Planning source of truth for story status is `docs/product/backlog.md`.
- For multiple OPEN stories, non-bulk `/sprint-plan` selects one bounded scope
  by current policy and sizing limits (`SPRINT_MAX_TASKS`, `SPRINT_AUTO_SPLIT`).
- Use `/sprint-plan --bulk` for explicit multi-story planning within bounded
  controls; do not infer additional eligibility from non-canonical status views.

## Outputs (artifacts)
- `sprints/Sxxxx/sprint.md`
- `sprints/Sxxxx/tasks.md`
- `sprints/Sxxxx/progress.md`
- `handoffs/tl_to_dev.md`
- `sprints/Sxxxx/plan-verify.json` (after /plan-verify)

## Stop conditions
- Missing acceptance criteria
- Decision gate triggered
- Task count exceeds SPRINT_MAX_TASKS and SPRINT_AUTO_SPLIT=1 — propose splitting before proceeding
- Bulk limits reached when `--bulk` is enabled (`SPRINT_BULK_MAX_*`)

## Steps
1. Evaluate scope:
   - Non-bulk mode: count expected tasks for current planning scope.
   - Bulk mode (`--bulk`): select candidate stories deterministically
     (`SPRINT_BULK_SELECTION`) up to `SPRINT_BULK_MAX_STORIES`.
   Read `SPRINT_MAX_TASKS` from scratchpad (default: 12). If tasks exceed threshold
   and `SPRINT_AUTO_SPLIT=1`, propose deterministic splitting into multiple sprints
   or milestones. If the work is too small for a sprint, suggest `/quick` instead.
2. Milestone activation check (DEC-0009): if this sprint belongs to a milestone, check whether this is the first sprint under that milestone. If so, transition the milestone from **created** to **active** state. Before activation, verify that `milestone.json` has real (non-placeholder) values for `name`, `goal`, and `scope`. If any are still draft/empty, populate them before proceeding. Update `phases.json` to reflect actual planned phases.
3. For each sprint generated in this run (one in non-bulk mode, one or more in
   bulk mode):
   - Create sprint scope and goals.
   - Break work into atomic tasks.
   - Optional component-scoped planning (US-0035):
     - If `COMPONENT_SCOPE_MODE=0`, add zero required scope metadata.
     - If `COMPONENT_SCOPE_MODE=1`, every task must declare:
       - `target_component_ids`
       - `expected_impacted_interfaces`
   - Update traceability index in `docs/engineering/state.md`: add/update one row
     per story assigned to this sprint using DEC-0010
     (`Story | Sprint | Tasks | Status | Evidence`). Set Status=`PLANNED`, leave
     Evidence empty.
   - Create UAT placeholder files per DEC-0009 lifecycle (placeholder state). For
     `uat.json`: set sprint ID and empty steps array. For `uat.md`: list target
     stories and acceptance criteria (no results yet).
   - Optional user-guide (US-0032): If `USER_GUIDE_MODE=0`, add no required
     user-guide tasks or blocking checks. If `USER_GUIDE_MODE=1`, include tasks
     for creating/updating `docs/user-guides/US-xxxx.md` per in-scope feature story.
4. Write TL -> Dev handoff for generated sprint set.
5. Run `/plan-verify` to check coverage for generated sprint plan(s).

