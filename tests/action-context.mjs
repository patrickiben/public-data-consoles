import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../response-plans/action-context.js', import.meta.url), 'utf8');
const deny = () => { throw new Error('Private/native inputs and network must not be read'); };
const environment = { ConsoleResponse: {}, fetch: deny };
for (const name of ['document', 'localStorage', 'SNAP', 'STATE', 'FACILITY', 'SCEN', 'DATA']) {
  Object.defineProperty(environment, name, { get: deny });
}
environment.window = environment;
vm.runInNewContext(source, environment);
const {forMetric, slugs} = environment.ConsoleResponse.actionContext;
const manifest = JSON.parse(fs.readFileSync(new URL('../response-plans/manifest.json', import.meta.url), 'utf8'));
const manifestEntries = Array.isArray(manifest) ? manifest : manifest.consoles || manifest.entries || manifest.modules;
const allSlugs = manifestEntries.filter(r => typeof r === 'string' || !r.native).map(r => typeof r === 'string' ? r : r.slug).sort();
assert.deepEqual([...slugs], allSlugs);
assert.equal(slugs.length, 31);

let groups = 0;
function test(label, check) { check(); groups++; console.log('ok - ' + label); }
const read = (slug, metricId, extra = {}) => forMetric({ slug, metricId, phase: 'prepare', when: 'triggered', track: 'public', diagnostic: {status: 'triggered'}, ...extra });

