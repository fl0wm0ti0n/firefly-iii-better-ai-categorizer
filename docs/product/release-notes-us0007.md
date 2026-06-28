# Release Notes — US-0007: Keyword Mapping Direct-Assign Mode

## Feature
Keyword mappings now support a "direct assign" toggle. When enabled, transactions matching the keyword skip the OpenAI classification step and are assigned the mapping's target category directly — faster, cheaper, and fully deterministic.

## How to use
1. Open the admin UI and navigate to **Keyword Mappings**.
2. Edit or create a mapping.
3. Toggle **Direct assign** on.
4. Save. Matching transactions will now be categorized without an LLM call.

## Technical notes
- Pipeline placement: direct-assign check runs before the OpenAI classification step, short-circuiting the pipeline on match.
- Related decisions: **DEC-0021** (direct-assign field model), **DEC-0022** (pipeline short-circuit semantics).
- No breaking changes.
