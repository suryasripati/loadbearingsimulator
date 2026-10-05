const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../src/calibration.js');
const G = require('../src/calibration-guide.js');
const M = require('../src/model.js');
const { syntheticEpisode, rec } = require('./support/synthetic-episode.js');

const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = new Date('2026-10-05T12:00:00.000Z');
const rejects = (ep, pattern) => assert.throws(() => C.validateEpisode(clone(ep)), pattern);
const locked = (opts) => C.lockEpisode(syntheticEpisode(opts), NOW);
const v0 = (ep) => ep.variants[0];
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8');

/* ---------- Template, hash, schema ---------- */
test('template: the committed file equals the template (schema 3), passes validation, and lists everything needed before locking', () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'calibration', 'template.episode.json'), 'utf8'));
  assert.deepEqual(file, C.templateEpisode());
  assert.equal(file.schemaVersion, 3);
  const ep = C.validateEpisode(file);
  const p = C.lockProblems(ep, 0);
  for (const need of ['an id', 'a name', 'an as-of date', 'the as-of rule', 'the outcome horizon', 'the outcome measure', 'what the scorer already knew about the outcome']) assert.ok(p.includes(need), need);
  G.SCORER_CHECKLIST.forEach(c => assert.ok(p.includes('checklist: ' + c.text.toLowerCase()), c.key));
  assert.ok(C.allRecords(ep, 0).every(([, r]) => r.value === null), 'template has no values');
  assert.throws(() => C.lockEpisode(ep), /Not ready to lock/);
});

