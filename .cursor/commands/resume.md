---
description: "its-magic resume: deterministic continuation context loader."
---

# /resume

## Subagents
- curator

## Execution model
- Run `/resume` in a fresh Curator subagent context.
- When continuing to another phase, start that phase in a new subagent/chat.

## Isolation evidence write requirement (US-0048 / DEC-0029)

At the end of `/resume`, append an isolation evidence entry to
`docs/engineering/state.md`:

- `phase_id=resume`
- `role=curator`
- `fresh_context_marker=<new marker for this subagent>`
- `timestamp=<ISO UTC>`
- `evidence_ref=docs/engineering/state.md` (resume resolution summary and next-phase recommendation)

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `docs/engineering/state.md`
- `docs/engineering/decisions.md`
- `sprints/S0001/summary.md`
- `handoffs/resume_brief.md`
- Optional automation flags from `.cursor/scratchpad.md`
- Optional operator intent to continue via `/auto start-from=<phase>`

## Outputs (artifacts)
- Updated `docs/engineering/state.md` (if needed)

## Stop conditions
- Missing resume brief or stale state

## Steps
1. Load the context pack and open decisions.
2. Parse intended resume phase from `handoffs/resume_brief.md`.
3. Validate that `resume_brief` phase is canonical and consistent with latest
   `docs/engineering/state.md` checkpoint.
3a. Validate isolation provenance (US-0048 / DEC-0029):
   - If `resume_brief.md` includes `isolation_provenance_ref`, confirm it points
     to the latest relevant isolation evidence entry in `docs/engineering/state.md`.
   - If `resume_requires_fresh_context=1`, ensure the next phase is executed in a
     fresh subagent context and writes a new `fresh_context_marker` (no reuse).
4. If `resume_brief.md` is stale/unparseable/conflicting, fail fast with the
   `/auto` resolver contract format:
   `[AUTO_RESUME_ERROR] <code>: <summary>. Source=<source>. Fix: <action>.`
5. Summarize current status, deterministic resume source, and next steps.
6. For deterministic continuation, recommend:
   - explicit override: `/auto start-from=<phase>`
   - default precedence: `/auto` (argument > resume brief > state fallback)
7. If `AUTO_FLOW_MODE=auto_until_decision`, continue automation with existing
   decision gates and stop conditions preserved.

## Compatibility notes

- `/resume` remains valid for manual/interactive status recovery.
- `/resume` does not bypass `/auto` stop conditions or gate behavior.

