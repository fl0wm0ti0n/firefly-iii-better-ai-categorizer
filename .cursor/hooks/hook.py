import json
import os
import re
import sys
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCHPAD = os.path.join(ROOT, ".cursor", "scratchpad.md")
SCRATCHPAD_LOCAL = os.path.join(ROOT, ".cursor", "scratchpad.local.md")
STATE_FILE = os.path.join(ROOT, ".cursor", "hooks", "hook-state.json")
BENCH_LOG = os.path.join(ROOT, ".cursor", "hooks", "bench-log.jsonl")


def read_kv_file(path):
    flags = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    flags[key.strip()] = val.strip()
    except OSError:
        pass
    return flags


def read_scratchpad():
    flags = read_kv_file(SCRATCHPAD)
    # Local overrides are optional and intentionally gitignored.
    local = read_kv_file(SCRATCHPAD_LOCAL)
    flags.update(local)
    return flags


def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {
            "code_changed": False,
            "context_refreshed": False,
            "last_edit": None,
        }


def save_state(state):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except OSError:
        pass


def bench_session(flags):
    session = flags.get("MAGIC_BENCH_SESSION", "").strip()
    return session if session else None


def log_bench_event(session, event, payload):
    if not session:
        return
    try:
        entry = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "session": session,
            "event": event,
        }
        if event == "beforeShellExecution":
            cmd = payload.get("command", "")
            entry["command"] = cmd[:200]
        elif event == "beforeReadFile":
            entry["path"] = payload.get("path", "")
        elif event == "afterFileEdit":
            entry["path"] = payload.get("path", "")
        elif event == "stop":
            entry["state"] = payload.get("state", "")
        with open(BENCH_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass


def read_event_payload():
    try:
        data = sys.stdin.read()
        if not data.strip():
            return {}
        return json.loads(data)
    except Exception:
        return {}


def is_dangerous_command(cmd):
    patterns = [
        r"\brm\s+-rf\s+/",
        r"\bdel\s+/f\s+/s\b",
        r"\bformat\b",
        r"\bmkfs\b",
        r"\bdiskpart\b",
        r"\bshutdown\b",
        r"\breboot\b",
        r"\bcurl\b.+\|\s*(sh|bash|pwsh|powershell)",
    ]
    return any(re.search(p, cmd, re.IGNORECASE) for p in patterns)


def is_secret_like(path):
    secrets = [
        ".env",
        "id_rsa",
        "id_dsa",
        ".pem",
        ".key",
        ".p12",
        "credentials.json",
    ]
    lower = path.lower()
    return any(s in lower for s in secrets)


def is_code_path(path):
    normalized = path.replace("\\", "/").lower()
    if "/docs/" in normalized:
        return False
    if "/handoffs/" in normalized:
        return False
    if "/decisions/" in normalized:
        return False
    if "/sprints/" in normalized:
        return False
    if "/.cursor/" in normalized:
        return False
    if "/.github/" in normalized:
        return False
    if normalized.endswith("readme.md"):
        return False
    return True


def is_context_refresh(path):
    normalized = path.replace("\\", "/").lower()
    return normalized.endswith("/docs/engineering/state.md") or normalized.endswith(
        "/sprints/s0001/summary.md"
    )


def main():
    if len(sys.argv) < 2:
        sys.exit(0)

    event = sys.argv[1]
    flags = read_scratchpad()
    payload = read_event_payload()
    state = load_state()
    session = bench_session(flags)

    if event == "beforeShellExecution":
        log_bench_event(session, event, payload)
        cmd = payload.get("command", "")
        if cmd and is_dangerous_command(cmd):
            print("Blocked: dangerous command pattern detected.")
            sys.exit(1)
        sys.exit(0)

    if event == "beforeReadFile":
        log_bench_event(session, event, payload)
        path = payload.get("path", "")
        if path and is_secret_like(path):
            print("Blocked: secret-like file detected. Confirm before reading.")
            sys.exit(1)
        sys.exit(0)

    if event == "afterFileEdit":
        log_bench_event(session, event, payload)
        path = payload.get("path", "")
        if path:
            if is_code_path(path):
                state["code_changed"] = True
            if is_context_refresh(path):
                state["context_refreshed"] = True
            state["last_edit"] = datetime.utcnow().isoformat() + "Z"
            save_state(state)
        sys.exit(0)

    if event == "stop":
        log_bench_event(session, event, payload)
        strict = flags.get("MAGIC_CONTEXT_STRICT", "0") == "1"
        done = flags.get("DONE", "0") == "1"
        if strict and state.get("code_changed") and not state.get("context_refreshed"):
            if not done:
                print(
                    "Context refresh recommended: update state or summary after code edits."
                )
                sys.exit(1)
        sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()

