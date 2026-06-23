---
description: "its-magic memory-audit: read-only check for memory drift between artifacts and repository signals."
---

# /memory-audit

## Subagents
- tech-lead (audit analysis and signal comparison)
- curator (artifact freshness and cross-reference validation)

## Execution model
- Run `/memory-audit` in a fresh subagent context.
- This command is **read-only**: it does not create, modify, or delete source
  code, workflow rules, or sprint artifacts.
- After writing the report artifact, stop. No handoff file is produced.
- Can be run at any phase: pre-handoff, pre-QA, pre-release, or ad-hoc.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
Read these files to build the audit picture:

- `docs/engineering/state.md` — current project status and progress snapshot
- `docs/product/backlog.md` — story definitions and statuses
- `docs/product/acceptance.md` — acceptance criteria and completion status
- `docs/engineering/architecture.md` — technical design and decisions
- `docs/engineering/decisions.md` — decision index
- `decisions/DEC-*.md` — individual decision records (check for open TODOs/gates)
- `sprints/S*/progress.md` — sprint progress (all sprints, not just latest)
- `sprints/S*/tasks.md` — task definitions and status
- `sprints/S*/summary.md` — sprint completion summaries
- `handoffs/*.md` — handoff artifacts
- `.cursor/scratchpad.md` — automation flags and config

## Outputs (artifacts)
- `docs/engineering/memory-drift-report.md`

## Stop conditions
- Report artifact written — stop.
- If invocation itself fails (missing critical inputs), report the error and
  stop.

## Phase usage guidance
Run `/memory-audit` at these checkpoints:
- **Pre-handoff**: before writing `handoffs/dev_to_qa.md` or any role handoff.
- **Pre-QA**: before running `/qa` or `/verify-work`.
- **Pre-release**: before running `/release`.
- **Ad-hoc**: any time the operator suspects artifacts are stale after external
  code changes or long pauses.

## Report format

The output artifact `docs/engineering/memory-drift-report.md` must contain
these sections in order:

### 1. Header metadata
- Timestamp (UTC ISO-8601)
- Branch name and HEAD commit (short SHA)
- Audit scope: list of artifact categories checked

### 2. Severity summary
Counts by severity level:

| Severity | Meaning | Action expectation |
|----------|---------|-------------------|
| **high** | Artifact clearly contradicts repository state | Fix before next handoff or release |
| **medium** | Artifact is likely stale but not directly contradictory | Fix before release; acceptable during active sprint |
| **low** | Minor staleness or cosmetic inconsistency | Fix during `/refresh-context` or next sprint |

### 3. Memory drift findings table

| # | Artifact | Signal | Severity | Evidence | Recommended action |
|---|----------|--------|----------|----------|--------------------|

Each finding must include:
- **Artifact**: the file path of the stale or inconsistent artifact.
- **Signal**: what repository evidence contradicts it.
- **Severity**: `high`, `medium`, or `low` per the taxonomy above.
- **Evidence**: concrete file paths, line references, or status values that
  demonstrate the inconsistency.
- **Recommended action**: a specific follow-up command or manual step
  (e.g., "run `/refresh-context`", "update `state.md` progress snapshot",
  "resolve DEC-xxxx TODO").

### 4. Template drift findings (reference-only — US-0017 scope)

This section lists differences between active files (`.cursor/commands/`,
`.cursor/rules/`, etc.) and their `template/` counterparts.

> **Scope note**: Template drift detection and remediation belong to US-0017.
> Findings listed here are for awareness only. Do not remediate template drift
> under `/memory-audit`. Use `/refresh-context` or the future US-0017
> template-sync mechanism instead.

Format: short list of differing file pairs, or "No template drift detected."

### 5. Suggested next steps
Based on findings, recommend one or more of:
- `/refresh-context` — to update stale artifacts
- `/sprint-plan` — if new work is discovered
- `/verify-work` — if acceptance status needs re-validation
- `/intake` — if findings reveal a new story or bug

## Detection coverage and evidence rules

The audit must check at least these three categories. For each finding, the
report must include concrete evidence (file paths, status values, or line
references) — not vague assertions.

### Check 1: Changed code without artifact updates
- **What to check**: identify files outside `docs/`, `sprints/`, `handoffs/`,
  `decisions/`, and `.cursor/` that have been modified (per git status or recent
  commit history) while related memory artifacts show no corresponding update.
- **Artifacts to cross-reference**: `docs/engineering/state.md` (progress
  snapshot), `docs/engineering/architecture.md` (component descriptions),
  `docs/product/acceptance.md` (completion markers).
- **Evidence required**: list the changed source file(s) and the artifact
  section(s) that should reflect the change but do not.
- **Severity guidance**: `high` if the artifact claims a feature is complete but
  code changes are uncommitted or untested; `medium` if the artifact is simply
  behind; `low` if cosmetic or naming-only.

### Check 2: Unresolved decision TODOs and open gates
- **What to check**: scan `decisions/DEC-*.md` for status values other than
  "Accepted" or "Rejected" (e.g., "Proposed", "Open", "TODO"). Check whether
  any sprint task or story references a decision that is not yet resolved.
- **Artifacts to cross-reference**: `docs/engineering/decisions.md` (index),
  `sprints/S*/tasks.md` (task references to decisions).
- **Evidence required**: the decision file path, its current status, and the
  task(s) or story that depend on it.
- **Severity guidance**: `high` if a task marked "done" depends on an unresolved
  decision; `medium` if the decision is referenced but the dependent work is
  still pending; `low` if the decision is informational only.

### Check 3: Sprint/story status mismatch vs repository signals
- **What to check**: compare story statuses in `docs/product/backlog.md` and
  sprint task statuses in `sprints/S*/tasks.md` against observable signals:
  presence of summary.md, UAT results, QA findings, handoff artifacts.
- **Artifacts to cross-reference**: `sprints/S*/summary.md`,
  `sprints/S*/qa-findings.md`, `sprints/S*/uat.json`, `handoffs/*.md`.
- **Evidence required**: the story/task ID, its claimed status, and the missing
  or contradictory artifact.
- **Severity guidance**: `high` if a story is marked "done" but QA findings are
  unresolved or UAT is missing; `medium` if status is ahead of actual progress;
  `low` if status labels are inconsistent but work is substantively correct.

## Scope boundary: US-0024 vs US-0017

This command implements **US-0024** (memory drift detection). The report must
maintain a clear separation:

- **"Memory drift findings"** (sections 2–3): artifacts vs repository/code
  reality. This is the actionable output of `/memory-audit`. Remediation uses
  existing commands (`/refresh-context`, `/sprint-plan`, `/verify-work`,
  `/intake`).

- **"Template drift findings"** (section 4): active files vs `template/`
  alignment. This is **reference-only** output. Remediation belongs to US-0017
  and must not be performed by `/memory-audit`.

The agent must not blur these categories. If a finding is about active-vs-template
divergence, it goes in section 4 with the US-0017 routing note. If it is about
artifact-vs-code/repo divergence, it goes in section 3.

## Steps
1. Read all input files listed above.
2. Run detection checks 1–3 against the repository state.
3. Identify any template drift (active vs `template/` file differences) for the
   reference-only section.
4. Classify each finding by severity using the taxonomy.
5. Write `docs/engineering/memory-drift-report.md` with all required sections.
6. Print a one-line summary: counts of high/medium/low findings.
7. Stop. Do not modify any source, workflow, or sprint artifacts.
