#!/usr/bin/env python3
"""Fetch recorded storm water levels for the Coastal Water Resilience console.

Hourly verified water level (NOAA CO-OPS product `hourly_height`) and the astronomical tide prediction
(`predictions`, hourly) at the five NOAA water-level gauges around Tampa Bay, for three storms and one calm week.
Surge (non-tidal residual) = measured - predicted. Everything is NOAA's own data; nothing is modeled here.
Writes consoles/coastal-water-resilience/data/storm-gauges.json with the request URLs and retrieval time.

Run: python3 scripts/fetch_storm_gauges.py
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "consoles" / "coastal-water-resilience" / "data" / "storm-gauges.json"
API = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
# Gulf coast to upper bay; ids, names and positions from NOAA's station list (mdapi, type=waterlevels).
GAUGES = [
    {"id": "8726724", "name": "Clearwater Beach", "lat": 27.9783, "lon": -82.8317},
    {"id": "8726384", "name": "Port Manatee", "lat": 27.6387, "lon": -82.5621},
    {"id": "8726520", "name": "St. Petersburg", "lat": 27.7606, "lon": -82.6269},
    {"id": "8726607", "name": "Old Port Tampa", "lat": 27.8578, "lon": -82.5528},
    {"id": "8726674", "name": "East Bay", "lat": 27.9231, "lon": -82.4214},
]
# UTC windows around each storm's effect on Tampa Bay, plus a calm week for comparison.
WINDOWS = [
    {"key": "idalia", "label": "Idalia (2023)", "begin": "20230827", "end": "20230901"},
    {"key": "helene", "label": "Helene (2024)", "begin": "20240924", "end": "20240929"},
    {"key": "milton", "label": "Milton (2024)", "begin": "20241007", "end": "20241012"},
    {"key": "calm", "label": "Calm week (March 2024)", "begin": "20240304", "end": "20240309"},
]


def get(product, station, begin, end):
    q = {"product": product, "station": station, "begin_date": begin, "end_date": end, "datum": "MLLW",
         "units": "english", "time_zone": "gmt", "format": "json", "application": "public_data_consoles"}
    if product == "predictions":
        q["interval"] = "h"
    url = API + "?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=60) as r:
        body = json.load(r)
    rows = body.get("data") or body.get("predictions") or []
    if not rows:
        return url, {}, body.get("error", {}).get("message", "no data")
    return url, {row["t"]: (float(row["v"]) if row.get("v") not in (None, "") else None) for row in rows}, None


def main():
    out = {"schemaVersion": 1, "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "source": "NOAA CO-OPS data API (api.tidesandcurrents.noaa.gov), products hourly_height and predictions",
           "datum": "MLLW", "units": "ft", "timeZone": "UTC", "interval": "hourly",
           "surge": "measured - predicted (non-tidal residual)", "gauges": GAUGES, "windows": []}
    for w in WINDOWS:
        series = {}
        for g in GAUGES:
            u1, obs, e1 = get("hourly_height", g["id"], w["begin"], w["end"])
            time.sleep(0.4)
            u2, pred, e2 = get("predictions", g["id"], w["begin"], w["end"])
            time.sleep(0.4)
            times = sorted(set(obs) | set(pred))
            series[g["id"]] = {"t": times, "measured": [obs.get(t) for t in times], "predicted": [pred.get(t) for t in times],
                               "requests": [u1, u2], "errors": [e for e in (e1, e2) if e]}
            print(f"{w['key']:<7} {g['id']} {g['name']:<17} measured {sum(v is not None for v in obs.values()):>4}  predicted {len(pred):>4}  {'; '.join(e for e in (e1, e2) if e)}")
        out["windows"].append({**w, "series": series})
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
