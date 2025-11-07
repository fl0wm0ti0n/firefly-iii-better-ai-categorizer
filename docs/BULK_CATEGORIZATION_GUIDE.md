# Bulk Categorization

Run automatic categorization for many transactions at once.

## Where to find it
- UI side panel: Categorizer → Bulk Categorization

## Modes
- Process Uncategorized: only transactions without a category
- Process All: re-categorize all transactions (overwrites categories)

## How it works
1. Choose a mode (Uncategorized or All).
2. Start the batch. Progress and errors are tracked in real-time.
3. You can pause, resume, or cancel the batch.
4. Results are applied to Firefly III; failures are recorded for review.

## Precedence
The same pipeline is used as the webhook flow:
1. Category Mappings (custom rules)
2. Auto-Categorization (foreign/travel)
3. Word mappings (text replacement)
4. AI categorization

## Tips
- Enable "Skip Deposits" in General Settings if you only want to categorize withdrawals.
- Use Transaction Management to review and correct categories afterwards.


