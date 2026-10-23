// Native Coastal real-inventory planning contract. Every remote feed is stubbed.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const root = new URL('../', import.meta.url);
const original = await readFile(new URL('consoles/coastal-water-resilience/index.html', root), 'utf8');
const scriptJSON = (html, id) => JSON.parse(html.match(new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)<\\/script>'))[1]);
const baseline = scriptJSON(original, 'public-station-snapshot');
const contextData = scriptJSON(original, 'coastal-impact-context');
// A later weekly capture must not become a future fixture merely because this test is old.
const now = Math.ceil(Math.max(Date.now(), Date.parse(baseline.capturedAt), Date.parse(contextData.capturedAt)) / 3600000) * 3600000;
const coopsTime = time => new Date(time).toISOString().slice(0, 16).replace('T', ' ');
const rows = [
  {t: coopsTime(now + 2 * 3600000), v: '4.23'},
  {t: coopsTime(now + 6 * 3600000), v: '6.73'},
  {t: coopsTime(now + 10 * 3600000), v: '5.83'},
];
const browser = await chromium.launch({headless: true, ...(process.env.CHROME_CHANNEL ? {channel: process.env.CHROME_CHANNEL} : {})});
let passed = 0;

async function scenario(name, {forecast = true, forecastRows, waitForLive = true, mutateInventory, mobile = false} = {}, verify) {
  const inventory = structuredClone(baseline);
  if (mutateInventory) mutateInventory(inventory);
  const html = original.replace(/(<script type="application\/json" id="public-station-snapshot">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(inventory) + b);
  const context = await browser.newContext({serviceWorkers: 'block', acceptDownloads: true, ...(mobile ? {viewport: {width: 390, height: 844}} : {})});
  const errors = [];
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = value => route.fulfill({contentType: 'application/json', body: JSON.stringify(value)});
      if (url.href === 'https://coastal-real-fixture.invalid/') return route.fulfill({contentType: 'text/html', body: html});
      if (url.pathname.endsWith('/data/impact-context.json')) return route.fulfill({status: 404, body: 'No separately published fixture'});
      if (url.hostname === 'tile.openstreetmap.org') return route.abort();
      if (url.hostname === 'api.tidesandcurrents.noaa.gov' && url.searchParams.get('product') === 'ofs_water_level') {
        return forecast ? json({data: forecastRows || rows}) : route.fulfill({status: 503, body: 'Forecast fixture unavailable'});
      }
      if (/\.(?:js|css)$/.test(url.pathname)) return route.fulfill({status: 503, body: 'Offline CDN fixture'});
      return json({features: [], data: [], results: []});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({time: new Date(now)});
    await page.goto('https://coastal-real-fixture.invalid/', {waitUntil: 'load'});
    await page.waitForFunction(() => window.CWR && CWR.FEEDS.ofs.state !== 'loading');
    if (forecast && waitForLive) await page.waitForFunction(() => CWR.FEEDS.ofs.state === 'live');
    await verify(page, inventory);
    assert.deepEqual(errors, [], name + ': native runtime errors');
    passed++;
    console.log('PASS Coastal real planning: ' + name);
  } finally {
    await context.close();
  }
}

const current = page => page.evaluate(() => CWR.exportPlan());
const projection = page => page.evaluate(() => CWR.computeProjectedImpact(CWR.impactOptions()));
const validTerrain = station => typeof station.groundElevationFt === 'number' && Number.isFinite(station.groundElevationFt) && station.groundElevationFt !== -9999 && station.elevationVerticalDatum === 'NAVD88';
// Preserve real identities/coordinates/ownership, but isolate interaction checks from
// legitimate future gaps or changes in the published terrain inventory.
function reviewTerrain(inventory) {
  inventory.stations.forEach(station => {station.groundElevationFt = 100; station.elevationVerticalDatum = 'NAVD88';});
  const city = inventory.stations.filter(station => station.isCityOwned);
  city[0].groundElevationFt = 0;
  city[1].groundElevationFt = 5.5;
}
function expectedCounts(inventory, scope, plane) {
  const stations = inventory.stations.filter(station => scope === 'all' || station.isCityOwned === true);
  const valid = stations.filter(validTerrain);
  return {assets: stations.length, known: valid.length, unknown: stations.length - valid.length, exposed: valid.length ? valid.filter(station => station.groundElevationFt <= plane).length : null};
}
function checkSharedEvidence(plan, impact, expected, level, plane) {
  assert.equal(plan.assetsInScope, expected.assets);
  assert.equal(plan.terrainKnown, expected.known);
  assert.equal(plan.terrainUnknown, expected.unknown);
  assert.equal(plan.levelFtMLLW, level);
  assert.equal(plan.planeFtNAVD88, plane);
  assert.equal(impact.levelFtMLLW, level);
  assert.equal(impact.planeFtNAVD88, plane);
  assert.equal(impact.directCount, expected.exposed);
  assert.equal(plan.stationIds.length, expected.assets);
  assert.equal(new Set(plan.stationIds).size, expected.assets);
  assert.equal(plan.stationResults.length, expected.assets);
  assert.deepEqual(plan.stationResults.map(station => station.id).sort(), [...plan.stationIds].sort());
  assert.equal(plan.stationResults.filter(station => station.screenStatus === 'screened').length, expected.exposed ?? 0);
  assert.equal(plan.coverage.screenedCount, expected.exposed);
  assert.equal(plan.coverage.completeTerrain, expected.unknown === 0);
  assert.equal(plan.projectedImpact.directCount, expected.exposed);
  assert.equal(plan.metrics.length, 10);
}

try {
  await scenario('default City inventory and exact shared NOAA peak', {}, async (page, inventory) => {
    assert.equal(await page.locator('#impact-mode').inputValue(), 'automatic');
    for (const id of ['impact-scope', 'plan-data-scope']) assert.equal(await page.locator('#' + id).inputValue(), 'city');
    for (const id of ['impact-water-source', 'plan-water-source']) assert.equal(await page.locator('#' + id).inputValue(), 'ofs');
    const plan = await current(page), impact = await projection(page);
    assert.equal(plan.dataset, 'city');
    assert.equal(plan.waterSource, 'ofs');
    checkSharedEvidence(plan, impact, expectedCounts(inventory, 'city', 5.25), 6.73, 5.25);
    assert.equal(plan.forecastExposure.samples.length, rows.length);
    for (const sample of plan.forecastExposure.samples) {
      assert.equal(sample.screenedCount, expectedCounts(inventory, 'city', sample.planeFtNAVD88).exposed);
    }
    assert.equal(plan.zoneModel.basis, 'public');
    assert.equal(plan.zoneModel.counts.A, inventory.stations.filter(station => station.isCityOwned && station.officialZone === 'A').length, 'City zone counts must be the public City subset');
    assert.equal(Object.values(plan.zoneModel.counts).reduce((sum, count) => sum + count, 0), plan.assetsInScope);
    assert.ok(plan.stationIds.every(id => !/^LS-\d+$/.test(id)), 'real plan must contain official-register identities');
    assert.doesNotMatch(JSON.stringify(plan), /"LS-\d{3}"/, 'real export must not include fictional station identities');
    assert.ok(!JSON.stringify(plan.zoneModel).includes('public synthetic model'), 'real zones must not come from the fictional assignment table');
    await page.evaluate(() => CWR.setPage('plan'));
    assert.ok((await page.locator('#cwr-plan-summary').textContent()).includes(String(plan.assetsInScope)));
    assert.match(await page.locator('#cwr-plan-summary').textContent(), /6\.73/);
    assert.match(await page.locator('#cwr-plan-summary').textContent(), /5\.25/);
    await page.evaluate(() => CWR.setPage('impact'));
    const review = page.locator('#impact-station-review');
    assert.match(await review.textContent(), /terrain|NAVD88/i);
    assert.match(await review.textContent(), /basin/i);
    assert.match(await review.textContent(), /zone/i);
    assert.match(await review.textContent(), /screen/i);
    assert.ok((await review.textContent()).includes(plan.stationIds[0]), 'station review must expose the real record identity');
  });

  await scenario('scope and water selections synchronize in both directions', {}, async (page, inventory) => {
    await page.evaluate(() => CWR.setPage('impact'));
    await page.locator('#impact-scope').selectOption('all');
    assert.equal(await page.locator('#plan-data-scope').inputValue(), 'all');
    checkSharedEvidence(await current(page), await projection(page), expectedCounts(inventory, 'all', 5.25), 6.73, 5.25);
    assert.equal((await current(page)).zoneModel.counts.A, inventory.stations.filter(station => station.officialZone === 'A').length);
    await page.evaluate(() => CWR.setPage('plan'));
    await page.locator('#plan-data-scope').selectOption('city');
    assert.equal(await page.locator('#impact-scope').inputValue(), 'city');
    await page.locator('#plan-water-source').selectOption('selected');
    assert.equal(await page.locator('#impact-water-source').inputValue(), 'selected');
    await page.evaluate(() => CWR.setSurge(6, true));
    let plan = await current(page);
    assert.equal(plan.waterSource, 'selected');
    checkSharedEvidence(plan, await projection(page), expectedCounts(inventory, 'city', 4.52), 6, 4.52);
    assert.match(await page.locator('#cwr-plan-summary').textContent(), /scenario|selected|ladder/i);
    await page.locator('#plan-data-scope').selectOption('synthetic');
    assert.equal(await page.locator('#impact-scope').inputValue(), 'synthetic');
    assert.equal((await current(page)).stationIds.length, 130);
    await page.evaluate(() => CWR.setPage('impact'));
    await page.locator('#impact-scope').selectOption('city');
    assert.equal(await page.locator('#plan-data-scope').inputValue(), 'city');
    await page.locator('#impact-water-source').selectOption('ofs');
    assert.equal(await page.locator('#plan-water-source').inputValue(), 'ofs');
    plan = await current(page);
    checkSharedEvidence(plan, await projection(page), expectedCounts(inventory, 'city', 5.25), 6.73, 5.25);
  });

  await scenario('unavailable forecast does not create a six-foot real plan', {forecast: false}, async page => {
    await page.evaluate(() => CWR.setPage('plan'));
    const plan = await current(page), impact = await projection(page);
    assert.equal(plan.waterSource, 'ofs');
    assert.equal(plan.levelFtMLLW, null);
    assert.equal(plan.planeFtNAVD88, null);
    assert.equal(impact.directCount, null);
    assert.match(await page.locator('#cwr-plan-summary').textContent(), /unavailable|missing|not assessable/i);
    for (const id of [1, 2, 3, 4, 5, 6, 7, 9, 10]) {
      assert.equal(plan.metrics.find(metric => metric.metricId === id).status, 'unknown', 'dimension ' + id + ' needs usable level/evidence');
    }
    await page.locator('#plan-water-source').selectOption('selected');
    await page.evaluate(() => CWR.setSurge(6, true));
    assert.equal((await current(page)).planeFtNAVD88, 4.52, 'explicit offline scenario remains useful');
  });

  await scenario('sentinel and boolean NOAA rows do not establish a future forecast', {waitForLive: false, forecastRows: [
    {t: coopsTime(now + 2 * 3600000), v: -9999},
    {t: coopsTime(now + 6 * 3600000), v: true},
    {t: coopsTime(now + 10 * 3600000), v: false},
  ]}, async page => {
    const plan = await current(page), impact = await projection(page);
    assert.equal(await page.evaluate(() => CWR.forecastWindow()), null);
    assert.notEqual(await page.evaluate(() => CWR.FEEDS.ofs.state), 'live');
    assert.equal(plan.levelFtMLLW, null);
    assert.equal(plan.planeFtNAVD88, null);
    assert.equal(plan.coverage.screenedCount, null);
    assert.equal(plan.forecastExposure.status, 'unknown');
    assert.equal(impact.levelFtMLLW, null);
    assert.equal(impact.directCount, null);
  });

  await scenario('numeric and string zero NOAA samples remain usable', {mutateInventory: reviewTerrain, forecastRows: [
    {t: coopsTime(now + 2 * 3600000), v: '0'},
    {t: coopsTime(now + 6 * 3600000), v: 0},
  ]}, async (page, inventory) => {
    const plan = await current(page);
    checkSharedEvidence(plan, await projection(page), expectedCounts(inventory, 'city', -1.48), 0, -1.48);
    assert.equal(plan.forecastExposure.samples.length, 2);
    assert.equal(await page.evaluate(() => CWR.forecastWindow().rows.length), 2);
    assert.equal(plan.coverage.screenedCount, 0, 'known zero exposure is distinct from unknown');
  });

  await scenario('elapsed NOAA peak is reselected consistently without a new download', {mutateInventory: reviewTerrain}, async (page, inventory) => {
    await page.evaluate(() => CWR.setPage('plan'));
    await page.locator('#check input[type="checkbox"]').first().check();
    assert.ok((await current(page)).acknowledgments.length > 0);
    await page.clock.setSystemTime(new Date(now + 7 * 3600000));
    await page.evaluate(() => {CWR.renderPlan(); CWR.renderProjectedImpact();});
    let plan = await current(page);
    checkSharedEvidence(plan, await projection(page), expectedCounts(inventory, 'city', 4.35), 5.83, 4.35);
    assert.equal(plan.forecastExposure.samples.length, 1);
    assert.deepEqual(plan.acknowledgments, []);
    await page.clock.setSystemTime(new Date(now + 11 * 3600000));
    await page.evaluate(() => {CWR.renderPlan(); CWR.renderProjectedImpact();});
    plan = await current(page);
    assert.equal(plan.levelFtMLLW, null);
    assert.equal(plan.coverage.screenedCount, null);
    assert.equal((await projection(page)).directCount, null);
    assert.equal(plan.forecastExposure.status, 'unknown');
  });

  await scenario('partial and zero terrain are distinguished in real review', {mutateInventory: inventory => {
    reviewTerrain(inventory);
    const city = inventory.stations.filter(station => station.isCityOwned);
    city[0].groundElevationFt = 0;
    city[1].groundElevationFt = null;
  }}, async (page, inventory) => {
    const expected = expectedCounts(inventory, 'city', 5.25), plan = await current(page);
    assert.equal(expected.known, expected.assets - 1);
    assert.equal(expected.unknown, 1);
    checkSharedEvidence(plan, await projection(page), expected, 6.73, 5.25);
    assert.ok(plan.metrics.every(metric => metric.status !== 'clear'), 'partial terrain cannot establish all-clear');
    await page.evaluate(() => CWR.setPage('plan'));
    assert.ok((await page.locator('#cwr-plan-summary').textContent()).includes(String(expected.known)));
    assert.match(await page.locator('#cwr-plan-summary').textContent(), /unknown|missing|partial/i);
    await page.evaluate(() => CWR.setPage('impact'));
    assert.match(await page.locator('#impact-station-review').textContent(), /unknown|missing|unavailable|not assess(?:able|ed)/i);
  });

  await scenario('real methods retain missing graph and uncalibrated thresholds', {}, async page => {
    const plan = await current(page);
    for (const id of [7, 10]) assert.equal(plan.metrics.find(metric => metric.metricId === id).status, 'unknown');
    for (const metric of plan.metrics) {
      assert.ok(typeof metric.threshold === 'string' && metric.threshold.length > 0, 'dimension ' + metric.metricId + ' must explain its review basis');
      assert.doesNotMatch(metric.threshold, /sub-optimal (?:above|below|at)|flow share exceeds station share by more than 8/i, 'real metrics must not inherit synthetic cutoffs');
      assert.ok(typeof metric.analyticalMitigation === 'string' && metric.analyticalMitigation.length > 0);
      assert.ok(typeof metric.method === 'string' && metric.method.length > 0, 'dimension ' + metric.metricId + ' must retain its actual method');
      for (const field of ['display', 'requiredInputs']) assert.ok(typeof metric[field] === 'string' && metric[field].length > 0, 'dimension ' + metric.metricId + ' must retain ' + field);
      assert.ok(Object.hasOwn(metric, 'unit'), 'dimension ' + metric.metricId + ' must export the unit field');
      if ([7, 10].includes(metric.metricId)) assert.equal(metric.unit, null, 'unidentified quantities must not invent a unit');
      else assert.ok(typeof metric.unit === 'string' && metric.unit.length > 0);
      assert.ok(typeof metric.operationalAction === 'string' && metric.operationalAction.length > 0);
    }
    await page.evaluate(() => CWR.setPage('plan'));
    await page.locator('#cwr-ten-register summary').click();
    assert.equal(await page.locator('[data-cwr-metric]').count(), 10);
    assert.match(await page.locator('[data-cwr-metric="7"]').textContent(), /graph|edges|dependenc/i);
    assert.match(await page.locator('[data-cwr-metric="10"]').textContent(), /graph|edges|flow|mobility/i);
    await page.locator('#cwr-operator-track').click();
    assert.match(await page.locator('[data-cwr-metric="7"]').textContent(), /operator|SOP/i);
  });

  await scenario('no-data sentinel and conflicting datum stay unknown in every panel', {mutateInventory: inventory => {
    reviewTerrain(inventory);
    const city = inventory.stations.filter(station => station.isCityOwned);
    city[0].groundElevationFt = 0;
    city[1].groundElevationFt = -9999;
    city[2].elevationVerticalDatum = 'NGVD29';
  }}, async (page, inventory) => {
    const expected = expectedCounts(inventory, 'city', 5.25), plan = await current(page);
    assert.equal(expected.unknown, 2);
    checkSharedEvidence(plan, await projection(page), expected, 6.73, 5.25);
    assert.equal(plan.stationResults.filter(station => station.screenStatus === 'unknown').length, 2);
    assert.ok(plan.metrics.every(metric => metric.status !== 'clear'));
  });

  await scenario('changed real evidence invalidates planning acknowledgments', {mutateInventory: reviewTerrain}, async page => {
    await page.evaluate(() => CWR.setPage('plan'));
    await page.locator('#check input[type="checkbox"]').first().check();
    assert.ok((await current(page)).acknowledgments.length > 0);
    await page.locator('#plan-data-scope').selectOption('all');
    assert.deepEqual((await current(page)).acknowledgments, []);
    await page.locator('#check input[type="checkbox"]').first().check();
    await page.locator('#plan-water-source').selectOption('selected');
    assert.deepEqual((await current(page)).acknowledgments, []);
    await page.locator('#check input[type="checkbox"]').first().check();
    await page.evaluate(() => CWR.setSurge(8, true));
    assert.deepEqual((await current(page)).acknowledgments, []);
    assert.match(await page.locator('#cwr-plan-revision').textContent(), /reset/);
  });

  await scenario('station review opens the same official record on the public map', {mutateInventory: reviewTerrain}, async page => {
    await page.evaluate(() => CWR.setPage('impact'));
    const record = page.locator('#impact-station-review [data-review-station]').first();
    const id = await record.getAttribute('data-review-station');
    await record.click();
    assert.equal(await page.evaluate(() => location.hash), '#inventory');
    assert.equal(await page.locator('#public-station-pick').inputValue(), id);
    assert.ok((await page.locator('#public-station-detail').textContent()).includes(id));
    await page.evaluate(() => CWR.setPage('plan'));
    const planningRecord = page.locator('#plan-station-summary [data-review-station]').first();
    const planningId = await planningRecord.getAttribute('data-review-station');
    await planningRecord.click();
    assert.equal(await page.locator('#public-station-pick').inputValue(), planningId);
  });

  await scenario('public map opens impact and plan with its real ownership scope', {mutateInventory: reviewTerrain}, async (page, inventory) => {
    const record = inventory.stations.find(station => !station.isCityOwned);
    assert.ok(record, 'fixture must contain an agency-published non-City record');
    await page.evaluate(() => CWR.setPage('inventory'));
    await page.locator('#public-ownership').selectOption('all');
    await page.locator('#public-station-pick').selectOption(record.id);
    await page.locator('#inventory-review-impact').click();
    assert.equal(await page.evaluate(() => location.hash), '#impact');
    assert.equal(await page.locator('#impact-scope').inputValue(), 'all');
    assert.equal(await page.locator('#plan-data-scope').inputValue(), 'all');
    assert.ok((await page.locator('#impact-station-review').textContent()).includes(record.id));
    checkSharedEvidence(await current(page), await projection(page), expectedCounts(inventory, 'all', 5.25), 6.73, 5.25);
    await page.evaluate(() => CWR.setPage('inventory'));
    assert.equal(await page.locator('#public-station-pick').inputValue(), record.id, 'selected public record must survive navigation');
    await page.locator('#inventory-review-plan').click();
    assert.equal(await page.evaluate(() => location.hash), '#plan');
    assert.equal((await current(page)).dataset, 'all');
    assert.ok((await current(page)).stationIds.includes(record.id));
    await page.evaluate(() => CWR.setPage('inventory'));
    await page.locator('#public-ownership').selectOption('city');
    await page.locator('#inventory-review-plan').click();
    assert.equal((await current(page)).dataset, 'city');
    assert.equal(await page.locator('#impact-scope').inputValue(), 'city');
  });

  await scenario('mobile real station review and plan remain usable', {mobile: true, mutateInventory: reviewTerrain}, async page => {
    for (const tab of ['impact', 'plan']) {
      await page.evaluate(value => CWR.setPage(value), tab);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tab + ': horizontal overflow');
    }
    assert.ok((await page.locator('#plan-data-scope').boundingBox()).width >= 240);
    assert.ok((await page.locator('#plan-station-summary [data-review-station]').first().boundingBox()).height >= 44, 'real-station navigation must have a usable touch target');
    if (process.env.COASTAL_REAL_QA) {
      await mkdir(process.env.COASTAL_REAL_QA, {recursive: true});
      await page.screenshot({path: process.env.COASTAL_REAL_QA + '/coastal-real-plan-mobile.png', fullPage: true});
      await page.locator('#plan-station-summary').screenshot({path: process.env.COASTAL_REAL_QA + '/coastal-real-plan-stations-mobile.png'});
      await page.evaluate(() => CWR.setPage('impact'));
      await page.screenshot({path: process.env.COASTAL_REAL_QA + '/coastal-real-impact-mobile.png', fullPage: true});
    }
  });
  console.log(passed + ' Coastal real-planning browser scenarios passed');
} finally {
  await browser.close();
}
