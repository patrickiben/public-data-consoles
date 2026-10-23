// Offline public-visitor checks. No provider credentials or real map tiles are used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leafletRoot = path.join(root, 'node_modules/leaflet/dist');
const leafletJS = await readFile(path.join(leafletRoot, 'leaflet.js'));
const leafletCSS = await readFile(path.join(leafletRoot, 'leaflet.css'));
const fixedTime = Date.parse('2026-10-23T16:00:00Z');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG0kAAAAASUVORK5CYII=', 'base64');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
    if (!filename.startsWith(root + path.sep)) throw new Error('Outside test root');
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

function airRow({ aqi = '42', pollutant = 'PM2.5', type = 'O', date = '10/23/26', hour = '12:00' } = {}) {
  return `${date}|${date}|${hour}|EDT|0|${type}|Y|Test Area|FL|27.77|-82.64|${pollutant}|${aqi}|Good|No||EPA`;
}
const freshAir = [airRow(), airRow({ aqi: '55', pollutant: 'OZONE' }), airRow({ aqi: '250', type: 'F' }), airRow({ aqi: '300', type: 'Y' })].join('\n');
const gauges = [
  { lid: 'TESTA', name: 'Test Upstream Gauge', latitude: 38.63, longitude: -90.18, upstreamLid: null, downstreamLid: 'TESTB', status: { observed: { primary: 12.5, floodCategory: 'action' }, forecast: { floodCategory: 'minor', validTime: '2026-10-23T18:00:00Z' } }, flood: { stageUnits: 'ft', categories: { action: 10, minor: 15 }, crests: [{ value: 16, validTime: '2026-10-23T18:00:00Z' }] } },
  { lid: 'TESTB', name: 'Test Downstream Gauge', latitude: 38.55, longitude: -90.10, upstreamLid: 'TESTA', downstreamLid: null, status: { observed: { primary: 15.5, floodCategory: 'minor' }, forecast: { floodCategory: 'moderate', validTime: '2026-10-24T00:00:00Z' } }, flood: { stageUnits: 'ft', categories: { action: 10, minor: 15 }, crests: [{ value: 19, validTime: '2026-10-24T00:00:00Z' }] } },
];
gauges.forEach((g,i)=>{g.usgsId=String(i+1);g.status.observed.validTime='2026-10-23T16:00:00Z';g.status.observed.primaryUnit='ft';});
const gaugeFeatures = gauges.map((g, index) => ({ type: 'Feature', properties: { identifier: `USGS-${index + 1}`, name: g.name }, geometry: { type: 'Point', coordinates: [g.longitude, g.latitude] } }));
const quake = { type: 'Feature', id: 'us6000t7zp', geometry: { type: 'Point', coordinates: [-90.18, 38.63, 9] }, properties: { mag: 5.6, place: 'Offline fixture earthquake', time: fixedTime - 3600000, alert: 'orange', sig: 500, felt: 12, tsunami: 0, products: {}, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000t7zp' } };
const empty = { type: 'FeatureCollection', features: [], elements: [], stations: [], gauges: [], data: [], results: [{ county_fips: '12103' }], properties: { periods: [] } };

async function fixture(route, options, requests) {
  const request = route.request();
  const url = new URL(request.url());
  requests.push(url.href);
  if (url.origin === origin && url.pathname.endsWith('/us-grid-strain/data/latest.json')) return route.fulfill({ status: 404, body: 'Fixture: no published update' });
  if (url.origin === origin) return route.continue();
  // All external requests terminate here: never continue to an OSM/provider server.
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (/\/leaflet@1\.9\.4\/dist\/leaflet\.(js|css)$/.test(url.pathname)) {
    if (options.blockLeaflet) return route.fulfill({ status: 503, headers, body: '' });
    const js = url.pathname.endsWith('.js');
    return route.fulfill({ headers, contentType: js ? 'application/javascript' : 'text/css', body: js ? leafletJS : leafletCSS });
  }
  if (url.hostname === 'tile.openstreetmap.org') {
    return route.fulfill({ headers, status: options.failTiles ? 503 : 200, contentType: 'image/png', body: options.failTiles ? Buffer.alloc(0) : pixel });
  }
  if (/cartocdn|mapbox|maptiler|stadiamaps/.test(url.hostname)) return route.fulfill({ status: 503, headers, body: '' });
  if (url.hostname === 'files.airnowtech.org') return route.fulfill({ headers, status: options.airStatus || 200, contentType: 'text/plain', body: options.airBody ?? freshAir });
  const json = value => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(value) });
  if (url.hostname === 'api.zippopotam.us') return json({ places: [{ latitude: '27.77', longitude: '-82.64', 'place name': 'St Petersburg', 'state abbreviation': 'FL' }] });
  if (url.hostname === 'nominatim.openstreetmap.org') return json([{ lat: '27.77', lon: '-82.64', display_name: 'St Petersburg, FL' }]);
  if (url.hostname === 'api.water.noaa.gov') {
    const lid = url.pathname.match(/\/gauges\/(TEST[AB])/i)?.[1].toUpperCase();
    if (url.pathname.includes('/stageflow/forecast')) return json({ issuedTime:'2026-10-23T16:00:00Z',primaryUnits:'ft',data: [{ primary: lid === 'TESTA' ? 16 : 19, validTime: lid === 'TESTA' ? '2026-10-23T18:00:00Z' : '2026-10-24T00:00:00Z' }] });
    return json(lid ? gauges.find(g => g.lid === lid) : { gauges });
  }
  if (url.hostname === 'api.water.usgs.gov') {
    if (url.pathname.endsWith('/position')) return json({ features: [{ properties: { comid: '12345' } }] });
    if (url.pathname.includes('/flowlines')) return json({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: gaugeFeatures.map(f => f.geometry.coordinates) } }] });
    if (url.pathname.includes('/navigation/DM/')) return json({ features: url.pathname.includes('USGS-1') ? [gaugeFeatures[1]] : [] });
    return json({ features: url.pathname.includes('/navigation/UM/') ? [gaugeFeatures[0]] : gaugeFeatures });
  }
  if (url.hostname === 'earthquake.usgs.gov') {
    if (url.searchParams.has('eventid')) return json(quake);
    if (url.pathname.includes('significant_month')) return json({ type: 'FeatureCollection', features: [quake] });
    return json(empty);
  }
  if (url.hostname === 'api.weather.gov' && url.pathname.startsWith('/points/')) return json({ properties: { forecast: 'https://api.weather.gov/fixture-forecast', relativeLocation: { properties: { city: 'St Petersburg', state: 'FL' } } } });
  if (url.pathname.endsWith('.css')) return route.fulfill({ headers, contentType: 'text/css', body: '' });
  if (request.resourceType() === 'image' || request.resourceType() === 'font') return route.fulfill({ headers, contentType: 'image/png', body: pixel });
  return json(empty);
}

