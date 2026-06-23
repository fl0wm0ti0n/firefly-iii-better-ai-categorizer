# Technical Specification — US-0002 Product and user documentation alignment

## Overview

Documentation-only delivery slice. All artifacts are Markdown in-repo; validation is
script-driven (`validate_readme_feature_coverage.py`, `validate_user_guide.py` at release).
Architecture: `docs/engineering/architecture.md` (# US-0002). User guide target:
`docs/user-guides/US-0002.md`.

## Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| Maintainer analysis refresh | `docs/CODEBASE_ANALYSIS.md` | AC-1: align with DEC-0001, gpt-4o-mini, API v1.1.0, test harness (R-0011) |
| Operator documentation map | `docs/user-guides/US-0002.md` | AC-3: link table + six required sections (R-0012) |
| README coverage surfaces | `its_magic/README.md`, `docs/developer/README.md` | AC-2 post-DONE: R-0013 affinity H2 + traceability lines |
| Vision terminology pass | `docs/product/vision.md` | AC-4: Account → Category Mappings; optional README pipeline cross-ref |
| Validator bootstrap | `scripts/installer.py` (new, minimal) | DEC-0007: `merge_scratchpad_layers` for canonical script entry |
| Coverage validator | `scripts/validate_readme_feature_coverage.py` | AC-2: `--no-template-parity --report` exit 0 |
| Runbook delta | `docs/engineering/runbook.md` | Document `--no-template-parity` on canonical validator command |

## Interfaces

### AC-1 — CODEBASE_ANALYSIS edit contract (R-0011)

| # | Target | Action |
|---|--------|--------|
| 1 | § OpenAiService.js | `gpt-4o-mini` default; `OPENAI_MODEL` env |
| 2 | § Multi-Stage Categorization | 5-step DEC-0001 order; **Account → Category Mappings** step 1 |
| 3 | § Backend Components | Bullets for four mapping services |
| 4 | § App.js API endpoints | `GET /api/version` (`apiVersion: 1.1.0`); enrich/refresh |
| 5 | New § Quality / test harness | Cross-ref `TEST_COMMAND`, `tests/run-tests.sh` |

### AC-3 — User guide schema (R-0012)

Required H2 sections per `docs/user-guides/README.md`: Purpose, Prerequisites,
Usage steps (lookup workflow), Example (scenario table), Limitations, Troubleshooting.
Core link table copied from vision § Documentation UX.

### AC-2 — Validator invocation (DEC-0007)

```bash
python scripts/validate_readme_feature_coverage.py --no-template-parity --report
```

Expect `coverage_missing: []` after R-0013 lines and US-0002 guide exist; flip backlog DONE at release only.

### AC-4 — Vision/README consistency

- Terminology: **Account → Category Mappings** (not generic "Category Mappings" as step 1).
- Optional: one-line cross-ref in vision § Documentation alignment → README § Categorization Process Flow.
- Doc map satisfies "where to look" without vision rewrite.

## Non-functional

- **Docs-as-code:** All edits in git; no external wiki.
- **Maintenance:** Link to canonical surfaces; avoid duplicating README diagrams.
- **Gates:** `README_FEATURE_COVERAGE_ENFORCE=1`, `PROJECT_README_ENFORCE=1`, `USER_GUIDE_MODE=1` active.
- **Scope guard:** No changes under `src/`, `public/`, or `package.json` dependencies.
