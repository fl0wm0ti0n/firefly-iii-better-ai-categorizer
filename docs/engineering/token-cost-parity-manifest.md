# Token-cost parity manifest (DEC-0062 §5 / US-0080)

- **version**: `1`
- **purpose**: Paths below MUST be **byte-identical** between repository root and
  `template/` after edits (installer parity). CI: `python scripts/check_token_cost_parity.py --repo .`

## Mirrored path pairs (`active` → `template`)

- `.cursor/commands/auto.md` → `template/.cursor/commands/auto.md`
- `.cursor/commands/execute.md` → `template/.cursor/commands/execute.md`
- `docs/engineering/auto-orchestration-reference.md` → `template/docs/engineering/auto-orchestration-reference.md`
- `docs/engineering/token-cost-parity-manifest.md` → `template/docs/engineering/token-cost-parity-manifest.md`
- `scripts/token_cost_lib.py` → `template/scripts/token_cost_lib.py`
- `scripts/token_cost_compare.py` → `template/scripts/token_cost_compare.py`
- `scripts/check_token_cost_parity.py` → `template/scripts/check_token_cost_parity.py`
- `handoffs/token_cost_runs/README.md` → `template/handoffs/token_cost_runs/README.md`
