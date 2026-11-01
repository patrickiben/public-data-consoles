// Free Clinic Finder: mocked-feed browser checks. Every external host is intercepted; nothing reaches a live service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(root, 'consoles/free-clinic-finder/index.html');
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
const pageUrl = `${origin}/consoles/free-clinic-finder/`;

// ---------- Fixture places. Every service finds the place a request belongs to from its coordinates. ----------
const MI = 69.0934; // miles per degree of latitude
const BASE_TS = '2026-10-30T17:17:16Z';
const DATE_MS = 1793318400000; // HRSA Data Warehouse load date shape: 2026-10-30 00:00 UTC, as the real layer 18 answers
const HRSA_PATH = '/server/rest/services/HealthCareFacilities/PrimaryHealthCareFacilities_FS/MapServer/0/query';
const HRSA_DATE_PATH = '/server/rest/services/HealthCareFacilities/HealthCareFacilities/MapServer/18/query';
const PLACES = {
  chicago: { lat: 41.88219, lon: -87.63087, name: '233, South Wacker Drive, Loop, Chicago, Cook County, Illinois, 60606, United States', addresstype: 'building', address: { country_code: 'us', state: 'Illinois' } },
  rural: { lat: 42.8728, lon: -100.5507, name: '69201, Valentine, Cherry County, Nebraska, United States', addresstype: 'postcode', address: { country_code: 'us', state: 'Nebraska', postcode: '69201' } },
  empty: { lat: 39.5, lon: -117.0, name: 'Nowhere Flat, Nevada, United States', addresstype: 'town', address: { country_code: 'us', state: 'Nevada' } },
  slow: { lat: 40.25, lon: -80.25, name: 'Slow Town, Pennsylvania, United States', addresstype: 'town', address: { country_code: 'us', state: 'Pennsylvania' } },
};
const placeNear = (lat, lon) => Object.entries(PLACES).find(([, p]) => Math.abs(p.lat - lat) < 0.2 && Math.abs(p.lon - lon) < 0.2)?.[0] || null;
const north = (p, miles, dLon = 0) => ({ lat: p.lat + miles / MI, lon: p.lon + dLon });
const R_MI = 3958.7613;
function haversine(a, b) {
  const r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lon - a.lon);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

// HRSA features shaped like the real layer 0 answer (attribute names and value styles from a live Chicago query).
function hrsaFeat(key, id, miles, attrs = {}) {
  const pos = north(PLACES[key], miles);
  return {
    attributes: {
      OBJECTID: id, SITE_NM: `Fixture Health Center ${id}`, GRANTEE_NM: 'FIXTURE FAMILY HEALTH CENTER', FQHC_ORG_NM: '', GRANT_NUM: 'H80CS00115',
      SITE_ADDRESS: `${id} W Test St`, SITE_CITY: 'Chicago', SITE_STATE_ABBR: 'IL', SITE_ZIP_CD: '60622-5646', SITE_PHONE_NUM: '312-555-0100', SITE_URL: '',
      HCC_LOC_DESC: 'Permanent', HCC_TYP_DESC: 'Administrative/Service Delivery Site', HCC_CLND_SCHD_DIM_DESC: 'Year-Round', HCC_OPER_SCHD_DESC: 'Full-Time',
      TOT_OPER_HR_PER_WEEK: 40.0, SITE_DATA_SOURCE: 'ESR_SCP', FQHC_LAL_NUM: '', HCC_STATUS_DESC: 'Active', HCC_LOC_SETTING_DESC: 'All Other Clinic Types', ...attrs,
    },
    geometry: { x: pos.lon, y: pos.lat },
  };
}
function cityHrsa() {
  const erie = { SITE_NM: 'Erie West Town Health Center', GRANTEE_NM: 'ERIE FAMILY HEALTH CENTER', SITE_ADDRESS: '1701 W Superior St', SITE_PHONE_NUM: '312-666-3494', SITE_URL: 'www.eriefamilyhealth.org', TOT_OPER_HR_PER_WEEK: 45.0 };
  const dup = { SITE_NM: 'Duplicate Fixture Clinic', GRANTEE_NM: 'DUPLICATE FIXTURE ORG', SITE_ADDRESS: '55 N Dup Ave', SITE_PHONE_NUM: '(312) 555-0111', SITE_URL: 'https://dup.example.org/care', HCC_OPER_SCHD_DESC: 'Part-Time', TOT_OPER_HR_PER_WEEK: 20.5 };
  return [
    hrsaFeat('chicago', 1001, 0.4, erie),
    hrsaFeat('chicago', 1002, 0.9, dup),
    hrsaFeat('chicago', 1003, 0.9, dup), // exact duplicate record with its own OBJECTID
    hrsaFeat('chicago', 1004, 1.3, { SITE_NM: 'Mobile Fixture Van', SITE_ADDRESS: '9 Base Yard Rd', HCC_LOC_DESC: 'Mobile Van', HCC_OPER_SCHD_DESC: 'Unknown', HCC_CLND_SCHD_DIM_DESC: 'Unknown' }),
    hrsaFeat('chicago', 1005, 1.8, { SITE_NM: 'Seasonal Fixture Site', SITE_ADDRESS: '3 Lake Rd', HCC_LOC_DESC: 'Seasonal', HCC_CLND_SCHD_DIM_DESC: 'Seasonal' }),
    hrsaFeat('chicago', 1006, 2.1, { SITE_NM: 'Fixture School Health Center', SITE_ADDRESS: '800 Schoolhouse Ln', HCC_LOC_SETTING_DESC: 'School', HCC_OPER_SCHD_DESC: 'Unknown', HCC_CLND_SCHD_DIM_DESC: 'Unknown' }),
    hrsaFeat('chicago', 1007, 2.6, { SITE_NM: 'Look-alike Fixture Clinic', GRANTEE_NM: 'LOOKALIKE GRANTEE', FQHC_ORG_NM: 'LOOKALIKE ORG INC', SITE_DATA_SOURCE: 'FQHC_LKL', FQHC_LAL_NUM: 'LAL123', SITE_ADDRESS: '70 Look St', SITE_PHONE_NUM: '773-555-0177' }),
    hrsaFeat('chicago', 1008, 3.2, { SITE_NM: 'Escape <img src=x onerror="window.__xss=1"> Clinic', GRANTEE_NM: 'ESCAPE <b>ORG</b>', SITE_ADDRESS: '1 <b>Main</b> St', SITE_PHONE_NUM: 'N/A', SITE_URL: 'javascript:alert(1)', TOT_OPER_HR_PER_WEEK: 0, HCC_OPER_SCHD_DESC: 'Unknown', HCC_CLND_SCHD_DIM_DESC: 'Unknown' }),
    hrsaFeat('chicago', 1009, 5.0, { SITE_NM: `Harbor Fixture ${EM_DASH} Clinic`, SITE_ADDRESS: '14 Harbor Way', SITE_PHONE_NUM: '3125550133', SITE_URL: 'http://harbor.example.org/info', TOT_OPER_HR_PER_WEEK: 39.5 }),
  ];
}
const ruralHrsa = () => [17, 21, 31, 38, 43, 47].map((mi, i) => hrsaFeat('rural', 3001 + i, mi, { SITE_NM: `Horizon Fixture - Town ${i + 1}`, GRANTEE_NM: 'HORIZON HEALTH CARE, INC', SITE_CITY: 'Mission', SITE_STATE_ABBR: 'SD', SITE_ZIP_CD: '57555', SITE_URL: 'www.horizonhealthcare.org' }));
const bigHrsa = () => Array.from({ length: 60 }, (_, i) => hrsaFeat('chicago', 4001 + i, 0.1 * (i + 1)));
const slowHrsa = () => [hrsaFeat('slow', 5001, 0.5, { SITE_NM: 'Slow HRSA Fixture' })];

function osmEl(key, type, id, miles, tags, ts = '2024-02-03T10:00:00Z', dLon = 0) {
  const pos = north(PLACES[key], miles, dLon);
  const base = { type, id, timestamp: ts, tags: { amenity: 'clinic', ...tags } };
  return type === 'node' ? { ...base, lat: pos.lat, lon: pos.lon } : { ...base, center: { lat: pos.lat, lon: pos.lon } };
}
function cityOsm() {
  return [
    osmEl('chicago', 'node', 9001, 0.2, { healthcare: 'clinic', name: 'Fixture Community Clinic', fee: 'no', phone: '+1 312-555-0147', website: 'fixtureclinic.org/visit', opening_hours: 'Mo-Fr 09:00-17:00', wheelchair: 'yes', check_date: '2025-06-01', 'addr:housenumber': '12', 'addr:street': 'Elm <i>St</i>', 'addr:city': 'Chicago', 'addr:state': 'IL', 'addr:postcode': '60606' }, '2025-08-14T10:00:00Z'),
    osmEl('chicago', 'way', 9002, 1.4, { name: 'Sliding Fixture Clinic', fee: 'no', charge: '5 USD', 'fee:conditional': 'no @ (income<20000)' }),
    osmEl('chicago', 'node', 9003, 0.7, { name: `Neighborhood Free Clinic ${EM_DASH} North` }),
    osmEl('chicago', 'node', 9004, 1.0, { name: 'Sunrise Free Clinic Fixture', fee: 'yes' }),
    osmEl('chicago', 'node', 9005, 4.0, { amenity: 'doctors', name: 'Free Health Fixture <b>Bold</b>', fee: 'donation', 'healthcare:speciality': 'general;pediatrics' }),
    osmEl('chicago', 'node', 9006, 0.4, { name: 'Private Fixture Clinic', fee: 'no', access: 'private' }),
    osmEl('chicago', 'node', 9007, 16, { name: 'Too Far Fixture Clinic', fee: 'no' }),
    osmEl('chicago', 'node', 9008, 2.5, { name: 'Lakeside Fixture Clinic', fee: 'no', website: 'javascript:alert(1)', phone: 'call the front desk' }),
  ];
}
const slowOsm = () => [osmEl('slow', 'node', 9301, 0.4, { name: 'Slow OSM Fixture', fee: 'no' })];

const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });
let passed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(25); }
  throw new Error('timed out waiting for ' + label);
}

