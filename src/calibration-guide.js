// Guidance for every calibration input: what it means, where to look at the as-of date, a recipe, and the hindsight
// trap. One source for the in-page help and calibration/GUIDE.md (the build writes the guide from this file).
// Examples are symbolic (P, C, T and so on) or refer to the synthetic test fixture. No real episode numbers, ever.
// CommonJS export for tests; stripped by the build.

const GUIDE_INTRO = [
  'Fill an episode as someone standing at the as-of date: use only what was published, or compiled from series that stop, on or before that date.',
  'Every number needs a basis. Sourced: the value appears in a cited source. Derived: computed from cited sources, with the calculation shown. Judgement: your call, with a rationale; sources optional, but an uncited judgement keeps the file private.',
  'Examples below are symbolic. They show the shape of a calculation, never a figure from a real episode.'
];

const GUIDE = {
  pool: { label: 'Value pool at full adoption ($B a year)',
    meaning: 'Yearly revenue all layers together would earn once the technology is fully adopted.',
    where: 'Contemporary market-size estimates, trade press forecasts, prospectuses, government or industry statistics on the activity being replaced.',
    recipe: 'Take the size of the activity being displaced (A) times the share the new technology was expected to take (s), at prices quoted at the time: pool = A x s. Show both terms as sourced or derived.',
    trap: 'Using the eventual market size. The pool must be what could reasonably be estimated at the as-of date, not what the market became.' },
  speed: { label: 'Adoption speed (years from 10% to 90%)',
    meaning: 'How long adoption takes to go from 10% to 90% of its full level. Shorter is faster.',
    where: 'Early growth figures for users, traffic, mileage or sales published by the as-of date; contemporary forecasts of rollout.',
    recipe: 'From an early-phase doubling time T (years): speed = ln(81) / ln(2) x T, about 6.34 x T. Use the doubling-time helper; it fills the calculation for a derived value. This uses the early phase only; the midpoint is a separate input.',
    trap: 'Reading speed off the full adoption curve you now know. At the as-of date only the early phase was visible, and early growth often looks faster or slower than the whole curve turned out.' },
  mid: { label: 'Adoption midpoint (year of 50% adoption)',
    meaning: 'The year, counted from year 0 of the model, in which adoption reaches half of its full level.',
    where: 'Contemporary forecasts of when the technology would be "mainstream"; current adoption level against the expected full level.',
    recipe: 'If adoption at the as-of date is a (as a share of full) and speed is S, the logistic curve gives midpoint = t0 + (S / ln(81)) x ln((1 - a) / a), where t0 is the as-of year counted from year 0.',
    trap: 'Placing the midpoint where it actually fell. Use the adoption level and expectations visible at the as-of date.' },
  disc: { label: 'Discount rate (%)',
    meaning: 'The return investors needed to be paid for the risk.',
    where: 'Contemporary yields on government debt and on comparable risky investments; required returns quoted by investors or regulators at the time.',
    recipe: 'Risk-free yield at the as-of date (r) plus a risk premium (p) justified from period sources: disc = r + p.',
    trap: 'Using the rate implied by what happened next (for example a crash in prices). The rate must be the one demanded at the time.' },
  rd: { label: 'Interest on debt (%)',
    meaning: 'The interest rate on borrowing used to fund the build.',
    where: 'Bond prospectuses, loan terms, contemporary corporate bond yields for similar borrowers.',
    recipe: 'Quoted coupon or yield on comparable debt at the as-of date.',
    trap: 'Using rates after a default wave or a policy change that came later.' },
  tv: { label: 'Value beyond year 15 (multiple of year-15 cash flow)',
    meaning: 'How much value the layer keeps after the 15-year horizon, as a multiple of its year-15 cash flow.',
    where: 'Contemporary valuations of mature, comparable businesses; dividend yields of established utilities or carriers at the time.',
    recipe: 'If mature comparables traded at a cash yield y, a multiple of about 1 / y is a starting point; state y and its source.',
    trap: 'Choosing a low multiple because you know the layer later struggled.' },
  premium: { label: 'Entry premium over build cost (%)',
    meaning: 'Under the replacement-cost definition, how much above build cost an investor paid at entry.',
    where: 'Share prices against the book value of assets built; market-to-book ratios reported at the time.',
    recipe: 'premium = (price paid / build cost spent) - 1, from period prices and accounts.',
    trap: 'Using the bubble peak or the trough you know about instead of the price at the as-of date.' },
  entry: { label: 'Entry year',
    meaning: 'The model year in which the investor buys in. Cash flows from this year on are the investor\'s.',
    where: 'Set by the as-of rule: usually the model year corresponding to the as-of date.',
    recipe: 'entry = as-of year - year 0 of the model, as whole years.',
    trap: 'Moving the entry to a convenient year after seeing how prices moved.' },
  mult: { label: 'Entry multiple of next-year operating cash',
    meaning: 'Under the forward-cash definition, the price paid as a multiple of next year\'s operating cash.',
    where: 'Contemporary price-to-cash-flow or price-to-earnings figures; analysts\' forward estimates published by the as-of date.',
    recipe: 'multiple = price paid / expected next-year operating cash, both from period sources.',
    trap: 'Dividing by the cash flow that was actually realised rather than the one expected at the time.' },
  phase2Start: { label: 'Phase 2 starts (year)',
    meaning: 'The first model year of the second calendar phase for drift and margin.',
    where: 'Contemporary expectations of when competition, regulation or capacity would change conditions.',
    recipe: 'Pick the year a period source expected conditions to change; leave the default split only if no source says otherwise, and record that as a judgement.',
    trap: 'Placing the phase break at the turning point you now know.' },
  phase3Start: { label: 'Phase 3 starts (year)',
    meaning: 'The first model year of the third calendar phase.',
    where: 'As for phase 2.',
    recipe: 'As for phase 2; it must come after phase 2.',
    trap: 'As for phase 2.' },
  evidence: { label: 'Demand evidence (1 to 5)',
    meaning: 'How much observed, paid, growing usage existed at the as-of date. 1 is forecast only; 5 is observed, paid, growing usage.',
    where: 'Traffic returns, paid usage, revenue reports and customer counts published by the as-of date.',
    recipe: 'Score against what was observed, not forecast: no paying users = 1; small paid pilots = 2; paid usage growing in more than one market = 4 or 5. Record the reason as a judgement.',
    trap: 'Scoring higher because demand later proved real, or lower because it later disappointed.' },
  share: { label: 'Share of pool at the start (%)',
    meaning: 'The share of the value pool this layer captures in year 0.',
    where: 'Contemporary breakdowns of spending by segment; company revenues against the market total at the time.',
    recipe: 'share = layer revenue R / pool revenue P, both at the as-of date.',
    trap: 'Using the share the layer ended up with.' },
  offset: { label: 'Timing offset (years; negative leads, positive lags)',
    meaning: 'How far this layer\'s revenue runs ahead of (negative) or behind (positive) end demand.',
    where: 'Order books, construction schedules and lead times reported at the time.',
    recipe: 'If period sources show this layer\'s orders arriving L years before end use, offset = -L.',
    trap: 'Fitting the offset to the revenue peaks you now know.' },
  steepness: { label: 'Curve steepness (1 = same as demand)',
    meaning: 'How much steeper (above 1) or flatter (below 1) this layer\'s adoption is than end demand.',
    where: 'Contemporary evidence that this layer saturates faster or slower than end use.',
    recipe: 'If the layer is expected to go from 10% to 90% in S_L years while demand takes S, steepness = S / S_L.',
    trap: 'Matching the steepness to the realised shape.' },
  capex: { label: 'Build capex ($B)',
    meaning: 'Total capital spent to build the layer\'s capacity.',
    where: 'Prospectuses, authorised capital, construction budgets and announced investment programmes published by the as-of date.',
    recipe: 'Sum the announced or authorised budgets (B1 + B2 + ...) for the capacity in scope, in the model\'s currency units.',
    trap: 'Using the final out-turn cost, including overruns that only became known later.' },
  buildStart: { label: 'Build starts (year)',
    meaning: 'The model year in which capital starts going in.',
    where: 'Announced construction start dates.',
    recipe: 'buildStart = announced start year - year 0 of the model.',
    trap: 'Using actual start dates that slipped after the as-of date.' },
  buildYears: { label: 'Build years',
    meaning: 'How many years the initial build takes.',
    where: 'Announced construction schedules.',
    recipe: 'Planned completion year - planned start year.',
    trap: 'Using the realised schedule, including delays not known at the time.' },
  unitCostDecline: { label: 'Unit-cost decline (% a year, Vintage mode)',
    meaning: 'How fast the cost of the same capacity was expected to fall each year.',
    where: 'Contemporary engineering or trade estimates of cost per unit of capacity over time.',
    recipe: 'If cost per unit was expected to fall from c0 to c1 over n years: decline = 1 - (c1 / c0)^(1 / n).',
    trap: 'Using the realised cost curve, which may have fallen much faster or slower than expected.' },
  passThrough: { label: 'Pass-through to prices (0 to 1, Vintage mode)',
    meaning: 'The share of the unit-cost decline that competition was expected to hand to customers as lower prices.',
    where: 'Contemporary pricing rules, regulation, tariff schedules and the degree of competition at the time.',
    recipe: 'Regulated pass-through rules give it directly; otherwise record a judgement with a rationale about competition at the time.',
    trap: 'Setting it from the price war that later happened.' },
  life: { label: 'Asset life (years)',
    meaning: 'How long the built asset lasts before it must be replaced.',
    where: 'Depreciation policies, engineering life estimates and replacement schedules in period accounts.',
    recipe: 'Use the depreciation life in period accounts, or the engineering life quoted at the time.',
    trap: 'Shortening the life because you know the technology was superseded early.' },
  debt: { label: 'Debt (% of build)',
    meaning: 'The share of the build funded by borrowing.',
    where: 'Capital structure in prospectuses and accounts at the time.',
    recipe: 'debt = borrowing D / total build funding F.',
    trap: 'Using the debt load after later refinancing or distress.' },
  driftP: { label: 'Share drift (% a year, per phase)',
    meaning: 'How the layer\'s share of the pool was expected to change each year in each phase; negative is commoditisation.',
    where: 'Contemporary expectations of competition, new entrants and price pressure.',
    recipe: 'If the share was expected to move from s0 to s1 over n years: drift = (s1 / s0)^(1 / n) - 1.',
    trap: 'Matching drift to the share loss that actually happened.' },
  marginP: { label: 'Cash margin (% per phase)',
    meaning: 'Operating cash as a share of revenue, per phase.',
    where: 'Period accounts of comparable operators; operating ratios published at the time.',
    recipe: 'margin = operating cash C / revenue R, from period accounts.',
    trap: 'Using margins from after the shake-out.' }
};

