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



class AutomationTests(unittest.TestCase):
    setUp = GridSnapshotTests.setUp
    tearDown = GridSnapshotTests.tearDown
    write_csv = GridSnapshotTests.write_csv
    """Synthetic complete windows exercise discovery and publication without services."""
    CAPTURE = "2026-10-23T16:00:00+00:00"

    def complete_balance(self, filename="balance.csv", through="2026-10-22T07", hours=168, start=None):
        path = self.directory / filename
        end = grid.period_time(through)
        beginning = grid.period_time(start) if start else end - grid.dt.timedelta(hours=hours - 1)
        columns = list(dict.fromkeys([*self.balance_columns, *("Net Generation (MW) from " + c for cols in grid.FUEL_COLUMNS.values() for c in cols)]))
        rows = []
        time = beginning
        while time <= end:
            for code in ["ABC", "DEF"]:
                rows.append({"Balancing Authority": code, grid.TIME_COLUMN: time.strftime("%m/%d/%Y %I:%M:%S %p"), "Demand (MW)": str(100 + time.hour), "Demand Forecast (MW)": "100", "Net Generation (MW)": "130", "Total Interchange (MW)": "10", "Net Generation (MW) from Coal": "60"})
            time += grid.dt.timedelta(hours=1)
        self.write_csv(path, columns, rows)
        return path

    def complete_interchange(self, filename="interchange.csv", through="2026-10-21T07", hours=168, start=None):
        path = self.directory / filename
        end = grid.period_time(through)
        beginning = grid.period_time(start) if start else end - grid.dt.timedelta(hours=hours - 1)
        rows, time = [], beginning
        while time <= end:
            for source, target, value in [("ABC", "DEF", "10"), ("DEF", "ABC", "-10")]:
                rows.append({"Balancing Authority": source, "Directly Interconnected Balancing Authority": target, grid.TIME_COLUMN: time.strftime("%m/%d/%Y %I:%M:%S %p"), "Interchange (MW)": value})
            time += grid.dt.timedelta(hours=1)
        self.write_csv(path, self.edge_columns, rows)
        return path

    def complete_files(self):
        self.complete_balance()
        self.complete_interchange()

    def output(self):
        output = self.directory / "index.html"
        output.write_text('<html>preserved<script type="application/json" id="grid-snapshot">{}</script>end</html>')
        return output

    def seeded(self):
        self.complete_files()
        output = self.output()
        first = grid.refresh(self.directory, grid.source_urls("2026_Jul_Dec"), self.CAPTURE, output, automated=True)
        return output, first

    def test_manual_refresh_keeps_the_public_payload_contract(self):
        self.complete_files()
        output = self.output()
        data = grid.refresh(self.directory, grid.source_urls("2026_Jul_Dec"), self.CAPTURE, output)
        self.assertEqual(data["schemaVersion"], 1)
        self.assertEqual(data["refreshEveryHours"], 6)
        embedded = json.loads(grid.SNAPSHOT_PATTERN.search(output.read_text())[2])
        published = json.loads((self.directory / "data/latest.json").read_text())
        self.assertEqual(embedded, data)
        self.assertEqual(published, data)

    def test_noop_preserves_bytes_capture_and_mtime(self):
        output, first = self.seeded()
        latest = self.directory / "data/latest.json"
        before = (output.read_bytes(), latest.read_bytes(), output.stat().st_mtime_ns, latest.stat().st_mtime_ns)
        second = grid.refresh(self.directory, grid.source_urls("2026_Jul_Dec"), "2026-10-23T18:00:00+00:00", output, automated=True)
        self.assertEqual(second, first)
        self.assertEqual((output.read_bytes(), latest.read_bytes(), output.stat().st_mtime_ns, latest.stat().st_mtime_ns), before)
        self.assertEqual(second["refreshEveryHours"], 6)
        self.assertEqual(second["schemaVersion"], 1)

    def test_touching_source_headers_does_not_fake_new_capture(self):
        self.complete_files()
        for name in ("balance", "interchange"):
            (self.directory / (name + ".headers")).write_text("Last-Modified: Thu, 22 Oct 2026 14:40:00 GMT\n")
        output = self.output()
        first = grid.refresh(self.directory, grid.source_urls("2026_Jul_Dec"), self.CAPTURE, output, automated=True)
        for name in ("balance", "interchange"):
            (self.directory / (name + ".headers")).write_text("Last-Modified: Fri, 23 Oct 2026 14:40:00 GMT\n")
        second = grid.refresh(self.directory, grid.source_urls("2026_Jul_Dec"), "2026-10-23T18:00:00+00:00", output, automated=True)
        self.assertEqual(first, second)

    def test_missing_or_stale_json_is_repaired_without_renewing_capture(self):
        output, first = self.seeded()
        latest = self.directory / "data/latest.json"
        original_html = output.read_bytes()
        candidate = json.loads(json.dumps(first))
        candidate["capturedAt"] = "2026-10-23T18:00:00+00:00"
        for content in [None, '{}', 'not JSON']:
            with self.subTest(content=content):
                if content is None:
                    latest.unlink(missing_ok=True)
                else:
                    latest.write_text(content)
                data, changed = grid.publish_snapshot(candidate, output, automated=True)
                self.assertTrue(changed)
                self.assertEqual(data, first)
                self.assertEqual(json.loads(latest.read_text()), first)
                self.assertEqual(output.read_bytes(), original_html)

    def test_meaningful_measurement_change_updates_both_outputs(self):
        output, first = self.seeded()
        candidate = json.loads(json.dumps(first))
        candidate["capturedAt"] = "2026-10-23T18:00:00+00:00"
        candidate["history"]["ABC"][0][1] += 1
        data, changed = grid.publish_snapshot(candidate, output, automated=True)
        self.assertTrue(changed)
        self.assertEqual(data["capturedAt"], candidate["capturedAt"])
        self.assertEqual(json.loads(grid.SNAPSHOT_PATTERN.search(output.read_text())[2]), data)
        self.assertEqual(json.loads((self.directory / "data/latest.json").read_text()), data)

    def test_write_failure_rolls_back_both_outputs_and_permissions(self):
        from unittest.mock import patch
        output, first = self.seeded()
        latest = self.directory / "data/latest.json"
        before = {p: (p.read_bytes(), p.stat().st_mode) for p in [output, latest]}
        candidate = json.loads(json.dumps(first))
        candidate["capturedAt"] = "2026-10-23T18:00:00+00:00"
        candidate["history"]["ABC"][0][1] += 1
        real_replace, failed = grid.os.replace, False
        def fail_second_file(source, target):
            nonlocal failed
            if Path(target) == latest and not failed:
                failed = True
                raise OSError("injected second-output failure")
            return real_replace(source, target)
        with patch.object(grid.os, "replace", side_effect=fail_second_file):
            with self.assertRaisesRegex(OSError, "injected"):
                grid.publish_snapshot(candidate, output, automated=True)
        for path in before:
            self.assertEqual((path.read_bytes(), path.stat().st_mode), before[path])

    def test_invalid_candidate_leaves_html_and_json_untouched(self):
        output, first = self.seeded()
        latest = self.directory / "data/latest.json"
        before = (output.read_bytes(), latest.read_bytes())
        variants = []
        for field in ["demandThrough", "interchangeThrough"]:
            bad = json.loads(json.dumps(first)); bad[field] = "2026-10-10T07"; variants.append(bad)
        bad = json.loads(json.dumps(first)); bad["capturedAt"] = "2026-10-23T15:00:00+00:00"; variants.append(bad)
        bad = json.loads(json.dumps(first)); bad["history"].pop("DEF"); variants.append(bad)
        bad = json.loads(json.dumps(first)); bad["interchange"].pop(); variants.append(bad)
        bad = json.loads(json.dumps(first)); bad["history"]["ABC"] = bad["history"]["ABC"][:20]; variants.append(bad)
        for candidate in variants:
            with self.subTest(candidate_field=list(candidate)):
                with self.assertRaises(ValueError):
                    grid.publish_snapshot(candidate, output, automated=True)
                self.assertEqual((output.read_bytes(), latest.read_bytes()), before)

    def test_expired_prior_reports_can_age_out(self):
        output, first = self.seeded()
        # Keep the count change small, as for one retired BA/pair in the real network.
        for i in range(8):
            first["history"]["BA" + str(i)] = [r[:] for r in first["history"]["ABC"]]
            first["interchange"].append(["BA" + str(i), "ABC", 10, first["interchangeThrough"]])
        existing = json.loads(json.dumps(first))
        existing["history"]["OLD"] = [["2026-10-15T07", 50]]
        existing["interchange"].append(["OLD", "ABC", 10, "2026-10-15T07"])
        grid.validate_candidate(first, existing, automated=True)

    def test_short_automated_history_is_rejected_before_publish(self):
        self.complete_balance(hours=24)
        self.complete_interchange(hours=24)
        output = self.output()
        before = output.read_bytes()
        with self.assertRaisesRegex(ValueError, "Incomplete seven-day"):
            grid.refresh(self.directory, grid.source_urls("2026_Jul_Dec"), self.CAPTURE, output, automated=True)
        self.assertEqual(output.read_bytes(), before)
        self.assertFalse((self.directory / "data/latest.json").exists())

    def test_duplicates_are_deduplicated_and_conflicts_rejected(self):
        self.complete_files()
        data = grid.build_snapshot([self.balance, self.balance], [self.interchange, self.interchange], self.CAPTURE, [], automated=True)
        self.assertEqual(len(data["history"]["ABC"]), 168)
        self.assertEqual(len(data["interchange"]), 2)
        conflict = self.directory / "conflict.csv"
        conflict.write_text(self.balance.read_text().replace(',100,100,130,10,60', ',999,100,130,10,60', 1))
        with self.assertRaisesRegex(ValueError, "Conflicting duplicate"):
            grid.build_snapshot([self.balance, conflict], self.interchange, self.CAPTURE, [], automated=True)

    def test_nonfinite_future_and_truncated_csv_rows_are_rejected(self):
        self.complete_files()
        original = self.balance.read_text()
        variants = [
            original.replace(',100,100,130,10,60', ',NaN,100,130,10,60', 1),
            original.replace('10/22/2026 07:00:00 AM', '10/24/2026 07:00:00 AM', 1),
            original + 'ABC,10/22/2026 07:00:00 AM,100\n',
        ]
        for text in variants:
            with self.subTest(length=len(text)):
                self.balance.write_text(text)
                with self.assertRaises(ValueError):
                    grid.build_snapshot(self.balance, self.interchange, self.CAPTURE, [], automated=True)
        self.balance.write_text(original)

    def test_download_rejects_http200_html_and_short_content(self):
        import io
        from unittest.mock import patch
        class Response(io.BytesIO):
            def __init__(self, content, headers):
                super().__init__(content); self.headers = headers
        entry = grid.source_identity(grid.source_urls("2026_Jul_Dec")[0])
        for payload, headers, message in [(b'<html>not found</html>', {"Content-Type": "text/html"}, "soft404"), (b'a,b\n1,2\n', {"Content-Type": "text/csv", "Content-Length": "900"}, "Truncated")]:
            with patch.object(grid, "request", return_value=Response(payload, headers)):
                with self.assertRaisesRegex(ValueError, message):
                    grid.download_source(entry, self.directory)

    def manifest(self, periods):
        output = ['FILENAME,DESCRIPTION,YEAR,MONTHS']
        for period in periods:
            year, half = period.split('_', 1)
            for kind in grid.KINDS:
                output.append(f'EIA930_{kind}_{period}.csv,{kind},{year},{half}')
        return '\n'.join(output) + '\n'

    def test_manifest_uses_published_periods_not_calendar_guess(self):
        rows = grid.parse_manifest(self.manifest(["2026_Jul_Dec", "2027_Jan_Jun"]), "2027-01-01T01:00:00+00:00")
        self.assertEqual(rows["BALANCE"][0]["period"], "2027_Jan_Jun")
        rows = grid.parse_manifest(self.manifest(["2026_Jul_Dec"]), "2027-01-01T01:00:00+00:00")
        self.assertEqual(rows["BALANCE"][0]["period"], "2026_Jul_Dec")
        self.assertNotIn("2027", rows["BALANCE"][0]["url"])

    def test_rollover_merges_prior_balance_and_independently_lagged_edges(self):
        import io
        from unittest.mock import patch
        captured = "2027-01-03T16:00:00+00:00"
        previous_balance = self.complete_balance("old_balance.csv", through="2027-01-01T04", start="2026-12-27T08")
        latest_balance = self.complete_balance("new_balance.csv", through="2027-01-03T07", start="2027-01-01T05")
        previous_edges = self.complete_interchange("old_edges.csv", through="2026-12-31T07", start="2026-12-27T08")
        empty_edges = self.directory / "new_edges.csv"
        self.write_csv(empty_edges, self.edge_columns, [])
        files = {("BALANCE", "2026_Jul_Dec"): previous_balance, ("BALANCE", "2027_Jan_Jun"): latest_balance, ("INTERCHANGE", "2026_Jul_Dec"): previous_edges, ("INTERCHANGE", "2027_Jan_Jun"): empty_edges}
        calls = []
        def download(entry, directory):
            key = entry["kind"], entry["period"]; calls.append(key)
            path = files[key]
            return {**entry, "path": path, "lastModified": "fixture", "sha256": grid.hashlib.sha256(path.read_bytes()).hexdigest()}
        with patch.object(grid, "request", return_value=io.BytesIO(self.manifest(["2026_Jul_Dec", "2027_Jan_Jun"]).encode())), patch.object(grid, "download_source", side_effect=download):
            selected, sources = grid.discover_sources(self.directory, captured, automated=True)
        data = grid.build_snapshot(selected["BALANCE"], selected["INTERCHANGE"], captured, sources, automated=True)
        grid.validate_candidate(data, {}, automated=True)
        self.assertEqual(len(data["history"]["ABC"]), 168)
        self.assertEqual(data["demandThrough"], "2027-01-03T07")
        self.assertEqual(data["interchangeThrough"], "2026-12-31T07")
        self.assertEqual([s["kind"] for s in sources[:2]], ["BALANCE", "INTERCHANGE"])
        self.assertEqual(sources[1]["period"], "2026_Jul_Dec")
        self.assertEqual(len(selected["BALANCE"]), 2)
        self.assertEqual(len(selected["INTERCHANGE"]), 1)

    def test_manifest_rollover_html_placeholder_falls_back_to_prior_file(self):
        import io
        from unittest.mock import patch
        captured = "2027-01-01T12:00:00+00:00"
        balance = self.complete_balance("prior_balance.csv", through="2026-12-31T07")
        edge = self.complete_interchange("prior_edges.csv", through="2026-12-30T07")
        def download(entry, directory):
            if entry["period"] == "2027_Jan_Jun":
                raise grid.SourceUnavailable("HTTP200 HTML soft404")
            path = balance if entry["kind"] == "BALANCE" else edge
            return {**entry, "path": path, "lastModified": None, "sha256": grid.hashlib.sha256(path.read_bytes()).hexdigest()}
        with patch.object(grid, "request", return_value=io.BytesIO(self.manifest(["2026_Jul_Dec", "2027_Jan_Jun"]).encode())), patch.object(grid, "download_source", side_effect=download):
            selected, sources = grid.discover_sources(self.directory, captured, automated=True)
        self.assertTrue(all(s["period"] == "2026_Jul_Dec" for s in sources))
        grid.validate_candidate(grid.build_snapshot(selected["BALANCE"], selected["INTERCHANGE"], captured, sources, automated=True), {}, automated=True)


    def test_cli_changed_output_and_first_run_json_repair(self):
        import contextlib
        import io
        from unittest.mock import patch
        captured = grid.dt.datetime.now(grid.dt.timezone.utc).replace(microsecond=0)
        through = captured.replace(minute=0, second=0) - grid.dt.timedelta(days=1)
        self.complete_balance(through=grid.hour(through))
        self.complete_interchange(through=grid.hour(through - grid.dt.timedelta(days=1)))
        output = self.output()
        github_output = self.directory / "github-output.txt"
        period = f"{captured.year}_" + ("Jan_Jun" if captured.month < 7 else "Jul_Dec")
        argv = ["refresh_grid_snapshot.py", "--files", str(self.directory), "--period", period,
                "--captured-at", captured.isoformat(), "--output", str(output),
                "--automated", "--github-output", str(github_output)]
        results = []
        for remove_json in [False, False, True]:
            if remove_json:
                (self.directory / "data/latest.json").unlink()
            stdout = io.StringIO()
            with patch.object(grid, "__name__", "grid_refresh"), patch("sys.argv", argv), contextlib.redirect_stdout(stdout):
                grid.main()
            results.append(json.loads(stdout.getvalue()))
        self.assertEqual([result["changed"] for result in results], [True, False, True])
        self.assertTrue(all(result["captured_at"] == captured.isoformat() for result in results))
        lines = github_output.read_text().splitlines()
        self.assertEqual([line for line in lines if line.startswith("changed=")], ["changed=true", "changed=false", "changed=true"])
        self.assertEqual(len([line for line in lines if line.startswith("demand_through=")]), 3)
        self.assertEqual(len([line for line in lines if line.startswith("interchange_through=")]), 3)

    def test_day_ahead_forecast_is_allowed_without_becoming_measured_through(self):
        self.complete_files()
        with self.balance.open(newline="") as handle:
            columns = next(csv.reader(handle))
        with self.balance.open("a", newline="") as handle:
            csv.DictWriter(handle, fieldnames=columns).writerow({
                "Balancing Authority": "ABC", grid.TIME_COLUMN: "10/24/2026 04:00:00 AM",
                "Demand Forecast (MW)": "800",
            })
        data = grid.build_snapshot(self.balance, self.interchange, self.CAPTURE, [], automated=True)
        self.assertEqual(data["demandThrough"], "2026-10-22T07")
        self.assertTrue(all(period <= data["demandThrough"] for code, kind, period, value in data["snap"]))


if __name__ == "__main__":
    unittest.main()
