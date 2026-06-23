# Sprint S0007 Tasks — US-0005 Admin UI Consolidation

## Task Overview

| ID | Title | Dependencies | Complexity | Status |
|----|-------|--------------|------------|--------|
| T-0032 | Create unified panel-categorization DOM structure | — | medium | pending |
| T-0033 | Move Test Webhook form into unified panel | — | low | pending |
| T-0034 | Update setupSidePanel() sidebar entries | — | low | pending |
| T-0035 | Remove auto-jump code; replace stale copy | — | low | pending |
| T-0036 | Add CSS for segmented scope control | — | low | pending |
| T-0037 | Update Process button handlers to send scope | T-0032 | low | pending |
| T-0038 | Update Webhook handler to inherit scope | T-0032 | low | pending |
| T-0039 | Backend: accept scope field and apply filter | T-0037, T-0038 | medium | pending |

---

## T-0032: Create unified panel-categorization DOM structure

**Goal:** Create a single unified panel-categorization that replaces panel-manual, panel-batch, and panel-individual.

**Acceptance Criteria:** AC-1, AC-2, AC-4  
**Decision References:** DEC-0015  
**Dependencies:** None  
**Complexity:** Medium  
**Files:** `public/index.html`

**Requirements:**
1. Create `<div id="panel-categorization">` containing:
   - Scope selector section (segmented control placeholder)
   - Run actions section with three buttons:
     - `<button id="btn-process-uncategorized">Process Uncategorized</button>`
     - `<button id="btn-process-all">Process All</button>`
     - `<button id="btn-test-webhook">Test Webhook</button>`
   - Progress display section (shared)
   - Job monitor section with two sub-containers:
     - `<div id="batch-mount"></div>` for batch jobs
     - `<div id="mount"></div>` for individual jobs
2. Preserve existing DOM IDs for Socket.io routing (mount, batch-mount)
3. Remove panel-manual, panel-batch, panel-individual sections
4. Maintain all existing button IDs and event handler references

**Notes:**
- Socket.io handlers already route to correct containers — no handler changes needed
- This is the structural foundation for T-0033, T-0037, T-0038
- Batch controls (pause/resume/cancel) must remain functional

**Done When:**
- Unified panel renders with all required sections
- Socket.io events route to correct containers
- Batch controls functional
- No JavaScript errors in console

---

## T-0033: Move Test Webhook form into unified panel

**Goal:** Move the Test Webhook form from the Maintenance group into the unified panel-categorization.

**Acceptance Criteria:** AC-2  
**Decision References:** DEC-0017  
**Dependencies:** None  
**Complexity:** Low  
**Files:** `public/index.html`

**Requirements:**
1. Move Test Webhook form HTML from Maintenance section to panel-categorization
2. Remove `<select id="test-type">` element (test-type select)
3. Wrap form in `<details>` element for collapsible behavior:
   ```html
   <details style="margin-bottom: 15px;">
       <summary>Test Webhook Configuration</summary>
       <div class="test-form">
           <!-- form fields -->
       </div>
   </details>
   ```
4. Preserve input fields:
   - `<input id="test-description">` (description)
   - `<input id="test-destination">` (destination_name)
5. Form collapsed by default

**Notes:**
- Form inherits scope from panel selector (DEC-0016)
- When scope is "Both", backend defaults to "withdrawal" for single test
- test-type select removal documented in user guide (AC-8)

**Done When:**
- Test Webhook form appears in unified panel
- Form is collapsible (collapsed by default)
- test-type select removed
- Input fields preserved

---

## T-0034: Update setupSidePanel() sidebar entries

**Goal:** Update sidebar navigation to replace 3 separate entries with single Categorization entry.

**Acceptance Criteria:** AC-1, AC-7  
**Decision References:** DEC-0015  
**Dependencies:** None  
**Complexity:** Low  
**Files:** `public/index.html`

**Requirements:**
1. In `setupSidePanel()` function, update Categorizer group:
   - Remove entries: panel-manual, panel-batch, panel-individual
   - Add entry: panel-categorization with label "Categorization"
   - Preserve entry: panel-reviews (US-0004) as separate entry
2. Remove Test Webhook entry from Maintenance group:
   - Remove: panel-webhook
3. Maintain group structure:
   - Categorizer group
   - Special tools group
   - Maintenance group
4. Preserve collapsible-section interaction model

**Notes:**
- Sidebar Categorizer group: 10 entries → 8 entries
- panel-reviews (US-0004) must remain reachable

**Done When:**
- Sidebar shows single "Categorization" entry in Categorizer group
- Test Webhook entry removed from Maintenance group
- panel-reviews entry preserved
- Collapsible sections functional

