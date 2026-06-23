# Sprint Release Notes Template

**Sprint:** Sxxxx  
**Date:** YYYY-MM-DD  
**Stories:** US-xxxx  
**Queue status:** unreleased|released|blocked

---

## Gate results

1. **Check-in test gate:** PASS|FAIL
2. **QA completion gate:** PASS|FAIL
3. **UAT completeness gate:** PASS|FAIL
4. **Release finalization gate:** PASS|FAIL

---

## Run

- `start_command`: `<required>`
- `runtime_mode`: `local|remote` (required)
- `runtime_context_ref`: `docs/engineering/runtime-connectivity.md` (required
  when present)

## Connect

- `service_url`: `<required>`
- `service_port`: `<required>`
- `health_endpoint`: `<required>`

## Verify

- `verification_steps`:
  1. `<required step 1>`
  2. `<required step 2>`
  3. `<required step 3>`
- `expected_health_signal`: `<required>`

## Credentials

- `credential_source_refs` (env names only):
  - `<ENV_VAR_NAME>`
- `expected_value_source`:
  - `<CI secret store | operator shell profile | deployment platform variable set>`
- Never place inline secrets/tokens/passwords in this file.

## Known Issues

- `None` or deterministic concise issue list.

## Notes

- Sprint-scoped notes are canonical history artifacts.
- Do not overwrite notes for non-target sprints.
- Required section order is deterministic:
  `Run -> Connect -> Verify -> Credentials -> Known Issues`.

## Queue linkage

- `release_queue.md` row must reference this file via `release_notes_ref`.
- Status transitions must affect only the target sprint row.
