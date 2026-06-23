#!/usr/bin/env python3
"""Idempotent codebase map bootstrap (US-0082 / DEC-0065).

Writes only docs/engineering/codebase-map.md and docs/engineering/dependencies.json
per /map-codebase contract. Does not append docs/engineering/state.md.

Diagnostics on stdout use deterministic tokens: [CODEBASE_MAP_OK] ... and CODEBASE_MAP_BLOCKED:...
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

BOOTSTRAP_SENTINEL = "<!-- its-magic:codebase-map-bootstrap v1 -->"

REMEDIATION = (
    "Remediation: run `/map-codebase` for a full pass; see "
    "`docs/engineering/runbook.md` (Codebase map bootstrap) and "
    "`docs/engineering/architecture.md` (# US-0082)."
)


def _bootstrap_map_markdown() -> str:
    lines = [
        "# Codebase Map",
        "",
        BOOTSTRAP_SENTINEL,
        "",
        "This is a **bootstrap** codebase map created by the lifecycle materializer "
        "(**US-0082** / **DEC-0065**). It satisfies the “map exists” contract for fresh repos.",
        "",
        "For a full repository analysis, run **`/map-codebase`** (explicit/manual).",
        "",
        "## Stack",
        "",
        "| Aspect | Detail |",
        "|--------|--------|",
        "| (pending) | Run `/map-codebase` or edit this table after local analysis |",
        "",
        "## Entry Points",
        "",
        "| Entry | File | Purpose |",
        "|-------|------|---------|",
        "| (pending) | — | Run `/map-codebase` to populate |",
        "",
        "## Next steps",
        "",
        "1. Run **`/map-codebase`** for a deep pass, **or**",
        "2. Edit this file directly with project-specific structure.",
        "",
    ]
    return "\n".join(lines)


def _bootstrap_dependencies_obj() -> dict:
    return {"libraries": [], "runtime": [], "tooling": []}


def _bootstrap_dependencies_text() -> str:
    return json.dumps(_bootstrap_dependencies_obj(), sort_keys=True, indent=2) + "\n"


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _json_stable(obj: object) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def sync_map(map_path: Path, desired: str) -> tuple[str, bool]:
    """Returns (status_token, content_mutated)."""
    if not map_path.is_file():
        map_path.write_text(desired, encoding="utf-8", newline="\n")
        return "created", True
    existing = _normalize_newlines(map_path.read_text(encoding="utf-8"))
    if BOOTSTRAP_SENTINEL in existing:
        if existing == desired:
            return "noop", False
        map_path.write_text(desired, encoding="utf-8", newline="\n")
        return "refreshed_bootstrap", True
    return "preserved_existing", False


def sync_dependencies(deps_path: Path, map_allows_bootstrap_deps: bool) -> tuple[str, bool]:
    """When map_allows_bootstrap_deps, deps may be created/updated to bootstrap empty schema."""
    desired_txt = _bootstrap_dependencies_text()
    want_obj = _bootstrap_dependencies_obj()
    want_stable = _json_stable(want_obj)

    if not deps_path.is_file():
        deps_path.write_text(desired_txt, encoding="utf-8", newline="\n")
        return "deps_created", True

    raw = deps_path.read_text(encoding="utf-8")
    try:
        cur = json.loads(raw)
    except json.JSONDecodeError:
        if map_allows_bootstrap_deps:
            deps_path.write_text(desired_txt, encoding="utf-8", newline="\n")
            return "deps_repaired", True
        return "deps_preserved_existing", False

    if _json_stable(cur) == want_stable:
        return "deps_noop", False

    if map_allows_bootstrap_deps:
        deps_path.write_text(desired_txt, encoding="utf-8", newline="\n")
        return "deps_refreshed", True
    return "deps_preserved_existing", False


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Materialize idempotent codebase map bootstrap.")
    p.add_argument("--repo", default=".", help="Repository root")
    p.add_argument(
        "--trigger",
        choices=("architecture", "map-codebase", "refresh-context"),
        default="architecture",
        help="Lifecycle trigger label (stdout diagnostics only)",
    )
    p.add_argument("--dry-run", action="store_true", help="Print actions; do not write files")
    p.add_argument(
        "--simulate-block",
        metavar="SUBREASON",
        default=None,
        help="Emit CODEBASE_MAP_BLOCKED:SUBREASON and exit 2 (tests)",
    )
    p.add_argument(
        "--check-present",
        action="store_true",
        help="Read-only: exit 0 if codebase-map.md exists, else CODEBASE_MAP_MISSING + exit 2",
    )
    args = p.parse_args(argv)

    if args.simulate_block:
        print(f"[CODEBASE_MAP_BLOCKED:{args.simulate_block}] trigger={args.trigger}")
        print(REMEDIATION)
        return 2

    if os.environ.get("CODEBASE_MAP_LIFECYCLE_SKIP", "").strip() in ("1", "true", "yes"):
        print(f"[CODEBASE_MAP_BLOCKED:policy_skip] trigger={args.trigger}")
        print(REMEDIATION)
        return 2

    root = Path(args.repo).resolve()
    eng = root / "docs" / "engineering"
    map_path = eng / "codebase-map.md"
    deps_path = eng / "dependencies.json"

    if args.check_present:
        if map_path.is_file():
            print(f"[CODEBASE_MAP_OK] check_present trigger={args.trigger} path={map_path}")
            return 0
        print("[CODEBASE_MAP_MISSING]")
        print(REMEDIATION)
        return 2

    desired_map = _bootstrap_map_markdown()

    if args.dry_run:
        print(f"[CODEBASE_MAP_OK] dry_run trigger={args.trigger} map={map_path} deps={deps_path}")
        return 0

    eng.mkdir(parents=True, exist_ok=True)

    map_status, _ = sync_map(map_path, desired_map)
    print(f"[CODEBASE_MAP_OK] {map_status} trigger={args.trigger} path={map_path}")

    map_text = _normalize_newlines(map_path.read_text(encoding="utf-8"))
    map_allows_bootstrap_deps = BOOTSTRAP_SENTINEL in map_text

    dep_status, _ = sync_dependencies(deps_path, map_allows_bootstrap_deps)
    if dep_status not in ("deps_noop", "deps_preserved_existing"):
        print(f"[CODEBASE_MAP_OK] {dep_status} trigger={args.trigger} path={deps_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
