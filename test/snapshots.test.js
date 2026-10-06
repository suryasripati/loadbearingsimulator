const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/snapshots.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');

const baseG = () => ({ ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, capexModel: D.DEFAULT_CAPEX, phases: D.DEFAULT_PHASES.slice() });
const baseLayers = () => D.DEFAULT_LAYERS.map(L => ({ ...L, driftP: L.driftP.slice(), marginP: L.marginP.slice() }));
const NOW = new Date('2026-10-05T12:00:00.000Z');
const snap = (over = {}) => S.makeSnapshot({ name: 'Base view', note: 'First pass', G: baseG(), layers: baseLayers(), now: NOW, ...over });
// What the page keeps in local storage (allocations included; they never leave the browser).
const fileOf = (list) => JSON.stringify({ snapshots: JSON.parse(JSON.stringify(list)) }, null, 2);
const reject = (text, pattern) => {
  const r = S.snapReadStoredText(text);
  assert.equal(r.ok, false, 'expected rejection');
  assert.match(r.error, pattern);
};
const mutate = (fn, opts) => { const f = JSON.parse(fileOf([snap()], opts)); fn(f); return JSON.stringify(f); };

test('snapshot holds the model version, all inputs and per-layer outputs equal to direct model calls', () => {
  const s = snap();
  assert.equal(s.modelVersion, M.MODEL_VERSION);
  assert.equal(s.created, NOW.toISOString());
  assert.deepEqual(Object.keys(s.inputs.G).sort(), ['capexModel', 'disc', 'entry', 'entryDef', 'mid', 'mult', 'phases', 'pool', 'premium', 'rd', 'speed', 'tv', 'tvGrowth', 'tvMode']);
  s.inputs.layers.forEach((L, i) => {
    const o = M.runLayer(L, s.inputs.G), f = M.verdictFragility(L, s.inputs.G), out = s.outputs[i];
    assert.equal(out.npv, o.npv); assert.equal(out.bin, o.bin); assert.deepEqual(out.flags, o.flags);
    assert.equal(out.breakEven, o.breakEven);
    assert.deepEqual(out.fragility, { n: f.n, m: f.m, worse: f.worse, better: f.better, mixed: f.mixed });
    assert.equal(L.alloc, D.DEFAULT_LAYERS[i].alloc, 'allocations are kept in the browser copy');
  });
});

test('serialise and deserialise round trip (with allocations ticked)', () => {
  const s = snap({ kill: S.snapBlankKill().map((k, i) => ({ ...k, text: 'Revise if utilisation stays low', metric: 'utilisation', direction: 'below', threshold: 0.6, reviewBy: '2027-03-31', status: i ? '' : 'unknown' })) });
  const r = S.snapReadStoredText(fileOf([s], { includeAllocations: true }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.snapshots, [JSON.parse(JSON.stringify(s))]);
});

test('stored snapshots: schema version and model version are checked, and the message says which is incompatible, and says which is incompatible', () => {
  reject(mutate(f => { f.snapshots[0].schemaVersion = 9; }), /Snapshot 1: schema version 9 is not compatible/);
  reject(mutate(f => { f.snapshots[0].modelVersion = M.MODEL_VERSION + 1; }), new RegExp('Snapshot 1: model version ' + (M.MODEL_VERSION + 1) + ' is not compatible: it is newer than this page'));
  assert.equal(snap().schemaVersion, S.SNAP_SCHEMA_VERSION);
});

test('import rejects NaN and other non-finite numbers', () => {
  reject(fileOf([snap()]).replace('"disc": 10', '"disc": NaN'), /not valid JSON/);
  reject(mutate(f => { f.snapshots[0].inputs.G.disc = '10'; }), /setting disc: expected a finite number/);
  reject(mutate(f => { f.snapshots[0].outputs[0].npv = null; }), /output 1 npv: expected a finite number/);
});

test('import rejects out-of-range values', () => {
  reject(mutate(f => { f.snapshots[0].inputs.G.disc = 99; }), /setting disc: value 99 is outside 5 to 20/);
  reject(mutate(f => { f.snapshots[0].inputs.layers[2].passThrough = 1.5; }), /layer 3 passThrough: value 1.5 is outside 0 to 1/);
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].driftP[1] = -50; }), /layer 1 driftP: value -50 is outside/);
  reject(mutate(f => { f.snapshots[0].inputs.G.entry = 2.5; }), /setting entry: expected a whole number/);
  reject(mutate(f => { f.snapshots[0].kill[0].reviewBy = '31/03/2027'; }), /reviewBy: expected a date/);
});

