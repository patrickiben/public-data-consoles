// Food Desert Oases: mocked-feed browser checks. Every external host is intercepted; nothing reaches a live service.
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
const EM_DASH = String.fromCharCode(0x2014);
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG0kAAAAASUVORK5CYII=', 'base64');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

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
const pageUrl = `${origin}/consoles/food-desert-oases/`;

// Fixture places, keyed by longitude so each service can tell which search a request belongs to.
const PLACES = {
  cleveland: { lat: 41.5008257, lon: -81.6812866, name: '1500, Euclid Avenue, Downtown Cleveland, Cleveland, Cuyahoga County, Ohio, 44115, United States', addresstype: 'place', address: { country_code: 'us', state: 'Ohio' } },
  jordan: { lat: 47.3205365, lon: -106.9109964, name: '59337, Jordan, Garfield County, Montana, United States', addresstype: 'postcode', address: { country_code: 'us', state: 'Montana', postcode: '59337' } },
  hazard: { lat: 37.2498, lon: -83.1932, name: 'Hazard, Perry County, Kentucky, United States', addresstype: 'town', address: { country_code: 'us', state: 'Kentucky' } },
  slow: { lat: 40.25, lon: -80.25, name: 'Slow Town, Pennsylvania, United States', addresstype: 'town', address: { country_code: 'us', state: 'Pennsylvania' } },
  sanjuan: { lat: 18.4655, lon: -66.1057, name: 'San Juan, Puerto Rico', addresstype: 'city', address: { country_code: 'pr', state: 'Puerto Rico' } },
};
function placeForLon(lon) {
  return Object.entries(PLACES).find(([, p]) => Math.abs(p.lon - lon) < 0.05)?.[0] || null;
}
const ATLAS25 = {
  cleveland: { CensusTract20: '39035107701', State: 'Ohio', County20: 'Cuyahoga County', Urban: 1, POP2020: 5524, LowIncomeTracts: 1, PovertyRate: 21.9, SD_SRAM_LILATracts_1And10: 0, SD_SRAM_LILATracts_halfAnd10: 0, SD_SRAM_LILATracts_1And20: 0, SD_SRAM_LILATracts_Vehicle: 0, SD_SRAM_HUNVFlag: 0, SD_SRAM_LA1and10: 0, SD_SRAM_LAhalfand10: 0, SD_SRAM_LA1and20: 0, SD_SRAM_LATractsVehicle_20: 0 },
  jordan: { CensusTract20: '30033000100', State: 'Montana', County20: 'Garfield County', Urban: 0, POP2020: 1173, LowIncomeTracts: 0, PovertyRate: 13.4, SD_SRAM_LILATracts_1And10: 0, SD_SRAM_LILATracts_halfAnd10: 0, SD_SRAM_LILATracts_1And20: 0, SD_SRAM_LILATracts_Vehicle: 0, SD_SRAM_HUNVFlag: 0, SD_SRAM_LA1and10: 1, SD_SRAM_LAhalfand10: 1, SD_SRAM_LA1and20: 1, SD_SRAM_LATractsVehicle_20: 1 },
  hazard: { CensusTract20: '21193970602', State: 'Kentucky', County20: 'Perry County', Urban: 1, LowIncomeTracts: 1, PovertyRate: 41.8, SD_SRAM_LILATracts_1And10: 0, SD_SRAM_LILATracts_halfAnd10: 1, SD_SRAM_LILATracts_1And20: 0, SD_SRAM_LILATracts_Vehicle: 0, SD_SRAM_HUNVFlag: 0, SD_SRAM_LA1and10: 0, SD_SRAM_LAhalfand10: 1, SD_SRAM_LA1and20: 0, SD_SRAM_LATractsVehicle_20: 0 },
  slow: { CensusTract20: '42999999999', State: 'Pennsylvania', County20: 'Slow County', Urban: 0, LowIncomeTracts: 1, SD_SRAM_LILATracts_1And10: 1, SD_SRAM_LA1and10: 1 },
};
const ATLAS19 = {
  cleveland: { CensusTract: '39035107701', St_Name: 'Ohio', Cnty_Name: 'Cuyahoga', Urban: 1, LowIncomeTracts: 1, LILATracts_1And10: 0, LILATracts_halfAnd10: 0, LILATracts_1And20: 0, LILATracts_Vehicle: 0, LA1and10: 0, LAhalfand10: 0, LA1and20: 0 },
  jordan: { CensusTract: '30033000100', St_Name: 'Montana', Cnty_Name: 'Garfield', Urban: 0, LowIncomeTracts: 0, LILATracts_1And10: 0, LILATracts_halfAnd10: 0, LILATracts_1And20: 0, LILATracts_Vehicle: 0, LA1and10: 1, LAhalfand10: 1, LA1and20: 1 },
  slow: { CensusTract: '42999999998', Urban: 0, LowIncomeTracts: 1, LILATracts_1And10: 1, LA1and10: 1 },
};
const TYPES = ['Supermarket', 'Convenience Store', 'Grocery Store', 'Specialty Store', 'Super Store', 'Other'];
function stores(key, count, markets) {
  const p = PLACES[key];
  return Array.from({ length: count }, (_, i) => ({ attributes: {
    Store_Name: key === 'slow' ? `Slow Store ${i + 1}` : markets ? `Fixture Market ${i + 1}` : `Fixture Store ${String(i + 1).padStart(2, '0')}`,
    Store_Street_Address: `${100 + i} Main St`, Additonal_Address: null, City: 'Fixture City', State: 'OH', Zip_Code: '44115',
    Store_Type: markets ? 'Farmers and Markets' : TYPES[i % TYPES.length],
    Latitude: p.lat + (markets ? 0.02 : 0.001) * (i + 1), Longitude: p.lon, Incentive_Program: i === 0 && markets ? 'Fixture Bucks' : null,
  } }));
}
function overpass(key) {
  const p = PLACES[key];
  return { version: 0.6, generator: 'fixture', osm3s: { timestamp_osm_base: '2026-10-30T17:17:16Z' }, elements: [
    { type: 'node', id: 1, lat: p.lat + 0.004, lon: p.lon, timestamp: '2024-05-01T10:00:00Z', tags: { name: 'Pantry <img src=x onerror="window.__xss=1">', amenity: 'social_facility', social_facility: 'food_bank', 'addr:housenumber': '3764', 'addr:street': 'Pearl Road', 'addr:city': 'Cleveland', opening_hours: 'Tu,Th 10:00-14:00', phone: '+1 216 555 0100', website: 'https://pantry.example.org/' } },
    { type: 'way', id: 2, center: { lat: p.lat + 0.03, lon: p.lon }, timestamp: '2023-01-02T10:00:00Z', tags: { social_facility: 'soup_kitchen', website: 'javascript:alert(1)' } },
  ] };
}

