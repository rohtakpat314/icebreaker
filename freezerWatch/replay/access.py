"""Approval and role checks.

Approving or rejecting writes status, decidedBy, and decidedAt.
// ASSUMPTION: rejectPlan's reason is not stored. ActionPlan has no reason field,
// and the PRD says nothing else happens.
"""

from __future__ import annotations

from datetime import datetime


class AccessError(Exception):
    pass


def money(value: float) -> str:
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"${value / 1_000:.0f}K"
    return f"${value:.0f}"


def money_range(value: float) -> str:
    # // ASSUMPTION: $250K and $1M sit in the middle bucket.
    if value < 250_000:
        return "under $250K"
    if value <= 1_000_000:
        return "$250K to $1M"
    return "over $1M"


def dollars_for(user: dict, value: float) -> str:
    if user["role"] == "Viewer":
        return money_range(value)
    return money(value)


def can_see_freezers(user: dict, building_id: str) -> bool:
    if user["role"] == "FacilitiesOfficer":
        return True
    if user["role"] == "LabManager":
        return user.get("buildingId") == building_id
    return False


def decide(plan: dict, user: dict, status: str, when: datetime) -> dict:
    if user["role"] != "FacilitiesOfficer":
        raise AccessError("access denied")
    if plan["status"] != "pending":
        raise AccessError("already decided")
    untouched = {
        key: plan[key]
        for key in plan
        if key not in ("status", "decidedBy", "decidedAt")
    }
    plan["status"] = status
    plan["decidedBy"] = user["id"]
    plan["decidedAt"] = when
    for key, value in untouched.items():
        if plan[key] != value:
            raise RuntimeError(f"approval changed {key}")
    return plan
