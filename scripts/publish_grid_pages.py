#!/usr/bin/env python3
"""Publish a validated main revision through the existing legacy Pages builder.

Uses only the workflow's built-in GITHUB_TOKEN (contents:write, pages:write).
An unchanged data refresh still runs this check so an earlier failed deployment
can recover. No branch, site configuration, or data is modified by this script.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = "consoles/us-grid-strain/data/latest.json"
IN_PROGRESS = {"queued", "building", "pending"}
FAILED = {"errored", "error", "failed", "cancelled", "canceled"}


class PublishError(RuntimeError):
    pass


def read_json(request: Request) -> dict:
    with urlopen(request, timeout=30) as response:
        # Bound unexpected responses; the current snapshot is well below 1 MiB.
        body = response.read(5 * 1024 * 1024 + 1)
    if len(body) > 5 * 1024 * 1024:
        raise PublishError("JSON response exceeded the 5 MiB safety limit")
    return json.loads(body)


class GitHub:
    def __init__(self, repository: str, token: str):
        self.prefix = "https://api.github.com/repos/" + repository
        self.token = token

    def __call__(self, method: str, suffix: str) -> dict:
        request = Request(self.prefix + suffix, method=method, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
            "User-Agent": "public-data-consoles-grid-publisher",
        })
        return read_json(request)


def public_json(url: str) -> dict:
    # Deliberately use a separate request: never send the API token to Pages.
    return read_json(Request(url, headers={
        "Accept": "application/json", "Cache-Control": "no-cache",
        "User-Agent": "public-data-consoles-grid-verifier",
    }))


def fingerprint(build: dict | None) -> tuple:
    build = build or {}
    return tuple(build.get(key) for key in ("url", "created_at", "updated_at", "commit", "status"))


def publish(api, commit: str, expected: dict, *, timeout: float = 720,
            poll: float = 10, fetch_public=public_json,
            clock=time.monotonic, sleep=time.sleep, log=print) -> str:
    """Wait for this main revision and its exact public payload, or fail boundedly.

    Dependencies are injectable for offline failure/recovery regression tests.
    The Pages build API always builds latest main, so check main before requesting
    a build and throughout polling. A concurrent human push is never overwritten.
    """
    deadline = clock() + timeout

    def assert_main():
        actual = api("GET", "/git/ref/heads/main")["object"]["sha"]
        if actual != commit:
            raise PublishError("Main advanced; refusing to publish an unvalidated revision. Run the workflow again.")

    def latest():
        try:
            return api("GET", "/pages/builds/latest")
        except HTTPError as exc:
            if exc.code != 404:
                raise
            return None

    if api("GET", "").get("default_branch") != "main":
        raise PublishError("The Pages build API publishes the default branch; expected main, so no build was requested")
    site = api("GET", "/pages")
    if site.get("build_type") != "legacy" or site.get("source") != {"branch": "main", "path": "/"}:
        raise PublishError("Expected existing legacy Pages publishing from main/root; no settings were changed")
    site_url = site.get("html_url", "")
    parsed = urlsplit(site_url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".github.io") or parsed.username or parsed.password:
        raise PublishError("Expected the repository's canonical HTTPS github.io Pages URL")
    data_url = site_url.rstrip("/") + "/" + DATA_PATH
    assert_main()
    previous = latest()
    if previous and previous.get("status") in IN_PROGRESS and previous.get("commit") != commit:
        log("Waiting for an older Pages build before requesting validated main " + commit)
        while previous and previous.get("status") in IN_PROGRESS and previous.get("commit") != commit:
            assert_main()
            remaining = deadline - clock()
            if remaining <= 0:
                raise PublishError("Timed out waiting for an older Pages build; a later run can recover without another data commit.")
            sleep(min(poll, remaining))
            previous = latest()
    already_current = previous and previous.get("commit") == commit
    wait_existing = already_current and previous.get("status") in IN_PROGRESS | {"built"}
    requested = not wait_existing
    if requested:
        assert_main()
        api("POST", "/pages/builds")
        log("Requested a legacy Pages build for validated main " + commit)
    else:
        log("Checking the existing Pages build for " + commit)

    last_status = "not yet visible"
    public_problem = "public JSON has not yet been checked"
    while clock() < deadline:
        assert_main()
        build = latest()
        if build:
            last_status = str(build.get("status", "unknown"))
            is_target = build.get("commit") == commit
            # A just-requested rebuild can briefly expose the previous failed run.
            old_failure = requested and fingerprint(build) == fingerprint(previous)
            if is_target and last_status in FAILED and not old_failure:
                raise PublishError("Pages build failed for validated main: " + last_status)
            if is_target and last_status == "built":
                try:
                    if fetch_public(data_url) == expected:
                        assert_main()
                        log("Verified the canonical public grid JSON matches validated main " + commit)
                        return data_url
                    public_problem = "public JSON still differs from the validated snapshot"
                except (HTTPError, URLError, ValueError, TimeoutError, OSError) as exc:
                    public_problem = "public JSON unavailable (" + type(exc).__name__ + ")"
        sleep(min(poll, max(0, deadline - clock())))
    raise PublishError("Timed out verifying Pages (build status: " + last_status + "; " + public_problem + "). A later run can recover without another data commit.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY"))
    parser.add_argument("--commit", required=True, help="Full SHA of the validated main revision")
    parser.add_argument("--expected-json", type=Path, default=ROOT / DATA_PATH)
    parser.add_argument("--timeout-seconds", type=float, default=720)
    parser.add_argument("--poll-seconds", type=float, default=10)
    args = parser.parse_args()
    if not args.repository or not re.fullmatch(r"[\w.-]+/[\w.-]+", args.repository):
        parser.error("--repository must be owner/repository")
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        parser.error("--commit must be a full lowercase Git SHA")
    if not 0 < args.timeout_seconds <= 900 or not 0 < args.poll_seconds <= args.timeout_seconds:
        parser.error("Require 0 < poll <= timeout <= 900 seconds")
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        parser.error("GITHUB_TOKEN is required; use the workflow's built-in token")
    expected = json.loads(args.expected_json.read_text())
    if expected.get("schemaVersion") != 1 or expected.get("refreshEveryHours") != 6:
        parser.error("Expected a validated schemaVersion 1 snapshot with a six-hour refresh interval")
    try:
        publish(GitHub(args.repository, token), args.commit, expected,
                timeout=args.timeout_seconds, poll=args.poll_seconds)
    except (PublishError, HTTPError, URLError, ValueError, OSError) as exc:
        parser.exit(1, "Grid publication failed: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
