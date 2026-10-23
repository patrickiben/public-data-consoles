// Real browser regressions for data integrity. Every request is fulfilled locally;
// no API keys, external services, CDN files, or map tiles are contacted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile(new URL('../consoles/us-grid-strain/index.html', import.meta.url), 'utf8');
const origin = 'https://grid-data-smoke.invalid/';
const period = '2026-10-23T12';
const row = (respondent, type, value, stamp = period) => ({ respondent, type, value, period: stamp });
const demand = [row('PJM', 'D', '100'), row('PJM', 'DF', '80'), row('PJM', 'NG', '110'), row('PJM', 'TI', '10')];
const history = [row('PJM', 'D', '100'), row('PJM', 'D', '120', '2026-10-23T11')];
const interchange = [{ fromba: 'PJM', toba: 'NYIS', value: '10', period }];
const fuel = [{ fueltype: 'NG', value: '100', period }];
let passed = 0;
const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });

async function scenario(name, overrides, verify) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [], apiCalls = [];
  try {
    const source = overrides.html || html;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.href === origin) return route.fulfill({ contentType: 'text/html', body: source });
      if (url.hostname === 'api.eia.gov') {
        apiCalls.push(url.pathname);
        if (overrides.rejectAPI) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"fixture key rejected"}' });
        let data;
        if (url.pathname.endsWith('/fuel-type-data/data/')) data = overrides.fuel || fuel;
        else if (url.pathname.endsWith('/interchange-data/data/')) data = interchange;
        else if (url.pathname.endsWith('/region-data/data/')) {
          data = url.searchParams.getAll('facets[type][]').length === 1 ? (overrides.history ?? history) : (overrides.demand || demand);
        } else throw new Error('Unexpected EIA path: ' + url.pathname);
        return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ response: { data } }) });
      }
      return route.fulfill({ status: 503, body: 'Offline fixture: dependency unavailable' });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#lead .row2').length === 53);
    assert.equal(apiCalls.length, 0, 'Public snapshot must not request EIA API access');
    if (!overrides.skipAPI) {
      await page.locator('#changekey').click();
      await page.locator('#keyin').fill('fixture-personal-key-not-real-123456');
      await page.locator('#savekey').click();
      if (overrides.rejectAPI) await page.waitForFunction(() => document.querySelector('#upd').textContent.includes('Refresh failed'));
      else await page.waitForFunction(() => STATE.mode === 'api');
      await page.locator('#lead .row2[data-c="PJM"]').click();
      await page.waitForFunction(() => !document.getElementById('dfleg').textContent.includes('loading'));
    }
    await verify(page);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log('PASS grid data: ' + name);
    passed++;
  } finally {
    await context.close();
  }
}

async function missingBaseline(page) {
  const pjm = page.locator('#lead .row2[data-c="PJM"]');
  assert.equal((await pjm.locator('.pct').textContent()).trim(), '—');
  assert.match(await pjm.textContent(), /baseline unavailable/);
  assert.match(await page.locator('#dkpis').textContent(), /baseline unavailable/);
  assert.doesNotMatch(await page.locator('#dkpis').textContent(), /0%\s*normal/);
  assert.equal(await page.evaluate(() => CATCOL(STATE.ba.PJM.pct)), '#7e93ad');
  assert.equal(await page.evaluate(() => CATLAB(STATE.ba.PJM.pct)), 'baseline unavailable');
  assert.equal(await page.evaluate(() => STATE.ba.PJM.D), 100, 'Measured demand survives unavailable history');
}

