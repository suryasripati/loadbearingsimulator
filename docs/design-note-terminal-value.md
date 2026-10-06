# Design note: terminal value and long-lived assets

Status: **proposal only, not implemented.** Needs the maintainer's approval before any code changes. Nothing here is data; the numbers below are arithmetic on the formulas, not estimates.

## Why

Case files will cover long-lived assets (railways, electricity networks). Two limits in the current model get in the way:

1. Value beyond year 15 is `tv × (year-15 operating cash − sustaining spend)`, floored at 0, with `tv` limited to 0–12. A fixed multiple hides the two things that drive it: the discount rate and long-run growth. Example: a growing perpetuity at a 10% discount rate and 2% growth equals 12.75x, which is already above the slider's maximum. At a 6% discount rate and 2% growth it is 25.5x.
2. Asset life is limited to 1–40 years. Some infrastructure is said to last much longer. (No source checked; this is why the range question needs a cited case before it matters.) Sustaining spend is `build capex ÷ asset life`, so a too-short life overstates spend for long-lived assets and understates their value.

## Proposal (a): a perpetuity-style terminal value option

- New global setting `tvMode`: `multiple` (today's behaviour, the default) or `perpetuity`.
- New global input `tvGrowth`, g, in % a year, used only in perpetuity mode. Placeholder default 0, labelled unsourced.
- Perpetuity value at year 15 = `C × (1 + g) ÷ (r − g)`, where C is the same year-15 net cash used today and r is the discount rate. Floor at 0 as today.
- Guard: require g to be at least 1 point below r (the formula explodes as g approaches r). The page shows the implied multiple `(1 + g) ÷ (r − g)` next to the input so the two modes can be compared.
- The tail flag (more than half of the value after year 15) stays as it is. It will fire more often in perpetuity mode, and that is the point.
- At g = 0 the perpetuity equals a multiple of `1 ÷ r`. That is 10x at the default 10% discount rate, twice the current default multiple of 5. So switching mode at default settings would raise every layer's terminal value. That is a reason to keep `multiple` as the default, and to show the implied multiple next to the input.

## Proposal (b): longer ranges for long-lived assets

- Asset life: widen from 1–40 to 1–100 years.
- Terminal multiple: widen from 0–12 to 0–30, so the multiple mode can express what the perpetuity mode implies at low discount rates.
- Keep the current defaults (asset lives as they are, `tv` 5). Widening a range changes no result for existing inputs.
- Side effects to accept knowingly:
  - With a 15-year horizon, a life above 15 years affects only sustaining spend, the life flag and the terminal value.
  - In vintage mode no cohort is replaced inside the horizon, so the normalised sustaining spend inside the terminal value carries all the effect.
  - The asset-life fragility shock (±25%) becomes larger in years.

## Version and fixture implications

| Item | (a) perpetuity option | (b) wider ranges |
|---|---|---|
| Results for existing inputs | Unchanged (default `multiple`) | Unchanged |
| `MODEL_VERSION` | Bump 1 → 2. New maths exists, and the canonical fixture must gain perpetuity cases, which the guard only allows with a bump. | No bump on its own. If it ships with (a), it shares the bump. |
| v0.1 regression fixture (`test/fixtures/v0_1_defaults.json`) | Unchanged; must stay green | Unchanged |
| Canonical model fixture (`test/fixtures/model_outputs.json`) | Regenerate with `npm run fixture:model` after adding perpetuity cases (g = 0 and g > 0, both entry definitions, both capex models) | Add one long-life case (for example life 80) when regenerating |
| Snapshots | Schema 5: `tvMode` and `tvGrowth`. Schemas 1–4 load as `multiple`. A version 2 snapshot shown on a version 1 page is rejected, as today. | Import accepts the wider ranges. Older pages reject snapshots with out-of-range values, with the existing message. |
| Case files | Case schema 2: optional `tvMode` and `tvGrowth` records with basis and source like every input. Schema 1 cases stay valid. | Validator ranges follow the shared ranges automatically |
| Tests to add | NPV at g = 0 equals NPV at `tv = 1 ÷ r`. Implied multiple shown. Guard on g ≥ r − 1. Break-even still gives NPV 0 in perpetuity mode. | Range tests at the new limits. Smoke test that the sliders reach them. |

## Not proposed

- A separate discount rate for the terminal period, or a fade from high to steady-state growth. Both add inputs that nobody has evidence for yet (locked decision 3: add a dial only when sensitivity shows it matters).
- Changing any default. Both changes are opt-in.
