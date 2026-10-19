"""Nominatim lookups for buildings the way-query missed."""
import json
import urllib.request

queries = [
    "Wisconsin Institutes for Discovery, Madison",
    "Discovery Building, Orchard Street, Madison, Wisconsin",
    "330 North Orchard Street, Madison, Wisconsin",
    "Van Vleck Hall, 480 Lincoln Drive, Madison",
]
for q in queries:
    url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" + urllib.request.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": "freezer-watch-prd/0.1 (educational replay)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        hits = json.load(resp)
    print("---", q, "n=", len(hits))
    for h in hits:
        print(h.get("osm_type"), h.get("osm_id"), h.get("lat"), h.get("lon"), h.get("class"), h.get("type"), h.get("display_name")[:140])
