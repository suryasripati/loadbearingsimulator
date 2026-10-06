# Case library

Historical cases for the Load Bearing Simulator, one plain file each (`cases/<id>.case.json`), bundled into the page at build time. Users never import or edit them; they open a case from the **Cases** button in the page header. The live page hides that button while this folder has no cases.

**No case is published yet.** Every number in a case must come from a public source, or be clearly labelled as a judgement with a stated rationale.

## Rules (the build fails on any breach)

- **As of a date.** A case is filled in as someone standing at `asOfDate`.
  - An input may cite a **period** source only if it was published on or before that date.
  - An input may cite a **compiled** source (published later, built from period data) only if its series ends on or before that date (`seriesEndsOn`).
  - **Outcome** sources must be published after that date, and only outcomes may cite them.
- **Every number has a basis.**
  - `sourced`: it appears in a cited source.
  - `derived`: it is computed from cited sources, and the calculation is in `note`.
  - `judgement`: the rationale is in `note`. It may have no source, and the page always labels it as a judgement.
- **Ranges** are the tool's own input ranges; whole numbers where the tool expects them.
- **Money unit** (`moneyUnit`, for example `"£m"`): a currency symbol plus an optional unit. It replaces "$B" in every money label while the case is open.
- **Outcomes**, one per layer at most:
  - each has a `status` (`yes`, `no`, `unknown` or `contested`), a `summary`, sources and a `horizon`;
  - `yes` and `no` need a source;
  - `contested` needs at least two sources, and a summary that states both positions ("For: … Against: …").
- **Hindsight.** `hindsightDisclosure` is one line saying what the author already knew. The page shows: "Scored by someone who knew the outcome. Treat as a sanity check, not calibration. Too few cases for statistical conclusions." It never shows a hit rate.
- **Allocations are personal** and are never part of a case. A case opens with a placeholder equal split.

## File format (`schemaVersion` 1)

| Field | Notes |
|---|---|
| `format` | `"load-bearing-simulator-case"` |
| `schemaVersion` | `1` |
| `id` | lower-case letters, digits and hyphens |
| `title`, `subtitle` | the title replaces "AI Stack" in the page title while the case is open |
| `asOfDate`, `asOfRule` | the date, and how it was chosen |
| `hindsightDisclosure` | one line |
| `moneyUnit` | for example `"$B"`, `"£m"`, `"€bn"` |
| `sources[]` | `{ id, citation, publicationDate, kind: "period" \| "compiled" \| "outcome", seriesEndsOn }` (`seriesEndsOn` for compiled only) |
| `settings` | `pool`, `speed`, `mid`, `disc`, `rd`, `tv`, `premium`, `entry`, `mult`, `phase2Start`, `phase3Start` as input records, plus `entryDef` (`"A"` or `"B"`) and `capexModel` (`"sustaining"` or `"vintage"`) |
| `layers[]` | 1 to 6 layers: `{ id, name, inputs }` (names up to 40 characters, without `<`, `>`, `&` or `"`); `inputs` has `evidence`, `share`, `offset`, `steepness`, `capex`, `buildStart`, `buildYears`, `unitCostDecline`, `passThrough`, `life`, `debt` (input records) and `driftP`, `marginP` (three input records each) |
| `versions[]` | optional, up to 3: `{ id, label, settings?, layers? }`; each overrides some settings or layer inputs; selected with a pill |
| `outcomes[]` | `{ layer, status, summary, sourceIds, horizon }` |

An **input record** is `{ "value": number, "basis": "sourced" | "derived" | "judgement", "sourceIds": [ ... ], "note": "..." }`.

## Testing without real cases

`npm run build:dev` writes `docs-dev/index.html` (gitignored). It includes the synthetic fixtures in `test/support/cases/`, which have placeholder values and fictitious sources. They are never shipped; the live build refuses any case whose id starts with "synthetic".
