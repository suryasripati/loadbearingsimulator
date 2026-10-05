# Load Bearing Simulator: handoff for Claude Code

Subtitle: Capture Map & Who gets paid?

Tone for contributors and AI assistants: plain words; challenge assumptions with data; cite sources; say plainly where data is insufficient. Do not invent data.

## What this is

An interactive scenario tool. It asks: if a technology works the way the user expects, which layers of the stack earn back what is put into them, and which only look good on paper? Layers (placeholder set): chips and accelerators, data centres and power, models, applications, services and integration.

It is not a forecast, not a bubble detector, and not financial advice. It tests the soundness of money and the need to rebalance. Price enters only through the entry premium.

Status: Drop 1 is built (layer timing, calendar phases, entry year with both price definitions, heatmap). Repo: https://github.com/suryasripati/loadbearingsimulator (public). The v0.1 claude.ai artifact is superseded; retire or update its link.

## Commands

- `npm test` runs `node --test`: model tests and a jsdom UI smoke test against `docs/index.html` (build first). Node 22.22+ or 24.15+. jsdom is a pinned devDependency (test only; the page stays dependency-free).
- `npm run fixture:model` regenerates `test/fixtures/model_outputs.json` (only after bumping `MODEL_VERSION`)
- `npm run build` writes `docs/index.html` and `docs/calibration.html` (both self-contained; serve from GitHub Pages using the `/docs` folder)

## Layout

- `src/model.js` pure model, no DOM. CommonJS export for tests; the build script strips the export line so the same file runs in the page.
- `src/defaults.js` default inputs (neutral) and the opt-in lead/lag example. CommonJS export for tests; stripped and prepended to the UI code by the build.
- `src/snapshots.js` snapshot capture, export, strict import, diff and compare. Pure, no DOM; CommonJS export for tests; stripped and inlined after the defaults.
- `src/app.js` UI logic, vanilla JS, no framework.
- `src/calibration.js` calibration scaffold logic (episode schema, strict validation, SHA-256 lock hash, versions, outcomes, comparison). Pure; reuses the snapshot import helpers.
- `src/calibration.html` and `src/calibration-app.js` the separate calibration page; the build reuses the main page's CSS.
- `calibration/` empty episode template and README only; `calibration/private/` is gitignored.
- `src/template.html` markup and CSS with `/*MODEL*/` and `/*APP*/` placeholders.
- `scripts/build.js` assembles the page.
- `test/model.test.js` property tests plus a regression test against `test/fixtures/v0_1_defaults.json`.
- `test/snapshots.test.js` snapshot round trip, export privacy, import hardening, diff, compare, overdue.
- `test/model-version.test.js` runs the model on a canonical input set (`test/support/canonical.js`; records present value, break-evens, IRR, payback, terminal value, flags, verdict, stranded value, debt shortfall and cover, share left, present value at pass-through 0 and 1, and the full verdict-fragility output) and compares with `test/fixtures/model_outputs.json`; fails if outputs change without a `MODEL_VERSION` bump.
- `test/calibration.test.js` and `test/calibration-smoke.test.js` calibration rules and page; `test/support/synthetic-episode.js` is a labelled synthetic fixture (placeholder defaults, fictitious sources), not data.
- `test/smoke.test.js` jsdom smoke test of the built page (selection, default verdicts, lead/lag note, Reset). No layout: label overlap and clipping need a real-browser check.

Keep the model pure and testable. Keep the page dependency-free. If a library is ever needed, ask first.

## v0.1 model (current behaviour, do not change silently)

