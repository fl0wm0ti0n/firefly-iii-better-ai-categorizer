# Release Notes — US-0008: Account → Category Mappings Bulk Assign

## Feature

The Account → Category Mappings panel now supports bulk operations. Instead of assigning categories one account at a time, you can now search, select multiple accounts, and assign a single Firefly category to all of them in one action.

## How to use

1. Open the admin UI and navigate to **Account Mappings**.
2. In the new **Bulk assign** panel:
   - Type in the search box to filter accounts by name (live filtering).
   - Check the accounts you want to assign. Use "Select all" / "Deselect all" to quickly work with the full filtered list.
   - Enable "Show mapped" to include already-mapped accounts (they appear with a yellow highlight and a MAPPED badge showing their current category).
3. Pick the target Firefly category from the dropdown.
4. Click **Bulk assign**. You'll see a summary: created, updated, skipped, and any errors.

Already-mapped accounts are highlighted in yellow with a visible MAPPED badge, so you always know what's already assigned.

## What happens behind the scenes

- **New accounts**: mappings are created immediately.
- **Already-mapped accounts (same category)**: skipped — no duplicate entries.
- **Already-mapped accounts (different category)**: updated to the new category.
- The save is atomic: one round-trip for the entire batch.
- No category validation against Firefly — you can assign any category string.

## Technical notes

- Endpoint: `POST /api/account-category-mappings/bulk`
- Upsert semantics per DEC-0023: skip if same category, update if different, create if new.
- Field whitelist on incoming data prevents injection (only `accountId`, `accountName`, `accountType`, `targetCategory` accepted).
- Single coalesced save after processing all items.
- Test coverage: 5 new tests covering happy path, duplicate skip, upsert, unknown category, and partial failure.
- Regression suite: 26/26 tests pass.

## Compatibility

- No database migration required.
- No breaking changes to existing endpoints.
- Existing single-account mapping functionality fully preserved.
- Backward compatible with all existing mappings data.
