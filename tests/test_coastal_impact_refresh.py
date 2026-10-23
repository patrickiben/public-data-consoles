"""Publication guards for automatically sourced coastal context (no network)."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("coastal_refresh", Path(__file__).resolve().parents[1] / "scripts/refresh_coastal_impact.py")
refresh = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(refresh)
NOW = dt.datetime(2026, 10, 23, 18, tzinfo=dt.timezone.utc)
INVENTORY = {"stations": [{"id": "asset-a", "basin": "101"}, {"id": "asset-b", "basin": "102"}]}


def fixture():
    return {"schemaVersion": 1, "capturedAt": "2026-10-23T17:00:00Z", "sources": [
        {"id": "public", "url": "https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020", "title": "Official source", "sha256": "a" * 64}],
        "areas": [{"id": "101", "blockIds": ["121030001001001"], "sourceIds": ["public"]},
                  {"id": "102", "blockIds": ["121030001001001", "121030001001002"], "sourceIds": ["public"]}],
        "populationBlocks": [{"id": "121030001001001", "population": 100, "referenceYear": 2020, "sourceIds": ["public"]},
                             {"id": "121030001001002", "population": 0, "referenceYear": 2020, "sourceIds": ["public"]}],
        "flowAggregates": [{"id": "plant-a", "averageDailyFlowMGD": 2, "period": "2025 annual average", "sourceIds": ["public"]}],
        "populationMethod": "Deduplicated block internal-point footprint, not customers", "limitations": ["No outage attribution"]}


class CoastalRefreshTests(unittest.TestCase):
    def test_zero_population_and_shared_blocks_are_valid(self):
        payload = fixture()
        self.assertIs(refresh.validate(payload, INVENTORY, now=NOW), payload)

    def test_partial_or_duplicate_or_dangling_population_is_refused(self):
        variants = []
        missing = fixture(); missing["areas"].pop(); variants.append(missing)
        duplicate = fixture(); duplicate["populationBlocks"].append(copy.deepcopy(duplicate["populationBlocks"][0])); variants.append(duplicate)
        dangling = fixture(); dangling["areas"][0]["blockIds"] = ["121030001009999"]; variants.append(dangling)
        null = fixture(); null["populationBlocks"][0]["population"] = None; variants.append(null)
        future = fixture(); future["populationBlocks"][0]["referenceYear"] = 2027; variants.append(future)
        unsafe = fixture(); unsafe["populationBlocks"][0]["population"] = 2**53; variants.append(unsafe)
        for payload in variants:
            with self.subTest(payload=payload), self.assertRaises(refresh.RefreshError):
                refresh.validate(payload, INVENTORY, now=NOW)

    def test_unverifiable_sources_and_future_capture_are_refused(self):
        for key, value in (("url", "https://unverified.example/data"), ("sha256", "missing"), ("id", "")):
            payload = fixture(); payload["sources"][0][key] = value
            with self.subTest(key=key), self.assertRaises(refresh.RefreshError):
                refresh.validate(payload, INVENTORY, now=NOW)
        payload = fixture(); payload["capturedAt"] = "2026-10-24T17:00:00Z"
        with self.assertRaisesRegex(refresh.RefreshError, "future"):
            refresh.validate(payload, INVENTORY, now=NOW)

    def test_invalid_throughput_or_period_cannot_be_published(self):
        for value in (None, -1, float("inf"), float("nan"), True):
            payload = fixture(); payload["flowAggregates"][0]["averageDailyFlowMGD"] = value
            with self.subTest(value=value), self.assertRaises(refresh.RefreshError):
                refresh.validate(payload, INVENTORY, now=NOW)
        payload = fixture(); payload["flowAggregates"][0]["sourceIds"] = ["missing-source"]
        with self.assertRaises(refresh.RefreshError):
            refresh.validate(payload, INVENTORY, now=NOW)
        payload = fixture(); payload["flowAggregates"][0]["averageDailyFlowMGD"] = 1e308
        with self.assertRaises(refresh.RefreshError):
            refresh.validate(payload, INVENTORY, now=NOW)

    def test_offline_outputs_preserve_program_and_escape_source_text(self):
        payload = fixture(); payload["sources"][0]["title"] = "A </script><script>bad()</script> label"
        html = '<html><script type="application/json" id="coastal-impact-context">{}</script><script>original()</script></html>'
        result = refresh.outputs(payload, html)
        updated = result[refresh.HTML].decode()
        self.assertIn('<script>original()</script>', updated)
        self.assertNotIn('<script>bad()', updated)
        self.assertEqual(json.loads(refresh.embedded(updated).group(2)), payload)
        self.assertEqual(json.loads(result[refresh.CONTEXT]), payload)
        with self.assertRaisesRegex(refresh.RefreshError, "exactly one"):
            refresh.outputs(payload, html + html)
        with self.assertRaisesRegex(refresh.RefreshError, "exactly one"):
            refresh.outputs(payload, '<html>No marker</html>')


if __name__ == "__main__":
    unittest.main()
