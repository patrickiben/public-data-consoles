"""Protect sampling, truncated history, provenance and all-or-nothing validation."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
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
        first = next(iter(json.loads(refresh.MACRO.search((folder / "index.html").read_text()).group(1))))
        (csv_dir / (first + ".csv")).write_text("observation_date," + first + "\n2026-01-01,inf\n")
        with self.assertRaises(ValueError):
            refresh.refresh_repository(self.folder, csv_dir, self.retrieved)
        self.assertEqual(before, {p: p.read_bytes() for p in folder.iterdir()})


class FredAutomationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.folder = self.root / "consoles/resilience-telemetry"
        (self.folder / "data").mkdir(parents=True)
        text = (ROOT / "consoles/resilience-telemetry/index.html").read_text()
        actual = json.loads(refresh.MACRO.search(text).group(1))
        self.baseline = {sid: {**row, "d": [100, 105], "v": [1, 2]} for sid, row in actual.items()}
        text = refresh.MACRO.sub(lambda _: "let MACRO = " + json.dumps(self.baseline) + ";", text)
        self.folder.joinpath("index.html").write_text(text)
        self.folder.joinpath("wiki.html").write_bytes((ROOT / "consoles/resilience-telemetry/wiki.html").read_bytes())
        self.raw = {}
        for sid in self.baseline:
            days = range(100, 106) if sid in refresh.SAMPLED else [100, 105]
            rows = [(refresh.EPOCH + dt.timedelta(days=d)).isoformat() + "," + str((1 + (d - 100) / 5) * (1000 if sid == "ICSA" else 1)) for d in days]
            self.raw[sid] = ("observation_date," + sid + "\n" + "\n".join(rows) + "\n").encode()
        self.calls = []

    def fetch(self, url):
        self.calls.append(url)
        return self.raw[url.split("id=")[1]]

    def files(self):
        return {p: p.read_bytes() for p in self.folder.rglob("*") if p.is_file()}

    def publish(self, retrieved=dt.date(2026, 10, 23)):
        return refresh.refresh_repository(self.root, self.raw, retrieved)

    def test_downloads_all_pinned_series_and_publishes_metadata_with_embedded_fallback(self):
        self.assertTrue(refresh.refresh_repository(self.root, None, dt.datetime.now(dt.timezone.utc).date(), automatic=True, fetch=self.fetch))
        self.assertEqual(len(self.calls), 19)
        payload = json.loads((self.folder / "data/fred_snapshot.json").read_text())
        refresh.validate_payload(payload, self.baseline)
        embedded = json.loads(refresh.META.search((self.folder / "index.html").read_text()).group(1))
        self.assertEqual(embedded, {k: v for k, v in payload.items() if k != "series"})
        self.assertEqual(payload["series"]["ICSA"]["v"], [1, 2])

    def test_unchanged_recheck_preserves_all_bytes_and_original_retrieval_day(self):
        self.assertTrue(self.publish(dt.date(2026, 10, 22)))
        before = self.files()
        self.assertFalse(self.publish())
        self.assertEqual(self.files(), before)
        self.assertEqual(json.loads((self.folder / "data/fred_snapshot.json").read_text())["retrieved_on"], "2026-10-22")

    def test_valid_historical_revision_is_published_without_losing_dates_or_units(self):
        self.publish()
        sid = "UNRATE"
        self.raw[sid] = self.raw[sid].replace(b",2.0", b",2.25")
        self.assertTrue(self.publish())
        payload = json.loads((self.folder / "data/fred_snapshot.json").read_text())
        self.assertEqual(payload["series"][sid]["v"], [1, 2.25])
        self.assertEqual(payload["series"][sid]["d"], [100, 105])

    def test_failure_in_last_download_leaves_every_published_file_unchanged(self):
        self.publish()
        before = self.files()
        final = list(self.raw)[-1]
        self.raw[final] = b"<html>upstream temporary failure</html>"
        with self.assertRaises(ValueError):
            refresh.refresh_repository(self.root, None, dt.datetime.now(dt.timezone.utc).date(), automatic=True, fetch=self.fetch)
        self.assertEqual(self.files(), before)

    def test_atomic_second_replace_failure_rolls_back_three_outputs(self):
        self.publish()
        before = self.files()
        self.raw["UNRATE"] = self.raw["UNRATE"].replace(b",2.0", b",2.3")
        import refresh_grid_snapshot as atomic
        original = atomic.os.replace
        count = [0]
        def fail_once(source, target):
            count[0] += 1
            if count[0] == 2:
                raise OSError("fixture second-file write failure")
            return original(source, target)
        with patch.object(atomic.os, "replace", side_effect=fail_once), self.assertRaises(OSError):
            self.publish()
        self.assertEqual(self.files(), before)

    def test_payload_provenance_and_observation_mismatch_are_rejected(self):
        self.publish()
        payload = json.loads((self.folder / "data/fred_snapshot.json").read_text())
        for change in [lambda p: p.update(schema_version=2), lambda p: p.update(schemaVersion=True), lambda p: p["sources"].pop(),
                       lambda p: p["sources"][0].update(embedded_last="2000-01-01"),
                       lambda p: p["sources"][0].update(url="https://unverified.example/data.csv"),
                       lambda p: p["series"]["UNRATE"]["d"].pop(),
                       lambda p: p["series"]["UNRATE"]["v"].__setitem__(0, float("inf"))]:
            candidate = json.loads(json.dumps(payload))
            change(candidate)
            with self.subTest(change=change), self.assertRaises(ValueError):
                refresh.validate_payload(candidate, self.baseline)

    def test_unchanged_sources_cannot_hide_a_missing_embedded_metadata_block(self):
        self.publish()
        page = self.folder / "index.html"
        page.write_text(refresh.META.sub("", page.read_text()))
        before = self.files()
        with self.assertRaisesRegex(ValueError, "embedded metadata disagree"):
            self.publish()
        self.assertEqual(self.files(), before)

    def test_future_capture_and_source_ending_before_embedded_tail_are_rejected(self):
        self.publish()
        payload = json.loads((self.folder / "data/fred_snapshot.json").read_text())
        now = dt.datetime(2026, 10, 23, 18, tzinfo=dt.timezone.utc)
        candidate = json.loads(json.dumps(payload))
        candidate.update(capturedAt="2026-10-24T00:00:00Z", retrieved_on="2026-10-24")
        with self.assertRaisesRegex(ValueError, "future"):
            refresh.validate_payload(candidate, self.baseline, now=now)
        candidate = json.loads(json.dumps(payload))
        candidate["capturedAt"] = "2026-10-23T18:06:00Z"
        with self.assertRaisesRegex(ValueError, "future"):
            refresh.validate_payload(candidate, self.baseline, now=now)
        candidate = json.loads(json.dumps(payload))
        source = next(s for s in candidate["sources"] if s["series"] == "UNRATE")
        source["source_last"] = source["source_first"]
        with self.assertRaisesRegex(ValueError, "source/retrieval"):
            refresh.validate_payload(candidate, self.baseline, now=now)

    def test_transient_download_failure_retries_boundedly_but_bad_redirect_does_not(self):
        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE"
        response = MagicMock()
        response.__enter__.return_value = response
        response.geturl.return_value = url
        response.read.return_value = b"observation_date,UNRATE\n2026-10-01,4.2\n"
        with patch.object(refresh, "urlopen", side_effect=[TimeoutError("fixture"), response]) as opener, patch.object(refresh.time, "sleep"):
            self.assertEqual(refresh.fetch_csv(url), response.read.return_value)
            self.assertEqual(opener.call_count, 2)
        with patch.object(refresh, "urlopen", side_effect=TimeoutError("fixture")) as opener, patch.object(refresh.time, "sleep"), self.assertRaises(TimeoutError):
            refresh.fetch_csv(url)
        self.assertEqual(opener.call_count, 3)
        response.geturl.return_value = "https://unexpected.example/feed"
        with patch.object(refresh, "urlopen", return_value=response) as opener, self.assertRaises(ValueError):
            refresh.fetch_csv(url)
        self.assertEqual(opener.call_count, 1)


if __name__ == "__main__":
    unittest.main()
