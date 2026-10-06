// "What must be true": break-even values of share, cash margin, adoption speed and build capex for one layer.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/solve.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');
const C = require('../src/cases.js');
const { makeCase } = require('./support/make-synthetic-cases.js');

const TOL = 1e-5; // money units: substituting a break-even value gives |present value| below this
const baseG = (over) => ({ ...D.DEFAULT_G, entryDef: 'A', capexModel: 'sustaining', tvMode: 'multiple', phases: D.DEFAULT_PHASES.slice(), ...over });
const layers = () => D.DEFAULT_LAYERS.map(L => ({ ...L, driftP: L.driftP.slice(), marginP: L.marginP.slice() }));

function check(L, G, ranges, label){
  const inputs = S.mbtInputs(L, G, ranges);
  const rows = S.mustBeTrue(L, G, ranges);
  assert.deepEqual(rows.map(r => r.key), ['share', 'margin', 'speed', 'capex']);
  rows.forEach((r, i) => {
    const inp = inputs[i];
    if (r.breakEven !== null) {
      assert.ok(r.breakEven >= inp.lo - 1e-9 && r.breakEven <= inp.hi + 1e-9, label + ' ' + r.key + ' inside the range');
      const v = S.mbtNpv(L, G, inp, r.breakEven);
      assert.ok(Math.abs(v) < TOL, label + ' ' + r.key + ': present value at break-even ' + v);
      if (r.current) assert.ok(Math.abs(r.changePct - (r.breakEven - r.current) / Math.abs(r.current) * 100) < 1e-9);
    } else {
      // "No break-even" only when present value stays on one side of zero across the whole range.
      const signs = new Set();
      for (let k = 0; k <= 200; k++) { const v = S.mbtNpv(L, G, inp, inp.lo + (inp.hi - inp.lo) * k / 200); signs.add(v < 0); }
      assert.equal(signs.size, 1, label + ' ' + r.key + ' stays on one side');
      assert.equal(r.note, 'no break-even within the range');
    }
  });
  return rows;
}

test('break-even values reproduce a present value of zero; legacy and Vintage capex, Definitions A and B, entry years 0 and 3', () => {
  let found = 0, none = 0;
  for (const capexModel of ['sustaining', 'vintage']) for (const entryDef of ['A', 'B']) for (const entry of [0, 3]) {
    const G = baseG({ capexModel, entryDef, entry });
    layers().map((L, i) => ({ ...L, unitCostDecline: capexModel === 'vintage' ? D.UCD_EXAMPLE[i] : 0 })).forEach(L => {
      check(L, G, undefined, [capexModel, entryDef, entry, L.id].join('/')).forEach(r => { if (r.breakEven === null) none++; else found++; });
    });
  }
  assert.ok(found > 50 && none > 0, 'both outcomes are exercised: ' + found + ' found, ' + none + ' none');
});

test('no break-even is reported when present value stays on one side across the range', () => {
  // A layer that pays at every capex in a narrow range.
  const L = layers()[0], G = baseG();
  const r = S.mustBeTrue(L, G, { capex: [1, 50, 0.1] }).find(x => x.key === 'capex');
  assert.equal(r.breakEven, null); assert.equal(r.note, 'no break-even within the range');
  assert.ok(M.runLayer({ ...L, capex: 50 }, G).npv > 0 && M.runLayer({ ...L, capex: 1 }, G).npv > 0);
  // A case's declared capex range is the one searched.
  assert.deepEqual([r.lo, r.hi], [1, 50]);
});

test('non-monotonic present value: the first crossing from the low end is reported and flagged', () => {
  const L = layers()[0], G = baseG();
  // A made-up input that sends the share up and back down (tent shape), so present value rises then falls.
  const inp = { key: 'tent', label: 'Tent', cur: 0.5, lo: 0, hi: 1, set: (l, g, v) => { l.share = 30 * (1 - Math.abs(v - 0.5) * 2); } };
  const r = S.mbtSolve(L, G, inp);
  assert.equal(r.monotonic, false);
  assert.match(r.note, /not monotonic over the range; first crossing shown/);
  assert.ok(r.breakEven < 0.5, 'first crossing is the lower one');
  assert.ok(Math.abs(S.mbtNpv(L, G, inp, r.breakEven)) < TOL);
});

test('works for cases with 1, 3 and 6 layers, using the layer and settings of each case', () => {
  for (const [n, u] of [[1, '$B'], [3, '£m'], [6, '€bn']]) {
    const c = C.validateCase(JSON.parse(JSON.stringify(makeCase(n, u)))), st = C.caseState(c, 'base');
    const G = { ...D.DEFAULT_G, ...st.G };
    st.layers.forEach(L => check(L, G, st.ranges, n + ' layers ' + L.id));
  }
  // The shipped railway case uses its declared capex range.
  const rw = C.validateCase(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'cases', 'railway-mania-1845.case.json'), 'utf8')));
  const st = C.caseState(rw, 'base'), G = { ...D.DEFAULT_G, ...st.G };
  st.layers.forEach(L => { const rows = check(L, G, st.ranges, 'railway ' + L.id); assert.deepEqual([rows[3].lo, rows[3].hi], [1, 500]); });
});

test('a margin that varies by phase keeps its shape (all phases scaled)', () => {
  const L = { ...layers()[1], marginP: [50, 40, 30] }, G = baseG();
  const inp = S.mbtInputs(L, G).find(i => i.key === 'margin');
  assert.match(inp.label, /all phases scaled/);
  assert.equal(inp.hi, 90, 'the largest phase may reach 90%');
  const l = { ...L, marginP: L.marginP.slice() }; inp.set(l, {}, 25);
  assert.deepEqual(l.marginP, [25, 20, 15]);
  check(L, G, undefined, 'phased margin');
});
