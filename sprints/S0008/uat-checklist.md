# Sprint S0008 — UAT Checklist

**Phase:** qa → verify-work handoff
**Sprint:** S0008 (US-0006)
**Date:** 2026-06-22
**Status:** Ready for operator / agent manual verification
**Prerequisite:** QA findings PASS (see `sprints/S0008/qa-findings.md`)

This checklist is for the operator (or agent running under the Cursor IDE) to perform the browser MCP UAT probe that was deferred during QA (requires interactive Cursor IDE session for browser MCP).

---

## Pre-flight

- [ ] **1. Port 3001 is free**
  ```bash
  lsof -i :3001
  # Should return nothing
  ```

- [ ] **2. .env populated**
  ```bash
  [ -s .env ] && grep -E '^(FIREFLY_URL|FIREFLY_PERSONAL_TOKEN|OPENAI_API_KEY)=' .env
  # All 3 lines should show non-empty values
  ```

- [ ] **3. Docker daemon healthy**
  ```bash
  docker info >/dev/null 2>&1 && echo "Docker OK" || echo "Docker NOT OK"
  ```

---

## Launch

- [ ] **4. Run the dev-launch script**
  ```bash
  bash scripts/dev-launch.sh
  ```
  Expected:
  - Port pre-check passes
  - Image built (or reused, fast)
  - Container `firefly-ai-categorizer-local` starts
  - Health poll: `Service healthy after ~2s (HTTP 200).`
  - Exit 0

- [ ] **5. Verify service is running**
  ```bash
  docker compose -f docker-compose.local.yml ps
  # Should show firefly-ai-categorizer-local running (healthy)
  ```

- [ ] **6. Confirm HTTP root responds**
  ```bash
  curl -sI http://localhost:3001/ | head -1
  # HTTP/1.1 200 OK
  ```

---

## API evidence (browser-safe, proven in QA but re-confirm)

- [ ] **7. GET /api/reviews — valid JSON**
  ```bash
  curl -s http://localhost:3001/api/reviews | python3 -c "import json,sys; print(json.load(sys.stdin))"
  # Expected: {'success': True, 'reviews': [...]} — valid JSON, NOT HTML
  ```

- [ ] **8. GET /api/categories — valid JSON (structured or error)**
  ```bash
  curl -s http://localhost:3001/api/categories | python3 -c "import json,sys; print(json.load(sys.stdin))"
  # Expected: {'success': True, 'categories': [...]} OR {'success': False, 'error': '<msg>'}
  # Must NOT crash with JSON parse error
  ```

---

## Browser MCP UAT probe (Cursor IDE)

The following steps require an interactive Cursor IDE session with browser MCP enabled.

- [ ] **9. Open browser tab to localhost:3001**
  - Navigate to `http://localhost:3001/` via browser MCP
  - Confirm admin UI loads (no 404, no HTML error page)

- [ ] **10. Capture console errors**
  - Via CDP: `Runtime.enable` + `Log.enable`
  - Collect console errors for ~5 seconds after load
  - Expected: no `Unexpected token '<'` JSON parse errors
  - (If any errors, record them — expected baseline is empty or minimal warnings)

- [ ] **11. Probe /api/reviews via CDP**
  - `Runtime.evaluate`: `fetch('/api/reviews').then(r => r.json()).then(d => JSON.stringify(d))`
  - Expected: valid JSON string containing `{"success": true, "reviews": [...]}`
  - No exception thrown

- [ ] **12. Probe /api/categories via CDP**
  - `Runtime.evaluate`: `fetch('/api/categories').then(r => r.json()).then(d => JSON.stringify(d))`
  - Expected: valid JSON string (may be success:true with categories, or success:false with structured error)
  - No exception thrown

---

## Teardown

- [ ] **13. Stop the local service**
  ```bash
  bash scripts/dev-launch.sh --stop
  # Expected: exit 0, "Service stopped."
  ```

- [ ] **14. Confirm cleanup**
  ```bash
  ss -tlnp | grep :3001
  # Should return nothing (port freed)
  docker compose -f docker-compose.local.yml ps
  # Should return empty list (container removed)
  ```

---

## Evidence collection

After completing each item above, record:

| Step | Method | Evidence (what to capture) |
|------|--------|----------------------------|
| 7 | curl | Response body (JSON) |
| 8 | curl | Response body (JSON) |
| 10 | CDP screenshot | Console errors (empty expected) |
| 11 | CDP evaluate | JSON string result |
| 12 | CDP evaluate | JSON string result |

Save evidence to `sprints/S0008/qa-evidence/` (create if missing).

---

## Acceptance gate (verify-work)

After completing this checklist:

- If all browser MCP probes succeed with valid JSON responses → mark US-0006 AC-5 as fully executed (browser probe completed)
- If any probe fails or hangs → record details and create `handoffs/qa_to_dev.md` with failure mode and rollback path

---

## Rollback (if things go wrong)

```bash
# Hard reset if service misbehaves
bash scripts/dev-launch.sh --stop
docker compose -f docker-compose.local.yml down -v  # if volumes need reset
lsof -i :3001  # verify port freed

# Check logs for errors
docker compose -f docker-compose.local.yml logs --tail=50

# Force rebuild if image suspect
docker compose -f docker-compose.local.yml build --no-cache
```

---

## References

- User guide: `docs/user-guides/US-0006.md`
- Runbook local launch section: `docs/engineering/runbook.md` (§ Local agent-driven Categorizer launch)
- Runbook browser UAT workflow: `docs/engineering/runbook.md` (§ Browser UAT probe workflow)
- Decision DEC-0018: standalone compose with explicit `-f`
- Decision DEC-0019: schema_version 1 additive extensions
- Research R-0023: agent-driven local Categorizer launch (questions Q1-Q7)
- QA findings: `sprints/S0008/qa-findings.md`

---

**End of UAT checklist.**
