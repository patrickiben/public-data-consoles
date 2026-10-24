// Exercise the shipped response layer; no core/helper/adapter script is injected.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('response-plans/manifest.json', root), 'utf8'));
const browser = await chromium.launch({headless: true, ...(process.env.CHROME_CHANNEL ? {channel: process.env.CHROME_CHANNEL} : {})});
const only = process.argv.find(value => value.startsWith('--case='))?.slice(7);
let passed = 0;
const phases = {verify: 'Verify inputs', prepare: 'Prepare options', respond: 'Review the response', review: 'Review and follow up'};
const popup = page => page.locator('#console-metric-tooltip');
const action = (page, id) => page.locator('[data-cr-action="' + id + '"]');
const metricButton = (page, id, n) => action(page, id).locator('[data-cr-action-metric="' + n + '"] [data-metric-help="' + n + '"]');
const controls = page => page.locator('#console-response').evaluate(host => ({
  details: [...host.querySelectorAll('details')].map(el => [el.dataset.crSection, el.open]),
  checks: [...host.querySelectorAll('input[type="checkbox"]')].map(el => [el.id, el.checked]),
  selects: [...host.querySelectorAll('select')].map(el => [el.id, el.value]),
}));
async function open(page, followup = false) {
  await page.locator('#console-response-shortcut').click();
  assert.equal(await page.locator('[data-cr-section="actions"]').getAttribute('open'), '');
  if (followup) await page.locator('[data-cr-section="followup"]').evaluate(el => { el.open = true; });
}
async function proof(page, name) {
  if (!process.env.ACTION_CONTEXT_PROOF) return;
  await mkdir(process.env.ACTION_CONTEXT_PROOF, {recursive: true});
  await page.screenshot({path: process.env.ACTION_CONTEXT_PROOF + '/' + name + '.png'});
}
async function shown(page, n, pattern) {
  const tip = popup(page);
  await tip.waitFor({state: 'visible'});
  await page.waitForFunction(n => document.querySelector('#console-metric-tooltip strong')?.textContent.startsWith('#' + n + ' '), n);
  assert.equal(await tip.getAttribute('role'), 'tooltip');
  assert.equal(await page.locator('#console-metric-tooltip').count(), 1);
  if (pattern) assert.match(await tip.textContent(), pattern);
  const box = await tip.boundingBox(), viewport = page.viewportSize();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'help fits viewport: ' + JSON.stringify({box, viewport}));
}
async function scenario(name, {slug = 'nhs-scotland-strain', width = 1280, touch = false} = {}, verify) {
  if (only && !name.includes(only)) return;
  const path = 'consoles/' + slug + '/index.html', html = await readFile(new URL(path, root), 'utf8');
  const captures = [...html.matchAll(/["']capturedAt["']\s*:\s*["']([^"']+)/g)].map(match => Date.parse(match[1])).filter(Number.isFinite);
  const now = Math.max(Date.now(), ...captures) + 3600000;
  const context = await browser.newContext({viewport: {width, height: 900}, hasTouch: touch, serviceWorkers: 'block'});
  const origin = 'https://action-context-fixture.invalid/' + path;
  try {
    await context.route('**/*', route => route.request().url() === origin
      ? route.fulfill({contentType: 'text/html', body: html})
      : route.fulfill({status: 503, contentType: 'text/plain', body: 'Offline action-context fixture'}));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({time: new Date(now)});
    await page.goto(origin, {waitUntil: 'load'});
    await page.waitForFunction(slug => window.ConsoleResponse?.exportPlan().plan.slug === slug, slug);
    assert.equal(await page.evaluate(() => typeof ConsoleResponse.actionContext?.forMetric), 'function', 'actual embedded action-context helper');
    await verify(page, now);
    assert.deepEqual(errors, [], name + ': native page errors');
    passed++; console.log('PASS action context: ' + name);
  } finally { await context.close(); }
}
async function assertRendered(page) {
  let last;
  for (const track of ['public', 'operator']) {
    await page.locator('#cr-track-' + track).click();
    // Capture one renderer/evidence revision synchronously: native feed failure
    // callbacks may legitimately update the plan while this test is running.
    const snapshot = await page.evaluate(() => ({
      plan: ConsoleResponse.exportPlan().plan,
      articles: [...document.querySelectorAll('#console-response [data-cr-action]')].map(el => ({
        id: el.dataset.crAction,
        basis: el.querySelectorAll('[data-cr-decision-basis]').length,
        links: [...el.querySelectorAll('.cr-parameter-links [data-cr-action-metric]')].map(row => ({
          metricId: Number(row.dataset.crActionMetric), text: row.textContent,
          contextTitle: row.querySelector('[data-metric-help]')?.dataset.metricContextTitle,
          inputs: row.querySelectorAll('[data-metric-term] input').length,
        })),
      })),
    }));
    const plan = snapshot.plan, diagnostics = new Map(plan.diagnostics.map(d => [d.id, d]));
    last = plan;
    for (const a of plan.actions) {
      const canonical = a.diagnosticIds.map(id => diagnostics.get(id)).filter(d => d?.metricId).map(d => d.metricId);
      assert.deepEqual(a.parameterLinks.map(link => link.metricId).sort((a, b) => a - b), [...new Set(canonical)].sort((a, b) => a - b), plan.slug + ': exact diagnostic/action mapping for ' + a.id);
      for (const link of a.parameterLinks) {
        assert.ok(link.why.trim().length >= 35 && link.whyNow.trim().length >= 35, a.id + ': separate substantive purpose/stage explanations');
        assert.ok(!/\b(?:fallback copy|authoring workflow|newly added|placeholder|Cartesian product)\b/i.test(link.why + link.whyNow), a.id + ': reader-facing explanation');
      }
      if (a.featured && !canonical.length) assert.ok(a.decisionBasis?.trim(), a.id + ': direct-record basis remains explicit');
    }
    const selected = plan.actions.filter(a => a.track === track && a.selected);
    for (const a of selected) {
      const matches = snapshot.articles.filter(row => row.id === a.id);
      assert.equal(matches.length, 1, plan.slug + ': selected action rendered once: ' + a.id);
      const article = matches[0];
      assert.equal(article.links.length, a.parameterLinks.length);
      if (a.featured && !a.parameterLinks.length) assert.equal(article.basis, 1);
      for (const link of a.parameterLinks) {
        const d = plan.diagnostics.find(d => d.metricId === link.metricId), rows = article.links.filter(row => row.metricId === link.metricId);
        assert.equal(rows.length, 1); const row = rows[0];
        assert.ok(row.text.includes(d.canonicalLabel), plan.slug + ': full canonical name stays visible');
        assert.ok(row.text.includes(link.why) && row.text.includes(link.whyNow), plan.slug + ': visible explanations equal export');
        assert.match(row.text, /Why this parameter:/); assert.match(row.text, /Why at this stage:/);
        assert.equal(row.contextTitle, 'Why at this stage: ' + phases[a.phase]);
        assert.equal(row.inputs, 0, 'help is separate from acknowledgments');
        if (d.status === 'unknown') assert.match(row.text, /Not assessable/);
      }
    }
    assert.equal(snapshot.articles.reduce((sum, a) => sum + a.links.length, 0), selected.reduce((sum, a) => sum + a.parameterLinks.length, 0));
  }
  return last;
}
const gridPayload = now => {
  const at = new Date(now - 3600000).toISOString(), checkedAt = new Date(now).toISOString();
  const fact = (id, value, basis = 'measured') => ({id, label: id, value, unit: 'MW', basis, quality: 'current', measuredAt: at, checkedAt, source: 'https://www.eia.gov/electricity/gridmonitor/'});
  return {slug: 'us-grid-strain', selectionKey: 'fixture-BA-A', title: 'Matched-hour public-report fixture', context: 'BA A · matched public hour',
    evidence: [fact('demand-A', 100), fact('forecast-A', 95, 'modeled'), fact('gap-A', 5, 'interpretive'), fact('interchange-A', -10)],
    diagnostics: [{id: 'metric-5', metricId: 5, label: 'Matched-hour demand forecast difference', status: 'triggered', scope: 'planning', value: 5, unit: 'MW', evidenceIds: ['gap-A', 'demand-A', 'forecast-A'], rule: 'Review a nonzero matched-hour difference; this is not a shortage threshold.', requiredInputs: ['Current actual and day-ahead forecast for exactly the same hour'], analyticalMitigation: 'Verify the report hour and revisions before operational interpretation.'}],
    actions: [], limitations: ['No reserves, capacity shortfall or outage is established.']};
};
try {
  for (const entry of manifest.consoles.filter(entry => !entry.native)) await scenario('all31 mapping: ' + entry.slug, {slug: entry.slug}, async page => {
    await open(page); const plan = await assertRendered(page);
    assert.equal(plan.diagnostics.filter(d => d.metricId).length, 10);
  });
  await scenario('NHS: source-driven workload priorities and ten parameter follow-ups stay distinct', {}, async page => {
    await open(page);
    const plan = await page.evaluate(() => ConsoleResponse.exportPlan().plan), featured = plan.actions.filter(a => a.featured && a.selected && a.track === 'public');
    assert.ok(featured.length >= 2);
    for (const a of featured) { assert.deepEqual(a.parameterLinks, []); assert.match(await action(page, a.id).locator('[data-cr-decision-basis]').textContent(), /public record|source gap/); }
    await page.locator('[data-cr-section="diagnostics"]').evaluate(el => { el.open = true; });
    for (let n = 1; n <= 10; n++) {
      const card = page.locator('[data-cr-metric="' + n + '"]');
      assert.ok(await card.locator('.cr-parameter-actions').count(), 'NHS metric' + n + ': explicit action/stage relationship');
      assert.match(await card.locator('.cr-parameter-actions').textContent(), /Why this parameter:.*Why at this stage:/s);
    }
    await proof(page, 'nhs-desktop-actions');
  });
  await scenario('NHS: action help preserves acknowledgments, detail state and focused owner on refresh', {}, async page => {
    await open(page, true);
    const plan = await page.evaluate(() => ConsoleResponse.exportPlan().plan), a = plan.actions.find(a => a.selected && a.track === 'public' && a.parameterLinks.some(l => l.metricId === 7));
    assert.ok(a, 'unknown VFE input gap is an explicit Verify action');
    const button = metricButton(page, a.id, 7), ack = action(page, a.id).locator('[data-cr-ack]');
    await ack.check(); const before = await controls(page);
    await button.focus(); await shown(page, 7, /Why at this stage: Verify inputs/);
    const text = await popup(page).textContent(), link = a.parameterLinks[0];
    assert.ok(text.includes(a.title) && text.includes(link.why) && text.includes(link.whyNow));
    await button.click(); assert.deepEqual(await controls(page), before);
    await proof(page, 'nhs-desktop-parameter-stage-help');
    await page.keyboard.press('Escape'); await popup(page).waitFor({state: 'hidden'});
    await button.focus();
    await page.evaluate(() => { SNAP.sources.find(s => s.id === 'ae').retrievedAt = new Date(Date.now()).toISOString(); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.metricHelp), '7');
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-cr-action]')?.dataset.crAction), a.id);
    assert.deepEqual(await controls(page), before);
    await page.locator('#console-response-title').click(); await popup(page).waitFor({state: 'hidden'});
  });
  await scenario('NHS: cross-track explanations use the current action after rerender', {}, async page => {
    await open(page, true);
    const plan = await page.evaluate(() => ConsoleResponse.exportPlan().plan);
    const get = track => plan.actions.find(a => a.selected && a.track === track && a.parameterLinks.some(l => l.metricId === 3));
    const p = get('public'), o = get('operator'); assert.ok(p && o);
    await metricButton(page, p.id, 3).click(); await shown(page, 3);
    await page.locator('#cr-track-operator').click(); await popup(page).waitFor({state: 'hidden'});
    assert.equal(await action(page, p.id).count(), 0);
    await metricButton(page, o.id, 3).focus(); await shown(page, 3);
    const text = await popup(page).textContent();
    assert.ok(text.includes(o.parameterLinks[0].whyNow));
    assert.equal(await metricButton(page, o.id, 3).getAttribute('data-metric-context-title'), 'Why at this stage: ' + phases[o.phase]);
    await page.keyboard.press('Escape'); await popup(page).waitFor({state: 'hidden'});
  });
  await scenario('NHS: self-reported review keeps an unknown machine dimension explicit', {}, async page => {
    await open(page, true); await page.locator('#cr-track-operator').click();
    await page.locator('[data-cr-section="diagnostics"]').evaluate(el => { el.open = true; });
    await page.locator('#cr-assess-7').selectOption('review');
    const exported = await page.evaluate(() => ConsoleResponse.exportPlan());
    assert.equal(exported.plan.diagnostics.find(d => d.metricId === 7).status, 'unknown');
    const a = exported.plan.actions.find(a => a.id === 'manual-review-7');
    assert.ok(a.selected && a.selfReported); assert.deepEqual(a.parameterLinks.map(l => l.metricId), [7]);
    assert.match(await action(page, a.id).textContent(), /SELF-REPORTED.*Not assessable/s);
    await metricButton(page, a.id, 7).focus(); await shown(page, 7, /Why at this stage: Verify inputs/);
    assert.ok((await popup(page).textContent()).includes(a.parameterLinks[0].whyNow));
    await page.keyboard.press('Escape');
  });
  for (const width of [390, 320]) await scenario('NHS: mobile tap and keyboard action help at ' + width, {width, touch: true}, async page => {
    await open(page, true);
    const plan = await page.evaluate(() => ConsoleResponse.exportPlan().plan), a = plan.actions.find(a => a.selected && a.track === 'public' && a.parameterLinks.length);
    const link = a.parameterLinks[0], button = metricButton(page, a.id, link.metricId), before = await controls(page);
    await button.tap(); await shown(page, link.metricId, /Why at this stage:/);
    assert.deepEqual(await controls(page), before);
    await proof(page, 'nhs-mobile' + width + '-action-help');
    await page.keyboard.press('Escape'); await popup(page).waitFor({state: 'hidden'});
    await button.focus(); await page.keyboard.press('Enter'); await shown(page, link.metricId);
    await page.locator('#console-response-title').tap(); await popup(page).waitFor({state: 'hidden'});
    const bounds = await page.locator('#console-response').boundingBox();
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, 'response card fits mobile viewport');
  });
  await scenario('grid: adaptation meaning, stale status and expiry remain honest', {slug: 'us-grid-strain', width: 390, touch: true}, async (page, now) => {
    // Let the native published-data check and its 80ms observer debounce finish
    // before installing controlled public facts; otherwise its legitimate
    // last-good repaint can replace this fixture during the first tap.
    await page.waitForFunction(() => !publicRequest && !document.querySelector('#public-check-status').textContent.startsWith('Checking'));
    await page.clock.runFor(150);
    const data = gridPayload(now); await page.evaluate(data => ConsoleResponse.set(data), data); await open(page);
    const plan = await page.evaluate(() => ConsoleResponse.exportPlan().plan), gap = plan.actions.find(a => a.featured && a.selected && a.track === 'public' && a.id.includes('grid-gap'));
    assert.ok(gap); assert.deepEqual(gap.parameterLinks.map(l => l.metricId), [5]);
    const row = action(page, gap.id).locator('[data-cr-action-metric="5"]');
    assert.match(await row.textContent(), /same-hour forecast.*not an emergency/s);
    await metricButton(page, gap.id, 5).tap(); await shown(page, 5, /same-hour forecast.*not an emergency/s);
    await proof(page, 'grid-mobile-forecast-review');
    await page.keyboard.press('Escape');
    const stale = structuredClone(data); stale.evidence.forEach(f => { f.quality = 'stale'; });
    await page.evaluate(data => ConsoleResponse.set(data), stale);
    assert.ok(!(await page.evaluate(() => ConsoleResponse.exportPlan().plan.actions)).some(a => a.featured && a.selected && a.requiresCurrent));
    const d = await page.evaluate(() => ConsoleResponse.exportPlan().plan.diagnostics.find(d => d.metricId === 5)); assert.equal(d.status, 'unknown'); assert.equal(d.value, null);
    await page.evaluate(data => ConsoleResponse.set(data), data);
    await page.clock.setSystemTime(now + 75 * 3600000); await page.evaluate(data => ConsoleResponse.set(data), data);
    assert.ok(!(await page.evaluate(() => ConsoleResponse.exportPlan().plan.actions)).some(a => a.featured && a.selected && a.requiresCurrent), 'unchanged raw evidence does not retain expired current priorities');
  });
  console.log('PASS ' + passed + ' action-context browser groups');
} finally { await browser.close(); }
