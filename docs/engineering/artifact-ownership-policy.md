# Artifact Ownership Policy (US-0061 / DEC-0043)

This policy defines phase-level mutation ownership for mutable workflow
artifacts. Ordering policy and ownership policy are complementary:

- ordering determines where mutations may be placed,
- ownership determines who may mutate specific scopes.

## Ownership matrix

| Artifact | Owned scope | Allowed phases | Override-authorized phases |
|---|---|---|---|
| `docs/product/vision.md` | Intake/discovery notes for current story | `intake`, `discovery` | none |
| `docs/product/backlog.md` | target story block only | `intake`, `release`, `status-reconcile` | none |
| `docs/product/acceptance.md` | target story row only | `intake`, `release`, `status-reconcile` | none |
| `handoffs/po_to_tl.md` | newest handoff/addendum section | `intake`, `discovery` | none |
| `docs/engineering/research.md` | new `R-xxxx` entries | `intake`, `research`, `architecture` | none |
| `docs/engineering/architecture.md` | append new `US-xxxx` architecture section or target section update | `architecture` | none |
| `docs/engineering/decisions.md` | compact index/context pack section | `architecture`, `refresh-context` | none |
| `decisions/DEC-xxxx.md` | decision file for current story | `architecture` | none |
| `sprints/Sxxxx/*` | current sprint artifacts only | `sprint-plan`, `plan-verify`, `execute`, `qa`, `verify-work`, `release` | none |
| `handoffs/tl_to_dev.md` | newest handoff section | `sprint-plan` | none |
| `handoffs/release_queue.md` | target sprint row only | `release` | none |
| `handoffs/release_notes.md` | latest pointer section | `release`, `refresh-context` | none |
| `docs/engineering/state.md` | append-bottom checkpoints only | all delivery phases | none |
| `handoffs/resume_brief.md` | current status/next-actions sections; latest-pointer upsert on **`/intake bug`** completion (**DEC-0069**) | `intake` (bug persistence path only), `pause`, `resume`, `refresh-context`, `release` | none |

## Non-destructive mutation rules

- Non-authorized phases must not delete or rewrite sections owned by other
  phases.
- Mutations must be target-scoped; broad file rewrites are forbidden.
- `docs/engineering/architecture.md` history preservation is mandatory:
  unrelated `US-xxxx` sections must remain intact.

## Override contract

- Override-authorized mutation is allowed only when the matrix explicitly lists
  an override-authorized phase for that artifact.
- Required evidence fields:
  - `override_phase_id`
  - `override_reason`
  - `override_scope`
  - `evidence_ref`
- Missing/invalid override evidence is fail-closed.

## Fail-safe reason codes

- `PHASE_OWNERSHIP_VIOLATION`
- `PHASE_OVERRIDE_EVIDENCE_MISSING`
- `ARCH_HISTORY_DELETION_DETECTED`

When any reason code is emitted:

- perform no partial write,
- preserve current file contents,
- emit remediation guidance with expected owner phase and target scope.
