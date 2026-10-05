const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/snapshots.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');

const baseG = () => ({ ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, capexModel: D.DEFAULT_CAPEX, phases: D.DEFAULT_PHASES.slice() });
const baseLayers = () => D.DEFAULT_LAYERS.map(L => ({ ...L, driftP: L.driftP.slice(), marginP: L.marginP.slice() }));
const NOW = new Date('2026-10-05T12:00:00.000Z');
const snap = (over = {}) => S.makeSnapshot({ name: 'Base view', note: 'First pass', G: baseG(), layers: baseLayers(), now: NOW, ...over });
const fileOf = (list, opts) => S.exportSnapshotsText(list, { now: NOW, ...opts });
const reject = (text, pattern) => {
  const r = S.importSnapshotsText(text);
  assert.equal(r.ok, false, 'expected rejection');
  assert.match(r.error, pattern);
};
const mutate = (fn, opts) => { const f = JSON.parse(fileOf([snap()], opts)); fn(f); return JSON.stringify(f); };

test('snapshot holds the model version, all inputs and per-layer outputs equal to direct model calls', () => {
  const s = snap();
  assert.equal(s.modelVersion, M.MODEL_VERSION);
  assert.equal(s.created, NOW.toISOString());
  assert.deepEqual(Object.keys(s.inputs.G).sort(), ['capexModel', 'disc', 'entry', 'entryDef', 'mid', 'mult', 'phases', 'pool', 'premium', 'rd', 'speed', 'tv']);
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
  const r = S.importSnapshotsText(fileOf([s], { includeAllocations: true }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.snapshots, [JSON.parse(JSON.stringify(s))]);
});

test('export excludes allocations by default and includes them only when ticked', () => {
  const off = JSON.parse(fileOf([snap()]));
  assert.equal(off.includesAllocations, false);
  off.snapshots[0].inputs.layers.forEach(L => assert.ok(!('alloc' in L)));
  assert.ok(!/"alloc"/.test(fileOf([snap()])));
  const on = JSON.parse(fileOf([snap()], { includeAllocations: true }));
  assert.equal(on.includesAllocations, true);
  on.snapshots[0].inputs.layers.forEach((L, i) => assert.equal(L.alloc, D.DEFAULT_LAYERS[i].alloc));
  // The stored list is not modified by exporting.
  const s = snap(); S.exportSnapshots([s]); assert.equal(s.inputs.layers[0].alloc, D.DEFAULT_LAYERS[0].alloc);
});

test('import checks schema version (file and snapshot) and model version, and says which is incompatible', () => {
  reject(mutate(f => { f.schemaVersion = 2; }), /File: schema version 2 is not compatible \(this page reads schema version 1\)/);
  reject(mutate(f => { f.snapshots[0].schemaVersion = 9; }), /Snapshot 1: schema version 9 is not compatible/);
  reject(mutate(f => { f.snapshots[0].modelVersion = M.MODEL_VERSION + 1; }), new RegExp('Snapshot 1: model version ' + (M.MODEL_VERSION + 1) + ' is not compatible: it is newer than this page'));
  reject(mutate(f => { f.format = 'something-else'; }), /not a Load Bearing Simulator snapshot file/);
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
  reject(mutate(f => { f.extra = 1; }), /File: unknown field "extra"/);
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].secret = 1; }), /layer 1: unknown field "secret"/);
  reject(mutate(f => { f.snapshots[0].kill[0].extra = 'x'; }), /kill criteria 1: unknown field "extra"/);
  // Allocations are an unknown field in a file that says it has none.
  reject(mutate(f => { f.snapshots[0].inputs.layers[0].alloc = 5; }), /layer 1: unknown field "alloc"/);
});

test('import rejects files over 1 MB', () => {
  const big = mutate(f => { f.snapshots[0].note = 'x'.repeat(10); }).replace('"x', '"' + 'y'.repeat(S.SNAP_MAX_BYTES));
  reject(big, /larger than 1 MB/);
});

test('import keeps HTML in notes as plain text (it is rendered with textContent, never as HTML)', () => {
  const html = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const r = S.importSnapshotsText(mutate(f => { f.snapshots[0].note = html; f.snapshots[0].kill[0].text = html; }));
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
  const noAlloc = S.importSnapshotsText(fileOf([b])).snapshots[0];
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

test('overdue: past review-by date and not yet answered', () => {
  const k = (reviewBy, status = '') => ({ reviewBy, status });
  assert.equal(S.snapIsOverdue(k('2026-10-04'), '2026-10-05'), true);
  assert.equal(S.snapIsOverdue(k('2026-10-05'), '2026-10-05'), false, 'due today is not overdue');
  assert.equal(S.snapIsOverdue(k('2026-10-06'), '2026-10-05'), false);
  assert.equal(S.snapIsOverdue(k(''), '2026-10-05'), false, 'no date, never overdue');
  for (const st of ['yes', 'no', 'unknown']) assert.equal(S.snapIsOverdue(k('2026-01-01', st), '2026-10-05'), false, 'answered: ' + st);
  assert.equal(S.snapTodayLocal(new Date(2026, 0, 9)), '2026-01-09');
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
  const r = S.importSnapshotsText(text);
  assert.equal(r.ok, true, r.error);
  const s0 = r.snapshots[0];
  const walk = (v) => { if (v && typeof v === 'object') { if (!Array.isArray(v)) assert.equal(Object.getPrototypeOf(v), Object.prototype); Object.values(v).forEach(walk); } };
  walk(s0);
  assert.notEqual(s0, parsed.snapshots[0]);
  assert.deepEqual(Object.keys(s0).sort(), ['created', 'inputs', 'kill', 'modelVersion', 'name', 'note', 'outputs', 'schemaVersion']);
  assert.deepEqual(Object.keys(s0.inputs.layers[0]).sort(), ['alloc', 'buildStart', 'buildYears', 'capex', 'debt', 'driftP', 'evidence', 'id', 'life', 'marginP', 'offset', 'passThrough', 'share', 'steepness', 'unitCostDecline']);
  // Importing twice gives independent objects (nothing is merged or shared).
  const r2 = S.importSnapshotsText(text);
  r2.snapshots[0].inputs.layers[0].share = 99;
  assert.notEqual(r.snapshots[0].inputs.layers[0].share, 99);
});

test('import caps the number of snapshots per file', () => {
  const many = Array.from({ length: S.SNAP_MAX_COUNT + 1 }, () => snap());
  reject(fileOf(many), new RegExp('more than ' + S.SNAP_MAX_COUNT + ' snapshots'));
  assert.equal(S.importSnapshotsText(fileOf(many.slice(0, S.SNAP_MAX_COUNT))).ok, true);
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
