---
description: "its-magic pause: write checkpoint and resume brief."
---

# /pause

## Subagents
- curator

## Execution model
- Run `/pause` in a fresh Curator subagent context.
- After writing outputs, stop.

## Isolation evidence write requirement (US-0048 / DEC-0029)

At the end of `/pause`, append an isolation evidence entry to
`docs/engineering/state.md`:

- `phase_id=pause`
- `role=curator`
- `fresh_context_marker=<new marker for this subagent>`
- `timestamp=<ISO UTC>`
- `evidence_ref=handoffs/resume_brief.md`

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- Current sprint progress and state
- Optional intent: immediate pause or graceful pause after current boundary

## Outputs (artifacts)
- `docs/engineering/state.md`
- `sprints/S0001/progress.md`
- `handoffs/resume_brief.md`

## Stop conditions
- Missing state or progress updates

## Steps
1. Write a short checkpoint of current work.
2. Update sprint progress and state.
3. Record deterministic continuation breadcrumbs in `docs/engineering/state.md`:
   - `invocation_mode=auto|manual`
   - `requested_start_from`
   - `resolved_start_phase`
   - `resolution_source`
   - `resolution_status`
   - `stop_reason=pause_request|manual_pause`
   - `stop_phase`
   - `timestamp`
4. Write `handoffs/resume_brief.md` with next actions and canonical intended
   resume phase (`intake|discovery|research|architecture|sprint-plan|plan-verify|execute|qa|verify-work|release|refresh-context`).
   - Include isolation provenance (US-0048 / DEC-0029):
     - `isolation_provenance_ref` pointing to the latest isolation evidence entry
       in `docs/engineering/state.md`
     - `resume_requires_fresh_context=1` (resume must run the next phase in a
       fresh subagent and write new isolation evidence; no marker reuse)
5. If pause metadata is stale or ambiguous, fail fast with:
   `[AUTO_RESUME_ERROR] <code>: <summary>. Source=<source>. Fix: <action>.`
6. If this pause was requested via `AUTO_PAUSE_REQUEST=1`, reset the flag to `0`
   after checkpoint is complete.

