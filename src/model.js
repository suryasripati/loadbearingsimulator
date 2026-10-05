const H = 15;
const AMORT = 8;
// Below this share of the layer's peak operating cash, a forward multiple on year e+1 is reported as
// "not meaningful". This is a display cut-off for near-zero denominators, not an evidence-based threshold.
const B_MIN_OCF_SHARE = 0.01;
function adoption(t, G){
  const k = Math.log(81) / G.speed;
  return 1 / (1 + Math.exp(-k * (t - G.mid)));
}
// Drop 1: one underlying demand curve; each layer leads (offset < 0) or lags (offset > 0) it and can be steeper
// (steepness > 1) or flatter. Offset 0 and steepness 1 give the global curve.
function layerAdoption(t, L, G){
  const off = L.offset || 0, st = L.steepness || 1;
  return adoption(t - off, { speed: G.speed / st, mid: G.mid });
}
// Calendar phases: bounds [b1, b2] split years into [0, b1), [b1, b2), [b2, H].
function phaseOf(t, bounds){
  const b = bounds || [5, 10];
  return t < b[0] ? 0 : t < b[1] ? 1 : 2;
}
// Per-phase value, falling back to the v0.1 constant when no phase array is given.
function phaseVal(arr, constant, t, bounds){
  return Array.isArray(arr) && arr.length === 3 ? arr[phaseOf(t, bounds)] : constant;
}
function npvOf(cf, r){ let s = 0; for (let t = 0; t < cf.length; t++) s += cf[t] / Math.pow(1 + r, t); return s; }
function irrOf(cf){
  let lo = -0.5, hi = 1.5;
  const f = (r) => npvOf(cf, r);
  if (f(lo) * f(hi) > 0) return NaN;
  for (let i = 0; i < 80; i++){
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function runLayer(L, G){
  const r = G.disc / 100, prem = G.premium / 100;
  const def = G.entryDef === 'B' ? 'B' : 'A';
  const e = Math.max(0, Math.min(10, Math.round(G.entry || 0)));
  const M = G.mult || 0;
  const bounds = G.phases;
  const B = Math.max(1, Math.round(L.buildYears));
  const years = []; for (let t = 0; t <= H; t++) years.push(t);
  const build = years.map(t => t < B ? L.capex / B : 0);
  const sust  = years.map(t => t >= B ? L.capex / L.life : 0);
  // Share compounds by the drift of the phase each year falls in. With one constant drift this is (1 + drift)^t.
  const shareMult = [1];
  for (let t = 1; t <= H; t++) shareMult.push(shareMult[t - 1] * (1 + phaseVal(L.driftP, L.drift, t, bounds) / 100));
  const rev   = years.map(t => G.pool * layerAdoption(t, L, G) * (L.share / 100) * shareMult[t]);
  const ocf   = rev.map((x, t) => x * phaseVal(L.marginP, L.margin, t, bounds) / 100);
  const opsNet = years.map(t => ocf[t] - sust[t]);
  const tv = G.tv * Math.max(0, opsNet[H]);

  // Entry year e: the investor owns cash flows from e onward, valued in year-e terms.
  const disc = (t) => Math.pow(1 + r, t - e);
  let pvOpsNoTV = 0, pvBuildFwd = 0;
  for (let t = e; t <= H; t++){ pvOpsNoTV += opsNet[t] / disc(t); pvBuildFwd += build[t] / disc(t); }
  const tvPV = tv / disc(H);
  const pvOps = pvOpsNoTV + tvPV;
  let preBuild = 0; for (let t = 0; t < e; t++) preBuild += build[t];

  // Definition A (replacement-cost premium): pay (1 + p) x build capex already spent, at e; later build at (1 + p).
  const costA = preBuild + pvBuildFwd;
  const breakEven = costA > 0 ? (pvOps / costA - 1) * 100 : NaN;
  // Definition B (forward cash multiple): pay M x operating cash of year e + 1, at e; later build at cost.
  const fwdOcf = ocf[e + 1];
  const peakOcf = Math.max.apply(null, ocf);
  const bMeaningful = fwdOcf > B_MIN_OCF_SHARE * peakOcf && fwdOcf > 0;
  const breakEvenM = bMeaningful ? (pvOps - pvBuildFwd) / fwdOcf : NaN;

  const price = def === 'A' ? (1 + prem) * preBuild : M * fwdOcf;
  const buildMult = def === 'A' ? (1 + prem) : 1;
  const cf = years.map(t => t < e ? 0 : opsNet[t] - build[t] * buildMult - (t === e ? price : 0));
  const cfTV = cf.slice(); cfTV[H] += tv;
  const cfFromE = cfTV.slice(e);
  const npv = npvOf(cfFromE, r);
  const irr = irrOf(cfFromE);
  let cum = 0, payback = null; const cumArr = [];
  for (let t = 0; t <= H; t++){ cum += cf[t]; cumArr.push(cum); if (payback === null && t >= e && cum >= 0 && t >= B) payback = t; }
  // debt: describes how the layer itself is financed, so it runs on the layer's full timeline whatever the entry year.
  const D = (L.debt / 100) * L.capex, rd = G.rd / 100;
  let bal = 0, cumCash = 0, minCum = 0, minDSCR = Infinity; const ds = [];
  for (let t = 0; t <= H; t++){
    const draw = build[t] * (L.debt / 100);
    const interest = rd * bal;
    const repay = (t >= B && t < B + AMORT) ? D / AMORT : 0;
    bal = bal + draw - repay;
    const service = interest + repay; ds.push(service);
    cumCash += opsNet[t] - service; if (cumCash < minCum) minCum = cumCash;
    if (t >= B && service > 0.0001) minDSCR = Math.min(minDSCR, opsNet[t] / service);
  }
  const hasDebt = L.debt > 0;
  const flags = [];
  // Life flag: years from entry to payback exceed asset life (at e = 0 this is the v0.1 rule).
  if (payback === null || payback - e > L.life) flags.push('life');
  if (hasDebt && -minCum > 0.25 * D) flags.push('debt');
  if (pvOps > 0 && tvPV / pvOps > 0.5) flags.push('tail');
  const merit = L.evidence >= 3;
  const pays = npv >= 0;
  let bin;
  if (merit && pays) bin = flags.length ? 'Pays, but fragile' : 'Durable value';
  else if (merit && !pays) bin = 'Useful, but capital does not earn its cost';
  else if (!merit && pays) bin = 'Pays on assumptions, not evidence';
  else bin = 'Speculative';
  const headroom = def === 'A' ? breakEven - G.premium : breakEvenM - M;
  return { years, rev, ocf, opsNet, build, sust, cf, cumArr, tv, tvPV, npv, breakEven, breakEvenM, bMeaningful, irr, payback,
    entry: e, def, price, minDSCR: hasDebt ? minDSCR : null, shortfall: hasDebt ? Math.max(0, -minCum) : 0, flags, merit, pays, bin, headroom };
}
// NPV grid for one layer: rows are entry years, columns are premiums (Definition A) or multiples (Definition B).
function heatmap(L, G, entries, prices){
  const key = G.entryDef === 'B' ? 'mult' : 'premium';
  return entries.map(e => prices.map(p => runLayer(L, Object.assign({}, G, { entry: e, [key]: p })).npv));
}
if (typeof module !== 'undefined') module.exports = { runLayer, adoption, layerAdoption, phaseOf, heatmap, H };
