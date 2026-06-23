---
description: "its-magic map codebase: analyze existing project before changes."
---

# /map-codebase

## Subagents
- tech-lead
- curator

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- Existing repository code and docs

## Outputs (artifacts)
- `docs/engineering/codebase-map.md`
- `docs/engineering/dependencies.json`
- `docs/engineering/state.md` (append-only checkpoints only when the phase
  contract already allows bounded map-related notes)

## Lifecycle vs manual (US-0082 / DEC-0065)

- **Auto/bootstrap (primary)**: `/architecture` completion (**tech-lead**) must
  run `python scripts/materialize_codebase_map.py --trigger architecture` before
  `/sprint-plan` so a bootstrap map exists or deterministic
  `CODEBASE_MAP_BLOCKED:*` diagnostics are emitted.
- **Auto/bootstrap (optional)**: `/refresh-context` (**curator**) may run the
  same script with `--trigger refresh-context` only when merged scratchpad sets
  `CODEBASE_MAP_REFRESH_ON_ROLLOVER=1` (default off — limits churn).
- **Manual (this command)**: `/map-codebase` remains the explicit operator path
  for a full analysis pass and for refreshing rich maps; it does not replace the
  lifecycle gate above.

## Stop conditions
- Decision gate triggered

## Steps
1. Identify stack, structure, and key entry points.
2. Summarize architecture and conventions.
3. Capture dependencies and tooling.
4. Persist outputs to the artifact paths above. When a programmatic bootstrap is
   needed in tooling or tests, prefer `scripts/materialize_codebase_map.py`
   (idempotent; preserves non-bootstrap maps).
