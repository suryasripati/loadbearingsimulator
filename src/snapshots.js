// Snapshots: dated views of the whole simulation (inputs, outputs, note, kill criteria), so a past view can be compared
// with the current one. Pure functions, no DOM. CommonJS export for tests; the build strips the export line and runs
// this file in the page after the defaults and before the UI code.
// Snapshots live in the browser's local storage only. Exports are files the user downloads; they are never committed
// (exports/ and *.snapshot.json are gitignored). Allocations are excluded from exports unless the user ticks a box.
// Two version stamps: schemaVersion is the file and snapshot format; modelVersion is the maths (MODEL_VERSION).

const SNAP_FORMAT = 'load-bearing-simulator-snapshots';
const SNAP_SCHEMA_VERSION = 1;
const SNAP_MAX_BYTES = 1024 * 1024;
const SNAP_MAX_COUNT = 50; // per file, and in total in this browser
const SNAP_TEXT_MAX = { name: 120, note: 5000, text: 2000, metric: 120 };
const SNAP_GLOBAL_KEYS = ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'];
const SNAP_LAYER_NUM_KEYS = ['evidence', 'share', 'offset', 'steepness', 'capex', 'buildStart', 'buildYears',
  'unitCostDecline', 'passThrough', 'life', 'debt'];
const SNAP_INT_KEYS = ['entry', 'evidence', 'buildStart', 'buildYears'];
const SNAP_BINS = ['Durable value', 'Pays, but fragile', 'Useful, but capital does not earn its cost',
  'Pays on assumptions, not evidence', 'Speculative'];
const SNAP_FLAGS = ['life', 'debt', 'tail'];
const SNAP_STATUS = ['', 'yes', 'no', 'unknown'];
const SNAP_DIRECTIONS = ['', 'above', 'below'];
const SNAP_FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

// Model and defaults: required in Node, globals in the page (looked up at call time).
function snapDeps(){
  if (typeof module !== 'undefined' && typeof require === 'function') {
    return Object.assign({}, require('./model.js'), require('./defaults.js'));
  }
  return { MODEL_VERSION, runLayer, verdictFragility, DEFAULT_LAYERS, LAYER_RANGES, GLOBAL_RANGES, PHASE_RANGES, H };
}

function snapBlankKill(){
  return snapDeps().DEFAULT_LAYERS.map(L => ({ id: L.id, text: '', metric: '', direction: '', threshold: null, reviewBy: '', status: '' }));
}
const snapFinite = (v) => typeof v === 'number' && isFinite(v) ? v : null;

// Outputs saved with a snapshot, computed from its inputs under the current model.
function snapOutputs(inputs){
  const d = snapDeps();
  return inputs.layers.map(L => {
    const o = d.runLayer(L, inputs.G), f = d.verdictFragility(L, inputs.G);
    return { id: L.id, npv: o.npv, bin: o.bin, flags: o.flags.slice(), breakEven: snapFinite(o.breakEven), breakEvenM: snapFinite(o.breakEvenM),
      fragility: { n: f.n, m: f.m, worse: f.worse, better: f.better, mixed: f.mixed } };
  });
}
// Copy only known inputs into fresh objects, so a snapshot never carries display state or stray fields.
function snapInputs(G, layers){
  const g = {};
  SNAP_GLOBAL_KEYS.forEach(k => { g[k] = G[k]; });
  g.entryDef = G.entryDef; g.capexModel = G.capexModel; g.phases = [G.phases[0], G.phases[1]];
  const ls = layers.map(L => {
    const o = { id: L.id };
    SNAP_LAYER_NUM_KEYS.forEach(k => { o[k] = L[k]; });
    o.driftP = L.driftP.slice(0, 3); o.marginP = L.marginP.slice(0, 3);
    if (typeof L.alloc === 'number') o.alloc = L.alloc;
    return o;
  });
  return { G: g, layers: ls };
}
function snapKillCopy(k){
  return { id: k.id, text: k.text, metric: k.metric, direction: k.direction, threshold: k.threshold, reviewBy: k.reviewBy, status: k.status };
}
function makeSnapshot(opts){
  const inputs = snapInputs(opts.G, opts.layers);
  return {
    schemaVersion: SNAP_SCHEMA_VERSION,
    name: String(opts.name || '').slice(0, SNAP_TEXT_MAX.name) || 'Untitled snapshot',
    created: (opts.now || new Date()).toISOString(), // ISO, UTC
    note: String(opts.note || '').slice(0, SNAP_TEXT_MAX.note),
    modelVersion: snapDeps().MODEL_VERSION,
    inputs, outputs: snapOutputs(inputs),
    kill: (opts.kill || snapBlankKill()).map(snapKillCopy)
  };
}