test('import rejects unknown fields, including prototype keys', () => {
  reject(mutate(f => { f.extra = 1; }), /Stored data: unknown field "extra"/);
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].secret = 1; }), /layer 1: unknown field "secret"/);
  reject(mutate(f => { f.snapshots[0].kill[0].extra = 'x'; }), /kill criteria 1: unknown field "extra"/);
});

test('import rejects files over 1 MB', () => {
  const big = mutate(f => { f.snapshots[0].note = 'x'.repeat(10); }).replace('"x', '"' + 'y'.repeat(S.SNAP_MAX_BYTES));
  reject(big, /larger than 1 MB/);
});

test('import keeps HTML in notes as plain text (it is rendered with textContent, never as HTML)', () => {
  const html = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const r = S.snapReadStoredText(mutate(f => { f.snapshots[0].note = html; f.snapshots[0].kill[0].text = html; }));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.snapshots[0].note, html);
  assert.equal(r.snapshots[0].kill[0].text, html);
});

test('diff lists exactly the changed inputs', () => {
  const a = snap();
  const G = baseG(); G.disc = 12; G.capexModel = 'vintage'; G.phases = [4, 10];
  const layers = baseLayers(); layers[1].offset = -2; layers[2].driftP[2] = -5; layers[0].alloc = 99;
  const b = S.makeSnapshot({ name: 'Later', G, layers, now: NOW });
  const diff = S.diffInputs(a.inputs, b.inputs);
  assert.deepEqual(diff.map(d => d.path).sort(), ['layer dc.offset', 'layer hw.alloc', 'layer ml.driftP[2]', 'settings.capexModel', 'settings.disc', 'settings.phases[0]'].sort());
  assert.deepEqual(diff.find(d => d.path === 'settings.disc'), { path: 'settings.disc', before: 10, after: 12 });
  assert.deepEqual(S.diffInputs(a.inputs, a.inputs), []);
  // Allocations are only compared when both sides hold them.
  const noAlloc = JSON.parse(JSON.stringify(b)); noAlloc.inputs.layers.forEach(L => { delete L.alloc; });
  assert.ok(!S.diffInputs(a.inputs, noAlloc.inputs).some(d => /alloc/.test(d.path)));
});

test('verdict-change detection equals direct model calls', () => {
  const a = snap();
  const layers = baseLayers(); layers.forEach((L, i) => { L.offset = D.LEAD_LAG_EXAMPLE[i]; });
  const b = S.makeSnapshot({ name: 'Lead/lag', G: baseG(), layers, now: NOW });
  const c = S.compareSnapshots(a, b);
  assert.equal(c.versionMismatch, false);
  c.layers.forEach((x, i) => {
    const before = M.runLayer(a.inputs.layers[i], a.inputs.G), after = M.runLayer(b.inputs.layers[i], b.inputs.G);
    assert.equal(x.verdictChanged, before.bin !== after.bin, x.id);
    assert.equal(x.before.bin, before.bin); assert.equal(x.after.bin, after.bin);
    assert.equal(x.npvChange, after.npv - before.npv);
  });
  assert.ok(c.layers.some(x => x.verdictChanged), 'the lead/lag example moves at least one verdict');
});

test('model-version mismatch is flagged, and both sides are recomputed under the current model', () => {
  const a = snap(), b = snap();
  const old = JSON.parse(JSON.stringify(a));
  old.modelVersion = M.MODEL_VERSION + 1; // a version the current model does not have
  old.outputs[0].npv = 123456; old.outputs[0].bin = 'Speculative';
  const c = S.compareSnapshots(old, b);
  assert.equal(c.versionMismatch, true);
  assert.equal(c.versions.before, old.modelVersion); assert.equal(c.versions.current, M.MODEL_VERSION);
  assert.equal(c.layers[0].storedBefore.npv, 123456, 'stored output kept for display');
  assert.equal(c.layers[0].before.npv, M.runLayer(old.inputs.layers[0], old.inputs.G).npv, 'recomputed under the current model');
  assert.equal(S.compareSnapshots(a, b).versionMismatch, false);
});

