"""Collect the complete public station register and dated geographic context.

Only the agency's public GIS layers and USGS terrain are read. Inventory status
and network-enabled fields are never interpreted as live operating condition.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
import copy
import hashlib
import json
import math
import re
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from coastal_population import _polygon, point_in_polygon

CITY = "https://services2.arcgis.com/9qPLjNtocjo438CJ/arcgis/rest/services/PublicWastewater/FeatureServer/1"
ZONE = "https://services.arcgis.com/f5HgUpxURgEzTccH/arcgis/rest/services/KYZ_EvacuationZones_view/FeatureServer/0"
EPQS = "https://epqs.nationalmap.gov/v1/json"
RASTER = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/"
FIELDS = ["OBJECTID", "FACILITYID", "GLOBALID", "NAME", "LSID", "STATUS", "BASINNUMBER", "OWNEDBY", "MAINTBY"]
MAX_BYTES = 40 * 1024 * 1024
MAX_STATIONS = 2000
MAX_ZONE_FEATURES = 20000
KNOWN_ZONES = {"A", "B", "C", "D", "E", "Non Evac", "MOBILE HOME"}
GUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
OWNERS = {0: "Private", 1: "City of St. Petersburg", -3: "Pinellas County", -4: "State"}
MAINTAINERS = {1: "City of St. Petersburg", -1: "Private", -2: "Other", -3: "Pinellas County", -4: "State", -5: "US/State"}


class InventoryError(ValueError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def inventory_fingerprint(inventory):
    return {"capturedAt": inventory["capturedAt"], "sha256": hashlib.sha256(canonical(inventory)).hexdigest()}


def _stamp(value):
    if not isinstance(value, str):
        raise InventoryError("Inventory timestamp is missing")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InventoryError("Invalid inventory timestamp") from exc
    if result.tzinfo is None:
        raise InventoryError("Inventory timestamp needs a timezone")
    return result.astimezone(timezone.utc)


def _iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _int(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or int(value) != value or value < minimum:
        raise InventoryError("Invalid " + label)
    return int(value)


def _coordinate(value, lower, upper):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lower < value < upper:
        raise InventoryError("Station coordinate is missing or outside the public service region")
    return round(value, 8)


def fetch_bytes(url):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in {"services2.arcgis.com", "services.arcgis.com", "epqs.nationalmap.gov", "elevation.nationalmap.gov"} or parsed.username or parsed.password:
        raise InventoryError("Inventory source left the verified public provider origins")
    with urlopen(Request(url, headers={"User-Agent": "Public-Data-Consoles-Coastal/1.0"}), timeout=30) as response:
        destination = urlsplit(response.url)
        if destination.scheme != "https" or destination.hostname != parsed.hostname:
            raise InventoryError("Inventory source redirected to a different origin")
        raw = response.read(MAX_BYTES + 1)
    if not raw or len(raw) > MAX_BYTES:
        raise InventoryError("Inventory source response is empty or oversized")
    return raw


class Capture:
    def __init__(self, fetch):
        self.fetch, self.receipts = fetch, []

    def read(self, base, *, fresh=False, **params):
        url = base + "?" + urlencode({"f": "json", **params})
        reader = getattr(self.fetch, "fresh", self.fetch) if fresh else self.fetch
        raw = reader(url)
        if not isinstance(raw, bytes) or not raw or len(raw) > MAX_BYTES:
            raise InventoryError("Public inventory response must be nonempty bounded bytes")
        try:
            data = json.loads(raw, parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))
        except (ValueError, UnicodeError) as exc:
            raise InventoryError("Public inventory response is not finite JSON") from exc
        if not isinstance(data, dict) or data.get("error"):
            raise InventoryError("Public inventory provider returned an error")
        self.receipts.append({"url": url, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
        return data


def _edited(meta, now):
    value = meta.get("editingInfo", {}).get("dataLastEditDate", meta.get("editingInfo", {}).get("lastEditDate"))
    if value is None:
        raise InventoryError("Public GIS source edit timestamp is missing")
    try:
        stamp = datetime.fromtimestamp(_int(value, "source edit timestamp") / 1000, timezone.utc)
    except (ValueError, OverflowError, OSError) as exc:
        raise InventoryError("Invalid public GIS source edit timestamp") from exc
    if stamp > now + timedelta(minutes=5):
        raise InventoryError("Public GIS edit timestamp is in the future")
    return _iso(stamp)


def _features(capture, base, meta, params, fields, limit):
    available = {f.get("name") for f in meta.get("fields", [])}
    if not set(fields) <= available:
        raise InventoryError("Public GIS field schema changed")
    count = _int(capture.read(base + "/query", fresh=True, **params, returnCountOnly="true").get("count"), "feature count")
    if count > limit:
        raise InventoryError("Public GIS capture exceeds its bounded feature count")
    inventory = capture.read(base + "/query", fresh=True, **params, returnIdsOnly="true")
    ids = inventory.get("objectIds")
    if not isinstance(ids, list) or len(ids) != count or inventory.get("exceededTransferLimit"):
        raise InventoryError("Incomplete public GIS ID inventory")
    ids = [_int(v, "object ID", 1) for v in ids]
    if len(set(ids)) != count or inventory.get("objectIdFieldName") != "OBJECTID":
        raise InventoryError("Duplicate or unsupported public GIS identity")
    features, expected = [], sorted(ids)
    page_size = min(200, _int(meta.get("maxRecordCount"), "record page limit", 1))
    for start in range(0, count, page_size):
        page = capture.read(base + "/query", **params, outFields=",".join(fields), returnGeometry="true", outSR=4326,
                            orderByFields="OBJECTID ASC", resultOffset=start, resultRecordCount=page_size)
        batch = page.get("features")
        if not isinstance(batch, list) or len(batch) != min(page_size, count-start):
            raise InventoryError("Truncated public GIS page")
        if [f.get("attributes", {}).get("OBJECTID") for f in batch] != expected[start:start+page_size]:
            raise InventoryError("Public GIS page differs from complete ID inventory")
        if start + len(batch) == count and page.get("exceededTransferLimit"):
            raise InventoryError("Final public GIS page remains transfer-limited")
        sr = page.get("spatialReference", {})
        if sr.get("latestWkid", sr.get("wkid")) != 4326:
            raise InventoryError("Public GIS geometry was not returned in WGS84")
        features.extend(batch)
    after = _int(capture.read(base + "/query", fresh=True, **params, returnCountOnly="true").get("count"), "post-capture count")
    if after != count:
        raise InventoryError("Public GIS count changed during capture")
    return features


def _source(id_, title, base, capture, stamp, **extra):
    return {"id": id_, "title": title, "url": base, "retrievedAt": stamp,
            "sha256": hashlib.sha256(canonical(capture.receipts)).hexdigest(),
            "hashBasis": "SHA256 of canonical URL/response-hash capture manifest", "captures": capture.receipts, **extra}


def _terrain_valid(station, rasters, now):
    value = station.get("groundElevationFt")
    raster = rasters.get(station.get("elevationRasterId"))
    try:
        date = _stamp(station.get("elevationRetrievedAt"))
        raster_date = _stamp(raster.get("retrievedAt")) if raster else None
        _acquisition_date(station.get("elevationAcquisitionDate"), now)
    except InventoryError:
        return False
    return (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and -1500 <= value <= 30000
            and station.get("elevationVerticalDatum") == "NAVD88" and raster is not None
            and station.get("elevationSourceId") == "usgs-epqs"
            and "NAVD" in raster.get("attributes", {}).get("VerticalDatum", "")
            and bool(station.get("elevationAcquisitionDate"))
            and bool(re.fullmatch(r"[0-9a-f]{64}", station.get("elevationResponseSha256", "")))
            and bool(re.fullmatch(r"[0-9a-f]{64}", raster.get("responseSha256", "")))
            and date <= now + timedelta(minutes=5) and raster_date <= now + timedelta(minutes=5))


def _acquisition_date(value, now):
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y%m%d"):
        try:
            stamp = datetime.strptime(str(value), fmt).replace(tzinfo=timezone.utc)
            if stamp > now + timedelta(minutes=5):
                raise InventoryError("Terrain acquisition date is in the future")
            return stamp.date().isoformat()
        except ValueError:
            continue
    raise InventoryError("Terrain acquisition date is missing/invalid")


def _acquisition_ranges(rasters, now):
    ranges = {}
    for raster in rasters.values():
        a = raster["attributes"]
        try:
            start, end = _acquisition_date(a.get("StartDate"), now), _acquisition_date(a.get("EndDate"), now)
        except InventoryError:
            continue
        if start > end:
            continue
        ranges.setdefault((start, end), []).append(str(a.get("Name") or raster["rasterId"]))
    return [{"dataset": "; ".join(sorted(names)), "start": start, "end": end} for (start,end),names in sorted(ranges.items())]


def _terrain(station, capture, raster_cache, now):
    """A failed point query is a missing sample, never a retained moved value."""
    result = capture.read(EPQS, x=station["lon"], y=station["lat"], wkid=4326, units="Feet", includeDate="true")
    value, raster_id = result.get("value"), result.get("rasterId")
    if isinstance(value, str):
        try:
            value = float(value)
        except ValueError:
            value = None
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or not -1500 <= value <= 30000:
        raise InventoryError("USGS terrain is unavailable")
    raster_id = _int(raster_id, "terrain raster ID", 1)
    if raster_id not in raster_cache:
        meta = capture.read(RASTER + str(raster_id))
        attrs = meta.get("attributes", {})
        if not isinstance(attrs, dict) or "NAVD" not in str(attrs.get("VerticalDatum", "")) or "88" not in str(attrs.get("VerticalDatum", "")):
            raise InventoryError("USGS terrain vertical datum is not verified NAVD88")
        attrs = {k: attrs.get(k) for k in ["OBJECTID", "Name", "Source", "ProductName", "VerticalDatum", "AcquisitionDate", "pubdate", "title", "Resolution_X", "Resolution_Y", "StartDate", "EndDate", "URL"]}
        if attrs.get("URL") and not str(attrs["URL"]).startswith("https://"):
            attrs["URL"] = None
        raster_cache[raster_id] = {"rasterId": raster_id, "source": RASTER + str(raster_id) + "?f=json", "retrievedAt": _iso(now),
                                  "responseSha256": capture.receipts[-1]["sha256"], "attributes": attrs}
    acquisition = result.get("attributes", {}).get("AcquisitionDate")
    _acquisition_date(acquisition, now)
    # The point response is first even when an additional raster lookup followed it.
    point_receipt = next(r for r in reversed(capture.receipts) if r["url"].startswith(EPQS + "?"))
    return {"groundElevationFt": value, "elevationSourceId": "usgs-epqs", "elevationBasis": "Interpolated bare-earth terrain, not surveyed station/equipment height",
            "elevationVerticalDatum": "NAVD88", "elevationRasterId": raster_id, "elevationAcquisitionDate": acquisition,
            "elevationRetrievedAt": _iso(now), "elevationQuality": "modeled-terrain", "elevationResponseSha256": point_receipt["sha256"]}


def validate_inventory(data, *, now=None):
    now = now or datetime.now(timezone.utc)
    if not isinstance(data, dict) or data.get("schemaVersion") != 1 or _stamp(data.get("capturedAt")) > now + timedelta(minutes=5):
        raise InventoryError("Invalid public station schema/capture")
    stations = data.get("stations")
    if not isinstance(stations, list) or not stations or len(stations) > MAX_STATIONS:
        raise InventoryError("Public station register must be nonempty and bounded")
    ids, guids = set(), set()
    for s in stations:
        if not isinstance(s.get("id"), str) or not s["id"].startswith("PUBLIC-") or s["id"] in ids:
            raise InventoryError("Public station identities are missing/duplicate")
        ids.add(s["id"])
        guid = s.get("agencyGlobalId")
        if guid is not None:
            if not GUID.fullmatch(guid) or guid in guids:
                raise InventoryError("Agency GLOBALIDs must be valid and unique")
            guids.add(guid)
        _coordinate(s.get("lon"), -83, -82); _coordinate(s.get("lat"), 27, 29)
        if not isinstance(s.get("basin"), str) or not s["basin"].strip() or s["basin"] != s["basin"].strip() or s.get("registerStatus") != "Current":
            raise InventoryError("Station basin/current register fields are invalid")
        if type(s.get("isCityOwned")) is not bool or type(s.get("isCityMaintained")) is not bool:
            raise InventoryError("Ownership classification must be explicit")
        if s.get("zoneMatchStatus") not in {"matched", "no-intersection", "boundary", "ambiguous", "unsupported-code"}:
            raise InventoryError("Unknown evacuation-zone intersection status")
        if s["zoneMatchStatus"] == "matched":
            if s.get("officialZone") not in KNOWN_ZONES:
                raise InventoryError("Unrecognized evacuation-zone code")
        elif s.get("officialZone") is not None:
            raise InventoryError("Unresolved zone cannot become a known zone")
    c = data.get("completeness", {})
    if c.get("returnedPublicRegisterRecords") != len(stations) or c.get("publicRegisterQueryCount") != len(stations) or c.get("exceededTransferLimit") is not False:
        raise InventoryError("Station completeness controls disagree")
    if c.get("cityOwnedMaintainedCurrent") != sum(s["isCityOwned"] and s["isCityMaintained"] for s in stations) or c.get("zoneCounts") != dict(Counter(s.get("officialZone") or "Unknown" for s in stations)):
        raise InventoryError("Station ownership/zone aggregate controls disagree")
    sources = {s.get("id"): s for s in data.get("sources", [])}
    rasters = {r["rasterId"]: r for r in sources.get("usgs-epqs", {}).get("rasters", [])}
    for s in stations:
        if s.get("groundElevationFt") is not None and not _terrain_valid(s, rasters, now):
            raise InventoryError("Nonmissing terrain lacks valid independent datum/provenance")
    count = sum(s.get("groundElevationFt") is not None for s in stations)
    if data.get("elevation", {}).get("validCount") != count or data["elevation"].get("missingCount") != len(stations)-count:
        raise InventoryError("Terrain coverage controls disagree")
    return data


def collect_inventory(previous=None, *, fetch=fetch_bytes, now=None, refresh_terrain=False):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise InventoryError("Capture time needs a timezone")
    now = now.astimezone(timezone.utc); stamp = _iso(now)
    if previous is not None:
        validate_inventory(previous, now=now)
        if _stamp(previous["capturedAt"]) > now:
            raise InventoryError("Inventory capture would regress")
    old = previous.get("stations", []) if isinstance(previous, dict) else []
    by_guid = {s["agencyGlobalId"]: s for s in old if s.get("agencyGlobalId")}
    legacy_facility = {s["facilityId"]: s for s in old if s.get("facilityId") and not s.get("agencyGlobalId")}
    legacy_oid = {s["objectId"]: s for s in old if not s.get("facilityId") and not s.get("agencyGlobalId")}
    city = Capture(fetch); meta = city.read(CITY, fresh=True); edited = _edited(meta, now)
    features = _features(city, CITY, meta, {"where": "1=1"}, FIELDS, MAX_STATIONS)
    if not features:
        raise InventoryError("Public City station source is empty")
    end_meta = city.read(CITY, fresh=True)
    if _edited(end_meta, now) != edited:
        raise InventoryError("City station source changed during capture")
    prior_source = next((s for s in (previous or {}).get("sources", []) if s.get("id") == "city-stations"), {})
    if prior_source.get("dataLastEditedAt") and edited < prior_source["dataLastEditedAt"]:
        raise InventoryError("City station source edition regressed")
    stations, seen_guid, seen_facility, status_counts = [], set(), set(), Counter()
    for f in features:
        a, g = f["attributes"], f.get("geometry", {})
        guid = str(a.get("GLOBALID", "")).strip("{}").lower()
        if not GUID.fullmatch(guid) or guid in seen_guid:
            raise InventoryError("Missing/duplicate agency GLOBALID")
        seen_guid.add(guid)
        status = a.get("STATUS"); status_counts[status] += 1
        if status not in {"C", "P", "A"}:
            raise InventoryError("Public register status code is unrecognized")
        if status != "C":
            continue
        facility = a.get("FACILITYID")
        if facility is not None and (not isinstance(facility, str) or not facility.strip() or facility != facility.strip() or facility in seen_facility):
            raise InventoryError("Invalid/duplicate facility ID")
        if facility is not None:
            seen_facility.add(facility)
        x, y = _coordinate(g.get("x"), -83, -82), _coordinate(g.get("y"), 27, 29)
        prior = by_guid.get(guid) or legacy_facility.get(facility)
        if prior is None and facility is None:
            candidate = legacy_oid.get(a["OBJECTID"])
            if candidate and candidate.get("lon") == x and candidate.get("lat") == y:
                prior = candidate
        id_ = prior["id"] if prior else "PUBLIC-" + (facility or "GID-" + guid)
        basin = a.get("BASINNUMBER")
        if not isinstance(basin, str) or not basin.strip() or basin != basin.strip():
            raise InventoryError("Public station source has no exact basin label")
        s = {"id": id_, "agencyGlobalId": guid, "objectId": a["OBJECTID"], "facilityId": facility,
             "displayAssetId": a.get("LSID"), "name": a.get("NAME") or "Public lift station", "lat": y, "lon": x,
             "owner": OWNERS.get(a.get("OWNEDBY"), "Unspecified"), "maintainer": MAINTAINERS.get(a.get("MAINTBY"), "Unspecified"),
             "isCityOwned": a.get("OWNEDBY") == 1, "isCityMaintained": a.get("MAINTBY") == 1, "basin": basin,
             "registerStatus": "Current", "officialZone": None, "zoneMatchStatus": "no-intersection", "zoneSourceFeatureIds": [],
             "groundElevationFt": None, "elevationQuality": "unavailable"}
        s["_prior"] = prior
        stations.append(s)
    if not stations:
        raise InventoryError("No current public stations remain")
    if previous and edited == prior_source.get("dataLastEditedAt") and {s["id"] for s in stations} != {s["id"] for s in old}:
        raise InventoryError("Station membership changed without a newer source edition")

    zones = Capture(fetch); zone_meta = zones.read(ZONE, fresh=True); zone_edited = _edited(zone_meta, now); polygons = {}
    prior_zone = next((s for s in (previous or {}).get("sources", []) if s.get("id") == "county-evacuation-zones"), {})
    if prior_zone.get("dataLastEditedAt") and zone_edited < prior_zone["dataLastEditedAt"]:
        raise InventoryError("Evacuation-zone source edition regressed")
    for start in range(0, len(stations), 15):
        points = [[s["lon"], s["lat"]] for s in stations[start:start+15]]
        params = {"where": "1=1", "geometryType": "esriGeometryMultipoint", "geometry": json.dumps({"points": points, "spatialReference": {"wkid": 4326}}, separators=(",", ":")), "inSR": 4326, "spatialRel": "esriSpatialRelIntersects"}
        for f in _features(zones, ZONE, zone_meta, params, ["OBJECTID", "EvacZone"], MAX_ZONE_FEATURES):
            identifier = f["attributes"]["OBJECTID"]
            if identifier in polygons and polygons[identifier]["raw"] != f:
                raise InventoryError("Evacuation polygon changed between batches")
            polygon = _polygon(f.get("geometry"))
            if polygon is None:
                raise InventoryError("Matched evacuation polygon geometry is missing")
            polygons[identifier] = {"raw": f, "polygon": polygon}
        if len(polygons) > MAX_ZONE_FEATURES:
            raise InventoryError("Too many public zone candidates")
    if _edited(zones.read(ZONE, fresh=True), now) != zone_edited:
        raise InventoryError("Evacuation-zone source changed during capture")
    for s in stations:
        hits, boundary = [], False
        for id_, p in polygons.items():
            state = point_in_polygon(s["lon"], s["lat"], p["polygon"])
            if state:
                hits.append(p["raw"]["attributes"])
                boundary |= state == 2
        codes = {p.get("EvacZone") for p in hits}
        s["zoneSourceFeatureIds"] = sorted(p["OBJECTID"] for p in hits)
        if boundary:
            s["zoneMatchStatus"] = "boundary"
        elif len(codes) > 1:
            s["zoneMatchStatus"] = "ambiguous"
        elif codes:
            code = next(iter(codes))
            s["zoneMatchStatus"] = "matched" if code in KNOWN_ZONES else "unsupported-code"
            s["officialZone"] = code if code in KNOWN_ZONES else None
        prior = s.get("_prior")
        if (zone_edited == prior_zone.get("dataLastEditedAt") and prior
                and prior.get("lat") == s["lat"] and prior.get("lon") == s["lon"]
                and (prior.get("zoneMatchStatus") != s["zoneMatchStatus"] or prior.get("officialZone") != s["officialZone"])):
            raise InventoryError("Evacuation classification changed without newer source edition or moved station")

    terrain = Capture(fetch)
    old_terrain = next((s for s in (previous or {}).get("sources", []) if s.get("id") == "usgs-epqs"), {})
    raster_cache = {r["rasterId"]: copy.deepcopy(r) for r in old_terrain.get("rasters", [])}
    retained = queried = unavailable = 0
    for s in stations:
        prior = s.pop("_prior")
        same = prior and prior.get("lat") == s["lat"] and prior.get("lon") == s["lon"]
        if not refresh_terrain and same and _terrain_valid(prior, raster_cache, now):
            s.update({k: copy.deepcopy(v) for k, v in prior.items() if k.startswith("elevation") or k == "groundElevationFt"})
            s["elevationRetained"] = True; retained += 1
        else:
            queried += 1
            try:
                s.update(_terrain(s, terrain, raster_cache, now)); s["elevationRetained"] = False
            except (ValueError, OSError, KeyError, TypeError, OverflowError) as exc:
                s.update({"groundElevationFt": None, "elevationQuality": "unavailable", "elevationRetained": False,
                          "elevationCheckedAt": stamp, "elevationUnavailableReason": "USGS point/datum validation unavailable; no old sample assigned to this coordinate"})
                unavailable += 1
    used_rasters = sorted({s["elevationRasterId"] for s in stations if s.get("groundElevationFt") is not None})
    raster_cache = {k: raster_cache[k] for k in used_rasters}
    terrain_dates = [s["elevationRetrievedAt"] for s in stations if s.get("groundElevationFt") is not None]
    terrain_source = _source("usgs-epqs", "USGS 3DEP Elevation Point Query Service · interpolated bare-earth terrain", "https://apps.nationalmap.gov/epqs/", terrain, max(terrain_dates) if terrain_dates else stamp,
                             apiUrl=EPQS, accuracyUrl="https://www.usgs.gov/faqs/how-accurate-are-elevations-generated-elevation-point-query-service-national-map",
                             queryUnits="international feet", horizontalRequestSrid=4326, verticalDatum="NAVD88", rasters=list(raster_cache.values()),
                             method="Unchanged exact station coordinates retain independently verified NAVD88 samples with their original retrieval/acquisition dates. New or moved points query USGS; failed points are unavailable. No ground direction is inferred for pumped flow.")
    terrain_source["retainedSourceSha256"] = old_terrain.get("sha256") if retained else None
    sample_proofs = [{k: s.get(k) for k in ["id", "lat", "lon", "groundElevationFt", "elevationRasterId", "elevationResponseSha256", "elevationRetrievedAt"]} for s in stations]
    terrain_source["sha256"] = hashlib.sha256(canonical({"captures": terrain.receipts, "samples": sample_proofs, "rasters": list(raster_cache.values())})).hexdigest()
    terrain_source["hashBasis"] = "SHA256 of canonical new-request manifest, all point value/coordinate/original response-hash/date proofs, and independent raster proofs"
    city_count = sum(s["isCityOwned"] for s in stations); private_count = sum(s["owner"] == "Private" for s in stations)
    limits = ["Public GIS register status is not live operability, a flood-depth forecast, an outage, an evacuation order or facility safety.",
              "City ownership/maintenance is not a municipal limit or wastewater service boundary. Private records are agency-published and labeled.",
              "USGS interpolated bare-earth terrain is not surveyed equipment/wet-well height. Acquisition and original retrieval dates remain visible; unchanged coordinates may retain older samples.",
              "No complete operational topology, station flow/capacity, failure propagation, customer allocation or spill/damage model is inferred from public inventory geometry.",
              "Evacuation zones are planning classifications, not FEMA flood zones or current orders. No intersection, boundary, ambiguous and unsupported-code results remain unknown.",
              "The agency provides public inventory as is; resolve location-specific decisions through current official sources."]
    result = {"schemaVersion": 1, "capturedAt": stamp, "title": "Official publicly published lift-station register",
              "coverage": f"{len(stations)} agency-published Current-register lift stations: {city_count} City-owned and {private_count} privately owned. Default City-only view is an ownership filter, not a city-limit or service-area boundary.",
              "sources": [_source("city-stations", "City of St. Petersburg Water Resources · PublicWastewater · Sewer Lift Station", CITY, city, stamp,
                                   dataLastEditedAt=edited, filter="STATUS='C' after complete 1=1 source capture", updateNote="Approximately monthly GIS inventory updates; not live operating status."),
                          _source("county-evacuation-zones", "Pinellas County · public Know Your Zone parcel evacuation-zone layer", ZONE, zones, stamp,
                                   dataLastEditedAt=zone_edited, method="Complete bounded multipoint query batches; exact point-in-polygon, with boundaries/ambiguity unknown. No parcel-owner/address fields retained."),
                          {"id": "official-zone-lookup", "title": "Pinellas County Know Your Zone", "url": "https://pinellas.gov/services/find-your-evacuation-zone/"}, terrain_source],
              "completeness": {"sourceLayerRecordCount": len(features), "sourceRegisterStatusCounts": dict(status_counts), "cityOwnedMaintainedCurrent": sum(s["isCityOwned"] and s["isCityMaintained"] for s in stations),
                               "publicPrivatelyOwnedRecordCount": private_count, "excludedPrivateRecordCount": 0, "publicRegisterQueryCount": len(stations), "returnedPublicRegisterRecords": len(stations),
                               "exceededTransferLimit": False, "zoneCandidatePolygonCount": len(polygons), "zoneMatchCounts": dict(Counter(s["zoneMatchStatus"] for s in stations)),
                               "zoneCounts": dict(Counter(s["officialZone"] or "Unknown" for s in stations)), "elevationValidCount": len(terrain_dates), "elevationMissingCount": len(stations)-len(terrain_dates),
                               "elevationRetainedCount": retained, "elevationQueriedCount": queried, "elevationNewQueryUnavailableCount": unavailable,
                               "nullFacilityIdCount": sum(s["facilityId"] is None for s in stations)},
              "limitations": limits, "topology": None, "stations": stations,
              "elevation": {"basis": "modeled", "units": "international feet", "verticalDatum": "NAVD88", "validCount": len(terrain_dates), "missingCount": len(stations)-len(terrain_dates),
                            "retrievedAt": max(terrain_dates) if terrain_dates else None, "oldestRetrievedAt": min(terrain_dates) if terrain_dates else None,
                            "retainedCount": retained, "queriedCount": queried, "sourceAcquisitionRanges": _acquisition_ranges(raster_cache, now),
                            "limitations": limits[2:4]}}
    return validate_inventory(result, now=now)
