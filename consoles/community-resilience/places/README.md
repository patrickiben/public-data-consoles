# Adding a place to Community Resilience

Each JSON file in this folder adds a place's own data on top of the national tier. After adding or changing a file, run:

```
python3 scripts/embed_community_resilience.py
```

No change to the page is needed. A place with no file still gets the full national tier.

## Fields every file needs

- `schemaVersion`: `1`.
- `id`, `name`: short identifier and the name shown on the page.
- `match.placeGeoid`: the Census place GEOID. The file applies when a search lands in that place.
- `publishedBy`: who publishes the data.
- `leadingLocalModule`: the `id` of the module in `modules` to show first.
- `modules`: at least one, each with `id`, `name`, `hazardModules` (hazards it relates to), `strains` (lifelines it relates to) and `assetLabel` (for example "fire stations").
- `links`: optional links, each with `label` and `href`.

## Any kind of asset

Set `files.assets` to a JSON file on this site:

```json
{"schemaVersion": 1, "capturedAt": "2026-11-01", "assets": [{"name": "Station 1", "lat": 32.2, "lon": -110.9, "note": "optional"}]}
```

The page lists these nearest first, as records. It never reads them as live operating condition, and it adds no hazard screen.

## A water-level register, like St. Petersburg

Set `files.stations` and `files.context`, `pins.coopsStation` (a NOAA tide station) and optionally `pins.nwsAlertPoint`. This also adds the water-level screen. See `st-petersburg-fl.json`.

## Adding a hazard module

A new hazard needs three lines in `public-data-runtime/community-resilience-engine.js`, and no change to the page:

1. In `HAZARDS`, add its code, name and module id, for example `['DUST','Dust Storm','dust']`.
2. In `MODULES`, add the module: `{id:'dust',name:'Dust storm',hazards:['DUST'],strains:['transport','health'],liveSources:['nwsAlerts','airQuality'],staticSources:[],screens:[],notCovered:{}}`.
3. In `ALERT_RULES`, add which National Weather Service alerts belong to it: `[/dust storm|blowing dust/i,['DUST']]`.

Then run `python3 scripts/embed_community_resilience.py`.

FEMA's National Risk Index only covers its own 18 hazards, so a new hazard has no yearly loss figure. Its card says so, and an active alert for it still leads the page and sets the plan's phase. Only use sources the page already knows in `liveSources` and `staticSources`. A new data source also needs a function in `public-data-runtime/community-resilience-sources.js`.
