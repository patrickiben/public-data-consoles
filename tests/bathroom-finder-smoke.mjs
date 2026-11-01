// Free Public Bathroom Finder: mocked-feed browser checks. Every external host is intercepted; nothing reaches a live service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(root, 'consoles/public-bathroom-finder/index.html');
const leafletRoot = path.join(root, 'node_modules/leaflet/dist');
const leafletJS = await readFile(path.join(leafletRoot, 'leaflet.js'));
const leafletCSS = await readFile(path.join(leafletRoot, 'leaflet.css'));
const rawPage = await readFile(pagePath, 'utf8');
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
const pageUrl = `${origin}/consoles/public-bathroom-finder/`;

// Fixture places. Every service finds the place a request belongs to from its rounded coordinates.
const MI = 69.0934; // miles per degree of latitude
const BASE_TS = '2026-10-30T17:17:16Z';
const PLACES = {
  chicago: { lat: 41.88219, lon: -87.63087, name: '233, South Wacker Drive, Loop, Chicago, Cook County, Illinois, 60606, United States', addresstype: 'building', address: { country_code: 'us', state: 'Illinois' } },
  rural: { lat: 47.3205365, lon: -106.9109964, name: '59337, Jordan, Garfield County, Montana, United States', addresstype: 'postcode', address: { country_code: 'us', state: 'Montana', postcode: '59337' } },
  slow: { lat: 40.25, lon: -80.25, name: 'Slow Town, Pennsylvania, United States', addresstype: 'town', address: { country_code: 'us', state: 'Pennsylvania' } },
};
const placeNear = (lat, lon) => Object.entries(PLACES).find(([, p]) => Math.abs(p.lat - lat) < 0.2 && Math.abs(p.lon - lon) < 0.2)?.[0] || null;
const north = (p, miles, dLon = 0) => ({ lat: p.lat + miles / MI, lon: p.lon + dLon });
const LONG_DIRECTIONS = 'Enter through the side door on the north side of the building, walk past the front desk, take the elevator to the second floor and follow the signs to the restroom at the end of the hall. Ask the front desk to unlock the door if it is closed.';

function refugeRow(key, id, miles, extra = {}) {
  const pos = north(PLACES[key], miles);
  return { id, name: `Refuge Fixture ${id}`, street: `${id} Test Street`, city: 'Chicago', state: 'IL', country: 'US', accessible: false, unisex: false, changing_table: false, directions: null, comment: null, latitude: +pos.lat.toFixed(6), longitude: +pos.lon.toFixed(6), created_at: '2019-03-04T10:00:00.000Z', updated_at: '2023-07-09T10:00:00.000Z', upvote: 0, downvote: 0, distance: miles, ...extra };
}
function cityRefuge() {
  return [
    refugeRow('chicago', 101, 0.45, { accessible: true, unisex: true, upvote: 12, downvote: 2, created_at: '2020-01-05T09:00:00.000Z', updated_at: '2024-11-20T08:00:00.000Z', comment: `Ask at the desk ${EM_DASH} not the cashier <img src=x onerror="window.__xss=1">` }),
    refugeRow('chicago', 102, 1.9, { directions: LONG_DIRECTIONS, created_at: '2022-02-02T12:00:00.000Z', updated_at: '2022-02-02T12:00:00.000Z' }),
    refugeRow('chicago', 103, 2.6, { name: 'Shared Point A', street: 'n/a', state: 'N/A' }),
    refugeRow('chicago', 104, 2.6, { name: 'Shared Point B' }),
  ];
}
function osmEl(key, type, id, miles, tags, ts = '2024-02-03T10:00:00Z', dLon = 0) {
  const pos = north(PLACES[key], miles, dLon);
  const base = { type, id, timestamp: ts, tags: { amenity: 'toilets', ...tags } };
  return type === 'node' ? { ...base, lat: pos.lat, lon: pos.lon } : { ...base, center: { lat: pos.lat, lon: pos.lon } };
}
function cityOsm() {
  return [
    osmEl('chicago', 'node', 9001, 0.12, { name: 'Millennium Fixture Restroom', fee: 'no', wheelchair: 'yes', opening_hours: '24/7', changing_table: 'yes', unisex: 'yes', check_date: '2025-06-01' }, '2025-08-14T10:00:00Z'),
    osmEl('chicago', 'way', 9002, 0.6, { name: 'Library Fixture Restroom', fee: 'no', access: 'customers', wheelchair: 'limited', opening_hours: 'Mo-Fr 09:00-17:00' }),
    osmEl('chicago', 'node', 9003, 1.1, { operator: 'City Parks Fixture', fee: 'yes', charge: '0.50 USD', wheelchair: 'no' }),
    osmEl('chicago', 'node', 9004, 1.7, {}),
    osmEl('chicago', 'node', 9005, 2.2, { name: 'Plain <b>Bold</b> Toilet', wheelchair: 'designated' }),
    osmEl('chicago', 'node', 9006, 2.8, { name: 'Transit Fixture Restroom', fee: 'no' }),
    osmEl('chicago', 'node', 9007, 0.3, { name: 'Private Fixture Restroom', access: 'private', fee: 'no' }),
    osmEl('chicago', 'node', 9008, 0.5, { name: 'No Access Fixture Restroom', access: 'no' }),
    osmEl('chicago', 'node', 9009, 2.76, { name: 'Too Far Fixture Restroom', fee: 'no' }, '2024-02-03T10:00:00Z', 0.045), // inside the bounding box, about 3.6 miles away
  ];
}
const slowRefuge = () => [refugeRow('slow', 301, 0.5, { name: 'Slow Refuge Fixture' })];
const slowOsm = () => [osmEl('slow', 'node', 9301, 0.4, { name: 'Slow OSM Fixture', fee: 'no' })];

const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });
let passed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(25); }
  throw new Error('timed out waiting for ' + label);
}

