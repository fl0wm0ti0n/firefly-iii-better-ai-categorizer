---
description: "its-magic security-review: optional security and compliance review."
---

# /security-review

## Subagents
- security

## Execution model
- Run `/security-review` in a fresh Security subagent context.
- This command is guidance-driven review, not a static analysis certification.
- After writing outputs, stop and continue the next workflow phase in a new
  subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- `SECURITY_REVIEW` and `COMPLIANCE_PROFILES` from `.cursor/scratchpad.md`
- `docs/engineering/architecture.md`
- `docs/engineering/decisions.md`
- `docs/engineering/state.md`
- Sprint tasks and implementation artifacts in code review mode
- `handoffs/dev_to_qa.md` in code review mode (when available)

## Outputs (artifacts)
- `docs/engineering/security-review.md`
- `decisions/DEC-xxxx.md` (critical findings only)
- `docs/engineering/state.md`
- `handoffs/qa_to_dev.md` (when code review finds blocking issues)

## Modes
- `design`: run after `/architecture`; focuses on architecture and control design.
- `code`: run after `/execute`; focuses on implementation-level risk patterns.

## Review scopes
- Design review scope:
  - architecture decisions and trust boundaries
  - data flow/storage and sensitive-data handling
  - authentication/authorization design
  - third-party dependency and integration risk
  - profile-specific requirements when configured
- Code review scope:
  - secrets/credentials exposure in code or config
  - injection classes (SQL, XSS, command) and unsafe input handling
  - authentication/authorization implementation gaps
  - validation/sanitization/output encoding patterns
  - profile-specific implementation requirements when configured

## Stop conditions
- `SECURITY_REVIEW=0` in scratchpad (exit immediately; no overhead)
- Critical unresolved finding that triggers a decision gate
- Missing mandatory review inputs for selected mode

## Steps
1. Read `SECURITY_REVIEW` and `COMPLIANCE_PROFILES` from `.cursor/scratchpad.md`.
2. If `SECURITY_REVIEW=0`, exit with: "Security review is disabled."
3. Determine review mode:
   - explicit user-provided mode, or
   - infer `design` post-architecture, `code` post-execute.
4. Load inputs for the selected mode from artifacts and handoffs.
5. Load compliance profile checklists:
   - if `COMPLIANCE_PROFILES` is set, apply selected profiles (for example GDPR),
   - if empty, apply general security best-practice baseline only.
6. Evaluate findings against mode-specific criteria, profile guidance, and
   severity taxonomy (`critical`, `high`, `medium`, `low`).
7. Write findings to `docs/engineering/security-review.md` with:
   severity, component, description, risk, remediation, and status.
8. For each `critical` finding, enforce escalation:
   - Create `decisions/DEC-xxxx.md` documenting vulnerability details, affected
     components, risk assessment, and remediation options.
   - Mark the finding as `blocking` in `docs/engineering/security-review.md`.
   - Trigger a decision gate and pause phase progression until resolved/accepted.
   - Resolve only through one of these documented outcomes:
     1) fix now,
     2) accept risk with rationale,
     3) defer with mitigation plan and owner/timeline.
9. Update `docs/engineering/state.md` with review mode, profile set, summary
   counts by severity, and whether a decision gate is active.
