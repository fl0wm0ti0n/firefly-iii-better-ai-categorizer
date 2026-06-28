# Developer documentation

This shard holds contributor-facing material for the **its-magic** framework. End-user
setup stays in the root `README.md` (user channel).

## Prerequisites

- **Cursor** (or compatible editor) with the workflow files installed.
- **Python 3** on PATH for scratchpad merge validation and several repo scripts.
- **Node.js** if you use npm-packaged `its-magic` or npm-driven `TEST_COMMAND` defaults.

## Workflow

- Follow phased commands under `.cursor/commands/` (`intake`, `discovery`, `architecture`,
  `sprint-plan`, `execute`, `qa`, `release`, etc.).
- Keep handoffs and `docs/engineering/state.md` updated at phase boundaries.
- Use `.cursor/scratchpad.local.md` for personal overrides; never commit secrets.

## Quality gates

- Run `TEST_COMMAND` from `docs/engineering/runbook.md` before push; CI should mirror the same.
- Run `python scripts/validate_doc_profile.py` when changing documentation profile flags or
  README surfaces.
- Observe `US-0071` hygiene for user-visible script output (see runbook).

## Architecture notes

- High-level contracts live in `docs/engineering/architecture.md` (search for story ids).
- Installer ownership is driven by `docs/engineering/context/installer-owned-paths.manifest`.
- Template parity: changes in repo root often require the same edit under `template/`.

## Contracts and interfaces

- Scratchpad merge precedence: local → materialized `.cursor/scratchpad.md` →
  `.cursor/scratchpad.local.example.md` (Model B / **DEC-0055**).
- Documentation profile keys: `DOC_AUDIENCE_PROFILE`, `DOC_DETAIL_LEVEL` (**DEC-0059**).
- Optional modes: `SPEC_PACK_MODE`, `USER_GUIDE_MODE` remain orthogonal; when `0`, validators
  must not require those artifacts.

## Engineering decisions

- Decision records: `decisions/DEC-xxxx.md` and the compact index in
  `docs/engineering/decisions.md`.
- Profile semantics for this shard: **DEC-0059** and `# US-0077` in `architecture.md`.
