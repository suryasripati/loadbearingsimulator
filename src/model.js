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
// Build start year, whole years from 0, clamped so the build ends inside the horizon (buildStart + buildYears <= H).
function buildStartOf(L){
  const B = Math.max(1, Math.round(L.buildYears));
  return Math.max(0, Math.min(H - B, Math.round(L.buildStart || 0)));
}
// Vintage cohorts (opt-in). Assumptions: replacement happens on time, so capacity stays at 100% after the initial
// build; replacement timing uses asset life rounded to whole years; debt and the Definition A entry price cover the
// initial build only (replacement spend before the entry year is not priced).
// Unit-cost decline lowers the owner's replacement cost. Competition passes a share of it (passThrough, 0 to 1) to
// customers as lower prices; that erosion is routed through share drift (see passThroughFactor), so drift covers
// other commoditisation and passThrough covers erosion caused by cheaper capacity.
// Stranded value is a diagnostic, not a cash item: the cash effect of cheaper capacity already comes through revenue,
// so deducting stranded value as well would double count. For each cohort in use at year t,
// unamortised cost (spend x remaining life / life) x (1 - (1 - decline)^(t - t0)), the gap between book value and
// what the same capacity would cost to buy now.
// Yearly price-erosion factor from cheaper capacity, used only in Vintage mode. passThrough is the share of the
// unit-cost decline that competition passes to customers (0 = owner keeps all the savings, 1 = customers get all).
// Default 0.5 is a placeholder with no view behind it, unsourced.
function passThroughFactor(L, G){
  if (G.capexModel !== 'vintage') return 1;
  const pt = Math.max(0, Math.min(1, L.passThrough === undefined ? 0.5 : L.passThrough));
  return 1 - pt * (L.unitCostDecline || 0) / 100;
}
// Effective share drift in % a year for a given phase drift, after pass-through (equals the phase drift outside Vintage mode).
function effectiveDrift(drift, L, G){ return ((1 + drift / 100) * passThroughFactor(L, G) - 1) * 100; }
function vintageSchedule(L, G, build){
  if (G.capexModel !== 'vintage') return null;
  const d = (L.unitCostDecline || 0) / 100;
  const life = Math.max(1, Math.round(L.life));
  const cohorts = [];
  for (let t = 0; t <= H; t++) if (build[t] > 0) cohorts.push({ t0: t, spend: build[t], replacement: false });
  const repl = new Array(H + 1).fill(0);
  for (let k = 0; k < cohorts.length; k++){
    const c = cohorts[k], tr = c.t0 + life;
    if (tr > H) continue;
    const spend = c.spend * Math.pow(1 - d, life);
    repl[tr] += spend;
    cohorts.push({ t0: tr, spend: spend, replacement: true });
  }
  const stranded = new Array(H + 1).fill(0);
  for (let t = 0; t <= H; t++) for (const c of cohorts){
    if (t < c.t0 || t >= c.t0 + life) continue;
    stranded[t] += c.spend * (c.t0 + life - t) / life * (1 - Math.pow(1 - d, t - c.t0));
  }
  return { repl, cohorts, stranded, peak: Math.max.apply(null, stranded), life,
    normSust: L.capex * Math.pow(1 - d, H) / L.life };
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
  const S = buildStartOf(L);
  const buildEnd = S + B; // first year after the build
  const years = []; for (let t = 0; t <= H; t++) years.push(t);
  const build = years.map(t => t >= S && t < buildEnd ? L.capex / B : 0);
  // Capex model. "sustaining" (v0.1, default): after the build, sustaining spend = build capex / asset life each year.
  // "vintage" (opt-in): each year's build spend is a cohort, replaced at end of life at the same capacity and later
  // prices, original spend x (1 - unit-cost decline)^life. Replacement after year 15 is not charged.
  const vin = vintageSchedule(L, G, build);
  const sust  = vin ? vin.repl : years.map(t => t >= buildEnd ? L.capex / L.life : 0);
  // Capacity limit (assumption, unsourced): capacity scales linearly with build spend, so the layer can serve at most
  // K(t) = cumulative build spend through t / total build capex of full adoption. A first-order stand-in for the
  // utilisation backlog item, to be refined by vintage capex in Drop 2.
  let spent = 0;
  const cap = years.map(t => { spent += build[t]; return L.capex > 0 ? Math.min(1, spent / L.capex) : 1; });
  // Share compounds by the drift of the phase each year falls in. With one constant drift this is (1 + drift)^t.
  // In Vintage mode each year also carries price erosion from cheaper capacity: (1 - passThrough x unit-cost decline).
  const pf = passThroughFactor(L, G);
  const shareMult = [1];
  for (let t = 1; t <= H; t++) shareMult.push(shareMult[t - 1] * (1 + phaseVal(L.driftP, L.drift, t, bounds) / 100) * pf);
  const rev   = years.map(t => G.pool * Math.min(layerAdoption(t, L, G), cap[t]) * (L.share / 100) * shareMult[t]);
  const ocf   = rev.map((x, t) => x * phaseVal(L.marginP, L.margin, t, bounds) / 100);
  const opsNet = years.map(t => ocf[t] - sust[t]);
  // Terminal value: v0.1 uses year-15 cash after sustaining spend. Vintage mode uses a normalised sustaining spend,
  // capex x (1 - decline)^15 / life, instead of the lumpy year-15 replacement; at decline 0 this equals capex / life.
  const tv = vin ? G.tv * Math.max(0, ocf[H] - vin.normSust) : G.tv * Math.max(0, opsNet[H]);

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
  for (let t = 0; t <= H; t++){ cum += cf[t]; cumArr.push(cum); if (payback === null && t >= e && cum >= 0 && t >= buildEnd) payback = t; }
  // debt: describes how the layer itself is financed, so it runs on the layer's full timeline whatever the entry year.
  const D = (L.debt / 100) * L.capex, rd = G.rd / 100;
  let bal = 0, cumCash = 0, minCum = 0, minDSCR = Infinity; const ds = [], draws = [], repays = [];
  for (let t = 0; t <= H; t++){
    const draw = build[t] * (L.debt / 100);
    const interest = rd * bal;
    const repay = (t >= buildEnd && t < buildEnd + AMORT) ? D / AMORT : 0;
    bal = bal + draw - repay;
    const service = interest + repay; ds.push(service); draws.push(draw); repays.push(repay);
    cumCash += opsNet[t] - service; if (cumCash < minCum) minCum = cumCash;
    if (t >= buildEnd && service > 0.0001) minDSCR = Math.min(minDSCR, opsNet[t] / service);
  }
  const hasDebt = L.debt > 0;
  const flags = [];
  // Life flag: years from when your capital first goes in (entry year or build start, whichever is later) to payback
  // exceed asset life. With entry year 0 and build start 0 this is the v0.1 rule.
  const clockStart = Math.max(e, S);
  if (payback === null || payback - clockStart > L.life) flags.push('life');
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
  return { years, rev, ocf, opsNet, build, sust, cap, capexModel: vin ? 'vintage' : 'sustaining',
    cohorts: vin ? vin.cohorts : null, stranded: vin ? vin.stranded : null,
    strandedPeakPct: vin ? vin.peak / L.capex * 100 : null, buildStart: S, buildEnd, clockStart, draws, repays, ds, cf, cumArr, tv, tvPV, npv, breakEven, breakEvenM, bMeaningful, irr, payback,
    entry: e, def, price, minDSCR: hasDebt ? minDSCR : null, shortfall: hasDebt ? Math.max(0, -minCum) : 0, flags, merit, pays, bin, headroom };
}
// NPV grid for one layer: rows are entry years, columns are premiums (Definition A) or multiples (Definition B).
function heatmap(L, G, entries, prices){
  const key = G.entryDef === 'B' ? 'mult' : 'premium';
  return entries.map(e => prices.map(p => runLayer(L, Object.assign({}, G, { entry: e, [key]: p })).npv));
}
// Sensitivity of NPV to one-at-a-time shocks. Shock sizes differ by input: drift moves in points, timing offset
// in years, the entry premium in points, everything else by 25%. Bars are not like-for-like across inputs.
const OFFSET_SHOCK = 2;
// Two-year build delay used by the sensitivity bar and the "verdict changes if the build starts later" line.
// A display choice, not evidence about typical delays.
const BUILD_SHIFT = 2;
function verdictIfBuildLater(L, G){
  const later = Object.assign({}, L, { buildStart: buildStartOf(L) + BUILD_SHIFT });
  return { now: runLayer(L, G).bin, later: runLayer(later, G).bin, shifted: buildStartOf(later) - buildStartOf(L) };
}
const withLayer = (L, f) => {
  const c = Object.assign({}, L);
  if (Array.isArray(L.driftP)) c.driftP = L.driftP.slice();
  if (Array.isArray(L.marginP)) c.marginP = L.marginP.slice();
  f(c); return c;
};
function sensItems(G){
  const items = [
    {id:'pool', n:'Value pool', lab:'±25%', g:(g,k)=>{ g.pool*=k; }, lo:0.75, hi:1.25},
    {id:'share', n:'Layer share of pool', lab:'±25%', L:(L,k)=>{ L.share*=k; }, lo:0.75, hi:1.25},
    {id:'margin', n:'Cash margin, all phases', lab:'±25%', L:(L,k)=>{ if (Array.isArray(L.marginP)) L.marginP = L.marginP.map(v => v*k); else L.margin*=k; }, lo:0.75, hi:1.25},
    {id:'speed', n:'Adoption speed', lab:'±25%', g:(g,k)=>{ g.speed*=k; }, lo:1.25, hi:0.75},
    {id:'mid', n:'Adoption midpoint', lab:'±25%', g:(g,k)=>{ g.mid*=k; }, lo:1.25, hi:0.75},
    {id:'offset', n:'Layer timing offset', lab:'±'+OFFSET_SHOCK+' years', L:(L,k)=>{ L.offset=(L.offset||0)+k; }, lo:OFFSET_SHOCK, hi:-OFFSET_SHOCK},
    {id:'steepness', n:'Layer curve steepness', lab:'±25%', L:(L,k)=>{ L.steepness=(L.steepness||1)*k; }, lo:0.75, hi:1.25},
    {id:'drift', n:'Share drift, all phases', lab:'±3 points', L:(L,k)=>{ if (Array.isArray(L.driftP)) L.driftP = L.driftP.map(v => v+k); else L.drift+=k; }, lo:-3, hi:3},
    {id:'capex', n:'Build capex', lab:'±25%', L:(L,k)=>{ L.capex*=k; }, lo:1.25, hi:0.75},
    {id:'life', n:'Asset life', lab:'±25%', L:(L,k)=>{ L.life=Math.max(1,L.life*k); }, lo:0.75, hi:1.25},
    {id:'disc', n:'Discount rate', lab:'±25%', g:(g,k)=>{ g.disc*=k; }, lo:1.25, hi:0.75},
    {id:'tv', n:'Value beyond year 15', lab:'±25%', g:(g,k)=>{ g.tv*=k; }, lo:0.75, hi:1.25}
  ];
  if (G.capexModel === 'vintage'){
    items.push({id:'decline', n:'Unit-cost decline (\u00b13 points)', lab:'\u00b13 points', L:(L,k)=>{ L.unitCostDecline=(L.unitCostDecline||0)+k; }, lo:-3, hi:3});
    const pt0 = L0pt => (L0pt === undefined ? 0.5 : L0pt);
    items.push({id:'passThrough', n:'Pass-through to prices (\u00b10.25)', lab:'\u00b10.25, clamped to 0\u20131', L:(L,k)=>{ L.passThrough=Math.max(0, Math.min(1, pt0(L.passThrough)+k)); }, lo:0.25, hi:-0.25});
  }
  items.push(G.entryDef === 'B'
    ? {id:'mult', n:'Entry multiple', lab:'±25%', g:(g,k)=>{ g.mult*=k; }, lo:1.25, hi:0.75}
    : {id:'premium', n:'Entry premium', lab:'±25 points', g:(g,k)=>{ g.premium+=k; }, lo:25, hi:-25});
  return items;
}
// Returns one bar per input, after merging inputs that are the same shift by construction:
// - pool, share and margin all multiply operating cash, so +/-25% on each moves NPV identically;
// - layer adoption depends on midpoint + offset only, so they merge when the midpoint shock equals the offset shock in years.
function sensitivity(L, G){
  const base = runLayer(L, G).npv;
  const one = {};
  for (const it of sensItems(G)){
    const run = (k) => { const g = Object.assign({}, G); const l = withLayer(L, x => { if (it.L) it.L(x, k); }); if (it.g) it.g(g, k); return runLayer(l, g).npv; };
    const a = run(it.lo), b = run(it.hi);
    one[it.id] = {id:it.id, n:it.n, lab:it.lab, bad:Math.min(a,b), good:Math.max(a,b), swing:Math.abs(b-a)};
  }
  // Build start: two years later only, because the build cannot start before year 0. One-sided by design.
  const later = withLayer(L, x => { x.buildStart = buildStartOf(L) + BUILD_SHIFT; });
  const shift = buildStartOf(later) - buildStartOf(L);
  const bs = runLayer(later, G).npv;
  one.buildStart = {id:'buildStart', n:'Build start (two years later only; cannot start before year 0)', oneSided:true,
    lab:shift === BUILD_SHIFT ? '+'+BUILD_SHIFT+' years, one-sided' : shift > 0 ? '+'+shift+' year'+(shift>1?'s':'')+' (end of horizon), one-sided' : 'no room to delay, one-sided',
    bad:Math.min(base, bs), good:Math.max(base, bs), swing:Math.abs(bs - base)};
  const rows = [];
  rows.push(Object.assign({}, one.pool, {id:'scale', n:'Scale (pool, share or margin)', lab:'±25%', members:['pool','share','margin']}));
  const midYears = 0.25 * G.mid;
  if (Math.abs(midYears - OFFSET_SHOCK) < 1e-9){
    rows.push(Object.assign({}, one.mid, {id:'timing', n:'Timing (midpoint or layer offset)', lab:'±'+OFFSET_SHOCK+' years', members:['mid','offset']}));
  } else {
    rows.push(Object.assign({}, one.mid, {lab:'±25%, '+midYears.toFixed(1)+' years'}), one.offset);
  }
  for (const id in one) if (['pool','share','margin','mid','offset'].indexOf(id) < 0) rows.push(one[id]);
  rows.sort((p, q) => q.swing - p.swing);
  return { base, rows, parts: one };
}
// Verdict fragility: which tested shocks change a layer's verdict (bin). The shock set is a display choice, not
// evidence about how far inputs might move. A shock that would leave the inputs unchanged (for example pass-through
// already at 0, or no room to start the build later) is not tested and not counted.
const PT_DEFAULT = 0.5;
function fragilityShocks(L, G){
  const vintage = G.capexModel === 'vintage';
  const pt = L.passThrough === undefined ? PT_DEFAULT : L.passThrough;
  const life = (k) => Math.max(1, L.life * k);
  const list = [
    {id:'offset-late', group:'timing', n:'Timing offset 2 years later', L:{offset:(L.offset || 0) + 2}},
    {id:'offset-early', group:'timing', n:'Timing offset 2 years earlier', L:{offset:(L.offset || 0) - 2}},
    {id:'build-late', group:'build', n:'Build starts 2 years later', L:{buildStart:buildStartOf(L) + BUILD_SHIFT},
      skip: buildStartOf(Object.assign({}, L, {buildStart:buildStartOf(L) + BUILD_SHIFT})) === buildStartOf(L)},
    {id:'drift-down', group:'drift', n:'Share drift 3 points lower', L:{driftP:shiftDrift(L, -3), drift:(L.drift || 0) - 3}},
    {id:'drift-up', group:'drift', n:'Share drift 3 points higher', L:{driftP:shiftDrift(L, 3), drift:(L.drift || 0) + 3}},
    {id:'scale-down', group:'scale', n:'Scale 25% lower', L:{share:L.share * 0.75}},
    {id:'scale-up', group:'scale', n:'Scale 25% higher', L:{share:L.share * 1.25}},
    {id:'disc-up', group:'disc', n:'Discount rate 25% higher', G:{disc:G.disc * 1.25}},
    {id:'disc-down', group:'disc', n:'Discount rate 25% lower', G:{disc:G.disc * 0.75}},
    {id:'life-down', group:'life', n:'Asset life 25% shorter', L:{life:life(0.75)}},
    {id:'life-up', group:'life', n:'Asset life 25% longer', L:{life:life(1.25)}}
  ];
  // Keeps the information of the earlier timing note: when an offset is set, test the layer at offset 0.
  if ((L.offset || 0) !== 0) list.push({id:'offset-zero', group:'timing', n:'Timing offset set to 0', L:{offset:0}});
  if (vintage){
    list.push({id:'pt-0', group:'passThrough', n:'Pass-through 0 (owner keeps savings)', L:{passThrough:0}, skip: pt === 0});
    list.push({id:'pt-1', group:'passThrough', n:'Pass-through 1 (competition takes savings)', L:{passThrough:1}, skip: pt === 1});
    list.push({id:'decline-down', group:'decline', n:'Unit-cost decline 3 points lower', L:{unitCostDecline:(L.unitCostDecline || 0) - 3}});
    list.push({id:'decline-up', group:'decline', n:'Unit-cost decline 3 points higher', L:{unitCostDecline:(L.unitCostDecline || 0) + 3}});
  }
  return list.filter(s => !s.skip);
}
function shiftDrift(L, k){ return Array.isArray(L.driftP) ? L.driftP.map(v => v + k) : undefined; }
function verdictFragility(L, G){
  const base = runLayer(L, G);
  const results = fragilityShocks(L, G).map(s => {
    const l = Object.assign({}, L, s.L || {}), g = Object.assign({}, G, s.G || {});
    if (l.driftP === undefined) delete l.driftP;
    const o = runLayer(l, g);
    return { id: s.id, group: s.group, n: s.n, bin: o.bin, npv: o.npv, flips: o.bin !== base.bin };
  });
  const flips = results.filter(r => r.flips);
  return { bin: base.bin, npv: base.npv, results, flips, n: flips.length, m: results.length };
}
if (typeof module !== 'undefined') module.exports = { runLayer, verdictFragility, adoption, layerAdoption, phaseOf, heatmap, sensitivity, effectiveDrift, passThroughFactor, verdictIfBuildLater, buildStartOf, BUILD_SHIFT, H };
