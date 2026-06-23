# Token-cost run evidence (`handoffs/token_cost_runs/`)

Append-only artifacts per **`orchestrator_run_id`** (**`DEC-0062`** §3, **`US-0080`**).

## Schema (markdown table)

Each run file SHOULD include:

- `orchestrator_run_id` — stable id for the orchestrated run
- `run_class_hash` — SHA-256 hex over canonical **`DEC-0062`** §2 JSON object
- `metric_source` — how numbers were produced (for example `cursor_usage_export`,
  `fixture`, `unmapped_host`)
- `recorded_at_utc` — RFC3339 UTC
- **Run totals** row: `cache_read_tokens`, `input_tokens`, `output_tokens`, and
  optional `cache_creation_tokens`, `orchestrator_call_estimate`
- **Per-phase** rows: same metrics plus `phase_id`, `phase_call_count`

`docs/engineering/state.md` checkpoints SHOULD set **`token_cost_evidence_ref`**
to the primary file path when metrics exist.

## Tooling

- `scripts/token_cost_lib.py` — `run_class_hash`, strict-proof hash helper, AC-2 compare
- `scripts/token_cost_compare.py <baseline.json> <target.json>` — exit **0** if
  same `run_class_hash` and ≥ **50%** `cache_read_tokens` reduction vs baseline
- `python scripts/check_token_cost_parity.py --repo .` — active/`template/` parity
