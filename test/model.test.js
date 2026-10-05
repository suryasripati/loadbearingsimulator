const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runLayer, adoption, heatmap, sensitivity, H } = require('../src/model.js');
const D = require('../src/defaults.js');

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v0_1_defaults.json'), 'utf8'));
const G = fx.G;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

test('adoption: 10% to 90% takes exactly `speed` years, centred on the midpoint', () => {
  near(adoption(G.mid, G), 0.5, 1e-9);
  near(adoption(G.mid - G.speed / 2, G), 0.1, 1e-9);
  near(adoption(G.mid + G.speed / 2, G), 0.9, 1e-9);
});

test('v0.1 regression: default layers reproduce the stored fixture', () => {
  for (const row of fx.layers) {
    const o = runLayer(row.input, G);
    near(o.npv, row.npv, 1e-6);
    near(o.breakEven, row.breakEven, 1e-6);
    assert.equal(o.payback, row.payback);
    assert.deepEqual(o.flags, row.flags);
    assert.equal(o.bin, row.bin);
  }
});

test('NPV is zero when the entry premium equals the break-even premium', () => {
  for (const row of fx.layers) {
    const be = runLayer(row.input, G).breakEven;
    if (!isFinite(be)) continue;
    const o = runLayer(row.input, { ...G, premium: be });
    near(o.npv, 0, 1e-6);
  }
});

test('break-even premium does not depend on the premium that was entered', () => {
  const L = fx.layers[0].input;
  const a = runLayer(L, { ...G, premium: 0 }).breakEven;
  const b = runLayer(L, { ...G, premium: 150 }).breakEven;
  near(a, b, 1e-9);
});

test('IRR equals the discount rate at the break-even premium', () => {
  for (const row of fx.layers) {
    const be = runLayer(row.input, G).breakEven;
    if (!isFinite(be)) continue;
    const o = runLayer(row.input, { ...G, premium: be });
    if (isNaN(o.irr)) continue;
    near(o.irr, G.disc / 100, 1e-6);
  }
});

test('NPV falls when the discount rate rises', () => {
  for (const row of fx.layers) {
    const lo = runLayer(row.input, { ...G, disc: 8 }).npv;
    const hi = runLayer(row.input, { ...G, disc: 14 }).npv;
    assert.ok(lo > hi);
  }
});

test('NPV falls when the entry premium rises', () => {
  for (const row of fx.layers) {
    const a = runLayer(row.input, { ...G, premium: 0 }).npv;
    const b = runLayer(row.input, { ...G, premium: 100 }).npv;
    assert.ok(a > b);
  }
});

test('slower adoption lowers NPV for every default layer', () => {
  for (const row of fx.layers) {
    const fast = runLayer(row.input, { ...G, speed: 5, mid: 5.5 }).npv;
    const slow = runLayer(row.input, { ...G, speed: 12, mid: 11 }).npv;
    assert.ok(fast > slow);
  }
});

test('value beyond year 15 is zero when the terminal multiple is zero, and the tail flag stays off', () => {
  for (const row of fx.layers) {
    const o = runLayer(row.input, { ...G, tv: 0 });
    assert.equal(o.tv, 0);
    assert.ok(!o.flags.includes('tail'));
  }
});

test('layer with no debt reports no debt flag and no shortfall', () => {
  const L = { ...fx.layers[3].input, debt: 0 };
  const o = runLayer(L, G);
  assert.ok(!o.flags.includes('debt'));
  assert.equal(o.shortfall, 0);
  assert.equal(o.minDSCR, null);
});

test('evidence gate: below 3 is a forecast bet, 3 or more passes', () => {
  const L = fx.layers[0].input;
  assert.equal(runLayer({ ...L, evidence: 2 }, G).merit, false);
  assert.equal(runLayer({ ...L, evidence: 3 }, G).merit, true);
});

test('horizon is fifteen years and arrays cover years 0 to 15', () => {
  const o = runLayer(fx.layers[0].input, G);
  assert.equal(H, 15);
  assert.equal(o.years.length, 16);
  assert.equal(o.cf.length, 16);
});

/* ---------- Drop 1 ---------- */
const NEUTRAL_G = { ...G, entry: 0, entryDef: 'A', mult: 10, phases: [5, 10] };
const neutral = (L) => ({ ...L, offset: 0, steepness: 1, driftP: [L.drift, L.drift, L.drift], marginP: [L.margin, L.margin, L.margin] });
const ENTRIES = [0, 1, 3, 6, 10];

test('drop 1 at neutral settings reproduces the v0.1 fixture (Definition A, entry year 0)', () => {
  for (const row of fx.layers) {
    const o = runLayer(neutral(row.input), NEUTRAL_G);
    near(o.npv, row.npv, 1e-6);
    near(o.breakEven, row.breakEven, 1e-6);
    near(o.irr, row.irr, 1e-6);
    assert.equal(o.payback, row.payback);
    assert.deepEqual(o.flags, row.flags);
    assert.equal(o.bin, row.bin);
  }
});

