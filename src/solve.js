// "What must be true": for the selected layer, the value of one input at which present value is zero, holding every
// other input fixed. Uses the existing model only (runLayer); no new maths. Pure functions, no DOM. CommonJS export
// for tests; stripped by the build and inlined after the modes.
//
// Method: sample present value across the input's allowed range, find the first sign change (lowest value first), and
// bisect inside that bracket. If present value never crosses zero in the range, there is no break-even. If it is not
// monotonic over the range, the first crossing is reported and flagged.

const MBT_SAMPLES = 48;      // grid points across the range (a display choice; enough to find crossings)
const MBT_ITER = 80;         // bisection steps
const MBT_NPV_TOL = 1e-6;    // a break-even counts as found when |present value| is below this (money units)

function mbtDeps(){
  if (typeof module !== 'undefined' && typeof require === 'function') return Object.assign({}, require('./model.js'), require('./defaults.js'));
  return { runLayer, LAYER_RANGES, GLOBAL_RANGES };
}

// The four inputs. Each has the current value, its allowed range [lo, hi] and a way to set a value on copies of the
// layer and settings. Cash margin scales every phase by one factor, so a margin that varies by phase keeps its shape;
// its value is shown as the phase-1 margin.
function mbtInputs(L, G, ranges){
  const d = mbtDeps(), r = ranges || {};
  const capexR = r.capex || d.LAYER_RANGES.capex;
  const m = L.marginP && L.marginP.length ? L.marginP : [L.margin, L.margin, L.margin];
  const mMax = Math.max.apply(null, m), m0 = m[0];
  const marginHi = mMax > 0 ? d.LAYER_RANGES.marginP[1] * m0 / mMax : d.LAYER_RANGES.marginP[1];
  const uniform = m.every(v => v === m0);
  return [
    { key: 'share', label: 'Share of pool, % at start', cur: L.share, lo: d.LAYER_RANGES.share[0], hi: d.LAYER_RANGES.share[1],
      set: (l, g, v) => { l.share = v; } },
    { key: 'margin', label: uniform ? 'Cash margin, %' : 'Cash margin, % (phase 1; all phases scaled)', cur: m0, lo: 0, hi: marginHi,
      set: (l, g, v) => { const k = m0 > 0 ? v / m0 : 0; l.marginP = m0 > 0 ? m.map(x => x * k) : m.map(() => v); } },
    { key: 'speed', label: 'Adoption speed, years', cur: G.speed, lo: d.GLOBAL_RANGES.speed[0], hi: d.GLOBAL_RANGES.speed[1],
      set: (l, g, v) => { g.speed = v; } },
    { key: 'capex', label: 'Build capex', cur: L.capex, lo: capexR[0], hi: capexR[1],
      set: (l, g, v) => { l.capex = v; } }
  ];
}

function mbtNpv(L, G, inp, v){
  const l = Object.assign({}, L, { driftP: L.driftP ? L.driftP.slice() : L.driftP, marginP: L.marginP ? L.marginP.slice() : L.marginP });
  const g = Object.assign({}, G);
  inp.set(l, g, v);
  return mbtDeps().runLayer(l, g).npv;
}

// One input: { key, label, current, breakEven (or null), changePct (or null), monotonic, note }.
function mbtSolve(L, G, inp){
  const f = (v) => mbtNpv(L, G, inp, v);
  const xs = [], ys = [];
  for (let i = 0; i <= MBT_SAMPLES; i++) { const x = inp.lo + (inp.hi - inp.lo) * i / MBT_SAMPLES; xs.push(x); ys.push(f(x)); }
  let up = false, down = false;
  for (let i = 1; i < ys.length; i++) { if (ys[i] > ys[i - 1] + 1e-12) up = true; if (ys[i] < ys[i - 1] - 1e-12) down = true; }
  const monotonic = !(up && down);
  const out = { key: inp.key, label: inp.label, current: inp.cur, lo: inp.lo, hi: inp.hi, breakEven: null, changePct: null, monotonic, note: '' };
  let k = -1;
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] === 0) { k = i; break; }
    if (i > 0 && (ys[i - 1] < 0) !== (ys[i] < 0)) { k = i; break; }
  }
  if (k < 0) { out.note = 'no break-even within the range'; return out; }
  let a = k > 0 ? xs[k - 1] : xs[0], b = xs[k], fa = k > 0 ? ys[k - 1] : ys[0];
  if (ys[k] === 0) { a = b = xs[k]; }
  for (let it = 0; it < MBT_ITER && b - a > 1e-12 * Math.max(1, Math.abs(b)); it++) {
    const mid = (a + b) / 2, fm = f(mid);
    if (Math.abs(fm) < MBT_NPV_TOL) { a = b = mid; break; }
    if ((fa < 0) === (fm < 0)) { a = mid; fa = fm; } else { b = mid; }
  }
  out.breakEven = (a + b) / 2;
  out.changePct = inp.cur ? (out.breakEven - inp.cur) / Math.abs(inp.cur) * 100 : null;
  if (!monotonic) out.note = 'present value is not monotonic over the range; first crossing shown';
  return out;
}

// All four inputs for one layer. ranges (optional): a case's declared money ranges, { capex: [min, max, step] }.
function mustBeTrue(L, G, ranges){
  return mbtInputs(L, G, ranges).map(inp => mbtSolve(L, G, inp));
}

if (typeof module !== 'undefined') module.exports = { mustBeTrue, mbtSolve, mbtInputs, mbtNpv, MBT_NPV_TOL, MBT_SAMPLES };