test('criterion states: overdue, reviewed (no), triggered (yes), resolved by a later snapshot, open', () => {
  const k = (o) => ({ reviewBy: '', status: '', answeredAt: '', ...o });
  const st = (o, today = '2026-10-05', later = false) => S.snapCriterionState(k(o), today, later).state;
  // Unanswered or "unknown" past the review-by date: overdue. Due today is not overdue.
  assert.equal(st({ reviewBy: '2026-10-04' }), 'overdue');
  assert.equal(st({ reviewBy: '2026-10-04', status: 'unknown', answeredAt: '2026-10-01T09:00:00.000Z' }), 'overdue');
  assert.equal(st({ reviewBy: '2026-10-05' }), 'open');
  assert.equal(st({ reviewBy: '' }), 'open');
  // "No" clears the badge; a next review-by date later than the answer makes it overdue again once passed.
  assert.equal(st({ reviewBy: '2026-10-01', status: 'no', answeredAt: '2026-10-03T09:00:00.000Z' }), 'reviewed');
  assert.equal(st({ reviewBy: '2026-10-04', status: 'no', answeredAt: '2026-10-03T09:00:00.000Z' }), 'overdue');
  assert.equal(st({ reviewBy: '2026-10-09', status: 'no', answeredAt: '2026-10-03T09:00:00.000Z' }), 'reviewed');
  // "Yes": triggered until a later snapshot is saved (or the criterion is reset to blank).
  assert.equal(st({ reviewBy: '2026-01-01', status: 'yes', answeredAt: '2026-10-03T09:00:00.000Z' }), 'triggered');
  assert.equal(st({ status: 'yes', answeredAt: '2026-10-03T09:00:00.000Z' }, '2026-10-05', true), 'resolved');
  assert.equal(S.snapIsOverdue(k({ reviewBy: '2026-01-01', status: 'yes', answeredAt: '2026-10-03T09:00:00.000Z' }), '2026-10-05'), false);
  // A later snapshot means one created after the answer.
  const crit = { answeredAt: '2026-10-03T09:00:00.000Z' };
  assert.equal(S.snapLaterSaved(crit, [{ created: '2026-10-02T09:00:00.000Z' }]), false);
  assert.equal(S.snapLaterSaved(crit, [{ created: '2026-10-03T09:00:01.000Z' }]), true);
  assert.equal(S.snapLaterSaved({ answeredAt: '' }, [{ created: '2030-01-01T00:00:00.000Z' }]), false);
});

