"""Response generation integrity without writing application entrypoints."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("response_embed", ROOT / "scripts/embed_response_plans.py")
embed = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(embed)


class ResponseEmbedding(unittest.TestCase):
    def test_manifest_covers_every_current_console_once_and_native_coastal(self):
        entries = json.loads((ROOT / "response-plans/manifest.json").read_text())["consoles"]
        self.assertEqual(len(entries), len({e["slug"] for e in entries}))
        self.assertEqual({e["slug"] for e in entries}, {p.parent.name for p in (ROOT / "consoles").glob("*/index.html")})
        self.assertTrue(next(e for e in entries if e["slug"] == "coastal-water-resilience")["native"])
        self.assertTrue(all(e["method"] for e in entries))

    def test_generation_is_idempotent_preserves_original_program_and_detects_drift(self):
        original = '<!doctype html><html><head><title>Example</title></head><body>Original<script>window.original=42;</script></body></html>'
        first = embed.build(original, {}, "window.shared=1;", "#console-response{color:red}", "window.adapter=1;")
        self.assertEqual(first, embed.build(first, {}, "window.shared=1;", "#console-response{color:red}", "window.adapter=1;"))
        self.assertIn("window.original=42;", first)
        self.assertLess(first.index("window.shared=1;"), first.index("window.original=42;"))
        self.assertGreater(first.index("window.adapter=1;"), first.index("window.original=42;"))
        self.assertNotEqual(first, embed.build(first, {}, "window.shared=2;", "#console-response{color:red}", "window.adapter=1;"))
        self.assertEqual(first.count('id="console-response"'), 1)

    def test_native_console_is_not_given_a_duplicate_plan(self):
        html = "<head></head><body>Existing native response</body>"
        self.assertEqual(embed.build(html, {"native": True}, "", "", ""), html)

    def test_ambiguous_anchors_and_closing_source_tags_are_refused(self):
        for html in ("<head></head><body></body><body></body>", "<head></head><body>"):
            with self.assertRaises(ValueError):
                embed.build(html, {}, "x", "x", "x")
        with self.assertRaises(ValueError):
            embed.build("<head></head><body></body>", {}, "</script>", "", "")

    def test_malformed_generated_markers_are_refused(self):
        with self.assertRaises(ValueError):
            embed.strip_blocks("<!-- CONSOLE_RESPONSE_HEAD_START -->broken")

    def test_all_sources_validate_before_any_output_is_written(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "response-plans/adapters").mkdir(parents=True)
            for slug in ("a", "b"):
                (root / "consoles" / slug).mkdir(parents=True)
                (root / "response-plans/adapters" / (slug + ".js")).write_text("window.adapter=1;")
            good = root / "consoles/a/index.html"
            good.write_text("<head></head><body>Keep me</body>")
            (root / "consoles/b/index.html").write_text("<head></head><body>Broken")
            for name in ("core.js", "domain-helpers.js", "observed-series.js", "style.css"):
                (root / "response-plans" / name).write_text("")
            (root / "response-plans/manifest.json").write_text(json.dumps({"consoles": [{"slug": slug, "method": "test"} for slug in ("a", "b")]}))
            with self.assertRaises(ValueError):
                embed.generate(root)
            self.assertEqual(good.read_text(), "<head></head><body>Keep me</body>")
