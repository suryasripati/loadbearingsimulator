# Load Bearing Simulator

*Capture Map & Who gets paid?*

A scenario tool for one question: if a technology works the way you expect, which layers of the stack earn back what is put into them, and which only look good on paper?

**Placeholders, not data.** Every default number is a placeholder chosen to make the mechanics visible. None is sourced and none describes a real company. Replace them with your own views. Not financial advice.

## What it does

- Scenario drivers: adoption speed, midpoint and value pool. One end-demand curve drives every layer.
- Layer timing: each layer can lead or lag end demand (offset, in years) and be steeper or flatter. Defaults are neutral: every layer follows end demand, so the default page reproduces v0.1. The **Load lead/lag example** button sets placeholder offsets (infrastructure leads, applications and services lag) to show how much timing alone can move a verdict; it is an example, not data. When any offset is non-zero, the page names the layers whose verdict depends on it.
- Timing chart: a "Timing: layers against end demand" card beside the scenario controls draws the solid end-demand curve and one line per layer (each with its own dash pattern), with the selected layer highlighted. The legend says for each layer whether it leads, lags, is steeper or flatter, or is the same as end demand. Click a layer name in the legend to select it.
- Build start: each layer has a "Build starts, year" input (default 0): when capital starts going in, independent of the timing offset, which moves revenue. A line under the scorecard always lists the layers whose verdict changes if the build starts two years later (the two-year shift is a display choice), and the sensitivity chart has a one-sided build-start bar.
- Capacity limit (an assumption, not data): a layer can only earn on capacity it has built. Capacity is assumed to scale linearly with build spend, so revenue uses the lower of layer adoption and the share of build capex spent so far. Without it, a later build would always look better. It is a first-order stand-in for capacity utilisation, to be refined by vintage capex. It does not bind at the default settings, the three adoption presets or the lead/lag example.
- Phases: share drift and cash margin can differ across three calendar phases (default years 0-4, 5-9, 10-15, editable).
- Entry: pick an entry year (0 to 10) and one of two price definitions: a premium over replacement cost, or a multiple of next-year operating cash. Present values are stated in entry-year terms.
- Money assumptions: discount rate, debt interest, value beyond year 15.
- Five layers with editable demand evidence, share, capex, asset life, debt and your own allocation.
- Choosing a layer: click any layer name (in the layer, phase or scorecard tables), any dot on the quadrant chart (or tab to it and press Enter), or the layer buttons under the Detail heading. The selected layer is highlighted in every table.
- Sensitivity chart: inputs that move value identically by construction share one bar (pool, share and margin are one "scale" bar; midpoint and timing offset share a bar when both are a two-year shift). Shock sizes are listed under the chart and are not like-for-like.
- Outputs: a quadrant chart, a scorecard with three fragility flags (life, debt, tail), cumulative cash, a sensitivity chart, a heatmap of value by entry year and price with the break-even line, and your allocation across slow, base and fast adoption.

It does not say whether there is a bubble. It shows which assumptions carry the answer.

## Run it

Open `docs/index.html` in a browser. No server needed.

## Develop

Node is needed only to run the tests and the build. The page itself (`docs/index.html`) needs no Node and no dependencies; open it in any modern browser.

Supported Node versions for tests and build: 22.22.2 or later on 22.x, 24.15.0 or later on 24.x, or 26.0.0 or later. The floor comes from `jsdom` 30, a pinned dev dependency used only by the UI smoke test.

```
npm install     # once, installs jsdom for the smoke test
npm run build   # assembles docs/index.html from src/
npm test        # model tests plus a UI smoke test against docs/index.html
```

The smoke test checks that the page loads without errors, that every way of choosing a layer works, the default verdicts, the lead/lag note and Reset. jsdom has no layout, so label overlap and clipping on the charts still need a check in a real browser.

Edit files in `src/`, then rebuild. Do not edit `docs/index.html` by hand.

## Publish on GitHub Pages

Settings, then Pages, then deploy from the `main` branch and `/docs` folder.

## Privacy

Your allocation split is personal. Settings are kept in your browser's local storage. If you make the repo public, keep personal snapshot exports out of it (the `.gitignore` already excludes `exports/` and `*.snapshot.json`).

## Roadmap

See `CLAUDE.md` for the two planned drops (layer timing, phases and entry year; then vintage capex and snapshots) and the open questions.

## Research behind the design

Pastor and Veronesi (AER, 2009); Odlyzko (2010); Quinn and Turner (2020); Greenwood, Shleifer and You (JFE, 2019); Hobijn and Jovanovic (NBER, 2000).
