# Sprint Release Notes — S0002

**Sprint:** S0002  
**Date:** 2026-06-13  
**Work item:** BUG-0001  
**Queue status:** released  
**Release version:** 1.0.0 (app `package.json`; no registry publish)

---

## Summary

Fix category dropdown JSON-parse failure when Firefly returns HTML instead of JSON.

**Changes:**

- `src/FireflyService.js` — `Accept: application/json` + content-type guard in `getCategories()`
- `src/App.js` — structured `{ success, categories | error }` from `GET /api/categories`
- `public/index.html` — dropdown loaders surface backend error text via `truncateDropdownError()`

**Verified in sprint:** AC-1, AC-2, AC-3 (mock + browser on updated code, port 3001).  
**Deferred to operator:** AC-4 healthy-path dropdown population; T-0004 webhook/bulk regression.

---

## Gate results

1. **Check-in test gate:** PASS (substitute — execute/QA mock + browser evidence; `tests/report.md` absent)
2. **QA completion gate:** PASS
3. **UAT completeness gate:** PASS (3 pass, 0 fail, 2 deferred)
4. **Isolation compliance gate:** PASS
5. **Strict runtime proof gate:** PASS
6. **Release finalization gate:** PASS

---

## Run

- `start_command`: `cd /workdir/firefly && docker compose build categorizer && docker compose up -d categorizer`
- `runtime_mode`: `local` (Docker on operator host; parent stack at `/workdir/firefly`)
- `runtime_context_ref`: `docs/engineering/runtime-connectivity.md`, `docker-compose.yml` (deprecated standalone note)

Alternative local dev (not production):

- `PORT=3001 node index.js` — ephemeral QA instance with workspace source bind-mount

---

## Connect

- `service_url`: `http://localhost:3000/` (production `categorizer` container)
- `service_port`: `3000`
- `health_endpoint`: `GET http://localhost:3000/health` (HTTP 200)

Ingress (when Traefik enabled on parent stack): `categorizer.omniflow.cc`

---

## Verify

- `verification_steps`:
  1. Redeploy: `cd /workdir/firefly && docker compose build categorizer && docker compose up -d categorizer`
  2. Health: `curl -sf http://localhost:3000/health` → HTTP 200
  3. Misconfigured path: `curl -s http://localhost:3000/api/categories` → JSON with `success` field (not raw parse error)
  4. Browser: open admin UI → Keyword Mappings + Account Mappings → no `Unexpected token <` in console
  5. With valid PAT: confirm category `<select>` elements list Firefly categories (AC-4)
  6. Run Test Webhook smoke → category resolution succeeds (T-0004 row 5)
- `expected_health_signal`: HTTP 200 from `/health`; `GET /api/categories` returns structured JSON; console free of JSON-parse errors on page load

---

## Credentials

- `credential_source_refs` (env names only):
  - `FIREFLY_URL`
  - `FIREFLY_PERSONAL_TOKEN`
  - `OPENAI_API_KEY` (categorization paths; not required for category dropdown UAT)
  - `PORT` (optional; default `3000`)
- `expected_value_source`:
  - Parent stack `.env` or deployment platform variable set for `categorizer` service
  - Operator shell profile after sourcing deployment env (never commit secrets)

---

## Known Issues

- Stale `categorizer` image on port 3000 may still serve pre-fix code until redeploy (**RUNTIME_DEPLOYMENT_STALE**).
- AC-4 and webhook/bulk regression unverified without operator PAT — see operator checklist in `sprints/S0002/uat.md`.
- No automated test suite (`US-0001` open); `npm test` exits 1 by design until harness lands.

---

## Operator post-release checklist

1. Rebuild/restart `categorizer` on port 3000 (command above).
2. Set valid `FIREFLY_URL` + `FIREFLY_PERSONAL_TOKEN` in deployment env.
3. Confirm keyword + account-mapping dropdowns populate (AC-4).
4. Run Test Webhook smoke (T-0004 row 5).
5. Close BUG-0001 in backlog when AC-4 passes.

---

## Queue linkage

- `handoffs/release_queue.md` row `S0002` → this file via `release_notes_ref`
- `RELEASE_PUBLISH_MODE=disabled` — no npm/registry publish executed