test('phase values equal to the constant reproduce v0.1 whatever the phase boundaries', () => {
  for (const row of fx.layers) for (const phases of [[1, 2], [5, 10], [7, 15]]) {
    near(runLayer(neutral(row.input), { ...NEUTRAL_G, phases }).npv, row.npv, 1e-6);
  }
});

test('Definition A: NPV is zero at the break-even premium for several entry years', () => {
  for (const row of fx.layers) for (const entry of ENTRIES) {
    const g = { ...NEUTRAL_G, entry };
    const be = runLayer(row.input, g).breakEven;
    assert.ok(isFinite(be));
    near(runLayer(row.input, { ...g, premium: be }).npv, 0, 1e-6);
  }
});

test('Definition B: NPV is zero at the break-even multiple for several entry years', () => {
  let checked = 0;
  for (const row of fx.layers) for (const entry of ENTRIES) {
    const g = { ...NEUTRAL_G, entryDef: 'B', entry };
    const o = runLayer(row.input, g);
    if (!o.bMeaningful) continue;
    near(runLayer(row.input, { ...g, mult: o.breakEvenM }).npv, 0, 1e-6);
    checked++;
  }
  assert.ok(checked >= 20);
});

test('Definition B: break-even multiple is not meaningful when next-year operating cash is near zero', () => {
  const o = runLayer(fx.layers[0].input, { ...NEUTRAL_G, entryDef: 'B', entry: 0, speed: 3, mid: 14 });
  assert.equal(o.bMeaningful, false);
  assert.ok(Number.isNaN(o.breakEvenM));
});

test('a layer that leads demand earns more early revenue, and one that lags earns less', () => {
  const L = fx.layers[0].input;
  const base = runLayer(L, NEUTRAL_G).rev, lead = runLayer({ ...L, offset: -2 }, NEUTRAL_G).rev, lag = runLayer({ ...L, offset: 2 }, NEUTRAL_G).rev;
  for (let t = 0; t <= 5; t++) { assert.ok(lead[t] > base[t]); assert.ok(lag[t] < base[t]); }
});

test('a steeper layer curve crosses the global curve at the midpoint', () => {
  const L = fx.layers[0].input;
  const g = { ...NEUTRAL_G, mid: 8 };
  const flat = runLayer(L, g), steep = runLayer({ ...L, steepness: 2 }, g);
  assert.ok(steep.rev[3] < flat.rev[3]);
  assert.ok(steep.rev[13] > flat.rev[13]);
});

test('later entry under Definition A at 0% premium is valued in entry-year terms', () => {
  const L = fx.layers[0].input, e = 4;
  const o = runLayer(L, { ...NEUTRAL_G, entry: e });
  const r = G.disc / 100;
  let pre = 0; for (let t = 0; t < e; t++) pre += o.build[t];
  let pv = -pre; for (let t = e; t <= H; t++) pv += (o.opsNet[t] - o.build[t]) / Math.pow(1 + r, t - e);
  pv += o.tv / Math.pow(1 + r, H - e);
  near(o.npv, pv, 1e-9);
});

test('heatmap cells equal direct runLayer calls under both definitions', () => {
  const L = fx.layers[1].input;
  for (const [def, key, prices] of [['A', 'premium', [-50, 0, 75, 300]], ['B', 'mult', [0, 5, 20]]]) {
    const g = { ...NEUTRAL_G, entryDef: def };
    const grid = heatmap(L, g, ENTRIES, prices);
    ENTRIES.forEach((e, i) => prices.forEach((p, j) => {
      assert.equal(grid[i][j], runLayer(L, { ...g, entry: e, [key]: p }).npv);
    }));
  }
});

/* ---------- Part 1 fixes ---------- */
const DEFAULT_RUN_G = { ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, phases: D.DEFAULT_PHASES };

test('page defaults are neutral (offset 0, steepness 1, Definition A, entry year 0) and reproduce the v0.1 fixture exactly', () => {
  assert.equal(D.DEFAULT_DEF, 'A');
  assert.equal(D.DEFAULT_G.entry, 0);
  for (const k in fx.G) assert.equal(D.DEFAULT_G[k], fx.G[k], 'global input ' + k);
  assert.equal(D.DEFAULT_LAYERS.length, fx.layers.length);
  D.DEFAULT_LAYERS.forEach((L, i) => {
    const row = fx.layers[i];
    assert.equal(L.id, row.id);
    assert.equal(L.offset, 0);
    assert.equal(L.steepness, 1);
    assert.deepEqual(L.driftP, [row.input.drift, row.input.drift, row.input.drift]);
    assert.deepEqual(L.marginP, [row.input.margin, row.input.margin, row.input.margin]);
    const o = runLayer(L, DEFAULT_RUN_G);
    near(o.npv, row.npv, 1e-6);
    near(o.breakEven, row.breakEven, 1e-6);
    near(o.irr, row.irr, 1e-6);
    assert.equal(o.payback, row.payback);
    assert.deepEqual(o.flags, row.flags);
    assert.equal(o.bin, row.bin);
  });
});

