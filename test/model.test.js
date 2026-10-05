const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runLayer, adoption, H } = require('../src/model.js');

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
