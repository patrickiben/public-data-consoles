# Public-Data Consoles

A collection of **32 self-contained, browser-only dashboards** built on **public data feeds and dated snapshots**.
Every console is a single HTML file: open it (or visit the GitHub Pages URL) and it runs — no install,
no account, no build step, no server.

These are **descriptive decision-support** tools, not predictions. Each console labels its data as
*measured* (live public API), *modeled* (published estimates, cited), or *demo* (clearly-labeled
placeholder data). Nothing in this repository contains protected health information or proprietary data.

## Featured: research engineering and systems architecture

**[Coastal Water Resilience — open the console](https://patrickiben.github.io/public-data-consoles/consoles/coastal-water-resilience/)**
combines live NOAA/NHC/NWS coastal information with a ten-metric diagnostic suite adapted from the
[contamination-resilient CRT design](https://github.com/patrickiben/crt-design-demo)
([preprint](https://doi.org/10.5281/zenodo.23486177)) and directed source/sink topology accounting
informed by [directed-asymmetry contagion research](https://github.com/patrickiben/directed-asymmetry-contagion).
It demonstrates translating methods across domains, integrating data sources, and building an interactive
explanation with explicit provenance. The public lift-station network is **synthetic**, calibrated to
published network-level aggregates; it contains no real station locations. Live observations, archived
aggregates, synthetic computations and interpretive guidance carry separate labels. The directed component
is source/sink accounting, not a port of the contagion paper's VAR/FEVD estimation.

[Resilience Telemetry](https://patrickiben.github.io/public-data-consoles/consoles/resilience-telemetry/)
also adapts the directed-contagion work; its [research guide](https://patrickiben.github.io/public-data-consoles/consoles/resilience-telemetry/wiki.html#s8b)
explains the methodological correspondence and differences.
See the [manuscript → code → demo map](https://github.com/patrickiben/patrickiben/blob/main/RESEARCH_MAP.md)
for each paper's draft, code/data archive and related applications.

## Live demo

[Open the console catalog](https://patrickiben.github.io/public-data-consoles/).

## Consoles

**Hazards & Early Warning**

| Console | Data | Sources |
|---|---|---|
| [Earthquake Consequence](consoles/quake-consequence/) | Live, global | USGS PAGER / ShakeMap / ground-failure / DYFI, OSM/Overpass lifelines |
| [River Flood Propagation](consoles/river-flood-propagation/) | Live, U.S. | NOAA National Water Prediction Service (NWPS) |
| [River Flood Network](consoles/river-flood-network/) | Live, U.S. | USGS NLDI (network-linked data index) |
| [Hazards Near You](consoles/us-local-hazards/) | Live, U.S. | NWS, NOAA SPC/NHC/Tides, USGS, FEMA NFHL, keyless EPA AirNow observations, U.S. Drought Monitor |
| [Coastal Water Resilience](consoles/coastal-water-resilience/) | Live + modeled (synthetic network) | NOAA CO-OPS gauge 8726520 (water level, tide predictions, OFS forecast), NOAA NHC (Esri Active Hurricanes), NWS alerts |
| [U.S. Grid Strain](consoles/us-grid-strain/) | Dated snapshot; optional live connection, U.S. | Official EIA-930 public downloads; optional EIA OpenData connection |
| [Global Outbreak & Emerging-Threat Tracker](consoles/global-outbreak-tracker/) | Live + snapshot | OWID (mpox), CDC (measles), disease.sh, curated WHO / Africa CDC watch |

**Health-System Strain & Consequence**

| Console | Data | Sources |
|---|---|---|
| [NHS Scotland — Hospital Strain](consoles/nhs-scotland-strain/) | Live, Scotland | Public Health Scotland open-data (CKAN) |
| [USAID Withdrawal — Consequence](consoles/usaid-consequence/) | Live + modeled | USAspending API + cited published estimates |
| [VA Medical Center — Strain](consoles/va-strain/) | Demo template | Labeled demo data + hooks for internal feeds |

**U.S. Public Health**

| Console | Data | Sources |
|---|---|---|
| [U.S. Overdose Surveillance](consoles/us-overdose-surveillance/) | Live, U.S. | CDC VSRR provisional overdose counts |
| [U.S. Respiratory Virus Surveillance](consoles/us-respiratory-surveillance/) | Live, U.S. | CDC NSSP / RESP-NET / NWSS wastewater |

**Global Health Atlas**

| Console | Data | Sources |
|---|---|---|
| [Global Health Atlas](consoles/global-health-atlas/) | Live, global | World Bank Indicators API |
| [Global Cancer Burden](consoles/global-cancer/) | Modeled | IARC GLOBOCAN 2022 |
| [HIV, TB & Malaria](consoles/global-hiv-tb-malaria/) | Live + snapshot | World Bank Open Data |
| [Global NCD Burden & Risk Factors](consoles/global-ncd-burden/) | Live + snapshot | World Bank Indicators API |
| [Global Mental Health & Suicide](consoles/global-mental-health/) | Live, global | World Bank Indicators API |
| [Global Nutrition & Food Security](consoles/global-nutrition/) | Live + snapshot | World Bank Open Data |
| [Global Immunization & Vaccine Coverage](consoles/global-immunization/) | Live + snapshot | World Bank (WHO/UNICEF WUENIC) |
| [Maternal, Newborn & Child Health](consoles/global-maternal-child-health/) | Live, global | World Bank Indicators API |
| [Neglected Tropical Diseases](consoles/global-ntds/) | Modeled | WHO NTD programme |
| [Global Demographic Transition & Aging](consoles/global-demographic-transition/) | Live, global | World Bank Indicators API |
| [Global Health Systems & Financing](consoles/global-health-systems/) | Live + snapshot | World Bank Indicators API |
| [Global Road Safety & Injury](consoles/global-road-safety/) | Live + snapshot | World Bank / WHO comparable estimates |
| [Air Pollution & Environmental Health](consoles/global-air-pollution/) | Live, global | World Bank Indicators API |
| [Global WASH](consoles/global-wash/) | Live + snapshot | World Bank / WHO-UNICEF JMP |
| [Antimicrobial Resistance](consoles/antimicrobial-resistance/) | Modeled | GRAM/IHME + CDC AR Threats |

**Markets**

| Console | Data | Sources |
|---|---|---|
| [Resilience Telemetry](consoles/resilience-telemetry/) | Live + snapshot | Binance.US, Frankfurter FX, embedded equity snapshot |

**Affording Care**

| Console | Data | Sources |
|---|---|---|
| [Prescription Savings Finder](consoles/prescription-savings/) | Live + reference | CMS NADAC drug prices and referenced assistance options |
| [Medical Cost Abroad](consoles/medical-cost-abroad/) | Modeled estimates | Published procedure-price ranges, illustrative flights and lodging |
| [Medical Debt Assistant](consoles/medical-debt-assistant/) | Reference | FDCPA / FCRA rights and nonprofit-hospital charity-care guidance |

**Get Help**

| Console | Data | Sources |
|---|---|---|
| [Human Trafficking — Get Help](consoles/human-trafficking/) | Reference | Verified hotlines + Polaris / UNODC / ILO–Walk Free / CTDC (badge-framed) |

## No visitor API keys

All public consoles open without a visitor account or provider key. Maps use standard OpenStreetMap
tiles with visible attribution; mapping failures leave the data panels usable. Air quality uses EPA's
[public reporting-area observation file](https://files.airnowtech.org/airnow/today/reportingarea.dat),
with observation time, reporting-area distance and freshness checks. U.S. Grid Strain opens on an
embedded, dated snapshot from official EIA public downloads; its default view is explicitly **not live**.
An optional personal EIA connection can refresh it, but never gates the existing data.

## How they work

Each console fetches public APIs **client-side**, directly from your browser. Running on a real
`https://` origin (GitHub Pages) is usually *more* reliable than opening the file locally, because some
public APIs reject `file://` requests. A few feeds are rate-limited or CORS-restricted and degrade
gracefully (the console falls back to an embedded snapshot or shows a clear message).

## Caveats

- **Coincident, not predictive.** A high fragility / strain reading means "large or tightly coupled
  *today*," not a forecast. It can persist for a long time with nothing happening, or drop with no warning.
- **No autopilot.** These flag and rank; a human makes the decision.
- **Public data only.** Where real operational data is internal (VA strain, etc.), the console ships with
  demo data and documents exactly what to wire in.

## License

[MIT](LICENSE) for the dashboard code. Underlying data belongs to its respective public providers and is
subject to their terms.

## Catalog checks

Run `python3 scripts/check_catalog.py` (Python 3.12+ and Node.js required). It checks that
all console entrypoints appear in both the landing page and README, that their counts agree,
and that every inline JavaScript program parses. It does not verify external feeds or establish
medical, legal, financial, or predictive validity. GitHub Actions runs these checks on changes.

Run `python3 -m unittest discover -s tests -v` for source/credential regressions and snapshot checks.
For browser checks, run `npm ci`, `npx playwright install --only-shell chromium`, then `npm test`.
These exercise keyless startup, public-data fixtures and unavailable map/feed states. External requests
are intercepted; automated tests do not download OpenStreetMap tiles. Normal interactive maps follow
the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Refresh the embedded EIA grid snapshot

Run `python3 scripts/refresh_grid_snapshot.py` to download the official keyless six-month EIA-930
balance and interchange CSVs and replace the grid console's embedded measurements. It records source
URLs, response modification dates, SHA-256 hashes and the actual capture time. Only raw reported
values are used; forecasts are aligned with each authority's latest actual-demand hour, and missing
values remain missing. The visible source links and capture date follow the embedded provenance.

To replay a saved capture, put `balance.csv`, `interchange.csv` and their optional `.headers` files
in one folder and pass `--files /path/to/capture --period 2026_Jul_Dec --captured-at ISO_TIMESTAMP`.
Use the original retrieval timestamp only for an archived replay. Review the data diff, run the catalog,
unit and browser checks above, and inspect the page before publishing. The public snapshot does not
refresh itself and warns when its measurements are over 30 days old.

## Refresh the embedded FRED snapshot

The Resilience Telemetry macro data has a portable
[snapshot and source manifest](consoles/resilience-telemetry/data/fred_snapshot.json),
including official URLs, actual retrieval date and SHA-256 of each input CSV. Market prices and
CAPE are separate snapshots. To update FRED, download all 19 official CSVs named by
`python3 scripts/refresh_fred.py --list-series` from
`https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES` into one folder as `SERIES.csv`, then run:

```bash
python3 scripts/refresh_fred.py --csv-dir /path/to/fred-csv --retrieved YYYY-MM-DD
python3 scripts/refresh_fred.py --check
python3 scripts/check_catalog.py
python3 -m unittest discover -s tests -v
```

Use the date the CSVs were actually retrieved. The refresh is offline, validates every file before
writing, preserves pinned starts and the four daily series' every-fifth-observation stride, retains
older ICE spread history when the source window is truncated, and keeps claims in thousands.
Missing files, invalid numbers, shifted sampling, stale tails and interior deletions stop the refresh
without changing packaged outputs. Review the diff and browser rendering before publishing; the
script updates the FRED data/vintage labels and portable provenance, never market data or algorithms.
