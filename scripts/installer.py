"""Minimal scratchpad merge stub for brownfield fork (DEC-0007 / DEC-0055).

Exposes merge_scratchpad_layers only — no kit install logic.
"""

from __future__ import annotations

import os
from typing import Dict, Tuple


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


def merge_scratchpad_layers(repo_root: str) -> Tuple[Dict[str, str], Dict[str, str]]:
    """Merge scratchpad layers: example < baseline < local (DEC-0055).

    Returns (merged_dict, paths) where paths maps layer names to absolute paths.
    """
    root = os.path.abspath(repo_root)
    cursor = os.path.join(root, ".cursor")
    example_path = os.path.join(cursor, "scratchpad.local.example.md")
    baseline_path = os.path.join(cursor, "scratchpad.md")
    local_path = os.path.join(cursor, "scratchpad.local.md")

    merged: Dict[str, str] = {}
    if os.path.isfile(example_path):
        with open(example_path, encoding="utf-8") as f:
            _parse_scratchpad_text(f.read(), merged)
    if os.path.isfile(baseline_path):
        with open(baseline_path, encoding="utf-8") as f:
            _parse_scratchpad_text(f.read(), merged)
    if os.path.isfile(local_path):
        with open(local_path, encoding="utf-8") as f:
            _parse_scratchpad_text(f.read(), merged)

    paths = {
        "example": example_path,
        "baseline": baseline_path,
        "local": local_path,
    }
    return merged, paths
