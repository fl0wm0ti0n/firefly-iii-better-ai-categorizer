#!/usr/bin/env python3
"""Prepublish / CI guard: installer.sh LF + POSIX-safe startup tokens (US-0084 / AC-2).

BUG-0008: reject CR bytes in installer-owned-paths.manifest (CRLF breaks POSIX awk section match).
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INSTALLER_SH = ROOT / "installer.sh"
INSTALLER_MANIFESTS = (
    ROOT / "docs" / "engineering" / "context" / "installer-owned-paths.manifest",
    ROOT / "template" / "docs" / "engineering" / "context" / "installer-owned-paths.manifest",
)

FORBIDDEN_TOKENS = (
    "set -euo",
    "set -o pipefail",
    "set -eu -o pipefail",
    "set -o errexit",
    "set -o nounset",
)


def main() -> int:
    if not INSTALLER_SH.is_file():
        print("guard_installer_publish: installer.sh missing", file=sys.stderr)
        return 1
    data = INSTALLER_SH.read_bytes()
    if b"\r" in data:
        print(
            "guard_installer_publish: CR/LF (\\r) bytes found in installer.sh — "
            "use LF only; see docs/engineering/runbook.md (US-0084).",
            file=sys.stderr,
        )
        return 1
    for man in INSTALLER_MANIFESTS:
        if not man.is_file():
            continue
        mdata = man.read_bytes()
        if b"\r" in mdata:
            print(
                f"guard_installer_publish: CR/LF (\\r) bytes found in {man.relative_to(ROOT)} — "
                "use LF only (.gitattributes *.manifest; BUG-0008).",
                file=sys.stderr,
            )
            return 1
    text = data.decode("utf-8", errors="replace")
    for token in FORBIDDEN_TOKENS:
        if token in text:
            print(
                f"guard_installer_publish: forbidden startup token {token!r} in installer.sh",
                file=sys.stderr,
            )
            return 1
    dash = shutil.which("dash")
    if dash:
        r = subprocess.run(
            [dash, "-n", str(INSTALLER_SH)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if r.returncode != 0:
            print(
                "guard_installer_publish: dash -n installer.sh failed:\n"
                + (r.stderr or r.stdout or ""),
                file=sys.stderr,
            )
            return 1
    else:
        print(
            "guard_installer_publish: dash not on PATH; skipping dash -n "
            "(Python CRLF + token checks still enforced).",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
