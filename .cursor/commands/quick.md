---
description: "its-magic quick: execute a small task without full planning."
---

# /quick

## Subagents
- dev

## Execution model
- Run `/quick` in a fresh Dev subagent context.
- After writing outputs, stop. Any follow-up starts in a new subagent/chat.

## Inputs
- Task description
- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at `docs/engineering/phase-context.md`
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.

## `/auto` routing (US-0096 / DEC-0082)

When **`DELIVERY_MODE=mega_quick`** and eligibility passes, **`/auto`** materializes this
command only (`resolved_phase_plan = ["quick"]`). See **`.cursor/commands/auto.md`** §
**`mega_quick` routing** for seven **`MEGA_QUICK_*`** fail-closed codes and
**`DELIVERY_MODE_INELIGIBLE`** handling.

Artifacts under **`sprints/quick/Qxxxx/`**: **`task.json`** + **`summary.md`**. Second spawn
only on test failure. Closure requires **`acceptance_met: true`** + green tests.

## Outputs (artifacts)
- `sprints/quick/Q0001/task.json`
- `sprints/quick/Q0001/summary.md`
- `docs/engineering/state.md`

## Stop conditions
- Decision gate triggered

## Steps
1. Define the task in `task.json`.
2. Implement the change quickly.
3. Write a short summary and update state.
