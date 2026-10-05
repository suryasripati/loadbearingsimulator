# Calibration scaffold

A structure for scoring past episodes with the Load Bearing Simulator using only what was knowable at the time. Candidate episodes include British railways in the 1840s, telecom and fibre in 1996 to 2001, dot-com applications and electricity.

**This folder holds no episode data.** It contains only an empty template and this README. No number may be invented. Open `docs/calibration.html` (or the live page's `calibration.html`) to fill in an episode in your browser.

## Data rules (this repository is public)

- Commit an episode file only if **every numeric input cites a public source**. A repository test fails if any committed file under `calibration/`, other than the template, has a numeric input without a source.
- Anything with an uncited number, plus personal views and working notes, goes in `calibration/private/`. That folder is gitignored.
- Outcome evidence must be published **after** the episode's as-of date, and input evidence **on or before** it (see "Sources" below).
- Results are always shown with this banner: *Scored by someone who knew the outcome. Treat as a sanity check, not calibration.* The comparison always says *Too few cases for statistical conclusions.* It never shows a hit rate.

## Workflow

1. **Draft.** Fill in the as-of date and rules, the sources, the settings and the layers. You can save a draft with gaps.
2. **Lock.** Locking needs every field below that is marked "needed before locking". It stores a SHA-256 hash of everything decided before looking at the outcome, the time, and the model version. After locking, inputs cannot change: making a **new version** copies the inputs into an unlocked draft that links to the old hash. If a locked file's inputs are edited by hand, the hash no longer matches and import rejects the file.
3. **Outcomes.** Only after locking, record per layer whether capital earned its cost: `yes`, `no`, `unknown` or `contested`, with a note. `yes` and `no` need a source. `contested` needs at least one citation on each side.

## Schema (`template.episode.json`, schema version 1)

| Field | Type | Notes |
|---|---|---|
| `format` | `"load-bearing-simulator-episode"` | fixed |
| `schemaVersion` | `1` | file format version |
| `id` | text | lower-case letters, digits, hyphens; needed before locking |
| `name` | text, up to 120 characters | needed before locking |
| `version` | whole number from 1 | rises by one with each new version after a lock |
| `previousHash` | SHA-256 hex or `null` | the lock hash of the version this one replaces |
| `asOfDate` | `YYYY-MM-DD` or `null` | the date the scorer pretends to stand at; needed before locking |
| `asOfRule` | text | how the as-of date was chosen and what counts as knowable; needed before locking |
| `outcomeHorizon` | text | how long after the as-of date the outcome is judged; needed before locking |
| `outcomeMeasure` | text | what "capital earned its cost" means for this episode; needed before locking |
| `scorer.knewAboutOutcome` | text | what the scorer already knew about the outcome; needed before locking |
| `settings` | object | `pool`, `speed`, `mid`, `disc`, `rd`, `tv`, `premium`, `entry`, `mult`, `phase2Start`, `phase3Start` (each an input record) plus `entryDef` (`"A"`, `"B"` or `null`) and `capexModel` (`"sustaining"`, `"vintage"` or `null`) |
| `layers` | list of 1 to 8 | `{ name, inputs }`. Names are free text and specific to the episode. `inputs` has `evidence`, `share`, `offset`, `steepness`, `capex`, `buildStart`, `buildYears`, `unitCostDecline`, `passThrough`, `life`, `debt` (input records) and `driftP`, `marginP` (three input records each, one per phase) |
| `sources` | list of up to 100 | see below |
| `lock` | `null` or `{ hash, lockedAt, modelVersion }` | set by the page when locking |
| `outcomes` | list | empty until locked; see below |

### Input record

`{ "value": number or null, "basis": "sourced" | "derived" | "judgement" | null, "sourceIds": [ ... ], "calculation": text, "rationale": text }`

- A value needs a basis and **at least one cited source**, whatever the basis.
- `sourced`: the value appears in a cited source.
- `derived`: computed from cited sources; `calculation` must show how.
- `judgement`: the scorer's call, informed by the cited sources; `rationale` must say why.
- Values must sit inside the same ranges as the simulator's inputs.
- An episode where more than half of the filled inputs are judgement shows a **judgement-heavy** banner.

### Source

`{ "id": text, "citation": text, "publicationDate": "YYYY-MM-DD", "kind": "contemporary" | "compiled-from-period-data" | "retrospective", "truncatedAt": "YYYY-MM-DD" or null }`

- For an input, a source must be published on or before the as-of date.
- A `compiled-from-period-data` source may be published later, but it is valid for inputs only if its series is truncated on or before the as-of date. Only this kind has `truncatedAt`.
- For an outcome, a source must be published after the as-of date.

### Outcome

`{ "layer": index from 0, "result": "yes" | "no" | "unknown" | "contested", "sourceIds": [ ... ], "note": text, "contested": null or { "forSourceIds": [ ... ], "againstSourceIds": [ ... ] } }`

## Import and export

Episode files follow the same strict rules as snapshots:
- files are limited to 1 MB;
- any `__proto__`, `constructor` or `prototype` key is rejected;
- only listed fields are accepted, with types, ranges and dates checked, and each file is rebuilt into fresh objects;
- all text is shown as plain text.

Nothing is fetched from the network.