test('lead/lag example is opt-in: it is not the default and differs from neutral', () => {
  assert.equal(D.LEAD_LAG_EXAMPLE.length, D.DEFAULT_LAYERS.length);
  assert.ok(D.LEAD_LAG_EXAMPLE.some(v => v !== 0));
  assert.ok(D.DEFAULT_LAYERS.every(L => L.offset === 0));
});

test('sensitivity: the merged scale bar equals the NPV change from pool, share and margin taken one at a time', () => {
  for (const L of D.DEFAULT_LAYERS) for (const def of ['A', 'B']) {
    const g = { ...DEFAULT_RUN_G, entryDef: def };
    const s = sensitivity(L, g);
    const scale = s.rows.find(r => r.id === 'scale');
    for (const id of ['pool', 'share', 'margin']) {
      near(scale.bad, s.parts[id].bad, 1e-6);
      near(scale.good, s.parts[id].good, 1e-6);
    }
    assert.ok(!s.rows.some(r => ['pool', 'share', 'margin'].includes(r.id)));
  }
});

test('sensitivity: midpoint and offset merge only when they are the same shift in years', () => {
  const L = D.DEFAULT_LAYERS[1];
  const merged = sensitivity(L, { ...DEFAULT_RUN_G, mid: 8 });
  const t = merged.rows.find(r => r.id === 'timing');
  assert.ok(t);
  near(t.bad, merged.parts.offset.bad, 1e-6);
  near(t.good, merged.parts.offset.good, 1e-6);
  const apart = sensitivity(L, { ...DEFAULT_RUN_G, mid: 11 });
  assert.ok(!apart.rows.some(r => r.id === 'timing'));
  assert.ok(apart.rows.some(r => r.id === 'mid') && apart.rows.some(r => r.id === 'offset'));
});

test('timing check: with the lead/lag example, setting a layer offset back to 0 reproduces its neutral verdict', () => {
  D.DEFAULT_LAYERS.forEach((L, i) => {
    const led = { ...L, offset: D.LEAD_LAG_EXAMPLE[i] };
    assert.equal(runLayer({ ...led, offset: 0 }, DEFAULT_RUN_G).bin, fx.layers[i].bin);
  });
});

/* ---------- Build start and capacity limit ---------- */
const { verdictIfBuildLater, buildStartOf } = require('../src/model.js');
const GA = { ...D.DEFAULT_G, entryDef: 'A', entry: 0, phases: D.DEFAULT_PHASES };

test('build start: defaults (build start 0) still reproduce the v0.1 fixture exactly', () => {
  D.DEFAULT_LAYERS.forEach((L, i) => {
    assert.equal(L.buildStart, 0);
    const o = runLayer(L, GA), row = fx.layers[i];
    near(o.npv, row.npv, 1e-6); near(o.breakEven, row.breakEven, 1e-6); near(o.irr, row.irr, 1e-6);
    assert.equal(o.payback, row.payback); assert.deepEqual(o.flags, row.flags); assert.equal(o.bin, row.bin);
  });
});

test('build start: NPV is zero at the break-even price for build starts 0, 2, 4 under both definitions and entry years 0 and 3', () => {
  let checked = 0;
  for (const L0 of D.DEFAULT_LAYERS) for (const bs of [0, 2, 4]) for (const entry of [0, 3]) {
    const L = { ...L0, buildStart: bs };
    const a = runLayer(L, { ...GA, entry });
    if (isFinite(a.breakEven)) { near(runLayer(L, { ...GA, entry, premium: a.breakEven }).npv, 0, 1e-6); checked++; }
    const gB = { ...GA, entryDef: 'B', entry };
    const b = runLayer(L, gB);
    if (b.bMeaningful) { near(runLayer(L, { ...gB, mult: b.breakEvenM }).npv, 0, 1e-6); checked++; }
  }
  assert.ok(checked >= 40, 'checked ' + checked);
});

test('build start: build spend runs from build start for build years and sums to total capex', () => {
  for (const L0 of D.DEFAULT_LAYERS) for (const bs of [0, 3, 6, 50]) {
    const L = { ...L0, buildStart: bs }, o = runLayer(L, GA), S = buildStartOf(L);
    near(o.build.reduce((a, b) => a + b, 0), L.capex, 1e-9);
    o.build.forEach((v, t) => assert.equal(v > 0, t >= S && t < S + L.buildYears));
    assert.ok(o.buildEnd <= H, 'build ends inside the horizon');
    o.sust.forEach((v, t) => assert.equal(v > 0, t >= o.buildEnd));
  }
});

