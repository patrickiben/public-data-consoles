#!/usr/bin/env python3
"""Offline catalog integrity and JavaScript syntax checks; no external feeds are called."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.links, self.scripts, self.current = [], [], None
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])
        if tag == "script" and not attrs.get("src") and attrs.get("type", "text/javascript") in ("text/javascript", "application/javascript", "module"):
            self.current = [attrs.get("type") == "module", ""]
    def handle_data(self, data):
        if self.current is not None:
            self.current[1] += data
    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.scripts.append(self.current)
            self.current = None

entries = {str(p.parent.relative_to(ROOT)) + "/" for p in (ROOT / "consoles").glob("*/index.html")}
landing = (ROOT / "index.html").read_text()
readme = (ROOT / "README.md").read_text()
assert entries, "No console entrypoints found"
assert entries <= set(Page(landing).links), "Landing page is missing console links: " + str(entries - set(Page(landing).links))
assert entries <= set(re.findall(r"\]\((consoles/[^)]+/)\)", readme)), "README is missing console links"
count = len(entries)
assert re.search(rf"\*\*{count} self-contained, browser-only dashboards\*\*", readme), "README count is stale"
assert f'class="sb-key">{count}</span>' in landing, "Landing status count is stale"
assert f'class="num">{count}<span' in landing, "Landing hero count is stale"
# Merges can leave these numbers stale with no conflict, so every place that states a count is read here.
manifest = json.loads((ROOT / "response-plans/manifest.json").read_text())["consoles"]
shared = len([e for e in manifest if not e.get("native")])
assert len(manifest) == count, "Manifest and catalog disagree on the console count"
for path, expected in {
    "index.html": [f"across all {count} consoles"],
    "data-updates.html": [f"all {count} consoles</title>", f"<p>All {count} consoles open"],
    "README.md": [f"on all {shared} shared consoles", f"all {count} response plans", f"covers all {count} consoles"],
    "response-plans/CONTRACT.md": [f"All {count} consoles must be in the manifest"],
    "response-plans/PUBLIC_DATA_COVERAGE.md": [f"All {shared} shared response panels", f"exercise all {count} actual", f"All {shared} shared consoles derive", f"and all {count} offline pages"],
}.items():
    text = (ROOT / path).read_text()
    for phrase in expected:
        assert phrase in text, f"{path} count is stale: expected {phrase!r}"
sections = list(re.finditer(r'<h2>(.*?)</h2>\s*<span class="rule"[^>]*></span>\s*<span class="count">(\d+)</span>', landing))
assert sections, "Landing section counts were not found"
for i, section in enumerate(sections):
    end = sections[i + 1].start() if i + 1 < len(sections) else landing.index("<!-- honesty note -->")
    cards = len(re.findall(r'<article class="module"', landing[section.end():end]))
    assert int(section.group(2)) == cards, f"Landing section count is stale: {section.group(1)} says {section.group(2)}, has {cards} cards"
scripts = 0
for page in sorted(ROOT.glob("**/*.html")):
    if any(part.startswith(".") or part == "node_modules" for part in page.relative_to(ROOT).parts):
        continue
    for module, code in Page(page.read_text()).scripts:
        if not code.strip():
            continue
        with tempfile.NamedTemporaryFile(mode="w", suffix=".mjs" if module else ".js") as f:
            f.write(code)
            f.flush()
            result = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
            assert result.returncode == 0, f"{page.relative_to(ROOT)}: {result.stderr}"
        scripts += 1
print(f"PASS: {count} catalog entries, README/navigation counts, {scripts} inline JavaScript programs")
