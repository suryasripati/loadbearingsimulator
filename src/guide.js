// Input guide: the single source of text about each input. For every input: its group, label, the short note shown
// by its info icon (tip, where the page has one), what it means, where to look at a case's as-of date, a recipe and
// the hindsight trap. Used by the "Input guide" tab in "Behind the tool" and by the info icons on the sliders.
// Ranges and defaults are never typed here: guideRows() reads them from src/defaults.js.
// Examples are symbolic (P, C, T and so on); no real numbers, ever. Formulas sit between backticks and are shown in
// monospace. CommonJS export for tests; stripped by the build and inlined before the UI code.

const GUIDE_INTRO = [
  'What each input means, its range and default, and in which view it appears. Turn on case guidance to add where to look at a chosen as-of date, a recipe for estimating it, and the hindsight trap to avoid.',
  'In a case, every number shows its basis. Sourced: the value appears in a cited source. Derived: computed from cited sources, with the calculation shown. Judgement: a call made with a stated rationale; it may have no source and is always labelled.',
  'Examples below are symbolic. They show the shape of a calculation, never a figure from a real episode.'
];

const GUIDE = {
  pool: { group: 'Scenario', label: 'Value pool at full adoption ($B a year)',
    tip: "Yearly revenue, all layers combined. Scale of applications lives here.",
    meaning: 'Yearly revenue all layers together would earn once the technology is fully adopted.',
    where: 'Contemporary market-size estimates, trade press forecasts, prospectuses, government or industry statistics on the activity being replaced.',
    recipe: 'Take the size of the activity being displaced (A) times the share the new technology was expected to take (s), at prices quoted at the time: `pool = A x s`. Show both terms as sourced or derived.',
    trap: 'Using the eventual market size. The pool must be what could reasonably be estimated at the as-of date, not what the market became.' },
  speed: { group: 'Scenario', label: 'Adoption speed (years from 10% to 90%)',
    tip: "Years to go from 10% to 90% of full adoption.",
    meaning: 'How long adoption takes to go from 10% to 90% of its full level. Shorter is faster.',
    where: 'Early growth figures for users, traffic, mileage or sales published by the as-of date; contemporary forecasts of rollout.',
    recipe: 'From an early-phase doubling time T (years): `speed = ln(81) / ln(2) x T`, about `6.34 x T`. Record it as a derived value with this calculation. This uses the early phase only; the midpoint is a separate input.',
    trap: 'Reading speed off the full adoption curve you now know. At the as-of date only the early phase was visible, and early growth often looks faster or slower than the whole curve turned out.' },
  mid: { group: 'Scenario', label: 'Adoption midpoint (year of 50% adoption)',
    tip: "Year in which adoption reaches half of its full level.",
    meaning: 'The year, counted from year 0 of the model, in which adoption reaches half of its full level.',
    where: 'Contemporary forecasts of when the technology would be "mainstream"; current adoption level against the expected full level.',
    recipe: 'If adoption at the as-of date is a (as a share of full) and speed is S, the logistic curve gives `midpoint = t0 + (S / ln(81)) x ln((1 - a) / a)`, where t0 is the as-of year counted from year 0.',
    trap: 'Placing the midpoint where it actually fell. Use the adoption level and expectations visible at the as-of date.' },
  disc: { group: 'Money', label: 'Discount rate (%)',
    tip: "The return you need to be paid for the risk.",
    meaning: 'The return investors needed to be paid for the risk.',
    where: 'Contemporary yields on government debt and on comparable risky investments; required returns quoted by investors or regulators at the time.',
    recipe: 'Risk-free yield at the as-of date (r) plus a risk premium (p) justified from period sources: `disc = r + p`.',
    trap: 'Using the rate implied by what happened next (for example a crash in prices). The rate must be the one demanded at the time.' },
  rd: { group: 'Money', label: 'Interest on debt (%)',
    tip: "Debt is repaid evenly over eight years after the build ends.",
    meaning: 'The interest rate on borrowing used to fund the build.',
    where: 'Bond prospectuses, loan terms, contemporary corporate bond yields for similar borrowers.',
    recipe: 'Quoted coupon or yield on comparable debt at the as-of date.',
    trap: 'Using rates after a default wave or a policy change that came later.' },
  tv: { group: 'Money', label: 'Value beyond year 15 (multiple of year-15 cash flow)',
    tip: "Multiple of year-15 cash flow. Set it to 0 to count only what arrives within 15 years.",
    meaning: 'How much value the layer keeps after the 15-year horizon, as a multiple of its year-15 cash flow.',
    where: 'Contemporary valuations of mature, comparable businesses; dividend yields of established utilities or carriers at the time.',
    recipe: 'If mature comparables traded at a cash yield y, a multiple of about `1 / y` is a starting point; state y and its source.',
    trap: 'Choosing a low multiple because you know the layer later struggled.' },
  tvMode: { group: 'Money', label: 'Value beyond year 15: mode (multiple or growing perpetuity)',
    tip: "How value beyond year 15 is counted. Multiple (default): your multiple times year-15 cash after sustaining spend. Growing perpetuity: year-15 cash growing for ever at a long-run rate g, discounted at your rate r, which equals a multiple of (1 + g) ÷ (r − g). At g = 0 that is 1 ÷ r, so 10x at 10%, twice the default multiple of 5. Growth must stay at least 1 point below the discount rate.",
    meaning: 'Whether value after year 15 is a fixed multiple of year-15 cash, or year-15 cash growing for ever at a long-run rate, which implies a multiple of `(1 + g) / (r - g)`.',
    where: 'How contemporaries valued long-lived assets: as a multiple of earnings, or as a yield on a growing income.',
    recipe: 'Use the perpetuity when you can state a long-run growth rate g and want the multiple to move with the discount rate; otherwise keep the multiple.',
    trap: 'Switching mode to get a terminal value you already like.' },
  tvGrowth: { group: 'Money', label: 'Long-run growth (% a year, perpetuity mode)',
    tip: "Growth of year-15 cash for ever, in % a year, used only in the growing-perpetuity mode. Default 0 is a placeholder with no view behind it, unsourced. The value shows the multiple it implies at your discount rate. Kept at least 1 point below the discount rate. Above 4% a year a warning shows; that line is a display choice, not evidence.",
    meaning: 'Growth of year-15 cash for ever. Must stay at least 1 point below the discount rate. Above 4% a year the page shows a warning (the 4% line is a display choice, not evidence).',
    where: 'Long-run growth of the economy or of the asset class as stated at the time.',
    recipe: '`g` = long-run nominal growth stated in period sources; implied multiple `= (1 + g) / (r - g)`.',
    trap: 'Using growth that only later turned out to be achievable.' },
  entryDef: { group: 'Money', label: 'Entry price definition',
    meaning: 'How the entry price is set: A, a premium over build cost (replacement cost), or B, a multiple of next-year operating cash.',
    where: 'How investors at the time quoted prices: against assets built (market to book) or against expected earnings.',
    recipe: 'Use A when period sources compare prices with capital spent; B when they quote prices against expected cash or earnings.',
    trap: 'Picking the definition that gives the answer you expect.' },
  premium: { group: 'Money', label: 'Entry premium over build cost (%)',
    tip: "0% means you pay what it costs to build. 100% means you pay double. This is the lever that asks whether money should go in at all.",
    meaning: 'Under the replacement-cost definition, how much above build cost an investor paid at entry.',
    where: 'Share prices against the book value of assets built; market-to-book ratios reported at the time.',
    recipe: '`premium = (price paid / build cost spent) - 1`, from period prices and accounts.',
    trap: 'Using the bubble peak or the trough you know about instead of the price at the as-of date.' },
  entry: { group: 'Money', label: 'Entry year',
    tip: "You own the layer's cash flows from this year on. Present values are stated in entry-year terms.",
    meaning: 'The model year in which the investor buys in. Cash flows from this year on are the investor\'s.',
    where: 'Set by the as-of rule: usually the model year corresponding to the as-of date.',
    recipe: '`entry = as-of year - year 0 of the model`, as whole years.',
    trap: 'Moving the entry to a convenient year after seeing how prices moved.' },
  mult: { group: 'Money', label: 'Entry multiple of next-year operating cash',
    tip: "Price paid at entry, as a multiple of the layer's operating cash in the following year (before sustaining spend). Default 10x is a placeholder.",
    meaning: 'Under the forward-cash definition, the price paid as a multiple of next year\'s operating cash.',
    where: 'Contemporary price-to-cash-flow or price-to-earnings figures; analysts\' forward estimates published by the as-of date.',
    recipe: '`multiple = price paid / expected next-year operating cash`, both from period sources.',
    trap: 'Dividing by the cash flow that was actually realised rather than the one expected at the time.' },
  phase2Start: { group: 'Timing', label: 'Phase 2 starts (year)',
    meaning: 'The first model year of the second calendar phase for drift and margin.',
    where: 'Contemporary expectations of when competition, regulation or capacity would change conditions.',
    recipe: 'Pick the year a period source expected conditions to change; leave the default split only if no source says otherwise, and record that as a judgement.',
    trap: 'Placing the phase break at the turning point you now know.' },
  phase3Start: { group: 'Timing', label: 'Phase 3 starts (year)',
    meaning: 'The first model year of the third calendar phase.',
    where: 'As for phase 2.',
    recipe: 'As for phase 2; it must come after phase 2.',
    trap: 'As for phase 2.' },
  evidence: { group: 'Layer', label: 'Demand evidence (1 to 5)',
    meaning: 'How much observed, paid, growing usage existed at the as-of date. 1 is forecast only; 5 is observed, paid, growing usage.',
    where: 'Traffic returns, paid usage, revenue reports and customer counts published by the as-of date.',
    recipe: 'Score against what was observed, not forecast: no paying users = 1; small paid pilots = 2; paid usage growing in more than one market = 4 or 5. Record the reason as a judgement.',
    trap: 'Scoring higher because demand later proved real, or lower because it later disappointed.' },
  share: { group: 'Layer', label: 'Share of pool at the start (%)',
    meaning: 'The share of the value pool this layer captures in year 0.',
    where: 'Contemporary breakdowns of spending by segment; company revenues against the market total at the time.',
    recipe: '`share = R / P` (layer revenue over pool revenue), both at the as-of date.',
    trap: 'Using the share the layer ended up with.' },
  offset: { group: 'Timing', label: 'Timing offset (years; negative leads, positive lags)',
    meaning: 'How far this layer\'s revenue runs ahead of (negative) or behind (positive) end demand.',
    where: 'Order books, construction schedules and lead times reported at the time.',
    recipe: 'If period sources show this layer\'s orders arriving L years before end use, `offset = -L`.',
    trap: 'Fitting the offset to the revenue peaks you now know.' },
  steepness: { group: 'Timing', label: 'Curve steepness (1 = same as demand)',
    meaning: 'How much steeper (above 1) or flatter (below 1) this layer\'s adoption is than end demand.',
    where: 'Contemporary evidence that this layer saturates faster or slower than end use.',
    recipe: 'If the layer is expected to go from 10% to 90% in S_L years while demand takes S, `steepness = S / S_L`.',
    trap: 'Matching the steepness to the realised shape.' },
  capex: { group: 'Layer', label: 'Build capex ($B)',
    meaning: 'Total capital spent to build the layer\'s capacity.',
    where: 'Prospectuses, authorised capital, construction budgets and announced investment programmes published by the as-of date.',
    recipe: 'Sum the announced or authorised budgets (`B1 + B2 + ...`) for the capacity in scope, in the model\'s currency units.',
    trap: 'Using the final out-turn cost, including overruns that only became known later.' },
  buildStart: { group: 'Timing', label: 'Build starts (year)',
    meaning: 'The model year in which capital starts going in.',
    where: 'Announced construction start dates.',
    recipe: '`buildStart = announced start year - year 0 of the model`.',
    trap: 'Using actual start dates that slipped after the as-of date.' },
  buildYears: { group: 'Timing', label: 'Build years',
    meaning: 'How many years the initial build takes.',
    where: 'Announced construction schedules.',
    recipe: '`buildYears = planned completion year - planned start year`.',
    trap: 'Using the realised schedule, including delays not known at the time.' },
  capexModel: { group: 'Vintage', label: 'Capex model (sustaining spend or vintage cohorts)',
    meaning: 'Sustaining spend (the v0.1 model) charges build capex / asset life every year after the build. Vintage cohorts replace each year\'s build at the end of its life, at a cost that falls with unit-cost decline.',
    where: 'Whether period sources describe replacement as a steady charge or as rebuilding in lumps when assets wear out.',
    recipe: 'Use vintage cohorts when unit costs were expected to fall, or when replacement came in lumps; otherwise keep sustaining spend.',
    trap: 'Switching to vintage cohorts only because you know costs later collapsed.' },
  unitCostDecline: { group: 'Vintage', label: 'Unit-cost decline (% a year, Vintage mode)',
    meaning: 'How fast the cost of the same capacity was expected to fall each year.',
    where: 'Contemporary engineering or trade estimates of cost per unit of capacity over time.',
    recipe: 'If cost per unit was expected to fall from c0 to c1 over n years: `decline = 1 - (c1 / c0)^(1 / n)`.',
    trap: 'Using the realised cost curve, which may have fallen much faster or slower than expected.' },
  passThrough: { group: 'Vintage', label: 'Pass-through to prices (0 to 1, Vintage mode)',
    meaning: 'The share of the unit-cost decline that competition was expected to hand to customers as lower prices.',
    where: 'Contemporary pricing rules, regulation, tariff schedules and the degree of competition at the time.',
    recipe: 'Regulated pass-through rules give it directly; otherwise record a judgement with a rationale about competition at the time.',
    trap: 'Setting it from the price war that later happened.' },
  life: { group: 'Layer', label: 'Asset life (years)',
    meaning: 'How long the built asset lasts before it must be replaced.',
    where: 'Depreciation policies, engineering life estimates and replacement schedules in period accounts.',
    recipe: 'Use the depreciation life in period accounts, or the engineering life quoted at the time.',
    trap: 'Shortening the life because you know the technology was superseded early.' },
  debt: { group: 'Layer', label: 'Debt (% of build)',
    meaning: 'The share of the build funded by borrowing.',
    where: 'Capital structure in prospectuses and accounts at the time.',
    recipe: '`debt = D / F` (borrowing over total build funding).',
    trap: 'Using the debt load after later refinancing or distress.' },
  alloc: { group: 'Layer', label: 'My allocation (any units)',
    meaning: 'Your own split across layers, in any units. It sizes the dots and drives the allocation figures; it never changes a layer\'s value. Personal: left out of links and never part of a case.',
    where: 'Not part of a case. Your own portfolio, if you want to see where it sits.',
    recipe: 'Enter amounts or percentages; only the proportions matter.',
    trap: 'Reading the default equal split as a recommendation. It is a placeholder.' },
  driftP: { group: 'Layer', label: 'Share drift (% a year, per phase)',
    meaning: 'How the layer\'s share of the pool was expected to change each year in each phase; negative is commoditisation.',
    where: 'Contemporary expectations of competition, new entrants and price pressure.',
    recipe: 'If the share was expected to move from s0 to s1 over n years: `drift = (s1 / s0)^(1 / n) - 1`.',
    trap: 'Matching drift to the share loss that actually happened.' },
  marginP: { group: 'Layer', label: 'Cash margin (% per phase)',
    meaning: 'Operating cash as a share of revenue, per phase.',
    where: 'Period accounts of comparable operators; operating ratios published at the time.',
    recipe: '`margin = C / R` (operating cash over revenue), from period accounts.',
    trap: 'Using margins from after the shake-out.' }
};

