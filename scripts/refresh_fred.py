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
import os
from pathlib import Path
import re
import tempfile

EPOCH = dt.date(2000, 1, 1)
SAMPLED = {"T10Y2Y", "T10Y3M", "DFII10", "T10YIE"}
MACRO = re.compile(r"^const MACRO = (.*);$", re.M)


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


def read_csv(path, sid):
    raw = path.read_bytes()  # missing files fail before any output is written
    rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    fields = rows.fieldnames or []
    date_col = next((name for name in fields if name.lower() in ("date", "observation_date")), None)
    if date_col is None or sid not in fields:
        raise ValueError(f"{path.name}: expected date and {sid} columns")
    values, previous = {}, None
    for row in rows:
        day = (dt.date.fromisoformat(row[date_col]) - EPOCH).days
        if previous is not None and day <= previous:
            raise ValueError(f"{path.name}: dates must be strictly increasing")
        previous = day
        text = row[sid]
        if text in ("", "."):
            continue
        value = float(text)
        if not math.isfinite(value):
            raise ValueError(f"{path.name}: non-finite value")
        values[day] = value / (1000 if sid == "ICSA" else 1)
    if not values:
        raise ValueError(f"{path.name}: no finite observations")
    return values, hashlib.sha256(raw).hexdigest()


def refresh_series(baseline, csv_dir, retrieved):
    validate_series(baseline)
    refreshed, sources = {}, []
    for sid, item in baseline.items():
        official, digest = read_csv(csv_dir / f"{sid}.csv", sid)
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


def refresh_repository(root, csv_dir, retrieved):
    folder = root / "consoles/resilience-telemetry"
    index, wiki, snapshot = folder / "index.html", folder / "wiki.html", folder / "data/fred_snapshot.json"
    original, guide = index.read_text(), wiki.read_text()
    baseline = json.loads(MACRO.search(original).group(1))
    if snapshot.exists() and json.loads(snapshot.read_text())["series"] != baseline:
        raise ValueError("Snapshot JSON and embedded MACRO disagree; reconcile before refreshing")
    series, sources = refresh_series(baseline, csv_dir, retrieved)
    output = MACRO.sub(lambda _: "const MACRO = " + json.dumps(series, separators=(",", ":"), allow_nan=False) + ";", original)
    output = replace_one(r"macro \(FRED(?:, embedded| snapshot retrieved \d{4}-\d{2}-\d{2})\) latest points",
                         f"macro (FRED snapshot retrieved {retrieved.isoformat()}) latest points", output)
    latest = lambda sid: EPOCH + dt.timedelta(days=series[sid]["d"][-1])
    output = replace_one(r"income through \d{4}, Gini through \d{4}",
                         f"income through {latest('MEHOINUSA672N').year}, Gini through {latest('SIPOVGINIUSA').year}", output)
    human = retrieved.strftime("%d %B %Y")
    wealth = latest("WFRBST01134")
    backdrop = (f"The data is an embedded FRED snapshot retrieved {human} (wealth shares through "
                f"{wealth.year} Q{(wealth.month-1)//3+1}; median income through {latest('MEHOINUSA672N').year}; "
                f"Gini through {latest('SIPOVGINIUSA').year}) and is never refreshed live.")
    guide = replace_one(r"The data is an embedded FRED snapshot[^\n]*? and is never refreshed live\.", backdrop, guide)
    def span(ids, month=False):
        dates = [latest(sid).isoformat()[:7 if month else 10] for sid in ids]
        return min(dates) if min(dates) == max(dates) else min(dates) + "–" + max(dates)
    dates = (f"The series are an embedded FRED snapshot retrieved {human} (daily sampled points "
             f"{span(SAMPLED | {'BAMLH0A0HYM2', 'BAMLC0A0CM'})}; weekly latest points "
             f"{span(['NFCI','ICSA'])}; monthly latest points "
             f"{span(['PSAVERT','CSUSHPINSA','FEDFUNDS','RECPROUSM156N','UMCSENT','UNRATE'], True)}), never refreshed live;")
    guide = replace_one(r"The series are an embedded FRED snapshot[^\n]*?, never refreshed live;", dates, guide)
    metadata = {"schema_version": 1, "retrieved_on": retrieved.isoformat(), "epoch": EPOCH.isoformat(),
                "scope": "Embedded FRED macro data only; market prices, CAPE and algorithms unchanged.", "sources": sources}
    outputs = {index: output, wiki: guide, snapshot: snapshot_text(metadata, series)}
    # Serialize and validate everything before creating any output file.
    if json.loads(outputs[snapshot])["series"] != series:
        raise ValueError("Snapshot serialization mismatch")
    staged = []
    try:
        for target, contents in outputs.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent, delete=False) as fh:
                fh.write(contents)
                staged.append((Path(fh.name), target))
        for temporary, target in staged:
            os.replace(temporary, target)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
    print(f"Refreshed {len(series)} FRED series; provenance and snapshot saved in {snapshot.relative_to(root)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv-dir", type=Path)
    parser.add_argument("--retrieved", help="Actual CSV retrieval date, YYYY-MM-DD")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--list-series", action="store_true")
    parser.add_argument("--check", action="store_true", help="Check packaged JSON/HTML agreement offline")
    args = parser.parse_args()
    root = args.repo_root.resolve()
    folder = root / "consoles/resilience-telemetry"
    series = json.loads(MACRO.search((folder / "index.html").read_text()).group(1))
    if args.list_series:
        print("\n".join(series))
    elif args.check:
        validate_series(series)
        saved = json.loads((folder / "data/fred_snapshot.json").read_text())
        if saved["series"] != series or {s["series"] for s in saved["sources"]} != set(series):
            raise ValueError("Packaged FRED snapshot/provenance does not match embedded series")
        print(f"PASS: {len(series)} FRED series match portable snapshot and provenance")
    else:
        if args.csv_dir is None or args.retrieved is None:
            parser.error("--csv-dir and --retrieved are required for refresh")
        refresh_repository(root, args.csv_dir, dt.date.fromisoformat(args.retrieved))


if __name__ == "__main__":
    main()
