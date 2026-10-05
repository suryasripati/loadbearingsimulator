const test = require('node:test');
const assert = require('node:assert/strict');
const Mo = require('../src/modes.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');

const baseG = () => ({ ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, capexModel: D.DEFAULT_CAPEX, phases: D.DEFAULT_PHASES.slice() });
const baseLayers = () => D.DEFAULT_LAYERS.map(L => ({ ...L, driftP: L.driftP.slice(), marginP: L.marginP.slice() }));

test('modes: three modes in order; hash parsing', () => {
  assert.deepEqual(Mo.MODES, ['basic', 'advanced', 'analyst']);
  assert.deepEqual(Mo.MODES.map(Mo.modeLevel), [0, 1, 2]);
  assert.equal(Mo.modeFromHash('#advanced'), 'advanced');
  assert.equal(Mo.modeFromHash('#ANALYST'), 'analyst');
  assert.equal(Mo.modeFromHash('basic'), 'basic');
  assert.equal(Mo.modeFromHash('#other'), null);
  assert.equal(Mo.modeFromHash(''), null);
});

// Tile values recomputed here from direct model calls, for several setups.
function expected(layers, G){
  const res = layers.map(L => M.runLayer(L, G));
  const finite = res.map((o, i) => [o.headroom, i]).filter(([h]) => isFinite(h)).sort((a, b) => a[0] - b[0]);
  const tot = layers.reduce((a, L) => a + L.alloc, 0);
  return {
    earn: res.filter(o => o.npv >= 0).length,
    tight: finite.length ? { index: finite[0][1], headroom: finite[0][0] } : null,
    alloc: tot > 0 ? res.reduce((a, o, i) => a + (o.npv >= 0 ? 0 : layers[i].alloc), 0) / tot * 100 : null,
    flips: layers.filter(L => M.verdictFragility(L, G).n > 0).length
  };
}
const setups = () => {
  const out = [];
  out.push(['defaults', baseLayers(), baseG()]);
  out.push(['lead/lag', baseLayers().map((L, i) => ({ ...L, offset: D.LEAD_LAG_EXAMPLE[i] })), baseG()]);
  out.push(['definition B, entry 3', baseLayers(), { ...baseG(), entryDef: 'B', entry: 3 }]);
  out.push(['own allocation', baseLayers().map((L, i) => ({ ...L, alloc: [50, 10, 5, 30, 5][i] })), { ...baseG(), disc: 12 }]);
  out.push(['vintage example', baseLayers().map((L, i) => ({ ...L, unitCostDecline: D.UCD_EXAMPLE[i] })), { ...baseG(), capexModel: 'vintage' }]);
  out.push(['fast adoption', baseLayers(), { ...baseG(), ...D.SCEN.fast }]);
  return out;
};

test('KPI tiles equal direct model calls in every setup', () => {
  for (const [name, layers, G] of setups()) {
    const k = Mo.kpiTiles(layers, G), e = expected(layers, G);
    assert.equal(k.earn.n, e.earn, name + ' earn'); assert.equal(k.earn.N, layers.length);
    if (e.tight) { assert.equal(k.tight.index, e.tight.index, name + ' tightest'); assert.equal(k.tight.headroom, e.tight.headroom); assert.equal(k.tight.name, layers[e.tight.index].name); }
    else assert.equal(k.tight, null);
    if (e.alloc === null) assert.equal(k.alloc.pct, null); else assert.ok(Math.abs(k.alloc.pct - e.alloc) < 1e-12, name + ' alloc');
    assert.equal(k.flips.n, e.flips, name + ' flips');
  }
});

test('KPI tiles: status chips are text from signs and counts only; units follow the entry definition', () => {
  for (const [, layers, G] of setups()) {
    const k = Mo.kpiTiles(layers, G);
    assert.equal(k.earn.chip, k.earn.n === k.earn.N ? 'Stable' : k.earn.n === 0 ? 'Fragile' : 'Watch');
    assert.equal(k.flips.chip, k.flips.n === 0 ? 'Stable' : k.flips.n === k.flips.N ? 'Fragile' : 'Watch');
    if (k.tight) { assert.equal(k.tight.chip, k.tight.headroom < 0 ? 'Fragile' : 'Stable'); assert.equal(k.tight.unit, G.entryDef === 'B' ? 'x' : '%'); }
    if (k.alloc.pct !== null) assert.equal(k.alloc.chip, k.alloc.pct === 0 ? 'Stable' : k.alloc.pct === 100 ? 'Fragile' : 'Watch');
  }
  for (const k of setups().map(([, L, G]) => Mo.kpiTiles(L, G))) for (const c of [k.earn.chip, k.flips.chip, k.alloc.chip]) assert.ok(['Stable', 'Watch', 'Fragile', 'No allocation'].includes(c));
});

