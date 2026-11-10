/* Coastal Water Resilience: mathematical engine (offline).
   Directed contagion: every coupling >= 0 (self-loops included), pooled-scale panel, ridge 0.001; net connectedness and
   downstream reach on the fitted kernel; shifted-panel and time-reversal checks; horizon sensitivity, a stationary
   bootstrap, rolling windows with a fixed-kernel check, an out-of-sample forecast check, and the time-reversed Granger
   test against reversible surrogates. No imposed actions.
   Storm replay from recorded data and official records.
   Learning within fixed safety limits (levels L0-L7): a verified library the console does not show (no real inputs).
   Pure deterministic JavaScript; no network, DOM or library dependencies.
   Checked 2026-11-09 against known answers (tests/coastal-math-qc.mjs); defects F1, F3 and F5 fixed where they sit.
   The trial-design suite (allocation pools, design ladder, the ten metrics scored as a trial) was removed on
   2026-11-09: this app's ten parameters are diagnostics, computed in public-data-runtime/coastal-planning.js. */
(function (root) {
  'use strict';

  /* ==================== DETERMINISTIC PRNG & BASIC LINEAR ALGEBRA ==================== */
  function mulberry32(seed) {
    let a = (seed >>> 0) || 20260904;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const raw = mulberry32(seed);
    let spare = null;
    return {
      next: raw,
      int(max) {
        return Math.floor(raw() * max);
      },
      normal(mu = 0, sd = 1) {
        if (spare !== null) {
          const v = spare;
          spare = null;
          return mu + sd * v;
        }
        let u = 0, v = 0, s = 0;
        while (s === 0 || s >= 1) {
          u = raw() * 2 - 1;
          v = raw() * 2 - 1;
          s = u * u + v * v;
        }
        const mul = Math.sqrt((-2 * Math.log(s)) / s);
        spare = v * mul;
        return mu + sd * (u * mul);
      },
      shuffle(arr) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(raw() * (i + 1));
          const tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
        }
        return out;
      },
      choice(arr, k, replace = false) {
        if (replace) {
          const out = new Array(k);
          for (let i = 0; i < k; i++) out[i] = arr[Math.floor(raw() * arr.length)];
          return out;
        }
        return this.shuffle(arr).slice(0, k);
      }
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  const variance = (arr, sample = true) => {
    if (arr.length < (sample ? 2 : 1)) return 0;
    const m = mean(arr);
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return s / (sample ? arr.length - 1 : arr.length);
  };
  const sd = (arr, sample = true) => Math.sqrt(variance(arr, sample));
  const corPearson = (x, y) => {
    const n = x.length;
    if (n < 2) return 0;
    const mx = mean(x), my = mean(y);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] - mx, b = y[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    return dx > 1e-18 && dy > 1e-18 ? num / Math.sqrt(dx * dy) : 0;
  };

  /* Dense linear system solver A x = b via Gaussian elimination with partial pivoting */
  function solveLinear(A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = col, maxVal = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > maxVal) {
          maxVal = Math.abs(M[r][col]);
          piv = r;
        }
      }
      if (maxVal < 1e-14) M[piv][col] += 1e-10;
      if (piv !== col) {
        const tmp = M[col];
        M[col] = M[piv];
        M[piv] = tmp;
      }
      const diag = M[col][col];
      for (let r = col + 1; r < n; r++) {
        const f = M[r][col] / diag;
        if (f === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
      x[r] = s / (M[r][r] || 1e-12);
    }
    return Array.from(x);
  }

  function matMul(A, B) {
    const m = A.length, k = A[0].length, n = B[0].length;
    const C = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let i = 0; i < m; i++) {
      for (let p = 0; p < k; p++) {
        const aip = A[i][p];
        if (aip === 0) continue;
        for (let j = 0; j < n; j++) C[i][j] += aip * B[p][j];
      }
    }
    return C;
  }

  function matTranspose(A) {
    const m = A.length, n = A[0].length;
    const T = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) T[j][i] = A[i][j];
    return T;
  }

  /* ==================== DIRECTED CONTAGION: FIT HELPERS, SPECTRAL RADIUS, GFEVD ==================== */

  /* Spectral radius rho(Phi) = max_i |lambda_i(Phi)|.
     For non-negative or nearly non-negative matrices, Perron-Frobenius guarantees the spectral radius
     is achieved by a real non-negative eigenvalue, which we cross-check with power iteration on Phi^k
     and Gelfand's formula ||Phi^k||_F^(1/k). */
  /* All eigenvalues of a real square matrix: reduction to Hessenberg form by stabilized elimination, then the shifted
     double-step QR iteration (EISPACK elmhes/hqr). Returns { re, im }, or null if the iteration does not converge. */
  function eigenvalues(Ain) {
    const n = Ain.length;
    const a = Ain.map(r => Float64Array.from(r));
    for (let m = 1; m < n - 1; m++) {
      let x = 0, i = m;
      for (let j = m; j < n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
      if (i !== m) {
        for (let j = m - 1; j < n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
        for (let j = 0; j < n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
      }
      if (x !== 0) {
        for (let r = m + 1; r < n; r++) {
          let y = a[r][m - 1];
          if (y !== 0) {
            y /= x;
            a[r][m - 1] = y;
            for (let j = m; j < n; j++) a[r][j] -= y * a[m][j];
            for (let j = 0; j < n; j++) a[j][m] += y * a[j][r];
          }
        }
      }
    }
    for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i][j] = 0;
    const wr = new Float64Array(n), wi = new Float64Array(n);
    let anorm = 0;
    for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);
    let nn = n - 1, t = 0;
    while (nn >= 0) {
      let its = 0, l;
      do {
        for (l = nn; l >= 1; l--) {
          let s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
          if (s === 0) s = anorm;
          if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
        }
        let x = a[nn][nn];
        if (l === nn) {
          wr[nn] = x + t; wi[nn--] = 0;
        } else {
          let y = a[nn - 1][nn - 1], w = a[nn][nn - 1] * a[nn - 1][nn];
          if (l === nn - 1) {
            const p = 0.5 * (y - x), q = p * p + w;
            let z = Math.sqrt(Math.abs(q));
            x += t;
            if (q >= 0) {
              z = p + (p >= 0 ? Math.abs(z) : -Math.abs(z));
              wr[nn - 1] = wr[nn] = x + z;
              if (z) wr[nn] = x - w / z;
              wi[nn - 1] = wi[nn] = 0;
            } else {
              wr[nn - 1] = wr[nn] = x + p;
              wi[nn - 1] = -(wi[nn] = z);
            }
            nn -= 2;
          } else {
            if (its === 60) return null;
            if (its === 10 || its === 20) {
              t += x;
              for (let i = 0; i <= nn; i++) a[i][i] -= x;
              const s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
              y = x = 0.75 * s;
              w = -0.4375 * s * s;
            }
            ++its;
            let m, p, q, r, z;
            for (m = nn - 2; m >= l; m--) {
              z = a[m][m];
              r = x - z;
              const s = y - z;
              p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
              q = a[m + 1][m + 1] - z - r - s;
              r = a[m + 2][m + 1];
              const sc = Math.abs(p) + Math.abs(q) + Math.abs(r);
              p /= sc; q /= sc; r /= sc;
              if (m === l) break;
              const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
              const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
              if (u + v === v) break;
            }
            for (let i = m + 2; i <= nn; i++) {
              a[i][i - 2] = 0;
              if (i !== m + 2) a[i][i - 3] = 0;
            }
            for (let k = m; k <= nn - 1; k++) {
              if (k !== m) {
                p = a[k][k - 1]; q = a[k + 1][k - 1]; r = 0;
                if (k !== nn - 1) r = a[k + 2][k - 1];
                if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; }
              }
              const nrm = Math.sqrt(p * p + q * q + r * r), s = p >= 0 ? nrm : -nrm;
              if (s !== 0) {
                if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s * x;
                p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
                for (let j = k; j <= nn; j++) {
                  p = a[k][j] + q * a[k + 1][j];
                  if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; }
                  a[k + 1][j] -= p * y; a[k][j] -= p * x;
                }
                const mmin = nn < k + 3 ? nn : k + 3;
                for (let i = l; i <= mmin; i++) {
                  p = x * a[i][k] + y * a[i][k + 1];
                  if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; }
                  a[i][k + 1] -= p * q; a[i][k] -= p;
                }
              }
            }
          }
        }
      } while (l < nn - 1);
    }
    return { re: Array.from(wr), im: Array.from(wi) };
  }

  /* Largest eigenvalue modulus, from all eigenvalues (fixed 2026-11-09: an 80-step power iteration stopped early
     when the top two eigenvalues were close, e.g. 0.830297 for a true 0.829219). NaN if the iteration fails. */
  function spectralRadius(Phi) {
    if (!Phi.length) return 0;
    const ev = eigenvalues(Phi);
    if (!ev) return NaN;
    return Math.max(...ev.re.map((re, i) => Math.hypot(re, ev.im[i])));
  }

  /* Diebold-Yilmaz / Pesaran-Shin Generalized FEVD */
  function gfevd(Phi, Sigma, H = 10) {
    const N = Phi.length;
    const A = [Array.from({ length: N }, (_, i) => Array.from({ length: N }, (__, j) => (i === j ? 1 : 0)))];
    for (let h = 1; h < H; h++) A.push(matMul(Phi, A[h - 1]));

    const ASig = A.map(Ah => matMul(Ah, Sigma));
    const ASigAt = A.map((Ah, h) => matMul(ASig[h], matTranspose(Ah)));

    const th = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      let den = 0;
      for (let h = 0; h < H; h++) den += ASigAt[h][i][i];
      den = Math.max(den, 1e-12);
      let rowSum = 0;
      for (let j = 0; j < N; j++) {
        let num = 0;
        for (let h = 0; h < H; h++) num += ASig[h][i][j] * ASig[h][i][j];
        th[i][j] = num / Math.max(Sigma[j][j], 1e-12) / den;
        rowSum += th[i][j];
      }
      for (let j = 0; j < N; j++) th[i][j] /= (rowSum || 1);
    }
    return th;
  }

  /* Connectedness summary */
  function connectedness(theta) {
    const N = theta.length;
    const d = theta.map((row, i) => row[i]);
    const TO = new Array(N).fill(0);
    const FROM = new Array(N).fill(0);
    let offDiagSum = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i !== j) {
          TO[j] += theta[i][j] * 100;
          FROM[i] += theta[i][j] * 100;
          offDiagSum += theta[i][j];
        }
      }
    }
    const NET = TO.map((to, j) => to - FROM[j]);
    const total = (offDiagSum / N) * 100;
    let topIdx = 0;
    for (let j = 1; j < N; j++) if (NET[j] > NET[topIdx]) topIdx = j;
    return { TO, FROM, NET, total, topTransmitterIndex: topIdx, maxNet: NET[topIdx] };
  }

  /* Horizon-Integrated Transmitter AUC across H = 1..Hmax */
  /* ==================== CONTAGION: CORRECTED METHOD ====================
     Fit x_t = c + A x_{t-1} + e_t with every coupling A_ij >= 0 (self-loops included), a free intercept, and a ridge of
     0.001 x (T - 1) on A, after dividing the panel by its pooled standard deviation, so no result depends on recording
     units. Scores on the fitted kernel: net connectedness (generalized FEVD, H = 10) and downstream reach (16 steps of
     propagation). Data-level checks: kernel asymmetry against shifted panels, and time reversal. Nothing here imposes an
     action on the system: a control experiment that removes stress at a unit needs an action that does not exist for
     tide gauges, so it is not part of this engine (removed 2026-11-09). */
  const CONTAGION_SETTINGS = { ridge: 0.001, fevdHorizon: 10, reachHorizon: 16 };

  function pooledScale(M) {
    const T = M.length, N = M[0].length;
    let acc = 0;
    for (let j = 0; j < N; j++) {
      let m = 0, v = 0;
      for (let t = 0; t < T; t++) m += M[t][j];
      m /= T;
      for (let t = 0; t < T; t++) v += (M[t][j] - m) ** 2;
      acc += v / T;
    }
    return Math.sqrt(acc / N);
  }

  /* Nonnegative ridge least squares per equation (intercept removed by centering), solved by coordinate descent to the
     KKT conditions; returns the largest KKT violation so a caller can see the fit is exact. */
  function fitContagion(Z, ridge = CONTAGION_SETTINGS.ridge) {
    return fitContagionPairs(Z.slice(0, -1), Z.slice(1), ridge);
  }

  /* The same fit on paired rows: X[t] is the state before, Y[t] the state after (a bootstrap passes resampled pairs). */
  function fitContagionPairs(X, Y, ridge = CONTAGION_SETTINGS.ridge) {
    const T1 = X.length, N = X[0].length;
    const mx = new Array(N).fill(0), my = new Array(N).fill(0);
    for (let t = 0; t < T1; t++) for (let j = 0; j < N; j++) { mx[j] += X[t][j] / T1; my[j] += Y[t][j] / T1; }
    const G = Array.from({ length: N }, () => new Array(N).fill(0));
    const XY = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let t = 0; t < T1; t++) {
      for (let j = 0; j < N; j++) {
        const xj = X[t][j] - mx[j];
        for (let k = 0; k < N; k++) G[j][k] += xj * (X[t][k] - mx[k]);
        for (let i = 0; i < N; i++) XY[j][i] += xj * (Y[t][i] - my[i]);
      }
    }
    for (let j = 0; j < N; j++) G[j][j] += ridge * T1;
    const A = Array.from({ length: N }, () => new Array(N).fill(0));
    let kkt = 0;
    for (let i = 0; i < N; i++) {
      const a = A[i], g = XY.map(r => r[i]);
      const scale = Math.max(1e-300, ...g.map(Math.abs));
      for (let sweep = 0; sweep < 100000; sweep++) {
        let change = 0;
        for (let j = 0; j < N; j++) {
          let s = g[j];
          for (let k = 0; k < N; k++) if (k !== j) s -= G[j][k] * a[k];
          const nv = Math.max(0, s / G[j][j]);
          change = Math.max(change, Math.abs(nv - a[j]) * G[j][j]);
          a[j] = nv;
        }
        if (change <= 1e-14 * scale) break;
      }
      for (let j = 0; j < N; j++) {
        let grad = -g[j];
        for (let k = 0; k < N; k++) grad += G[j][k] * a[k];
        kkt = Math.max(kkt, (a[j] > 0 ? Math.abs(grad) : Math.max(0, -grad)) / scale);
      }
    }
    const c = my.map((m, i) => m - A[i].reduce((s, v, j) => s + v * mx[j], 0));
    const E = [];
    for (let t = 0; t < T1; t++) E.push(Y[t].map((y, i) => y - c[i] - A[i].reduce((s, v, j) => s + v * X[t][j], 0)));
    const em = new Array(N).fill(0);
    for (const e of E) for (let i = 0; i < N; i++) em[i] += e[i] / T1;
    const Sigma = Array.from({ length: N }, () => new Array(N).fill(0));
    for (const e of E) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) Sigma[i][j] += ((e[i] - em[i]) * (e[j] - em[j])) / (T1 - 1);
    return { A, c, Sigma, kktViolation: kkt };
  }

  function netScore(A, Sigma, H = CONTAGION_SETTINGS.fevdHorizon) {
    return connectedness(gfevd(A, Sigma, H)).NET;
  }

  /* W[k] = 1' (A + A^2 + ... + A^k): stress avoided downstream over k steps per unit removed at each node */
  function reachTable(A, T = CONTAGION_SETTINGS.reachHorizon) {
    const N = A.length;
    const W = [new Array(N).fill(0)];
    let row = new Array(N).fill(1);
    for (let k = 1; k <= T; k++) {
      row = Array.from({ length: N }, (_, j) => row.reduce((s, v, i) => s + v * A[i][j], 0));
      W.push(W[k - 1].map((w, j) => w + row[j]));
    }
    return W;
  }

  function averageRanks(arr) {
    const order = arr.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const ranks = new Array(arr.length);
    for (let k = 0; k < order.length; ) {
      let e = k;
      while (e + 1 < order.length && order[e + 1][0] === order[k][0]) e++;
      for (let q = k; q <= e; q++) ranks[order[q][1]] = (k + e) / 2 + 1;
      k = e + 1;
    }
    return ranks;
  }

  function kernelAsymmetry(A) {
    let num = 0, den = 0;
    for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) { num += (A[i][j] - A[j][i]) ** 2; den += A[i][j] ** 2; }
    return Math.sqrt(num) / Math.sqrt(den);
  }

  function timeReversalCheck(Z) {
    const f = fitContagion(Z), b = fitContagion(Z.slice().reverse());
    const Nf = netScore(f.A, f.Sigma), Nb = netScore(b.A, b.Sigma);
    const correlation = corPearson(averageRanks(Nf), averageRanks(Nb));
    const top = Nf.indexOf(Math.max(...Nf));
    return { correlation, forwardTopRankInReversed: 1 + Nb.filter(v => v < Nb[top]).length, flagged: correlation > 0 };
  }

  function shiftedPanelCheck(Z, draws = 200, seed = 12345) {
    const observed = kernelAsymmetry(fitContagion(Z).A);
    const rng = makeRng(seed), T = Z.length, N = Z[0].length;
    const vals = [];
    for (let k = 0; k < draws; k++) {
      const off = Array.from({ length: N }, () => 1 + rng.int(T - 1));
      const Zs = Array.from({ length: T }, (_, t) => Array.from({ length: N }, (__, j) => Z[(t - off[j] + T) % T][j]));
      vals.push(kernelAsymmetry(fitContagion(Zs).A));
    }
    const sorted = vals.slice().sort((p, q) => p - q), q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    const p = (1 + vals.filter(v => v >= observed).length) / (draws + 1);
    return { observed, mean: mean(vals), p5: q(0.05), p95: q(0.95), p, beatsShiftedPanels: p < 0.05, draws };
  }

  const argmaxOf = v => v.indexOf(Math.max(...v));

  /* Horizon sensitivity: the top unit by net connectedness at H = 1..15, the top of the net summed over H = 2..15, and
     whether the H = 10 top holds for every H >= 2 and every H >= 4. */
  function horizonProfile(fit, Hmax = 15, base = CONTAGION_SETTINGS.fevdHorizon) {
    const byH = {}, nets = {};
    let integrated = null;
    for (let H = 1; H <= Hmax; H++) {
      const net = netScore(fit.A, fit.Sigma, H);
      nets[H] = net; byH[H] = argmaxOf(net);
      if (H >= 2) integrated = integrated ? integrated.map((v, i) => v + net[i]) : net.slice();
    }
    const b = byH[base], same = from => Object.keys(byH).filter(h => +h >= from).every(h => byH[h] === b);
    return { byH, nets, integratedTop: argmaxOf(integrated), baseTop: b, stableFrom2: same(2), stableFrom4: same(4) };
  }

  /* Stationary bootstrap over the observed transitions (mean block length sqrt(T), wrapping inside the T - 1 transitions,
     so no joined block creates a transition the data do not contain); refit each draw. indexSets may supply the draws. */
  function bootstrapTop(Z, draws = 500, seed = 54321, indexSets = null) {
    const T = Z.length, N = Z[0].length, L = Math.max(2, Math.round(Math.sqrt(T))), rng = makeRng(seed);
    const point = argmaxOf(netScore(fitContagion(Z).A, fitContagion(Z).Sigma));
    const sets = indexSets || Array.from({ length: draws }, () => {
      const idx = [];
      let t = rng.int(T - 1);
      while (idx.length < T - 1) { idx.push(t); t = rng.next() < 1 / L ? rng.int(T - 1) : (t + 1) % (T - 1); }
      return idx;
    });
    const tops = [], nets = [];
    for (const idx of sets) {
      const f = fitContagionPairs(idx.map(i => Z[i]), idx.map(i => Z[i + 1]));
      const net = netScore(f.A, f.Sigma);
      nets.push(net); tops.push(argmaxOf(net));
    }
    const counts = new Array(N).fill(0);
    tops.forEach(k => counts[k]++);
    const modal = argmaxOf(counts);
    const pct = (arr, q) => { const v = arr.slice().sort((a, b) => a - b), h = (v.length - 1) * q, lo = Math.floor(h); return v[lo] + (h - lo) * (v[Math.min(lo + 1, v.length - 1)] - v[lo]); };
    const netInterval = Array.from({ length: N }, (_, j) => [pct(nets.map(n => n[j]), 0.025), pct(nets.map(n => n[j]), 0.975)]);
    return { draws: sets.length, blockLength: L, point, pTop: counts[point] / sets.length, modal, pModal: counts[modal] / sets.length, topShare: counts.map(c => c / sets.length), netInterval, tops, nets };
  }

  function choleskyLower(S) {
    const n = S.length, Lc = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = S[i][j];
      for (let k = 0; k < j; k++) s -= Lc[i][k] * Lc[j][k];
      Lc[i][j] = i === j ? Math.sqrt(Math.max(s, 0)) : s / Lc[j][j];
    }
    return Lc;
  }

  /* Rolling windows: the top unit in each window of WIN rows stepping by STEP, how often it differs from the full-sample
     top, and the mean rank similarity to the full-sample net. The fixed-kernel check simulates panels from the fitted
     kernel (Gaussian or block-resampled residual innovations, mean block 11) and rolls them the same way, to show how much
     the top would move with a kernel that does not move. floorAtZero matches the source's stress model; a series that is
     genuinely negative (surge in a drawdown) needs floorAtZero = false. simulatedPanels may supply the null panels. */
  function rollingTop(Z, options = {}) {
    const WIN = options.window ?? 24, STEP = options.step ?? 4, T = Z.length;
    const fitFull = fitContagion(Z), netFull = netScore(fitFull.A, fitFull.Sigma), ftop = argmaxOf(netFull);
    const roll = (P, netP) => {
      const ws = [];
      for (let s0 = 0; s0 < P.length - WIN; s0 += STEP) {
        const f = fitContagion(P.slice(s0, s0 + WIN)), net = netScore(f.A, f.Sigma);
        ws.push({ start: s0, top: argmaxOf(net), net });
      }
      const top = argmaxOf(netP);
      return { ws, shift: ws.filter(w => w.top !== top).length / ws.length, distinct: new Set(ws.map(w => w.top)).size };
    };
    const obs = roll(Z, netFull);
    const sims = obs.ws.map(w => corPearson(averageRanks(w.net), averageRanks(netFull))).filter(Number.isFinite);
    const floor = options.floorAtZero ?? true, rng = makeRng(options.seed ?? 7), N = Z[0].length;
    const Res = Z.slice(1).map((y, t) => y.map((v, i) => v - fitFull.c[i] - fitFull.A[i].reduce((a, q, j) => a + q * Z[t][j], 0)));
    const Lc = choleskyLower(fitFull.Sigma.map((r, i) => r.map((v, j) => v + (i === j ? 1e-9 : 0))));
    const simulate = kind => {
      const xs = [Z[0].slice()];
      let pos = null;
      if (kind === 'residual') {
        pos = [];
        let q = rng.int(T - 1);
        while (pos.length < T) { pos.push(q); q = rng.next() < 1 / 11 ? rng.int(T - 1) : (q + 1) % (T - 1); }
      }
      for (let t = 1; t < T; t++) {
        const e = kind === 'gaussian' ? (() => { const g = Array.from({ length: N }, () => rng.normal()); return Lc.map(r => r.reduce((a, v, k) => a + v * g[k], 0)); })() : Res[pos[t]];
        xs.push(fitFull.A.map((r, i) => { const v = fitFull.c[i] + r.reduce((a, q, j) => a + q * xs[t - 1][j], 0) + e[i]; return floor ? Math.max(0, v) : v; }));
      }
      return xs;
    };
    const fixedKernel = {};
    for (const kind of ['gaussian', 'residual']) {
      const panels = options.simulatedPanels ? options.simulatedPanels[kind] : Array.from({ length: options.nullDraws ?? 40 }, () => simulate(kind));
      const outs = panels.map(xs => { const f = fitContagion(xs); return roll(xs, netScore(f.A, f.Sigma)); });
      const sh = outs.map(o => o.shift).sort((a, b) => a - b), di = outs.map(o => o.distinct);
      const q = p => { const h = (sh.length - 1) * p, lo = Math.floor(h); return sh[lo] + (h - lo) * (sh[Math.min(lo + 1, sh.length - 1)] - sh[lo]); };
      fixedKernel[kind] = { shift: mean(sh), shiftP10: q(0.1), shiftP90: q(0.9), distinct: mean(di), distinctMin: Math.min(...di), distinctMax: Math.max(...di), draws: outs.length };
    }
    return { window: WIN, step: STEP, windows: obs.ws.length, fullTop: ftop, timeline: obs.ws.map(w => ({ start: w.start, top: w.top })), shift: obs.shift, distinct: obs.distinct,
      rankSimilarity: sims.length ? mean(sims) : NaN, fixedKernel, floorAtZero: floor,
      movesMoreThanAFixedKernel: obs.shift > Math.max(fixedKernel.gaussian.shiftP90, fixedKernel.residual.shiftP90) };
  }

  /* Out of sample (chronological 75/25): does last step's value at the training-fold transmitter forecast the mean of the
     other units better than last step's value at the training-fold loudest unit? AR(1) baseline; least squares on the
     training fold; mean squared error on the test fold. lead = percentage-point gain of the transmitter over the loudest. */
  function outOfSampleCheck(M) {
    const T = M.length, N = M[0].length, ntr = Math.floor(0.75 * T), tr = M.slice(0, ntr);
    const topOf = P => { const s = pooledScale(P), f = fitContagion(P.map(r => r.map(v => v / s))); return argmaxOf(netScore(f.A, f.Sigma)); };
    const mu = Array.from({ length: N }, (_, j) => mean(tr.map(r => r[j])));
    const sdv = Array.from({ length: N }, (_, j) => Math.sqrt(tr.reduce((a, r) => a + (r[j] - mu[j]) ** 2, 0) / ntr) + 1e-9);
    const Z = M.map(r => r.map((v, j) => (v - mu[j]) / sdv[j]));
    const t0 = topOf(tr), l0 = argmaxOf(Array.from({ length: N }, (_, j) => tr.reduce((a, r) => a + r[j], 0)));
    const down = Array.from({ length: N }, (_, j) => j).filter(j => j !== t0 && j !== l0);
    const Yv = Z.map(r => mean(down.map(j => r[j])));
    const mse = extra => {
      const row = t => [1, Yv[t - 1]].concat(extra === null ? [] : [Z[t - 1][extra]]);
      const p = extra === null ? 2 : 3, XtX = Array.from({ length: p }, () => new Array(p).fill(0)), Xty = new Array(p).fill(0);
      for (let t = 1; t < ntr; t++) { const x = row(t); for (let a = 0; a < p; a++) { Xty[a] += x[a] * Yv[t]; for (let b = 0; b < p; b++) XtX[a][b] += x[a] * x[b]; } }
      const beta = solveLinear(XtX, Xty);
      let e = 0, k = 0;
      for (let t = ntr + 1; t < T; t++) { const x = row(t); e += (x.reduce((a, v, i) => a + v * beta[i], 0) - Yv[t]) ** 2; k++; }
      return e / k;
    };
    const ar = mse(null), mt = mse(t0), ml = mse(l0);
    return { trainTop: t0, loudest: l0, stable: t0 === topOf(M), downstream: down, mseAR: ar, mseWithTransmitter: mt, mseWithLoudest: ml,
      lead: 100 * ((ar - mt) / ar - (ar - ml) / ar) };
  }

  /* ==================== TIME-REVERSED GRANGER TEST ====================
     For each unit, net conditional Granger flow (out minus in) from an unrestricted least-squares VAR(1) with intercept on
     the standardized series, minus the same quantity on the time-reversed series; the statistic is the largest across
     units. Dropping unit k's lag from equation j raises its residual sum of squares by B[k][j]^2 / inv(X'X)[k][k], and the
     flow k -> j is log(1 + that rise / RSS_j). Nulls: reversible VAR(1) surrogates that keep the lag-0 covariance S and the
     symmetric part of the lag-1 cross-covariance (A = sym(C1) S^-1, Q = S - A sym(C1)), so every unit's population
     statistic is zero; driven by whitened residuals resampled by time point (primary), by Gaussian noise, or by the
     residuals in their own time order with random signs (wild); and shifted panels, which remove coupling as well as
     direction. P = (1 + number of null maxima >= the statistic) / (K + 1). draws may supply the null's random numbers. */
  function invertSquare(Ain) {
    const n = Ain.length, A = Ain.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      const pv = A[c][c];
      if (Math.abs(pv) < 1e-300) return null;
      for (let k = 0; k < 2 * n; k++) A[c][k] /= pv;
      for (let r = 0; r < n; r++) if (r !== c && A[r][c] !== 0) { const f = A[r][c]; for (let k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map(r => r.slice(n));
  }

  function netGrangerFlow(Z) {
    const T = Z.length, N = Z[0].length, p = N + 1;
    const XtX = Array.from({ length: p }, () => new Array(p).fill(0)), XtY = Array.from({ length: p }, () => new Array(N).fill(0));
    for (let t = 1; t < T; t++) {
      const x = [1].concat(Z[t - 1]);
      for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) XtX[a][b] += x[a] * x[b]; for (let j = 0; j < N; j++) XtY[a][j] += x[a] * Z[t][j]; }
    }
    const inv = invertSquare(XtX);
    const B = inv.map(r => Array.from({ length: N }, (_, j) => r.reduce((acc, v, a) => acc + v * XtY[a][j], 0)));
    const rss = new Array(N).fill(0);
    for (let t = 1; t < T; t++) { const x = [1].concat(Z[t - 1]); for (let j = 0; j < N; j++) { const e = Z[t][j] - x.reduce((acc, v, a) => acc + v * B[a][j], 0); rss[j] += e * e; } }
    const out = new Array(N).fill(0), inn = new Array(N).fill(0);
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
      if (k === j) continue;
      const f = Math.log1p((B[1 + k][j] ** 2 / inv[1 + k][1 + k]) / rss[j]);
      out[k] += f; inn[j] += f;
    }
    return out.map((v, k) => v - inn[k]);
  }

  function trgcStatistic(Z) {
    const f = netGrangerFlow(Z), b = netGrangerFlow(Z.slice().reverse());
    return f.map((v, i) => v - b[i]);
  }

  function reversibleSurrogateModel(Z) {
    const T = Z.length, N = Z[0].length, mu = Array.from({ length: N }, (_, j) => mean(Z.map(r => r[j])));
    const Zc = Z.map(r => r.map((v, j) => v - mu[j]));
    const S = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (__, j) => Zc.reduce((acc, r) => acc + r[i] * r[j], 0) / T));
    const C1 = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (__, j) => { let a = 0; for (let t = 1; t < T; t++) a += Zc[t][i] * Zc[t - 1][j]; return a / T; }));
    const G1 = C1.map((r, i) => r.map((v, j) => 0.5 * (v + C1[j][i])));
    const Sinv = invertSquare(S);
    const A = G1.map(r => Array.from({ length: N }, (_, j) => r.reduce((acc, v, k) => acc + v * Sinv[k][j], 0)));
    const AG = A.map(r => Array.from({ length: N }, (_, j) => r.reduce((acc, v, k) => acc + v * G1[k][j], 0)));
    const Q = S.map((r, i) => r.map((v, j) => v - 0.5 * (AG[i][j] + AG[j][i])));
    const E = Zc.slice(1).map((r, t) => r.map((v, i) => v - A[i].reduce((acc, q, k) => acc + q * Zc[t][k], 0)));
    const em = Array.from({ length: N }, (_, j) => mean(E.map(r => r[j])));
    E.forEach(r => r.forEach((v, j) => { r[j] = v - em[j]; }));
    const covE = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (__, j) => E.reduce((acc, r) => acc + r[i] * r[j], 0) / (E.length - 1) + (i === j ? 1e-10 : 0)));
    const LE = choleskyLower(covE);
    const W = E.map(e => { const w = new Array(N).fill(0); for (let i = 0; i < N; i++) { let v = e[i]; for (let k = 0; k < i; k++) v -= LE[i][k] * w[k]; w[i] = v / LE[i][i]; } return w; });
    const L = choleskyLower(Q.map((r, i) => r.map((v, j) => v + (i === j ? 1e-10 : 0))));
    return { A, Q, L, W };
  }

  function trgcTest(M, names, options = {}) {
    const K = options.draws ?? 1000, burn = 100, T = M.length, N = M[0].length, rng = makeRng(options.seed ?? 2028), inj = options.injected || {};
    const mu = Array.from({ length: N }, (_, j) => mean(M.map(r => r[j])));
    const sdv = Array.from({ length: N }, (_, j) => Math.sqrt(M.reduce((acc, r) => acc + (r[j] - mu[j]) ** 2, 0) / T) + 1e-12);
    const Z = M.map(r => r.map((v, j) => (v - mu[j]) / sdv[j]));
    const s = trgcStatistic(Z), top = argmaxOf(s), stat = s[top];
    const model = reversibleSurrogateModel(Z), n = model.W.length;
    const pOf = maxima => (1 + maxima.filter(v => v >= stat).length) / (maxima.length + 1);
    const surrogateMaxima = kind => {
      const reps = inj[kind] ? inj[kind].length : K, maxima = [];
      for (let k = 0; k < reps; k++) {
        let x = new Array(N).fill(0);
        const X = [];
        for (let t = 0; t < burn + T; t++) {
          let e;
          if (kind === 'gaussian') e = inj.gaussian ? inj.gaussian[k][t] : Array.from({ length: N }, () => rng.normal());
          else if (kind === 'resampled' || t < burn) e = model.W[inj[kind] ? inj[kind][k][t] : rng.int(n)];
          else { const sign = inj.wild ? inj.wild[k][t] : (rng.next() < 0.5 ? -1 : 1); e = model.W[(t - burn) % n].map(v => v * sign); }
          const col = model.L.map(r => r.reduce((acc, v, q) => acc + v * e[q], 0));
          x = model.A.map((r, i) => r.reduce((acc, v, q) => acc + v * x[q], 0) + col[i]);
          if (t >= burn) X.push(x.slice());
        }
        maxima.push(Math.max(...trgcStatistic(X)));
      }
      return maxima;
    };
    const shiftedMaxima = () => {
      const reps = inj.shifted ? inj.shifted.length : K, maxima = [];
      for (let k = 0; k < reps; k++) {
        const off = inj.shifted ? inj.shifted[k] : Array.from({ length: N }, () => 1 + rng.int(T - 1));
        maxima.push(Math.max(...trgcStatistic(Array.from({ length: T }, (_, t) => Array.from({ length: N }, (__, j) => Z[(t - off[j] + T) % T][j])))));
      }
      return maxima;
    };
    const scale = Math.sqrt(mean(Array.from({ length: N }, (_, j) => M.reduce((acc, r) => acc + (r[j] - mu[j]) ** 2, 0) / T)));
    const fit = fitContagion(M.map(r => r.map(v => v / scale)));
    const net = netScore(fit.A, fit.Sigma), netTop = argmaxOf(net);
    return { statistic: Object.fromEntries(names.map((nm, i) => [nm, s[i]])), top: names[top], maxStatistic: stat,
      pPrimary: pOf(surrogateMaxima('resampled')), pGaussian: pOf(surrogateMaxima('gaussian')), pWild: pOf(surrogateMaxima('wild')), pShifted: pOf(shiftedMaxima()),
      netTop: names[netTop], sameAsNetTop: top === netTop, rankCorrelationWithNet: corPearson(averageRanks(s), averageRanks(net)), draws: K };
  }

  /* Holm step-down adjustment of a list of P values (keeps their order). */
  function holmAdjust(ps) {
    const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), m = ps.length, adj = new Array(m);
    let run = 0;
    order.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (m - k) * p)); adj[i] = run; });
    return adj;
  }

  /* One panel (rows = time, columns = units): what the fitted kernel says and whether it survives the data-level checks. */
  function analyzeContagionPanel(M, names, options = {}) {
    const S = CONTAGION_SETTINGS;
    const scale = pooledScale(M);
    const Z = M.map(row => row.map(v => v / scale));
    const fit = fitContagion(Z, options.ridge ?? S.ridge);
    const N = names.length;
    const net = netScore(fit.A, fit.Sigma);
    const reach = reachTable(fit.A, S.reachHorizon)[S.reachHorizon];
    const argmax = v => v.indexOf(Math.max(...v));
    const reversal = timeReversalCheck(Z);
    const shifted = shiftedPanelCheck(Z, options.shiftDraws ?? 200, options.seed ?? 12345);
    const nameOf = k => names[k];
    const hz = horizonProfile(fit);
    const bt = options.bootDraws === 0 ? null : bootstrapTop(Z, options.bootDraws ?? 500, options.bootSeed ?? 54321);
    const rl = options.rolling === false ? null : rollingTop(Z, { floorAtZero: options.floorAtZero ?? true, nullDraws: options.nullDraws ?? 40, window: options.window, step: options.step, seed: options.rollSeed });
    const oos = outOfSampleCheck(M);
    return {
      names, pooledScale: scale, fittedRho: spectralRadius(fit.A), kktViolation: fit.kktViolation, kernel: fit.A, intercept: fit.c, residualCovariance: fit.Sigma,
      netFitted: net, reachFitted: reach, fittedTop: names[argmax(net)], fittedReachTop: names[argmax(reach)],
      loudest: names[argmax(Array.from({ length: N }, (_, j) => mean(M.map(r => r[j]))))],
      checks: { kernelAsymmetry: shifted, timeReversal: reversal, clears: shifted.beatsShiftedPanels && !reversal.flagged },
      horizon: { topByHorizon: Object.fromEntries(Object.entries(hz.byH).map(([h, k]) => [h, nameOf(k)])), integratedTop: nameOf(hz.integratedTop),
        stableFrom2: hz.stableFrom2, stableFrom4: hz.stableFrom4 },
      bootstrap: bt && { draws: bt.draws, blockLength: bt.blockLength, top: nameOf(bt.point), pTop: bt.pTop, modal: nameOf(bt.modal), pModal: bt.pModal,
        topShare: Object.fromEntries(names.map((n, i) => [n, bt.topShare[i]])), netInterval95: Object.fromEntries(names.map((n, i) => [n, bt.netInterval[i]])) },
      rolling: rl && { window: rl.window, step: rl.step, windows: rl.windows, fullTop: nameOf(rl.fullTop), timeline: rl.timeline.map(w => ({ start: w.start, top: nameOf(w.top) })),
        shift: rl.shift, distinct: rl.distinct, rankSimilarity: rl.rankSimilarity, fixedKernel: rl.fixedKernel, floorAtZero: rl.floorAtZero, movesMoreThanAFixedKernel: rl.movesMoreThanAFixedKernel },
      outOfSample: { trainTop: nameOf(oos.trainTop), loudest: nameOf(oos.loudest), stable: oos.stable, mseAR: oos.mseAR, mseWithTransmitter: oos.mseWithTransmitter,
        mseWithLoudest: oos.mseWithLoudest, lead: oos.lead }
    };
  }

  /* ==================== STORM REPLAY FROM RECORDED DATA ====================
     Replays one recorded window from the NOAA snapshot (data/storm-gauges.json): hourly verified water level and tide
     prediction at each gauge, and surge = measured - predicted, at their real UTC times. Nothing is modeled, scaled or
     moved in time. With the official records (data/storm-records.json) it adds each storm's best track, its closest
     approach to the gauge, and the archived weather alerts in force during the window. Anything not bundled (forecast
     guidance, official forecast advisories) is reported as not recorded, never invented. Replaced a synthetic replay (sine tide plus a surge bell, a made-up storm
     position and alert, shifted to the present) on 2026-11-09. */
  function recordedStormReplay(snapshot, stormKey, records = null) {
    const w = snapshot && Array.isArray(snapshot.windows) ? snapshot.windows.find(x => x.key === stormKey) : null;
    if (!w || !Array.isArray(snapshot.gauges)) return null;
    const toMs = s => Date.parse(String(s).replace(' ', 'T') + 'Z');
    const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const gauges = snapshot.gauges.map(g => {
      const s = w.series[g.id];
      if (!s) return { id: g.id, name: g.name, lat: g.lat, lon: g.lon, rows: [], missing: true };
      const rows = s.t.map((t, i) => {
        const m = num(s.measured[i]), p = num(s.predicted[i]);
        return { t: toMs(t), measured: m, predicted: p, surge: m !== null && p !== null ? Math.round((m - p) * 1000) / 1000 : null };
      });
      const extreme = (key, sign) => rows.reduce((best, r) => (r[key] !== null && (best === null || sign * r[key] > sign * best[key]) ? r : best), null);
      const hiLevel = extreme('measured', 1), hiSurge = extreme('surge', 1), loSurge = extreme('surge', -1);
      return {
        id: g.id, name: g.name, lat: g.lat, lon: g.lon, rows,
        peakLevelFt: hiLevel && { value: hiLevel.measured, t: hiLevel.t },
        peakSurgeFt: hiSurge && { value: hiSurge.surge, t: hiSurge.t },
        lowestSurgeFt: loSurge && { value: loSurge.surge, t: loSurge.t },
        missingHours: rows.filter(r => r.measured === null || r.predicted === null).length
      };
    });
    const day = v => Date.parse(String(v).replace(/^(\d{4})-?(\d{2})-?(\d{2})$/, '$1-$2-$3') + 'T00:00:00Z');
    const winBegin = day(w.begin), winEnd = day(w.end) + 86400000;
    const notRecorded = { forecastGuidance: 'Not in the recorded snapshot: no archived operational forecast guidance is bundled.' };
    let stormTrack = null, alerts = null;
    const storm = records && records.storms ? records.storms[w.key] : null;
    if (storm && Array.isArray(storm.fixes) && storm.fixes.length) {
      const ref = gauges.find(g => g.id === (records.point && records.point.id)) || gauges[0];
      const R = 6371.0088, rad = Math.PI / 180;
      const km = (la1, lo1, la2, lo2) => {
        const a = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
      };
      const fixes = storm.fixes.map(f => ({ ...f, t: Date.parse(f.t) }));
      let best = { km: Infinity };
      for (let k = 0; k < fixes.length; k++) {
        const a = fixes[k], b = fixes[k + 1] || a, steps = b === a ? 1 : 400;
        for (let q = 0; q < steps; q++) {
          const u = q / steps, lat = a.lat + u * (b.lat - a.lat), lon = a.lon + u * (b.lon - a.lon), d = km(ref.lat, ref.lon, lat, lon);
          if (d < best.km) best = { km: d, t: a.t + u * (b.t - a.t), lat, lon, windKtBefore: a.windKt, windKtAfter: b.windKt };
        }
      }
      stormTrack = {
        id: storm.id, name: storm.name, source: (records.sources || [])[0] || null,
        fixes, inWindow: fixes.filter(f => f.t >= winBegin && f.t < winEnd), landfalls: fixes.filter(f => f.mark === 'L'),
        peakWindKt: Math.max(...fixes.map(f => f.windKt)),
        closestApproach: { toGauge: ref.id, km: best.km, t: best.t, lat: best.lat, lon: best.lon, windKtBefore: best.windKtBefore, windKtAfter: best.windKtAfter,
          method: 'minimum great-circle distance along the track, linear between 6-hourly best-track fixes' }
      };
    } else notRecorded.stormTrack = 'Not in the recorded snapshot: no official storm track is bundled for this window.';
    if (records && records.alerts && Array.isArray(records.alerts[w.key])) {
      alerts = records.alerts[w.key].map(e => ({ ...e, issue: Date.parse(e.issue), expire: Date.parse(e.expire) }))
        .filter(e => e.issue < winEnd && e.expire > winBegin).sort((p, q) => p.issue - q.issue || String(p.name).localeCompare(String(q.name)));
    } else notRecorded.weatherAlerts = 'Not in the recorded snapshot: no archived weather alerts are bundled for this window.';
    notRecorded.stormForecasts = 'Not bundled: the official forecast advisories issued during the storm.';
    return {
      key: w.key, label: w.label, beginUtc: w.begin, endUtc: w.end,
      source: snapshot.source, retrievedAt: snapshot.retrievedAt, datum: snapshot.datum, units: snapshot.units, timeZone: 'UTC', interval: snapshot.interval,
      gauges, stormTrack, alerts, alertsSource: alerts ? (records.sources || [])[1] || null : null,
      notRecorded
    };
  }

  /* =======================================================================================
   * LEARNING WITHIN FIXED SAFETY LIMITS (L0-L7)
   * A verified library: matched against the reference implementation on identical inputs on 2026-11-09. The console
   * shows none of it. It has no real decision options, beliefs, losses, resources or outcomes to give it, and no input
   * is invented for it (the typed-in demo that used to run here was removed on 2026-11-09).
   *  1. Eight levels (L0..L7), the pinned anchor, validateAnlLevels() and canAutoApplyAnl() (evidence >= 20, frozen paths).
   *  2. Rank protection: a centered, contracted readout keeps every prior gap above 2B.
   *  3. Bound and scale: the three-speed momentum rule, its 4x4 mean recurrence and spectral radius; single vs double
   *     retention.
   *  4. Fast/slow damping and the surprise score.
   *  5. Question selection by expected free energy: G = risk + ambiguity + friction - information gain.
   *  6. Entropic Sinkhorn transport with a MISSING row, conservative rounding and a five-pass refinement.
   * ======================================================================================= */

  const ANL_PINNED_ANCHOR_HASH = '5c29a381eb7e';
  const ANL_BOUND_B = 0.05;
  const ANL_MIN_EVIDENCE = 20;
  const ANL_FROZEN_PREFIXES = [
    'anchor.',
    'constitution.',
    'safety_rules.',
    'hard_blocks.',
    'emergency_routing.',
    'materials.*.safe_use_constraints',
    'materials.*.thermal_tolerance_c',
    'materials.*.pressure_tolerance_psi',
    'materials.*.load_capacity_kg',
    'materials.*.conductive',
    'materials.*.flammable',
    'templates.*.preconditions',
    'templates.*.abort_conditions',
    'templates.*.risk_tags'
  ];

  const ANL_LEVELS = [
    { level_id: 'L0_constitution', name: 'Level 0: Constitution & Safety Anchor', update_frequency: 'human_release_only', retention_alpha: 1.0, learning_rate_eta: 0.0, safety_frozen: true, allowed_update_targets: [], loss_terms: ['red_line_violation'] },
    { level_id: 'L1_working_memory', name: 'Level 1: Intake & Working Memory', update_frequency: 'every_turn', retention_alpha: 0.0, learning_rate_eta: 1.0, safety_frozen: false, allowed_update_targets: ['session_state'], loss_terms: ['intake_error', 'uncertainty_calibration_error'] },
    { level_id: 'L2_active_inference', name: 'Level 2: Question Selection (EFE)', update_frequency: 'every_turn', retention_alpha: 0.98, learning_rate_eta: 0.01, safety_frozen: false, allowed_update_targets: ['question_priority', 'friction_weights'], loss_terms: ['expected_free_energy', 'question_friction', 'missed_critical_unknown'] },
    { level_id: 'L3_planner', name: 'Level 3: Candidate Option Planner', update_frequency: 'per_problem', retention_alpha: 0.99, learning_rate_eta: 0.005, safety_frozen: false, allowed_update_targets: ['option_ranking_bias', 'subgoal_priority'], loss_terms: ['objective_coverage_error', 'invalid_option_rate'] },
    { level_id: 'L4_transport', name: 'Level 4: Sinkhorn Resource Transport', update_frequency: 'per_option', retention_alpha: 0.995, learning_rate_eta: 0.002, safety_frozen: false, allowed_update_targets: ['ot_cost_weight', 'substitution_preference'], loss_terms: ['transport_cost', 'allocation_disagreement'] },
    { level_id: 'L5_decision', name: 'Level 5: Bounded Decision & Ranking', update_frequency: 'session_batch', retention_alpha: 0.999, learning_rate_eta: 0.001, safety_frozen: false, allowed_update_targets: ['ranking_bias', 'confidence_mapping'], loss_terms: ['ranking_error', 'calibration_error', 'unsafe_recommendation_penalty'] },
    { level_id: 'L6_meta_learner', name: 'Level 6: Transactional Update Router', update_frequency: 'batch', retention_alpha: 0.9999, learning_rate_eta: 0.0005, safety_frozen: false, allowed_update_targets: ['calibration_bins', 'template_confidence', 'adapters'], loss_terms: ['long_term_calibration_error', 'catastrophic_forgetting_penalty', 'review_queue_overflow_penalty'] },
    { level_id: 'L7_knowledge_pack', name: 'Level 7: Curated Domain Knowledge', update_frequency: 'signed_release', retention_alpha: 1.0, learning_rate_eta: 0.0, safety_frozen: true, allowed_update_targets: [], loss_terms: ['expert_review_rejection', 'regression_test_failure'] }
  ];

  function isAnlSafetyCriticalPath(paramName) {
    if (typeof paramName !== 'string' || !paramName) return true;
    for (const pattern of ANL_FROZEN_PREFIXES) {
      if (pattern.includes('*')) {
        const [pre, suf] = pattern.split('*');
        if (paramName.startsWith(pre) && paramName.endsWith(suf)) return true;
      } else if (paramName.startsWith(pattern) || paramName === pattern.replace(/\.$/, '')) {
        return true;
      }
    }
    return false;
  }

  function validateAnlLevels(levels = ANL_LEVELS) {
    const byId = {};
    for (const r of levels) byId[r.level_id] = r;
    for (const frozenId of ['L0_constitution', 'L7_knowledge_pack']) {
      const row = byId[frozenId];
      if (!row || !row.safety_frozen || row.retention_alpha !== 1.0 || row.learning_rate_eta !== 0.0 || (row.allowed_update_targets && row.allowed_update_targets.length > 0)) {
        throw new Error(`${frozenId} must be frozen with retention 1.0, rate 0.0, and no update targets`);
      }
    }
    for (const row of levels) {
      if (row.safety_frozen && (row.retention_alpha !== 1.0 || row.learning_rate_eta !== 0.0)) {
        throw new Error(`${row.level_id} is marked frozen but declares non-zero learning`);
      }
    }
    return true;
  }

  function canAutoApplyAnl(action, levels = ANL_LEVELS) {
    const autoLevels = new Set(['L2_active_inference', 'L3_planner', 'L4_transport', 'L5_decision', 'L6_meta_learner']);
    const row = levels.find(l => l.level_id === action.target_level);
    if (!row || row.safety_frozen || action.safety_critical !== false || action.requires_human_review !== false) return false;
    if (!autoLevels.has(action.target_level)) return false;
    const path = action.parameter_path;
    if (typeof path !== 'string' || isAnlSafetyCriticalPath(path) || path.includes('.safe_use_constraints') || path.includes('.preconditions')) return false;
    if (!row.allowed_update_targets.some(t => path.startsWith(t))) return false;
    return Number.isInteger(action.evidence_count) && action.evidence_count >= ANL_MIN_EVIDENCE;
  }

  /* Rank protection: centered and contracted readout */
  function centerAndContractReadout(options, boundB = ANL_BOUND_B) {
    /* Separate non-fallback eligible options S from inert fallback (fixed at 0.30) */
    const eligible = options.filter(o => !o.fallback && o.approved !== false);
    const m = eligible.length;
    const uVals = eligible.map(o => (o.nativeBias || 0) + (o.memoryBias || 0) + (o.elasticBias || 0));
    const uBar = m > 0 ? mean(uVals) : 0;
    const centered = uVals.map(u => u - uBar);
    const maxAbsC = m > 0 ? Math.max(...centered.map(c => Math.abs(c)), 0) : 0;
    /* Downward float step (1 - 1e-15) guarantees |b_i| <= boundB strictly */
    const scale = maxAbsC > 0 ? Math.min(1.0, (boundB * (1 - 1e-15)) / maxAbsC) : 1.0;

    let eligIdx = 0;
    const scored = options.map(o => {
      if (o.fallback) {
        return {
          ...o,
          rawCombinedU: 0,
          centeredContrastC: 0,
          uncenteredBias: 0,
          contractedBiasB: 0,
          uncenteredScore: 0.30,
          finalScore: 0.30
        };
      }
      const u = uVals[eligIdx];
      const c = centered[eligIdx];
      eligIdx++;
      const uncenteredBias = clamp(u, -boundB, boundB);
      const b = m > 1 ? c * scale : 0; /* With 1 eligible action, centering removes adaptive correction */
      return {
        ...o,
        rawCombinedU: u,
        centeredContrastC: c,
        uncenteredBias,
        contractedBiasB: b,
        uncenteredScore: clamp(o.baseScore + uncenteredBias, 0, 1),
        finalScore: clamp(o.baseScore + b, 0, 1)
      };
    });

    /* Pairwise rank-protection audit */
    const pairwiseGuarantees = [];
    for (let i = 0; i < scored.length; i++) {
      for (let j = i + 1; j < scored.length; j++) {
        const a = scored[i], b = scored[j];
        if (a.fallback || b.fallback) continue;
        const hi = a.baseScore >= b.baseScore ? a : b;
        const lo = a.baseScore >= b.baseScore ? b : a;
        const priorGap = hi.baseScore - lo.baseScore;
        const minAdjustedDiff = priorGap - 2 * boundB;
        const maxReversalGain = -priorGap + 2 * boundB;
        pairwiseGuarantees.push({
          higherId: hi.id,
          lowerId: lo.id,
          higherBase: hi.baseScore,
          lowerBase: lo.baseScore,
          priorGap,
          threshold2B: 2 * boundB,
          minAdjustedDiff,
          maxReversalGain,
          strictlyProtected: priorGap > 2 * boundB,
          canAdaptivelyFlip: priorGap <= 2 * boundB
        });
      }
    }

    return {
      boundB,
      uBar,
      maxAbsC,
      contractionScale: scale,
      options: scored,
      rankedCentered: scored.slice().sort((a, b) => b.finalScore - a.finalScore),
      rankedUncentered: scored.slice().sort((a, b) => b.uncenteredScore - a.uncenteredScore),
      pairwiseGuarantees
    };
  }

  /* 4x4 coupled M3 linear mean recurrence and learning curves */
  function computeM3LinearRecurrenceAndCurves(options = {}) {
    const betaS = options.betaShort ?? 0.90;
    const betaM = options.betaMid ?? 0.99;
    const betaL = options.betaLong ?? 0.999;
    const wS = options.weightShort ?? 0.20;
    const wM = options.weightMid ?? 0.30;
    const wL = options.weightLong ?? 0.50;
    const lambda = options.learningRate ?? 0.001;
    const alpha = options.retentionAlpha ?? 0.999;
    const boundB = options.boundB ?? ANL_BOUND_B;

    /* 3x3 lower-triangular cascade matrix C and input vector v */
    const C = [
      [betaS, 0, 0],
      [(1 - betaM) * betaS, betaM, 0],
      [(1 - betaL) * (1 - betaM) * betaS, (1 - betaL) * betaM, betaL]
    ];
    const v = [
      1 - betaS,
      (1 - betaM) * (1 - betaS),
      (1 - betaL) * (1 - betaM) * (1 - betaS)
    ];
    const w = [wS, wM, wL];
    const wTC = [0, 1, 2].map(j => w[0] * C[0][j] + w[1] * C[1][j] + w[2] * C[2][j]);
    const wTv = w[0] * v[0] + w[1] * v[1] + w[2] * v[2];

    /* 4x4 coupled state transition matrix A on x_t = (m^s_t, m^m_t, m^l_t, theta_t)^T */
    const A = [
      [C[0][0], C[0][1], C[0][2], -v[0]],
      [C[1][0], C[1][1], C[1][2], -v[1]],
      [C[2][0], C[2][1], C[2][2], -v[2]],
      [lambda * wTC[0], lambda * wTC[1], lambda * wTC[2], alpha - lambda * wTv]
    ];
    const bVec = [v[0], v[1], v[2], lambda * wTv];

    /* Compute exact complex eigenvalues and spectral radius of 4x4 A_M3 via Faddeev-LeVerrier + Durand-Kerner
       (spectral radius 0.9987567254...) */
    const mul4 = (X, Y) => {
      const R = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
      for (let i = 0; i < 4; i++)
        for (let k = 0; k < 4; k++)
          for (let j = 0; j < 4; j++) R[i][j] += X[i][k] * Y[k][j];
      return R;
    };
    const tr4 = X => X[0][0] + X[1][1] + X[2][2] + X[3][3];
    const addDiag4 = (X, c) => X.map((r, i) => r.map((val, j) => (i === j ? val + c : val)));
    const M1 = A;
    const c3 = -tr4(M1);
    const M2 = mul4(A, addDiag4(M1, c3));
    const c2 = -0.5 * tr4(M2);
    const M3 = mul4(A, addDiag4(M2, c2));
    const c1 = -tr4(M3) / 3;
    const M4 = mul4(A, addDiag4(M3, c1));
    const c0 = -0.25 * tr4(M4);
    const roots = [
      [0.89, 0.001],
      [0.985, -0.001],
      [0.998, 0.002],
      [0.998, -0.002]
    ];
    const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
    const cSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const cDiv = (a, b) => {
      const d = b[0] * b[0] + b[1] * b[1] || 1e-30;
      return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
    };
    const evalCharPoly = z => {
      let r = [1, 0];
      r = cAdd(cMul(r, z), [c3, 0]);
      r = cAdd(cMul(r, z), [c2, 0]);
      r = cAdd(cMul(r, z), [c1, 0]);
      r = cAdd(cMul(r, z), [c0, 0]);
      return r;
    };
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < 4; i++) {
        const pz = evalCharPoly(roots[i]);
        let den = [1, 0];
        for (let j = 0; j < 4; j++) if (i !== j) den = cMul(den, cSub(roots[i], roots[j]));
        roots[i] = cSub(roots[i], cDiv(pz, den));
      }
    }
    const eigenvalueModuliA = roots.map(r => Math.hypot(r[0], r[1]));
    const rhoA = Math.max(...eigenvalueModuliA);
    const limitingMeanBiasUnitSignal = lambda / (1 - alpha + lambda); /* 0.001 / 0.002 = 0.5 */

    /* Simulate 1,500 consecutive positive outcomes (signal = 1.0) under:
       (a) Corrected single-retention rule: theta <- clamp(alpha * theta + delta, -B, B)
       (b) Shipped double-retention wiring defect: theta <- clamp(alpha2 * theta + eta2 * (delta / alpha), -B, B)
           where alpha2 = 0.97, eta2 = 0.03, and an inner division/attenuation cuts steady-state gain by ~1000x */
    const nEpisodes = 1500;
    let mS1 = 0, mM1 = 0, mL1 = 0, thetaCorr = 0;
    let mS2 = 0, mM2 = 0, mL2 = 0, thetaShip = 0;
    const alpha2 = 0.97, eta2 = 0.03;
    const checkpoints = [1, 25, 50, 100, 150, 200, 250, 280, 350, 500, 750, 1000, 1500];
    const trajectory = [];
    let fullBoundEpisode = null;

    for (let ep = 1; ep <= nEpisodes; ep++) {
      /* Corrected single-retention update: feasibility_score = 0.5 + theta_{t-1}, outcome = 1.0 => r_t = 0.5 - theta_{t-1} */
      const sig1 = 0.5 - thetaCorr;
      mS1 = betaS * mS1 + (1 - betaS) * sig1;
      mM1 = betaM * mM1 + (1 - betaM) * mS1;
      mL1 = betaL * mL1 + (1 - betaL) * mM1;
      const eff1 = wS * mS1 + wM * mM1 + wL * mL1;
      const delta1 = lambda * eff1;
      thetaCorr = clamp(alpha * thetaCorr + delta1, -boundB, boundB);
      if (fullBoundEpisode === null && thetaCorr >= boundB - 1e-12) fullBoundEpisode = ep;

      /* Shipped double-retention wiring defect:
         theta <- clamp(alpha2 * theta + eta2 * (delta / alpha), -B, B) with r_t = 0.5 - theta_{t-1} */
      const sig2 = 0.5 - thetaShip;
      mS2 = betaS * mS2 + (1 - betaS) * sig2;
      mM2 = betaM * mM2 + (1 - betaM) * mS2;
      mL2 = betaL * mL2 + (1 - betaL) * mM2;
      const eff2 = wS * mS2 + wM * mM2 + wL * mL2;
      const delta2 = lambda * eff2;
      thetaShip = clamp(alpha2 * thetaShip + eta2 * (delta2 / alpha), -boundB, boundB);

      if (checkpoints.includes(ep)) {
        trajectory.push({
          episode: ep,
          correctedTheta: thetaCorr,
          correctedSharePct: (100 * thetaCorr) / boundB,
          shippedTheta: thetaShip,
          shippedSharePct: (100 * thetaShip) / boundB
        });
      }
    }

    return {
      C,
      v,
      A,
      bVec,
      spectralRadiusA: rhoA,
      limitingMeanBiasUnitSignal,
      /* F1 (fixed 2026-11-09): these used to fall back to the source study's numbers (280, 27.0 and 66.0) when the run
         did not produce them. A run that never reaches the bound now says so with null. */
      fullBoundEpisode,
      shareAt100Pct: trajectory.find(r => r.episode === 100)?.correctedSharePct ?? null,
      shareAt200Pct: trajectory.find(r => r.episode === 200)?.correctedSharePct ?? null,
      shippedAt1500Theta: thetaShip,
      shippedAt1500SharePct: (100 * thetaShip) / boundB,
      trajectory
    };
  }

  function orthogonalizeFastAgainstSlow(deltaFast, deltaSlow, dampingFactor = 0.25) {
    return (deltaFast * deltaSlow < 0) ? deltaFast * dampingFactor : deltaFast;
  }

  function computeCmsSurprise(l2Loss, noveltyScore = 0.0, safetyProximity = 0.0, expertDisagreement = 0.0) {
    const normLoss = Math.min(l2Loss / 0.5, 1.0);
    const surprise = 0.4 * normLoss + 0.3 * noveltyScore + 0.2 * safetyProximity + 0.1 * expertDisagreement;
    return Math.min(surprise, 1.0);
  }

  /* Level 2: Active Inference Expected Free Energy (EFE) Question Selector */
  function evaluateEFEQuestions(beliefStates, questions, decisions, lossMatrix, noise = 0.05) {
    /* Normalize discrete state belief */
    const stateKeys = Object.keys(beliefStates);
    const totalMass = stateKeys.reduce((s, k) => s + beliefStates[k].prob, 0) || 1;
    const belief = {};
    for (const k of stateKeys) belief[k] = beliefStates[k].prob / totalMass;

    const calcEntropy = probs => -probs.reduce((acc, p) => (p > 0 ? acc + p * Math.log(p) : acc), 0);
    const ansProb = (trueVal, ans, opts) => {
      if (opts.length < 2) return ans === trueVal ? 1.0 : 0.0;
      return ans === trueVal ? 1.0 - noise : noise / (opts.length - 1);
    };
    const bestDec = bel => {
      let bestD = decisions[0], bestVal = Infinity;
      for (const d of decisions) {
        let expLoss = 0;
        for (const sKey of stateKeys) expLoss += bel[sKey] * (lossMatrix[d]?.[sKey] ?? 0.5);
        if (expLoss < bestVal) {
          bestVal = expLoss;
          bestD = d;
        }
      }
      return { decision: bestD, expectedLoss: bestVal };
    };

    const priorEntropy = calcEntropy(stateKeys.map(k => belief[k]));
    const stopEval = bestDec(belief);

    const scoredQuestions = questions.map(q => {
      const opts = q.options;
      const friction = q.friction ?? 0.02;
      /* Predictive answer distribution P(a | q) */
      const pred = {};
      for (const a of opts) {
        let sumP = 0;
        for (const sKey of stateKeys) {
          sumP += belief[sKey] * ansProb(beliefStates[sKey].vars[q.variable], a, opts);
        }
        pred[a] = sumP;
      }

      let risk = 0, postEntropy = 0;
      for (const a of opts) {
        const pA = pred[a];
        if (pA <= 0) continue;
        const post = {};
        for (const sKey of stateKeys) {
          post[sKey] = (belief[sKey] * ansProb(beliefStates[sKey].vars[q.variable], a, opts)) / pA;
        }
        risk += pA * bestDec(post).expectedLoss;
        postEntropy += pA * calcEntropy(stateKeys.map(k => post[k]));
      }

      let ambiguity = 0;
      for (const sKey of stateKeys) {
        const condProbs = opts.map(a => ansProb(beliefStates[sKey].vars[q.variable], a, opts));
        ambiguity += belief[sKey] * calcEntropy(condProbs);
      }

      const infoGain = priorEntropy - postEntropy;
      const G = risk + ambiguity + friction - infoGain;
      const twoTermG = risk + ambiguity + friction;
      return {
        id: q.id || q.variable,
        label: q.label || q.variable,
        variable: q.variable,
        noise,
        risk,
        ambiguity,
        friction,
        informationGain: infoGain,
        G,
        twoTermG,
        beatsStop: G < stopEval.expectedLoss
      };
    });

    scoredQuestions.sort((a, b) => a.G - b.G);
    const topQ = scoredQuestions[0];
    return {
      stopValue: stopEval.expectedLoss,
      stopDecision: stopEval.decision,
      priorEntropy,
      selectedQuestion: topQ && topQ.G < stopEval.expectedLoss ? topQ.id : null,
      questions: scoredQuestions
    };
  }

  /* Level 4: Entropic Sinkhorn Optimal Transport with MISSING Slack & 5-Pass Depth Refinement */
  function feasibleRoundingAnl(plan, costs, supplies, demands) {
    const rows = supplies.length, cols = demands.length;
    const real = Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (__, j) => (costs[i][j] === null || costs[i][j] === undefined ? 0.0 : Math.max(0, plan[i][j])))
    );
    const capVec = (vals, limit) => {
      const tot = vals.reduce((a, b) => a + b, 0);
      if (tot <= limit) return vals.slice();
      if (limit <= 0) return new Array(vals.length).fill(0);
      const scale = (limit / tot) * (1 - 1e-15);
      return vals.map(v => v * scale);
    };
    for (let i = 0; i < rows; i++) real[i] = capVec(real[i], supplies[i]);
    for (let j = 0; j < cols; j++) {
      const col = capVec(real.map(r => r[j]), demands[j]);
      for (let i = 0; i < rows; i++) real[i][j] = col[i];
    }
    const rowUsed = real.map(r => r.reduce((a, b) => a + b, 0));
    const colUsed = Array.from({ length: cols }, (_, j) => real.reduce((s, r) => s + r[j], 0));
    const rounded = real.map((r, i) => r.concat([Math.max(0, supplies[i] - rowUsed[i])]));
    const missingRow = colUsed.map((u, j) => Math.max(0, demands[j] - u)).concat([rowUsed.reduce((a, b) => a + b, 0)]);
    rounded.push(missingRow);
    return rounded;
  }

  /* iterations = 5000, as in the reference transport code: at 600 the residual tolerance was not always reached and the
     plan differed from the reference by up to 0.019 (fixed 2026-11-09). */
  function sinkhornAnl(costs, supplies, demands, missingCosts, epsilon = 0.05, iterations = 5000, tolerance = 1e-3) {
    const rows = supplies.length, cols = demands.length;
    const table = costs.map(r => r.map(c => (c === null || c === undefined ? Infinity : c)).concat([0.0]));
    table.push(missingCosts.slice().concat([0.0]));
    const rowMass = supplies.slice().concat([demands.reduce((a, b) => a + b, 0)]);
    const colMass = demands.slice().concat([supplies.reduce((a, b) => a + b, 0)]);
    const totalRowMass = rowMass.reduce((a, b) => a + b, 0);
    const logK = table.map(r => r.map(c => (c === Infinity ? null : -c / epsilon)));
    const logU = rowMass.map(m => (m > 0 ? 0.0 : -Infinity));
    const logV = colMass.map(m => (m > 0 ? 0.0 : -Infinity));

    const logSumExp = arr => {
      const valid = arr.filter(v => v !== null && v > -Infinity);
      if (!valid.length) return -Infinity;
      const mx = Math.max(...valid);
      let s = 0;
      for (const v of valid) s += Math.exp(v - mx);
      return mx + Math.log(s);
    };

    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i <= rows; i++) {
        if (rowMass[i] > 0) {
          logU[i] = Math.log(rowMass[i]) - logSumExp(logV.map((lv, j) => (logK[i][j] === null ? null : logK[i][j] + lv)));
        }
      }
      for (let j = 0; j <= cols; j++) {
        if (colMass[j] > 0) {
          logV[j] = Math.log(colMass[j]) - logSumExp(logU.map((lu, i) => (logK[i][j] === null ? null : logK[i][j] + lu)));
        }
      }
      let worst = 0;
      for (let i = 0; i <= rows; i++) {
        if (rowMass[i] > 0) {
          const mHat = Math.exp(logU[i] + logSumExp(logV.map((lv, j) => (logK[i][j] === null ? null : logK[i][j] + lv))));
          worst = Math.max(worst, Math.abs(mHat - rowMass[i]));
        }
      }
      if (worst <= tolerance * totalRowMass) break;
    }

    const plan = Array.from({ length: rows + 1 }, (_, i) =>
      Array.from({ length: cols + 1 }, (__, j) =>
        (logK[i][j] === null || rowMass[i] <= 0 || colMass[j] <= 0) ? 0.0 : Math.exp(logK[i][j] + logU[i] + logV[j])
      )
    );
    return feasibleRoundingAnl(plan, costs, supplies, demands);
  }

  function solveSinkhornRefinementAnl(costs, supplies, demands, criticalFlags, baseMissing = 2.0, epsilon = 0.05, maxIterations = 5) {
    let missing = criticalFlags.map(flag => baseMissing * (flag ? 2.0 : 1.0));
    const cols = demands.length;
    const totalDemand = demands.reduce((a, b) => a + b, 0) || 1;
    let best = null;
    let firstPassUnmetCritical = null;

    for (let iter = 1; iter <= maxIterations; iter++) {
      const plan = sinkhornAnl(costs, supplies, demands, missing, epsilon);
      const unmet = Array.from({ length: cols }, (_, j) => plan[supplies.length][j]);
      let assignedCost = 0;
      for (let i = 0; i < supplies.length; i++) {
        for (let j = 0; j < cols; j++) {
          if (costs[i][j] !== null && costs[i][j] !== undefined && plan[i][j] > 0) {
            assignedCost += plan[i][j] * costs[i][j];
          }
        }
      }
      const residual = (assignedCost + 2.0 * unmet.reduce((a, b) => a + b, 0)) / totalDemand;
      const criticalUnmet = unmet.reduce((s, u, j) => s + (criticalFlags[j] ? u : 0), 0);
      if (iter === 1) firstPassUnmetCritical = criticalUnmet;
      if (!best || criticalUnmet < best.criticalUnmet - 1e-12 || (Math.abs(criticalUnmet - best.criticalUnmet) <= 1e-12 && residual < best.residual)) {
        best = { plan, unmet, residual, criticalUnmet, assignedCost };
      }
      best.iterations = iter;
      best.firstPassUnmetCritical = firstPassUnmetCritical;
      if (residual < 0.30 || criticalUnmet <= 0.05) break;
      missing = missing.map((m, j) => m * (criticalFlags[j] && unmet[j] > 0.05 ? 2.0 : 1.0));
    }

    /* Verify forbidden edges carry exact 0 flow */
    let forbiddenFlowSum = 0;
    for (let i = 0; i < supplies.length; i++) {
      for (let j = 0; j < cols; j++) {
        if (costs[i][j] === null || costs[i][j] === undefined) forbiddenFlowSum += best.plan[i][j];
      }
    }
    best.forbiddenFlowSum = forbiddenFlowSum;
    return best;
  }

  root.CWRMath = {
    mulberry32,
    makeRng,
    solveLinear,
    spectralRadius,
    eigenvalues,
    gfevd,
    connectedness,
    CONTAGION_SETTINGS,
    pooledScale,
    fitContagion,
    fitContagionPairs,
    netScore,
    reachTable,
    kernelAsymmetry,
    timeReversalCheck,
    shiftedPanelCheck,
    horizonProfile,
    bootstrapTop,
    rollingTop,
    outOfSampleCheck,
    netGrangerFlow,
    trgcStatistic,
    reversibleSurrogateModel,
    trgcTest,
    holmAdjust,
    analyzeContagionPanel,
    recordedStormReplay,
    ANL_PINNED_ANCHOR_HASH,
    ANL_BOUND_B,
    ANL_LEVELS,
    validateAnlLevels,
    canAutoApplyAnl,
    centerAndContractReadout,
    computeM3LinearRecurrenceAndCurves,
    orthogonalizeFastAgainstSlow,
    computeCmsSurprise,
    evaluateEFEQuestions,
    sinkhornAnl,
    solveSinkhornRefinementAnl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
