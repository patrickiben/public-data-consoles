# Public-Data Consoles

A collection of **32 self-contained, browser-only dashboards** built on **live public data feeds**.
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

## Live demo

[Open the console catalog](https://patrickiben.github.io/public-data-consoles/).

## Consoles

**Hazards & Early Warning**

| Console | Data | Sources |
|---|---|---|
| [Earthquake Consequence](consoles/quake-consequence/) | Live, global | USGS PAGER / ShakeMap / ground-failure / DYFI, OSM/Overpass lifelines |
| [River Flood Propagation](consoles/river-flood-propagation/) | Live, U.S. | NOAA National Water Prediction Service (NWPS) |
| [River Flood Network](consoles/river-flood-network/) | Live, U.S. | USGS NLDI (network-linked data index) |
| [Hazards Near You](consoles/us-local-hazards/) | Live, U.S. | NWS, NOAA SPC/NHC/Tides, USGS, FEMA NFHL, EPA AirNow\*, U.S. Drought Monitor |
| [Coastal Water Resilience](consoles/coastal-water-resilience/) | Live + modeled (synthetic network) | NOAA CO-OPS gauge 8726520 (water level, tide predictions, OFS forecast), NOAA NHC (Esri Active Hurricanes), NWS alerts |
| [U.S. Grid Strain](consoles/us-grid-strain/) | Live, U.S. | EIA Hourly Electric Grid Monitor (EIA-930)\*\* |
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

\* **EPA AirNow** (Hazards Near You) needs a free key you supply yourself. The public copy ships with the key
blank; the air-quality panel shows a "key needed" prompt until you paste your own into `AIRNOW_KEY` at the top
of `consoles/us-local-hazards/index.html`. **Do not commit a real key to a public repo.**

\*\* **U.S. Grid Strain** needs a free [EIA OpenData](https://www.eia.gov/opendata/) key, which it stores in
your browser's `localStorage` only — it is never written into the file or committed.

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
