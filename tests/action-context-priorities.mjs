// Pure real-payload-shaped regressions for explanatory action metadata.
// These fields must explain existing decisions without changing eligibility.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const core = await read('response-plans/core.js');
const sources = await Promise.all(['hazards', 'health', 'tools'].map(name => read('response-plans/priorities/' + name + '.js')));
const manifest = JSON.parse(await read('response-plans/manifest.json'));
const NOW = Date.parse('2026-10-24T12:00:00Z'), HOUR = 3600000;
let clock = NOW;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
const plain = value => JSON.parse(JSON.stringify(value));
const omitContext = value => { const out = {...value}; delete out.parameterLinks; delete out.decisionBasis; return out; };
function runtime(strip = false) {
  const c = vm.createContext({Date: Clock, URL}); c.window = c;
  vm.runInContext(core, c);
  const handlers = new Map(), register = c.ConsoleResponse.registerPrioritizer;
  c.ConsoleResponse.registerPrioritizer = (slug, derive) => {
    handlers.set(slug, derive);
    register(slug, input => {
      const rows = derive(input);
      return strip ? rows.map(omitContext) : rows;
    });
  };
  for (const source of sources) vm.runInContext(source, c);
  return {handlers, evaluate: input => plain(c.ConsoleResponse.evaluate(input))};
}
const active = runtime(), stripped = runtime(true);
const fact = (id, value, options = {}) => ({id, label: id, value, unit: 'MW',
  measuredAt: '2026-10-24T11:00:00Z', checkedAt: '2026-10-24T12:00:00Z',
  quality: 'current', basis: 'measured', source: 'https://www.eia.gov/electricity/gridmonitor/', ...options});
const input = (slug, evidence = []) => ({slug, context: 'Public selection A', evidence, diagnostics: [], actions: [], impacts: {items: [], records: []}});
const grid = () => input('us-grid-strain', [fact('demand-A', 100), fact('forecast-A', 95, {basis: 'modeled'}), fact('gap-A', 5, {basis: 'interpretive'}), fact('interchange-A', -10)]);
const surveillance = slug => input(slug, [fact('scale-coverage', 12, {measuredAt: '2026-10-23', unit: 'reporting jurisdictions', source: 'https://www.cdc.gov/'}), fact('scale-disagreement', 25, {measuredAt: '2026-10-23', unit: '%', source: 'https://www.cdc.gov/'})]);
const agency = () => input('usaid-consequence', [fact('shape', 3, {quality: 'historical', measuredAt: '2026-07-01'}), fact('country-periods', 'FY2024 and FY2025', {quality: 'historical', measuredAt: '2026-07-01'})]);
const va = key => input('va-strain', key ? [fact(key, 2, {basis: 'demo', label: 'Synthetic ' + key, unit: 'units'})] : []);
const market = () => input('resilience-telemetry', ['shape', 'density', 'components', 'margin', 'scale', 'auc', 'frontier', 'leakage'].map(id => fact(id, 1, {basis: 'interpretive'})));
const nhs = () => input('nhs-scotland-strain', [fact('impact-site-A-o12', 2, {unit: 'attendances', quality: 'historical', measuredAt: '2026-10-18'}), fact('impact-site-A-att', 20, {unit: 'attendances', quality: 'historical', measuredAt: '2026-10-18'})]);
const warning = () => ({...input('us-local-hazards', [fact('alerts', 1, {measuredAt: '2026-10-24T12:00:00Z', source: 'https://api.weather.gov/alerts/active?point=27.7,-82.6'}), fact('notice-0', 'Official source headline', {source: 'https://api.weather.gov/alerts/REAL', noticeId: 'REAL', noticeStatus: 'Actual', noticeMessageType: 'Alert', event: 'Flood Warning', severity: 'Severe', expiresAt: '2026-10-24T14:00:00Z'})]), diagnostics: [{id: 'warnings', status: 'triggered', evidenceIds: ['alerts']}]});
const raw = data => plain(active.handlers.get(data.slug)(data));
const featured = data => active.evaluate(data).actions.filter(action => action.featured && action.selected);
function assertLinks(action, expected) {
  assert.deepEqual(action.parameterLinks.map(link => link.metricId), expected);
  for (const link of action.parameterLinks) {
    assert.ok(link.why.length >= 50 && link.whyNow.length >= 45, 'substantive, separate purpose and timing explanations');
    assert.ok(!/[<>]/.test(link.why + link.whyNow));
  }
}

test('all32 shared selectors identify direct-record decisions without forcing canonical links', () => {
  assert.equal(active.handlers.size, 32);
  for (const {slug, native} of manifest.consoles) if (!native) {
    const data = input(slug), before = JSON.stringify(data), rows = raw(data);
    assert.equal(JSON.stringify(data), before, slug + ': no input mutation');
    for (const action of rows) {
      assert.ok(Array.isArray(action.parameterLinks));
      const linked = [...new Set(action.metricIds || [])];
      assert.deepEqual(action.parameterLinks.map(link => link.metricId), linked, action.id + ': no invented canonical link');
      if (!linked.length) assert.match(action.decisionBasis, /not a .*ten-parameter|no parameter score/);
    }
  }
});