// options: fail {key: status | 'abort'}, hang Set, bad {key: 'html' | 'json-no-elements'}, refugeRows, delay {key: ms}, via 'http' | 'file' | 'blank', clock.
async function open(options = {}, contextOptions = {}) {
  const opt = options;
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, timezoneId: 'UTC', locale: 'en-US', ...contextOptions });
  const page = await context.newPage();
  const log = { requests: [], nominatim: [], nominatimTimes: [], refuge: [], overpass: [], bodies: [], referers: [], tiles: [], unexpected: [], errors: [], hung: [] };
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) log.errors.push(m.text()); });
  const handle = async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin || url.protocol === 'file:' || url.protocol === 'about:' || url.protocol === 'data:') return route.continue();
    log.requests.push(url.href);
    if (request.postData()) log.bodies.push(request.postData());
    const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    const json = (value, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
    // One place for outage, hang, malformed and delayed variants of every fixture service.
    const reply = async (key, make) => {
      if (opt.hang?.has(key)) { log.hung.push(route); return; }
      const f = opt.fail?.[key];
      if (f === 'abort') return route.abort('failed');
      if (f) return route.fulfill({ status: f, headers, contentType: 'text/plain', body: 'fixture outage' });
      const bad = opt.bad?.[key];
      if (bad === 'html') return route.fulfill({ status: 200, headers, contentType: 'text/html', body: '<html><body>Application error</body></html>' });
      if (bad === 'json-no-elements') return json({ version: 0.6, remark: 'fixture' });
      if (opt.delay?.[key]) await sleep(opt.delay[key]);
      return json(await make());
    };
    if (url.hostname === 'unpkg.com' && /\/leaflet@1\.9\.4\/dist\/leaflet\.(js|css)$/.test(url.pathname)) {
      if (opt.hang?.has('leaflet')) { log.hung.push(route); return; }
      if (opt.fail?.leaflet) return route.fulfill({ status: 503, headers, body: '' });
      const js = url.pathname.endsWith('.js');
      return route.fulfill({ headers, contentType: js ? 'application/javascript' : 'text/css', body: js ? leafletJS : leafletCSS });
    }
    if (url.hostname === 'tile.openstreetmap.org') { log.tiles.push(url.href); return route.fulfill({ headers, contentType: 'image/png', body: pixel }); }
    if (url.hostname === 'nominatim.openstreetmap.org') {
      log.nominatim.push(url.href); log.nominatimTimes.push(Date.now()); log.referers.push(request.headers().referer || '');
      return reply('nominatim', () => {
        const q = (url.searchParams.get('q') || '').toLowerCase(), zip = url.searchParams.get('postalcode');
        const key = zip === '59337' ? 'rural' : q.includes('chicago') ? 'chicago' : q.includes('slow town') ? 'slow' : null;
        if (!key) return [];
        const p = PLACES[key];
        return [{ lat: String(p.lat), lon: String(p.lon), display_name: p.name, addresstype: p.addresstype, type: p.addresstype, address: p.address }];
      });
    }
    if (url.hostname === 'www.refugerestrooms.org' && url.pathname === '/api/v1/restrooms/by_location') {
      log.refuge.push(url.href); log.referers.push(request.headers().referer || '');
      return reply('refuge', () => {
        const key = placeNear(+url.searchParams.get('lat'), +url.searchParams.get('lng'));
        if (key === 'slow') return sleep(2500).then(slowRefuge);
        if (key !== 'chicago') return [];
        if (opt.refugeRows === 100) return Array.from({ length: 100 }, (_, i) => refugeRow('chicago', 200 + i, 0.1537 * (i + 1)));
        return cityRefuge();
      });
    }
    if (url.hostname === 'overpass-api.de' || url.hostname === 'maps.mail.ru') {
      const main = url.hostname === 'overpass-api.de';
      const m = /\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(decodeURIComponent((request.postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')));
      const rec = { host: url.hostname, method: request.method(), body: request.postData() || '', radiusMi: null, key: null };
      if (m) {
        const [s, w, n, e] = m.slice(1).map(Number);
        rec.key = placeNear((s + n) / 2, (w + e) / 2);
        rec.radiusMi = Math.round((((n - s) / 2) * 111.32 - 0.2) / 1.609344);
      }
      log.overpass.push(rec); log.referers.push(request.headers().referer || '');
      return reply(main ? 'overpass-main' : 'overpass-mirror', () => {
        const elements = rec.key === 'chicago' ? cityOsm() : rec.key === 'slow' ? sleep(2500).then(slowOsm) : [];
        return Promise.resolve(elements).then(els => ({ version: 0.6, generator: 'fixture', osm3s: { timestamp_osm_base: BASE_TS }, elements: els }));
      });
    }
    log.unexpected.push(url.href);
    return route.fulfill({ status: 503, headers, body: '' });
  };
  await context.route('**/*', route => handle(route).catch(() => {}));
  if (opt.clock) await page.clock.install();
  if (opt.via === 'blank') await page.setContent(rawPage);
  else await page.goto(opt.via === 'file' ? pathToFileURL(pagePath).href : pageUrl);
  return { context, page, log, opt };
}
async function search(page, query, expectedSelection) {
  await page.fill('#q', query);
  await page.press('#q', 'Enter');
  await settled(page, expectedSelection);
}
const settled = (page, id) => page.waitForFunction(n => window.RestroomResponse && window.RestroomResponse.selectionId === n && window.RestroomResponse.state === 'settled', id, { timeout: 15000, polling: 50 });
const settledWith = (page, key, status) => page.waitForFunction(([k, s]) => window.RestroomResponse.sources[k].status === s && window.RestroomResponse.state === 'settled', [key, status], { timeout: 15000, polling: 50 });
const state = (page, key) => page.getAttribute('#status-' + key, 'data-state');
const text = (page, sel) => page.locator(sel).innerText();
const keys = page => page.$$eval('#results > li.pb-card', els => els.map(e => e.getAttribute('data-k')));
const cardText = (page, key) => page.locator(`#results > li.pb-card[data-k="${key}"]`).innerText();
const bridge = page => page.evaluate(() => JSON.parse(JSON.stringify(window.RestroomResponse)));
async function noSideScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `${label}: page scrolls sideways by ${overflow}px`);
}
async function finish({ context, log }, label) {
  assert.deepEqual(log.unexpected, [], `${label}: unexpected external requests`);
  assert.deepEqual(log.errors, [], `${label}: page errors`);
  await Promise.all(log.hung.map(r => r.abort('failed').catch(() => {})));
  await context.close();
  passed++;
}
const CITY_QUERY = '233 S Wacker Dr, Chicago, IL';

