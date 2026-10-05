# Calibration guide

<!-- Generated from src/calibration-guide.js by npm run build. Edit that file, not this one. -->

Fill an episode as someone standing at the as-of date: use only what was published, or compiled from series that stop, on or before that date.

Every number needs a basis. Sourced: the value appears in a cited source. Derived: computed from cited sources, with the calculation shown. Judgement: your call, with a rationale; sources optional, but an uncited judgement keeps the file private.

Examples below are symbolic. They show the shape of a calculation, never a figure from a real episode.

## Before you start: what you already know

Answer each item yes, no or partly before locking. The answers are part of the lock hash.

- Knew the peak date
- Knew the size of the fall
- Knew which companies failed or survived
- Knew final revenue or traffic figures
- Have read sources published after the as-of date
- Looked at outcomes before entering inputs

## Inputs

### Value pool at full adoption ($B a year) (`pool`)

- **Meaning.** Yearly revenue all layers together would earn once the technology is fully adopted.
- **Where to look at the as-of date.** Contemporary market-size estimates, trade press forecasts, prospectuses, government or industry statistics on the activity being replaced.
- **Recipe.** Take the size of the activity being displaced (A) times the share the new technology was expected to take (s), at prices quoted at the time: pool = A x s. Show both terms as sourced or derived.
- **Hindsight trap.** Using the eventual market size. The pool must be what could reasonably be estimated at the as-of date, not what the market became.

### Adoption speed (years from 10% to 90%) (`speed`)

- **Meaning.** How long adoption takes to go from 10% to 90% of its full level. Shorter is faster.
- **Where to look at the as-of date.** Early growth figures for users, traffic, mileage or sales published by the as-of date; contemporary forecasts of rollout.
- **Recipe.** From an early-phase doubling time T (years): speed = ln(81) / ln(2) x T, about 6.34 x T. Use the doubling-time helper; it fills the calculation for a derived value. This uses the early phase only; the midpoint is a separate input.
- **Hindsight trap.** Reading speed off the full adoption curve you now know. At the as-of date only the early phase was visible, and early growth often looks faster or slower than the whole curve turned out.

### Adoption midpoint (year of 50% adoption) (`mid`)

- **Meaning.** The year, counted from year 0 of the model, in which adoption reaches half of its full level.
- **Where to look at the as-of date.** Contemporary forecasts of when the technology would be "mainstream"; current adoption level against the expected full level.
- **Recipe.** If adoption at the as-of date is a (as a share of full) and speed is S, the logistic curve gives midpoint = t0 + (S / ln(81)) x ln((1 - a) / a), where t0 is the as-of year counted from year 0.
- **Hindsight trap.** Placing the midpoint where it actually fell. Use the adoption level and expectations visible at the as-of date.

### Discount rate (%) (`disc`)

- **Meaning.** The return investors needed to be paid for the risk.
- **Where to look at the as-of date.** Contemporary yields on government debt and on comparable risky investments; required returns quoted by investors or regulators at the time.
- **Recipe.** Risk-free yield at the as-of date (r) plus a risk premium (p) justified from period sources: disc = r + p.
- **Hindsight trap.** Using the rate implied by what happened next (for example a crash in prices). The rate must be the one demanded at the time.

### Interest on debt (%) (`rd`)

- **Meaning.** The interest rate on borrowing used to fund the build.
- **Where to look at the as-of date.** Bond prospectuses, loan terms, contemporary corporate bond yields for similar borrowers.
- **Recipe.** Quoted coupon or yield on comparable debt at the as-of date.
- **Hindsight trap.** Using rates after a default wave or a policy change that came later.

### Value beyond year 15 (multiple of year-15 cash flow) (`tv`)

