#!/usr/bin/env python3
"""
Validate README feature coverage vs backlog (US-0091 / DEC-0074).
"""

from __future__ import annotations

import argparse
import os
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, ".."))

if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

import installer  # noqa: E402
import readme_feature_coverage_lib as rfc  # noqa: E402


def _enforce_flag(merged: dict) -> bool:
    raw = (merged.get("README_FEATURE_COVERAGE_ENFORCE") or "0").strip()
    return raw == "1"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate README feature coverage vs backlog (DEC-0074)."
    )
    parser.add_argument(
        "--repo",
        default=_REPO_ROOT,
        help="Target repository root (default: parent of scripts/).",
    )
    parser.add_argument(
        "--backlog",
        default=None,
        help="Backlog file (default: docs/product/backlog.md under --repo).",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run predicate matrix + schema stability checks.",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Emit stable JSON report to stdout.",
    )
    parser.add_argument(
        "--audit-out",
        metavar="PATH",
        default=None,
        help="Write gap audit artifact (JSON) to PATH.",
    )
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="Blocking mode (required for /release when enforce=1).",
    )
    parser.add_argument(
        "--no-template-parity",
        action="store_true",
        help="Skip active vs template/ README and script parity sub-check.",
    )
    args = parser.parse_args()

    if args.self_test:
        try:
            rfc.self_test_predicate_matrix()
            rfc.self_test_report_schema()
        except AssertionError as exc:
            print(f"self-test failed: {exc}", file=sys.stderr)
            return 2
        print("[README_FEATURE_COVERAGE_SELF_TEST_OK]")
        return 0

    target = os.path.abspath(args.repo)
    backlog = args.backlog or os.path.join(target, "docs", "product", "backlog.md")
    if not os.path.isfile(backlog):
        print(f"{rfc.REASON_INPUT_INVALID}: backlog not found: {backlog}", file=sys.stderr)
        return 2

    merged, _paths = installer.merge_scratchpad_layers(target)
    enforce = args.enforce or _enforce_flag(merged)

    merged_profile = None if args.no_template_parity else merged
    report, stderr_lines = rfc.build_report(
        target,
        backlog,
        enforce=enforce,
        merged=merged_profile,
        skip_parity=args.no_template_parity,
    )

    if args.audit_out:
        audit_path = args.audit_out
        if not os.path.isabs(audit_path):
            audit_path = os.path.join(target, audit_path)
        os.makedirs(os.path.dirname(audit_path), exist_ok=True)
        audit_obj = {
            "audit_schema_version": 1,
            "coverage_total": report["coverage_total"],
            "gaps": report["gaps"],
            "items": report["coverage_present"] + report["coverage_missing"],
            "status": report["status"],
        }
        with open(audit_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(rfc.canonical_json(audit_obj))

    blocking = bool(stderr_lines) or report["status"] != "PASS"

    if args.report or not args.audit_out:
        sys.stdout.write(rfc.canonical_json(report))

    if blocking and (args.enforce or args.report):
        print(rfc.REASON_BLOCKED, file=sys.stderr)
        for line in sorted(set(stderr_lines)):
            print(line, file=sys.stderr)
        return 1

    if blocking and args.audit_out and not args.report:
        return 0

    if blocking:
        print(rfc.REASON_BLOCKED, file=sys.stderr)
        for line in sorted(set(stderr_lines)):
            print(line, file=sys.stderr)
        return 1

    if args.enforce:
        print("[README_FEATURE_COVERAGE_VALIDATE_OK]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
