// The finder pages show the shared plan in plain words; every other console keeps its research terms and help.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url);
const origin = 'https://patrickiben.github.io/public-data-consoles/consoles/';
const RESEARCH = /parameter|proxy|diagnostic|topology|source\/sink|\blens|Wasserstein|Euler|Contiguity|AUC|Persistence|Variational|Free Energy|Contamination|Mobility Network|Spatial Mixing|Density Symmetry|Population Balance|Frontier Risk|Buffer Depth|INTERPRETIVE|MEASURED|MODELED|Required inputs|required inputs|Evidence needed|mitigation|observed\/reported|Observed \/ reported|evidence revision|Research-informed|Directed|Trigger \/|unqualified|telemetry|UNKNOWN|dimension|finite|Spillover|assessable|distribution|fitted|causal|\d{4}-\d{2}-\d{2}T\d{2}/;

const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });
async function open(slug) {
  const html = await readFile(new URL('consoles/' + slug + '/index.html', root), 'utf8');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/New_York' });
  await context.route('**/*', route => route.request().url() === origin + slug + '/'
    ? route.fulfill({ contentType: 'text/html', body: html })
    : route.fulfill({ status: 503, contentType: 'text/plain', body: 'Offline wording fixture' }));
  const page = await context.newPage();
  await page.goto(origin + slug + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('console-response')?.dataset.mounted && window.ConsoleResponse?.exportPlan());
  return { context, page };
}
const read = page => page.evaluate(() => {
  const panel = document.getElementById('console-response');
  panel.querySelectorAll('details').forEach(d => { d.open = true; });
  return { text: panel.innerText, labels: [...panel.querySelectorAll('[title],[aria-label]')].map(e => (e.getAttribute('title') || '') + ' ' + (e.getAttribute('aria-label') || '')).join('\n'), help: panel.querySelectorAll('[data-metric-help]').length, changes: panel.querySelectorAll('[data-cr-section="changes"]').length };
});

for (const slug of ['food-desert-oases', 'free-clinic-finder', 'public-bathroom-finder']) {
  const { context, page } = await open(slug);
  for (const track of ['public', 'operator']) {
    await page.evaluate(t => document.getElementById('cr-track-' + t).click(), track);
    await page.waitForFunction(t => document.getElementById('cr-track-' + t)?.getAttribute('aria-pressed') === 'true', track);
    const { text, labels, help, changes } = await read(page);
    const left = (text + '\n' + labels).split('\n').filter(line => RESEARCH.test(line));
    assert.deepEqual(left, [], slug + ' ' + track + ': research wording still shows');
    assert.equal(help, 0, slug + ': no research definitions behind a help button');
    assert.equal(changes, 0, slug + ': no evidence-revision comparison');
    assert.match(text, /#7 How access works/, slug + ': the ten parts are still there, by their plain names');
    assert.match(text, /The ten parts of this review/);
    assert.match(text, /What it would take to judge this:/, slug + ': the inputs are still listed once on each part');
    assert.match(text, /Unknown does not mean safe/, slug + ': the safety wording stays');
    assert.match(text, /Unknown does not mean clear; current official instructions take precedence/, slug + ': trimming the inputs keeps this caution');
    assert.match(text, /not official orders or medical advice/, slug + ': does not disclaim the emergency lines');
    assert.doesNotMatch(text, /Nothing is sent or saved/, slug + ': location does leave the browser when searching, so only check marks are promised');
  }
  // A repaint must not bring the old wording back.
  await page.evaluate(() => document.getElementById('cr-track-public').click());
  await page.waitForFunction(() => document.getElementById('cr-track-public')?.getAttribute('aria-pressed') === 'true');
  assert.doesNotMatch((await read(page)).text, RESEARCH, slug + ': after a repaint');
  // Only the display changes: the exported plan keeps its evidence and metric names.
  const exported = await page.evaluate(() => window.ConsoleResponse.exportPlan());
  assert.ok(exported.plan.diagnostics.some(d => d.canonicalLabel === 'Variational Free Energy'), slug + ': export unchanged');
  await context.close();
  console.log('PASS finder plain wording: ' + slug);
}
{
  const { context, page } = await open('nhs-scotland-strain');
  const { text, help } = await read(page);
  assert.match(text, /Variational Free Energy/, 'other consoles keep their research names');
  assert.match(text, /Research-informed diagnostics/, 'other consoles keep their labels');
  assert.ok(help > 0, 'other consoles keep their help');
  await context.close();
  console.log('PASS finder plain wording: other consoles keep their research terms');
}
await browser.close();
console.log('PASS 4 finder plain wording checks');