test('criterion states: time zones use local calendar dates for both today and the answer date', () => {
  const saved = process.env.TZ;
  try {
    // Answered at 23:30 UTC on 4 October: still 4 October in Los Angeles, already 5 October in Auckland.
    const answer = { reviewBy: '2026-10-05', status: 'no', answeredAt: '2026-10-04T23:30:00.000Z' };
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(S.snapTodayLocal(new Date('2026-10-04T23:30:00.000Z')), '2026-10-04');
    assert.equal(S.snapCriterionState(answer, '2026-10-06', false).state, 'overdue', 'LA: next review (5 Oct) is after the answer day (4 Oct) and has passed');
    assert.equal(S.snapCriterionState(answer, '2026-10-05', false).state, 'reviewed', 'LA: due today is not overdue');
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(S.snapTodayLocal(new Date('2026-10-04T23:30:00.000Z')), '2026-10-05');
    assert.equal(S.snapCriterionState(answer, '2026-10-06', false).state, 'reviewed', 'Auckland: answered on 5 Oct, so a 5 Oct review date is already met');
    // A late-evening local time keeps the local date, whatever the UTC date is.
    process.env.TZ = 'America/Los_Angeles';
    const lateLocal = new Date(2026, 9, 4, 23, 30);
    assert.equal(lateLocal.toISOString().slice(0, 10), '2026-10-05', 'UTC has already moved on');
    assert.equal(S.snapTodayLocal(lateLocal), '2026-10-04');
    assert.equal(S.snapIsOverdue({ reviewBy: '2026-10-04', status: '', answeredAt: '' }, S.snapTodayLocal(lateLocal)), false);
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

test('schema 1 snapshots (no answer date, no response) still import, with a blank answer date and no response', () => {
  const f = JSON.parse(fileOf([snap()]));
  f.snapshots[0].schemaVersion = 1;
  f.snapshots[0].kill.forEach(k => { delete k.answeredAt; });
  delete f.snapshots[0].response; delete f.snapshots[0].caseId; delete f.snapshots[0].inputs.G.tvMode; delete f.snapshots[0].inputs.G.tvGrowth; f.snapshots[0].inputs.layers.forEach(L => { delete L.name; });
  const r = S.snapReadStoredText(JSON.stringify(f));
  assert.equal(r.ok, true, r.error);
  assert.ok(r.snapshots[0].kill.every(k => k.answeredAt === ''));
  assert.equal(r.snapshots[0].response, null);
  assert.equal(r.snapshots[0].schemaVersion, S.SNAP_SCHEMA_VERSION, 'stored in the current schema');
  // In schema 2 the answer date is required and must be ISO UTC.
  reject(mutate(f2 => { delete f2.snapshots[0].kill[0].answeredAt; }), /missing field "answeredAt"/);
  reject(mutate(f2 => { f2.snapshots[0].kill[0].answeredAt = '2026-10-05'; }), /answeredAt: expected an ISO date and time in UTC/);
});

test('load into simulator: loading then saving reproduces the inputs', () => {
  const G = baseG(); G.disc = 12.5; G.entryDef = 'B'; G.capexModel = 'vintage'; G.phases = [3, 11];
  const layers = baseLayers(); layers.forEach((L, i) => { L.offset = D.LEAD_LAG_EXAMPLE[i]; L.unitCostDecline = D.UCD_EXAMPLE[i]; L.alloc = 10 + i; });
  layers[2].driftP = [-1, -4, -6];
  const original = S.makeSnapshot({ name: 'Then', G, layers, now: NOW,
    kill: S.snapBlankKill().map(k => ({ ...k, text: 'revise ' + k.id, reviewBy: '2027-01-31', status: 'yes', answeredAt: '2026-10-01T00:00:00.000Z' })) });
  const plan = S.snapPrepareLoad(original, baseLayers());
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.warning, '');
  const again = S.makeSnapshot({ name: 'Again', G: plan.state.G, layers: plan.state.layers, kill: plan.state.draftKill, now: NOW });
  assert.deepEqual(again.inputs, original.inputs, 'inputs round trip exactly, allocations included');
  assert.deepEqual(again.outputs, original.outputs, 'outputs recompute to the same values');
  // The form gets the criteria but not the answers.
  plan.state.draftKill.forEach(k => { assert.match(k.text, /^revise /); assert.equal(k.status, ''); assert.equal(k.answeredAt, ''); });
});

test('load into simulator: allocations are restored only if the snapshot has them', () => {
  const s = JSON.parse(JSON.stringify(snap())); s.inputs.layers.forEach(L => { delete L.alloc; }); // a snapshot without allocations
  const current = baseLayers().map((L, i) => ({ ...L, alloc: 70 + i }));
  const plan = S.snapPrepareLoad(s, current);
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.hasAllocations, false);
  plan.state.layers.forEach((L, i) => assert.equal(L.alloc, 70 + i, 'current allocations kept'));
});

test('load into simulator: a model-version mismatch warns that results will recompute', () => {
  const s = snap();
  const plan = S.snapPrepareLoad(s, baseLayers(), M.MODEL_VERSION + 1); // as if the page were one version newer
  assert.equal(plan.ok, true, plan.error);
  assert.match(plan.warning, new RegExp('saved under model version ' + M.MODEL_VERSION + '; this page uses version ' + (M.MODEL_VERSION + 1) + '.*results will recompute'));
});

test('load into simulator: a malformed snapshot is rejected with a reason and returns no state', () => {
  const bad = JSON.parse(JSON.stringify(snap())); bad.inputs.G.disc = 99;
  const plan = S.snapPrepareLoad(bad, baseLayers());
  assert.equal(plan.ok, false);
  assert.match(plan.error, /setting disc: value 99 is outside 5 to 20/);
  assert.equal(plan.state, undefined);
  const proto = JSON.parse(JSON.stringify(snap())); proto.inputs.layers[0] = JSON.parse('{"__proto__": {"x": 1}}');
  assert.equal(S.snapPrepareLoad(proto, baseLayers()).ok, false);
});

test('fragility direction: a synthetic case forces "mixed", and counts add up to the flips', () => {
  // Present value turns positive (better) while a fragility flag is added (worse) at the same time.
  assert.equal(M.flipDirection({ npv: -5, flags: [] }, { npv: 5, flags: ['tail'] }), 'mixed');
  assert.equal(M.flipDirection({ npv: 5, flags: ['life'] }, { npv: -5, flags: [] }), 'mixed');
  assert.equal(M.flipDirection({ npv: 5, flags: [] }, { npv: -5, flags: [] }), 'worse');
  assert.equal(M.flipDirection({ npv: 5, flags: [] }, { npv: 5, flags: ['debt'] }), 'worse');
  assert.equal(M.flipDirection({ npv: -5, flags: [] }, { npv: 5, flags: [] }), 'better');
  assert.equal(M.flipDirection({ npv: 5, flags: ['life'] }, { npv: 5, flags: [] }), 'better');
  const g = baseG();
  for (const L of D.DEFAULT_LAYERS) {
    const f = M.verdictFragility(L, g);
    assert.equal(f.worse + f.better + f.mixed, f.n);
  }
});

test('import hardening: rejects __proto__, constructor and prototype keys anywhere, before any other check', () => {
  const text = fileOf([snap()]);
  reject(text.replace('"name": "Base view"', '"__proto__": {"polluted": true}, "name": "Base view"'), /forbidden key "__proto__"/);
  reject(text.replace('"disc": 10', '"constructor": {"prototype": {"x": 1}}, "disc": 10'), /forbidden key "constructor"/);
  reject(text.replace('"text": ""', '"prototype": 1, "text": ""'), /forbidden key "prototype"/);
  reject('{"__proto__": {"polluted": true}}', /forbidden key "__proto__"/);
  assert.equal({}.polluted, undefined, 'Object.prototype untouched');
  assert.equal(Object.prototype.polluted, undefined);
});

test('import hardening: checks size before parsing', () => {
  // Over-size text that is not even JSON: the size message wins, so parsing never ran.
  reject('{' + ' '.repeat(S.SNAP_MAX_BYTES + 1), /larger than 1 MB/);
  // Multi-byte characters count as bytes, not characters.
  reject('"' + '\u00e9'.repeat(Math.ceil(S.SNAP_MAX_BYTES / 2) + 1) + '"', /larger than 1 MB/);
});

test('import hardening: returns fresh plain objects with whitelisted fields only, never the parsed objects', () => {
  const text = fileOf([snap()], { includeAllocations: true });
  const parsed = JSON.parse(text);
  const r = S.snapReadStoredText(text);
  assert.equal(r.ok, true, r.error);
  const s0 = r.snapshots[0];
  const walk = (v) => { if (v && typeof v === 'object') { if (!Array.isArray(v)) assert.equal(Object.getPrototypeOf(v), Object.prototype); Object.values(v).forEach(walk); } };
  walk(s0);
  assert.notEqual(s0, parsed.snapshots[0]);
  assert.deepEqual(Object.keys(s0).sort(), ['caseId', 'created', 'inputs', 'kill', 'modelVersion', 'name', 'note', 'outputs', 'response', 'schemaVersion']);
  assert.deepEqual(Object.keys(s0.inputs.layers[0]).sort(), ['alloc', 'buildStart', 'buildYears', 'capex', 'debt', 'driftP', 'evidence', 'id', 'life', 'marginP', 'name', 'offset', 'passThrough', 'share', 'steepness', 'unitCostDecline']);
  // Importing twice gives independent objects (nothing is merged or shared).
  const r2 = S.snapReadStoredText(text);
  r2.snapshots[0].inputs.layers[0].share = 99;
  assert.notEqual(r.snapshots[0].inputs.layers[0].share, 99);
});

test('import caps the number of snapshots per file', () => {
  const many = Array.from({ length: S.SNAP_MAX_COUNT + 1 }, () => snap());
  reject(fileOf(many), new RegExp('more than ' + S.SNAP_MAX_COUNT + ' snapshots'));
  assert.equal(S.snapReadStoredText(fileOf(many.slice(0, S.SNAP_MAX_COUNT))).ok, true);
});

test('dates: created is ISO UTC; overdue compares local calendar dates, so a late-evening save cannot flip the badge', () => {
  assert.match(snap().created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  reject(mutate(f => { f.snapshots[0].created = '2026-10-05T12:00:00+05:30'; }), /expected an ISO date and time in UTC/);
  // 23:30 local on 4 October is still the local calendar day 4 October, whatever the UTC date is.
  const late = new Date(2026, 9, 4, 23, 30);
  assert.equal(S.snapTodayLocal(late), '2026-10-04');
  assert.equal(S.snapIsOverdue({ reviewBy: '2026-10-04', status: '' }, S.snapTodayLocal(late)), false);
  assert.equal(S.snapIsOverdue({ reviewBy: '2026-10-04', status: '' }, S.snapTodayLocal(new Date(2026, 9, 5, 0, 30))), true);
});

/* ---------- Trigger response (schema 3) ---------- */
const trigKill = (answeredAt) => S.snapBlankKill().map((k, i) => (i === 1 ? { ...k, text: 'revise dc', status: 'yes', answeredAt } : k));

test('trigger response: open triggers are listed newest first and close once a later snapshot is saved', () => {
  const a = snap({ name: 'A', now: new Date('2026-09-01T10:00:00.000Z'), kill: trigKill('2026-09-02T10:00:00.000Z') });
  const b = snap({ name: 'B', now: new Date('2026-09-03T10:00:00.000Z'), kill: S.snapBlankKill().map((k, i) => (i === 0 ? { ...k, status: 'yes', answeredAt: '2026-09-04T10:00:00.000Z' } : k)) });
  const t = S.snapTriggeredList([a, b]);
  assert.deepEqual(t.map(x => [x.name, x.layerId]), [['B', 'hw']], 'A was answered before B was saved, so B resolves A');
  const c = snap({ name: 'C', now: new Date('2026-09-05T10:00:00.000Z') });
  assert.deepEqual(S.snapTriggeredList([a, b, c]), []);
});

test('trigger response: "revised" lists exactly the changed inputs (never allocations); "kept" needs a reason and lists none', () => {
  const from = snap({ kill: trigKill('2026-10-05T12:00:00.000Z') });
  const G = baseG(); G.disc = 12;
  const layers = baseLayers(); layers[1].offset = -2; layers[0].alloc = 77;
  const to = S.snapInputs(G, layers);
  const trig = S.snapTriggeredList([from]);
  const rev = S.snapMakeResponse('revised', '', trig, from.inputs, to);
  assert.deepEqual(rev.changedInputs.map(c => c.path).sort(), ['layer dc.offset', 'settings.disc']);
  assert.deepEqual(rev.changedInputs.map(c => c.path).sort(), S.diffInputs(from.inputs, to).map(d => d.path).filter(p => !/alloc/.test(p)).sort(), 'same as the compare logic, minus allocations');
  const kept = S.snapMakeResponse('kept', '  Evidence not strong enough  ', trig, from.inputs, to);
  assert.deepEqual(kept.changedInputs, []);
  assert.equal(kept.reason, 'Evidence not strong enough');
  // Round trip through export and strict import.
  const later = snap({ name: 'Later', now: new Date('2026-10-06T12:00:00.000Z'), response: rev });
  const r = S.snapReadStoredText(fileOf([from, later]));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.snapshots[1].response, JSON.parse(JSON.stringify(rev)));
  assert.equal(r.snapshots[0].response, null);
});

test('trigger response: strict import rejects bad responses', () => {
  const rev = { kind: 'revised', reason: '', triggers: [{ name: 'A', created: '2026-10-05T12:00:00.000Z', layerId: 'dc' }], changedInputs: [{ path: 'settings.disc', before: 10, after: 12 }] };
  const withResp = (r) => fileOf([snap({ response: r })]);
  assert.equal(S.snapReadStoredText(withResp(rev)).ok, true);
  reject(withResp({ ...rev, kind: 'kept', changedInputs: [] }), /"kept my view" needs a reason/);
  reject(withResp({ ...rev, kind: 'kept', reason: 'x' }), /"kept my view" cannot list changed inputs/);
  reject(withResp({ ...rev, kind: 'ignored' }), /response kind: unexpected value/);
  reject(withResp({ ...rev, changedInputs: [{ path: 'layer hw.alloc', before: 1, after: 2 }] }), /unexpected input name/);
  reject(withResp({ ...rev, changedInputs: [{ path: '<img src=x>', before: 1, after: 2 }] }), /unexpected input name/);
  reject(withResp({ ...rev, triggers: [] }), /expected 1 to 250 triggers/);
  reject(withResp({ ...rev, triggers: [{ name: 'A', created: '2026-10-05T12:00:00.000Z', layerId: 'zz' }] }), /layerId: unexpected value/);
  reject(mutate(f => { f.snapshots[0].response = { ...rev, extra: 1 }; }), /response: unknown field "extra"/);
});

test('trigger response: schema 2 snapshots migrate with no response', () => {
  const f = JSON.parse(fileOf([snap()]));
  f.snapshots[0].schemaVersion = 2; delete f.snapshots[0].response;
  delete f.snapshots[0].caseId; delete f.snapshots[0].inputs.G.tvMode; delete f.snapshots[0].inputs.G.tvGrowth; f.snapshots[0].inputs.layers.forEach(L => { delete L.name; });
  const r = S.snapReadStoredText(JSON.stringify(f));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.snapshots[0].response, null);
  assert.equal(r.snapshots[0].schemaVersion, S.SNAP_SCHEMA_VERSION);
  // A schema 2 file must not carry a response field.
  const g = JSON.parse(fileOf([snap()])); g.snapshots[0].schemaVersion = 2;
  delete g.snapshots[0].caseId; delete g.snapshots[0].inputs.G.tvMode; delete g.snapshots[0].inputs.G.tvGrowth; g.snapshots[0].inputs.layers.forEach(L => { delete L.name; });
  reject(JSON.stringify(g), /unknown field "response"/);
});

