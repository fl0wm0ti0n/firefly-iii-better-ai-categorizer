# Phase context pointers

Use this file as the **first** narrow read for workflow orientation. Expand to
linked hot or archive paths only when a question stays unresolved after the
default set (see minimal-read table in `docs/engineering/runbook.md`).

| Kind | Path | Notes |
|------|------|-------|
| Engineering state (hot) | `docs/engineering/state.md` | Recent checkpoints; archive under `docs/engineering/state-archive/` |
| Decisions index | `docs/engineering/decisions.md` | Compact index; full records under `decisions/` |
| PO → TL handoff (hot) | `handoffs/po_to_tl.md` | Narrative handoff; archive under `handoffs/archive/` |
| Architecture (hot) | `docs/engineering/architecture.md` | Story-shaped sections; archive under `docs/engineering/architecture-archive/` |
| Triad enforcement | `scripts/enforce-triad-hot-surface.py` | `--check` before phase completion when mutating triad surfaces |

Escalation: open the **named archive pack** cited in the latest rollover
verification tuple for the surface you need, not the entire archive tree.
