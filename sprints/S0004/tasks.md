# Tasks — Sprint S0004 (US-0002)

| ID | Status | Title | Files | Acceptance mapping |
|----|--------|-------|-------|-------------------|
| T-0012 | done | Vendor minimal `scripts/installer.py` stub | `scripts/installer.py` | AC-2 prerequisite; DEC-0007 |
| T-0013 | done | CODEBASE_ANALYSIS surgical refresh | `docs/CODEBASE_ANALYSIS.md` | AC-1 (R-0011) |
| T-0014 | done | Operator documentation map | `docs/user-guides/US-0002.md` | AC-3 (R-0012) |
| T-0015 | done | README/dev coverage lines | `its_magic/README.md`, `docs/developer/README.md` | AC-2 post-DONE (R-0013) |
| T-0016 | done | Vision terminology sync | `docs/product/vision.md` | AC-4 |
| T-0017 | done | Validator `--report` green + runbook flag | `docs/engineering/runbook.md` | AC-2 (DEC-0007) |

## T-0012 — Vendor minimal `scripts/installer.py` stub

**Goal:** Unblock AC-2 canonical validator command per **DEC-0007** and **R-0010**.

**Requirements:**

1. Create `scripts/installer.py` with `merge_scratchpad_layers(repo_root)` function.
2. Read `.cursor/scratchpad.md`; merge `.cursor/scratchpad.local.md` overlay when present (DEC-0055).
3. Return `(merged_dict, paths)` tuple compatible with `validate_readme_feature_coverage.py`.
4. Implement **only** scratchpad merge — no kit install logic.
5. Verify `PYTHONPATH=scripts python3 -c "import installer"` succeeds.

**Done when:** Validator script can import `installer` without `ModuleNotFoundError`.

## T-0013 — CODEBASE_ANALYSIS surgical refresh

**Goal:** Fix five R-0009 drift rows per **R-0011** without full rewrite.

**Requirements:**

1. § OpenAiService.js — replace GPT-3.5-turbo-instruct with **gpt-4o-mini**; note `OPENAI_MODEL`.
2. § Multi-Stage Categorization — 5-step DEC-0001 order with **Account → Category Mappings** as step 1.
3. § Backend Components — add bullets for `AccountCategoryMappingService`, `CategoryMappingService`, `WordMappingService`, `AutoCategorizationService`.
4. § App.js API endpoints — add `GET /api/version` (`apiVersion: 1.1.0`).
5. New § Quality / test harness — cross-ref `TEST_COMMAND`, `tests/run-tests.sh`, `node:test` precedence tests.
6. Cross-link README § Categorization Process Flow; do not duplicate ASCII diagram.

**Done when:** Maintainer can trace pipeline order from analysis doc to README without contradictions.

## T-0014 — Operator documentation map (`US-0002.md`)

**Goal:** Reference/navigation layer per **R-0012** (Diátaxis map pattern).

**Requirements:**

1. Create `docs/user-guides/US-0002.md` with six required H2 sections:
   Purpose, Prerequisites, Usage steps, Example, Limitations, Troubleshooting.
2. Usage steps = lookup workflow (identify task → open linked guide → cross-check gates).
3. Include core link table from architecture # US-0002 (vision § Documentation UX).
4. Purpose states "navigation map, not feature manual".
5. Anti-patterns: no README Key Features copy, no pipeline ASCII, no DEC-0001 tutorial steps.
6. Validate relative links resolve.

**Done when:** Guide satisfies USER_GUIDE_MODE schema and AC-3.

## T-0015 — README/dev coverage lines (post-DONE predicate)

**Goal:** Satisfy R-0013 coverage predicate before US-0002 DONE flip.

**Requirements:**

1. Add `## Other useful capabilities` H2 to `its_magic/README.md` with bullet:
   **US-0002** — operator documentation map; see `docs/user-guides/US-0002.md`.
2. Add to `docs/developer/README.md` § Quality gates:
   `- **US-0002** — operator documentation map; see docs/user-guides/US-0002.md`.
3. Do not relocate content to unrelated H2 sections (R-0013 affinity manifest).

**Done when:** Simulated DONE probe would show `coverage_missing: []` (verified in T-0017).

## T-0016 — Vision terminology sync (AC-4)

**Goal:** Minimal cross-ref and terminology pass per **DEC-0008**.

**Requirements:**

1. Update `docs/product/vision.md` pipeline prose: **Account → Category Mappings** as step 1.
2. Ensure 5-step order matches README § Categorization Process Flow (DEC-0001).
3. Optional: one-line cross-ref in § Documentation alignment → README pipeline section.
4. Verify only (no edit expected): runbook `TEST_COMMAND` matches vision § Test harness.

**Done when:** Vision and README categorization pipeline descriptions are consistent (AC-4).

## T-0017 — Validator `--report` green + runbook flag

**Goal:** AC-2 release gate — canonical script exits 0.

**Requirements:**

1. Update `docs/engineering/runbook.md` canonical command:
   `python scripts/validate_readme_feature_coverage.py --no-template-parity --report`.
2. Add brownfield note mirroring `validate_doc_profile.py --no-template-parity` precedent.
3. Run command locally; confirm exit 0 and `coverage_missing: []`.
4. Optional: `python scripts/validate_readme_feature_coverage.py --self-test` passes.

**Done when:** `python scripts/validate_readme_feature_coverage.py --no-template-parity --report` exits 0.
