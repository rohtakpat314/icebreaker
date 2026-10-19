"""Fixed risk rules for one building at one hour.

The function only sees weather and freezer readings at or before as_of.
// ASSUMPTION: the weather window is (as_of - 72h, as_of], and the current
// temperature is the WeatherHour exactly at as_of.
// ASSUMPTION: "before 1975" means yearBuilt < 1975.
// ASSUMPTION: the six hourly medians are the six clock hours ending at as_of,
// and the slope is ordinary least squares of those medians against hour index.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from statistics import median


def fmt_temp(value: float) -> str:
    rounded = round(value)
    if abs(value - rounded) < 1e-9:
        return str(int(rounded))
    return f"{value:.1f}"


def level_for(score: int) -> str:
    if score >= 70:
        return "red"
    if score >= 40:
        return "yellow"
    return "green"


def _ols_slope(points: list[tuple[int, float]]) -> float:
    if len(points) < 2:
        return 0.0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    den = sum((x - mean_x) ** 2 for x in xs)
    if den == 0:
        return 0.0
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    return num / den


def hourly_medians(readings: list[tuple[datetime, float]], as_of: datetime) -> list[tuple[int, float]]:
    """Up to six (hour_index, median) pairs in (as_of - 6h, as_of]."""
    start = as_of - timedelta(hours=6)
    window = [(ts, temp) for ts, temp in readings if start < ts <= as_of]
    points = []
    for hour_index in range(6):
        left = start + timedelta(hours=hour_index)
        right = left + timedelta(hours=1)
        temps = [temp for ts, temp in window if left < ts <= right]
        if temps:
            points.append((hour_index, float(median(temps))))
    return points


def is_flagged(points: list[tuple[int, float]]) -> bool:
    if not points:
        return False
    latest = points[-1][1]
    return latest > -70.0 or _ols_slope(points) > 0.5


def flagged_freezer_ids(
    readings_by_id: dict[str, list[tuple[datetime, float]]],
    as_of: datetime,
) -> list[str]:
    flagged = []
    for freezer_id in sorted(readings_by_id):
        if is_flagged(hourly_medians(readings_by_id[freezer_id], as_of)):
            flagged.append(freezer_id)
    return flagged


def compute_risk(
    building: dict,
    weather: list[dict],
    freezers: list[dict],
    readings_by_id: dict[str, list[tuple[datetime, float]]],
    as_of: datetime,
    medians_by_id: dict[str, list[tuple[int, float]]] | None = None,
) -> dict:
    """Score one building. weather rows after as_of are ignored.

    medians_by_id, when passed, is the already-grouped last six hourly medians.
    It must be built only from readings at or before as_of.
    """
    start = as_of - timedelta(hours=72)
    window = [row for row in weather if start < row["timestamp"] <= as_of]
    if not window:
        raise ValueError(f"no weather at or before {as_of.isoformat(timespec='minutes')}")

    temps = [float(row["tempF"]) for row in window]
    min_temp = min(temps)
    current_row = next((row for row in window if row["timestamp"] == as_of), None)
    # // ASSUMPTION: if the exact hour is missing, current temp is the latest row in the window.
    now_temp = float(current_row["tempF"]) if current_row else float(window[-1]["tempF"])

    points = 0
    reasons: list[str] = []

    if min_temp <= -15:
        points += 30
        reasons.append(f"Deep freeze: low of {fmt_temp(min_temp)}°F in last 72h")

    if min_temp <= 0 and now_temp >= 32:
        points += 30
        reasons.append(
            f"Rapid thaw: {fmt_temp(min_temp)}°F to {fmt_temp(now_temp)}°F within 72h"
        )

    if not building["onGenerator"]:
        points += 15
        reasons.append("No backup generator (assumed)")

    if int(building["yearBuilt"]) < 1975:
        points += 10
        reasons.append(f"Built {int(building['yearBuilt'])}")

    if medians_by_id is None:
        flagged = flagged_freezer_ids(readings_by_id, as_of)
    else:
        flagged = [fid for fid in sorted(medians_by_id) if is_flagged(medians_by_id[fid])]
    if flagged:
        points += 15
        reasons.append(f"{len(flagged)} freezer(s) trending warm")

    score = min(100, points)
    level = level_for(score)
    if level in ("yellow", "red"):
        dollars = float(sum(float(item["valueUsd"]) for item in freezers))
    else:
        dollars = 0.0

    return {
        "buildingId": building["id"],
        "timestamp": as_of,
        "score": score,
        "level": level,
        "dollarsAtRisk": dollars,
        "reasons": reasons,
        "flaggedFreezers": flagged,
    }
