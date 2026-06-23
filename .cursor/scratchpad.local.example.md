# its-magic scratchpad (framework default catalog — Model B / DEC-0055)
#
# Copy this file to `.cursor/scratchpad.local.md` for personal overrides (gitignored).
# Merge precedence: local > materialized `.cursor/scratchpad.md` > this example
# (installers materialize the baseline from template when missing).
#
# Core behavior
# - MAGIC_CONTEXT_STRICT: 0|1 (require context refresh after code changes)
# - LOOP_UNTIL_GREEN: 0|1 (optional test loop)
# - RUN_TESTS_ON_EDIT: 0|1 (run tests after edits)
# - AUTO_IMPLEMENTATION_LOOP: 0|1 (auto cycle execute->qa->execute)
# - AUTO_LOOP_MAX_CYCLES: integer >= 1 (safety guard)
# - AUTO_PAUSE_REQUEST: 0|1 (request graceful stop at next safe boundary)
# - AUTO_PAUSE_POLICY: after_task|after_phase (safe stop boundary)
# - DONE: 0|1 (stop hook loops)
MAGIC_CONTEXT_STRICT=1
LOOP_UNTIL_GREEN=0
RUN_TESTS_ON_EDIT=0
AUTO_IMPLEMENTATION_LOOP=0
AUTO_LOOP_MAX_CYCLES=5
AUTO_PAUSE_REQUEST=0
AUTO_PAUSE_POLICY=after_phase
DONE=0
#
# Benchmarking
# - MAGIC_BENCH_SESSION: free-form id for live benchmark logging
MAGIC_BENCH_SESSION=
#
# Automation
# - AUTO_FLOW_MODE: manual|auto_until_decision|full_autonomy
#   - manual: operator invokes phases explicitly (default when unset)
#   - auto_until_decision: continuous until decision_gate
#   - full_autonomy: outer-driver loop + relaxable transient stops + drain-without-pause (default-off; US-0092 / DEC-0078)
#   - opt-in enablement: AUTO_FLOW_MODE=full_autonomy
# - AUTO_BLOCK_RETRY_MAX: integer >= 1 (default 3; per (story_id, stop_reason) recoverable retries before BLOCK_RETRY_CAP_EXHAUSTED)
# - AUTO_OUTER_DRIVER_TIMEOUT_SECONDS: optional integer; unset = no hook timeout (timeout -> exit 124)
# Interaction (full_autonomy): PHASE_MODE/PERMISSION_MODE orthogonal; AUTO_BACKLOG_DRAIN/AUTO_BUG_QUEUE per US-0044/US-0087;
#   AUTO_LOOP_MAX_CYCLES/AUTO_BACKLOG_MAX_STORIES hard caps; TOKEN_PROFILE = context breadth / token cost only (DEC-0062 / US-0092).
# - PHASE_MODE: interactive|auto
# - PERMISSION_MODE: interactive|auto
# - AUTO_INSTALL_DEPS: 0|1
# - AUTO_RELEASE_NOTES: 0|1
# - AUTO_BACKLOG_DRAIN: 0|1 (continue across multiple stories when enabled)
# - AUTO_BACKLOG_MAX_STORIES: integer >= 1 (max stories per auto run when drain enabled)
# - AUTO_BACKLOG_ON_BLOCK: stop|skip (behavior when a story blocks)
# - AUTO_STORY_SELECTION: priority_then_backlog_order
# - AUTO_EXECUTE_BULK: 0|1 (explicit bulk execute orchestration mode)
# - AUTO_EXECUTE_MAX_ITEMS: integer >= 1 (max planned items per bulk execute run)
# - AUTO_EXECUTE_ON_BLOCK: stop|skip (behavior when a planned item blocks)
# - AUTO_EXECUTE_SELECTION: planned_then_priority
# - AUTO_TEAM_SCOPE_ENFORCE: 0|1 (when TEAM_MODE=1, enforce TEAM_MEMBER + ACTIVE_TASK_IDS)
# Optional bug-queue mode (US-0087) — default-off when absent/unset after merge
# - AUTO_BUG_QUEUE: 0|1 (1 = enable bug-targeted /auto; mutex vs AUTO_BACKLOG_DRAIN without bug-target argv)
# - AUTO_BUG_TARGET: all-open|BUG-#### (required when AUTO_BUG_QUEUE=1 unless bug-target= argv supplies target)
# - AUTO_BUG_MAX_ITEMS: non-negative integer (0 or unset = no cap for all-open queue per run)
# - AUTO_BUG_ON_BLOCK: stop|skip (bug segment pause/stop boundary)
# Quiet mode (US-0088) — suppress routine per-phase success chatter only
# - AUTO_QUIET: 0|1 (default 0; 1 = quiet routine notifications)
#   Non-suppressible: decision_gate, errors, pause, loop_max, blocked, missing inputs.
#   Orthogonal to TOKEN_PROFILE (DEC-0035 / US-0080) — TOKEN_PROFILE controls
#   context breadth / token cost, not notification policy.
AUTO_QUIET=0
AUTO_FLOW_MODE=auto_until_decision
PHASE_MODE=interactive
PERMISSION_MODE=interactive
AUTO_INSTALL_DEPS=0
AUTO_RELEASE_NOTES=1
AUTO_BACKLOG_DRAIN=0
AUTO_BACKLOG_MAX_STORIES=1
AUTO_BACKLOG_ON_BLOCK=stop
AUTO_STORY_SELECTION=priority_then_backlog_order
AUTO_EXECUTE_BULK=0
AUTO_EXECUTE_MAX_ITEMS=1
AUTO_EXECUTE_ON_BLOCK=stop
AUTO_EXECUTE_SELECTION=planned_then_priority
AUTO_TEAM_SCOPE_ENFORCE=1
AUTO_BUG_QUEUE=0
AUTO_BUG_TARGET=
AUTO_BUG_MAX_ITEMS=0
AUTO_BUG_ON_BLOCK=stop
AUTO_BLOCK_RETRY_MAX=3
#
# `/auto` phase role policy (US-0069 / DEC-0051)
# - AUTO_ROLE_RESEARCH: po|tech-lead (empty -> default tech-lead)
# - AUTO_ROLE_PLAN_VERIFY: qa|tech-lead (empty -> default qa)
# - AUTO_ROLE_REFRESH_CONTEXT: curator|po (empty -> default curator)
# - AUTO_EXECUTE_ROLE_OVERRIDE: empty or allowed_non_dev_execute (execute default is dev)
# - EXECUTE_OVERRIDE_GOVERNANCE_REF: parseable waiver pointer (DEC-xxxx / state anchor) when override set
AUTO_ROLE_RESEARCH=
AUTO_ROLE_PLAN_VERIFY=
AUTO_ROLE_REFRESH_CONTEXT=
AUTO_EXECUTE_ROLE_OVERRIDE=
EXECUTE_OVERRIDE_GOVERNANCE_REF=
#
# `/auto` phase selection policy (US-0070 / DEC-0052)
# Exactly one active mode after merge; conflict -> PHASE_POLICY_CONFLICT (no plan).
# - AUTO_PHASE_PLAN: unset or full (default full canonical lifecycle)
# - AUTO_PHASE_EXCLUDE: csv of canonical phase ids (exclude from full)
# - AUTO_PHASE_INCLUDE: csv of canonical phase ids (re-sorted to canonical order)
# - AUTO_PHASE_PROFILE: named profile (see /auto + DEC-0052; unknown -> fail closed)
# - AUTO_PHASE_HIGH_RISK_ACK: required token when a high-risk profile demands it
AUTO_PHASE_PLAN=
AUTO_PHASE_EXCLUDE=
AUTO_PHASE_INCLUDE=
AUTO_PHASE_PROFILE=
AUTO_PHASE_HIGH_RISK_ACK=
#
# Team mode
# - TEAM_MODE: 0|1 (enable task/member scoped team workflow)
# - TEAM_MEMBER: short id for current developer
# - ACTIVE_TASK_IDS: comma-separated task ids (for example T-12,T-13)
TEAM_MODE=0
TEAM_MEMBER=
ACTIVE_TASK_IDS=
#
# Sprint planning
# - SPRINT_MAX_TASKS: integer >= 1 (max atomic tasks per sprint, default 12)
# - SPRINT_AUTO_SPLIT: 0|1 (propose splitting when over threshold)
# - SPRINT_BULK_MAX_STORIES: integer >= 1 (candidate stories when /sprint-plan --bulk)
# - SPRINT_BULK_MAX_SPRINTS: integer >= 1 (generated sprints per /sprint-plan --bulk run)
# - SPRINT_BULK_SELECTION: priority_then_backlog_order
SPRINT_MAX_TASKS=12
SPRINT_AUTO_SPLIT=1
SPRINT_BULK_MAX_STORIES=5
SPRINT_BULK_MAX_SPRINTS=3
SPRINT_BULK_SELECTION=priority_then_backlog_order
#
# Remote execution (US-0086 / US-0084 / US-0064)
# - REMOTE_EXECUTION: 0|1
# - REMOTE_CONFIG: path to remote config
# - AUTO_REMOTE_AUTOMATION_PROFILE: off|deterministic_v1 (default off/manual-safe)
# - AUTO_REMOTE_ENVIRONMENT_LABEL: local|docker|ssh (names-only evidence label)
REMOTE_EXECUTION=0
REMOTE_CONFIG=.cursor/remote.json
AUTO_REMOTE_AUTOMATION_PROFILE=off
AUTO_REMOTE_ENVIRONMENT_LABEL=local
#
# Sync policy
# - SYNC_POLICY_MODE: disabled|manual|by_phase|by_milestone|custom_phase_list
# - SYNC_CUSTOM_PHASES: comma-separated canonical phase IDs; only used when
#   SYNC_POLICY_MODE=custom_phase_list
# - ALLOW_AUTO_PUSH: 0|1 (default off; explicit opt-in required)
# - AUTO_PUSH_BRANCH_ALLOWLIST: comma-separated branches/patterns eligible for
#   auto-push. Protected/default branches are denied unless allowlisted.
SYNC_POLICY_MODE=manual
SYNC_CUSTOM_PHASES=
ALLOW_AUTO_PUSH=0
AUTO_PUSH_BRANCH_ALLOWLIST=
#
# Knowledge curation
# - EARLY_RESEARCH: 0|1 (PO/TL search web during intake/architecture)
# - INTAKE_GUIDED_MODE: 0|1 (guided intake follow-up/options/research behavior)
# - INTAKE_SUBAGENT_FALLBACK: deny|allow (deny by default; when deny, missing
#   role-specific intake subagent capability fails fast)
# - INTAKE_WORK_ITEM_KIND: story|bug (default story; bug selects BUG-#### path per DEC-0061 / US-0079)
# - ID_NAMESPACE_BOOTSTRAP: 0|1 (optional fresh-project ID bootstrap mode; when 1, allow first IDs to start at 0001 only if deterministic freshness checks pass)
# - TOKEN_PROFILE: lean|balanced|full (tiered token-cost profile defaults)
#   TOKEN_PROFILE controls context breadth / token cost only (DEC-0062 / US-0092).
#   - lean: lowest context breadth / token cost defaults
#   - balanced: default profile; moderate context breadth
#   - full: highest context breadth / token cost for complex work
# - STATE_HOT_MAX_LINES: integer >= 200 (hot-surface soft cap trigger for
#   archival rollover checks)
# - STATE_HOT_MAX_CHECKPOINTS: integer >= 10 (max recent checkpoints to retain
#   in `state.md` after rollover)
# - PO_TO_TL_HOT_MAX_LINES: integer >= 200 (handoff hot-surface line cap)
# - PO_TO_TL_HOT_MAX_SECTIONS: integer >= 10 (max top-level ## sections retained)
# - ARCH_HOT_MAX_LINES: integer >= 500 (architecture hot-surface line cap)
# - ARCH_HOT_MAX_STORY_SECTIONS: integer >= 20 (max # US-xxxx story sections retained)
# - Manual-override precedence: explicit flag values in this file remain authoritative
#   for that flag and override profile defaults.
#
# Delivery mode (US-0096 / DEC-0082)
# - DELIVERY_MODE: standard|ultra_lean|mega_quick (default standard; unset = standard)
# - LEAN_MEMORY_READ: 0|1 (default 1 when pack/active-context paths exist)
# - LEAN_MEMORY_WRITE: 0|1 (default 1 when pack/active-context paths exist)
# - LEAN_COLD_READ_MAX_SECTIONS: int >= 1 (default 4)
# - LEAN_STATE_INDEX_ROWS: int >= 30 (default 80)
# - AUTO_DELIVERY_ROUTING: scratchpad_only|backlog_then_scratchpad (default scratchpad_only)
# Tranche A default hot caps (US-0096): 1000/650/3000 — explicit values override.
DELIVERY_MODE=standard
LEAN_MEMORY_READ=1
LEAN_MEMORY_WRITE=1
LEAN_COLD_READ_MAX_SECTIONS=4
LEAN_STATE_INDEX_ROWS=80
AUTO_DELIVERY_ROUTING=scratchpad_only
EARLY_RESEARCH=1
INTAKE_GUIDED_MODE=1
INTAKE_SUBAGENT_FALLBACK=deny
INTAKE_WORK_ITEM_KIND=story
ID_NAMESPACE_BOOTSTRAP=0
TOKEN_PROFILE=balanced
STATE_HOT_MAX_LINES=1000
STATE_HOT_MAX_CHECKPOINTS=80
PO_TO_TL_HOT_MAX_LINES=650
PO_TO_TL_HOT_MAX_SECTIONS=60
ARCH_HOT_MAX_LINES=3000
ARCH_HOT_MAX_STORY_SECTIONS=120

