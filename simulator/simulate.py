"""Phase 0 freezer simulator. Every temperature and dollar value it writes is SIMULATED.

WARMUP_HOURS is the empty-cabinet warm-up from -80 C to -50 C for one cited model.
Thermo Scientific TDE40086-ULTS upright: 257 minutes at a -80 C setpoint and 20 C ambient.
PDF: https://documents.thermofisher.com/TFS-Assets/LPD/brochures/tde-series-ultra-low-temperature-freezers-apac-brochure.pdf
// ASSUMPTION: one upright model stands in for all 72 simulated freezers.
"""

from __future__ import annotations

import csv
import math
import random
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

# 257 minutes. Not the 5-hour placeholder.
WARMUP_HOURS = 257 / 60
WARMUP_SOURCE = (
    "Thermo Scientific TDE Series brochure, model TDE40086-ULTS, "
    "warm-up time (-80 C to -50 C) 257 minutes, empty freezer, 20 C ambient. "
    "https://documents.thermofisher.com/TFS-Assets/LPD/brochures/tde-series-ultra-low-temperature-freezers-apac-brochure.pdf"
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

# PRD lab buildings, in listed order. vilas, grainger, and van_vleck have none.
LAB_BUILDINGS = [
    "chemistry",
    "birge",
    "biochemistry",
    "microbial",
    "discovery",
    "engineering_centers",
    "hslc",
    "msc",
    "bock",
]
VALUE_CHOICES = [50000, 150000, 400000, 1000000]
LAB_LABELS = [f"Lab {letter}" for letter in "ABCDEFGH"]

START = datetime(2019, 1, 20, 0, 0)
END_INCLUSIVE = datetime(2019, 2, 10, 23, 59)
N_MINUTES = 22 * 24 * 60  # 2019-01-20T00:00 through 2019-02-10T23:59

DEGRADE_IDS = {"bock-03", "birge-05"}
DEGRADE_START = datetime(2019, 1, 28, 0, 0)
DEGRADE_PER_DAY = 0.6

OUTAGE_IDS_PREFIX = "chemistry-"
OUTAGE_START = datetime(2019, 2, 1, 21, 0)
OUTAGE_END = datetime(2019, 2, 2, 5, 0)  # power returns; cooling starts


def write_freezers() -> list[dict]:
    """72 freezers. value_usd is drawn with random seed 42 and is ILLUSTRATIVE.

    // ASSUMPTION: irreplaceability is not seeded in the PRD, so it cycles 1..5
    by freezer number inside each building.
    """
    rng = random.Random(42)
    rows = []
    for building_id in LAB_BUILDINGS:
        for n in range(1, 9):
            rows.append(
                {
                    "freezer_id": f"{building_id}-{n:02d}",
                    "building_id": building_id,
                    "lab_label": LAB_LABELS[n - 1],
                    "target_temp_c": -80,
                    "value_usd": rng.choice(VALUE_CHOICES),
                    "irreplaceability": ((n - 1) % 5) + 1,
                }
            )
    path = DATA / "freezers.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "freezer_id",
                "building_id",
                "lab_label",
                "target_temp_c",
                "value_usd",
                "irreplaceability",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)
    return rows


def check_freezers(rows: list[dict]) -> None:
    values = {row["value_usd"] for row in rows}
    buildings = {row["building_id"] for row in rows}
    assert len(rows) == 72, len(rows)
    assert values <= set(VALUE_CHOICES), values
    assert buildings == set(LAB_BUILDINGS)
    assert "vilas" not in buildings and "grainger" not in buildings and "van_vleck" not in buildings
    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        counts[row["building_id"]] += 1
    assert all(counts[b] == 8 for b in LAB_BUILDINGS)
    print("freezers.csv OK", len(rows), "values", sorted(values))


