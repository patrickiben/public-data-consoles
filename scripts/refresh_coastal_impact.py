#!/usr/bin/env python3
"""Refresh source-backed coastal geographic/throughput context without provider keys.

Source collectors verify their own complete public inventories and reference periods.
Validate the whole payload before replacing either the portable JSON or offline HTML.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
COASTAL = ROOT / "consoles/coastal-water-resilience"
CONTEXT = COASTAL / "data/impact-context.json"
HTML = COASTAL / "index.html"
INVENTORY = COASTAL / "data/public-stations.json"
PATTERN = r'(<script type="application/json" id="coastal-impact-context">)(.*?)(</script>)'


class RefreshError(ValueError):
    pass


def timestamp(value):
    try:
        stamp = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise RefreshError("Invalid source capture timestamp") from exc
    if stamp.tzinfo is None:
        raise RefreshError("Source capture timestamp must include its timezone")
    return stamp.astimezone(dt.timezone.utc)


def allowed_url(url):
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and not parsed.username and not parsed.password and (
        host in {"tigerweb.geo.census.gov", "floridadep.gov", "www.floridadep.gov", "www.stpete.org", "stpete.org", "epqs.nationalmap.gov", "elevation.nationalmap.gov"}
        or host == "services.arcgis.com" or re.fullmatch(r"services\d+\.arcgis\.com", host) is not None
    )


class PublicFetch:
    """Bounded, credential-free source requests, with per-run cache and audit receipts."""
    def __init__(self):
        self.cache = {}
        self.receipts = []

    def __call__(self, url):
        return self._read(url, use_cache=True)

    def fresh(self, url):
        """Control rereads must reach the provider, even for identical URLs."""
        return self._read(url, use_cache=False)

    def _read(self, url, *, use_cache):
        if not allowed_url(url):
            raise RefreshError("Source URL must remain on a verified public provider")
        if use_cache and url in self.cache:
            return self.cache[url]
        if len(self.receipts) >= 500:
            raise RefreshError("Public refresh exceeded its 500-request bound")
        request = Request(url, headers={"User-Agent": "Public-Data-Consoles-Coastal/1.0", "Accept": "application/json,text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
        with urlopen(request, timeout=30) as response:
            if not allowed_url(response.url):
                raise RefreshError("Source redirected outside the verified provider list")
            data = response.read(40 * 1024 * 1024 + 1)
            modified = response.headers.get("Last-Modified")
        if len(data) > 40 * 1024 * 1024:
            raise RefreshError("Source response exceeded the 40 MiB bound")
        self.receipts.append({"url": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "lastModified": modified})
        self.cache[url] = data
        return data


def finite(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def inventory_fingerprint(inventory):
    """Bind geographic/flow context to the exact separately published inventory."""
    raw = json.dumps(inventory, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    return {"capturedAt": inventory["capturedAt"], "sha256": hashlib.sha256(raw).hexdigest()}


def validate(payload, inventory, *, now=None, previous=None):
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise RefreshError("Expected coastal impact schemaVersion 1")
    if timestamp(payload.get("capturedAt")) > (now or dt.datetime.now(dt.timezone.utc)) + dt.timedelta(minutes=5):
        raise RefreshError("Coastal source capture cannot be in the future")
    if payload.get("inventoryFingerprint") != inventory_fingerprint(inventory):
        raise RefreshError("Coastal context belongs to a different public station inventory; reload the matched publication")
    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        raise RefreshError("Public sources and provenance are required")
    ids = set()
    for source in sources:
        if not isinstance(source, dict) or not source.get("id") or source["id"] in ids:
            raise RefreshError("Source IDs must be present and unique")
        ids.add(source["id"])
        if not allowed_url(source.get("url", "")) or not source.get("title"):
            raise RefreshError("Source URL/title is missing or not a verified provider")
        if not re.fullmatch(r"[0-9a-f]{64}", source.get("sha256", "")):
            raise RefreshError("Each data source needs a SHA-256 receipt")
    blocks = payload.get("populationBlocks")
    areas = payload.get("areas")
    if not isinstance(blocks, list) or not blocks or not isinstance(areas, list) or not areas:
        raise RefreshError("Complete geographic population context is required")
    block_ids = set()
    for block in blocks:
        if not isinstance(block, dict) or not re.fullmatch(r"\d{15}", str(block.get("id", ""))) or block["id"] in block_ids:
            raise RefreshError("Census block identities must be valid and unique")
        block_ids.add(block["id"])
        pop = block.get("population")
        year = block.get("referenceYear")
        if not finite(pop) or not 0 <= pop <= 2**53 - 1 or int(pop) != pop or not isinstance(year, int) or isinstance(year, bool) or not 2000 <= year <= (now or dt.datetime.now(dt.timezone.utc)).year:
            raise RefreshError("Census populations need nonnegative integral counts and a reference year")
        if not block.get("sourceIds") or not set(block["sourceIds"]) <= ids:
            raise RefreshError("Population record has an unknown source")
    area_ids = set()
    for area in areas:
        if not isinstance(area, dict) or not area.get("id") or area["id"] in area_ids:
            raise RefreshError("Source basin IDs must be present and unique")
        area_ids.add(area["id"])
        members = area.get("blockIds")
        if not isinstance(members, list) or len(members) != len(set(members)) or not set(members) <= block_ids or area.get("geometryComplete") is False:
            raise RefreshError("Basin population references missing or duplicate Census blocks")
        if not area.get("sourceIds") or not set(area["sourceIds"]) <= ids:
            raise RefreshError("Basin record has an unknown source")
    missing = {str(s.get("basin")) for s in inventory["stations"] if s.get("basin") is not None} - area_ids
    if missing:
        raise RefreshError("Public station basin coverage regressed: " + ", ".join(sorted(missing)))
    flows = payload.get("flowAggregates")
    if not isinstance(flows, list) or not flows:
        raise RefreshError("Published wastewater flow context is required")
    flow_ids = set()
    for flow in flows:
        if not isinstance(flow, dict) or not flow.get("id") or flow["id"] in flow_ids:
            raise RefreshError("Plant flow identities must be present and unique")
        flow_ids.add(flow["id"])
        if not finite(flow.get("averageDailyFlowMGD")) or flow["averageDailyFlowMGD"] < 0 or not isinstance(flow.get("period"), str) or not flow["period"]:
            raise RefreshError("Plant throughput needs a finite nonnegative value and reference period")
        if not flow.get("sourceIds") or not set(flow["sourceIds"]) <= ids:
            raise RefreshError("Flow context has an unknown source")
    try:
        flow_total = math.fsum(f["averageDailyFlowMGD"] for f in flows)
    except OverflowError as exc:
        raise RefreshError("Aggregate treatment throughput overflowed") from exc
    if not math.isfinite(flow_total) or not math.isfinite(flow_total * 1_000_000 * 2):
        raise RefreshError("Aggregate throughput cannot represent a finite 48-hour equivalent")
    if not payload.get("populationMethod") or not isinstance(payload.get("limitations"), list):
        raise RefreshError("Population method and interpretation limits are required")
    if previous is not None:
        if timestamp(payload["capturedAt"]) < timestamp(previous.get("capturedAt")):
            raise RefreshError("Coastal context capture regressed")
        current_flows = {f["id"]: f for f in flows}
        for prior in previous.get("flowAggregates", []):
            current = current_flows.get(prior.get("id"))
            if current is None:
                raise RefreshError("Previously published treatment facility disappeared")
            if prior.get("periodEnd"):
                try:
                    prior_end = dt.date.fromisoformat(prior["periodEnd"])
                    current_end = dt.date.fromisoformat(current.get("periodEnd", ""))
                except (TypeError, ValueError) as exc:
                    raise RefreshError("Treatment reference period missing/invalid") from exc
                if current_end < prior_end:
                    raise RefreshError("Published treatment reference period regressed")
        current_blocks = {b["id"]: b for b in blocks}
        for block in previous.get("populationBlocks", []):
            current = current_blocks.get(block.get("id"))
            if current and current["referenceYear"] < block["referenceYear"]:
                raise RefreshError("Census population reference year regressed")
    return payload


def collect(inventory, *, fetch=None, now=None):
    # Import only for a refresh; --check remains a provider-free publication guard.
    from coastal_population import collect_population_context
    from coastal_utility import collect_utility_context
    now = now or dt.datetime.now(dt.timezone.utc)
    fetch = fetch or PublicFetch()
    population = dict(collect_population_context(inventory, fetch=fetch, now=now))
    utility = dict(collect_utility_context(fetch=fetch, now=now))
    result = {"schemaVersion": 1, "capturedAt": now.isoformat().replace("+00:00", "Z"), "refreshEveryHours": 168,
              "inventoryFingerprint": inventory_fingerprint(inventory),
              "sources": population.pop("sources") + utility.pop("sources"), **population, **utility}
    result["limitations"] = result.pop("populationLimitations", []) + result.pop("utilityLimitations", [])
    return validate(result, inventory, now=now)


def embedded(html):
    matches = list(re.finditer(PATTERN, html, flags=re.S))
    if len(matches) != 1:
        raise RefreshError("Expected exactly one coastal-impact-context JSON anchor")
    return matches[0]


def outputs(payload, html, inventory=None):
    match = embedded(html)
    compact = json.dumps(payload, separators=(",", ":"), ensure_ascii=True, allow_nan=False).replace("<", "\\u003c")
    updated = html[:match.start(2)] + compact + html[match.end(2):]
    result = {CONTEXT: (json.dumps(payload, indent=2, ensure_ascii=True, allow_nan=False) + "\n").encode()}
    if inventory is not None:
        if payload.get("inventoryFingerprint") != inventory_fingerprint(inventory):
            raise RefreshError("Cannot publish mismatched public inventory and impact context")
        pattern = r'(<script type="application/json" id="public-station-snapshot">)(.*?)(</script>)'
        matches = list(re.finditer(pattern, updated, flags=re.S))
        if len(matches) != 1:
            raise RefreshError("Expected exactly one public-station-snapshot JSON anchor")
        match = matches[0]
        compact_inventory = json.dumps(inventory, separators=(",", ":"), ensure_ascii=True, allow_nan=False).replace("<", "\\u003c")
        updated = updated[:match.start(2)] + compact_inventory + updated[match.end(2):]
        result[INVENTORY] = (json.dumps(inventory, indent=2, ensure_ascii=True, allow_nan=False) + "\n").encode()
    result[HTML] = updated.encode()
    return result


def collect_transaction(previous, *, previous_context=None, fetch=None, now=None, refresh_terrain=False, inventory_collector=None, context_collector=None):
    """Acquire/validate every source before returning any proposed output bytes."""
    if inventory_collector is None:
        from coastal_inventory import collect_inventory
        inventory_collector = collect_inventory
    now = now or dt.datetime.now(dt.timezone.utc)
    fetch = fetch or PublicFetch()
    inventory = inventory_collector(previous, fetch=fetch, now=now, refresh_terrain=refresh_terrain)
    payload = (context_collector or collect)(inventory, fetch=fetch, now=now)
    validate(payload, inventory, now=now, previous=previous_context)
    return inventory, payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate portable/offline publication without network")
    parser.add_argument("--receipts", type=Path, help="Optional local audit-receipt output")
    parser.add_argument("--refresh-terrain", action="store_true", help="Requery all public USGS terrain samples; otherwise retain valid unchanged-coordinate samples with original dates")
    args = parser.parse_args()
    try:
        inventory = json.loads(INVENTORY.read_text())
        if args.check:
            from coastal_inventory import validate_inventory
            validate_inventory(inventory)
            html = HTML.read_text()
            payload = validate(json.loads(CONTEXT.read_text()), inventory)
            if json.loads(embedded(html).group(2)) != payload:
                raise RefreshError("Portable coastal context differs from embedded offline JSON")
            anchors = re.findall(r'<script type="application/json" id="public-station-snapshot">(.*?)</script>', html, flags=re.S)
            if len(anchors) != 1 or json.loads(anchors[0]) != inventory:
                raise RefreshError("Portable public inventory differs from embedded offline JSON")
            print("PASS: coastal source context, basin/block coverage, flow provenance and offline JSON agree")
            return
        fetch = PublicFetch()
        previous_context = json.loads(CONTEXT.read_text()) if CONTEXT.exists() else None
        inventory, payload = collect_transaction(inventory, previous_context=previous_context, fetch=fetch, refresh_terrain=args.refresh_terrain)
        # Re-read after provider calls so concurrent work outside the JSON marker is preserved.
        html = HTML.read_text()
        changes = outputs(payload, html, inventory)
        if args.receipts:
            changes[args.receipts] = (json.dumps(fetch.receipts, indent=2) + "\n").encode()
        from refresh_grid_snapshot import atomic_outputs
        atomic_outputs(changes)
        print(f"Refreshed {len(payload['areas'])} basin records, {len(payload['populationBlocks'])} Census blocks and {len(payload['flowAggregates'])} plant flow records")
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(1, "Coastal context refresh failed; last published data retained: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