# Publish targets (US-0054)
# - RELEASE_PUBLISH_MODE: disabled|confirm|auto
#   - disabled: skip post-release publish target execution
#   - confirm: require explicit operator confirmation before publish (default)
#   - auto: allow publish without confirmation (explicit opt-in)
# - RELEASE_TARGETS_FILE: canonical target config path
# - RELEASE_TARGETS_DEFAULT: comma-separated default target IDs (optional)
RELEASE_PUBLISH_MODE=confirm
RELEASE_TARGETS_FILE=docs/engineering/release-targets.json
RELEASE_TARGETS_DEFAULT=

#
# Security review
# - SECURITY_REVIEW: 0|1 (enable optional security/compliance review; default off)
# - COMPLIANCE_PROFILES: comma-separated values (GDPR,SOC2,HIPAA,PCI-DSS,ISO27001)
#   Empty value means general security best practices only.
#   When SECURITY_REVIEW=0, the workflow adds zero security-review overhead.
SECURITY_REVIEW=0
COMPLIANCE_PROFILES=GDPR

# Cross-repo compatibility observability
# - CROSS_REPO_OBSERVABILITY: 0|1 (enable compatibility visibility and checks)
# - COMPATIBILITY_GATE_ON_CRITICAL: 0|1 (when enabled, critical unresolved
#   compatibility findings trigger decision gate before release)
# - COMPATIBILITY_SOURCES: semicolon-separated sources
#   (repo=<path|url>,module=<id>,contract=<path|url>,docs=<path|url>)
CROSS_REPO_OBSERVABILITY=0
COMPATIBILITY_GATE_ON_CRITICAL=1
COMPATIBILITY_SOURCES=

