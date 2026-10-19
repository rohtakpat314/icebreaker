"""One-off Overpass fetch for Step 0.2. Not part of the app."""
import json
import urllib.request
from pathlib import Path

query = """
[out:json][timeout:60];
way["building"]["name"](around:1500,43.0766,-89.4125);
out center tags;
"""
req = urllib.request.Request(
    "https://overpass-api.de/api/interpreter",
    data=query.encode("utf-8"),
    headers={"User-Agent": "freezer-watch-prd/0.1 (educational replay)"},
)
with urllib.request.urlopen(req, timeout=90) as resp:
    data = json.load(resp)

out = Path(__file__).with_name("overpass_buildings.json")
out.write_text(json.dumps(data), encoding="utf-8")
print("elements", len(data.get("elements", [])))
for el in data.get("elements", []):
    tags = el.get("tags", {})
    name = tags.get("name", "")
    center = el.get("center", {})
    print(f"{el.get('id')}\t{center.get('lat')}\t{center.get('lon')}\t{name}")
