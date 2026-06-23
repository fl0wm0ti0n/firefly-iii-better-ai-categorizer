# Release Notes (Legacy Compatibility Pointer)

This file remains backward-compatible for workflows that read
`handoffs/release_notes.md` as the latest release summary.

Canonical sprint history now lives under:
- `handoffs/releases/Sxxxx-release-notes.md`

Canonical queue state now lives under:
- `handoffs/release_queue.md`

---

## Latest finalized release pointer

- **Latest released sprint:** `S0005`
- **Latest canonical notes:** `handoffs/releases/S0005-release-notes.md`
- **Latest release date:** 2026-06-14
- **Latest release work item:** US-0003

## Unreleased queue visibility

No entries with `status=unreleased` or `status=blocked` after S0004 finalization.
Check `handoffs/release_queue.md` for full queue history.

## Latest operator summary (Run/Connect/Verify)

- **Start command:** `bash tests/run-tests.sh`
- **Test expectation:** 9/9 pass (5 openAiService + 4 resolveCategory), exit 0
- **Endpoint + port:** existing (3000); no new endpoints
- **Verification steps:** Tests 9/9; `classify()` uses `json_schema` with `strict: true`; 429 retry chain intact; `OPENAI_MODEL` env preserved
- **Credentials source refs (sanitized):** `OPENAI_API_KEY`, `OPENAI_MODEL` (optional)
- **Known issues:** BUG-0001 AC-4 operator PAT UAT deferred — see `handoffs/releases/S0002-release-notes.md`

Full details: `handoffs/releases/S0005-release-notes.md`

## Historical references

- `S0005`: `handoffs/releases/S0005-release-notes.md` (US-0003 OpenAI Structured Outputs migration)
- `S0004`: `handoffs/releases/S0004-release-notes.md` (US-0002 docs alignment)
- `S0003`: `handoffs/releases/S0003-release-notes.md` (US-0001 test harness)
- `S0002`: `handoffs/releases/S0002-release-notes.md` (BUG-0001 category dropdown fix)

---

## Compatibility behavior contract

- Keep this file as a pointer/summary; do not treat it as canonical historical
  storage.
- `/release` must update sprint-scoped notes first, then refresh this pointer.
- Never delete or destructively rewrite historical sprint-scoped note files
  through this legacy path.
