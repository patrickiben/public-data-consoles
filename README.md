# Public-Data Consoles

A collection of **33 self-contained, browser-only dashboards** built on **public data feeds and dated snapshots**.
Every console is a single HTML file: open it (or visit the GitHub Pages URL) and it runs — no install,
no account, no build step or server setup for visitors. Grid, Coastal, NHS Scotland and Resilience Telemetry also check published data files for
automatic updates; embedded measurements remain available offline. See the
[dashboard update guide](https://patrickiben.github.io/public-data-consoles/data-updates.html)
for what each console can populate automatically and which inputs remain personal or modeled.

These are **descriptive decision-support** tools. Official forecasts retain their source scope and validity;
no unsupported outcome forecast is inferred. Each console labels its data as
*measured* (public observations, with timestamps), *modeled* (published estimates, cited), or *demo* (clearly-labeled
placeholder data). Nothing in this repository contains protected health information or proprietary data.

## Featured: research engineering and systems architecture

**[Coastal Water Resilience — open the console](https://patrickiben.github.io/public-data-consoles/consoles/coastal-water-resilience/)**
combines live NOAA/NHC/NWS coastal information with a ten-metric diagnostic suite adapted from the
[contamination-resilient CRT design](https://github.com/patrickiben/crt-design-demo)
([preprint](https://doi.org/10.5281/zenodo.23486177)) and directed source/sink topology accounting
informed by [directed-asymmetry contagion research](https://github.com/patrickiben/directed-asymmetry-contagion).
It demonstrates translating methods across domains, integrating data sources, and building an interactive
explanation with explicit provenance. Its default **real public-station register** shows 131 officially
published locations, including 82 City-owned/maintained stations, County evacuation-zone intersections
and USGS NAVD88 terrain estimates. Projected impacts and response plans share this real station scope
and the exact remaining NOAA forecast peak (or an explicitly selected scenario level). Eight of the ten
planning dimensions can use public geographic data when coverage is complete; probabilistic free-energy
and hydraulic leakage remain unknown. Real diagnostics use their own descriptive methods and review
criteria, without importing thresholds from the separate synthetic calibration exercise.
Projected impacts automatically combine the remaining NOAA
forecast, public terrain, source-defined sewer basins, Census block populations and published annual
treatment flows. Population is geographic context, and throughput remains a whole-facility historical
reference. Optional local scenarios expose their duration, population, flow, repair-cost and funding
assumptions. Terrain screening does not establish flooding, pump failure
or service loss. Live observations, dated public inventories, synthetic computations and interpretive
guidance carry separate labels. The directed component is source/sink accounting, not a port of the
contagion paper's VAR/FEVD estimation.

[Resilience Telemetry](https://patrickiben.github.io/public-data-consoles/consoles/resilience-telemetry/)
also adapts the directed-contagion work; its [research guide](https://patrickiben.github.io/public-data-consoles/consoles/resilience-telemetry/wiki.html#s8b)
explains the methodological correspondence and differences.
See the [manuscript → code → demo map](https://github.com/patrickiben/patrickiben/blob/main/RESEARCH_MAP.md)
for each paper's draft, code/data archive and related applications.

## Live demo

[Open the console catalog](https://patrickiben.github.io/public-data-consoles/).

## Ten-parameter response plans

Every console includes a checklist organized around the same ten numbered research dimensions.
The **Response plan** shortcut opens the shared checklist; Coastal has its own **Response plan** tab.
Each dimension shows the domain condition or numerical proxy, required inputs, analytical mitigation
and practical next steps. Public and professional-operator tracks use the same evidence with different
responsibilities, escalation routes and verify/prepare/respond/review phases.

A **Do next** preview now leads to a ranked live action checklist on all 32 shared consoles.
Each step identifies the selected place or record, the data behind its priority, timing, escalation
trigger and responsible contact, and when to recheck. Public and operator priorities update with
selection, evidence and expiry. Current official warnings can lead; historical reports support
planning. Source gaps produce verification steps. The full ten-dimension follow-up stays available.

The **Review impacts and source records** button opens the public quantities behind the plan:
source gauge observations and forecasts, official modeled exposure, reported grid demand,
NHS/CDC service and surveillance counts, annual health indicators, and dated agency/reference records.
Each item retains its source, reporting period, scope and method. Counts derived from rates require
an exact-year population with the right definition; missing inputs remain unestimated. Historical
reports and elapsed forecast benchmarks are context, not future impact forecasts.

Unsupported dimensions are **unknown**, with the inputs needed to assess them. Historical reports
support planning; synthetic exercises remain practice. A proxy is labeled with its units and limits,
and does not establish the original CRT estimand or a validated cross-domain metric. Acknowledgments
are local planning notes, reset when evidence changes; exports and printing are local browser actions.
The checklist labels conditions as **Review**, **Context · condition not met**, or **Unknown**; none is an all-clear.
See the [field guide](https://patrickiben.github.io/public-data-consoles/response-plans/guide.html) for interpretation and the
[maintainer contract](response-plans/CONTRACT.md) for adaptation rules. The
[public-data coverage matrix](response-plans/PUBLIC_DATA_COVERAGE.md) lists what each dashboard can support.

## Consoles

**Hazards & Early Warning**

| Console | Data | Sources |
|---|---|---|
| [Earthquake Consequence](consoles/quake-consequence/) | Live, global | USGS PAGER / ShakeMap / ground-failure / DYFI, OSM/Overpass lifelines |
| [River Flood Propagation](consoles/river-flood-propagation/) | Live, U.S. | NOAA National Water Prediction Service (NWPS) |
| [River Flood Network](consoles/river-flood-network/) | Live, U.S. | USGS NLDI (network-linked data index) |
| [Hazards Near You](consoles/us-local-hazards/) | Live, U.S. | NWS, NOAA SPC/NHC/Tides, USGS, FEMA NFHL, keyless EPA AirNow observations, U.S. Drought Monitor |
| [Coastal Water Resilience](consoles/coastal-water-resilience/) | Live feeds + dated real-station register + modeled exercises | NOAA/NHC/NWS; City public wastewater GIS; County evacuation zones; USGS 3DEP terrain |
| [U.S. Grid Strain](consoles/us-grid-strain/) | Automatically updated public reports, U.S. | Official keyless EIA-930 downloads; source timestamps and offline fallback |
| [Global Outbreak & Emerging-Threat Tracker](consoles/global-outbreak-tracker/) | Live + snapshot | OWID (mpox), CDC (measles), disease.sh, curated WHO / Africa CDC watch |

**Health-System Strain & Consequence**

| Console | Data | Sources |
|---|---|---|
| [NHS Scotland — Hospital Strain](consoles/nhs-scotland-strain/) | Automatically updated reports + what-if, Scotland | Public Health Scotland reports, with separate reporting periods |
| [USAID Withdrawal — Consequence](consoles/usaid-consequence/) | Agency reports + dated scenarios | USAspending API + cited published estimates |
| [VA Medical Center — Strain](consoles/va-strain/) | Demo template | Labeled demo data + hooks for internal feeds |

**U.S. Public Health**

| Console | Data | Sources |
|---|---|---|
| [U.S. Overdose Surveillance](consoles/us-overdose-surveillance/) | Provisional reports + snapshot, U.S. | CDC VSRR provisional overdose counts |
| [U.S. Respiratory Virus Surveillance](consoles/us-respiratory-surveillance/) | Weekly surveillance + snapshot, U.S. | CDC NSSP / RESP-NET / NWSS wastewater |

**Global Health Atlas**

| Console | Data | Sources |
|---|---|---|
| [Global Health Atlas](consoles/global-health-atlas/) | Annual public data + snapshot | World Bank Indicators API |
| [Global Cancer Burden](consoles/global-cancer/) | Modeled | IARC GLOBOCAN 2022 |
| [HIV, TB & Malaria](consoles/global-hiv-tb-malaria/) | Annual public data + snapshot | World Bank Open Data |
| [Global NCD Burden & Risk Factors](consoles/global-ncd-burden/) | Annual public data + snapshot | World Bank Indicators API |
| [Global Mental Health & Suicide](consoles/global-mental-health/) | Annual public data + snapshot | World Bank Indicators API |
| [Global Nutrition & Food Security](consoles/global-nutrition/) | Annual public data + snapshot | World Bank Open Data |
| [Global Immunization & Vaccine Coverage](consoles/global-immunization/) | Annual public data + snapshot | World Bank (WHO/UNICEF WUENIC) |
| [Maternal, Newborn & Child Health](consoles/global-maternal-child-health/) | Annual public data + snapshot | World Bank Indicators API |
| [Neglected Tropical Diseases](consoles/global-ntds/) | Modeled | WHO NTD programme |
| [Global Demographic Transition & Aging](consoles/global-demographic-transition/) | Annual public data + snapshot | World Bank Indicators API |
| [Global Health Systems & Financing](consoles/global-health-systems/) | Annual public data + snapshot | World Bank Indicators API |
| [Global Road Safety & Injury](consoles/global-road-safety/) | Annual public data + snapshot | World Bank / WHO comparable estimates |
| [Air Pollution & Environmental Health](consoles/global-air-pollution/) | Annual public data + snapshot | World Bank Indicators API |
| [Global WASH](consoles/global-wash/) | Annual public data + snapshot | World Bank / WHO-UNICEF JMP |
| [Antimicrobial Resistance](consoles/antimicrobial-resistance/) | Modeled | GRAM/IHME + CDC AR Threats |

**Markets**

| Console | Data | Sources |
|---|---|---|
| [Resilience Telemetry](consoles/resilience-telemetry/) | Live + automatically updated macro reports + snapshot | Binance.US, Frankfurter FX, official FRED downloads and equity fallback |

**Affording Care**

| Console | Data | Sources |
|---|---|---|
| [Prescription Savings Finder](consoles/prescription-savings/) | Current-release references | CMS NADAC acquisition-cost records and referenced assistance options |
| [Medical Cost Abroad](consoles/medical-cost-abroad/) | Illustrative planning ranges | Procedure, flight and lodging ranges; verify actual provider/travel quotes |
| [Medical Debt Assistant](consoles/medical-debt-assistant/) | Reference | FDCPA / FCRA rights and nonprofit-hospital charity-care guidance |

**Get Help**

| Console | Data | Sources |
|---|---|---|
| [Human Trafficking — Get Help](consoles/human-trafficking/) | Reference | Verified hotlines + Polaris / UNODC / ILO–Walk Free / CTDC (badge-framed) |
| [Free Public Bathroom Finder](consoles/public-bathroom-finder/) | Live listings | Refuge Restrooms (crowd-sourced listings, each with its date), OpenStreetMap amenity=toilets via Overpass (partial coverage; "free" only where tagged fee=no) |

## No visitor API keys

All public consoles open without a visitor account or provider key. Maps use standard OpenStreetMap
tiles with visible attribution; mapping failures leave the data panels usable. Air quality uses EPA's
[public reporting-area observation file](https://files.airnowtech.org/airnow/today/reportingarea.dat),
with observation time, reporting-area distance and freshness checks. U.S. Grid Strain opens immediately
on embedded EIA measurements and checks a same-origin public data file for updates. GitHub Actions
checks EIA's keyless downloads every six hours; an open, visible dashboard checks the published file
every 15 minutes. Neither visitors nor the scheduled job need an EIA key. These are **delayed public
reports**, with measurement dates shown, rather than a real-time operational feed.
Free Public Bathroom Finder uses the keyless Refuge Restrooms API and OpenStreetMap Nominatim and Overpass queries; each result shows its source and data date, and a failed source is shown as unavailable, never as zero.

## How they work

Most consoles fetch public APIs **client-side**, directly from your browser. Grid EIA files, Coastal
context, NHS Scotland reports and Resilience FRED series are also processed by scheduled GitHub
Actions jobs and published with the site, avoiding browser CORS and provider-key requirements. Running on a real
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
These exercise keyless startup, public-data fixtures, all 33 response plans and unavailable map/feed states. External requests
are intercepted; automated tests do not download OpenStreetMap tiles. Normal interactive maps follow
the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

When Google Chrome is already installed, use `CHROME_CHANNEL=chrome npm test` instead of installing
the bundled Chromium. Run `python3 scripts/embed_response_plans.py --check` to verify that the
single-file consoles contain the current shared checklist and domain adapters. After editing those
maintainer sources, regenerate with `python3 scripts/embed_response_plans.py` before testing/publishing.

The World Bank and CDC public-data helpers are also embedded into the single-file pages. Run
`python3 scripts/embed_worldbank_runtime.py --check` and
`python3 scripts/embed_health_runtime.py --check` to check their maintained sources; omit `--check`
after editing a helper to regenerate its pages. Browser checks include dated/partial source data,
automatic refresh, source failures and location-selection races.

Pages publication runs only after **both** catalog/Python checks and the complete browser suite pass.
The dependent deploy job packages the exact tested commit, rejects a superseded main revision, and
publishes a `build-info.json` commit marker. Scheduled source publishers explicitly dispatch this same
workflow using the built-in token, then verify both the marker and their exact public JSON payloads.
A failed validation leaves the previous site published; a later unchanged refresh can retry deployment.

## Automatic EIA grid updates

The [grid update workflow](https://github.com/patrickiben/public-data-consoles/actions/workflows/update-grid.yml)
checks the official keyless EIA-930 downloads at **04:17, 10:17, 16:17 and 22:17 UTC**. GitHub schedules
are best effort and can run late. A maintainer can also choose **Run workflow** there. No EIA key,
personal access token or additional repository secret is needed.

The refresh discovers published balance and interchange files from EIA's manifest, including prior
reporting periods when needed. It validates schemas, coverage and timestamps, runs the catalog,
Python and browser checks, and commits only changed grid data. It explicitly requests and verifies a
gated validation/deployment workflow because commits made with GitHub's built-in token do not start push workflows themselves.
An unchanged run still checks deployment so a previous publishing failure can recover.

The same validated payload is embedded in the HTML and published at
[`consoles/us-grid-strain/data/latest.json`](consoles/us-grid-strain/data/latest.json).
The dashboard checks this file at startup, with **Check public updates**, every 15 minutes while visible and when
returning to the page. Failed, invalid or older responses leave the last good measurements on screen.
Local `file://` views use the embedded data. An optional personal EIA connection remains available.

The displayed measurement dates are separate from capture and update-check times. EIA publishes
different measurements at different speeds; its [publication notes](https://www.eia.gov/electricity/930-content/about.html)
explain the generation and bilateral-interchange delays. Checking every six hours does not guarantee
new source data on each run. The page warns about aging measurements or an old published capture.

For a local refresh, run `python3 scripts/refresh_grid_snapshot.py --automated`. It records source URLs,
response modification dates, SHA-256 hashes and the actual capture time. Only raw reported values are
used; forecasts are aligned with each authority's latest actual-demand hour, and missing values remain
missing. Source files with regressing or unexpectedly incomplete coverage stop the refresh and preserve
the packaged measurements.

To replay a saved capture, put `balance.csv`, `interchange.csv` and their optional `.headers` files
in one folder and pass `--files /path/to/capture --period 2026_Jul_Dec --captured-at ISO_TIMESTAMP`.
Use the original retrieval timestamp only for an archived replay. Review the data diff, run the catalog,
unit and browser checks above, and inspect the page before publishing.

## Automatic Coastal impact inputs

[Coastal projected impacts](https://patrickiben.github.io/public-data-consoles/consoles/coastal-water-resilience/#impact)
open in automatic public-data mode; no example button, account or provider key is needed. The page
reselects the highest remaining valid NOAA OFS sample within 48 hours and screens the actual published
station terrain at the converted gauge datum. A selected scenario level can also use the public inputs.
The displayed forecast-sample span is a reference time window, never an assumed outage duration.

For screened locations, the page selects distinct official station basin IDs, unions their Census block
IDs and sums each population once. The source is the **2020 Census**, assigned using block internal
points inside the City's published basin geometry. This is a geographic footprint estimate, not a
customer roster, a count of flooded residents or a service-loss prediction. Source labels are retained
when station points and their published basin polygons disagree; no nearest-basin substitution is made.

FDEP's annual reuse inventory supplies the three named facilities' **actual average annual wastewater
throughput**, kept separate from permitted capacity and from distributed reclaimed-water volume. An
equivalent volume over the real forecast-sample span is whole-facility reference arithmetic; no flow is
allocated to screened stations or Census populations. Measurement periods, formulas and source links
are shown. Repair costs, downtime and funding shares remain optional local inputs where public data
cannot establish them.

The [coastal source workflow](https://github.com/patrickiben/public-data-consoles/actions/workflows/update-coastal.yml)
reacquires the official station register, county zone intersections and basin/Census services, and
discovers the latest published FDEP annual workbook **weekly**, using GitHub's built-in token and no
additional secret. Unchanged coordinates retain their independently verified terrain samples and
original acquisition/retrieval dates; new or moved points require a successful USGS/datum check.
Source count/ID/aggregate controls,
geometry coverage, workbook schema and all automated checks must pass before both portable JSON files
and offline HTML are committed together and Pages is explicitly verified. A fingerprint binds the
geographic context to the exact station inventory; a page with an older inventory asks for a reload
instead of mixing editions. Source failure preserves the last good
publication. A visible page checks the same-origin context at startup, every six hours and on return
to the foreground; malformed, incomplete or older updates retain its last good context. Local files use
the embedded reference data. A new retrieval does not change the displayed Census or flow reference year.

Maintainers can run `python3 scripts/refresh_coastal_impact.py` to reacquire the public inputs and
`python3 scripts/refresh_coastal_impact.py --check` for the offline publication guard. The portable
payloads are [public-stations.json](consoles/coastal-water-resilience/data/public-stations.json) and
[impact-context.json](consoles/coastal-water-resilience/data/impact-context.json). Use `--refresh-terrain`
for a deliberate full USGS resampling; ordinary refreshes preserve unchanged valid samples. Collectors
use Python's standard library; no spreadsheet or GIS package is required on the runner.

## Automatic NHS Scotland reports

[NHS Scotland](https://patrickiben.github.io/public-data-consoles/consoles/nhs-scotland-strain/)
populates A&E, all-specialty board occupancy and delayed-discharge reports automatically. Its
[workflow](https://github.com/patrickiben/public-data-consoles/actions/workflows/update-nhs.yml)
checks the official PHS downloads every **Tuesday at 13:43 UTC**. Complete CSV record counts are
checked against CKAN; exact category selections avoid overlapping attendance, specialty and age/reason
aggregates. Thirty ED weeks, territorial-board coverage, source identities and counts must validate
before the embedded page and portable JSON are published.

The page checks updates on opening, every six visible hours, on return when due and by button. It
retains last-good reports on incomplete, regressed or unavailable updates and preserves scenario
selection. Weekly A&E, quarterly beds and monthly delays keep separate periods. The 95% line is a
planning reference for the Type-1 subset, not an assessment of the full A&E access standard. The
composite score and what-if adjustments remain interpretive; no mortality or live-bed estimate is inferred.

Run `python3 scripts/refresh_nhs.py` to collect and `python3 scripts/refresh_nhs.py --check` to verify
portable/embedded agreement. [Source definitions and operator guide](consoles/nhs-scotland-strain/wiki.html).

## Automatic public indicators across the other consoles

The 12 World Bank dashboards now request through the current calendar year and select the latest
nonmissing observation for each country/indicator. Complete pagination, source identity, finite values
and individual reporting years are checked before updates; a new download does not make an annual
estimate a current incident. Open pages check again every six visible hours. USAID's economic-dependency
panel uses the same public-data checks while preserving its separate dated funding and health scenarios.
Older source editions are rejected, and missing/older country observations retain labeled last-good values.

Respiratory surveillance refreshes ED, RESP-NET and wastewater sources independently, so one unavailable
feed cannot freeze the others. Wastewater summaries are unweighted derived means of site categories,
not an official national WVAL. Overdose downloads use bounded pagination and retain individual
jurisdiction/category periods; missing or regressed records keep labeled last-good values. Both consoles
check on opening, by button and every six visible hours.

Prescription searches select the latest weekly NADAC release before matching records, and show NDC,
unit and individual effective dates. Acquisition costs are not retail quotes. Broad FDA name-query
results do not establish product-level equivalence or substitution; an exact professional product
check remains necessary. Annual dataset discovery refreshes automatically, while a drug search is
still required because medication selection is a personal input.

River plans now use NOAA's local stage thresholds and published impact statements where supplied,
with observation/forecast basis and times. Earthquake plans include official USGS PAGER modeled
population exposure. Those products do not establish actual outages, losses or casualties. The
[update guide](https://patrickiben.github.io/public-data-consoles/data-updates.html) covers all 33 consoles,
including public-reference and synthetic modules that cannot obtain real operational or personal inputs.

## Automatic macro updates and manual FRED replay

Resilience Telemetry checks all 19 official FRED CSVs daily at **23:43 UTC** through
[its scheduled workflow](https://github.com/patrickiben/public-data-consoles/actions/workflows/update-fred.yml).
The browser checks the public macro package at startup, hourly while visible, on foreground return and
through its update button. Complete validated updates recompute existing macro-dependent panels; failures
preserve last-good data. Measurement periods remain separate from retrieval time. Equity/crypto/FX feeds
and the dated CAPE/model reference are separate. Run `python3 scripts/refresh_fred.py --automated`
for a bounded keyless source refresh.

The macro data has a portable
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

Use the date the CSVs were actually retrieved. Manual replay is offline and validates every file before
writing, preserves pinned starts and the four daily series' every-fifth-observation stride, retains
older ICE spread history when the source window is truncated, and keeps claims in thousands.
Missing files, invalid numbers, shifted sampling, stale tails and interior deletions stop the refresh
without changing packaged outputs. Review the diff and browser rendering before publishing; the
script updates the FRED data/vintage labels and portable provenance, never market data or algorithms.


### Additional public-data dimensions

The [response-plan field guide](response-plans/guide.html) documents the new supported
calculations: population/land-area comparisons, NHS residence-to-treatment stays,
river observation histories, grid demand windows, PAGER country exposure, market
return-density comparisons and matched-period CDC scale checks. Missing or incomplete
comparisons remain unknown; none supplies a causal CRT effect or an operational clearance.

Coastal now opens on its **real public station map** and defaults its checklist to
City-owned public terrain. Online OpenStreetMap street tiles need no visitor key;
public-domain Natural Earth 5.1.1 land geometry is embedded for offline orientation.
The generalized coastline is not a local survey. The separate **Synthetic exercise**
tab preserves the fictional network, calibration and diagnostic demonstration.
Map points are official published locations; no real pipe connections are inferred.

Real station review links connect the map, impact screen and ten-parameter plan. Each future NOAA
sample shows the count of terrain-screened public stations; this is not a prediction of flooding or
outage duration. Public and operator checklists retain all ten questions, with explicit verification
actions when required evidence is unavailable. Public population comparisons use deduplicated Census
blocks in source-labeled basins, never an inferred customer-to-station or station-to-plant allocation.
