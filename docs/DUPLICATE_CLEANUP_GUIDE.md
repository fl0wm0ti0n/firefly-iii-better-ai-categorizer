# Duplicate Cleanup

Find and safely remove duplicate transactions.

## Where to find it
- UI side panel: Maintenance → Duplicate cleanup

## What counts as a duplicate
- Grouped by: transaction type + date (YYYY-MM-DD) + absolute amount + normalized payee name.

## Usage
1. (Optional) Set Tag and/or Date range to scope the search.
2. Click "Find duplicates".
3. Review groups. Originals/corrections are labeled and cannot be selected by default.
4. Use "Select group" or pick individual rows.
5. Keep-one safeguard (default): leaves one item unselected per group to avoid deleting everything.
6. Click "Delete selected" to remove checked transactions.

## Safeguards
- Originals tagged `already-extracted-original` and correction clones (tag `value-correction-clone`) are disabled by default.
- "Keep one per group" prevents accidental full-group deletion.

## Notes
- You can uncheck the safeguard if you intentionally want to remove all duplicates in a group.
- Deletions are permanent; ensure you have a backup if needed.


