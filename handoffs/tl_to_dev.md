# Tech Lead → Dev handoff: BUG-0002 / Sprint S0009

## Work item

- **Bug:** BUG-0002 — Pending Reviews endpoint returns HTTP 404 HTML → `loadPendingReviews` JSON parse error
- **Sprint:** S0009
- **Decision:** DEC-0020 — Stale-image remediation + defensive fetch handling
- **Next phase:** plan-verify

## Root cause and fix strategy

H1 confirmed: the production `categorizer` container is running a stale `firefly-categorizer:latest` image built before US-0004, so `GET /api/reviews` is not present at runtime. The route already exists in current source (`src/App.js:198-201`, `#onGetReviews` at `src/App.js:1467-1475`), so no backend code changes are required.

Three-tier fix (DEC-0020):

1. **Primary:** Rebuild and recreate the production container from `/workdir/firefly/docker-compose.yml` with `--build --force-recreate categorizer`.
2. **Secondary:** Harden `public/index.html:3461-3485` (`loadPendingReviews`) to guard `response.ok` and response `Content-Type` before parsing JSON, and surface structured errors via `showToast`.
3. **Tertiary (deferred):** Add an operational version/health probe to prevent stale-image regressions.

## Sprint tasks

| Task | Title | Dependencies | ACs |
|------|-------|--------------|-----|
| T-0050 | Production redeploy and verify `/api/reviews` | — | AC-1, AC-2 |
| T-0051 | Defensive UI hardening in `loadPendingReviews` | — | AC-1, AC-3 |
| T-0052 | Regression test run after UI change | T-0051 | AC-1 (stability) |
| T-0053 | Verify all four BUG-0002 acceptance criteria | T-0050, T-0051, T-0052 | AC-1–AC-4 |

## Execution order

- **Phase 1 (parallel):** T-0050 and T-0051 can run independently; the live `public/` bind-mount means the UI change takes effect without a container restart.
- **Phase 2 (validation):** T-0052 then T-0053.

## Constraints

- Do **not** modify `src/App.js`, the Docker compose file, or any backend route code.
- Production redeploy command must be run from `/workdir/firefly` against the parent stack:
  ```bash
  docker compose -f /workdir/firefly/docker-compose.yml up -d --build --force-recreate categorizer
  ```
- Internal probe must return HTTP 200 JSON before declaring T-0050 done.
- Keep `console.error` intact for diagnostics; only the toast message is user-friendly.

## Key files

- `decisions/DEC-0020.md`
- `docs/engineering/architecture.md` (BUG-0002 section)
- `docs/product/acceptance.md` (BUG-0002 ACs)
- `public/index.html:3461-3485` — `loadPendingReviews`
- `/workdir/firefly/docker-compose.yml` — production deployment target
- `sprints/S0009/tasks/T-0050.json` through `T-0053.json`

## Verification targets

- Browser console shows no `GET /api/reviews 404` and no `SyntaxError` on page load.
- `GET /api/reviews` returns JSON `{success:true,reviews:[...]}` on a healthy deployment.
- Structured `{success:false,error:...}` responses are surfaced in the UI without JSON-parse jargon.
- Pending Reviews panel renders each item with transaction summary, history + AI categories with confidence, recommended choice, and Accept/Reject actions.

## Risks carried forward

- **RA-1:** `--build --force-recreate` may still use a cached layer — verify internal probe before declaring T-0050 done.
- **RA-2:** Basic Auth may block external probe — use authenticated session or supply credentials.
- **RA-4:** Future `src/` changes can be missed because of `restart: unless-stopped` + live `public/` mount — any `src/` change must trigger a rebuild.
