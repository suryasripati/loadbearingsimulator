# Load Bearing Simulator

*Capture Map & Who gets paid?*

A scenario tool for one question: if a technology works the way you expect, which layers of the stack earn back what is put into them, and which only look good on paper?

**Placeholders, not data.** Every default number is a placeholder chosen to make the mechanics visible. None is sourced and none describes a real company. Replace them with your own views. Not financial advice.

## What it does

The page title is "AI Stack: Load Bearing Simulator" (the prefix is a case name that a later case library can replace). It has three view modes, chosen in the header and remembered in your browser and in the address (`#basic`, `#advanced`, `#analyst`). Modes only change what is shown; every input is kept, and results are identical in every mode.

- **First screen (all modes)**, sized to fit 1440x800 and 1280x720 without scrolling: four key figures, then three cards: Technology scenario (adoption speed and midpoint, value pool, entry premium, discount rate), Where each layer lands (the quadrant), and a compact layer scorecard (verdict, present value, headroom, and your allocation, editable).
- **Basic** is the first screen only.
- **Advanced** adds, in order: the detailed scorecard (break-even, IRR, payback, flags); a layer selector with cumulative cash and what moves the answer most; then the entry heatmap and your allocation across scenarios.
- **Analyst** adds Timing and Money assumptions (entry, financing, capex model) after the first screen, then everything in Advanced, then layer assumptions, phases, verdict fragility and snapshots.

Explanations sit in info notes (the small "i" buttons) beside card titles and inputs; they open on hover, keyboard focus or tap, close with Esc, and stay on screen. "Behind the tool" in the header opens the full "how it works and where it is weak" note and the research list.

Four key figures sit at the top: layers that earn their cost, the tightest layer (lowest headroom), the share of your allocation in layers below cost (labelled while it is still the placeholder equal split), and layers whose verdict flips under a tested shock. Each has a text status (Stable, Watch, Fragile). In Basic and Advanced, a line says when any Analyst-only setting differs from its default, links to Analyst, and offers "Reset to simple defaults", which resets only those settings (never your allocation or snapshots).

Details by feature:

- Scenario drivers: adoption speed, midpoint and value pool. One end-demand curve drives every layer.
- Layer timing: each layer can lead or lag end demand (offset, in years) and be steeper or flatter. Defaults are neutral: every layer follows end demand, so the default page reproduces v0.1. The **Load lead/lag example** button sets placeholder offsets (infrastructure leads, applications and services lag) to show how much timing alone can move a verdict; it is an example, not data. When any offset is non-zero, the verdict fragility panel names the layers whose verdict depends on it.
- Timing chart: a "Timing: layers against end demand" card beside the scenario controls draws the solid end-demand curve and one line per layer (each with its own dash pattern), with the selected layer highlighted. The legend says for each layer whether it leads, lags, is steeper or flatter, or is the same as end demand. Click a layer name in the legend to select it.
- Build start: each layer has a "Build starts, year" input (default 0): when capital starts going in, independent of the timing offset, which moves revenue. The verdict fragility panel lists the layers whose verdict changes if the build starts two years later, and the sensitivity chart has a one-sided build-start bar.
- Capacity limit (an assumption, not data): a layer can only earn on capacity it has built. Capacity is assumed to scale linearly with build spend, so revenue uses the lower of layer adoption and the share of build capex spent so far. Without it, a later build would always look better. It is a first-order stand-in for capacity utilisation, to be refined by vintage capex. It does not bind at the default settings, the three adoption presets or the lead/lag example.
- Capex model (Drop 2, step 1): a switch between **Sustaining spend (v0.1)**, the default, and **Vintage cohorts**, which is opt-in. In Vintage mode each year's build spend is a cohort replaced at the end of its asset life, at the original spend × (1 − unit-cost decline)^life; replacement after year 15 is not charged, and value beyond year 15 uses a normalised sustaining spend. Replacement is assumed to happen on time, so capacity stays at 100% after the build. The Definition A entry price and debt cover the initial build only.
- Unit-cost decline (default 0) and pass-through (default 0.5, a placeholder with no view behind it, unsourced) are per-layer inputs used only in Vintage mode. Pass-through is the share of the decline that competition hands to customers as lower prices; it runs through share drift, (1 + drift) × (1 − pass-through × decline) a year, and the Phases table shows the effective drift. Drift covers other commoditisation; pass-through covers erosion caused by cheaper capacity. The **Load unit-cost-decline example** button sets invented round numbers (not data) and switches on Vintage mode.
- In Vintage mode the scorecard adds present value at pass-through 0 and 1 and the gap, "value at stake in pricing power" (bounds, not forecasts), and peak stranded value, which is a diagnostic and not a cash item (deducting it as well as the revenue effect would double count).
- Phases: share drift and cash margin can differ across three calendar phases (default years 0-4, 5-9, 10-15, editable).
- Entry: pick an entry year (0 to 10) and one of two price definitions: a premium over replacement cost, or a multiple of next-year operating cash. Present values are stated in entry-year terms.
- Money assumptions: discount rate, debt interest, value beyond year 15. Value beyond year 15 is a multiple of year-15 cash by default (the v0.1 model, range 0 to 30x). An opt-in **growing perpetuity** uses a long-run growth rate g instead (placeholder default 0, unsourced, kept at least 1 point below the discount rate r) and shows the multiple it implies, (1 + g) ÷ (r − g). At g = 0 that is 1 ÷ r: 10x at the default 10%, twice the default multiple of 5. Asset life runs from 1 to 100 years so long-lived assets fit. Model version 2 added this option; with the default mode every result equals version 1.
- Five layers with editable demand evidence, share, capex, asset life, debt and your own allocation.
- Choosing a layer: click any layer name (in the layer, phase or scorecard tables), any dot on the quadrant chart (or tab to it and press Enter), or the layer buttons under the Detail heading. The selected layer is highlighted in every table.
- Sensitivity chart: inputs that move value identically by construction share one bar (pool, share and margin are one "scale" bar; midpoint and timing offset share a bar when both are a two-year shift). Shock sizes are listed under the chart and are not like-for-like.
- Verdict fragility panel: for each layer, which tested shocks change its verdict and "flips under N of M shocks". The shocks are a display choice: timing offset ±2 years, build start 2 years later, share drift ±3 points, scale ±25%, discount rate ±25%, asset life ±25%, and in Vintage mode pass-through 0 and 1 and unit-cost decline ±3 points. Each count is split into worse and better (a display rule: worse means present value turns negative or a fragility flag is added; better is the reverse; mixed means both), and each layer's present value sits next to its verdict so a layer near zero is visible.
- Low-share warning: in any mode, the page warns when a layer's share falls below 5% of its starting level by year 15 at the current inputs. The 5% is a display threshold, not evidence.
- Caveat: pass-through lowers a layer's revenue without raising demand. If demand is price-elastic, cheaper capacity could raise revenue instead; that is not modelled.
- Snapshots: save a named, dated view of every input and result with a note and per-layer kill criteria ("what would make me revise this layer", an optional trigger and review-by date). At review time mark each criterion: unanswered or "unknown" after its date is overdue; "no" records the review date and lets you set the next one; "yes" shows "Triggered: revise this layer" until you save a new snapshot. **Load into simulator** restores a snapshot's inputs (with one-step undo) and fills the form with its criteria. Saving while a criterion is triggered asks whether you revised (the changed inputs are listed for you) or kept your view (with a short reason); you can still save without recording. Compare two snapshots, or a snapshot with the current settings, to see which inputs moved and which verdicts changed. Snapshots stay in your browser (at most 50); there is no file export or import. To share a scenario, **Copy link** puts the current settings in the page address. A link carries settings and layer inputs only, never allocations, snapshot names, notes or kill criteria, and anyone who has it can read it. In a case, the link carries the case, its version and only the inputs you changed. Opening a link asks first and goes through strict checks (size cap, prototype-key rejection, whitelisted fields, shared ranges, link-format and model versions); a link made by a newer model version is refused.
- Case library: past episodes packaged as case files and bundled into the page at build time. **No cases are published yet**, so the live page hides the Cases button. A case loads its own layers (1 to 6), names and money unit; your own scenario is kept in memory for "Return to my scenario". Every input in a case shows its basis (sourced, derived or judgement) with the citation, calculation or rationale in its note; judgement inputs are labelled as judgement. A "What happened" card in Advanced and Analyst sets each layer's recorded outcome beside the model's verdict, with the banner "Scored by someone who knew the outcome. Treat as a sanity check, not calibration. Too few cases for statistical conclusions." and counts, never a hit rate. The rule for case files: factual claims cite public sources published by the case's as-of date (outcomes cite sources published after it); judgement inputs need a rationale and a visible label. The build fails on any breach. See `cases/README.md`.
- Outputs: a quadrant chart, a scorecard with three fragility flags (life, debt, tail), cumulative cash, a sensitivity chart, a heatmap of value by entry year and price with the break-even line, and your allocation across slow, base and fast adoption.

