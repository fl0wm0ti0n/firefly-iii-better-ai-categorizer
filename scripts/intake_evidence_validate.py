#!/usr/bin/env python3
"""
Validate intake_evidence JSON bundles (US-0078 / US-0083 / DEC-0060 / DEC-0067).

Used by PO workflow preflight and CI fixtures.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, ".."))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

import intake_evidence_lib  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Validate intake_evidence JSON (US-0078/US-0083).")
    p.add_argument("--file", help="Path to JSON file containing one intake_evidence object.")
    p.add_argument(
        "--stdin",
        action="store_true",
        help="Read JSON object from stdin.",
    )
    p.add_argument(
        "--self-test",
        action="store_true",
        help="Run library sanity checks and exit.",
    )
    args = p.parse_args()

    if args.self_test:
        intake_evidence_lib.self_test()
        print("[INTAKE_EVIDENCE_SELF_TEST_OK]")
        return 0

    raw = ""
    if args.file:
        with open(os.path.abspath(args.file), encoding="utf-8") as f:
            raw = f.read()
    elif args.stdin:
        raw = sys.stdin.read()
    else:
        print("error: specify --file, --stdin, or --self-test", file=sys.stderr)
        return 2

    try:
        bundle = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON: {e}", file=sys.stderr)
        return 2

    if not isinstance(bundle, dict):
        print("error: root must be a JSON object", file=sys.stderr)
        return 2

    r = intake_evidence_lib.validate_intake_evidence(bundle)
    if r.ok:
        print("[INTAKE_EVIDENCE_VALIDATION_OK]")
        return 0

    print(intake_evidence_lib.format_blocked_message(r), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
