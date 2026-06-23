#!/usr/bin/env python3
"""
UAT probe resolver (US-0092 / DEC-0078; US-0093 / DEC-0079).

Shared by /verify-work and /qa for self-verify acceptance steps.
Fail-closed — no silent PASS. Lib never invokes browser MCP (BUG-0006).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

UAT_PROBE_UNRESOLVED = "UAT_PROBE_UNRESOLVED"
UAT_STACK_PROFILE_UNKNOWN = "UAT_STACK_PROFILE_UNKNOWN"
UAT_PROBE_TIMEOUT = "UAT_PROBE_TIMEOUT"
UAT_PROBE_FAILED = "UAT_PROBE_FAILED"
UAT_PROBE_FORBIDDEN = "UAT_PROBE_FORBIDDEN"
UAT_PROBE_PASS = "UAT_PROBE_PASS"
UAT_BROWSER_UNAVAILABLE = "UAT_BROWSER_UNAVAILABLE"
UAT_BROWSER_PROBE_FAILED = "UAT_BROWSER_PROBE_FAILED"
UAT_BROWSER_PROBE_TIMEOUT = "UAT_BROWSER_PROBE_TIMEOUT"

PROBE_KINDS = (
    "build",
    "test",
    "api_health",
    "process_health",
    "browser_smoke",
    "cli_smoke",
    "manual_operator",
)

FORBIDDEN_PATH_TOKENS = (".env", "intake_evidence", "handoffs/intake_evidence")
SECRET_FORBIDDEN_TOKENS = ("password", "credential", "api key")

JUDGMENT_DENY_TOKENS = (
    "visually",
    "aesthetically",
    "operator confirms",
    "subjective",
    "human judgment",
    "eyeball",
    "manually verify appearance",
    "approve layout",
)

AUTOMATABLE_UI_TOKENS = (
    "click",
    "fill",
    "navigate",
    "smoke",
    "form",
    "submit",
    "button",
    "page load",
    "scroll",
    "type into",
    "select",
    "checkbox",
    "dropdown",
    "ui",
    "browser",
)

BROWSER_PROBE_MODES = ("cursor", "http_fallback", "playwright_fallback")

DEFAULT_PROBE_TIMEOUT = 120
DEFAULT_POLL_SECONDS = 60
DEFAULT_POLL_INTERVAL = 2
MAX_SCREENSHOTS = 5


def _merge_scratchpad(repo: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for name in (".cursor/scratchpad.md", ".cursor/scratchpad.local.md"):
        path = repo / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" in stripped:
                key, _, val = stripped.partition("=")
                values[key.strip()] = val.strip()
    return values


def _read_int(merged: dict[str, str], key: str, default: int) -> int:
    raw = merged.get(key, "")
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def read_browser_probe_mode(repo: Path) -> str:
    merged = _merge_scratchpad(repo)
    mode = merged.get("UAT_BROWSER_PROBE_MODE", "cursor").strip()
    return mode if mode in BROWSER_PROBE_MODES else "cursor"


def read_fallback_chain(repo: Path) -> bool:
    merged = _merge_scratchpad(repo)
    raw = merged.get("UAT_BROWSER_FALLBACK_CHAIN", "1").strip()
    if raw in ("0", "1"):
        return raw == "1"
    return True


def read_poll_settings(repo: Path) -> tuple[int, int]:
    merged = _merge_scratchpad(repo)
    cap = _read_int(merged, "UAT_PROCESS_HEALTH_POLL_SECONDS", DEFAULT_POLL_SECONDS)
    interval = _read_int(
        merged, "UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS", DEFAULT_POLL_INTERVAL
    )
    return cap, interval


def detect_stack_profile(repo: Path) -> str | None:
    if (repo / "package.json").is_file():
        return "node"
    if (repo / "pyproject.toml").is_file() or (repo / "setup.py").is_file():
        return "python"
    if (repo / "go.mod").is_file():
        return "go"
    if list(repo.glob("*.csproj")):
        return "dotnet"
    if (repo / "pom.xml").is_file():
        return "java"
    readme = repo / "README.md"
    if readme.is_file() and "generated" in readme.read_text(encoding="utf-8").lower():
        return "generated"
    return None


def _forbidden(step_text: str) -> bool:
    lower = step_text.lower()
    if any(tok in lower for tok in FORBIDDEN_PATH_TOKENS):
        return True
    return any(tok in lower for tok in SECRET_FORBIDDEN_TOKENS)


def _has_judgment_deny(lower: str) -> bool:
    return any(tok in lower for tok in JUDGMENT_DENY_TOKENS)


def _has_automatable_ui(lower: str) -> bool:
    return any(tok in lower for tok in AUTOMATABLE_UI_TOKENS)


def _read_test_command(repo: Path) -> str | None:
    runbook = repo / "docs" / "engineering" / "runbook.md"
    if runbook.is_file():
        m = re.search(r"^TEST_COMMAND:\s*(.+)$", runbook.read_text(encoding="utf-8"), re.M)
        if m:
            cmd = m.group(1).strip()
            if cmd and "not configured" not in cmd.lower():
                return cmd
    merged = _merge_scratchpad(repo)
    return merged.get("TEST_COMMAND") or None


def _read_build_command(repo: Path, profile: str | None) -> str | None:
    if profile == "node" and (repo / "package.json").is_file():
        try:
            pkg = json.loads((repo / "package.json").read_text(encoding="utf-8"))
            scripts = pkg.get("scripts", {})
            if "build" in scripts:
                return "npm run build"
        except (json.JSONDecodeError, OSError):
            pass
    if profile == "python" and (repo / "pyproject.toml").is_file():
        return "python -m build"
    return None


def _read_health_url(repo: Path) -> str | None:
    rc = repo / "docs" / "engineering" / "runtime-connectivity.md"
    if rc.is_file():
        m = re.search(r"https?://[^\s\)]+", rc.read_text(encoding="utf-8"))
        if m:
            return m.group(0).rstrip(".,)")
    return None


def resolve_browser_url(repo: Path) -> str | None:
    url = _read_health_url(repo)
    if url:
        return url
    merged = _merge_scratchpad(repo)
    port = merged.get("DEV_SERVER_PORT", "").strip()
    if port:
        return f"http://localhost:{port}/"
    if (repo / "package.json").is_file():
        try:
            pkg = json.loads((repo / "package.json").read_text(encoding="utf-8"))
            if pkg.get("scripts", {}).get("start") or pkg.get("scripts", {}).get("dev"):
                default_port = port or "3000"
                return f"http://localhost:{default_port}/"
        except (json.JSONDecodeError, OSError):
            pass
    return None


def is_mcp_unavailable() -> bool:
    ci = os.environ.get("CI", "").lower()
    if ci in ("1", "true", "yes"):
        return True
    return os.environ.get("GITHUB_ACTIONS", "").lower() == "true"


def classify_step(step_text: str, repo: Path) -> tuple[str | None, str]:
    if _forbidden(step_text):
        return None, UAT_PROBE_FORBIDDEN
    lower = step_text.lower()
    profile = detect_stack_profile(repo)

    if _has_judgment_deny(lower):
        return "manual_operator", UAT_PROBE_UNRESOLVED

    if any(w in lower for w in ("build", "compile", "bundle")):
        if _read_build_command(repo, profile):
            return "build", ""
        return None, UAT_PROBE_UNRESOLVED

    if any(w in lower for w in ("test", "pytest", "unit test", "integration test")):
        if _read_test_command(repo) or profile in ("python", "node", "go", "generated"):
            return "test", ""
        return None, UAT_PROBE_UNRESOLVED

    if any(w in lower for w in ("api", "health", "endpoint", "http", "rest")):
        if _read_health_url(repo):
            return "api_health", ""
        return None, UAT_PROBE_UNRESOLVED

    if any(w in lower for w in ("process", "startup", "server start", "readiness")):
        if _extract_startup_command(step_text, repo) and (
            _read_health_url(repo) or resolve_browser_url(repo)
        ):
            return "process_health", ""
        return "process_health", UAT_PROBE_UNRESOLVED

    if _has_automatable_ui(lower):
        if resolve_browser_url(repo):
            return "browser_smoke", ""
        return None, UAT_PROBE_UNRESOLVED

    if any(w in lower for w in ("browser", "playwright", "smoke", "ui")):
        if resolve_browser_url(repo):
            return "browser_smoke", ""
        return None, UAT_PROBE_UNRESOLVED

    if any(w in lower for w in ("cli", "command line", "exit code")):
        if _extract_backtick_command(step_text):
            return "cli_smoke", ""
        return "cli_smoke", UAT_PROBE_UNRESOLVED

    if any(w in lower for w in ("manual", "operator", "human", "judgment")):
        return "manual_operator", UAT_PROBE_UNRESOLVED

    if profile is None:
        return None, UAT_STACK_PROFILE_UNKNOWN
    return None, UAT_PROBE_UNRESOLVED


def _extract_backtick_command(text: str) -> str | None:
    m = re.search(r"`([^`]+)`", text)
    return m.group(1).strip() if m else None


def _extract_stdout_expectation(text: str) -> str | None:
    m = re.search(r'expect\s+"([^"]+)"', text, re.I)
    if m:
        return m.group(1)
    m = re.search(r'output contains\s+"([^"]+)"', text, re.I)
    return m.group(1) if m else None


def _extract_startup_command(step_text: str, repo: Path) -> str | None:
    merged = _merge_scratchpad(repo)
    override = merged.get("DEV_SERVER_COMMAND", "").strip()
    if override:
        return override
    cmd = _extract_backtick_command(step_text)
    if cmd:
        return cmd
    m = re.search(r'"([^"]+(?:start|dev|serve)[^"]*)"', step_text, re.I)
    if m:
        return m.group(1)
    m = re.search(
        r"(npm\s+(?:run\s+)?(?:start|dev)|yarn\s+(?:start|dev)|python\s+-m\s+\w+)",
        step_text,
        re.I,
    )
    if m:
        return m.group(1)
    profile = detect_stack_profile(repo)
    if profile == "node" and (repo / "package.json").is_file():
        try:
            pkg = json.loads((repo / "package.json").read_text(encoding="utf-8"))
            scripts = pkg.get("scripts", {})
            if "dev" in scripts:
                return "npm run dev"
            if "start" in scripts:
                return "npm run start"
        except (json.JSONDecodeError, OSError):
            pass
    return None


def _http_get_probe(url: str, timeout: int) -> tuple[bool, str, dict[str, object]]:
    meta: dict[str, object] = {"url": url}
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=min(timeout, 30)) as resp:
            meta["status_code"] = resp.status
            if 200 <= resp.status < 400:
                return True, UAT_PROBE_PASS, meta
            return False, UAT_BROWSER_PROBE_FAILED, meta
    except urllib.error.URLError as exc:
        meta["error"] = type(exc).__name__
        return False, UAT_BROWSER_PROBE_FAILED, meta
    except TimeoutError:
        return False, UAT_BROWSER_PROBE_TIMEOUT, meta


def _playwright_probe(url: str, timeout: int) -> tuple[bool, str, dict[str, object]]:
    meta: dict[str, object] = {"url": url}
    script = (
        "const { chromium } = require('playwright');"
        "(async () => {"
        f"  const b = await chromium.launch(); const p = await b.newPage();"
        f"  await p.goto({json.dumps(url)}, {{ timeout: {min(timeout, 30) * 1000} }});"
        "  await b.close(); process.exit(0);"
        "})().catch(() => process.exit(1));"
    )
    try:
        proc = subprocess.run(
            ["node", "-e", script],
            capture_output=True,
            text=True,
            timeout=min(timeout, 60),
        )
        meta["exit_code"] = proc.returncode
        if proc.returncode == 0:
            return True, UAT_PROBE_PASS, meta
        return False, UAT_BROWSER_PROBE_FAILED, meta
    except subprocess.TimeoutExpired:
        return False, UAT_BROWSER_PROBE_TIMEOUT, meta
    except OSError as exc:
        meta["error"] = str(exc)
        return False, UAT_BROWSER_UNAVAILABLE, meta


def _run_fallback_chain(
    url: str,
    repo: Path,
    timeout: int,
    *,
    dom_interaction: bool = False,
) -> tuple[bool, str, dict[str, object], str]:
    mode = read_browser_probe_mode(repo)
    chain = read_fallback_chain(repo)
    details: dict[str, object] = {"url": url, "execution_tier": "stdlib"}

    if mode == "http_fallback":
        ok, code, meta = _http_get_probe(url, timeout)
        details.update(meta)
        return ok, code, details, "http_fallback"

    if mode == "playwright_fallback":
        ok, code, meta = _playwright_probe(url, timeout)
        details.update(meta)
        if ok:
            return ok, code, details, "playwright_fallback"
        if chain:
            ok, code, meta = _http_get_probe(url, timeout)
            details.update(meta)
            details["fallback_from"] = "playwright_fallback"
            return ok, code, details, "http_fallback"
        return ok, UAT_BROWSER_UNAVAILABLE, details, "playwright_fallback"

    if dom_interaction and chain:
        ok, code, meta = _playwright_probe(url, timeout)
        if ok:
            details.update(meta)
            return ok, code, details, "playwright_fallback"

    ok, code, meta = _http_get_probe(url, timeout)
    details.update(meta)
    if ok:
        return ok, code, details, "http_fallback"
    if chain and dom_interaction:
        ok, code, meta = _playwright_probe(url, timeout)
        details.update(meta)
        details["fallback_from"] = "http_fallback"
        return ok, code, details, "playwright_fallback"
    return ok, code, details, "http_fallback"


def execute_browser_smoke(
    step_text: str,
    repo: Path,
    *,
    timeout: int = DEFAULT_PROBE_TIMEOUT,
) -> dict[str, object]:
    mode = read_browser_probe_mode(repo)
    url = resolve_browser_url(repo)
    dom_interaction = _has_automatable_ui(step_text.lower())
    result: dict[str, object] = {
        "probe_kind": "browser_smoke",
        "step": step_text[:200],
        "stack_profile": detect_stack_profile(repo) or "unknown",
        "probe_mode": mode,
        "passed": False,
        "reason_code": UAT_PROBE_UNRESOLVED,
        "target_url": url,
    }

    if not url:
        result["reason_code"] = UAT_PROBE_UNRESOLVED
        return result

    if mode == "cursor":
        if is_mcp_unavailable():
            result["reason_code"] = UAT_BROWSER_UNAVAILABLE
            result["execution_tier"] = "stdlib"
            if read_fallback_chain(repo):
                ok, code, meta, fb_mode = _run_fallback_chain(
                    url, repo, timeout, dom_interaction=dom_interaction
                )
                result.update(meta)
                result["probe_mode"] = fb_mode
                result["passed"] = ok
                result["reason_code"] = code if ok else UAT_BROWSER_PROBE_FAILED
                if not ok and code == UAT_BROWSER_UNAVAILABLE:
                    result["reason_code"] = UAT_BROWSER_UNAVAILABLE
            return result
        result["execution_tier"] = "agent"
        result["reason_code"] = UAT_PROBE_UNRESOLVED
        result["agent_plan"] = {
            "sequence": "browser_navigate → interact → screenshot → console/network → evidence",
            "evidence_dir": "sprints/Sxxxx/evidence/browser/",
        }
        return result

    result["execution_tier"] = "stdlib"
    ok, code, meta, fb_mode = _run_fallback_chain(
        url, repo, timeout, dom_interaction=dom_interaction
    )
    result.update(meta)
    result["probe_mode"] = fb_mode
    result["passed"] = ok
    result["reason_code"] = code
    return result


def execute_process_health(
    step_text: str,
    repo: Path,
    *,
    timeout: int = DEFAULT_PROBE_TIMEOUT,
    poll_cap: int | None = None,
    poll_interval: int | None = None,
) -> dict[str, object]:
    cap, interval = read_poll_settings(repo)
    if poll_cap is not None:
        cap = poll_cap
    if poll_interval is not None:
        interval = poll_interval

    startup = _extract_startup_command(step_text, repo)
    health_url = _read_health_url(repo) or resolve_browser_url(repo)
    result: dict[str, object] = {
        "probe_kind": "process_health",
        "step": step_text[:200],
        "stack_profile": detect_stack_profile(repo) or "unknown",
        "execution_tier": "stdlib",
        "passed": False,
        "reason_code": UAT_PROBE_UNRESOLVED,
    }

    if not startup or not health_url:
        return result

    result["startup_command"] = startup
    result["health_url"] = health_url
    proc: subprocess.Popen[str] | None = None
    try:
        proc = subprocess.Popen(
            startup,
            shell=True,
            cwd=str(repo),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + cap
        while time.monotonic() < deadline:
            ok, code, meta = _http_get_probe(health_url, min(timeout, interval + 2))
            if ok:
                result.update(meta)
                result["passed"] = True
                result["reason_code"] = UAT_PROBE_PASS
                return result
            time.sleep(interval)
        result["reason_code"] = UAT_PROBE_TIMEOUT
    except OSError as exc:
        result["reason_code"] = UAT_PROBE_FAILED
        result["error"] = str(exc)
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    return result


def execute_cli_smoke(
    step_text: str,
    repo: Path,
    *,
    timeout: int = DEFAULT_PROBE_TIMEOUT,
) -> dict[str, object]:
    cmd = _extract_backtick_command(step_text)
    expect_out = _extract_stdout_expectation(step_text)
    result: dict[str, object] = {
        "probe_kind": "cli_smoke",
        "step": step_text[:200],
        "stack_profile": detect_stack_profile(repo) or "unknown",
        "execution_tier": "stdlib",
        "passed": False,
        "reason_code": UAT_PROBE_UNRESOLVED,
    }
    if not cmd:
        return result
    result["command"] = cmd
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=str(repo),
            timeout=timeout,
            capture_output=True,
            text=True,
        )
        result["exit_code"] = proc.returncode
        if proc.returncode != 0:
            result["reason_code"] = UAT_PROBE_FAILED
            return result
        if expect_out and expect_out not in proc.stdout:
            result["reason_code"] = UAT_PROBE_FAILED
            return result
        result["reason_code"] = UAT_PROBE_PASS
        result["passed"] = True
    except subprocess.TimeoutExpired:
        result["reason_code"] = UAT_PROBE_TIMEOUT
    except OSError as exc:
        result["reason_code"] = UAT_PROBE_FAILED
        result["error"] = str(exc)
    return result


def validate_browser_evidence(result: dict[str, object], mode: str) -> dict[str, object]:
    out = dict(result)
    if not out.get("passed"):
        return out
    if mode != "cursor":
        return out
    refs = out.get("browser_evidence_refs")
    if not isinstance(refs, dict):
        out["passed"] = False
        out["reason_code"] = UAT_BROWSER_PROBE_FAILED
        return out
    nav = str(refs.get("navigation_url") or "").strip()
    screenshots = refs.get("screenshots")
    if not isinstance(screenshots, list):
        screenshots = []
    console = refs.get("console_summary")
    network = refs.get("network_summary")
    console_path = ""
    network_path = ""
    if isinstance(console, dict):
        console_path = str(console.get("summary_path") or "")
    if isinstance(network, dict):
        network_path = str(network.get("summary_path") or "")
    has_evidence = bool(nav) and (
        bool(screenshots) or bool(console_path) or bool(network_path)
    )
    if len(screenshots) > MAX_SCREENSHOTS:
        has_evidence = False
    if not has_evidence:
        out["passed"] = False
        out["reason_code"] = UAT_BROWSER_PROBE_FAILED
    return out


def merge_result_fragment(fragment: dict[str, object], repo: Path) -> dict[str, object]:
    mode = read_browser_probe_mode(repo)
    if "probe_mode" not in fragment:
        fragment = dict(fragment)
        fragment["probe_mode"] = mode
    return validate_browser_evidence(fragment, mode)


def execute_probe(
    kind: str,
    step_text: str,
    repo: Path,
    *,
    timeout: int = DEFAULT_PROBE_TIMEOUT,
) -> dict[str, object]:
    profile = detect_stack_profile(repo)
    result: dict[str, object] = {
        "probe_kind": kind,
        "step": step_text[:200],
        "stack_profile": profile or "unknown",
        "reason_code": UAT_PROBE_UNRESOLVED,
        "passed": False,
    }

    if kind == "manual_operator":
        result["reason_code"] = UAT_PROBE_UNRESOLVED
        return result

    if kind == "build":
        cmd = _read_build_command(repo, profile)
        if not cmd:
            result["reason_code"] = UAT_PROBE_UNRESOLVED
            return result
        result["execution_tier"] = "stdlib"
        return _run_subprocess(cmd, repo, timeout, result)

    if kind == "test":
        cmd = _read_test_command(repo)
        if not cmd:
            if profile == "python":
                cmd = "python -m pytest -q"
            elif profile == "node":
                cmd = "npm test"
            elif profile == "generated":
                cmd = "python -m pytest -q"
            else:
                result["reason_code"] = UAT_PROBE_UNRESOLVED
                return result
        result["execution_tier"] = "stdlib"
        return _run_subprocess(cmd, repo, timeout, result)

    if kind == "api_health":
        url = _read_health_url(repo)
        if not url:
            result["reason_code"] = UAT_PROBE_UNRESOLVED
            return result
        result["execution_tier"] = "stdlib"
        ok, code, meta = _http_get_probe(url, timeout)
        result.update(meta)
        result["passed"] = ok
        result["reason_code"] = code if ok else UAT_PROBE_FAILED
        return result

    if kind == "process_health":
        return execute_process_health(step_text, repo, timeout=timeout)

    if kind == "browser_smoke":
        return execute_browser_smoke(step_text, repo, timeout=timeout)

    if kind == "cli_smoke":
        return execute_cli_smoke(step_text, repo, timeout=timeout)

    result["reason_code"] = UAT_PROBE_UNRESOLVED
    return result


def _run_subprocess(
    cmd: str,
    repo: Path,
    timeout: int,
    result: dict[str, object],
) -> dict[str, object]:
    result["command"] = cmd
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=str(repo),
            timeout=timeout,
            capture_output=True,
            text=True,
        )
        result["exit_code"] = proc.returncode
        if proc.returncode == 0:
            result["reason_code"] = UAT_PROBE_PASS
            result["passed"] = True
        else:
            result["reason_code"] = UAT_PROBE_FAILED
    except subprocess.TimeoutExpired:
        result["reason_code"] = UAT_PROBE_TIMEOUT
    except OSError as exc:
        result["reason_code"] = UAT_PROBE_FAILED
        result["error"] = str(exc)
    return result


def resolve_and_probe(step_text: str, repo: Path) -> dict[str, object]:
    kind, pre_reason = classify_step(step_text, Path(repo))
    if kind is None:
        return {
            "probe_kind": None,
            "reason_code": pre_reason or UAT_PROBE_UNRESOLVED,
            "passed": False,
        }
    if pre_reason == UAT_PROBE_FORBIDDEN:
        return {"probe_kind": kind, "reason_code": UAT_PROBE_FORBIDDEN, "passed": False}
    if pre_reason == UAT_PROBE_UNRESOLVED and kind in ("manual_operator",):
        return {
            "probe_kind": kind,
            "reason_code": UAT_PROBE_UNRESOLVED,
            "passed": False,
        }
    return execute_probe(kind, step_text, Path(repo))


def probe_steps(steps: list[str], repo: Path) -> list[dict[str, object]]:
    return [resolve_and_probe(step, repo) for step in steps]


def self_test() -> None:
    repo = Path(__file__).resolve().parents[1]
    assert "build" in PROBE_KINDS

    r = classify_step("run unit tests", repo)
    assert r[0] == "test" or r[1] in (UAT_PROBE_UNRESOLVED, "")

    r2 = classify_step("read secrets from .env file", repo)
    assert r2[1] == UAT_PROBE_FORBIDDEN

    r3 = classify_step("enter password in login form", repo)
    assert r3[1] == UAT_PROBE_FORBIDDEN

    r4 = classify_step("operator visually confirms button click", repo)
    assert r4[0] == "manual_operator"
    assert r4[1] == UAT_PROBE_UNRESOLVED

    r5 = classify_step("click submit button on home page", repo)
    assert r5[0] == "browser_smoke" or r5[1] == UAT_PROBE_UNRESOLVED

    r6 = classify_step("operator verifies compliance manually", repo)
    assert r6[0] == "manual_operator"

    mode = read_browser_probe_mode(repo)
    assert mode in BROWSER_PROBE_MODES

    bs = execute_browser_smoke("browser smoke test ui", repo)
    assert bs.get("probe_mode") == "cursor"
    assert bs["passed"] is False
    if bs.get("target_url"):
        assert bs.get("execution_tier") == "agent"
        assert bs["reason_code"] == UAT_PROBE_UNRESOLVED
    else:
        assert bs["reason_code"] == UAT_PROBE_UNRESOLVED

    bad_pass = validate_browser_evidence(
        {"passed": True, "reason_code": UAT_PROBE_PASS},
        "cursor",
    )
    assert bad_pass["passed"] is False
    assert bad_pass["reason_code"] == UAT_BROWSER_PROBE_FAILED

    good_pass = validate_browser_evidence(
        {
            "passed": True,
            "reason_code": UAT_PROBE_PASS,
            "browser_evidence_refs": {
                "navigation_url": "http://localhost:3000/",
                "screenshots": ["sprints/S0082/evidence/browser/pr-01.png"],
            },
        },
        "cursor",
    )
    assert good_pass["passed"] is True

    cli = execute_cli_smoke('run CLI `python -c "import sys; sys.exit(0)"` exit code 0', repo)
    assert cli["passed"] is True
    assert cli["reason_code"] == UAT_PROBE_PASS

    ph = execute_process_health(
        "wait for server startup readiness",
        repo,
        poll_cap=1,
        poll_interval=1,
    )
    assert ph["reason_code"] in (UAT_PROBE_UNRESOLVED, UAT_PROBE_TIMEOUT, UAT_PROBE_FAILED)

    merged = merge_result_fragment(
        {"passed": True, "probe_kind": "browser_smoke"},
        repo,
    )
    assert merged["passed"] is False

    assert detect_stack_profile(repo) in ("python", "node", None, "generated")


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="UAT probe resolver (US-0092 / US-0093).")
    parser.add_argument("--repo", default=".")
    parser.add_argument("--step", action="append", default=[], help="Acceptance step text.")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--report", action="store_true", help="JSON probe results to stdout.")
    parser.add_argument(
        "--merge-result",
        metavar="FRAGMENT.json",
        help="Validate browser evidence fragment JSON (US-0093).",
    )
    args = parser.parse_args()
    repo = Path(args.repo).resolve()

    if args.self_test:
        try:
            self_test()
        except AssertionError as exc:
            print(f"self-test failed: {exc}", file=sys.stderr)
            return 2
        print("[UAT_PROBE_LIB_SELF_TEST_OK]")
        return 0

    if args.merge_result:
        frag_path = Path(args.merge_result)
        if not frag_path.is_file():
            print(f"merge-result: file not found: {frag_path}", file=sys.stderr)
            return 2
        try:
            fragment = json.loads(frag_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"merge-result: invalid JSON: {exc}", file=sys.stderr)
            return 2
        validated = merge_result_fragment(fragment, repo)
        print(json.dumps(validated, sort_keys=True, separators=(",", ":")))
        return 0 if validated.get("passed") else 1

    if args.report or args.step:
        results = probe_steps(args.step or ["run tests"], repo)
        print(json.dumps(results, sort_keys=True, separators=(",", ":")))
        if any(r.get("reason_code") == UAT_PROBE_UNRESOLVED for r in results):
            return 1
        if any(not r.get("passed") for r in results):
            return 1
        return 0

    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
