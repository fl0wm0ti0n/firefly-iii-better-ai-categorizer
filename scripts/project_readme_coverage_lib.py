"""
Project README coverage: sentinels, migration, bootstrap, and backlog predicate (US-0097 / DEC-0083).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

import readme_feature_coverage_lib as rfc

CATALOG_MARKER = "<!-- project-readme-feature-catalog -->"
FRAMEWORK_CATALOG_MARKER = "<!-- readme-feature-coverage-catalog -->"
S1_H1_PATTERN = re.compile(
    r"^#\s*its-magic\s*[—\-]\s*AI dev team\s*$", re.MULTILINE | re.IGNORECASE
)
S3_HEADING = "Feature coverage catalog (US-0091)"
US_ID = re.compile(r"\bUS-\d{4}\b")
BUG_ID = re.compile(r"\bBUG-\d{4}\b")

REASON_BLOCKED = "PROJECT_README_COVERAGE_BLOCKED"
REASON_GAP = "PROJECT_README_COVERAGE_GAP"
REASON_INPUT_INVALID = "PROJECT_README_INPUT_INVALID"
REASON_MIGRATION_AMBIGUOUS = "PROJECT_README_MIGRATION_AMBIGUOUS"
REASON_SENTINEL_CONFLICT = "PROJECT_README_SENTINEL_CONFLICT"
REASON_DELTA_SKIPPED = "PROJECT_README_DELTA_SKIPPED"
REASON_BOOTSTRAP_SKIPPED = "PROJECT_README_BOOTSTRAP_SKIPPED"
REASON_PLACEHOLDER_UNRESOLVED = "PROJECT_README_PLACEHOLDER_UNRESOLVED"
REASON_ENFORCE_SKIPPED = "PROJECT_README_ENFORCE_SKIPPED"

REPORT_SCHEMA_VERSION = 1
FRAMEWORK_PATHS_EXCLUDED = [
    "its_magic/README.md",
    "template/its_magic/README.md",
    "docs/developer/README.md",
]

SENTINEL_IDS = ("S1", "S2", "S3", "S4", "S5")


@dataclass
class SentinelResult:
    matched: List[str] = field(default_factory=list)
    verdict: str = "missing"  # placeholder | operator_authored | project_scaffold | missing | kit_skip | ambiguous
    reason_code: str = ""


def read_utf8(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_utf8(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def is_framework_kit_repo(merged: Optional[Dict[str, str]]) -> bool:
    if not merged:
        return False
    return (merged.get("FRAMEWORK_KIT_REPO") or "0").strip() == "1"


def detect_sentinels(content: str, repo_root: str) -> List[str]:
    matched: List[str] = []
    if S1_H1_PATTERN.search(content):
        matched.append("S1")
    if FRAMEWORK_CATALOG_MARKER in content:
        matched.append("S2")
    if S3_HEADING in content:
        matched.append("S3")
    tpl_path = os.path.join(repo_root, "template", "README.md")
    if os.path.isfile(tpl_path) and content == read_utf8(tpl_path):
        matched.append("S4")
    return matched


def _has_project_scaffold(content: str) -> bool:
    return CATALOG_MARKER in content and "## For users" in content and "## Features" in content


def _has_custom_operator_prose(content: str, sentinels: List[str]) -> bool:
    """True when non-framework prose coexists with placeholder sentinels (hybrid)."""
    if not sentinels:
        return False
    lines = content.splitlines()
    custom_lines = 0
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("<!--"):
            continue
        if S1_H1_PATTERN.match(stripped):
            continue
        if FRAMEWORK_CATALOG_MARKER in stripped:
            continue
        if S3_HEADING in stripped:
            continue
        if stripped.startswith("#") and "its-magic" in stripped.lower():
            continue
        if stripped.startswith("*Framework workflow"):
            continue
        if re.match(r"^[-*]\s", stripped) and US_ID.search(stripped):
            continue
        if len(stripped) > 20 and not stripped.startswith("|"):
            custom_lines += 1
    return custom_lines >= 3


def classify_root_readme(
    content: str,
    repo_root: str,
    framework_kit_repo: bool = False,
) -> SentinelResult:
    if framework_kit_repo:
        return SentinelResult(verdict="kit_skip")
    if not content.strip():
        return SentinelResult(verdict="missing")
    sentinels = detect_sentinels(content, repo_root)
    if _has_project_scaffold(content) and not sentinels:
        return SentinelResult(verdict="project_scaffold")
    if sentinels:
        if _has_custom_operator_prose(content, sentinels):
            if len(sentinels) >= 2:
                return SentinelResult(
                    matched=sentinels,
                    verdict="ambiguous",
                    reason_code=REASON_SENTINEL_CONFLICT,
                )
            return SentinelResult(
                matched=sentinels,
                verdict="ambiguous",
                reason_code=REASON_MIGRATION_AMBIGUOUS,
            )
        return SentinelResult(matched=sentinels, verdict="placeholder")
    return SentinelResult(matched=["S5"], verdict="operator_authored")


def extract_vision_h1_purpose(repo_root: str) -> Tuple[str, str]:
    vision_path = os.path.join(repo_root, "docs", "product", "vision.md")
    if not os.path.isfile(vision_path):
        return "Project", "Describe your product purpose here."
    text = read_utf8(vision_path)
    h1 = "Project"
    for line in text.splitlines():
        if line.startswith("# "):
            h1 = line[2:].strip()
            break
    purpose_parts: List[str] = []
    in_section = False
    for line in text.splitlines():
        if line.strip() in ("## Problem", "## Value"):
            in_section = True
            continue
        if in_section and line.startswith("## "):
            in_section = False
        if in_section and line.strip() and not line.startswith("#"):
            purpose_parts.append(line.strip())
        if len(purpose_parts) >= 3:
            break
    purpose = " ".join(purpose_parts[:3]) if purpose_parts else "Describe your product purpose here."
    if len(purpose) > 400:
        purpose = purpose[:397] + "..."
    return h1, purpose


def materialize_project_scaffold(repo_root: str) -> str:
    h1, purpose = extract_vision_h1_purpose(repo_root)
    return (
        f"# {h1}\n\n"
        f"{purpose}\n\n"
        "## For users\n\n"
        "## For developers\n\n"
        "## Features\n\n"
        f"{CATALOG_MARKER}\n\n"
        "*Framework workflow commands: see [its_magic/README.md](its_magic/README.md).*\n"
    )


def extract_catalog_section(readme_text: str) -> str:
    if CATALOG_MARKER not in readme_text:
        return ""
    after = readme_text.split(CATALOG_MARKER, 1)[1]
    lines: List[str] = []
    for line in after.splitlines():
        if line.startswith("## ") and not line.startswith("### "):
            break
        lines.append(line)
    return "\n".join(lines)


def has_catalog_coverage(catalog_text: str, item_id: str) -> bool:
    if item_id not in catalog_text:
        return False
    for line in catalog_text.splitlines():
        if item_id in line and re.match(r"^[-*]\s", line.strip()):
            return True
    return bool(re.search(rf"\b{re.escape(item_id)}\b", catalog_text))


def classify_project_item(item: rfc.WorkItem, enforce: bool) -> rfc.PredicateResult:
    if item.status != "DONE":
        return rfc.PredicateResult(False, "status:not_done")
    if item.user_visible is False:
        return rfc.PredicateResult(False, "explicit:false")
    if item.user_visible is True:
        return rfc.PredicateResult(True, "explicit:true")
    if enforce:
        return rfc.PredicateResult(
            False,
            "unset:enforce",
            input_invalid=True,
            invalid_reason=f"{item.item_id}: user_visible unset with PROJECT_README_ENFORCE=1",
        )
    return rfc.PredicateResult(False, "heuristic:out")


def run_migration(
    repo_root: str,
    merged: Optional[Dict[str, str]] = None,
    dry_run: bool = False,
) -> Tuple[str, List[str]]:
    """Execute M1–M5; return (status, messages). status: ok | skip | error."""
    messages: List[str] = []
    if is_framework_kit_repo(merged):
        messages.append("M1: FRAMEWORK_KIT_REPO=1 — skip consumer migration")
        return "skip", messages

    root_path = os.path.join(repo_root, "README.md")
    its_magic_path = os.path.join(repo_root, "its_magic", "README.md")
    root_content = read_utf8(root_path) if os.path.isfile(root_path) else ""
    classification = classify_root_readme(root_content, repo_root)

    if classification.verdict == "ambiguous":
        messages.append(f"M5: {classification.reason_code}")
        return "error", messages

    if classification.verdict == "operator_authored":
        messages.append("M2: operator-authored root (S5) — preserve root")
        if not os.path.isfile(its_magic_path) and root_content.strip():
            if not dry_run:
                os.makedirs(os.path.dirname(its_magic_path), exist_ok=True)
                write_utf8(its_magic_path, root_content)
            messages.append("M2: copied root → its_magic/README.md")
        return "ok", messages

    if classification.verdict in ("missing", "placeholder", "project_scaffold"):
        if classification.verdict == "placeholder" and root_content.strip():
            if not os.path.isfile(its_magic_path) or not read_utf8(its_magic_path).strip():
                if not dry_run:
                    os.makedirs(os.path.dirname(its_magic_path), exist_ok=True)
                    write_utf8(its_magic_path, root_content)
                messages.append("M3: lifted root → its_magic/README.md")
            if classification.verdict == "placeholder":
                scaffold = materialize_project_scaffold(repo_root)
                if root_content != scaffold:
                    if not dry_run:
                        write_utf8(root_path, scaffold)
                    messages.append("M4: replaced root with project scaffold")
        elif classification.verdict == "missing":
            if not dry_run:
                write_utf8(root_path, materialize_project_scaffold(repo_root))
            messages.append("M4: materialized project scaffold (root missing)")
        return "ok", messages

    if classification.verdict == "kit_skip":
        return "skip", messages
    messages.append(f"M5: {REASON_PLACEHOLDER_UNRESOLVED}")
    return "error", messages


def build_report(
    repo_root: str,
    backlog_path: str,
    enforce: bool,
    merged: Optional[Dict[str, str]] = None,
    no_kit_skip: bool = False,
) -> Tuple[Dict[str, Any], List[str]]:
    stderr: List[str] = []
    kit_skip = is_framework_kit_repo(merged) and not no_kit_skip

    if kit_skip:
        report = {
            "catalog_marker_present": False,
            "coverage_missing": [],
            "coverage_present": [],
            "coverage_total": 0,
            "framework_paths_excluded": list(FRAMEWORK_PATHS_EXCLUDED),
            "gaps": [],
            "kit_repo_skipped": True,
            "report_schema_version": REPORT_SCHEMA_VERSION,
            "repo_root": ".",
            "status": "PASS",
        }
        return report, stderr

    backlog_text = read_utf8(backlog_path)
    items = rfc.parse_backlog(backlog_text)
    root_path = os.path.join(repo_root, "README.md")
    if not os.path.isfile(root_path):
        stderr.append(f"{REASON_INPUT_INVALID}: root README.md missing")
        report = _empty_fail_report()
        return report, stderr

    root_readme = read_utf8(root_path)
    classification = classify_root_readme(root_readme, repo_root)
    if classification.verdict == "ambiguous":
        stderr.append(classification.reason_code or REASON_MIGRATION_AMBIGUOUS)

    catalog_text = extract_catalog_section(root_readme)
    marker_present = CATALOG_MARKER in root_readme

    gaps: List[Dict[str, Any]] = []
    present: List[str] = []
    missing: List[str] = []
    total = 0

    for item in sorted(items, key=lambda x: x.item_id):
        pred = classify_project_item(item, enforce)
        if pred.input_invalid:
            stderr.append(f"{REASON_INPUT_INVALID}: {pred.invalid_reason}")
            continue
        if not pred.in_scope:
            continue
        total += 1
        if has_catalog_coverage(catalog_text, item.item_id):
            present.append(item.item_id)
        else:
            missing.append(item.item_id)
            gaps.append(
                {
                    "id": item.item_id,
                    "kind": item.kind,
                    "predicate_source": pred.predicate_source,
                    "user_visible": item.user_visible if item.user_visible is not None else True,
                }
            )
            stderr.append(f"{REASON_GAP}:{item.item_id}")

    status = "PASS" if not missing and not any(
        c in (REASON_MIGRATION_AMBIGUOUS, REASON_SENTINEL_CONFLICT) for c in stderr
    ) else "FAIL"
    if missing:
        status = "FAIL"

    report = {
        "catalog_marker_present": marker_present,
        "coverage_missing": sorted(missing),
        "coverage_present": sorted(present),
        "coverage_total": total,
        "framework_paths_excluded": list(FRAMEWORK_PATHS_EXCLUDED),
        "gaps": sorted(gaps, key=lambda g: g["id"]),
        "kit_repo_skipped": False,
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "repo_root": ".",
        "status": status,
    }
    return report, stderr


def _empty_fail_report() -> Dict[str, Any]:
    return {
        "catalog_marker_present": False,
        "coverage_missing": [],
        "coverage_present": [],
        "coverage_total": 0,
        "framework_paths_excluded": list(FRAMEWORK_PATHS_EXCLUDED),
        "gaps": [],
        "kit_repo_skipped": False,
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "repo_root": ".",
        "status": "FAIL",
    }


def canonical_json(obj: Dict[str, Any]) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"


def self_test_sentinel_matrix() -> None:
    repo = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
    s1 = "# its-magic — AI dev team\n"
    assert "S1" in detect_sentinels(s1, repo)
    s2 = f"body\n{FRAMEWORK_CATALOG_MARKER}\n"
    assert "S2" in detect_sentinels(s2, repo)
    s3 = f"## {S3_HEADING}\n"
    assert "S3" in detect_sentinels(s3, repo)
    r = classify_root_readme(s1, repo)
    assert r.verdict == "placeholder"
    scaffold = materialize_project_scaffold(repo)
    assert CATALOG_MARKER in scaffold
    assert "## For users" in scaffold


def self_test_report_schema() -> None:
    required = {
        "report_schema_version",
        "status",
        "repo_root",
        "catalog_marker_present",
        "coverage_present",
        "coverage_missing",
        "coverage_total",
        "gaps",
        "framework_paths_excluded",
        "kit_repo_skipped",
    }
    report, _ = build_report(
        os.path.normpath(os.path.join(os.path.dirname(__file__), "..")),
        os.path.join(os.path.dirname(__file__), "..", "docs", "product", "backlog.md"),
        enforce=False,
        merged={"FRAMEWORK_KIT_REPO": "1"},
    )
    assert required <= set(report.keys())
