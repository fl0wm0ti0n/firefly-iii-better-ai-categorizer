#!/usr/bin/env python3
"""
Shared sync / push eligibility evaluation for validate-and-push (merged scratchpad).

Imports installer.merge_scratchpad_layers / validate_merged_scratchpad only — no
duplicate DEC-0055 precedence logic. Emits machine-readable JSON on stdout; reason
codes only (no planning-shaped tokens) on stderr for errors.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import sys
from pathlib import Path
from typing import List, Tuple

# Repo root (parent of scripts/)
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import installer  # noqa: E402

_VALID_MODES = frozenset(
    {"disabled", "manual", "by_phase", "by_milestone", "custom_phase_list"}
)

def _parse_csv(val: str) -> List[str]:
    if not val or not val.strip():
        return []
    return [p.strip() for p in val.split(",") if p.strip()]


def _merge_and_validate(root: str) -> Tuple[dict, List[str]]:
    ok, diags = installer.validate_merged_scratchpad(root)
    if not ok:
        return {}, diags
    merged, _paths = installer.merge_scratchpad_layers(root)
    return merged, []


def eval_policy(root: str, _branch: str) -> Tuple[bool, str, List[str]]:
    """
    Pre-test gate: merged scratchpad validation + SYNC_POLICY_MODE + ALLOW_AUTO_PUSH
    + custom_phase_list boundary (SYNC_PHASE_BOUNDARY env).
    Returns (ok, reason_code, scratchpad_diagnostics).
    """
    merged, diags = _merge_and_validate(root)
    if diags:
        return False, "SCRATCHPAD_MERGE_ERROR", diags

    mode = (merged.get("SYNC_POLICY_MODE") or "").strip().lower()
    if not mode or mode not in _VALID_MODES:
        mode = "manual"
    if mode == "disabled":
        return False, "SYNC_DISABLED", []
    if mode == "manual":
        return False, "MANUAL_MODE_NO_AUTO", []

    allow = (merged.get("ALLOW_AUTO_PUSH") or "").strip()
    if allow != "1":
        return False, "AUTO_PUSH_NOT_ENABLED", []

    if mode == "custom_phase_list":
        phases = [p.strip().lower() for p in _parse_csv(merged.get("SYNC_CUSTOM_PHASES", ""))]
        boundary = (os.environ.get("SYNC_PHASE_BOUNDARY") or "").strip().lower()
        if not boundary:
            return False, "SYNC_TRIGGER_NOT_ELIGIBLE", []
        if not phases or boundary not in phases:
            return False, "SYNC_TRIGGER_NOT_ELIGIBLE", []

    # by_phase / by_milestone: invocation counts as eligible boundary (DEC-0058 §4).
    return True, "", []


def _branch_allowed(branch: str, allowlist_csv: str) -> bool:
    patterns = _parse_csv(allowlist_csv)
    if not patterns:
        return False
    for pat in patterns:
        if fnmatch.fnmatchcase(branch, pat):
            return True
        if branch == pat:
            return True
    return False


def _scan_qa_findings_blocking(repo: Path) -> bool:
    """True if blocking markers found (DEC-0058 §6)."""
    sprints = repo / "sprints"
    if not sprints.is_dir():
        return False
    for p in sorted(sprints.iterdir()):
        if not p.is_dir() or len(p.name) != 5 or not p.name.startswith("S"):
            continue
        if not p.name[1:].isdigit():
            continue
        qf = p / "qa-findings.md"
        if not qf.is_file():
            continue
        text = qf.read_text(encoding="utf-8", errors="replace")
        if "BLOCKING_QA_FINDINGS" in text:
            return True
        in_blocking = False
        for line in text.splitlines():
            if re.match(r"^##\s+blocking\s*$", line, re.IGNORECASE):
                in_blocking = True
                continue
            if re.match(r"^##\s+\S", line):
                in_blocking = False
            if in_blocking and re.search(r"^-\s+\[\s+\]", line):
                return True
            if re.search(r"^-\s+\[\s+\]", line) and re.search(
                r"BLOCKING|FAIL", line, re.IGNORECASE
            ):
                return True
    return False


def _count_sprint_qa_findings(repo: Path) -> int:
    n = 0
    sprints = repo / "sprints"
    if not sprints.is_dir():
        return 0
    for p in sprints.iterdir():
        if not p.is_dir() or len(p.name) != 5 or not p.name.startswith("S"):
            continue
        if not p.name[1:].isdigit():
            continue
        if (p / "qa-findings.md").is_file():
            n += 1
    return n


def eval_post_test(root: str, branch: str) -> Tuple[bool, str, List[str]]:
    """
    After tests: branch allowlist + PRE_QA + BLOCKING_QA_FINDINGS scan.
    """
    merged, diags = _merge_and_validate(root)
    if diags:
        return False, "SCRATCHPAD_MERGE_ERROR", diags

    allow_csv = merged.get("AUTO_PUSH_BRANCH_ALLOWLIST") or ""
    if not _branch_allowed(branch, allow_csv):
        return False, "BRANCH_NOT_ALLOWLISTED", []

    b = branch.strip()
    if b not in ("main", "master"):
        if _count_sprint_qa_findings(Path(root)) == 0:
            return False, "PRE_QA_AUTOPUSH_FORBIDDEN", []

    if _scan_qa_findings_blocking(Path(root)):
        return False, "BLOCKING_QA_FINDINGS", []

    return True, "", []


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync/push gate evaluation for validate-and-push.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_pol = sub.add_parser("policy", help="Pre-test merged scratchpad + sync policy gate.")
    p_pol.add_argument("--root", required=True)
    p_pol.add_argument("--branch", required=True)

    p_post = sub.add_parser("post", help="Post-test allowlist + QA scan gate.")
    p_post.add_argument("--root", required=True)
    p_post.add_argument("--branch", required=True)

    args = parser.parse_args()
    root = os.path.abspath(args.root)

    if args.cmd == "policy":
        ok, reason, diags = eval_policy(root, args.branch)
        if diags:
            for d in diags:
                print(d, file=sys.stderr)
            print(json.dumps({"ok": False, "reason_code": "SCRATCHPAD_MERGE_ERROR"}))
            return 2
        print(json.dumps({"ok": ok, "reason_code": reason or None}))
        return 0 if ok else 2

    ok, reason, pdiags = eval_post_test(root, args.branch)
    if pdiags:
        for d in pdiags:
            print(d, file=sys.stderr)
        print(json.dumps({"ok": False, "reason_code": "SCRATCHPAD_MERGE_ERROR"}))
        return 2
    print(json.dumps({"ok": ok, "reason_code": reason or None}))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
