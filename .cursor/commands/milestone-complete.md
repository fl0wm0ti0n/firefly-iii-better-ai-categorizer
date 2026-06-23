---
description: "its-magic milestone complete: finalize milestone summary."
---

# /milestone-complete

## Subagents
- release
- curator

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `milestones/M0001/summary.md`
- `handoffs/release_notes.md`

## Outputs (artifacts)
- Updated `milestones/M0001/summary.md`
- Updated `docs/engineering/state.md`

## Stop conditions
- Decision gate triggered

## Exit criteria checklist (DEC-0009)

Before completing a milestone, all of the following must be true:

- [ ] **All sprints done**: every sprint under this milestone has status = done
  in its `progress.md` and `summary.md`.
- [ ] **UAT passing**: all sprint UAT artifacts (`uat.json`, `uat.md`) are in
  **populated** or **verified** state (not placeholder) with passing results.
- [ ] **progress.md complete**: `milestones/Mxxxx/progress.md` shows all sprints
  as done with accurate status.
- [ ] **summary.md written**: `milestones/Mxxxx/summary.md` is finalized with
  outcomes, lessons learned, and deliverable list.
- [ ] **Traceability verified**: all stories in the milestone have entries in the
  traceability index (`docs/engineering/state.md`) with PASS status and evidence.
- [ ] **No open blockers**: no unresolved decision gates or blocking QA findings
  remain for any sprint in this milestone.

If any check fails, do not complete — document what is missing and recommend
the appropriate corrective command (`/verify-work`, `/execute`, `/qa`).

## Steps
1. Run exit criteria checklist above. If any item fails, stop and report.
2. Finalize milestone summary in `milestones/Mxxxx/summary.md` with outcomes,
   lessons learned, and list of delivered stories.
3. Update `milestone.json` status to "completed".
4. Confirm release notes and update `docs/engineering/state.md`.
