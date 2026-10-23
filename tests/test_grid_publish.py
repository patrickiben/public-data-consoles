"""Offline regressions for legacy Pages recovery and concurrent main updates."""
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("grid_publish", Path(__file__).resolve().parents[1] / "scripts/publish_grid_pages.py")
grid = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(grid)

SHA = "a" * 40
OTHER = "b" * 40
PAYLOAD = {"schemaVersion": 1, "refreshEveryHours": 6, "capturedAt": "2026-10-23T16:00:00Z"}


def build(status, commit=SHA, number=1):
    return {"status": status, "commit": commit, "url": "https://api.github.com/builds/" + str(number)}


class FakeGitHub:
    def __init__(self, builds, heads=None, source=None, default_branch="main"):
        self.builds = list(builds)
        self.heads = list(heads or [SHA])
        self.calls = []
        self.source = source or {"branch": "main", "path": "/"}
        self.default_branch = default_branch
        self.observed_build = None

    @staticmethod
    def next(values):
        return values.pop(0) if len(values) > 1 else values[0]

    def __call__(self, method, path):
        self.calls.append((method, path))
        if method == "POST":
            if self.observed_build and self.observed_build.get("status") in grid.IN_PROGRESS:
                raise AssertionError("Cannot request a build while a previous Pages build is running")
            return {"status": "queued"}
        if path == "":
            return {"default_branch": self.default_branch}
        if path == "/pages":
            return {"build_type": "legacy", "source": self.source, "html_url": "https://example.github.io/public-data-consoles/"}
        if path == "/git/ref/heads/main":
            return {"object": {"sha": self.next(self.heads)}}
        if path == "/pages/builds/latest":
            self.observed_build = self.next(self.builds)
            return self.observed_build
        raise AssertionError("Unexpected API call: " + path)


class PublishTests(unittest.TestCase):
    def run_publish(self, api, payloads=None, timeout=5, data_path=grid.DATA_PATH):
        moment = [0]
        payloads = list(payloads or [PAYLOAD])
        self.public_urls = []

        def public(url):
            self.public_urls.append(url)
            value = FakeGitHub.next(payloads)
            if isinstance(value, Exception):
                raise value
            return value

        def sleep(seconds):
            moment[0] += seconds

        return grid.publish(api, SHA, PAYLOAD, timeout=timeout, poll=1,
                            fetch_public=public, clock=lambda: moment[0], sleep=sleep,
                            log=lambda message: None, data_path=data_path)

    def test_coastal_payload_is_verified_at_its_own_public_url(self):
        api = FakeGitHub([build("built")])
        url = self.run_publish(api, data_path="consoles/coastal-water-resilience/data/impact-context.json")
        self.assertEqual(url, "https://example.github.io/public-data-consoles/consoles/coastal-water-resilience/data/impact-context.json")
        self.assertEqual(self.public_urls, [url])

    def test_fred_snapshot_basename_is_verified_without_relaxing_relative_path_rules(self):
        api = FakeGitHub([build("built")])
        url = self.run_publish(api, data_path="consoles/resilience-telemetry/data/fred_snapshot.json")
        self.assertEqual(url, "https://example.github.io/public-data-consoles/consoles/resilience-telemetry/data/fred_snapshot.json")
        self.assertEqual(self.public_urls, [url])

    def test_invalid_data_paths_are_rejected_before_any_api_call(self):
        for path in ("../secret.json", "https://other.example/data.json", "/consoles/a/data/b.json",
                     "consoles/a/data/../b.json", "consoles/a/data/b.json?token=x", "consoles/a/data/b.json#part"):
            with self.subTest(path=path):
                api = FakeGitHub([build("built")])
                with self.assertRaisesRegex(grid.PublishError, "relative console data JSON path"):
                    self.run_publish(api, data_path=path)
                self.assertEqual(api.calls, [])

    def test_unchanged_data_already_published_needs_no_build(self):
        api = FakeGitHub([build("built")])
        url = self.run_publish(api)
        self.assertEqual(url, "https://example.github.io/public-data-consoles/consoles/us-grid-strain/data/latest.json")
        self.assertNotIn(("POST", "/pages/builds"), api.calls)

    def test_unchanged_data_recovers_previous_failed_deployment(self):
        failed = build("errored")
        api = FakeGitHub([failed, failed, build("queued", number=2), build("built", number=2)])
        self.run_publish(api, [{"old": True}, PAYLOAD])
        self.assertEqual(api.calls.count(("POST", "/pages/builds")), 1)
        self.assertEqual(len(self.public_urls), 2, "Wait for Pages CDN data, not only a green build")

    def test_existing_build_in_progress_is_not_duplicated(self):
        api = FakeGitHub([build("building"), build("built")])
        self.run_publish(api)
        self.assertNotIn(("POST", "/pages/builds"), api.calls)

    def test_new_commit_requests_a_build(self):
        api = FakeGitHub([build("built", commit=OTHER), build("built", commit=SHA, number=2)])
        self.run_publish(api)
        self.assertEqual(api.calls.count(("POST", "/pages/builds")), 1)

    def test_waits_for_older_running_build_before_requesting_current_commit(self):
        api = FakeGitHub([build("building", commit=OTHER), build("building", commit=OTHER),
                          build("built", commit=OTHER), build("built", number=2)])
        self.run_publish(api)
        self.assertEqual(api.calls.count(("POST", "/pages/builds")), 1)

    def test_stuck_older_running_build_times_out_without_requesting_a_second(self):
        api = FakeGitHub([build("building", commit=OTHER)])
        with self.assertRaisesRegex(grid.PublishError, "Timed out waiting for an older Pages build"):
            self.run_publish(api, timeout=2)
        self.assertNotIn(("POST", "/pages/builds"), api.calls)

    def test_main_movement_before_request_refuses_deployment(self):
        api = FakeGitHub([build("built", commit=OTHER)], heads=[SHA, OTHER])
        with self.assertRaisesRegex(grid.PublishError, "Main advanced"):
            self.run_publish(api)
        self.assertNotIn(("POST", "/pages/builds"), api.calls)

    def test_main_movement_during_build_never_reports_success(self):
        api = FakeGitHub([build("building"), build("built")], heads=[SHA, SHA, OTHER])
        with self.assertRaisesRegex(grid.PublishError, "Main advanced"):
            self.run_publish(api)

    def test_failed_new_build_is_a_failure(self):
        api = FakeGitHub([build("built", commit=OTHER), build("errored", number=2)])
        with self.assertRaisesRegex(grid.PublishError, "Pages build failed"):
            self.run_publish(api)

    def test_mismatched_or_unavailable_public_data_times_out(self):
        for payload in ({"old": True}, ValueError("CDN returned HTML")):
            with self.subTest(payload=payload):
                api = FakeGitHub([build("built")])
                with self.assertRaisesRegex(grid.PublishError, "Timed out verifying Pages"):
                    self.run_publish(api, [payload], timeout=2)
                self.assertNotIn(("POST", "/pages/builds"), api.calls)

    def test_unstarted_build_times_out_and_remains_recoverable(self):
        api = FakeGitHub([build("errored")])
        with self.assertRaisesRegex(grid.PublishError, "later run can recover"):
            self.run_publish(api, timeout=2)
        self.assertEqual(api.calls.count(("POST", "/pages/builds")), 1)

    def test_source_change_is_not_silently_reconfigured(self):
        api = FakeGitHub([build("built")], source={"branch": "gh-pages", "path": "/"})
        with self.assertRaisesRegex(grid.PublishError, "no settings were changed"):
            self.run_publish(api)
        self.assertNotIn(("POST", "/pages/builds"), api.calls)

    def test_changed_default_branch_never_requests_its_build(self):
        api = FakeGitHub([build("built")], default_branch="release")
        with self.assertRaisesRegex(grid.PublishError, "expected main"):
            self.run_publish(api)
        self.assertNotIn(("POST", "/pages/builds"), api.calls)


