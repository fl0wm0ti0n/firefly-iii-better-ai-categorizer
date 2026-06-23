---
description: "its-magic intake: clarify idea and capture story + acceptance."
---

# /intake

## Subagents
- po

## Execution model
- Run `/intake` in a fresh PO subagent context.
- After writing outputs, stop and hand off to `/discovery` or `/architecture`
  in a new subagent/chat.

## Inputs

- **Narrow-read (US-0053 / US-0096 Tranche A)**: Start at docs/engineering/phase-context.md
  and the story section anchor in vision/architecture/decisions when a heading exists; forbid
  full-file reads when a section heading exists.
- User idea (text or voice transcription)
- Constraints, audience, success criteria

## Outputs (artifacts)
- `docs/product/vision.md`
- `docs/product/backlog.md`
- `docs/product/acceptance.md`
- `handoffs/po_to_tl.md`
- `handoffs/resume_brief.md` (required on successful **`/intake bug`** persistence — **DEC-0069** / **BUG-0005**)
- Optional (when enabled): `docs/engineering/compatibility-report.md`
- Optional (when enabled): `docs/engineering/component-scope.md`

## Stop conditions
- Missing acceptance criteria or unclear scope
- Decision gate triggered (see escalation rule)

## Runtime capability and writer-safety guard (US-0059 / DEC-0041)

- `/intake` requires the role-specific `po` subagent capability by default.
- Before any artifact mutation, run capability preflight:
  - if `po` capability is unavailable, fail fast with
    `SUBAGENT_CAPABILITY_UNAVAILABLE`,
  - emit deterministic remediation guidance (for example: enable role-capable
    runtime or explicitly opt in to fallback policy).
- Silent in-band fallback is forbidden unless explicit policy opt-in is
  configured (`INTAKE_SUBAGENT_FALLBACK=allow`).
- For artifact mutations, enforce deterministic single-writer scope:
  - establish writer identity (`writer_id`) and run identity (`intake_run_id`),
  - bind writes to target artifacts (`backlog`, `acceptance`, `vision`,
    `po_to_tl`, and when persisting bugs: `resume_brief` per **DEC-0069**) for this run.
- Drift guard semantics:
  - self-write changes from the same `(writer_id, intake_run_id)` are valid and
    must not trigger concurrent-writer blockers,
  - external conflicting mutation during active run must fail safe with
    `INTAKE_CONCURRENT_WRITER_DETECTED` and no partial overwrite.

## Mandatory intake question packs and fail-closed persistence gate (US-0068 / DEC-0050)

- Intake must apply one deterministic questionnaire pack before any backlog or
  acceptance persistence:
  - `first-intake-pack` for first/new/broad requests,
  - `small-intake-pack` for narrow follow-up requests.
- Pack selection must be deterministic and auditable:
  - evaluate request breadth (`new capability` vs `bounded refinement`),
  - use known stack/runtime cues when present,
  - unresolved/unknown stack cues must fail closed to `first-intake-pack`
    (never bypass to a smaller pack by default).
- Required topic coverage must be complete before persistence unless bounded
  assumptions are explicitly confirmed:
  - `first-intake-pack` required topics:
    `users_problem`, `runtime_target_environment`, `language_framework_runtime`,
    `architecture_preference`, `ui_design_expectations`,
    `security_compliance`, `non_functional_priorities`, `scope_timeline`.
  - `small-intake-pack` required topics:
    `outcome_success_criteria`, `impacted_components`,
    `constraints_compatibility_risks`, `required_tests_acceptance_checks`,
    `done_definition`.
- Fail-closed deterministic reason codes:
  - `INTAKE_REQUIRED_TOPIC_MISSING`
  - `INTAKE_REQUIRED_PACK_INCOMPLETE`
  - `INTAKE_ASSUMPTION_CONFIRMATION_REQUIRED`
  - `INTAKE_ANSWER_REF_NOT_TOPIC_DISTINCT` (**BUG-0007** / **R-0066** — see **Truthfulness** below)
  - `INTAKE_PERSISTENCE_BLOCKED`
- Remediation guidance surface (mandatory on block):
  - list `missing_topics`,
  - request targeted answers for missing required topics,
  - if assumptions are used, require explicit confirmation before write.
