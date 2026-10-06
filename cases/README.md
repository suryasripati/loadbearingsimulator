# Case library

Historical cases for the Load Bearing Simulator, one plain file each (`cases/<id>.case.json`), bundled into the page at build time. Users never import or edit them; they open a case from the **Cases** button in the page header. The live page hides that button while this folder has no cases.

**Cases:** `railway-mania-1845` (British railway mania, as of 30 September 1845). Its hindsight disclosure is a draft for the owner to confirm before it goes live. Every number in a case must come from a public source, be clearly labelled as a judgement with a stated rationale, or be a neutral default the case does not use.

## Rules (the build fails on any breach)

- **As of a date.** A case is filled in as someone standing at `asOfDate`.
  - An input may cite a **period** source only if it was published on or before that date.
  - An input may cite a **compiled** source (published later, built from period data) only if its series ends on or before that date (`seriesEndsOn`).
  - **Outcome** sources must be published after that date, and only outcomes may cite them.
- **Every number has a basis.**
  - `sourced`: it appears in a cited source.
  - `derived`: it is computed from cited sources, and the calculation is in `note`.
  - `judgement`: the rationale is in `note`. It may have no source, and the page always labels it as a judgement.
- **Ranges** are the tool's own input ranges; whole numbers where the tool expects them. Exception (schema 3): a case may declare its own ranges for the value pool and build capex in its money unit (`moneyRanges`). Each range needs 0 < min < max, and every value of that input, in the base and in every version, must lie inside it. While the case is open, the sliders, inputs and the input guide use these ranges; outside the case the shared ranges apply. Snapshots and links of the case are checked against them too.
- **Money unit** (`moneyUnit`, for example `"£m"`): a currency symbol plus an optional unit. It replaces "$B" in every money label while the case is open.
- **Outcomes**, one per layer at most:
  - each has a `status` (`yes`, `no`, `unknown` or `contested`), a `summary`, sources and a `horizon`;
  - `yes` and `no` need a source;
  - `contested` needs at least two sources, and a summary that states both positions ("For: … Against: …").
- **Hindsight.** `hindsightDisclosure` is one line saying what the author already knew. The page shows: "Scored by someone who knew the outcome. Treat as a sanity check, not calibration. Too few cases for statistical conclusions." It never shows a hit rate.
- **Allocations are personal** and are never part of a case. A case opens with a placeholder equal split.

## File format (`schemaVersion` 3; schema 1 and 2 files stay valid)

| Field | Notes |
|---|---|
| `format` | `"load-bearing-simulator-case"` |
| `schemaVersion` | `3` (or `2`; or `1`, which opens with value beyond year 15 as a multiple) |
| `description` | schema 3, optional: one paragraph of context shown with the case; not a finding |
| `baseLabel` | schema 3, optional: the name of the base version's pill (default "Base") |
| `moneyRanges` | schema 3, optional: `{ "pool": [min, max], "capex": [min, max] }` in the case's money unit; the slider step is the finest precision of the case's own values |
| `id` | lower-case letters, digits and hyphens |
| `title`, `subtitle` | the title replaces "AI Stack" in the page title while the case is open |
| `asOfDate`, `asOfRule` | the date, and how it was chosen |
| `hindsightDisclosure` | one line |
| `moneyUnit` | for example `"$B"`, `"£m"`, `"€bn"` |
| `sources[]` | `{ id, citation, publicationDate, kind: "period" \| "compiled" \| "outcome", seriesEndsOn, note }` (`seriesEndsOn` for compiled only; `note`, schema 3, for caveats such as "original not opened" or "date approximate") |
| `settings` | `pool`, `speed`, `mid`, `disc`, `rd`, `tv`, `premium`, `entry`, `mult`, `phase2Start`, `phase3Start` as input records, plus `entryDef` (`"A"` or `"B"`) and `capexModel` (`"sustaining"` or `"vintage"`). Schema 2 only, optional: `tvMode` (`"multiple"` or `"perpetuity"`) and `tvGrowth` (an input record; long-run growth, at least 1 point below the discount rate) |
| `layers[]` | 1 to 6 layers: `{ id, name, inputs }` (names up to 40 characters, without `<`, `>`, `&` or `"`); `inputs` has `evidence`, `share`, `offset`, `steepness`, `capex`, `buildStart`, `buildYears`, `unitCostDecline`, `passThrough`, `life`, `debt` (input records) and `driftP`, `marginP` (three input records each) |
| `versions[]` | optional, up to 3: `{ id, label, settings?, layers? }`; each overrides some settings or layer inputs; selected with a pill |
| `outcomes[]` | `{ layer, status, summary, sourceIds, horizon }` |

An **input record** is `{ "value": number, "basis": "sourced" | "derived" | "judgement" | "default", "sourceIds": [ ... ], "note": "..." }`.

**Basis `default`** (schema 3): a neutral tool setting the case does not use (for example interest on debt when debt is 0%). It cites no source and needs no rationale beyond "Neutral default, not used." The page shows it with an N chip and leaves it out of the judgement share: the Cases dialog says "n of m case-specific inputs are judgement; k neutral defaults not counted", counting each per-phase input once.

## Testing without real cases

`npm run build:dev` writes `docs-dev/index.html` (gitignored). It includes the synthetic fixtures in `test/support/cases/`, which have placeholder values and fictitious sources. They are never shipped; the live build refuses any case whose id starts with "synthetic".
