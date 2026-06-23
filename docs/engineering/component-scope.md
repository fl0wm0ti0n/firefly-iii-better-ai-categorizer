# Component Scope

- Mode: optional (`COMPONENT_SCOPE_MODE`)
- Story: US-xxxx

## Scope declaration

- scope_mode: off
- target_components:
  - (set when enabled)
- non_target_components:
  - (set when enabled)
- allowed_interface_touch:
  - (set when enabled)
- out_of_scope_constraints:
  - no intentional edits in non-target components without explicit approval
- approval_policy:
  - required: false
  - source: decision/handoff artifact
