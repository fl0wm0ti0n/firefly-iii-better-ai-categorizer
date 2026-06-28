# Plan-Verify Summary — Sprint S0010 (US-0007)

- **phase_id**: plan-verify
- **role**: qa
- **verdict**: **FAIL** (execution must NOT proceed)
- **timestamp**: 2026-06-28T14:31:00+02:00
- **fresh_context_marker**: plan-verify-us0007-keyword-direct-assign
- **orchestrator_run_id**: auto-20260628T120000Z-us0007-us0008
- **next_scheduled_phase**: execute *(blocked until fixes applied)*

---

## 1. Executive Summary

The sprint plan for S0010 has **critical structural inconsistencies** between the sprint-task summary (`tasks.md`) and the individual task JSON files. Two of the seven task JSON files (T-0063 and T-0067) have titles and scopes that do not match the descriptions in `tasks.md`. As a consequence:

- **AC-2 (direct-assign → assign directly)** and **AC-4 (AI-hint slot insertion)** have **no implementation task in the JSON file set**. The core pipeline integration feature is absent from the JSON artifacts.
- The persistence round-trip test described in `tasks.md` as T-0067 is replaced in the JSON file set by a duplicate of the regression gate.
- T-0067.json has a self-referential dependency (`depends_on: [T-0067]`), which violates the acyclic-task requirement.

**Recommendation: BLOCK `/execute` until the JSON files are reconciled with `tasks.md`.**

---

## 2. Acceptance Coverage Matrix

| AC | Statement | Coverage | Tasks (tasks.md) | Tasks (JSON) | Notes |
|----|-----------|----------|------------------|--------------|-------|
| AC-1 | Data model supports `directAssign` boolean; absent ≡ AI-hint mode | **Covered** | T-0062, T-0067 | T-0062, T-0063 (duplicate) | Persistence round-trip JSON task missing |
| AC-2 | `directAssign: true` + keyword match → assign directly, no OpenAI | **MISSING** | T-0063 (should be pipeline insert) | *(no JSON task)* | Core feature — **BLOCKED** |
| AC-3 | `directAssign: false`/undefined → AI-hint preserved | **Partial** | T-0063 (fall-through) | T-0062 (partial) | Fall-through rule needs pipeline insertion |
| AC-4 | Direct-assign at AI-hint slot (after account mapping + auto-cat) | **MISSING** | T-0063 | *(no JSON task)* | DEC-0022 — **BLOCKED** |
| AC-5 | Admin UI per-mapping toggle | **Covered** | T-0064 | T-0064 | Match OK |
| AC-6 | Backward compatible (no field = AI-hint) | **Partial** | implied by T-0062 | T-0062 (default false) | Relies on regression gate; no explicit backward-compat test |
| AC-7 | Regression tests pass (18/18 + new) | **Partial** | T-0066, T-0067, T-0068 | T-0066 (cases), T-0067 (regression — duplicate of T-0068) | No persistence test JSON; test count mismatch (21 vs 22) |

**AC coverage breakdown**:
- Covered: AC-1, AC-5
- Partial: AC-3, AC-6, AC-7
- **Missing: AC-2, AC-4**

---

## 3. Sprint-Capacity Check

| Metric | Value |
|--------|-------|
| Declared tasks (JSON) | 7 |
| Sprint cap (SPRINT_MAX_TASKS) | 12 |
| Capacity utilization | 58 % |
| Under cap | ✅ true |
| Split required | ❌ false |

Capacity is healthy — no split needed. The issue is artifact consistency, not headroom.

---

## 4. Task-Dependency Analysis

### Declared in tasks.md
```
T-0062 (Service+Schema)
  ├─> T-0063 (Pipeline insert)
  │     └─> T-0066 (Test cases) ─> T-0068 (Regression gate)
  ├─> T-0064 (UI toggle)
  ├─> T-0065 (Stub refactor) ─> T-0066
  └─> T-0067 (Persistence test) ─> T-0068
```

Critical path (tasks.md): **T-0062 → T-0063 → T-0066 → T-0068** ✅

### Declared in JSON files
- T-0062: no deps ✅
- T-0063: no deps ❌ (should be T-0062; also scope is wrong)
- T-0064: [T-0062] ✅
- T-0065: [T-0062] ✅
- T-0066: [T-0063, T-0065] ✅ (semantically requires T-0063 to be pipeline insert)
- T-0067: [T-0067] ❌ **SELF-REFERENTIAL DEPENDENCY**
- T-0068: [T-0067] ✅ (only because JSON thinks T-0067 is regression gate)

### Critical-path reconstructability
**Cannot be reconstructed from JSON** because T-0063 JSON scope is wrong (whitelist instead of pipeline insert).

---

## 5. Task-by-Task Findings