- Persistence evidence contract (must be written in intake outputs):
  - `asked_topics`
  - `missing_topics`
  - `assumptions_confirmed`
  - For `first-intake-pack` (first/new/broad): `plan_area_inventory`,
    `plan_area_coverage`, `coverage_complete=true` (derived), and candidate story
    set refs used for map validation (**US-0081** / **DEC-0064**).

## Interactive intake evidence gate (US-0078 / DEC-0060 / R-0055)

Machine-verifiable **`intake_evidence`** extends **DEC-0050** literals with
**`topic_coverage`** (one row per required pack key), canonical **`ie:`** refs,
and assumption binding. **Do not** mutate `docs/product/backlog.md` or
`docs/product/acceptance.md` until validation **PASS**es.

- Bundle minimum (logical shape — serialize inline in handoff/backlog notes or JSON sidecar):
  - `selected_pack`, `asked_topics`, `missing_topics`, `assumptions_confirmed`
  - `topic_coverage[]`: `topic_key`, `satisfied_by` (`answer_ref` \| `assumption_confirmation_ref` \| `delegation_ref`),
    `ref` (**`ie:`** per **DEC-0060**), `quoted_user_text`, per-row `intake_run_id` / `turn_index`
    (or bundle-level `intake_run_id` shared by rows)
  - Delegated required topic rows (`satisfied_by=delegation_ref`) must include:
    `delegation_scope`, `delegation_rationale`, `delegation_confidence` (`low|medium|high`)
  - Equivalent-evidence accounting (optional; suppress repetitive ask for already captured evidence):
    `evidence_source=equivalent_evidence_ref` + `equivalent_evidence_ref` on the row
  - Affirmative / non-placeholder `assumptions_confirmed`: `assumption_confirmation_ref`,
    `assumption_confirmation_intake_run_id`, `assumption_confirmation_turn_index`,
    `assumption_confirmation_quoted`
- Validator (fail-closed; preserves primary sub-codes under umbrella **`INTAKE_PERSISTENCE_BLOCKED`**):
  - `python scripts/intake_evidence_validate.py --self-test`
  - `python scripts/intake_evidence_validate.py --file <bundle.json>` or `--stdin`
- Deterministic diagnostics (**AC-7**): on block, list `missing_topics`, cite reason codes, and emit
  remediation prompts for unresolved required keys only.
- Delegation-specific fail-closed diagnostics under umbrella `INTAKE_PERSISTENCE_BLOCKED`:
  - `INTAKE_DELEGATION_EVIDENCE_MISSING`
  - `INTAKE_DELEGATION_EVIDENCE_INVALID`
- **US-0081 complete-plan gate** (first/new/broad only): enforce
  `plan_area_id -> story_ids[] | deferred_ref` coverage for every
  `plan_area_inventory` row; emit deterministic subcodes under umbrella
  `INTAKE_PERSISTENCE_BLOCKED`:
  - `INTAKE_PLAN_COVERAGE_MISSING`
  - `INTAKE_PLAN_AREA_ID_INVALID`
  - `INTAKE_PLAN_COVERAGE_CONTRACT_INVALID`
  - `INTAKE_PLAN_DEFERRED_REF_MISSING`
- **Guided vs low-touch parity**: **`INTAKE_GUIDED_MODE=1`** and **`INTAKE_GUIDED_MODE=0`** run the
  **same pre-persistence validation pipeline**; low-touch may skip optional follow-ups but **must not**
  bypass mandatory pack evidence or first-intake complete-plan mapping
  (**AC-5**, **AC-6**).
- **Grandfathering**: legacy intake rows remain valid for read/display; the **next** intake-driven
  mutation must supply full **US-0078** evidence or the write is blocked (**DEC-0060** §5).
- Truthfulness / anti-echo (**BUG-0007** / **R-0066**): `INTAKE_ANSWER_REF_NOT_TOPIC_DISTINCT` when
  the same normalized `quoted_user_text` is reused across distinct required `topic_key` rows under
  `satisfied_by=answer_ref` without an exempt path (`evidence_source=equivalent_evidence_ref` +
  `equivalent_evidence_ref`, `delegation_ref` per **DEC-0067** / **US-0083**, or
  `assumption_confirmation_ref` on the row). Canonical **`ie:`** integrity (**DEC-0060**) does not
  prove a topic was actually elicited.

## Truthfulness: `asked_topics` and `topic_coverage` (BUG-0007 / US-0083 / DEC-0060 / DEC-0067)