def _separated_openings(rng: np.random.Generator, idxs: np.ndarray, n_open: int, min_gap: int) -> np.ndarray:
    """Pick n_open minute indexes at least min_gap apart. Falls back to a greedy pass."""
    if n_open <= 0:
        return np.array([], dtype=np.int64)
    for _ in range(40):
        chosen = np.sort(rng.choice(idxs, size=n_open, replace=False))
        if n_open == 1 or np.all(np.diff(chosen) >= min_gap):
            return chosen
    pool = np.sort(rng.choice(idxs, size=min(len(idxs), n_open * 8), replace=False))
    kept: list[int] = []
    for candidate in pool:
        if all(abs(int(candidate) - prev) >= min_gap for prev in kept):
            kept.append(int(candidate))
        if len(kept) == n_open:
            break
    return np.asarray(kept, dtype=np.int64)


def minute_index(times: list[datetime], stamp: datetime) -> int:
    return int((stamp - times[0]).total_seconds() // 60)


def build_times() -> list[datetime]:
    times = [START + timedelta(minutes=i) for i in range(N_MINUTES)]
    assert times[0] == START
    assert times[-1] == END_INCLUSIVE
    assert len(times) == N_MINUTES
    return times


def write_readings(freezers: list[dict], times: list[datetime]) -> dict:
    """One row per freezer per minute. Seed 42. No power-on column."""
    rng = np.random.default_rng(42)
    tau = WARMUP_HOURS / 0.3567
    # From exactly -80 C, this reaches -50 C at t = WARMUP_HOURS.
    reached = 20 + (-80 - 20) * math.exp(-WARMUP_HOURS / tau)
    print(f"WARMUP_HOURS={WARMUP_HOURS:.6f} tau={tau:.6f} T(-80 at warmup)={reached:.4f}")

    ts = [t.strftime("%Y-%m-%dT%H:%M") for t in times]
    minute = np.arange(N_MINUTES, dtype=np.float64)
    sine = 0.8 * np.sin(2 * math.pi * minute / 40)

    windows: dict[datetime.date, np.ndarray] = defaultdict(list)  # type: ignore[assignment]
    grouped: dict = defaultdict(list)
    for i, t in enumerate(times):
        # // ASSUMPTION: door window is 08:00 inclusive through 17:59, weekdays only.
        if t.weekday() < 5 and 8 <= t.hour < 18:
            grouped[t.date()].append(i)
    for day, idxs in grouped.items():
        windows[day] = np.asarray(idxs, dtype=np.int64)

    degrade_i = minute_index(times, DEGRADE_START)
    outage_i = minute_index(times, OUTAGE_START)
    recover_i = minute_index(times, OUTAGE_END)
    assert times[outage_i] == OUTAGE_START
    assert times[recover_i] == OUTAGE_END
    outage_len = recover_i - outage_i  # [21:00, 05:00): 8 hours
    assert outage_len == 8 * 60

    feb2 = np.array([t.month == 2 and t.day == 2 for t in times])

    path = DATA / "freezer_readings.csv"
    normal_min = 1e9
    normal_max = -1e9
    chemistry_feb2_max = -1e9
    chemistry_above_50 = 0
    drift_early: dict[str, list[float]] = {fid: [] for fid in DEGRADE_IDS}
    drift_late: dict[str, list[float]] = {fid: [] for fid in DEGRADE_IDS}
    rows_written = 0

    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("freezer_id,timestamp,temp_c,door_open\n")
        for spec in freezers:
            fid = spec["freezer_id"]
            # N(0, 0.3), tails redrawn into [-1.2, 1.19]. An uncapped draw plus the
            # +0.8 C sine reached -82.15 C, outside the Step 0.6 band.
            noise = rng.normal(0.0, 0.3, size=N_MINUTES)
            low, high = -1.2, 1.19
            for _ in range(6):
                mask = (noise < low) | (noise > high)
                if not np.any(mask):
                    break
                noise[mask] = rng.normal(0.0, 0.3, size=int(mask.sum()))
            np.clip(noise, low, high, out=noise)
            temp = -80.0 + sine + noise
            door = np.zeros(N_MINUTES, dtype=bool)

            # Average 3 openings per weekday. Weekends have none.
            # // ASSUMPTION: openings on the same day are at least 40 minutes apart.
            # Uncapped stacking of the +6 C pulses reached about -68 C.
            for idxs in windows.values():
                n_open = int(rng.poisson(3))
                if n_open <= 0:
                    continue
                n_open = min(n_open, max(1, len(idxs) // 40))
                chosen = _separated_openings(rng, idxs, n_open, min_gap=40)
                for open_i in chosen:
                    open_i = int(open_i)
                    door[open_i] = True
                    steps = N_MINUTES - open_i
                    decay = np.exp(-np.arange(steps, dtype=np.float64) / 4.0)
                    temp[open_i:] += 6.0 * decay

            if fid in DEGRADE_IDS:
                elapsed_days = (minute[degrade_i:] - degrade_i) / (60.0 * 24.0)
                temp[degrade_i:] += DEGRADE_PER_DAY * elapsed_days

            if fid.startswith(OUTAGE_IDS_PREFIX):
                t_start = float(temp[outage_i])
                t_hours = np.arange(outage_len, dtype=np.float64) / 60.0
                temp[outage_i:recover_i] = 20.0 + (t_start - 20.0) * np.exp(-t_hours / tau)
                door[outage_i:recover_i] = False
                # Power is back at 05:00. Cool in a straight line at 10 C per hour to -80.
                temp_now = 20.0 + (t_start - 20.0) * math.exp(-8.0 / tau)
                idx = recover_i
                while idx < N_MINUTES and temp_now > -80.0:
                    temp[idx] = temp_now
                    temp_now -= 10.0 / 60.0
                    idx += 1

            # Stats for the Step 0.6 check. Drift and outage freezers are not "normal".
            if fid not in DEGRADE_IDS and not fid.startswith(OUTAGE_IDS_PREFIX):
                normal_min = min(normal_min, float(temp.min()))
                normal_max = max(normal_max, float(temp.max()))
            if fid.startswith(OUTAGE_IDS_PREFIX):
                chemistry_feb2_max = max(chemistry_feb2_max, float(temp[feb2].max()))
                chemistry_above_50 += int(np.count_nonzero(temp[feb2] > -50.0))
            if fid in DEGRADE_IDS:
                # Day before the drift, and a day near the end of the series.
                early = (np.array([t.date() == datetime(2019, 1, 27).date() for t in times]))
                late = (np.array([t.date() == datetime(2019, 2, 9).date() for t in times]))
                drift_early[fid].append(float(temp[early].mean()))
                drift_late[fid].append(float(temp[late].mean()))

            block = []
            for i in range(N_MINUTES):
                block.append(
                    f"{fid},{ts[i]},{temp[i]:.4f},{'true' if door[i] else 'false'}\n"
                )
            f.writelines(block)
            rows_written += N_MINUTES
            print(f"wrote {fid} ({rows_written:,} rows)", flush=True)

    summary = {
        "rows": rows_written,
        "normal_min": normal_min,
        "normal_max": normal_max,
        "chemistry_feb2_max": chemistry_feb2_max,
        "chemistry_feb2_above_m50": chemistry_above_50,
        "drift_early": {k: v[0] for k, v in drift_early.items()},
        "drift_late": {k: v[0] for k, v in drift_late.items()},
    }
    return summary


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    freezers = write_freezers()
    check_freezers(freezers)
    times = build_times()
    summary = write_readings(freezers, times)
    print("SUMMARY", summary)
    assert summary["rows"] == 72 * N_MINUTES
    assert -82.0 <= summary["normal_min"] <= summary["normal_max"] <= -72.0, summary
    assert summary["chemistry_feb2_above_m50"] > 0
    for fid in DEGRADE_IDS:
        assert summary["drift_late"][fid] > summary["drift_early"][fid] + 5.0


if __name__ == "__main__":
    main()
