# Sprint Release Notes — S0003

**Sprint:** S0003  
**Date:** 2026-06-13  
**Work item:** US-0001  
**Queue status:** released  
**Release version:** 1.0.0 (app `package.json`; no registry publish)

---

## Summary

Bootstrap automated test harness for `#resolveCategory` precedence regression.

**Changes:**

- `src/App.js` — `App.createForTest(deps)` + `resolveCategoryForTest()` test seam
- `tests/fixtures/` — categories, transactions, service stubs
- `tests/resolveCategory.test.js` — 4 precedence cases (account → auto-cat → AI mock)
- `tests/run-tests.sh`, `tests/run-tests.ps1` — canonical runners (`node --test tests/`)
- `docs/engineering/runbook.md` — `TEST_COMMAND: bash tests/run-tests.sh`
- `package.json` — `"test": "bash tests/run-tests.sh"`
- `tests/report.md` — check-in test evidence (4/4 pass)

**Verified:** AC-1–AC-5 (QA + verify-work UAT 5/5 + release test re-run 4/4).  
**Optional deferred:** T-0011 stretch cases 5–6 (stale mapping, invalid AI category).

---

## Gate results

1. **Check-in test gate:** PASS — `tests/report.md` 4/4 @ 2026-06-13T12:52:41Z
2. **QA completion gate:** PASS
3. **UAT completeness gate:** PASS (5 pass, 0 fail, 0 deferred)
4. **Isolation compliance gate:** PASS
5. **Strict runtime proof gate:** PASS
6. **Release finalization gate:** PASS
7. **Publish:** skipped (`RELEASE_PUBLISH_MODE=disabled`)

---

## Run

- `start_command`: `bash tests/run-tests.sh` (or `npm test`)
- `runtime_mode`: `local`
- `runtime_context_ref`: `docs/engineering/runbook.md` § Commands, `tests/run-tests.sh`

Windows alternative:

- `powershell -ExecutionPolicy Bypass -File tests/run-tests.ps1`

---

## Connect

- `service_url`: n/a (unit-test harness; no network service)
- `service_port`: n/a
- `health_endpoint`: n/a

---

## Verify

- `verification_steps`:
  1. From repo root: `bash tests/run-tests.sh`
  2. Expect exit 0 and 4/4 TAP pass (case-1 through case-4)
  3. Run `npm test` — delegates to shell runner; same 4/4 pass
  4. Confirm `docs/engineering/runbook.md` `TEST_COMMAND` is `bash tests/run-tests.sh`
  5. On push/PR, CI `checks` job runs `TEST_COMMAND` from runbook
- `expected_health_signal`: exit code 0; TAP output shows `# pass 4`, `# fail 0`

---

## Credentials

- `credential_source_refs`: none required for test harness
- `expected_value_source`: n/a — tests use injected mocks; no live Firefly or OpenAI

---

## Known Issues

- T-0011 optional stretch cases not implemented (`OPTIONAL_TASK_DEFERRED`)
- `scripts/check-user-visible-metadata.py` absent (`METADATA_SANITIZATION_POLICY_MISSING` — informational)
- Spec-pack CRS only; design-concept / technical-spec artifacts deferred (architecture # US-0001 substitutes)

---

## Traceability

| Artifact | Ref |
|----------|-----|
| Sprint summary | `sprints/S0003/summary.md` |
| QA findings | `sprints/S0003/qa-findings.md` |
| UAT | `sprints/S0003/uat.json`, `sprints/S0003/uat.md` |
| Release findings | `sprints/S0003/release-findings.md` |
| Architecture | `docs/engineering/architecture.md` (# US-0001) |
| Decision | `decisions/DEC-0006.md` |
