// Placeholders, not data. Every number here was chosen to make the mechanics visible; none is sourced.
// Defaults are neutral on timing (offset 0, steepness 1, build starts in year 0) and on phases (all three equal the v0.1 constant),
// so the default page reproduces the v0.1 results. Anything that demonstrates a verdict must be opt-in.
const DEFAULT_G = { pool:1200, speed:8, mid:8, disc:10, rd:7, tv:5, premium:0, entry:0, mult:10, tvGrowth:0 };
const DEFAULT_DEF = 'A';
// Capex model: 'sustaining' (v0.1, default) or 'vintage' (opt-in cohorts with replacement at end of life).
const DEFAULT_CAPEX = 'sustaining';
// Value beyond year 15: 'multiple' (v0.1, default; uses tv) or 'perpetuity' (opt-in; uses tvGrowth, long-run growth in
// % a year, a placeholder default of 0 with no view behind it, unsourced).
const DEFAULT_TV_MODE = 'multiple';
const DEFAULT_PHASES = [5, 10];
const SCEN = { slow:{speed:12, mid:11}, base:{speed:8, mid:8}, fast:{speed:5, mid:5.5} };
const SCEN_NAMES = { slow:'Slow adoption', base:'Base', fast:'Fast adoption' };
const ph = (v) => [v, v, v];
const DEFAULT_LAYERS = [
  {id:'hw', name:'Chips and accelerators', evidence:3, share:25, offset:0, steepness:1, driftP:ph(-1), marginP:ph(45), capex:120, buildStart:0, unitCostDecline:0, passThrough:0.5, buildYears:4, life:8,  debt:10, alloc:20},
  {id:'dc', name:'Data centres and power', evidence:3, share:15, offset:0, steepness:1, driftP:ph(-2), marginP:ph(45), capex:220, buildStart:0, unitCostDecline:0, passThrough:0.5, buildYears:5, life:10, debt:50, alloc:20},
  {id:'ml', name:'Models',                 evidence:3, share:15, offset:0, steepness:1, driftP:ph(-3), marginP:ph(35), capex:100, buildStart:0, unitCostDecline:0, passThrough:0.5, buildYears:4, life:4,  debt:10, alloc:20},
  {id:'ap', name:'Applications',           evidence:3, share:30, offset:0, steepness:1, driftP:ph(0),  marginP:ph(30), capex:60,  buildStart:0, unitCostDecline:0, passThrough:0.5, buildYears:3, life:5,  debt:0,  alloc:20},
  {id:'sv', name:'Services and integration',evidence:3, share:15, offset:0, steepness:1, driftP:ph(0),  marginP:ph(15), capex:15,  buildStart:0, unitCostDecline:0, passThrough:0.5, buildYears:2, life:10, debt:0,  alloc:20}
];
// Opt-in example only, loaded by the "Load lead/lag example" button. A placeholder, not data:
// infrastructure leads end demand, applications and services lag (years, in DEFAULT_LAYERS order).
const LEAD_LAG_EXAMPLE = [-1, -2, 0, 1, 2];
// Opt-in example only, loaded by the "Load unit-cost-decline example" button. Invented round numbers, not data:
// unit-cost decline in % a year for chips, data centres, models, applications, services. Used in Vintage mode only.
const UCD_EXAMPLE = [5, 2, 8, 0, 0];
// passThrough default 0.5 (in DEFAULT_LAYERS): no view; placeholder, unsourced. Share of unit-cost decline passed to
// customers as lower prices, used only in Vintage mode.
// Input ranges [min, max, step], shared by the page's inputs and the snapshot import validator.
// Adoption speed widened to 1-20 years (from 3-20) so very fast period claims can be entered; a range change only.
// Adoption midpoint widened to 0.5-14 years (from 2-14) so a reference curve with a very fast speed can be entered; a range change only.
// Timing offset widened to -10..10 years (from -5..5) so an established network can sit well along the demand curve;
// a range change only: the model and MODEL_VERSION are unchanged, and older snapshots and links stay valid.
const LAYER_RANGES = {
  evidence:[1,5,1], share:[0,100,1], offset:[-10,10,0.5], steepness:[0.25,4,0.25], capex:[1,2000,5],
  buildStart:[0,14,1], buildYears:[1,10,1], unitCostDecline:[-10,50,0.5], passThrough:[0,1,0.05],
  life:[1,100,1], debt:[0,100,5], alloc:[0,1000,1], driftP:[-20,20,0.5], marginP:[0,90,1]
};
const GLOBAL_RANGES = {
  pool:[200,3000,50], speed:[1,20,0.5], mid:[0.5,14,0.5], premium:[-50,300,5], mult:[0,60,0.5],
  entry:[0,10,1], disc:[5,20,0.5], rd:[2,14,0.5], tv:[0,30,0.5], tvGrowth:[-5,6,0.5]
};
// tvGrowth range (-5 to 6 % a year) is a display choice, not evidence; values saved above 6 (older pages allowed 10)
// load clamped to 6 with a message. Above TV_GROWTH_WARN (4 % a year) the page shows a warning; that line is also a
// display choice, not evidence. Growth growth must also stay at least TV_GROWTH_GAP
// must also stay at least TV_GROWTH_GAP (1 point) below the discount rate, which the inputs and every validator enforce.
const TV_GROWTH_WARN = 4;
// Phase boundaries: phase 2 starts in [1, 14], phase 3 in [2, 15] (whole years; phase 2 must start first).
const PHASE_RANGES = [[1, 14, 1], [2, 15, 1]];
if (typeof module !== 'undefined') module.exports = { TV_GROWTH_WARN, DEFAULT_TV_MODE, LAYER_RANGES, GLOBAL_RANGES, PHASE_RANGES, DEFAULT_G, DEFAULT_DEF, DEFAULT_CAPEX, UCD_EXAMPLE, DEFAULT_PHASES, SCEN, SCEN_NAMES, DEFAULT_LAYERS, LEAD_LAG_EXAMPLE };
