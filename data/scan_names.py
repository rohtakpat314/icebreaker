"""Print every named building so missing targets can be matched by eye."""
import json
from pathlib import Path

data = json.loads(Path(__file__).with_name("overpass_buildings.json").read_text(encoding="utf-8"))
for el in data["elements"]:
    tags = el.get("tags", {})
    name = tags.get("name", "")
    low = name.lower()
    if any(k in low for k in ("van", "math", "discover", "institute", "orchard", "charter", "lincoln", "vleck", "wid")):
        c = el.get("center", {})
        print(f"{el['id']}\t{c.get('lat')}\t{c.get('lon')}\t{name}")
print("--- count", len(data["elements"]))
