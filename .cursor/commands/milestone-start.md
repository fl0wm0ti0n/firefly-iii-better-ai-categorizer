---
description: "its-magic milestone start: create milestone tracking files."
---

# /milestone-start

## Subagents
- tech-lead
- curator

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- Milestone name, goals, scope

## Outputs (artifacts)
- `milestones/M0001/milestone.json`
- `milestones/M0001/phases.json`
- `milestones/M0001/progress.md`
- `milestones/M0001/summary.md`

## Stop conditions
- Decision gate triggered

## Milestone lifecycle states (DEC-0009)

Milestones follow a five-state lifecycle: **created → active → in-review →
completed | cancelled**. `/milestone-start` produces artifacts in the **created**
state.

| State | Entry | milestone.json | phases.json | progress.md | summary.md |
|-------|-------|---------------|-------------|-------------|------------|
| **created** | `/milestone-start` | id, status. Name/goal may be draft. | At least intake phase listed. | Initialized (header only). | Not required. |
| **active** | First sprint starts | name, goal, scope all populated (not draft/placeholder). | Phases reflect actual planned work. | Updated per sprint. | Not required. |
| **in-review** | All sprints done | No change. | All phases done/complete. | All sprints shown complete. | Not required. |
| **completed** | `/milestone-complete` | status = completed. | Final state. | Final state. | Finalized with outcomes and lessons. |
| **cancelled** | Milestone abandoned | status = cancelled. | — | — | Records cancellation reason. |

### Required fields at creation (placeholder state)
- `milestone.json`: `id` (auto-assigned), `status` = "created". `name` and
  `goal` may be draft/placeholder but must exist. `scope` may be empty.
- `phases.json`: at least the intake phase must be listed.
- `progress.md`: initialized with header. Content is placeholder — will be
  populated as sprints complete.
- `summary.md`: not created at this stage.

### Distinction: placeholder vs real content
At creation, draft values are acceptable for `name` and `goal`. Before the
milestone transitions to **active** (triggered by first sprint planning),
these fields must contain real, non-placeholder content. See `/sprint-plan`
for the activation check.

## Steps
1. Define milestone goals and scope. Create `milestone.json` with id and status = "created". Name and goal may be draft if details are still being refined.
2. List phases and intended outcomes in `phases.json`. At minimum, include the intake phase.
3. Initialize `progress.md` with header and placeholder structure.
4. Do NOT create `summary.md` at this stage — it is produced by `/milestone-complete`.
