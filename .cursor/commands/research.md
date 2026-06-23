---
description: "its-magic research: gather references and risks before architecture."
---

# /research

## Subagents
- tech-lead
- po

## Execution model
- Run `/research` in a fresh subagent context (tech-lead by default; include PO
  support only if needed for requirements clarification).
- After writing outputs, stop and hand off to `/architecture` in a new
  subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `docs/product/vision.md`
- `docs/product/backlog.md`
- `docs/product/acceptance.md`

## Outputs (artifacts)
- `docs/engineering/research.md`
- `docs/engineering/decisions.md`
- `docs/engineering/state.md`

## Stop conditions
- Decision gate triggered
- Missing acceptance criteria

## Steps
1. Identify research topics from product vision, backlog, and acceptance criteria.
2. Search the web for relevant patterns, libraries, APIs, and risks.
3. Persist each finding as an R-xxxx entry in `docs/engineering/research.md`.
   Use deterministic ID policy:
   - if `ID_NAMESPACE_BOOTSTRAP=1` and freshness checks pass
     (`docs/product/backlog.md` has no `US-`, `docs/engineering/decisions.md` has
     no `DEC-`, and `docs/engineering/research.md` has no `R-`), start at
     `R-0001`;
   - otherwise auto-increment from the highest existing entry.
   Never rewrite historical IDs. If bootstrap is requested but freshness fails,
   emit `ID_BOOTSTRAP_NOT_FRESH` diagnostic and continue with highest-existing
   continuation. Follow the entry schema defined in the research.md header
   (per DEC-0011 / DEC-0034).
4. Record any decisions triggered by research and update state.
