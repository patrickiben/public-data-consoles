"""Offline publication/provenance guards for the distinct official public inventory."""
import collections
import json
import math
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
COASTAL = ROOT / "consoles/coastal-water-resilience"


class PublicInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((COASTAL / "data/public-stations.json").read_text())

    def test_portable_inventory_matches_offline_html(self):
        html = (COASTAL / "index.html").read_text()
        match = re.search(r'<script type="application/json" id="public-station-snapshot">(.*?)</script>',
                          html, re.S)
        self.assertIsNotNone(match)
        self.assertEqual(json.loads(match.group(1)), self.data,
                         "Update the embedded offline inventory and portable JSON together")
        context = re.search(r'<script type="application/json" id="coastal-context-sources">(.*?)</script>', html, re.S)
        self.assertIsNotNone(context)
        catalog = json.loads((COASTAL / "data/context-sources.json").read_text())
        self.assertEqual(json.loads(context.group(1)), catalog["sources"],
                         "Update the embedded and portable source catalogs together")

    def test_coverage_and_unknown_zones_are_reconciled(self):
        data = self.data
        stations, coverage = data["stations"], data["completeness"]
        self.assertEqual(len(stations), coverage["returnedPublicRegisterRecords"])
        self.assertEqual(len(stations), coverage["publicRegisterQueryCount"])
        self.assertFalse(coverage["exceededTransferLimit"])
        self.assertEqual(len({s["id"] for s in stations}), len(stations))
        self.assertEqual(sum(s["isCityOwned"] and s["isCityMaintained"] for s in stations),
                         coverage["cityOwnedMaintainedCurrent"])
        zones = collections.Counter()
        for station in stations:
            for key in ("lat", "lon"):
                self.assertTrue(math.isfinite(station[key]))
            if station["zoneMatchStatus"] == "matched":
                self.assertIsNotNone(station["officialZone"])
            else:
                self.assertIsNone(station["officialZone"],
                                  "No polygon match cannot become a non-evacuation classification")
            zones[station["officialZone"] or "Unknown"] += 1
        self.assertEqual(dict(zones), coverage["zoneCounts"])

    def test_terrain_has_independent_raster_and_datum_provenance(self):
        source = next(s for s in self.data["sources"] if s["id"] == "usgs-epqs")
        rasters = {r["rasterId"] for r in source["rasters"]}
        valid = 0
        for station in self.data["stations"]:
            value = station.get("groundElevationFt")
            if value is None:
                continue
            self.assertIsInstance(value, (int, float))
            self.assertTrue(math.isfinite(value))  # Zero is valid terrain, not missing.
            self.assertEqual(station["elevationVerticalDatum"], "NAVD88")
            self.assertIn(station["elevationRasterId"], rasters)
            self.assertRegex(station["elevationResponseSha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(station["elevationAcquisitionDate"])
            valid += 1
        self.assertEqual(valid, self.data["elevation"]["validCount"])
        self.assertEqual(len(self.data["stations"]) - valid, self.data["elevation"]["missingCount"])


if __name__ == "__main__":
    unittest.main()
