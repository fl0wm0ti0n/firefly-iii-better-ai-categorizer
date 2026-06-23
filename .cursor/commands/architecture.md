---
description: "its-magic architecture: define approach, risks, and decisions."
---

# /architecture

## Subagents
- tech-lead

## Execution model
- Run `/architecture` in a fresh Tech Lead subagent context.
- After writing outputs, stop and hand off to `/sprint-plan` in a new
  subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- Product vision and acceptance
- Constraints and risks
- `docs/engineering/research.md`

## Outputs (artifacts)
- `docs/engineering/architecture.md`
- `docs/engineering/decisions.md`
- `docs/engineering/state.md`
- `handoffs/po_to_tl.md` (read)
- Optional (when enabled):
  - `docs/engineering/manifests/registry.manifest.yaml`
  - `docs/engineering/manifests/repo.manifest.yaml`
  - `docs/engineering/compatibility-signals.md`
- Optional (when enabled):
  - `docs/engineering/component-scope.md`

## Stop conditions
- Major tradeoff requires a decision
- Unknown feasibility or data migration risk

## Steps
1. Challenge:
   a. If `EARLY_RESEARCH=1` in `.cursor/scratchpad.md`, search for technical
      references (framework docs, pattern comparisons, benchmarks, security
      considerations) and persist as an R-xxxx entry in
      `docs/engineering/research.md` using deterministic ID policy:
      - if `ID_NAMESPACE_BOOTSTRAP=1` and freshness checks pass (no `US-` in
        backlog, no `DEC-` in decisions, no `R-` in research), start at
        `R-0001`,
      - otherwise continue from highest existing `R-` ID.
      Never rewrite historical IDs; emit `ID_BOOTSTRAP_NOT_FRESH` when
      bootstrap is requested but ineligible (DEC-0011 / DEC-0034).
   b. Question design assumptions ("what's the alternative?").
   c. Check for simpler approaches ("can this be simpler?").
   d. Inventory risks for each architectural choice.
2. Define the minimal architecture and key components.
3. Record tradeoffs in decisions log.
   - For new `DEC-xxxx` records use deterministic ID policy:
     - if `ID_NAMESPACE_BOOTSTRAP=1` and deterministic freshness checks pass,
       start at `DEC-0001`,
     - otherwise continue from highest existing `DEC-` ID.
   - Never renumber historical decisions.
4. Update engineering state and readiness.
5. Optional cross-repo observability architecture (US-0034):
   - If `CROSS_REPO_OBSERVABILITY=0`, skip this step (zero required overhead).
   - If `CROSS_REPO_OBSERVABILITY=1`, define monitored sources, manifest contract
     boundaries, compatibility signal taxonomy, and critical-gate policy
     (`COMPATIBILITY_GATE_ON_CRITICAL`) in architecture/decision artifacts.
6. Optional component-scope architecture (US-0035):
   - If `COMPONENT_SCOPE_MODE=0`, skip this step (zero required overhead).
   - If `COMPONENT_SCOPE_MODE=1`, define scoped-mode constraints in
     `docs/engineering/component-scope.md`:
     - `target_components[]`
     - `non_target_components[]`
     - `allowed_interface_touch[]`
     - escalation policy for out-of-scope impact.
7. Optional spec-pack (US-0031):
   - If `SPEC_PACK_MODE=0`, add no required spec-pack steps (zero overhead).
   - If `SPEC_PACK_MODE=1`, create or update Design Concept and Technical
     Specification at canonical paths per runbook spec-pack contract; link story
     ID in architecture/state.
8. Optional user-guide (US-0032):
   - If `USER_GUIDE_MODE=0`, add no required user-guide steps or blocking checks (zero overhead).
   - If `USER_GUIDE_MODE=1`, reference canonical user-guide path and schema in
     architecture/state for in-scope feature stories; see runbook user-guide section.
9. Triad hot-surface gate (DEC-0054; heading policy DEC-0076 / BUG-0010) when
   `docs/engineering/architecture.md` is mutated:
   - **Authoring mandate**: append new story sections as H1 `# US-xxxx` and new
     bug sections as H1 `# BUG-xxxx` (not `## US-` / `## BUG-`).
   - **Before** mutating the file, capture
     `baseline_h2_count = count_h2_story_headings(architecture.md)` via
     `python scripts/enforce-triad-hot-surface.py` (legacy `## US-xxxx` sections
     remain rollover-visible; count must not increase during `/architecture`).
   - Run `python scripts/enforce-triad-hot-surface.py --rollover` then `--check`
     from repository root.
   - Run heading policy check:
     `python scripts/enforce-triad-hot-surface.py --check-arch-heading-policy
     --baseline-h2-count <baseline_h2_count>`.
   - On failure stop with `STATE_ARCHIVE_REQUIRED`, `ARTIFACT_HOT_SURFACE_OVERSIZE`,
     or **`ARCH_STORY_HEADING_LEVEL_INVALID`** (non-suppressible `blocked` when H2
     story-heading count increased),
   - preserve non-target history in archive packs only (never delete unrelated
     story sections without archival evidence).
10. Codebase map lifecycle gate (US-0082 / DEC-0065) — before handoff to
    `/sprint-plan`, from repository root run:
    `python scripts/materialize_codebase_map.py --trigger architecture`
    - On success, stdout includes `[CODEBASE_MAP_OK]` (created, noop, or
      `preserved_existing` when a non-bootstrap map is left untouched).
    - On `CODEBASE_MAP_BLOCKED:<subreason>` or non-zero exit after a failed
      materialization policy, stop the phase with that token; remediation is on
      stdout (run `/map-codebase`; see runbook **Codebase map bootstrap** and
      `docs/engineering/architecture.md` **# US-0082**).
    - The script writes only `docs/engineering/codebase-map.md` and
      `docs/engineering/dependencies.json` (same surfaces as `/map-codebase`);
      do not use it to bulk-append `state.md`.

## Cross-phase ownership guard (US-0061 / DEC-0043)

- Architecture mutations must comply with
  `docs/engineering/artifact-ownership-policy.md`.
- `docs/engineering/architecture.md` is history-preserving:
  - append new `US-xxxx` section for the current story,
  - update only current target section when needed,
  - never delete unrelated historical story sections.
- If non-target section deletion/rewrite is detected, fail closed with
  `ARCH_HISTORY_DELETION_DETECTED` (or `PHASE_OWNERSHIP_VIOLATION`) and no
  partial write.

