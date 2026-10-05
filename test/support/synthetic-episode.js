// SYNTHETIC TEST FIXTURE, NOT DATA. Values are the simulator's placeholder defaults; the sources are fictitious
// labels that exist only so the validation rules can be exercised. Nothing here describes a real episode.
const C = require('../../src/calibration.js');
const D = require('../../src/defaults.js');
const { SCORER_CHECKLIST } = require('../../src/calibration-guide.js');

function rec(value, basis = 'sourced', sourceIds = ['SYN-IN']){ return { value, basis, sourceIds, calculation: basis === 'derived' ? 'synthetic: a + b' : '', rationale: basis === 'judgement' ? 'synthetic rationale' : '' }; }
function syntheticSettings(basis){
  const s = {};
  ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'].forEach(k => { s[k] = rec(D.DEFAULT_G[k], basis); });
  s.phase2Start = rec(D.DEFAULT_PHASES[0], basis); s.phase3Start = rec(D.DEFAULT_PHASES[1], basis);
  s.entryDef = 'A'; s.capexModel = 'sustaining';
  return s;
}
function syntheticLayers(n, basis){
  return D.DEFAULT_LAYERS.slice(0, n).map(L => {
    const inputs = {};
    C.EP_LAYER_KEYS.forEach(k => { inputs[k] = rec(L[k], basis); });
    inputs.driftP = L.driftP.map(v => rec(v, basis)); inputs.marginP = L.marginP.map(v => rec(v, basis));
    return { inputs };
  });
}
// opts: basis (default 'sourced'), layers (default 3), checklist answer (default 'partly'), variants (labels).
function syntheticEpisode(opts = {}){
  const n = opts.layers || 3, basis = opts.basis || 'sourced';
  const ep = C.templateEpisode();
  Object.assign(ep, { id: 'synthetic-test', name: 'Synthetic test episode (not data)', asOfDate: '1845-06-30',
    asOfRule: 'Synthetic: only material dated on or before the as-of date.', outcomeHorizon: 'Synthetic: ten years.',
    outcomeMeasure: 'Synthetic: capital earned its cost if returns covered the discount rate.' });
  ep.scorer.knewAboutOutcome = 'Synthetic: the scorer knew the broad outcome.';
  SCORER_CHECKLIST.forEach(c => { ep.scorer.checklist[c.key] = opts.checklist === undefined ? 'partly' : opts.checklist; });
  ep.sources = [
    { id: 'SYN-IN', citation: 'Synthetic input source (fictitious)', publicationDate: '1845-01-15', kind: 'contemporary', truncatedAt: null },
    { id: 'SYN-COMP', citation: 'Synthetic compiled series (fictitious)', publicationDate: '1990-05-01', kind: 'compiled-from-period-data', truncatedAt: '1845-06-30' },
    { id: 'SYN-OUT', citation: 'Synthetic outcome source (fictitious)', publicationDate: '1856-01-01', kind: 'retrospective', truncatedAt: null },
    { id: 'SYN-OUT2', citation: 'Second synthetic outcome source (fictitious)', publicationDate: '1860-01-01', kind: 'retrospective', truncatedAt: null }
  ];
  ep.layerNames = D.DEFAULT_LAYERS.slice(0, n).map(L => 'Synthetic ' + L.name);
  ep.variants = (opts.variants || ['Main']).map(label => ({ label, settings: syntheticSettings(basis), layers: syntheticLayers(n, basis), lock: null }));
  return C.validateEpisode(JSON.parse(JSON.stringify(ep)));
}
module.exports = { syntheticEpisode, rec };