async function textMatches(page, selector, expression) {
  await page.waitForFunction(({ selector, source, flags }) => new RegExp(source, flags).test(document.querySelector(selector)?.textContent || ''), { selector, source: expression.source, flags: expression.flags }, { timeout: 10000 });
  const text = await page.locator(selector).textContent();
  assert.match(text, expression);
  return text;
}

async function checkData(page, slug) {
  if (slug === 'quake-consequence') {
    await textMatches(page, '#event', /Offline fixture earthquake/);
    assert.match(await page.locator('#event').textContent(), /5\.6/);
  } else if (slug === 'river-flood-propagation') {
    await page.waitForFunction(() => document.querySelectorAll('#chain .node').length === 2);
    assert.equal(await page.locator('#chain .node').count(), 2);
    assert.match(await page.locator('#chain .node').nth(0).textContent(), /Test Upstream Gauge[\s\S]*stage 12\.5 ft/);
    assert.match(await page.locator('#chain .node').nth(1).textContent(), /Test Downstream Gauge[\s\S]*stage 15\.5 ft/);
  } else if (slug === 'river-flood-network') {
    await textMatches(page, '#status', /2 forecast gauges/);
    assert.equal(await page.locator('#sources .src').count(), 2);
  } else if (slug === 'us-local-hazards') {
    await page.locator('#q').fill('33701');
    await page.locator('#go').click();
    await page.waitForFunction(() => document.querySelector('#air') && !document.querySelector('#air .spin'));
    await textMatches(page, '#place', /St Petersburg/);
    assert.equal(await page.locator('#card-air').isVisible(), true);
  } else if (slug === 'us-grid-strain') {
    assert.equal(await page.locator('#app').isVisible(), true);
    assert.equal(await page.locator('#gate').count(), 0);
    const metadata = await page.locator('#grid-snapshot').evaluate(el => JSON.parse(el.textContent));
    const expected = new Set(metadata.snap.filter(r => r[1] === 'D').map(r => r[0])).size;
    await page.waitForFunction(expected => document.querySelectorAll('#lead .row2').length === expected, expected);
    assert.equal(await page.locator('#lead .row2').count(), expected);
    assert.equal(await page.locator('#kpis .kpi').count(), 4);
    const note = await page.locator('#data-note').textContent();
    assert.match(note, /MEASURED/i);
    assert.match(note, /snapshot/i);
    assert.ok(note.includes(metadata.capturedAt.slice(0, 10)), 'Capture date comes from embedded metadata');
    assert.match(note, /not live/i);
    const first = page.locator('#lead .row2').first();
    const code = await first.getAttribute('data-c');
    await first.click();
    await textMatches(page, '#dname', new RegExp(code));
    assert.equal(await page.locator('#detail').isVisible(), true);
  }
}

