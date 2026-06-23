# CRS — US-0004 Account history suggestions with AI comparison and review queue

# Purpose

Improve categorization accuracy by leveraging expense-account category history
while keeping the operator in control: compare history-based dominance with AI,
show confidence, and require explicit approval before applying.

# Scope

**In:** Per-account history aggregation from Firefly, configurable dominance
threshold (default 80%), AI comparison, confidence display, pending-review queue,
Accept/Reject UI, REST API, integration with webhook/bulk paths (queue only, no
silent assign).

**Out:** Payee/merchant-level history, automatic apply without approval, fine-tuned
learning from corrections.

# Acceptance criteria ref

See `docs/product/acceptance.md` § US-0004 (AC-1 through AC-8).