// Export: allocations are removed unless the caller asks to include them. The stored list is not modified.
function exportSnapshots(list, opts){
  const include = !!(opts && opts.includeAllocations);
  const snaps = list.map(s => {
    const c = JSON.parse(JSON.stringify(s));
    if (!include) c.inputs.layers.forEach(L => { delete L.alloc; });
    return c;
  });
  return { format: SNAP_FORMAT, schemaVersion: SNAP_SCHEMA_VERSION, exportedAt: ((opts && opts.now) || new Date()).toISOString(),
    includesAllocations: include, snapshots: snaps };
}
function exportSnapshotsText(list, opts){ return JSON.stringify(exportSnapshots(list, opts), null, 2); }

// Strict import. Never trusts the file. Order: size, JSON parse, scan for prototype keys, then a structural check
// that rebuilds every snapshot from whitelisted fields into fresh plain objects (nothing parsed is merged into
// existing objects). Returns { ok: true, snapshots } or { ok: false, error } naming what was rejected.
// Free text is kept as text; the page renders it with textContent, never as HTML.
function importSnapshotsText(text, opts){
  const fail = (msg) => ({ ok: false, error: msg });
  if (typeof text !== 'string') return fail('the file could not be read as text.');
  if (snapByteLength(text) > SNAP_MAX_BYTES) return fail('the file is larger than 1 MB.');
  let data;
  try { data = JSON.parse(text); } catch (e) { return fail('the file is not valid JSON.'); }
  const bad = snapForbiddenKey(data, 0);
  if (bad) return fail('the file contains a forbidden key "' + bad + '".');
  try { return { ok: true, snapshots: snapCheckFile(data, opts || {}) }; }
  catch (e) { return fail(e.message); }
}
function snapByteLength(text){
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}
// Depth-first scan for keys that could reach an object's prototype if ever merged. Also caps nesting depth.
function snapForbiddenKey(v, depth){
  if (depth > 20) return '(nesting too deep)';
  if (Array.isArray(v)) { for (const x of v) { const b = snapForbiddenKey(x, depth + 1); if (b) return b; } return null; }
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (SNAP_FORBIDDEN_KEYS.indexOf(k) >= 0) return k;
      const b = snapForbiddenKey(v[k], depth + 1); if (b) return b;
    }
  }
  return null;
}
function snapErr(where, what){ throw new Error(where + ': ' + what); }
function snapIsObj(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }
function snapKeys(obj, required, optional, where){
  if (!snapIsObj(obj)) snapErr(where, 'expected an object');
  const allowed = required.concat(optional || []);
  Object.keys(obj).forEach(k => { if (allowed.indexOf(k) < 0) snapErr(where, 'unknown field "' + String(k).slice(0, 40) + '"'); });
  required.forEach(k => { if (!Object.prototype.hasOwnProperty.call(obj, k)) snapErr(where, 'missing field "' + k + '"'); });
}
function snapNum(v, range, where, integer){
  if (typeof v !== 'number' || !isFinite(v)) snapErr(where, 'expected a finite number');
  if (range && (v < range[0] || v > range[1])) snapErr(where, 'value ' + v + ' is outside ' + range[0] + ' to ' + range[1]);
  if (integer && Math.round(v) !== v) snapErr(where, 'expected a whole number');
  return v;
}
function snapStr(v, max, where){
  if (typeof v !== 'string') snapErr(where, 'expected text');
  if (v.length > max) snapErr(where, 'text longer than ' + max + ' characters');
  return v;
}
function snapOneOf(v, list, where){ if (list.indexOf(v) < 0) snapErr(where, 'unexpected value'); return v; }
function snapDate(v, where){
  snapStr(v, 40, where);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) || isNaN(Date.parse(v))) snapErr(where, 'expected an ISO date and time in UTC');
  return v;
}
function snapDay(v, where){
  snapStr(v, 10, where);
  if (v !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + 'T00:00:00Z')))) snapErr(where, 'expected a date (YYYY-MM-DD) or blank');
  return v;
}
function snapSchema(v, where){
  if (v !== SNAP_SCHEMA_VERSION) snapErr(where, 'schema version ' + String(v).slice(0, 20) + ' is not compatible (this page reads schema version ' + SNAP_SCHEMA_VERSION + ')');
}
function snapCheckFile(data, opts){
  if (!snapIsObj(data)) snapErr('File', 'expected an object');
  if (data.format !== SNAP_FORMAT) snapErr('File', 'not a Load Bearing Simulator snapshot file');
  snapSchema(data.schemaVersion, 'File');
  snapKeys(data, ['format', 'schemaVersion', 'exportedAt', 'includesAllocations', 'snapshots'], [], 'File');
  snapDate(data.exportedAt, 'File exportedAt');
  if (typeof data.includesAllocations !== 'boolean') snapErr('File includesAllocations', 'expected true or false');
  if (!Array.isArray(data.snapshots)) snapErr('File snapshots', 'expected a list');
  const max = opts.maxCount || SNAP_MAX_COUNT;
  if (data.snapshots.length > max) snapErr('File snapshots', 'more than ' + max + ' snapshots');
  return data.snapshots.map((s, i) => snapCheckOne(s, 'Snapshot ' + (i + 1), data.includesAllocations));
}
// Validates one snapshot and returns a fresh object built only from whitelisted, checked fields.
function snapCheckOne(s, where, withAlloc){
  const d = snapDeps(), ids = d.DEFAULT_LAYERS.map(L => L.id);
  if (!snapIsObj(s)) snapErr(where, 'expected an object');
  snapSchema(s.schemaVersion, where);
  snapNum(s.modelVersion, [1, 100000], where + ' modelVersion', true);
  if (s.modelVersion > d.MODEL_VERSION) snapErr(where, 'model version ' + s.modelVersion + ' is not compatible: it is newer than this page (model version ' + d.MODEL_VERSION + '). Update the page first');
  snapKeys(s, ['schemaVersion', 'name', 'created', 'note', 'modelVersion', 'inputs', 'outputs', 'kill'], [], where);
  const out = { schemaVersion: SNAP_SCHEMA_VERSION, name: snapStr(s.name, SNAP_TEXT_MAX.name, where + ' name'),
    created: snapDate(s.created, where + ' created'), note: snapStr(s.note, SNAP_TEXT_MAX.note, where + ' note'),
    modelVersion: s.modelVersion, inputs: { G: {}, layers: [] }, outputs: [], kill: [] };
  // Inputs
  snapKeys(s.inputs, ['G', 'layers'], [], where + ' inputs');
  const G = s.inputs.G;
  snapKeys(G, SNAP_GLOBAL_KEYS.concat(['entryDef', 'capexModel', 'phases']), [], where + ' settings');
  SNAP_GLOBAL_KEYS.forEach(k => { out.inputs.G[k] = snapNum(G[k], d.GLOBAL_RANGES[k], where + ' setting ' + k, SNAP_INT_KEYS.indexOf(k) >= 0); });
  out.inputs.G.entryDef = snapOneOf(G.entryDef, ['A', 'B'], where + ' setting entryDef');
  out.inputs.G.capexModel = snapOneOf(G.capexModel, ['sustaining', 'vintage'], where + ' setting capexModel');
  if (!Array.isArray(G.phases) || G.phases.length !== 2) snapErr(where + ' setting phases', 'expected two years');
  const p1 = snapNum(G.phases[0], d.PHASE_RANGES[0], where + ' setting phases', true);
  const p2 = snapNum(G.phases[1], d.PHASE_RANGES[1], where + ' setting phases', true);
  if (p1 >= p2) snapErr(where + ' setting phases', 'phase 2 must start before phase 3');
  out.inputs.G.phases = [p1, p2];
  if (!Array.isArray(s.inputs.layers) || s.inputs.layers.length !== ids.length) snapErr(where + ' layers', 'expected ' + ids.length + ' layers');
  s.inputs.layers.forEach((L, i) => {
    const w = where + ' layer ' + (i + 1), o = { id: ids[i] };
    snapKeys(L, ['id'].concat(SNAP_LAYER_NUM_KEYS, ['driftP', 'marginP']), withAlloc ? ['alloc'] : [], w);
    if (L.id !== ids[i]) snapErr(w, 'expected layer id "' + ids[i] + '"');
    SNAP_LAYER_NUM_KEYS.forEach(k => { o[k] = snapNum(L[k], d.LAYER_RANGES[k], w + ' ' + k, SNAP_INT_KEYS.indexOf(k) >= 0); });
    ['driftP', 'marginP'].forEach(k => {
      if (!Array.isArray(L[k]) || L[k].length !== 3) snapErr(w + ' ' + k, 'expected three phase values');
      o[k] = L[k].map(v => snapNum(v, d.LAYER_RANGES[k], w + ' ' + k));
    });
    if (Object.prototype.hasOwnProperty.call(L, 'alloc')) o.alloc = snapNum(L.alloc, d.LAYER_RANGES.alloc, w + ' alloc');
    out.inputs.layers.push(o);
  });
  // Outputs (kept for comparison; recomputed when the model version differs)
  if (!Array.isArray(s.outputs) || s.outputs.length !== ids.length) snapErr(where + ' outputs', 'expected ' + ids.length + ' layers');
  s.outputs.forEach((o, i) => {
    const w = where + ' output ' + (i + 1);
    snapKeys(o, ['id', 'npv', 'bin', 'flags', 'breakEven', 'breakEvenM', 'fragility'], [], w);
    if (o.id !== ids[i]) snapErr(w, 'expected layer id "' + ids[i] + '"');
    if (!Array.isArray(o.flags) || o.flags.length > 3) snapErr(w + ' flags', 'expected a list of flags');
    snapKeys(o.fragility, ['n', 'm', 'worse', 'better', 'mixed'], [], w + ' fragility');
    const fr = {};
    ['n', 'm', 'worse', 'better', 'mixed'].forEach(k => { fr[k] = snapNum(o.fragility[k], [0, 100], w + ' fragility ' + k, true); });
    out.outputs.push({ id: ids[i], npv: snapNum(o.npv, [-1e9, 1e9], w + ' npv'), bin: snapOneOf(o.bin, SNAP_BINS, w + ' verdict'),
      flags: o.flags.map(f => snapOneOf(f, SNAP_FLAGS, w + ' flags')),
      breakEven: o.breakEven === null ? null : snapNum(o.breakEven, [-1e9, 1e9], w + ' breakEven'),
      breakEvenM: o.breakEvenM === null ? null : snapNum(o.breakEvenM, [-1e9, 1e9], w + ' breakEvenM'),
      fragility: fr });
  });
  // Kill criteria
  if (!Array.isArray(s.kill) || s.kill.length !== ids.length) snapErr(where + ' kill criteria', 'expected ' + ids.length + ' layers');
  s.kill.forEach((k, i) => {
    const w = where + ' kill criteria ' + (i + 1);
    snapKeys(k, ['id', 'text', 'metric', 'direction', 'threshold', 'reviewBy', 'status'], [], w);
    if (k.id !== ids[i]) snapErr(w, 'expected layer id "' + ids[i] + '"');
    out.kill.push({ id: ids[i], text: snapStr(k.text, SNAP_TEXT_MAX.text, w + ' text'), metric: snapStr(k.metric, SNAP_TEXT_MAX.metric, w + ' metric'),
      direction: snapOneOf(k.direction, SNAP_DIRECTIONS, w + ' direction'),
      threshold: k.threshold === null ? null : snapNum(k.threshold, [-1e12, 1e12], w + ' threshold'),
      reviewBy: snapDay(k.reviewBy, w + ' reviewBy'), status: snapOneOf(k.status, SNAP_STATUS, w + ' status') });
  });
  return out;
}

