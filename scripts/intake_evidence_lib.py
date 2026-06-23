"""
Deterministic intake evidence validation
(US-0078 / US-0083 / DEC-0060 / DEC-0067 / R-0055 / BUG-0007 / R-0066).

Consumes a logical intake_evidence bundle (dict). PO workflows MUST run this
gate before mutating backlog/acceptance; failures are fail-closed.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any

IE_REF_RE = re.compile(r"^ie:([^:]+):(\d+):([0-9a-f]{16})$")
PLAN_AREA_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")

PACK_REQUIRED_KEYS: dict[str, tuple[str, ...]] = {
    "first-intake-pack": (
        "users_problem",
        "runtime_target_environment",
        "language_framework_runtime",
        "architecture_preference",
        "ui_design_expectations",
        "security_compliance",
        "non_functional_priorities",
        "scope_timeline",
    ),
    "small-intake-pack": (
        "outcome_success_criteria",
        "impacted_components",
        "constraints_compatibility_risks",
        "required_tests_acceptance_checks",
        "done_definition",
    ),
}

ASSUMPTIONS_TOPIC_KEY = "assumptions_bundle"

SAFE_ASSUMPTION_LITERALS = frozenset(
    {
        "",
        "(none)",
        "none",
        "no",
        "false",
        "n/a",
        "na",
        "n",
    }
)

FALSE_CONFIRMATION_LITERALS = frozenset({"yes", "true", "confirmed"})
ALLOWED_SATISFIED_BY = frozenset({"answer_ref", "assumption_confirmation_ref", "delegation_ref"})
DELEGATION_CONFIDENCE_VALUES = frozenset({"low", "medium", "high"})


def canonical_json_sha256_16(obj: dict[str, Any]) -> str:
    """Sorted-key compact JSON UTF-8 → first 16 hex chars of SHA-256 (DEC-0060)."""
    blob = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:16]


def build_ie_ref(
    intake_run_id: str,
    turn_index: int,
    topic_key: str,
    satisfied_by: str,
    quoted_user_text: str,
) -> str:
    """Construct ie: ref per DEC-0060 §4."""
    payload = {
        "intake_run_id": intake_run_id,
        "turn_index": int(turn_index),
        "topic_key": topic_key,
        "satisfied_by": satisfied_by,
        "quoted_user_text": (quoted_user_text or "").strip(),
    }
    digest = canonical_json_sha256_16(payload)
    return f"ie:{intake_run_id}:{int(turn_index)}:{digest}"


def parse_ie_ref(ref: str) -> tuple[str, int, str] | None:
    if not ref or not isinstance(ref, str):
        return None
    m = IE_REF_RE.match(ref.strip())
    if not m:
        return None
    return m.group(1), int(m.group(2)), m.group(3)


def verify_ie_ref(
    ref: str,
    *,
    intake_run_id: str,
    turn_index: int,
    topic_key: str,
    satisfied_by: str,
    quoted_user_text: str,
) -> bool:
    parsed = parse_ie_ref(ref)
    if not parsed:
        return False
    prun, pturn, phash = parsed
    if prun != intake_run_id or pturn != int(turn_index):
        return False
    payload = {
        "intake_run_id": intake_run_id,
        "turn_index": int(turn_index),
        "topic_key": topic_key,
        "satisfied_by": satisfied_by,
        "quoted_user_text": (quoted_user_text or "").strip(),
    }
    return canonical_json_sha256_16(payload) == phash


def _norm_assumption(s: str) -> str:
    return (s or "").strip()


def assumption_literal_requires_confirmation_ref(value: str) -> bool:
    """R-0055 rules 4–5 + DEC-0060: non-placeholder confirmations need evidence."""
    v = _norm_assumption(value)
    if not v:
        return False
    low = v.lower()
    if low in SAFE_ASSUMPTION_LITERALS:
        return False
    if low in FALSE_CONFIRMATION_LITERALS:
        return True
    # Any other non-empty narrative still implies confirmation was recorded → needs ref
    return True


@dataclass
class ValidationResult:
    ok: bool
    primary_codes: list[str] = field(default_factory=list)
    missing_topics: list[str] = field(default_factory=list)
    diagnostics: list[str] = field(default_factory=list)

    def add_code(self, code: str) -> None:
        if code not in self.primary_codes:
            self.primary_codes.append(code)


def _topic_rows(bundle: dict[str, Any]) -> list[dict[str, Any]]:
    raw = bundle.get("topic_coverage")
    if raw is None:
        return []
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for row in raw:
        if isinstance(row, dict):
            out.append(row)
    return out


def _asked_set(bundle: dict[str, Any]) -> set[str]:
    at = bundle.get("asked_topics")
    if at is None:
        return set()
    if isinstance(at, str):
        parts = [p.strip() for p in at.replace("\n", ",").split(",")]
        return {p for p in parts if p}
    if isinstance(at, list):
        return {str(x).strip() for x in at if str(x).strip()}
    return set()


def _row_run_id(bundle: dict[str, Any], row: dict[str, Any]) -> str | None:
    v = row.get("intake_run_id")
    if v is not None and str(v).strip():
        return str(v).strip()
    v2 = bundle.get("intake_run_id")
    if v2 is not None and str(v2).strip():
        return str(v2).strip()
    return None


def _row_turn(row: dict[str, Any]) -> int | None:
    t = row.get("turn_index")
    if t is None:
        return None
    try:
        return int(t)
    except (TypeError, ValueError):
        return None


def _row_uses_equivalent_evidence(row: dict[str, Any]) -> bool:
    """
    US-0083 AC-1: allow required-topic accounting without forcing repetitive asks
    when equivalent evidence is already captured and explicitly referenced.
    """
    marker = str(row.get("evidence_source") or "").strip()
    if marker != "equivalent_evidence_ref":
        return False
    return bool(str(row.get("equivalent_evidence_ref") or "").strip())


def _norm_answer_ref_quoted_user_text(value: Any) -> str:
    """Normalize quoted_user_text for BUG-0007 duplicate detection (DEC-0060 strip parity)."""
    if value is None:
        return ""
    return str(value).strip()


def _row_exempt_from_answer_ref_topic_distinctness(row: dict[str, Any]) -> bool:
    """BUG-0007: alternate satisfaction paths do not participate in answer_ref blob reuse checks."""
    return _row_uses_equivalent_evidence(row)


def _validate_answer_ref_topic_distinctness(
    bundle: dict[str, Any],
    required: list[str],
    by_key: dict[str, dict[str, Any]],
    res: ValidationResult,
) -> None:
    """
    BUG-0007 / R-0066: distinct required topic_key rows must not reuse the same
    quoted_user_text under satisfied_by=answer_ref (normalized), except exempt rows.
    """
    norm_to_topics: dict[str, list[str]] = {}
    for k in required:
        row = by_key.get(k)
        if not row:
            continue
        sat = (row.get("satisfied_by") or "").strip()
        if sat != "answer_ref":
            continue
        if _row_exempt_from_answer_ref_topic_distinctness(row):
            continue
        irid = _row_run_id(bundle, row)
        tit = _row_turn(row)
        if irid is None or tit is None:
            continue
        qraw = row.get("quoted_user_text")
        qtxt = "" if qraw is None else str(qraw)
        ref = (row.get("ref") or "").strip()
        if not ref or not verify_ie_ref(
            ref,
            intake_run_id=irid,
            turn_index=int(tit),
            topic_key=k,
            satisfied_by=sat,
            quoted_user_text=qtxt,
        ):
            continue
        norm = _norm_answer_ref_quoted_user_text(qraw)
        norm_to_topics.setdefault(norm, []).append(k)

    dup_groups: list[str] = []
    for norm, topics in norm_to_topics.items():
        uniq = sorted(set(topics))
        if len(uniq) < 2:
            continue
        dup_groups.append("text=" + repr(norm[:120]) + " topics=" + ",".join(uniq))

    if dup_groups:
        res.ok = False
        res.add_code("INTAKE_ANSWER_REF_NOT_TOPIC_DISTINCT")
        res.diagnostics.append(
            "Remediation: distinct required topics must not reuse the same quoted_user_text "
            "under satisfied_by=answer_ref (BUG-0007 / R-0066). Duplicates: "
            + "; ".join(dup_groups)
            + ". Use per-topic answers, or an allowed alternate path "
            "(evidence_source=equivalent_evidence_ref + equivalent_evidence_ref, "
            "delegation_ref per DEC-0067 / US-0083, or assumption_confirmation_ref on the row)."
        )


def _candidate_story_ids(bundle: dict[str, Any]) -> set[str]:
    out: set[str] = set()

    raw_ids = bundle.get("candidate_story_ids")
    if isinstance(raw_ids, list):
        for sid in raw_ids:
            sv = str(sid).strip()
            if sv:
                out.add(sv)

    raw_story_ids = bundle.get("story_ids")
    if isinstance(raw_story_ids, list):
        for sid in raw_story_ids:
            sv = str(sid).strip()
            if sv:
                out.add(sv)

    raw_story_map = bundle.get("story_map")
    if isinstance(raw_story_map, list):
        for row in raw_story_map:
            if not isinstance(row, dict):
                continue
            sv = str(row.get("story_id") or "").strip()
            if sv:
                out.add(sv)

    return out


def _validate_plan_coverage_contract(bundle: dict[str, Any], res: ValidationResult) -> None:
    inventory_raw = bundle.get("plan_area_inventory")
    coverage_raw = bundle.get("plan_area_coverage")
    coverage_complete_raw = bundle.get("coverage_complete")
    candidate_story_ids = _candidate_story_ids(bundle)

    inventory_rows = inventory_raw if isinstance(inventory_raw, list) else []
    coverage_rows = coverage_raw if isinstance(coverage_raw, list) else []

    inventory_ids: list[str] = []
    coverage_by_id: dict[str, dict[str, Any]] = {}

    coverage_missing = False
    id_invalid = False
    contract_invalid = False
    deferred_ref_missing = False

    if not inventory_rows:
        coverage_missing = True
        res.diagnostics.append(
            "Remediation: plan_area_inventory must be a non-empty list for first/new/broad intake."
        )
    if not coverage_rows:
        coverage_missing = True
        res.diagnostics.append(
            "Remediation: plan_area_coverage must be a non-empty list for first/new/broad intake."
        )

    seen_inventory_ids: set[str] = set()
    for row in inventory_rows:
        if not isinstance(row, dict):
            id_invalid = True
            continue
        plan_area_id = str(row.get("plan_area_id") or "").strip()
        if not PLAN_AREA_ID_RE.match(plan_area_id):
            id_invalid = True
            continue
        if plan_area_id in seen_inventory_ids:
            id_invalid = True
            continue
        seen_inventory_ids.add(plan_area_id)
        inventory_ids.append(plan_area_id)

    for row in coverage_rows:
        if not isinstance(row, dict):
            id_invalid = True
            continue
        plan_area_id = str(row.get("plan_area_id") or "").strip()
        if not PLAN_AREA_ID_RE.match(plan_area_id):
            id_invalid = True
            continue
        if plan_area_id in coverage_by_id:
            id_invalid = True
            continue
        coverage_by_id[plan_area_id] = row

    inventory_id_set = set(inventory_ids)
    coverage_id_set = set(coverage_by_id.keys())

    if inventory_id_set != coverage_id_set:
        coverage_missing = True
        missing_ids = sorted(inventory_id_set - coverage_id_set)
        extra_ids = sorted(coverage_id_set - inventory_id_set)
        if missing_ids:
            res.diagnostics.append(
                "Remediation: add plan_area_coverage rows for uncovered plan_area_id values: "
                + ", ".join(missing_ids)
            )
        if extra_ids:
            contract_invalid = True
            res.diagnostics.append(
                "Remediation: remove unknown plan_area_coverage plan_area_id values not in plan_area_inventory: "
                + ", ".join(extra_ids)
            )

    for plan_area_id in sorted(inventory_id_set & coverage_id_set):
        row = coverage_by_id[plan_area_id]
        story_ids_raw = row.get("story_ids")
        deferred_ref = str(row.get("deferred_ref") or "").strip()

        story_ids: list[str] = []
        if isinstance(story_ids_raw, list):
            for sid in story_ids_raw:
                sv = str(sid).strip()
                if sv:
                    story_ids.append(sv)
        has_story_ids = bool(story_ids)
        has_deferred_ref = bool(deferred_ref)

        if has_story_ids == has_deferred_ref:
            contract_invalid = True
            res.diagnostics.append(
                "Remediation: each plan_area_coverage row must set exactly one mapping path "
                "(story_ids xor deferred_ref) for plan_area_id "
                + repr(plan_area_id)
                + "."
            )
            continue

        if has_story_ids:
            if candidate_story_ids:
                unknown_story_ids = sorted({sid for sid in story_ids if sid not in candidate_story_ids})
                if unknown_story_ids:
                    contract_invalid = True
                    res.diagnostics.append(
                        "Remediation: plan_area_id "
                        + repr(plan_area_id)
                        + " references unknown story_ids not present in candidate story set: "
                        + ", ".join(unknown_story_ids)
                    )
        else:
            deferred_reason = str(row.get("deferred_reason") or "").strip()
            if not deferred_reason:
                deferred_ref_missing = True
                res.diagnostics.append(
                    "Remediation: deferred mapping for plan_area_id "
                    + repr(plan_area_id)
                    + " requires both deferred_ref and deferred_reason."
                )

    derived_coverage_complete = not (coverage_missing or id_invalid or contract_invalid or deferred_ref_missing)
    if coverage_complete_raw is not True:
        contract_invalid = True
        res.diagnostics.append(
            "Remediation: set coverage_complete=true only after plan_area_inventory and "
            "plan_area_coverage pass deterministic validation."
        )
    if bool(coverage_complete_raw) != derived_coverage_complete:
        contract_invalid = True
        res.diagnostics.append(
            "Remediation: coverage_complete must match derived contract result from "
            "plan_area_inventory/plan_area_coverage validation."
        )

    if coverage_missing:
        res.ok = False
        res.add_code("INTAKE_PLAN_COVERAGE_MISSING")
    if id_invalid:
        res.ok = False
        res.add_code("INTAKE_PLAN_AREA_ID_INVALID")
        res.diagnostics.append(
            "Remediation: plan_area_id must be unique and match ^[a-z0-9][a-z0-9_-]{1,63}$ in inventory and coverage."
        )
    if deferred_ref_missing:
        res.ok = False
        res.add_code("INTAKE_PLAN_DEFERRED_REF_MISSING")
    if contract_invalid:
        res.ok = False
        res.add_code("INTAKE_PLAN_COVERAGE_CONTRACT_INVALID")


def validate_intake_evidence(
    bundle: dict[str, Any],
    *,
    intake_guided_mode: int | None = None,
) -> ValidationResult:
    """
    Validate logical intake_evidence. intake_guided_mode is accepted for API parity
    (AC-5/AC-6): validation rules do not branch on mode — same pipeline for {0,1}.
    """
    _ = intake_guided_mode  # explicit no-op for parity contract
    res = ValidationResult(ok=True)

    pack = (bundle.get("selected_pack") or "").strip()
    if pack not in PACK_REQUIRED_KEYS:
        res.ok = False
        res.add_code("INTAKE_REQUIRED_PACK_INCOMPLETE")
        res.diagnostics.append(
            f"Remediation: set selected_pack to one of {sorted(PACK_REQUIRED_KEYS.keys())!r}; "
            f"unknown or empty pack is not allowed before persistence."
        )
        res.add_code("INTAKE_PERSISTENCE_BLOCKED")
        return res

    required = list(PACK_REQUIRED_KEYS[pack])
    rows = _topic_rows(bundle)
    by_key: dict[str, dict[str, Any]] = {}
    for row in rows:
        k = (row.get("topic_key") or "").strip()
        if k:
            by_key[k] = row

    missing_cov: list[str] = []
    for k in required:
        row = by_key.get(k)
        if not row:
            missing_cov.append(k)
            continue

        ref = (row.get("ref") or "").strip()
        sat = (row.get("satisfied_by") or "").strip()
        qtxt = row.get("quoted_user_text")
        if qtxt is None:
            qtxt = ""
        qtxt = str(qtxt)

        if sat not in ALLOWED_SATISFIED_BY:
            res.ok = False
            res.diagnostics.append(
                f"Remediation: topic {k!r} must set satisfied_by to "
                f"'answer_ref', 'assumption_confirmation_ref', or 'delegation_ref' (got {sat!r})."
            )
            missing_cov.append(k)
            continue

        if sat == "delegation_ref":
            scope = str(row.get("delegation_scope") or "").strip()
            rationale = str(row.get("delegation_rationale") or "").strip()
            confidence = str(row.get("delegation_confidence") or "").strip().lower()
            if not scope or not rationale or not confidence:
                res.ok = False
                res.add_code("INTAKE_DELEGATION_EVIDENCE_MISSING")
                missing_fields = []
                if not scope:
                    missing_fields.append("delegation_scope")
                if not rationale:
                    missing_fields.append("delegation_rationale")
                if not confidence:
                    missing_fields.append("delegation_confidence")
                res.diagnostics.append(
                    f"Remediation: delegated topic {k!r} requires non-empty fields: "
                    + ", ".join(missing_fields)
                    + "."
                )
                continue
            if confidence not in DELEGATION_CONFIDENCE_VALUES:
                res.ok = False
                res.add_code("INTAKE_DELEGATION_EVIDENCE_INVALID")
                res.diagnostics.append(
                    f"Remediation: delegated topic {k!r} delegation_confidence must be one of "
                    f"{sorted(DELEGATION_CONFIDENCE_VALUES)!r} (got {confidence!r})."
                )
                continue

        irid = _row_run_id(bundle, row)
        tit = _row_turn(row)
        if irid is None or tit is None:
            res.ok = False
            res.diagnostics.append(
                f"Remediation: topic {k!r} needs intake_run_id and turn_index (row or bundle) "
                f"for ie: ref verification."
            )
            missing_cov.append(k)
            continue

        if not ref or not verify_ie_ref(
            ref,
            intake_run_id=irid,
            turn_index=tit,
            topic_key=k,
            satisfied_by=sat,
            quoted_user_text=qtxt,
        ):
            res.ok = False
            if sat == "delegation_ref":
                res.add_code("INTAKE_DELEGATION_EVIDENCE_INVALID")
                res.diagnostics.append(
                    f"Remediation: delegated topic {k!r} ref is malformed or hash mismatch — rebuild ie: ref "
                    f"with DEC-0060 canonical JSON (sorted keys) and quoted_user_text."
                )
            else:
                res.diagnostics.append(
                    f"Remediation: topic {k!r} ref is malformed or hash mismatch — rebuild ie: ref "
                    f"with DEC-0060 canonical JSON (sorted keys) and quoted_user_text."
                )
                missing_cov.append(k)

    if missing_cov:
        res.ok = False
        res.missing_topics = sorted(set(missing_cov))
        res.add_code("INTAKE_REQUIRED_TOPIC_MISSING")
        if len(res.missing_topics) > 1:
            res.add_code("INTAKE_REQUIRED_PACK_INCOMPLETE")
        res.diagnostics.append(
            "Remediation: supply complete topic_coverage with valid ie: refs for: "
            + ", ".join(res.missing_topics)
        )

    asked = _asked_set(bundle)
    for k in required:
        if k not in by_key:
            continue
        if k not in asked:
            row = by_key[k]
            if _row_uses_equivalent_evidence(row):
                continue
            res.ok = False
            res.add_code("INTAKE_REQUIRED_TOPIC_MISSING")
            res.diagnostics.append(
                f"Remediation: add {k!r} to asked_topics or mark evidence_source='equivalent_evidence_ref' "
                f"with equivalent_evidence_ref when reusing previously captured equivalent evidence."
            )
            if k not in res.missing_topics:
                res.missing_topics.append(k)
    res.missing_topics = sorted(set(res.missing_topics))

    _validate_answer_ref_topic_distinctness(bundle, required, by_key, res)

    # US-0081 / DEC-0064: first/new/broad intake requires complete-plan coverage contract.
    if pack == "first-intake-pack":
        _validate_plan_coverage_contract(bundle, res)

    ac = bundle.get("assumptions_confirmed")
    ac_str = ac if isinstance(ac, str) else ("(none)" if ac is None else str(ac))

    low = _norm_assumption(ac_str).lower()
    if low in FALSE_CONFIRMATION_LITERALS and not (bundle.get("assumption_confirmation_ref") or "").strip():
        res.ok = False
        res.add_code("INTAKE_ASSUMPTION_CONFIRMATION_REQUIRED")
        res.diagnostics.append(
            "Remediation: literal yes/true/confirmed is rejected without "
            "assumption_confirmation_ref (R-0055 rule 5)."
        )

    if assumption_literal_requires_confirmation_ref(ac_str):
        aref = (bundle.get("assumption_confirmation_ref") or "").strip()
        aquote = str(bundle.get("assumption_confirmation_quoted") or "")
        irid = bundle.get("assumption_confirmation_intake_run_id")
        tit = bundle.get("assumption_confirmation_turn_index")
        if not aref or irid is None or tit is None:
            res.ok = False
            res.add_code("INTAKE_ASSUMPTION_CONFIRMATION_REQUIRED")
            res.diagnostics.append(
                "Remediation: affirmative assumptions_confirmed requires assumption_confirmation_ref "
                "plus assumption_confirmation_intake_run_id, assumption_confirmation_turn_index, "
                "and assumption_confirmation_quoted for ie: binding."
            )
        elif not verify_ie_ref(
            aref,
            intake_run_id=str(irid),
            turn_index=int(tit),
            topic_key=ASSUMPTIONS_TOPIC_KEY,
            satisfied_by="assumption_confirmation_ref",
            quoted_user_text=aquote,
        ):
            res.ok = False
            res.add_code("INTAKE_ASSUMPTION_CONFIRMATION_REQUIRED")
            res.diagnostics.append(
                "Remediation: assumption_confirmation_ref is invalid or does not match "
                "quoted affirmative user text / run metadata."
            )

    if not res.ok and "INTAKE_PERSISTENCE_BLOCKED" not in res.primary_codes:
        res.add_code("INTAKE_PERSISTENCE_BLOCKED")

    return res


def format_blocked_message(result: ValidationResult) -> str:
    lines = [
        "INTAKE_PERSISTENCE_BLOCKED",
        "primary_codes=" + ",".join(result.primary_codes),
    ]
    if result.missing_topics:
        lines.append("missing_topics=" + ",".join(result.missing_topics))
    lines.extend(result.diagnostics)
    return "\n".join(lines)


def self_test() -> None:
    """Minimal sanity checks for --self-test / installer wiring."""
    rid = "selftest-run"
    ref = build_ie_ref(rid, 0, "outcome_success_criteria", "answer_ref", "ok")
    assert parse_ie_ref(ref) is not None
    assert verify_ie_ref(
        ref,
        intake_run_id=rid,
        turn_index=0,
        topic_key="outcome_success_criteria",
        satisfied_by="answer_ref",
        quoted_user_text="ok",
    )
    assert not verify_ie_ref(
        ref,
        intake_run_id=rid,
        turn_index=0,
        topic_key="outcome_success_criteria",
        satisfied_by="answer_ref",
        quoted_user_text="tampered",
    )
    # Mode argument must not change outcome (AC-6 / AC-5 parity)
    small = PACK_REQUIRED_KEYS["small-intake-pack"]
    rows = []
    for i, key in enumerate(small):
        rows.append(
            {
                "topic_key": key,
                "satisfied_by": "answer_ref",
                "quoted_user_text": f"a{i}",
                "intake_run_id": rid,
                "turn_index": i,
                "ref": build_ie_ref(rid, i, key, "answer_ref", f"a{i}"),
            }
        )
    bundle = {
        "selected_pack": "small-intake-pack",
        "intake_run_id": rid,
        "asked_topics": list(small),
        "missing_topics": [],
        "assumptions_confirmed": "(none)",
        "topic_coverage": rows,
    }
    r0 = validate_intake_evidence(bundle, intake_guided_mode=0)
    r1 = validate_intake_evidence(bundle, intake_guided_mode=1)
    assert r0.ok and r1.ok
    assert r0.primary_codes == r1.primary_codes

    # US-0083 delegated-topic pass path
    delegated_key = "done_definition"
    rows2 = []
    for i, key in enumerate(small):
        sat = "delegation_ref" if key == delegated_key else "answer_ref"
        txt = f"d{i}"
        row = {
            "topic_key": key,
            "satisfied_by": sat,
            "quoted_user_text": txt,
            "intake_run_id": rid,
            "turn_index": 200 + i,
            "ref": build_ie_ref(rid, 200 + i, key, sat, txt),
        }
        if sat == "delegation_ref":
            row["delegation_scope"] = "Implementation defaults for done criteria wording"
            row["delegation_rationale"] = "User asked to proceed without additional specificity."
            row["delegation_confidence"] = "medium"
        rows2.append(row)
    delegated_bundle = {
        "selected_pack": "small-intake-pack",
        "intake_run_id": rid,
        "asked_topics": list(small),
        "missing_topics": [],
        "assumptions_confirmed": "(none)",
        "topic_coverage": rows2,
    }
    d0 = validate_intake_evidence(delegated_bundle, intake_guided_mode=0)
    d1 = validate_intake_evidence(delegated_bundle, intake_guided_mode=1)
    assert d0.ok and d1.ok
    assert d0.primary_codes == d1.primary_codes

    # BUG-0007: same quoted_user_text across multiple answer_ref required topics fails
    dup_txt = "synthetic blob echoed for every topic"
    dup_rows = []
    for i, key in enumerate(small):
        dup_rows.append(
            {
                "topic_key": key,
                "satisfied_by": "answer_ref",
                "quoted_user_text": dup_txt,
                "intake_run_id": rid,
                "turn_index": 300 + i,
                "ref": build_ie_ref(rid, 300 + i, key, "answer_ref", dup_txt),
            }
        )
    dup_bundle = {
        "selected_pack": "small-intake-pack",
        "intake_run_id": rid,
        "asked_topics": list(small),
        "missing_topics": [],
        "assumptions_confirmed": "(none)",
        "topic_coverage": dup_rows,
    }
    dup_res = validate_intake_evidence(dup_bundle)
    assert not dup_res.ok
    assert "INTAKE_ANSWER_REF_NOT_TOPIC_DISTINCT" in dup_res.primary_codes

    # First-intake full-plan coverage contract (US-0081 / DEC-0064)
    first = PACK_REQUIRED_KEYS["first-intake-pack"]
    first_rows = []
    for i, key in enumerate(first):
        first_rows.append(
            {
                "topic_key": key,
                "satisfied_by": "answer_ref",
                "quoted_user_text": f"b{i}",
                "intake_run_id": rid,
                "turn_index": i,
                "ref": build_ie_ref(rid, i, key, "answer_ref", f"b{i}"),
            }
        )
    full_bundle = {
        "selected_pack": "first-intake-pack",
        "intake_run_id": rid,
        "asked_topics": list(first),
        "missing_topics": [],
        "assumptions_confirmed": "(none)",
        "topic_coverage": first_rows,
        "candidate_story_ids": ["US-9001", "US-9002"],
        "plan_area_inventory": [
            {"plan_area_id": "auth", "title": "Auth"},
            {"plan_area_id": "billing", "title": "Billing"},
        ],
        "plan_area_coverage": [
            {"plan_area_id": "auth", "story_ids": ["US-9001"]},
            {"plan_area_id": "billing", "story_ids": ["US-9002"]},
        ],
        "coverage_complete": True,
    }
    assert validate_intake_evidence(full_bundle, intake_guided_mode=0).ok
