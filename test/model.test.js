const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runLayer, adoption, heatmap, H } = require('../src/model.js');

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
