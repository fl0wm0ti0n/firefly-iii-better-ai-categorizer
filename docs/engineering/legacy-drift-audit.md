# Legacy drift audit (US-0049)

Append-only audit log for legacy DONE-story acceptance/traceability drift
detection and repair. Per DEC-0031; canonical path for one-time backfill and
ongoing guard outputs.

## Schema (required fields per entry)

| Field | Description |
|-------|-------------|
| story_id | Backlog story ID (e.g. US-xxxx) |
| prior_acceptance_state | Acceptance checklist state before repair (e.g. unchecked) |
| prior_traceability_state | Traceability/state entry presence before repair |
| resolved_state | State(s) after repair or guard action |
| reason_code | One of: BACKLOG_DONE_ACCEPTANCE_UNCHECKED, BACKLOG_DONE_TRACEABILITY_MISSING, BACKLOG_DONE_RELEASE_ARTIFACT_MISSING |
| evidence_ref | Reference to evidence used (e.g. release notes path, state.md row) |
| timestamp | ISO UTC when entry was appended |

## Entries

(No drift detected yet; idempotent backfill runs leave this section empty or add "no drift" note.)
