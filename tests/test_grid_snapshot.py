"""Offline checks for real-data reduction, time alignment, and safe snapshot refresh."""
import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("grid_refresh", Path(__file__).resolve().parents[1] / "scripts/refresh_grid_snapshot.py")
grid = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(grid)


class GridSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.balance = self.directory / "balance.csv"
        self.interchange = self.directory / "interchange.csv"
        self.balance_columns = ["Balancing Authority", grid.TIME_COLUMN, *grid.METRICS.values(), "Net Generation (MW) from Coal", "Demand (MW) (Adjusted)"]
        self.edge_columns = ["Balancing Authority", "Directly Interconnected Balancing Authority", grid.TIME_COLUMN, "Interchange (MW)"]

    def tearDown(self):
        self.temp.cleanup()

    def write_csv(self, path, columns, rows):
        with path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)

    def fixtures(self):
        self.write_csv(self.balance, self.balance_columns, [
            {"Balancing Authority": "ABC", grid.TIME_COLUMN: "10/14/2026 4:00:00 AM", "Demand (MW)": "9999"},
            {"Balancing Authority": "ABC", grid.TIME_COLUMN: "10/22/2026 4:00:00 AM", "Demand (MW)": "100", "Demand Forecast (MW)": "80", "Net Generation (MW)": "110", "Total Interchange (MW)": "10", "Net Generation (MW) from Coal": "0", "Demand (MW) (Adjusted)": "9000"},
            # Newer forecasts are not actual demand and must not overwrite the 04:00 comparison.
            {"Balancing Authority": "ABC", grid.TIME_COLUMN: "10/22/2026 5:00:00 AM", "Demand Forecast (MW)": "800", "Demand (MW) (Adjusted)": "7000"},
            {"Balancing Authority": "DEF", grid.TIME_COLUMN: "10/22/2026 5:00:00 AM", "Demand (MW)": "0", "Demand Forecast (MW)": "0", "Net Generation (MW)": "0", "Total Interchange (MW)": "0"},
        ])
        self.write_csv(self.interchange, self.edge_columns, [
            {"Balancing Authority": "ABC", "Directly Interconnected Balancing Authority": "DEF", grid.TIME_COLUMN: "10/22/2026 4:00:00 AM", "Interchange (MW)": "12"},
            {"Balancing Authority": "ABC", "Directly Interconnected Balancing Authority": "DEF", grid.TIME_COLUMN: "10/22/2026 5:00:00 AM", "Interchange (MW)": "0"},
            {"Balancing Authority": "DEF", "Directly Interconnected Balancing Authority": "ABC", grid.TIME_COLUMN: "10/22/2026 5:00:00 AM", "Interchange (MW)": ""},
        ])

    def test_raw_measurements_align_to_latest_actual_hour(self):
        self.fixtures()
        snapshot = grid.build_snapshot(self.balance, self.interchange, "2026-10-23T00:00:00+00:00", [])
        abc = {kind: (period, value) for code, kind, period, value in snapshot["snap"] if code == "ABC"}
        self.assertEqual(abc["DF"], ("2026-10-22T04", 80))
        self.assertEqual(abc["D"], ("2026-10-22T04", 100))
        self.assertEqual(snapshot["history"]["ABC"], [["2026-10-22T04", 100]])
        self.assertEqual(snapshot["history"]["DEF"], [["2026-10-22T05", 0]])
        self.assertEqual(snapshot["interchange"], [["ABC", "DEF", 0, "2026-10-22T05"]])
        self.assertEqual(snapshot["fuel"]["ABC"], ["2026-10-22T04", {"COL": 0}])
        self.assertEqual(json.loads(grid.encode_snapshot(snapshot)), snapshot)

    def test_missing_actual_demand_refuses_to_replace_html(self):
        self.fixtures()
        self.write_csv(self.balance, self.balance_columns, [{"Balancing Authority": "ABC", grid.TIME_COLUMN: "10/22/2026 4:00:00 AM", "Demand Forecast (MW)": "80"}])
        output = self.directory / "index.html"
        output.write_text('<script type="application/json" id="grid-snapshot">{"preserve":true}</script>')
        before = output.read_bytes()
        with self.assertRaisesRegex(ValueError, "No measured EIA demand"):
            grid.refresh(self.directory, grid.source_urls("2026_Jul_Dec"), "2026-10-23T00:00:00+00:00", output)
        self.assertEqual(output.read_bytes(), before)

    def test_refresh_preserves_application_and_records_provenance(self):
        self.fixtures()
        output = self.directory / "index.html"
        output.write_text('before<script type="application/json" id="grid-snapshot">{}</script>after')
        sources = grid.source_urls("2026_Jul_Dec")
        data = grid.refresh(self.directory, sources, "2026-10-23T00:00:00+00:00", output)
        self.assertTrue(output.read_text().startswith('before<script'))
        self.assertTrue(output.read_text().endswith('</script>after'))
        self.assertEqual(data["sources"][0]["url"], sources[0])
        self.assertEqual(len(data["sources"][0]["sha256"]), 64)
        self.assertEqual(data["capturedAt"], "2026-10-23T00:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
