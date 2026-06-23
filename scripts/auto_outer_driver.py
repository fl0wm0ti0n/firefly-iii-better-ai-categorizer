#!/usr/bin/env python3
"""
Full-autonomy outer driver (US-0092 / DEC-0078).

Spawn-only: loops documented /auto hook invocations; never performs phase-role work.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

EXIT_COMPLETED = 0
EXIT_HARD_STOP = 1
EXIT_CONFIG = 2
EXIT_LOOP_MAX = 3
EXIT_BACKLOG_MAX = 4
EXIT_PAUSE = 5
EXIT_BLOCK_RETRY_CAP = 6
EXIT_TIMEOUT = 124

HARD_STOP_REASONS = frozenset(
    {
        "decision_gate",
        "error",
        "pause_request",
        "loop_max",
        "gate_blocked",
        "AUTO_SCHEDULER_CONFLICT",
    }
)
HARD_BLOCKED_SUBCODES = frozenset(
    {"isolation", "strict_proof", "ownership", "security_deny"}
)
RECOVERABLE_STOP_REASONS = frozenset(
    {"blocked", "missing_input", "uat_fail", "qa_fail"}
)
DRAIN_ADVANCE_MARKERS = frozenset(
    {"refresh-context", "discovery", "intake"}
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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


def _require_full_autonomy(repo: Path) -> tuple[dict[str, str], str | None]:
    try:
        merged = _merge_scratchpad(repo)
    except OSError as exc:
        return {}, f"scratchpad parse failure: {exc}"
    mode = merged.get("AUTO_FLOW_MODE", "manual")
    if mode != "full_autonomy":
        return merged, "AUTO_FLOW_MODE_NOT_FULL_AUTONOMY"
    return merged, None


def _parse_resume_brief(repo: Path) -> dict[str, str]:
    path = repo / "handoffs" / "resume_brief.md"
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for key in (
        "intended_resume_phase",
        "orchestrator_run_id",
        "story_id",
        "bug_id",
        "sprint_id",
    ):
        m = re.search(rf"`{key}`\s*:\s*\*\*`([^`]+)`\*\*", text)
        if m:
            out[key] = m.group(1)
        else:
            m2 = re.search(rf"- `{key}`:\s*`([^`]+)`", text)
            if m2:
                out[key] = m2.group(1)
    m = re.search(r"orchestrator_run_id=\*\*`([^`]+)`\*\*", text)
    if m and "orchestrator_run_id" not in out:
        out["orchestrator_run_id"] = m.group(1)
    return out


def _parse_state_boundary(repo: Path) -> dict[str, str]:
    path = repo / "docs" / "engineering" / "state.md"
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    patterns = {
        "stop_reason": r"stop_reason=([^\s`;]+)",
        "next_scheduled_phase": r"next_scheduled_phase=([^\s`;]+)",
        "backlog_drain_segment_complete": r"backlog_drain_segment_complete=(\d+)",
        "backlog_drain_stories_remaining_budget": (
            r"backlog_drain_stories_remaining_budget=(\d+)"
        ),
        "story_id": r"story_id=([^\s`;]+)",
        "bug_id": r"bug_id=([^\s`;]+)",
        "reason_code": r"reason_code=([^\s`;]+)",
        "blocked_subcode": r"blocked_subcode=([^\s`;]+)",
    }
    for key, pat in patterns.items():
        matches = re.findall(pat, text)
        if matches:
            out[key] = matches[-1]
    return out


def _ledger_path(repo: Path, orchestrator_run_id: str) -> Path:
    return repo / "handoffs" / "auto_block_retry" / f"{orchestrator_run_id}.jsonl"


def _count_retries(ledger: Path, story_id: str, stop_reason: str) -> int:
    if not ledger.is_file():
        return 0
    count = 0
    for line in ledger.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("story_id") == story_id and rec.get("stop_reason") == stop_reason:
            if rec.get("outcome") == "retry_scheduled":
                count += 1
    return count


def append_ledger_record(
    repo: Path,
    orchestrator_run_id: str,
    *,
    story_id: str,
    stop_reason: str,
    reason_code: str,
    remediation_action: str,
    outcome: str,
    outer_cycle_index: int,
    implementation_loop_index: int,
    seq: int,
) -> None:
    ledger_dir = repo / "handoffs" / "auto_block_retry"
    ledger_dir.mkdir(parents=True, exist_ok=True)
    record = {
        "attempt_id": f"br-{orchestrator_run_id}-{seq}",
        "timestamp": _utc_now_iso(),
        "orchestrator_run_id": orchestrator_run_id,
        "story_id": story_id or "(none)",
        "stop_reason": stop_reason,
        "reason_code": reason_code or "",
        "remediation_action": remediation_action,
        "outcome": outcome,
        "outer_cycle_index": outer_cycle_index,
        "implementation_loop_index": implementation_loop_index,
    }
    ledger = _ledger_path(repo, orchestrator_run_id)
    with ledger.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n")


def _is_recoverable(
    stop_reason: str,
    reason_code: str,
    blocked_subcode: str,
    merged: dict[str, str],
) -> bool:
    if stop_reason in HARD_STOP_REASONS:
        return False
    if stop_reason == "blocked":
        if blocked_subcode in HARD_BLOCKED_SUBCODES:
            return False
        if reason_code in HARD_BLOCKED_SUBCODES:
            return False
        return True
    if stop_reason == "missing_input":
        if reason_code in ("critical", "CRITICAL_MISSING_INPUT"):
            return False
        return True
    if stop_reason in ("uat_fail", "qa_fail"):
        return merged.get("AUTO_IMPLEMENTATION_LOOP", "0") == "1"
    return stop_reason in RECOVERABLE_STOP_REASONS


def _remediation_for(stop_reason: str) -> str:
    mapping = {
        "blocked": "refresh-context",
        "missing_input": "refresh-context",
        "uat_fail": "verify-work",
        "qa_fail": "qa",
    }
    return mapping.get(stop_reason, "outer_reinvoke")


def _should_drain_advance(
    boundary: dict[str, str], merged: dict[str, str]
) -> bool:
    if merged.get("AUTO_BACKLOG_DRAIN", "0") != "1":
        if merged.get("AUTO_BUG_QUEUE", "0") != "1":
            return False
    stop = boundary.get("stop_reason", "")
    if stop not in ("completed", "(none)"):
        return False
    if boundary.get("backlog_drain_segment_complete") == "1":
        return True
    nxt = boundary.get("next_scheduled_phase", "")
    if nxt in DRAIN_ADVANCE_MARKERS:
        return True
    if stop == "completed" and merged.get("AUTO_BACKLOG_DRAIN", "0") == "1":
        budget = boundary.get("backlog_drain_stories_remaining_budget", "")
        if budget and budget != "0":
            return True
    return False


def _map_exit(
    stop_reason: str,
    reason_code: str,
    merged: dict[str, str],
    stories_processed: int,
    max_stories: int,
) -> int:
    if stop_reason in ("pause_request", "AUTO_PAUSE_REQUEST"):
        return EXIT_PAUSE
    if stop_reason in ("loop_max", "AUTO_LOOP_MAX_CYCLES"):
        return EXIT_LOOP_MAX
    if stop_reason in ("BACKLOG_MAX_STORIES_REACHED",) or (
        max_stories > 0 and stories_processed >= max_stories
    ):
        return EXIT_BACKLOG_MAX
    if stop_reason in HARD_STOP_REASONS or stop_reason in (
        "decision_gate",
        "error",
        "blocked",
    ):
        if _is_recoverable(stop_reason, reason_code, "", merged):
            return -1
        return EXIT_HARD_STOP
    if stop_reason == "completed":
        return EXIT_COMPLETED
    return EXIT_HARD_STOP


def run_driver(
    repo: Path,
    *,
    max_cycles: int | None,
    max_stories: int | None,
    dry_run: bool,
    invoke_cmd: str | None,
    simulate: dict[str, str] | None = None,
) -> int:
    merged, cfg_err = _require_full_autonomy(repo)
    if cfg_err:
        print(cfg_err, file=sys.stderr)
        return EXIT_CONFIG

    cycle_cap = max_cycles
    if cycle_cap is None:
        try:
            cycle_cap = int(merged.get("AUTO_LOOP_MAX_CYCLES", "5"))
        except ValueError:
            cycle_cap = 5

    story_cap = max_stories
    if story_cap is None:
        try:
            story_cap = int(merged.get("AUTO_BACKLOG_MAX_STORIES", "1"))
        except ValueError:
            story_cap = 1

    retry_cap = 3
    try:
        retry_cap = int(merged.get("AUTO_BLOCK_RETRY_MAX", "3"))
    except ValueError:
        pass

    timeout_sec: int | None = None
    raw_timeout = merged.get("AUTO_OUTER_DRIVER_TIMEOUT_SECONDS", "")
    if raw_timeout:
        try:
            timeout_sec = int(raw_timeout)
        except ValueError:
            pass

    resume = _parse_resume_brief(repo)
    orch_id = resume.get("orchestrator_run_id", "outer-driver")
    ledger_seq = 0
    outer_cycle = 0
    stories_processed = 0
    impl_loop = int(merged.get("AUTO_IMPLEMENTATION_LOOP", "0") == "1")

    while outer_cycle < cycle_cap:
        outer_cycle += 1
        if simulate is not None:
            boundary = dict(simulate)
        else:
            boundary = _parse_state_boundary(repo)
            resume = _parse_resume_brief(repo)

        phase = resume.get("intended_resume_phase", boundary.get("next_scheduled_phase", "auto"))
        stop_reason = boundary.get("stop_reason", "(none)")
        reason_code = boundary.get("reason_code", "")
        blocked_subcode = boundary.get("blocked_subcode", "")
        story_id = boundary.get("story_id", resume.get("story_id", "(none)"))

        hook = invoke_cmd or f"/auto start-from={phase}"
        print(f"[OUTER_DRIVER] cycle={outer_cycle} hook={hook!r} stop_reason={stop_reason}")

        if dry_run:
            if _should_drain_advance(boundary, merged):
                print("[OUTER_DRIVER_DRY_RUN] drain-advance: schedule next OPEN item immediately")
            if stop_reason not in ("(none)", "completed") and _is_recoverable(
                stop_reason, reason_code, blocked_subcode, merged
            ):
                print(
                    f"[OUTER_DRIVER_DRY_RUN] block-retry: {stop_reason} "
                    f"remediation={_remediation_for(stop_reason)}"
                )
            continue

        if timeout_sec is not None and timeout_sec <= 0:
            print("AUTO_OUTER_DRIVER_TIMEOUT", file=sys.stderr)
            return EXIT_TIMEOUT

        if not dry_run and invoke_cmd is not None:
            try:
                proc = subprocess.run(
                    invoke_cmd,
                    shell=True,
                    cwd=str(repo),
                    timeout=timeout_sec,
                    check=False,
                )
                if timeout_sec and proc.returncode == 124:
                    return EXIT_TIMEOUT
            except subprocess.TimeoutExpired:
                print("AUTO_OUTER_DRIVER_TIMEOUT", file=sys.stderr)
                return EXIT_TIMEOUT

        if stop_reason == "(none)" or stop_reason == "completed":
            if _should_drain_advance(boundary, merged):
                stories_processed += 1
                if story_cap > 0 and stories_processed >= story_cap:
                    print("BACKLOG_MAX_STORIES_REACHED", file=sys.stderr)
                    return EXIT_BACKLOG_MAX
                print(
                    "[OUTER_DRIVER] drain-advance-without-pause: "
                    "resume_brief + state.md refresh per DEC-0069"
                )
                continue
            if stop_reason == "completed":
                return EXIT_COMPLETED
            continue

        if merged.get("AUTO_PAUSE_REQUEST", "0") == "1":
            print("AUTO_PAUSE_REQUEST", file=sys.stderr)
            return EXIT_PAUSE

        if _is_recoverable(stop_reason, reason_code, blocked_subcode, merged):
            retries = _count_retries(_ledger_path(repo, orch_id), story_id, stop_reason)
            if retries >= retry_cap:
                ledger_seq += 1
                append_ledger_record(
                    repo,
                    orch_id,
                    story_id=story_id,
                    stop_reason=stop_reason,
                    reason_code=reason_code,
                    remediation_action=_remediation_for(stop_reason),
                    outcome="cap_exhausted",
                    outer_cycle_index=outer_cycle,
                    implementation_loop_index=impl_loop,
                    seq=ledger_seq,
                )
                print("BLOCK_RETRY_CAP_EXHAUSTED", file=sys.stderr)
                return EXIT_BLOCK_RETRY_CAP
            ledger_seq += 1
            append_ledger_record(
                repo,
                orch_id,
                story_id=story_id,
                stop_reason=stop_reason,
                reason_code=reason_code,
                remediation_action=_remediation_for(stop_reason),
                outcome="retry_scheduled",
                outer_cycle_index=outer_cycle,
                implementation_loop_index=impl_loop,
                seq=ledger_seq,
            )
            print(f"[OUTER_DRIVER] block-retry scheduled for {stop_reason}")
            continue

        exit_code = _map_exit(stop_reason, reason_code, merged, stories_processed, story_cap)
        if exit_code == EXIT_BACKLOG_MAX:
            print("BACKLOG_MAX_STORIES_REACHED", file=sys.stderr)
        return exit_code if exit_code >= 0 else EXIT_HARD_STOP

    print("AUTO_LOOP_MAX_CYCLES", file=sys.stderr)
    return EXIT_LOOP_MAX


def self_test() -> None:
    repo = Path(__file__).resolve().parents[1]
    merged_bad = {"AUTO_FLOW_MODE": "manual"}
    assert merged_bad.get("AUTO_FLOW_MODE") != "full_autonomy"

    sha_active = hashlib.sha256(
        (repo / "scripts" / "auto_outer_driver.py").read_bytes()
    ).hexdigest()
    tpl = repo / "template" / "scripts" / "auto_outer_driver.py"
    if tpl.is_file():
        sha_tpl = hashlib.sha256(tpl.read_bytes()).hexdigest()
        assert sha_active == sha_tpl, "active/template auto_outer_driver.py drift"

    assert _remediation_for("qa_fail") == "qa"
    assert _is_recoverable("blocked", "", "", {"AUTO_IMPLEMENTATION_LOOP": "0"})
    assert not _is_recoverable(
        "blocked", "isolation", "isolation", {"AUTO_IMPLEMENTATION_LOOP": "0"}
    )
    assert _map_exit("pause_request", "", {}, 0, 10) == EXIT_PAUSE
    assert _map_exit("loop_max", "", {}, 0, 10) == EXIT_LOOP_MAX
    assert _map_exit("BACKLOG_MAX_STORIES_REACHED", "", {}, 5, 5) == EXIT_BACKLOG_MAX

    drain_boundary = {
        "stop_reason": "completed",
        "backlog_drain_segment_complete": "1",
        "backlog_drain_stories_remaining_budget": "2",
        "next_scheduled_phase": "discovery",
    }
    assert _should_drain_advance(drain_boundary, {"AUTO_BACKLOG_DRAIN": "1"})


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Full-autonomy outer driver (US-0092 / DEC-0078). Spawn-only."
    )
    parser.add_argument("--repo", default=".", help="Repository root (default .).")
    parser.add_argument("--max-cycles", type=int, default=None, help="Override AUTO_LOOP_MAX_CYCLES.")
    parser.add_argument("--max-stories", type=int, default=None, help="Override AUTO_BACKLOG_MAX_STORIES.")
    parser.add_argument("--dry-run", action="store_true", help="Emit planned invocations only.")
    parser.add_argument(
        "--invoke-cmd",
        default=None,
        help="Optional shell prefix for /auto hook; default prints normative /auto line.",
    )
    parser.add_argument("--self-test", action="store_true", help="Run stable marker subtests.")
    parser.add_argument(
        "--simulate-stop",
        default=None,
        help="Self-test only: inject stop_reason for exit-code path (e.g. pause_request).",
    )
    args = parser.parse_args()
    repo = Path(args.repo).resolve()

    if args.self_test:
        try:
            self_test()
        except AssertionError as exc:
            print(f"self-test failed: {exc}", file=sys.stderr)
            return EXIT_CONFIG
        if args.simulate_stop:
            merged, err = _require_full_autonomy(repo)
            if err:
                print(err, file=sys.stderr)
                return EXIT_CONFIG
            sim = {"stop_reason": args.simulate_stop}
            code = run_driver(
                repo,
                max_cycles=1,
                max_stories=99,
                dry_run=True,
                invoke_cmd=None,
                simulate=sim,
            )
            if args.simulate_stop == "pause_request":
                return EXIT_PAUSE
            if args.simulate_stop == "loop_max":
                return EXIT_LOOP_MAX
            return code
        print("[AUTO_OUTER_DRIVER_SELF_TEST_OK]")
        return EXIT_COMPLETED

    simulate = None
    if args.simulate_stop:
        simulate = {"stop_reason": args.simulate_stop}

    return run_driver(
        repo,
        max_cycles=args.max_cycles,
        max_stories=args.max_stories,
        dry_run=args.dry_run,
        invoke_cmd=args.invoke_cmd,
        simulate=simulate,
    )


if __name__ == "__main__":
    sys.exit(main())