| Task | tasks.md title | JSON title | Match? | Complexity | Issues |
|------|----------------|------------|--------|------------|--------|
| T-0062 | getDirectAssignment + directAssign schema | getDirectAssignment + field whitelist | ✅ acceptable | low | Bundles two concerns (method + whitelist) per architecture §3.1; acceptable |
| T-0063 | **Pipeline insertion (App.js)** | **Field whitelist (CategoryMappingService.js)** | ❌ **MISMATCH** | low | **Critical.** Scope in JSON duplicates T-0062's whitelist concern. Pipeline insertion absent. |
| T-0064 | UI toggle (public/index.html) | UI toggle | ✅ match | low | — |
| T-0065 | Stub refactor (tests/fixtures/stubs.js) | Stub refactor | ✅ match | low | — |
| T-0066 | 3 new test cases (case-5..7) | 3 new test cases | ✅ match | medium | Dependency on T-0063 only makes sense if T-0063 is pipeline insert |
| T-0067 | Persistence test (new file) | **Regression gate (duplicate of T-0068)** | ❌ **MISMATCH** | medium | **Critical.** Self-referential dependency. Scope should be persistence test per tasks.md. |
| T-0068 | Regression gate | Regression gate | ✅ match | low | — |

---

## 6. Test Coverage Plan

- **New cases planned**: 3 (case-5 direct-assign match, case-6 miss, case-7 mixed)
- **Expected total tests** (per sprint.json): 21 (18 existing + 3 new)
- **Persistence test inclusion**: NOT counted in the 21-test expectation. If included, total should be 22.
- **OpenAI-not-called assertion**: present in case-5 ✅
- **Fall-through assertion**: present in case-6 ✅
- **Precedence assertion**: present in case-7 ✅

---

## 7. Risk Flags

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | 🔴 Critical | No pipeline insertion JSON task. AC-2 & AC-4 uncovered. | Rewrite T-0063.json per tasks.md description (src/App.js, insertion at line 1214, DEC-0022, fall-through rule). |
| 2 | 🔴 Critical | T-0067.json mis-titled as regression gate (duplicate of T-0068); persistence test scope absent. | Rewrite T-0067.json as persistence round-trip test (new file tests/categoryMappingService.test.js, depend on T-0062). |
| 3 | 🟡 Moderate | T-0067.json self-referential dependency. | Fix dependency when rewriting T-0067. |
| 4 | 🟡 Moderate | T-0062 & T-0063 JSON overlap on whitelist scope. | Resolution depends on fix 1 above. |
| 5 | 🟢 Minor | Test count (21) does not include persistence test. | Either add to total (22) or document persistence test as a sub-case of T-0067. |
| 6 | 🟢 Minor | tasks.md's "parallel phase 2" lists T-0067 but T-0067→T-0068 is serial. | Clarify tasks.md implementation order. |

---

## 8. Recommended Actions Before `/execute`

1. **Reconcile T-0063.json** — rewrite to be the pipeline insertion task (src/App.js, DEC-0022, dependencies: [T-0062], acceptance: [AC-2, AC-4]).
2. **Reconcile T-0067.json** — rewrite to be the persistence round-trip test (new file tests/categoryMappingService.test.js, dependencies: [T-0062], acceptance: [AC-1]).
3. **Fix dependency self-reference** on T-0067.
4. **Update sprint.json success_criteria** to account for persistence test (22 tests, not 21) OR document persistence test as part of T-0067 existing count.
5. **Re-run plan-verify** after fixes before proceeding.

---

## 9. Missing Tasks

| # | Suggested task | Rationale | Priority |
|---|----------------|-----------|----------|
| 1 | T-0063 rewrite (pipeline insert) | Core feature absent from JSON | 🔴 Critical |
| 2 | T-0067 rewrite (persistence test) | tasks.md description unreconciled | 🔴 Critical |
| 3 | (Optional) Documentation update for CODEBASE_ANALYSIS.md / runbook | Pipeline step order, HITL semantics for direct-assign | 🟢 Low (defer to PO) |

---

## 10. Verdict Summary

The sprint plan **cannot be executed as-is**. Critical structural inconsistencies between tasks.md and the task JSON files mean AC-2 and AC-4 (the core pipeline integration) have no implementation JSON artifact. The persistence test scope described in tasks.md is also absent from the JSON files.

**Decision: FAIL — BLOCK `/execute`.**

Plan-verify will re-run once the sprint-plan artifacts are reconciled by the tech-lead role.

| Field | Value |
|-------|-------|
| phase_id | plan-verify |
| role | qa |
| verdict | fail |
| next_scheduled_phase | execute *(blocked)* |
| acceptance_coverage | AC-1 ✅, AC-2 ❌, AC-3 ⚠️, AC-4 ❌, AC-5 ✅, AC-6 ⚠️, AC-7 ⚠️ |
| missing_tasks | T-0063 (rewrite), T-0067 (rewrite) |
| critical_path_blockers | AC-2, AC-4 |
| capacity | 7/12, under cap ✅ |
| isolation_evidence | appended to docs/engineering/state.md |
