// Builds consoles/coastal-water-resilience/data/storm-analysis.json: the recorded storm windows run through the verified
// engine (public-data-runtime/coastal-math.js). Inputs: data/storm-gauges.json (NOAA) and data/storm-records.json (NHC, NWS).
// Deterministic (fixed seeds), so `node scripts/build_storm_analysis.mjs --check` fails if the stored file drifts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'consoles', 'coastal-water-resilience', 'data');
const enginePath = path.join(root, 'public-data-runtime', 'coastal-math.js');
createRequire(import.meta.url)(enginePath);
const M = globalThis.CWRMath;
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const gauges = JSON.parse(fs.readFileSync(path.join(data, 'storm-gauges.json'), 'utf8'));
const records = JSON.parse(fs.readFileSync(path.join(data, 'storm-records.json'), 'utf8'));
const ids = gauges.gauges.map((g) => g.id), names = gauges.gauges.map((g) => g.name);
const SETTINGS = { bootstrapDraws: 500, shiftedPanels: 200, rollingNullDraws: 40, grangerDraws: 1000, floorAtZero: false };

const windows = gauges.windows.map((w) => {
  const P = Array.from({ length: w.series[ids[0]].t.length }, (_, t) => ids.map((id) => w.series[id].measured[t] - w.series[id].predicted[t]));
  const rep = M.recordedStormReplay(gauges, w.key, records);
  const a = M.analyzeContagionPanel(P, names, { floorAtZero: SETTINGS.floorAtZero, bootDraws: SETTINGS.bootstrapDraws, nullDraws: SETTINGS.rollingNullDraws, shiftDraws: SETTINGS.shiftedPanels });
  const g = M.trgcTest(P, names, { draws: SETTINGS.grangerDraws, seed: 2028 });
  return { key: w.key, label: w.label, rep, a, g };
});
const holm = M.holmAdjust(windows.map((w) => w.g.pPrimary));
const round = (v, d = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const out = {
  schemaVersion: 1,
  method: 'Hourly surge (measured minus predicted) at the five gauges, fitted with every coupling >= 0; leading gauge = largest net connectedness. '
    + 'How sure = share of stationary-bootstrap resamples with the same leading gauge. Next-hour forecast = gain of the leading gauge\'s last hour over the loudest gauge\'s, '
    + 'trained on the first 75% of the window and scored on the rest. Directed = time-reversed Granger test against reversible surrogates with the same coupling, '
    + 'Holm-adjusted across the four windows. Strong = how sure >= 80%, the same leading gauge at every horizon from 2 h, the same leading gauge on the training part, a positive forecast gain and directed; '
    + 'weak = a leading gauge in at least half the resamples that misses one of those; none = below half.',
  settings: SETTINGS,
  inputs: { engineSha256: sha(enginePath), stormGaugesSha256: sha(path.join(data, 'storm-gauges.json')), stormRecordsSha256: sha(path.join(data, 'storm-records.json')) },
  windows: windows.map(({ key, label, rep, a, g }, i) => {
    const pTop = a.bootstrap.pTop, ok = pTop >= 0.8 && a.horizon.stableFrom2 && a.outOfSample.stable && a.outOfSample.lead > 0 && holm[i] < 0.05;
    return {
      key, label,
      gauges: rep.gauges.map((x) => ({ id: x.id, name: x.name, peakLevelFt: x.peakLevelFt, peakSurgeFt: x.peakSurgeFt, lowestSurgeFt: x.lowestSurgeFt })),
      storm: rep.stormTrack ? { name: rep.stormTrack.name, peakWindKt: rep.stormTrack.peakWindKt,
        closest: { km: round(rep.stormTrack.closestApproach.km, 1), t: rep.stormTrack.closestApproach.t },
        landfalls: rep.stormTrack.landfalls.map((f) => ({ t: f.t, lat: f.lat, lon: f.lon, windKt: f.windKt })) } : null,
      alerts: (rep.alerts || []).map((e) => ({ name: e.name, issue: e.issue, expire: e.expire, url: e.url })),
      leadingGauge: a.fittedTop, loudestGauge: a.loudest,
      howSure: round(pTop, 3), topShare: Object.fromEntries(Object.entries(a.bootstrap.topShare).map(([k, v]) => [k, round(v, 3)])),
      sameAtEveryHorizonFrom2h: a.horizon.stableFrom2,
      forecastGainPts: round(a.outOfSample.lead, 1), forecastTrainTop: a.outOfSample.trainTop, forecastLoudest: a.outOfSample.loudest,
      forecastSameLeader: a.outOfSample.stable,
      directedP: round(g.pPrimary, 4), directedHolm: round(holm[i], 4), directed: holm[i] < 0.05, grangerNames: g.top,
      checksPass: a.checks.clears,
      verdict: ok ? 'strong' : pTop >= 0.5 ? 'weak' : 'none'
    };
  }),
  notRecorded: ['Forecast guidance', 'Official forecast advisories']
};
const target = path.join(data, 'storm-analysis.json'), text = JSON.stringify(out) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) { console.error('storm-analysis.json differs from a fresh engine run'); process.exit(1); }
  console.log('PASS: storm-analysis.json matches a fresh engine run on the embedded inputs');
} else {
  fs.writeFileSync(target, text);
  for (const w of out.windows) console.log(`${w.key.padEnd(7)} leading ${w.leadingGauge}, how sure ${w.howSure}, forecast gain ${w.forecastGainPts}, directed ${w.directed} (Holm ${w.directedHolm}), verdict ${w.verdict}`);
  console.log(`wrote ${path.relative(root, target)} (${Math.round(fs.statSync(target).size / 1024)} KB)`);
}
