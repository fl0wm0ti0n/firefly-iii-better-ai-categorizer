---
description: "its-magic plan verify: verify sprint tasks against acceptance."
---

# /plan-verify

## Subagents
- tech-lead

## Execution model
- Run `/plan-verify` in a fresh Tech Lead subagent context.
- After writing outputs, stop and hand off to `/execute` in a new subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `sprints/S0001/tasks.md`
- `docs/product/acceptance.md`
- `docs/engineering/architecture.md`

## Outputs (artifacts)
- `sprints/S0001/plan-verify.json`
- `docs/engineering/state.md`

## Stop conditions
- Tasks do not cover acceptance criteria
- Decision gate triggered

## Steps
1. Check each acceptance criterion against tasks.
2. Record gaps and required changes in `plan-verify.json`.
3. Update state and handoff if needed.