test('build start: debt draws follow the build and repayment starts when the build ends', () => {
  const L = { ...D.DEFAULT_LAYERS[1], buildStart: 3 }, o = runLayer(L, GA);
  const debt = L.debt / 100 * L.capex;
  o.draws.forEach((v, t) => near(v, o.build[t] * L.debt / 100, 1e-12));
  o.repays.forEach((v, t) => assert.equal(v > 0, t >= o.buildEnd && t < o.buildEnd + 8));
  near(o.repays.reduce((a, b) => a + b, 0), debt * Math.min(8, H + 1 - o.buildEnd) / 8, 1e-9);
  assert.ok(o.ds.slice(0, 3).every(v => v === 0), 'no debt service before the build starts');
});

test('capacity limit: with the cap, data centres NPV is not monotonic in build start', () => {
  const npv = [0, 2, 4, 6, 8].map(bs => runLayer({ ...D.DEFAULT_LAYERS[1], buildStart: bs }, GA).npv);
  const rising = npv.every((v, i) => i === 0 || v > npv[i - 1]);
  assert.ok(!rising, 'NPV by build start: ' + npv.map(v => v.toFixed(0)).join(', '));
  assert.ok(npv[4] < npv[3], 'a late enough build loses value');
});

test('capacity limit: the cap never raises revenue above the uncapped value', () => {
  for (const L0 of D.DEFAULT_LAYERS) for (const bs of [0, 2, 5, 8]) for (const s of Object.values(D.SCEN)) for (const off of [-3, 0, 3]) {
    const L = { ...L0, buildStart: bs, offset: off }, g = { ...GA, ...s }, o = runLayer(L, g);
    o.rev.forEach((r, t) => {
      const uncapped = g.pool * require('../src/model.js').layerAdoption(t, L, g) * (L.share / 100) * Math.pow(1 + L0.driftP[0] / 100, t);
      assert.ok(r <= uncapped + 1e-9);
    });
  }
});

test('build-later check: shifts the build two years and reports the verdict at the new start', () => {
  const v = verdictIfBuildLater(D.DEFAULT_LAYERS[0], GA);
  assert.equal(v.shifted, 2);
  assert.equal(v.now, runLayer(D.DEFAULT_LAYERS[0], GA).bin);
  assert.equal(v.later, runLayer({ ...D.DEFAULT_LAYERS[0], buildStart: 2 }, GA).bin);
});

test('sensitivity: the build-start bar is one-sided (two years later only)', () => {
  const s = sensitivity(D.DEFAULT_LAYERS[1], GA);
  const b = s.rows.find(r => r.id === 'buildStart');
  assert.ok(b && b.oneSided);
  const later = runLayer({ ...D.DEFAULT_LAYERS[1], buildStart: 2 }, GA).npv;
  near(b.bad, Math.min(s.base, later), 1e-9); near(b.good, Math.max(s.base, later), 1e-9);
});

/* ---------- Life flag clock ---------- */
test('life flag: payback clock starts at the later of entry year and build start (build starts 0, 2, 4; entry years 0, 3)', () => {
  for (const L0 of D.DEFAULT_LAYERS) for (const bs of [0, 2, 4]) for (const entry of [0, 3]) for (const s of [{}, ...Object.values(D.SCEN)]) {
    const L = { ...L0, buildStart: bs }, o = runLayer(L, { ...GA, ...s, entry });
    const start = Math.max(entry, bs);
    assert.equal(o.clockStart, start);
    assert.equal(o.flags.includes('life'), o.payback === null || o.payback - start > L.life,
      `${L0.id} bs${bs} e${entry}: payback ${o.payback}, life ${L.life}`);
    if (bs === 0) assert.equal(o.flags.includes('life'), o.payback === null || o.payback - entry > L.life, 'build start 0 keeps the previous rule');
  }
});

test('life flag: a later build no longer counts idle years before any capital goes in', () => {
  // Applications, build starts in year 2, entry year 0: payback in year 7 on a 5-year asset.
  // Old rule (payback - entry = 7 > 5) flagged life; the new clock (7 - 2 = 5) does not.
  const L = { ...D.DEFAULT_LAYERS[3], buildStart: 2 }, o = runLayer(L, GA);
  assert.equal(o.payback, 7);
  assert.equal(L.life, 5);
  assert.ok(o.payback - 0 > L.life, 'the old rule would have flagged life');
  assert.ok(!o.flags.includes('life'));
  assert.equal(o.bin, 'Durable value');
});
