"""Write buildings.csv for Step 0.2 and check the row contract."""
import csv
from pathlib import Path

# Coordinates are OpenStreetMap centers.
# // ASSUMPTION: Van Vleck Hall (relation 19576438) and the Discovery Building
# (relation 21721799, OSM name "Wisconsin Institute for Discovery") were not
# returned by the required way["building"] around:1500 query, so their centers
# come from Nominatim on those relations. Biochemistry coordinates are the OSM
# way named "DeLuca Biochemistry Building". Medical Sciences Center coordinates
# are the OSM way named "Medical Sciences". on_generator values are the PRD's
# assumed flags, not public records.
rows = [
    ["chemistry", "Chemistry Building", 43.0727150, -89.4048877, 2000,
     "UW News, 11 Sep 2000: dedicated and opened 15 Sep 2000 (https://news.wisc.edu/new-chemistry-building-opens-sept-15/)",
     "false"],
    ["vilas", "Vilas Hall", 43.0726588, -89.3997957, 1969,
     "UW Facilities building history: built 1969 (https://fpmphysicalplant.wiscweb.wisc.edu/wp-content/uploads/sites/23/2017/01/VilasHall.pdf)",
     "false"],
    ["grainger", "Grainger Hall", 43.0726830, -89.4015625, 1993,
     "Wisconsin School of Business: opened 1993 (https://business.wisc.edu/news/happy-25th-birthday-grainger-hall/)",
     "false"],
    ["birge", "Birge Hall", 43.0744005, -89.4038503, 1910,
     "Wisconsin Historical Society property HI100093 (https://www.wisconsinhistory.org/record/property/HI100093/430-lincoln-dr)",
     "false"],
    ["van_vleck", "Van Vleck Hall", 43.0748474, -89.4048878, 1961,
     "UW-Madison Libraries UWDC: built in 1961 (https://search.library.wisc.edu/digital/AFVYGANUU44T6R86)",
     "false"],
    ["biochemistry", "Biochemistry Building", 43.0738393, -89.4109129, 1912,
     "Wikipedia/NRHP: DeLuca Biochemistry Building built 1912 (https://en.wikipedia.org/wiki/DeLuca_Biochemistry_Building)",
     "true"],
    ["microbial", "Microbial Sciences Building", 43.0757848, -89.4118711, 2007,
     "UW-Madison historical timeline, 2007 (https://www.wisc.edu/about/historical-timeline/)",
     "true"],
    ["discovery", "Discovery Building (WID)", 43.0728175, -89.4080649, 2010,
     "UW News: opened 2 Dec 2010 (https://news.wisc.edu/wisconsin-institutes-for-discovery-facility-opens-on-uw-madison-campus/)",
     "true"],
    ["engineering_centers", "Engineering Centers Building", 43.0727269, -89.4134224, 2002,
     "Wisconsin Historical Society property HI160493 (https://wisconsinhistory.org/Records/Property/HI160493)",
     "true"],
    ["hslc", "Health Sciences Learning Center", 43.0775464, -89.4304566, 2004,
     "UW News: dedicated 7 May 2004 (https://news.wisc.edu/health-sciences-learning-center-dedicated/)",
     "true"],
    ["msc", "Medical Sciences Center", 43.0747849, -89.4067418, 1924,
     "UW SMPH: Wisconsin General Hospital opened 1924, now Medical Sciences Center (https://www.med.wisc.edu/news/uw-surgery-turns-100/)",
     "true"],
    ["bock", "Bock Laboratories", 43.0748593, -89.4111304, 1967,
     "Bock Laboratories history: completed 1967 (https://bocklabs.wisc.edu/history/)",
     "false"],
]

out = Path(__file__).with_name("buildings.csv")
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["building_id", "name", "latitude", "longitude", "year_built", "year_built_source", "on_generator"])
    w.writerows(rows)

with out.open(encoding="utf-8") as f:
    loaded = list(csv.DictReader(f))
print("rows", len(loaded))
blank = []
for r in loaded:
    if not r["latitude"] or not r["longitude"] or not r["year_built"] or not r["year_built_source"].strip():
        blank.append(r["building_id"])
    lat = float(r["latitude"])
    lon = float(r["longitude"])
    year = int(r["year_built"])
    assert 43.06 < lat < 43.09, r
    assert -89.44 < lon < -89.39, r
    assert 1800 < year < 2020, r
    print(f"{r['building_id']}\t{year}\t{r['on_generator']}\t{r['latitude']},{r['longitude']}")
print("blank_or_unsourced", blank)
