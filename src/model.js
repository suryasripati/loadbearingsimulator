const H = 15;
const AMORT = 8;
function adoption(t, G){
  const k = Math.log(81) / G.speed;
  return 1 / (1 + Math.exp(-k * (t - G.mid)));
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
  const B = Math.max(1, Math.round(L.buildYears));
  const years = []; for (let t = 0; t <= H; t++) years.push(t);
  const build = years.map(t => t < B ? L.capex / B : 0);
  const sust  = years.map(t => t >= B ? L.capex / L.life : 0);
  const rev   = years.map(t => G.pool * adoption(t, G) * (L.share / 100) * Math.pow(1 + L.drift / 100, t));
  const ocf   = rev.map(x => x * L.margin / 100);
  const opsNet = years.map(t => ocf[t] - sust[t]);
  const tv = G.tv * Math.max(0, opsNet[H]);
  const cf = years.map(t => opsNet[t] - build[t] * (1 + prem));
  const cfTV = cf.slice(); cfTV[H] += tv;
  const npv = npvOf(cfTV, r);
  const pvBuild = npvOf(build, r);
  const pvOpsNoTV = npvOf(opsNet, r);
  const tvPV = tv / Math.pow(1 + r, H);
  const pvOps = pvOpsNoTV + tvPV;
  const breakEven = pvBuild > 0 ? (pvOps / pvBuild - 1) * 100 : NaN;
  const irr = irrOf(cfTV);
  let cum = 0, payback = null; const cumArr = [];
  for (let t = 0; t <= H; t++){ cum += cf[t]; cumArr.push(cum); if (payback === null && cum >= 0 && t >= B) payback = t; }
  // debt
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
  if (payback === null || payback > L.life) flags.push('life');
  if (hasDebt && -minCum > 0.25 * D) flags.push('debt');
  if (pvOps > 0 && tvPV / pvOps > 0.5) flags.push('tail');
  const merit = L.evidence >= 3;
  const pays = npv >= 0;
  let bin;
  if (merit && pays) bin = flags.length ? 'Pays, but fragile' : 'Durable value';
  else if (merit && !pays) bin = 'Useful, but capital does not earn its cost';
  else if (!merit && pays) bin = 'Pays on assumptions, not evidence';
  else bin = 'Speculative';
  return { years, rev, ocf, opsNet, build, sust, cf, cumArr, tv, tvPV, npv, breakEven, irr, payback,
    minDSCR: hasDebt ? minDSCR : null, shortfall: hasDebt ? Math.max(0, -minCum) : 0, flags, merit, pays, bin, headroom: breakEven - G.premium };
}
if (typeof module !== 'undefined') module.exports = { runLayer, adoption, H };
