"""Public visitors must not inherit a provider credential requirement."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class KeylessCatalog(unittest.TestCase):
    def test_no_key_gated_basemap_providers_or_setup_prompts(self):
        forbidden = (
            "basemaps.cartocdn.com", "api.mapbox.com", "api.maptiler.com",
            "api key required", "key needed", "one-time setup: your free",
        )
        for page in (ROOT / "consoles").rglob("*.html"):
            with self.subTest(page=str(page.relative_to(ROOT))):
                text = page.read_text().lower()
                for value in forbidden:
                    self.assertNotIn(value, text)

    def test_raster_maps_use_keyless_tiles_with_visible_attribution(self):
        maps = []
        for page in (ROOT / "consoles").rglob("*.html"):
            text = page.read_text()
            urls = re.findall(r"L\.tileLayer\(['\"]([^'\"]+)", text)
            for url in urls:
                maps.append(page)
                self.assertEqual(url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
                self.assertIn("https://www.openstreetmap.org/copyright", text)
                self.assertNotRegex(text, r'referrer[^>]+no-referrer["\']')
        self.assertGreaterEqual(len(maps), 5)

    def test_air_quality_uses_public_observations_without_credentials(self):
        text = (ROOT / "consoles/us-local-hazards/index.html").read_text()
        self.assertIn("https://files.airnowtech.org/airnow/today/reportingarea.dat", text)
        self.assertNotIn("AIRNOW_KEY", text)
        self.assertNotIn("www.airnowapi.org/aq/", text)

    def test_grid_opens_on_data_instead_of_a_credential_gate(self):
        text = (ROOT / "consoles/us-grid-strain/index.html").read_text()
        self.assertNotRegex(text, r'id=["\']gate["\']')
        self.assertIn("snapshot", text.lower())


if __name__ == "__main__":
    unittest.main()