---

## T-0035: Remove auto-jump code; replace stale copy

**Goal:** Remove auto-jump behavior and update stale copy references.

**Acceptance Criteria:** AC-5  
**Decision References:** None  
**Dependencies:** None  
**Complexity:** Low  
**Files:** `public/index.html`

**Requirements:**
1. Remove auto-jump code at line 1551:
   - Remove: `window.__showPanel('panel-batch')`
2. Remove auto-jump code at line 1573:
   - Remove: `window.__showPanel('panel-batch')`
3. Replace stale copy at line 1617:
   - Old: "Check the individual jobs section below."
   - New: "See job monitor below."

**Notes:**
- Auto-jump no longer needed since run actions and job monitor are in same panel
- Toast notification may replace auto-jump for progress visibility (future enhancement)
- Operator should stay on unified panel after starting bulk run

**Done When:**
- No panel switching after starting bulk operations
- Stale copy replaced
- Operator remains on unified panel

---

## T-0036: Add CSS for segmented scope control

**Goal:** Add CSS styles for segmented scope control (radio pills styled as buttons).

**Acceptance Criteria:** AC-3  
**Decision References:** DEC-0016  
**Dependencies:** None  
**Complexity:** Low  
**Files:** `public/index.html`

**Requirements:**
1. Add CSS for `.scope-selector` container
2. Add CSS for `.segmented-control` wrapper
3. Add CSS for `.scope-pill` labels:
   - Hidden radio inputs
   - Labels styled as connected buttons
   - Active pill has filled background
   - Inactive pills have border/outline
4. Add responsive styles for mobile viewports
5. Default selection: withdrawals (first pill)

**HTML Structure:**
```html
<div class="scope-selector">
    <label>Transaction Scope:</label>
    <div class="segmented-control">
        <label class="scope-pill">
            <input type="radio" name="categorization-scope" value="withdrawals" checked>
            Withdrawals
        </label>
        <label class="scope-pill">
            <input type="radio" name="categorization-scope" value="deposits">
            Deposits
        </label>
        <label class="scope-pill">
            <input type="radio" name="categorization-scope" value="both">
            Both
        </label>
    </div>
    <p>Honors "Skip Deposits" from General Settings when scope is "Both".</p>
</div>
```

**Notes:**
- Segmented control pattern: radio inputs hidden, labels styled as connected buttons
- Active pill: filled background (e.g., primary color)
- Inactive pills: border/outline style
- Visual consistency with existing UI theme

**Done When:**
- Scope control renders as segmented pills
- Active state visually distinct
- Responsive on mobile viewports
- Default selection: withdrawals

---

## T-0037: Update Process button handlers to send scope

**Goal:** Update btn-process-uncategorized and btn-process-all handlers to read scope value and send scope field in POST body.

**Acceptance Criteria:** AC-3, AC-6  
**Decision References:** DEC-0016  
**Dependencies:** T-0032  
**Complexity:** Low  
**Files:** `public/index.html`

**Requirements:**
1. In btn-process-uncategorized click handler:
   - Read scope: `const scope = document.querySelector('input[name="categorization-scope"]:checked').value;`
   - Include in POST body: `body: JSON.stringify({ scope: scope })`
2. In btn-process-all click handler:
   - Read scope: `const scope = document.querySelector('input[name="categorization-scope"]:checked').value;`
   - Include in POST body: `body: JSON.stringify({ scope: scope })`
3. Preserve existing POST endpoints:
   - `/api/process-uncategorized`
   - `/api/process-all`

**Scope Values:**
- `withdrawals` — process withdrawals only
- `deposits` — process deposits only
- `both` — process both, honor auto-skip-deposits config

**Notes:**
- Scope field is additive and optional
- Existing callers without scope are unaffected (backward compatible)
- Backend receives optional scope field (T-0039)

**Done When:**
- Process buttons read scope from segmented control
- POST body includes scope field
- Existing functionality preserved

---

## T-0038: Update Webhook handler to inherit scope

**Goal:** Update btn-test-webhook handler to inherit scope from panel selector and send scope field.

**Acceptance Criteria:** AC-3, AC-6  
**Decision References:** DEC-0017  
**Dependencies:** T-0032  
**Complexity:** Low  
**Files:** `public/index.html`

**Requirements:**
1. In btn-test-webhook click handler:
   - Read scope: `const scope = document.querySelector('input[name="categorization-scope"]:checked').value;`
   - Remove any reference to `test-type` select element
   - Include in POST body: `body: JSON.stringify({ description: ..., destination_name: ..., scope: scope })`
2. Preserve POST endpoint: `/api/test-webhook`
3. Preserve input fields:
   - `test-description` → `description`
   - `test-destination` → `destination_name`

