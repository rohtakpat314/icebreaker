"""Load the Phase 0 CSVs and run the replay.

C3 data integration is file source to canonical to target type. A connected
studio runs that pipeline. This loader does the same merge locally.
// NOTE: no C3 runtime is installed here, so counts are checked in-process.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

from risk_rules import compute_risk

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT.parent / "data"
SEED = ROOT / "seed"

N_MINUTES = 22 * 24 * 60
ORIGIN = datetime(2019, 1, 20, 0, 0)
REPLAY_START = datetime(2019, 1, 25, 0, 0)
REPLAY_END = datetime(2019, 2, 8, 23, 0)

DAMAGE_SOURCE_URL = (
    "https://madison.com/wsj/news/local/education/university/"
    "flooding-damages-uw-madison-s-vilas-hall-and-chemistry-building/"
    "article_eb933384-3461-5cf5-a10c-92e71eb36689.html"
)


def parse_ts(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M")


def iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M")


class Store:
    """In-memory stand-in for the six persistable types."""

    def __init__(self) -> None:
        self.records: dict[str, dict] = {
            "Building": {},
            "Freezer": {},
            "FreezerReading": {},
            "WeatherHour": {},
            "RiskScore": {},
            "ActionPlan": {},
        }
        self.temps: np.ndarray | None = None
        self.freezer_order: list[str] = []
        self.medians: np.ndarray | None = None

    def create(self, type_name: str, record: dict) -> dict:
        row = dict(record)
        if not row.get("id"):
            row["id"] = f"{type_name}-{len(self.records[type_name]) + 1}"
        self.records[type_name][row["id"]] = row
        return row

    def fetch(self, type_name: str, record_id: str) -> dict | None:
        return self.records[type_name].get(record_id)

    def count(self, type_name: str) -> int:
        if type_name == "FreezerReading" and self.temps is not None:
            return int(self.temps.size)
        return len(self.records[type_name])


def load_buildings(store: Store) -> None:
    validation = {}
    with (DATA / "validation_2019.csv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            validation[row["building_id"]] = row
    with (DATA / "buildings.csv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            damage = validation.get(row["building_id"])
            store.create(
                "Building",
                {
                    "id": row["building_id"],
                    "name": row["name"],
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "yearBuilt": int(row["year_built"]),
                    "yearBuiltSource": row["year_built_source"],
                    "onGenerator": row["on_generator"].strip().lower() == "true",
                    "damaged2019": "true" if damage else "unknown",
                    "damageType": damage["damage_type"] if damage else "",
                    "damageSource": "Wisconsin State Journal" if damage else "",
                    "damageSourceUrl": DAMAGE_SOURCE_URL if damage else "",
                },
            )


def load_freezers(store: Store) -> None:
    with (DATA / "freezers.csv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            store.create(
                "Freezer",
                {
                    "id": row["freezer_id"],
                    "building": row["building_id"],
                    "labLabel": row["lab_label"],
                    "targetTempC": float(row["target_temp_c"]),
                    "valueUsd": int(row["value_usd"]),
                    "irreplaceability": int(row["irreplaceability"]),
                    "illustrative": True,
                },
            )
    store.freezer_order = list(store.records["Freezer"])


def load_weather(store: Store) -> None:
    with (DATA / "weather_hourly.csv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            stamp = row["timestamp"]
            store.create(
                "WeatherHour",
                {
                    "id": stamp,
                    "parent": "campus",
                    "timestamp": parse_ts(stamp),
                    "tempF": float(row["temp_f"]),
                    "precipIn": float(row["precip_in"]),
                    "origin": "observed",
                },
            )


def load_readings(store: Store) -> None:
    order = store.freezer_order
    temps = np.empty((len(order), N_MINUTES), dtype=np.float32)
    path = DATA / "freezer_readings.csv"
    with path.open(encoding="utf-8") as handle:
        header = handle.readline().strip()
        if header != "freezer_id,timestamp,temp_c,door_open":
            raise ValueError(header)
        for index, freezer_id in enumerate(order):
            for minute in range(N_MINUTES):
                line = handle.readline()
                if not line:
                    raise ValueError("readings ended early")
                fid, _stamp, temp, _door = line.rstrip("\n").split(",")
                if fid != freezer_id:
                    raise ValueError(f"expected {freezer_id} got {fid}")
                temps[index, minute] = float(temp)
            if index % 18 == 0:
                print(f"loaded readings {index + 1}/{len(order)}", flush=True)
        if handle.readline():
            raise ValueError("readings file has extra rows")
    store.temps = temps
    store.create(
        "FreezerReading",
        {
            "id": f"{order[0]}|{iso(ORIGIN)}",
            "parent": order[0],
            "timestamp": ORIGIN,
            "tempC": float(temps[0, 0]),
            "doorOpen": False,
        },
    )
    hour_count = N_MINUTES // 60
    medians = np.full((len(order), hour_count), np.nan, dtype=np.float32)
    for hour in range(1, hour_count):
        end = hour * 60
        medians[:, hour] = np.median(temps[:, end - 59 : end + 1], axis=1)
    store.medians = medians


def weather_rows(store: Store) -> list[dict]:
    return sorted(store.records["WeatherHour"].values(), key=lambda row: row["timestamp"])


def freezers_for(store: Store, building_id: str) -> list[dict]:
    return [row for row in store.records["Freezer"].values() if row["building"] == building_id]


def median_points(store: Store, freezer_id: str, as_of: datetime) -> list[tuple[int, float]]:
    hour = int((as_of - ORIGIN).total_seconds() // 3600)
    index = store.freezer_order.index(freezer_id)
    points = []
    for back in range(5, -1, -1):
        key = hour - back
        if key < 1 or key >= store.medians.shape[1]:
            continue
        value = store.medians[index, key]
        if np.isnan(value):
            continue
        points.append((5 - back, float(value)))
    return points


def risk_key(building_id: str, stamp: str) -> str:
    # '~' keeps the id free of the '|' used to join a step's citations.
    return f"{building_id}~{stamp}"


def upsert_risk(store: Store, result: dict) -> dict:
    stamp = iso(result["timestamp"])
    record = {
        "id": risk_key(result["buildingId"], stamp),
        "building": result["buildingId"],
        "timestamp": result["timestamp"],
        "score": result["score"],
        "level": result["level"],
        "dollarsAtRisk": result["dollarsAtRisk"],
        "reasons": list(result["reasons"]),
        "flaggedFreezers": list(result["flaggedFreezers"]),
    }
    store.records["RiskScore"][record["id"]] = record
    return record


def run_risk_agent(store: Store, as_of: datetime) -> list[dict]:
    rows = weather_rows(store)
    saved = []
    for building in store.records["Building"].values():
        freezers = freezers_for(store, building["id"])
        medians = {item["id"]: median_points(store, item["id"], as_of) for item in freezers}
        result = compute_risk(
            {
                "id": building["id"],
                "onGenerator": building["onGenerator"],
                "yearBuilt": building["yearBuilt"],
            },
            rows,
            freezers,
            {},
            as_of,
            medians_by_id=medians,
        )
        saved.append(upsert_risk(store, result))
    return saved


def latest_median(store: Store, freezer_id: str, as_of: datetime) -> float | None:
    points = median_points(store, freezer_id, as_of)
    if not points:
        return None
    return points[-1][1]


def allowed_ids(payload: dict) -> set[str]:
    found = {payload["building"]["id"], payload["riskScore"]["id"]}
    found.update(item["id"] for item in payload["flaggedFreezers"])
    found.update(item["id"] for item in payload["backupBuildings"])
    return found


def build_plan_input(store: Store, risk: dict) -> dict:
    building = store.fetch("Building", risk["building"])
    flagged = []
    for freezer_id in risk["flaggedFreezers"]:
        freezer = store.fetch("Freezer", freezer_id)
        median = latest_median(store, freezer_id, risk["timestamp"])
        flagged.append(
            {
                "id": freezer_id,
                "labLabel": freezer["labLabel"],
                "latestHourlyMedianTempC": None if median is None else round(median, 2),
                "valueUsd": freezer["valueUsd"],
                "irreplaceability": freezer["irreplaceability"],
            }
        )
    backups = []
    for candidate in store.records["Building"].values():
        if not candidate["onGenerator"]:
            continue
        same_hour = store.fetch("RiskScore", risk_key(candidate["id"], iso(risk["timestamp"])))
        if same_hour and same_hour["level"] == "green":
            backups.append({"id": candidate["id"], "name": candidate["name"]})
    return {
        "building": {
            "id": building["id"],
            "name": building["name"],
            "onGenerator": building["onGenerator"],
        },
        "riskScore": {
            "id": risk["id"],
            "score": risk["score"],
            "level": risk["level"],
            "reasons": list(risk["reasons"]),
        },
        "flaggedFreezers": flagged,
        "backupBuildings": backups,
    }


def validate_steps(raw_steps: list, allowed: set[str]) -> list[dict]:
    kept = []
    for step in raw_steps:
        if not isinstance(step, dict):
            continue
        text = str(step.get("text", "")).strip()
        citations = [str(item) for item in step.get("citations", []) if str(item).strip()]
        if not text or not citations:
            continue
        if any(citation not in allowed for citation in citations):
            continue
        kept.append({"text": text, "citations": citations})
    return kept[:5]


def fallback_step(payload: dict) -> dict:
    building = payload["building"]
    flagged_ids = [item["id"] for item in payload["flaggedFreezers"]]
    backups = payload["backupBuildings"]
    # // ASSUMPTION: if no backup building is green, the move names no destination
    # and the step cites only ids present in the input.
    citations = [building["id"], payload["riskScore"]["id"], *flagged_ids]
    if backups and flagged_ids:
        target = backups[0]
        text = (
            f"Move freezers {', '.join(flagged_ids)} to {target['id']}; "
            f"inspect {building['id']} for frozen or burst pipes."
        )
        citations.append(target["id"])
    elif flagged_ids:
        text = (
            f"Move freezers {', '.join(flagged_ids)}; "
            f"inspect {building['id']} for frozen or burst pipes."
        )
    else:
        text = f"Inspect {building['id']} for frozen or burst pipes."
    return {"text": text, "citations": citations}


def generate_plan(store: Store, risk_id: str) -> dict:
    risk = store.fetch("RiskScore", risk_id)
    if risk is None:
        raise KeyError(risk_id)
    payload = build_plan_input(store, risk)
    allowed = allowed_ids(payload)
    # // NOTE: C3 LLM calls are not configured here. An empty model response
    # fails validation, so the required fallback is what gets stored.
    steps = validate_steps([], allowed)
    if not steps:
        steps = [fallback_step(payload)]
    for step in steps:
        if any(citation not in allowed for citation in step["citations"]):
            raise ValueError("step cited an id outside the input")
    max_irreplaceability = max(
        (item["irreplaceability"] for item in payload["flaggedFreezers"]),
        default=0,
    )
    plan = {
        "id": f"plan~{risk['building']}~{iso(risk['timestamp'])}",
        "building": risk["building"],
        "createdAt": risk["timestamp"],
        "riskScore": risk["id"],
        "steps": [step["text"] for step in steps],
        "citations": ["|".join(step["citations"]) for step in steps],
        "status": "pending",
        "decidedBy": "",
        "decidedAt": None,
        "rank": 0,
        "maxIrreplaceability": max_irreplaceability,
        "inputIds": sorted(allowed),
    }
    store.records["ActionPlan"][plan["id"]] = plan
    return plan


def recent_plan(store: Store, building_id: str, as_of: datetime) -> bool:
    window_start = as_of - timedelta(hours=24)
    for plan in store.records["ActionPlan"].values():
        if plan["building"] != building_id:
            continue
        if plan["status"] not in ("pending", "approved"):
            continue
        if window_start < plan["createdAt"] <= as_of:
            return True
    return False


def rank_pending(store: Store) -> None:
    pending = [plan for plan in store.records["ActionPlan"].values() if plan["status"] == "pending"]
    pending.sort(
        key=lambda plan: (
            -float(store.fetch("RiskScore", plan["riskScore"])["dollarsAtRisk"]),
            -int(plan["maxIrreplaceability"]),
            plan["building"],
            iso(plan["createdAt"]),
        )
    )
    for index, plan in enumerate(pending, start=1):
        plan["rank"] = index


def run_supervisor(store: Store, as_of: datetime) -> list[dict]:
    scores = run_risk_agent(store, as_of)
    for score in scores:
        if score["level"] != "red":
            continue
        if recent_plan(store, score["building"], as_of):
            continue
        generate_plan(store, score["id"])
    rank_pending(store)
    return scores


def replay(store: Store) -> dict:
    cursor = REPLAY_START
    hours = 0
    while cursor <= REPLAY_END:
        run_supervisor(store, cursor)
        hours += 1
        if hours % 24 == 0:
            print(f"replay {iso(cursor)}", flush=True)
        cursor += timedelta(hours=1)
    first_red = {}
    for building_id in ("chemistry", "vilas", "grainger"):
        stamps = [
            row["timestamp"]
            for row in store.records["RiskScore"].values()
            if row["building"] == building_id and row["level"] == "red"
        ]
        first_red[building_id] = iso(min(stamps)) if stamps else None
    return {"hours": hours, "riskScores": len(store.records["RiskScore"]), "firstRed": first_red}


def series(store: Store, freezer_id: str, as_of: datetime, hours: int = 48) -> list[dict]:
    index = store.freezer_order.index(freezer_id)
    end = int((as_of - ORIGIN).total_seconds() // 60)
    start = max(0, end - hours * 60)
    points = []
    for minute in range(start, end + 1):
        points.append(
            {
                "timestamp": iso(ORIGIN + timedelta(minutes=minute)),
                "tempC": round(float(store.temps[index, minute]), 2),
            }
        )
    return points


def build() -> tuple[Store, dict]:
    store = Store()
    print("loading buildings, freezers, weather", flush=True)
    load_buildings(store)
    load_freezers(store)
    load_weather(store)
    print("loading readings", flush=True)
    load_readings(store)
    print("replay", flush=True)
    summary = replay(store)
    print("REPLAY", summary, "plans", len(store.records["ActionPlan"]), flush=True)
    return store, summary


def dump_seed(store: Store, summary: dict) -> None:
    SEED.mkdir(parents=True, exist_ok=True)
    risks = []
    for row in store.records["RiskScore"].values():
        risks.append(
            {
                "id": row["id"],
                "building": row["building"],
                "timestamp": iso(row["timestamp"]),
                "score": row["score"],
                "level": row["level"],
                "dollarsAtRisk": row["dollarsAtRisk"],
                "reasons": row["reasons"],
                "flaggedFreezers": row["flaggedFreezers"],
            }
        )
    plans = []
    for row in store.records["ActionPlan"].values():
        plans.append(
            {
                "id": row["id"],
                "building": row["building"],
                "createdAt": iso(row["createdAt"]),
                "riskScore": row["riskScore"],
                "steps": row["steps"],
                "citations": row["citations"],
                "status": row["status"],
                "decidedBy": row["decidedBy"],
                "decidedAt": None,
                "rank": row["rank"],
                "maxIrreplaceability": row["maxIrreplaceability"],
                "inputIds": row["inputIds"],
            }
        )
    payload = {"summary": summary, "riskScores": risks, "plans": plans}
    (SEED / "replay.json").write_text(json.dumps(payload), encoding="utf-8")
    np.savez_compressed(
        SEED / "temps.npz",
        temps=store.temps,
        order=np.array(store.freezer_order),
    )
    print("wrote seed", flush=True)


if __name__ == "__main__":
    loaded, summary = build()
    dump_seed(loaded, summary)