# Component-scoped execution mode
# - COMPONENT_SCOPE_MODE: 0|1 (enable scoped planning/execution guardrails)
# - TARGET_COMPONENTS: comma-separated component IDs intended in scope
COMPONENT_SCOPE_MODE=0
TARGET_COMPONENTS=

# Optional spec-pack documentation (US-0031)
# - SPEC_PACK_MODE: 0|1 (enable Design Concept, CRS, Technical Spec generation/validation; default 0)
#   When 0, intake/architecture/release add no required spec-pack steps.
SPEC_PACK_MODE=0

# Optional user-guide documentation (US-0032)
# - USER_GUIDE_MODE: 0|1 (enable per-feature user guides at docs/user-guides/US-xxxx.md; default 0)
#   When 0, intake/architecture/sprint-plan/execute/qa/release add no required user-guide steps or blocking checks.
USER_GUIDE_MODE=0

# Documentation audience profile (DEC-0059)
# - DOC_AUDIENCE_PROFILE: user|developer|both (empty -> both during transition)
# - DOC_DETAIL_LEVEL: concise|balanced|technical-deep (empty -> balanced during transition)
DOC_AUDIENCE_PROFILE=both
DOC_DETAIL_LEVEL=balanced

# README feature coverage gate (US-0091 / DEC-0074)
# - README_FEATURE_COVERAGE_ENFORCE: 0|1 (default 0 until backfill + --report green)
README_FEATURE_COVERAGE_ENFORCE=1