- **Meaning.** How much value the layer keeps after the 15-year horizon, as a multiple of its year-15 cash flow.
- **Where to look at the as-of date.** Contemporary valuations of mature, comparable businesses; dividend yields of established utilities or carriers at the time.
- **Recipe.** If mature comparables traded at a cash yield y, a multiple of about 1 / y is a starting point; state y and its source.
- **Hindsight trap.** Choosing a low multiple because you know the layer later struggled.

### Entry premium over build cost (%) (`premium`)

- **Meaning.** Under the replacement-cost definition, how much above build cost an investor paid at entry.
- **Where to look at the as-of date.** Share prices against the book value of assets built; market-to-book ratios reported at the time.
- **Recipe.** premium = (price paid / build cost spent) - 1, from period prices and accounts.
- **Hindsight trap.** Using the bubble peak or the trough you know about instead of the price at the as-of date.

### Entry year (`entry`)

- **Meaning.** The model year in which the investor buys in. Cash flows from this year on are the investor's.
- **Where to look at the as-of date.** Set by the as-of rule: usually the model year corresponding to the as-of date.
- **Recipe.** entry = as-of year - year 0 of the model, as whole years.
- **Hindsight trap.** Moving the entry to a convenient year after seeing how prices moved.

### Entry multiple of next-year operating cash (`mult`)

- **Meaning.** Under the forward-cash definition, the price paid as a multiple of next year's operating cash.
- **Where to look at the as-of date.** Contemporary price-to-cash-flow or price-to-earnings figures; analysts' forward estimates published by the as-of date.
- **Recipe.** multiple = price paid / expected next-year operating cash, both from period sources.
- **Hindsight trap.** Dividing by the cash flow that was actually realised rather than the one expected at the time.

### Phase 2 starts (year) (`phase2Start`)

- **Meaning.** The first model year of the second calendar phase for drift and margin.
- **Where to look at the as-of date.** Contemporary expectations of when competition, regulation or capacity would change conditions.
- **Recipe.** Pick the year a period source expected conditions to change; leave the default split only if no source says otherwise, and record that as a judgement.
- **Hindsight trap.** Placing the phase break at the turning point you now know.

### Phase 3 starts (year) (`phase3Start`)

- **Meaning.** The first model year of the third calendar phase.
- **Where to look at the as-of date.** As for phase 2.
- **Recipe.** As for phase 2; it must come after phase 2.
- **Hindsight trap.** As for phase 2.

### Demand evidence (1 to 5) (`evidence`)

- **Meaning.** How much observed, paid, growing usage existed at the as-of date. 1 is forecast only; 5 is observed, paid, growing usage.
- **Where to look at the as-of date.** Traffic returns, paid usage, revenue reports and customer counts published by the as-of date.
- **Recipe.** Score against what was observed, not forecast: no paying users = 1; small paid pilots = 2; paid usage growing in more than one market = 4 or 5. Record the reason as a judgement.
- **Hindsight trap.** Scoring higher because demand later proved real, or lower because it later disappointed.

### Share of pool at the start (%) (`share`)

- **Meaning.** The share of the value pool this layer captures in year 0.
- **Where to look at the as-of date.** Contemporary breakdowns of spending by segment; company revenues against the market total at the time.
- **Recipe.** share = layer revenue R / pool revenue P, both at the as-of date.
- **Hindsight trap.** Using the share the layer ended up with.

### Timing offset (years; negative leads, positive lags) (`offset`)

- **Meaning.** How far this layer's revenue runs ahead of (negative) or behind (positive) end demand.
- **Where to look at the as-of date.** Order books, construction schedules and lead times reported at the time.
- **Recipe.** If period sources show this layer's orders arriving L years before end use, offset = -L.
- **Hindsight trap.** Fitting the offset to the revenue peaks you now know.

### Curve steepness (1 = same as demand) (`steepness`)

- **Meaning.** How much steeper (above 1) or flatter (below 1) this layer's adoption is than end demand.
- **Where to look at the as-of date.** Contemporary evidence that this layer saturates faster or slower than end use.
- **Recipe.** If the layer is expected to go from 10% to 90% in S_L years while demand takes S, steepness = S / S_L.
- **Hindsight trap.** Matching the steepness to the realised shape.

