"""Protect sampling, truncated history, provenance and all-or-nothing validation."""
import datetime as dt
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("refresh_fred", ROOT / "scripts/refresh_fred.py")
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class FredRefreshTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.retrieved = dt.date(2026, 10, 23)

    def csv(self, sid, rows):
        text = "observation_date," + sid + "\n"
        for day, value in rows:
            text += f"{refresh.EPOCH + dt.timedelta(days=day)},{value}\n"
        path = self.folder / (sid + ".csv")
        path.write_text(text)
        return path

    def test_daily_stride_preserves_existing_dates_and_updates_values(self):
        baseline = {"T10Y2Y": {"name": "curve", "unit": "pct", "d": [100, 105], "v": [1, 2]}}
        self.csv("T10Y2Y", [(d, d / 100) for d in range(100, 112)])
        result, sources = refresh.refresh_series(baseline, self.folder, self.retrieved)
        self.assertEqual(result["T10Y2Y"]["d"], [100, 105, 110])
        self.assertEqual(result["T10Y2Y"]["v"], [1, 1.05, 1.1])
        self.assertEqual(sources[0]["sample_every"], 5)
        self.assertEqual(len(sources[0]["csv_sha256"]), 64)
        self.assertIn("fredgraph.csv?id=T10Y2Y", sources[0]["url"])

    def test_shorter_ice_window_preserves_only_the_older_prefix(self):
        baseline = {"BAMLH0A0HYM2": {"name": "spread", "unit": "pct", "d": [100, 101, 102], "v": [1, 2, 3]}}
        self.csv("BAMLH0A0HYM2", [(102, 4), (103, 5)])
        result, sources = refresh.refresh_series(baseline, self.folder, self.retrieved)
        self.assertEqual(result["BAMLH0A0HYM2"]["v"], [1, 2, 4, 5])
        self.assertEqual(sources[0]["retained_pre_source_points"], 2)

    def test_claims_are_scaled_once_to_thousands(self):
        baseline = {"ICSA": {"name": "claims", "unit": "k", "d": [100], "v": [200]}}
        self.csv("ICSA", [(100, 200000), (107, 194000)])
        result, _ = refresh.refresh_series(baseline, self.folder, self.retrieved)
        self.assertEqual(result["ICSA"]["v"], [200, 194])

    def test_invalid_csvs_and_shifted_sampling_fail(self):
        baseline = {"T10Y2Y": {"d": [100, 105], "v": [1, 2]}}
        for rows in [[(100, "nan"), (105, 2)], [(100, 1), (100, 2)], [(101, 1), (106, 2)]]:
            with self.subTest(rows=rows):
                self.csv("T10Y2Y", rows)
                with self.assertRaises(ValueError):
                    refresh.refresh_series(baseline, self.folder, self.retrieved)

    def test_stale_tail_and_interior_deleted_observations_fail(self):
        baseline = {"NFCI": {"d": [100, 107, 114], "v": [1, 2, 3]}}
        for rows in [[(100, 1), (107, 2)], [(100, 1), (114, 3)]]:
            self.csv("NFCI", rows)
            with self.assertRaises(ValueError):
                refresh.refresh_series(baseline, self.folder, self.retrieved)

    def test_missing_or_invalid_csv_leaves_all_output_files_unchanged(self):
        folder = self.folder / "consoles/resilience-telemetry"
        folder.mkdir(parents=True)
        for name in ["index.html", "wiki.html"]:
            (folder / name).write_bytes((ROOT / "consoles/resilience-telemetry" / name).read_bytes())
        before = {p: p.read_bytes() for p in folder.iterdir()}
        csv_dir = self.folder / "csv"
        csv_dir.mkdir()
        with self.assertRaises(FileNotFoundError):
            refresh.refresh_repository(self.folder, csv_dir, self.retrieved)
        self.assertEqual(before, {p: p.read_bytes() for p in folder.iterdir()})
        first = next(iter(__import__("json").loads(refresh.MACRO.search((folder / "index.html").read_text()).group(1))))
        (csv_dir / (first + ".csv")).write_text("observation_date," + first + "\n2026-01-01,inf\n")
        with self.assertRaises(ValueError):
            refresh.refresh_repository(self.folder, csv_dir, self.retrieved)
        self.assertEqual(before, {p: p.read_bytes() for p in folder.iterdir()})


if __name__ == "__main__":
    unittest.main()