try {
  await scenario('rejected optional API connection retains the complete public snapshot', { rejectAPI: true }, async page => {
    assert.equal(await page.locator('#lead .row2').count(), 53);
    assert.equal(await page.locator('#connection-panel').isVisible(), false);
    assert.match(await page.locator('#data-note').textContent(), /embedded EIA snapshot.*Not live.*API refresh failed/);
    assert.equal(await page.evaluate(() => STATE.mode), 'snapshot');
    assert.ok(await page.locator('#dramp b').count() > 0, 'Public demand details remain available');
  });
  await scenario('empty HTTP 200 history is unavailable', { history: [] }, missingBaseline);
  await scenario('partial HTTP 200 history does not give missing BA a green zero', {
    demand: [...demand, row('NYIS', 'D', '50')], history: [row('NYIS', 'D', '60')],
  }, async page => {
    await missingBaseline(page);
    assert.equal(await page.locator('#lead .row2[data-c="NYIS"] .pct').textContent(), '83%');
  });
  await scenario('zero peak is unavailable', { history: [row('PJM', 'D', '0')] }, missingBaseline);
  await scenario('fuel bar uses one hour and discloses unreported categories', {
    fuel: [
      { fueltype: 'NG', value: '100', period },
      { fueltype: 'COL', value: '50', period: '2026-10-23T11' },
      { fueltype: 'SUN', value: null, period },
    ],
  }, async page => {
    const legend = await page.locator('#dfleg').textContent();
    assert.match(legend, /Natural gas 100%/);
    assert.doesNotMatch(legend, /Coal/);
    assert.match(legend, /Missing categories are unreported, not zero/);
    assert.match(await page.locator('#dfuelhd').textContent(), /2026-10-23 12:00 UTC/);
    assert.equal(await page.locator('#dfuel span').count(), 1);
  });
  await scenario('forecast-only US48 does not relabel the BA sum', {
    demand: [...demand, row('US48', 'DF', '99999', '2026-10-23T13')],
  }, async page => {
    assert.match(await page.locator('#natdemand').textContent(), /Reported BA demand\s+0\.1 GW/);
    assert.match(await page.locator('#kpis .kpi').first().textContent(), /Sum of latest BA demand/);
    assert.doesNotMatch(await page.locator('#kpis').textContent(), /Total U\.S\. demand/);
    assert.equal(await page.locator('#lead .row2').count(), 1, 'US48 aggregate excluded from BA leaderboard');
  });
  await scenario('actual US48 aggregate has its own timestamp', {
    demand: [...demand, row('US48', 'D', '250', '2026-10-23T10')],
  }, async page => {
    assert.match(await page.locator('#natdemand').textContent(), /U\.S\. demand\s+0\.3 GW.*2026-10-23 10:00 UTC/);
    assert.match(await page.locator('#kpis .kpi').first().textContent(), /Total U\.S\. demand/);
    assert.match(await page.locator('#data-note').textContent(), /US48 aggregate as of 2026-10-23 10:00 UTC/);
  });
  const snapshotPattern = /(<script type="application\/json" id="grid-snapshot">)(.*?)(<\/script>)/s;
  const snapshot = JSON.parse(html.match(snapshotPattern)[2]);
  snapshot.capturedAt = '2027-01-15T12:00:00+00:00';
  snapshot.sources = snapshot.sources.map(source => ({ ...source, url: source.url.replace('2026_Jul_Dec', '2027_Jan_Jun') }));
  const futureHTML = html.replace(snapshotPattern, (_, before, unused, after) => before + JSON.stringify(snapshot) + after);
  await scenario('future capture updates visible source links and date', { html: futureHTML, skipAPI: true }, async page => {
    assert.equal(await page.locator('#snapshot-capture').textContent(), '15 January 2027');
    assert.match(await page.locator('#balance-source').getAttribute('href'), /EIA930_BALANCE_2027_Jan_Jun\.csv$/);
    assert.match(await page.locator('#interchange-source').getAttribute('href'), /EIA930_INTERCHANGE_2027_Jan_Jun\.csv$/);
    assert.match(await page.locator('#data-note').textContent(), /captured 2027-01-15/);
  });
  console.log(`PASS ${passed} grid data regression cases`);
} finally {
  await browser.close();
}