### Build capex ($B) (`capex`)

- **Meaning.** Total capital spent to build the layer's capacity.
- **Where to look at the as-of date.** Prospectuses, authorised capital, construction budgets and announced investment programmes published by the as-of date.
- **Recipe.** Sum the announced or authorised budgets (B1 + B2 + ...) for the capacity in scope, in the model's currency units.
- **Hindsight trap.** Using the final out-turn cost, including overruns that only became known later.

### Build starts (year) (`buildStart`)

- **Meaning.** The model year in which capital starts going in.
- **Where to look at the as-of date.** Announced construction start dates.
- **Recipe.** buildStart = announced start year - year 0 of the model.
- **Hindsight trap.** Using actual start dates that slipped after the as-of date.

### Build years (`buildYears`)

- **Meaning.** How many years the initial build takes.
- **Where to look at the as-of date.** Announced construction schedules.
- **Recipe.** Planned completion year - planned start year.
- **Hindsight trap.** Using the realised schedule, including delays not known at the time.

### Unit-cost decline (% a year, Vintage mode) (`unitCostDecline`)

- **Meaning.** How fast the cost of the same capacity was expected to fall each year.
- **Where to look at the as-of date.** Contemporary engineering or trade estimates of cost per unit of capacity over time.
- **Recipe.** If cost per unit was expected to fall from c0 to c1 over n years: decline = 1 - (c1 / c0)^(1 / n).
- **Hindsight trap.** Using the realised cost curve, which may have fallen much faster or slower than expected.

### Pass-through to prices (0 to 1, Vintage mode) (`passThrough`)

- **Meaning.** The share of the unit-cost decline that competition was expected to hand to customers as lower prices.
- **Where to look at the as-of date.** Contemporary pricing rules, regulation, tariff schedules and the degree of competition at the time.
- **Recipe.** Regulated pass-through rules give it directly; otherwise record a judgement with a rationale about competition at the time.
- **Hindsight trap.** Setting it from the price war that later happened.

### Asset life (years) (`life`)

- **Meaning.** How long the built asset lasts before it must be replaced.
- **Where to look at the as-of date.** Depreciation policies, engineering life estimates and replacement schedules in period accounts.
- **Recipe.** Use the depreciation life in period accounts, or the engineering life quoted at the time.
- **Hindsight trap.** Shortening the life because you know the technology was superseded early.

### Debt (% of build) (`debt`)

- **Meaning.** The share of the build funded by borrowing.
- **Where to look at the as-of date.** Capital structure in prospectuses and accounts at the time.
- **Recipe.** debt = borrowing D / total build funding F.
- **Hindsight trap.** Using the debt load after later refinancing or distress.

### Share drift (% a year, per phase) (`driftP`)

- **Meaning.** How the layer's share of the pool was expected to change each year in each phase; negative is commoditisation.
- **Where to look at the as-of date.** Contemporary expectations of competition, new entrants and price pressure.
- **Recipe.** If the share was expected to move from s0 to s1 over n years: drift = (s1 / s0)^(1 / n) - 1.
- **Hindsight trap.** Matching drift to the share loss that actually happened.

### Cash margin (% per phase) (`marginP`)

- **Meaning.** Operating cash as a share of revenue, per phase.
- **Where to look at the as-of date.** Period accounts of comparable operators; operating ratios published at the time.
- **Recipe.** margin = operating cash C / revenue R, from period accounts.
- **Hindsight trap.** Using margins from after the shake-out.

## Input versions

An episode can be scored with more than one input version (for example a hype version and a measured version of adoption speed). Each version is locked separately with its own hash and acknowledgement. All versions share the as-of date, as-of rule, outcome horizon, outcome measure, scorer checklist and layer names; changing any of those after a version is locked means starting a new episode version.