- **`asked_topics`** may list a required `topic_key` only when a **user-visible question** was posed
  **or** a **DEC-0060**-allowed alternate applies: **`delegation_ref`** (**DEC-0067**, **US-0083**),
  **`evidence_source=equivalent_evidence_ref`** with **`equivalent_evidence_ref`**, or
  **`assumption_confirmation_ref`** (row-level and/or bundle-level assumption binding per the gate
  contract above).
- **Forbidden**: fabricating **`topic_coverage`** by echoing **one** user or bug-report blob into
  **`quoted_user_text`** on **every** required key as **`answer_ref`** solely to satisfy structure.
  The validator rejects that pattern under **`INTAKE_ANSWER_REF_NOT_TOPIC_DISTINCT`** (see
  **`docs/engineering/architecture.md`** **`# BUG-0007`**).

## Bug issue routing (US-0079 / DEC-0061)

- **Work item kind** (merged scratchpad per **DEC-0055**): **`INTAKE_WORK_ITEM_KIND=story`** (default) or **`INTAKE_WORK_ITEM_KIND=bug`**.
- **Explicit argv**: when the operator invokes **`/intake bug`** (bug mode for this run), treat **`INTAKE_WORK_ITEM_KIND`** as **`bug`** for routing even if scratchpad defaults to story (command wins for the session).
- **No silent US allocation for defects**: before creating a **`US-xxxx`** for **defect-shaped** input while in **story** kind, run **`python scripts/intake_bug_routing_guard.py --kind story --file <condensed-prose.txt>`** (or **`--stdin`**). Exit **3** → **`INTAKE_BUG_ROUTING_REQUIRED`** — **abort** backlog/acceptance mutation; remediation: set **`INTAKE_WORK_ITEM_KIND=bug`** and/or re-run as **`/intake bug`**, collect minimum bug fields, then allocate **`BUG-####`**.
- **Bug persistence** (after **US-0078** evidence still passes for narrative packs when applicable):
  - Next id: **`python scripts/bug_issue_validate.py --print-next-id`** (reads **`docs/product/backlog.md`**).
  - Append **`### BUG-#### — Title`** under **`## Bug issues (canonical)`** with **Status**, **`environment`**, **`steps_to_reproduce`**, **`expected`**, **`actual`**, **`evidence_refs`**.
  - Add matching **`- [ ]` / `- [x]`** row under **`## Bug acceptance (canonical)`**, sorted by id.
  - Run **`python scripts/bug_issue_validate.py --backlog docs/product/backlog.md --check-acceptance`** before completing the handoff.
  - **Resume brief refresh (DEC-0069 / BUG-0005)**: immediately after successful bug persistence and backlog/acceptance validation **PASS**, run the atomic writer (temp file + replace — idempotent latest-pointer upsert):
    - `python scripts/intake_bug_resume_brief_refresh.py --bug-id BUG-#### --backlog docs/product/backlog.md --resume-brief handoffs/resume_brief.md --intake-boundary-utc <RFC3339Z>`  
    - Optional: `--orchestrator-run-id`, `--intake-evidence handoffs/intake_evidence/....json`, `--sprint-id` when known.  
    - Exit non-zero → **`INTAKE_RESUME_BRIEF_*`** family — do not claim intake complete; fix backlog/brief contradiction or supply valid boundary UTC.  
    - Post-condition: **`intended_resume_phase` / `resolved_start_phase` = `discovery`**, **`resolution_source=resume_brief`**, **`bug_id`** matches persisted row, so **`/auto`** without **`start-from`** does not false-trigger **`RESUME_BRIEF_STALE`** for a stale pre-intake **`intake`** target.  
    - Optional audit: `python scripts/intake_bug_resume_brief_refresh.py --bug-id BUG-#### --backlog docs/product/backlog.md --resume-brief handoffs/resume_brief.md --validate-file` (no write).

## Steps
1. Determine intake mode from `.cursor/scratchpad.md`:
   - guided mode: `INTAKE_GUIDED_MODE=1` (default)
   - low-touch mode: `INTAKE_GUIDED_MODE=0`
2. Baseline safety (always on in both modes):
   - Check `docs/product/backlog.md` for duplicates/overlap before creating a new
     story.