test('KPI tiles: the allocation tile knows when allocations are the placeholder equal split, or empty', () => {
  assert.equal(Mo.kpiTiles(baseLayers(), baseG()).alloc.placeholder, true);
  assert.equal(Mo.kpiTiles(baseLayers().map((L, i) => ({ ...L, alloc: i ? 20 : 21 })), baseG()).alloc.placeholder, false);
  const none = Mo.kpiTiles(baseLayers().map(L => ({ ...L, alloc: 0 })), baseG()).alloc;
  assert.deepEqual([none.pct, none.chip], [null, 'No allocation']);
});

test('hidden state: defaults have no analyst-only differences; first-screen inputs never count', () => {
  assert.deepEqual(Mo.analystDiffs(baseG(), baseLayers()), []);
  const G = { ...baseG(), speed: 12, mid: 11, pool: 1500, premium: 40, disc: 12 };
  const layers = baseLayers().map(L => ({ ...L, alloc: 99 }));
  assert.deepEqual(Mo.analystDiffs(G, layers), []);
});

test('hidden state: each analyst-only setting is counted once, including the layer inputs only Analyst shows', () => {
  const G = { ...baseG(), entryDef: 'B', entry: 2, mult: 12, rd: 8, tv: 6, capexModel: 'vintage', phases: [4, 10] };
  assert.equal(Mo.analystDiffs(G, baseLayers()).length, 7);
  const L = baseLayers();
  Object.assign(L[1], { evidence: 4, share: 16, capex: 250, life: 12, offset: -2, steepness: 1.5, buildStart: 1, buildYears: 6, debt: 30, unitCostDecline: 3, passThrough: 0.7 });
  L[1].driftP = [-2, -3, -4]; L[1].marginP = [45, 40, 35];
  const d = Mo.analystDiffs(baseG(), L);
  assert.equal(d.length, 13);
  assert.ok(d.every(x => x.scope === 'dc'));
  assert.ok(d.some(x => x.key === 'marginP' && /cash margin \(varies by phase\)/.test(x.label)));
  const u = baseLayers(); u[2].marginP = [40, 40, 40];
  assert.deepEqual(Mo.analystDiffs(baseG(), u).map(x => x.label), ['Models: cash margin']);
});

test('hidden state: reset clears only analyst-only settings and keeps first-screen inputs and allocations', () => {
  const G = { ...baseG(), speed: 12, mid: 9, pool: 1500, disc: 12, premium: 30, entryDef: 'B', entry: 3, rd: 9, tv: 2, mult: 20, capexModel: 'vintage', phases: [3, 9] };
  const layers = baseLayers().map((L, i) => ({ ...L, offset: D.LEAD_LAG_EXAMPLE[i], debt: 70, share: L.share + 2, evidence: 5, alloc: 7 + i, marginP: [40, 30, 20], driftP: [-5, -5, -5], unitCostDecline: 4 }));
  const r = Mo.resetAnalyst(G, layers);
  assert.deepEqual(Mo.analystDiffs(r.G, r.layers), []);
  assert.deepEqual([r.G.speed, r.G.mid, r.G.pool, r.G.disc, r.G.premium], [12, 9, 1500, 12, 30], 'first-screen settings kept');
  r.layers.forEach((L, i) => {
    const def = D.DEFAULT_LAYERS[i];
    assert.equal(L.alloc, 7 + i, 'allocation kept');
    assert.deepEqual([L.share, L.evidence, L.offset, L.debt], [def.share, def.evidence, 0, def.debt]);
    assert.deepEqual(L.marginP, def.marginP); assert.deepEqual(L.driftP, def.driftP);
  });
  assert.equal(layers[0].offset, D.LEAD_LAG_EXAMPLE[0], 'inputs are not mutated');
});

test('case name: the title prefix is a variable, default "AI Stack"', () => {
  assert.equal(Mo.CASE_NAME, 'AI Stack');
});

test('tip placement: prefers below, flips left near the right edge, flips up near the bottom, clamps with an 8px margin', () => {
  const vp = { width: 1280, height: 720 }, tip = { width: 300, height: 120 };
  const a = (l, t) => ({ left: l, top: t, right: l + 18, bottom: t + 18 });
  assert.deepEqual(Mo.placeTip(a(100, 100), tip, vp), { left: 100, top: 124, placement: 'below' });
  const right = Mo.placeTip(a(1200, 100), tip, vp);
  assert.equal(right.left, 1218 - 300, 'aligned to the icon’s right edge, opening leftwards');
  const low = Mo.placeTip(a(100, 680), tip, vp);
  assert.deepEqual([low.placement, low.top], ['above', 680 - 6 - 120]);
  // Every placement stays inside the viewport with an 8px margin, across a grid of anchors and three widths.
  for (const v of [{ width: 1440, height: 800 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    for (const t of [{ width: 320, height: 200 }, { width: v.width - 16, height: 300 }, { width: 120, height: 40 }]) {
      for (let x = 0; x <= v.width - 18; x += 37) for (let y = 0; y <= v.height - 18; y += 41) {
        const p = Mo.placeTip(a(x, y), t, v);
        assert.ok(p.left >= 8 && p.left + t.width <= v.width - 8 && p.top >= 8 && p.top + t.height <= v.height - 8, JSON.stringify({ v, t, x, y, p }));
      }
    }
  }
});
