#!/usr/bin/env python3
"""Deterministically inline the maintained response layer into standalone consoles."""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
KINDS = ("HEAD", "MOUNT", "ADAPTER")


def block(kind, content):
    return f"<!-- CONSOLE_RESPONSE_{kind}_START -->\n{content}\n<!-- CONSOLE_RESPONSE_{kind}_END -->"


def strip_blocks(html):
    for kind in KINDS:
        pattern = rf"<!-- CONSOLE_RESPONSE_{kind}_START -->.*?<!-- CONSOLE_RESPONSE_{kind}_END -->\n?"
        starts = html.count(f"<!-- CONSOLE_RESPONSE_{kind}_START -->")
        ends = html.count(f"<!-- CONSOLE_RESPONSE_{kind}_END -->")
        if starts != ends or starts > 1:
            raise ValueError(f"Malformed/duplicate response {kind} markers")
        html = re.sub(pattern, "", html, flags=re.S)
    return html


def build(html, entry, core, style, adapter):
    if entry.get("native"):
        if "CONSOLE_RESPONSE_" in html:
            raise ValueError("Native console contains generated response blocks")
        return html
    html = strip_blocks(html)
    if "</script" in core.lower() or "</script" in adapter.lower() or "</style" in style.lower():
        raise ValueError("Maintainer source must not close its enclosing HTML element")
    head = block("HEAD", "<style>\n" + style.rstrip() + "\n</style>\n<script>\n" + core.rstrip() + "\n</script>")
    mount = block("MOUNT", '<section id="console-response" aria-labelledby="console-response-title"></section>\n<a id="console-response-shortcut" href="#console-response">Response plan</a>')
    end = block("ADAPTER", "<script>\n" + adapter.rstrip() + "\n</script>")
    for pattern, content, before in [(r"</head\s*>", head, True), (r"<body\b[^>]*>", mount, False), (r"</body\s*>", end, True)]:
        matches = list(re.finditer(pattern, html, flags=re.I))
        if len(matches) != 1:
            raise ValueError("Expected exactly one HTML insertion anchor: " + pattern)
        match = matches[0]
        at = match.start() if before else match.end()
        html = html[:at] + content + "\n" + html[at:]
    return html


def generate(root=ROOT, check=False):
    source = root / "response-plans"
    manifest = json.loads((source / "manifest.json").read_text())
    entries = manifest["consoles"]
    actual = {p.parent.name for p in (root / "consoles").glob("*/index.html")}
    slugs = [entry["slug"] for entry in entries]
    if len(slugs) != len(set(slugs)) or set(slugs) != actual:
        raise ValueError("Manifest must list every console exactly once")
    core = (source / "core.js").read_text() + "\n" + (source / "domain-helpers.js").read_text() + "\n" + (source / "observed-series.js").read_text()
    style = (source / "style.css").read_text()
    outputs = {}
    for entry in entries:
        page = root / "consoles" / entry["slug"] / "index.html"
        adapter_path = source / "adapters" / (entry["slug"] + ".js")
        if not entry.get("method"):
            raise ValueError("Every console needs an explicit method applicability explanation")
        adapter = "" if entry.get("native") else adapter_path.read_text()
        if not entry.get("native") and entry.get("prioritySource"):
            priority = source / entry["prioritySource"]
            if priority.resolve().parent != (source / "priorities").resolve():
                raise ValueError("Priority source must be in response-plans/priorities")
            adapter = priority.read_text() + "\n" + adapter
        original = page.read_text()
        expected = build(original, entry, core, style, adapter)
        if expected != original:
            outputs[page] = expected
    if check:
        for page in outputs:
            print("Stale response blocks: " + str(page.relative_to(root)), file=sys.stderr)
        return not outputs
    # Validate every file and anchor before writing any application page.
    for page, html in outputs.items():
        page.write_text(html)
    print(f"Response blocks synchronized: {len(outputs)} updated; {len(entries)} covered")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        ok = generate(check=args.check)
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(1, "Response generation failed: " + str(exc) + "\n")
    if not ok:
        parser.exit(1, "Run python scripts/embed_response_plans.py to synchronize maintained sources.\n")


if __name__ == "__main__":
    main()
