"""Hand-made inputs for each risk rule. No CSV and no network."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from risk_rules import compute_risk, hourly_medians


AS_OF = datetime(2019, 2, 1, 12, 0)


def weather(*pairs: tuple[int, float]) -> list[dict]:
    """pairs are (hours before as_of, temp F). Negative hours are in the future and must be ignored."""
    rows = []
    for hours, temp in pairs:
        rows.append({"timestamp": AS_OF - timedelta(hours=hours), "tempF": temp, "precipIn": 0})
    return rows


def building(**overrides) -> dict:
    base = {"id": "test", "onGenerator": True, "yearBuilt": 2000}
    base.update(overrides)
    return base


class RiskRuleTests(unittest.TestCase):
    def test_deep_freeze_only(self):
        result = compute_risk(
            building(),
            weather((0, 0), (10, -20), (80, -40)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 30)
        self.assertEqual(result["level"], "green")
        self.assertEqual(result["dollarsAtRisk"], 0)
        self.assertEqual(result["reasons"], ["Deep freeze: low of -20°F in last 72h"])

    def test_rapid_thaw_without_deep_freeze(self):
        result = compute_risk(
            building(),
            weather((0, 33), (5, -5)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 30)
        self.assertEqual(result["reasons"], ["Rapid thaw: -5°F to 33°F within 72h"])

    def test_deep_freeze_and_rapid_thaw_and_age_is_red(self):
        result = compute_risk(
            building(yearBuilt=1910),
            weather((0, 34), (6, -20)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 70)
        self.assertEqual(result["level"], "red")
        self.assertIn("Built 1910", result["reasons"])

    def test_no_generator(self):
        result = compute_risk(
            building(onGenerator=False),
            weather((0, 40), (1, 41)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 15)
        self.assertEqual(result["level"], "green")
        self.assertEqual(result["reasons"], ["No backup generator (assumed)"])

    def test_older_building(self):
        result = compute_risk(
            building(yearBuilt=1974),
            weather((0, 40)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 10)
        self.assertEqual(result["reasons"], ["Built 1974"])

    def test_year_1975_is_not_older(self):
        result = compute_risk(
            building(yearBuilt=1975),
            weather((0, 40)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 0)
        self.assertEqual(result["reasons"], [])

    def test_building_with_no_freezers_still_scores(self):
        result = compute_risk(
            building(onGenerator=False, yearBuilt=1910),
            weather((0, 10), (3, -20)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 55)
        self.assertEqual(result["level"], "yellow")
        self.assertEqual(result["dollarsAtRisk"], 0)
        self.assertEqual(result["flaggedFreezers"], [])

    def test_freezer_flagged_when_latest_median_above_minus_70(self):
        readings = []
        for minute in range(1, 6 * 60 + 1):
            readings.append((AS_OF - timedelta(minutes=6 * 60 - minute), -60.0))
        result = compute_risk(
            building(),
            weather((0, 40)),
            [{"id": "lab-01", "valueUsd": 50000}],
            {"lab-01": readings},
            AS_OF,
        )
        self.assertEqual(result["flaggedFreezers"], ["lab-01"])
        self.assertIn("1 freezer(s) trending warm", result["reasons"])
        self.assertEqual(result["score"], 15)

    def test_slope_flags_even_when_median_is_still_cold(self):
        # Six hourly medians climbing 1 C each hour, latest still -75.
        readings = []
        for hour in range(6):
            temp = -80.0 + hour
            for minute in range(1, 61):
                ts = AS_OF - timedelta(hours=6 - hour) + timedelta(minutes=minute)
                readings.append((ts, temp))
        result = compute_risk(
            building(),
            weather((0, 40)),
            [{"id": "lab-01", "valueUsd": 400000}],
            {"lab-01": readings},
            AS_OF,
        )
        self.assertEqual(result["flaggedFreezers"], ["lab-01"])

    def test_door_spike_does_not_flag(self):
        readings = []
        for minute in range(1, 6 * 60 + 1):
            ts = AS_OF - timedelta(minutes=6 * 60 - minute)
            temp = -40.0 if minute == 30 else -80.0
            readings.append((ts, temp))
        medians = hourly_medians(readings, AS_OF)
        self.assertTrue(all(value < -70 for _, value in medians))
        result = compute_risk(
            building(),
            weather((0, 40)),
            [{"id": "lab-01", "valueUsd": 50000}],
            {"lab-01": readings},
            AS_OF,
        )
        self.assertEqual(result["flaggedFreezers"], [])
        self.assertEqual(result["score"], 0)

    def test_future_weather_is_ignored(self):
        result = compute_risk(
            building(),
            weather((0, 40), (-5, -30)),
            [],
            {},
            AS_OF,
        )
        self.assertEqual(result["score"], 0)
        self.assertEqual(result["reasons"], [])

    def test_dollars_only_when_yellow_or_red(self):
        freezers = [
            {"id": "lab-01", "valueUsd": 50000},
            {"id": "lab-02", "valueUsd": 150000},
        ]
        green = compute_risk(building(), weather((0, -20)), freezers, {}, AS_OF)
        self.assertEqual(green["level"], "green")
        self.assertEqual(green["dollarsAtRisk"], 0)

        yellow = compute_risk(
            building(onGenerator=False, yearBuilt=1910),
            weather((0, 10), (2, -20)),
            freezers,
            {},
            AS_OF,
        )
        self.assertEqual(yellow["level"], "yellow")
        self.assertEqual(yellow["dollarsAtRisk"], 200000)

    def test_score_caps_at_100(self):
        readings = [(AS_OF - timedelta(minutes=30), -50.0)]
        result = compute_risk(
            building(onGenerator=False, yearBuilt=1910),
            weather((0, 40), (2, -20)),
            [{"id": "lab-01", "valueUsd": 1000000}],
            {"lab-01": readings},
            AS_OF,
        )
        # 30 deep freeze + 15 generator + 10 age + 15 freezer = 70, not all rules.
        # Add rapid thaw by setting current to 33 and min to -20: 30+30+15+10+15 = 100.
        result = compute_risk(
            building(onGenerator=False, yearBuilt=1910),
            weather((0, 33), (2, -20)),
            [{"id": "lab-01", "valueUsd": 1000000}],
            {"lab-01": readings},
            AS_OF,
        )
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["level"], "red")
        self.assertEqual(result["dollarsAtRisk"], 1000000)


if __name__ == "__main__":
    unittest.main()
