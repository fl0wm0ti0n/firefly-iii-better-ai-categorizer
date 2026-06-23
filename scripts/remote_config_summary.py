#!/usr/bin/env python3
"""
Summarize .cursor/remote.json for operators (US-0084 / US-0064 alignment).

Stdout: non-secret labels and env-reference names only (no key material).
Stderr: errors and skip reasons.

Exit codes:
  0 OK or REMOTE_EXECUTION=0 skip (DEC-0070)
  1 usage / CLI error
  2 config missing or unreadable
  3 invalid JSON
  4 schema / contract mismatch vs runbook remote.json contract
  5 reserved (unused; DEC-0070 maps REMOTE_EXECUTION=0 to 0)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ENV_VAR_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")
ALLOWED_TYPES = frozenset({"docker", "ssh", "vm"})
AUTH_MODES = frozenset({"none", "env"})


def _truthy_remote_execution(raw: str | None) -> bool:
    if raw is None:
        return False
    return raw.strip() in {"1", "true", "TRUE", "yes", "YES", "on", "ON"}


def _parse_args(argv: list[str]) -> tuple[argparse.Namespace, list[str]]:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], add_help=True)
    p.add_argument(
        "--config",
        default=None,
        help="Path to remote JSON (default: REMOTE_CONFIG env or .cursor/remote.json)",
    )
    return p.parse_known_args(argv)


def _config_path(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser()
    env = os.environ.get("REMOTE_CONFIG")
    if env:
        return Path(env).expanduser()
    return Path(".cursor/remote.json")


def _validate_env_ref(name: str, value: Any, prefix: str) -> str | None:
    if not isinstance(value, str):
        return f"{prefix}: {name} must be a string env-reference name"
    if not ENV_VAR_NAME.match(value):
        return f"{prefix}: {name} must look like an env var name (A-Z_0-9)"
    return None


def validate_and_summarize(path: Path, data: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Return (stdout_lines, error_messages)."""
    errs: list[str] = []
    out: list[str] = []
    out.append(f"remote_config={path.as_posix()}")

    if not isinstance(data.get("version"), int):
        errs.append("[REMOTE_CONFIG_ERROR] root.version: expected integer")
    if not isinstance(data.get("defaultTarget"), str) or not data["defaultTarget"]:
        errs.append("[REMOTE_CONFIG_ERROR] root.defaultTarget: expected non-empty string")
    targets = data.get("targets")
    if not isinstance(targets, list) or not targets:
        errs.append("[REMOTE_CONFIG_ERROR] root.targets: expected non-empty array")

    if errs:
        return out, errs

    by_id: dict[str, dict[str, Any]] = {}
    for i, t in enumerate(targets):
        prefix = f"targets[{i}]"
        if not isinstance(t, dict):
            errs.append(f"[REMOTE_CONFIG_ERROR] {prefix}: expected object")
            continue
        tid = t.get("id")
        if not isinstance(tid, str) or not tid:
            errs.append(f"[REMOTE_CONFIG_ERROR] {prefix}.id: expected non-empty string")
        ttype = t.get("type")
        if ttype not in ALLOWED_TYPES:
            errs.append(
                f"[REMOTE_CONFIG_ERROR] {prefix}.type: expected one of {sorted(ALLOWED_TYPES)}"
            )
        if not isinstance(t.get("enabled"), bool):
            errs.append(f"[REMOTE_CONFIG_ERROR] {prefix}.enabled: expected boolean")
        if not isinstance(t.get("host"), str) or not t["host"]:
            errs.append(f"[REMOTE_CONFIG_ERROR] {prefix}.host: expected non-empty string")
        port = t.get("port")
        if not isinstance(port, int) or not (1 <= port <= 65535):
            errs.append(f"[REMOTE_CONFIG_ERROR] {prefix}.port: expected integer 1..65535")
        if not isinstance(t.get("workspaceRoot"), str) or not t["workspaceRoot"]:
            errs.append(
                f"[REMOTE_CONFIG_ERROR] {prefix}.workspaceRoot: expected non-empty string"
            )
        auth = t.get("auth")
        if auth is not None:
            if not isinstance(auth, dict):
                errs.append(f"[REMOTE_CONFIG_ERROR] {prefix}.auth: expected object")
            else:
                mode = auth.get("mode")
                if mode not in AUTH_MODES:
                    errs.append(
                        f"[REMOTE_CONFIG_ERROR] {prefix}.auth.mode: expected one of {sorted(AUTH_MODES)}"
                    )
                elif mode == "env":
                    env_keys = (
                        "tokenEnv",
                        "passwordEnv",
                        "privateKeyPathEnv",
                        "usernameEnv",
                    )
                    any_ref = False
                    for k in env_keys:
                        if k not in auth:
                            continue
                        any_ref = True
                        err = _validate_env_ref(k, auth[k], f"{prefix}.auth")
                        if err:
                            errs.append(f"[REMOTE_CONFIG_ERROR] {err}")
                    if not any_ref:
                        errs.append(
                            f"[REMOTE_CONFIG_ERROR] {prefix}.auth: mode=env requires at least one *Env field"
                        )
        if isinstance(tid, str) and tid:
            by_id[tid] = t

    default = data["defaultTarget"]
    if default not in by_id:
        errs.append(
            f"[REMOTE_CONFIG_ERROR] defaultTarget={default!r} not found in targets[].id"
        )
    elif not by_id[default].get("enabled"):
        errs.append(
            f"[REMOTE_CONFIG_ERROR] defaultTarget={default!r} must reference an enabled target"
        )

    if errs:
        return out, errs

    out.append(f"defaultTarget={data['defaultTarget']}")
    for t in targets:
        assert isinstance(t, dict)
        tid = t["id"]
        parts = [
            f"id={tid}",
            f"type={t['type']}",
            f"enabled={t['enabled']!s}",
            f"host={t['host']}",
            f"port={t['port']}",
            f"workspaceRoot={t['workspaceRoot']}",
        ]
        auth = t.get("auth")
        if isinstance(auth, dict):
            parts.append(f"auth.mode={auth.get('mode')}")
            for k in (
                "tokenEnv",
                "passwordEnv",
                "privateKeyPathEnv",
                "usernameEnv",
            ):
                if k in auth and isinstance(auth[k], str):
                    parts.append(f"auth.{k}={auth[k]}")
        out.append("target:" + " ".join(parts))

    return out, []


