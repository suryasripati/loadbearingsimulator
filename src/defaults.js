// Placeholders, not data. Every number here was chosen to make the mechanics visible; none is sourced.
// Defaults are neutral on timing (offset 0, steepness 1, build starts in year 0) and on phases (all three equal the v0.1 constant),
// so the default page reproduces the v0.1 results. Anything that demonstrates a verdict must be opt-in.
const DEFAULT_G = { pool:1200, speed:8, mid:8, disc:10, rd:7, tv:5, premium:0, entry:0, mult:10 };
const DEFAULT_DEF = 'A';
// Capex model: 'sustaining' (v0.1, default) or 'vintage' (opt-in cohorts with replacement at end of life).
const DEFAULT_CAPEX = 'sustaining';
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
const UCD_EXAMPLE = [10, 5, 20, 0, 0];
// passThrough default 0.5 (in DEFAULT_LAYERS): no view; placeholder, unsourced. Share of unit-cost decline passed to
// customers as lower prices, used only in Vintage mode.
if (typeof module !== 'undefined') module.exports = { DEFAULT_G, DEFAULT_DEF, DEFAULT_CAPEX, UCD_EXAMPLE, DEFAULT_PHASES, SCEN, SCEN_NAMES, DEFAULT_LAYERS, LEAD_LAG_EXAMPLE };