// options: fail {key: status | 'abort'}, hang Set, bad {key: variant}, failRadius {miles: status}, badRadius {miles: variant}, hrsaMode 'exceeded' | 'big',
// extraHrsa / extraOsm (added to the Chicago answers), delayDate (ms), tileFail ('all' or a count of first tiles to refuse), via 'http', clock.
// Keys: nominatim, hrsa, hrsa-date, overpass-main, overpass-mirror, leaflet.
async function open(options = {}, contextOptions = {}) {
  const opt = options;
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, timezoneId: 'UTC', locale: 'en-US', ...contextOptions });
  await context.addInitScript(() => {
    window.__writes = [];
    const rec = n => window.__writes.push(n);
    try { const f = Storage.prototype.setItem; Storage.prototype.setItem = function () { rec('Storage.setItem'); return f.apply(this, arguments); }; } catch (e) { /* ignore */ }
    try { const f = IDBFactory.prototype.open; IDBFactory.prototype.open = function () { rec('indexedDB.open'); return f.apply(this, arguments); }; } catch (e) { /* ignore */ }
    try { const f = CacheStorage.prototype.open; CacheStorage.prototype.open = function () { rec('caches.open'); return f.apply(this, arguments); }; } catch (e) { /* ignore */ }
    try { const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie'); Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get: d.get, set(v) { rec('document.cookie'); return d.set.call(this, v); } }); } catch (e) { /* ignore */ }
  });
  const page = await context.newPage();
  const log = { requests: [], nominatim: [], nominatimTimes: [], hrsa: [], hrsaDate: [], overpass: [], bodies: [], referers: [], tiles: [], cookies: [], unexpected: [], errors: [], hung: [] };
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) log.errors.push(m.text()); });
  const handle = async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin || url.protocol === 'about:' || url.protocol === 'data:') return route.continue();
    log.requests.push(url.href);
    if (request.postData()) log.bodies.push(request.postData());
    if (request.headers().cookie) log.cookies.push(url.href);
    const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    const json = (value, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
    // One place for outage, hang, malformed and delayed variants of every fixture service.
    const reply = async (key, make, radius) => {
      if (opt.hang?.has(key)) { log.hung.push(route); return; }
      const f = opt.fail?.[key] || (radius != null ? opt.failRadius?.[radius] : null);
      if (f === 'abort') return route.abort('failed');
      if (f) return route.fulfill({ status: f, headers, contentType: 'text/plain', body: 'fixture outage' });
      const bad = opt.bad?.[key] || (radius != null ? opt.badRadius?.[radius] : null);
      if (bad === 'html') return route.fulfill({ status: 200, headers, contentType: 'text/html', body: '<html><body>Application error</body></html>' });
      if (bad === 'malformed') return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{"features":[{"attributes":' });
      if (bad === 'arcgis-error') return json({ error: { code: 400, message: 'Unable to complete operation.', details: [] } });
      if (bad === 'unusable') return json({ features: [{ attributes: { SITE_NM: 'No location' } }, { attributes: { SITE_NM: 'Bad location' }, geometry: { x: null, y: null } }] });
      if (bad === 'no-features') return json({ displayFieldName: '', fields: [] });
      if (bad === 'empty-features') return json({ features: [] });
      if (bad === 'json-no-elements') return json({ version: 0.6, remark: 'fixture' });
      return json(await make());
    };
    if (url.hostname === 'unpkg.com' && /\/leaflet@1\.9\.4\/dist\/leaflet\.(js|css)$/.test(url.pathname)) {
      if (opt.hang?.has('leaflet')) { log.hung.push(route); return; }
      if (opt.fail?.leaflet === 'abort') return route.abort('failed');
      if (opt.fail?.leaflet) return route.fulfill({ status: 503, headers, body: '' });
      const js = url.pathname.endsWith('.js');
      return route.fulfill({ headers, contentType: js ? 'application/javascript' : 'text/css', body: js ? leafletJS : leafletCSS });
    }
    if (url.hostname === 'tile.openstreetmap.org') { log.tiles.push(url.href); if (opt.tileFail === 'all' || (opt.tileFail > 0 && log.tiles.length <= opt.tileFail)) return route.abort('failed'); return route.fulfill({ headers, contentType: 'image/png', body: pixel }); }
    if (url.hostname === 'nominatim.openstreetmap.org') {
      log.nominatim.push(url.href); log.nominatimTimes.push(Date.now()); log.referers.push(request.headers().referer || '');
      return reply('nominatim', () => {
        const q = (url.searchParams.get('q') || '').toLowerCase(), zip = url.searchParams.get('postalcode');
        const key = zip === '69201' ? 'rural' : q.includes('chicago') ? 'chicago' : q.includes('slow town') ? 'slow' : q.includes('nowhere') ? 'empty' : null;
        if (!key) return [];
        const p = PLACES[key];
        return [{ lat: String(p.lat), lon: String(p.lon), display_name: p.name, addresstype: p.addresstype, type: p.addresstype, address: p.address }];
      });
    }
    if (url.hostname === 'gisportal.hrsa.gov' && url.pathname === HRSA_DATE_PATH) {
      log.hrsaDate.push(url.href); log.referers.push(request.headers().referer || '');
      return reply('hrsa-date', async () => (opt.delayDate && await sleep(opt.delayDate), { displayFieldName: '', fieldAliases: { mx: 'mx' }, fields: [{ name: 'mx', type: 'esriFieldTypeDate', alias: 'mx', length: 8 }], features: [{ attributes: { mx: DATE_MS } }] }));
    }
    if (url.hostname === 'gisportal.hrsa.gov' && url.pathname === HRSA_PATH) {
      const [lon, lat] = (url.searchParams.get('geometry') || '0,0').split(',').map(Number), radius = +url.searchParams.get('distance');
      const rec = { href: url.href, method: request.method(), body: request.postData() || '', lat, lon, radius, key: placeNear(lat, lon), params: Object.fromEntries(url.searchParams) };
      log.hrsa.push(rec); log.referers.push(request.headers().referer || '');
      return reply('hrsa', async () => {
        let feats = rec.key === 'chicago' ? (opt.hrsaMode === 'big' ? bigHrsa() : cityHrsa().concat(opt.extraHrsa || [])) : rec.key === 'rural' ? ruralHrsa() : [];
        if (rec.key === 'slow') { await sleep(2500); feats = slowHrsa(); }
        const within = feats.filter(f => haversine({ lat, lon }, { lat: f.geometry.y, lon: f.geometry.x }) <= radius);
        const out = { displayFieldName: 'SITE_NM', geometryType: 'esriGeometryPoint', spatialReference: { wkid: 4326, latestWkid: 4326 }, fields: [], features: within };
        if (opt.hrsaMode === 'exceeded') out.exceededTransferLimit = true;
        return out;
      }, radius);
    }
    if (url.hostname === 'overpass-api.de' || url.hostname === 'maps.mail.ru') {
      const main = url.hostname === 'overpass-api.de';
      const q = decodeURIComponent((request.postData() || '').replace(/^data=/, '').replace(/\+/g, ' '));
      const m = /around:(\d+),([-\d.]+),([-\d.]+)/.exec(q);
      const rec = { host: url.hostname, method: request.method(), body: request.postData() || '', query: q, radiusM: m ? +m[1] : null, key: m ? placeNear(+m[2], +m[3]) : null };
      log.overpass.push(rec); log.referers.push(request.headers().referer || '');
      return reply(main ? 'overpass-main' : 'overpass-mirror', async () => {
        const elements = rec.key === 'chicago' ? cityOsm().concat(opt.extraOsm || []) : rec.key === 'slow' ? (await sleep(2500), slowOsm()) : [];
        return { version: 0.6, generator: 'fixture', osm3s: { timestamp_osm_base: BASE_TS }, elements };
      });
    }
    log.unexpected.push(url.href);
    return route.fulfill({ status: 503, headers, body: '' });
  };
  await context.route('**/*', route => handle(route).catch(() => {}));
  if (opt.clock) await page.clock.install();
  await page.goto(pageUrl);
  return { context, page, log, opt };
}
async function search(page, query, expectedSelection) {
  await page.fill('#q', query);
  await page.press('#q', 'Enter');
  await settled(page, expectedSelection);
}
const settled = (page, id) => page.waitForFunction(n => window.ClinicResponse && window.ClinicResponse.selectionId === n && window.ClinicResponse.state === 'settled', id, { timeout: 15000, polling: 50 });
const settledWith = (page, key, status) => page.waitForFunction(([k, s]) => window.ClinicResponse.sources[k].status === s && window.ClinicResponse.state === 'settled', [key, status], { timeout: 15000, polling: 50 });
const state = (page, key) => page.getAttribute('#status-' + key, 'data-state');
const text = (page, sel) => page.locator(sel).innerText();
const keys = (page, list) => page.$$eval(`#results-${list} > li.pb-card`, els => els.map(e => e.getAttribute('data-k')));
const cardText = (page, key) => page.locator(`li.pb-card[data-k="${key}"]`).innerText();
const bridge = page => page.evaluate(() => JSON.parse(JSON.stringify(window.ClinicResponse)));
const planReady = (page, pattern) => page.waitForFunction(p => new RegExp(p).test(document.getElementById('console-response').textContent), pattern.source, { timeout: 8000 });
async function noSideScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `${label}: page scrolls sideways by ${overflow}px`);
}
async function finish({ context, log, page }, label) {
  assert.deepEqual(log.unexpected, [], `${label}: unexpected external requests`);
  assert.deepEqual(log.errors, [], `${label}: page errors`);
  assert.deepEqual(log.cookies, [], `${label}: cookies sent`);
  assert.deepEqual(await page.evaluate(() => window.__writes).catch(() => []), [], `${label}: storage, cookie or cache writes`);
  await Promise.all(log.hung.map(r => r.abort('failed').catch(() => {})));
  await context.close();
  passed++;
}
// Emergency note, status rows, the lists' own text and the static sections are present whatever the feeds did.
async function assertNothingBlank(page, label) {
  assert.ok(await page.isVisible('#emergency'), label + ': emergency note visible');
  assert.match(await text(page, '#emergency'), /In an emergency, call 911\. In a mental health crisis, call or text 988\./);
  assert.deepEqual(await page.$$eval('#emergency a', as => as.map(a => a.getAttribute('href'))), ['tel:911', 'tel:988', 'sms:988']);
  assert.equal(await page.locator('#status > li').count(), 4);
  for (const t of await page.$$eval('#status .pb-st-text', els => els.map(e => e.textContent.trim()))) assert.ok(t.length > 5, label + ': empty status text');
  for (const id of ['summary-osm', 'summary-hrsa', 'place']) assert.ok((await text(page, '#' + id)).trim().length > 10, `${label}: ${id} is blank`);
  assert.ok(await page.locator('#coverage li').count() >= 8, label + ': coverage renders');
  assert.equal(await page.locator('#ways li').count(), 3, label + ': other ways render');
  assert.ok(await page.locator('#sources .pb-source').count() >= 4, label + ': sources render');
  await page.waitForFunction(() => document.getElementById('console-response').textContent.length > 100, null, { timeout: 8000 });
}
const CITY_QUERY = '233 S Wacker Dr, Chicago, IL';
const HRSA_DATE = 'HRSA Data Warehouse load date: Oct 30, 2026';
const CONFIRM = 'Confirm before you go: call to check hours, services, eligibility and cost.';
const CITY_HRSA_ORDER = ['hrsa:1001', 'hrsa:1002', 'hrsa:1004', 'hrsa:1005', 'hrsa:1006', 'hrsa:1007', 'hrsa:1008', 'hrsa:1009'];
const CITY_OSM_ORDER = ['osm:node/9001', 'osm:node/9003', 'osm:way/9002', 'osm:node/9008', 'osm:node/9005'];

