const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../src/calibration.js');
const M = require('../src/model.js');
const { syntheticEpisode, rec } = require('./support/synthetic-episode.js');

const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = new Date('2026-10-05T12:00:00.000Z');
const rejects = (ep, pattern) => assert.throws(() => C.validateEpisode(clone(ep)), pattern);
const locked = () => C.lockEpisode(syntheticEpisode(), NOW);

test('template: the committed file equals the template, passes validation, and lists everything needed before locking', () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'calibration', 'template.episode.json'), 'utf8'));
  assert.deepEqual(file, C.templateEpisode());
  const ep = C.validateEpisode(file);
  assert.equal(ep.lock, null);
  const p = C.lockProblems(ep);
  for (const need of ['an id', 'a name', 'an as-of date', 'the as-of rule', 'the outcome horizon', 'the outcome measure', 'what the scorer already knew about the outcome']) assert.ok(p.includes(need), need);
  assert.ok(C.allRecords(ep).every(([, r]) => r.value === null), 'template has no values');
  assert.throws(() => C.lockEpisode(ep), /Not ready to lock/);
});

test('hash: SHA-256 matches the standard and Node crypto', () => {
  assert.equal(C.calSha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const t of ['', 'x'.repeat(1000), 'Railways 1845 é漢🙂']) assert.equal(C.calSha256(t), crypto.createHash('sha256').update(t, 'utf8').digest('hex'));
  assert.equal(C.calCanonical({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});

test('schema validation: format, version, fields, types, ranges and dates', () => {
  const ep = syntheticEpisode();
  rejects({ ...ep, format: 'x' }, /not a Load Bearing Simulator episode file/);
  rejects({ ...ep, schemaVersion: 3 }, /schema version 3 is not compatible \(this page reads schema versions 1 and 2\)/);
  rejects({ ...ep, extra: 1 }, /unknown field "extra"/);
  rejects({ ...ep, id: 'Has Spaces' }, /id: use lower-case letters/);
  rejects({ ...ep, asOfDate: '1845-02-30' }, /not a real calendar date/);
  const e1 = clone(ep); e1.settings.disc.value = 99; rejects(e1, /setting disc value: value 99 is outside 5 to 20/);
  const e2 = clone(ep); e2.layers[0].inputs.buildYears.value = 2.5; rejects(e2, /buildYears value: expected a whole number/);
  const e3 = clone(ep); e3.layers[0].inputs.driftP.push(rec(0)); rejects(e3, /expected three phase records/);
  const e4 = clone(ep); e4.settings.phase2Start.value = 12; e4.settings.phase3Start.value = 10; rejects(e4, /phase 2 must start before phase 3/);
  const e5 = clone(ep); e5.sources.push({ ...e5.sources[0] }); rejects(e5, /duplicate source id "SYN-IN"/);
  const e6 = clone(ep); e6.layers[1].inputs.share.sourceIds = ['NOPE']; rejects(e6, /unknown source id "NOPE"/);
  const e7 = clone(ep); e7.layers = []; rejects(e7, /expected 1 to 8 layers/);
  const e8 = clone(ep); e8.sources[0].citation = '  '; rejects(e8, /a source needs a citation/);
});

test('basis: every value needs a basis; sourced and derived need a cited source; derived shows its calculation; judgement gives a rationale', () => {
  const ep = syntheticEpisode();
  const set = (r) => { const e = clone(ep); e.layers[0].inputs.share = { ...e.layers[0].inputs.share, ...r }; return e; };
  rejects(set({ basis: null }), /a value needs a basis/);
  rejects(set({ sourceIds: [] }), /a sourced value needs at least one cited source/);
  rejects(set({ basis: 'derived', sourceIds: [], calculation: 'a + b' }), /a derived value needs at least one cited source/);
  rejects(set({ basis: 'judgement', sourceIds: [], rationale: '' }), /a judgement needs a rationale/);
  assert.ok(C.validateEpisode(set({ basis: 'judgement', sourceIds: [], rationale: 'read across from neighbouring layers' })), 'an uncited judgement with a rationale is allowed');
  rejects(set({ basis: 'derived', calculation: '' }), /a derived value needs its calculation shown/);
  rejects(set({ basis: 'judgement', rationale: ' ' }), /a judgement needs a rationale/);
  rejects(set({ basis: 'guess' }), /basis: unexpected value/);
  assert.ok(C.validateEpisode(set({ basis: 'derived', calculation: 'SYN-IN table 2 divided by 4' })));
  assert.ok(C.validateEpisode(set({ basis: 'judgement', rationale: 'read across from SYN-IN' })));
  assert.ok(C.validateEpisode(set({ value: null, basis: null, sourceIds: [] })), 'an empty draft record is fine');
});

test('date order: input sources on or before the as-of date; compiled series only if truncated by then; outcome sources after it', () => {
  const ep = syntheticEpisode();
  const withSource = (s) => { const e = clone(ep); e.sources[0] = { ...e.sources[0], ...s }; return e; };
  assert.ok(C.validateEpisode(withSource({ publicationDate: '1845-06-30' })), 'published on the as-of date is allowed');
  rejects(withSource({ publicationDate: '1845-07-01' }), /source "SYN-IN" was not available at the as-of date 1845-06-30 \(published 1845-07-01\)/);
  // Compiled from period data: published much later, valid only if truncated on or before the as-of date.
  const useCompiled = (trunc) => { const e = clone(ep); e.sources[1].truncatedAt = trunc; e.layers[0].inputs.capex.sourceIds = ['SYN-COMP']; return e; };
  assert.ok(C.validateEpisode(useCompiled('1845-06-30')));
  rejects(useCompiled('1846-12-31'), /a compiled series must be truncated on or before the as-of date/);
  rejects(withSource({ truncatedAt: '1845-01-01' }), /only a compiled series has a truncation date/);
  const e = clone(ep); e.sources[1].truncatedAt = null; rejects(e, /a compiled series needs the date it is truncated at/);
  // A retrospective source cannot back an input.
  const retro = clone(ep); retro.layers[0].inputs.life.sourceIds = ['SYN-OUT']; rejects(retro, /source "SYN-OUT" was not available at the as-of date/);
  assert.equal(C.sourceValidForInput({ kind: 'contemporary', publicationDate: '1845-06-30' }, '1845-06-30'), true);
  assert.equal(C.sourceValidForOutcome({ publicationDate: '1845-06-30' }, '1845-06-30'), false, 'on the as-of date is not after it');
});

test('lock: needs the as-of rule, horizon, measure and scorer statement; stores hash, time and model version', () => {
  for (const [field, set] of [['the as-of rule', e => { e.asOfRule = ''; }], ['the outcome horizon', e => { e.outcomeHorizon = ' '; }],
    ['the outcome measure', e => { e.outcomeMeasure = ''; }], ['what the scorer already knew about the outcome', e => { e.scorer.knewAboutOutcome = ''; }]]) {
    const e = clone(syntheticEpisode()); set(e);
    assert.throws(() => C.lockEpisode(C.validateEpisode(e)), new RegExp('Still needed: .*' + field.replace(/[()]/g, '\\$&')));
  }
  const ep = locked();
  assert.match(ep.lock.hash, /^[0-9a-f]{64}$/);
  assert.equal(ep.lock.hash, C.episodeHash(ep, { counts: ep.lock.counts, acknowledged: ep.lock.acknowledged }));
  assert.equal(ep.lock.hashScheme, 2);
  assert.deepEqual(ep.lock.counts, { judgement: 0, uncited: 0, total: C.allRecords(ep).length });
  assert.equal(ep.lock.acknowledged, false, 'no acknowledgement needed for a fully sourced episode');
  assert.equal(ep.lock.lockedAt, NOW.toISOString());
  assert.equal(ep.lock.modelVersion, M.MODEL_VERSION);
  assert.throws(() => C.lockEpisode(ep), /already locked/);
});

test('lock: the hash changes when any input changes, and a locked file edited by hand is rejected', () => {
  const ep = syntheticEpisode(), base = C.episodeHash(ep);
  const edits = [e => { e.name += '!'; }, e => { e.asOfDate = '1845-06-29'; }, e => { e.asOfRule += '.'; }, e => { e.outcomeHorizon += '.'; },
    e => { e.outcomeMeasure += '.'; }, e => { e.scorer.knewAboutOutcome += '.'; }, e => { e.sources[0].citation += '.'; }, e => { e.layers[0].name += '.'; },
    e => { e.settings.entryDef = 'B'; }, e => { e.settings.capexModel = 'vintage'; }, e => { e.version = 2; }];
  // Every input record: its value, and separately its rationale.
  const recOf = (e, k) => C.allRecords(e).find(([kk]) => kk === k)[1];
  C.allRecords(ep).forEach(([k]) => {
    edits.push(e => { recOf(e, k).value += 0.5; });
    edits.push(e => { recOf(e, k).rationale += ' changed'; });
  });
  edits.forEach((f, i) => { const e = clone(ep); f(e); assert.notEqual(C.episodeHash(e), base, 'edit ' + i + ' should change the hash'); });
  assert.equal(C.episodeHash(clone(ep)), base, 'no edit, same hash');
  const L = locked();
  const tampered = clone(L); tampered.layers[0].inputs.share.value = 26;
  assert.throws(() => C.validateEpisode(tampered), /do not match the lock hash; locked inputs cannot change without making a new version/);
  assert.match(C.importEpisodeText(JSON.stringify(tampered)).error, /do not match the lock hash/);
  // Outcomes are not covered by the hash, so recording them keeps the lock valid.
  const withOutcome = C.setOutcome(L, { layer: 0, result: 'yes', sourceIds: ['SYN-OUT'], note: 'synthetic', contested: null });
  assert.equal(withOutcome.lock.hash, L.lock.hash);
});

test('versions: a new version copies the inputs into an unlocked draft linked to the old hash', () => {
  const L = C.setOutcome(locked(), { layer: 1, result: 'no', sourceIds: ['SYN-OUT'], note: 'synthetic', contested: null });
  const v2 = C.newEpisodeVersion(L);
  assert.equal(v2.version, 2); assert.equal(v2.previousHash, L.lock.hash);
  assert.equal(v2.lock, null); assert.deepEqual(v2.outcomes, []);
  assert.deepEqual(v2.layers, L.layers);
  assert.throws(() => C.newEpisodeVersion(syntheticEpisode()), /Only a locked episode needs a new version/);
  assert.notEqual(C.episodeHash(C.lockEpisode(v2, NOW)), L.lock.hash, 'the new version locks to a different hash');
});

test('outcomes: rejected before locking; after locking they need a note, sources after the as-of date, and both sides if contested', () => {
  const draft = syntheticEpisode();
  const yes = { layer: 0, result: 'yes', sourceIds: ['SYN-OUT'], note: 'synthetic', contested: null };
  assert.throws(() => C.setOutcome(draft, yes), /Outcomes can only be entered after the episode is locked/);
  rejects({ ...clone(draft), outcomes: [yes] }, /outcomes can only be entered after the episode is locked/);
  const L = locked();
  assert.equal(C.setOutcome(L, yes).outcomes[0].result, 'yes');
  assert.throws(() => C.setOutcome(L, { ...yes, note: '' }), /an outcome needs a note/);
  assert.throws(() => C.setOutcome(L, { ...yes, sourceIds: [] }), /an outcome of yes or no needs a cited source/);
  assert.throws(() => C.setOutcome(L, { ...yes, sourceIds: ['SYN-IN'] }), /outcome source "SYN-IN" must be published after the as-of date 1845-06-30/);
  assert.ok(C.setOutcome(L, { ...yes, result: 'unknown', sourceIds: [] }), 'unknown may have no source');
  const contested = { layer: 2, result: 'contested', sourceIds: [], note: 'synthetic', contested: { forSourceIds: ['SYN-OUT'], againstSourceIds: ['SYN-OUT2'] } };
  assert.equal(C.setOutcome(L, contested).outcomes[0].result, 'contested');
  assert.throws(() => C.setOutcome(L, { ...contested, contested: { forSourceIds: ['SYN-OUT'], againstSourceIds: [] } }), /at least one citation on each side/);
  assert.throws(() => C.setOutcome(L, { ...contested, contested: null }), /a contested outcome needs citations on both sides/);
  assert.throws(() => C.setOutcome(L, { ...contested, contested: { forSourceIds: ['SYN-IN'], againstSourceIds: ['SYN-OUT'] } }), /must be published after the as-of date/);
  assert.throws(() => C.setOutcome(L, { ...yes, contested: { forSourceIds: ['SYN-OUT'], againstSourceIds: ['SYN-OUT2'] } }), /only a contested outcome has citations on both sides/);
  assert.throws(() => C.setOutcome(L, { ...yes, layer: 9 }), /outside 0 to 2/);
  // Setting an outcome again replaces it rather than adding a duplicate.
  const twice = C.setOutcome(C.setOutcome(L, yes), { ...yes, result: 'no' });
  assert.deepEqual(twice.outcomes.map(o => o.result), ['no']);
});

test('judgement-heavy: more than half of the filled inputs are judgement', () => {
  assert.equal(C.judgementShare(syntheticEpisode()).heavy, false);
  assert.equal(C.judgementShare(syntheticEpisode({ basis: 'judgement' })).heavy, true);
  const ep = clone(syntheticEpisode()), recs = C.allRecords(ep);
  recs.slice(0, Math.floor(recs.length / 2)).forEach(([, r]) => { r.basis = 'judgement'; r.rationale = 'synthetic'; });
  const half = C.judgementShare(C.validateEpisode(ep));
  assert.ok(half.share <= 0.5); assert.equal(half.heavy, false, 'exactly half or less is not heavy');
  assert.equal(C.judgementShare(C.templateEpisode()).heavy, false, 'an empty template is not heavy');
});

test('comparison: model verdict from the current model against the recorded outcome; counts and caveat, no hit rate', () => {
  const L = C.setOutcome(locked(), { layer: 0, result: 'no', sourceIds: ['SYN-OUT'], note: 'synthetic', contested: null });
  const c = C.compareEpisodes([L, syntheticEpisode()]);
  assert.equal(c.episodes, 1, 'only locked episodes count');
  assert.equal(c.layers, 3);
  assert.equal(c.caveat, 'Too few cases for statistical conclusions.');
  assert.equal(c.banner, 'Scored by someone who knew the outcome. Treat as a sanity check, not calibration.');
  assert.ok(!Object.keys(c).some(k => /hit|rate|accuracy|score/i.test(k)), 'no hit-rate headline');
  const m = C.episodeModelInputs(L);
  c.rows.forEach((r, i) => {
    const o = M.runLayer(m.layers[i], m.G);
    assert.equal(r.verdict, o.bin); assert.equal(r.npv, o.npv); assert.equal(r.modelSaysEarnsCost, o.npv >= 0);
  });
  assert.equal(c.rows[0].outcome, 'no'); assert.equal(c.rows[1].outcome, null);
  assert.equal(c.rows[0].versionDiffers, false);
});

test('model version: stored with each locked episode and flagged when it differs from the page', () => {
  const L = clone(locked());
  L.lock.modelVersion = M.MODEL_VERSION + 1; // the version is stored beside the hash, not inside it
  const ep = C.validateEpisode(L);
  const c = C.compareEpisodes([ep]);
  assert.ok(c.rows.every(r => r.versionDiffers && r.lockedModelVersion === M.MODEL_VERSION + 1));
});

test('import hardening: size, prototype keys, unknown fields, fresh objects, text kept as text', () => {
  const text = C.exportEpisodeText(locked());
  const r = C.importEpisodeText(text);
  assert.equal(r.ok, true, r.error);
  assert.match(C.importEpisodeText('{' + ' '.repeat(1024 * 1024 + 1)).error, /larger than 1 MB/);
  assert.match(C.importEpisodeText(text.replace('"name":', '"__proto__": {"x": 1}, "name":')).error, /forbidden key "__proto__"/);
  assert.match(C.importEpisodeText(text.replace('"citation":', '"constructor": 1, "citation":')).error, /forbidden key "constructor"/);
  assert.match(C.importEpisodeText(text.replace('"rationale":', '"prototype": 1, "rationale":')).error, /forbidden key "prototype"/);
  assert.match(C.importEpisodeText('not json').error, /not valid JSON/);
  const parsed = JSON.parse(text), again = C.importEpisodeText(text).episode;
  assert.notEqual(again, parsed); assert.notEqual(again.layers[0], r.episode.layers[0]);
  const walk = (v) => { if (v && typeof v === 'object') { if (!Array.isArray(v)) assert.equal(Object.getPrototypeOf(v), Object.prototype); Object.values(v).forEach(walk); } };
  walk(again);
  const html = clone(syntheticEpisode()); html.name = '<img src=x onerror=alert(1)>';
  assert.equal(C.importEpisodeText(JSON.stringify(html)).episode.name, '<img src=x onerror=alert(1)>', 'kept as text; the page renders it with textContent');
});

// Committed-file check: every episode file under a calibration folder (other than the template, the README and
// private/) must import strictly and have no numeric input without a cited source. Returns problems as text.
function committedFileProblems(dir){
  const problems = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(f => {
    const p = path.join(d, f.name), rel = path.relative(dir, p);
    if (f.isDirectory()) { if (rel !== 'private') walk(p); return; }
    if (rel === 'template.episode.json' || rel === 'README.md') return;
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

test('public repo rule: no committed file under calibration/ (other than the template) has a numeric input without a source', () => {
  assert.deepEqual(committedFileProblems(path.join(__dirname, '..', 'calibration')), []);
});

test('public repo rule: the committed-file check catches an uncited judgement, which is otherwise a valid episode', () => {
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-cal-'));
  try {
    fs.mkdirSync(path.join(tmp, 'private'));
    fs.copyFileSync(path.join(__dirname, '..', 'calibration', 'template.episode.json'), path.join(tmp, 'template.episode.json'));
    const ep = clone(syntheticEpisode());
    ep.layers[0].inputs.share = { ...ep.layers[0].inputs.share, basis: 'judgement', sourceIds: [], rationale: 'synthetic uncited judgement' };
    assert.equal(C.importEpisodeText(JSON.stringify(ep)).ok, true, 'valid as an episode');
    const cited = syntheticEpisode();
    fs.writeFileSync(path.join(tmp, 'cited.episode.json'), JSON.stringify(cited));
    fs.writeFileSync(path.join(tmp, 'private', 'ignored.json'), JSON.stringify(ep));
    assert.deepEqual(committedFileProblems(tmp), [], 'cited file passes; private/ is skipped');
    fs.writeFileSync(path.join(tmp, 'uncited.episode.json'), JSON.stringify(ep));
    assert.deepEqual(committedFileProblems(tmp), ['uncited.episode.json: numeric inputs without a source: layer 1 share']);
    fs.writeFileSync(path.join(tmp, 'x.private.json'), JSON.stringify(ep));
    assert.ok(committedFileProblems(tmp).some(p => /x\.private\.json: a \.private\.json file is in the folder/.test(p)));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('uncited judgement: labelled, counted toward judgement-heavy, allowed when locking, and exported as .private.json', () => {
  const ep = clone(syntheticEpisode());
  const recs = C.allRecords(ep);
  // Make just over half of the inputs uncited judgements.
  const n = Math.floor(recs.length / 2) + 1;
  recs.slice(0, n).forEach(([, r]) => { r.basis = 'judgement'; r.sourceIds = []; r.rationale = 'synthetic'; });
  const v = C.validateEpisode(ep);
  assert.equal(C.isUncitedJudgement(C.allRecords(v)[0][1]), true);
  assert.equal(C.isUncitedJudgement(C.allRecords(v)[n][1]), false, 'a cited sourced input is not labelled');
  const js = C.judgementShare(v);
  assert.equal(js.uncited, n); assert.equal(js.judgement, n); assert.equal(js.heavy, true);
  assert.throws(() => C.lockEpisode(v, NOW), /Needs acknowledgement/);
  const L = C.lockEpisode(v, NOW, { acknowledged: true });
  assert.ok(L.lock, 'locking is allowed with uncited judgement, after acknowledging');
  const f = C.exportEpisodeFile(L);
  assert.equal(f.isPrivate, true);
  assert.equal(f.filename, 'synthetic-test-v1.private.json');
  assert.match(f.warning, new RegExp(n + ' inputs are uncited, so this file is named \\.private\\.json\\. Keep it out of the repository'));
  assert.equal(C.importEpisodeText(f.text).ok, true, 'the private file still imports');
  const cited = C.exportEpisodeFile(syntheticEpisode());
  assert.equal(cited.isPrivate, false); assert.equal(cited.filename, 'synthetic-test-v1.episode.json'); assert.equal(cited.warning, '');
  // A cited judgement is a judgement but not uncited.
  const cj = clone(syntheticEpisode()); C.allRecords(cj)[0][1].basis = 'judgement'; C.allRecords(cj)[0][1].rationale = 'synthetic';
  assert.deepEqual([C.judgementShare(C.validateEpisode(cj)).judgement, C.judgementShare(C.validateEpisode(cj)).uncited], [1, 0]);
});

test('gitignore keeps private calibration files out of the repository', () => {
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8').split('\n').map(l => l.trim());
  assert.ok(gi.includes('*.private.json'));
  assert.ok(gi.includes('calibration/private/'));
});

/* ---------- Lock-time acknowledgement ---------- */
const judgementEp = (n, cited) => {
  const ep = clone(syntheticEpisode());
  C.allRecords(ep).slice(0, n).forEach(([, r]) => { r.basis = 'judgement'; r.rationale = 'synthetic'; if (!cited) r.sourceIds = []; });
  return C.validateEpisode(ep);
};

test('acknowledgement: needed when more than half the filled inputs are judgement or any input is uncited, with the counts in the message', () => {
  const total = C.allRecords(syntheticEpisode()).length, half = Math.floor(total / 2);
  assert.equal(C.lockAcknowledgement(syntheticEpisode()).needed, false);
  assert.equal(C.lockAcknowledgement(judgementEp(half, true)).needed, false, 'half or less, all cited: not needed');
  const heavy = C.lockAcknowledgement(judgementEp(half + 1, true));
  assert.equal(heavy.needed, true);
  assert.equal(heavy.message, 'Before locking: ' + (half + 1) + ' of ' + total + ' filled inputs are judgement. Lock anyway, or cancel and add sources?');
  const one = C.lockAcknowledgement(judgementEp(1, false));
  assert.equal(one.needed, true, 'a single uncited input is enough');
  assert.equal(one.message, 'Before locking: 1 input is uncited. Lock anyway, or cancel and add sources?');
  const both = C.lockAcknowledgement(judgementEp(half + 2, false));
  assert.match(both.message, new RegExp((half + 2) + ' of ' + total + ' filled inputs are judgement, and ' + (half + 2) + ' inputs are uncited'));
});

test('acknowledgement: never blocks locking, and is recorded with the counts in the lock and the hash', () => {
  const ep = judgementEp(3, false), total = C.allRecords(ep).length;
  assert.throws(() => C.lockEpisode(ep, NOW), /Needs acknowledgement: Before locking: 3 inputs are uncited/);
  const L = C.lockEpisode(ep, NOW, { acknowledged: true });
  assert.equal(L.lock.acknowledged, true);
  assert.deepEqual(L.lock.counts, { judgement: 3, uncited: 3, total });
  assert.equal(L.lock.hash, C.episodeHash(L, { counts: L.lock.counts, acknowledged: true }));
  assert.equal(C.importEpisodeText(C.exportEpisodeText(L)).ok, true, 'round trip');
  // An acknowledgement passed when none is needed is not recorded as one.
  assert.equal(C.lockEpisode(syntheticEpisode(), NOW, { acknowledged: true }).lock.acknowledged, false);
});

test('acknowledgement: the hash changes when the counts or the acknowledgement change; tampering is rejected', () => {
  const L = C.lockEpisode(judgementEp(3, false), NOW, { acknowledged: true });
  const base = C.episodeHash(L, { counts: L.lock.counts, acknowledged: true });
  for (const k of ['judgement', 'uncited', 'total']) assert.notEqual(C.episodeHash(L, { counts: { ...L.lock.counts, [k]: L.lock.counts[k] + 1 }, acknowledged: true }), base, k);
  assert.notEqual(C.episodeHash(L, { counts: L.lock.counts, acknowledged: false }), base);
  assert.notEqual(C.episodeHash(L), base, 'scheme 1 (no counts) differs from scheme 2');
  const t1 = clone(L); t1.lock.counts.uncited = 0; rejects(t1, /the recorded counts do not match the inputs/);
  const t2 = clone(L); t2.lock.acknowledged = false; rejects(t2, /needed an acknowledgement at lock time and has none/);
  const t3 = clone(C.lockEpisode(syntheticEpisode(), NOW)); t3.lock.acknowledged = true; rejects(t3, /an acknowledgement is recorded but none was needed/);
  // Changing an input's basis after locking changes the counts and breaks the lock.
  const t4 = clone(L); C.allRecords(t4)[0][1].sourceIds = ['SYN-IN']; rejects(t4, /recorded counts do not match|do not match the lock hash/);
});

test('schema 1 locks still import, validate under hash scheme 1, and stay tamper-evident', () => {
  const ep = clone(syntheticEpisode());
  ep.schemaVersion = 1;
  ep.lock = { hash: C.episodeHash(ep), lockedAt: NOW.toISOString(), modelVersion: M.MODEL_VERSION }; // scheme 1: no counts
  const r = C.importEpisodeText(JSON.stringify(ep));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.episode.schemaVersion, 2);
  assert.deepEqual([r.episode.lock.hashScheme, r.episode.lock.counts, r.episode.lock.acknowledged], [1, null, null]);
  assert.equal(C.importEpisodeText(C.exportEpisodeText(r.episode)).ok, true, 'still valid after re-saving as schema 2');
  const t = clone(ep); t.layers[0].inputs.share.value = 26;
  assert.match(C.importEpisodeText(JSON.stringify(t)).error, /do not match the lock hash/);
  const b = C.basisFromLock(r.episode);
  assert.equal(b.recorded, false, 'counts computed, not recorded');
  assert.deepEqual([b.judgement, b.uncited], [0, 0]);
});

test('comparison: every row carries the judgement share and uncited count from the lock record', () => {
  const L = C.lockEpisode(judgementEp(4, false), NOW, { acknowledged: true });
  const c = C.compareEpisodes([L]);
  c.rows.forEach(r => {
    assert.deepEqual([r.basis.judgement, r.basis.uncited, r.basis.total], [L.lock.counts.judgement, L.lock.counts.uncited, L.lock.counts.total]);
    assert.equal(r.basis.share, L.lock.counts.judgement / L.lock.counts.total);
    assert.equal(r.basis.acknowledged, true); assert.equal(r.basis.recorded, true);
  });
});