- Years 0 to 15 (`H = 15`). Annual cash flows, discounted at one flat rate. Year 0 is undiscounted.
- Adoption is an S-curve: `1 / (1 + exp(-k (t - mid)))` with `k = ln(81) / speed`, so `speed` is the years from 10% to 90%.
- Layer revenue = value pool x adoption x share x `(1 + drift)^t`. Negative drift stands for commoditisation.
- Operating cash = revenue x cash margin. No taxes, working capital or inflation.
- Build capex is spread evenly over build years starting in year 0 (now: starting in the layer's build start year, default 0). After the build, sustaining spend each year = build capex / asset life (a depreciation-style proxy).
- Value beyond year 15 = terminal multiple x year-15 (operating cash minus sustaining spend), floored at 0, discounted from year 15.
- Entry premium marks up build capex only. NPV is unlevered (owner-operator view). Debt drives only the debt flag.
- Break-even premium solves for the premium that makes NPV zero. IRR uses the same cash flows including terminal value.
- Debt: share of build capex, drawn with the build, interest-only during the build, then straight-line repayment over 8 years.
- Flags: life (payback later than asset life, or none by year 15; now measured from max(entry year, build start), which equals v0.1 at entry year 0 and build start 0); debt (cash shortfall on debt service above 25% of the debt); tail (more than half of the value after year 15).
- Evidence gate: demand evidence score below 3 means forecast bet. Bins combine the gate with NPV sign and flags.

Known weaknesses: one discount rate for all layers; no interaction between layers; sustaining-spend shortcut; deterministic scenarios; evidence scores are judgement.

## Locked decisions

1. All defaults are placeholders, not data. Label them so in the UI and README. Never present a default as a finding.
2. No fabricated thresholds, elasticities or historical data. Where evidence is missing, say so in the UI and in code comments.
3. Add a dial only when sensitivity shows it matters. Every new input needs a plain-language rationale and a default range.
4. Allocations are the user's personal portfolio split. Never include them in exports or snapshots unless the user ticks a box. Assume the repo may be public.
5. Keep "Placeholders, not data" and "Not financial advice" notices on the page and in the README.
6. Brand: cream `#F7F5EF`, navy `#12213D`, copper `#B8752A`, body grey `#4A4D52`. Source Serif 4 for headlines, Arial for body. Light and dark themes via CSS variables. Sentence case labels.
7. Every change that touches model maths must keep the regression test green or update the fixture deliberately, with a note in the commit message.
8. Default timing offsets are neutral (0). The default page must reproduce the v0.1 fixture; a test checks `src/defaults.js` against it.
9. Any feature that demonstrates a verdict (example profiles, example offsets) must be opt-in and labelled as a placeholder. A placeholder must never carry a headline verdict by default.
10. Default build start is year 0 for every layer, so defaults reproduce v0.1. As in decision 9, any feature that shows a verdict (examples, profiles, preset delays) must be opt-in and labelled as a placeholder.
11. Capacity limit, an unsourced assumption: capacity share K(t) = cumulative build spend through t / total build capex, and revenue uses min(layer adoption, K(t)). Capacity is assumed to scale linearly with spend. It is a first-order version of the utilisation backlog item, to be refined by vintage capex in Drop 2. It must stay labelled as an assumption in the UI, README and here. Any uncapped version lives only in tests or scratch code.
12. This repo is public. Do not commit personal views, private notes or allocation data. Calibration material may be committed only with a citation to a public source; anything uncited goes in `calibration/private/`, which is gitignored.
13. Snapshots stay in the browser (local storage). Snapshot exports are files the user downloads and are never committed; `exports/` and `*.snapshot.json` are gitignored, and export file names end in `.snapshot.json`. Allocations are excluded from exports unless the user ticks the box. The public-repo rule (12) applies.
14. All source files share one script scope in the page; never declare the same top-level name in two files (a smoke test checks). Bump `MODEL_VERSION` in `src/model.js` whenever the maths changes (any change that can move an output for the same inputs), then run `npm run fixture:model`. Snapshots record the version; comparisons across versions recompute under the current model and show the stored outputs alongside. Bump `SNAP_SCHEMA_VERSION` in `src/snapshots.js` when the snapshot file format changes.

## Build start and capacity limit (built after drop 1)
- Per-layer `buildStart` (whole years, default 0, clamped so buildStart + buildYears <= 15). Build spend runs over buildStart to buildEnd - 1, where buildEnd = buildStart + buildYears; sustaining spend, debt repayment, payback and the DSCR check all start at buildEnd.
- Capacity limit: see locked decision 11.
- Life flag clock: payback minus max(entry year, build start) is compared with asset life, so idle years before any capital goes in do not count against the asset.
- Verdict fragility panel under the scorecard (replaces the separate offset and build-start notes; `verdictFragility` in the model): per layer, the tested shocks that change its verdict and "flips under N of M shocks". Shocks, a display choice: offset +/-2 years, build start +2 years, drift +/-3 points, scale +/-25%, discount rate +/-25%, asset life +/-25%, offset set to 0 when an offset is set, and in vintage mode pass-through 0 and 1 and decline +/-3 points. Shocks that would change nothing are not counted. Each flip has a direction (display rule): worse = present value positive to negative or a fragility flag added; better = the reverse; mixed = both. The panel shows each layer's present value next to its verdict.
- Low-share warning (any mode): layers whose share falls below 5% of its starting level by year 15 (`lowShareLayers`, `LOW_SHARE_PCT`). The 5% is a display threshold, not evidence. Its summary line keeps: layers whose verdict changes if the build starts two years later (display choice). Sensitivity chart has a one-sided "Build start (two years later only)" bar.

## Drop 1 (build first)

Goal: time structure and layer-specific adoption. Reproduce v0.1 results exactly when all new settings are at their neutral defaults.

### 1. Layer-specific timing
- Keep one underlying demand curve (global `speed` and `mid`).
- Add per layer: `offset` in years (negative means the layer leads demand, positive means it lags) and `steepness` (multiplier, 1 = neutral; above 1 = steeper, so layer speed = global speed / steepness).
- Layer adoption = `adoption(t - offset, layer speed)`.
- Rationale: upstream revenue is derived demand and should follow the same end demand with a lead. Independent curves per layer would let hardware revenue peak before any application has customers.
- Defaults are neutral: offset 0, steepness 1, so the default page reproduces v0.1. A "Load lead/lag example" button sets placeholder offsets (chips -1, data centres -2, models 0, applications +1, services +2); it is opt-in and labelled as a placeholder, not data. Whenever any offset is non-zero, the page lists layers whose verdict changes when that layer's offset is set to 0.

### 2. Calendar phases
- Three phases (default years 0-4, 5-9, 10-15, boundaries editable). Per layer, per phase: share drift and cash margin.
- Neutral default: all three phases carry the v0.1 constant value.
- Decided 2026-10-05: deferred until the post-Drop-1 sensitivity shows it matters (locked decision 3). Original proposal kept for reference. Optional, off by default: utilisation-linked margin and drift. Proposal to confirm with the maintainer before coding: capacity index K(t) = fraction of build capex spent by t; demand index D(t) = layer adoption; utilisation u = D/K capped at 1.5; margin scaled by `u^e` when u < 1, with elasticity `e` as a visible, unsourced input (default 0.5, labelled as an assumption). Do not claim the shape is evidence-based.

### 3. Entry year and both entry-price definitions
Entry year `e` runs 0 to 10. The investor owns the layer's cash flows from year `e` onward (operating cash minus sustaining spend, plus terminal value). Show NPV in entry-year terms and say so on the page.

- **Definition A, replacement-cost premium (default).** Price at entry = `(1 + p)` x gross build capex spent before year `e`, paid at `e`. Build capex from year `e` on is paid as incurred at `(1 + p)`. At `e = 0` this equals v0.1 exactly. Break-even premium solves for the `p` that makes NPV zero.
- **Definition B, forward cash multiple.** Price at entry = `M` x operating cash in year `e + 1` (before sustaining spend), paid at `e`. Build capex from year `e` on is paid at cost with no premium. Report break-even `M`. Show "not meaningful" when year `e + 1` operating cash is near zero, which is normal early on the S-curve and is itself a finding about early-stage multiples.
- UI: a switch between definitions; the premium slider relabels itself per definition; the second definition uses its own multiple input.
- Decided 2026-10-05: Definition B uses operating cash (before sustaining spend), not revenue.
- Output: a heatmap of NPV (or headroom) by entry year against premium (A) or multiple (B) for the selected layer, with the zero contour visible.

### 4. Tests for drop 1
- v0.1 regression at neutral settings, Definition A, `e = 0`.
- NPV zero at break-even under both definitions and several entry years.
- Layer lead raises early revenue and lag lowers it, all else equal.
- Phase values equal to the constant reproduce v0.1.
- Heatmap values equal direct `runLayer` calls for the same inputs.

After drop 1, re-run the sensitivity ranking at the placeholder defaults and report which inputs swing NPV most per layer, noting that shock sizes differ (drift moves in points, others by 25%). Use that to decide what drop 2 should refine.

## Drop 2

### Built: step 1, vintage capex (opt-in)
- `G.capexModel`: `sustaining` (v0.1, default) or `vintage`. Default outputs and the v0.1 fixture are unchanged; legacy mode ignores `unitCostDecline` and `passThrough`.
- Cohorts: each year's build spend; replaced at t0 + life (life rounded to whole years) at spend x (1 - decline)^life; replacement after year 15 is not charged. Replacement spend sits in the sustaining-spend array, so it is never marked up by the entry premium.
- Terminal value in vintage mode: G.tv x max(0, year-15 operating cash - capex x (1 - decline)^15 / life). Year-15 operating cash already reflects pass-through.
- Assumptions to keep labelled: replacement happens on time, so capacity stays at 100% after the initial build; the Definition A entry price covers initial build spend only (replacement before the entry year is not priced); debt covers the initial build only.
- `unitCostDecline` defaults to 0 for every layer. `passThrough` defaults to 0.5: no view, placeholder, unsourced. Share multiplier each year = (1 + phase drift) x (1 - passThrough x decline). Drift covers other commoditisation; passThrough covers erosion caused by cheaper capacity.
- Stranded value: per cohort in use at t, spend x remaining life / life x (1 - (1 - decline)^(t - t0)); peak over the horizon as % of build capex. A diagnostic, not a cash item: the cash effect comes through revenue, and charging both would double count.
- Caveat: pass-through lowers a layer's revenue without raising demand. If demand is price-elastic, cheaper capacity could raise revenue instead. Not modelled (see backlog).
- Scorecard (vintage): present value at passThrough 0 and 1 and the gap, "value at stake in pricing power". Bounds, not forecasts.
- Sensitivity (vintage): unit-cost decline +/-3 points; passThrough +/-0.25, clamped to 0-1.
- "Load unit-cost-decline example" sets invented round numbers (chips 5, data centres 2, models 8, applications 0, services 0 % a year) and switches on vintage mode. Not data.
- Even at decline 0, vintage differs from sustaining spend for any layer whose build years differ from its asset life: replacement arrives in lumps at end of life rather than as capex / life every year from the end of the build.


### 1. Vintage capex
- Each year's capex creates a cohort with its own asset life. Replacement is scheduled at end of life. Add `unitCostDecline` (percent per year, placeholder default, labelled unsourced): newer cohorts cost less per unit of output, so earlier cohorts can be stranded.
- Replace the sustaining-spend shortcut. Keep it behind a legacy switch for regression.
- New metric: stranded value, meaning cohorts whose remaining life outlasts their economic value.

### Built: step 2, snapshots
- A snapshot holds `schemaVersion`, name, created (ISO UTC), note, `modelVersion`, every input (settings, capex mode, entry definition, phases, all layer fields) and per-layer outputs (present value, verdict, flags, break-even premium and multiple, fragility summary), plus kill criteria per layer: free text, optional metric / direction / threshold, optional review-by date and a status (blank, yes, no, unknown) set at review time. Nothing is fetched.
- Criterion states (`snapCriterionState`): unanswered or "unknown" past the review-by date = overdue. "No" clears the badge, records the answer date (`answeredAt`, ISO UTC) and offers an optional next review-by date (overdue again only once a next date later than the answer day has passed). "Yes" shows "Triggered: revise this layer" until a later snapshot is saved or the criterion is reset. Today and the answer date are both converted to local calendar dates before comparing, so time zones cannot flip a badge.
- Schema version 2 adds `answeredAt` to each kill criterion. Schema 1 files still import, with a blank answer date.
- Trigger response (schema 3): saving while any criterion is triggered prompts "Revised" (changed inputs listed automatically from the compare logic, never allocations) or "Kept my view" (reason required); "Save without recording" keeps saving unblocked. The list shows "triggered, revised" or "triggered, kept view". Schemas 1 and 2 import with no response.
- Load into simulator (`snapPrepareLoad`): confirm first; one-step undo of the previous settings, selection and criteria form; the snapshot goes through the same strict validation as an import; inputs only are restored and outputs recompute; allocations are restored only if the snapshot has them; the criteria (without answers) fill the "Save the current view" form; a model-version mismatch warns that results will recompute.
- Storage: key `load-bearing-snapshots-v1`, separate from settings; every read and write in try/catch; at most 50 snapshots, with a message when full or when the browser refuses to store.
- Import: size checked before parsing (1 MB), then JSON parse, then rejection of any `__proto__`, `constructor` or `prototype` key at any depth, then a strict structural check (exact fields, types, ranges from `LAYER_RANGES` / `GLOBAL_RANGES` / `PHASE_RANGES`, text lengths, ISO UTC dates). Each snapshot is rebuilt from whitelisted fields into fresh objects; nothing parsed is merged into existing objects. Errors say which field and why, and whether the schema or the model version is incompatible (a model version newer than the page is rejected). Free text is always rendered with textContent.
- Compare: two snapshots or a snapshot against current settings. Lists only changed inputs, each layer's verdict and present value before and after, and the fragility summary. If model versions differ, says so and recomputes both under the current model, showing stored outputs alongside.

### 2. Snapshots (as-of dimension), original spec
- Save named, dated snapshots: inputs, outputs, a free-text note, and a kill-criteria field ("what observation would make me revise this layer"), optionally with a metric, threshold and direction. No automatic data fetching.
- Storage: browser local storage for quick work, plus JSON export and import so snapshots move between devices. Git history is the shared record.
- Compare two snapshots: input diff plus verdict changes per layer.
- Exclude allocations from export by default (see locked decision 4).

### Built: step 3, calibration scaffold (no data)
- Separate page `docs/calibration.html`, built by the same script; no network access; episodes stay in local storage (key `load-bearing-calibration-v1`, at most 20).
- Episode schema 2 (documented in `calibration/README.md`; schema 1 still imports): id, name, version, previousHash, asOfDate, asOfRule, outcomeHorizon, outcomeMeasure, scorer.knewAboutOutcome, settings and 1 to 8 free-text-named layers whose numeric inputs are records `{value, basis, sourceIds, calculation, rationale}`, sources `{id, citation, publicationDate, kind, truncatedAt}`, lock, outcomes.
- Rules: every non-null numeric input needs a basis. Sourced and derived need at least one cited source; derived shows a calculation; judgement needs a rationale and its sources are optional. An uncited judgement is labelled "uncited judgement", counts toward the judgement-heavy banner, and may be locked. Export names an episode with any uncited input `NAME.private.json` with a warning (`*.private.json` is gitignored), otherwise `NAME.episode.json`. Input sources must be published on or before the as-of date, except a `compiled-from-period-data` source, which is valid only if truncated on or before it. Outcome sources must be published after the as-of date.
- Workflow: draft, locked (SHA-256 of canonical JSON over everything decided before outcomes, with time and model version; a locked file whose inputs change fails import; changing inputs means a new version linked by previousHash), then outcomes (yes, no, unknown, contested; contested needs citations on both sides; only after locking). Locking requires the as-of rule, outcome horizon, outcome measure and scorer statement.
- Lock-time acknowledgement (`lockAcknowledgement`): when more than half of the filled inputs are judgement or any input is uncited, the page asks "Lock anyway" or "Cancel" with the counts. Locking is never blocked. The lock records `counts {judgement, uncited, total}` and `acknowledged`, both covered by the hash (episode schema 2, `hashScheme` 2). Schema 1 locks still import as `hashScheme` 1 with counts not recorded. The comparison shows each result's judgement share and uncited count from the lock record (computed and labelled for scheme 1 locks).
- Banners: "Scored by someone who knew the outcome. Treat as a sanity check, not calibration." on every result; judgement-heavy when more than half of filled inputs are judgement. Comparison shows counts and "Too few cases for statistical conclusions." and no hit rate.
- A repository test fails if any committed file under `calibration/` other than the template has a numeric input without a source, uncited judgement included, or if a `.private.json` file is there.

### 3. Calibration scaffold (original spec)
- Scaffold only, no data: a structure for scoring past episodes (British railways 1840s, telecom and fibre 1996-2001, dot-com applications, electricity) blind, using only what was knowable at the time. Do not populate with invented numbers. Every row needs a cited, period-appropriate source. Ask the maintainer for sources, or propose them for review.

## Backlog (not in either drop)
- Separate discount rate per layer.
- Levered NPV using the debt terms.
- Probability-weighted scenarios.
- Price elasticity of demand: let lower prices from pass-through raise adoption or the value pool, so cheaper capacity can raise revenue as well as erode it. Needs a sourced elasticity or a clearly labelled assumption.

## Research behind the design (for the README and citations)
Pastor and Veronesi, Technological Revolutions and Stock Prices (AER, 2009). Odlyzko, Collective Hallucinations and Inefficient Markets: The British Railway Mania of 1845 (2010). Quinn and Turner, Boom and Bust (2020). Greenwood, Shleifer and You, Bubbles for Fama (JFE, 2019). Hobijn and Jovanovic, The Information-Technology Revolution and the Stock Market (NBER, 2000). From memory and unverified: Perez (2002) on installation and deployment phases. Verify before citing.

## Contributing
Ask one clarifying question at a time when something is ambiguous. Show what changed and why. Run `npm test` before every commit.