test('hash: SHA-256 matches the standard and Node crypto; canonical JSON sorts keys', () => {
  assert.equal(C.calSha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const t of ['', 'x'.repeat(1000), 'Railways 1845 é漢🙂']) assert.equal(C.calSha256(t), crypto.createHash('sha256').update(t, 'utf8').digest('hex'));
  assert.equal(C.calCanonical({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});

test('schema validation: format, version, fields, types, ranges and dates', () => {
  const ep = syntheticEpisode();
  rejects({ ...ep, format: 'x' }, /not a Load Bearing Simulator episode file/);
  rejects({ ...ep, schemaVersion: 4 }, /schema version 4 is not compatible \(this page reads schema versions 1, 2, 3\)/);
  rejects({ ...ep, extra: 1 }, /unknown field "extra"/);
  rejects({ ...ep, id: 'Has Spaces' }, /id: use lower-case letters/);
  rejects({ ...ep, asOfDate: '1845-02-30' }, /not a real calendar date/);
  const e1 = clone(ep); v0(e1).settings.disc.value = 99; rejects(e1, /setting disc value: value 99 is outside 5 to 20/);
  const e2 = clone(ep); v0(e2).layers[0].inputs.buildYears.value = 2.5; rejects(e2, /buildYears value: expected a whole number/);
  const e3 = clone(ep); v0(e3).layers[0].inputs.driftP.push(rec(0)); rejects(e3, /expected three phase records/);
  const e4 = clone(ep); v0(e4).settings.phase2Start.value = 12; v0(e4).settings.phase3Start.value = 10; rejects(e4, /phase 2 must start before phase 3/);
  const e5 = clone(ep); e5.sources.push({ ...e5.sources[0] }); rejects(e5, /duplicate source id "SYN-IN"/);
  const e6 = clone(ep); v0(e6).layers[1].inputs.share.sourceIds = ['NOPE']; rejects(e6, /unknown source id "NOPE"/);
  const e7 = clone(ep); e7.layerNames = []; rejects(e7, /expected 1 to 8 layers/);
  const e8 = clone(ep); e8.sources[0].citation = '  '; rejects(e8, /a source needs a citation/);
  const e9 = clone(ep); v0(e9).layers.pop(); rejects(e9, /expected 3 layers, one per layer name/);
  const e10 = clone(ep); e10.scorer.checklist.peakDate = 'maybe'; rejects(e10, /scorer checklist peakDate: unexpected value/);
  const e11 = clone(ep); delete e11.scorer.checklist.fallSize; rejects(e11, /missing field "fallSize"/);
});

test('basis: sourced and derived need a cited source; derived shows its calculation; judgement gives a rationale and may be uncited', () => {
  const ep = syntheticEpisode();
  const set = (r) => { const e = clone(ep); v0(e).layers[0].inputs.share = { ...v0(e).layers[0].inputs.share, ...r }; return e; };
  rejects(set({ basis: null }), /a value needs a basis/);
  rejects(set({ sourceIds: [] }), /a sourced value needs at least one cited source/);
  rejects(set({ basis: 'derived', sourceIds: [], calculation: 'a + b' }), /a derived value needs at least one cited source/);
  rejects(set({ basis: 'derived', calculation: '' }), /a derived value needs its calculation shown/);
  rejects(set({ basis: 'judgement', rationale: ' ' }), /a judgement needs a rationale/);
  rejects(set({ basis: 'guess' }), /basis: unexpected value/);
  assert.ok(C.validateEpisode(set({ basis: 'judgement', sourceIds: [], rationale: 'read across from neighbouring layers' })));
  assert.ok(C.validateEpisode(set({ value: null, basis: null, sourceIds: [] })), 'an empty draft record is fine');
});

test('date order: input sources on or before the as-of date; compiled series only if truncated by then; outcome sources after it', () => {
  const ep = syntheticEpisode();
  const withSource = (s) => { const e = clone(ep); e.sources[0] = { ...e.sources[0], ...s }; return e; };
  assert.ok(C.validateEpisode(withSource({ publicationDate: '1845-06-30' })));
  rejects(withSource({ publicationDate: '1845-07-01' }), /source "SYN-IN" was not available at the as-of date 1845-06-30 \(published 1845-07-01\)/);
  const useCompiled = (trunc) => { const e = clone(ep); e.sources[1].truncatedAt = trunc; v0(e).layers[0].inputs.capex.sourceIds = ['SYN-COMP']; return e; };
  assert.ok(C.validateEpisode(useCompiled('1845-06-30')));
  rejects(useCompiled('1846-12-31'), /a compiled series must be truncated on or before the as-of date/);
  rejects(withSource({ truncatedAt: '1845-01-01' }), /only a compiled series has a truncation date/);
  const retro = clone(ep); v0(retro).layers[0].inputs.life.sourceIds = ['SYN-OUT']; rejects(retro, /source "SYN-OUT" was not available at the as-of date/);
});

/* ---------- Scorer checklist ---------- */
test('checklist: every item must be answered yes, no or partly before locking', () => {
  for (const c of G.SCORER_CHECKLIST) {
    const e = clone(syntheticEpisode()); e.scorer.checklist[c.key] = '';
    assert.throws(() => C.lockEpisode(C.validateEpisode(e), NOW), new RegExp('Still needed: .*checklist: ' + c.text.toLowerCase()));
  }
  for (const a of ['yes', 'no', 'partly']) assert.ok(C.lockEpisode(syntheticEpisode({ checklist: a }), NOW).variants[0].lock.checklistCaptured);
});

test('checklist: the answers are part of the lock hash; changing one after locking breaks the lock', () => {
  const L = locked();
  const meta = { counts: v0(L).lock.counts, acknowledged: v0(L).lock.acknowledged };
  for (const c of G.SCORER_CHECKLIST) {
    const e = clone(L); e.scorer.checklist[c.key] = e.scorer.checklist[c.key] === 'yes' ? 'no' : 'yes';
    assert.notEqual(C.variantHash(e, 0, meta), v0(L).lock.hash, c.key);
    rejects(e, /do not match the lock hash/);
  }
  const e = clone(L); e.scorer.knewAboutOutcome += ' more'; rejects(e, /do not match the lock hash/);
});

/* ---------- Lock and acknowledgement (per input version) ---------- */
test('lock: stores hash, time, model version, counts, acknowledgement and checklist capture', () => {
  const L = locked(), lock = v0(L).lock;
  assert.match(lock.hash, /^[0-9a-f]{64}$/);
  assert.equal(lock.hash, C.variantHash(L, 0, { counts: lock.counts, acknowledged: lock.acknowledged }));
  assert.deepEqual([lock.lockedAt, lock.modelVersion, lock.hashScheme, lock.checklistCaptured, lock.acknowledged], [NOW.toISOString(), M.MODEL_VERSION, 3, true, false]);
  assert.deepEqual(lock.counts, { judgement: 0, uncited: 0, total: C.allRecords(L, 0).length });
  assert.throws(() => C.lockEpisode(L), /already locked/);
});

test('lock: the hash changes when any input of the version changes; tampering is rejected', () => {
  const ep = syntheticEpisode(), meta = { counts: { judgement: 0, uncited: 0, total: 1 }, acknowledged: false }, base = C.variantHash(ep, 0, meta);
  const recOf = (e, k) => C.allRecords(e, 0).find(([kk]) => kk === k)[1];
  const edits = [e => { e.name += '!'; }, e => { e.asOfDate = '1845-06-29'; }, e => { e.asOfRule += '.'; }, e => { e.outcomeHorizon += '.'; },
    e => { e.outcomeMeasure += '.'; }, e => { e.layerNames[0] += '.'; }, e => { e.sources[0].citation += '.'; }, e => { v0(e).label += '.'; },
    e => { v0(e).settings.entryDef = 'B'; }, e => { v0(e).settings.capexModel = 'vintage'; }, e => { e.version = 2; }];
  C.allRecords(ep, 0).forEach(([k]) => { edits.push(e => { recOf(e, k).value += 0.5; }); edits.push(e => { recOf(e, k).rationale += ' x'; }); });
  edits.forEach((f, i) => { const e = clone(ep); f(e); assert.notEqual(C.variantHash(e, 0, meta), base, 'edit ' + i); });
  for (const k of ['judgement', 'uncited', 'total']) assert.notEqual(C.variantHash(ep, 0, { ...meta, counts: { ...meta.counts, [k]: meta.counts[k] + 1 } }), base, k);
  assert.notEqual(C.variantHash(ep, 0, { ...meta, acknowledged: true }), base);
  // A source no version cites is not part of the hash, so it can be added later.
  const added = clone(ep); added.sources.push({ id: 'SYN-NEW', citation: 'Synthetic later source (fictitious)', publicationDate: '1845-03-01', kind: 'contemporary', truncatedAt: null });
  assert.equal(C.variantHash(added, 0, meta), base);
  const L = locked(); const t = clone(L); v0(t).layers[0].inputs.share.value = 26;
  assert.match(C.importEpisodeText(JSON.stringify(t)).error, /do not match the lock hash/);
});

const judgementEp = (n, cited) => {
  const ep = clone(syntheticEpisode());
  C.allRecords(ep, 0).slice(0, n).forEach(([, r]) => { r.basis = 'judgement'; r.rationale = 'synthetic'; if (!cited) r.sourceIds = []; });
  return C.validateEpisode(ep);
};

test('acknowledgement: needed when more than half the filled inputs are judgement or any is uncited; message has the counts', () => {
  const total = C.allRecords(syntheticEpisode(), 0).length, half = Math.floor(total / 2);
  assert.equal(C.lockAcknowledgement(syntheticEpisode(), 0).needed, false);
  assert.equal(C.lockAcknowledgement(judgementEp(half, true), 0).needed, false);
  assert.equal(C.lockAcknowledgement(judgementEp(half + 1, true), 0).message, 'Before locking “Main”: ' + (half + 1) + ' of ' + total + ' filled inputs are judgement. Lock anyway, or cancel and add sources?');
  assert.equal(C.lockAcknowledgement(judgementEp(1, false), 0).message, 'Before locking “Main”: 1 input is uncited. Lock anyway, or cancel and add sources?');
});

test('acknowledgement: never blocks locking; recorded in the lock; tampered counts or acknowledgements are rejected', () => {
  const ep = judgementEp(3, false), total = C.allRecords(ep, 0).length;
  assert.throws(() => C.lockEpisode(ep, NOW), /Needs acknowledgement: Before locking “Main”: 3 inputs are uncited/);
  const L = C.lockEpisode(ep, NOW, { acknowledged: true });
  assert.equal(v0(L).lock.acknowledged, true);
  assert.deepEqual(v0(L).lock.counts, { judgement: 3, uncited: 3, total });
  assert.equal(C.lockEpisode(syntheticEpisode(), NOW, { acknowledged: true }).variants[0].lock.acknowledged, false, 'not needed, not recorded');
  const t1 = clone(L); v0(t1).lock.counts.uncited = 0; rejects(t1, /the recorded counts do not match the inputs/);
  const t2 = clone(L); v0(t2).lock.acknowledged = false; rejects(t2, /needed an acknowledgement at lock time and has none/);
  const t3 = clone(locked()); v0(t3).lock.acknowledged = true; rejects(t3, /an acknowledgement is recorded but none was needed/);
  const t4 = clone(L); v0(t4).lock.checklistCaptured = false; rejects(t4, /a scheme 3 lock always captures the checklist/);
});

/* ---------- Input versions ---------- */
test('input versions: added as a copy, each locked separately with its own hash, counts and acknowledgement', () => {
  let ep = C.addVariant(syntheticEpisode(), 'Measured', 0);
  ep.variants[0].label = 'Hype';
  ep = C.validateEpisode(clone(ep));
  assert.deepEqual(ep.variants.map(v => v.label), ['Hype', 'Measured']);
  assert.deepEqual(ep.variants[1].layers, ep.variants[0].layers, 'starts as a copy');
  // Measured: slower adoption speed, as an uncited judgement (synthetic).
  const m = clone(ep); m.variants[1].settings.speed = { value: 12, basis: 'judgement', sourceIds: [], calculation: '', rationale: 'synthetic measured view' };
  ep = C.validateEpisode(m);
  ep = C.lockVariant(ep, 0, NOW);
  assert.throws(() => C.lockVariant(ep, 1, NOW), /Needs acknowledgement: Before locking “Measured”: 1 input is uncited/);
  ep = C.lockVariant(ep, 1, NOW, { acknowledged: true });
  const [h, s] = ep.variants.map(v => v.lock);
  assert.notEqual(h.hash, s.hash);
  assert.deepEqual([h.acknowledged, s.acknowledged, h.counts.uncited, s.counts.uncited], [false, true, 0, 1]);
  assert.equal(C.importEpisodeText(C.exportEpisodeText(ep)).ok, true);
  // Errors
  assert.throws(() => C.addVariant(ep, 'Hype', 0), /already has that label/);
  assert.throws(() => C.addVariant(ep, ' ', 0), /Give the input version a label/);
  let full = ep; ['C', 'D'].forEach(l => { full = C.addVariant(full, l, 0); });
  assert.throws(() => C.addVariant(full, 'E', 0), /at most 4 input versions/);
  const dup = clone(ep); dup.variants[1].label = 'Hype'; rejects(dup, /two input versions have the same label/);
});

test('input versions share the as-of date, rule, horizon, measure, scorer and layer names: changing them after any lock breaks the locks', () => {
  let ep = C.lockVariant(C.addVariant(syntheticEpisode(), 'Measured', 0), 0, NOW);
  // Only "Main" is locked; changing a shared field still breaks it, so the change needs a new episode version.
  for (const f of [e => { e.asOfDate = '1845-06-29'; }, e => { e.asOfRule += '.'; }, e => { e.outcomeHorizon += '.'; }, e => { e.outcomeMeasure += '.'; },
    e => { e.layerNames[1] += '.'; }, e => { e.scorer.checklist.failures = 'no'; }]) {
    const e = clone(ep); f(e); rejects(e, /input version 1 \(Main\) lock: .*do not match the lock hash.*new episode version/);
  }
  // The unlocked version can still change its own inputs.
  const e = clone(ep); e.variants[1].settings.disc.value = 12; assert.ok(C.validateEpisode(e));
  // A new episode version unlocks everything, links to the old locks and clears outcomes.
  ep = C.lockVariant(ep, 1, NOW);
  ep = C.setOutcome(ep, { layer: 0, result: 'no', sourceIds: ['SYN-OUT'], note: 'synthetic', contested: null });
  const nv = C.newEpisodeVersion(ep);
  assert.equal(nv.version, 2); assert.ok(nv.variants.every(v => !v.lock)); assert.deepEqual(nv.outcomes, []);
  assert.equal(nv.previousHash, C.calSha256(ep.variants.map(v => v.lock.hash).join(',')));
});

test('input versions: a tampered multi-version file is rejected, naming the version', () => {
  let ep = C.addVariant(syntheticEpisode(), 'Measured', 0);
  ep = C.lockVariant(C.lockVariant(ep, 0, NOW), 1, NOW);
  const text = C.exportEpisodeText(ep);
  assert.equal(C.importEpisodeText(text).ok, true);
  const tamper = (f) => { const e = JSON.parse(text); f(e); return C.importEpisodeText(JSON.stringify(e)).error; };
  assert.match(tamper(e => { e.variants[1].settings.disc.value = 12; }), /input version 2 \(Measured\) lock: .*do not match the lock hash/);
  assert.match(tamper(e => { e.variants[1].lock.counts.total += 1; }), /input version 2 \(Measured\) lock counts: the recorded counts do not match/);
  assert.match(tamper(e => { e.variants[1].lock.acknowledged = true; }), /input version 2 \(Measured\) lock: an acknowledgement is recorded but none was needed/);
  assert.match(tamper(e => { e.variants[1].lock.hash = e.variants[0].lock.hash; }), /input version 2 \(Measured\) lock: .*do not match the lock hash/);
  assert.match(tamper(e => { e.scorer.checklist.peakDate = 'no'; }), /input version 1 \(Main\) lock: .*do not match the lock hash/);
  assert.match(tamper(e => { e.variants[1].lock.hashScheme = 2; }), /only the first input version can carry a lock from an older schema/);
});

test('outcomes: only once every input version is locked; never a new version after outcomes', () => {
  const yes = { layer: 0, result: 'yes', sourceIds: ['SYN-OUT'], note: 'synthetic', contested: null };
  let ep = C.lockVariant(C.addVariant(syntheticEpisode(), 'Measured', 0), 0, NOW);
  assert.throws(() => C.setOutcome(ep, yes), /after every input version is locked/);
  rejects({ ...clone(ep), outcomes: [yes] }, /outcomes can only be entered after every input version is locked/);
  ep = C.lockVariant(ep, 1, NOW);
  ep = C.setOutcome(ep, yes);
  assert.throws(() => C.addVariant(ep, 'Late', 0), /Outcomes are already recorded, so a new input version would be entered with the outcome in view/);
  const L = locked();
  assert.throws(() => C.setOutcome(L, { ...yes, note: '' }), /an outcome needs a note/);
  assert.throws(() => C.setOutcome(L, { ...yes, sourceIds: [] }), /an outcome of yes or no needs a cited source/);
  assert.throws(() => C.setOutcome(L, { ...yes, sourceIds: ['SYN-IN'] }), /must be published after the as-of date 1845-06-30/);
  const contested = { layer: 2, result: 'contested', sourceIds: [], note: 'synthetic', contested: { forSourceIds: ['SYN-OUT'], againstSourceIds: ['SYN-OUT2'] } };
  assert.equal(C.setOutcome(L, contested).outcomes[0].result, 'contested');
  assert.throws(() => C.setOutcome(L, { ...contested, contested: { forSourceIds: ['SYN-OUT'], againstSourceIds: [] } }), /at least one citation on each side/);
});

/* ---------- Migration from schemas 1 and 2 ---------- */
test('migration: a real schema 2 file with a lock and an outcome imports, keeps its lock valid, and notes the checklist was not captured', () => {
  const raw = JSON.parse(fixture('episode_schema2_locked'));
  assert.equal(raw.schemaVersion, 2); assert.equal(raw.lock.hashScheme, 2); assert.equal(raw.lock.acknowledged, true);
  const r = C.importEpisodeText(JSON.stringify(raw));
  assert.equal(r.ok, true, r.error);
  const ep = r.episode, lock = v0(ep).lock;
  assert.equal(ep.schemaVersion, 3);
  assert.deepEqual(ep.variants.map(v => v.label), ['Main']);
  assert.deepEqual(ep.layerNames, raw.layers.map(L => L.name));
  assert.deepEqual([lock.hash, lock.hashScheme, lock.acknowledged, lock.checklistCaptured], [raw.lock.hash, 2, true, false]);
  assert.deepEqual(lock.counts, raw.lock.counts);
  assert.deepEqual(ep.scorer.checklist, Object.fromEntries(G.SCORER_CHECKLIST.map(c => [c.key, ''])));
  assert.equal(ep.outcomes.length, 1);
  assert.equal(C.importEpisodeText(C.exportEpisodeText(ep)).ok, true, 'still valid after re-saving as schema 3');
  // Tamper checks still apply under the original formula.
  const t = clone(raw); t.layers[0].inputs.share.value = 26;
  assert.match(C.importEpisodeText(JSON.stringify(t)).error, /do not match the lock hash/);
  const t2 = clone(raw); t2.lock.counts.uncited = 0;
  assert.match(C.importEpisodeText(JSON.stringify(t2)).error, /the recorded counts do not match/);
  // The checklist can be filled in afterwards without breaking the old lock (it was never part of that hash).
  const filled = clone(ep); G.SCORER_CHECKLIST.forEach(c => { filled.scorer.checklist[c.key] = 'yes'; });
  assert.ok(C.validateEpisode(filled));
  assert.equal(C.basisFromLock(ep, 0).checklistCaptured, false);
});

test('migration: a real schema 1 file with a lock imports under hash scheme 1', () => {
  const raw = JSON.parse(fixture('episode_schema1_locked'));
  assert.deepEqual(Object.keys(raw.lock).sort(), ['hash', 'lockedAt', 'modelVersion']);
  const r = C.importEpisodeText(JSON.stringify(raw));
  assert.equal(r.ok, true, r.error);
  const lock = v0(r.episode).lock;
  assert.deepEqual([lock.hashScheme, lock.counts, lock.acknowledged, lock.checklistCaptured], [1, null, null, false]);
  assert.equal(C.importEpisodeText(C.exportEpisodeText(r.episode)).ok, true);
  const t = clone(raw); t.asOfRule += '.';
  assert.match(C.importEpisodeText(JSON.stringify(t)).error, /do not match the lock hash/);
  const extra = clone(raw); extra.lock.counts = null;
  assert.match(C.importEpisodeText(JSON.stringify(extra)).error, /unknown field "counts"/, 'schema 1 lock fields are checked strictly');
  assert.equal(C.basisFromLock(r.episode, 0).recorded, false);
});

test('migration: a migrated episode can take a new input version, locked under scheme 3', () => {
  const ep = C.importEpisodeText(fixture('episode_schema1_locked')).episode;
  const filled = clone(ep); G.SCORER_CHECKLIST.forEach(c => { filled.scorer.checklist[c.key] = 'partly'; });
  let e = C.addVariant(C.validateEpisode(filled), 'Measured', 0);
  e = C.lockVariant(e, 1, NOW);
  assert.deepEqual(e.variants.map(v => v.lock.hashScheme), [1, 3]);
  assert.equal(C.importEpisodeText(C.exportEpisodeText(e)).ok, true);
});

/* ---------- Doubling-time helper ---------- */
test('doubling-time helper: speed = ln(81) / ln(2) x T, with the calculation text, inside the model range', () => {
  assert.ok(Math.abs(C.EP_LN81_LN2 - 6.33985) < 1e-5);
  const r = C.doublingTimeToSpeed(1.5);
  assert.equal(r.value, Math.round(Math.log(81) / Math.log(2) * 1.5 * 100) / 100);
  assert.match(r.calculation, /^speed = ln\(81\) \/ ln\(2\) x doubling time = 6\.3399 x 1\.5 years = 9\.51 years\. Early-phase doubling time only; the midpoint is set separately\.$/);
  // Consistent with the model: a logistic with this speed doubles in T years early on.
  const S = r.value, k = Math.log(81) / S;
  assert.ok(Math.abs(Math.log(2) / k - 1.5) < 0.01);
  assert.throws(() => C.doublingTimeToSpeed(0), /greater than zero/);
  assert.throws(() => C.doublingTimeToSpeed(10), /outside the model range 3 to 20/);
  // A helper-derived record still needs a cited source.
  const e = clone(syntheticEpisode()); v0(e).settings.speed = { value: r.value, basis: 'derived', sourceIds: [], calculation: r.calculation, rationale: '' };
  rejects(e, /a derived value needs at least one cited source/);
});

/* ---------- Guidance ---------- */
test('guidance: every input has meaning, where to look, recipe and hindsight trap; GUIDE.md is generated from it', () => {
  const keys = C.EP_SETTING_KEYS.concat(C.EP_LAYER_KEYS, ['driftP', 'marginP']);
  assert.deepEqual(Object.keys(G.GUIDE).sort(), keys.slice().sort());
  for (const k of keys) for (const f of ['label', 'meaning', 'where', 'recipe', 'trap']) assert.ok(G.GUIDE[k][f] && G.GUIDE[k][f].length > (f === 'label' ? 5 : 10), k + '.' + f);
  const md = fs.readFileSync(path.join(__dirname, '..', 'calibration', 'GUIDE.md'), 'utf8');
  assert.equal(md, G.guideMarkdown(), 'calibration/GUIDE.md is up to date (run npm run build)');
  assert.equal(G.SCORER_CHECKLIST.length, 6);
});

test('guidance: no real episode numbers (symbolic examples only)', () => {
  const text = JSON.stringify(G.GUIDE) + G.GUIDE_INTRO.join(' ');
  // Allowed numbers: the 1-to-5 evidence scale and its steps, the 10%, 50% and 90% definitions of the curve, ln(81), ln(2),
  // year 0 and model year counts. Anything that looks like a year, a money amount or a percentage outside those is refused.
  assert.ok(!/\b1[6-9]\d\d\b|\b20\d\d\b/.test(text), 'no calendar years');
  assert.ok(!/[$£€]\s?\d/.test(text), 'no money amounts');
  const pcts = (text.match(/\d+(\.\d+)?%/g) || []).filter(p => !['10%', '50%', '90%'].includes(p));
  assert.deepEqual(pcts, [], 'no percentages other than the 10%, 50% and 90% adoption-curve definitions');
});

/* ---------- Basis mix, comparison, export, import ---------- */
test('judgement share is per input version; uncited judgement is labelled and makes the export private', () => {
  const ep = clone(syntheticEpisode()), recs = C.allRecords(ep, 0), n = Math.floor(recs.length / 2) + 1;
  recs.slice(0, n).forEach(([, r]) => { r.basis = 'judgement'; r.sourceIds = []; r.rationale = 'synthetic'; });
  const v = C.validateEpisode(ep), js = C.judgementShare(v, 0);
  assert.deepEqual([js.judgement, js.uncited, js.heavy], [n, n, true]);
  assert.equal(C.isUncitedJudgement(C.allRecords(v, 0)[0][1]), true);
  const f = C.exportEpisodeFile(C.lockEpisode(v, NOW, { acknowledged: true }));
  assert.deepEqual([f.isPrivate, f.filename], [true, 'synthetic-test-v1.private.json']);
  assert.deepEqual([C.exportEpisodeFile(syntheticEpisode()).isPrivate, C.exportEpisodeFile(syntheticEpisode()).filename], [false, 'synthetic-test-v1.episode.json']);
  // Uncited inputs in a second version are named by its label.
  let two = C.addVariant(syntheticEpisode(), 'Measured', 0);
  const t = clone(two); t.variants[1].settings.mid = { value: 9, basis: 'judgement', sourceIds: [], calculation: '', rationale: 'synthetic' };
  assert.deepEqual(C.unsourcedInputs(C.validateEpisode(t)), ['Measured: settings mid']);
});

test('comparison: one column per locked input version, side by side, from the current model; counts and caveat; no hit rate', () => {
  let ep = C.addVariant(syntheticEpisode(), 'Measured', 0);
  const m = clone(ep); m.variants[1].settings.speed.value = 14; m.variants[1].settings.mid.value = 11; ep = C.validateEpisode(m);
  ep = C.lockVariant(C.lockVariant(ep, 0, NOW), 1, NOW);
  ep = C.setOutcome(ep, { layer: 1, result: 'no', sourceIds: ['SYN-OUT'], note: 'synthetic', contested: null });
  const c = C.compareEpisodes([ep, syntheticEpisode()]);
  assert.equal(c.episodes, 1, 'only episodes with a locked version count');
  assert.equal(c.layers, 3);
  assert.equal(c.caveat, 'Too few cases for statistical conclusions.');
  assert.ok(!JSON.stringify(Object.keys(c)).match(/hit|rate|accuracy|score/i));
  const g = c.groups[0];
  g.rows.forEach((r, i) => {
    assert.deepEqual(r.variants.map(x => x.label), ['Main', 'Measured']);
    r.variants.forEach((x, vi) => {
      const mi = C.episodeModelInputs(ep, vi), o = M.runLayer(mi.layers[i], mi.G);
      assert.equal(x.verdict, o.bin); assert.equal(x.npv, o.npv);
      assert.deepEqual([x.basis.judgement, x.basis.uncited, x.basis.total], [ep.variants[vi].lock.counts.judgement, ep.variants[vi].lock.counts.uncited, ep.variants[vi].lock.counts.total]);
    });
  });
  assert.notEqual(g.rows[0].variants[0].npv, g.rows[0].variants[1].npv, 'different inputs, different results');
  assert.equal(g.rows[1].outcome, 'no');
  const versionFlag = clone(ep); versionFlag.variants[0].lock.modelVersion = M.MODEL_VERSION + 1;
  assert.ok(C.compareEpisodes([C.validateEpisode(versionFlag)]).groups[0].rows[0].variants[0].versionDiffers);
});

test('import hardening: size, prototype keys, unknown fields, fresh objects, text kept as text', () => {
  const text = C.exportEpisodeText(locked());
  const r = C.importEpisodeText(text);
  assert.equal(r.ok, true, r.error);
  assert.match(C.importEpisodeText('{' + ' '.repeat(1024 * 1024 + 1)).error, /larger than 1 MB/);
  assert.match(C.importEpisodeText(text.replace('"name":', '"__proto__": {"x": 1}, "name":')).error, /forbidden key "__proto__"/);
  assert.match(C.importEpisodeText(text.replace('"citation":', '"constructor": 1, "citation":')).error, /forbidden key "constructor"/);
  assert.match(C.importEpisodeText(text.replace('"rationale":', '"prototype": 1, "rationale":')).error, /forbidden key "prototype"/);
  const parsed = JSON.parse(text), again = C.importEpisodeText(text).episode;
  assert.notEqual(again, parsed);
  const walk = (v) => { if (v && typeof v === 'object') { if (!Array.isArray(v)) assert.equal(Object.getPrototypeOf(v), Object.prototype); Object.values(v).forEach(walk); } };
  walk(again);
  const html = clone(syntheticEpisode()); html.name = '<img src=x onerror=alert(1)>';
  assert.equal(C.importEpisodeText(JSON.stringify(html)).episode.name, '<img src=x onerror=alert(1)>');
});

/* ---------- Public repo rule ---------- */
function committedFileProblems(dir){
  const problems = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(f => {
    const p = path.join(d, f.name), rel = path.relative(dir, p);
    if (f.isDirectory()) { if (rel !== 'private') walk(p); return; }
    if (rel === 'template.episode.json' || rel === 'README.md' || rel === 'GUIDE.md') return;
    if (/\.private\.json$/.test(rel)) { problems.push(rel + ': a .private.json file is in the folder (it should be gitignored)'); return; }
    if (!/\.json$/.test(rel)) { problems.push(rel + ': only episode files belong here'); return; }
    const r = C.importEpisodeText(fs.readFileSync(p, 'utf8'));
    if (!r.ok) { problems.push(rel + ': ' + r.error); return; }
    const u = C.unsourcedInputs(r.episode);
    if (u.length) problems.push(rel + ': numeric inputs without a source: ' + u.join(', '));
  });
  walk(dir);
  return problems;
}
test('public repo rule: no committed file under calibration/ (other than the template and docs) has a numeric input without a source', () => {
  assert.deepEqual(committedFileProblems(path.join(__dirname, '..', 'calibration')), []);
});
test('public repo rule: the committed-file check catches an uncited judgement in any input version', () => {
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-cal-'));
  try {
    fs.mkdirSync(path.join(tmp, 'private'));
    fs.writeFileSync(path.join(tmp, 'cited.episode.json'), JSON.stringify(syntheticEpisode()));
    const two = clone(C.addVariant(syntheticEpisode(), 'Measured', 0));
    two.variants[1].settings.mid = { value: 9, basis: 'judgement', sourceIds: [], calculation: '', rationale: 'synthetic' };
    fs.writeFileSync(path.join(tmp, 'private', 'ignored.json'), JSON.stringify(two));
    assert.deepEqual(committedFileProblems(tmp), []);
    fs.writeFileSync(path.join(tmp, 'uncited.episode.json'), JSON.stringify(two));
    assert.deepEqual(committedFileProblems(tmp), ['uncited.episode.json: numeric inputs without a source: Measured: settings mid']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('gitignore keeps private calibration files out of the repository', () => {
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8').split('\n').map(l => l.trim());
  assert.ok(gi.includes('*.private.json')); assert.ok(gi.includes('calibration/private/'));
});
