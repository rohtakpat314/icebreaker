"""Role and approval checks against the replay seed. Does not reload readings."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from access import AccessError, can_see_freezers, decide, dollars_for

SEED = Path(__file__).resolve().parents[1] / "seed" / "replay.json"
OFFICER = {"id": "officer", "role": "FacilitiesOfficer", "buildingId": None}
LAB = {"id": "labmgr-chemistry", "role": "LabManager", "buildingId": "chemistry"}
VIEWER = {"id": "viewer", "role": "Viewer", "buildingId": None}


def test_approval_changes_only_decision_fields() -> None:
    payload = json.loads(SEED.read_text(encoding="utf-8"))
    plan = next(item for item in payload["plans"] if item["building"] == "chemistry")
    other = next(item for item in payload["plans"] if item["id"] != plan["id"])
    other_before = json.dumps(other, sort_keys=True)
    before_steps = list(plan["steps"])
    before_rank = plan["rank"]
    when = datetime(2026, 10, 19, 13, 0)
    decide(plan, OFFICER, "approved", when)
    assert plan["status"] == "approved"
    assert plan["decidedBy"] == "officer"
    assert plan["decidedAt"] == when
    assert plan["steps"] == before_steps
    assert plan["rank"] == before_rank
    assert json.dumps(other, sort_keys=True) == other_before
    try:
        decide(plan, OFFICER, "rejected", when)
        raise AssertionError("second decision should fail")
    except AccessError as exc:
        assert "already decided" in str(exc)
    print("approval OK")


def test_viewer_cannot_approve() -> None:
    plan = {"status": "pending", "steps": ["x"], "rank": 1}
    try:
        decide(plan, VIEWER, "approved", datetime(2026, 10, 19, 13, 0))
        raise AssertionError("viewer approval should fail")
    except AccessError as exc:
        assert str(exc) == "access denied"
    assert plan["status"] == "pending"
    assert "decidedBy" not in plan
    print("viewer denied OK")


def test_lab_manager_cannot_see_bock() -> None:
    assert can_see_freezers(LAB, "chemistry")
    assert not can_see_freezers(LAB, "bock")
    assert not can_see_freezers(VIEWER, "chemistry")
    assert can_see_freezers(OFFICER, "bock")
    assert dollars_for(VIEWER, 1050000) == "over $1M"
    assert dollars_for(VIEWER, 0) == "under $250K"
    assert dollars_for(OFFICER, 1_050_000) == "$1.1M"
    print("visibility OK")


def test_early_score_does_not_use_later_weather() -> None:
    payload = json.loads(SEED.read_text(encoding="utf-8"))
    early = next(
        row
        for row in payload["riskScores"]
        if row["building"] == "chemistry" and row["timestamp"] == "2019-01-25T00:00"
    )
    blob = " ".join(early["reasons"])
    assert "-27" not in blob
    assert "trending warm" not in blob
    print("early chemistry", early["score"], early["reasons"])


if __name__ == "__main__":
    test_approval_changes_only_decision_fields()
    test_viewer_cannot_approve()
    test_lab_manager_cannot_see_bock()
    test_early_score_does_not_use_later_weather()
    print("ACCESS CHECKS PASSED")
