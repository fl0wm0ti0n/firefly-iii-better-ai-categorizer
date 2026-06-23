# Decisions

## Current context pack

- Latest released work: **US-0006** Agent-driven local Categorizer launch shipped S0008 (2026-06-22); backlog **DONE**.
  **DEC-0018** (standalone compose with explicit `-f`), **DEC-0019** (schema_version 1 additive extensions) validated.
- Prior segment: **US-0005** Admin UI consolidation S0007 (2026-06-15); **DEC-0015** + **DEC-0016** + **DEC-0017** validated.
- Prior segment: **US-0004** Account history suggestions S0006 (2026-06-14); **DEC-0011** + **DEC-0012** + **DEC-0013** + **DEC-0014** validated.
- Prior segment: **US-0003** OpenAI Structured Outputs migration S0005 (2026-06-14); **DEC-0009** + **DEC-0010** validated.
- Prior segment: **US-0002** docs alignment S0004 (2026-06-14); **DEC-0007** + **DEC-0008** validated.
- Prior segment: **US-0001** test harness S0003 (2026-06-13); **DEC-0006** validated; R6 resolved.
- Prior segment: **BUG-0001** fix S0002; backlog OPEN pending operator AC-4.
- All stories US-0001 through US-0005 DONE. No more OPEN stories in backlog.
- Architecture baseline 2026-06-12; `# BUG-0001` + `# US-0001` deltas 2026-06-13; `# US-0002`
  delta 2026-06-14; `# US-0003` delta 2026-06-14; `# US-0004` delta 2026-06-14; `# US-0005` delta 2026-06-15.

## Compact decision index (bounded summaries)

- **DEC-0001** — Unified `#resolveCategory` pipeline for webhook, bulk, and test paths (Accepted).
- **DEC-0002** — Production deploy via parent Firefly Docker stack, not repo-local compose (Accepted).
- **DEC-0003** — Defer OpenAI Structured Outputs migration until test harness exists (Accepted; implemented by US-0003).
- **DEC-0004** — Retain JSON file persistence under `data/`; no database (Accepted).
- **DEC-0005** — BUG-0001: scoped `getCategories()` fix; defer shared Firefly fetch helper (Accepted).
- **DEC-0006** — US-0001: injectable-deps factory (Option A) over pipeline extraction (Accepted).
- **DEC-0007** — US-0002: brownfield README coverage validator uses `--no-template-parity` + minimal installer vendoring (Accepted; validated S0004).
- **DEC-0008** — US-0002: surgical CODEBASE_ANALYSIS refresh, reference-map user guide, minimal vision cross-ref (Accepted; validated S0004).
- **DEC-0009** — US-0003: injectable OpenAI client factory (`createForTest`) for unit tests (Accepted).
- **DEC-0010** — US-0003: partial v4 migration — Structured Outputs on `classify()` only; siblings v4 call-path + legacy parse (Accepted).
- **DEC-0011** — US-0004: History dominance calculation (≥80% threshold per account) (Accepted; validated S0006).
- **DEC-0012** — US-0004: AI vs history comparison with confidence scoring (Accepted; validated S0006).
- **DEC-0013** — US-0004: Pending-review persistence (`data/pending-category-reviews.json`) (Accepted; validated S0006).
- **DEC-0014** — US-0004: REST API + UI review panel with explicit Accept/Reject (no silent auto-assign) (Accepted; validated S0006).
- **DEC-0015** — US-0005: Panel merge strategy (unified panel-categorization) (Accepted; validated S0007).
- **DEC-0016** — US-0005: Scope control approach (segmented control) (Accepted; validated S0007).
- **DEC-0017** — US-0005: Test Webhook integration (move to unified panel) (Accepted; validated S0007).
- **DEC-0018** — US-0006: Standalone `docker-compose.local.yml` with explicit `-f` flag; no auto-merge with production stack (Accepted; validated S0008).
- **DEC-0019** — US-0006: Extend `schema_version: 1` with additive AC-1 fields; no version bump (Accepted; validated S0008).
- **DEC-0020** — BUG-0002: Stale-image remediation + defensive fetch handling (Accepted).

## Canonical full records

- Full records live in `decisions/DEC-xxxx.md`.
- DEC-0001 … DEC-0004 accepted during architecture baseline pass.
- DEC-0005 accepted during BUG-0001 research (2026-06-13).
- DEC-0006 accepted during US-0001 research (2026-06-13).
- DEC-0007 accepted during US-0002 research (2026-06-14).
- DEC-0008 accepted during US-0002 architecture (2026-06-14).
- DEC-0009 accepted during US-0003 architecture (2026-06-14).
- DEC-0010 accepted during US-0003 architecture (2026-06-14).
- DEC-0011 accepted during US-0004 architecture (2026-06-14).
- DEC-0012 accepted during US-0004 architecture (2026-06-14).
- DEC-0013 accepted during US-0004 architecture (2026-06-14).
- DEC-0014 accepted during US-0004 architecture (2026-06-14).
- DEC-0015 accepted during US-0005 architecture (2026-06-15).
- DEC-0016 accepted during US-0005 architecture (2026-06-15).
- DEC-0017 accepted during US-0005 architecture (2026-06-15).
- DEC-0018 accepted during US-0006 architecture (2026-06-22).
- DEC-0019 accepted during US-0006 architecture (2026-06-22).
- DEC-0020 accepted during BUG-0002 architecture (2026-06-23).
