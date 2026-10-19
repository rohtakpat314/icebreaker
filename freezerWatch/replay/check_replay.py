"""Checks for create/fetch, CSV counts, and the replay seed."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from catalog import Store, load_buildings, load_freezers, load_weather

SEED = Path(__file__).resolve().parents[1] / "seed" / "replay.json"


def test_create_and_fetch() -> None:
    store = Store()
    samples = {
        "Building": {"id": "t-b", "name": "Test"},
        "Freezer": {"id": "t-f", "building": "t-b"},
        "FreezerReading": {"id": "t-r", "parent": "t-f", "tempC": -80.0},
        "WeatherHour": {"id": "t-w", "tempF": 1.0},
        "RiskScore": {"id": "t-s", "building": "t-b", "score": 10, "level": "green"},
        "ActionPlan": {"id": "t-p", "building": "t-b", "status": "pending"},
    }
    for type_name, record in samples.items():
        store.create(type_name, record)
        fetched = store.fetch(type_name, record["id"])
        assert fetched is not None and fetched["id"] == record["id"], type_name
    print("create/fetch OK")


def test_counts() -> None:
    store = Store()
    load_buildings(store)
    load_freezers(store)
    load_weather(store)
    assert store.count("Building") == 12
    assert store.count("Freezer") == 72
    assert store.count("WeatherHour") == 528
    chemistry = store.fetch("Building", "chemistry")
    assert chemistry["damaged2019"] == "true"
    assert chemistry["damageSource"] == "Wisconsin State Journal"
    assert store.fetch("Building", "birge")["damaged2019"] == "unknown"
    print("counts OK")


def test_seed() -> None:
    payload = json.loads(SEED.read_text(encoding="utf-8"))
    assert payload["summary"]["hours"] == 360
    assert len(payload["riskScores"]) == 4320
    print("first red", payload["summary"]["firstRed"])
    warm = [
        row
        for row in payload["riskScores"]
        if row["building"] == "chemistry"
        and row["timestamp"] > "2019-02-01T21:00"
        and any("trending warm" in reason for reason in row["reasons"])
    ]
    assert warm, "chemistry freezers were never flagged after the outage"
    print("warm from", warm[0]["timestamp"], "hours", len(warm), warm[0]["reasons"])
    plans = payload["plans"]
    chemistry = [plan for plan in plans if plan["building"] == "chemistry"]
    assert chemistry and all(plan["status"] == "pending" for plan in chemistry)
    plan = min(chemistry, key=lambda item: item["createdAt"])
    print("plan", plan["createdAt"], plan["steps"])
    for cites in plan["citations"]:
        for cited in cites.split("|"):
            assert cited in plan["inputIds"]
    by_building = defaultdict(list)
    for item in plans:
        by_building[item["building"]].append(
            datetime.strptime(item["createdAt"], "%Y-%m-%dT%H:%M")
        )
    for building_id, stamps in by_building.items():
        stamps.sort()
        for earlier, later in zip(stamps, stamps[1:]):
            assert (later - earlier).total_seconds() >= 24 * 3600, building_id
    print("plans", len(plans), "spacing OK")


if __name__ == "__main__":
    test_create_and_fetch()
    test_counts()
    test_seed()
    print("ALL CHECKS PASSED")
