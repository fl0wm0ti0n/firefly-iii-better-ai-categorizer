# Test Report

**Generated:** 2026-06-13T12:52:41Z  
**Command:** `bash tests/run-tests.sh`  
**Runner:** `node --test tests/`  
**Platform:** linux  
**Exit code:** 0

## Summary

| Metric | Value |
|--------|-------|
| Total | 4 |
| Pass | 4 |
| Fail | 0 |
| Skipped | 0 |

## Subtests

| Test | Result | Duration |
|------|--------|----------|
| case-1-account-wins | pass | ~1ms |
| case-2-auto-cat-wins | pass | ~1ms |
| case-3-ai-wins | pass | ~1ms |
| case-4-account-beats-ai | pass | ~0.5ms |

## US-0071 metadata guard (harness rows)

| Row | Result | Notes |
|-----|--------|-------|
| positive | skipped | `scripts/check-user-visible-metadata.py` absent |
| leak detection | skipped | checker absent |
| idempotence | skipped | checker absent |

## Evidence refs

- `tests/resolveCategory.test.js`
- `tests/run-tests.sh`
- Release re-run output: `/tmp/release-run-tests.out`