**Scope → Webhook Type Mapping:**
- `withdrawals` → `withdrawal`
- `deposits` → `deposit`
- `both` → `withdrawal` (default for single test)

**Notes:**
- Backward compatible: `transaction_type` field still accepted by backend
- test-type select removed in T-0033
- Backend maps scope to transaction_type (T-0039)

**Done When:**
- Webhook handler reads scope from segmented control
- POST body includes scope field
- test-type references removed
- Existing functionality preserved

---

## T-0039: Backend: accept scope field and apply filter logic

**Goal:** Update backend handlers to accept optional scope field and apply transaction type filtering.

**Acceptance Criteria:** AC-3, AC-6  
**Decision References:** DEC-0016, DEC-0017  
**Dependencies:** T-0037, T-0038  
**Complexity:** Medium  
**Files:** `src/App.js`

**Requirements:**

### 1. #processUncategorizedTransactions(scope = null)
- Accept optional `scope` parameter from `req.body.scope`
- Apply filter logic:
  ```javascript
  if (scope === 'withdrawals') {
      transactions = transactions.filter(tx => tx.attributes.transactions[0].type !== 'deposit');
  } else if (scope === 'deposits') {
      transactions = transactions.filter(tx => tx.attributes.transactions[0].type === 'deposit');
  } else if (scope === 'both' || scope === null) {
      // Honor auto-skip-deposits config
      if (autoConfig.skipDeposits) {
          transactions = transactions.filter(tx => tx.attributes.transactions[0].type !== 'deposit');
      }
  }
  ```

### 2. #processAllTransactions(scope = null)
- Same filter logic as #processUncategorizedTransactions

### 3. #onTestWebhook(req, res)
- Read `req.body.scope`
- Map scope to transaction_type:
  ```javascript
  let testType;
  if (req.body?.scope) {
      const scopeMap = { withdrawals: 'withdrawal', deposits: 'deposit', both: 'withdrawal' };
      testType = scopeMap[req.body.scope] || 'withdrawal';
  } else {
      testType = req.body?.transaction_type || "withdrawal";  // backward compat
  }
  ```

**Scope → Filter Mapping:**
| Scope | skipDeposits override | Filter behavior |
|-------|----------------------|-----------------|
| `withdrawals` | Force true | Only withdrawals processed |
| `deposits` | Force false; exclude withdrawals | Only deposits processed |
| `both` | Honor saved config | If skipDeposits=true → withdrawals only; if false → all |
| `null` (absent) | Honor saved config | Existing behavior preserved |

**Notes:**
- Scope field is optional and additive
- Absent scope → existing behavior (backward compatible)
- Existing API callers unaffected (AC-6)
- Filter logic applies to transaction type field in Firefly API response

**Done When:**
- Backend accepts optional scope field in POST body
- Filter logic applies correct transaction type filtering
- Webhook handler maps scope to transaction_type
- Existing functionality preserved (backward compatible)

---

## Execution Order

**Phase 1: Parallel Foundation (no dependencies)**
- T-0032: Create unified panel structure
- T-0033: Move Test Webhook form
- T-0034: Update sidebar entries
- T-0035: Remove auto-jump code
- T-0036: Add scope control CSS

**Phase 2: Frontend Integration (depends on T-0032)**
- T-0037: Update Process button handlers
- T-0038: Update Webhook handler

**Phase 3: Backend Integration (depends on T-0037, T-0038)**
- T-0039: Backend scope field handling

---

## Testing Checklist

**Manual Regression Tests:**
- [ ] Unified panel renders correctly
- [ ] Scope control switches between Withdrawals / Deposits / Both
- [ ] Process Uncategorized sends correct scope in POST
- [ ] Process All sends correct scope in POST
- [ ] Test Webhook form is collapsible
- [ ] Test Webhook sends correct scope in POST
- [ ] Backend filters transactions by scope
- [ ] Socket.io events route to correct containers (mount, batch-mount)
- [ ] Batch controls (pause/resume/cancel) functional
- [ ] Sidebar shows single Categorization entry
- [ ] No auto-jump after starting bulk operations
- [ ] Existing API callers work without scope field (backward compatible)

---

## References

- Architecture: `docs/engineering/architecture.md` (# US-0005)
- Decisions: `decisions/DEC-0015.md`, `decisions/DEC-0016.md`, `decisions/DEC-0017.md`
- Research: `docs/engineering/research.md` (R-0022)
- Acceptance: `docs/product/acceptance.md` (US-0005 AC-1–AC-8)
- Handoff: `handoffs/tl_to_dev.md` (US-0005 section)