// Overdue: a review-by date (a calendar date, no time) earlier than today's local calendar date, not yet answered.
// Comparing local calendar dates as YYYY-MM-DD text means a time zone cannot flip the badge; created stays ISO UTC.
function snapIsOverdue(k, today){ return !!k.reviewBy && k.status === '' && k.reviewBy < today; }
function snapTodayLocal(now){
  const d = now || new Date(), p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Flatten inputs to labelled paths for diffing, e.g. "settings.disc" or "layer hw.driftP[2]".
function snapFlatten(inputs){
  const out = {};
  SNAP_GLOBAL_KEYS.concat(['entryDef', 'capexModel']).forEach(k => { out['settings.' + k] = inputs.G[k]; });
  inputs.G.phases.forEach((v, i) => { out['settings.phases[' + i + ']'] = v; });
  inputs.layers.forEach(L => {
    SNAP_LAYER_NUM_KEYS.forEach(k => { out['layer ' + L.id + '.' + k] = L[k]; });
    ['driftP', 'marginP'].forEach(k => L[k].forEach((v, i) => { out['layer ' + L.id + '.' + k + '[' + i + ']'] = v; }));
    if ('alloc' in L) out['layer ' + L.id + '.alloc'] = L.alloc;
  });
  return out;
}
// Inputs that differ between two snapshots. Allocations are compared only when both snapshots hold them.
function diffInputs(a, b){
  const fa = snapFlatten(a), fb = snapFlatten(b), out = [];
  Object.keys(fa).forEach(k => {
    if (!(k in fb)) return;
    if (fa[k] !== fb[k]) out.push({ path: k, before: fa[k], after: fb[k] });
  });
  return out;
}
// Compare two snapshots. When either was saved under a different model version from the other or from the current
// model, both are recomputed under the current model and the stored outputs are kept alongside.
function compareSnapshots(a, b){
  const d = snapDeps();
  const versionMismatch = a.modelVersion !== b.modelVersion || a.modelVersion !== d.MODEL_VERSION || b.modelVersion !== d.MODEL_VERSION;
  const recA = versionMismatch ? snapOutputs(a.inputs) : null, recB = versionMismatch ? snapOutputs(b.inputs) : null;
  const layers = d.DEFAULT_LAYERS.map((L, i) => {
    const before = recA ? recA[i] : a.outputs[i], after = recB ? recB[i] : b.outputs[i];
    return { id: L.id, name: L.name, before, after,
      storedBefore: a.outputs[i], storedAfter: b.outputs[i],
      verdictChanged: before.bin !== after.bin,
      npvChange: after.npv - before.npv,
      fragilityChange: { n: after.fragility.n - before.fragility.n, worse: after.fragility.worse - before.fragility.worse,
        better: after.fragility.better - before.fragility.better, mixed: after.fragility.mixed - before.fragility.mixed } };
  });
  return { versionMismatch, versions: { before: a.modelVersion, after: b.modelVersion, current: d.MODEL_VERSION },
    inputs: diffInputs(a.inputs, b.inputs), layers };
}

if (typeof module !== 'undefined') module.exports = { SNAP_FORMAT, SNAP_SCHEMA_VERSION, SNAP_MAX_BYTES, SNAP_MAX_COUNT, makeSnapshot, snapInputs, snapOutputs, snapBlankKill, exportSnapshots, exportSnapshotsText, importSnapshotsText, snapIsOverdue, snapTodayLocal, diffInputs, compareSnapshots };
