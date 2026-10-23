"""Offline GIS fixtures: complete captures, exact basin joins and deduplication."""
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import parse_qs, urlparse


SPEC = importlib.util.spec_from_file_location("coastal_population", Path(__file__).parents[1] / "scripts/coastal_population.py")
population = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = population
SPEC.loader.exec_module(population)
NOW = datetime(2026, 10, 23, 18, 0, tzinfo=timezone.utc)


def square(x1, y1, x2, y2):
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]


def basin(oid, identifier, rings):
    return {"attributes": {"OBJECTID": oid, "BASINID": identifier}, "geometry": {"rings": rings} if rings else None}


def block(oid, population_count, housing, lon, lat):
    return {"attributes": {"OBJECTID": oid, "GEOID": "12103" + str(oid).zfill(10),
                            "POP100": population_count, "HU100": housing,
                            "INTPTLON": str(lon), "INTPTLAT": str(lat)}}


class OfficialFixtures:
    def __init__(self):
        # A has two disjoint source features. B overlaps A; a count may be zero.
        self.basins = [basin(1, "A", [square(-83, 27, -82, 28)]),
                       basin(2, "A", [square(-81.8, 27, -81.4, 28)]),
                       basin(3, "B", [square(-82.6, 27, -81.5, 28)]),
                       basin(4, "UNLINKED", None)]
        self.blocks = [block(1, 10, 4, -82.8, 27.5), block(2, 20, 5, -82.4, 27.5),
                       block(3, 0, 1, -81.6, 27.5), block(4, 5, 1, -84, 27.5)]
        self.inventory = {"capturedAt": "2026-10-23T17:00:00Z", "stations": [
            {"id": "PUBLIC-1", "basin": "A", "lon": -82.8, "lat": 27.5, "isCityOwned": True},
            {"id": "PUBLIC-2", "basin": "A", "lon": -82.8, "lat": 27.5, "isCityOwned": False},
            {"id": "PUBLIC-3", "basin": "B", "lon": -82.4, "lat": 27.5, "isCityOwned": True}]}
        self.calls = []
        self.edit_response = None

    def fetch(self, url):
        self.calls.append(url)
        parsed = urlparse(url)
        query = {key: values[0] for key, values in parse_qs(parsed.query).items()}
        city = url.startswith(population.BASIN_URL)
        rows = self.basins if city else self.blocks
        if not parsed.path.endswith("/query"):
            names = ["OBJECTID", "BASINID"] if city else ["OBJECTID", "GEOID", "POP100", "HU100", "INTPTLAT", "INTPTLON"]
            # Force several pages even on this small fixture.
            result = {"fields": [{"name": name} for name in names], "maxRecordCount": 2}
        elif query.get("returnCountOnly") == "true":
            result = {"count": len(rows)}
        elif query.get("returnIdsOnly") == "true":
            result = {"objectIdFieldName": "OBJECTID", "objectIds": [row["attributes"]["OBJECTID"] for row in rows]}
        elif "outStatistics" in query:
            result = {"features": [{"attributes": {
                "population": sum(row["attributes"]["POP100"] for row in self.blocks if row["attributes"]["POP100"] is not None),
                "housingUnits": sum(row["attributes"]["HU100"] for row in self.blocks if row["attributes"]["HU100"] is not None),
                "popNonNull": sum(row["attributes"]["POP100"] is not None for row in self.blocks),
                "housingNonNull": sum(row["attributes"]["HU100"] is not None for row in self.blocks)}}]}
        else:
            start, size = int(query["resultOffset"]), int(query["resultRecordCount"])
            result = {"features": deepcopy(rows[start:start + size]), "exceededTransferLimit": start + size < len(rows)}
            if city:
                result["spatialReference"] = {"wkid": 4326}
        if self.edit_response:
            result = self.edit_response(url, query, result)
        return json.dumps(result, separators=(",", ":")).encode()

    def collect(self, now=NOW):
        return population.collect_population_context(self.inventory, fetch=self.fetch, now=now)


