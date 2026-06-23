# CRS — US-0001 Bootstrap automated test harness

# Purpose

Enable safe refactoring and CI verification by adding an automated test suite
for the categorization pipeline and wiring it into the runbook/CI path.

# Scope

**In:** Test runner script(s), mocked Firefly/OpenAI tests for `#resolveCategory`
precedence, runbook `TEST_COMMAND` update, npm test delegation.

**Out:** Live integration tests against Firefly/OpenAI, App.js route extraction,
browser/UI tests.

# Acceptance criteria ref

See `docs/product/acceptance.md` § US-0001 (AC-1 through AC-5).
