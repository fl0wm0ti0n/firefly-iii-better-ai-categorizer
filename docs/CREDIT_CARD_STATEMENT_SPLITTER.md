# Credit Card Statement Splitter (CSV/PDF)

The Credit Card Statement Splitter converts a single credit-card settlement into multiple child transactions that match the original amount.

## Where to find it
- UI side panel: Special tools → Credit Card Statement Splitter

## Supported inputs
- CSV exported statements
- PDF statements (deterministic parser)

## How it works
1. Pick the original Firefly III transaction (the monthly card settlement).
2. Upload the CSV/PDF.
3. The preview table shows rows with: date, payee, description, type (withdrawal/deposit), amount.
4. Edit inline as needed.
5. Recalculate to verify the sum matches the original.
6. Apply to create child transactions and a correcting clone.

## Key features
- Anchor-based PDF parsing for robust amount/date/description pairing
- Handles fee lines and settlement markers.
- Direction inference for deposits vs withdrawals (e.g., "Abbuchung Kartenabrechnung").
- Tagging of created transactions and original (e.g., `already-extracted-original`).

## Tips
- Use the batch mode for multiple statements; fix mismatches inline.
- If the original was already processed, re-apply is blocked unless forced.


