# Summary — Quick Task Q0001

Renamed and reordered the Categorizer sidebar in `public/index.html` so that the primary feature is clearly labeled **Auto-Categorization**.

## Changes

- Renamed `panel-categorization` heading from **Categorization** to **Auto-Categorization**.
- Renamed the secondary feature heading from **Auto-Categorization (Foreign/Travel Detection)** to **Foreign/Travel Detection**.
- Merged the previous **General Settings** section (`Skip Deposits`) into `panel-categorization`; removed its separate sidebar entry.
- Updated the `setupSidePanel()` registry so the Categorizer group now appears in this order:
  1. Auto-Categorization
  2. Keyword → Category Mappings
  3. Account → Category Mappings
  4. Word Mappings & Failed
  5. Transaction Management
  6. Pending Reviews
  7. Foreign/Travel Detection
- Adjusted the small helper copy from "Honors 'Skip Deposits' from General Settings" to "Honors 'Skip Deposits' setting".

## Verification

- `bash tests/run-tests.sh` passed: 18/18 tests, exit code 0.
- No backend API contracts were changed.