/* ---------- Schema 4: cases and 1 to 6 layers ---------- */
const C = require('../src/cases.js');
const fixture = (n) => C.validateCase(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'support', 'cases', 'synthetic-' + n + '.case.json'), 'utf8')));

test('schema 4: a case snapshot records the case id and its own layers (1, 3 or 6), and round-trips', () => {
  for (const n of [1, 3, 6]) {
    const c = fixture(n), st = C.caseState(c, 'base');
    const s = S.makeSnapshot({ name: 'Case view', G: { ...st.G }, layers: st.layers, caseId: c.id, now: NOW });
    assert.equal(s.caseId, c.id);
    assert.equal(s.inputs.layers.length, n); assert.equal(s.kill.length, n); assert.equal(s.outputs.length, n);
    assert.deepEqual(s.inputs.layers.map(L => L.name), c.layers.map(L => L.name));
    const r = S.snapReadStoredText(fileOf([s], { includeAllocations: true }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.snapshots[0], JSON.parse(JSON.stringify(s)));
  }
  // Your own scenario stays the five default layers with caseId null.
  assert.equal(snap().caseId, null);
  reject(mutate(f => { f.snapshots[0].inputs.layers.pop(); }), /expected 5 layers/);
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].id = 'other'; }), /expected layer id "hw"/);
  reject(mutate(f => { f.snapshots[0].caseId = 'Bad Id'; }), /unexpected case id/);
  // Layer names are drawn into the page, so an imported file cannot carry markup in them.
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].name = '<img src=x onerror=alert(1)>'; }), /name: must not be empty or contain/);
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].name = ' '; }), /name: must not be empty or contain/);
});