test('all 31 consoles, ten canonical IDs and both tracks have bounded explanations', () => {
  for (const slug of slugs) for (let metricId = 1; metricId <= 10; metricId++) for (const track of ['public', 'operator']) {
    const result = read(slug, metricId, {track});
    assert.equal(result.metricId, metricId);
    assert.ok(result.why.length > 60 && result.why.length < 500, slug + '#' + metricId);
    assert.ok(result.whyNow.includes('source period'));
    assert.deepEqual(Object.keys(result).sort(), ['metricId', 'why', 'whyNow']);
  }
});
test('domain contrasts follow actual different estimands, rather than universal CRT thresholds', () => {
  assert.match(read('nhs-scotland-strain', 2).why, /weekly attendance.*service size or case mix/);
  assert.match(read('us-grid-strain', 2).why, /two complete adjacent days of hourly demand/);
  assert.match(read('global-outbreak-tracker', 2).why, /reporting ages.*not.*severity/);
  assert.match(read('resilience-telemetry', 3).why, /pooled-quantile bins.*does not predict/);
  assert.match(read('global-wash', 3).why, /land area.*cannot establish local service access/);
});
test('river physical history and network meanings are kept distinct', () => {
  assert.match(read('river-flood-network', 5).why, /hourly samples.*not.*continuous duration/);
  assert.match(read('river-flood-propagation', 5).why, /forecast issue and future valid time/);
  assert.match(read('river-flood-network', 10).why, /topology does not measure leakage/);
  assert.match(read('river-flood-propagation', 10).why, /not.*routed arrival/);
});
test('historical, model, scenario and reference boundaries remain visible', () => {
  assert.match(read('nhs-scotland-strain', 10).why, /reported stays.*not|prevent.*patient-transfer/);
  assert.match(read('quake-consequence', 1).why, /modeled exposure.*not.*confirmed casualties/);
  assert.match(read('us-grid-strain', 10).why, /Negative.*net imports/);
  assert.match(read('usaid-consequence', 5).why, /Partial quarters.*matched fiscal windows/);
  assert.match(read('va-strain', 5).why, /drill.*approved current local data/);
  assert.match(read('global-air-pollution', 8).why, /historical concentration-years.*not current AQI/);
});
test('unknown inputs take verification priority even when an old phase says respond', () => {
  const result = read('river-flood-propagation', 8, {phase: 'respond', when: 'unknown', track: 'operator',
    diagnostic: {status: 'unknown', requiredInputs: ['Complete hourly history', 'Compatible official thresholds']}});
  assert.match(result.whyNow, /completed hourly threshold integral before extrapolating/);
  assert.match(result.whyNow, /Verify the missing/);
  assert.match(result.whyNow, /Complete hourly history; Compatible official thresholds/);
  assert.match(result.whyNow, /Unknown does not mean clear/);
  assert.doesNotMatch(result.whyNow, /activate|dispatch|within \d/);
});
test('invalidated and absent status remain unassessed, never a current trigger', () => {
  for (const diagnostic of [{}, {status: 'stale'}, {status: 'missing'}, {status: 'unknown'}]) {
    const result = read('global-cancer', 9, {diagnostic});
    assert.match(result.whyNow, /missing or unqualified/);
    assert.match(result.whyNow, /does not establish a supported assessment/);
  }
});
test('both required-input encodings and declared row fallback are supported', () => {
  assert.match(read('medical-debt-assistant', 5, {when: 'unknown', diagnostic: {status: 'unknown', requiredInputs: 'Applicable notice date'}}).whyNow, /Required inputs: Applicable notice date/);
  assert.match(read('us-local-hazards', 6, {when: 'unknown', diagnostic: {status: 'unknown'}, row: {requiredInputs: ['Nested hazard areas']}}).whyNow, /Nested hazard areas/);
});
test('public reference explanations do not inspect or imply private determinations', () => {
  assert.match(read('prescription-savings', 2).why, /drug product and public acquisition-cost benchmark.*like-for-like/);
  assert.match(read('medical-cost-abroad', 10).why, /cross-border follow-up pathway/);
  assert.match(read('medical-debt-assistant', 7).why, /not a fitted eligibility/);
  assert.match(read('human-trafficking', 10).why, /minimum necessary information/);
  assert.notEqual(read('human-trafficking', 1, {when:'unknown', track:'public'}).whyNow,
    read('human-trafficking', 1, {when:'unknown', track:'operator'}).whyNow);
});
test('phase timing explains sequence without inventing a source deadline', () => {
  const respond = read('us-local-hazards', 5, {phase: 'respond'}).whyNow;
  assert.match(respond, /alert’s validity times before using its instructions/);
  assert.match(respond, /currently applicable official instructions.*approved local activation rules/);
  assert.match(respond, /does not authorize action or set its deadline/);
  assert.match(read('global-health-atlas', 2, {phase: 'review'}).whyNow, /planning review.*no response deadline/i);
  assert.match(read('us-grid-strain', 5, {phase: 'verify'}).whyNow, /before relying.*not proof/);
  assert.doesNotMatch(respond, /within \d|every \d|wait \d/);
});
test('each dimension explains its own sequencing dependency, including noncanonical proxies', () => {
  for (const slug of slugs) {
    const text = Array.from({length:10}, (_,i)=>read(slug,i+1).whyNow);
    assert.equal(new Set(text).size,10,slug+' needs ten distinct timing rationales');
  }
  assert.match(read('nhs-scotland-strain',5).whyNow,/near the reference before committing a threshold/);
  assert.match(read('global-wash',5).whyNow,/observation-year differences before comparing/);
  assert.match(read('us-grid-strain',5).whyNow,/same-hour forecast and demand before interpreting/);
  assert.match(read('river-flood-network',5).whyNow,/sampled action-threshold history/);
  assert.match(read('global-outbreak-tracker',5).whyNow,/partial versus complete windows/);
  assert.match(read('us-grid-strain',4,{when:'unknown',diagnostic:{status:'unknown'}}).whyNow,/physical network topology before using reported interchange/);
  assert.match(read('us-local-hazards',4).whyNow,/mapped flood susceptibility during preparedness/);
});
test('clear comparison stays bounded and authored overrides are explicit', () => {
  assert.match(read('nhs-scotland-strain', 4, {diagnostic: {status: 'clear'}}).whyNow, /does not trigger.*limited to its stated inputs/);
  const result = read('global-wash', 1, {row: {parameterWhy:'  Named cohort\n context. ',parameterWhyNow:'Use at the declared review. '}});
  assert.equal(result.why, 'Named cohort context.');
  assert.equal(result.whyNow, 'Use at the declared review.');
});
test('pure helper does not mutate payload and rejects unknown slugs/IDs', () => {
  const input = Object.freeze({slug:'us-grid-strain',metricId:10,phase:'review',when:'triggered',track:'operator',
    diagnostic:Object.freeze({status:'triggered',requiredInputs:Object.freeze(['Matched-hour demand'])}),row:Object.freeze({})});
  assert.deepEqual(forMetric(input), forMetric(input));
  for (const metricId of [0,11,2.5,'5',null,NaN]) assert.equal(forMetric({slug:'us-grid-strain',metricId}), null);
  assert.equal(forMetric({slug:'coastal-water-resilience',metricId:1}), null);
  assert.equal(forMetric({slug:'unknown',metricId:1}), null);
  assert.equal(forMetric(null), null);
});
console.log('Passed ' + groups + ' action-context groups.');
