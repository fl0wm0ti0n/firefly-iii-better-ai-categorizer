# Release S0010

## Summary
- **Feature**: Keyword mapping direct-assign mode (US-0007)
- **User-visible**: Yes — admin UI now has "Direct assign" toggle per keyword mapping
- **Migration required**: No (additive field, default `false`)
- **Backward compatibility**: Full (existing mappings work unchanged)
- **Test coverage**: 21/21 regression green (18 existing + 3 new direct-assign cases)

## What changed
New `directAssign` boolean field on keyword mappings. When enabled, matching keywords bypass OpenAI and directly assign the target category.

## Rollout
No environment variable changes. No database migration. Safe to deploy immediately.
