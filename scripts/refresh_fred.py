#!/usr/bin/env python3
"""Refresh only the embedded FRED snapshot from complete official CSV downloads.

No market prices, CAPE, algorithms or forecast rules are changed. All CSVs and
outputs are validated in memory before writing. Source files are not published;
their URLs, retrieval date and SHA-256 hashes accompany the embedded snapshot.
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

EPOCH = dt.date(2000, 1, 1)
SAMPLED = {"T10Y2Y", "T10Y3M", "DFII10", "T10YIE"}
MACRO = re.compile(r"^(?:const|let) MACRO = (.*);$", re.M)
META = re.compile(r"^(?:const|let) FRED_META = (.*);$", re.M)
MAX_CSV_BYTES = 8 * 1024 * 1024


def validate_series(series):
    if not series:
        raise ValueError("No FRED series found")
    for sid, item in series.items():
        dates, values = item["d"], item["v"]
        if (not dates or len(dates) != len(values)
                or any(isinstance(d, bool) or not isinstance(d, int) for d in dates)
                or any(a >= b for a, b in zip(dates, dates[1:]))
                or any(isinstance(v, bool) or not isinstance(v, (int, float))
                       or not math.isfinite(v) for v in values)):
            raise ValueError(f"Invalid embedded dates/values: {sid}")


def validate_payload(payload, baseline=None, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    if any(type(payload.get(key)) is not int or payload[key] != value for key, value in
           [("schemaVersion", 1), ("schema_version", 1), ("refreshEveryHours", 24)]) or payload.get("epoch") != EPOCH.isoformat():
        raise ValueError("Unsupported FRED payload metadata")
    retrieved = dt.date.fromisoformat(payload["retrieved_on"])
    captured = dt.datetime.fromisoformat(payload["capturedAt"].replace("Z", "+00:00"))
    if captured.tzinfo is None or captured.date() != retrieved or retrieved > now.date() or captured > now + dt.timedelta(minutes=5):
        raise ValueError("FRED capture/retrieval date is invalid or in the future")
    series = payload["series"]
    validate_series(series)
    if baseline is not None and set(series) != set(baseline):
        raise ValueError("FRED series coverage changed")
    sources = payload.get("sources")
    if not isinstance(sources, list) or len(sources) != len(series):
        raise ValueError("FRED provenance coverage changed")
    seen = set()
    for source in sources:
        sid = source["series"]
        if sid in seen or sid not in series:
            raise ValueError("Duplicate/unknown FRED provenance series")
        seen.add(sid)
        item = series[sid]
        if source.get("url") != f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}" or not re.fullmatch(r"[0-9a-f]{64}", source.get("csv_sha256", "")):
            raise ValueError("Invalid official FRED provenance URL/hash")
        iso = lambda day: (EPOCH + dt.timedelta(days=day)).isoformat()
        first, last = dt.date.fromisoformat(source["source_first"]), dt.date.fromisoformat(source["source_last"])
        if first > last or last > retrieved or source["retrieved_on"] != retrieved.isoformat() or item["d"][-1] > (retrieved - EPOCH).days or item["d"][-1] > (last - EPOCH).days:
            raise ValueError("Invalid FRED source/retrieval periods")
        if source["embedded_first"] != iso(item["d"][0]) or source["embedded_last"] != iso(item["d"][-1]) or source["embedded_points"] != len(item["d"]) or source["sample_every"] != (5 if sid in SAMPLED else 1):
            raise ValueError("FRED source/series shape mismatch")
        if source["retained_pre_source_points"] != sum(day < (first - EPOCH).days for day in item["d"]):
            raise ValueError("FRED retained-history count mismatch")
        if baseline is not None:
            prior = baseline[sid]
            if item.get("name") != prior.get("name") or item.get("unit") != prior.get("unit") or item["d"][0] != prior["d"][0] or not set(prior["d"]) <= set(item["d"]):
                raise ValueError("FRED identity/units or historical coverage changed")
    return payload


def read_csv_bytes(raw, sid, label=None):
    label = label or sid + ".csv"
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_CSV_BYTES:
        raise ValueError(f"{label}: expected nonempty bounded CSV bytes")
    rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    fields = rows.fieldnames or []
    date_col = next((name for name in fields if name.lower() in ("date", "observation_date")), None)
    if date_col is None or sid not in fields:
        raise ValueError(f"{label}: expected date and {sid} columns")
    values, previous = {}, None
    for row in rows:
        day = (dt.date.fromisoformat(row[date_col]) - EPOCH).days
        if previous is not None and day <= previous:
            raise ValueError(f"{label}: dates must be strictly increasing")
        previous = day
        text = row[sid]
        if text in ("", "."):
            continue
        value = float(text)
        if not math.isfinite(value):
            raise ValueError(f"{label}: non-finite value")
        values[day] = value / (1000 if sid == "ICSA" else 1)
    if not values:
        raise ValueError(f"{label}: no finite observations")
    return values, hashlib.sha256(raw).hexdigest()


def read_csv(path, sid):
    return read_csv_bytes(path.read_bytes(), sid, path.name)


def fetch_csv(url):
    """Public graph CSV download; never use credentials or a third-party proxy."""
    # Keep urllib's ordinary transport identity: custom User-Agent strings can
    # stall FRED's public download edge even when its standard clients work.
    request = Request(url, headers={"Accept": "text/csv"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                parsed = urlparse(response.geturl())
                if parsed.scheme != "https" or parsed.hostname != "fred.stlouisfed.org" or parsed.username or parsed.password:
                    raise ValueError("FRED CSV redirected outside its official HTTPS origin")
                raw = response.read(MAX_CSV_BYTES + 1)
            break
        except HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                raise
        except (TimeoutError, URLError, ConnectionError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)
    if not raw or len(raw) > MAX_CSV_BYTES:
        raise ValueError("FRED CSV is empty or exceeds the download limit")
    return raw


def refresh_series(baseline, csv_dir, retrieved):
    validate_series(baseline)
    refreshed, sources = {}, []
    for sid, item in baseline.items():
        if not re.fullmatch(r"[A-Z0-9]+", sid):
            raise ValueError("Invalid pinned FRED series identifier")
        official, digest = (read_csv_bytes(csv_dir[sid], sid) if isinstance(csv_dir, dict)
                            else read_csv(csv_dir / f"{sid}.csv", sid))
        old = dict(zip(item["d"], item["v"]))
        if max(official) > (retrieved - EPOCH).days:
            raise ValueError(f"{sid}: observations occur after the stated retrieval date")
        if max(official) < max(old):
            raise ValueError(f"{sid}: source ends before the existing snapshot")
        first = item["d"][0]
        eligible = {d: v for d, v in official.items() if d >= first}
        if not eligible:
            raise ValueError(f"{sid}: CSV does not reach the pinned history")
        if sid in SAMPLED:
            dates = sorted(eligible)[::5]
            if not set(old) <= set(dates):
                raise ValueError(f"{sid}: original every-fifth sampling dates would shift or disappear")
            merged = {d: eligible[d] for d in dates}
        else:
            # Only pre-window observations may be retained. An interior deletion or
            # a stale tail needs review, rather than silently reusing an old value.
            if any(d >= min(official) for d in set(old) - set(eligible)):
                raise ValueError(f"{sid}: previously embedded observations disappeared inside the source window")
            # Preserve old ICE history when the official endpoint's window is shorter.
            merged = {**old, **eligible}
            dates = sorted(merged)
        if dates[0] != first:
            raise ValueError(f"{sid}: pinned start changed")
        refreshed[sid] = {**item, "d": dates, "v": [merged[d] for d in dates]}
        iso = lambda day: (EPOCH + dt.timedelta(days=day)).isoformat()
        sources.append({
            "series": sid,
            "url": f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}",
            "retrieved_on": retrieved.isoformat(), "csv_sha256": digest,
            "source_first": iso(min(official)), "source_last": iso(max(official)),
            "embedded_first": iso(dates[0]), "embedded_last": iso(dates[-1]),
            "embedded_points": len(dates), "sample_every": 5 if sid in SAMPLED else 1,
            "retained_pre_source_points": sum(d < min(official) for d in dates),
        })
    validate_series(refreshed)
    if baseline.keys() != refreshed.keys():
        raise ValueError("Series keys changed")
    return refreshed, sources


def replace_one(pattern, replacement, text):
    result, count = re.subn(pattern, lambda _: replacement, text, flags=re.M)
    if count != 1:
        raise ValueError(f"Expected exactly one snapshot label: {pattern}")
    return result


def snapshot_text(metadata, series):
    # Keep provenance readable and each numeric series on one diff-friendly line.
    prefix = json.dumps(metadata, indent=2)[:-2]
    lines = [json.dumps(sid) + ":" + json.dumps(item, separators=(",", ":"), allow_nan=False)
             for sid, item in series.items()]
    return prefix + ',\n  "series": {\n    ' + ',\n    '.join(lines) + '\n  }\n}\n'


def refresh_repository(root, csv_dir, retrieved, *, automatic=False, fetch=fetch_csv):
    folder = root / "consoles/resilience-telemetry"
    index, wiki, snapshot = folder / "index.html", folder / "wiki.html", folder / "data/fred_snapshot.json"
    original, guide = index.read_text(), wiki.read_text()
    baseline = json.loads(MACRO.search(original).group(1))
    if snapshot.exists() and json.loads(snapshot.read_text())["series"] != baseline:
        raise ValueError("Snapshot JSON and embedded MACRO disagree; reconcile before refreshing")
    saved = json.loads(snapshot.read_text()) if snapshot.exists() else None
    if saved:
        embedded_metadata = META.findall(original)
        if len(embedded_metadata) != 1 or json.loads(embedded_metadata[0]) != {k: v for k, v in saved.items() if k != "series"}:
            raise ValueError("Snapshot JSON and embedded metadata disagree; reconcile before refreshing")
    if automatic:
        csv_dir = {}
        for sid in baseline:
            try:
                csv_dir[sid] = fetch(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}")
            except Exception as error:
                raise RuntimeError(f"Official FRED download failed for {sid}; published files retained") from error
    series, sources = refresh_series(baseline, csv_dir, retrieved)
    metadata = {"schemaVersion": 1, "schema_version": 1, "refreshEveryHours": 24,
                "retrieved_on": retrieved.isoformat(), "epoch": EPOCH.isoformat(),
                "capturedAt": (dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z") if automatic else retrieved.isoformat() + "T00:00:00Z"),
                "scope": "Published FRED macro data only; market prices, CAPE and algorithms unchanged.", "sources": sources}
    # Rechecking the same measurements/provenance must not create a new capture.
    def substantive(value):
        if isinstance(value, dict):
            return {k: substantive(v) for k, v in value.items() if k not in {"retrieved_on", "capturedAt"}}
        if isinstance(value, list):
            return [substantive(v) for v in value]
        return value
    candidate = {**metadata, "series": series}
    validate_payload(candidate, baseline)
    if saved and substantive(candidate) == substantive(saved):
        print("FRED measurements and provenance unchanged; existing retrieval date preserved")
        return False
    output = MACRO.sub(lambda _: "let MACRO = " + json.dumps(series, separators=(",", ":"), allow_nan=False) + ";", original)
    meta_line = "let FRED_META = " + json.dumps(metadata, separators=(",", ":"), allow_nan=False) + ";"
    if META.search(output):
        output = META.sub(lambda _: meta_line, output)
    else:
        output = MACRO.sub(lambda match: match.group(0) + "\n" + meta_line, output)
    latest = lambda sid: EPOCH + dt.timedelta(days=series[sid]["d"][-1])
    if re.search(r"income through \d{4}, Gini through \d{4}", output):
        output = replace_one(r"income through \d{4}, Gini through \d{4}",
                             f"income through {latest('MEHOINUSA672N').year}, Gini through {latest('SIPOVGINIUSA').year}", output)
    human = retrieved.strftime("%d %B %Y")
    wealth = latest("WFRBST01134")
    backdrop = (f"The data is an automatically updated FRED snapshot retrieved {human} (wealth shares through "
                f"{wealth.year} Q{(wealth.month-1)//3+1}; median income through {latest('MEHOINUSA672N').year}; "
                f"Gini through {latest('SIPOVGINIUSA').year}).")
    guide = replace_one(r'<span id="fred-backdrop-vintage">.*?</span>', '<span id="fred-backdrop-vintage">' + backdrop + '</span>', guide)
    def span(ids, month=False):
        dates = [latest(sid).isoformat()[:7 if month else 10] for sid in ids]
        return min(dates) if min(dates) == max(dates) else min(dates) + "–" + max(dates)
    dates = (f"The series are an automatically updated FRED snapshot retrieved {human} (daily sampled points "
             f"{span(SAMPLED | {'BAMLH0A0HYM2', 'BAMLC0A0CM'})}; weekly latest points "
             f"{span(['NFCI','ICSA'])}; monthly latest points "
             f"{span(['PSAVERT','CSUSHPINSA','FEDFUNDS','RECPROUSM156N','UMCSENT','UNRATE'], True)});")
    guide = replace_one(r'<span id="fred-forward-vintage">.*?</span>', '<span id="fred-forward-vintage">' + dates + '</span>', guide)
    outputs = {index: output, wiki: guide, snapshot: snapshot_text(metadata, series)}
    # Serialize and validate everything before creating any output file.
    if json.loads(outputs[snapshot])["series"] != series:
        raise ValueError("Snapshot serialization mismatch")
    from refresh_grid_snapshot import atomic_outputs
    atomic_outputs({target: contents.encode("utf-8") for target, contents in outputs.items()})
    print(f"Refreshed {len(series)} FRED series; provenance and snapshot saved in {snapshot.relative_to(root)}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv-dir", type=Path)
    parser.add_argument("--retrieved", help="Actual CSV retrieval date, YYYY-MM-DD")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--list-series", action="store_true")
    parser.add_argument("--check", action="store_true", help="Check packaged JSON/HTML agreement offline")
    parser.add_argument("--automated", action="store_true", help="Download all pinned official CSVs; publish only changed data/provenance")
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    root = args.repo_root.resolve()
    folder = root / "consoles/resilience-telemetry"
    series = json.loads(MACRO.search((folder / "index.html").read_text()).group(1))
    if args.list_series:
        print("\n".join(series))
    elif args.check:
        validate_series(series)
        saved = json.loads((folder / "data/fred_snapshot.json").read_text())
        validate_payload(saved, series)
        if saved["series"] != series or {s["series"] for s in saved["sources"]} != set(series):
            raise ValueError("Packaged FRED snapshot/provenance does not match embedded series")
        meta = META.search((folder / "index.html").read_text())
        if not meta or len(META.findall((folder / "index.html").read_text())) != 1 or json.loads(meta.group(1)) != {k: v for k, v in saved.items() if k != "series"}:
            raise ValueError("Embedded FRED metadata and portable snapshot disagree")
        print(f"PASS: {len(series)} FRED series match portable snapshot and provenance")
    else:
        if not args.automated and (args.csv_dir is None or args.retrieved is None):
            parser.error("--csv-dir and --retrieved are required for refresh")
        if args.automated and (args.csv_dir is not None or args.retrieved is not None):
            parser.error("--automated downloads current sources; do not supply --csv-dir/--retrieved")
        retrieved = dt.datetime.now(dt.timezone.utc).date() if args.automated else dt.date.fromisoformat(args.retrieved)
        changed = refresh_repository(root, args.csv_dir, retrieved, automatic=args.automated)
        if args.github_output:
            with args.github_output.open("a") as output:
                output.write(f"changed={str(changed).lower()}\n")


if __name__ == "__main__":
    main()