def main(argv: list[str] | None = None) -> int:
    args, rest = _parse_args(argv or sys.argv[1:])
    if rest:
        print(
            f"[REMOTE_CONFIG_SUMMARY] unknown arguments: {' '.join(rest)}",
            file=sys.stderr,
        )
        return 1
    if not _truthy_remote_execution(os.environ.get("REMOTE_EXECUTION")):
        print(
            "[REMOTE_CONFIG_SUMMARY] REMOTE_EXECUTION!=1: skip validation/summary "
            "(zero overhead; DEC-0070 / US-0084).",
            file=sys.stderr,
        )
        return 0

    path = _config_path(args.config)
    if not path.is_file():
        print(
            f"[REMOTE_CONFIG_ERROR] {path}: file missing or unreadable. "
            "Fix: create config or set REMOTE_EXECUTION=0.",
            file=sys.stderr,
        )
        return 2
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as e:
        print(
            f"[REMOTE_CONFIG_ERROR] {path}: read failed ({e}). Fix: permissions/path.",
            file=sys.stderr,
        )
        return 2
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(
            f"[REMOTE_CONFIG_ERROR] {path}: invalid JSON ({e}). Fix: syntax.",
            file=sys.stderr,
        )
        return 3
    if not isinstance(data, dict):
        print(
            f"[REMOTE_CONFIG_ERROR] {path}: expected JSON object at root.",
            file=sys.stderr,
        )
        return 4

    lines, errs = validate_and_summarize(path, data)
    if errs:
        for line in errs:
            print(line, file=sys.stderr)
        print(
            f"[REMOTE_CONFIG_ERROR] {path}: contract check failed. "
            "Fix: align with docs/engineering/runbook.md remote contract (US-0084).",
            file=sys.stderr,
        )
        return 4
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
