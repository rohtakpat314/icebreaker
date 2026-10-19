"""Independent spot check of the Phase 0 CSVs. Does not trust the simulator's own summary."""
import csv
from pathlib import Path

data = Path(r"c:\Users\rohta\icebreaker\data")

freezers = list(csv.DictReader((data / "freezers.csv").open(encoding="utf-8")))
print("freezers", len(freezers))
print("values", sorted({int(r["value_usd"]) for r in freezers}))
print("ids", freezers[0]["freezer_id"], freezers[-1]["freezer_id"])

want = {
    ("chemistry-01", "2019-02-02T02:00"),
    ("chemistry-01", "2019-02-01T20:59"),
    ("chemistry-01", "2019-02-02T05:00"),
    ("bock-03", "2019-01-27T12:00"),
    ("bock-03", "2019-02-09T12:00"),
    ("birge-05", "2019-01-27T12:00"),
    ("birge-05", "2019-02-09T12:00"),
    ("vilas-01", "2019-01-20T00:00"),
}
found = {}
rows = 0
header_ok = False
bad_power = False
with (data / "freezer_readings.csv").open(encoding="utf-8") as f:
    header = f.readline().strip()
    header_ok = header == "freezer_id,timestamp,temp_c,door_open"
    if "power" in header.lower():
        bad_power = True
    for line in f:
        rows += 1
        fid, ts, temp, door = line.rstrip("\n").split(",")
        key = (fid, ts)
        if key in want:
            found[key] = (temp, door)

print("header_ok", header_ok, "power_column", bad_power, "rows", rows)
for key in sorted(want):
    print(key, found.get(key))
print("file_bytes", (data / "freezer_readings.csv").stat().st_size)
