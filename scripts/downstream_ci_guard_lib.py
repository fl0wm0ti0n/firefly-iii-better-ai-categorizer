"""
Downstream CI drift guard — template forbidden-pattern scan + active inventory (BUG-0009 / DEC-0075).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

JOB_KEY_RE = re.compile(r"^\s{2}(\w[\w-]*):", re.MULTILINE)

FORBIDDEN_JOB_IDS = frozenset({"npm-test", "brew-test", "choco-test"})
ALLOWED_TEMPLATE_JOBS = frozenset({"checks", "auto-fix"})
REQUIRED_ACTIVE_JOBS = frozenset(
    {"checks", "auto-fix", "npm-test", "brew-test", "choco-test"}
)

FORBIDDEN_SUBSTRINGS: Tuple[str, ...] = (
    "npm-test",
    "brew-test",
    "choco-test",
    "npm pack",
    "its-magic-*.tgz",
    "installer.sh",
    "packaging/chocolatey",
    "packaging/homebrew",
    "choco pack",
    "brew style",
)

REASON_FORBIDDEN_PATTERN = "DOWNSTREAM_CI_FORBIDDEN_PATTERN"
REASON_JOB_LEAK = "DOWNSTREAM_CI_JOB_LEAK"
REASON_PACKAGING_MISSING = "KIT_CI_PACKAGING_JOBS_MISSING"

REPORT_SCHEMA_VERSION = 1


@dataclass
class GuardViolation:
    reason_code: str
    detail: str


@dataclass
class GuardReport:
    template_job_keys: List[str] = field(default_factory=list)
    active_job_keys: List[str] = field(default_factory=list)
    forbidden_hits: List[str] = field(default_factory=list)
    violations: List[GuardViolation] = field(default_factory=list)
    ok: bool = True


def read_utf8(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def extract_job_keys(yaml_text: str) -> List[str]:
    """Extract top-level job ids from a GitHub Actions workflow (stdlib regex only)."""
    keys: List[str] = []
    in_jobs = False
    for line in yaml_text.splitlines():
        if re.match(r"^jobs:\s*$", line):
            in_jobs = True
            continue
        if not in_jobs:
            continue
        m = JOB_KEY_RE.match(line)
        if m:
            keys.append(m.group(1))
        elif line and not line.startswith(" ") and not line.startswith("#"):
            break
    return keys


def scan_forbidden_patterns(yaml_text: str) -> List[str]:
    hits: List[str] = []
    for pattern in FORBIDDEN_SUBSTRINGS:
        if pattern in yaml_text:
            hits.append(pattern)
    return hits


def check_template_ci(yaml_text: str) -> List[GuardViolation]:
    violations: List[GuardViolation] = []
    job_keys = extract_job_keys(yaml_text)
    extra_jobs = set(job_keys) - ALLOWED_TEMPLATE_JOBS
    if extra_jobs:
        violations.append(
            GuardViolation(
                REASON_JOB_LEAK,
                f"template ci.yml job keys {sorted(job_keys)!r} exceed allowed "
                f"{sorted(ALLOWED_TEMPLATE_JOBS)!r}",
            )
        )
    forbidden = scan_forbidden_patterns(yaml_text)
    if forbidden:
        violations.append(
            GuardViolation(
                REASON_FORBIDDEN_PATTERN,
                f"template ci.yml contains forbidden pattern(s): {forbidden}",
            )
        )
    return violations


def check_active_ci(yaml_text: str) -> List[GuardViolation]:
    violations: List[GuardViolation] = []
    job_keys = set(extract_job_keys(yaml_text))
    missing = REQUIRED_ACTIVE_JOBS - job_keys
    if missing:
        violations.append(
            GuardViolation(
                REASON_PACKAGING_MISSING,
                f"active ci.yml missing required job id(s): {sorted(missing)!r}; "
                f"found {sorted(job_keys)!r}",
            )
        )
    return violations


def build_report(repo_root: str) -> Tuple[GuardReport, List[str]]:
    report = GuardReport()
    stderr_lines: List[str] = []

    template_ci = os.path.join(
        repo_root, "template", ".github", "workflows", "ci.yml"
    )
    active_ci = os.path.join(repo_root, ".github", "workflows", "ci.yml")

    if not os.path.isfile(template_ci):
        stderr_lines.append(f"missing template ci.yml: {template_ci}")
        report.ok = False
        return report, stderr_lines
    if not os.path.isfile(active_ci):
        stderr_lines.append(f"missing active ci.yml: {active_ci}")
        report.ok = False
        return report, stderr_lines

    template_text = read_utf8(template_ci)
    active_text = read_utf8(active_ci)

    report.template_job_keys = extract_job_keys(template_text)
    report.active_job_keys = extract_job_keys(active_text)
    report.forbidden_hits = scan_forbidden_patterns(template_text)

    for v in check_template_ci(template_text):
        report.violations.append(v)
        stderr_lines.append(f"{v.reason_code}: {v.detail}")
    for v in check_active_ci(active_text):
        report.violations.append(v)
        stderr_lines.append(f"{v.reason_code}: {v.detail}")

    report.ok = len(report.violations) == 0
    return report, stderr_lines


def report_to_dict(report: GuardReport) -> Dict[str, Any]:
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "template_job_keys": report.template_job_keys,
        "active_job_keys": report.active_job_keys,
        "forbidden_hits": report.forbidden_hits,
        "violations": [
            {"reason_code": v.reason_code, "detail": v.detail}
            for v in report.violations
        ],
        "ok": report.ok,
    }


def self_test() -> None:
    sample_template = """name: ci
jobs:
  checks:
    runs-on: ubuntu-latest
  auto-fix:
    runs-on: ubuntu-latest
"""
    keys = extract_job_keys(sample_template)
    assert keys == ["checks", "auto-fix"], keys

    bad_template = """name: ci
jobs:
  checks:
    runs-on: ubuntu-latest
  npm-test:
    runs-on: ubuntu-latest
    steps:
      - run: npm pack
"""
    v = check_template_ci(bad_template)
    assert any(x.reason_code == REASON_JOB_LEAK for x in v)
    assert any(x.reason_code == REASON_FORBIDDEN_PATTERN for x in v)

    good_active = """name: ci
jobs:
  checks:
    runs-on: ubuntu-latest
  auto-fix:
    runs-on: ubuntu-latest
  npm-test:
    runs-on: ubuntu-latest
  brew-test:
    runs-on: ubuntu-latest
  choco-test:
    runs-on: ubuntu-latest
"""
    assert not check_active_ci(good_active)

    bad_active = """name: ci
jobs:
  checks:
    runs-on: ubuntu-latest
  auto-fix:
    runs-on: ubuntu-latest
"""
    v2 = check_active_ci(bad_active)
    assert len(v2) == 1 and v2[0].reason_code == REASON_PACKAGING_MISSING