3. Guided mode behavior (`INTAKE_GUIDED_MODE=1`):
   a. Run a deterministic decomposition evaluator before persistence. Score
      breadth/risk using:
      - feature/workflow-step count,
      - cross-cutting impact surface (multiple components/contracts),
      - expected acceptance set size,
      - risk/unknown dependency surface.
   b. Decomposition trigger:
      - If evaluator indicates broad/high-risk scope, propose a bounded
        multi-story decomposition (typically 2-5 stories).
      - Otherwise default to a single story.
   c. Split strategy requirements:
      - Prefer vertical-slice or workflow-step stories with independent user value.
      - Avoid technical-layer-only splits unless explicitly requested by the user.
   d. Persist split rationale and boundaries:
      - why split (or why not),
      - split axes used (feature/workflow/risk boundary),
      - boundaries between generated stories.
   e. Preserve explicit user authority before final persistence:
      - user can **accept**, **merge**, or **adjust** the proposed split.
   f. Use adaptive questioning:
      - ask when ambiguity blocks concrete acceptance (baseline),
      - also ask additional targeted questions when breadth/risk is high even if
        the request looks concrete.
   g. Keep questioning bounded:
      - use concise, targeted rounds,
      - stop after bounded rounds or when acceptance confidence is sufficient,
      - summarize assumptions for confirmation.
   h. Present at least one viable option/alternative before recommending an
      approach.
   i. Perform intake-time web research and persist findings as an R-xxxx entry in
      `docs/engineering/research.md` (auto-increment ID, per DEC-0011); cite
      entry IDs in reasoning and handoff.
4. Low-touch behavior (`INTAKE_GUIDED_MODE=0`):
   - Keep baseline duplicate safety from step 2 active.
   - Do not add proactive follow-up/options/research overhead unless the user
     explicitly requests depth.
   - Keep single-story default (no forced decomposition), unless the user
     explicitly requests decomposition.
