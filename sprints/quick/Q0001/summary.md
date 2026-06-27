# Q0001 Summary — Fix Transaction Scope selector & remove Skip Deposits

## Problem
The Transaction Scope segmented control (Withdrawals / Deposits / Both) had no visual feedback when clicked. The CSS relied on an empty `:checked + span {}` rule (`public/index.html:973-976`), and the `.selected` class was never toggled by JS. The operator saw the scope buttons as frozen/inactive.

Additionally, the legacy "Skip Deposits from categorization" checkbox was redundant with the scope selector — selecting "Withdrawals" already skips deposits, and "Both" now processes everything.

## Changes Made

### 1. Scope Selector Visual Fix (public/index.html)
- Added JS `change` event listener on all `input[name="categorization-scope"]` radios
- On change: removes `.selected` from all `.scope-pill` elements, then adds `.selected` to the clicked pill's parent `<label>`
- This implements option (b) from the bug report: "JS class toggle for broader compat"

### 2. Removed "Skip Deposits" UI
- Removed `<input type="checkbox" id="auto-skip-deposits">` and its `<label>`, helper text, and separator
- Removed `const autoSkipDeposits = document.getElementById('auto-skip-deposits');` (line 1585)
- Removed `skipDeposits` from `saveGeneralSettings()` config object (line 2996)
- Removed `autoSkipDeposits.checked = config.skipDeposits;` from `loadAutoCategorizationConfig()` (line 3028)
- Removed `skipDeposits: autoSkipDeposits.checked` from `saveAutoCategorizationConfig()` (line 3044)
- Removed `btn-save-general-settings` button and its click handler (it only saved skipDeposits)
- Updated scope selector `<small>` text: removed "Honors 'Skip Deposits' setting when scope is 'Both'"

### 3. Backend Cleanup (src/App.js, src/AutoCategorizationService.js)
- Removed `autoConfig.skipDeposits` logic from `#processUncategorizedTransactions` (scope now drives filtering)
- Removed `autoConfig.skipDeposits` logic from `#processAllTransactions` (scope now drives filtering)
- Removed early-exit `skipDeposits` check from `#onWebhook` handler
- Changed `AutoCategorizationService` default `skipDeposits: true` → `false`
- Marked `autoCategorize()` deposit skip logic as "legacy" (kept for backward compat, but no longer driven by UI)

## Behavior After Fix
| Scope Selection | Behavior |
|-----------------|----------|
| Withdrawals     | Only withdrawal transactions processed (deposits filtered out) |
| Deposits        | Only deposit transactions processed (withdrawals filtered out) |
| Both            | ALL transactions processed — no automatic skip |

Operator gets immediate visual feedback (blue highlight) on the selected scope pill.

## Files Modified
- `public/index.html` — UI + JS
- `src/App.js` — removed skipDeposits batch + webhook logic
- `src/AutoCategorizationService.js` — default changed, legacy comment added

## Acceptance
- [x] Scope pills visually toggle `.selected` class on click/change
- [x] "Skip Deposits" checkbox removed from UI
- [x] Backend no longer reads skipDeposits config for batch/webhook paths
- [x] Scope = "Both" processes all transactions without filtering
- [x] Scope = "Withdrawals" still filters deposits (existing logic preserved)
- [x] Scope = "Deposits" still filters withdrawals (existing logic preserved)
