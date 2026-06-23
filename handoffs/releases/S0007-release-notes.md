# S0007 Release Notes — US-0005 Admin UI Consolidation

**Release Date:** 2026-06-15  
**Sprint:** S0007  
**Story:** US-0005 (Admin UI Consolidation)  
**Orchestrator Run ID:** auto-20260614T161000Z-us0003  
**Release Marker:** release-20260615-us0005

## Summary

US-0005 consolidates the admin UI by merging three separate categorization panels (Bulk Categorization, Batch Jobs, Individual Jobs) into a single unified **Categorization** panel. The Test Webhook form moves from the Maintenance group into this panel. A new segmented scope control (Withdrawals / Deposits / Both) unifies transaction type selection across all run actions.

## What Changed

### Frontend (public/index.html)

- **Unified Panel**: Created `panel-categorization` with scope selector, run actions, Test Webhook form, and job monitor
- **Scope Control**: Added segmented radio pills (Withdrawals/Deposits/Both) with CSS styling
- **Sidebar Consolidation**: Reduced Categorizer group from 10 to 8 entries by replacing three separate panels with single "Categorization" entry
- **Auto-jump Removed**: Eliminated `__showPanel('panel-batch')` calls; replaced with toast notification
- **Stale Copy Removed**: Replaced "Check the individual jobs section below" with "See job monitor below"
- **Test Webhook Moved**: Removed from Maintenance group; now part of unified panel (collapsible form)

### Backend (src/App.js)

- **Scope Field Handling**: Added optional `scope` parameter to `#onProcessUncategorized`, `#onProcessAll`, `#onTestWebhook`
- **Filter Logic**:
  - `withdrawals`: Force skip deposits (only withdrawals processed)
  - `deposits`: Exclude withdrawals (only deposits processed)
  - `both`: Honor `autoConfig.skipDeposits` setting
  - `null` (absent): Existing behavior preserved (backward compatible)
- **Webhook Scope Mapping**: `withdrawals` → `withdrawal`, `deposits` → `deposit`, `both` → `withdrawal` (default)

### Documentation

- **User Guide**: Created `docs/user-guides/US-0005.md` with Purpose, Prerequisites, Usage Steps, Example, Limitations, Troubleshooting

## Acceptance Criteria

All 8 acceptance criteria met:

- ✅ AC-1: Sidebar consolidated (10 → 8 entries); panel-manual/batch/individual replaced by single "Categorization"
- ✅ AC-2: Unified panel provides Process Uncategorized, Process All, Test Webhook
- ✅ AC-3: Single scope control (Withdrawals/Deposits/Both) honors Skip Deposits
- ✅ AC-4: Integrated job monitor with batch + individual jobs, type badges, Socket.io updates, batch controls
- ✅ AC-5: Operator stays on unified panel; auto-jump removed; stale copy replaced
- ✅ AC-6: REST endpoints unchanged; scope field optional/additive
- ✅ AC-7: Side-panel nav groups (Categorizer/Special tools/Maintenance) and collapsible-section model preserved
- ✅ AC-8: docs/user-guides/US-0005.md documents consolidated workflow

## Architecture Decisions

- **DEC-0015**: Panel merge strategy (unified panel-categorization)
- **DEC-0016**: Scope control approach (segmented control)
- **DEC-0017**: Test Webhook integration (move to unified panel)

## Test Results

```
# tests 18
# pass 18
# fail 0
# cancelled 0
# skipped 0
# duration_ms 690.107895
# exit code 0
```

All tests pass. No regressions.

## Tasks Completed

All 8 tasks completed:

- **T-0032** ✅ Create unified panel-categorization DOM structure
- **T-0033** ✅ Move Test Webhook form into unified panel; remove test-type select; make form collapsible
- **T-0034** ✅ Update setupSidePanel() sidebar entries
- **T-0035** ✅ Remove auto-jump code; replace stale copy
- **T-0036** ✅ Add CSS for segmented scope control
- **T-0037** ✅ Update Process button handlers to send scope
- **T-0038** ✅ Update Webhook handler to inherit scope
- **T-0039** ✅ Backend scope field handling in App.js

## Backward Compatibility

All REST endpoints remain backward compatible:

- `POST /api/process-uncategorized` — accepts optional `scope` field
- `POST /api/process-all` — accepts optional `scope` field
- `POST /api/test-webhook` — accepts optional `scope` field (maps to `transaction_type`)

Existing API callers that do not send `scope` continue to work with existing behavior.

## Known Limitations

1. **No automated UI tests** — Manual regression testing required
2. **Scope is UI-only** — Direct API calls remain backward compatible
3. **Test Webhook defaults** — When scope is "Both", defaults to "withdrawal" for single test
4. **Skip Deposits interaction** — When scope is "Both", honors General Settings
5. **No per-job scope override** — Each bulk run uses panel's current scope
6. **Job history lost on restart** — In-memory job history (existing limitation)

## Verification

- **QA**: PASS (2026-06-15) — All AC verified, tests 18/18 pass
- **UAT**: PASS (2026-06-15) — 4 user workflow scenarios validated, no regressions
- **Release**: PASS (2026-06-15) — All gates passed

## Files Modified

### Frontend
- `public/index.html` — Unified panel structure, scope selector CSS, sidebar navigation, event handlers

### Backend
- `src/App.js` — Scope parameter handling in #processUncategorizedTransactions, #processAllTransactions, #onTestWebhook

### Documentation
- `docs/user-guides/US-0005.md` — Consolidated workflow documentation (AC-8)

## Deployment Notes

- No database migrations required
- No environment variable changes required
- No dependency updates required
- Existing deployments can upgrade without configuration changes
- Scope field is optional; existing API integrations continue to work

## Rollback Plan

If issues arise, rollback is straightforward:

1. Revert `public/index.html` to previous version
2. Revert `src/App.js` to previous version
3. Remove `docs/user-guides/US-0005.md`
4. Restart categorizer service

No data migration or cleanup required.

## References

- **Architecture**: `docs/engineering/architecture.md` (# US-0005)
- **Decisions**: `decisions/DEC-0015.md`, `decisions/DEC-0016.md`, `decisions/DEC-0017.md`
- **Research**: `docs/engineering/research.md` (R-0022)
- **Acceptance**: `docs/product/acceptance.md` (US-0005 AC-1–AC-8)
- **Sprint**: `sprints/S0007/summary.md`
- **QA Findings**: `sprints/S0007/qa-findings.md`
- **UAT Findings**: `sprints/S0007/uat-findings.md`
- **User Guide**: `docs/user-guides/US-0005.md`

## Next Steps

- **refresh-context** — State compaction and drain-advance preparation
- **Backlog**: US-0005 marked DONE; next OPEN story (if any) will be picked up

---

**Release Status:** ✅ PASS — Ready for deployment