class PopulationCollectionTests(unittest.TestCase):
    def test_complete_exact_join_multipart_overlap_and_zero_population(self):
        fixture = OfficialFixtures()
        result = fixture.collect()
        areas = {row["id"]: row for row in result["areas"]}
        self.assertEqual(set(areas), {"A", "B"})
        self.assertEqual(areas["A"]["sourceObjectIds"], [1, 2])
        self.assertEqual(areas["A"]["stationIds"], ["PUBLIC-1", "PUBLIC-2"])
        self.assertEqual(areas["A"]["population"], 30)
        self.assertEqual(areas["B"]["population"], 20)
        self.assertEqual(len(result["populationBlocks"]), 3)
        self.assertEqual(result["populationBlocks"][-1]["population"], 0)
        coverage = result["populationCoverage"]
        self.assertEqual(coverage["countyBlockCount"], 4)
        self.assertEqual(coverage["countyPopulation"], 35)
        self.assertEqual(coverage["deduplicatedPopulationAllRegisterFootprints"], 30)
        self.assertEqual(coverage["deduplicatedPopulationCityOwnedFootprints"], 30)
        self.assertEqual(coverage["overlappingPopulationBlockCount"], 2)
        self.assertEqual(coverage["invalidGeometrySourceRecords"], [{"basinId": "UNLINKED", "objectId": 4}])
        self.assertTrue(all(row["geometryComplete"] for row in areas.values()))
        self.assertIn("not a customer", result["populationMethod"])
        self.assertNotIn("affectedPopulation", result)

    def test_no_equal_station_allocation_and_no_nearest_basin_repair(self):
        fixture = OfficialFixtures()
        fixture.inventory["stations"][0]["lon"] = -84
        result = fixture.collect()
        self.assertEqual(result["populationCoverage"]["stationPointsOutsideLabeledBasinIds"], ["PUBLIC-1"])
        self.assertEqual(result["areas"][0]["population"], 30)
        fixture.inventory["stations"][0]["basin"] = "NO-SOURCE-LABEL"
        with self.assertRaisesRegex(population.PopulationContextError, "Missing or incomplete"):
            fixture.collect()

    def test_linked_missing_geometry_does_not_become_zero_population(self):
        fixture = OfficialFixtures()
        fixture.basins[0]["geometry"] = None
        with self.assertRaisesRegex(population.PopulationContextError, "Missing or incomplete"):
            fixture.collect()

    def test_polygon_hole_and_boundaries(self):
        polygon = population._polygon({"rings": [square(0, 0, 4, 4), square(1, 1, 3, 3)]})
        self.assertEqual(population.point_in_polygon(0.5, 0.5, polygon), 1)
        self.assertEqual(population.point_in_polygon(2, 2, polygon), 0)
        self.assertEqual(population.point_in_polygon(1, 2, polygon), 2)
        self.assertEqual(population.point_in_polygon(5, 2, polygon), 0)

    def test_boundary_block_is_included_once_globally(self):
        fixture = OfficialFixtures()
        fixture.blocks[0]["attributes"]["INTPTLON"] = "-82.6"
        result = fixture.collect()
        self.assertEqual(result["populationCoverage"]["boundaryInternalPointCount"], 1)
        self.assertEqual(result["populationCoverage"]["deduplicatedPopulationAllRegisterFootprints"], 30)

    def test_capture_manifest_is_hashed_and_reproducible(self):
        fixture = OfficialFixtures()
        first = fixture.collect()
        later = fixture.collect(now="2026-10-24T18:00:00Z")
        self.assertEqual([row["sha256"] for row in first["sources"]], [row["sha256"] for row in later["sources"]])
        self.assertNotEqual(first["sources"][0]["retrievedAt"], later["sources"][0]["retrievedAt"])
        self.assertTrue(first["sources"][0]["captures"])
        self.assertTrue(all(len(item["sha256"]) == 64 for source in first["sources"][:2] for item in source["captures"]))
        self.assertIn("canonical JSON", first["sources"][2]["hashBasis"])

    def test_truncated_page_and_transfer_limited_final_page_fail(self):
        for mutation in (lambda row: row["features"].pop(), lambda row: row.update(exceededTransferLimit=True)):
            fixture = OfficialFixtures()
            def edit(url, query, result):
                if url.startswith(population.CENSUS_URL) and query.get("resultOffset") == "2":
                    mutation(result)
                return result
            fixture.edit_response = edit
            with self.assertRaises(population.PopulationContextError):
                fixture.collect()

    def test_object_id_inventory_duplicates_missing_or_page_reordering_fail(self):
        for mode in ("duplicate", "missing", "wrong-page"):
            fixture = OfficialFixtures()
            def edit(url, query, result):
                if url.startswith(population.CENSUS_URL):
                    if query.get("returnIdsOnly") == "true":
                        if mode == "duplicate":
                            result["objectIds"][1] = result["objectIds"][0]
                        elif mode == "missing":
                            result["objectIds"].pop()
                    if mode == "wrong-page" and query.get("resultOffset") == "0":
                        result["features"].reverse()
                return result
            fixture.edit_response = edit
            with self.assertRaises(population.PopulationContextError):
                fixture.collect()

    def test_source_count_change_during_capture_fails(self):
        fixture = OfficialFixtures()
        counts = 0
        def edit(url, query, result):
            nonlocal counts
            if url.startswith(population.CENSUS_URL) and query.get("returnCountOnly") == "true":
                counts += 1
                if counts == 2:
                    result["count"] += 1
            return result
        fixture.edit_response = edit
        with self.assertRaisesRegex(population.PopulationContextError, "changed during"):
            fixture.collect()

    def test_duplicate_or_wrong_county_geoids_fail(self):
        for bad in ("121030000000001", "120010000000001", "12103", None):
            fixture = OfficialFixtures()
            fixture.blocks[1]["attributes"]["GEOID"] = bad
            with self.assertRaisesRegex(population.PopulationContextError, "GEOID"):
                fixture.collect()

    def test_null_negative_noninteger_or_boolean_counts_fail(self):
        for value in (None, -1, 0.5, True):
            for field in ("POP100", "HU100"):
                fixture = OfficialFixtures()
                fixture.blocks[0]["attributes"][field] = value
                with self.assertRaises(population.PopulationContextError):
                    fixture.collect()

    def test_aggregate_population_housing_and_nonnull_controls_checked(self):
        for field in ("population", "housingUnits", "popNonNull", "housingNonNull"):
            fixture = OfficialFixtures()
            def edit(url, query, result):
                if "outStatistics" in query:
                    result["features"][0]["attributes"][field] += 1
                return result
            fixture.edit_response = edit
            with self.assertRaisesRegex(population.PopulationContextError, "controls"):
                fixture.collect()

    def test_bad_schema_coordinates_geometry_and_spatial_reference_fail(self):
        for mode in ("schema", "coordinate", "ring", "sr", "geometry-type", "zero-area"):
            fixture = OfficialFixtures()
            if mode == "coordinate":
                fixture.blocks[0]["attributes"]["INTPTLAT"] = "NaN"
            if mode == "ring":
                fixture.basins[0]["geometry"]["rings"][0].pop()
            if mode == "geometry-type":
                fixture.basins[0]["geometry"] = [1, 2]
            if mode == "zero-area":
                fixture.basins[0]["geometry"]["rings"] = [[[-83, 27], [-82, 27], [-81, 27], [-83, 27]]]
            def edit(url, query, result):
                if url.startswith(population.BASIN_URL):
                    if mode == "schema" and not urlparse(url).path.endswith("/query"):
                        result["fields"].pop()
                    if mode == "sr" and "resultOffset" in query:
                        result["spatialReference"] = {"wkid": 3857}
                return result
            fixture.edit_response = edit
            with self.assertRaises(population.PopulationContextError):
                fixture.collect()

    def test_city_source_edit_timestamp_is_recorded_and_cannot_be_future(self):
        for year in (2025, 2027):
            fixture = OfficialFixtures()
            def edit(url, query, result):
                if url.startswith(population.BASIN_URL) and not urlparse(url).path.endswith("/query"):
                    result["editingInfo"] = {"lastEditDate": int(datetime(year, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)}
                return result
            fixture.edit_response = edit
            if year == 2025:
                self.assertEqual(fixture.collect()["sources"][0]["publishedAt"], "2025-01-01T00:00:00Z")
            else:
                with self.assertRaises(population.PopulationContextError):
                    fixture.collect()

    def test_empty_html_arcgis_error_oversize_and_nonfinite_json_fail(self):
        for raw in (b"", b"<html>login</html>", b'{"error":{"code":499}}', b'{"count":NaN}', b"x" * (population.MAX_DOWNLOAD + 1)):
            with self.assertRaises(population.PopulationContextError):
                population.collect_population_context(OfficialFixtures().inventory, fetch=lambda url: raw, now=NOW)

    def test_bad_inventory_or_timestamp_fails_before_network(self):
        fixture = OfficialFixtures()
        for inventory in ({}, {"stations": []}, {"stations": fixture.inventory["stations"] * 2}):
            with self.assertRaises(population.PopulationContextError):
                population.collect_population_context(inventory, fetch=lambda url: self.fail("unexpected fetch"), now=NOW)
        with self.assertRaises(population.PopulationContextError):
            fixture.collect(now=datetime(2026, 10, 23))

    def test_default_fetch_restricts_official_origins(self):
        for url in ("https://example.org/data", "http://tigerweb.geo.census.gov/data", "https://user:pass@services2.arcgis.com/data"):
            with self.assertRaises(population.PopulationContextError):
                population.fetch_bytes(url)


if __name__ == "__main__":
    unittest.main()
