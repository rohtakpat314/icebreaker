"""Retry Overpass for Van Vleck Hall and the Discovery Building."""
import json
import urllib.request
from pathlib import Path

query = """
[out:json][timeout:25];
way["name"="Van Vleck Hall"](43.05,-89.45,43.10,-89.38);
out center tags;
way["name"="Discovery Building"](43.05,-89.45,43.10,-89.38);
out center tags;
"""
req = urllib.request.Request(
    "https://overpass-api.de/api/interpreter",
    data=query.encode("utf-8"),
    headers={"User-Agent": "freezer-watch-prd/0.1 (educational replay)"},
)
try:
    with urllib.request.urlopen(req, timeout=40) as resp:
        data = json.load(resp)
    print("overpass elements", len(data.get("elements", [])))
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        c = el.get("center", {})
        print(el.get("id"), c.get("lat"), c.get("lon"), tags.get("name"), tags.get("start_date", ""))
    Path(__file__).with_name("overpass_missing.json").write_text(json.dumps(data), encoding="utf-8")
except Exception as exc:
    print("OVERPASS_FAIL", type(exc).__name__, exc)

# Nominatim fallback, still OpenStreetMap.
for q in ("Van Vleck Hall, Madison, Wisconsin", "Discovery Building, 330 North Orchard Street, Madison"):
    url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=" + urllib.request.quote(q)
    req2 = urllib.request.Request(url, headers={"User-Agent": "freezer-watch-prd/0.1 (educational replay)"})
    with urllib.request.urlopen(req2, timeout=30) as resp:
        hits = json.load(resp)
    print("---", q)
    for h in hits:
        print(h.get("osm_type"), h.get("osm_id"), h.get("lat"), h.get("lon"), h.get("display_name"), h.get("type"))