let browser;
let passed = 0;
async function scenario(slug, options = {}) {
  const label = `${slug}: ${options.name || (options.blockLeaflet ? 'mapping CDN unavailable' : options.failTiles ? 'basemap tiles unavailable' : 'offline public visitor')}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const requests = [], errors = [];
  try {
    await context.addInitScript(({ now }) => {
      const RealDate = Date;
      window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
      };
    }, { now: fixedTime });
    await context.route('**/*', route => fixture(route, options, requests));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/consoles/${slug}/`, { waitUntil: 'load' });
    await checkData(page, slug);
    assert.equal(await page.locator('input[placeholder*="API key" i]:visible').count(), 0, label);
    assert.doesNotMatch(await page.locator('body').innerText(), /key needed|one-time setup: your free|paste your .*api key/i, label);

    if (options.blockLeaflet) {
      await page.locator('#map, #map-status').filter({ hasText: /Map unavailable/i }).first().waitFor({ state: 'visible' });
    } else {
      assert.equal(await page.evaluate(() => window.L?.version), '1.9.4', 'Use the actual pinned Leaflet library');
      await page.waitForFunction(() => document.querySelector('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'));
      assert.equal(await page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]').isVisible(), true);
      assert.match(await page.locator('.leaflet-control-attribution').textContent(), /OpenStreetMap[\s\S]*contributors/i);
      assert.ok(requests.some(url => new URL(url).hostname === 'tile.openstreetmap.org'), label + ': public OSM tile URL requested');
      if (options.failTiles) {
        await page.locator('.basemap-status, #map-status').filter({ hasText: /basemap.*unavailable|tiles.*unavailable/i }).first().waitFor({ state: 'visible' });
      } else {
        await page.locator('.leaflet-tile-loaded').first().waitFor({ state: 'attached' });
      }
    }

    if (slug === 'us-local-hazards') {
      const air = await page.locator('#air').textContent();
      if (options.noAQI) {
        assert.doesNotMatch(air, /\bAQI\s+\d+/i, label + ': do not fabricate a numeric AQI');
        assert.match(await page.locator('#lvl-air').textContent(), /unavailable/i);
      } else {
        assert.match(air, /AQI 55 · Moderate/);
        assert.match(air, /MEASURED · preliminary AirNow observation/);
        assert.match(air, /Observed 10\/23\/26 12:00 EDT/);
        assert.match(air, /fetched 2026-10-23 16:00 UTC/);
      }
      if (options.airExpected) assert.match(air, options.airExpected);
    }
    assert.equal(requests.some(url => /cartocdn|mapbox|maptiler|stadiamaps/.test(new URL(url).hostname)), false, label + ': no keyed/commercial basemap request');
    assert.equal(requests.some(url => new URL(url).hostname === 'api.eia.gov'), false, label + ': anonymous visitor never requests the credentialed EIA API');
    assert.equal(requests.some(url => /www\.airnowapi\.org|[?&]api_key=/i.test(url)), false, label + ': no credentialed AirNow requests');
    assert.deepEqual(errors, [], label);
    passed += 1;
    console.log(`PASS ${label}`);
  } catch (error) {
    error.message = `${label}: ${error.message}; page errors: ${JSON.stringify(errors)}`;
    throw error;
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {}) });
  for (const slug of ['quake-consequence', 'river-flood-network', 'river-flood-propagation', 'us-local-hazards', 'us-grid-strain']) {
    await scenario(slug);
    await scenario(slug, { failTiles: true });
    await scenario(slug, { blockLeaflet: true });
  }
  for (const test of [
    { name: 'blank AQI is unavailable, not zero', airBody: airRow({ aqi: '' }), noAQI: true, airExpected: /No usable hourly/ },
    { name: 'forecasts/yesterday cannot become observations', airBody: [airRow({ type: 'F', aqi: '250' }), airRow({ type: 'Y', aqi: '300' })].join('\n'), noAQI: true, airExpected: /No usable hourly/ },
    { name: 'stale measured AQI withheld', airBody: airRow({ date: '10/20/26' }), noAQI: true, airExpected: /no current AQI is shown/ },
    { name: 'AirNow feed HTTP 503 is unavailable', airBody: 'Unavailable', airStatus: 503, noAQI: true, airExpected: /unavailable right now/ },
  ]) await scenario('us-local-hazards', test);
  console.log(`PASS ${passed} offline keyless browser scenarios; no real provider/tile requests and no page errors.`);
} finally {
  if (browser) await browser.close();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