class WorkflowPublishTests(unittest.TestCase):
    def publish(self, *, failure=False, marker=SHA, payload=PAYLOAD, heads=None, already=False):
        calls, tick = [], [0]
        heads = list(heads or [SHA])
        dispatched = [False]
        def api(method, path, body=None):
            calls.append((method, path, body))
            if path == "": return {"default_branch": "main"}
            if path == "/pages": return {"build_type": "workflow", "html_url": "https://example.github.io/public-data-consoles/"}
            if path == "/git/ref/heads/main": return {"object": {"sha": FakeGitHub.next(heads)}}
            if method == "POST":
                self.assertEqual(path, "/actions/workflows/catalog.yml/dispatches")
                self.assertEqual(body, {"ref": "main", "inputs": {"expected_sha": SHA}})
                dispatched[0] = True
                return {}
            if path.startswith("/actions/workflows/catalog.yml/runs"):
                old = {"id": 1, "head_sha": SHA, "status": "completed", "conclusion": "success"}
                new = {"id": 2, "head_sha": SHA, "status": "completed", "conclusion": "failure" if failure else "success"}
                return {"workflow_runs": [old, new] if dispatched[0] else [old]}
            self.fail("Unexpected API: " + path)
        def public(url):
            if url.endswith("build-info.json"):
                return {"commit": marker if already or dispatched[0] else OTHER, "validation": "catalog-and-browser"}
            return payload
        def sleep(n): tick[0] += n
        result = grid.publish(api, SHA, PAYLOAD, timeout=3, poll=1, fetch_public=public, clock=lambda: tick[0], sleep=sleep, log=lambda _: None)
        return result, calls

    def test_dispatches_gated_validation_and_verifies_exact_artifact_and_data(self):
        url, calls = self.publish()
        self.assertTrue(url.endswith(grid.DATA_PATH))
        self.assertEqual(sum(method == "POST" for method, _, _ in calls), 1)
        self.assertFalse(any(path == "/pages/builds" for _, path, _ in calls))

    def test_unchanged_tested_artifact_is_reused_without_dispatch(self):
        _, calls = self.publish(already=True)
        self.assertFalse(any(method == "POST" for method, _, _ in calls))

    def test_failed_validation_never_reports_published_even_if_payload_matches(self):
        with self.assertRaisesRegex(grid.PublishError, "validation/deployment failed"):
            self.publish(failure=True)

    def test_old_marker_or_wrong_payload_never_reports_success(self):
        for kwargs in ({"marker": OTHER}, {"payload": {"old": True}}):
            with self.subTest(kwargs=kwargs), self.assertRaisesRegex(grid.PublishError, "Timed out verifying gated"):
                self.publish(**kwargs)

    def test_moving_main_aborts_workflow_publisher(self):
        with self.assertRaisesRegex(grid.PublishError, "Main advanced"):
            self.publish(heads=[SHA, OTHER])


if __name__ == "__main__":
    unittest.main()
