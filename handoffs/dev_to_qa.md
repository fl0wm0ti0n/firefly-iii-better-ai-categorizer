# Dev → QA Handoff: BUG-0002 / Sprint S0009

## Work item

- **Bug:** BUG-0002 — Pending Reviews endpoint returns HTTP 404 HTML → `loadPendingReviews` JSON parse error
- **Sprint:** S0009
- **Decision:** DEC-0020 — Stale-image remediation + defensive fetch handling
- **Next phase:** qa

## What was implemented

### T-0050 — Production redeploy (done)

Ran the required command against the parent stack:

```bash
docker compose -f /workdir/firefly/docker-compose.yml up -d --build --force-recreate categorizer
```

- Build completed successfully.
- Container status: `healthy`.
- Internal probe `docker exec categorizer wget -qO- http://127.0.0.1:3000/api/reviews` returned `{"success":true,"reviews":[]}`.

### T-0051 — Defensive UI hardening (done)

`public/index.html:3461-3485` (`loadPendingReviews`) was hardened to spec:

- Check `response.ok` before calling `.json()`.
- Check `Content-Type` includes `application/json`.
- Throw a descriptive `Error` (including HTTP status and user-friendly advice) on non-OK/non-JSON responses.
- Continue routing all errors through the existing `catch` block, which calls `showToast` and `console.error`.

Existing rendering logic is unchanged.

### T-0052 — Regression tests (done)

- Ran `bash tests/run-tests.sh`.
- Result: `18/18` pass, exit code `0`.

### T-0053 — AC verification (done)

- Launched local instance via `bash scripts/dev-launch.sh` on port `3001`.
- Verified `GET /api/reviews` returns HTTP 200 JSON (locally seeded review + production empty-array probe).
- Verified no `SyntaxError` in browser console on page load / panel expansion.
- Verified structured error path: simulated HTTP 404 text/html response surfaced a user-friendly `showToast` error without JSON parse error.
- Verified Pending Reviews panel renders with transaction summary, history category + confidence, AI category + confidence, recommended choice, and Accept/Reject actions.
- Evidence saved in `sprints/S0009/qa-evidence/T-0053-evidence.md`.

## Acceptance criteria status

| AC | Status | Notes |
|----|--------|-------|
| AC-1 — Page load: no `GET /api/reviews 404` and no `SyntaxError` | pass | Verified on local instance; production probe also returned JSON 200. |
| AC-2 — `GET /api/reviews` returns HTTP 200 JSON when healthy | pass | Production: empty array; local: array with seeded review. |
| AC-3 — Structured `{success:false,error:...}` surfaced without JSON parse error | pass | Synthetic 404 text/html test passed. |
| AC-4 — Pending Reviews panel renders items correctly | pass | UI elements present; sample data rendered all expected fields. |

## Files changed

- `public/index.html`
- `sprints/S0009/tasks/T-0050.json`
- `sprints/S0009/tasks/T-0051.json`
- `sprints/S0009/tasks/T-0052.json`
- `sprints/S0009/tasks/T-0053.json`
- `sprints/S0009/execution-summary.md`
- `sprints/S0009/qa-evidence/T-0053-evidence.md`
- `handoffs/dev_to_qa.md` (this file)
- `docs/engineering/state.md` (execute phase boundary)

## QA focus

1. **Production smoke test:** Reload the authenticated production admin UI and confirm no `404`/`SyntaxError` for `/api/reviews`.
2. **Real review data check:** If production has pending reviews, confirm the panel renders each item with the expected fields.
3. **Edge cases:** Verify behavior when `/api/reviews` returns structured `{success:false,error:...}`.
4. **Regression sanity:** Confirm `tests/run-tests.sh` still passes in the QA environment.

## Known issues / follow-ups

- DEC-0020’s tertiary recommendation (operational version/health probe to prevent stale-image regressions) remains deferred.
- Local service was stopped and `data/pending-category-reviews.json` restored to its pre-verification contents.

## Environment context

- Production container: `categorizer` in `/workdir/firefly/docker-compose.yml` stack, image `firefly-categorizer`, status `healthy`.
- Local ephemeral container was stopped after verification.

## Recommendation

Approve for QA. All planned execute tasks completed; no blockers.