#
# ## Project README coverage (US-0097 / DEC-0083)
# Project-owned root README bootstrap + per-story catalog growth.
# - PROJECT_README_ENFORCE: 0|1 (default 1 post-bootstrap)
#   When 0, /release step 3g skips (migration/grandfathering only). When 1, blocking.
#   Flip 0→1 only after validate_project_readme_coverage.py --report shows coverage_missing: [].
# - FRAMEWORK_KIT_REPO: 0|1 (default 0)
#   When 1 (its-magic dev kit repo only), skip execute 23a/23b and project validator root check.
#   Consumer repos never set FRAMEWORK_KIT_REPO=1.
PROJECT_README_ENFORCE=1
FRAMEWORK_KIT_REPO=0

#
# ## Browser UAT self-test (US-0093 / DEC-0079)
# Two-tier browser probe: stdlib lib classifies + agent owns Cursor browser MCP (BUG-0006).
# - UAT_BROWSER_PROBE_MODE: cursor|http_fallback|playwright_fallback (default cursor)
#   - cursor: agent executes MCP sequence; lib emits plan + UAT_PROBE_UNRESOLVED until evidence
#   - http_fallback: stdlib HTTP GET (CI recipe — set this in CI)
#   - playwright_fallback: subprocess Playwright primary; HTTP fallback when missing
# - UAT_BROWSER_FALLBACK_CHAIN: 0|1 (default 1; enable HTTP → Playwright after MCP unavailable)
# - UAT_PROCESS_HEALTH_POLL_SECONDS: positive int (default 60; process_health readiness cap)
# - UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS: positive int (default 2; poll interval)
# - DEV_SERVER_PORT: int (optional; URL/port inference override)
# - DEV_SERVER_COMMAND: shell command (optional; process_health startup override)
# Interaction: orthogonal to PERMISSION_MODE and Cursor browser approval modes (manual / allow-list /
#   auto-run per vendor docs). Health URLs from docs/engineering/runtime-connectivity.md first.
UAT_BROWSER_PROBE_MODE=cursor
UAT_BROWSER_FALLBACK_CHAIN=1
UAT_PROCESS_HEALTH_POLL_SECONDS=60
UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS=2
DEV_SERVER_PORT=
DEV_SERVER_COMMAND=