try {
  // 1. Idle state and the city happy path: two lists nearest first, cost wording, card contents, escaping, map, privacy.
  {
    const t = await open();
    const { page, log } = t;
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    assert.match(await text(page, '#disc'), /Unofficial listings from public and volunteer data\. Confirm before you go\./);
    assert.equal(await text(page, 'h1'), 'Free Clinic Finder');
    assert.equal(await page.locator('header h1').count(), 1);
    assert.match(await text(page, '#emergency'), /In an emergency, call 911\. In a mental health crisis, call or text 988\.[\s\S]*does not give medical advice/);
    const idle = await bridge(page);
    assert.equal(idle.state, 'idle');
    assert.equal(idle.selectionId, 0);
    assert.equal(idle.slug, 'free-clinic-finder');
    assert.equal(idle.version, 1);
    for (const k of ['geocoder', 'hrsa', 'osm']) assert.equal(idle.sources[k].status, 'idle', 'idle ' + k);
    for (const k of ['geocoder', 'hrsa', 'osm']) assert.match(await text(page, '#status-' + k), /Waiting for a search/);
    assert.ok(await page.isVisible('#privacy > p'), 'privacy lead is visible');
    assert.match(await text(page, '#privacy > p'), /^Privacy: Your device location stays in this browser\. If you type an address, only that text is sent, to OpenStreetMap's place search\. Nothing is saved/);
    assert.equal(await page.evaluate(() => document.querySelector('#privacy details').open), false, 'host details start collapsed');
    const privacy = await page.locator('#privacy').textContent();
    for (const part of [/Your device location stays in this browser/, /Nothing is saved \(no cookies or browser storage\), added to the page address, or sent to this site/, /rounded to about 100 meters/, /Nominatim/, /gisportal\.hrsa\.gov/, /overpass-api\.de/, /maps\.mail\.ru/, /tile\.openstreetmap\.org/, /unpkg\.com/, /Distances are calculated in your browser/]) assert.match(privacy, part);
    assert.equal(await page.locator('#search-form [name]').count(), 0, 'no named field can reach a URL through a native submit');
    assert.equal(await page.getAttribute('#search-form', 'onsubmit'), 'return false');
    assert.equal(await text(page, 'label[for="q"]'), 'Address, city or ZIP code');
    await page.waitForFunction(() => document.getElementById('console-response').textContent.length > 100, null, { timeout: 8000 });
    assert.doesNotMatch(await text(page, '#console-response'), /Some lists are incomplete: check the sources directly/, 'idle response plan is neutral');
    const coverage = await text(page, '#coverage');
    for (const part of [/only partly listed/, /Name matches are not proof of cost/, /HRSA lists only Health Center Program sites/, /Sliding fee is not free/, /No services or eligibility/, /Mobile, seasonal and school-based sites/, /Straight-line distances/, /does not mean none exist/]) assert.match(coverage, part);
    await page.waitForSelector('#map.leaflet-container');
    assert.equal(await state(page, 'map'), 'ok');
    assert.equal(log.requests.filter(u => !/unpkg\.com|tile\.openstreetmap\.org/.test(u)).length, 0, 'no data requests before a search');
    assert.equal(log.hrsaDate.length, 0, 'no HRSA date request before a search');
    for (const sel of ['#hrsa-filters', '#more-osm', '#more-hrsa', '#ways-osm', '#map-status']) assert.equal(await page.isVisible(sel), false, sel + ' stays hidden until it has something to show');
    const historyBefore = await page.evaluate(() => history.length);
    assert.ok(rawPage.includes('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), 'tile literal');
    assert.ok(rawPage.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));

    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'geocoder'), 'ok');
    assert.match(await text(page, '#place'), /Searching near: 233, South Wacker Drive/);
    assert.doesNotMatch(await text(page, '#place'), /center of the ZIP code area/);
    assert.deepEqual([await state(page, 'hrsa'), await state(page, 'osm')], ['ok', 'ok']);
    const hrsaRow = await text(page, '#status-hrsa');
    assert.match(hrsaRow, /OK: 8 sites within 10 miles\. Sliding fee, not necessarily free\. 1 duplicate record at the same name and address shown once\. 2 mobile or seasonal sites included\. HRSA Data Warehouse load date: Oct 30, 2026\./);
    const osmRow = await text(page, '#status-osm');
    assert.match(osmRow, /OK: 5 listed within 15 miles \(2 tagged fee=no, 1 possibly free \(with conditions\), 2 name says free\)\./);
    assert.match(osmRow, /1 private or no-access listing hidden\./);
    assert.match(osmRow, /1 clinic tagged fee=yes \(charges a fee\) not shown in this list\./);
    assert.match(osmRow, /Database as of October 30, 2026, 17:17 UTC/);
    assert.equal(log.hrsa.length, 1, 'one HRSA sites query when 5 or more sites are found within 10 miles');
    assert.equal(log.hrsaDate.length, 1, 'one HRSA date query');
    assert.equal(log.overpass.length, 1);
    // Requests: Nominatim parameters, HRSA query shape and rounding, Overpass shape and rounding, no exact coordinates, default Referer.
    const nom = new URL(log.nominatim[0]);
    assert.equal(nom.searchParams.get('q'), CITY_QUERY);
    assert.equal(nom.searchParams.get('format'), 'jsonv2');
    assert.equal(nom.searchParams.get('limit'), '1');
    assert.equal(nom.searchParams.get('countrycodes'), 'us,pr,gu,vi,as,mp');
    const h = log.hrsa[0];
    assert.equal(h.method, 'GET');
    assert.equal(h.body, '');
    assert.deepEqual([h.params.geometry, h.params.distance, h.params.units, h.params.geometryType, h.params.inSR, h.params.outSR, h.params.f, h.params.returnGeometry], ['-87.631,41.882', '10', 'esriSRUnit_StatuteMile', 'esriGeometryPoint', '4326', '4326', 'json', 'true']);
    assert.ok(/SITE_NM/.test(h.params.outFields) && /FQHC_LAL_NUM/.test(h.params.outFields) && /HCC_LOC_DESC/.test(h.params.outFields));
    const dq = new URL(log.hrsaDate[0]);
    assert.equal(dq.searchParams.get('f'), 'json');
    assert.match(dq.searchParams.get('outStatistics'), /"statisticType":"max".*DW_RECORD_CREATE_DT/);
    const o = log.overpass[0];
    assert.equal(o.method, 'POST');
    assert.equal(o.host, 'overpass-api.de');
    assert.ok(o.body.startsWith('data='));
    assert.equal(o.radiusM, 24140);
    assert.match(o.query, /^\[out:json\]\[timeout:\d+\];\(nwr\["amenity"~"\^\(clinic\|doctors\)\$"\]\(around:24140,41\.882,-87\.631\);nwr\["healthcare"~"\^\(clinic\|doctor\|centre\)\$"\]\(around:24140,41\.882,-87\.631\);\)->\.c;\(nwr\.c\["fee"="no"\];nwr\.c\["name"~"free \(clinic\|medical\|health\)",i\];\);out meta center;$/);
    const sent = log.requests.join('\n') + '\n' + log.bodies.join('\n');
    assert.ok(!sent.includes('41.88219') && !sent.includes('87.63087'), 'exact coordinates are never sent');
    assert.ok(log.referers.length >= 4 && log.referers.every(r => r.startsWith(origin)), 'default Referer is sent: ' + log.referers);

    // Two lists, each nearest first.
    assert.deepEqual(await keys(page, 'hrsa'), CITY_HRSA_ORDER);
    assert.deepEqual(await keys(page, 'osm'), CITY_OSM_ORDER);
    for (const list of ['hrsa', 'osm']) {
      const dists = await page.$$eval(`#results-${list} .pb-dist`, els => els.map(e => parseFloat(e.textContent.replace('under ', ''))));
      assert.deepEqual(dists, [...dists].sort((a, b) => a - b), list + ' nearest first');
    }
    assert.match(await text(page, '#results-osm > li.pb-card:first-child .pb-dist'), /^0\.2 mi N straight-line/);
    assert.match(await text(page, '#results-hrsa > li.pb-card:first-child .pb-dist'), /^0\.4 mi N straight-line/);
    // The free list comes first in the page, each list has its own heading, count and scope.
    const order = await page.$$eval('#h-osm, #h-hrsa', els => els.map(e => e.id));
    assert.deepEqual(order, ['h-osm', 'h-hrsa']);
    assert.match(await text(page, '#h-osm'), /^Free or possibly free \(OpenStreetMap\)\s+\(5\)$/);
    assert.match(await text(page, '#block-osm .pb-lede'), /^Free means OpenStreetMap tags the clinic fee=no with no charge or conditions\. Possibly free means fee=no with conditions, or only a name that says free\. Call to confirm cost\./);
    assert.match(await text(page, '#h-hrsa'), /^Health centers: sliding fee, not necessarily free \(HRSA\)\s+\(8\)$/);
    assert.match(await text(page, '#summary-osm'), /Showing 5 of 5 clinics, nearest first\. Distances are straight-line\. Searched: OpenStreetMap: clinics within 15 miles\. 2 tagged fee=no, 1 possibly free \(with conditions\), 2 name says free \(cost not tagged\)\. 1 clinic tagged fee=yes \(charges a fee\) not shown here\. 1 private or no-access listing hidden\./);
    assert.match(await text(page, '#summary-hrsa'), /Showing 8 of 8 health center sites, nearest first\. Distances are straight-line\. Searched: HRSA: all sites within 10 miles\./);
    assert.match(await text(page, '#block-hrsa .pb-lede'), /sliding fee scale based on income and family size[\s\S]*not necessarily zero/);
    assert.equal(await page.getAttribute('#block-hrsa .pb-lede a', 'href'), 'https://findahealthcenter.hrsa.gov/');
    assert.equal(await page.locator('#results-osm li[data-k="osm:node/9004"], #results-osm li[data-k="osm:node/9006"], #results-osm li[data-k="osm:node/9007"]').count(), 0, 'fee=yes, private and out-of-radius places are not in the free list');
    assert.equal(await page.locator('li[data-k="osm:node/9004"]').count(), 0, 'a fee=yes place is in no list');
    assert.ok(!(await page.evaluate(() => document.getElementById('results-hrsa').textContent)).includes('Sunrise'));
    assert.equal(await page.locator('#ways-osm').isVisible(), false, 'the other-ways line stays hidden for a complete non-empty free list');

    // Every HRSA card.
    for (const key of CITY_HRSA_ORDER) {
      const c = await cardText(page, key);
      assert.ok(c.includes('Sliding fee, not necessarily free'), key + ' tag');
      assert.ok(c.includes(`Source: HRSA Health Center Program site data. ${HRSA_DATE}.`), key + ' source and data date: ' + c);
      assert.ok(c.includes(CONFIRM), key + ' confirm note');
      assert.ok(c.includes('Directions on OpenStreetMap'), key);
      assert.match(c, /(under 0\.1|\d+\.\d|\d+) mi [NESW]{1,2} straight-line/, key + ' distance and direction');
      assert.doesNotMatch(c, /\bFree\b/, key + ' must not say Free');
      assert.ok(c.includes(key === 'hrsa:1007' ? 'Health center look-alike (meets HRSA program rules, not HRSA-funded)' : 'HRSA-funded health center'), key + ' funded or look-alike label');
    }
    let c = await cardText(page, 'hrsa:1001');
    for (const part of ['Erie West Town Health Center', 'Organization: ERIE FAMILY HEALTH CENTER', '1701 W Superior St, Chicago, IL 60622-5646', 'Phone: 312-666-3494', 'Website: www.eriefamilyhealth.org', 'About 45 hours a week (HRSA record). Exact hours not listed.', 'Schedule type (HRSA record): Full-Time, Year-Round']) assert.ok(c.includes(part), 'hrsa 1001 missing: ' + part);
    assert.equal(await page.getAttribute('li[data-k="hrsa:1001"] a[href^="tel:"]', 'href'), 'tel:3126663494', 'phone link holds digits only');
    assert.equal(await page.getAttribute('li[data-k="hrsa:1001"] a[href^="https://www.eriefamilyhealth"]', 'href'), 'https://www.eriefamilyhealth.org/', 'bare host gets https://');
    c = await cardText(page, 'hrsa:1002');
    assert.ok(c.includes('Duplicate Fixture Clinic') && c.includes('About 20.5 hours a week') && c.includes('Schedule type (HRSA record): Part-Time, Year-Round'), 'hrsa 1002');
    assert.equal(await page.getAttribute('li[data-k="hrsa:1002"] a[href^="tel:"]', 'href'), 'tel:3125550111');
    assert.equal(await page.locator('li[data-k="hrsa:1003"]').count(), 0, 'exact duplicate record collapses into one card');
    assert.equal(await page.locator('#results-hrsa li.pb-card h4', { hasText: 'Duplicate Fixture Clinic' }).count(), 1);
    c = await cardText(page, 'hrsa:1004');
    assert.ok(c.includes('Mobile van: the address is a base location. Call for stops and times.') && !c.includes('Schedule type'), 'mobile van note, Unknown schedule hidden');
    assert.ok((await cardText(page, 'hrsa:1005')).includes('Seasonal site: may be closed part of the year.'), 'seasonal note');
    assert.ok((await cardText(page, 'hrsa:1006')).includes('School-based site: may serve students only. Call first.'), 'school note');
    c = await cardText(page, 'hrsa:1007');
    assert.ok(c.includes('Organization: LOOKALIKE ORG INC'), 'look-alike organization');
    c = await cardText(page, 'hrsa:1008');
    assert.ok(c.includes('Escape <img src=x onerror="window.__xss=1"> Clinic') && c.includes('Organization: ESCAPE <b>ORG</b>') && c.includes('1 <b>Main</b> St, Chicago, IL 60622') && c.includes('Hours not listed'), 'hrsa 1008 escaped text: ' + c);
    assert.ok(!c.includes('Website:') && !c.includes('Phone:') && !c.includes('Schedule type'), 'javascript: website, N/A phone and Unknown schedule are dropped');
    c = await cardText(page, 'hrsa:1009');
    assert.ok(c.includes('Harbor Fixture - Clinic') && !c.includes(EM_DASH) && c.includes('About 39.5 hours a week'), 'hrsa 1009 em dash scrubbed');
    assert.equal(await page.getAttribute('li[data-k="hrsa:1009"] a[href^="http://harbor"]', 'href'), 'http://harbor.example.org/info');
    // Every OSM card.
    for (const key of CITY_OSM_ORDER) {
      const cc = await cardText(page, key);
      assert.match(cc, /Source: .*OpenStreetMap contributors \(ODbL\)\. (Last edited in OpenStreetMap|Edit date not available)/, key + ' source and date');
      assert.ok(cc.includes('Database as of October 30, 2026, 17:17 UTC'), key + ' database date');
      assert.ok(cc.includes(CONFIRM), key + ' confirm note');
      assert.ok(cc.includes('View on OpenStreetMap') && cc.includes('Directions on OpenStreetMap'), key);
    }
    c = await cardText(page, 'osm:node/9001');
    for (const part of ['Fixture Community Clinic', 'Free (fee=no in OpenStreetMap)', 'Clinic (OpenStreetMap)', '12 Elm <i>St</i>, Chicago, IL 60606', 'Phone: +1 312-555-0147', 'Website: fixtureclinic.org/visit', 'Hours listed: Mo-Fr 09:00-17:00', 'Wheelchair accessible (listed)', 'Last edited in OpenStreetMap August 14, 2025. Last checked by a mapper June 1, 2025']) assert.ok(c.includes(part), 'osm 9001 missing: ' + part);
    assert.equal(await page.getAttribute('li[data-k="osm:node/9001"] a[href^="tel:"]', 'href'), 'tel:+13125550147');
    assert.equal(await page.getAttribute('li[data-k="osm:node/9001"] a[href^="https://fixtureclinic"]', 'href'), 'https://fixtureclinic.org/visit');
    c = await cardText(page, 'osm:way/9002');
    assert.ok(c.includes('Possibly free: fee=no with conditions in OpenStreetMap (charge=5 USD; fee:conditional=no @ (income<20000)). Confirm cost.') && !c.includes('Free (fee=no') && !/Free with conditions/i.test(c), 'osm 9002 conditional label: ' + c);
    c = await cardText(page, 'osm:node/9003');
    assert.ok(c.includes('Name says free. Cost not tagged in OpenStreetMap.') && c.includes('Neighborhood Free Clinic - North') && !c.includes(EM_DASH) && !c.includes('Free (fee=no') && c.includes('Hours not listed') && c.includes('No address tagged'), 'osm 9003 name match: ' + c);
    c = await cardText(page, 'osm:node/9008');
    assert.ok(c.includes('Free (fee=no in OpenStreetMap)') && c.includes('Phone: call the front desk') && !c.includes('Website:'), 'osm 9008: ' + c);
    assert.equal(await page.locator('li[data-k="osm:node/9008"] a[href^="tel:"]').count(), 0, 'a bad phone is shown but not linked');
    c = await cardText(page, 'osm:node/9005');
    assert.ok(c.includes('Free Health Fixture <b>Bold</b>') && c.includes('Name says free. Cost not tagged in OpenStreetMap.') && c.includes('Fee tag in OpenStreetMap: fee=donation. Confirm cost.') && c.includes("Doctor's office: general, pediatrics (OpenStreetMap)"), 'osm 9005 name match with fee tag shown: ' + c);
    assert.ok(!c.includes('Free (fee=no'));
    // Escaping and link safety.
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('#results-hrsa img, #results-osm img, #results-hrsa script, #results-osm script').count(), 0);
    assert.equal(await page.locator('li[data-k="hrsa:1008"] h4 *, li[data-k="hrsa:1008"] .pb-line *, li[data-k="osm:node/9005"] h4 *, li[data-k="osm:node/9001"] .pb-line *').count(), 0, 'HTML in names and addresses is text');
    assert.equal(await page.locator('#results-hrsa a[href^="javascript:" i], #results-osm a[href^="javascript:" i]').count(), 0);
    const hrefs = await page.$$eval('#results-hrsa a, #results-osm a', as => as.map(a => [a.getAttribute('href'), a.getAttribute('rel'), a.getAttribute('target')]));
    assert.ok(hrefs.every(([href, rel, target]) => /^(tel:\+?\d+|https?:\/\/)/.test(href) && (href.startsWith('tel:') || (rel === 'noopener noreferrer' && target === '_blank'))), 'link schemes and rel: ' + JSON.stringify(hrefs.filter(([x]) => !/^(tel:\+?\d+|https?:\/\/)/.test(x))));
    assert.ok(hrefs.some(([x]) => x === 'https://www.openstreetmap.org/node/9001') && hrefs.some(([x]) => x === 'https://www.openstreetmap.org/way/9002'));
    assert.ok(hrefs.some(([x]) => x.startsWith('https://www.openstreetmap.org/directions?route=')));
    assert.ok(hrefs.some(([x]) => x === 'https://data.hrsa.gov/') && hrefs.some(([x]) => x === 'https://www.openstreetmap.org/copyright'));
    // The Fixed sites only chip: hides mobile and seasonal sites and says how many.
    assert.equal(await page.isVisible('#hrsa-filters'), true);
    assert.equal(await page.getAttribute('#fixed-only', 'aria-pressed'), 'false');
    await page.click('#fixed-only');
    assert.equal(await page.getAttribute('#fixed-only', 'aria-pressed'), 'true');
    assert.deepEqual(await keys(page, 'hrsa'), CITY_HRSA_ORDER.filter(k => !['hrsa:1004', 'hrsa:1005'].includes(k)));
    assert.match(await text(page, '#summary-hrsa'), /Showing 6 of 6 health center sites[\s\S]*2 mobile or seasonal sites hidden\./);
    assert.match(await text(page, '#h-hrsa'), /\(6 of 8, fixed sites only\)$/, 'the count says it is filtered');
    assert.deepEqual(await keys(page, 'osm'), CITY_OSM_ORDER, 'the chip leaves the free list alone');
    await page.click('#fixed-only');
    assert.equal((await keys(page, 'hrsa')).length, 8);
    assert.match(await text(page, '#h-hrsa'), /\(8\)$/);
    // Map: one marker per listing from both sources, distinct styles, legend, attribution.
    assert.equal(await page.locator('#map .leaflet-marker-icon .pb-mk-free').count(), 2);
    assert.equal(await page.locator('#map .leaflet-marker-icon .pb-mk-weak').count(), 3);
    assert.equal(await page.locator('#map .leaflet-marker-icon .pb-mk-hrsa').count(), 8);
    assert.equal(await page.locator('#map path.leaflet-interactive').count(), 1, 'one searched point');
    const legend = await text(page, '#map .pb-legend');
    for (const part of [/Free \(tagged fee=no\)/, /Possibly free \(conditions, or name only\)/, /HRSA health center \(sliding fee\)/, /Searched point/]) assert.match(legend, part);
    assert.ok(await page.isVisible('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'));
    await until(() => log.tiles.length > 0, 'map tiles');
    assert.ok(log.tiles.every(u => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)));
    // Sources, live region, bridge, privacy.
    assert.equal(await text(page, '#src-date-hrsa'), 'HRSA Data Warehouse load date Oct 30, 2026');
    assert.match(await text(page, '#src-date-osm'), /database as of October 30, 2026, 17:17 UTC/);
    assert.equal(await text(page, '#live'), 'Search finished. Free or possibly free clinics in OpenStreetMap: 5 clinics. Sliding-fee health centers in HRSA: 8 sites.');
    const b = await bridge(page);
    assert.deepEqual([b.version, b.slug, b.state, b.selectionId, b.locationType], [1, 'free-clinic-finder', 'settled', 1, 'address']);
    assert.deepEqual([b.sources.geocoder.status, b.sources.hrsa.status, b.sources.osm.status], ['ok', 'ok', 'ok']);
    assert.deepEqual([b.sources.hrsa.count, b.sources.hrsa.radiusMi, b.sources.hrsa.partial, b.sources.hrsa.dataDate, b.sources.hrsa.lookalikeCount, b.sources.hrsa.mobileOrSeasonalCount], [8, 10, false, '2026-10-30', 1, 2]);
    assert.deepEqual([b.sources.osm.count, b.sources.osm.radiusMi, b.sources.osm.partial, b.sources.osm.dataDate, b.sources.osm.freeCount, b.sources.osm.conditionalCount, b.sources.osm.nameCount], [5, 15, false, BASE_TS, 2, 1, 2]);
    assert.ok(Math.abs(b.sources.hrsa.nearestMi - 0.4) < 0.02 && Math.abs(b.sources.osm.nearestMi - 0.2) < 0.02);
    assert.ok(b.checkedAt && b.sources.hrsa.checkedAt && b.sources.osm.checkedAt);
    assert.ok(Number(await page.getAttribute('#status', 'data-revision')) > 3, 'revision bumps on every publish');
    const serial = JSON.stringify(b);
    for (const leak of ['Wacker', 'Chicago', 'Illinois', CITY_QUERY, 'Erie', 'Fixture', 'Elm', 'Superior']) assert.ok(!serial.includes(leak), 'bridge leaks ' + leak);
    assert.ok(!/-?\d{1,3}\.\d{3,}/.test(serial.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '')), 'bridge holds no coordinate-like number');
    JSON.stringify(b, (k, v) => { if (typeof v === 'number') assert.ok(Math.abs(v - 41.88) > 0.5 && Math.abs(v + 87.63) > 0.5, 'bridge number near the searched point: ' + k); return v; });
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(() => document.cookie), '');
    assert.equal(page.url(), pageUrl, 'URL carries no query or coordinates');
    assert.equal(await page.evaluate(() => history.length), historyBefore, 'history is untouched');
    assert.equal(await page.evaluate(() => location.search + location.hash), '');
    await planReady(page, /Searched location/);
    const plan = await text(page, '#console-response');
    assert.ok(!/Wacker|Chicago|Erie|41\.88|87\.63/.test(plan), 'response plan holds no query, place name or coordinates');
    const planAll = await page.locator('#console-response').textContent();
    assert.match(planAll, /a successful zero means none are listed in that source within the distance searched, not that none exist/);
    assert.doesNotMatch(planAll, /real zero/);
    // Throttle, ZIP+4 and the in-memory geocoder cache; the HRSA date is fetched once per page view.
    await search(page, '69201-1234', 2);
    const zipUrl = new URL(log.nominatim.at(-1));
    assert.equal(zipUrl.searchParams.get('postalcode'), '69201');
    assert.equal(zipUrl.searchParams.get('q'), null);
    assert.match(await text(page, '#place'), /\(center of the ZIP code area, approximate\)/);
    assert.equal((await bridge(page)).locationType, 'zip');
    const gaps = log.nominatimTimes.slice(1).map((t0, i) => t0 - log.nominatimTimes[i]);
    assert.ok(gaps.every(g => g >= 900), 'Nominatim spacing ' + gaps);
    await search(page, '69201', 3);
    assert.equal(log.nominatim.length, 2, 'a repeated search uses the in-memory cache');
    assert.equal(log.hrsaDate.length, 1, 'the HRSA date call is cached for the page view');
    // No em dash anywhere, raw or rendered; no banned wording.
    assert.equal(rawPage.includes(EM_DASH), false, 'no em dash in the page source');
    assert.ok(!new RegExp('key ' + 'needed', 'i').test(rawPage), 'no banned key wording');
    assert.equal((await page.evaluate(() => document.documentElement.innerText + document.documentElement.outerHTML)).includes(EM_DASH), false, 'no em dash in rendered text or markup');
    await finish(t, 'city happy path');
  }

  // 2. Rural: the HRSA radius widens 10, 25, 50 and the scope says so; OSM empty means none listed, never none exist.
  {
    const t = await open();
    const { page, log } = t;
    await search(page, '69201', 1);
    assert.equal(new URL(log.nominatim[0]).searchParams.get('postalcode'), '69201');
    assert.deepEqual(log.hrsa.map(r => r.radius), [10, 25, 50], 'ladder of radii');
    assert.deepEqual(log.hrsa.map(r => r.params.geometry), ['-100.551,42.873', '-100.551,42.873', '-100.551,42.873']);
    assert.equal(await state(page, 'hrsa'), 'ok');
    assert.match(await text(page, '#status-hrsa'), /OK: 6 sites within 50 miles \(widened from 10 miles because fewer than 5 were found closer\)\. Sliding fee, not necessarily free\. HRSA Data Warehouse load date: Oct 30, 2026\./);
    assert.match(await text(page, '#summary-hrsa'), /Searched: HRSA: all sites within 50 miles \(widened from 10 miles because fewer than 5 sites were found closer\)\./);
    assert.equal((await keys(page, 'hrsa')).length, 6);
    assert.match(await text(page, '#results-hrsa > li.pb-card:first-child .pb-dist'), /^17 mi N straight-line/);
    assert.equal(await state(page, 'osm'), 'empty');
    assert.match(await text(page, '#status-osm'), /None listed as free or possibly free in OpenStreetMap within 15 miles\. This does not mean none exist\./);
    assert.match(await text(page, '#summary-osm'), /None listed as free or possibly free in OpenStreetMap within 15 miles\. This does not mean none exist\./);
    assert.equal(await page.locator('#results-osm > li').count(), 0);
    assert.equal(await page.isVisible('#ways-osm'), true, 'other ways to look under an empty free list');
    const ways = await text(page, '#ways-osm');
    assert.match(ways, /Other ways to look: HRSA Find a Health Center; the National Association of Free and Charitable Clinics locator; or dial 2-1-1/);
    assert.equal(await page.locator('#ways-osm a[href="https://nafcclinics.org/find-clinic/"]').count(), 1);
    assert.equal(await text(page, '#count-osm'), '(none listed)', 'an empty list is not shown as a zero count');
    assert.match(await text(page, '#place'), /Searching near: 69201, Valentine.*\(center of the ZIP code area, approximate\)/);
    const b = await bridge(page);
    assert.deepEqual([b.sources.osm.status, b.sources.osm.count, b.sources.osm.radiusMi, b.sources.osm.freeCount], ['empty', 0, 15, 0]);
    assert.deepEqual([b.sources.hrsa.status, b.sources.hrsa.count, b.sources.hrsa.radiusMi], ['ok', 6, 50]);
    assert.ok(Math.abs(b.sources.hrsa.nearestMi - 17) < 0.2);
    await finish(t, 'rural widening and empty OSM');
  }
  // 2b. Nothing within 100 miles: "None listed", with the scope and the data date.
  {
    const t = await open();
    const { page, log } = t;
    await search(page, 'Nowhere Flat, NV', 1);
    assert.match(await text(page, '#place'), /\(center of the area, approximate\)[\s\S]*This is an area, so distances are measured from its approximate center, not from where you are\./, 'a town match is flagged as approximate');
    assert.deepEqual(log.hrsa.map(r => r.radius), [10, 25, 50, 100]);
    assert.equal(await state(page, 'hrsa'), 'empty');
    assert.equal(await text(page, '#status-hrsa .pb-badge'), 'None listed');
    assert.match(await text(page, '#status-hrsa'), /None listed within 100 mi\. This does not mean none exist\. HRSA Data Warehouse load date: Oct 30, 2026\./);
    assert.match(await text(page, '#summary-hrsa'), /None listed in HRSA's health center data within 100 miles\. This does not mean none exist\./);
    assert.equal(await page.locator('#results-hrsa > li').count(), 0);
    assert.equal(await page.isVisible('#hrsa-filters'), false);
    const b = await bridge(page);
    assert.deepEqual([b.sources.hrsa.status, b.sources.hrsa.count, b.sources.hrsa.radiusMi, b.sources.hrsa.nearestMi, b.sources.hrsa.dataDate], ['empty', 0, 100, null, '2026-10-30']);
    await finish(t, 'none within 100 miles');
  }

  // 3. HRSA sites failing in each way: Unavailable with Try again, never zero or none listed; OSM still lists; Try again recovers.
  for (const [label, options, pattern] of [
    ['HTTP 500', { fail: { hrsa: 500 } }, /Unavailable: the service answered with HTTP 500\. No HRSA health centers are shown; this is not a zero\./],
    ['ArcGIS error body with HTTP 200', { bad: { hrsa: 'arcgis-error' } }, /Unavailable: the service reported an error \(code 400\)\. No HRSA health centers are shown; this is not a zero\./],
    ['malformed JSON', { bad: { hrsa: 'malformed' } }, /Unavailable: the response was not valid data\./],
    ['HTML body', { bad: { hrsa: 'html' } }, /Unavailable: the response was not valid data\./],
    ['features without a list', { bad: { hrsa: 'no-features' } }, /Unavailable: the response had no list of sites\./],
    ['features without usable sites', { bad: { hrsa: 'unusable' } }, /Unavailable: the response had no usable sites\./],
    ['network error', { fail: { hrsa: 'abort' } }, /Unavailable: network error, or the service blocked the request\./],
  ]) {
    const t = await open(options);
    const { page, log, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'hrsa'), 'failed', label);
    assert.equal(await state(page, 'osm'), 'ok', label);
    const row = await text(page, '#status-hrsa');
    assert.match(row, pattern, label);
    assert.match(row, /Try again/, label);
    assert.doesNotMatch(row, /None listed|OK:/, label);
    assert.equal(await text(page, '#status-hrsa .pb-badge'), 'Unavailable');
    assert.equal(await text(page, '#count-hrsa'), '(unavailable)');
    assert.match(await text(page, '#summary-hrsa'), /Health centers from HRSA could not be retrieved: .* This is not a zero and does not mean none are listed\. Use Try again/, label);
    assert.doesNotMatch(await text(page, '#summary-hrsa'), /None listed|none listed/, label);
    assert.equal(await page.locator('#results-hrsa > li').count(), 0);
    assert.equal(await page.isVisible('#hrsa-filters'), false);
    assert.deepEqual(await keys(page, 'osm'), CITY_OSM_ORDER, 'the free list is unaffected: ' + label);
    assert.equal(await text(page, '#live'), 'Search finished. Free or possibly free clinics in OpenStreetMap: 5 clinics. Sliding-fee health centers in HRSA: unavailable, not zero.');
    const b = await bridge(page);
    assert.deepEqual([b.state, b.sources.hrsa.status, b.sources.hrsa.count, b.sources.hrsa.radiusMi, b.sources.hrsa.partial], ['settled', 'failed', null, null, false], label);
    assert.ok(b.sources.hrsa.reason, label + ': reason is carried');
    assert.equal(b.sources.osm.status, 'ok');
    assert.match(await text(page, '#src-date-hrsa'), /unavailable/);
    if (label === 'HTTP 500') {
      await planReady(page, /Searched location/);
      assert.doesNotMatch(await text(page, '#console-response'), /\b0 HRSA|none listed/i, 'response plan never turns a failure into zero');
      // Try again re-runs only HRSA, keeps the selection, and recovers.
      delete opt.fail.hrsa;
      const osmBefore = log.overpass.length, nomBefore = log.nominatim.length;
      await page.click('#status-hrsa [data-retry="hrsa"]');
      await settledWith(page, 'hrsa', 'ok');
      assert.equal(log.overpass.length, osmBefore, 'OSM is not re-queried');
      assert.equal(log.nominatim.length, nomBefore);
      assert.equal((await bridge(page)).selectionId, 1, 'retry is not a new selection');
      assert.deepEqual(await keys(page, 'hrsa'), CITY_HRSA_ORDER);
      assert.match(await text(page, '#status-hrsa'), /OK: 8 sites within 10 miles/);
    }
    await finish(t, 'HRSA fails: ' + label);
  }
  // 3b. A hung HRSA request (fake clock): a slow note at 8 s, then Unavailable at 20 s; OSM main and mirror hang to 50 s and 40 s.
  {
    const t = await open({ hang: new Set(['hrsa', 'overpass-main', 'overpass-mirror']), clock: true });
    const { page, log } = t;
    await page.waitForSelector('#map.leaflet-container');
    await page.fill('#q', CITY_QUERY);
    await page.press('#q', 'Enter');
    await until(() => log.hrsa.length === 1 && log.overpass.length === 1, 'both listing requests');
    assert.equal(await state(page, 'hrsa'), 'loading');
    assert.equal((await bridge(page)).state, 'loading', 'the bridge does not settle while a source loads');
    assert.equal(await text(page, '#count-hrsa'), '(loading)');
    await page.clock.fastForward(8500);
    assert.match(await text(page, '#status-hrsa'), /Still loading; this source can take up to 20 seconds per step\./);
    assert.match(await text(page, '#status-osm'), /OpenStreetMap servers are slow today; this can take up to 90 seconds\./);
    await page.clock.fastForward(12000);
    await until(async () => (await state(page, 'hrsa')) === 'failed', 'HRSA timeout');
    const row = await text(page, '#status-hrsa');
    assert.match(row, /Unavailable: no answer within 20 seconds\. No HRSA health centers are shown; this is not a zero\./);
    assert.match(row, /Try again/);
    assert.doesNotMatch(row, /None listed/);
    assert.equal(await state(page, 'osm'), 'loading');
    assert.equal((await bridge(page)).state, 'loading');
    await page.clock.fastForward(30000);
    await until(() => log.overpass.length === 2, 'mirror request');
    assert.match(await text(page, '#status-osm'), /trying the maps\.mail\.ru mirror/);
    await page.clock.fastForward(41000);
    await until(async () => (await state(page, 'osm')) === 'failed', 'OSM timeout');
    assert.match(await text(page, '#status-osm'), /Unavailable: no answer within 40 seconds \(tried overpass-api\.de and the maps\.mail\.ru mirror\)/);
    await settled(page, 1);
    const b = await bridge(page);
    assert.deepEqual([b.sources.hrsa.status, b.sources.hrsa.count, b.sources.osm.status, b.sources.osm.count], ['failed', null, 'failed', null]);
    await assertNothingBlank(page, 'hung feeds');
    await finish(t, 'hung HRSA and Overpass');
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

  // 4. HRSA widening step fails after an earlier step succeeded: Partial with Try again; Try again recovers.
  for (const [failAt, expectCount, expectRadius] of [[50, 2, 25], [25, 0, 10]]) {
    const t = await open({ failRadius: { [failAt]: 503 } });
    const { page, log, opt } = t;
    await search(page, '69201', 1);
    assert.equal(await state(page, 'hrsa'), 'partial', 'fail at ' + failAt);
    const row = await text(page, '#status-hrsa');
    assert.match(row, new RegExp(`Partial: ${expectCount ? expectCount + ' sites' : 'none'} within ${expectRadius} miles\\. Fewer than 5 were found, and the wider search did not complete: the service answered with HTTP 503\\. More may be listed farther out\\.`));
    assert.match(row, /Try again/);
    assert.doesNotMatch(row, /None listed|OK:/);
    assert.equal(await text(page, '#status-hrsa .pb-badge'), 'Partial');
    assert.equal((await keys(page, 'hrsa')).length, expectCount);
    assert.equal(await text(page, '#count-hrsa'), `(${expectCount || 'none listed'}, partial)`);
    assert.match(await text(page, '#live'), expectCount ? /HRSA: \d+ sites? \(partial list, more may be missing\)\.$/ : /HRSA: none listed \(partial list, more may be missing\)\.$/, 'a partial list is announced as partial');
    assert.match((await bridge(page)).sources.hrsa.reason, /^the wider \d+-mile search did not complete/);
    const summary = await text(page, '#summary-hrsa');
    assert.match(summary, /Partial: the wider \d+-mile search did not complete: the service answered with HTTP 503\./);
    assert.doesNotMatch(summary, /Turn off "Fixed sites only"|No fixed sites/, 'an empty partial list is not blamed on the Fixed sites only chip');
    if (!expectCount) assert.match(summary, /None listed within 10 miles so far\. This does not mean none exist\./);
    assert.equal(await page.isVisible('#hrsa-filters'), false, 'no mobile or seasonal site, so no chip');
    const b = await bridge(page);
    assert.deepEqual([b.sources.hrsa.status, b.sources.hrsa.count, b.sources.hrsa.radiusMi, b.sources.hrsa.partial], ['partial', expectCount, expectRadius, true]);
    assert.match(b.sources.hrsa.reason, /HTTP 503/);
    delete opt.failRadius[failAt];
    await page.click('#status-hrsa [data-retry="hrsa"]');
    await settledWith(page, 'hrsa', 'ok');
    assert.equal((await keys(page, 'hrsa')).length, 6);
    assert.match(await text(page, '#status-hrsa'), /OK: 6 sites within 50 miles/);
    assert.equal(log.hrsaDate.length, 1, 'retry reuses the cached date');
    await finish(t, 'HRSA partial at ' + failAt);
  }

  // 5. exceededTransferLimit: Partial with the scope stated, never a complete list.
  {
    const t = await open({ hrsaMode: 'exceeded' });
    const { page, log } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(log.hrsa.length, 1, 'no widening after a truncated answer');
    assert.equal(await state(page, 'hrsa'), 'partial');
    const row = await text(page, '#status-hrsa');
    assert.match(row, /Partial: the service returned its limit of 2000 records within 10 miles, so some sites in that area may be missing, including nearer ones\. 8 shown, out to 5\.0 mi\./);
    assert.doesNotMatch(row, /OK:|all sites/);
    assert.match(await text(page, '#summary-hrsa'), /Searched: HRSA: part of the sites within 10 miles\./);
    assert.match(await text(page, '#summary-hrsa'), /Partial: the service reached its limit, so some sites may be missing\./);
    assert.equal(await text(page, '#count-hrsa'), '(8, partial)');
    const b = await bridge(page);
    assert.deepEqual([b.sources.hrsa.status, b.sources.hrsa.partial, b.sources.hrsa.count, b.sources.hrsa.reason], ['partial', true, 8, 'the service reached its limit']);
    await finish(t, 'exceededTransferLimit');
  }

  // 5b. Paging of a long HRSA list: 25, then Show more.
  {
    const t = await open({ hrsaMode: 'big' });
    const { page } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await page.locator('#results-hrsa > li.pb-card').count(), 25, 'first page of 25');
    assert.match(await text(page, '#more-hrsa'), /Show more \(35 more\)/);
    assert.match(await text(page, '#summary-hrsa'), /Showing 25 of 60 health center sites/);
    await page.click('#more-hrsa');
    assert.equal(await page.locator('#results-hrsa > li.pb-card').count(), 50);
    await page.click('#more-hrsa');
    assert.equal(await page.locator('#results-hrsa > li.pb-card').count(), 60);
    assert.equal(await page.isVisible('#more-hrsa'), false);
    assert.equal(await page.isVisible('#more-osm'), false, 'the other list has its own paging');
    await finish(t, 'HRSA paging');
  }

  // 6. HRSA date query failing while the sites succeed: cards and status say so; no invented date; retried on the next search.
  for (const [label, options] of [['HTTP 500', { fail: { 'hrsa-date': 500 } }], ['error body', { bad: { 'hrsa-date': 'arcgis-error' } }], ['no features', { bad: { 'hrsa-date': 'empty-features' } }], ['network error', { fail: { 'hrsa-date': 'abort' } }]]) {
    const t = await open(options);
    const { page, log, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'hrsa'), 'ok', label);
    assert.deepEqual(await keys(page, 'hrsa'), CITY_HRSA_ORDER, label);
    const row = await text(page, '#status-hrsa');
    assert.match(row, /OK: 8 sites within 10 miles\./, label);
    assert.ok(row.includes('Data date not available (the HRSA date check failed)'), label + ': status row says the date is missing');
    assert.doesNotMatch(row, /load date: /, label);
    for (const key of CITY_HRSA_ORDER) {
      const c = await cardText(page, key);
      assert.ok(c.includes('Source: HRSA Health Center Program site data. Data date not available (the HRSA date check failed).'), `${label} ${key}: ${c}`);
      assert.doesNotMatch(c, /2026|load date/, `${label} ${key}: no invented date`);
    }
    assert.match(await text(page, '#src-date-hrsa'), /not available \(the HRSA date check failed\)/);
    const b = await bridge(page);
    assert.deepEqual([b.sources.hrsa.status, b.sources.hrsa.dataDate, b.sources.hrsa.count], ['ok', null, 8], label);
    assert.ok(!(await page.evaluate(() => document.getElementById('places').innerText)).includes('Oct 30, 2026'));
    if (label === 'HTTP 500') {
      assert.equal(log.hrsaDate.length, 1);
      delete opt.fail['hrsa-date'];
      await search(page, '69201', 2);
      assert.equal(log.hrsaDate.length, 2, 'a failed date check is retried on the next search');
      assert.ok((await text(page, '#status-hrsa')).includes(HRSA_DATE));
      assert.equal((await bridge(page)).sources.hrsa.dataDate, '2026-10-30');
      assert.ok((await cardText(page, 'hrsa:3001')).includes(`Source: HRSA Health Center Program site data. ${HRSA_DATE}.`));
    }
    await finish(t, 'HRSA date fails: ' + label);
  }

  // 7. OSM fails alone: main 502 then mirror 504; never "None listed"; Try again recovers only OSM.
  {
    const t = await open({ fail: { 'overpass-main': 502, 'overpass-mirror': 504 } });
    const { page, log, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'osm'), 'failed');
    assert.equal(await state(page, 'hrsa'), 'ok');
    const row = await text(page, '#status-osm');
    assert.match(row, /Unavailable: the service answered with HTTP 504 \(tried overpass-api\.de and the maps\.mail\.ru mirror\)\. No OpenStreetMap listings are shown; this is not a zero\./);
    assert.match(row, /Try again/);
    assert.doesNotMatch(row, /None listed/);
    assert.deepEqual(log.overpass.map(o => o.host), ['overpass-api.de', 'maps.mail.ru']);
    assert.equal((await keys(page, 'osm')).length, 0);
    assert.deepEqual(await keys(page, 'hrsa'), CITY_HRSA_ORDER);
    assert.equal(await text(page, '#count-osm'), '(unavailable)');
    assert.match(await text(page, '#summary-osm'), /Free or possibly free clinics from OpenStreetMap could not be retrieved: .* This is not a zero and does not mean none are listed\./);
    assert.doesNotMatch(await text(page, '#summary-osm'), /None listed|none listed/);
    assert.equal(await page.isVisible('#ways-osm'), true, 'other ways to look under a failed free list');
    const b = await bridge(page);
    assert.deepEqual([b.sources.osm.status, b.sources.osm.count, b.sources.osm.radiusMi, b.sources.osm.freeCount], ['failed', null, null, null]);
    assert.equal(b.sources.hrsa.status, 'ok');
    // Try again re-runs only OSM and keeps keyboard focus on the card link it was on.
    delete opt.fail['overpass-main']; delete opt.fail['overpass-mirror'];
    const hrsaBefore = log.hrsa.length, nomBefore = log.nominatim.length;
    await page.focus('#results-hrsa > li.pb-card:first-child a[data-l="dir"]');
    await page.evaluate(() => document.querySelector('#status-osm [data-retry="osm"]').click());
    await settledWith(page, 'osm', 'ok');
    assert.equal(log.hrsa.length, hrsaBefore, 'HRSA is not re-queried');
    assert.equal(log.nominatim.length, nomBefore);
    assert.equal((await bridge(page)).selectionId, 1);
    assert.deepEqual(await keys(page, 'osm'), CITY_OSM_ORDER);
    assert.equal(await page.evaluate(() => { const a = document.activeElement; return a.closest('li').getAttribute('data-k') + ':' + a.getAttribute('data-l'); }), 'hrsa:1001:dir', 'focus stays on the card link across re-renders');
    await finish(t, 'osm fails alone');
  }
  // 7b. Main Overpass server fails, the mirror answers; malformed Overpass answers are Unavailable.
  {
    const t = await open({ fail: { 'overpass-main': 502 } });
    const { page, log } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'osm'), 'ok');
    assert.deepEqual(log.overpass.map(o => o.host), ['overpass-api.de', 'maps.mail.ru']);
    assert.equal(log.overpass[1].method, 'POST');
    assert.deepEqual(await keys(page, 'osm'), CITY_OSM_ORDER);
    assert.match(await text(page, '#status-osm'), /OK: 5 listed within 15 miles/);
    await finish(t, 'overpass mirror');
  }
  {
    const t = await open({ bad: { 'overpass-main': 'html', 'overpass-mirror': 'json-no-elements' } });
    const { page } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'osm'), 'failed');
    assert.match(await text(page, '#status-osm'), /Unavailable: the response had no list of places \(tried overpass-api\.de and the maps\.mail\.ru mirror\)/);
    assert.equal(await page.locator('#results-osm > li').count(), 0);
    assert.doesNotMatch(await text(page, '#summary-osm'), /None listed|none listed/);
    await finish(t, 'malformed overpass');
  }

  // 8. Every feed fails: emergency note, status rows, other ways, coverage and sources still render; nothing reads as zero.
  {
    const t = await open({ fail: { hrsa: 503, 'hrsa-date': 503, 'overpass-main': 502, 'overpass-mirror': 503, leaflet: 503 } });
    const { page, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.deepEqual([await state(page, 'geocoder'), await state(page, 'hrsa'), await state(page, 'osm'), await state(page, 'map')], ['ok', 'failed', 'failed', 'failed']);
    assert.equal(await page.locator('#status [data-retry]').count(), 3, 'HRSA, OpenStreetMap and the map each offer Try again');
    assert.equal(await page.locator('#results-hrsa > li, #results-osm > li').count(), 0);
    assert.doesNotMatch(await page.evaluate(() => document.getElementById('places').innerText), /None listed|none listed|\(0\)/);
    assert.equal(await text(page, '#live'), 'Search finished. Free or possibly free clinics in OpenStreetMap: unavailable, not zero. Sliding-fee health centers in HRSA: unavailable, not zero.');
    assert.match(await text(page, '#map'), /Map unavailable; the lists still work\./);
    const b = await bridge(page);
    assert.equal(b.state, 'settled');
    for (const k of ['hrsa', 'osm']) assert.deepEqual([b.sources[k].status, b.sources[k].count, b.sources[k].radiusMi, b.sources[k].partial], ['failed', null, null, false], k);
    await assertNothingBlank(page, 'all feeds fail');
    await planReady(page, /Searched location/);
    assert.doesNotMatch(await text(page, '#console-response'), /\b0 (HRSA|OpenStreetMap)|none listed/i);
    Object.keys(opt.fail).forEach(k => delete opt.fail[k]);
    await page.click('#status-hrsa [data-retry="hrsa"]');
    await settledWith(page, 'hrsa', 'ok');
    assert.equal(await state(page, 'osm'), 'failed', 'only the retried source changes');
    await page.click('#status-osm [data-retry="osm"]');
    await settledWith(page, 'osm', 'ok');
    assert.equal((await keys(page, 'hrsa')).length, 8);
    assert.equal((await keys(page, 'osm')).length, 5);
    await finish(t, 'every feed fails then recovers');
  }
  {
    // Every host refuses the connection, including the place search and the map library.
    const t = await open({ fail: { nominatim: 'abort', hrsa: 'abort', 'hrsa-date': 'abort', 'overpass-main': 'abort', 'overpass-mirror': 'abort', leaflet: 'abort' } }, { viewport: { width: 320, height: 800 } });
    const { page, log } = t;
    await until(async () => (await state(page, 'map')) === 'failed', 'map failure');
    await assertNothingBlank(page, 'idle, all hosts down');
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'geocoder'), 'failed');
    assert.match(await text(page, '#status-geocoder'), /Unavailable: network error, or the service blocked the request\. Nothing else was searched\./);
    assert.deepEqual([await state(page, 'hrsa'), await state(page, 'osm')], ['notrun', 'notrun']);
    assert.equal(log.hrsa.length + log.overpass.length, 0);
    await assertNothingBlank(page, 'place search down');
    await noSideScroll(page, '320px all hosts down');
    await finish(t, 'every host down');
  }

  // 9. Place search outcomes: no match (ZIP 00000), invalid ZIP, empty input, place search failing then retried. Nothing else is searched.
  {
    const t = await open();
    const { page, log } = t;
    await search(page, '00000', 1);
    assert.match(await text(page, '#place'), /No place matched "00000"\. Check the ZIP code or try a street address or city\./);
    assert.equal(await state(page, 'geocoder'), 'empty');
    assert.equal(await text(page, '#status-geocoder .pb-badge'), 'No match');
    assert.deepEqual([await state(page, 'hrsa'), await state(page, 'osm')], ['notrun', 'notrun']);
    assert.match(await text(page, '#status-hrsa'), /Not run: no location to check yet/);
    assert.equal(log.hrsa.length + log.hrsaDate.length + log.overpass.length, 0, 'nothing requested without a place');
    assert.equal(new URL(log.nominatim[0]).searchParams.get('postalcode'), '00000');
    let b = await bridge(page);
    assert.deepEqual([b.state, b.sources.geocoder.status, b.sources.hrsa.status, b.sources.osm.status], ['settled', 'empty', 'not-run', 'not-run']);
    assert.match(await text(page, '#summary-hrsa'), /No location to search yet/);
    await planReady(page, /No place found for the search/);
    await search(page, '1234', 2);
    assert.match(await text(page, '#place'), /That is not a valid ZIP code\. A ZIP code has 5 digits/);
    assert.equal(await state(page, 'geocoder'), 'invalid');
    assert.match(await text(page, '#status-geocoder'), /Not sent: a ZIP code needs exactly 5 digits/);
    assert.equal(log.nominatim.length, 1, 'an invalid ZIP is never sent');
    b = await bridge(page);
    assert.deepEqual([b.sources.geocoder.status, b.sources.hrsa.status], ['invalid', 'not-run']);
    await page.fill('#q', '   ');
    await page.click('#go');
    assert.match(await text(page, '#place'), /Type an address, city or ZIP code first/);
    assert.equal(log.nominatim.length, 1);
    await finish(t, 'no match and invalid input');
  }
  {
    const t = await open({ fail: { nominatim: 503 } });
    const { page, log, opt } = t;
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'geocoder'), 'failed');
    assert.match(await text(page, '#status-geocoder'), /Unavailable: the service answered with HTTP 503\. Nothing else was searched\./);
    assert.match(await text(page, '#status-geocoder'), /Try again/);
    assert.match(await text(page, '#place'), /The place search is unavailable right now/);
    assert.equal(log.hrsa.length + log.overpass.length, 0);
    assert.equal((await bridge(page)).sources.geocoder.status, 'failed');
    await planReady(page, /Place search unavailable/);
    delete opt.fail.nominatim;
    await page.click('#status-geocoder [data-retry="geocoder"]');
    await settled(page, 2);
    assert.equal(await state(page, 'geocoder'), 'ok');
    assert.equal((await keys(page, 'hrsa')).length, 8);
    await finish(t, 'geocoder down then retried');
  }

  // 10. Use my location: granted (no place search, rounded coordinates only), denied, timeout, unavailable.
  {
    const t = await open({}, { geolocation: { latitude: 41.88219, longitude: -87.63087, accuracy: 35 }, permissions: ['geolocation'] });
    const { page, log } = t;
    await page.click('#loc');
    await settled(page, 1);
    assert.match(await text(page, '#place'), /Searching near: your device location \(accuracy about 35 m\)/);
    assert.match(await text(page, '#place'), /Map images for the area you view come from tile\.openstreetmap\.org\./);
    assert.equal(log.nominatim.length, 0, 'no place search for a device location');
    assert.equal(await state(page, 'geocoder'), 'notused');
    assert.deepEqual([await state(page, 'hrsa'), await state(page, 'osm')], ['ok', 'ok']);
    assert.equal(log.hrsa[0].params.geometry, '-87.631,41.882');
    assert.match(log.overpass[0].query, /around:24140,41\.882,-87\.631/);
    const sent = log.requests.join('\n') + '\n' + log.bodies.join('\n');
    assert.ok(!sent.includes('41.88219') && !sent.includes('87.63087'), 'exact device coordinates are never sent');
    const b = await bridge(page);
    assert.equal(b.locationType, 'device');
    assert.equal(b.sources.geocoder.status, 'not-used');
    assert.ok(!JSON.stringify(b).includes('41.88') && !JSON.stringify(b).includes('87.63'));
    assert.equal(page.url(), pageUrl);
    assert.equal((await keys(page, 'hrsa')).length, 8);
    assert.equal((await keys(page, 'osm')).length, 5);
    await finish(t, 'location granted');
  }
  {
    const t = await open();
    const { page, log } = t;
    await page.click('#loc'); // no permission granted: the browser denies it
    await settled(page, 1);
    assert.match(await text(page, '#place'), /Location permission was denied\. To use it, allow location for this page/);
    assert.equal(await state(page, 'geocoder'), 'notused');
    assert.deepEqual([await state(page, 'hrsa'), await state(page, 'osm')], ['notrun', 'notrun']);
    assert.match(await text(page, '#status-geocoder'), /no device location was available/);
    assert.equal(log.requests.filter(u => !/unpkg\.com|tile\.openstreetmap\.org/.test(u)).length, 0);
    const b = await bridge(page);
    assert.deepEqual([b.locationType, b.state, b.sources.hrsa.status, b.sources.osm.status], ['device', 'settled', 'not-run', 'not-run']);
    await planReady(page, /No location was available for the search/);
    for (const [code, message, pattern] of [[3, 'timeout', /did not report a location in time/], [2, 'unavailable', /could not work out its location right now/]]) {
      await page.evaluate(([c, m]) => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: c, message: m }), 10); }, [code, message]);
      await page.click('#loc');
      await settled(page, code === 3 ? 2 : 3);
      assert.match(await text(page, '#place'), pattern);
    }
    await assertNothingBlank(page, 'location denied');
    await finish(t, 'location denied');
  }

  // 11. Leaflet blocked, or never answering: the lists still work and the Map row says Unavailable.
  for (const [label, options] of [['blocked', { fail: { leaflet: 503 } }], ['hangs', { hang: new Set(['leaflet']), clock: true }]]) {
    const t = await open(options);
    const { page } = t;
    assert.ok(await page.evaluate(() => !!window.ClinicResponse), 'page script ran while Leaflet is missing');
    if (options.clock) {
      assert.equal(await state(page, 'map'), 'loading');
      await page.clock.fastForward(15500);
    }
    await until(async () => (await state(page, 'map')) === 'failed', 'map failure');
    assert.match(await text(page, '#status-map'), /Map unavailable; the lists still work\./);
    assert.match(await text(page, '#map'), /Map unavailable; the lists still work\./);
    await page.fill('#q', CITY_QUERY);
    await page.click('#go');
    await settled(page, 1);
    assert.equal(page.url(), pageUrl, 'no native form submit');
    assert.deepEqual(await keys(page, 'hrsa'), CITY_HRSA_ORDER);
    assert.deepEqual(await keys(page, 'osm'), CITY_OSM_ORDER);
    assert.equal((await bridge(page)).state, 'settled');
    await finish(t, 'leaflet ' + label);
  }

  // 12. A second search while the first is in flight: the first search's results never appear.
  {
    const t = await open();
    const { page, log } = t;
    await page.fill('#q', 'Slow Town, PA');
    await page.press('#q', 'Enter');
    await until(() => log.hrsa.length === 1 && log.overpass.length === 1, 'first search requests');
    await page.fill('#q', CITY_QUERY);
    await page.press('#q', 'Enter');
    await settled(page, 2);
    assert.equal((await keys(page, 'hrsa')).length, 8);
    assert.equal((await keys(page, 'osm')).length, 5);
    assert.match(await text(page, '#place'), /Searching near: 233, South Wacker Drive/);
    await sleep(3000); // the slow answers would land here
    assert.deepEqual(await keys(page, 'hrsa'), CITY_HRSA_ORDER);
    assert.deepEqual(await keys(page, 'osm'), CITY_OSM_ORDER);
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /Slow (HRSA|OSM) Fixture|Slow Town/);
    const b = await bridge(page);
    assert.deepEqual([b.selectionId, b.state, b.sources.hrsa.count, b.sources.osm.count], [2, 'settled', 8, 5]);
    await finish(t, 'stale search');
  }

  // 21. A map drawing error never marks a data source unavailable; the map row says so and Try again recovers.
  {
    const t = await open({});
    const { page } = t;
    await page.waitForSelector('#map.leaflet-container');
    await page.evaluate(() => { window.__lb = window.L.latLngBounds; window.L.latLngBounds = () => { throw new Error('Bounds are not valid.'); }; });
    await search(page, CITY_QUERY, 1);
    assert.equal(await state(page, 'hrsa'), 'ok', 'a map error leaves HRSA OK');
    assert.equal(await state(page, 'osm'), 'ok', 'a map error leaves OpenStreetMap OK');
    assert.equal((await keys(page, 'hrsa')).length, 8);
    assert.equal(await state(page, 'map'), 'failed');
    assert.equal(await page.locator('#status-map [data-retry="map"]').count(), 1);
    await page.evaluate(() => { window.L.latLngBounds = window.__lb; });
    await page.click('#status-map [data-retry="map"]');
    await until(async () => (await state(page, 'map')) === 'ok', 'map recovered after a draw error');
    await page.waitForSelector('#map.leaflet-container');
    await until(async () => (await page.locator('#map .leaflet-marker-icon .pb-mk-hrsa').count()) === 8, 'markers after retry');
    await finish(t, 'map draw error');
  }

  // 22. Device location accuracy of 0 is not shown as "about 0 m".
  {
    const t = await open({}, { geolocation: { latitude: 41.88219, longitude: -87.63087, accuracy: 0 }, permissions: ['geolocation'] });
    const { page } = t;
    await page.click('#loc');
    await settled(page, 1);
    assert.match(await text(page, '#place'), /Searching near: your device location\./);
    assert.doesNotMatch(await text(page, '#place'), /accuracy/);
    await finish(t, 'zero accuracy');
  }

  // 23. Privacy sentence is true for typed text, and the conditions lede does not call conditional items free.
  {
    const t = await open({});
    const { page } = t;
    const priv = await text(page, '#privacy > p');
    assert.match(priv, /Your device location stays in this browser\. If you type an address, only that text is sent, to OpenStreetMap's place search\./);
    assert.doesNotMatch(priv, /Your exact location/);
    assert.match(await text(page, '#block-osm > .pb-lede'), /Free means OpenStreetMap tags the clinic fee=no with no charge or conditions\. Possibly free means fee=no with conditions/);
    await finish(t, 'privacy and lede');
  }

  // 14. Screen-reader announcement: unavailable or unsearched never sounds like zero.
  {
    const t = await open({ fail: { nominatim: 503 } });
    const { page } = t;
    await search(page, CITY_QUERY, 1);
    assert.match(await text(page, '#live'), /^Search stopped, no location\. The place search is unavailable right now/);
    assert.doesNotMatch(await text(page, '#live'), /\b0\b/);
    await page.fill('#q', '1234');
    await page.press('#q', 'Enter');
    await settled(page, 2);
    assert.match(await text(page, '#live'), /^Search stopped, no location\. That is not a valid ZIP code/);
    assert.doesNotMatch(await text(page, '#live'), /\b0\b/);
    await finish(t, 'announce without location');
  }
  {
    const t = await open({}, { viewport: { width: 1280, height: 900 } });
    const { page, opt } = t;
    await search(page, 'Nowhere Flat, NV', 1);
    assert.equal(await text(page, '#live'), 'Search finished. Free or possibly free clinics in OpenStreetMap: none listed. Sliding-fee health centers in HRSA: none listed.');
    await finish(t, 'announce empty');
  }

  // 15. Name matching needs whole words: "Carefree Medical" is not a free clinic; real free names still match.
  {
    const names = [['Carefree Medical Center', 9101], ['Pain Free Health Chiropractic', 9102], ['Worry-Free Medical Clinic', 9103], ['Free Medical Center of Chicago', 9104], ['The Free Clinic', 9105], ['Free Healthcare Partners', 9106], ['The Free Clinics', 9107], ['Free Clinics of Iowa', 9108], ['Health Care Free Clinic of Smithtown', 9109], ['Primary Care Free Clinic', 9110], ['Care Free Medical Center', 9111], ['Drug-Free Health Clinic', 9112]];
    const extraOsm = names.map(([name, id], i) => osmEl('chicago', 'node', id, 0.1 + i * 0.01, { name }));
    const t = await open({ extraOsm });
    const { page } = t;
    await search(page, CITY_QUERY, 1);
    const got = await keys(page, 'osm');
    for (const id of [9104, 9105, 9107, 9108, 9109, 9110]) assert.ok(got.includes('osm:node/' + id), 'real free name kept: ' + id);
    for (const id of [9101, 9102, 9103, 9106, 9111, 9112]) assert.ok(!got.includes('osm:node/' + id), 'look-alike name kept out: ' + id);
    await finish(t, 'free name boundaries');
  }

  // 16. HRSA: sites show without waiting for a slow date, and the date is filled in when it lands.
  {
    const t = await open({ delayDate: 4000 });
    const { page } = t;
    const t0 = Date.now();
    await page.fill('#q', CITY_QUERY);
    await page.press('#q', 'Enter');
    await until(async () => (await state(page, 'hrsa')) === 'ok', 'HRSA list before the date', 3800);
    assert.ok(Date.now() - t0 < 3900, 'HRSA list did not wait for the date');
    assert.match(await text(page, '#status-hrsa'), /HRSA data date still loading\./);
    assert.match(await cardText(page, 'hrsa:1001'), /HRSA data date still loading/);
    assert.equal((await bridge(page)).sources.hrsa.dataDate, null);
    assert.equal((await bridge(page)).sources.hrsa.datePending, true, 'the bridge says the date is still loading');
    await until(async () => /HRSA Data Warehouse load date: Oct 30, 2026\./.test(await text(page, '#status-hrsa')), 'late date', 6000);
    assert.doesNotMatch(await text(page, '#status-hrsa'), /still loading/);
    assert.match(await cardText(page, 'hrsa:1001'), /HRSA Data Warehouse load date: Oct 30, 2026/);
    assert.equal((await bridge(page)).sources.hrsa.dataDate, '2026-10-30');
    assert.equal((await bridge(page)).sources.hrsa.datePending, false);
    assert.equal(await text(page, '#src-date-hrsa'), 'HRSA Data Warehouse load date Oct 30, 2026');
    await finish(t, 'late HRSA date');
  }

  // 17. HRSA: an unusable wider answer keeps the sites already found (Partial with Try again), and a funded record beats its look-alike twin.
  {
    const t = await open({ badRadius: { 50: 'unusable' } });
    const { page, opt } = t;
    await search(page, '69201', 1);
    assert.equal(await state(page, 'hrsa'), 'partial');
    assert.match(await text(page, '#status-hrsa'), /Partial: 2 sites within 25 miles\. Fewer than 5 were found, and the wider search did not complete: the response had no usable sites\./);
    assert.equal((await keys(page, 'hrsa')).length, 2);
    delete opt.badRadius;
    await page.click('#status-hrsa [data-retry="hrsa"]');
    await settledWith(page, 'hrsa', 'ok');
    assert.equal((await keys(page, 'hrsa')).length, 6);
    await finish(t, 'unusable widening step');
  }
  {
    const same = { SITE_NM: 'Twin Fixture Health Center', SITE_ADDRESS: '672 Parkside Ave', GRANTEE_NM: 'TWIN ORG', HCC_OPER_SCHD_DESC: 'Full-Time' };
    const extraHrsa = [
      hrsaFeat('chicago', 1101, 1.0, { ...same, SITE_DATA_SOURCE: 'FQHC_LKL', FQHC_LAL_NUM: 'LAL9', FQHC_ORG_NM: 'TWIN LOOKALIKE', TOT_OPER_HR_PER_WEEK: 89 }),
      hrsaFeat('chicago', 1102, 1.0, { ...same, TOT_OPER_HR_PER_WEEK: 77 }),
    ];
    const t = await open({ extraHrsa });
    const { page } = t;
    await search(page, CITY_QUERY, 1);
    const got = await keys(page, 'hrsa');
    assert.ok(got.includes('hrsa:1102') && !got.includes('hrsa:1101'), 'funded record kept: ' + got);
    const c = await cardText(page, 'hrsa:1102');
    assert.ok(c.includes('HRSA-funded health center') && c.includes('About 77 hours a week') && c.includes('HRSA also lists a look-alike record at this name and address'), c);
    assert.equal((await bridge(page)).sources.hrsa.lookalikeCount, 1, 'only the existing look-alike site is counted');
    assert.match(await text(page, '#status-hrsa'), /2 duplicate records at the same name and address shown once\./);
    await finish(t, 'funded and look-alike twin');
  }

  // 18. Use my location: a fix that arrives after the 30 second notice (slow permission prompt) is still used.
  {
    const t = await open({ clock: true });
    const { page } = t;
    await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, err) => { window.__geoOk = ok; window.__geoErr = err; }; });
    await page.click('#loc');
    await page.clock.fastForward(31000);
    assert.match(await text(page, '#place'), /No location was received within 30 seconds/);
    assert.equal(await page.evaluate(() => (window.ClinicResponse.state)), 'settled');
    await page.clock.resume();
    const snap = await page.evaluate(() => { window.__geoOk({ coords: { latitude: 41.88219, longitude: -87.63087, accuracy: 35 } }); return [window.ClinicResponse.state, window.ClinicResponse.checkedAt]; });
    assert.deepEqual(snap, ['loading', null], 'the notice time is not reused when the late fix restarts the search');
    await settledWith(page, 'hrsa', 'ok');
    assert.match(await text(page, '#place'), /Searching near: your device location/);
    assert.equal(await state(page, 'geocoder'), 'notused');
    assert.match(await text(page, '#status-geocoder'), /Use my location skips the text place search/);
    assert.equal((await keys(page, 'hrsa')).length, 8);
    await finish(t, 'late location fix');
  }

  // 19. Quick repeated searches: superseded ones do not queue for the geocoder, so the last one is not delayed behind them.
  {
    const t = await open();
    const { page, log } = t;
    for (const q of ['1 Chicago A', '2 Chicago B', '3 Chicago C', '4 Chicago D', CITY_QUERY]) { await page.fill('#q', q); await page.press('#q', 'Enter'); }
    await settled(page, 5);
    assert.ok(log.nominatim.length <= 2, 'only the first and the last search reach the geocoder: ' + log.nominatim.length);
    assert.ok(log.nominatimTimes.at(-1) - log.nominatimTimes[0] < 2500, 'the last search waited at most about one second');
    await finish(t, 'stale geocoder slots');
  }

  // 20. Map: a few failed tiles do not mark the map Partial for good; many in a row do; Try again reloads a failed map library.
  {
    const t = await open({ tileFail: 2 });
    const { page, log } = t;
    await page.waitForSelector('#map.leaflet-container');
    await until(() => log.tiles.length > 3, 'tiles');
    await sleep(300);
    assert.equal(await state(page, 'map'), 'ok', 'two failed tiles keep the map OK');
    await finish(t, 'few tile errors');
  }
  {
    const t = await open({ tileFail: 'all' });
    const { page } = t;
    await until(async () => (await state(page, 'map')) === 'partial', 'map partial after repeated tile errors');
    assert.match(await text(page, '#status-map'), /Basemap tiles from tile\.openstreetmap\.org did not load/);
    await finish(t, 'many tile errors');
  }
  {
    const t = await open({ fail: { leaflet: 503 } });
    const { page, opt } = t;
    await until(async () => (await state(page, 'map')) === 'failed', 'map failed');
    assert.equal(await page.locator('#status-map [data-retry="map"]').count(), 1, 'the map row offers Try again');
    delete opt.fail.leaflet;
    await page.click('#status-map [data-retry="map"]');
    await until(async () => (await state(page, 'map')) === 'ok', 'map recovered');
    await page.waitForSelector('#map.leaflet-container');
    await search(page, CITY_QUERY, 1);
    assert.equal(await page.locator('#map .leaflet-marker-icon .pb-mk-hrsa').count(), 8, 'markers drawn on the recovered map');
    await finish(t, 'map try again');
  }

  // 13. Layout and colour: no sideways scroll at 320 px with long escaped text, the emergency note is visible, touch targets are 44 px.
  for (const [width, colorScheme, touch] of [[320, 'light', true], [320, 'dark', false], [375, 'dark', false], [375, 'light', false]]) {
    const t = await open({}, { viewport: { width, height: 800 }, colorScheme, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
    const { page } = t;
    await noSideScroll(page, `${width}px ${colorScheme} idle`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('console-response-shortcut')).position), 'static', 'the Response plan link does not float over the page on a phone');
    const bar = await page.locator('.pb-bar').boundingBox(), pill = await page.locator('#console-response-shortcut').boundingBox();
    assert.ok(pill.y + pill.height <= bar.y || pill.y >= bar.y + bar.height, 'the Response plan link does not cover the search buttons');
    const emergLine = await page.evaluate(() => { const p = document.querySelector('#emergency p'); return p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight); });
    assert.ok(emergLine <= 4.2, `${width}px ${colorScheme}: the 911/988 sentence keeps normal line spacing (${emergLine.toFixed(1)} lines tall)`);
    assert.ok(await page.isVisible('#emergency'));
    for (const href of ['tel:911', 'tel:988', 'sms:988']) {
      assert.ok(await page.isVisible(`#emergency a[href="${href}"]`), href + ' visible');
      const box = await page.locator(`#emergency a[href="${href}"]`).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `${href} sits inside the ${width}px viewport`);
      if (touch) assert.ok(box.height >= 43.5, `${href} is ${box.height}px tall on a coarse pointer`);
    }
    await search(page, CITY_QUERY, 1);
    await noSideScroll(page, `${width}px ${colorScheme} results`);
    assert.ok(await page.isVisible('#emergency a[href="tel:911"]'));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, colorScheme === 'light' ? 'rgb(243, 246, 249)' : 'rgb(15, 27, 42)', `${colorScheme} background`);
    const ink = await page.evaluate(() => getComputedStyle(document.querySelector('.pb-card')).color);
    assert.notEqual(ink, bg, 'text differs from the background');
    assert.ok(await page.isVisible('#results-osm > li.pb-card:first-child') && await page.isVisible('#results-hrsa > li.pb-card:first-child'));
    const wide = await page.evaluate(() => [...document.querySelectorAll('#places *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest('#map')).map(e => e.tagName + '.' + e.className).slice(0, 5));
    assert.deepEqual(wide, [], `${width}px: elements wider than the viewport`);
    if (touch) {
      for (const sel of ['#go', '#loc', '#fixed-only', '#results-hrsa .pb-dir', '#results-osm .pb-dir']) {
        const box = await page.locator(sel).first().boundingBox();
        assert.ok(box.height >= 43.5, `${sel} is ${box.height}px tall on a coarse pointer`);
      }
    }
    await finish(t, `layout ${width} ${colorScheme}`);
  }

  console.log(`PASS ${passed} clinic finder smoke scenarios`);
} finally {
  await browser.close();
  server.close();
}
