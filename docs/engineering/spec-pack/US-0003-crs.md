# CRS — US-0003 OpenAI Structured Outputs migration

# Purpose

Improve classification reliability and reduce parse/retry failures by adopting
OpenAI Structured Outputs with schema-locked category responses (per R-0002).

# Scope

**In:** OpenAiService migration, enum-constrained category field, regression
tests from US-0001, model env compatibility.

**Out:** Fine-tuning, alternative LLM providers, prompt UI changes.

# Acceptance criteria ref

See `docs/product/acceptance.md` § US-0003 (AC-1 through AC-5).