5. Enforce mandatory question-pack coverage before persistence (US-0068) **and**
   interactive evidence (**US-0078 / DEC-0060**):
   - deterministically select one pack (`first-intake-pack` or
     `small-intake-pack`) and record `selected_pack`.
   - ask required questions for the selected pack; adaptive follow-ups remain
     allowed but bounded.
   - accumulate **`topic_coverage`** rows with valid **`ie:`** refs; keep
     `asked_topics` aligned with covered required keys (asked-vs-covered rule).
   - before writing backlog/acceptance artifacts, run **`python scripts/intake_evidence_validate.py`**
     on the captured bundle (or equivalent in-process validation):
     - if validation **PASS**es, proceed to persistence;
    - on **FAIL**, emit `INTAKE_REQUIRED_TOPIC_MISSING` /
      `INTAKE_REQUIRED_PACK_INCOMPLETE` / `INTAKE_ASSUMPTION_CONFIRMATION_REQUIRED` /
      `INTAKE_DELEGATION_EVIDENCE_MISSING` / `INTAKE_DELEGATION_EVIDENCE_INVALID`
       plus first-intake coverage subcodes (`INTAKE_PLAN_COVERAGE_MISSING`,
       `INTAKE_PLAN_AREA_ID_INVALID`, `INTAKE_PLAN_COVERAGE_CONTRACT_INVALID`,
       `INTAKE_PLAN_DEFERRED_REF_MISSING`) under umbrella
       `INTAKE_PERSISTENCE_BLOCKED` with remediation guidance — **no write**.
   - for `first-intake-pack` requests, derive a normalized
     `plan_area_inventory`, require one coverage row per `plan_area_id`, enforce
     xor mapping (`story_ids` xor `deferred_ref` + `deferred_reason`), and set
     `coverage_complete=true` only when all areas are fully mapped.
   - persist intake evidence fields (`asked_topics`, `missing_topics`,
     `assumptions_confirmed`, `topic_coverage`, assumption ref fields per
     **DEC-0060**, and first-intake coverage fields (`plan_area_inventory`,
     `plan_area_coverage`, `coverage_complete`) in relevant intake artifacts.
6. Optional fresh-project ID namespace bootstrap (US-0052 / DEC-0034):
   - Read `ID_NAMESPACE_BOOTSTRAP` from `.cursor/scratchpad.md` (`0|1`,
     default `0`).
   - Freshness eligibility is deterministic and auditable:
     - no existing `US-` IDs in `docs/product/backlog.md`,
     - no existing `DEC-` IDs in `docs/engineering/decisions.md` (or
       `decisions/DEC-*.md`),
     - no existing `R-` IDs in `docs/engineering/research.md`.
   - If `ID_NAMESPACE_BOOTSTRAP=1` and freshness checks pass:
     - first newly created story ID starts at `US-0001`.
   - If `ID_NAMESPACE_BOOTSTRAP=0`, or freshness checks fail:
     - continue from highest existing story ID (collision-safe default).
   - Never rewrite or renumber historical IDs.
   - If bootstrap was requested but checks fail, emit deterministic diagnostic:
     `ID_BOOTSTRAP_NOT_FRESH` with brief remediation guidance.
7. Traceability persistence contract (US-0051):
   - `docs/product/backlog.md`: include decomposition evidence (single-story vs
     split decision, rationale, and boundaries).
   - `docs/product/acceptance.md`: maintain acceptance traceability for resulting
     story set (or single-story decision) with clear scope boundaries.
   - `handoffs/po_to_tl.md`: include split decision summary and adaptive
     questioning evidence (risk/unknown triggers and key assumptions).
8. Persist the story and acceptance in product docs.
9. Write a PO -> TL handoff with scope and risks.
10. Optional cross-repo observability declaration (US-0034):
   - If `CROSS_REPO_OBSERVABILITY=0`, add zero required overhead.
   - If `CROSS_REPO_OBSERVABILITY=1`, capture monitored source list from
     `COMPATIBILITY_SOURCES` (`repo/module/contract/docs`) and include
     compatibility observability intent in handoff context.
11. Optional component scope declaration (US-0035):
   - If `COMPONENT_SCOPE_MODE=0`, add zero required scope overhead.
   - If `COMPONENT_SCOPE_MODE=1`, declare in-scope and out-of-scope components
     in `docs/engineering/component-scope.md` and include references in
     `handoffs/po_to_tl.md`.
12. Optional spec-pack (US-0031):
   - If `SPEC_PACK_MODE=0`, add no required spec-pack steps (zero overhead).
   - If `SPEC_PACK_MODE=1`, ensure CRS artifact for the new story is created or
     updated at canonical path per runbook spec-pack contract; link story ID in
     handoff.
13. Optional user-guide (US-0032):
   - If `USER_GUIDE_MODE=0`, add no required user-guide steps or blocking checks (zero overhead).
   - If `USER_GUIDE_MODE=1`, ensure handoff references canonical user-guide path
     `docs/user-guides/US-xxxx.md` for the new story when applicable; see runbook.
14. Triad hot-surface gate (DEC-0054) when `handoffs/po_to_tl.md` is mutated:
   - run `python scripts/enforce-triad-hot-surface.py --rollover` then `--check`
     from repository root,
   - on failure stop with `STATE_ARCHIVE_REQUIRED` or
     `ARTIFACT_HOT_SURFACE_OVERSIZE` (no successful intake completion with an
     oversize handoff hot file),
   - record the verification tuple (`boundary`, `moved`, `retained`,
     `pack_ref`) in intake outputs when rollover occurred.

## Deterministic artifact ordering contract (US-0058 / DEC-0040)

- Writes to mutable artifacts must follow
  `docs/engineering/artifact-ordering-policy.md`.
- For intake outputs:
  - `docs/product/backlog.md` story blocks must remain sorted-canonical by
    numeric `US-xxxx` ID.
  - `docs/product/acceptance.md` rows must align to canonical backlog order.
  - `handoffs/po_to_tl.md` may prepend the latest handoff section only.
- If the insertion anchor for any target section is missing/ambiguous, fail with
  `ARTIFACT_ORDERING_ANCHOR_AMBIGUOUS` and avoid partial writes.
- If intake appends a `docs/engineering/state.md` checkpoint, enforce UTC
  monotonic timestamp guard (`new >= last`); on violation fail with
  `STATE_TIMESTAMP_NON_MONOTONIC` and avoid partial writes.

## Cross-phase ownership guard (US-0061 / DEC-0043)

- Intake mutations must also comply with
  `docs/engineering/artifact-ownership-policy.md`.
- Intake may mutate only intake-owned scopes (`vision`, `backlog`, `acceptance`,
  `po_to_tl`, and **`handoffs/resume_brief.md`** only via the **DEC-0069** bug-intake
  completion path / `intake_bug_resume_brief_refresh.py`) for target story context.
- Any attempted delete/rewrite of non-intake-owned sections fails closed with
  `PHASE_OWNERSHIP_VIOLATION`.
- If an override-authorized path is configured for an artifact but required
  override evidence fields are missing, fail with
  `PHASE_OVERRIDE_EVIDENCE_MISSING`.