It does not say whether there is a bubble. It shows which assumptions carry the answer.

## Run it

Open `docs/index.html` in a browser. No server needed.

## Develop

Node is needed only to run the tests and the build. The page itself (`docs/index.html`) needs no Node and no dependencies; open it in any modern browser.

Supported Node versions for tests and build: 22.22.2 or later on 22.x, 24.15.0 or later on 24.x, or 26.0.0 or later. The floor comes from `jsdom` 30, a pinned dev dependency used only by the UI smoke test.

```
npm install     # once, installs jsdom for the smoke test
npm run build   # assembles docs/index.html from src/ and cases/ (fails on any invalid case)
npm run build:dev   # docs-dev/index.html (gitignored) with the synthetic test cases, for reviewing the case interface
npm test        # model, snapshot, case and model-version tests, plus UI smoke tests against the built page
npm run fixture:model   # only after bumping MODEL_VERSION: regenerates the canonical model fixture
```

The smoke test checks that the page loads without errors, that every way of choosing a layer works, the default verdicts, the lead/lag note and Reset. jsdom has no layout, so label overlap and clipping on the charts still need a check in a real browser.

Edit files in `src/`, then rebuild. Do not edit `docs/index.html` by hand.

## Publish on GitHub Pages

Settings, then Pages, then deploy from the `main` branch and `/docs` folder.

## Privacy

Your allocation split is personal. Settings and snapshots are kept in your browser's local storage and are not sent anywhere. Links never contain allocations. This repository is public: never commit personal files (the `.gitignore` still excludes `exports/` and `*.snapshot.json`).

**Migration note.** Snapshot files exported before this change (`.snapshot.json`) can no longer be imported; the page has no file import. Snapshots already saved in your browser are kept and still load. To carry a view to another device, open it and use Copy link.

## Roadmap

See `CLAUDE.md` for the two planned drops (layer timing, phases and entry year; then vintage capex and snapshots) and the open questions.

## Research behind the design

Pastor and Veronesi (AER, 2009); Odlyzko (2010); Quinn and Turner (2020); Greenwood, Shleifer and You (JFE, 2019); Hobijn and Jovanovic (NBER, 2000).
