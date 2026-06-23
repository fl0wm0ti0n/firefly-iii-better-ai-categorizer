# Spec-pack (US-0031)

When `SPEC_PACK_MODE=1` in `.cursor/scratchpad.md`, the workflow creates/updates
three artifacts per story at these canonical paths:

- `docs/engineering/spec-pack/<story_id>-design-concept.md`
- `docs/engineering/spec-pack/<story_id>-crs.md`
- `docs/engineering/spec-pack/<story_id>-technical-specification.md`

Traceability: backlog story ID → the three paths above.

Minimum required sections (see `docs/engineering/runbook.md` for validation and
ownership):

- Design Concept: Summary, Goals, Non-goals, Key decisions
- CRS: Purpose, Scope, Acceptance criteria ref
- Technical Specification: Overview, Components, Interfaces, Non-functional

Validation blocks release only when `SPEC_PACK_MODE=1` and a required section
is missing or empty (`SPEC_PACK_INCOMPLETE`).
