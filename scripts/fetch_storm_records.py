#!/usr/bin/env python3
"""Fetch the official storm records that go with the recorded storm windows of the Coastal Water Resilience console.

1. Best tracks: the National Hurricane Center's HURDAT2 Atlantic file (the reanalyzed official record; the newest file
   listed at https://www.nhc.noaa.gov/data/hurdat/ is used and its URL recorded). Every 6-hourly fix of Idalia (AL102023),
   Helene (AL092024) and Milton (AL142024): UTC time, record mark (L = landfall), status, latitude, longitude, maximum
   sustained wind (kt) and minimum pressure (mb).
2. Weather alerts: the Iowa Environmental Mesonet archive of National Weather Service watches and warnings (VTEC), at
   the NOAA St. Petersburg gauge (8726520), for each storm window and the calm week used by the gauge snapshot.
Everything is the sources' own record; nothing is modeled. Writes consoles/coastal-water-resilience/data/storm-records.json
with the request URLs and retrieval time.

Run: python3 -I scripts/fetch_storm_records.py
"""
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "consoles" / "coastal-water-resilience" / "data" / "storm-records.json"
UA = {"User-Agent": "public-data-consoles (keyless public-data fetch)"}
HURDAT_DIR = "https://www.nhc.noaa.gov/data/hurdat/"
IEM = "https://mesonet.agron.iastate.edu/json/vtec_events_bypoint.py"
GAUGE = {"id": "8726520", "name": "St. Petersburg", "lat": 27.7606, "lon": -82.6269}
STORMS = {"idalia": "AL102023", "helene": "AL092024", "milton": "AL142024"}
# Same windows as scripts/fetch_storm_gauges.py (UTC dates, inclusive).
WINDOWS = [("idalia", "2023-08-27", "2023-09-01"), ("helene", "2024-09-24", "2024-09-29"),
           ("milton", "2024-10-07", "2024-10-12"), ("calm", "2024-03-04", "2024-03-09")]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read().decode("utf-8", "replace")


def coord(text):
    v = float(text[:-1])
    return -v if text[-1] in "SW" else v


def main():
    requests = []
    listing = get(HURDAT_DIR); requests.append(HURDAT_DIR)
    names = sorted(set(re.findall(r"hurdat2-1851-(\d{4})-(\d{6,8})\.txt", listing)))
    if not names:
        raise SystemExit("No HURDAT2 file listed")
    def released(n):  # release stamps are MMDDYY or MMDDYYYY
        s = n[1]; return (int(s[4:]) if len(s) == 8 else 2000 + int(s[4:]), int(s[:2]), int(s[2:4]))
    newest = max(names, key=lambda n: (int(n[0]), released(n)))
    hurdat_url = f"{HURDAT_DIR}hurdat2-1851-{newest[0]}-{newest[1]}.txt"
    text = get(hurdat_url); requests.append(hurdat_url)
    tracks, current = {}, None
    for line in text.splitlines():
        cells = [c.strip() for c in line.split(",")]
        if re.fullmatch(r"AL\d{6}", cells[0]):
            current = cells[0] if cells[0] in STORMS.values() else None
            if current:
                tracks[current] = {"id": current, "name": cells[1], "fixes": []}
        elif current:
            t = datetime.strptime(cells[0] + cells[1], "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
            tracks[current]["fixes"].append({"t": t.isoformat().replace("+00:00", "Z"), "mark": cells[2] or None, "status": cells[3],
                                             "lat": coord(cells[4]), "lon": coord(cells[5]), "windKt": int(cells[6]),
                                             "pressureMb": int(cells[7]) if int(cells[7]) > 0 else None})
    missing = [k for k, v in STORMS.items() if v not in tracks]
    if missing:
        raise SystemExit(f"Storms not in {hurdat_url}: {missing}")
    alerts = {}
    for key, begin, end in WINDOWS:
        q = {"lat": GAUGE["lat"], "lon": GAUGE["lon"], "sdate": begin, "edate": end}
        url = IEM + "?" + urllib.parse.urlencode(q)
        events = json.loads(get(url)).get("events", []); requests.append(url)
        alerts[key] = [{k: e.get(k) for k in ("name", "phenomena", "significance", "wfo", "ugc", "eventid", "issue", "expire")}
                       | {"url": "https://mesonet.agron.iastate.edu" + e["url"] if e.get("url") else None} for e in events]
        print(f"{key:<7} alerts at the St. Petersburg gauge: {len(alerts[key])}")
        time.sleep(0.5)
    out = {"schemaVersion": 1, "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "sources": ["National Hurricane Center HURDAT2 Atlantic best-track file (" + hurdat_url.rsplit("/", 1)[1] + ")",
                       "Iowa Environmental Mesonet archive of National Weather Service VTEC watches and warnings"],
           "point": GAUGE, "windows": [{"key": k, "begin": b, "end": e} for k, b, e in WINDOWS], "requests": requests,
           "storms": {k: tracks[v] for k, v in STORMS.items()}, "alerts": alerts}
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    for k, v in STORMS.items():
        fx = tracks[v]["fixes"]
        print(f"{k:<7} {v} {tracks[v]['name']}: {len(fx)} fixes, landfall marks {sum(f['mark'] == 'L' for f in fx)}, peak {max(f['windKt'] for f in fx)} kt")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB) from {hurdat_url}")


if __name__ == "__main__":
    main()
