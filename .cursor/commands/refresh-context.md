---
description: "its-magic refresh context: compact state and decisions."
---

# /refresh-context

## Subagents
- curator

## Execution model
- Run `/refresh-context` in a fresh Curator subagent context.
- After writing outputs, stop. Next phase starts in a new subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- Current sprint artifacts
- Decisions and handoffs

## Outputs (artifacts)
- `docs/engineering/state.md`
- `docs/engineering/decisions.md`
- `sprints/S0001/summary.md`

## Stop conditions
- Missing critical artifacts

## Steps
1. Compact state and decisions into a short context pack.
2. Update sprint summary with current status.
3. Ensure handoffs and state are consistent.
3a. Optional codebase map refresh (US-0082 / DEC-0065): when merged scratchpad
    sets `CODEBASE_MAP_REFRESH_ON_ROLLOVER=1`, from repository root run
    `python scripts/materialize_codebase_map.py --trigger refresh-context`.
    Default is **skip** (omit this step) to avoid map churn. On
    `CODEBASE_MAP_BLOCKED:*`, record the token and remediation in the new
    `state.md` checkpoint; do not rewrite operator-authored maps outside the
    bootstrap contract.
4. Enforce **triad** hot-surface rollover when merged scratchpad thresholds are
   exceeded (DEC-0054):
   - read caps from `.cursor/scratchpad.md` + `.cursor/scratchpad.local.md`,
     including `STATE_HOT_MAX_LINES`, `STATE_HOT_MAX_CHECKPOINTS`,
     `PO_TO_TL_HOT_MAX_LINES`, `PO_TO_TL_HOT_MAX_SECTIONS`, `ARCH_HOT_MAX_LINES`,
     and `ARCH_HOT_MAX_STORY_SECTIONS` (see runbook defaults),
   - run `python scripts/enforce-triad-hot-surface.py --rollover` from repo root
     (or `--repo <root>`) so `state.md`, `handoffs/po_to_tl.md`, and
     `docs/engineering/architecture.md` archive oldest contiguous units into
     deterministic packs under `docs/engineering/state-archive/`,
     `handoffs/archive/`, and `docs/engineering/architecture-archive/`,
   - immediately rerun `python scripts/enforce-triad-hot-surface.py --check`;
     on failure stop with `STATE_ARCHIVE_REQUIRED` or
     `ARTIFACT_HOT_SURFACE_OVERSIZE` (no successful phase completion on oversize
     hot files),
   - record verification tuple fields (`boundary`, `moved`, `retained`,
     `pack_ref`) in the new `state.md` checkpoint when any rollover occurred;
     idempotent reruns must not duplicate archived content.

## Deterministic artifact ordering contract (US-0058 / DEC-0040)

- Writes must follow `docs/engineering/artifact-ordering-policy.md`.
- `docs/engineering/state.md` refresh checkpoints are append-bottom only.
- `docs/engineering/decisions.md` compact index remains newest-first in bounded
  section while preserving canonical header structure.
- `sprints/S0001/summary.md` context-pack pointer is prepend-top within its
  context section; historical details remain intact.
- Missing/ambiguous anchors fail with `ARTIFACT_ORDERING_ANCHOR_AMBIGUOUS`
  (no partial write).
- Archive write or rollover boundary ambiguity fails with
  `STATE_ARCHIVE_WRITE_FAILED` or `STATE_ARCHIVE_BOUNDARY_AMBIGUOUS`
  (no partial write).
- Archive verification mismatch fails with `STATE_ARCHIVE_VERIFICATION_FAILED`
  (no partial write).

## Cross-phase ownership guard (US-0061 / DEC-0043)

- Refresh-context mutations must comply with
  `docs/engineering/artifact-ownership-policy.md`.
- Only curator-owned compaction scopes may be mutated; non-owned section
  rewrites fail closed with `PHASE_OWNERSHIP_VIOLATION`.