const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });
let passed = 0;

async function open(options = {}, contextOptions = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, ...contextOptions });
  const page = await context.newPage();
  const log = { requests: [], nominatimTimes: [], unexpected: [], errors: [] };
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) log.errors.push(m.text()); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    log.requests.push(url.href);
    const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    const json = (value, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
    const fail = () => route.fulfill({ status: 503, headers, contentType: 'text/plain', body: 'fixture outage' });
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const opt = options;
    if (/\/leaflet@1\.9\.4\/dist\/leaflet\.(js|css)$/.test(url.pathname) && url.hostname === 'unpkg.com') {
      if (opt.blockLeaflet) return route.fulfill({ status: 503, headers, body: '' });
      if (opt.hangLeaflet) return; // never answered: the page must not wait for it
      const js = url.pathname.endsWith('.js');
      return route.fulfill({ headers, contentType: js ? 'application/javascript' : 'text/css', body: js ? leafletJS : leafletCSS });
    }
    if (url.hostname === 'tile.openstreetmap.org') return route.fulfill({ headers, contentType: 'image/png', body: pixel });
    if (url.hostname === 'nominatim.openstreetmap.org') {
      log.nominatimTimes.push(Date.now());
      if (opt.fail?.has('nominatim')) return fail();
      const q = (url.searchParams.get('q') || '').toLowerCase(), zip = url.searchParams.get('postalcode');
      const key = zip === '59337' ? 'jordan' : q.includes('cleveland') ? 'cleveland' : q.includes('slow town') ? 'slow' : q.includes('fast town') ? 'cleveland' : q.includes('san juan') ? 'sanjuan' : q.includes('hazard') ? 'hazard' : null;
      if (key === 'slow' && opt.slow) await delay(1200);
      if (!key) return json([]);
      const p = PLACES[key];
      return json([{ lat: String(p.lat), lon: String(p.lon), display_name: p.name, addresstype: p.addresstype, type: p.addresstype, address: p.address }]);
    }
    if (url.hostname === 'gisportal.ers.usda.gov') {
      const is25 = url.pathname.includes('FARA_2025_StraightLine/MapServer/4/query'), is19 = url.pathname.includes('FARA_2019/MapServer/30/query');
      if (!is25 && !is19) { log.unexpected.push(url.href); return fail(); }
      const key = placeForLon(+url.searchParams.get('geometry').split(',')[0]);
      if (key === 'slow' && opt.slow) await delay(2500);
      if (opt.fail?.has(is25 ? 'fara25' : 'fara19')) return fail();
      if (is25 && opt.fara25Delay) await delay(opt.fara25Delay);
      if (opt.empty) return json({ features: [] });
      const attrs = (is25 ? ATLAS25 : ATLAS19)[key];
      return json({ features: attrs ? [{ attributes: attrs }] : [] });
    }
    if (url.hostname === 'services1.arcgis.com' && url.pathname.includes('/snap_retailer_location_data/FeatureServer/0')) {
      if (url.pathname.endsWith('/FeatureServer/0')) {
        if (opt.fail?.has('meta')) return fail();
        if (opt.metaDelay) await delay(opt.metaDelay);
        return json({ name: 'snap_retailer_location_data', editingInfo: { lastEditDate: 1792613414412 } });
      }
      const where = url.searchParams.get('where') || '', markets = where.includes("Store_Type='Farmers and Markets'");
      assert.ok(markets || where.includes("Store_Type<>'Farmers and Markets'"), 'SNAP query must split farmers markets');
      const key = placeForLon(+url.searchParams.get('geometry').split(',')[0]);
      if (key === 'slow' && opt.slow) await delay(2500);
      if (opt.fail?.has(markets ? 'markets' : 'snap')) return fail();
      if (opt.empty) return json({ features: [] });
      const radius = +url.searchParams.get('distance');
      if (!markets && opt.snapFailAbove && radius > opt.snapFailAbove) return json({ error: { code: 400, message: 'Cannot perform query. Invalid query parameters.' } });
      let list = stores(key, markets ? 2 : (opt.snapCount ?? 30), markets);
      if (opt.honorRadius) list = list.filter(f => Math.abs(f.attributes.Latitude - PLACES[key].lat) * 69.05 <= radius);
      return json({ features: list });
    }
    if (url.hostname === 'overpass-api.de' || url.hostname === 'maps.mail.ru') {
      if (opt.fail?.has('overpass') || (url.hostname === 'overpass-api.de' && opt.fail?.has('overpass-main'))) return fail();
      const body = decodeURIComponent((request.postData() || '').replace(/^data=/, '').replace(/\+/g, ' '));
      const m = /around:\d+,([-\d.]+),([-\d.]+)/.exec(body);
      const key = m ? placeForLon(+m[2]) : null;
      if (key === 'slow' && opt.slow) await delay(2500);
      if (opt.osmDelay) await delay(opt.osmDelay);
      if (opt.empty) return json({ osm3s: { timestamp_osm_base: '2026-10-30T17:17:16Z' }, elements: [] });
      return json(overpass(key || 'cleveland'));
    }
    log.unexpected.push(url.href);
    return route.fulfill({ status: 503, headers, body: '' });
  });
  await page.goto(pageUrl);
  return { context, page, log };
}
async function search(page, text, expectedSelection) {
  await page.fill('#q', text);
  await page.press('#q', 'Enter');
  await settled(page, expectedSelection);
}
async function settled(page, selectionId) {
  await page.waitForFunction(n => window.FoodAccessResponse && window.FoodAccessResponse.selectionId === n && window.FoodAccessResponse.state === 'settled', selectionId, { timeout: 15000 });
}
const state = (page, key) => page.getAttribute('#status-' + key, 'data-state');
const text = (page, sel) => page.locator(sel).innerText();
async function noSideScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `${label}: page scrolls sideways by ${overflow}px`);
}
async function finish({ context, log }, label) {
  assert.deepEqual(log.unexpected, [], `${label}: unexpected external requests`);
  assert.deepEqual(log.errors, [], `${label}: page errors`);
  await context.close();
  passed++;
}

