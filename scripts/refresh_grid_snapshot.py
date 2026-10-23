#!/usr/bin/env python3
"""Refresh the grid console and same-origin JSON from official keyless EIA CSVs.

Default: discover published periods from EIA's file inventory. Scheduled use:
  python3 scripts/refresh_grid_snapshot.py --automated --github-output "$GITHUB_OUTPUT"
Archived replay remains supported with --files DIR --period 2026_Jul_Dec
--captured-at ISO_TIMESTAMP. DIR contains balance.csv/interchange.csv and optional
balance.headers/interchange.headers. Only raw reported measurements are used.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import functools
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE_BASE = "https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/"
MANIFEST_URL = SOURCE_BASE + "EIA930_File_List_Meta.csv"
TIME_COLUMN = "UTC Time at End of Hour"
KINDS = ("BALANCE", "INTERCHANGE")
FILE_PATTERN = re.compile(r"EIA930_(BALANCE|INTERCHANGE)_(\d{4})_(Jan_Jun|Jul_Dec)\.csv")
SNAPSHOT_PATTERN = re.compile(r'(<script type="application/json" id="grid-snapshot">)(.*?)(</script>)', re.S)
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


class SourceUnavailable(ValueError):
    """A published/new-period URL has no usable observations yet."""


def capture_time(value: str) -> dt.datetime:
    stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("Capture timestamp must include its UTC offset")
    return stamp.astimezone(dt.timezone.utc)


@functools.lru_cache(maxsize=None)
def parse_time(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%m/%d/%Y %I:%M:%S %p").replace(tzinfo=dt.timezone.utc)


def number(value: str) -> int | float | None:
    if not value.strip():
        return None
    n = float(value.replace(",", ""))
    if not math.isfinite(n):
        raise ValueError("Nonfinite EIA measurement")
    return int(n) if n.is_integer() else n


def hour(value: dt.datetime) -> str:
    return value.strftime("%Y-%m-%dT%H")


def period_time(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%Y-%m-%dT%H").replace(tzinfo=dt.timezone.utc)


def period_start(period: str) -> dt.datetime:
    year, half = period.split("_", 1)
    return dt.datetime(int(year), 1 if half == "Jan_Jun" else 7, 1, tzinfo=dt.timezone.utc)


def source_urls(period: str) -> list[str]:
    if not re.fullmatch(r"\d{4}_(Jan_Jun|Jul_Dec)", period):
        raise ValueError("Period must have the form 2026_Jul_Dec")
    return [SOURCE_BASE + f"EIA930_{kind}_{period}.csv" for kind in KINDS]


def source_identity(url: str) -> dict:
    match = FILE_PATTERN.fullmatch(url.rsplit("/", 1)[-1])
    if not match or url != SOURCE_BASE + match[0]:
        raise ValueError("Unexpected EIA source URL")
    return {"kind": match[1], "period": match[2] + "_" + match[3], "url": url}


def parse_manifest(text: str, captured_at: str) -> dict[str, list[dict]]:
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")), strict=True)
    if not {"FILENAME", "DESCRIPTION", "YEAR", "MONTHS"}.issubset(reader.fieldnames or []):
        raise ValueError("EIA file inventory columns changed")
    available = {kind: {} for kind in KINDS}
    captured = capture_time(captured_at)
    for row in reader:
        if row.get("DESCRIPTION") not in KINDS:
            continue
        entry = source_identity(SOURCE_BASE + row["FILENAME"])
        if entry["kind"] != row["DESCRIPTION"] or entry["period"] != row["YEAR"] + "_" + row["MONTHS"]:
            raise ValueError("Inconsistent EIA file inventory entry")
        # Published future-period placeholders cannot contain completed observations yet.
        if period_start(entry["period"]) <= captured:
            available[entry["kind"]][entry["period"]] = entry
    result = {kind: sorted(entries.values(), key=lambda e: period_start(e["period"]), reverse=True)
              for kind, entries in available.items()}
    if not all(result.values()):
        raise ValueError("EIA inventory has no published balance/interchange pair")
    return result


def request(url: str):
    return urlopen(Request(url, headers={"User-Agent": "public-data-consoles-snapshot-refresh/1.0 (+https://github.com/patrickiben/public-data-consoles)"}), timeout=30)


def download_source(entry: dict, directory: Path) -> dict:
    path = directory / entry["url"].rsplit("/", 1)[-1]
    try:
        with request(entry["url"]) as response:
            content_type = response.headers.get("Content-Type", "").lower()
            if "html" in content_type:
                raise SourceUnavailable("EIA returned an HTML soft404 instead of CSV")
            content = response.read()
            expected = response.headers.get("Content-Length")
            if expected and len(content) != int(expected):
                raise ValueError("Truncated EIA download (Content-Length mismatch)")
            modified = response.headers.get("Last-Modified")
    except HTTPError as error:
        if error.code in (404, 410):
            raise SourceUnavailable(f"EIA source unavailable (HTTP {error.code})") from error
        raise
    if not content.strip() or content.lstrip().startswith(b"<"):
        raise SourceUnavailable("EIA returned an empty/HTML source instead of CSV")
    path.write_bytes(content)
    return {**entry, "path": path, "lastModified": modified,
            "sha256": hashlib.sha256(content).hexdigest()}


def iter_measurements(path: Path, kind: str, captured_at: str, *, require_fuel=False):
    captured = capture_time(captured_at)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        if handle.read(256).lstrip().startswith("<"):
            raise SourceUnavailable("EIA returned an HTML soft404 instead of CSV")
        handle.seek(0)
        reader = csv.DictReader(handle, strict=True)
        required = {"Balancing Authority", TIME_COLUMN}
        if kind == "BALANCE":
            required.update(METRICS.values())
            if require_fuel:
                required.update("Net Generation (MW) from " + col for cols in FUEL_COLUMNS.values() for col in cols)
        else:
            required.update({"Directly Interconnected Balancing Authority", "Interchange (MW)"})
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"EIA {kind.lower()} columns changed; no output was written")
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError("Truncated or malformed EIA CSV row")
            code = row["Balancing Authority"].strip()
            if not re.fullmatch(r"[A-Z][A-Z0-9]{1,9}", code):
                raise ValueError("Invalid balancing-authority identifier")
            stamp = parse_time(row[TIME_COLUMN])
            result = {"code": code, "stamp": stamp, "period": hour(stamp)}
            if kind == "BALANCE":
                values = {key: number(row[col]) for key, col in METRICS.items()}
                mix = {}
                for key, columns in FUEL_COLUMNS.items():
                    reported = [number(row.get("Net Generation (MW) from " + col, "")) for col in columns]
                    reported = [v for v in reported if v is not None]
                    if reported:
                        mix[key] = sum(reported)
                actual = any(values[k] is not None for k in ("D", "NG", "TI")) or bool(mix)
                if actual and stamp > captured:
                    raise ValueError("Future timestamp in measured EIA balance data")
                # Day-ahead forecasts are allowed to extend beyond capture time.
                if stamp > captured + dt.timedelta(days=3):
                    raise ValueError("Implausibly future EIA forecast timestamp")
                result.update(values=values, mix=mix)
            else:
                target = row["Directly Interconnected Balancing Authority"].strip()
                if not re.fullmatch(r"[A-Z][A-Z0-9]{1,9}", target):
                    raise ValueError("Invalid interconnected-authority identifier")
                value = number(row["Interchange (MW)"])
                if value is not None and stamp > captured:
                    raise ValueError("Future timestamp in measured EIA interchange data")
                result.update(target=target, value=value)
            yield result


def scan_source(source: dict, captured_at: str, *, require_fuel=False) -> dict:
    first, last, count = None, None, 0
    for row in iter_measurements(source["path"], source["kind"], captured_at, require_fuel=require_fuel and source["kind"] == "BALANCE"):
        value = row["values"]["D"] if source["kind"] == "BALANCE" else row["value"]
        if value is not None:
            first = row["stamp"] if first is None else min(first, row["stamp"])
            last = row["stamp"] if last is None else max(last, row["stamp"])
            count += 1
    if not count:
        raise SourceUnavailable(f"No measured EIA {source['kind'].lower()} rows in published file")
    return {"first": first, "last": last, "count": count}


def discover_sources(directory: Path, captured_at: str, *, period=None, automated=False) -> tuple[dict, list[dict]]:
    with request(MANIFEST_URL) as response:
        manifest = parse_manifest(response.read().decode("utf-8-sig"), captured_at)
    if period:
        urls = source_urls(period)
        for kind, url in zip(KINDS, urls):
            exact = source_identity(url)
            older = [e for e in manifest[kind] if period_start(e["period"]) < period_start(period)]
            manifest[kind] = [exact, *older]
    selected, latest_stats = {}, {}
    for kind in KINDS:
        # A just-created half-year export may be a soft404/empty placeholder.
        # Trying at most its predecessor prevents walking/downloading years of archives.
        failures = []
        for entry in manifest[kind][:2]:
            try:
                source = download_source(entry, directory)
                stats = scan_source(source, captured_at, require_fuel=automated)
            except SourceUnavailable as error:
                failures.append(str(error))
                continue
            selected[kind] = [source]
            latest_stats[kind] = stats
            break
        else:
            raise ValueError(f"No usable recent EIA {kind.lower()} file: {'; '.join(failures)}")
    through = latest_stats["BALANCE"]["last"]
    cutoff = through - dt.timedelta(days=7)
    for kind in KINDS:
        newest = selected[kind][0]
        # Local BA reporting dates spill into the next UTC date. Include a full
        # extra boundary day, rather than treating half-year filenames as UTC cuts.
        needs_previous = (cutoff < period_start(newest["period"]) + dt.timedelta(days=1)
                          or latest_stats[kind]["first"] > cutoff + dt.timedelta(hours=1))
        if needs_previous:
            older = [e for e in manifest[kind] if period_start(e["period"]) < period_start(newest["period"])]
            if not older:
                raise ValueError("Previous EIA period missing; cannot construct the seven-day window")
            previous = download_source(older[0], directory)
            scan_source(previous, captured_at, require_fuel=automated)
            selected[kind].append(previous)
    # Keep latest balance/interchange first for existing consumers; then window sources.
    ordered = [selected[kind][0] for kind in KINDS]
    ordered += [s for kind in KINDS for s in selected[kind][1:]]
    paths = {kind: [source["path"] for source in selected[kind]] for kind in KINDS}
    sources = [{key: value for key, value in source.items() if key != "path"} for source in ordered]
    return paths, sources


def paths(value) -> list[Path]:
    return [Path(value)] if isinstance(value, (str, Path)) else [Path(p) for p in value]


def build_snapshot(balance, interchange, captured_at: str, sources: list[dict], *, automated=False) -> dict:
    balance_paths, interchange_paths = paths(balance), paths(interchange)
    through = None
    for path in balance_paths:
        for row in iter_measurements(path, "BALANCE", captured_at, require_fuel=automated):
            if row["values"]["D"] is not None:
                through = row["stamp"] if through is None else max(through, row["stamp"])
    if through is None:
        raise ValueError("No measured EIA demand: refusing to replace the existing snapshot")
    cutoff = through - dt.timedelta(days=7)
    observations = {}
    for path in balance_paths:
        for row in iter_measurements(path, "BALANCE", captured_at, require_fuel=automated):
            if not cutoff < row["stamp"] <= through:
                continue
            key = row["code"], row["period"]
            if key in observations:
                # Adjacent exports can contain the same UTC hour. Identical rows
                # are harmless; conflicting copies need source review, not summing.
                if observations[key] != row:
                    raise ValueError("Conflicting duplicate EIA balance observation")
            else:
                observations[key] = row
    latest_demand, history, fuel = {}, {}, {}
    for row in observations.values():
        code, stamp = row["code"], row["period"]
        demand = row["values"]["D"]
        if demand is not None:
            history.setdefault(code, []).append([stamp, demand])
            if code not in latest_demand or stamp > latest_demand[code]["period"]:
                latest_demand[code] = row
        if row["mix"] and (code not in fuel or stamp > fuel[code][0]):
            fuel[code] = [stamp, row["mix"]]
    snap = []
    for code, row in latest_demand.items():
        for kind, value in row["values"].items():
            if value is not None:
                snap.append([code, kind, row["period"], value])
    for series in history.values():
        series.sort(reverse=True)
    all_edges = {}
    for path in interchange_paths:
        for row in iter_measurements(path, "INTERCHANGE", captured_at):
            if not cutoff < row["stamp"] <= through or row["value"] is None:
                continue
            key = row["code"], row["target"], row["period"]
            value = row["value"]
            if key in all_edges and all_edges[key] != value:
                raise ValueError("Conflicting duplicate EIA interchange observation")
            all_edges[key] = value
    edges = {}
    for (source, target, stamp), value in sorted(all_edges.items(), key=lambda item: item[0][2], reverse=True):
        edges.setdefault((source, target), [source, target, value, stamp])
    if not edges:
        raise ValueError("No measured EIA interchange: refusing to replace the existing snapshot")
    data = {
        "schemaVersion": 1, "refreshEveryHours": 6, "capturedAt": captured_at, "demandThrough": hour(through),
        "interchangeThrough": max(e[3] for e in edges.values()),
        "historyStart": hour(cutoff + dt.timedelta(hours=1)),
        "generatedBy": "scripts/refresh_grid_snapshot.py", "sources": sources,
        "snap": sorted(snap, key=lambda r: (r[2], r[0], r[1]), reverse=True),
        "history": dict(sorted(history.items())), "fuel": dict(sorted(fuel.items())),
        "interchange": sorted(edges.values(), key=lambda r: (r[3], r[0], r[1]), reverse=True),
    }
    return data


def validate_candidate(data: dict, existing: dict, *, automated=False) -> None:
    captured = capture_time(data["capturedAt"])
    through, edge_through = period_time(data["demandThrough"]), period_time(data["interchangeThrough"])
    if max(through, edge_through) > captured:
        raise ValueError("Future snapshot measurement timestamp")
    observed = [period_time(p) for series in data["history"].values() for p, value in series]
    if automated and (through - min(observed) < dt.timedelta(hours=167)):
        raise ValueError("Incomplete seven-day demand history; preserving last good snapshot")
    if automated and max(captured - through, captured - edge_through) > dt.timedelta(days=7):
        raise ValueError("EIA measurements are over seven days old; preserving last good snapshot")
    if not existing.get("history"):
        return
    if captured < capture_time(existing["capturedAt"]):
        raise ValueError("Capture timestamp regressed")
    for field in ("demandThrough", "interchangeThrough"):
        if period_time(data[field]) < period_time(existing[field]):
            raise ValueError(f"{field} regressed; preserving last good snapshot")
    boundary = data["historyStart"]
    for code, series in existing["history"].items():
        if max(p for p, _ in series) >= boundary and code not in data["history"]:
            raise ValueError(f"Missing still-current BA report for {code}")
    current_pairs = {(source, target): stamp for source, target, value, stamp in data["interchange"]}
    for source, target, value, stamp in existing.get("interchange", []):
        if stamp >= boundary:
            if (source, target) not in current_pairs:
                raise ValueError(f"Missing still-current interchange pair {source}>{target}")
            if current_pairs[(source, target)] < stamp:
                raise ValueError(f"Interchange timestamp regressed for {source}>{target}")
    # Integrity thresholds guard truncation, not the scientific pressure calculation.
    for key, fraction in (("history", 0.9), ("fuel", 0.9), ("interchange", 0.8)):
        if len(data[key]) < math.ceil(fraction * len(existing.get(key, []))):
            raise ValueError(f"EIA {key} coverage collapsed; preserving last good snapshot")
    old_count = sum(map(len, existing["history"].values()))
    if sum(map(len, data["history"].values())) < math.ceil(0.8 * old_count):
        raise ValueError("EIA demand history truncated; preserving last good snapshot")
    for code in data["history"].keys() & existing["history"].keys():
        old, new = existing["history"][code], data["history"][code]
        if max(p for p, _ in new) < max(p for p, _ in old):
            raise ValueError(f"Demand timestamp regressed for {code}")
        if len(new) < math.ceil(0.8 * len(old)):
            raise ValueError(f"Demand history truncated for {code}")
    old_dates = [period_time(p) for series in existing["history"].values() for p, value in series]
    required_span = min(max(old_dates) - min(old_dates), dt.timedelta(hours=167))
    if through - min(observed) < required_span:
        raise ValueError("Demand historical window truncated")


def encode_snapshot(data: dict) -> str:
    """Keep one BA/edge per line without expanding thousands of observations."""
    compact = lambda value: json.dumps(value, ensure_ascii=True, separators=(",", ":"), allow_nan=False).replace("<", "\\u003c")
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


def stable_payload(data: dict) -> dict:
    result = {key: value for key, value in data.items() if key != "capturedAt"}
    # A server touching identical bytes does not renew the observations' capture.
    result["sources"] = [{key: value for key, value in source.items() if key != "lastModified"}
                         for source in data.get("sources", [])]
    return result


def atomic_outputs(changes: dict[Path, bytes]) -> None:
    """Stage every output first; atomic file replacements roll back on write errors."""
    staged, before, modes, replaced = {}, {}, {}, []
    try:
        for target, content in changes.items():
            before[target] = target.read_bytes() if target.exists() else None
            modes[target] = target.stat().st_mode & 0o777 if target.exists() else 0o644
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix="." + target.name + ".", delete=False) as handle:
                staged[target] = Path(handle.name)
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(staged[target], modes[target])
        for target, temp in staged.items():
            os.replace(temp, target)
            replaced.append(target)
    except BaseException:
        for target in reversed(replaced):
            if before[target] is None:
                target.unlink(missing_ok=True)
            else:
                with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".rollback.", delete=False) as handle:
                    handle.write(before[target])
                    handle.flush()
                    os.fsync(handle.fileno())
                    rollback = Path(handle.name)
                os.chmod(rollback, modes[target])
                os.replace(rollback, target)
        raise
    finally:
        for temp in staged.values():
            temp.unlink(missing_ok=True)


def publish_snapshot(data: dict, output: Path, *, json_output=None, automated=False) -> tuple[dict, bool]:
    html = output.read_text()
    matches = list(SNAPSHOT_PATTERN.finditer(html))
    if len(matches) != 1:
        raise ValueError("Expected exactly one grid-snapshot element; no file was written")
    existing = json.loads(matches[0][2])
    if not isinstance(existing, dict):
        raise ValueError("Existing embedded snapshot must be a JSON object")
    validate_candidate(data, existing, automated=automated)
    same = stable_payload(data) == stable_payload(existing)
    if same:
        data = existing  # Preserve capture/provenance, including the original Last-Modified.
    json_output = Path(json_output) if json_output else output.parent / "data/latest.json"
    if json_output.resolve() == output.resolve():
        raise ValueError("HTML and JSON output paths must differ")
    changes = {}
    if not same:
        updated = SNAPSHOT_PATTERN.sub(lambda m: m[1] + "\n" + encode_snapshot(data) + "\n" + m[3], html)
        changes[output] = updated.encode()
    try:
        synchronized = json.loads(json_output.read_text()) == data
    except (FileNotFoundError, ValueError):
        synchronized = False
    if not synchronized:
        changes[json_output] = (encode_snapshot(data) + "\n").encode()
    if changes:
        atomic_outputs(changes)
    return data, bool(changes)


def refresh(directory: Path, urls: list[str], captured_at: str, output: Path, *, automated=False, json_output=None) -> dict:
    sources = []
    for name, url in zip(["balance", "interchange"], urls):
        file = directory / (name + ".csv")
        header_file = directory / (name + ".headers")
        modified = None
        if header_file.exists():
            modified = next((line.split(":", 1)[1].strip() for line in header_file.read_text().splitlines() if line.lower().startswith("last-modified:")), None)
        sources.append({**source_identity(url), "lastModified": modified, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
    data = build_snapshot(directory / "balance.csv", directory / "interchange.csv", captured_at, sources, automated=automated)
    return publish_snapshot(data, output, json_output=json_output, automated=automated)[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    now = dt.datetime.now(dt.timezone.utc)
    parser.add_argument("--period", help="Explicit archive period, e.g. 2026_Jul_Dec; default discovers published periods")
    parser.add_argument("--files", type=Path, help="Use archived balance.csv/interchange.csv instead of downloading")
    parser.add_argument("--captured-at", default=now.isoformat(timespec="seconds"), help="Original capture time when replaying an archive")
    parser.add_argument("--output", type=Path, default=ROOT / "consoles/us-grid-strain/index.html")
    parser.add_argument("--json-output", type=Path, help="Default: data/latest.json beside output HTML")
    parser.add_argument("--automated", action="store_true", help="Enforce strict completeness and freshness validation")
    parser.add_argument("--github-output", type=Path, help="Append changed/measurement timestamps for GitHub Actions")
    args = parser.parse_args()
    captured = capture_time(args.captured_at)
    if args.automated and captured > now + dt.timedelta(minutes=5):
        raise ValueError("Capture timestamp is in the future")
    if args.period:
        source_urls(args.period)
    json_output = args.json_output or args.output.parent / "data/latest.json"
    targets = (args.output, json_output)
    before = [p.read_bytes() if p.exists() else None for p in targets]
    if args.files:
        period = args.period or f"{captured.year}_" + ("Jan_Jun" if captured.month < 7 else "Jul_Dec")
        data = refresh(args.files, source_urls(period), args.captured_at, args.output, automated=args.automated, json_output=json_output)
    else:
        with tempfile.TemporaryDirectory(prefix="eia-grid-snapshot-") as temp:
            selected, sources = discover_sources(Path(temp), args.captured_at, period=args.period, automated=args.automated)
            data = build_snapshot(selected["BALANCE"], selected["INTERCHANGE"], args.captured_at, sources, automated=args.automated)
            data, _ = publish_snapshot(data, args.output, json_output=json_output, automated=args.automated)
    changed = before != [p.read_bytes() if p.exists() else None for p in targets]
    result = {"changed": changed, "demand_through": data["demandThrough"], "interchange_through": data["interchangeThrough"], "captured_at": data["capturedAt"]}
    if args.github_output:
        with args.github_output.open("a") as handle:
            for key in ("changed", "demand_through", "interchange_through"):
                value = str(result[key]).lower() if isinstance(result[key], bool) else result[key]
                handle.write(f"{key}={value}\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
