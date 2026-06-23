#!/usr/bin/env python3
"""
Validate project root README catalog coverage vs backlog (US-0097 / DEC-0083).
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
import project_readme_coverage_lib as prc  # noqa: E402


def _enforce_flag(merged: dict) -> bool:
    raw = (merged.get("PROJECT_README_ENFORCE") or "1").strip()
    return raw == "1"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate project README catalog coverage vs backlog (DEC-0083)."
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
        help="Run sentinel matrix + schema stability checks.",
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
        help="Blocking mode (required for /release when PROJECT_README_ENFORCE=1).",
    )
    parser.add_argument(
        "--no-kit-skip",
        action="store_true",
        help="Validate root even when FRAMEWORK_KIT_REPO=1.",
    )
    args = parser.parse_args()

    if args.self_test:
        try:
            prc.self_test_sentinel_matrix()
            prc.self_test_report_schema()
        except AssertionError as exc:
            print(f"self-test failed: {exc}", file=sys.stderr)
            return 2
        print("[PROJECT_README_COVERAGE_SELF_TEST_OK]")
        return 0

    target = os.path.abspath(args.repo)
    backlog = args.backlog or os.path.join(target, "docs", "product", "backlog.md")
    if not os.path.isfile(backlog):
        print(
            f"{prc.REASON_INPUT_INVALID}: backlog not found: {backlog}",
            file=sys.stderr,
        )
        return 2

    merged, _paths = installer.merge_scratchpad_layers(target)
    enforce = args.enforce or _enforce_flag(merged)

    if prc.is_framework_kit_repo(merged) and not args.no_kit_skip and not args.enforce:
        report = {
            "catalog_marker_present": False,
            "coverage_missing": [],
            "coverage_present": [],
            "coverage_total": 0,
            "framework_paths_excluded": list(prc.FRAMEWORK_PATHS_EXCLUDED),
            "gaps": [],
            "kit_repo_skipped": True,
            "report_schema_version": prc.REPORT_SCHEMA_VERSION,
            "repo_root": ".",
            "status": "PASS",
        }
        stderr_lines: list[str] = []
    else:
        report, stderr_lines = prc.build_report(
            target,
            backlog,
            enforce=enforce,
            merged=merged,
            no_kit_skip=args.no_kit_skip,
        )

    if args.audit_out:
        audit_path = args.audit_out
        if not os.path.isabs(audit_path):
            audit_path = os.path.join(target, audit_path)
        os.makedirs(os.path.dirname(audit_path) or ".", exist_ok=True)
        audit_obj = {
            "audit_schema_version": 1,
            "coverage_total": report["coverage_total"],
            "gaps": report["gaps"],
            "items": report["coverage_present"] + report["coverage_missing"],
            "status": report["status"],
        }
        with open(audit_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(prc.canonical_json(audit_obj))

    blocking = bool(stderr_lines) or report["status"] != "PASS"

    if args.report or not args.audit_out:
        sys.stdout.write(prc.canonical_json(report))

    if blocking and (args.enforce or args.report):
        print(prc.REASON_BLOCKED, file=sys.stderr)
        for line in stderr_lines:
            print(line, file=sys.stderr)
        return 1

    if blocking:
        for line in stderr_lines:
            print(line, file=sys.stderr)
        return 1 if args.enforce else 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