#
# ## Dev environment auto-launch (US-0098 / DEC-0084)
# Execute-phase bounded rebuild/relaunch + Connect surfacing — distinct from US-0065 phase QA,
# US-0086 test routing, and US-0067 release hints. Orthogonal to AUTO_REMOTE_AUTOMATION_PROFILE.
# When off, execute step 24 skipped with zero overhead.
# - DEV_AUTO_LAUNCH_PROFILE: off|deterministic_v1 (default off)
# - DEV_ENVIRONMENT_CONFIG: repo-relative path (default .cursor/dev-environment.json)
DEV_AUTO_LAUNCH_PROFILE=off
DEV_ENVIRONMENT_CONFIG=.cursor/dev-environment.json

#
# ## Caveman mode (US-0089)
# Response-side voice toggle. Default off. Composition is orthogonal to
# TOKEN_PROFILE (DEC-0035 / US-0080) and AUTO_QUIET (US-0088) --
# TOKEN_PROFILE controls context breadth, CAVEMAN_MODE controls reply voice;
# neither substitutes for the other.
# - CAVEMAN_MODE: 0|1 (default 0; absence = 0)
# - CAVEMAN_LEVEL: lite|full|ultra (empty; with MODE=1 empty -> treat as full;
#   unknown value -> CAVEMAN_LEVEL_UNKNOWN and fall back to pre-US-0089 voice)
#
# ## Caveman input compression (US-0090 / DEC-0073)
# Input-side prose minification via scripts/caveman_compress_input.py. Default off.
# Orthogonal to CAVEMAN_MODE (reply voice) and TOKEN_PROFILE (context breadth).
# - CAVEMAN_COMPRESS_INPUT: 0|1 (default 0) -- activation gate; must be 1 for --write
# - CAVEMAN_FILE_SCOPE: string (empty default) -- allow-list of files eligible for compression:
#     * empty: no files in scope (fail-closed on --write with CAVEMAN_COMPRESS_SCOPE_EMPTY)
#     * named profile: e.g. docs-prose-only (user-guides, runbook, state-archive, handoffs/archive)
#     * raw globs: e.g. docs/user-guides/**/*.md,handoffs/archive/*.md (forward slashes only)
#     * hybrid: profile:docs-prose-only;globs:handoffs/archive/*.md
#   Mutation requires COMPRESS_INPUT=1 + non-empty scope + CLI --write; use --dry-run first.
#   Originals land in docs/.caveman-originals/<path>; deny-list always wins over allow.
CAVEMAN_MODE=0
CAVEMAN_LEVEL=
CAVEMAN_COMPRESS_INPUT=0
CAVEMAN_FILE_SCOPE=
