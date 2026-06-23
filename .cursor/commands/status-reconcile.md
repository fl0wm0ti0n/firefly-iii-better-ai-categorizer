---
description: "its-magic status-reconcile: deterministic status normalization and resume readiness."
---

# /status-reconcile

## Subagents
- curator
- tech-lead

## Execution model
- Run `/status-reconcile` in a fresh subagent context.
- This command performs bounded deterministic reconciliation writes.
- Reconciliation scope is workflow artifacts only (status surfaces + resume metadata).
- After writing outputs, stop and recommend next phase.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `docs/product/backlog.md` (canonical status source)
- `docs/product/acceptance.md` (derived checklist surface)
- `docs/engineering/state.md` (traceability + checkpoints)
- `handoffs/resume_brief.md` (continuation intent)
- `handoffs/release_queue.md` (release evidence context)
- `handoffs/releases/Sxxxx-release-notes.md` (target evidence when needed)
- `docs/engineering/status-normalization-report.md` (normalization audit log)

## Outputs (artifacts)
- `docs/product/backlog.md` (target-scoped AC/status normalization when needed)
- `docs/product/acceptance.md` (derived checklist reconciliation)
- `handoffs/resume_brief.md` (next OPEN story + intended phase)
- `docs/engineering/status-normalization-report.md` (audit rows)
- `docs/engineering/state.md` (reconciliation checkpoint and evidence refs)

## Stop conditions
- Canonical conflict requires decision gate
- Missing critical artifacts
- Ambiguous next OPEN story / phase resolution

## Canonical precedence (US-0045 / DEC-0025)
- Story status authority is `docs/product/backlog.md` only (including **`BUG-####`** under **`## Bug issues (canonical)`** per **DEC-0061** / **US-0079**).
- `docs/product/acceptance.md` and `docs/engineering/state.md` are derived views.
- Reconciliation must not infer canonical story status from derived artifacts.
- Bug portfolio drift vs **`## Bug acceptance (canonical)`** is machine-checkable: **`python scripts/bug_issue_validate.py --backlog docs/product/backlog.md --check-acceptance`** (**`BUG_RECONCILE_ACCEPTANCE_*`** codes).

## Deterministic detection matrix
1. Backlog story `Status: DONE` with unchecked AC checkboxes.
2. Acceptance row state mismatched vs canonical backlog status.
3. Resume intent (`next story`, `intended phase`) mismatched vs canonical OPEN backlog.
4. Canonical/release evidence contradiction for target story (fail-closed path).

## Reason codes (deterministic)
- `STATUS_RECONCILE_APPLIED`
- `STATUS_RECONCILE_NOOP`
- `STATUS_RECONCILE_MISSING_INPUT`
- `STATUS_RECONCILE_CANONICAL_CONFLICT`
- `STATUS_RECONCILE_PHASE_AMBIGUOUS`
- `STATUS_RECONCILE_EVIDENCE_MISSING`

## Steps
1. Read canonical and derived status artifacts.
2. Build mismatch set using deterministic detection matrix.
3. If no mismatches: write no-op report row + state checkpoint (`STATUS_RECONCILE_NOOP`) and stop.
4. For each mismatched story (target-scoped only):
   - If canonical status is `DONE`, normalize backlog AC checkboxes to checked state.
   - Reconcile matching `docs/product/acceptance.md` row to checked state.
5. Recompute next OPEN story by backlog priority/order:
   - if exists, update `handoffs/resume_brief.md` to that story and intended phase `discovery`,
   - if none exist, set intended phase `intake`.
6. Write normalization evidence row(s) to `docs/engineering/status-normalization-report.md`:
   - story id, prior values, resolved values, reason code, evidence refs, timestamp.
7. Append reconciliation checkpoint to `docs/engineering/state.md` with:
   - `phase_id=status-reconcile`
   - `role=curator`
   - `fresh_context_marker`
   - `timestamp`
   - `evidence_ref`
8. On conflict paths (canonical/release contradiction, ambiguous phase, missing evidence):
   - fail closed with deterministic reason code,
   - write remediation guidance,
   - avoid partial mutation.

## Deterministic artifact ordering contract (US-0058 / DEC-0040)

- Reconciliation writes must follow
  `docs/engineering/artifact-ordering-policy.md`.
- `docs/product/backlog.md` and `docs/product/acceptance.md` updates are
  target-scoped and preserve sorted-canonical story order.
- `docs/engineering/state.md` reconciliation checkpoints are append-bottom only.
- `handoffs/resume_brief.md` updates are prepend-top in current-status section
  without rewriting unrelated blocks.
- Missing or ambiguous anchors must fail with
  `ARTIFACT_ORDERING_ANCHOR_AMBIGUOUS` and no partial mutation.
