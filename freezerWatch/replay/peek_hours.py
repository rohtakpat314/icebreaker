import json
from pathlib import Path

payload = json.loads(Path(r"c:\Users\rohta\icebreaker\freezerWatch\seed\replay.json").read_text(encoding="utf-8"))
for stamp in ("2019-01-30T09:00", "2019-02-01T22:00", "2019-02-02T09:00", "2019-02-03T12:00"):
    rows = [row for row in payload["riskScores"] if row["timestamp"] == stamp]
    rows.sort(key=lambda row: -row["score"])
    print("==", stamp)
    for row in rows:
        print(
            f"  {row['level']:6} {row['score']:3} {row['dollarsAtRisk']:10.0f} "
            f"{row['building']:22} {row['reasons']}"
        )
print("PLANS")
for plan in sorted(payload["plans"], key=lambda item: (item["createdAt"], item["rank"])):
    print(plan["rank"], plan["status"], plan["building"], plan["createdAt"])
