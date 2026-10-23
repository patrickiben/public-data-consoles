#!/usr/bin/env python3
"""Refresh the single-file grid console from EIA's public, keyless CSV downloads.

Run from any directory: python3 scripts/refresh_grid_snapshot.py
For an exact archived capture, supply --files DIR (balance.csv, interchange.csv,
and optional balance.headers/interchange.headers) and --captured-at ISO_TIMESTAMP.
Only raw reported values are used; imputed/adjusted columns are never substituted.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import functools
import hashlib
import json
from pathlib import Path
import re
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TIME_COLUMN = "UTC Time at End of Hour"
METRICS = {"D": "Demand (MW)", "DF": "Demand Forecast (MW)",
           "NG": "Net Generation (MW)", "TI": "Total Interchange (MW)"}
FUEL_COLUMNS = {
    "COL": ["Coal"], "NG": ["Natural Gas"], "NUC": ["Nuclear"],
    "OIL": ["All Petroleum Products"], "WAT": ["Hydropower Excluding Pumped Storage"],
    "PS": ["Pumped Storage"],
    "SUN": ["Solar without Integrated Battery Storage", "Solar with Integrated Battery Storage"],
    "WND": ["Wind without Integrated Battery Storage", "Wind with Integrated Battery Storage"],
    "BAT": ["Battery Storage"], "GEO": ["Geothermal"],
    "OTH": ["Other Energy Storage", "Unknown Energy Storage", "Other Fuel Sources", "Unknown Fuel Sources"],
}


@functools.lru_cache(maxsize=None)
def parse_time(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%m/%d/%Y %I:%M:%S %p").replace(tzinfo=dt.timezone.utc)


def number(value: str) -> int | float | None:
    if not value.strip():
        return None
    n = float(value.replace(",", ""))
    if not float("-inf") < n < float("inf"):
        raise ValueError("Nonfinite EIA measurement")
    return int(n) if n.is_integer() else n


def hour(value: dt.datetime) -> str:
    return value.strftime("%Y-%m-%dT%H")


def build_snapshot(balance: Path, interchange: Path, captured_at: str, sources: list[dict]) -> dict:
    with balance.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Balancing Authority", TIME_COLUMN, *METRICS.values()}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("EIA balance columns changed; inspect the source before refreshing")
        rows = list(reader)
    demand_rows = [r for r in rows if r[METRICS["D"]].strip()]
    if not demand_rows:
        raise ValueError("No measured EIA demand: refusing to replace the existing snapshot")
    through = max(parse_time(r[TIME_COLUMN]) for r in demand_rows)
    cutoff = through - dt.timedelta(days=7)
    latest_demand, history, fuel = {}, {}, {}
    for row in rows:
        stamp = parse_time(row[TIME_COLUMN])
        if not cutoff < stamp <= through:
            continue
        code, period = row["Balancing Authority"], hour(stamp)
        demand = number(row[METRICS["D"]])
        if demand is not None:
            history.setdefault(code, []).append([period, demand])
            if code not in latest_demand or period > latest_demand[code][0]:
                latest_demand[code] = (period, row)
        mix = {}
        for kind, columns in FUEL_COLUMNS.items():
            values = [number(row.get("Net Generation (MW) from " + col, "")) for col in columns]
            reported = [v for v in values if v is not None]
            if reported:
                mix[kind] = sum(reported)
        if mix and (code not in fuel or period > fuel[code][0]):
            fuel[code] = [period, mix]
    snap = []
    for code, (period, row) in latest_demand.items():
        # Forecasts extend into future hours. Match all metrics to actual-demand time.
        for kind, column in METRICS.items():
            value = number(row[column])
            if value is not None:
                snap.append([code, kind, period, value])
    for observations in history.values():
        observations.sort(reverse=True)
    edges = {}
    with interchange.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Balancing Authority", "Directly Interconnected Balancing Authority", TIME_COLUMN, "Interchange (MW)"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("EIA interchange columns changed; inspect the source before refreshing")
        for row in reader:
            stamp = parse_time(row[TIME_COLUMN])
            if not cutoff < stamp <= through:
                continue
            value = number(row["Interchange (MW)"])
            if value is None:
                continue
            source, target, period = row["Balancing Authority"], row["Directly Interconnected Balancing Authority"], hour(stamp)
            key = source + ">" + target
            if key not in edges or period > edges[key][3]:
                edges[key] = [source, target, value, period]
    if not edges:
        raise ValueError("No measured EIA interchange: refusing to replace the existing snapshot")
    return {
        "capturedAt": captured_at, "demandThrough": hour(through),
        "interchangeThrough": max(e[3] for e in edges.values()),
        "historyStart": hour(cutoff + dt.timedelta(hours=1)),
        "generatedBy": "scripts/refresh_grid_snapshot.py", "sources": sources,
        "snap": sorted(snap, key=lambda r: r[2], reverse=True), "history": history,
        "fuel": fuel, "interchange": sorted(edges.values(), key=lambda r: r[3], reverse=True),
    }


def encode_snapshot(data: dict) -> str:
    """Keep one BA/edge per line for review, without expanding 9,000 observations."""
    compact = lambda value: json.dumps(value, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")
    lines = ["{"]
    for i, (key, value) in enumerate(data.items()):
        prefix = "  " + json.dumps(key) + ":"
        comma = "," if i < len(data) - 1 else ""
        if isinstance(value, list):
            lines.append(prefix + "[")
            lines.extend("    " + compact(item) + ("," if j < len(value) - 1 else "") for j, item in enumerate(value))
            lines.append("  ]" + comma)
        elif isinstance(value, dict):
            lines.append(prefix + "{")
            lines.extend("    " + json.dumps(k) + ":" + compact(v) + ("," if j < len(value) - 1 else "") for j, (k, v) in enumerate(value.items()))
            lines.append("  }" + comma)
        else:
            lines.append(prefix + compact(value) + comma)
    return "\n".join(lines + ["}"])


def source_urls(period: str) -> list[str]:
    return [f"https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_{kind}_{period}.csv" for kind in ["BALANCE", "INTERCHANGE"]]


def refresh(directory: Path, urls: list[str], captured_at: str, output: Path) -> dict:
    sources = []
    for name, url in zip(["balance", "interchange"], urls):
        file = directory / (name + ".csv")
        header_file = directory / (name + ".headers")
        modified = None
        if header_file.exists():
            modified = next((line.split(":", 1)[1].strip() for line in header_file.read_text().splitlines() if line.lower().startswith("last-modified:")), None)
        sources.append({"url": url, "lastModified": modified, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
    data = build_snapshot(directory / "balance.csv", directory / "interchange.csv", captured_at, sources)
    html = output.read_text()
    pattern = r'(<script type="application/json" id="grid-snapshot">).*?(</script>)'
    if len(re.findall(pattern, html, re.S)) != 1:
        raise ValueError("Expected exactly one grid-snapshot element; no file was written")
    html = re.sub(pattern, lambda match: match[1] + "\n" + encode_snapshot(data) + "\n" + match[2], html, flags=re.S)
    output.write_text(html)
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    now = dt.datetime.now(dt.timezone.utc)
    parser.add_argument("--period", default=f"{now.year}_" + ("Jan_Jun" if now.month < 7 else "Jul_Dec"), help="Official six-month CSV period, e.g. 2026_Jul_Dec")
    parser.add_argument("--files", type=Path, help="Read archived balance.csv/interchange.csv instead of downloading")
    parser.add_argument("--captured-at", default=now.isoformat(timespec="seconds"), help="Capture timestamp (use original timestamp only when replaying an archive)")
    parser.add_argument("--output", type=Path, default=ROOT / "consoles/us-grid-strain/index.html")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}_(Jan_Jun|Jul_Dec)", args.period):
        parser.error("--period must have the form 2026_Jul_Dec")
    dt.datetime.fromisoformat(args.captured_at)
    urls = source_urls(args.period)
    if args.files:
        data = refresh(args.files, urls, args.captured_at, args.output)
    else:
        with tempfile.TemporaryDirectory(prefix="eia-grid-snapshot-") as temp:
            directory = Path(temp)
            for name, url in zip(["balance", "interchange"], urls):
                request = Request(url, headers={"User-Agent": "public-data-consoles-snapshot-refresh/1.0 (+https://github.com/patrickiben/public-data-consoles)"})
                with urlopen(request, timeout=30) as response:
                    (directory / (name + ".csv")).write_bytes(response.read())
                    (directory / (name + ".headers")).write_text(str(response.headers))
            data = refresh(directory, urls, args.captured_at, args.output)
    print(f"Embedded {len(data['history'])} measured BA demand series through {data['demandThrough']} UTC; {len(data['interchange'])} interchange edges. Captured {data['capturedAt']}.")


if __name__ == "__main__":
    main()
