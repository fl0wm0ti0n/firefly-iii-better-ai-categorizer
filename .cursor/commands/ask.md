---
description: "its-magic ask: answer questions using project context, read-only."
---

# /ask

## Subagents
- (none — uses default agent)

## Inputs (context pack)
Apply narrow-read retrieval policy (US-0053):
- Start with targeted sections only; do not load broad files by default.
- Expand in bounded steps only when the answer is unresolved.
- Keep reads question-scoped and avoid unrelated historical sections unless needed.

Preferred read order:
1. `docs/engineering/state.md` (latest relevant checkpoint/section)
2. `handoffs/resume_brief.md` (current continuation intent)
3. `docs/product/backlog.md` (specific story block by `US-xxxx` or bug block by `BUG-####` under **`## Bug issues (canonical)`**)
4. `docs/product/acceptance.md` (specific checklist rows, including **`## Bug acceptance (canonical)`** when answering defect status)
5. `docs/engineering/decisions.md` and `decisions/DEC-xxxx.md` (when decision detail is required)
6. `docs/engineering/architecture.md` and `docs/engineering/runbook.md` (only if implementation/policy depth is required)
7. `sprints/S*/progress.md` (only latest relevant sprint)
8. `.cursor/scratchpad.md` (flags/config only when needed)

## Outputs (artifacts)
- (none — this command is strictly read-only)

## Stop conditions
- (none — answer the question and stop)

## Behavior rules
- Do NOT create, modify, or delete any files.
- Do NOT update state.md or any sprint artifacts.
- Reference stories (**`US-xxxx`**), bug issues (**`BUG-####`**), decisions (**`DEC-xxxx`**), and tasks (**`T-xxx`**) by ID.
- Suggest next actions but do not execute them.
- If the question reveals a bug or feature idea, suggest running `/intake`.
- For **`docs/engineering/codebase-map.md`** bootstrap vs manual refresh, cite
  **US-0082 / DEC-0065**: primary lifecycle owner is **`/architecture`**
  (materializer: `python scripts/materialize_codebase_map.py --trigger architecture`);
  optional policy-gated refresh at **`/refresh-context`** when
  `CODEBASE_MAP_REFRESH_ON_ROLLOVER=1`; explicit/manual full pass remains
  **`/map-codebase`**. Deterministic diagnostics: `CODEBASE_MAP_MISSING`,
  `CODEBASE_MAP_BLOCKED:<subreason>` (see runbook **Codebase map bootstrap**).
- For first/new/broad intake policy questions, cite **US-0081 / DEC-0064**:
  complete-plan mapping (`plan_area_inventory`, `plan_area_coverage`,
  `coverage_complete`) is required, and persistence blocks on
  `INTAKE_PLAN_COVERAGE_MISSING` under umbrella `INTAKE_PERSISTENCE_BLOCKED`.

## Steps
1. Read minimal targeted sections first (narrow-read policy).
2. If unresolved, expand context in bounded steps following preferred read order.
3. Stop expanding as soon as confidence is sufficient.
4. Answer using project artifacts as the source of truth.
5. If the answer is not present in artifacts after bounded expansion, state that explicitly.
