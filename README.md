# Public-Data Consoles

A collection of **28 self-contained, browser-only dashboards** built on **live public data feeds**.
Every console is a single HTML file: open it (or visit the GitHub Pages URL) and it runs — no install,
no account, no build step, no server.

These are **descriptive decision-support** tools, not predictions. Each console labels its data as
*measured* (live public API), *modeled* (published estimates, cited), or *demo* (clearly-labeled
placeholder data). Nothing in this repository contains protected health information or proprietary data.

## Live demo

Once GitHub Pages is enabled (Settings → Pages → Deploy from branch → `main` / root), the landing page is at:

```
https://<your-username>.github.io/public-data-consoles/
```

## Consoles

**Hazards & Early Warning**

| Console | Data | Sources |
|---|---|---|
| [Earthquake Consequence](consoles/quake-consequence/) | Live, global | USGS PAGER / ShakeMap / ground-failure / DYFI, OSM/Overpass lifelines |
| [River Flood Propagation](consoles/river-flood-propagation/) | Live, U.S. | NOAA National Water Prediction Service (NWPS) |
| [River Flood Network](consoles/river-flood-network/) | Live, U.S. | USGS NLDI (network-linked data index) |
| [Hazards Near You](consoles/us-local-hazards/) | Live, U.S. | NWS, NOAA SPC/NHC/Tides, USGS, FEMA NFHL, EPA AirNow\*, U.S. Drought Monitor |
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
