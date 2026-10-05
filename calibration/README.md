# Calibration scaffold

A structure for scoring past episodes with the Load Bearing Simulator using only what was knowable at the time. Candidate episodes include British railways in the 1840s, telecom and fibre in 1996 to 2001, dot-com applications and electricity.

**This folder holds no episode data.** It contains only an empty template, `GUIDE.md` and this README. No number may be invented. Open `docs/calibration.html` (or the live page's `calibration.html`) to fill in an episode in your browser.

## Data rules (this repository is public)

- Commit an episode file only if **every numeric input, in every input version, cites a public source**. A repository test fails if any committed file under `calibration/`, other than the template and the docs, has a numeric input without a source. That includes an uncited judgement.
- Anything with an uncited number, plus personal views and working notes, goes in `calibration/private/`. That folder is gitignored, and so is every `*.private.json` file.
- When an episode has any uncited input, the page exports it as `NAME.private.json` with a warning; otherwise as `NAME.episode.json`.
- Outcome evidence must be published **after** the episode's as-of date, and input evidence **on or before** it (see "Sources" below).
- Results are always shown with this banner: *Scored by someone who knew the outcome. Treat as a sanity check, not calibration.* The comparison always says *Too few cases for statistical conclusions.* It never shows a hit rate.

## Guidance

`GUIDE.md` (generated from `src/calibration-guide.js` by `npm run build`) explains every input: what it means, where to look at the as-of date, a recipe, and the hindsight trap. The page shows the same guidance as a Help note beside each input. Examples are symbolic; there are no real episode numbers.

For adoption speed, the page has a doubling-time helper: speed (years from 10% to 90%) = ln(81) / ln(2) × early-phase doubling time, about 6.34 × T. It fills a derived value with the calculation shown; you still cite the source of T. It describes the early phase only, and the midpoint is a separate input.

## Workflow

1. **Draft.** Fill in the as-of date and rules, the scorer checklist and statement, the sources, the layer names and the inputs of each input version. You can save a draft with gaps. Uncited judgement is allowed and labelled.
2. **Input versions.** An episode can be scored with more than one set of inputs (for example a hype version and a measured version of adoption speed), up to 4. A new version starts as a copy of another. All versions share the as-of date, as-of rule, outcome horizon, outcome measure, scorer checklist and statement, and layer names.
3. **Lock each version.** Locking needs every field marked "needed before locking", including **every checklist item answered** (yes, no or partly).
   - If more than half of the version's filled inputs are judgement, or any is uncited, the page first says how many and offers **Lock anyway** or **Cancel**. Locking is never blocked.
   - Each version's lock stores its own SHA-256 hash, time, model version, judgement and uncited counts, and acknowledgement.
   - The hash covers the shared fields (checklist included), that version's inputs, the sources it cites, and its counts and acknowledgement.
   - After any version is locked, the shared fields cannot change; changing them, or a locked version's inputs, needs a **new episode version**, which unlocks every input version, clears outcomes and links to the old locks. Editing a locked file by hand breaks its hash, and import rejects it, naming the version.
4. **Outcomes.** Only once **every** input version is locked, record per layer whether capital earned its cost: `yes`, `no`, `unknown` or `contested`, with a note. `yes` and `no` need a source; `contested` needs at least one citation on each side. Once outcomes are recorded, no new input version can be added, because its inputs would be entered with the outcome in view. Make a new episode version instead.

## Schema (`template.episode.json`, schema version 3)

| Field | Type | Notes |
|---|---|---|
| `format` | `"load-bearing-simulator-episode"` | fixed |
| `schemaVersion` | `3` | file format version; schema 1 and 2 files still import (see "Older files") |
| `id` | text | lower-case letters, digits, hyphens; needed before locking |
| `name` | text, up to 120 characters | needed before locking |
| `version` | whole number from 1 | episode version; rises by one with each new episode version |
| `previousHash` | SHA-256 hex or `null` | links to the episode version this one replaces (a hash of its lock hashes) |
| `asOfDate` | `YYYY-MM-DD` or `null` | the date the scorer pretends to stand at; needed before locking |
| `asOfRule` | text | how the as-of date was chosen and what counts as knowable; needed before locking |
| `outcomeHorizon` | text | how long after the as-of date the outcome is judged; needed before locking |
| `outcomeMeasure` | text | what "capital earned its cost" means for this episode; needed before locking |
| `scorer.knewAboutOutcome` | text | what the scorer already knew, in their own words; needed before locking |
| `scorer.checklist` | object | `peakDate`, `fallSize`, `failures`, `finalFigures`, `laterSources`, `outcomesFirst`, each `""`, `"yes"`, `"no"` or `"partly"`; all answered before locking |
| `layerNames` | list of 1 to 8 texts | free text, specific to the episode; shared by every input version |
| `sources` | list of up to 100 | see below |
| `variants` | list of 1 to 4 input versions | `{ label, settings, layers, lock }`; labels are unique |
| `variants[].settings` | object | `pool`, `speed`, `mid`, `disc`, `rd`, `tv`, `premium`, `entry`, `mult`, `phase2Start`, `phase3Start` (input records) plus `entryDef` (`"A"`, `"B"` or `null`) and `capexModel` (`"sustaining"`, `"vintage"` or `null`) |
| `variants[].layers` | list, one per layer name | `{ inputs }` with `evidence`, `share`, `offset`, `steepness`, `capex`, `buildStart`, `buildYears`, `unitCostDecline`, `passThrough`, `life`, `debt` (input records) and `driftP`, `marginP` (three records each) |
| `variants[].lock` | `null` or `{ hash, lockedAt, modelVersion, hashScheme, counts, acknowledged, checklistCaptured }` | set by the page when locking that version; `counts` is `{ judgement, uncited, total }` |
| `outcomes` | list | empty until every version is locked; see below |

### Older files

- Schema 1 and 2 files import as one input version labelled "Main", with `layerNames` taken from the old layers and the checklist unanswered.
- An old lock keeps its original hash formula: `hashScheme` 1 (schema 1: no counts or acknowledgement) or 2 (schema 2: counts and acknowledgement). In both cases `checklistCaptured` is `false`, and the page says the checklist was not captured in that lock.
- Tamper checks still apply under the original formula.
- New locks use `hashScheme` 3 and always capture the checklist.

### Input record

`{ "value": number or null, "basis": "sourced" | "derived" | "judgement" | null, "sourceIds": [ ... ], "calculation": text, "rationale": text }`

- A value needs a basis.
- `sourced`: the value appears in a cited source; at least one source is required.
- `derived`: computed from cited sources; at least one source is required, and `calculation` must show how.
- `judgement`: the scorer's call; `rationale` must say why. Sources are optional. A judgement with no source is shown as **uncited judgement**, counts toward the judgement-heavy banner, may still be locked and scored, and makes the file private (it cannot be committed).
- Values must sit inside the same ranges as the simulator's inputs.
- An input version where more than half of the filled inputs are judgement shows a **judgement-heavy** banner.

### Source

`{ "id": text, "citation": text, "publicationDate": "YYYY-MM-DD", "kind": "contemporary" | "compiled-from-period-data" | "retrospective", "truncatedAt": "YYYY-MM-DD" or null }`

- For an input, a source must be published on or before the as-of date.
- A `compiled-from-period-data` source may be published later, but it is valid for inputs only if its series is truncated on or before the as-of date. Only this kind has `truncatedAt`.
- For an outcome, a source must be published after the as-of date.

### Outcome

`{ "layer": index from 0, "result": "yes" | "no" | "unknown" | "contested", "sourceIds": [ ... ], "note": text, "contested": null or { "forSourceIds": [ ... ], "againstSourceIds": [ ... ] } }`

## Comparison

For every episode with a locked input version, each layer shows the model's verdict under the current model for every locked version, side by side, then the recorded outcome. Beside every result are that version's judgement share and uncited count from its lock record. For a hash scheme 1 lock, those counts are computed from its inputs and labelled as computed. The page always shows the number of episodes and layers and the sentence "Too few cases for statistical conclusions." It never shows a hit rate.

## Import and export

Episode files follow the same strict rules as snapshots:
- files are limited to 1 MB;
- any `__proto__`, `constructor` or `prototype` key is rejected;
- only listed fields are accepted, with types, ranges and dates checked, and each file is rebuilt into fresh objects;
- all text is shown as plain text.

Nothing is fetched from the network.
