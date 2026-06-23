# its-magic Skill

This skill guides the AI dev team through the its-magic workflow. It enforces
artifact persistence, clear handoffs, and compact context packs.

## Workflow

1. Intake: clarify idea, write story + acceptance.
2. Discovery: capture design/UX references.
3. Research: summarize patterns, risks, dependencies.
4. Architecture: define approach, risks, decisions.
5. Sprint plan: create sprint and tasks.
6. Plan verify: verify tasks cover acceptance.
7. Execute: implement task-by-task, update state.
8. QA: test plan, findings, verification.
9. Verify work: UAT and user-facing validation.
10. Release: notes, runbook, readiness.
11. Refresh context: compact state + decisions.

Optional modes:
- Quick: fast path for small tasks.
- Milestones: group phases into larger delivery cycles.

## Required artifacts

- `docs/product/*`
- `docs/engineering/*`
- `sprints/Sxxxx/*`
- `sprints/quick/*`
- `milestones/*`
- `handoffs/*`
- `decisions/*`

## Templates

Use templates in `templates/` for both markdown and JSON artifacts. JSON
templates are preferred for structured data (story, acceptance, architecture,
decision, sprint, handoff, plan-verify, UAT, milestone, phase context).

