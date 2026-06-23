# User guides (US-0032)

When `USER_GUIDE_MODE=1` in `.cursor/scratchpad.md`, the workflow expects one
end-user how-to guide per feature story at a canonical path.

## Canonical location and naming

- **Path**: `docs/user-guides/US-xxxx.md`
- **Naming**: Use the backlog story ID (e.g. `US-0032`) as the filename.
- One guide per feature story; create or update when the story is in scope.

## Minimum required schema

Each guide must include the following sections (structural validation; content
quality is not enforced by the gate):

| Section | Description |
|--------|-------------|
| Purpose | What the feature is for and who it is for |
| Prerequisites | What the user needs before following the guide |
| Usage steps | Step-by-step how-to |
| Example | Concrete example(s) |
| Limitations | Known limits or caveats |
| Troubleshooting | Common issues and fixes |

Validation runs only when `USER_GUIDE_MODE=1`. Missing file or missing/empty
required section blocks release with reason code `USER_GUIDE_INCOMPLETE`.

## Boundary with spec-pack (US-0031)

- **User guides**: End-user facing; how-to and usage only.
- **Spec-pack**: Design Concept, CRS, Technical Specification (engineering/design).
- Do not duplicate spec-pack content in user guides; guides may reference
  technical docs but remain end-user focused.

## Traceability

Story ID → user guide artifact is 1:1. Handoffs and release context should
reference `docs/user-guides/US-xxxx.md` for the target story when user-guide
mode is enabled.