test('schema 4: views of different stacks cannot be compared; loading a case snapshot carries its case id and layers', () => {
  const c = fixture(3), st = C.caseState(c, 'base');
  const a = S.makeSnapshot({ name: 'Mine', G: baseG(), layers: baseLayers(), now: NOW });
  const b = S.makeSnapshot({ name: 'Case', G: { ...st.G }, layers: st.layers, caseId: c.id, now: NOW });
  assert.equal(S.snapSameStack(a, b), false);
  assert.throws(() => S.compareSnapshots(a, b), /different stacks \(your own scenario and case “synthetic-3-layer”\)/);
  assert.equal(S.compareSnapshots(b, b).layers.length, 3);
  const plan = S.snapPrepareLoad(b, baseLayers());
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.caseId, c.id);
  assert.deepEqual(plan.state.layers.map(L => L.id), c.layers.map(L => L.id));
  assert.equal(plan.state.draftKill.length, 3);
});

test('schema 5: terminal-value mode and growth are saved and checked; older schemas load as "multiple" with growth 0', () => {
  const s = snap({ G: { ...baseG(), tvMode: 'perpetuity', tvGrowth: 2 } });
  assert.deepEqual([s.inputs.G.tvMode, s.inputs.G.tvGrowth], ['perpetuity', 2]);
  const r = S.snapReadStoredText(fileOf([s]));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.snapshots[0].inputs.G.tvMode, r.snapshots[0].inputs.G.tvGrowth], ['perpetuity', 2]);
  assert.equal(snap().inputs.G.tvMode, 'multiple', 'inputs without a mode are "multiple"');
  reject(mutate(f => { f.snapshots[0].inputs.G.tvMode = 'forever'; }), /setting tvMode/);
  reject(mutate(f => { f.snapshots[0].inputs.G.disc = 6; f.snapshots[0].inputs.G.tvGrowth = 5.5; }), /long-run growth 5.5% must be at least 1 point below the discount rate \(6%\)/);
  // A snapshot saved with growth above today's 6% maximum loads clamped, with recomputed results and a plain note.
  const hi = S.makeSnapshot({ name: 'Old', G: { ...baseG(), tvMode: 'perpetuity', tvGrowth: 6 }, layers: baseLayers(), now: NOW });
  const stored = JSON.parse(fileOf([snap()])); stored.snapshots[0] = JSON.parse(JSON.stringify(hi)); stored.snapshots[0].inputs.G.tvGrowth = 8;
  stored.snapshots[0].outputs.forEach(o => { o.npv = 123; });
  const rc = S.snapReadStoredText(JSON.stringify(stored));
  assert.equal(rc.ok, true, rc.error);
  assert.equal(rc.snapshots[0].inputs.G.tvGrowth, 6);
  assert.deepEqual(rc.snapshots[0].outputs.map(o => o.npv), hi.outputs.map(o => o.npv), 'results recomputed at 6%');
  assert.deepEqual(rc.notes, ['Snapshot “Old”: long-run growth of 8% a year is above the current maximum of 6%, so it loads as 6%. Its results are recomputed.']);
  assert.deepEqual(S.snapReadStoredText(fileOf([snap()])).notes, []);
  reject(mutate(f => { delete f.snapshots[0].inputs.G.tvGrowth; }), /missing field "tvGrowth"/);
  const plan = S.snapPrepareLoad(s, baseLayers());
  assert.deepEqual([plan.state.G.tvMode, plan.state.G.tvGrowth], ['perpetuity', 2]);
  // Diff lists a mode change.
  const d = S.diffInputs(snap().inputs, s.inputs).map(x => x.path);
  assert.ok(d.includes('settings.tvMode') && d.includes('settings.tvGrowth'));
});

