#!/usr/bin/env python3
"""
Fail-closed guard: defect-shaped prose must not persist as US-xxxx without bug routing (DEC-0061 §5).
"""

from __future__ import annotations

import argparse
import re
import sys

# Strong defect signals (deterministic heuristic — PO still must set INTAKE_WORK_ITEM_KIND or /intake bug)
_REPRO = re.compile(
    r"\b(steps\s+to\s+reproduce|steps_to_reproduce|repro\s+steps|reproduction\s+steps)\b",
    re.IGNORECASE,
)
_DEFECT = re.compile(
    r"\b(bug|regression|defect|crash|stack\s+trace|broken|throws\s+exception)\b",
    re.IGNORECASE,
)


def prose_looks_like_defect(text: str) -> bool:
    low = text.lower()
    if not _DEFECT.search(low):
        return False
    if _REPRO.search(low):
        return True
    if "expected" in low and "actual" in low:
        return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser(
        description="If work item kind is story but prose looks like a defect report, fail with INTAKE_BUG_ROUTING_REQUIRED."
    )
    ap.add_argument("--kind", choices=("story", "bug"), required=True)
    ap.add_argument("--file", help="Path to prose file (title+summary)")
    ap.add_argument("--stdin", action="store_true", help="Read prose from stdin")
    args = ap.parse_args()

    if args.kind == "bug":
        print("[INTAKE_BUG_ROUTING_OK] kind=bug")
        return 0

    if args.stdin:
        text = sys.stdin.read()
    elif args.file:
        text = open(args.file, encoding="utf-8").read()
    else:
        print("INTAKE_BUG_ROUTING_GUARD_ERROR: provide --file or --stdin", file=sys.stderr)
        return 2

    if prose_looks_like_defect(text):
        print(
            "INTAKE_BUG_ROUTING_REQUIRED: defect-shaped prose with INTAKE_WORK_ITEM_KIND=story "
            "(set INTAKE_WORK_ITEM_KIND=bug and/or use `/intake bug` per DEC-0061 §5)",
            file=sys.stderr,
        )
        return 3
    print("[INTAKE_BUG_ROUTING_OK] kind=story")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
