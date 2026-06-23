"""
README feature coverage predicate, backlog parser, and affinity resolver (US-0091 / DEC-0074).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

US_BLOCK_HEADER = re.compile(r"^## (US-\d{4})\s*[—-]\s*(.*)\s*$")
BUG_BLOCK_HEADER = re.compile(r"^### (BUG-\d{4})\s*[—-]\s*(.*)\s*$")
BUG_SECTION_HEADER = "## Bug issues (canonical)"
STATUS_LINE = re.compile(r"^-\s*Status:\s*(OPEN|DONE)\s*$", re.IGNORECASE)
USER_VISIBLE_LINE = re.compile(
    r"^-\s*user_visible:\s*(true|false)\s*$", re.IGNORECASE
)
FIELD_LINE = re.compile(r"^-\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)\s*$")
SLASH_CMD = re.compile(r"(?:^|\s)(/[a-z][a-z0-9-]*)")
SCRATCHPAD_KEY = re.compile(r"(?:^|[\s`'])([A-Z][A-Z0-9_]+)(?:=|\b)")
PYTHON_SCRIPT = re.compile(
    r"python\s+scripts/[a-z0-9_./-]+\.py", re.IGNORECASE
)
US_ID = re.compile(r"\bUS-\d{4}\b")
BUG_ID = re.compile(r"\bBUG-\d{4}\b")

H5_KEYWORDS = (
    "archiver",
    "hot-surface rollover",
    "intake evidence schema",
    "template parity guard",
    "triad",
)

REASON_BLOCKED = "README_FEATURE_COVERAGE_BLOCKED"
REASON_GAP = "README_FEATURE_COVERAGE_GAP"
REASON_PARITY_FAIL = "README_FEATURE_COVERAGE_PARITY_FAIL"
REASON_INPUT_INVALID = "README_FEATURE_COVERAGE_INPUT_INVALID"
REASON_PROFILE_VIOLATION = "README_FEATURE_COVERAGE_PROFILE_VIOLATION"

REPORT_SCHEMA_VERSION = 1

DEFAULT_AFFINITY: Dict[str, Any] = {
    "affinity_version": 1,
    "rules": [
        {
            "tag": "slash_command",
            "root_h2": "Commands and workflow",
            "dev_h2": "Workflow",
        },
        {
            "tag": "scratchpad_mode",
            "root_h2": "Other useful capabilities",
            "dev_h2": "Quality gates",
        },
        {
            "tag": "distribution",
            "root_h2": "Features",
            "dev_h2": "Architecture notes",
        },
        {
            "tag": "release_gate",
            "root_h2": "Commands and workflow",
            "dev_h2": "Quality gates",
        },
        {
            "tag": "governance",
            "root_h2": "Other useful capabilities",
            "dev_h2": "Engineering decisions",
        },
    ],
}


@dataclass
class WorkItem:
    item_id: str
    kind: str  # US | BUG
    title: str
    status: Optional[str]
    summary: str
    user_visible: Optional[bool]
    body_text: str
    fields: Dict[str, str] = field(default_factory=dict)


@dataclass
class PredicateResult:
    in_scope: bool
    predicate_source: str
    input_invalid: bool = False
    invalid_reason: str = ""


@dataclass
class AffinityTarget:
    tag: str
    root_h2: str
    dev_h2: str


def read_utf8(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def load_affinity_manifest(repo_root: str) -> Dict[str, Any]:
    path = os.path.join(
        repo_root, "docs", "engineering", "context", "readme-section-affinity.json"
    )
    if not os.path.isfile(path):
        return dict(DEFAULT_AFFINITY)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("affinity_version") != 1:
        raise ValueError("affinity_version must be 1")
    return data


def extract_bug_section(text: str) -> Optional[str]:
    m_hdr = re.search(r"^## Bug issues \(canonical\)\s*$", text, re.MULTILINE)
    if not m_hdr:
        return None
    start = m_hdr.end()
    rest = text[start:]
    m = re.search(r"\n## [^\n]+\n", rest)
    if m:
        return rest[: m.start()].strip()
    return rest.strip()


def _parse_block_fields(block_lines: List[str]) -> Tuple[Optional[str], Dict[str, str], str]:
    status: Optional[str] = None
    fields: Dict[str, str] = {}
    body_parts: List[str] = []
    for raw in block_lines[1:]:
        line = raw.rstrip()
        body_parts.append(line)
        sm = STATUS_LINE.match(line.strip())
        if sm:
            status = sm.group(1).upper()
            continue
        fm = FIELD_LINE.match(line.strip())
        if fm:
            key = fm.group(1).lower()
            val = fm.group(2).strip()
            fields[key] = val
    return status, fields, "\n".join(body_parts)


def parse_us_blocks(text: str) -> List[WorkItem]:
    lines = text.splitlines()
    items: List[WorkItem] = []
    i = 0
    while i < len(lines):
        m = US_BLOCK_HEADER.match(lines[i].strip())
        if not m:
            i += 1
            continue
        item_id, title = m.group(1), m.group(2).strip()
        block_start = i
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if US_BLOCK_HEADER.match(nxt) or nxt == BUG_SECTION_HEADER:
                break
            if nxt.startswith("## ") and not nxt.startswith("### "):
                break
            i += 1
        block_lines = lines[block_start:i]
        status, fields, body_text = _parse_block_fields(block_lines)
        uv_raw = None
        for raw in block_lines[1:]:
            uvm = USER_VISIBLE_LINE.match(raw.strip())
            if uvm:
                uv_raw = uvm.group(1).lower() == "true"
                break
        items.append(
            WorkItem(
                item_id=item_id,
                kind="US",
                title=title,
                status=status,
                summary=fields.get("summary", ""),
                user_visible=uv_raw,
                body_text=body_text,
                fields=fields,
            )
        )
    return items


def parse_bug_blocks(text: str) -> List[WorkItem]:
    section = extract_bug_section(text)
    if not section:
        return []
    lines = section.splitlines()
    items: List[WorkItem] = []
    i = 0
    while i < len(lines):
        m = BUG_BLOCK_HEADER.match(lines[i].strip())
        if not m:
            i += 1
            continue
        item_id, title = m.group(1), m.group(2).strip()
        block_start = i
        i += 1
        while i < len(lines) and not BUG_BLOCK_HEADER.match(lines[i].strip()):
            i += 1
        block_lines = lines[block_start:i]
        status, fields, body_text = _parse_block_fields(block_lines)
        uv_raw = None
        for raw in block_lines[1:]:
            uvm = USER_VISIBLE_LINE.match(raw.strip())
            if uvm:
                uv_raw = uvm.group(1).lower() == "true"
                break
        items.append(
            WorkItem(
                item_id=item_id,
                kind="BUG",
                title=title,
                status=status,
                summary=fields.get("summary", title),
                user_visible=uv_raw,
                body_text=body_text,
                fields=fields,
            )
        )
    return items


def parse_backlog(backlog_text: str) -> List[WorkItem]:
    return parse_us_blocks(backlog_text) + parse_bug_blocks(backlog_text)


def _heuristic_signals(text: str) -> Dict[str, bool]:
    low = text.lower()
    h1 = bool(SLASH_CMD.search(text))
    h2 = bool(SCRATCHPAD_KEY.search(text)) or bool(
        re.search(r"`[A-Z][A-Z0-9_]+`", text)
    )
    h3 = bool(PYTHON_SCRIPT.search(text))
    h4 = False
    if "expected" in low or "actual" in low:
        h4 = True
    h5 = any(kw in low for kw in H5_KEYWORDS)
    return {"h1": h1, "h2": h2, "h3": h3, "h4": h4, "h5": h5}


def migration_heuristic(item: WorkItem) -> str:
    """Return in_scope | out | ambiguous per DEC-0074 H1-H8."""
    text = f"{item.title}\n{item.summary}\n{item.body_text}"
    sig = _heuristic_signals(text)
    if sig["h5"] and any(sig[k] for k in ("h1", "h2", "h3", "h4")):
        return "in_scope"
    if sig["h1"]:
        return "in_scope"
    if sig["h2"]:
        return "in_scope"
    if sig["h3"]:
        return "in_scope"
    if item.kind == "BUG" and sig["h4"]:
        return "in_scope"
    if sig["h5"]:
        return "out"
    if item.kind == "BUG":
        return "out"
    return "ambiguous"


def classify_item(item: WorkItem, enforce: bool) -> PredicateResult:
    if item.status != "DONE":
        return PredicateResult(False, "status:not_done")
    if item.user_visible is False:
        return PredicateResult(False, "explicit:false")
    if item.user_visible is True:
        return PredicateResult(True, "explicit:true")
    if enforce:
        return PredicateResult(
            False,
            "unset:enforce",
            input_invalid=True,
            invalid_reason=f"{item.item_id}: user_visible unset with README_FEATURE_COVERAGE_ENFORCE=1",
        )
    h = migration_heuristic(item)
    if h == "in_scope":
        src = _heuristic_source(item)
        return PredicateResult(True, src)
    if h == "out":
        return PredicateResult(False, "heuristic:out")
    return PredicateResult(
        False,
        "heuristic:ambiguous",
        input_invalid=True,
        invalid_reason=f"{item.item_id}: H7 ambiguous — set user_visible explicitly",
    )


def _heuristic_source(item: WorkItem) -> str:
    text = f"{item.title}\n{item.summary}\n{item.body_text}"
    sig = _heuristic_signals(text)
    if sig["h1"]:
        return "heuristic:H1"
    if sig["h2"]:
        return "heuristic:H2"
    if sig["h3"]:
        return "heuristic:H3"
    if item.kind == "BUG" and sig["h4"]:
        return "heuristic:H4"
    if sig["h5"] and any(sig[k] for k in ("h1", "h2", "h3", "h4")):
        return "heuristic:H6"
    return "heuristic:H1"


def resolve_affinity(item: WorkItem, manifest: Dict[str, Any]) -> AffinityTarget:
    rules = manifest.get("rules", DEFAULT_AFFINITY["rules"])
    by_tag = {r["tag"]: r for r in rules}
    text = f"{item.title}\n{item.summary}\n{item.body_text}"
    low = text.lower()
    if SLASH_CMD.search(text) and "slash_command" in by_tag:
        r = by_tag["slash_command"]
        return AffinityTarget("slash_command", r["root_h2"], r["dev_h2"])
    if any(k in low for k in ("npm", "chocolatey", "homebrew", "publish", "distribution")):
        r = by_tag.get("distribution", rules[0])
        return AffinityTarget("distribution", r["root_h2"], r["dev_h2"])
    if any(k in low for k in ("/release", "release gate", "uat", "verify-work")):
        r = by_tag.get("release_gate", rules[0])
        return AffinityTarget("release_gate", r["root_h2"], r["dev_h2"])
    if SCRATCHPAD_KEY.search(text) or re.search(r"`[A-Z][A-Z0-9_]+`", text):
        r = by_tag.get("scratchpad_mode", rules[0])
        return AffinityTarget("scratchpad_mode", r["root_h2"], r["dev_h2"])
    r = by_tag.get("governance", rules[-1])
    return AffinityTarget("governance", r["root_h2"], r["dev_h2"])


def split_h2_sections(markdown: str) -> Dict[str, str]:
    sections: Dict[str, str] = {}
    current: Optional[str] = None
    buf: List[str] = []
    for line in markdown.splitlines():
        if line.startswith("## ") and not line.startswith("### "):
            if current is not None:
                sections[current] = "\n".join(buf)
            current = line[3:].strip()
            buf = []
        elif current is not None:
            buf.append(line)
    if current is not None:
        sections[current] = "\n".join(buf)
    return sections


def _h2_match(section_title: str, wanted: str) -> bool:
    if section_title == wanted:
        return True
    return section_title.startswith(wanted + " ") or section_title.startswith(wanted + "(")


def section_body(markdown: str, h2_wanted: str) -> str:
    for title, body in split_h2_sections(markdown).items():
        if _h2_match(title, h2_wanted):
            return body
    return ""


def has_root_coverage(section_text: str, item: WorkItem) -> bool:
    if SLASH_CMD.search(section_text):
        for m in SLASH_CMD.finditer(f"{item.title}\n{item.summary}"):
            if m.group(1) in section_text:
                return True
    for m in SCRATCHPAD_KEY.finditer(f"{item.title}\n{item.summary}\n{item.body_text}"):
        if m.group(1) in section_text:
            return True
    if item.item_id in section_text:
        return True
    if re.search(rf"\b{re.escape(item.item_id)}\b", section_text):
        return True
    return False


def has_dev_coverage(section_text: str, item: WorkItem) -> bool:
    needle = item.item_id
    for line in section_text.splitlines():
        if needle not in line:
            continue
        if re.search(rf"\*\*{re.escape(needle)}\*\*", line):
            return True
        if "traceability:" in line.lower() and needle in line:
            return True
    return False


def check_template_parity(repo_root: str) -> List[str]:
    errors: List[str] = []
    pairs = (
        ("its_magic/README.md", "template/its_magic/README.md"),
        (
            "scripts/readme_feature_coverage_lib.py",
            "template/scripts/readme_feature_coverage_lib.py",
        ),
        (
            "scripts/validate_readme_feature_coverage.py",
            "template/scripts/validate_readme_feature_coverage.py",
        ),
    )
    for active_rel, tpl_rel in pairs:
        a = os.path.join(repo_root, active_rel.replace("/", os.sep))
        t = os.path.join(repo_root, tpl_rel.replace("/", os.sep))
        if not os.path.isfile(a) or not os.path.isfile(t):
            errors.append(f"{REASON_PARITY_FAIL}: missing {active_rel} or {tpl_rel}")
            continue
        if read_utf8(a) != read_utf8(t):
            errors.append(f"{REASON_PARITY_FAIL}: {active_rel} != {tpl_rel}")
    return errors


def check_profile_budget(repo_root: str, merged: Dict[str, str]) -> List[str]:
    try:
        import doc_profile_lib
    except ImportError:
        return []
    errs = doc_profile_lib.validate_repo_doc_profile(
        repo_root, merged, os.path.join(repo_root, "template")
    )
    out: List[str] = []
    for e in errs:
        if "DOC_SECTION_BUDGET_EXCEEDED" in e or "DOC_SECTION_MISSING" in e:
            out.append(f"{REASON_PROFILE_VIOLATION}: {e}")
    return out


def build_report(
    repo_root: str,
    backlog_path: str,
    enforce: bool,
    merged: Optional[Dict[str, str]] = None,
    skip_parity: bool = False,
) -> Tuple[Dict[str, Any], List[str]]:
    """Return (report_dict, stderr_lines)."""
    stderr: List[str] = []
    backlog_text = read_utf8(backlog_path)
    items = parse_backlog(backlog_text)
    manifest = load_affinity_manifest(repo_root)
    root_readme = read_utf8(os.path.join(repo_root, "its_magic", "README.md"))
    dev_readme = read_utf8(os.path.join(repo_root, "docs", "developer", "README.md"))

    if not skip_parity:
        for e in check_template_parity(repo_root):
            stderr.append(e)

    if merged is not None:
        for e in check_profile_budget(repo_root, merged):
            stderr.append(e)

    gaps: List[Dict[str, Any]] = []
    present: List[str] = []
    missing: List[str] = []
    total = 0

    for item in sorted(items, key=lambda x: x.item_id):
        pred = classify_item(item, enforce)
        if pred.input_invalid:
            stderr.append(f"{REASON_INPUT_INVALID}: {pred.invalid_reason}")
            continue
        if not pred.in_scope:
            continue
        total += 1
        aff = resolve_affinity(item, manifest)
        root_sec = section_body(root_readme, aff.root_h2)
        dev_sec = section_body(dev_readme, aff.dev_h2)
        root_ok = has_root_coverage(root_sec, item)
        dev_ok = has_dev_coverage(dev_sec, item)
        if root_ok and dev_ok:
            present.append(item.item_id)
        else:
            missing.append(item.item_id)
            gaps.append(
                {
                    "dev_h2": aff.dev_h2,
                    "id": item.item_id,
                    "kind": item.kind,
                    "predicate_source": pred.predicate_source,
                    "root_h2": aff.root_h2,
                    "user_visible": item.user_visible if item.user_visible is not None else True,
                }
            )
            stderr.append(f"{REASON_GAP}:{item.item_id}")

    status = "PASS" if not stderr and not missing else "FAIL"
    if missing or any(REASON_GAP in s for s in stderr):
        status = "FAIL"

    report = {
        "coverage_missing": sorted(missing),
        "coverage_present": sorted(present),
        "coverage_total": total,
        "gaps": sorted(gaps, key=lambda g: g["id"]),
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "repo_root": ".",
        "status": status,
    }
    return report, stderr


def canonical_json(obj: Dict[str, Any]) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"


def self_test_predicate_matrix() -> None:
    cases = [
        (
            WorkItem("US-0001", "US", "t", "DONE", "workflow", True, "", {}),
            False,
            True,
            "explicit:true",
        ),
        (
            WorkItem("US-0002", "US", "t", "DONE", "internal", False, "", {}),
            False,
            False,
            "explicit:false",
        ),
        (
            WorkItem("US-0003", "US", "t", "DONE", "Use /release for ship", None, "", {}),
            False,
            True,
            "heuristic:H1",
        ),
        (
            WorkItem(
                "US-0004",
                "US",
                "t",
                "DONE",
                "template parity guard triad archiver",
                None,
                "",
                {},
            ),
            False,
            False,
            "heuristic:out",
        ),
        (
            WorkItem(
                "US-0005",
                "US",
                "t",
                "DONE",
                "triad archiver /intake",
                None,
                "",
                {},
            ),
            False,
            True,
            None,
        ),
        (
            WorkItem("US-0006", "US", "t", "DONE", "pure internal refactor", None, "", {}),
            False,
            False,
            "heuristic:ambiguous",
            True,
        ),
        (
            WorkItem("BUG-0001", "BUG", "t", "DONE", "silent", None, "", {}),
            False,
            False,
            "heuristic:out",
        ),
    ]
    for case in cases:
        item, enforce, want_in, want_src, *extra = case
        want_invalid = bool(extra and extra[0] is True)
        pred = classify_item(item, enforce)
        if want_invalid:
            assert pred.input_invalid, item.item_id
        else:
            assert pred.in_scope == want_in, (item.item_id, pred)
            if want_in and want_src is not None:
                assert pred.predicate_source == want_src, (
                    item.item_id,
                    pred.predicate_source,
                )

    # enforce=1 unset fails
    unset = WorkItem("US-0099", "US", "t", "DONE", "x", None, "", {})
    pred = classify_item(unset, True)
    assert pred.input_invalid


def self_test_report_schema() -> None:
    sample = {
        "coverage_missing": [],
        "coverage_present": ["US-0001"],
        "coverage_total": 1,
        "gaps": [],
        "report_schema_version": 1,
        "repo_root": ".",
        "status": "PASS",
    }
    a = canonical_json(sample)
    b = canonical_json(sample)
    assert a == b
