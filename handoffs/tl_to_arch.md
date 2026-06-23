# Tech Lead → Architecture Handoff

## US-0005 — Admin UI consolidation (2026-06-15T22:30:00+02:00)

**Story:** US-0005 — Admin UI consolidation (run, monitor, expense/income scope)
**Research phase:** PASS — panel merge strategy confirmed; Socket.io routing validated; scope control approach defined

---

## Panel merge recommendation

**Decision:** Create unified `panel-categorization` replacing `panel-manual`, `panel-batch`, `panel-individual`. Move Test Webhook form into unified panel (AC-2). Remove Maintenance group entry for Test Webhook.

**Structure:**
```
panel-categorization
├── Scope selector (segmented control: Withdrawals / Deposits / Both)
├── Run actions
│   ├── Process Uncategorized button
│   ├── Process All button
│   └── Test Webhook form (description, destination; type from scope)
├── Progress display (shared)
└── Job monitor
    ├── Batch jobs sub-container (id="batch-mount")
    └── Individual jobs sub-container (id="mount")
```

**Sidebar impact:** Categorizer group 10 → 8 entries. panel-reviews (US-0004) preserved as separate entry.

**DOM mount points:** Keep `mount` and `batch-mount` IDs unchanged. Socket.io handlers already route to correct containers — no handler changes needed.

---

## Socket.io routing recommendation

**Current state (confirmed):**
- `job created` / `job updated` → `mount` (individual jobs)
- `batch job created` / `batch job updated` → `batch-mount` (batch jobs)

**Recommendation:** No changes to Socket.io handlers. Move both `<div>` containers into unified panel. Render functions (`renderJobs`, `renderBatchJobs`) continue targeting their respective containers. Zero backend changes required.

**AC-6 compliance:** REST endpoints unchanged. Socket.io events unchanged. Only DOM layout changes.

---

## Scope control recommendation

**Approach:** Segmented control (radio group styled as pills) with three options: Withdrawals / Deposits / Both.

**Behavior:**
- Withdrawals → process withdrawals only
- Deposits → process deposits only
- Both → process both, BUT honor `auto-skip-deposits` from General Settings

**Test Webhook integration:** Remove `test-type` select. Webhook inherits scope from panel selector. When scope is "Both", default to "withdrawal" for single test.

**REST contract:** Add optional `scope` field to POST body. Existing callers unaffected (backward compatible). AC-6 satisfied.

---

## Auto-jump and stale copy

**Auto-jump removal:** Lines 1551, 1573 — remove `window.__showPanel('panel-batch')`. Operator stays on unified panel.

**Stale copy removal:** Line 1617 — remove "Check the individual jobs section below." Replace with "See job monitor below."

---

## Risks and dependencies for architecture phase

| Risk | Severity | Mitigation |
|------|----------|------------|
| Monolithic HTML refactor (~5.9k LOC, no UI tests) | High | Manual regression checklist; test batch controls, webhook, scope selector |
| Batch control regression (pause/resume/cancel) | Medium | Preserve render functions unchanged; only move DOM containers |
| Scope control vs REST contract (AC-6) | Medium | Make `scope` field additive/optional; existing callers unaffected |
| Test Webhook type removal | Low | Inherit from scope; document in user guide (US-0005.md) |

**Dependencies:**
- None (US-0005 has no `depends_on`)
- Adjacent: US-0004 panel-reviews must remain reachable (confirmed: separate sidebar entry)

**SPEC_PACK_MODE=1:** Generate CRS at `docs/engineering/spec-pack/US-0005-crs.md`.

**USER_GUIDE_MODE=1:** Generate user guide at `docs/user-guides/US-0005.md` (AC-8).

---

## Handoff

Proceed to **`/architecture`** for US-0005.