// Scorer checklist: what the scorer already knew. Every item must be answered (yes, no or partly) before locking.
const SCORER_CHECKLIST = [
  { key: 'peakDate', text: 'Knew the peak date' },
  { key: 'fallSize', text: 'Knew the size of the fall' },
  { key: 'failures', text: 'Knew which companies failed or survived' },
  { key: 'finalFigures', text: 'Knew final revenue or traffic figures' },
  { key: 'laterSources', text: 'Have read sources published after the as-of date' },
  { key: 'outcomesFirst', text: 'Looked at outcomes before entering inputs' }
];

function guideMarkdown(){
  const out = ['# Calibration guide', '', '<!-- Generated from src/calibration-guide.js by npm run build. Edit that file, not this one. -->', ''];
  GUIDE_INTRO.forEach(p => { out.push(p, ''); });
  out.push('## Before you start: what you already know', '', 'Answer each item yes, no or partly before locking. The answers are part of the lock hash.', '');
  SCORER_CHECKLIST.forEach(c => out.push('- ' + c.text));
  out.push('', '## Inputs', '');
  Object.keys(GUIDE).forEach(k => {
    const g = GUIDE[k];
    out.push('### ' + g.label + ' (`' + k + '`)', '', '- **Meaning.** ' + g.meaning, '- **Where to look at the as-of date.** ' + g.where,
      '- **Recipe.** ' + g.recipe, '- **Hindsight trap.** ' + g.trap, '');
  });
  out.push('## Input versions', '', 'An episode can be scored with more than one input version (for example a hype version and a measured version of adoption speed). Each version is locked separately with its own hash and acknowledgement. All versions share the as-of date, as-of rule, outcome horizon, outcome measure, scorer checklist and layer names; changing any of those after a version is locked means starting a new episode version.', '');
  return out.join('\n');
}

if (typeof module !== 'undefined') module.exports = { GUIDE, GUIDE_INTRO, SCORER_CHECKLIST, guideMarkdown };
