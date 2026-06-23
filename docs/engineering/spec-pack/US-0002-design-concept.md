# Design Concept — US-0002 Product and user documentation alignment

## Summary

Align operator and maintainer documentation with shipped categorizer behavior through
surgical doc edits, a reference documentation map user guide, and validator-green
README coverage — no runtime or API changes.

## Goals

- Eliminate R-0009 drift in `docs/CODEBASE_ANALYSIS.md` (gpt-4o-mini, DEC-0001 pipeline, API v1.1.0, test harness).
- Provide operators a single navigation hub at `docs/user-guides/US-0002.md` (AC-3).
- Pass `validate_readme_feature_coverage.py --no-template-parity --report` when US-0002 completes (AC-2, DEC-0007).
- Keep `docs/product/vision.md` and README pipeline terminology consistent (AC-4).

## Non-goals

- Marketing content, translations, or new product features.
- Materializing full `template/` tree or disabling README coverage enforce flags.
- Duplicating README feature prose or pipeline diagrams in the user guide.
- Runtime/API code changes (`src/`, `public/`).

## Key decisions

- **DEC-0007** — Brownfield validator: `--no-template-parity` + minimal `scripts/installer.py` vendoring.
- **DEC-0008** — Surgical CODEBASE_ANALYSIS edits; reference-map user guide; minimal vision cross-ref for AC-4.
- **R-0011** — Section-by-section refresh plan (five drift rows).
- **R-0012** — USER_GUIDE_MODE schema mapping for documentation map.
- **R-0013** — README `Other useful capabilities` H2 + dev `Quality gates` traceability before DONE.
