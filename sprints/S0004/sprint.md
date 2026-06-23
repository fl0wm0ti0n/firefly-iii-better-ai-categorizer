# Sprint S0004 — US-0002

ID: S0004  
Work item: US-0002  
Orchestrator run: `auto-20260613T125508Z-us0002`

## Goal

Product and user documentation alignment — docs-only vertical slice with no
runtime/API changes. per **DEC-0007** (validator brownfield policy), **DEC-0008**
(surgical refresh + reference-map guide + minimal vision sync), and research
**R-0010–R-0013**.

**Unblocks:** US-0003 (docs gates green); operator trust in doc surfaces before AI SDK migration.

## Scope

| In scope | Out of scope |
|----------|--------------|
| Surgical `docs/CODEBASE_ANALYSIS.md` refresh (R-0011) | Marketing, translations |
| `docs/user-guides/US-0002.md` operator documentation map (R-0012) | Runtime/API code (`src/`, `public/`) |
| README feature coverage green with `--no-template-parity` (DEC-0007, R-0013) | Full `template/` materialization |
| Vision/README pipeline terminology consistency (AC-4) | Duplicating README feature prose in user guide |
| Minimal `scripts/installer.py` stub (DEC-0007 prerequisite) | Lib-direct audit as AC-2 substitute |

## Tasks

| ID | Title | Required |
|----|-------|----------|
| T-0012 | Vendor minimal `scripts/installer.py` stub | Yes |
| T-0013 | CODEBASE_ANALYSIS surgical refresh | Yes |
| T-0014 | Operator documentation map (`US-0002.md`) | Yes |
| T-0015 | README/dev coverage lines (post-DONE predicate) | Yes |
| T-0016 | Vision terminology sync (AC-4) | Yes |
| T-0017 | Validator `--report` green + runbook flag | Yes |

**Task count:** 6 required (under `SPRINT_MAX_TASKS=12`; no split).

## Risks

- **D1:** Installer stub must implement `merge_scratchpad_layers` per DEC-0055 only.
- **D2:** Release gate FAIL if US-0002 DONE flipped before R-0013 coverage lines land.
- **D3:** CODEBASE_ANALYSIS may re-drift — cross-link runbook gates in test-harness subsection.
- **D4:** Doc map link rot — validate section anchors at execute.
- **D5:** Add `## Other useful capabilities` H2 per R-0013 — do not relocate content.
- **D6:** Document `--no-template-parity` in runbook alongside `validate_doc_profile` note.

## Definition of Done

- All US-0002 acceptance rows (AC-1 through AC-4) covered by tasks T-0012–T-0017.
- `python scripts/validate_readme_feature_coverage.py --no-template-parity --report` exits 0.
- `docs/CODEBASE_ANALYSIS.md` reflects gpt-4o-mini, 5-step pipeline, mapping services, API v1.1.0, test harness.
- `docs/user-guides/US-0002.md` exists with six required schema sections and core link table.
- Vision and README pipeline terminology consistent (Account → Category Mappings as step 1).
- `/plan-verify` coverage recorded in `plan-verify.json` (next phase).

## References

- `docs/engineering/architecture.md` (# US-0002)
- `decisions/DEC-0007.md`, `decisions/DEC-0008.md`
- `docs/engineering/research.md` (R-0010–R-0013)
- `docs/product/acceptance.md` (US-0002 AC-1–AC-4)
- `docs/engineering/spec-pack/US-0002-crs.md`
- `handoffs/po_to_tl.md` (discovery operator map)
