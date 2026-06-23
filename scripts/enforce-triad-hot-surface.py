#!/usr/bin/env python3
"""
Deterministic hot-surface enforcement for the engineering triad (DEC-0054).

Surfaces:
  docs/engineering/state.md
  handoffs/po_to_tl.md
  docs/engineering/architecture.md

Thresholds resolve from merged .cursor/scratchpad.md + scratchpad.local.md.

Modes:
  --check     fail closed if any surface exceeds policy (exit 1)
  --rollover  archive oldest material into deterministic packs; idempotent
  --self-test built-in regression (temp fixtures, no repo mutation)

User-facing diagnostics avoid planning-shaped tokens; use paths + reason codes.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

DEFAULTS = {
    "STATE_HOT_MAX_LINES": "1200",
    "STATE_HOT_MAX_CHECKPOINTS": "80",
    "PO_TO_TL_HOT_MAX_LINES": "800",
    "PO_TO_TL_HOT_MAX_SECTIONS": "60",
    "ARCH_HOT_MAX_LINES": "3500",
    "ARCH_HOT_MAX_STORY_SECTIONS": "120",
}

STATE_REL = Path("docs/engineering/state.md")
PO_REL = Path("handoffs/po_to_tl.md")
ARCH_REL = Path("docs/engineering/architecture.md")
STATE_ARCH_DIR = Path("docs/engineering/state-archive")
PO_ARCH_DIR = Path("handoffs/archive")
ARCH_ARCH_DIR = Path("docs/engineering/architecture-archive")

CHECKPOINT_HEADING = re.compile(r"^## .*\bcheckpoint\b.*$", re.I)
STORY_HEADING_H1 = re.compile(r"^# (?:US|BUG)-\d{4}\s*[:\u2014\-].+$")
STORY_HEADING_H2 = re.compile(r"^## US-\d{4}\s*[:\u2014\-].+$")
_STORY_ID_FROM_LINE = re.compile(r"(?:US|BUG)-\d{4}")


class PolicyError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _repo_root(cli: Optional[str]) -> Path:
    if cli:
        return Path(cli).resolve()
    return Path(__file__).resolve().parent.parent


def _parse_scratchpad_text(text: str, into: Dict[str, str]) -> None:
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("- "):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and val:
            into[key] = val


def load_merged_policy(repo: Path) -> Dict[str, str]:
    """Merge scratchpad layers: DEFAULTS < example < baseline < local (DEC-0055)."""
    out = dict(DEFAULTS)
    example = repo / ".cursor" / "scratchpad.local.example.md"
    base = repo / ".cursor" / "scratchpad.md"
    local = repo / ".cursor" / "scratchpad.local.md"
    if example.is_file():
        _parse_scratchpad_text(example.read_text(encoding="utf-8"), out)
    if base.is_file():
        _parse_scratchpad_text(base.read_text(encoding="utf-8"), out)
    if local.is_file():
        _parse_scratchpad_text(local.read_text(encoding="utf-8"), out)
    return out


def _int_policy(policy: Dict[str, str], key: str) -> int:
    try:
        v = int(policy[key])
        if v < 1:
            raise ValueError
        return v
    except (KeyError, ValueError) as exc:
        raise PolicyError(
            "STATE_ARCHIVE_VERIFICATION_FAILED",
            f"invalid or missing integer policy {key}",
        ) from exc


def line_count(text: str) -> int:
    if not text:
        return 0
    return len(text.splitlines())


def split_state_checkpoints(text: str) -> Tuple[str, List[str]]:
    lines = text.splitlines(keepends=True)
    idxs = [i for i, ln in enumerate(lines) if CHECKPOINT_HEADING.match(ln.rstrip("\r\n"))]
    if not idxs:
        return text, []
    preamble = "".join(lines[: idxs[0]])
    blocks: List[str] = []
    for j, start in enumerate(idxs):
        end = idxs[j + 1] if j + 1 < len(idxs) else len(lines)
        blocks.append("".join(lines[start:end]))
    return preamble, blocks


def split_po_sections(text: str) -> List[str]:
    lines = text.splitlines(keepends=True)
    starts = [i for i, ln in enumerate(lines) if ln.startswith("## ")]
    if not starts:
        return [text] if text.strip() else []
    sections: List[str] = []
    for j, start in enumerate(starts):
        end = starts[j + 1] if j + 1 < len(starts) else len(lines)
        sections.append("".join(lines[start:end]))
    return sections


def _story_boundary_candidates(text: str) -> List[Tuple[int, str, int]]:
    """Collect (line_idx, story_id, level) for H1/H2 story-heading matches."""
    lines = text.splitlines(keepends=True)
    candidates: List[Tuple[int, str, int]] = []
    for i, ln in enumerate(lines):
        stripped = ln.rstrip("\r\n")
        if STORY_HEADING_H1.match(stripped):
            m = _STORY_ID_FROM_LINE.search(stripped)
            if m:
                candidates.append((i, m.group(0), 1))
        elif STORY_HEADING_H2.match(stripped):
            m = _STORY_ID_FROM_LINE.search(stripped)
            if m:
                candidates.append((i, m.group(0), 2))
    return candidates


def split_arch_stories(text: str) -> Tuple[str, List[str]]:
    lines = text.splitlines(keepends=True)
    candidates = _story_boundary_candidates(text)
    if not candidates:
        return text, []
    h1_ids = {story_id for _, story_id, level in candidates if level == 1}
    idxs = sorted(
        idx
        for idx, story_id, level in candidates
        if not (level == 2 and story_id in h1_ids)
    )
    if not idxs:
        return text, []
    preamble = "".join(lines[: idxs[0]])
    blocks: List[str] = []
    for j, start in enumerate(idxs):
        end = idxs[j + 1] if j + 1 < len(idxs) else len(lines)
        blocks.append("".join(lines[start:end]))
    return preamble, blocks


def count_h2_story_headings(text: str) -> int:
    return sum(
        1 for ln in text.splitlines() if STORY_HEADING_H2.match(ln.rstrip("\r\n"))
    )


def check_arch_heading_policy(text_after: str, baseline_h2_count: int) -> Optional[str]:
    if count_h2_story_headings(text_after) > baseline_h2_count:
        return "ARCH_STORY_HEADING_LEVEL_INVALID"
    return None


def next_pack_path(repo: Path, archive_dir: Path, stem: str) -> Path:
    archive_dir.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    base = archive_dir / f"{stem}-{day}.md"
    if not base.exists():
        return base
    alphabet = "abcdefghijklmnopqrstuvwxyz"
    # Deterministic expansion: first single-letter suffixes, then double-letter.
    for c in alphabet:
        cand = archive_dir / f"{stem}-{day}-{c}.md"
        if not cand.exists():
            return cand
    for c1 in alphabet:
        for c2 in alphabet:
            cand = archive_dir / f"{stem}-{day}-{c1}{c2}.md"
            if not cand.exists():
                return cand
    raise PolicyError(
        "STATE_ARCHIVE_WRITE_FAILED",
        "exhausted deterministic pack disambiguators for today",
    )


def write_pack_header(
    pack_path: Path,
    title: str,
    source_rel: str,
    trigger: str,
    verification: Dict[str, object],
    first_heading: str,
    last_heading: str,
    moved_units: int,
    retained_units: int,
) -> None:
    header_lines = [
        f"# {title}",
        "",
        f"- Rollover trigger: `{trigger}`",
        f"- Source: `{source_rel}`",
        f"- Archived units (oldest first, contiguous prefix): {moved_units}",
        f"- Retained units in hot file: {retained_units}",
        f"- First archived heading: `{first_heading}`",
        f"- Last archived heading: `{last_heading}`",
        "- Verification tuple (mandatory):",
    ]
    for k in sorted(verification.keys()):
        header_lines.append(f"  - {k}={verification[k]}")
    header_lines.extend(["", "---", ""])
    block = "\n".join(header_lines) + "\n"
    pack_path.write_text(block, encoding="utf-8")


def rollover_state(repo: Path, policy: Dict[str, str], dry_run: bool) -> Optional[Dict[str, object]]:
    path = repo / STATE_REL
    text = path.read_text(encoding="utf-8")
    max_lines = _int_policy(policy, "STATE_HOT_MAX_LINES")
    max_cp = _int_policy(policy, "STATE_HOT_MAX_CHECKPOINTS")
    preamble, blocks = split_state_checkpoints(text)
    if not blocks:
        if line_count(text) <= max_lines:
            return None
        raise PolicyError(
            "STATE_ARCHIVE_BOUNDARY_AMBIGUOUS",
            "state file exceeds line cap but has no checkpoint headings to archive",
        )
    if line_count(text) <= max_lines and len(blocks) <= max_cp:
        return None
    moved = 0
    work_blocks = list(blocks)
    archived_chunks: List[str] = []
    while work_blocks and (
        line_count(preamble + "".join(work_blocks)) > max_lines or len(work_blocks) > max_cp
    ):
        archived_chunks.append(work_blocks.pop(0))
        moved += 1
    if not archived_chunks:
        return None
    combined = preamble + "".join(work_blocks)
    if line_count(combined) > max_lines or len(work_blocks) > max_cp:
        raise PolicyError(
            "ARTIFACT_HOT_SURFACE_OVERSIZE",
            "state preamble or single checkpoint exceeds hot line cap; manual split required",
        )
    new_body = preamble + "".join(work_blocks)
    first_h = archived_chunks[0].splitlines()[0].strip() if archived_chunks else ""
    last_h = archived_chunks[-1].splitlines()[0].strip() if archived_chunks else ""
    trigger = (
        f"STATE_HOT_MAX_LINES={max_lines}, STATE_HOT_MAX_CHECKPOINTS={max_cp}"
    )
    pack = next_pack_path(repo, repo / STATE_ARCH_DIR, "state-pack")
    ver = {
        "boundary": "triad-rollover|state",
        "moved": moved,
        "retained_checkpoints": len(work_blocks),
        "retained_lines": line_count(new_body),
        "pack_ref": str(pack.as_posix()),
    }
    if dry_run:
        return ver
    archived_body = "".join(archived_chunks)
    write_pack_header(
        pack,
        f"State archive pack ({day_stamp()})",
        STATE_REL.as_posix(),
        trigger,
        {
            "archived_body_lines": line_count(archived_body),
            "retained_body_lines": line_count(new_body),
            "preamble_lines": line_count(preamble),
        },
        first_h,
        last_h,
        moved,
        len(work_blocks),
    )
    with pack.open("a", encoding="utf-8") as fh:
        fh.write(archived_body)
        if not archived_body.endswith("\n"):
            fh.write("\n")
    path.write_text(new_body, encoding="utf-8", newline="\n")
    return ver


def day_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def rollover_po_to_tl(repo: Path, policy: Dict[str, str], dry_run: bool) -> Optional[Dict[str, object]]:
    path = repo / PO_REL
    text = path.read_text(encoding="utf-8")
    max_lines = _int_policy(policy, "PO_TO_TL_HOT_MAX_LINES")
    max_sec = _int_policy(policy, "PO_TO_TL_HOT_MAX_SECTIONS")
    sections = split_po_sections(text)
    if not sections:
        if line_count(text) <= max_lines:
            return None
        raise PolicyError(
            "STATE_ARCHIVE_BOUNDARY_AMBIGUOUS",
            "handoff file exceeds line cap but has no ## sections to archive",
        )
    moved = 0
    work = list(sections)
    archived: List[str] = []
    while work and (line_count("".join(work)) > max_lines or len(work) > max_sec):
        archived.append(work.pop(0))
        moved += 1
    if not archived:
        return None
    new_body = "".join(work)
    if line_count(new_body) > max_lines or len(work) > max_sec:
        raise PolicyError(
            "ARTIFACT_HOT_SURFACE_OVERSIZE",
            "a single handoff section exceeds policy; manual split required",
        )
    first_h = archived[0].splitlines()[0].strip() if archived else ""
    last_h = archived[-1].splitlines()[0].strip() if archived else ""
    trigger = (
        f"PO_TO_TL_HOT_MAX_LINES={max_lines}, "
        f"PO_TO_TL_HOT_MAX_SECTIONS={max_sec}"
    )
    pack = next_pack_path(repo, repo / PO_ARCH_DIR, "po-to-tl-pack")
    ver = {
        "boundary": "triad-rollover|po_to_tl",
        "moved": moved,
        "retained_sections": len(work),
        "retained_lines": line_count(new_body),
        "pack_ref": str(pack.as_posix()),
    }
    if dry_run:
        return ver
    archived_body = "".join(archived)
    write_pack_header(
        pack,
        f"PO to TL archive pack ({day_stamp()})",
        PO_REL.as_posix(),
        trigger,
        {
            "archived_body_lines": line_count(archived_body),
            "retained_body_lines": line_count(new_body),
        },
        first_h,
        last_h,
        moved,
        len(work),
    )
    with pack.open("a", encoding="utf-8") as fh:
        fh.write(archived_body)
        if not archived_body.endswith("\n"):
            fh.write("\n")
    path.write_text(new_body, encoding="utf-8", newline="\n")
    return ver


def rollover_architecture(repo: Path, policy: Dict[str, str], dry_run: bool) -> Optional[Dict[str, object]]:
    path = repo / ARCH_REL
    text = path.read_text(encoding="utf-8")
    max_lines = _int_policy(policy, "ARCH_HOT_MAX_LINES")
    max_stories = _int_policy(policy, "ARCH_HOT_MAX_STORY_SECTIONS")
    preamble, stories = split_arch_stories(text)
    if not stories:
        if line_count(text) <= max_lines:
            return None
        raise PolicyError(
            "STATE_ARCHIVE_BOUNDARY_AMBIGUOUS",
            "architecture file exceeds line cap but has no story headings to archive",
        )
    moved = 0
    work = list(stories)
    archived: List[str] = []
    while work and (
        line_count(preamble + "".join(work)) > max_lines or len(work) > max_stories
    ):
        archived.append(work.pop(0))
        moved += 1
    if not archived:
        return None
    new_body = preamble + "".join(work)
    if line_count(new_body) > max_lines or len(work) > max_stories:
        raise PolicyError(
            "ARTIFACT_HOT_SURFACE_OVERSIZE",
            "architecture preamble or single story block exceeds policy; manual split required",
        )
    first_h = archived[0].splitlines()[0].strip() if archived else ""
    last_h = archived[-1].splitlines()[0].strip() if archived else ""
    trigger = f"ARCH_HOT_MAX_LINES={max_lines}, ARCH_HOT_MAX_STORY_SECTIONS={max_stories}"
    pack = next_pack_path(repo, repo / ARCH_ARCH_DIR, "architecture-pack")
    ver = {
        "boundary": "triad-rollover|architecture",
        "moved": moved,
        "retained_story_sections": len(work),
        "retained_lines": line_count(new_body),
        "pack_ref": str(pack.as_posix()),
    }
    if dry_run:
        return ver
    archived_body = "".join(archived)
    write_pack_header(
        pack,
        f"Architecture archive pack ({day_stamp()})",
        ARCH_REL.as_posix(),
        trigger,
        {
            "archived_body_lines": line_count(archived_body),
            "retained_body_lines": line_count(new_body),
            "preamble_lines": line_count(preamble),
        },
        first_h,
        last_h,
        moved,
        len(work),
    )
    with pack.open("a", encoding="utf-8") as fh:
        fh.write(archived_body)
        if not archived_body.endswith("\n"):
            fh.write("\n")
    path.write_text(new_body, encoding="utf-8", newline="\n")
    return ver


def check_surface(
    name: str,
    path: Path,
    lines: int,
    units: int,
    max_lines: int,
    max_units: int,
) -> Optional[str]:
    if lines <= max_lines and units <= max_units:
        return None
    return (
        f"STATE_ARCHIVE_REQUIRED surface={name} path={path.as_posix()} "
        f"lines={lines}/{max_lines} units={units}/{max_units} "
        f"reason=ARTIFACT_HOT_SURFACE_OVERSIZE"
    )


def run_check(repo: Path, policy: Dict[str, str]) -> List[str]:
    errors: List[str] = []
    s_path = repo / STATE_REL
    s_text = s_path.read_text(encoding="utf-8")
    pre, cps = split_state_checkpoints(s_text)
    s_lines = line_count(s_text)
    max_sl = _int_policy(policy, "STATE_HOT_MAX_LINES")
    max_sc = _int_policy(policy, "STATE_HOT_MAX_CHECKPOINTS")
    msg = check_surface("state", STATE_REL, s_lines, len(cps), max_sl, max_sc)
    if msg:
        errors.append(msg)
    if line_count(pre) > max_sl:
        errors.append(
            f"STATE_ARCHIVE_REQUIRED surface=state path={STATE_REL.as_posix()} "
            f"reason=ARTIFACT_HOT_SURFACE_OVERSIZE preamble exceeds line cap"
        )

    p_path = repo / PO_REL
    p_text = p_path.read_text(encoding="utf-8")
    secs = split_po_sections(p_text)
    p_lines = line_count(p_text)
    max_pl = _int_policy(policy, "PO_TO_TL_HOT_MAX_LINES")
    max_ps = _int_policy(policy, "PO_TO_TL_HOT_MAX_SECTIONS")
    msg = check_surface("po_to_tl", PO_REL, p_lines, len(secs), max_pl, max_ps)
    if msg:
        errors.append(msg)

    a_path = repo / ARCH_REL
    a_text = a_path.read_text(encoding="utf-8")
    _, stories = split_arch_stories(a_text)
    a_lines = line_count(a_text)
    max_al = _int_policy(policy, "ARCH_HOT_MAX_LINES")
    max_as = _int_policy(policy, "ARCH_HOT_MAX_STORY_SECTIONS")
    msg = check_surface("architecture", ARCH_REL, a_lines, len(stories), max_al, max_as)
    if msg:
        errors.append(msg)

    return errors


def run_rollover_all(repo: Path, policy: Dict[str, str], dry_run: bool) -> List[Dict[str, object]]:
    results: List[Dict[str, object]] = []
    for fn in (rollover_state, rollover_po_to_tl, rollover_architecture):
        out = fn(repo, policy, dry_run)
        if out:
            results.append(out)
    return results


def cmd_self_test() -> int:
    errors: List[str] = []

    def fail(m: str) -> None:
        errors.append(m)

    # --- state checkpoint split + rollover ---
    cp = "## Alpha checkpoint\nbody\n\n## Beta checkpoint\nmore\n"
    pre, blocks = split_state_checkpoints(cp)
    if pre.strip() or len(blocks) != 2:
        fail("state split expected two checkpoint blocks")

    # --- po sections ---
    po = "## A\nx\n\n## B\ny\n\n## C\nz\n\n"
    secs = split_po_sections(po)
    if [line_count(s) for s in secs] != [3, 3, 3]:
        fail("po section split line counts unexpected")

    # --- arch stories (H1 non-regression) ---
    arch = "# Preamble line\n\n# US-0001: One\nx\n# US-0002: Two\ny\n"
    apre, stories = split_arch_stories(arch)
    if "Preamble" not in apre or len(stories) != 2:
        fail("architecture H1 story split failed")

    # --- mixed H1+H2 same id: H1 wins ---
    mixed = "# US-0067: Alpha\nbody\n## US-0067: Legacy\nmore\n# US-0068: Next\nz\n"
    _, mixed_stories = split_arch_stories(mixed)
    if len(mixed_stories) != 2:
        fail("mixed H1+H2 same id should yield two blocks (H1-wins)")
    if not mixed_stories[0].startswith("# US-0067"):
        fail("mixed file first block should start at H1 US-0067")

    # --- inner ## subheading inside # US- block is not a boundary ---
    inner = "# US-0001: Story\n## Details\nnested\n# US-0002: Two\ny\n"
    _, inner_stories = split_arch_stories(inner)
    if len(inner_stories) != 2:
        fail("inner ## Details must not create extra story boundary")
    if "## Details" not in inner_stories[0]:
        fail("inner subheading should remain inside first story block")

    # --- BUG H1 parity ---
    bug_arch = "# BUG-0009: Defect\nbody\n# US-0010: Story\nmore\n"
    _, bug_stories = split_arch_stories(bug_arch)
    if len(bug_stories) != 2 or not bug_stories[0].startswith("# BUG-0009"):
        fail("BUG H1 story boundary not recognized")

    # --- heading policy enforcement delta ---
    baseline_text = "## US-0001: A\nx\n"
    increased = baseline_text + "## US-0099: New H2\ny\n"
    if check_arch_heading_policy(baseline_text, 1) is not None:
        fail("stable H2 count should not fail policy")
    if check_arch_heading_policy(increased, 1) != "ARCH_STORY_HEADING_LEVEL_INVALID":
        fail("H2 count increase must return ARCH_STORY_HEADING_LEVEL_INVALID")
    if check_arch_heading_policy(increased, 2) is not None:
        fail("count decrease/normalization should pass policy")

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / ".cursor").mkdir(parents=True, exist_ok=True)
        (root / STATE_REL).parent.mkdir(parents=True, exist_ok=True)
        (root / PO_REL).parent.mkdir(parents=True, exist_ok=True)
        (root / PO_REL).write_text("## Stub\n\n", encoding="utf-8")
        (root / ARCH_REL).write_text("# Architecture\n\n## Overview\nstub\n", encoding="utf-8")
        policy = dict(DEFAULTS)
        policy["STATE_HOT_MAX_LINES"] = "50"
        policy["STATE_HOT_MAX_CHECKPOINTS"] = "2"
        big_state = (
            "## Active context surface\npreamble\n\n"
            + "".join(f"## Checkpoint {i}\nbody {i}\n\n" for i in range(5))
        )
        (root / STATE_REL).write_text(big_state, encoding="utf-8")
        v1 = rollover_state(root, policy, dry_run=False)
        if not v1 or v1.get("moved", 0) < 1:
            fail("state rollover should move at least one checkpoint")
        v2 = rollover_state(root, policy, dry_run=False)
        if v2 is not None:
            fail("state rollover should be idempotent when within caps")
        err = run_check(root, policy)
        if err:
            fail(f"state fixture should pass after rollover: {err}")

        policy_po = dict(DEFAULTS)
        policy_po["PO_TO_TL_HOT_MAX_LINES"] = "10"
        policy_po["PO_TO_TL_HOT_MAX_SECTIONS"] = "2"
        po_big = "".join(f"## S{i}\nL{i}\n\n" for i in range(5))
        (root / PO_REL).write_text(po_big, encoding="utf-8")
        r1 = rollover_po_to_tl(root, policy_po, dry_run=False)
        if not r1:
            fail("po_to_tl rollover expected")
        r2 = rollover_po_to_tl(root, policy_po, dry_run=False)
        if r2 is not None:
            fail("po_to_tl idempotent")
        if run_check(root, policy_po):
            fail("po_to_tl check should pass")

        policy_arch = dict(DEFAULTS)
        policy_arch["ARCH_HOT_MAX_LINES"] = "12"
        policy_arch["ARCH_HOT_MAX_STORY_SECTIONS"] = "2"
        arch_big = "# Top\n\n" + "".join(f"# US-100{i}: X\nL\n\n" for i in range(5))
        (root / ARCH_REL).write_text(arch_big, encoding="utf-8")
        a1 = rollover_architecture(root, policy_arch, dry_run=False)
        if not a1:
            fail("architecture H1 rollover expected")
        a2 = rollover_architecture(root, policy_arch, dry_run=False)
        if a2 is not None:
            fail("architecture H1 idempotent")
        merged_arch = dict(DEFAULTS)
        merged_arch.update(policy_arch)
        if run_check(root, merged_arch):
            fail("architecture H1 check should pass")

        # --- ##-only rollover (legacy H2 sections) ---
        policy_h2 = dict(DEFAULTS)
        policy_h2["ARCH_HOT_MAX_LINES"] = "12"
        policy_h2["ARCH_HOT_MAX_STORY_SECTIONS"] = "2"
        h2_big = "# Top\n\n" + "".join(
            f"## US-100{i}: Legacy\nL{i}\n\n" for i in range(4)
        )
        (root / ARCH_REL).write_text(h2_big, encoding="utf-8")
        h2_1 = rollover_architecture(root, policy_h2, dry_run=False)
        if not h2_1 or h2_1.get("moved", 0) < 1:
            fail("##-only architecture rollover should move at least one block")
        h2_2 = rollover_architecture(root, policy_h2, dry_run=False)
        if h2_2 is not None:
            fail("##-only architecture rollover should be idempotent")
        merged_h2 = dict(DEFAULTS)
        merged_h2.update(policy_h2)
        if run_check(root, merged_h2):
            fail("##-only architecture check should pass after rollover")

    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        return 1
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Triad hot-surface enforcement (DEC-0054).")
    p.add_argument("--repo", help="repository root (default: parent of scripts/)")
    mx = p.add_mutually_exclusive_group(required=True)
    mx.add_argument("--check", action="store_true", help="verify caps, no writes")
    mx.add_argument("--rollover", action="store_true", help="archive oldest units when over cap")
    mx.add_argument("--self-test", action="store_true", help="internal regression fixtures")
    mx.add_argument(
        "--check-arch-heading-policy",
        action="store_true",
        help="fail when H2 story-heading count increased vs baseline",
    )
    p.add_argument(
        "--baseline-h2-count",
        type=int,
        help="baseline H2 story-heading count (required with --check-arch-heading-policy)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="emit verification tuples as JSON lines (stderr for human mode)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="with --rollover, compute moves without writing",
    )
    args = p.parse_args(argv)

    if args.self_test:
        return cmd_self_test()

    repo = _repo_root(args.repo)
    try:
        policy = load_merged_policy(repo)
    except OSError as exc:
        print(
            f"STATE_ARCHIVE_WRITE_FAILED could_not_read_scratchpad detail={exc}",
            file=sys.stderr,
        )
        return 2

    if args.check:
        try:
            errs = run_check(repo, policy)
        except PolicyError as exc:
            print(f"{exc.code} {exc.message}", file=sys.stderr)
            return 2
        if errs:
            for e in errs:
                print(e, file=sys.stderr)
            return 1
        return 0

    if args.check_arch_heading_policy:
        if args.baseline_h2_count is None:
            print(
                "STATE_ARCHIVE_VERIFICATION_FAILED "
                "missing --baseline-h2-count for --check-arch-heading-policy",
                file=sys.stderr,
            )
            return 2
        try:
            arch_text = (repo / ARCH_REL).read_text(encoding="utf-8")
        except OSError as exc:
            print(
                f"STATE_ARCHIVE_WRITE_FAILED could_not_read_architecture detail={exc}",
                file=sys.stderr,
            )
            return 2
        code = check_arch_heading_policy(arch_text, args.baseline_h2_count)
        if code:
            print(
                f"{code} h2_story_heading_count_increased "
                f"baseline={args.baseline_h2_count} "
                f"after={count_h2_story_headings(arch_text)}",
                file=sys.stderr,
            )
            return 1
        return 0

    if args.rollover:
        try:
            outs = run_rollover_all(repo, policy, dry_run=args.dry_run)
        except PolicyError as exc:
            print(f"{exc.code} {exc.message}", file=sys.stderr)
            return 2
        if args.json:
            for row in outs:
                print(json.dumps(row, sort_keys=True, separators=(",", ":")))
        elif outs:
            print(
                "rollover_complete units=" + ",".join(str(x.get("moved", 0)) for x in outs),
                file=sys.stderr,
            )
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
