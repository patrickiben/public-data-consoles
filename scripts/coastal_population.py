"""Collect a dated geographic population context from official public GIS.

This module performs no writes. Basin labels establish a source-defined spatial
association, not customers, hydraulic dependence, flood exposure or outage impact.
Only Python's standard library is required. Inject ``fetch(url) -> bytes`` to
capture/cache the complete, reproducible source recipe outside the repository.
"""
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
import re
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


BASIN_URL = "https://services2.arcgis.com/9qPLjNtocjo438CJ/arcgis/rest/services/PublicWastewater/FeatureServer/9"
CENSUS_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/10"
STATION_URL = "https://services2.arcgis.com/9qPLjNtocjo438CJ/arcgis/rest/services/PublicWastewater/FeatureServer/1"
COUNTY_WHERE = "STATE='12' AND COUNTY='103'"
MAX_DOWNLOAD = 16 * 1024 * 1024
MAX_FEATURES = 100000
PAGE_SIZE = 5000
SOURCE_IDS = ["city-sewer-subbasins", "census-2020-blocks", "public-station-register"]
POPULATION_METHOD = (
    "Select distinct exact source BASINID labels of the relevant public station "
    "records. Assign a 2020 Census block to a basin when its official internal "
    "point lies inside or on the published basin polygon (multipart features are "
    "unioned). Union block GEOIDs across every selected basin and count each "
    "block population once. This is a dated geographic population-context "
    "estimate, not a customer/dependency/outage or flood-exposed population estimate."
)
LIMITATIONS = [
    "The public station basin label and City polygon BASINID establish an identifier association, not verified wastewater service dependence, customer count, hydraulic connectivity or an outage footprint.",
    "A resident is counted geographically by the internal point of the whole Census block; a basin crossing a block may include residents on its other side or omit residents on this side. This is not an address-level or exact partial-block population allocation.",
    "Population and housing are 2020 Census counts, not current occupancy, visitors, customers, connections, flood-exposed people, people without service or an illness/casualty estimate.",
    "Overlapping basins or multiple selected stations sharing a basin must be deduplicated by block GEOID, never by summing station or area population totals.",
    "Source boundaries and station points can differ at edges; the exact source label is used, not a nearest-polygon assignment. Multipart source features share one basin identifier and are unioned.",
    "Only source basins referenced by the station register are packaged; these do not establish the complete City wastewater service territory or a municipal population denominator.",
    "No measured sub-basin population, sewer connection count or flow is published in the City sub-basin schema. Separately sourced flow aggregates cannot be silently assigned to these geographic footprints.",
]


class PopulationContextError(ValueError):
    """A source cannot be interpreted completely; preserve the last-good artifact."""


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def _now(value):
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise PopulationContextError("Invalid capture timestamp") from exc
    if value is None:
        value = datetime.now(timezone.utc)
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise PopulationContextError("Capture timestamp must be timezone-aware")
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _official_url(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"services2.arcgis.com", "tigerweb.geo.census.gov"} or parsed.username or parsed.password:
        raise PopulationContextError("Population source left its official HTTPS origins")


def fetch_bytes(url):
    _official_url(url)
    request = Request(url, headers={"User-Agent": "public-data-consoles coastal population-context refresh"})
    with urlopen(request, timeout=45) as response:
        _official_url(response.geturl())
        raw = response.read(MAX_DOWNLOAD + 1)
    if not raw or len(raw) > MAX_DOWNLOAD:
        raise PopulationContextError("Population source is empty or exceeds download limit")
    return raw


