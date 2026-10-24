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
// These are the actual planning links, not a ten-by-eight Cartesian product.
// The repeated dimensions must keep their own phase identity and explanation.
const coastalTimeline = [
  ['pre', [2, 5, 10]], ['t120', [4]], ['t72', [6, 8]], ['t48', [5, 6]],
  ['t24', [4, 9]], ['land', [9, 10]], ['post', [1, 9, 10]], ['rec', [1, 7]],
];
const coastalReasonPatterns = {
  'pre:2': /terrain contrast.*surveyed asset heights/i,
  'pre:5': /near-plane records early.*one-foot band/i,
  'pre:10': /dependency information takes time.*missing flow links/i,
  't120:4': /Early coordination.*geographic overview/i,
  't72:6': /Before narrowing.*additional public points.*two-foot/i,
  't72:8': /whole declared level range.*not.*seventy-two hours/i,
  't48:5': /resolving records.*selected plane/i,
  't48:6': /stations added.*two-foot.*finalized/i,
  't24:4': /official access.*cannot tell.*cut off/i,
  't24:9': /Before the event.*monitoring plan.*only screened points/i,
  'land:9': /During the event.*incoming reports/i,
  'land:10': /timestamped operating data.*unassessed/i,
  'post:1': /verified impacts.*communication coverage.*not.*customers/i,
  'post:9': /post-event reports.*not.*disruption/i,
  'post:10': /Restoration sequencing.*verification/i,
  'rec:1': /Recovery review.*resident footprints/i,
  'rec:7': /Recovery records.*VFE unassessed/i,
};
const coastalRow = (page, phase, id) => page.locator('#timeline [data-timeline-phase="' + phase + '"] [data-timeline-metric="' + id + '"]');
const coastalButton = (page, phase, id) => coastalRow(page, phase, id).locator('[data-metric-help="' + id + '"]');
const timelineReason = row => row.locator(':scope > p').evaluate(el => el.textContent.replace(/^Why now:\s*/, '').trim());
async function coastalPlan(page, {selected = true} = {}) {
  await page.evaluate(() => CWR.setPage('plan'));
  if (selected) await page.locator('#plan-water-source').selectOption('selected');
}
async function phaseHelp(page, phase, id, scopePattern, audiencePattern) {
  await shown(page, id, scopePattern);
  const row = coastalRow(page, phase, id), reason = await timelineReason(row);
  const heading = (await page.locator('#timeline [data-timeline-phase="' + phase + '"] h3').textContent())
    .replace(/Selected phase|Suggested phase/g, '').trim();
  const text = await popup(page).textContent();
  assert.ok(text.includes('Why at ' + heading + ': ' + reason), 'help belongs to ' + phase + '/#' + id + ' and repeats its visible reason');
  const button = coastalButton(page, phase, id);
  assert.equal(await button.getAttribute('data-metric-context-title'), 'Why at ' + heading);
  assert.ok((await button.getAttribute('aria-label')).includes('Why at ' + heading), 'assistive label identifies this phase too');
  if (audiencePattern) assert.match(text, audiencePattern);
  return text;
}
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

  await scenario('Coastal timeline: all seventeen links expose names, literal statuses and specific reasons', {slug: 'coastal-water-resilience'}, async page => {
    await coastalPlan(page);
    const plan = await page.evaluate(() => CWR.exportPlan());
    assert.equal(await page.locator('#timeline [data-timeline-phase]').count(), 8);
    assert.equal(await page.locator('#timeline [data-timeline-metric]').count(), 17);
    const reasons = [];
    for (const [phase, ids] of coastalTimeline) {
      const section = page.locator('#timeline [data-timeline-phase="' + phase + '"]');
      assert.equal(await section.isVisible(), true);
      assert.equal(await section.locator('[data-timeline-metric]').count(), ids.length);
      for (const id of ids) {
        const row = coastalRow(page, phase, id), metric = plan.metrics.find(metric => metric.metricId === id);
        assert.equal(await row.isVisible(), true);
        assert.equal(await row.locator('.cmh-term > span').textContent(), '#' + id + ' ' + metric.name, 'the full visible name, not a symbol-only pill');
        const expectedStatus = {unknown: 'Not assessable', review: 'Planning review', context: 'Descriptive context'}[metric.status];
        assert.equal(await row.locator('.timeline-status').textContent(), expectedStatus);
        const reason = await timelineReason(row);
        assert.match(reason, coastalReasonPatterns[phase + ':' + id]);
        assert.ok(reason.split(/\s+/).length >= 14 && reason.split(/\s+/).length <= 40, 'concise developed rationale for ' + phase + '/#' + id);
        reasons.push(reason);
      }
    }
    assert.equal(new Set(reasons).size, 17, 'each link explains its own planning decision');
    for (const phase of ['pre', 'land', 'post']) assert.equal(await coastalRow(page, phase, 10).locator('.timeline-status').textContent(), 'Not assessable');
    assert.equal(await coastalRow(page, 'rec', 7).locator('.timeline-status').textContent(), 'Not assessable');
    assert.equal(await page.locator('#timeline [data-timeline-metric="3"]').count(), 0, 'current mapping retained');
    assert.match(await page.locator('#timeline').textContent(), /Density Symmetry \(#3\).*across phases/);
    assert.match(await page.locator('#c-timeline').textContent(), /illustrative review windows, not forecast deadlines/);
    await proof(page, 'coastal-timeline-desktop');
  });

  await scenario('Coastal timeline: repeated frontier dimension has phase-scoped hover and keyboard explanations', {slug: 'coastal-water-resilience'}, async page => {
    await coastalPlan(page);
    const t24 = coastalRow(page, 't24', 9), land = coastalRow(page, 'land', 9), post = coastalRow(page, 'post', 9);
    const reasons = await Promise.all([t24, land, post].map(timelineReason));
    assert.equal(new Set(reasons).size, 3);
    assert.match(reasons[0], /Before the event.*monitoring plan/);
    assert.match(reasons[1], /During the event.*incoming reports/);
    assert.match(reasons[2], /post-event reports/);
    await t24.locator('[data-metric-term] > span').hover();
    await phaseHelp(page, 't24', 9, /Real public station planning screen/, /Public \/ local review:/);
    await popup(page).hover();
    await page.waitForTimeout(240);
    assert.equal(await popup(page).isVisible(), true, 'phase rationale stays readable when moving into help');
    await close(page);
    await page.mouse.move(0, 0);
    await coastalButton(page, 'land', 9).focus();
    await phaseHelp(page, 'land', 9, /Real public station planning screen/);
    await close(page);
    await coastalButton(page, 'post', 9).focus();
    await phaseHelp(page, 'post', 9, /Real public station planning screen/);
    assert.ok(!(await popup(page).textContent()).includes(reasons[0]), 'post-event help must not silently use the first #9 link');
    await close(page);
  });

  await scenario('Coastal timeline: keyboard refresh preserves the same phase and metric, without stealing later selections', {slug: 'coastal-water-resilience'}, async page => {
    await coastalPlan(page);
    await page.mouse.move(0, 0);
    await coastalButton(page, 'post', 9).focus();
    await phaseHelp(page, 'post', 9, /Real public station planning screen/);
    const before = await controlState(page, '#c-check');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.deepEqual(await page.evaluate(() => ({
      phase: document.activeElement.closest('[data-timeline-phase]')?.dataset.timelinePhase,
      metric: document.activeElement.dataset.metricHelp,
    })), {phase: 'post', metric: '9'}, 'refresh keeps repeated #9 in its own phase');
    await phaseHelp(page, 'post', 9, /Real public station planning screen/);
    assert.deepEqual(await controlState(page, '#c-check'), before);
    await close(page);
    await coastalButton(page, 'land', 10).focus();
    await page.evaluate(() => CWR.setSurge(CWR.state().surgeSel, true));
    assert.deepEqual(await page.evaluate(() => ({
      phase: document.activeElement.closest('[data-timeline-phase]')?.dataset.timelinePhase,
      metric: document.activeElement.dataset.metricHelp,
    })), {phase: 'land', metric: '10'}, 'same numbered metric in another phase must not win the replacement search');
    await phaseHelp(page, 'land', 10, /Currently not assessable/);
    await close(page);
    await page.locator('#plan-data-scope').focus();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'plan-data-scope', 'a later deliberate control selection stays focused');
  });

  await scenario('Coastal timeline: Escape dismissal survives stationary hover reentry and restores real movement and keyboard access', {slug: 'coastal-water-resilience'}, async page => {
    await coastalPlan(page);
    const term = coastalRow(page, 'post', 9).locator('[data-metric-term] > span');
    await term.hover();
    const box = await term.boundingBox(), point = {x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2)};
    await page.mouse.move(point.x, point.y);
    await coastalButton(page, 'post', 10).focus();
    await phaseHelp(page, 'post', 10, /Currently not assessable/);
    await close(page);
    // Hiding a tooltip can uncover a label beneath a stationary pointer. This
    // pointerover has unchanged coordinates; it must not undo Escape dismissal.
    await term.dispatchEvent('pointerover', {pointerType: 'mouse', clientX: point.x, clientY: point.y});
    assert.equal(await popup(page).isVisible(), false, 'stationary hover reentry must not reopen dismissed help');
    assert.equal(await coastalButton(page, 'post', 10).getAttribute('aria-expanded'), 'false');
    // A real movement inside the already-hovered label must restore hover even
    // if it does not cause a new pointerover or leave/re-enter the label.
    await page.mouse.move(point.x + 1, point.y);
    await phaseHelp(page, 'post', 9, /Real public station planning screen/);
    await close(page);
    await coastalButton(page, 'rec', 7).focus();
    await phaseHelp(page, 'rec', 7, /Currently not assessable/);
    await close(page);
    await coastalButton(page, 'post', 10).click();
    await phaseHelp(page, 'post', 10, /Currently not assessable/);
    await close(page);
  });

  await scenario('Coastal timeline: dataset and audience changes replace real unknowns with explicitly fictional criteria', {slug: 'coastal-water-resilience'}, async page => {
    await coastalPlan(page);
    await coastalButton(page, 'rec', 7).click();
    const realReason = await timelineReason(coastalRow(page, 'rec', 7));
    await phaseHelp(page, 'rec', 7, /Currently not assessable/, /Public \/ local review:/);
    const dataset = page.locator('#plan-data-scope');
    // selectOption alone does not move the pointer or focus like opening this
    // control. A layout change under the old metric pointer may legitimately
    // open newly scoped hover help, so model the actual control interaction.
    await dataset.hover();
    await dataset.focus();
    await dataset.selectOption('synthetic');
    await popup(page).waitFor({state: 'hidden'});
    // A post-render pointer event must describe the replacement dataset, not
    // retain the formerly pinned real/unknown explanation.
    await coastalRow(page, 'rec', 7).locator('[data-metric-term] > span').hover();
    const replacementHelp = await phaseHelp(page, 'rec', 7, /Fictional calibration exercise/, /Public \/ local review:/);
    assert.doesNotMatch(replacementHelp, /Real public station planning screen/);
    await close(page);
    const exercisePlan = await page.evaluate(() => CWR.exportPlan());
    assert.equal(await page.locator('#timeline [data-timeline-metric]').count(), 17);
    for (const [phase, ids] of coastalTimeline) for (const id of ids) {
      const metric = exercisePlan.metrics.find(metric => metric.metricId === id);
      assert.equal(await coastalRow(page, phase, id).locator('.timeline-status').textContent(), metric.status === 'unknown'
        ? 'Not assessable' : metric.status === 'triggered' ? 'Scenario criterion flagged' : 'Within scenario criterion');
    }
    assert.notEqual(await timelineReason(coastalRow(page, 'rec', 7)), realReason);
    await page.locator('#cwr-operator-track').click();
    await coastalButton(page, 'rec', 7).click();
    const exerciseHelp = await phaseHelp(page, 'rec', 7, /Fictional calibration exercise/, /Operator review:/);
    assert.match(exerciseHelp, /toy edges crossing fictional basin boundaries/);
    assert.doesNotMatch(exerciseHelp, /Public \/ local review:/);
    await close(page);
    await page.locator('#plan-data-scope').selectOption('all');
    assert.equal(await coastalRow(page, 'rec', 7).locator('.timeline-status').textContent(), 'Not assessable');
    assert.equal(await coastalRow(page, 'post', 10).locator('.timeline-status').textContent(), 'Not assessable');
    await coastalButton(page, 'post', 10).focus();
    const realHelp = await phaseHelp(page, 'post', 10, /Real public station planning screen/, /Operator review:/);
    assert.doesNotMatch(realHelp, /Fictional calibration exercise/);
    await close(page);
  });

  await scenario('Coastal timeline: unavailable forecast shows missing evidence rather than an all-clear', {slug: 'coastal-water-resilience'}, async page => {
    await coastalPlan(page, {selected: false});
    assert.equal(await page.locator('#plan-water-source').inputValue(), 'ofs');
    assert.equal(await coastalRow(page, 'pre', 5).locator('.timeline-status').textContent(), 'Not assessable');
    assert.equal(await coastalRow(page, 't72', 6).locator('.timeline-status').textContent(), 'Not assessable');
    assert.equal(await coastalRow(page, 't72', 8).locator('.timeline-status').textContent(), 'Descriptive context', 'whole-level-range integral does not substitute a current forecast');
    await coastalButton(page, 't72', 6).focus();
    await phaseHelp(page, 't72', 6, /Currently not assessable/);
    await close(page);
    await page.locator('#plan-water-source').selectOption('selected');
    assert.notEqual(await coastalRow(page, 't72', 6).locator('.timeline-status').textContent(), 'Not assessable', 'an explicit scenario supplies the missing level, without manufacturing a forecast');
    assert.equal(await coastalRow(page, 'pre', 10).locator('.timeline-status').textContent(), 'Not assessable');
  });

  await scenario('Coastal timeline: all seventeen tap targets and phase explanations fit 320px', {slug: 'coastal-water-resilience', width: 320, touch: true}, async page => {
    await coastalPlan(page);
    const before = await controlState(page, '#c-check');
    for (const [phase, ids] of coastalTimeline) for (const id of ids) {
      const row = coastalRow(page, phase, id), button = coastalButton(page, phase, id);
      await row.scrollIntoViewIfNeeded();
      const rowBox = await row.boundingBox(), box = await button.boundingBox();
      assert.ok(rowBox.x >= -1 && rowBox.x + rowBox.width <= 321, 'phase card stays within the narrow viewport');
      assert.ok(box.width >= 44 && box.height >= 44, 'timeline touch help target is at least 44px');
      await button.tap();
      try {
        await popup(page).waitFor({state: 'visible', timeout: 2000});
      } catch (error) {
        await proof(page, 'coastal-timeline-failed-' + phase + '-' + id);
        throw new Error('Tap did not open help for ' + phase + '/#' + id + ': ' + JSON.stringify(await button.evaluate(button => ({
          top: button.getBoundingClientRect().top, bottom: button.getBoundingClientRect().bottom,
          expanded: button.getAttribute('aria-expanded'), focused: document.activeElement === button,
          scrollY, viewport: innerHeight,
        }))), {cause: error});
      }
      await phaseHelp(page, phase, id, /Real public station planning screen/);
      const trigger = await button.boundingBox(), tipBox = await popup(page).boundingBox();
      assert.ok(tipBox.y + tipBox.height <= trigger.y - 7 || tipBox.y >= trigger.y + trigger.height + 7,
        'long help must stay clear of its trigger during a touch click: ' + JSON.stringify({phase, id, trigger, tipBox}));
      if (phase === 'pre' && id === 2) {
        await button.tap();
        await popup(page).waitFor({state: 'hidden'});
        assert.equal(await button.getAttribute('aria-expanded'), 'false', 'second tap closes the pinned explanation');
        await button.tap();
        await phaseHelp(page, phase, id, /Real public station planning screen/);
      }
      assert.deepEqual(await controlState(page, '#c-check'), before, 'timeline help must not alter planning inputs or acknowledgments');
      if (phase === 'post' && id === 9) await proof(page, 'coastal-timeline-320');
      await close(page);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'timeline and tooltip create no horizontal page overflow');
    await page.locator('#plan-data-scope').selectOption('synthetic');
    await coastalButton(page, 'land', 9).tap();
    await phaseHelp(page, 'land', 9, /Fictional calibration exercise/);
    await close(page);
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
