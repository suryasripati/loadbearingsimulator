// SYNTHETIC TEST FIXTURE, NOT DATA. Values are the simulator's placeholder defaults; the sources are fictitious
// labels that exist only so the validation rules can be exercised. Nothing here describes a real episode.
const C = require('../../src/calibration.js');
const D = require('../../src/defaults.js');

function rec(value, basis = 'sourced', sourceIds = ['SYN-IN']){ return { value, basis, sourceIds, calculation: basis === 'derived' ? 'synthetic: a + b' : '', rationale: basis === 'judgement' ? 'synthetic rationale' : '' }; }
function syntheticEpisode(opts = {}){
  const ep = C.templateEpisode();
  Object.assign(ep, { id: 'synthetic-test', name: 'Synthetic test episode (not data)', asOfDate: '1845-06-30',
    asOfRule: 'Synthetic: only material dated on or before the as-of date.', outcomeHorizon: 'Synthetic: ten years.',
    outcomeMeasure: 'Synthetic: capital earned its cost if returns covered the discount rate.' });
  ep.scorer.knewAboutOutcome = 'Synthetic: the scorer knew the broad outcome.';
  ep.sources = [
    { id: 'SYN-IN', citation: 'Synthetic input source (fictitious)', publicationDate: '1845-01-15', kind: 'contemporary', truncatedAt: null },
    { id: 'SYN-COMP', citation: 'Synthetic compiled series (fictitious)', publicationDate: '1990-05-01', kind: 'compiled-from-period-data', truncatedAt: '1845-06-30' },
    { id: 'SYN-OUT', citation: 'Synthetic outcome source (fictitious)', publicationDate: '1856-01-01', kind: 'retrospective', truncatedAt: null },
    { id: 'SYN-OUT2', citation: 'Second synthetic outcome source (fictitious)', publicationDate: '1860-01-01', kind: 'retrospective', truncatedAt: null }
  ];
  const basis = opts.basis || 'sourced';
  ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'].forEach(k => { ep.settings[k] = rec(D.DEFAULT_G[k], basis); });
  ep.settings.phase2Start = rec(D.DEFAULT_PHASES[0], basis); ep.settings.phase3Start = rec(D.DEFAULT_PHASES[1], basis);
  ep.settings.entryDef = 'A'; ep.settings.capexModel = 'sustaining';
  ep.layers = D.DEFAULT_LAYERS.slice(0, opts.layers || 3).map(L => {
    const inputs = {};
    C.EP_LAYER_KEYS.forEach(k => { inputs[k] = rec(L[k], basis); });
    inputs.driftP = L.driftP.map(v => rec(v, basis)); inputs.marginP = L.marginP.map(v => rec(v, basis));
    return { name: 'Synthetic ' + L.name, inputs };
  });
  return C.validateEpisode(JSON.parse(JSON.stringify(ep)));
}
module.exports = { syntheticEpisode, rec };