test('grid5/10 explain matched-hour review rather than grid emergency or invented deadlines', () => {
  for (const track of ['public', 'operator']) {
    const rows = raw(grid()).filter(a => a.track === track), gap = rows.find(a => a.id.includes('grid-gap')), flow = rows.find(a => a.id.includes('grid-interchange'));
    assertLinks(gap, [5]); assertLinks(flow, [10]);
    assert.match(gap.parameterLinks[0].why, /same-hour forecast.*not an emergency/);
    assert.match(flow.parameterLinks[0].whyNow, /matching report hours/);
    assert.equal(gap.timing, 'At the next source check, before operational interpretation');
  }
});

test('both surveillance6 links explain reporting-subset stability and release-order checks', () => {
  for (const slug of ['us-overdose-surveillance', 'us-respiratory-surveillance']) {
    const rows = raw(surveillance(slug)).filter(a => a.id.includes('direction-coverage'));
    assert.equal(rows.length, 2);
    for (const row of rows) { assertLinks(row, [6]); assert.match(row.parameterLinks[0].why, /reporting subset.*not measure geographic spread/); assert.match(row.parameterLinks[0].whyNow, /source coverage first.*next release/); }
  }
});

test('USAID5/2 preserve fiscal-period comparison before distribution interpretation', () => {
  const rows = raw(agency()), period = rows.find(a => a.id.includes('agency-period')), shape = rows.find(a => a.id.includes('agency-comparison'));
  assertLinks(period, [5]); assertLinks(shape, [2]);
  assert.match(period.parameterLinks[0].why, /unmatched quarters cannot establish a full-year funding cut/);
  assert.match(shape.parameterLinks[0].whyNow, /After fiscal-period checks/);
});

test('VA1/5/6 and missing inputs remain an exercise with dimension-specific rationale', () => {
  for (const [key, ids] of [['balance', [1]], ['margin', [5]], ['scale', [6]], [null, [1, 5, 6]]]) {
    const rows = raw(va(key)).filter(a => a.id.includes('va-drill'));
    for (const row of rows) { assertLinks(row, ids); assert.equal(row.signal, 'scenario'); assert.match(row.parameterLinks[0].whyNow, key ? /scheduled exercise/ : /Obtain the named exercise inputs/); }
  }
});

test('all eight Resilience links explain their actual model adaptation and review order', () => {
  const row = raw(market()).find(a => a.id.includes('market-model'));
  assertLinks(row, [2, 3, 4, 5, 6, 8, 9, 10]);
  assert.equal(new Set(row.parameterLinks.map(link => link.whyNow)).size, 8);
  assert.match(row.parameterLinks.find(link => link.metricId === 4).why, /estimated.*subgraph/);
  assert.match(row.parameterLinks.find(link => link.metricId === 8).why, /hypothetical.*not measured contagion/);
  assert.match(row.parameterLinks.find(link => link.metricId === 9).why, /hops are not time/);
});

test('NHS workload counts are not silently relabeled as canonical parameters', () => {
  for (const row of raw(nhs())) { assert.deepEqual(row.parameterLinks, []); assert.match(row.decisionBasis, /not a ten-parameter score|no parameter score/); }
  assert.ok(raw(nhs()).some(row => row.id.includes('site-impact-site-A-o12')));
});

test('current official notice remains source-driven and expired notice cannot acquire a parameter alarm', () => {
  const data = warning(), row = featured(data).find(a => a.signal === 'official-warning');
  assert.ok(row); assert.deepEqual(row.parameterLinks, []); assert.match(row.decisionBasis, /current official notice, not a ten-parameter score/);
  clock = NOW + 3 * HOUR;
  assert.ok(!featured(data).some(a => a.signal === 'official-warning'));
  assert.ok(featured(data).some(a => a.signal === 'data-gap'));
  clock = NOW;
});

test('new explanatory fields cannot alter eligibility, order, evidence, phase or expiry', () => {
  for (const data of [grid(), market(), agency(), va('margin'), va(), surveillance('us-overdose-surveillance'), surveillance('us-respiratory-surveillance'), nhs(), warning()]) {
    const current = active.evaluate(data), baseline = stripped.evaluate(data);
    assert.deepEqual(current.diagnostics, baseline.diagnostics, data.slug);
    assert.deepEqual(current.actions.map(omitContext), baseline.actions.map(omitContext), data.slug);
  }
});

test('stale source and changed selection still remove current metric-linked priorities', () => {
  const data = grid(); assert.ok(featured(data).some(a => a.parameterLinks.some(link => link.metricId === 5)));
  data.evidence.forEach(f => { f.quality = 'stale'; });
  assert.ok(!featured(data).some(a => a.requiresCurrent));
  const next = input('us-grid-strain'); next.context = 'Different selected BA';
  assert.ok(!featured(next).some(a => a.target.includes('A ·')));
  assert.ok(featured(next).some(a => a.signal === 'data-gap' && a.decisionBasis));
});
