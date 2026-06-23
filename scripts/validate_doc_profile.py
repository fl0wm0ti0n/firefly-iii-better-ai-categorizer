#!/usr/bin/env python3
"""
Validate documentation profile surfaces (DEC-0059).

Reads merged scratchpad via installer.merge_scratchpad_layers (DEC-0058 pattern).
"""

from __future__ import annotations

import argparse
import os
import sys

# Repo root (parent of scripts/)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, ".."))

if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

import installer  # noqa: E402
import doc_profile_lib  # noqa: E402


def _fail(messages: list[str]) -> int:
    for m in messages:
        print(m, file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate README/doc profile vs merged scratchpad.")
    parser.add_argument(
        "--repo",
        default=_REPO_ROOT,
        help="Target repository root (default: parent of scripts/).",
    )
    parser.add_argument(
        "--no-template-parity",
        action="store_true",
        help="Skip active vs template/ parity (for fixture-only trees).",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run resolver matrix self-test and exit.",
    )
    args = parser.parse_args()

    if args.self_test:
        doc_profile_lib.self_test_resolver()
        print("[DOC_PROFILE_SELF_TEST_OK]")
        return 0

    target = os.path.abspath(args.repo)
    template_root = None if args.no_template_parity else os.path.join(target, "template")

    merged, paths = installer.merge_scratchpad_layers(target)
    merge_errors: list[str] = []
    if not os.path.isfile(paths["example"]):
        merge_errors.append(
            "[DOC_PROFILE_MERGE_ERROR] EXAMPLE_LAYER_MISSING: "
            f".cursor/scratchpad.local.example.md not found under {target}."
        )
    if not os.path.isfile(paths["baseline"]):
        merge_errors.append(
            "[DOC_PROFILE_MERGE_ERROR] MATERIALIZED_BASELINE_MISSING: "
            f".cursor/scratchpad.md not found under {target}."
        )
    if merge_errors:
        return _fail(merge_errors)

    ok, scratch_diagnostics = installer.validate_merged_scratchpad(target)
    if not ok:
        out = [ln for ln in scratch_diagnostics if "SCRATCHPAD_MERGE_ERROR" in ln or "REQUIRED_KEY" in ln]
        mapped = [
            ln.replace("[SCRATCHPAD_MERGE_ERROR]", "[DOC_PROFILE_MERGE_ERROR]", 1)
            if ln.startswith("[SCRATCHPAD_MERGE_ERROR]")
            else f"[DOC_PROFILE_MERGE_ERROR] {ln}"
            for ln in (out or scratch_diagnostics)
        ]
        return _fail(mapped)

    readme_path = os.path.join(target, "README.md")
    readme_txt = ""
    if os.path.isfile(readme_path):
        with open(readme_path, "r", encoding="utf-8") as f:
            readme_txt = f.read()
    for w in doc_profile_lib.optional_mode_warnings(merged, readme_txt):
        print(w, file=sys.stderr)

    errs = doc_profile_lib.validate_repo_doc_profile(target, merged, template_root)
    if errs:
        return _fail(errs)

    print("[DOC_PROFILE_VALIDATE_OK]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
