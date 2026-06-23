# Release Queue Tracker

Canonical release queue for sprint-level release state.

## Queue rows

| sprint_id | story_refs | status | last_updated | release_notes_ref | gate_snapshot | release_version | remediation |
|-----------|------------|--------|--------------|-------------------|---------------|-----------------|-------------|
| S0002 | BUG-0001 | released | 2026-06-13T12:40:00Z | handoffs/releases/S0002-release-notes.md | all gates PASS; test substitute evidence; UAT 3p/0f/2d; publish skipped (disabled) | 1.0.0 | Operator redeploy port 3000 + PAT AC-4 close-out |
| S0003 | US-0001 | released | 2026-06-13T12:53:00Z | handoffs/releases/S0003-release-notes.md | all gates PASS; tests/report.md 4/4; UAT 5p/0f/0d; publish skipped (disabled) | 1.0.0 | None — harness-only release |
| S0004 | US-0002 | released | 2026-06-14T16:00:00Z | handoffs/releases/S0004-release-notes.md | all gates PASS; validator exit 0 coverage_missing []; UAT 8p/0f/0d; tests 4/4; publish skipped (disabled) | 1.0.0 | None — docs-only release |
| S0005 | US-0003 | released | 2026-06-14T18:45:00Z | handoffs/releases/S0005-release-notes.md | all gates PASS; tests 9/9 (5 new + 4 existing); UAT 8p/0f/0d; json_schema strict:true; 429 retry intact; publish skipped (disabled) | 1.0.0 | None — internal SDK migration |

## Status model

- `planned`: sprint exists, release flow not entered
- `ready`: verify-work completed and release is eligible to start
- `unreleased`: release flow entered; notes written; finalization not completed
- `released`: release finalization completed for the sprint
- `blocked`: deterministic fail-safe condition requiring remediation

## Deterministic transition contract

- Allowed lifecycle: `planned -> ready -> unreleased -> released`.
- `blocked` can be set on deterministic failure conditions.
- Only the target sprint row may change during one `/release` run.
- No destructive auto-reconciliation is allowed by default.

## Fail-safe reason codes

- `RELEASE_SPRINT_UNRESOLVED`
- `LEGACY_NOTES_SPRINT_UNRESOLVED`
- `QUEUE_ENTRY_MISSING`
- `NOTES_REF_MISSING`
- `STATUS_TRANSITION_INVALID`
- `BACKLOG_STATUS_DRIFT`
- `CANONICAL_STATUS_CONFLICT`
- `COMPATIBILITY_CRITICAL_OPEN`
- `COMPONENT_SCOPE_VIOLATION_UNAPPROVED`

## Remediation guidance

- `RELEASE_SPRINT_UNRESOLVED`: set explicit sprint context (`Sxxxx`) and rerun `/release`.
- `LEGACY_NOTES_SPRINT_UNRESOLVED`: preserve legacy notes, identify sprint manually, then create target sprint notes file.
- `QUEUE_ENTRY_MISSING`: create the target sprint queue row with required fields, then rerun `/release`.
- `NOTES_REF_MISSING`: add canonical `release_notes_ref` for target sprint row and rerun `/release`.
- `STATUS_TRANSITION_INVALID`: correct row status to a valid predecessor state and rerun `/release`.
- `BACKLOG_STATUS_DRIFT`: reconcile target story status/ACs in `docs/product/backlog.md` using release evidence, then rerun `/release`.
- `CANONICAL_STATUS_CONFLICT`: resolve canonical backlog status mismatch versus derived artifacts and rerun `/release`.
- `COMPATIBILITY_CRITICAL_OPEN`: resolve or explicitly decide on open critical compatibility findings before rerun.
- `COMPONENT_SCOPE_VIOLATION_UNAPPROVED`: resolve or explicitly approve out-of-scope component impact before rerun.
