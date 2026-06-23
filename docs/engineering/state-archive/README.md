# State Archive Packs

This folder stores append-only historical state packs for context compaction
(US-0053 / DEC-0035).

Policy:

- Keep `docs/engineering/state.md` focused on active/hot context and recent
  checkpoints.
- Move older, low-frequency checkpoints into timestamped archive packs here.
- Do not rewrite historical evidence; archive moves are non-destructive and
  traceable.
- Use stable pack naming:
  - `state-pack-YYYY-QN.md` for periodic compaction
  - or `state-pack-YYYYMMDD.md` for ad-hoc snapshots
