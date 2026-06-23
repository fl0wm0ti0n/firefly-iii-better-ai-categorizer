#!/usr/bin/env python3
"""
Downstream CI drift guard CLI (BUG-0009 / DEC-0075).
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

import downstream_ci_guard_lib as dci  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Downstream CI drift guard (template forbidden scan + active inventory)."
    )
    parser.add_argument(
        "--repo",
        default=_REPO_ROOT,
        help="Target repository root (default: parent of scripts/).",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run stable marker subtests.",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Emit JSON inventory to stdout.",
    )
    args = parser.parse_args()

    if args.self_test:
        try:
            dci.self_test()
        except AssertionError as exc:
            print(f"self-test failed: {exc}", file=sys.stderr)
            return 2
        print("[DOWNSTREAM_CI_GUARD_SELF_TEST_OK]")
        return 0

    target = os.path.abspath(args.repo)
    report, stderr_lines = dci.build_report(target)

    if args.report:
        print(json.dumps(dci.report_to_dict(report), sort_keys=True, separators=(",", ":")))

    for line in stderr_lines:
        print(line, file=sys.stderr)

    if not report.ok:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
