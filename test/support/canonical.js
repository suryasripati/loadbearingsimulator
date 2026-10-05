// Fixed canonical input set for the model-version fixture. Used by scripts/update-model-fixture.js and
// test/model-version.test.js. Changing this file changes the fixture: regenerate it deliberately.
const { runLayer } = require('../../src/model.js');
const D = require('../../src/defaults.js');

function layerSets(){
  const base = () => D.DEFAULT_LAYERS.map(L => ({ ...L, driftP: L.driftP.slice(), marginP: L.marginP.slice() }));
  return {
    defaults: base(),
    leadLagBuildLater: base().map((L, i) => ({ ...L, offset: D.LEAD_LAG_EXAMPLE[i], buildStart: 2 })),
    declineExample: base().map((L, i) => ({ ...L, unitCostDecline: D.UCD_EXAMPLE[i], passThrough: 0.5 }))
  };
}
function cases(){
  const out = [];
  const sets = layerSets();
  for (const capexModel of ['sustaining', 'vintage']) for (const entryDef of ['A', 'B']) for (const entry of [0, 3]) for (const set in sets) {
    const G = { ...D.DEFAULT_G, entryDef, entry, capexModel, phases: D.DEFAULT_PHASES.slice() };
    out.push({ key: [capexModel, entryDef, 'e' + entry, set].join('/'), G, layers: sets[set] });
  }
  return out;
}
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
function canonicalOutputs(){
  const res = {};
  for (const c of cases()) {
    res[c.key] = c.layers.map(L => {
      const o = runLayer(L, c.G);
      return { id: L.id, npv: num(o.npv), breakEven: num(o.breakEven), breakEvenM: num(o.breakEvenM), irr: num(o.irr),
        payback: o.payback, tv: num(o.tv), flags: o.flags, bin: o.bin, strandedPeakPct: num(o.strandedPeakPct),
        shortfall: num(o.shortfall), minDSCR: num(o.minDSCR), shareLeftPct: num(o.shareLeftPct) };
    });
  }
  return res;
}
module.exports = { cases, canonicalOutputs };
