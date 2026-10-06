// Writes the SYNTHETIC case fixtures in test/support/cases/. NOT DATA: values are the simulator's placeholder
// defaults and every source is fictitious. These files are never shipped: only the dev build (docs-dev/, gitignored)
// and the tests read them. Run: node test/support/make-synthetic-cases.js
const fs = require('fs');
const path = require('path');
const D = require('../../src/defaults.js');
const C = require('../../src/cases.js');

const src = (basis, ids, note) => ({ basis, sourceIds: ids, note: note || '' });
const rec = (value, basis = 'sourced') => ({ value, ...(basis === 'sourced' ? src('sourced', ['SYN-P1'], '')
  : basis === 'derived' ? src('derived', ['SYN-P1', 'SYN-C1'], 'Synthetic calculation: a / b (fictitious).')
  : src('judgement', [], 'Synthetic rationale: placeholder judgement, not data.')) });
function settings(){
  const s = {};
  ['pool', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'].forEach(k => { s[k] = rec(D.DEFAULT_G[k]); });
  s.speed = rec(D.DEFAULT_G.speed, 'derived');
  s.phase2Start = rec(D.DEFAULT_PHASES[0]); s.phase3Start = rec(D.DEFAULT_PHASES[1]);
  s.entryDef = 'A'; s.capexModel = 'sustaining';
  return s;
}
function layer(L, id, name){
  const inputs = {};
  C.CASE_LAYER_KEYS.forEach(k => { inputs[k] = rec(L[k]); });
  inputs.evidence = rec(L.evidence, 'judgement');
  inputs.driftP = L.driftP.map(v => rec(v)); inputs.marginP = L.marginP.map(v => rec(v));
  return { id, name, inputs };
}
const sources = [
  { id: 'SYN-P1', citation: 'Synthetic period source (fictitious, not data)', publicationDate: '1845-01-15', kind: 'period' },
  { id: 'SYN-C1', citation: 'Synthetic compiled series (fictitious, not data)', publicationDate: '1990-05-01', kind: 'compiled', seriesEndsOn: '1845-06-30' },
  { id: 'SYN-O1', citation: 'Synthetic outcome source (fictitious, not data)', publicationDate: '1856-01-01', kind: 'outcome' },
  { id: 'SYN-O2', citation: 'Second synthetic outcome source (fictitious, not data)', publicationDate: '1860-01-01', kind: 'outcome' }
];
function makeCase(n, unit){
  const base = D.DEFAULT_LAYERS;
  const layers = Array.from({ length: n }, (_, i) => {
    const L = base[i % base.length];
    return layer(L, 'syn-' + (i + 1), 'Synthetic layer ' + (i + 1));
  });
  const statuses = ['yes', 'no', 'contested', 'unknown', 'no', 'yes'];
  const outcomes = layers.map((L, i) => {
    const st = statuses[i % statuses.length];
    return { layer: L.id, status: st,
      summary: st === 'contested' ? 'Synthetic. For: one fictitious source says capital earned its cost. Against: another says it did not.' : 'Synthetic outcome summary (fictitious, not data).',
      sourceIds: st === 'contested' ? ['SYN-O1', 'SYN-O2'] : st === 'unknown' ? [] : ['SYN-O1'], horizon: 'Synthetic: ten years after the as-of date.' };
  });
  return {
    format: C.CASE_FORMAT, schemaVersion: C.CASE_SCHEMA_VERSION,
    id: 'synthetic-' + n + '-layer', title: 'Synthetic ' + n + '-layer case', subtitle: 'Test fixture, not data: placeholder values and fictitious sources.',
    asOfDate: '1845-06-30', asOfRule: 'Synthetic: only material dated on or before the as-of date.',
    hindsightDisclosure: 'Synthetic fixture: the author knew the fictitious outcome.', moneyUnit: unit,
    sources, settings: settings(), layers,
    versions: n === 3 ? [
      { id: 'hype', label: 'Hype', settings: { speed: { value: 5, basis: 'judgement', sourceIds: [], note: 'Synthetic: a fast-adoption view (fictitious).' } } },
      { id: 'measured', label: 'Measured', settings: { speed: { value: 12, basis: 'judgement', sourceIds: [], note: 'Synthetic: a slow-adoption view (fictitious).' } },
        layers: { 'syn-2': { capex: { value: 180, basis: 'sourced', sourceIds: ['SYN-P1'], note: '' } } } },
      { id: 'long-run', label: 'Long run', settings: { tvMode: 'perpetuity', tvGrowth: { value: 2, basis: 'judgement', sourceIds: [], note: 'Synthetic: a long-run growth view (fictitious).' } } }
    ] : [],
    outcomes
  };
}
module.exports = { makeCase };
if (require.main === module) for (const [n, unit] of [[1, '$B'], [3, '£m'], [6, '€bn']]) {
  const c = makeCase(n, unit);
  C.validateCase(JSON.parse(JSON.stringify(c)), 'synthetic ' + n);
  fs.writeFileSync(path.join(__dirname, 'cases', 'synthetic-' + n + '.case.json'), JSON.stringify(c, null, 1) + '\n');
}
if (require.main === module) console.log('wrote synthetic cases');
