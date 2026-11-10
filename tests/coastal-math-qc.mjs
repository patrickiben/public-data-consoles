// Known-answer checks for public-data-runtime/coastal-math.js (the Coastal Water Resilience math engine), 2026-11-09.
// Exact answers where the math has one, invariants where it does not, the defects found on 2026-11-09 kept fixed
// (F1, F5), no pointers to the author's own work in the engine's source, and nothing impossible left in the engine.
// Run: node tests/coastal-math-qc.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const enginePath = path.join(root, 'public-data-runtime', 'coastal-math.js');
createRequire(import.meta.url)(enginePath);
const M = globalThis.CWRMath;
const out = [];
const rec = (ok, name, evidence) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}  |  ${evidence}`);
const f4 = (x) => (Number.isFinite(x) ? Number(x).toFixed(4) : String(x));
const rng = M.makeRng(20261119);
const N = () => rng.normal();

// ---------- numerics ----------
{
  const n = 6;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 4 : 0) + N() * 0.5));
  const x = Array.from({ length: n }, N);
  const b = A.map((r) => r.reduce((s, v, j) => s + v * x[j], 0));
  const xs = M.solveLinear(A.map((r) => r.slice()), b.slice());
  const err = Math.max(...xs.map((v, i) => Math.abs(v - x[i])));
  rec(err < 1e-9, 'solveLinear solves a 6x6 system exactly', `max error ${err.toExponential(1)}`);
  const rho = M.spectralRadius([[0.5, 0.4], [0.1, 0.3]]);
  const want = (0.8 + Math.sqrt(0.2)) / 2;
  rec(Math.abs(rho - want) < 1e-6, 'spectralRadius matches the 2x2 closed form', `${f4(rho)} vs ${f4(want)}`);
}

// ---------- directed contagion (corrected method; descriptive only) ----------
{
  const Phi = [[0.5, 0.2, 0], [0, 0.4, 0.3], [0.1, 0, 0.6]];
  let y = [0, 0, 0];
  const Y1 = [];
  for (let t = 0; t < 3200; t++) {
    y = Phi.map((r) => r.reduce((acc, v, j) => acc + v * y[j], 0)).map((v) => v + N());
    if (t >= 200) Y1.push(y.slice());
  }
  const fit0 = M.fitContagion(Y1, 0);
  const eFit = Math.max(...fit0.A.flatMap((r, i) => r.map((v, j) => Math.abs(v - Phi[i][j]))));
  rec(eFit < 0.06 && fit0.kktViolation < 1e-9 && fit0.A.every((r) => r.every((v) => v >= 0)), 'Contagion fit recovers a known nonnegative kernel (self-loops included) and solves its constraints exactly',
    `max error ${f4(eFit)} (about 4 SE at T = 3000), KKT violation ${fit0.kktViolation.toExponential(1)}`);
  const S3 = [[1, 0.5, 0.2], [0.3, 1, 0.4], [0.1, 0.6, 1]];
  const inv = [0, 1, 2].map((k) => M.solveLinear(S3.map((r) => r.slice()), [0, 1, 2].map((i) => (i === k ? 1 : 0))));
  const Sinv = [0, 1, 2].map((i) => [0, 1, 2].map((j) => inv[j][i]));
  const Dg = [0.83, 0.79, 0.5];
  const close = S3.map((r, i) => [0, 1, 2].map((j) => r.reduce((acc, v, k) => acc + v * Dg[k] * Sinv[k][j], 0)));
  const rClose = M.spectralRadius(close), rPair = M.spectralRadius([[0.6, -0.7], [0.7, 0.6]]);
  rec(Math.abs(rClose - 0.83) < 1e-12 && Math.abs(rPair - Math.sqrt(0.85)) < 1e-14 && Math.abs(M.spectralRadius([[0.5, 0.4], [0.1, 0.3]]) - (0.8 + Math.sqrt(0.2)) / 2) < 1e-14,
    'Spectral radius is exact: top eigenvalues 0.83 and 0.79 (an 80-step power iteration missed by 1e-3), a complex pair, a 2x2 closed form', `${rClose.toFixed(15)}, ${rPair.toFixed(15)}`);
  const th = M.gfevd([[0.5, 0], [0, 0.4]], [[1, 0], [0, 1]], 10);
  const thd = M.gfevd([[0.5, 0], [0.6, 0.3]], [[1, 0], [0, 1]], 10);
  const cn = M.connectedness(thd);
  const rows = thd.map((r) => r.reduce((acc, v) => acc + v, 0));
  rec(Math.abs(th[0][1]) < 1e-12 && Math.abs(th[1][0]) < 1e-12 && rows.every((v) => Math.abs(v - 1) < 1e-9) && Math.abs(cn.NET[0] + cn.NET[1]) < 1e-9 && cn.NET[0] > 0,
    'GFEVD: independence shares nothing; rows sum to 1; net sums to 0; the driver transmits', `rows ${rows.map(f4).join('/')}, NET ${cn.NET.map(f4).join('/')}`);
  // Known answers from the source study's own checks: orientation (node 0 drives node 1; the transposed matrix must point
  // the other way), a symmetric kernel whose row-normalized net scores are not zero, and scalar downstream reach.
  const netOf = (a) => M.netScore(a, a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0))));
  const nD = netOf([[0.5, 0], [0.4, 0.5]]), nR = netOf([[0.5, 0.4], [0, 0.5]]);
  const nS = netOf([[0.2, 0.2, 0.2], [0.2, 0.2, 0], [0.2, 0, 0.2]]);
  const wantS = [0.4346234388693304, -0.21731171943465455, -0.21731171943465455];
  const eS = Math.max(...nS.map((v, i) => Math.abs(v - wantS[i])));
  rec(nD[0] > nD[1] && nR[1] > nR[0] && eS < 1e-10 && Math.abs(M.reachTable([[0.8]], 4)[4][0] - (0.8 + 0.64 + 0.512 + 0.4096)) < 1e-12,
    'Net connectedness and reach: right orientation, reversed matrix flips it, symmetric kernel 0.4346 / -0.2173 / -0.2173, scalar reach 2.3616',
    `source ${nD[0] > nD[1] ? 0 : 1}, reversed ${nR[1] > nR[0] ? 1 : 0}, symmetric-kernel error ${eS.toExponential(1)}`);
  // A fixed panel run through the reference implementation of the same method on 2026-11-09 (nonnegative least squares,
  // scipy ranks): every number below is that implementation's answer.
  const lockPanel = () => {
    let s = 2026;
    const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const nrm = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const A = [[0.62, 0.0, 0.0, 0.0], [0.24, 0.55, 0.0, 0.05], [0.0, 0.2, 0.5, 0.0], [0.1, 0.0, 0.22, 0.48]];
    let x = [1, 1, 1, 1];
    const P = [];
    for (let t = 0; t < 170; t++) {
      x = A.map((row, i) => Math.max(0, row.reduce((acc, v, j) => acc + v * x[j], 0) + 0.4 + 0.35 * nrm()));
      if (t >= 20) P.push(x.map((v) => +(v * 3.7).toFixed(6)));
    }
    return P;
  };
  const LP = lockPanel();
  const lk = M.analyzeContagionPanel(LP, ['u0', 'u1', 'u2', 'u3'], { shiftDraws: 20 });
  const ref = { fittedRho: 0.781339925017, netFitted: [32.85209971144, -2.108987623375, -11.969854648188, -18.773257439877],
    reachFitted: [6.720586656457, 3.316025199296, 2.609163892242, 3.069613528606], reversal: -0.8, asymmetry: 0.489067451621 };
  const got = { fittedRho: lk.fittedRho, netFitted: lk.netFitted, reachFitted: lk.reachFitted, reversal: lk.checks.timeReversal.correlation, asymmetry: lk.checks.kernelAsymmetry.observed };
  const dl = Math.max(...Object.keys(ref).map((k) => (Array.isArray(ref[k]) ? Math.max(...ref[k].map((v, i) => Math.abs(v - got[k][i]))) : Math.abs(ref[k] - got[k]))));
  rec(dl < 1e-8, 'Fixed panel: fit, net scores, reach, time reversal and asymmetry match the reference implementation', `largest difference ${dl.toExponential(1)}`);
  const u100 = M.analyzeContagionPanel(LP.map((row) => row.map((v) => v * 100)), ['u0', 'u1', 'u2', 'u3'], { shiftDraws: 20 });
  const du = Math.max(...u100.netFitted.map((v, i) => Math.abs(v - lk.netFitted[i])), ...u100.reachFitted.map((v, i) => Math.abs(v - lk.reachFitted[i])));
  rec(du < 1e-8, 'Unit-free: recording the same panel in units 100 times larger changes no score', `largest difference ${du.toExponential(1)}`);
  // Horizon, rolling windows and the out-of-sample check on the fixed panel: the reference implementation's answers.
  const sP = M.pooledScale(LP), ZP = LP.map((row) => row.map((v) => v / sP)), fitP = M.fitContagion(ZP);
  const hzP = M.horizonProfile(fitP);
  const wantH = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const rlP = M.rollingTop(ZP, { simulatedPanels: { gaussian: [ZP], residual: [ZP] } });
  const wantRoll = [0, 0, 0, 0, 0, 1, 1, 3, 1, 1, 3, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 0, 0, 1, 1, 0];
  const ooP = M.outOfSampleCheck(LP);
  rec(wantH.every((k, i) => hzP.byH[i + 1] === k) && hzP.integratedTop === 0 && rlP.timeline.length === 32 && rlP.timeline.every((w, i) => w.top === wantRoll[i])
      && Math.abs(rlP.shift - 0.4375) < 1e-12 && Math.abs(rlP.rankSimilarity - 0.35625) < 1e-12
      && ooP.trainTop === 0 && ooP.loudest === 3 && ooP.stable && Math.abs(ooP.lead - 13.7259505217) < 1e-8,
    'Horizon tops, 32 rolling windows and the out-of-sample lead match the reference implementation on the fixed panel',
    `top by H ${Object.values(hzP.byH).join('')}; rolling shift ${rlP.shift}; out-of-sample lead ${f4(ooP.lead)}`);
  // Bootstrap, known answer: if every draw keeps the transitions in order, each refit is the full fit, so the full-sample
  // top wins every draw and every interval collapses onto the full-sample net.
  const ident = Array.from({ length: 5 }, () => Array.from({ length: ZP.length - 1 }, (_, i) => i));
  const btI = M.bootstrapTop(ZP, 5, 1, ident), netP = M.netScore(fitP.A, fitP.Sigma);
  const btA = M.bootstrapTop(ZP, 200, 99), btB = M.bootstrapTop(ZP, 200, 99);
  rec(btI.pTop === 1 && btI.netInterval.every((iv, j) => Math.abs(iv[0] - netP[j]) < 1e-9 && Math.abs(iv[1] - netP[j]) < 1e-9) && btA.blockLength === Math.round(Math.sqrt(ZP.length))
      && btA.pTop === btB.pTop && Math.abs(btA.topShare.reduce((a, b) => a + b, 0) - 1) < 1e-12,
    'Bootstrap: in-order draws reproduce the full fit exactly; block length sqrt(T); same seed, same answer', `block ${btA.blockLength}; P(top) ${f4(btA.pTop)} over ${btA.draws} draws`);
  // Time-reversed Granger test. Known answer: in a long two-variable chain x -> y (the case the test's validity proof
  // covers), the source is named with a positive statistic and the receiver gets a negative one.
  const rg = M.makeRng(31);
  let xa = 0, ya = 0;
  const chain = [];
  for (let k = 0; k < 6000; k++) { const nx = 0.5 * xa + rg.normal(), ny = 0.5 * ya + 0.4 * xa + rg.normal(); xa = nx; ya = ny; if (k >= 100) chain.push([xa, ya]); }
  const muC = [0, 1].map((j) => chain.reduce((a, r) => a + r[j], 0) / chain.length), sdC = [0, 1].map((j) => Math.sqrt(chain.reduce((a, r) => a + (r[j] - muC[j]) ** 2, 0) / chain.length));
  const tc = M.trgcStatistic(chain.map((r) => r.map((v, j) => (v - muC[j]) / sdC[j])));
  // The surrogate keeps the coupling without direction: A S is symmetric, Q is a covariance, A is stable. On the fixed
  // panel the statistic matches the reference implementation.
  const muL = [0, 1, 2, 3].map((j) => LP.reduce((a, r) => a + r[j], 0) / LP.length), sdL = [0, 1, 2, 3].map((j) => Math.sqrt(LP.reduce((a, r) => a + (r[j] - muL[j]) ** 2, 0) / LP.length) + 1e-12);
  const ZL = LP.map((r) => r.map((v, j) => (v - muL[j]) / sdL[j]));
  const tL = M.trgcStatistic(ZL), wantT = [0.237674866432, 0.006652271039, -0.076892304045, -0.167434833426];
  const mdl = M.reversibleSurrogateModel(ZL);
  const Sx = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => ZL.reduce((a, r) => a + (r[i] - 0) * (r[j] - 0), 0) / ZL.length));
  const AS = mdl.A.map((r) => [0, 1, 2, 3].map((j) => r.reduce((a, v, k) => a + v * Sx[k][j], 0)));
  const asym = Math.max(...AS.flatMap((r, i) => r.map((v, j) => Math.abs(v - AS[j][i]))));
  const qOk = mdl.L.every((r, i) => r[i] > 0);
  rec(tc[0] > 0 && tc[1] < 0 && Math.max(...wantT.map((v, i) => Math.abs(v - tL[i]))) < 1e-9 && asym < 1e-10 && qOk && M.spectralRadius(mdl.A) < 1,
    'Time-reversed Granger: a chain names its source; reversible surrogate keeps coupling without direction; statistic matches the reference',
    `chain ${tc.map(f4).join('/')}; fixed-panel max difference ${Math.max(...wantT.map((v, i) => Math.abs(v - tL[i]))).toExponential(1)}; AS asymmetry ${asym.toExponential(1)}; rho(A) ${f4(M.spectralRadius(mdl.A))}`);
  const hz = M.holmAdjust([0.01, 0.04, 0.03, 0.005]);
  rec([0.03, 0.06, 0.06, 0.02].every((v, i) => Math.abs(v - hz[i]) < 1e-15), 'Holm adjustment: 0.01, 0.04, 0.03, 0.005 become 0.03, 0.06, 0.06, 0.02', hz.join(', '));
  const goneNames = ['exactOptimum', 'simulateCascade', 'compareControllers', 'symmetrizationPath', 'cascadeControllers', 'rollingRho', 'ridgeVar1', 'runAnchoredNestedLearning', 'buildOfflineStormPreset'];
  rec(goneNames.every((n) => !(n in M)), 'Nothing impossible is left: no control experiment on gauges, no superseded rolling radius, no typed-in demo or synthetic replay',
    `absent: ${goneNames.length}/${goneNames.length}`);
}

// ---------- learning within fixed safety limits (verified library; the console shows none of it) ----------
{
  const guard = [
    M.canAutoApplyAnl({ target_level: 'L0_constitution', parameter_path: 'anchor.veto', evidence_count: 100, safety_critical: false, requires_human_review: false }),
    M.canAutoApplyAnl({ target_level: 'L5_decision', parameter_path: 'safety_rules.wetwell', evidence_count: 100, safety_critical: false, requires_human_review: false }),
    M.canAutoApplyAnl({ target_level: 'L5_decision', parameter_path: 'ranking_bias.p1', evidence_count: 12, safety_critical: false, requires_human_review: false }),
    M.canAutoApplyAnl({ target_level: 'L5_decision', parameter_path: 'ranking_bias.p1', evidence_count: 25, safety_critical: false, requires_human_review: false })];
  rec(M.validateAnlLevels() && !guard[0] && !guard[1] && !guard[2] && guard[3], 'Safety guard refuses L0, frozen paths and low evidence; allows a valid ranking change', JSON.stringify(guard));
  const opts = [0.84, 0.79, 0.71, 0.66].map((b, i) => ({ id: 'o' + i, baseScore: b, nativeBias: [0.038, 0.044, -0.018, -0.025][i], memoryBias: [0.024, 0.031, -0.014, -0.019][i], elasticBias: [0.012, 0.015, -0.006, -0.008][i], approved: true, fallback: false }))
    .concat([{ id: 'stop', baseScore: 0.3, approved: true, fallback: true }]);
  const p = M.centerAndContractReadout(opts);
  const live = p.rankedCentered.filter((r) => !r.fallback);
  const meanC = live.reduce((acc, r) => acc + r.contractedBiasB, 0) / live.length;
  const inside = p.rankedCentered.every((r) => Math.abs(r.contractedBiasB) <= p.boundB + 1e-12);
  let broken = 0;
  for (const x of live) for (const z of live) if (x.baseScore - z.baseScore > 2 * p.boundB && !(x.finalScore > z.finalScore)) broken++;
  rec(Math.abs(meanC) < 1e-12 && inside && broken === 0, 'Readout is centered, stays in [-B, B] and keeps order beyond 2B', `mean ${meanC.toExponential(1)}, inside ${inside}, broken ${broken}`);
  const m3 = M.computeM3LinearRecurrenceAndCurves();
  const mul = (X, Yy) => X.map((r) => Yy[0].map((_, j) => r.reduce((acc, v, i) => acc + v * Yy[i][j], 0)));
  let logn = 0;
  let Q = m3.A.map((r) => r.slice());
  for (let k = 0; k < 14; k++) {
    Q = mul(Q, Q);
    const nrm = Math.max(...Q.map((r) => r.reduce((acc, v) => acc + Math.abs(v), 0)));
    logn = 2 * logn + Math.log(nrm);
    Q = Q.map((r) => r.map((v) => v / nrm));
  }
  const rhoG = Math.exp(logn / 16384);
  rec(Math.abs(rhoG - m3.spectralRadiusA) < 1e-4 && Math.abs(M.spectralRadius(m3.A) - m3.spectralRadiusA) < 1e-9, 'Recurrence spectral radius confirmed independently (Gelfand and full eigenvalues)', `engine ${f4(m3.spectralRadiusA)}, Gelfand ${f4(rhoG)}`);
  const noReach = M.computeM3LinearRecurrenceAndCurves({ learningRate: 1e-9 });
  rec(noReach.fullBoundEpisode === null, 'F1 fixed: a run that never reaches the bound says so (no fallback to 280)', `fullBoundEpisode ${noReach.fullBoundEpisode}`);
  // Known answers from the source study's reported results: the designed single-retention rule reaches 27% of the bound
  // by event 100, 66% by 200 and the bound at 280; the released double-retention wiring sits at 0.87% (0.00044) at 1,500.
  rec(Math.round(m3.shareAt100Pct) === 27 && Math.round(m3.shareAt200Pct) === 66 && m3.fullBoundEpisode === 280
      && Math.abs(m3.shippedAt1500SharePct - 0.87) < 0.005 && Math.abs(m3.shippedAt1500Theta - 0.00044) < 5e-6,
    'Learning rule reproduces the reported results (27% at 100, 66% at 200, bound at 280; released wiring 0.87% at 1,500)',
    `${f4(m3.shareAt100Pct)}%, ${f4(m3.shareAt200Pct)}%, bound at ${m3.fullBoundEpisode}; released ${f4(m3.shippedAt1500SharePct)}% (${m3.shippedAt1500Theta.toExponential(2)})`);
  const costs = [[0.12, 0.28, null, 0.45], [0.32, 0.14, 0.25, 0.30], [0.18, 0.22, 0.15, null], [null, 0.19, 0.24, 0.12]], sup = [0.45, 0.40, 0.35, 0.30];
  const st = M.solveSinkhornRefinementAnl(costs, sup, [0.50, 0.45, 0.35, 0.30], [true, true, false, false], 2.0, 0.05, 5);
  const rowErr = Math.max(...sup.map((v, i) => Math.abs(st.plan[i].reduce((acc, q) => acc + q, 0) - v)));
  rec(st.forbiddenFlowSum === 0 && rowErr < 1e-3, 'Sinkhorn: no flow on forbidden routes; each unit ships what it has', `forbidden ${st.forbiddenFlowSum}, row error ${rowErr.toExponential(1)}`);
  // Resource transport: a problem where 600 Sinkhorn iterations stopped short. The reference plan was computed on
  // 2026-11-09 by the reference transport code (5,000 iterations, tolerance 1e-3 of total mass, conservative rounding).
  const P7 = { costs: [[0.302, 0.313, 0.17, 0.433], [0.51, null, 0.479, 0.133], [null, 0.488, 0.429, 0.21], [0.278, 0.578, 0.196, null]],
    supplies: [0.272, 0.291, 0.448, 0.432], demands: [0.374, 0.428, 0.43, 0.24], missing: [4.0, 2.0, 4.0, 2.0],
    plan: [[0.0568309911659, 0.0880838435193, 0.127080017664, 5.14765038135e-06, 5.55111512313e-17], [0.0799906684478, 0.0, 0.0237277473083, 0.187281584244, 0.0],
      [0.0, 0.311920754617, 0.0838707551012, 0.0522084902819, 5.55111512313e-17], [0.236400921771, 0.00113171764315, 0.194467360586, 0.0, 5.55111512313e-17],
      [0.000777418615313, 0.0268636842207, 0.000854119340272, 0.000504777823737, 1.443]] };
  const got7 = M.sinkhornAnl(P7.costs, P7.supplies, P7.demands, P7.missing);
  const dP = Math.max(...P7.plan.flatMap((row, i) => row.map((v, j) => Math.abs(v - got7[i][j]))));
  rec(dP < 1e-9, 'Resource transport converges to the reference plan (5,000 iterations; 600 stopped 0.007 short)', `max difference ${dP.toExponential(1)}`);
  // Question selection, worked by hand: two equally likely states, one noiseless question that reveals the state.
  // Stopping now costs 0.5 in expectation; asking leaves no risk, no ambiguity and gains ln 2, so G = friction - ln 2.
  const efe = M.evaluateEFEQuestions({ wet: { prob: 1, vars: { probe: 'wet' } }, dry: { prob: 1, vars: { probe: 'dry' } } },
    [{ id: 'probe', variable: 'probe', options: ['wet', 'dry'], friction: 0.03 }], ['act_wet', 'act_dry'],
    { act_wet: { wet: 0, dry: 1 }, act_dry: { wet: 1, dry: 0 } }, 0);
  const q = efe.questions[0];
  rec(Math.abs(efe.stopValue - 0.5) < 1e-15 && Math.abs(q.G - (0.03 - Math.LN2)) < 1e-15 && efe.selectedQuestion === 'probe',
    'Question selection: a noiseless revealing question has G = friction - ln 2 and beats stopping (0.5)', `G ${q.G.toFixed(6)}, stop ${efe.stopValue}`);
}

// ---------- recorded storm surge (NOAA, scripts/fetch_storm_gauges.py) ----------
{
  const d = JSON.parse(fs.readFileSync(path.join(root, 'consoles', 'coastal-water-resilience', 'data', 'storm-gauges.json'), 'utf8'));
  const ids = d.gauges.map((g) => g.id);
  const complete = d.windows.length === 4 && d.windows.every((w) => ids.every((id) => {
    const s = w.series[id];
    return s.t.length === 144 && s.measured.every(Number.isFinite) && s.predicted.every(Number.isFinite);
  }));
  rec(complete, 'NOAA snapshot: 4 windows x 5 gauges x 144 hourly readings, no gaps', `${d.windows.length} windows, retrieved ${d.retrievedAt}`);
  const helene = d.windows.find((w) => w.key === 'helene');
  const surge = (w) => Array.from({ length: w.series[ids[0]].t.length }, (_, t) => ids.map((id) => w.series[id].measured[t] - w.series[id].predicted[t]));
  const stp = helene.series['8726520'];
  const peak = Math.max(...stp.measured.map((m, i) => m - stp.predicted[i]));
  rec(peak > 6 && peak < 7.5, 'Helene surge at St. Petersburg peaks between 6 and 7.5 ft (hourly NOAA data)', `${f4(peak)} ft`);
  // The storm replay is the recorded file itself: every value, at its real UTC hour; nothing invented for unrecorded views.
  const rep = M.recordedStormReplay(d, 'helene');
  let mismatch = 0, hourly = true;
  for (const g of rep.gauges) {
    const src = helene.series[g.id];
    g.rows.forEach((row, i) => {
      if (row.measured !== src.measured[i] || row.predicted !== src.predicted[i] || Math.abs(row.surge - (src.measured[i] - src.predicted[i])) > 5e-4) mismatch++;
      if (i && row.t - g.rows[i - 1].t !== 3600000) hourly = false;
    });
  }
  const sp = rep.gauges.find((g) => g.id === '8726520');
  const fileMax = Math.max(...stp.measured);
  const mil = M.recordedStormReplay(d, 'milton').gauges.find((g) => g.id === '8726520');
  const milSrc = d.windows.find((w) => w.key === 'milton').series['8726520'];
  const milMin = Math.min(...milSrc.measured.map((m, i) => Math.round((m - milSrc.predicted[i]) * 1000) / 1000));
  rec(rep.gauges.length === 5 && rep.gauges.every((g) => g.rows.length === 144 && g.missingHours === 0) && mismatch === 0 && hourly
      && sp.peakLevelFt.value === fileMax && Math.abs(sp.peakSurgeFt.value - 6.719) < 1e-9 && mil.lowestSurgeFt.value === milMin && milMin < 0
      && ['forecastGuidance', 'stormTrack', 'weatherAlerts', 'stormForecasts'].every((k) => k in rep.notRecorded) && rep.stormTrack === null && rep.alerts === null && !('nhc' in rep) && !('nws' in rep) && !('ofs' in rep) && M.recordedStormReplay(d, 'nonexistent') === null,
    'Storm replay is the recorded NOAA file: 5 gauges x 144 real hours, values identical; forecast, track and alerts reported as not recorded',
    `Helene St. Petersburg peak ${sp.peakLevelFt.value} ft MLLW, surge ${sp.peakSurgeFt.value} ft at ${new Date(sp.peakSurgeFt.t).toISOString().slice(0, 16)}Z; Milton lowest surge ${mil.lowestSurgeFt.value} ft; mismatches ${mismatch}`);
  // Official storm records (scripts/fetch_storm_records.py): best tracks and archived alerts, joined to the replay.
  const recs = JSON.parse(fs.readFileSync(path.join(root, 'consoles', 'coastal-water-resilience', 'data', 'storm-records.json'), 'utf8'));
  const tracksOk = ['idalia', 'helene', 'milton'].every((k) => {
    const fx = recs.storms[k].fixes.map((f) => Date.parse(f.t));
    return fx.length > 10 && fx.every((t, i) => !i || t > fx[i - 1]) && recs.storms[k].fixes.some((f) => f.mark === 'L');
  });
  const alertsOk = recs.alerts.calm.length === 0 && ['idalia', 'helene', 'milton'].every((k) => recs.alerts[k].length > 0 && recs.alerts[k].every((e) => Date.parse(e.issue) < Date.parse(e.expire)));
  rec(tracksOk && alertsOk, 'Storm records: three best tracks in time order with a landfall each; alerts at the gauge for every storm and none in the calm week',
    `fixes ${['idalia', 'helene', 'milton'].map((k) => recs.storms[k].fixes.length).join('/')}; alerts ${['idalia', 'helene', 'milton', 'calm'].map((k) => recs.alerts[k].length).join('/')}; ${recs.sources[0].split('(')[1].replace(')', '')}`);
  // Closest approach checked by an independent formula: exact point-to-segment distance in a local plane at the gauge.
  const g0 = d.gauges.find((g) => g.id === '8726520');
  const planeKm = (lat, lon) => [(lon - g0.lon) * 111.32 * Math.cos((g0.lat * Math.PI) / 180), (lat - g0.lat) * 110.574];
  const closest = {};
  for (const k of ['idalia', 'helene', 'milton']) {
    const r = M.recordedStormReplay(d, k, recs), pts = recs.storms[k].fixes.map((f) => planeKm(f.lat, f.lon));
    let segMin = Infinity, fixMin = Infinity;
    for (let i = 0; i < pts.length; i++) {
      fixMin = Math.min(fixMin, Math.hypot(...pts[i]));
      if (i + 1 < pts.length) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
        segMin = Math.min(segMin, Math.hypot(ax + u * dx, ay + u * dy));
      }
    }
    closest[k] = { engine: r.stormTrack.closestApproach.km, plane: segMin, fixMin };
  }
  const caOk = Object.values(closest).every((c) => Math.abs(c.engine - c.plane) < 1.0 && c.engine <= c.fixMin + 1e-9) && closest.milton.fixMin - closest.milton.engine > 1;
  rec(caOk, 'Closest approach is measured along the track (independent local-plane formula agrees within 1 km; better than the nearest 6-hourly fix)',
    Object.entries(closest).map(([k, c]) => `${k} ${f4(c.engine)} km (plane ${f4(c.plane)}, nearest fix ${f4(c.fixMin)})`).join('; '));
  const repH = M.recordedStormReplay(d, 'helene', recs), repC = M.recordedStormReplay(d, 'calm', recs);
  rec(repH.alerts.length === recs.alerts.helene.length && !('stormTrack' in repH.notRecorded) && !('weatherAlerts' in repH.notRecorded) && 'forecastGuidance' in repH.notRecorded
      && repC.stormTrack === null && 'stormTrack' in repC.notRecorded && repC.alerts.length === 0,
    'Replay with records: real track and alerts shown; calm week has no storm; forecast guidance still reported as not recorded',
    `Helene alerts ${repH.alerts.length}: ${[...new Set(repH.alerts.map((a) => a.name))].slice(0, 4).join(', ')}...`);
  const Y = surge(helene);
  const res = M.analyzeContagionPanel(Y, ids, { shiftDraws: 200, floorAtZero: false });
  const net = res.netFitted;
  const top = net.indexOf(Math.max(...net)), bottom = net.indexOf(Math.min(...net));
  rec(ids[top] === '8726724' && ids[bottom] === '8726674' && res.checks.timeReversal.correlation < 0 && res.checks.clears,
    'Recorded Helene surge: Clearwater (Gulf) transmits, East Bay receives; it passes the shifted-panel and time-reversal checks',
    `net ${net.map(f4).join('/')}; asymmetry p ${f4(res.checks.kernelAsymmetry.p)}; reversal r ${f4(res.checks.timeReversal.correlation)}`);
  // Idalia and Helene on the frozen snapshot: Clearwater is the transmitter in most bootstrap draws, at every horizon from
  // 2 hours, and its last-hour surge forecasts the downstream gauges better than the loudest gauge's does.
  const idalia = d.windows.find((w) => w.key === 'idalia');
  const resI = M.analyzeContagionPanel(surge(idalia), ids, { shiftDraws: 200, floorAtZero: false });
  const strong = [resI, res].every((r) => r.fittedTop === '8726724' && r.bootstrap.top === '8726724' && r.bootstrap.pTop > 0.8 && r.horizon.stableFrom2
    && r.outOfSample.trainTop === '8726724' && r.outOfSample.stable && r.outOfSample.lead > 50 && r.bootstrap.netInterval95['8726724'][0] > 0);
  rec(strong, 'Idalia and Helene: Clearwater transmits in most bootstrap draws, at every horizon from 2 h, and forecasts the bay better than the loudest gauge out of sample',
    [['Idalia', resI], ['Helene', res]].map(([k, r]) => `${k} P(top) ${f4(r.bootstrap.pTop)}, lead ${f4(r.outOfSample.lead)} pts`).join('; '));
  // Time-reversed Granger on the frozen snapshot (1,000 surrogates, seed 2028): every window is directed beyond reversible
  // surrogates with the same coupling, after a Holm correction across the four windows; shifted panels flag none.
  const trg = d.windows.map((w) => M.trgcTest(surge(w), ids, { draws: 1000, seed: 2028 }));
  const holmP = M.holmAdjust(trg.map((r) => r.pPrimary));
  rec(holmP.every((p) => p < 0.05) && trg.every((r) => r.pShifted > 0.05),
    'Recorded surge: time-reversed Granger flags every window against reversible surrogates (Holm < 0.05), none against shifted panels',
    d.windows.map((w, i) => `${w.key} P ${f4(trg[i].pPrimary)} (Holm ${f4(holmP[i])}), names ${trg[i].top}`).join('; '));
}

// ---------- no pointers to the author's own work in the engine ----------
{
  const src = fs.readFileSync(enginePath, 'utf8');
  const hits = (src.match(/manuscript|zenodo|\bdoi\b|macgyver|lsa_capstone|\b[\w-]+\.(?:py|tex)\b|\bS\d Appendix|PROPOSED_/gi) || []);
  rec(hits.length === 0, 'The engine names none of the author\'s papers, code files or appendices', hits.length ? `found: ${[...new Set(hits)].slice(0, 6).join(', ')}` : 'none');
}

console.log(out.join('\n'));
const fails = out.filter((l) => l.startsWith('FAIL')).length;
console.log(`\n${out.length - fails} pass, ${fails} fail`);
process.exit(fails ? 1 : 0);
