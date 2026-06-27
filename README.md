# Public-Data Consoles

A small collection of **self-contained, browser-only dashboards** built on **live public data feeds**.
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

| Console | Data | Sources |
|---|---|---|
| [Earthquake Consequence](consoles/quake-consequence/) | Live, global | USGS PAGER / ShakeMap / ground-failure / DYFI, OSM/Overpass lifelines |
| [River Flood Propagation](consoles/river-flood-propagation/) | Live, U.S. | NOAA National Water Prediction Service (NWPS) |
| [River Flood Network](consoles/river-flood-network/) | Live, U.S. | USGS NLDI (network-linked data index) |
| [Hazards Near You](consoles/us-local-hazards/) | Live, U.S. | NWS, NOAA SPC/NHC/Tides, USGS, FEMA NFHL, EPA AirNow*, U.S. Drought Monitor |
| [NHS Scotland — Hospital Strain](consoles/nhs-scotland-strain/) | Live, Scotland | Public Health Scotland open-data (CKAN) |
| [USAID Withdrawal — Consequence](consoles/usaid-consequence/) | Live + modeled | USAspending API + cited published estimates |
| [VA Medical Center — Strain](consoles/va-strain/) | Demo template | Labeled demo data + hooks for internal feeds |
| [Resilience Telemetry](consoles/resilience-telemetry/) | Live + snapshot | Binance.US, Frankfurter FX, embedded equity snapshot |

\* **EPA AirNow** needs a free key you supply yourself. The public copy ships with the key blank; the
air-quality panel shows a "key needed" prompt until you paste your own into `AIRNOW_KEY` at the top of
`consoles/us-local-hazards/index.html`. **Do not commit a real key to a public repo.**

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
