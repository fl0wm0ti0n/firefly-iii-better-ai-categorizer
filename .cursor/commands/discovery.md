---
description: "its-magic discovery: collect design/UX inspiration and scope updates."
---

# /discovery

## Subagents
- po

## Execution model
- Run `/discovery` in a fresh PO subagent context.
- After writing outputs, stop and hand off to `/research` in a new
  subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- Design/UX references
- Competitive/market notes

## Outputs (artifacts)
- `docs/product/vision.md`
- `docs/product/backlog.md`
- `handoffs/po_to_tl.md`

## Stop conditions
- Missing references
- Decision gate triggered

## Steps
1. Capture references and UX notes in vision.
2. Add new stories or updates to backlog.
3. Refresh the PO -> TL handoff.
4. Triad hot-surface gate (DEC-0054) when `handoffs/po_to_tl.md` is mutated:
   - run `python scripts/enforce-triad-hot-surface.py --rollover` then `--check`
     from repository root,
   - on failure stop with `STATE_ARCHIVE_REQUIRED` or
     `ARTIFACT_HOT_SURFACE_OVERSIZE`,
   - record verification tuple fields when rollover occurred (see runbook).

5. Default minimal-read posture: start at `docs/engineering/phase-context.md`,
   then vision/backlog/tail of `handoffs/po_to_tl.md` per runbook table; escalate
   only to a named archive `pack_ref` when unresolved (`CONTEXT_BUDGET_EXCEEDED`
   on unbounded reads).