// Group order in the guide table.
const GUIDE_GROUPS = ['Scenario', 'Money', 'Layer', 'Timing', 'Vintage'];
// Inputs on the first screen (every mode); every other input is Analyst-only (locked decision 15).
const GUIDE_FIRST_SCREEN = ['speed', 'mid', 'pool', 'premium', 'disc', 'alloc'];

function guideDeps(){
  if (typeof module !== 'undefined' && typeof require === 'function') return require('./defaults.js');
  return { LAYER_RANGES, GLOBAL_RANGES, PHASE_RANGES, DEFAULT_G, DEFAULT_LAYERS, DEFAULT_PHASES, DEFAULT_DEF, DEFAULT_CAPEX, DEFAULT_TV_MODE };
}
const guideNum = (v) => String(Math.round(v * 1000) / 1000);
// "Range and default" text, generated from the shared ranges and defaults (never typed by hand).
function guideRange(k, d){
  const r = d.GLOBAL_RANGES[k] || d.LAYER_RANGES[k] || (k === 'phase2Start' ? d.PHASE_RANGES[0] : k === 'phase3Start' ? d.PHASE_RANGES[1] : null);
  if (k === 'entryDef') return 'A (premium) or B (multiple); default ' + d.DEFAULT_DEF;
  if (k === 'capexModel') return 'sustaining or vintage; default ' + d.DEFAULT_CAPEX;
  if (k === 'tvMode') return 'multiple or perpetuity; default ' + d.DEFAULT_TV_MODE;
  if (!r) return '';
  const span = guideNum(r[0]) + ' to ' + guideNum(r[1]) + ', step ' + guideNum(r[2]);
  let def;
  if (k in d.GLOBAL_RANGES) def = guideNum(d.DEFAULT_G[k]);
  else if (k === 'phase2Start') def = guideNum(d.DEFAULT_PHASES[0]);
  else if (k === 'phase3Start') def = guideNum(d.DEFAULT_PHASES[1]);
  else {
    // Layer inputs: one default per layer (per-phase inputs use the phase 1 value; all three phases start equal).
    const vals = d.DEFAULT_LAYERS.map(L => Array.isArray(L[k]) ? L[k][0] : L[k]);
    def = vals.every(v => v === vals[0]) ? guideNum(vals[0]) + ' for every layer' : 'by layer ' + vals.map(guideNum).join(', ') + ' (table order)';
  }
  return span + '; default ' + def;
}
// One row per input, in group order: what the guide table shows.
function guideRows(){
  const d = guideDeps();
  const rows = [];
  GUIDE_GROUPS.forEach(g => Object.keys(GUIDE).filter(k => GUIDE[k].group === g).forEach(k => {
    const x = GUIDE[k];
    rows.push({ key: k, group: g, label: x.label, meaning: x.meaning, range: guideRange(k, d),
      shownIn: GUIDE_FIRST_SCREEN.indexOf(k) >= 0 ? 'Basic, Advanced, Analyst' : 'Analyst', where: x.where, recipe: x.recipe, trap: x.trap });
  }));
  return rows;
}

if (typeof module !== 'undefined') module.exports = { GUIDE, GUIDE_INTRO, GUIDE_GROUPS, GUIDE_FIRST_SCREEN, guideRange, guideRows };