test('timing offset range is -10 to 10 years; older snapshots inside -5..5 stay valid', () => {
  assert.deepEqual(D.LAYER_RANGES.offset, [-10, 10, 0.5]);
  for (const v of [-10, -6, 0, 5, 10]) { const r = S.snapReadStoredText(mutate(f => { f.snapshots[0].inputs.layers[0].offset = v; })); assert.equal(r.ok, true, v + ': ' + r.error); }
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].offset = -10.5; }), /layer 1 offset: value -10.5 is outside -10 to 10/);
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].offset = 11; }), /outside -10 to 10/);
  assert.equal(M.MODEL_VERSION, 2);
});

test('adoption speed range is 1 to 20 years; values below 3 are now valid; the model handles them', () => {
  assert.deepEqual(D.GLOBAL_RANGES.speed, [1, 20, 0.5]);
  for (const v of [1, 1.9, 3, 20]) { const r = S.snapReadStoredText(mutate(f => { f.snapshots[0].inputs.G.speed = v; })); assert.equal(r.ok, true, v + ': ' + r.error); }
  reject(mutate(f => { f.snapshots[0].inputs.G.speed = 0.5; }), /setting speed: value 0.5 is outside 1 to 20/);
  const o = M.runLayer(baseLayers()[0], { ...baseG(), speed: 1 });
  assert.ok(isFinite(o.npv));
  // Links and cases use the same shared range.
  const lt = S.makeLinkText({ ...baseG(), speed: 1.9 }, baseLayers());
  assert.equal(S.parseLinkText(lt).ok, true);
  const bad = S.parseLinkText(S.makeLinkText({ ...baseG(), speed: 0.5 }, baseLayers()));
  assert.equal(bad.ok, false); assert.match(bad.error, /setting speed: value 0.5 is outside 1 to 20/);
  const C = require('../src/cases.js'), { makeCase } = require('./support/make-synthetic-cases.js');
  const c = JSON.parse(JSON.stringify(makeCase(3, '£m'))); c.settings.speed.value = 1.9;
  assert.doesNotThrow(() => C.validateCase(c));
  c.settings.speed.value = 0.9; assert.throws(() => C.validateCase(c), /value 0.9 is outside the tool’s range 1 to 20/);
  // The input guide reads the shared range.
  assert.match(require('../src/guide.js').guideRows().find(r => r.key === 'speed').range, /^1 to 20, step 0.5; default 8$/);
  assert.equal(M.MODEL_VERSION, 2);
});
