"""Filter Overpass results for the 12 Freezer Watch buildings."""
import json
from pathlib import Path

data = json.loads(Path(__file__).with_name("overpass_buildings.json").read_text(encoding="utf-8"))
needles = (
    "chem",
    "vilas",
    "grainger",
    "birge",
    "vleck",
    "biochem",
    "microb",
    "discover",
    "wid",
    "engineering center",
    "health science",
    "medical science",
    "bock",
    "deluca",
)
for el in data["elements"]:
    tags = el.get("tags", {})
    name = tags.get("name", "")
    blob = " ".join(
        [
            name,
            tags.get("alt_name", ""),
            tags.get("official_name", ""),
            tags.get("short_name", ""),
        ]
    ).lower()
    if any(n in blob for n in needles):
        c = el.get("center", {})
        start = tags.get("start_date", "")
        print(
            f"{el['id']}\t{c.get('lat')}\t{c.get('lon')}\t{name}"
            f"\talt={tags.get('alt_name','')}\tstart={start}"
        )