def _integer(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value != int(value) or value < minimum:
        raise PopulationContextError("Invalid nonnegative integer " + label)
    return int(value)


def _coordinate(value, label, lower, upper):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise PopulationContextError("Invalid coordinate " + label)
    try:
        result = float(value)
    except ValueError as exc:
        raise PopulationContextError("Invalid coordinate " + label) from exc
    if not math.isfinite(result) or not lower <= result <= upper:
        raise PopulationContextError("Invalid coordinate " + label)
    return result


class Capture:
    def __init__(self, fetch):
        self.fetch, self.records = fetch, []

    def read(self, base, *, fresh=False, **params):
        params["f"] = "json"
        url = base + "?" + urlencode(params)
        reader = getattr(self.fetch, "fresh", self.fetch) if fresh else self.fetch
        raw = reader(url)
        if not isinstance(raw, bytes) or not raw or len(raw) > MAX_DOWNLOAD:
            raise PopulationContextError("GIS response must be nonempty bounded bytes")
        try:
            result = json.loads(raw, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        except (ValueError, UnicodeError) as exc:
            raise PopulationContextError("GIS response is not valid finite JSON") from exc
        if not isinstance(result, dict) or "error" in result:
            raise PopulationContextError("Official GIS returned an error or unexpected response")
        self.records.append({"url": url, "sha256": hashlib.sha256(raw).hexdigest(), "byteLength": len(raw)})
        return result


def _features(capture, base, where, fields, geometry=False):
    """Check the complete ID inventory, ordered pages and a post-capture count."""
    metadata = capture.read(base, fresh=True)
    schema = metadata.get("fields")
    if not isinstance(schema, list):
        raise PopulationContextError("Official GIS metadata has no field schema")
    available = {field.get("name") for field in schema if isinstance(field, dict)}
    if not set(fields).issubset(available):
        raise PopulationContextError("Official GIS schema lost required fields")
    max_records = _integer(metadata.get("maxRecordCount"), "maxRecordCount", 1)
    count = _integer(capture.read(base + "/query", fresh=True, where=where, returnCountOnly="true").get("count"), "feature count", 1)
    if count > MAX_FEATURES:
        raise PopulationContextError("Official GIS capture exceeds the bounded feature limit")
    inventory = capture.read(base + "/query", fresh=True, where=where, returnIdsOnly="true")
    ids = inventory.get("objectIds")
    if not isinstance(ids, list) or len(ids) != count or inventory.get("exceededTransferLimit"):
        raise PopulationContextError("Incomplete official GIS object-ID inventory")
    ids = [_integer(value, "object ID", 1) for value in ids]
    if len(set(ids)) != count or inventory.get("objectIdFieldName", "OBJECTID") != "OBJECTID":
        raise PopulationContextError("Duplicate or unexpected official GIS object IDs")
    expected = sorted(ids)
    page_size = min(PAGE_SIZE, max_records)
    features = []
    for offset in range(0, count, page_size):
        params = dict(where=where, outFields=",".join(fields), returnGeometry=str(geometry).lower(),
                      orderByFields="OBJECTID ASC", resultOffset=offset, resultRecordCount=page_size)
        if geometry:
            params["outSR"] = 4326
        page = capture.read(base + "/query", **params)
        batch = page.get("features")
        if not isinstance(batch, list) or len(batch) != min(page_size, count - offset):
            raise PopulationContextError("Truncated official GIS feature page")
        actual = []
        for feature in batch:
            if not isinstance(feature, dict) or not isinstance(feature.get("attributes"), dict):
                raise PopulationContextError("Invalid GIS feature structure")
            actual.append(_integer(feature["attributes"].get("OBJECTID"), "feature object ID", 1))
        if actual != expected[offset:offset + page_size]:
            raise PopulationContextError("GIS page does not match the complete ordered ID inventory")
        if offset + len(batch) == count and page.get("exceededTransferLimit"):
            raise PopulationContextError("Final official GIS page remains transfer-limited")
        if geometry:
            sr = page.get("spatialReference", {})
            if sr.get("latestWkid", sr.get("wkid")) != 4326:
                raise PopulationContextError("Basin polygons are not returned in WGS84")
        features.extend(batch)
    after = _integer(capture.read(base + "/query", fresh=True, where=where, returnCountOnly="true").get("count"), "post-capture count", 1)
    if after != count:
        raise PopulationContextError("Official GIS inventory changed during capture")
    return features, metadata


def _polygon(geometry):
    if geometry is None:
        return None
    if not isinstance(geometry, dict):
        raise PopulationContextError("Invalid basin geometry object")
    if not geometry.get("rings"):
        return None
    rings = geometry["rings"]
    if not isinstance(rings, list):
        raise PopulationContextError("Invalid basin polygon rings")
    clean = []
    for ring in rings:
        if not isinstance(ring, list) or len(ring) < 4:
            raise PopulationContextError("Invalid basin polygon ring")
        points = []
        for vertex in ring:
            if not isinstance(vertex, list) or len(vertex) < 2:
                raise PopulationContextError("Invalid basin polygon vertex")
            points.append((_coordinate(vertex[0], "basin longitude", -180, 180), _coordinate(vertex[1], "basin latitude", -90, 90)))
        if points[0] != points[-1] or len(set(points)) < 3:
            raise PopulationContextError("Basin polygon ring is open or degenerate")
        twice_area = sum(ax * by - bx * ay for (ax, ay), (bx, by) in zip(points, points[1:]))
        if abs(twice_area) < 1e-14:
            raise PopulationContextError("Basin polygon ring has no measurable area")
        clean.append(points)
    xs = [v[0] for ring in clean for v in ring]
    ys = [v[1] for ring in clean for v in ring]
    return {"rings": clean, "bbox": (min(xs), min(ys), max(xs), max(ys))}


def _ring_contains(x, y, ring):
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        dx, dy = bx - ax, by - ay
        if abs((x - ax) * dy - (y - ay) * dx) <= 1e-12 and min(ax, bx) - 1e-10 <= x <= max(ax, bx) + 1e-10 and min(ay, by) - 1e-10 <= y <= max(ay, by) + 1e-10:
            return 2  # boundary: include, then deduplicate GEOID across areas
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return int(inside)


def point_in_polygon(x, y, polygon):
    """Even-odd rings support holes and disjoint parts, including boundaries."""
    left, bottom, right, top = polygon["bbox"]
    if not left - 1e-10 <= x <= right + 1e-10 or not bottom - 1e-10 <= y <= top + 1e-10:
        return 0
    inside = False
    for ring in polygon["rings"]:
        status = _ring_contains(x, y, ring)
        if status == 2:
            return 2
        if status:
            inside = not inside
    return int(inside)


def _source(identifier, url, title, reference, timestamp, records, **extra):
    return {"id": identifier, "url": url, "title": title, "referencePeriod": reference,
            "retrievedAt": timestamp, "sha256": hashlib.sha256(_canonical(records)).hexdigest(),
            "hashBasis": "SHA256 of canonical JSON capture manifest (URL, response SHA256 and byte length)",
            "captures": records, **extra}


def collect_population_context(inventory, fetch=fetch_bytes, now=None):
    """Return validated population-only context; never write/allocate customers.

    ``inventory`` is the parsed public-stations.json document. Missing linked
    geometry or failed completeness/aggregate controls raises PopulationContextError
    so orchestration can retain its last-good artifact rather than publish zeroes.
    """
    timestamp = _now(now)
    stations = inventory.get("stations") if isinstance(inventory, dict) else None
    if not isinstance(stations, list) or not stations:
        raise PopulationContextError("Public station inventory is missing or empty")
    station_ids, station_points, seen_ids = defaultdict(list), [], set()
    for station in stations:
        if not isinstance(station, dict):
            raise PopulationContextError("Invalid public station record")
        identifier, basin = station.get("id"), station.get("basin")
        if not isinstance(identifier, str) or not identifier or identifier in seen_ids or not isinstance(basin, str) or not basin.strip() or basin != basin.strip():
            raise PopulationContextError("Station IDs/basin labels must be unique, nonempty exact source strings")
        seen_ids.add(identifier)
        station_ids[basin].append(identifier)
        station_points.append((identifier, basin, _coordinate(station.get("lon"), "station longitude", -180, 180), _coordinate(station.get("lat"), "station latitude", -90, 90)))

    city = Capture(fetch)
    basin_features, metadata = _features(city, BASIN_URL, "1=1", ["OBJECTID", "BASINID"], True)
    polygons, source_ids, empty = defaultdict(list), defaultdict(list), []
    for feature in basin_features:
        attrs = feature["attributes"]
        basin = attrs.get("BASINID")
        if not isinstance(basin, str) or not basin.strip() or basin != basin.strip():
            raise PopulationContextError("Invalid source BASINID string")
        source_ids[basin].append(attrs["OBJECTID"])
        polygon = _polygon(feature.get("geometry"))
        if polygon is None:
            empty.append({"basinId": basin, "objectId": attrs["OBJECTID"]})
        else:
            polygons[basin].append(polygon)
    missing = set(station_ids) - set(source_ids)
    incomplete = {row["basinId"] for row in empty} & set(station_ids)
    if missing or incomplete or any(not polygons[basin] for basin in station_ids):
        raise PopulationContextError("Missing or incomplete geometry for station-linked basin labels: " + ", ".join(sorted(missing | incomplete)))

    census = Capture(fetch)
    fields = ["OBJECTID", "GEOID", "POP100", "HU100", "INTPTLAT", "INTPTLON"]
    block_features, _ = _features(census, CENSUS_URL, COUNTY_WHERE, fields)
    statistics = [{"statisticType": "sum", "onStatisticField": "POP100", "outStatisticFieldName": "population"},
                  {"statisticType": "sum", "onStatisticField": "HU100", "outStatisticFieldName": "housingUnits"},
                  {"statisticType": "count", "onStatisticField": "POP100", "outStatisticFieldName": "popNonNull"},
                  {"statisticType": "count", "onStatisticField": "HU100", "outStatisticFieldName": "housingNonNull"}]
    aggregate = census.read(CENSUS_URL + "/query", where=COUNTY_WHERE, outStatistics=json.dumps(statistics, separators=(",", ":")))
    aggregate_rows = aggregate.get("features")
    if not isinstance(aggregate_rows, list) or len(aggregate_rows) != 1 or aggregate.get("exceededTransferLimit"):
        raise PopulationContextError("Missing independent county aggregate controls")
    totals = aggregate_rows[0].get("attributes", {})
    controls = {key: _integer(totals.get(key), "county " + key) for key in ("population", "housingUnits", "popNonNull", "housingNonNull")}
    blocks, county_population, county_housing = [], 0, 0
    seen_blocks = set()
    for feature in block_features:
        attrs = feature["attributes"]
        geoid = attrs.get("GEOID")
        if not isinstance(geoid, str) or not re.fullmatch(r"12103[0-9]{10}", geoid) or geoid in seen_blocks:
            raise PopulationContextError("Invalid, duplicate or out-of-county Census block GEOID")
        seen_blocks.add(geoid)
        population = _integer(attrs.get("POP100"), "Census block POP100")
        housing = _integer(attrs.get("HU100"), "Census block HU100")
        x = _coordinate(attrs.get("INTPTLON"), "Census internal longitude", -180, 180)
        y = _coordinate(attrs.get("INTPTLAT"), "Census internal latitude", -90, 90)
        blocks.append((geoid, population, housing, x, y))
        county_population += population
        county_housing += housing
    if (county_population, county_housing, len(blocks), len(blocks)) != tuple(controls[key] for key in ("population", "housingUnits", "popNonNull", "housingNonNull")):
        raise PopulationContextError("Complete block capture does not match independent county population/housing controls")

    areas = {basin: {"id": basin, "label": "City-published sewer sub-basin " + basin,
                     "blockIds": [], "population": 0, "housingUnits": 0, "referenceYear": 2020,
                     "populationBasis": "Geographic whole-block internal-point assignment; not wastewater customers or dependent/affected people.",
                     "stationIds": sorted(station_ids[basin]), "sourceObjectIds": sorted(source_ids[basin]),
                     "sourceIds": SOURCE_IDS.copy(), "geometryComplete": True}
             for basin in sorted(station_ids)}
    selected_blocks, overlap_count, boundary_ids = [], 0, set()
    for geoid, population, housing, x, y in blocks:
        matches = []
        for basin, area in areas.items():
            hits = [point_in_polygon(x, y, polygon) for polygon in polygons[basin]]
            if any(hits):
                matches.append(basin)
                area["blockIds"].append(geoid)
                area["population"] += population
                area["housingUnits"] += housing
            if 2 in hits:
                boundary_ids.add(geoid)
        if matches:
            selected_blocks.append({"id": geoid, "population": population, "housingUnits": housing,
                                    "referenceYear": 2020, "sourceIds": ["census-2020-blocks"]})
        if len(matches) > 1:
            overlap_count += 1
    for area in areas.values():
        area["blockIds"].sort()
        area["blockCount"] = len(area["blockIds"])
    selected_blocks.sort(key=lambda row: row["id"])
    outside_ids = [identifier for identifier, basin, x, y in station_points if not any(point_in_polygon(x, y, polygon) for polygon in polygons[basin])]
    city_basins = {station["basin"] for station in stations if station.get("isCityOwned") is True}
    city_blocks = {block_id for basin in city_basins for block_id in areas[basin]["blockIds"]}
    coverage = {"citySourceFeatures": len(basin_features), "cityUniqueBasinIds": len(source_ids),
                "stationLinkedAreaCount": len(areas), "stationsWithExactBasinIdMatch": len(stations),
                "stationCount": len(stations), "unmatchedStationIds": [],
                "invalidGeometrySourceRecords": empty, "invalidGeometryStationLinkedAreas": [],
                "countyBlockCount": len(blocks), "countyPopulation": county_population,
                "countyHousingUnits": county_housing, "countyPopulationNonNullCount": controls["popNonNull"],
                "countyHousingNonNullCount": controls["housingNonNull"],
                "populationBlockCountInStationLinkedFootprints": len(selected_blocks),
                "deduplicatedPopulationAllRegisterFootprints": sum(block["population"] for block in selected_blocks),
                "deduplicatedPopulationCityOwnedFootprints": sum(block["population"] for block in selected_blocks if block["id"] in city_blocks),
                "overlappingPopulationBlockCount": overlap_count, "boundaryInternalPointCount": len(boundary_ids),
                "returnedTransferLimitExceeded": False, "stationPointInsideLabeledBasinCount": len(stations) - len(outside_ids),
                "stationPointsOutsideLabeledBasinIds": sorted(outside_ids)}
    sources = [_source(SOURCE_IDS[0], BASIN_URL, "City of St. Petersburg PublicWastewater · Sewer Sub Basin",
                       "Current public GIS inventory; not operational telemetry", timestamp, city.records,
                       method="Exact station basin label to BASINID match; multipart source features unioned; no inferred hydraulic crosswalk."),
               _source(SOURCE_IDS[1], CENSUS_URL, "U.S. Census Bureau TIGERweb · 2020 Census Blocks · POP100/HU100",
                       "2020 Census population/housing counts; January 1, 2020 geographic vintage", timestamp, census.records,
                       referenceYear=2020, method="Complete Pinellas County block capture; exact ID inventory, unique GEOIDs, non-null population/housing and independent county control totals validated."),
               {"id": SOURCE_IDS[2], "url": STATION_URL, "title": "City publicly published station basin labels",
                "referencePeriod": "Public GIS asset register; not service/customer measurements",
                "retrievedAt": inventory.get("capturedAt", timestamp), "sha256": hashlib.sha256(_canonical(inventory)).hexdigest(),
                "hashBasis": "SHA256 of canonical JSON parsed public-stations.json input"}]
    edited = metadata.get("editingInfo", {}).get("lastEditDate")
    if edited is not None:
        try:
            sources[0]["publishedAt"] = datetime.fromtimestamp(_integer(edited, "basin lastEditDate") / 1000, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
            if sources[0]["publishedAt"] > timestamp:
                raise PopulationContextError("City source edit timestamp is later than capture time")
        except (OverflowError, OSError, ValueError) as exc:
            raise PopulationContextError("Invalid City source edit timestamp") from exc
    return {"sources": sources, "areas": list(areas.values()), "populationBlocks": selected_blocks,
            "populationMethod": POPULATION_METHOD, "populationCoverage": coverage,
            "populationLimitations": LIMITATIONS.copy()}
