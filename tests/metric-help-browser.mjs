// Exercise the shipped HTML, with all external data/CDN/tile requests blocked.
// No helper or response script is injected by this test.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const root = new URL('../', import.meta.url);
const browser = await chromium.launch({headless: true, ...(process.env.CHROME_CHANNEL ? {channel: process.env.CHROME_CHANNEL} : {})});
let passed = 0;
const only = process.argv.find(arg => arg.startsWith('--case='))?.slice('--case='.length);

async function scenario(name, {slug = 'nhs-scotland-strain', width = 1280, touch = false, guide = false} = {}, verify) {
  if (only && !name.includes(only)) return;
  const path = guide ? 'response-plans/guide.html' : 'consoles/' + slug + '/index.html';
  const html = await readFile(new URL(path, root), 'utf8');
  const origin = 'https://metric-help-fixture.invalid/' + path;
  const captures = [...html.matchAll(/["']capturedAt["']\s*:\s*["']([^"']+)/g)].map(match => Date.parse(match[1])).filter(Number.isFinite);
  const now = Math.max(Date.now(), ...captures) + 3600000;
  const context = await browser.newContext({viewport: {width, height: 900}, hasTouch: touch, serviceWorkers: 'block'});
  const errors = [];
  try {
    await context.route('**/*', route => route.request().url() === origin
      ? route.fulfill({contentType: 'text/html', body: html})
      : route.fulfill({status: 503, contentType: 'text/plain', body: 'Offline metric-help fixture'}));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({time: new Date(now)});
    await page.goto(origin, {waitUntil: 'load'});
    await page.waitForFunction(() => window.ConsoleMetricHelp && document.querySelector('#console-metric-tooltip'));
    if (!guide) {
      if (slug === 'coastal-water-resilience') await page.waitForFunction(() => window.CWR && Object.values(CWR.FEEDS).every(feed => feed.state !== 'loading'));
      else await page.waitForFunction(slug => window.ConsoleResponse?.exportPlan().plan.slug === slug, slug);
    }
    await verify(page);
    assert.deepEqual(errors, [], name + ': page errors');
    passed++;
    console.log('PASS metric help: ' + name);
  } finally {
    await context.close();
  }
}

const popup = page => page.locator('#console-metric-tooltip');
async function shown(page, id, contextPattern) {
  const tip = popup(page);
  await tip.waitFor({state: 'visible'});
  await page.waitForFunction(id => document.querySelector('#console-metric-tooltip strong')?.textContent.startsWith('#' + id + ' '), id, {timeout: 3000});
  assert.equal(await page.locator('#console-metric-tooltip').count(), 1, 'one shared tooltip per page');
  assert.equal(await tip.getAttribute('role'), 'tooltip');
  assert.match(await tip.locator('strong').textContent(), new RegExp('^#' + id + ' '));
  assert.ok((await tip.locator('p').first().textContent()).length >= 60, 'a useful explanation, not a repeated title');
  if (contextPattern) assert.match(await tip.textContent(), contextPattern);
  const box = await tip.boundingBox(), viewport = page.viewportSize();
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
    'tooltip fits viewport: ' + JSON.stringify({box, viewport}));
}
async function close(page) {
  await page.keyboard.press('Escape');
  await popup(page).waitFor({state: 'hidden'});
}
async function sharedDetail(page) {
  await page.locator('#console-response-shortcut').click();
  await page.locator('[data-cr-section="diagnostics"] > summary').click();
  assert.equal(await page.locator('[data-cr-metric]').count(), 10);
}
const controlState = (page, selector) => page.locator(selector).evaluate(host => ({
  details: [...host.querySelectorAll('details')].map(el => [el.id || el.dataset.crSection || el.dataset.n, el.open]),
  checked: [...host.querySelectorAll('input[type="checkbox"]')].map(el => [el.id, el.checked]),
  selects: [...host.querySelectorAll('select')].map(el => [el.id, el.value]),
}));
async function proof(page, name) {
  if (!process.env.METRIC_HELP_PROOF) return;
  await mkdir(process.env.METRIC_HELP_PROOF, {recursive: true});
  await page.screenshot({path: process.env.METRIC_HELP_PROOF + '/' + name + '.png'});
}

try {
  await scenario('shared NHS: all ten labels explain the current domain view', {}, async page => {
    await sharedDetail(page);
    for (let id = 1; id <= 10; id++) {
      const button = page.locator('[data-cr-metric="' + id + '"] [data-metric-help="' + id + '"]');
      assert.equal(await button.count(), 1);
      await button.focus();
      await shown(page, id, /In this view:/);
      assert.equal(await button.getAttribute('aria-expanded'), 'true');
      assert.equal(await button.getAttribute('aria-describedby'), 'console-metric-tooltip');
      await close(page);
      assert.equal(await button.getAttribute('aria-expanded'), 'false');
      assert.equal(await button.getAttribute('aria-describedby'), null);
    }
  });

  await scenario('shared NHS: label-wide hover and hoverable explanation text', {}, async page => {
    await sharedDetail(page);
    const term = page.locator('[data-cr-metric="2"] [data-metric-term]');
    await term.locator(':scope > span').hover();
    await shown(page, 2);
    await popup(page).hover();
    await page.waitForTimeout(240); // Beyond the documented 160ms leave grace.
    assert.equal(await popup(page).isVisible(), true, 'moving onto explanation text keeps it readable');
    await page.mouse.move(0, 0);
    await popup(page).waitFor({state: 'hidden'});
  });

  await scenario('shared NHS: a scroll-induced pointer event cannot replace focused or pinned help', {}, async page => {
    await sharedDetail(page);
    const focused = page.locator('[data-cr-metric="3"] [data-metric-help="3"]');
    const other = page.locator('[data-cr-metric="4"] [data-metric-term] > span');
    await focused.focus();
    await shown(page, 3);
    // Layout/keyboard scrolling can synthesize pointerover under an unmoved
    // pointer. The keyboard owner's explanation must not silently change.
    await other.dispatchEvent('pointerover', {pointerType: 'mouse'});
    await shown(page, 3);
    await focused.click();
    await other.dispatchEvent('pointerover', {pointerType: 'mouse'});
    await shown(page, 3);
    await close(page);
  });

  await scenario('shared NHS: help preserves review checks, open sections and keyboard focus after refresh', {}, async page => {
    await sharedDetail(page);
    const ack = page.locator('[data-cr-ack]').first();
    await ack.check();
    const before = await controlState(page, '#console-response');
    const button = page.locator('[data-cr-metric="7"] [data-metric-help="7"]');
    await button.click();
    await shown(page, 7, /In this view:/);
    assert.deepEqual(await controlState(page, '#console-response'), before, 'help does not toggle acknowledgments or collapse controls');
    await close(page);
    await button.focus();
    // Source-check updates can re-render the panel; its focus owner must remain
    // the same metric, even when every metric uses the same visible ? glyph.
    await page.evaluate(() => {
      SNAP.sources.find(source => source.id === 'ae').retrievedAt = new Date(Date.now()).toISOString();
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => document.activeElement.dataset.metricHelp), '7');
    assert.deepEqual(await controlState(page, '#console-response'), before);
    await page.locator('#console-response-title').click();
    await popup(page).waitFor({state: 'hidden'});
  });

  for (const width of [390, 320]) await scenario('shared NHS: tap help stays inside ' + width + 'px viewport', {width, touch: true}, async page => {
    await sharedDetail(page);
    const before = await controlState(page, '#console-response');
    for (let id = 1; id <= 10; id++) {
      const button = page.locator('[data-cr-metric="' + id + '"] [data-metric-help="' + id + '"]');
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, 'touch help target is at least 44px');
      await button.tap();
      await shown(page, id, /In this view:/);
      assert.deepEqual(await controlState(page, '#console-response'), before);
      if (id === 9) await proof(page, 'nhs-' + width);
      await close(page);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'help does not create horizontal page overflow');
    const button = page.locator('[data-cr-metric="1"] [data-metric-help="1"]');
    await button.tap();
    await shown(page, 1);
    await page.locator('#console-response-title').tap();
    await popup(page).waitFor({state: 'hidden'});
  });

  await scenario('Coastal exercise: ten summary labels explain without expanding their rows', {slug: 'coastal-water-resilience'}, async page => {
    await page.evaluate(() => CWR.setPage('exercise'));
    assert.equal(await page.locator('#tm details.tm').count(), 10);
    for (let id = 1; id <= 10; id++) {
      const row = page.locator('#tm details.tm[data-n="' + id + '"]'), before = await row.getAttribute('open');
      const button = row.locator('summary [data-metric-help="' + id + '"]');
      await button.click();
      await shown(page, id, /Fictional calibration exercise/);
      assert.equal(await row.getAttribute('open'), before, 'help button must not toggle native details row');
      if (id === 2) await proof(page, 'coastal-exercise-desktop');
      await close(page);
    }
    const first = page.locator('#tm details.tm[data-n="1"]');
    await first.locator('[data-metric-term] > span').hover();
    await shown(page, 1);
    await close(page);
    await first.locator('summary .n').click();
    assert.equal(await first.getAttribute('open'), '', 'ordinary summary interaction still expands the row');
  });

  await scenario('Coastal real planning: ten domain explanations and checklist help preserve acknowledgments', {slug: 'coastal-water-resilience'}, async page => {
    await page.evaluate(() => CWR.setPage('plan'));
    assert.equal(await page.locator('#plan-data-scope').inputValue(), 'city');
    await page.locator('#cwr-ten-register > summary').click();
    const ack = page.locator('#check input[type="checkbox"]').first();
    await ack.check();
    const before = await controlState(page, '#c-check');
    await page.mouse.move(0, 0);
    for (let id = 1; id <= 10; id++) {
      const button = page.locator('[data-cwr-metric="' + id + '"] [data-metric-help="' + id + '"]');
      if (id === 1) await button.focus();
      else await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.metricHelp), String(id));
      await shown(page, id, /Real public station planning screen/);
      await close(page);
    }
    const checklistHelp = page.locator('#check .chk [data-metric-help]').first();
    const id = Number(await checklistHelp.getAttribute('data-metric-help'));
    await checklistHelp.click();
    await shown(page, id, /Real public station planning screen/);
    assert.deepEqual(await controlState(page, '#c-check'), before, 'native checklist help must not activate an associated checkbox or collapse register');
    await close(page);
    assert.equal(await ack.isChecked(), true);
  });

  await scenario('Coastal mobile: real and fictional help remains scoped and does not toggle controls', {slug: 'coastal-water-resilience', width: 320, touch: true}, async page => {
    await page.evaluate(() => CWR.setPage('exercise'));
    const exercise = page.locator('#tm details.tm[data-n="9"]'), exerciseButton = exercise.locator('[data-metric-help="9"]');
    await exerciseButton.tap();
    await shown(page, 9, /Fictional calibration exercise/);
    assert.equal(await exercise.getAttribute('open'), null);
    await proof(page, 'coastal-exercise-320');
    await close(page);
    await page.evaluate(() => CWR.setPage('plan'));
    await page.locator('#cwr-ten-register > summary').click();
    const before = await controlState(page, '#c-check');
    await page.locator('[data-cwr-metric="10"] [data-metric-help="10"]').tap();
    await shown(page, 10, /Real public station planning screen/);
    assert.deepEqual(await controlState(page, '#c-check'), before);
    await proof(page, 'coastal-real-320');
    await page.locator('#cwr-plan-revision').tap();
    await popup(page).waitFor({state: 'hidden'});
  });

  await scenario('standalone field guide: all ten names have keyboard and narrow-screen help', {guide: true, width: 320, touch: true}, async page => {
    assert.equal(await page.locator('[data-metric-name]').count(), 10);
    for (let id = 1; id <= 10; id++) {
      const button = page.locator('[data-metric-name="' + id + '"] [data-metric-help="' + id + '"]');
      await button.focus();
      await shown(page, id);
      await close(page);
    }
    await page.locator('[data-metric-name="7"] [data-metric-help="7"]').tap();
    await shown(page, 7, /BIC/);
    await proof(page, 'guide-320');
  });
  console.log('PASS ' + passed + ' actual-page metric-help browser groups');
} finally {
  await browser.close();
}
