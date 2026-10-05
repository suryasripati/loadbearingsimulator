// View modes (Basic, Advanced, Analyst), KPI tiles and the hidden-state check. Pure functions, no DOM; no new
// maths: everything here reads existing model outputs (runLayer, verdictFragility). Modes only change what is
// shown, never an input or a result. CommonJS export for tests; stripped by the build and inlined before the UI.

const MODES = ['basic', 'advanced', 'analyst'];
const MODE_LABELS = { basic: 'Basic', advanced: 'Advanced', analyst: 'Analyst' };
function modeLevel(m){ return MODES.indexOf(m); }
function modeFromHash(hash){ const m = String(hash || '').replace(/^#/, '').toLowerCase(); return MODES.indexOf(m) >= 0 ? m : null; }

function modeDeps(){
  if (typeof module !== 'undefined' && typeof require === 'function') return Object.assign({}, require('./model.js'), require('./defaults.js'));
  return { runLayer, verdictFragility, DEFAULT_LAYERS, DEFAULT_G, DEFAULT_DEF, DEFAULT_CAPEX, DEFAULT_PHASES };
}

// KPI tiles. Status chips are text, never colour alone. Chip rules use signs and counts only, no invented thresholds.
function kpiTiles(layers, G){
  const d = modeDeps();
  const res = layers.map(L => d.runLayer(L, G));
  const N = layers.length;
  // (a) Layers that earn their cost (present value at or above zero).
  const n = res.filter(o => o.npv >= 0).length;
  const earn = { n, N, chip: n === N ? 'Stable' : n === 0 ? 'Fragile' : 'Watch' };
  // (b) Tightest layer: lowest headroom (break-even premium or multiple minus what you pay). Not-meaningful headrooms are skipped.
  let tight = null;
  res.forEach((o, i) => { if (isFinite(o.headroom) && (tight === null || o.headroom < tight.headroom)) tight = { index: i, name: layers[i].name, headroom: o.headroom }; });
  if (tight) { tight.unit = G.entryDef === 'B' ? 'x' : '%'; tight.chip = tight.headroom < 0 ? 'Fragile' : 'Stable'; }
  // (c) Share of my allocation in layers that do not earn their cost.
  const tot = layers.reduce((a, L) => a + (L.alloc || 0), 0);
  const placeholder = layers.every(L => { const def = d.DEFAULT_LAYERS.find(x => x.id === L.id); return def && L.alloc === def.alloc; });
  let alloc;
  if (tot <= 0) alloc = { pct: null, placeholder, chip: 'No allocation' };
  else {
    const pct = res.reduce((a, o, i) => a + (o.pays ? 0 : (layers[i].alloc || 0)), 0) / tot * 100;
    alloc = { pct, placeholder, chip: pct === 0 ? 'Stable' : pct === 100 ? 'Fragile' : 'Watch' };
  }
  // (d) Layers whose verdict flips under at least one of the fragility shocks.
  const fr = layers.map(L => d.verdictFragility(L, G));
  const f = fr.filter(x => x.n > 0).length;
  const flips = { n: f, N, chip: f === 0 ? 'Stable' : f === N ? 'Fragile' : 'Watch', perLayer: fr.map(x => x.n) };
  return { earn, tight, alloc, flips };
}

// Analyst-only settings (not editable in Basic or Advanced) that differ from their defaults. Basic-editable inputs
// (scenario, premium, discount rate, evidence, share, a single cash margin, capex, asset life, allocation) never count.
const ANALYST_GLOBALS = [['entryDef', 'Entry price definition'], ['entry', 'Entry year'], ['mult', 'Entry multiple'], ['rd', 'Interest on debt'],
  ['tv', 'Value beyond year 15'], ['capexModel', 'Capex model']];
const ANALYST_LAYER_KEYS = [['offset', 'timing offset'], ['steepness', 'curve steepness'], ['buildStart', 'build start'], ['buildYears', 'build years'],
  ['debt', 'debt'], ['unitCostDecline', 'unit-cost decline'], ['passThrough', 'pass-through']];
const sameArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function analystDiffs(G, layers){
  const d = modeDeps(), out = [];
  const defG = Object.assign({}, d.DEFAULT_G, { entryDef: d.DEFAULT_DEF, capexModel: d.DEFAULT_CAPEX });
  ANALYST_GLOBALS.forEach(([k, label]) => { if (G[k] !== defG[k]) out.push({ scope: 'settings', key: k, label }); });
  if (!sameArr(G.phases, d.DEFAULT_PHASES)) out.push({ scope: 'settings', key: 'phases', label: 'Phase boundaries' });
  layers.forEach(L => {
    const def = d.DEFAULT_LAYERS.find(x => x.id === L.id);
    if (!def) return;
    ANALYST_LAYER_KEYS.forEach(([k, label]) => { if (L[k] !== def[k]) out.push({ scope: L.id, key: k, label: L.name + ': ' + label }); });
    if (!sameArr(L.driftP, def.driftP)) out.push({ scope: L.id, key: 'driftP', label: L.name + ': share drift' });
    if (!L.marginP.every(v => v === L.marginP[0])) out.push({ scope: L.id, key: 'marginP', label: L.name + ': cash margin varies by phase' });
  });
  return out;
}
// Reset only the analyst-only settings. Never touches Basic inputs, allocations or snapshots. A cash margin that
// varies by phase collapses to its first-phase value (the value Basic shows and edits).
function resetAnalyst(G, layers){
  const d = modeDeps();
  const g = Object.assign({}, G, { entryDef: d.DEFAULT_DEF, capexModel: d.DEFAULT_CAPEX, phases: d.DEFAULT_PHASES.slice() });
  ANALYST_GLOBALS.forEach(([k]) => { if (k in d.DEFAULT_G) g[k] = d.DEFAULT_G[k]; });
  const ls = layers.map(L => {
    const def = d.DEFAULT_LAYERS.find(x => x.id === L.id), o = Object.assign({}, L, { driftP: L.driftP.slice(), marginP: L.marginP.slice() });
    if (!def) return o;
    ANALYST_LAYER_KEYS.forEach(([k]) => { o[k] = def[k]; });
    o.driftP = def.driftP.slice();
    o.marginP = [L.marginP[0], L.marginP[0], L.marginP[0]];
    return o;
  });
  return { G: g, layers: ls };
}

if (typeof module !== 'undefined') module.exports = { MODES, MODE_LABELS, modeLevel, modeFromHash, kpiTiles, analystDiffs, resetAnalyst };
