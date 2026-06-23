"""
Documentation profile resolution and surface helpers (DEC-0059).

Shared by installer (optional surface sync) and scripts/validate_doc_profile.py.
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional, Set, Tuple

DOC_AUDIENCE_ALLOWED = frozenset({"user", "developer", "both"})
DOC_DETAIL_ALLOWED = frozenset({"concise", "balanced", "technical-deep"})

USER_KEY_TO_H2: Dict[str, str] = {
    "USER_PURPOSE": "Purpose",
    "USER_QUICKSTART": "Quickstart",
    "USER_EXAMPLES": "Examples",
    "USER_TROUBLESHOOTING": "Troubleshooting",
    "USER_LIMITATIONS": "Limitations",
    "USER_RELATED_DOCS": "Related documentation",
}

DEV_KEY_TO_H2: Dict[str, str] = {
    "DEV_PREREQS": "Prerequisites",
    "DEV_WORKFLOW": "Workflow",
    "DEV_QUALITY_GATES": "Quality gates",
    "DEV_ARCHITECTURE": "Architecture notes",
    "DEV_CONTRACTS": "Contracts and interfaces",
    "DEV_DECISIONS": "Engineering decisions",
}

DEV_H2_TITLES = frozenset(DEV_KEY_TO_H2.values())
USER_H2_TITLES = frozenset(USER_KEY_TO_H2.values())

POINTER_H2 = "Contributing"

# Root README H2 budget (user-channel headings + optional Contributing pointer only).
ROOT_BUDGET: Dict[Tuple[str, str], int] = {}
for aud in ("user", "developer", "both"):
    for det in ("concise", "balanced", "technical-deep"):
        if aud == "user":
            ROOT_BUDGET[(aud, det)] = {"concise": 5, "balanced": 7, "technical-deep": 9}[det]
        elif aud == "developer":
            ROOT_BUDGET[(aud, det)] = {"concise": 4, "balanced": 6, "technical-deep": 8}[det]
        else:
            ROOT_BUDGET[(aud, det)] = {"concise": 6, "balanced": 8, "technical-deep": 6}[det]


def resolve_doc_profile(merged: Dict[str, str]) -> Tuple[Optional[str], Optional[str], List[str]]:
    """Return (audience, detail, errors). Empty profile keys default per DEC-0059 §6."""
    raw_a = (merged.get("DOC_AUDIENCE_PROFILE") or "").strip().lower()
    raw_d = (merged.get("DOC_DETAIL_LEVEL") or "").strip().lower()
    errors: List[str] = []
    if raw_a and raw_a not in DOC_AUDIENCE_ALLOWED:
        errors.append(
            "[DOC_PROFILE_INVALID] DOC_AUDIENCE_PROFILE must be one of: "
            f"user, developer, both (got={raw_a!r})."
        )
    if raw_d and raw_d not in DOC_DETAIL_ALLOWED:
        errors.append(
            "[DOC_PROFILE_INVALID] DOC_DETAIL_LEVEL must be one of: "
            f"concise, balanced, technical-deep (got={raw_d!r})."
        )
    if errors:
        return None, None, errors
    audience = raw_a or "both"
    detail = raw_d or "balanced"
    return audience, detail, []


def required_user_keys(audience: str, detail: str) -> Set[str]:
    if audience not in ("user", "both"):
        return set()
    if detail == "concise":
        return {"USER_PURPOSE", "USER_QUICKSTART", "USER_LIMITATIONS"}
    if detail == "balanced":
        return {
            "USER_PURPOSE",
            "USER_QUICKSTART",
            "USER_LIMITATIONS",
            "USER_EXAMPLES",
            "USER_RELATED_DOCS",
        }
    return {
        "USER_PURPOSE",
        "USER_QUICKSTART",
        "USER_LIMITATIONS",
        "USER_EXAMPLES",
        "USER_RELATED_DOCS",
        "USER_TROUBLESHOOTING",
    }


def required_dev_keys(audience: str, detail: str) -> Set[str]:
    if audience not in ("developer", "both"):
        return set()
    if detail == "concise":
        return {"DEV_PREREQS", "DEV_WORKFLOW"}
    if detail == "balanced":
        return {"DEV_PREREQS", "DEV_WORKFLOW", "DEV_QUALITY_GATES", "DEV_ARCHITECTURE"}
    return {
        "DEV_PREREQS",
        "DEV_WORKFLOW",
        "DEV_QUALITY_GATES",
        "DEV_ARCHITECTURE",
        "DEV_CONTRACTS",
        "DEV_DECISIONS",
    }


def extract_h2_titles(markdown: str) -> List[str]:
    titles: List[str] = []
    for line in markdown.splitlines():
        if line.startswith("## ") and not line.startswith("###"):
            titles.append(line[3:].strip())
    return titles


def has_exact_h2(markdown: str, title: str) -> bool:
    for line in markdown.splitlines():
        if line.startswith("## ") and not line.startswith("###"):
            if line[3:].strip() == title:
                return True
    return False


def count_profile_root_h2s(
    markdown: str,
    audience: str,
    detail: str,
    required_user_keys_set: Set[str],
) -> int:
    """
    Count H2 lines in budget scope: required USER_* titles only for user/both;
    Contributing pointer alone for developer-only (DEC-0059 / R-0054 user H2 budgets).
    """
    titles = extract_h2_titles(markdown)
    want: Set[str] = set()
    for key in required_user_keys_set:
        want.add(USER_KEY_TO_H2[key])
    if audience == "developer":
        return sum(1 for t in titles if t == POINTER_H2)
    n = 0
    for t in titles:
        if t in want:
            n += 1
    return n


def dev_h2_forbidden_in_root(markdown: str) -> List[str]:
    """Return DEV_* H2 titles present in root (split layout forbids these in README)."""
    found: List[str] = []
    for t in extract_h2_titles(markdown):
        if t in DEV_H2_TITLES:
            found.append(t)
    return found


def validate_optional_modes(merged: Dict[str, str], readme_text: str) -> List[str]:
    """
    US-0031 / US-0032 compatibility: never require optional artifacts when modes are off.
    When on, ensure profile surfaces mention cross-links (additive, lightweight).
    """
    out: List[str] = []
    sp = (merged.get("SPEC_PACK_MODE") or "0").strip()
    ug = (merged.get("USER_GUIDE_MODE") or "0").strip()
    if sp != "1" and ug != "1":
        return out
    if sp == "1":
        if "docs/engineering" not in readme_text and "spec" not in readme_text.lower():
            out.append(
                "[DOC_OPTIONAL_CROSSLINK_WEAK] SPEC_PACK_MODE=1: root README should mention "
                "engineering docs or spec-pack paths in a user channel section (see Related documentation)."
            )
    if ug == "1":
        if "user-guides" not in readme_text and "user guide" not in readme_text.lower():
            out.append(
                "[DOC_OPTIONAL_CROSSLINK_WEAK] USER_GUIDE_MODE=1: root README should mention "
                "docs/user-guides in a user channel section."
            )
    return out


def ensure_section(path: str, h2_title: str, body: str) -> Tuple[bool, str]:
    """
    Append ## h2_title + body if missing. Non-destructive.
    Returns (changed, message).
    """
    ensure_parent_dir(path)
    if os.path.isfile(path):
        text = _read_utf8(path)
    else:
        text = ""

    if has_exact_h2(text, h2_title):
        return False, f"[DOC_PROFILE_SYNC] skip existing: ## {h2_title} ({path})"

    block = f"\n\n## {h2_title}\n\n{body.strip()}\n"
    if not text:
        base = os.path.basename(path)
        if base.lower() == "readme.md":
            text = f"# Documentation\n"
        else:
            text = f"# {base.replace('.md', '').replace('_', ' ')}\n"
    new_text = text.rstrip() + block
    _write_utf8(path, new_text)
    return True, f"[DOC_PROFILE_SYNC] appended: ## {h2_title} ({path})"


def ensure_doc_surfaces_merged(
    merged: Dict[str, str],
    target_root: str,
    print_ok: bool = True,
) -> List[str]:
    audience, detail, errors = resolve_doc_profile(merged)
    if errors:
        return list(errors)
    assert audience is not None and detail is not None
    messages: List[str] = []
    uk = required_user_keys(audience, detail)
    dk = required_dev_keys(audience, detail)
    readme = os.path.join(target_root, "README.md")
    dev_readme = os.path.join(target_root, "docs", "developer", "README.md")

    stubs_user = {
        "USER_PURPOSE": (
            "Describe what this repository is for in plain language. "
            "Replace this placeholder with your product outcome."
        ),
        "USER_QUICKSTART": (
            "Link to your fastest path to success. For its-magic, see [Setup](#setup) above."
        ),
        "USER_EXAMPLES": "Add short, copy-paste friendly examples for common tasks.",
        "USER_TROUBLESHOOTING": (
            "List frequent issues, what to check, and where logs or docs live."
        ),
        "USER_LIMITATIONS": "Call out known limits, unsupported environments, or sharp edges.",
        "USER_RELATED_DOCS": (
            "Link runbooks, architecture notes, and deeper guides. "
            "Operator commands live in `docs/engineering/runbook.md`."
        ),
    }
    stubs_dev = {
        "DEV_PREREQS": "Toolchain, repo layout, and local prerequisites for contributors.",
        "DEV_WORKFLOW": "Branching, phases, and day-to-day contributor workflow.",
        "DEV_QUALITY_GATES": "Tests, lint, typecheck, and review expectations before merge.",
        "DEV_ARCHITECTURE": "High-level modules, boundaries, and extension points.",
        "DEV_CONTRACTS": "Public interfaces, file formats, and compatibility promises.",
        "DEV_DECISIONS": "Pointers to `decisions/` and architecture sections that matter.",
    }

    for key in sorted(uk):
        h2 = USER_KEY_TO_H2[key]
        changed, msg = ensure_section(readme, h2, stubs_user[key])
        if print_ok or changed:
            messages.append(msg)

    if dk:
        for key in sorted(dk):
            h2 = DEV_KEY_TO_H2[key]
            changed, msg = ensure_section(dev_readme, h2, stubs_dev[key])
            if print_ok or changed:
                messages.append(msg)

    if audience in ("developer", "both"):
        contrib_body = (
            "Contributor-focused workflow and guardrails live in "
            "[`docs/developer/README.md`](docs/developer/README.md)."
        )
        changed, msg = ensure_section(readme, POINTER_H2, contrib_body)
        if print_ok or changed:
            messages.append(msg)

    return messages


def optional_mode_warnings(merged: Dict[str, str], readme_text: str) -> List[str]:
    """Non-blocking hints when optional doc modes are enabled (US-0031 / US-0032)."""
    return validate_optional_modes(merged, readme_text)


def ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)


def _read_utf8(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _write_utf8(path: str, text: str) -> None:
    ensure_parent_dir(path)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def validate_repo_doc_profile(
    target_root: str,
    merged: Dict[str, str],
    template_root: Optional[str],
) -> List[str]:
    """
    Full validation for active target_root; optional template_root for parity.
    Returns error strings (empty => pass).
    """
    errors: List[str] = []
    audience, detail, err = resolve_doc_profile(merged)
    errors.extend(err)
    if errors:
        return errors
    assert audience is not None and detail is not None

    uk = required_user_keys(audience, detail)
    dk = required_dev_keys(audience, detail)

    readme_path = os.path.join(target_root, "README.md")
    dev_path = os.path.join(target_root, "docs", "developer", "README.md")

    if not os.path.isfile(readme_path):
        errors.append("[DOC_PROFILE_MERGE_ERROR] README.md missing (required for user channel checks).")
        return errors

    readme_text = _read_utf8(readme_path)

    if audience in ("developer", "both") and dk:
        if not os.path.isfile(dev_path):
            errors.append(
                "[DOC_SECTION_MISSING:shard] docs/developer/README.md missing but profile requires developer sections."
            )

    if audience in ("developer", "both"):
        if not has_exact_h2(readme_text, POINTER_H2):
            errors.append(
                f"[DOC_SECTION_MISSING:DEV_SHARD_POINTER] Missing H2 ## {POINTER_H2} in README.md "
                "(required pointer to docs/developer/README.md per DEC-0059)."
            )
        bad = dev_h2_forbidden_in_root(readme_text)
        if bad:
            errors.append(
                "[DOC_PROFILE_INVALID] DEV sections must not use root README for split layout; "
                f"found H2 titles {bad!r}. Move them to docs/developer/README.md."
            )

    for key in sorted(uk):
        h2 = USER_KEY_TO_H2[key]
        if not has_exact_h2(readme_text, h2):
            errors.append(f"[DOC_SECTION_MISSING:{key}] Missing H2 ## {h2} in README.md.")

    dev_text = ""
    if os.path.isfile(dev_path):
        dev_text = _read_utf8(dev_path)

    for key in sorted(dk):
        h2 = DEV_KEY_TO_H2[key]
        if not has_exact_h2(dev_text, h2):
            errors.append(f"[DOC_SECTION_MISSING:{key}] Missing H2 ## {h2} in docs/developer/README.md.")

    budget = ROOT_BUDGET.get((audience, detail), 8)
    counted = count_profile_root_h2s(readme_text, audience, detail, uk)
    if counted > budget:
        errors.append(
            f"[DOC_SECTION_BUDGET_EXCEEDED] Root README profile-scoped H2 count={counted} "
            f"exceeds budget={budget} for audience={audience!r} detail={detail!r}."
        )

    if template_root:
        tr = os.path.join(template_root, "README.md")
        td = os.path.join(template_root, "docs", "developer", "README.md")
        if not os.path.isfile(tr):
            errors.append("[DOC_TEMPLATE_PARITY_FAIL] template/README.md missing.")
        else:
            tt = _read_utf8(tr)
            for key in sorted(uk):
                h2 = USER_KEY_TO_H2[key]
                if has_exact_h2(readme_text, h2) != has_exact_h2(tt, h2):
                    errors.append(
                        f"[DOC_TEMPLATE_PARITY_FAIL] USER H2 ## {h2} presence differs active vs template README."
                    )
            if audience in ("developer", "both"):
                if has_exact_h2(readme_text, POINTER_H2) != has_exact_h2(tt, POINTER_H2):
                    errors.append(
                        "[DOC_TEMPLATE_PARITY_FAIL] ## Contributing pointer presence differs active vs template README."
                    )
        if dk:
            if not os.path.isfile(td) or not os.path.isfile(dev_path):
                errors.append(
                    "[DOC_TEMPLATE_PARITY_FAIL] developer README missing in active or template."
                )
            else:
                tdev = _read_utf8(td)
                for key in sorted(dk):
                    h2 = DEV_KEY_TO_H2[key]
                    if has_exact_h2(dev_text, h2) != has_exact_h2(tdev, h2):
                        errors.append(
                            f"[DOC_TEMPLATE_PARITY_FAIL] DEV H2 ## {h2} presence differs active vs template."
                        )

    return errors


def self_test_resolver() -> None:
    """Tier B: assert matrix key sets."""
    assert required_user_keys("user", "concise") == {
        "USER_PURPOSE",
        "USER_QUICKSTART",
        "USER_LIMITATIONS",
    }
    assert required_dev_keys("developer", "technical-deep") == set(DEV_KEY_TO_H2.keys())
    a, d, e = resolve_doc_profile({"DOC_AUDIENCE_PROFILE": "", "DOC_DETAIL_LEVEL": ""})
    assert not e and a == "both" and d == "balanced"
    _, _, e2 = resolve_doc_profile({"DOC_AUDIENCE_PROFILE": "nope"})
    assert e2 and "DOC_PROFILE_INVALID" in e2[0]