try {
  // 1. Idle state, city happy path: merged nearest-first list, cost wording, card contents, escaping, filters, privacy.
  {
    const t = await open();
    const { page, log } = t;
    assert.match(await text(page, '#disc'), /Unofficial listings from public, crowd-sourced and volunteer data\. Confirm before you go\./);
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    const idle = await bridge(page);
    assert.equal(idle.state, 'idle');
    assert.equal(idle.selectionId, 0);
    assert.equal(idle.slug, 'public-bathroom-finder');
    for (const k of ['geocoder', 'refuge', 'osm']) assert.equal(idle.sources[k].status, 'idle', 'idle ' + k);
    for (const k of ['geocoder', 'refuge', 'osm']) assert.match(await text(page, '#status-' + k), /Waiting for a search/);
    const privacy = await text(page, '#privacy');
    for (const part of [/Your exact location stays in this browser/, /Nothing is saved, added to the page address, or sent to this site/, /rounded to about 100 meters/, /Nominatim/, /Refuge Restrooms/, /overpass-api\.de/, /maps\.mail\.ru/, /tile\.openstreetmap\.org/, /unpkg\.com/, /Distances are calculated in your browser/]) assert.match(privacy, part);
    assert.equal(await page.locator('#search-form [name]').count(), 0, 'no named field can reach a URL through a native submit');
    assert.equal(await page.getAttribute('#search-form', 'onsubmit'), 'return false');
    assert.equal(await page.getAttribute('label[for="q"]', 'for'), 'q');
    assert.equal(await text(page, 'label[for="q"]'), 'Address, city or ZIP code');
    await page.waitForFunction(() => document.getElementById('console-response').textContent.length > 100, null, { timeout: 8000 });
    assert.doesNotMatch(await text(page, '#console-response'), /Some lists are incomplete: check the sources directly/, 'idle response plan is neutral');
    const coverage = await text(page, '#coverage');
    for (const part of [/Not a complete list/, /crowd-sourced/, /not verified by staff/, /transgender, intersex and gender nonconforming/, /fee=no/, /No live status/, /Straight-line distances/, /does not mean none exist/]) assert.match(coverage, part);
    await page.waitForSelector('#map.leaflet-container');
    assert.equal(await state(page, 'map'), 'ok');
    assert.equal(log.requests.filter(u => !/unpkg\.com|tile\.openstreetmap\.org/.test(u)).length, 0, 'no data requests before a search');
    const historyBefore = await page.evaluate(() => history.length);

    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'geocoder'), 'ok');
    assert.match(await text(page, '#place'), /Searching near: 233, South Wacker Drive/);
    assert.doesNotMatch(await text(page, '#place'), /center of the ZIP code area/);
    assert.equal(await state(page, 'refuge'), 'ok');
    assert.equal(await state(page, 'osm'), 'ok');
    assert.match(await text(page, '#status-refuge'), /OK: 4 listings, all those within 20 miles\. Crowd-sourced and unverified.*Newest update in this list: November 20, 2024/);
    assert.match(await text(page, '#status-osm'), /OK: 6 listed within 3 miles.*2 private or no-access listings hidden\. Database as of October 30, 2026, 17:17 UTC/);
    assert.equal(log.overpass.length, 1, 'one Overpass query when 5 or more are listed within 3 miles');
    assert.equal(log.overpass[0].radiusMi, 3);
    assert.equal(log.overpass[0].method, 'POST');
    assert.ok(log.overpass[0].body.startsWith('data='));
    assert.match(decodeURIComponent(log.overpass[0].body), /\[out:json\]\[timeout:25\];\(node\["amenity"="toilets"\]\(.+\);way\["amenity"="toilets"\]\(.+\);\);out center meta;/);
    // Requests: Nominatim parameters, Refuge rounding, no exact coordinates, default Referer.
    const nom = new URL(log.nominatim[0]);
    assert.equal(nom.searchParams.get('q'), CITY_QUERY);
    assert.equal(nom.searchParams.get('format'), 'jsonv2');
    assert.equal(nom.searchParams.get('limit'), '1');
    assert.equal(nom.searchParams.get('countrycodes'), 'us,pr,gu,vi,as,mp');
    const ref = new URL(log.refuge[0]);
    assert.deepEqual([ref.searchParams.get('lat'), ref.searchParams.get('lng'), ref.searchParams.get('per_page')], ['41.882', '-87.631', '100']);
    const sent = log.requests.join('\n') + '\n' + log.bodies.join('\n');
    assert.ok(!sent.includes('41.88219') && !sent.includes('87.63087'), 'exact coordinates are never sent');
    assert.ok(log.referers.length >= 3 && log.referers.every(r => r.startsWith(origin)), 'default Referer is sent: ' + log.referers);

    // Merged nearest-first order across both sources, with a fee=no-only "Free".
    const order = ['osm:node/9001', 'refuge:101', 'osm:way/9002', 'osm:node/9003', 'osm:node/9004', 'refuge:102', 'osm:node/9005', 'refuge:103', 'refuge:104', 'osm:node/9006'];
    assert.deepEqual(await keys(page), order);
    const dists = await page.$$eval('#results .pb-dist', els => els.map(e => parseFloat(e.textContent.replace('under ', ''))));
    assert.deepEqual(dists, [...dists].sort((a, b) => a - b), 'nearest first');
    assert.match(await text(page, '#results > li.pb-card:first-child .pb-dist'), /^0\.1 mi N straight-line/);
    assert.match(await text(page, '#results-summary'), /Showing 10 of 10 restrooms, nearest first\. Distances are straight-line\. Searched: Refuge Restrooms: all listings within 20 miles; OpenStreetMap: public toilets within 3 miles\. 2 private or no-access OpenStreetMap listings hidden\./);
    assert.equal(await page.locator('#results > li.pb-card[data-k="osm:node/9007"], #results > li.pb-card[data-k="osm:node/9008"], #results > li.pb-card[data-k="osm:node/9009"]').count(), 0, 'private, no-access and out-of-radius places are not listed');
    const free = new Set(['osm:node/9001', 'osm:way/9002', 'osm:node/9006']);
    for (const key of order) {
      const c = await cardText(page, key);
      assert.match(c, /Source: /, key);
      assert.match(c, /(Updated|Added) [A-Z][a-z]+ \d{1,2}, \d{4}|Last edited in OpenStreetMap [A-Z][a-z]+ \d{1,2}, \d{4}/, key + ' data date');
      assert.match(c, /Confirm before you go: listings can be out of date, and hours, access and cost can change\./, key);
      assert.match(c, /Directions on OpenStreetMap/, key);
      assert.match(c, /(under 0\.1|\d+\.\d) mi [NESW]{1,2} straight-line/, key + ' distance and direction');
      if (free.has(key)) assert.match(c, /Free \(fee=no in OpenStreetMap\)/, key);
      else {
        assert.doesNotMatch(c, /\bFree\b/, key + ' must not say Free');
        assert.match(c, /Cost unknown|Fee charged/, key);
      }
      if (key.startsWith('refuge:')) {
        assert.match(c, /Crowd-sourced listing \(Refuge Restrooms\)/, key);
        assert.match(c, /Cost unknown \(Refuge Restrooms does not record cost\)/, key);
        assert.match(c, /Hours not listed/, key);
        assert.match(c, /Source: Refuge Restrooms, a crowd-sourced listing\. Updated /, key);
      } else {
        assert.match(c, /Public toilet \(OpenStreetMap amenity=toilets\)/, key);
        assert.match(c, /© OpenStreetMap contributors/, key);
      }
    }
    // Exact card contents per source.
    // Crowd-sourced placeholders such as "n/a" are not shown as address parts.
    const placeholderCard = await cardText(page, 'refuge:103');
    assert.ok(/\bChicago\b/.test(placeholderCard) && !/n\/a/i.test(placeholderCard), 'placeholder address parts are omitted: ' + placeholderCard);
    let c = await cardText(page, 'refuge:101');
    for (const part of ['Refuge Fixture 101', '101 Test Street, Chicago, IL', 'Accessible (listed)', 'Gender neutral / unisex (listed)', 'Crowd votes: 12 up, 2 down', 'Updated November 20, 2024 (added January 5, 2020)', 'User note (unverified)', 'Comment: Ask at the desk - not the cashier <img src=x onerror="window.__xss=1">', 'Refuge Restrooms entry']) assert.ok(c.includes(part), 'refuge 101 missing: ' + part);
    assert.equal(await page.locator('#results details[data-k="refuge:101"]').count(), 0, 'short notes are inline');
    c = await cardText(page, 'refuge:102');
    assert.ok(c.includes('Not listed as accessible') && !c.includes('(added'), 'refuge 102');
    assert.equal(await page.locator('#results details[data-k="refuge:102"]').count(), 1, 'long notes sit inside details');
    assert.equal(await page.locator('#results details[data-k="refuge:102"]').evaluate(d => d.open), false);
    for (const key of ['refuge:103', 'refuge:104']) assert.match(await cardText(page, key), /Location may be approximate: 2 listings share this exact point/);
    assert.doesNotMatch(await cardText(page, 'refuge:101'), /Location may be approximate/);
    c = await cardText(page, 'osm:node/9001');
    for (const part of ['Millennium Fixture Restroom', 'Free (fee=no in OpenStreetMap)', 'Wheelchair accessible (listed)', 'Open 24 hours (listed)', 'Gender neutral (listed)', 'Changing table (listed)', 'Last edited in OpenStreetMap August 14, 2025. Last checked by a mapper 2025-06-01', 'Database as of October 30, 2026, 17:17 UTC', 'View on OpenStreetMap']) assert.ok(c.includes(part), 'osm 9001 missing: ' + part);
    c = await cardText(page, 'osm:way/9002');
    for (const part of ['Free (fee=no in OpenStreetMap)', 'Customers only (a purchase may be required)', 'Limited wheelchair access (listed)', 'Hours listed: Mo-Fr 09:00-17:00']) assert.ok(c.includes(part), 'osm 9002 missing: ' + part);
    c = await cardText(page, 'osm:node/9003');
    for (const part of ['City Parks Fixture', 'Fee charged: 0.50 USD', 'Not wheelchair accessible (listed)', 'Hours not listed']) assert.ok(c.includes(part), 'osm 9003 missing: ' + part);
    c = await cardText(page, 'osm:node/9004');
    for (const part of ['Unnamed public toilet', 'Cost unknown', 'Accessibility not listed', 'Hours not listed', 'No address tagged']) assert.ok(c.includes(part), 'osm 9004 missing: ' + part);
    c = await cardText(page, 'osm:node/9005');
    assert.ok(c.includes('Plain <b>Bold</b> Toilet') && c.includes('Wheelchair accessible (listed)'), 'osm 9005 escaped name and designated access');
    // Escaping and link safety for crowd-sourced text.
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('#results img, #results script').count(), 0);
    assert.equal(await page.locator('#results a[href^="javascript:"]').count(), 0);
    const hrefs = await page.$$eval('#results a', as => as.map(a => [a.getAttribute('href'), a.getAttribute('rel'), a.getAttribute('target')]));
    assert.ok(hrefs.every(([h, rel, target]) => /^https:\/\//.test(h) && rel === 'noopener noreferrer' && target === '_blank'));
    assert.ok(hrefs.some(([h]) => h === 'https://www.refugerestrooms.org/restrooms/101'));
    assert.ok(hrefs.some(([h]) => h === 'https://www.openstreetmap.org/node/9001') && hrefs.some(([h]) => h === 'https://www.openstreetmap.org/way/9002'));
    assert.ok(hrefs.some(([h]) => h === 'https://www.openstreetmap.org/copyright'));
    assert.ok(hrefs.some(([h]) => h.startsWith('https://www.openstreetmap.org/directions?route=')));
    // Filters and source toggles with counts.
    assert.equal(await text(page, '#filters [data-filter="free"]'), 'Free (fee=no) (3)');
    assert.equal(await text(page, '#filters [data-filter="all"]'), 'All (10)');
    assert.equal(await text(page, '#src-filters [data-source="refuge"]'), 'Refuge Restrooms (4)');
    assert.equal(await text(page, '#src-filters [data-source="osm"]'), 'OpenStreetMap (6)');
    for (const [filter, expected] of [['free', ['osm:node/9001', 'osm:way/9002', 'osm:node/9006']], ['wheelchair', ['osm:node/9001', 'refuge:101', 'osm:node/9005']], ['neutral', ['osm:node/9001', 'refuge:101']], ['changing', ['osm:node/9001']]]) {
      await page.click(`#filters [data-filter="${filter}"]`);
      assert.equal(await page.getAttribute(`#filters [data-filter="${filter}"]`, 'aria-pressed'), 'true');
      assert.deepEqual(await keys(page), expected, 'filter ' + filter);
    }
    await page.click('#filters [data-filter="all"]');
    await page.click('#src-filters [data-source="refuge"]');
    assert.equal((await keys(page)).filter(k => k.startsWith('refuge:')).length, 0);
    assert.equal((await keys(page)).length, 6);
    await page.click('#src-filters [data-source="refuge"]');
    assert.equal((await keys(page)).length, 10);
    // Open notes stay open across a re-render.
    await page.click('#results details[data-k="refuge:102"] summary');
    await page.click('#filters [data-filter="wheelchair"]');
    await page.click('#filters [data-filter="all"]');
    assert.equal(await page.locator('#results details[data-k="refuge:102"]').evaluate(d => d.open), true, 'open note survives a re-render');
    assert.match(await text(page, '#results details[data-k="refuge:102"]'), /Directions: Enter through the side door/);
    // Map: one marker per listing, a distinct style per source, free listings distinguishable, legend and attribution.
    assert.equal(await page.locator('#map .leaflet-marker-icon .pb-mk-free').count(), 3);
    assert.equal(await page.locator('#map .leaflet-marker-icon .pb-mk-osm').count(), 3);
    assert.equal(await page.locator('#map .leaflet-marker-icon .pb-mk-refuge').count(), 4);
    assert.match(await text(page, '#map .pb-legend'), /Refuge Restrooms \(crowd-sourced\)[\s\S]*OpenStreetMap/);
    assert.ok(await page.isVisible('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'));
    await until(() => log.tiles.length > 0, 'map tiles');
    assert.ok(log.tiles.every(u => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)));
    // Sources, bridge, live region, privacy of the search text and place.
    assert.match(await text(page, '#src-date-refuge'), /newest in this search: November 20, 2024/);
    assert.match(await text(page, '#src-date-osm'), /database as of October 30, 2026, 17:17 UTC/);
    assert.equal(await text(page, '#live'), 'Search finished. 10 restroom listings found.');
    const b = await bridge(page);
    assert.equal(b.version, 1);
    assert.equal(b.state, 'settled');
    assert.equal(b.selectionId, 1);
    assert.equal(b.locationType, 'address');
    assert.deepEqual([b.sources.geocoder.status, b.sources.refuge.status, b.sources.osm.status], ['ok', 'ok', 'ok']);
    assert.deepEqual([b.sources.refuge.count, b.sources.refuge.radiusMi, b.sources.refuge.partial, b.sources.refuge.dataDate], [4, 20, false, '2024-11-20']);
    assert.deepEqual([b.sources.osm.count, b.sources.osm.radiusMi, b.sources.osm.partial, b.sources.osm.dataDate], [6, 3, false, BASE_TS]);
    assert.ok(Math.abs(b.sources.refuge.nearestMi - 0.45) < 0.02 && Math.abs(b.sources.osm.nearestMi - 0.12) < 0.02);
    assert.ok(Number(await page.getAttribute('#status', 'data-revision')) > 3, 'revision bumps on every publish');
    const serial = JSON.stringify(b);
    for (const leak of ['Wacker', 'Chicago', 'Illinois', CITY_QUERY, 'Test Street']) assert.ok(!serial.includes(leak), 'bridge leaks ' + leak);
    assert.ok(!/-?\d{1,3}\.\d{3,}/.test(serial.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '')), 'bridge holds no coordinate-like number');
    JSON.stringify(b, (k, v) => { if (typeof v === 'number') assert.ok(Math.abs(v - 41.88) > 0.5 && Math.abs(v + 87.63) > 0.5, 'bridge number near the searched point: ' + k); return v; });
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(() => document.cookie), '');
    assert.equal(page.url(), pageUrl, 'URL carries no query or coordinates');
    assert.equal(await page.evaluate(() => history.length), historyBefore, 'history is untouched');
    assert.equal(await page.evaluate(() => location.search + location.hash), '');
    // The response plan sees the bridge and carries neither the query nor the place.
    await page.waitForFunction(() => /Searched location/.test(document.getElementById('console-response').textContent), null, { timeout: 8000 });
    const plan = await page.evaluate(() => document.getElementById('console-response').textContent);
    assert.ok(!/Wacker|Chicago|41\.88|87\.63/.test(plan), 'response plan holds no query or coordinates');
    // Throttle, ZIP+4 and the in-memory geocoder cache.
    await search(page, '59337-1234', 2);
    const zipUrl = new URL(log.nominatim.at(-1));
    assert.equal(zipUrl.searchParams.get('postalcode'), '59337');
    assert.equal(zipUrl.searchParams.get('q'), null);
    assert.match(await text(page, '#place'), /\(center of the ZIP code area, approximate\)/);
    assert.equal((await bridge(page)).locationType, 'zip');
    const gaps = log.nominatimTimes.slice(1).map((t0, i) => t0 - log.nominatimTimes[i]);
    assert.ok(gaps.every(g => g >= 900), 'Nominatim spacing ' + gaps);
    await search(page, '59337', 3);
    assert.equal(log.nominatim.length, 2, 'a repeated search uses the in-memory cache');
    // No em dash anywhere, raw or rendered.
    assert.equal(rawPage.includes(EM_DASH), false, 'no em dash in the page source');
    assert.ok(!new RegExp('key ' + 'needed', 'i').test(rawPage), 'no banned key wording');
    assert.equal((await page.evaluate(() => document.documentElement.innerText + document.documentElement.outerHTML)).includes(EM_DASH), false, 'no em dash in rendered text or markup');
    await finish(t, 'city happy path');
  }

  // 2. Rural ZIP+4 with nothing listed: the 3-mile query widens to 15 miles; empty means none listed, never none exist.
  {
    const t = await open();
    const { page, log } = t;
    await search(page, '59337-1234', 1);
    assert.equal(new URL(log.nominatim[0]).searchParams.get('postalcode'), '59337');
    assert.equal(await state(page, 'refuge'), 'empty');
    assert.equal(await state(page, 'osm'), 'empty');
    assert.match(await text(page, '#status-refuge'), /None listed in Refuge Restrooms within 20 miles\. This does not mean none exist\./);
    assert.match(await text(page, '#status-osm'), /None listed in OpenStreetMap within 15 miles\. This does not mean none exist\./);
    assert.deepEqual(log.overpass.map(o => o.radiusMi), [3, 15], 'one wider query after fewer than 5 are listed');
    assert.match(await text(page, '#results-summary'), /No restrooms are listed near this point in the sources that answered\. This does not mean none exist\./);
    assert.match(await text(page, '#results-summary'), /Refuge Restrooms: none listed within 20 miles; OpenStreetMap: none listed within 15 miles/);
    assert.equal(await page.locator('#results > li').count(), 0);
    assert.equal(await text(page, '#filters [data-filter="all"]'), 'All (0)');
    assert.match(await text(page, '#place'), /Searching near: 59337, Jordan.*\(center of the ZIP code area, approximate\)/);
    const b = await bridge(page);
    assert.deepEqual([b.sources.refuge.status, b.sources.refuge.count, b.sources.refuge.radiusMi], ['empty', 0, 20]);
    assert.deepEqual([b.sources.osm.status, b.sources.osm.count, b.sources.osm.radiusMi], ['empty', 0, 15]);
    assert.equal(b.locationType, 'zip');
    await finish(t, 'rural empty');
  }

  // 3. Place search outcomes: no match (ZIP 00000), invalid ZIP, empty input. Nothing else is searched.
  {
    const t = await open();
    const { page, log } = t;
    await search(page, '00000', 1);
    assert.match(await text(page, '#place'), /No place matched "00000"\. Check the ZIP code or try a street address or city\./);
    assert.equal(await state(page, 'geocoder'), 'empty');
    assert.match(await text(page, '#status-geocoder'), /No match found/);
    assert.equal(await text(page, '#status-geocoder .pb-badge'), 'No match');
    assert.deepEqual([await state(page, 'refuge'), await state(page, 'osm')], ['notrun', 'notrun']);
    assert.match(await text(page, '#status-refuge'), /Not run: no location to check yet/);
    assert.equal(log.refuge.length + log.overpass.length, 0, 'no listings requested without a place');
    assert.equal(new URL(log.nominatim[0]).searchParams.get('postalcode'), '00000');
    let b = await bridge(page);
    assert.deepEqual([b.state, b.sources.geocoder.status, b.sources.refuge.status, b.sources.osm.status], ['settled', 'empty', 'not-run', 'not-run']);
    await page.waitForFunction(() => /No place found for the search/.test(document.getElementById('console-response').textContent), null, { timeout: 8000 });
    assert.match(await text(page, '#results-summary'), /No location to search yet/);
    await search(page, '1234', 2);
    assert.match(await text(page, '#place'), /That is not a valid ZIP code\. A ZIP code has 5 digits/);
    assert.equal(await state(page, 'geocoder'), 'invalid');
    assert.match(await text(page, '#status-geocoder'), /Not sent: a ZIP code needs exactly 5 digits/);
    assert.equal(log.nominatim.length, 1, 'an invalid ZIP is never sent');
    b = await bridge(page);
    assert.deepEqual([b.sources.geocoder.status, b.sources.refuge.status], ['invalid', 'not-run']);
    await page.fill('#q', '   ');
    await page.click('#go');
    assert.match(await text(page, '#place'), /Type an address, city or ZIP code first/);
    assert.equal(log.nominatim.length, 1);
    await finish(t, 'no match and invalid input');
  }

  // 4. Place search down: Unavailable with Try again; the retry runs the whole search.
  {
    const t = await open({ fail: { nominatim: 503 } });
    const { page, log, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'geocoder'), 'failed');
    assert.match(await text(page, '#status-geocoder'), /Unavailable: the service answered with HTTP 503\. Nothing else was searched\./);
    assert.match(await text(page, '#status-geocoder'), /Try again/);
    assert.match(await text(page, '#place'), /The place search is unavailable right now/);
    assert.equal(log.refuge.length + log.overpass.length, 0);
    assert.equal((await bridge(page)).sources.geocoder.status, 'failed');
    await page.waitForFunction(() => /Place search unavailable/.test(document.getElementById('console-response').textContent), null, { timeout: 8000 });
    delete opt.fail.nominatim;
    await page.click('#status-geocoder [data-retry="geocoder"]');
    await settled(page, 2);
    assert.equal(await state(page, 'geocoder'), 'ok');
    assert.equal((await keys(page)).length, 10);
    await finish(t, 'geocoder down');
  }

  // 5. Refuge fails alone: OSM still lists; the failed source is Unavailable, never zero; Try again re-runs only Refuge.
  {
    const t = await open({ fail: { refuge: 503 } });
    const { page, log, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'refuge'), 'failed');
    assert.equal(await state(page, 'osm'), 'ok');
    const row = await text(page, '#status-refuge');
    assert.match(row, /Unavailable: the service answered with HTTP 503\. No Refuge Restrooms listings are shown; this is not a zero\./);
    assert.match(row, /Try again/);
    assert.doesNotMatch(row, /None listed/);
    assert.equal((await keys(page)).length, 6);
    assert.ok((await keys(page)).every(k => k.startsWith('osm:')));
    const summary = await text(page, '#results-summary');
    assert.match(summary, /Unavailable: Refuge Restrooms\. A source that failed is not a zero/);
    assert.doesNotMatch(summary, /Refuge Restrooms: none listed/);
    assert.equal(await text(page, '#src-filters [data-source="refuge"]'), 'Refuge Restrooms (unavailable)');
    assert.equal(await text(page, '#filters [data-filter="all"]'), 'All (6+)');
    assert.equal(await text(page, '#live'), 'Search finished. 6 restroom listings found; 1 of 2 sources unavailable.');
    const b = await bridge(page);
    assert.deepEqual([b.sources.refuge.status, b.sources.refuge.count, b.sources.refuge.radiusMi], ['failed', null, null]);
    assert.equal(b.sources.osm.status, 'ok');
    assert.match(await text(page, '#src-date-refuge'), /unavailable/);
    // Try again re-runs only Refuge, keeps the selection, and keeps keyboard focus on the card link it was on.
    delete opt.fail.refuge;
    const osmBefore = log.overpass.length, nomBefore = log.nominatim.length;
    await page.focus('#results > li.pb-card:first-child a[data-l="dir"]');
    await page.evaluate(() => document.querySelector('#status-refuge [data-retry="refuge"]').click());
    await settledWith(page, 'refuge', 'ok');
    assert.equal(log.overpass.length, osmBefore, 'OSM is not re-queried');
    assert.equal(log.nominatim.length, nomBefore);
    assert.equal(log.refuge.length, 2);
    assert.equal((await bridge(page)).selectionId, 1, 'retry is not a new selection');
    assert.equal((await keys(page)).length, 10);
    assert.equal(await page.evaluate(() => { const a = document.activeElement; return a.closest('li').getAttribute('data-k') + ':' + a.getAttribute('data-l'); }), 'osm:node/9001:dir', 'focus stays on the card link across re-renders');
    await finish(t, 'refuge fails alone');
  }

  // 6. OSM fails alone: main 502 then mirror 504. Refuge still lists.
  {
    const t = await open({ fail: { 'overpass-main': 502, 'overpass-mirror': 504 } });
    const { page, log } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'osm'), 'failed');
    assert.equal(await state(page, 'refuge'), 'ok');
    const row = await text(page, '#status-osm');
    assert.match(row, /Unavailable: the service answered with HTTP 504 \(tried overpass-api\.de and the maps\.mail\.ru mirror\)\. No OpenStreetMap listings are shown; this is not a zero\./);
    assert.match(row, /Try again/);
    assert.deepEqual(log.overpass.map(o => o.host), ['overpass-api.de', 'maps.mail.ru']);
    assert.equal((await keys(page)).length, 4);
    assert.match(await text(page, '#results-summary'), /Unavailable: OpenStreetMap/);
    assert.equal(await text(page, '#filters [data-filter="free"]'), 'Free (fee=no) (unavailable)');
    assert.equal(await text(page, '#filters [data-filter="all"]'), 'All (4+)');
    const b = await bridge(page);
    assert.deepEqual([b.sources.osm.status, b.sources.osm.count], ['failed', null]);
    await finish(t, 'osm fails alone');
  }

  // 7. Main Overpass server fails, the mirror answers.
  {
    const t = await open({ fail: { 'overpass-main': 502 } });
    const { page, log } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'osm'), 'ok');
    assert.deepEqual(log.overpass.map(o => o.host), ['overpass-api.de', 'maps.mail.ru']);
    assert.equal((await keys(page)).length, 10);
    assert.match(await text(page, '#status-osm'), /OK: 6 listed within 3 miles/);
    await finish(t, 'overpass mirror');
  }

  // 8. Everything fails: statuses visible, nothing shown as zero, Try again recovers each source.
  {
    const t = await open({ fail: { refuge: 503, 'overpass-main': 502, 'overpass-mirror': 503 } });
    const { page, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.deepEqual([await state(page, 'geocoder'), await state(page, 'refuge'), await state(page, 'osm')], ['ok', 'failed', 'failed']);
    assert.match(await text(page, '#status-refuge'), /Unavailable/);
    assert.match(await text(page, '#status-osm'), /Unavailable/);
    assert.equal(await page.locator('#status [data-retry]').count(), 2);
    const summary = await text(page, '#results-summary');
    assert.match(summary, /No restrooms can be shown: all 2 sources are unavailable\. This is not a zero/);
    assert.doesNotMatch(summary, /None listed|none listed|No restrooms are listed/);
    assert.equal(await page.locator('#results > li').count(), 0);
    for (const sel of ['#filters [data-filter="all"]', '#filters [data-filter="free"]', '#src-filters [data-source="refuge"]', '#src-filters [data-source="osm"]']) assert.match(await text(page, sel), /\(unavailable\)$/, sel);
    assert.equal(await text(page, '#live'), 'Search finished. 0 restroom listings found; 2 of 2 sources unavailable.');
    const b = await bridge(page);
    assert.equal(b.state, 'settled');
    for (const k of ['refuge', 'osm']) assert.deepEqual([b.sources[k].status, b.sources[k].count, b.sources[k].radiusMi, b.sources[k].partial], ['failed', null, null, false], k);
    await page.waitForFunction(() => /Searched location/.test(document.getElementById('console-response').textContent), null, { timeout: 8000 });
    assert.doesNotMatch(await text(page, '#console-response'), /\b0 (Refuge|OpenStreetMap)|none listed/i);
    Object.keys(opt.fail).forEach(k => delete opt.fail[k]);
    await page.click('#status-refuge [data-retry="refuge"]');
    await settledWith(page, 'refuge', 'ok');
    assert.equal(await state(page, 'osm'), 'failed', 'only the retried source changes');
    await page.click('#status-osm [data-retry="osm"]');
    await settledWith(page, 'osm', 'ok');
    assert.equal((await keys(page)).length, 10);
    assert.equal((await bridge(page)).selectionId, 1);
    await finish(t, 'everything fails');
  }

  // 9. Hung requests time out to Unavailable (fake clock): slow-source notes at 8 s, Refuge 30 s, OSM 50 s + 40 s, place search 15 s.
  {
    const t = await open({ hang: new Set(['refuge', 'overpass-main', 'overpass-mirror']), clock: true });
    const { page, log } = t;
    await page.waitForSelector('#map.leaflet-container');
    await page.fill('#q', CITY_QUERY);
    await page.press('#q', 'Enter');
    await until(() => log.refuge.length === 1 && log.overpass.length === 1, 'both listing requests');
    assert.equal(await state(page, 'refuge'), 'loading');
    assert.equal((await bridge(page)).state, 'loading', 'the bridge does not settle while a source loads');
    await page.clock.fastForward(8500);
    assert.match(await text(page, '#status-refuge'), /Still loading; this source can take up to 30 seconds\./);
    assert.match(await text(page, '#status-osm'), /OpenStreetMap servers are slow today; this can take up to 90 seconds\./);
    await page.clock.fastForward(22000);
    await until(async () => (await state(page, 'refuge')) === 'failed', 'refuge timeout');
    assert.match(await text(page, '#status-refuge'), /Unavailable: no answer within 30 seconds\. No Refuge Restrooms listings are shown; this is not a zero\./);
    assert.equal(await state(page, 'osm'), 'loading');
    assert.equal((await bridge(page)).state, 'loading');
    await page.clock.fastForward(20000);
    await until(() => log.overpass.length === 2, 'mirror request');
    assert.match(await text(page, '#status-osm'), /trying the maps\.mail\.ru mirror/);
    await page.clock.fastForward(41000);
    await until(async () => (await state(page, 'osm')) === 'failed', 'osm timeout');
    assert.match(await text(page, '#status-osm'), /Unavailable: no answer within 40 seconds \(tried overpass-api\.de and the maps\.mail\.ru mirror\)/);
    await settled(page, 1);
    const b = await bridge(page);
    assert.deepEqual([b.sources.refuge.status, b.sources.refuge.count, b.sources.osm.status, b.sources.osm.count], ['failed', null, 'failed', null]);
    assert.match(await text(page, '#results-summary'), /all 2 sources are unavailable\. This is not a zero/);
    await finish(t, 'hung listing sources');
  }
  {
    const t = await open({ hang: new Set(['nominatim']), clock: true });
    const { page } = t;
    await page.waitForSelector('#map.leaflet-container');
    await page.fill('#q', CITY_QUERY);
    await page.press('#q', 'Enter');
    await until(() => t.log.nominatim.length === 1, 'geocoder request');
    await page.clock.fastForward(15500);
    await settled(page, 1);
    assert.equal(await state(page, 'geocoder'), 'failed');
    assert.match(await text(page, '#status-geocoder'), /Unavailable: no answer within 15 seconds\. Nothing else was searched\./);
    assert.match(await text(page, '#status-geocoder'), /Try again/);
    await finish(t, 'hung geocoder');
  }

  // 10. Malformed responses: HTML or JSON without the expected shape is Unavailable, never an empty list.
  {
    const t = await open({ bad: { refuge: 'html', 'overpass-main': 'html', 'overpass-mirror': 'json-no-elements' } });
    const { page } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'refuge'), 'failed');
    assert.match(await text(page, '#status-refuge'), /Unavailable: the response was not valid data/);
    assert.equal(await state(page, 'osm'), 'failed');
    assert.match(await text(page, '#status-osm'), /Unavailable: the response had no list of places \(tried overpass-api\.de and the maps\.mail\.ru mirror\)/);
    assert.equal(await page.locator('#results > li').count(), 0);
    assert.doesNotMatch(await text(page, '#results-summary'), /none listed|No restrooms are listed/i);
    await finish(t, 'malformed json');
  }

  // 11. Partial Refuge list (100 rows): scope stated, divider where the OSM area ends, Show more.
  {
    const t = await open({ refugeRows: 100 });
    const { page } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'refuge'), 'partial');
    assert.match(await text(page, '#status-refuge'), /Partial: the nearest 100 listings only, out to 15\.3 mi\./);
    assert.match(await text(page, '#results-summary'), /Refuge Restrooms: the nearest 100 listings only, out to 15\.3 mi/);
    assert.match(await text(page, '#results-summary'), /Partial: Refuge Restrooms returned only its nearest 100 listings\./);
    assert.equal(await text(page, '#src-filters [data-source="refuge"]'), 'Refuge Restrooms (100, partial)');
    assert.equal(await text(page, '#filters [data-filter="all"]'), 'All (106+)');
    const b = await bridge(page);
    assert.deepEqual([b.sources.refuge.status, b.sources.refuge.count, b.sources.refuge.partial], ['partial', 100, true]);
    assert.ok(b.sources.refuge.radiusMi > 15.3 && b.sources.refuge.radiusMi < 15.5, 'partial radius is the farthest returned distance: ' + b.sources.refuge.radiusMi);
    assert.equal(await page.locator('#results > li.pb-card').count(), 25, 'first page of 25');
    assert.ok(await page.isVisible('#more'));
    assert.match(await text(page, '#more'), /Show more \(81 more\)/);
    await page.click('#more');
    assert.equal(await page.locator('#results > li.pb-card').count(), 50);
    assert.match(await text(page, '#results .pb-divider'), /Beyond 3 miles: OpenStreetMap was searched only within 3 miles/);
    await finish(t, 'partial refuge');
  }

  // 12. Use my location: granted (no place search, rounded coordinates only) and denied, timeout, unavailable.
  {
    const t = await open({}, { geolocation: { latitude: 41.88219, longitude: -87.63087, accuracy: 35 }, permissions: ['geolocation'] });
    const { page, log } = t;
    await page.click('#loc');
    await settled(page, 1);
    assert.match(await text(page, '#place'), /Searching near: your device location \(accuracy about 35 m\)/);
    assert.equal(log.nominatim.length, 0, 'no place search for a device location');
    assert.equal(await state(page, 'geocoder'), 'notused');
    assert.equal(await state(page, 'refuge'), 'ok');
    assert.equal(await state(page, 'osm'), 'ok');
    const ref = new URL(log.refuge[0]);
    assert.deepEqual([ref.searchParams.get('lat'), ref.searchParams.get('lng')], ['41.882', '-87.631']);
    const sent = log.requests.join('\n') + '\n' + log.bodies.join('\n');
    assert.ok(!sent.includes('41.88219') && !sent.includes('87.63087'), 'exact device coordinates are never sent');
    const b = await bridge(page);
    assert.equal(b.locationType, 'device');
    assert.equal(b.sources.geocoder.status, 'not-used');
    assert.ok(!JSON.stringify(b).includes('41.88') && !JSON.stringify(b).includes('87.63'));
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(page.url(), pageUrl);
    assert.equal((await keys(page)).length, 10);
    await finish(t, 'location granted');
  }
  {
    const t = await open();
    const { page, log } = t;
    await page.click('#loc'); // no permission granted: the browser denies it
    await settled(page, 1);
    assert.match(await text(page, '#place'), /Location permission was denied\. To use it, allow location for this page/);
    assert.equal(await state(page, 'geocoder'), 'notused');
    assert.deepEqual([await state(page, 'refuge'), await state(page, 'osm')], ['notrun', 'notrun']);
    assert.match(await text(page, '#status-geocoder'), /no device location was available/);
    assert.equal(log.requests.filter(u => !/unpkg\.com|tile\.openstreetmap\.org/.test(u)).length, 0);
    const b = await bridge(page);
    assert.deepEqual([b.locationType, b.state, b.sources.refuge.status, b.sources.osm.status], ['device', 'settled', 'not-run', 'not-run']);
    await page.waitForFunction(() => /No location was available for the search/.test(document.getElementById('console-response').textContent), null, { timeout: 8000 });
    for (const [code, message, pattern] of [[3, 'timeout', /did not report a location in time/], [2, 'unavailable', /could not work out its location right now/]]) {
      await page.evaluate(([c, m]) => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: c, message: m }), 10); }, [code, message]);
      await page.click('#loc');
      await settled(page, code === 3 ? 2 : 3);
      assert.match(await text(page, '#place'), pattern);
    }
    await finish(t, 'location denied');
  }

  // 13. Leaflet blocked, or never answering: the list still works and the Map row says Unavailable.
  for (const [label, options] of [['blocked', { fail: { leaflet: 503 } }], ['hangs', { hang: new Set(['leaflet']), clock: true }]]) {
    const t = await open(options);
    const { page } = t;
    assert.ok(await page.evaluate(() => !!window.RestroomResponse), 'page script ran while Leaflet is missing');
    if (options.clock) {
      assert.equal(await state(page, 'map'), 'loading');
      await page.clock.fastForward(15500);
    }
    await until(async () => (await state(page, 'map')) === 'failed', 'map failure');
    assert.match(await text(page, '#status-map'), /Map unavailable; the list still works\./);
    assert.match(await text(page, '#map'), /Map unavailable; the list still works\./);
    await page.fill('#q', CITY_QUERY);
    await page.click('#go');
    await settled(page, 1);
    assert.equal(page.url(), pageUrl, 'no native form submit');
    assert.equal((await keys(page)).length, 10);
    assert.equal((await bridge(page)).state, 'settled');
    await finish(t, 'leaflet ' + label);
  }

  // 14. A second search while the first is in flight: the first search's results never appear.
  {
    const t = await open();
    const { page, log } = t;
    await page.fill('#q', 'Slow Town, PA');
    await page.press('#q', 'Enter');
    await until(() => log.refuge.length === 1 && log.overpass.length === 1, 'first search requests');
    await page.fill('#q', CITY_QUERY);
    await page.press('#q', 'Enter');
    await settled(page, 2);
    assert.deepEqual((await keys(page)).length, 10);
    assert.match(await text(page, '#place'), /Searching near: 233, South Wacker Drive/);
    await sleep(3000); // the slow answers would land here
    assert.equal((await keys(page)).length, 10);
    assert.ok((await keys(page)).every(k => !/301|9301/.test(k)), 'stale listings never render');
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /Slow (Refuge|OSM) Fixture|Slow Town/);
    const b = await bridge(page);
    assert.deepEqual([b.selectionId, b.state, b.sources.refuge.count, b.sources.osm.count], [2, 'settled', 4, 6]);
    await finish(t, 'stale search');
  }

  // 15. file:// and about:blank: no page errors when listing sources fail or the page has no http origin.
  {
    const t = await open({ via: 'file', fail: { refuge: 'abort', 'overpass-main': 'abort', 'overpass-mirror': 'abort', leaflet: 503 } });
    const { page } = t;
    assert.ok(await page.evaluate(() => !!window.RestroomResponse));
    await search(page, CITY_QUERY, 1);
    assert.deepEqual([await state(page, 'refuge'), await state(page, 'osm')], ['failed', 'failed']);
    assert.match(await text(page, '#status-refuge'), /Unavailable: network error, or the service blocked the request/);
    assert.equal(await state(page, 'map'), 'failed');
    await finish(t, 'file url');
  }
  {
    const t = await open({ via: 'blank' });
    const { page } = t;
    assert.ok(await page.evaluate(() => !!window.RestroomResponse));
    await page.waitForFunction(() => document.querySelector('#status-map').getAttribute('data-state') !== 'loading', null, { timeout: 8000 });
    await search(page, CITY_QUERY, 1);
    assert.equal((await bridge(page)).state, 'settled');
    await finish(t, 'about:blank');
  }

  // 16. Layout and colour: no sideways scroll at 320 px, light and dark render, touch targets are 44 px.
  for (const [width, colorScheme, touch] of [[320, 'light', true], [320, 'dark', false], [375, 'dark', false], [375, 'light', false]]) {
    const t = await open({}, { viewport: { width, height: 800 }, colorScheme, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
    const { page } = t;
    await noSideScroll(page, `${width}px ${colorScheme} idle`);
    await search(page, CITY_QUERY, 1);
    await noSideScroll(page, `${width}px ${colorScheme} results`);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, colorScheme === 'light' ? 'rgb(243, 246, 249)' : 'rgb(15, 27, 42)', `${colorScheme} background`);
    const ink = await page.evaluate(() => getComputedStyle(document.querySelector('.pb-card')).color);
    assert.notEqual(ink, bg, 'text differs from the background');
    assert.ok(await page.isVisible('#results > li.pb-card:first-child'));
    if (touch) {
      for (const sel of ['#go', '#loc', '#filters [data-filter="free"]', '#results .pb-dir']) {
        const box = await page.locator(sel).first().boundingBox();
        assert.ok(box.height >= 43.5, `${sel} is ${box.height}px tall on a coarse pointer`);
      }
    }
    await finish(t, `layout ${width} ${colorScheme}`);
  }

  console.log(`PASS ${passed} bathroom finder smoke scenarios`);
} finally {
  await browser.close();
  server.close();
}