try {
  // 1. Idle bridge, successful city search, privacy, escaping, filters, show more, throttle, ZIP search.
  {
    const t = await open();
    const { page, log } = t;
    const idle = await page.evaluate(() => window.FoodAccessResponse);
    assert.equal(idle.state, 'idle');
    assert.equal(idle.selectionId, 0);
    assert.equal(idle.tract.status, 'idle');
    for (const k of ['geocoder', 'atlas2025', 'atlas2019', 'snap', 'markets', 'foodbanks']) assert.equal(idle.sources[k].status, 'idle', 'idle ' + k);
    for (const k of ['geocoder', 'fara25', 'fara19', 'snap', 'markets', 'osm']) assert.match(await text(page, '#status-' + k), /Waiting for a search/);
    const privacy = await text(page, '#privacy');
    assert.match(privacy, /has no server of its own and saves nothing/);
    assert.doesNotMatch(privacy, /stays in your browser/);
    assert.match(privacy, /coordinates to the USDA services/);
    assert.match(privacy, /tile\.openstreetmap\.org/);
    assert.equal(await page.locator('#search-form [name]').count(), 0, 'no named field can reach a URL through a native submit');
    assert.equal(await page.getAttribute('#search-form', 'onsubmit'), 'return false');
    await page.waitForFunction(() => /Search for a place to begin/.test(document.getElementById('console-response').textContent), null, { timeout: 5000 });
    const idlePanel = await page.evaluate(() => document.getElementById('console-response').textContent);
    assert.doesNotMatch(idlePanel, /Check unavailable sources directly/);
    assert.equal(log.requests.filter(u => !/unpkg\.com|tile\.openstreetmap\.org/.test(u)).length, 0, 'no data requests before a search');

    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    for (const k of ['geocoder', 'fara25', 'fara19', 'snap', 'markets', 'osm']) assert.equal(await state(page, k), 'ok', 'ok ' + k);
    assert.match(await text(page, '#place'), /Searched near: 1500, Euclid Avenue/);
    assert.match(await text(page, '#status-snap'), /30 stores within 1 mile\. SNAP retailer list as of October 21, 2026/);
    assert.match(await text(page, '#status-markets'), /2 markets within 50 miles/);
    assert.match(await text(page, '#status-osm'), /2 tagged within 31 miles.*OSM data as of October 30, 2026, 17:17 UTC/s);
    assert.match(await text(page, '#status-fara25'), /39035107701/);
    assert.match(await text(page, '#area-headline'), /Low income, but not low access/);
    const area = await text(page, '#area');
    assert.match(area, /Cuyahoga County, Ohio/);
    assert.match(area, /Urban/);
    assert.match(area, /released July 2026; store locations as of June 2025; 2020 census tracts/);
    assert.match(area, /including convenience stores/);
    assert.match(await text(page, '#area-2019'), /Census tract \(2010\)\s*39035107701/);
    const nomUrl = new URL(log.requests.find(u => u.includes('nominatim')));
    assert.equal(nomUrl.searchParams.get('countrycodes'), 'us,pr,gu,vi,as,mp');
    assert.equal(log.requests.filter(u => u.includes('nominatim')).length, 1);
    assert.equal(log.requests.filter(u => u.includes('overpass-api.de')).length, 1, 'one Overpass query per search');

    assert.equal(await page.locator('#results > li.fa-card').count(), 25, 'first page of 25');
    assert.ok(await page.isVisible('#more'));
    const dists = await page.$$eval('#results .fa-dist', els => els.map(e => parseFloat(e.textContent.replace('under ', ''))));
    assert.deepEqual(dists, [...dists].sort((a, b) => a - b), 'nearest first');
    await page.click('#more');
    assert.equal(await page.locator('#results > li.fa-card').count(), 34);
    assert.ok(await page.isHidden('#more'));
    const first = await text(page, '#results > li.fa-card:first-child');
    assert.match(first, /Confirm before you go/);
    assert.match(first, /straight-line/);
    assert.match(first, /Source: USDA Food and Nutrition Administration SNAP retailer data; list as of October 21, 2026/);
    assert.ok(await page.$('#results a.fa-dir[href^="https://www.openstreetmap.org/directions?route="]'));
    // Escaping and link safety for crowd-sourced text.
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('#results img').count(), 0);
    assert.equal(await page.locator('#results a[href^="javascript:"]').count(), 0);
    const ext = await page.$$eval('#results a[target="_blank"]', as => as.map(a => a.rel));
    assert.ok(ext.length && ext.every(r => r === 'noopener noreferrer'));
    await page.click('#filters [data-filter="food"]');
    assert.equal(await page.locator('#results > li.fa-card').count(), 2);
    const pantry = await text(page, '#results > li.fa-card:first-child');
    assert.match(pantry, /Pantry <img src=x/);
    assert.match(pantry, /Listed hours \(as tagged, may be out of date\): Tu,Th 10:00-14:00/);
    assert.match(pantry, /place last edited 2024-05-01; OSM data as of October 30, 2026/);
    assert.match(await text(page, '#results > li.fa-card:nth-of-type(2)'), /Meal program \(soup kitchen\)/);
    await page.click('#filters [data-filter="market"]');
    assert.equal(await page.locator('#results > li.fa-card').count(), 2);
    await page.click('#filters [data-filter="all"]');
    // Map: markers and visible OSM attribution.
    assert.ok(await page.locator('#map path.leaflet-interactive').count() >= 25);
    assert.ok(await page.isVisible('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'));

    const bridge = await page.evaluate(() => window.FoodAccessResponse);
    assert.equal(bridge.selectionId, 1);
    assert.equal(bridge.tract.status, 'ok');
    assert.equal(bridge.tract.geoid, '39035107701');
    assert.equal(bridge.tract.flags.lowIncome, 1);
    assert.equal(bridge.tract.flags.la1and10, 0);
    assert.match(bridge.tract.vintage, /2025 SNAP-authorized Retailer Access Map/);
    assert.deepEqual([bridge.sources.snap.status, bridge.sources.snap.count, bridge.sources.snap.radiusMi, bridge.sources.snap.dataDate], ['ok', 30, 1, 'October 21, 2026']);
    assert.deepEqual([bridge.sources.foodbanks.status, bridge.sources.foodbanks.count, bridge.sources.foodbanks.radiusMi], ['ok', 2, 31]);
    const serial = JSON.stringify(bridge);
    for (const leak of ['Euclid', '1500', 'Cleveland, OH', '41.50', '-81.68', '41.5008', 'cleveland']) assert.ok(!serial.includes(leak), 'bridge leaks ' + leak);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(() => document.cookie), '');
    assert.equal(page.url(), pageUrl, 'URL carries no query or coordinates');

    // Rural ZIP: postalcode parameter, approximate-center wording, 1 request per second.
    await search(page, '59337', 2);
    const zipUrl = new URL(log.requests.filter(u => u.includes('nominatim')).at(-1));
    assert.equal(zipUrl.searchParams.get('postalcode'), '59337');
    assert.equal(zipUrl.searchParams.get('q'), null);
    assert.match(await text(page, '#place'), /approximate center of ZIP code 59337/);
    assert.match(await text(page, '#area-headline'), /Low access, but not low income/);
    assert.match(await text(page, '#area'), /Rural/);
    const gaps = log.nominatimTimes.slice(1).map((t0, i) => t0 - log.nominatimTimes[i]);
    assert.ok(gaps.every(g => g >= 950), 'Nominatim spacing ' + gaps);
    // Repeating a search uses the in-memory cache, not the network.
    await search(page, '59337', 3);
    assert.equal(log.nominatimTimes.length, 2);
    const visible = await page.evaluate(() => document.body.innerText);
    assert.ok(!visible.includes(EM_DASH), 'no em dash in visible text');
    assert.equal((await readFile(path.join(root, 'consoles/food-desert-oases/index.html'), 'utf8')).includes(EM_DASH), false);
    await finish(t, 'success');
  }

  // 2. Each source failing on its own shows "unavailable" while the others render.
  const failCases = [
    ['fara25', 'fara25'], ['fara19', 'fara19'], ['snap', 'snap'], ['markets', 'markets'], ['overpass', 'osm'],
  ];
  for (const [failKey, row] of failCases) {
    const t = await open({ fail: new Set([failKey]) });
    const { page } = t;
    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    assert.equal(await state(page, row), 'failed', failKey + ' failed');
    const rowText = await text(page, '#status-' + row);
    assert.match(rowText, /Unavailable: the service answered with HTTP 503/);
    assert.match(rowText, /Try again/);
    for (const other of ['fara25', 'fara19', 'snap', 'markets', 'osm'].filter(k => k !== row)) assert.equal(await state(page, other), 'ok', `${other} ok while ${failKey} fails`);
    const bridge = await page.evaluate(() => window.FoodAccessResponse);
    if (row === 'fara25') {
      assert.equal(bridge.tract.status, 'failed');
      assert.equal(bridge.tract.flags, null);
      assert.match(await text(page, '#area-body'), /Area status unavailable.*does not mean the area is not low access/s);
    }
    const listKey = { snap: 'snap', markets: 'markets', osm: 'foodbanks' }[row];
    if (listKey) {
      assert.equal(bridge.sources[listKey].status, 'failed');
      assert.equal(bridge.sources[listKey].count, null, 'failed is never zero');
      assert.match(await text(page, '#results-summary'), /Unavailable:/);
    }
    if (row === 'osm') {
      assert.ok(t.log.requests.some(u => u.includes('maps.mail.ru')), 'mirror tried');
      assert.match(rowText, /tried overpass-api\.de and the maps\.mail\.ru mirror/);
    }
    await finish(t, 'fail ' + failKey);
  }
  // Main Overpass down, mirror up; metadata down gives "data date unavailable"; Try again recovers a failed source.
  {
    const opts = { fail: new Set(['overpass-main', 'meta', 'snap']) };
    const t = await open(opts);
    const { page } = t;
    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    assert.equal(await state(page, 'osm'), 'ok');
    assert.match(await text(page, '#status-markets'), /Data date unavailable/);
    assert.match(await text(page, '#src-date-markets'), /data date unavailable/);
    assert.equal(await state(page, 'snap'), 'failed');
    opts.fail.delete('snap');
    opts.fail.delete('meta');
    await page.click('#status-snap [data-retry="snap"]');
    await page.waitForFunction(() => window.FoodAccessResponse.sources.snap.status === 'ok' && window.FoodAccessResponse.state === 'settled');
    assert.match(await text(page, '#status-snap'), /30 stores within 1 mile\. SNAP retailer list as of October 21, 2026/);
    assert.equal(await page.evaluate(() => window.FoodAccessResponse.selectionId), 1, 'retry is not a new selection');
    await finish(t, 'mirror and retry');
  }

  // 3. Empty sources say "none listed in this source", never a failure or an all-clear.
  {
    const t = await open({ empty: true });
    const { page } = t;
    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    for (const k of ['snap', 'markets', 'osm', 'fara25', 'fara19']) assert.equal(await state(page, k), 'empty', 'empty ' + k);
    assert.match(await text(page, '#status-snap'), /None listed in this source within 50 miles\. This means none are listed here, not that none exist/);
    assert.match(await text(page, '#status-markets'), /None listed in this source within 50 miles/);
    assert.match(await text(page, '#status-osm'), /None listed in this source within 31 miles/);
    assert.match(await text(page, '#area-body'), /No census tract was found.*not a "not low access" result/s);
    const bridge = await page.evaluate(() => window.FoodAccessResponse);
    assert.deepEqual([bridge.sources.snap.status, bridge.sources.snap.count, bridge.sources.snap.radiusMi], ['empty', 0, 50]);
    assert.equal(bridge.tract.status, 'no-tract');
    assert.equal(t.log.requests.filter(u => u.includes('services1.arcgis.com') && u.includes("Store_Type%3C%3E")).length, 6, 'SNAP radius expanded through 1, 2, 5, 10, 25, 50 miles');
    await finish(t, 'empty');
  }

  // 4. Invalid ZIP, no match, geocoder failure, territory coverage.
  {
    const opts = { fail: new Set() };
    const t = await open(opts);
    const { page, log } = t;
    await search(page, '1234', 1);
    assert.match(await text(page, '#place'), /not a valid ZIP code/);
    assert.equal(await state(page, 'geocoder'), 'invalid');
    assert.equal(log.nominatimTimes.length, 0, 'invalid ZIP is not sent');
    assert.equal(await state(page, 'snap'), 'notrun');
    assert.match(await text(page, '#status-snap'), /Not run/);
    await search(page, 'Nowhere Special', 2);
    assert.match(await text(page, '#place'), /No match was found/);
    assert.equal(await state(page, 'geocoder'), 'empty');
    await page.waitForFunction(() => /No place matched the search: try again/.test(document.getElementById('console-response').textContent), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).paddingBottom), '72px', 'room for the floating pill at desktop width');
    opts.fail.add('nominatim');
    await search(page, 'Somewhere Else', 3);
    assert.equal(await state(page, 'geocoder'), 'failed');
    assert.match(await text(page, '#place'), /place search is unavailable/);
    await page.waitForFunction(() => /The place search is unavailable: try again/.test(document.getElementById('console-response').textContent), null, { timeout: 5000 });
    assert.doesNotMatch(await text(page, '#console-response'), /Search for a place to begin|No search yet/);
    opts.fail.delete('nominatim');
    await search(page, 'San Juan, PR', 4);
    assert.equal(await state(page, 'fara25'), 'notcovered');
    assert.match(await text(page, '#area-body'), /50 states and DC only, not Puerto Rico.*separate nutrition assistance program/s);
    assert.equal(await page.evaluate(() => window.FoodAccessResponse.tract.status), 'not-covered');
    assert.equal(log.requests.filter(u => u.includes('gisportal')).length, 0, 'territory skips the Atlas');
    await finish(t, 'input errors');
  }

  // 5. Race: a slow older search can never overwrite a newer one.
  {
    const t = await open({ slow: true });
    const { page } = t;
    await page.fill('#q', 'Slow Town, PA');
    await page.press('#q', 'Enter');
    await page.waitForTimeout(150);
    await page.fill('#q', 'Fast Town, OH');
    await page.press('#q', 'Enter');
    await settled(page, 2);
    await page.waitForTimeout(3200);
    assert.equal(await page.evaluate(() => window.FoodAccessResponse.selectionId), 2);
    assert.equal(await page.evaluate(() => window.FoodAccessResponse.tract.geoid), '39035107701');
    assert.doesNotMatch(await text(page, '#results'), /Slow Store/);
    assert.doesNotMatch(await text(page, '#place'), /Slow Town/);
    assert.match(await text(page, '#area-headline'), /Low income, but not low access/);
    await finish(t, 'race');
  }

  // 6. Leaflet blocked: visible note, everything else works.
  {
    const t = await open({ blockLeaflet: true });
    const { page } = t;
    assert.match(await text(page, '#map'), /Map unavailable/);
    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    assert.equal(await page.locator('#results > li.fa-card').count(), 25);
    assert.equal(await state(page, 'snap'), 'ok');
    await finish(t, 'leaflet blocked');
  }

  // 7. Use my location: granted (no geocoder request) and denied.
  {
    const t = await open({}, { geolocation: { latitude: 41.5008257, longitude: -81.6812866, accuracy: 40 }, permissions: ['geolocation'] });
    const { page, log } = t;
    await page.click('#loc');
    await settled(page, 1);
    assert.match(await text(page, '#place'), /your device location \(accuracy about 40 meters\)/);
    assert.equal(log.nominatimTimes.length, 0);
    assert.equal(await state(page, 'geocoder'), 'notused');
    assert.equal(await state(page, 'snap'), 'ok');
    const serial = await page.evaluate(() => JSON.stringify(window.FoodAccessResponse));
    assert.ok(!serial.includes('41.50') && !serial.includes('-81.68'));
    assert.equal(await page.evaluate(() => window.FoodAccessResponse.locationType), 'device');
    await finish(t, 'location granted');
  }
  {
    const t = await open();
    const { page } = t;
    await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: 1, message: 'denied' }), 10); });
    await page.click('#loc');
    await settled(page, 1);
    assert.match(await text(page, '#place'), /Location permission was denied/);
    await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: 3, message: 'timeout' }), 10); });
    await page.click('#loc');
    await settled(page, 2);
    assert.match(await text(page, '#place'), /did not report a location in time/);
    await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: 2, message: 'unavailable' }), 10); });
    await page.click('#loc');
    await settled(page, 3);
    assert.match(await text(page, '#place'), /location is unavailable right now/);
    await finish(t, 'location errors');
  }

  // 9. Leaflet never answers: the page is still built and usable at once, and Search never submits natively.
  {
    const t = await open({ hangLeaflet: true });
    const { page, log } = t;
    assert.ok(await page.evaluate(() => !!window.FoodAccessResponse), 'page script ran while Leaflet hangs');
    assert.match(await text(page, '#map'), /Loading the map/);
    await page.fill('#q', '1500 Euclid Ave, Cleveland, OH');
    await page.click('#go');
    await settled(page, 1);
    assert.equal(page.url(), pageUrl, 'no native form submit');
    assert.equal(await page.locator('#results > li.fa-card').count(), 25);
    assert.equal(log.nominatimTimes.length, 1);
    await finish(t, 'leaflet hangs');
  }

  // 10. Merged list: per-source search areas in the summary, a divider where the store search stopped,
  //     and the SNAP list shown before a slow layer date arrives.
  {
    const t = await open({ honorRadius: true, metaDelay: 4000, snapCount: 20 });
    const { page } = t;
    await page.fill('#q', '1500 Euclid Ave, Cleveland, OH');
    await page.press('#q', 'Enter');
    await page.waitForFunction(() => window.FoodAccessResponse.sources.snap.status === 'ok', null, { timeout: 3000 });
    assert.match(await text(page, '#status-snap'), /20 stores within 2 miles\. Data date still loading/);
    assert.ok(await page.locator('#results > li.fa-card').count() >= 20, 'cards shown before the date arrives');
    assert.match(await text(page, '#results > li.fa-card:first-child'), /data date still loading/);
    await settled(page, 1);
    assert.match(await text(page, '#status-snap'), /20 stores within 2 miles\. SNAP retailer list as of October 21, 2026/);
    assert.match(await text(page, '#status-markets'), /SNAP retailer list as of October 21, 2026|list as of October 21, 2026/);
    const summary = await text(page, '#results-summary');
    assert.match(summary, /Searched: SNAP-authorized stores within 2 miles \(the search stopped there after finding 20\); SNAP-authorized farmers markets within 50 miles/);
    assert.match(summary, /OpenStreetMap food banks and meal programs within 31 miles/);
    const divider = await text(page, '#results > li.fa-divider');
    assert.match(divider, /Beyond 2 miles: SNAP-authorized stores were searched only within 2 miles/);
    const after = await page.$$eval('#results > li', els => { const i = els.findIndex(e => e.classList.contains('fa-divider')); return els.slice(i + 1).map(e => e.querySelector('.fa-type')?.textContent || ''); });
    assert.ok(after.length && after.every(x => !/SNAP-authorized$/.test(x) || /farmers market/.test(x)), 'no store after the divider');
    await finish(t, 'merged list scope');
  }

  // 11. Partial and failed list sources in the summary; a failure is never shown as "none listed".
  {
    const t = await open({ snapFailAbove: 1, snapCount: 3 });
    const { page } = t;
    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    assert.equal(await state(page, 'snap'), 'partial');
    assert.match(await text(page, '#status-snap'), /Partial: 3 stores within 1 mile; the wider search beyond 1 mile failed: the service reported an error/);
    assert.match(await text(page, '#results-summary'), /Partial: SNAP-authorized stores searched only within 1 mile \(the wider search failed\)/);
    const partialChips = await page.$$eval('#filters [data-filter]', bs => bs.map(b => b.lastElementChild.textContent));
    assert.ok(partialChips.some(c => /^Grocery and supermarkets \(\d+, partial\)$/.test(c)), 'partial chip: ' + partialChips.join(' | '));
    assert.ok(/^All \(\d+\+\)$/.test(partialChips[0]), 'All chip marks an incomplete count: ' + partialChips[0]);
    await finish(t, 'partial summary');
  }
  {
    const t = await open({ fail: new Set(['snap', 'markets', 'overpass']) });
    const { page } = t;
    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    const summary = await text(page, '#results-summary');
    assert.match(summary, /No places can be shown: all 3 list sources are unavailable\. This is not a zero; no results could be retrieved from those sources\./);
    assert.equal((summary.match(/not a zero/g) || []).length, 1, 'summary says "not a zero" once');
    const failChips = await page.$$eval('#filters [data-filter]', bs => bs.map(b => b.lastElementChild.textContent));
    assert.ok(failChips.every(c => /\(unavailable\)$/.test(c) && !/\(0\)/.test(c)), 'failed chips are never zero: ' + failChips.join(' | '));
    assert.match(await text(page, '#src-date-osm'), /unavailable: the OpenStreetMap query failed/);
    assert.doesNotMatch(summary, /No places are listed/);
    await page.waitForFunction(() => /Check unavailable sources directly/.test(document.getElementById('console-response').textContent), null, { timeout: 5000 });
    await finish(t, 'all lists failed');
  }

  // 12. Headline names its measure and the other flagged measures; ZIP+4 forms; retry settle.
  {
    const opts = { fail: new Set(['fara25']), osmDelay: 2500 };
    const t = await open(opts);
    const { page, log } = t;
    await page.fill('#q', 'Hazard, KY');
    await page.press('#q', 'Enter');
    await page.waitForFunction(() => window.FoodAccessResponse.tract.status === 'failed', null, { timeout: 5000 });
    opts.fail.delete('fara25');
    opts.fara25Delay = 4000;
    await page.click('#status-fara25 [data-retry="fara25"]');
    await page.waitForFunction(() => window.FoodAccessResponse.sources.foodbanks.status === 'ok', null, { timeout: 8000 });
    const mid = await page.evaluate(() => window.FoodAccessResponse);
    assert.ok(!(mid.state === 'settled' && mid.tract.status === 'loading'), 'never settled while a retried source loads');
    await settled(page, 1);
    const head = await text(page, '#area-headline');
    assert.match(head, /Low income, but not low access by the main measure \(1 mile urban, 10 miles rural\)/);
    assert.match(head, /flagged low income and low access: 1\/2 mile urban or 10 miles rural/);
    delete opts.fara25Delay;
    for (const [zip, n] of [['59337 1234', 2], ['593371234', 3]]) {
      await search(page, zip, n);
      assert.equal(await state(page, 'geocoder'), 'ok', zip);
    }
    assert.equal(log.requests.filter(u => u.includes('postalcode=59337')).length, 1, 'ZIP+4 forms send the 5-digit ZIP (second one cached)');
    await finish(t, 'headline, zip and retry');
  }

  // 13. Device location in Puerto Rico is not covered, as an address there is; denied location row wording.
  {
    const t = await open({}, { geolocation: { latitude: 18.4655, longitude: -66.1057, accuracy: 30 }, permissions: ['geolocation'] });
    const { page, log } = t;
    await page.click('#loc');
    await settled(page, 1);
    assert.equal(await state(page, 'fara25'), 'notcovered');
    assert.equal(log.requests.filter(u => u.includes('gisportal')).length, 0, 'territory device point skips the Atlas');
    assert.match(await text(page, '#place'), /does not show or save it; its coordinates are sent only to the USDA, ArcGIS Online and OpenStreetMap services/);
    await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: 1, message: 'denied' }), 10); });
    await page.click('#loc');
    await settled(page, 2);
    assert.match(await text(page, '#status-geocoder'), /no device location was available/);
    await finish(t, 'territory device and denied row');
  }

  // 8. Layout: no sideways scroll at 320 px (light) and 375 px (dark), with results showing.
  for (const [width, colorScheme] of [[320, 'light'], [375, 'dark'], [375, 'light']]) {
    const t = await open({}, { viewport: { width, height: 800 }, colorScheme });
    const { page } = t;
    await noSideScroll(page, `${width}px ${colorScheme} idle`);
    await search(page, '1500 Euclid Ave, Cleveland, OH', 1);
    await noSideScroll(page, `${width}px ${colorScheme} results`);
    if (colorScheme === 'light') {
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(bg, 'rgb(243, 246, 249)', 'light background');
    }
    await finish(t, `layout ${width} ${colorScheme}`);
  }

  console.log(`PASS ${passed} food access smoke scenarios`);
} finally {
  await browser.close();
  server.close();
}
