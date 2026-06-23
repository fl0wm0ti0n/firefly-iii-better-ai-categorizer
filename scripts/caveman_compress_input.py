#!/usr/bin/env python3
"""US-0090 / DEC-0073 — Caveman-style input-side file compression (safe-mode v1).

Opt-in, default-off, script-invoked operator tool. Reads scratchpad gating
(`CAVEMAN_COMPRESS_INPUT=1` + non-empty `CAVEMAN_FILE_SCOPE`), refuses deny-
listed paths, applies a strictly-idempotent line-level minifier, and writes
sidecar originals under `docs/.caveman-originals/<relative/path>/<file>`
BEFORE target mutation. Stdlib only.

Reason-code vocabulary (DEC-0073 §7) — 9 codes in 3 families:

  Gating     CAVEMAN_COMPRESS_MODE_DISABLED
             CAVEMAN_COMPRESS_FLAG_CONFLICT
  Scope      CAVEMAN_COMPRESS_SCOPE_EMPTY
             CAVEMAN_COMPRESS_SCOPE_UNKNOWN_PROFILE
             CAVEMAN_COMPRESS_SCOPE_VIOLATION
  Integrity  CAVEMAN_COMPRESS_DENY_HIT
             CAVEMAN_COMPRESS_NOT_IDEMPOTENT
             CAVEMAN_COMPRESS_LITERAL_REGION_DAMAGED
             CAVEMAN_COMPRESS_ORIGINAL_MISSING

No post-write codes. Any addition requires a subsequent DEC revising §7.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import sys
from pathlib import Path, PurePosixPath

# ---------------------------------------------------------------------------
# Deny-list baseline (DEC-0073 §4.1). Any edit here requires a subsequent DEC.
# `deny_list_version` in --report is the SHA-256 of sorted(DENY_BASELINE) as
# canonical JSON; T-005 subtest asserts the hash is stable (drift detection).
# ---------------------------------------------------------------------------

DENY_BASELINE: tuple[str, ...] = (
    # Secrets
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    # Intake evidence
    "handoffs/intake_evidence/*.json",
    "handoffs/intake_evidence/**/*.json",
    # Canonical product authority
    "docs/product/backlog.md",
    "docs/product/acceptance.md",
    # Canonical engineering authority
    "docs/engineering/state.md",
    "docs/engineering/decisions.md",
    "decisions/DEC-*.md",
    # Sprint lifecycle evidence
    "sprints/*/plan-verify.json",
    "sprints/*/uat.json",
    "sprints/*/summary.md",
    "sprints/*/release-findings.md",
    "sprints/*/qa-findings.md",
    "sprints/*/tasks.md",
    "sprints/*/sprint.md",
    # Publish / runtime / install surfaces
    "package.json",
    "package-lock.json",
    "installer.sh",
    "installer.ps1",
    "installer.py",
    "installer.js",
    "installer.cmd",
    "installer.bat",
    ".github/workflows/*.yml",
    ".cursor/hooks/*.py",
    "bin/its-magic.js",
    "packaging/homebrew/*.rb",
    # Contract surfaces
    ".cursor/rules/*.mdc",
    ".cursor/commands/*.md",
    ".cursor/skills/**/SKILL.md",
    # Manifest / parity sources
    "docs/engineering/context/installer-owned-paths.manifest",
    "docs/engineering/release-targets.json",
    "docs/engineering/token-cost-parity-manifest.md",
    # Binaries (extension class)
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.gif",
    "**/*.webp",
    "**/*.pdf",
    "**/*.zip",
    "**/*.tar",
    "**/*.tar.gz",
    "**/*.tgz",
    "**/*.ico",
    "**/*.woff",
    "**/*.woff2",
    "**/*.ttf",
    "**/*.eot",
    "**/*.otf",
    "**/*.mp3",
    "**/*.mp4",
    "**/*.mov",
    "**/*.wav",
    "**/*.bin",
    "**/*.exe",
    "**/*.dll",
)

# Patterns from .gitignore that contribute as additional denies (§4 step 2).
GITIGNORE_SECRET_PREFIXES: tuple[str, ...] = (
    ".env",
    "*secret*",
    "*credential*",
    "*token*",
    "*private*",
)

# Frozen v1 allow-list profile table (DEC-0073 §5.1).
FROZEN_PROFILES: dict[str, tuple[str, ...]] = {
    "docs-prose-only": (
        "docs/user-guides/**/*.md",
        "docs/engineering/runbook.md",
        "docs/engineering/state-archive/**/*.md",
        "handoffs/archive/*.md",
    ),
}

SIDECAR_ROOT_REL = "docs/.caveman-originals"

REASON_CODES_BY_FAMILY: dict[str, tuple[str, ...]] = {
    "Gating": (
        "CAVEMAN_COMPRESS_MODE_DISABLED",
        "CAVEMAN_COMPRESS_FLAG_CONFLICT",
    ),
    "Scope": (
        "CAVEMAN_COMPRESS_SCOPE_EMPTY",
        "CAVEMAN_COMPRESS_SCOPE_UNKNOWN_PROFILE",
        "CAVEMAN_COMPRESS_SCOPE_VIOLATION",
    ),
    "Integrity": (
        "CAVEMAN_COMPRESS_DENY_HIT",
        "CAVEMAN_COMPRESS_NOT_IDEMPOTENT",
        "CAVEMAN_COMPRESS_LITERAL_REGION_DAMAGED",
        "CAVEMAN_COMPRESS_ORIGINAL_MISSING",
    ),
}

ALL_REASON_CODES: tuple[str, ...] = tuple(
    code for codes in REASON_CODES_BY_FAMILY.values() for code in codes
)

VENDOR_INSTALL_LEAK_TOKEN = "npx skills add"

FENCE_RE = re.compile(r"^(`{3,}|~{3,})")


# ---------------------------------------------------------------------------
# Utility: canonical JSON + hashing.
# ---------------------------------------------------------------------------

def canonical_json(payload: object) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def deny_list_version_hash(deny_entries: tuple[str, ...] = DENY_BASELINE) -> str:
    canonical = canonical_json(sorted(deny_entries))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Glob evaluation. Paths use forward slashes (POSIX) regardless of host OS
# per DEC-0073 §5 (grammar requires '/').
# ---------------------------------------------------------------------------

def _normalize_rel(rel: str) -> str:
    return str(PurePosixPath(rel.replace("\\", "/")))


def glob_match(pattern: str, rel_path: str) -> bool:
    rel_path = _normalize_rel(rel_path)
    pattern = pattern.replace("\\", "/")
    if "**" in pattern:
        # Translate ** to match any number of path segments (including zero).
        parts = pattern.split("**")
        regex_parts: list[str] = []
        for i, part in enumerate(parts):
            regex_parts.append(fnmatch.translate(part).rstrip(r"\Z"))
            if i < len(parts) - 1:
                regex_parts.append(r".*")
        rx = re.compile("".join(regex_parts) + r"\Z")
        return rx.match(rel_path) is not None
    return fnmatch.fnmatchcase(rel_path, pattern)


def any_glob_match(patterns: tuple[str, ...] | list[str], rel_path: str) -> bool:
    for p in patterns:
        if glob_match(p, rel_path):
            return True
    return False


# ---------------------------------------------------------------------------
# Scratchpad reader (stdlib). Parses simple KEY=VALUE lines; ignores comments.
# ---------------------------------------------------------------------------

def read_scratchpad(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    text = path.read_text(encoding="utf-8")
    key_re = re.compile(r"^\s*([A-Z][A-Z0-9_]+)\s*=\s*(.*?)\s*$")
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("<!--"):
            continue
        m = key_re.match(line)
        if m:
            values[m.group(1)] = m.group(2)
    return values


# ---------------------------------------------------------------------------
# Scope grammar (DEC-0073 §5).
# ---------------------------------------------------------------------------

class ScopeParseError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


def parse_scope(raw: str) -> tuple[list[str], str | None]:
    """Return (glob_patterns, profile_name_or_None).

    Raises ScopeParseError on CAVEMAN_COMPRESS_SCOPE_EMPTY or
    CAVEMAN_COMPRESS_SCOPE_UNKNOWN_PROFILE.
    """
    if raw is None:
        raise ScopeParseError("CAVEMAN_COMPRESS_SCOPE_EMPTY", "scope unset")
    trimmed = raw.strip()
    if not trimmed or trimmed.startswith("#"):
        raise ScopeParseError("CAVEMAN_COMPRESS_SCOPE_EMPTY", "scope empty")

    profile_name: str | None = None
    globs: list[str] = []

    if ";" in trimmed or trimmed.startswith("profile:") or trimmed.startswith("globs:"):
        # Hybrid form: profile:<name>;globs:<csv> (order-independent).
        tokens = [t.strip() for t in trimmed.split(";") if t.strip()]
        profile_seen = False
        globs_seen = False
        for tok in tokens:
            if tok.startswith("profile:"):
                if profile_seen:
                    raise ScopeParseError(
                        "CAVEMAN_COMPRESS_SCOPE_UNKNOWN_PROFILE",
                        "second profile: token in scope (one profile per scope)",
                    )
                profile_seen = True
                profile_name = tok[len("profile:"):].strip()
            elif tok.startswith("globs:"):
                globs_seen = True
                for g in tok[len("globs:"):].split(","):
                    g = g.strip()
                    if g:
                        globs.append(g)
            else:
                # Bare token inside a hybrid string: treat as unknown grammar.
                raise ScopeParseError(
                    "CAVEMAN_COMPRESS_SCOPE_UNKNOWN_PROFILE",
                    f"unrecognized token in hybrid scope: {tok!r}",
                )
        if not profile_seen and not globs_seen:
            raise ScopeParseError(
                "CAVEMAN_COMPRESS_SCOPE_UNKNOWN_PROFILE",
                "hybrid scope has neither profile: nor globs:",
            )
    elif "," in trimmed or "/" in trimmed or "*" in trimmed or trimmed.endswith(".md"):
        # Raw CSV globs form.
        for g in trimmed.split(","):
            g = g.strip()
            if g:
                globs.append(g)
    else:
        # Named profile form.
        profile_name = trimmed

    if profile_name is not None:
        if profile_name not in FROZEN_PROFILES:
            raise ScopeParseError(
                "CAVEMAN_COMPRESS_SCOPE_UNKNOWN_PROFILE",
                f"unknown profile {profile_name!r}; v1 allows: "
                f"{sorted(FROZEN_PROFILES.keys())}",
            )
        globs = list(FROZEN_PROFILES[profile_name]) + globs

    if not globs:
        raise ScopeParseError(
            "CAVEMAN_COMPRESS_SCOPE_EMPTY", "resolved scope produced zero globs"
        )
    return globs, profile_name


# ---------------------------------------------------------------------------
# Deny-list resolution (DEC-0073 §4). Deny always wins.
# ---------------------------------------------------------------------------

def load_gitignore_secret_patterns(repo_root: Path) -> list[str]:
    gi = repo_root / ".gitignore"
    patterns: list[str] = []
    if not gi.is_file():
        return patterns
    for raw in gi.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("!"):
            continue
        for prefix in GITIGNORE_SECRET_PREFIXES:
            if fnmatch.fnmatchcase(line, prefix) or line.startswith(prefix.strip("*")):
                patterns.append(line)
                break
    return patterns


def load_cursorignore_overlay(repo_root: Path, enabled: bool) -> list[str]:
    if not enabled:
        return []
    ci = repo_root / ".cursorignore"
    if not ci.is_file():
        return []
    out: list[str] = []
    for raw in ci.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("!"):
            continue
        out.append(line)
    return out


def resolve_deny_patterns(repo_root: Path, ingest_cursorignore: bool) -> list[str]:
    patterns: list[str] = list(DENY_BASELINE)
    patterns.extend(load_gitignore_secret_patterns(repo_root))
    patterns.extend(load_cursorignore_overlay(repo_root, ingest_cursorignore))
    return patterns


def file_is_denied(rel_path: str, deny_patterns: list[str], repo_root: Path) -> bool:
    if any_glob_match(deny_patterns, rel_path):
        return True
    # Vendor-install leak: refuse any file that contains the banned token.
    target = repo_root / rel_path
    if target.is_file():
        try:
            head = target.read_bytes()[:65536]
        except OSError:
            return False
        if VENDOR_INSTALL_LEAK_TOKEN.encode("utf-8") in head:
            return True
    return False


# ---------------------------------------------------------------------------
# Safe-mode minifier (DEC-0073 §6). Strictly idempotent by construction.
# Inside fenced code blocks (zone 1 of DEC-0072 §4): NO mutation of line
# bodies; blank line runs inside fences are NOT collapsed (fence content is
# literal).
# ---------------------------------------------------------------------------

def compress_safe_mode(text: str) -> str:
    ends_with_newline = text.endswith("\n") or text.endswith("\r\n") or text.endswith("\r")
    # Normalize line endings first (step 3).
    unified = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = unified.split("\n")
    if unified.endswith("\n"):
        # split produced a trailing empty element for the final newline.
        has_eof_newline = True
        body_lines = lines[:-1]
    else:
        has_eof_newline = ends_with_newline
        body_lines = lines

    out: list[str] = []
    in_fence = False
    fence_marker: str | None = None
    prev_blank_outside_fence = False
    for raw in body_lines:
        if in_fence:
            out.append(raw)
            stripped = raw.lstrip()
            if fence_marker is not None and stripped.startswith(fence_marker[0] * 3):
                mfence = FENCE_RE.match(stripped)
                if mfence and len(mfence.group(1)) >= len(fence_marker):
                    in_fence = False
                    fence_marker = None
            prev_blank_outside_fence = False
            continue

        mfence = FENCE_RE.match(raw.lstrip())
        if mfence:
            in_fence = True
            fence_marker = mfence.group(1)
            out.append(raw)
            prev_blank_outside_fence = False
            continue

        trimmed = raw.rstrip()
        if trimmed == "":
            if prev_blank_outside_fence:
                continue
            out.append("")
            prev_blank_outside_fence = True
        else:
            out.append(trimmed)
            prev_blank_outside_fence = False

    joined = "\n".join(out)
    if has_eof_newline:
        joined += "\n"
    return joined


# ---------------------------------------------------------------------------
# Literal-region scan (DEC-0072 §4 reused verbatim — 9 zones).
# Safe-mode only mutates blank-line counts and trailing whitespace on non-
# fenced lines. We verify:
#   (a) fenced code block content is byte-identical between input and output
#       (zone 1);
#   (b) non-blank, non-fence lines of input rstripped equal non-blank, non-
#       fence lines of output rstripped in order (zones 2–9: paths, IDs,
#       reason codes, checklists, contract markers, strict-proof tuple
#       fields, isolation-evidence fields, git refs are line-scoped tokens
#       that are preserved by rstrip + blank-run collapse).
# ---------------------------------------------------------------------------

def _extract_line_maps(text: str) -> tuple[list[tuple[int, int, str]], list[str]]:
    """Return (fence_segments, non_fence_content_lines).

    fence_segments: list of (start_line, end_line, body_bytes_joined_with_LF)
    non_fence_content_lines: rstripped non-blank content lines, in order.
    """
    unified = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = unified.split("\n")
    if unified.endswith("\n") and lines and lines[-1] == "":
        lines = lines[:-1]
    fences: list[tuple[int, int, str]] = []
    content: list[str] = []
    in_fence = False
    fence_start = -1
    fence_marker: str | None = None
    fence_body: list[str] = []
    for idx, raw in enumerate(lines):
        mfence = FENCE_RE.match(raw.lstrip())
        if in_fence:
            fence_body.append(raw)
            if (
                mfence is not None
                and fence_marker is not None
                and len(mfence.group(1)) >= len(fence_marker)
            ):
                fences.append((fence_start, idx, "\n".join(fence_body)))
                in_fence = False
                fence_marker = None
                fence_body = []
        else:
            if mfence is not None:
                in_fence = True
                fence_start = idx
                fence_marker = mfence.group(1)
                fence_body = [raw]
                continue
            stripped = raw.rstrip()
            if stripped:
                content.append(stripped)
    if in_fence:
        # Unterminated fence: treat body as fence for literal preservation.
        fences.append((fence_start, len(lines) - 1, "\n".join(fence_body)))
    return fences, content


def literal_region_preserved(original: str, proposed: str) -> tuple[bool, str]:
    orig_fences, orig_content = _extract_line_maps(original)
    new_fences, new_content = _extract_line_maps(proposed)
    if [f[2] for f in orig_fences] != [f[2] for f in new_fences]:
        return False, "fenced-code zone mutated"
    if orig_content != new_content:
        return False, "non-blank content-line tokens differ"
    return True, ""


# ---------------------------------------------------------------------------
# File discovery.
# ---------------------------------------------------------------------------

def enumerate_scope(
    repo_root: Path, allow_globs: list[str], deny_patterns: list[str]
) -> tuple[list[str], list[str]]:
    """Return (allowed_rel_paths, denied_rel_paths_under_allow)."""
    matched: set[str] = set()
    denied_under_allow: list[str] = []
    for pat in allow_globs:
        # Use python's recursive glob for `**`.
        # repo_root.glob interprets `**` when included in the pattern via `**/`.
        for p in repo_root.glob(pat):
            if p.is_file():
                rel = str(p.relative_to(repo_root)).replace("\\", "/")
                matched.add(rel)
    allowed: list[str] = []
    for rel in sorted(matched):
        if file_is_denied(rel, deny_patterns, repo_root):
            denied_under_allow.append(rel)
        else:
            allowed.append(rel)
    return allowed, denied_under_allow


# ---------------------------------------------------------------------------
# Atomic write helpers.
# ---------------------------------------------------------------------------

def atomic_write(target: Path, data: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".caveman.tmp")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, target)
    except Exception:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
        raise


def sidecar_for(repo_root: Path, rel_path: str) -> Path:
    return repo_root / SIDECAR_ROOT_REL / rel_path


# ---------------------------------------------------------------------------
# Fail-closed helpers.
# ---------------------------------------------------------------------------

def fail_closed(code: str, detail: str = "") -> int:
    msg = f"REASON_CODE={code}"
    if detail:
        msg += f" detail={detail}"
    print(msg, file=sys.stderr)
    return 2


# ---------------------------------------------------------------------------
# Report builder.
# ---------------------------------------------------------------------------

def build_report(
    *,
    deny_version: str,
    scope_resolved: list[str],
    files_considered: list[str],
    files_eligible: list[str],
    files_would_write: list[str],
    violations: list[dict[str, str]],
    idempotency_check: dict[str, object],
) -> dict[str, object]:
    return {
        "deny_list_version": deny_version,
        "scope_resolved": scope_resolved,
        "files_considered": files_considered,
        "files_eligible": files_eligible,
        "files_would_write": files_would_write,
        "violations": violations,
        "idempotency_check": idempotency_check,
        "reason_codes_vocabulary": {
            family: list(codes) for family, codes in REASON_CODES_BY_FAMILY.items()
        },
    }


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="caveman_compress_input.py",
        description=(
            "US-0090 / DEC-0073 safe-mode input-side compressor. "
            "Default off. Opt-in via scratchpad. Deny always wins over allow. "
            "Sidecar originals under docs/.caveman-originals/."
        ),
        add_help=True,
        allow_abbrev=False,
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="(default) inventory + diff summary to stdout; no mutation.",
    )
    p.add_argument(
        "--write", action="store_true",
        help="Perform sidecar + target mutation on eligible files.",
    )
    p.add_argument(
        "--verify-originals", action="store_true",
        help="Walk sidecar tree and verify every sidecar has a target (and vice versa).",
    )
    p.add_argument(
        "--report", action="store_true",
        help="Emit JSON report on stdout (incompatible with --write).",
    )
    p.add_argument(
        "--repo", type=Path, default=Path(__file__).resolve().parent.parent,
        help="Repository root (default: parent of scripts/).",
    )
    return p


def parse_args(argv: list[str]) -> tuple[argparse.Namespace, list[str]]:
    parser = build_parser()
    args, unknown = parser.parse_known_args(argv)
    return args, unknown


def detect_flag_conflict(
    args: argparse.Namespace, unknown: list[str]
) -> str | None:
    if unknown:
        return f"unknown flag(s): {unknown}"
    if args.dry_run and args.write:
        return "--dry-run with --write"
    if args.write and args.verify_originals:
        return "--write with --verify-originals"
    if args.write and args.report:
        return "--write with --report"
    return None


def verify_originals(repo_root: Path, deny_patterns: list[str]) -> tuple[bool, list[dict[str, str]]]:
    sidecar_root = repo_root / SIDECAR_ROOT_REL
    violations: list[dict[str, str]] = []
    if not sidecar_root.is_dir():
        return True, violations
    for sidecar in sidecar_root.rglob("*"):
        if not sidecar.is_file():
            continue
        rel_from_root = sidecar.relative_to(sidecar_root)
        if rel_from_root.name == ".gitkeep":
            continue
        rel = str(rel_from_root).replace("\\", "/")
        target = repo_root / rel
        if not target.is_file():
            violations.append({
                "code": "CAVEMAN_COMPRESS_ORIGINAL_MISSING",
                "path": rel,
                "stage": "verify-originals",
                "detail": "sidecar has no target",
            })
    return len(violations) == 0, violations


def run(argv: list[str]) -> int:
    args, unknown = parse_args(argv)

    conflict = detect_flag_conflict(args, unknown)
    if conflict:
        return fail_closed("CAVEMAN_COMPRESS_FLAG_CONFLICT", conflict)

    repo_root: Path = args.repo

    # Read scratchpad (for gating + CAVEMAN_COMPRESS_INGEST_CURSORIGNORE overlay flag).
    scratchpad_path = repo_root / ".cursor" / "scratchpad.md"
    scratchpad = read_scratchpad(scratchpad_path)
    mode = scratchpad.get("CAVEMAN_COMPRESS_INPUT", "0").strip()
    scope_raw = scratchpad.get("CAVEMAN_FILE_SCOPE", "").strip()
    ingest_overlay = scratchpad.get("CAVEMAN_COMPRESS_INGEST_CURSORIGNORE", "0").strip()
    ingest_overlay_bool = ingest_overlay == "1"

    deny_patterns = resolve_deny_patterns(repo_root, ingest_overlay_bool)
    deny_version = deny_list_version_hash(DENY_BASELINE)

    # Resolve scope regardless of mode so --report and --dry-run can narrate.
    parse_err: ScopeParseError | None = None
    allow_globs: list[str] = []
    profile_name: str | None = None
    if scope_raw:
        try:
            allow_globs, profile_name = parse_scope(scope_raw)
        except ScopeParseError as e:
            parse_err = e

    # --verify-originals path.
    if args.verify_originals:
        ok, viols = verify_originals(repo_root, deny_patterns)
        if args.report:
            report = build_report(
                deny_version=deny_version,
                scope_resolved=allow_globs,
                files_considered=[],
                files_eligible=[],
                files_would_write=[],
                violations=viols,
                idempotency_check={"status": "skipped (verify-originals mode)"},
            )
            print(canonical_json(report))
        if not ok:
            return fail_closed("CAVEMAN_COMPRESS_ORIGINAL_MISSING",
                               f"{len(viols)} orphan(s)")
        return 0

    # Gating (applies to --dry-run + --write; --report alone may still narrate).
    mutation_mode = args.write

    if mutation_mode:
        if mode != "1":
            return fail_closed("CAVEMAN_COMPRESS_MODE_DISABLED",
                               "CAVEMAN_COMPRESS_INPUT != 1")
        if parse_err is not None:
            return fail_closed(parse_err.code, parse_err.detail)
        if not scope_raw:
            return fail_closed("CAVEMAN_COMPRESS_SCOPE_EMPTY",
                               "CAVEMAN_FILE_SCOPE empty")

    # Non-write paths: gracefully report but do not touch files.
    if parse_err is not None and (args.report or args.dry_run or not (
        args.write or args.verify_originals
    )):
        # For pure report / pure dry-run, surface the scope issue but keep
        # exit 0 so operators can inspect via --report.
        if args.report:
            report = build_report(
                deny_version=deny_version,
                scope_resolved=[],
                files_considered=[],
                files_eligible=[],
                files_would_write=[],
                violations=[{
                    "code": parse_err.code,
                    "path": "(scope)",
                    "stage": "pre-write",
                    "detail": parse_err.detail,
                }],
                idempotency_check={"status": "skipped (scope unresolved)"},
            )
            print(canonical_json(report))
            return 0
        return fail_closed(parse_err.code, parse_err.detail)

    # Enumerate allowed and deny-intersection.
    files_eligible: list[str] = []
    files_considered: list[str] = []
    files_would_write: list[str] = []
    violations: list[dict[str, str]] = []

    if allow_globs:
        allowed, denied_under_allow = enumerate_scope(
            repo_root, allow_globs, deny_patterns
        )
        files_considered = allowed + denied_under_allow
        for rel in denied_under_allow:
            violations.append({
                "code": "CAVEMAN_COMPRESS_DENY_HIT",
                "path": rel,
                "stage": "pre-write",
                "detail": "file matched allow-list but intersects deny baseline",
            })
        files_eligible = allowed

    # Safe-mode idempotency self-check on a canonical fixture string — stable
    # identity check for --report (AC-6 by construction).
    fixture = "a\n\n\n\nb\n   trailing   \n"
    once = compress_safe_mode(fixture)
    twice = compress_safe_mode(once)
    idempotency_ok = once == twice
    idempotency_status: dict[str, object] = {
        "status": "ok" if idempotency_ok else "drift",
        "algorithm": "safe-mode-line-collapse-trim-lf",
        "fixture_byte_stable": idempotency_ok,
    }
    if not idempotency_ok:
        violations.append({
            "code": "CAVEMAN_COMPRESS_NOT_IDEMPOTENT",
            "path": "(self-check)",
            "stage": "during-write",
            "detail": "compress(compress(fixture)) != compress(fixture)",
        })

    # --write path: actual mutation under atomic sidecar-first order.
    if mutation_mode:
        for rel in files_eligible:
            target = repo_root / rel
            try:
                original_bytes = target.read_bytes()
            except OSError as exc:
                violations.append({
                    "code": "CAVEMAN_COMPRESS_DENY_HIT",
                    "path": rel,
                    "stage": "pre-write",
                    "detail": f"unreadable: {exc}",
                })
                continue
            try:
                original_text = original_bytes.decode("utf-8")
            except UnicodeDecodeError:
                violations.append({
                    "code": "CAVEMAN_COMPRESS_DENY_HIT",
                    "path": rel,
                    "stage": "pre-write",
                    "detail": "non-utf8 bytes (binary refuse)",
                })
                continue
            proposed = compress_safe_mode(original_text)

            ok, why = literal_region_preserved(original_text, proposed)
            if not ok:
                violations.append({
                    "code": "CAVEMAN_COMPRESS_LITERAL_REGION_DAMAGED",
                    "path": rel,
                    "stage": "during-write",
                    "detail": why,
                })
                continue

            # Idempotency re-check on real file.
            if compress_safe_mode(proposed) != proposed:
                violations.append({
                    "code": "CAVEMAN_COMPRESS_NOT_IDEMPOTENT",
                    "path": rel,
                    "stage": "during-write",
                    "detail": "second compression differs",
                })
                continue

            if proposed == original_text:
                files_would_write.append(rel)
                continue  # no mutation required; skip sidecar churn

            # Sidecar first, then target (atomic temp+replace on both).
            sidecar = sidecar_for(repo_root, rel)
            try:
                atomic_write(sidecar, original_bytes)
                atomic_write(target, proposed.encode("utf-8"))
            except OSError as exc:
                violations.append({
                    "code": "CAVEMAN_COMPRESS_DENY_HIT",
                    "path": rel,
                    "stage": "pre-write",
                    "detail": f"atomic write failed: {exc}",
                })
                continue
            files_would_write.append(rel)
    else:
        # Dry-run: compute what would write, do not mutate.
        for rel in files_eligible:
            target = repo_root / rel
            try:
                original_text = target.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            proposed = compress_safe_mode(original_text)
            if proposed != original_text:
                files_would_write.append(rel)

    report = build_report(
        deny_version=deny_version,
        scope_resolved=allow_globs,
        files_considered=files_considered,
        files_eligible=files_eligible,
        files_would_write=files_would_write,
        violations=violations,
        idempotency_check=idempotency_status,
    )
    if args.report:
        print(canonical_json(report))

    if violations:
        first = violations[0]
        return fail_closed(first["code"], first.get("detail", ""))

    if not args.report:
        # Default human-readable dry-run narration (one line per file).
        if files_would_write:
            print(f"caveman-compress dry-run: {len(files_would_write)} file(s) "
                  f"would be rewritten")
            for rel in files_would_write:
                print(f"  - {rel}")
        else:
            print("caveman-compress dry-run: no changes")
        print(f"deny_list_version={deny_version}")
        if profile_name:
            print(f"profile={profile_name}")

    return 0


def main() -> int:
    return run(sys.argv[1:])


if __name__ == "__main__":
    sys.exit(main())
