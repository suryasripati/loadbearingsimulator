// Snapshots: dated views of the whole simulation (inputs, outputs, note, kill criteria), so a past view can be compared
// with the current one. Pure functions, no DOM. CommonJS export for tests; the build strips the export line and runs
// this file in the page after the defaults and before the UI code.
// Snapshots live in the browser's local storage only; there is no file export or import (removed; old .snapshot.json
// files can no longer be read). A scenario can be shared as a link instead (settings only, see "Links" below).
// Two version stamps: schemaVersion is the snapshot format; modelVersion is the maths (MODEL_VERSION).

const SNAP_SCHEMA_VERSION = 5;
// Older schemas are still read. Schema 1 had no answer date on kill criteria (filled in as blank); schemas 1 and 2
// had no trigger response (filled in as null).
const SNAP_SCHEMA_READABLE = [1, 2, 3, 4, 5];
// Schema 5 adds the terminal-value mode (tvMode, "multiple" or "perpetuity") and long-run growth (tvGrowth) to the
// settings. Older schemas load as "multiple" with growth 0, which is what they were computed under.
const SNAP_TV_MODES = ['multiple', 'perpetuity'];
// Schema 4 adds caseId (null for your own scenario, or the id of a bundled case) and layer names, and allows 1 to 6
// layers. Older schemas are your own five-layer scenario: caseId null, names from the defaults.
const SNAP_MAX_LAYERS = 6;
const SNAP_RESPONSE_KINDS = ['revised', 'kept'];
const SNAP_REASON_MAX = 500;
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
  return { MODEL_VERSION, TV_GROWTH_GAP, runLayer, verdictFragility, DEFAULT_LAYERS, LAYER_RANGES, GLOBAL_RANGES, PHASE_RANGES, H };
}

function snapBlankKill(layers){
  return (layers || snapDeps().DEFAULT_LAYERS).map(L => ({ id: L.id, text: '', metric: '', direction: '', threshold: null, reviewBy: '', status: '', answeredAt: '' }));
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
  g.tvMode = G.tvMode === 'perpetuity' ? 'perpetuity' : 'multiple'; g.tvGrowth = typeof G.tvGrowth === 'number' ? G.tvGrowth : 0;
  const ls = layers.map(L => {
    const o = { id: L.id, name: L.name };
    SNAP_LAYER_NUM_KEYS.forEach(k => { o[k] = L[k]; });
    o.driftP = L.driftP.slice(0, 3); o.marginP = L.marginP.slice(0, 3);
    if (typeof L.alloc === 'number') o.alloc = L.alloc;
    return o;
  });
  return { G: g, layers: ls };
}
function snapKillCopy(k){
  return { id: k.id, text: k.text, metric: k.metric, direction: k.direction, threshold: k.threshold, reviewBy: k.reviewBy, status: k.status,
    answeredAt: k.answeredAt || '' };
}
function snapResponseCopy(r){
  return { kind: r.kind, reason: r.reason, triggers: r.triggers.map(t => ({ name: t.name, created: t.created, layerId: t.layerId })),
    changedInputs: r.changedInputs.map(c => ({ path: c.path, before: c.before, after: c.after })) };
}
// Criteria answered "yes" whose trigger is still open (no later snapshot saved yet), newest snapshot first.
function snapTriggeredList(list){
  const out = [];
  list.forEach((s, i) => s.kill.forEach(k => {
    if (k.status === 'yes' && !snapLaterSaved(k, list)) out.push({ index: i, name: s.name, created: s.created, layerId: k.id });
  }));
  return out.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
}
// The response recorded on the next snapshot when triggers are open. "revised" lists the inputs that changed since
// the newest triggering snapshot (using the compare logic); "kept" needs a short reason. Allocations are never
// listed, so a response cannot leak them into an export.
function snapMakeResponse(kind, reason, triggers, fromInputs, toInputs){
  const changed = kind === 'revised' ? diffInputs(fromInputs, toInputs).filter(d => !/\.alloc$/.test(d.path)) : [];
  return { kind, reason: String(reason || '').trim().slice(0, SNAP_REASON_MAX),
    triggers: triggers.map(t => ({ name: t.name, created: t.created, layerId: t.layerId })),
    changedInputs: changed.map(d => ({ path: d.path, before: d.before, after: d.after })) };
}
function makeSnapshot(opts){
  const inputs = snapInputs(opts.G, opts.layers);
  return {
    schemaVersion: SNAP_SCHEMA_VERSION,
    name: String(opts.name || '').slice(0, SNAP_TEXT_MAX.name) || 'Untitled snapshot',
    created: (opts.now || new Date()).toISOString(), // ISO, UTC
    note: String(opts.note || '').slice(0, SNAP_TEXT_MAX.note),
    modelVersion: snapDeps().MODEL_VERSION,
    caseId: opts.caseId || null,
    inputs, outputs: snapOutputs(inputs),
    kill: (opts.kill || snapBlankKill(opts.layers)).map(snapKillCopy),
    response: opts.response ? snapResponseCopy(opts.response) : null
  };
}

// Reads what this page stored in local storage ({ snapshots: [...], draftKill }). Never trusts it. Order: size, JSON
// parse, scan for prototype keys, then a structural check that rebuilds every snapshot from whitelisted fields into
// fresh plain objects (nothing parsed is merged into existing objects). Returns { ok: true, snapshots } or
// { ok: false, error } naming what was rejected. Free text is kept as text; the page renders it with textContent.
function snapReadStoredText(text){
  const fail = (msg) => ({ ok: false, error: msg });
  if (typeof text !== 'string') return fail('the stored data could not be read as text.');
  if (snapByteLength(text) > SNAP_MAX_BYTES) return fail('the stored data is larger than 1 MB.');
  let data;
  try { data = JSON.parse(text); } catch (e) { return fail('the stored data is not valid JSON.'); }
  const bad = snapForbiddenKey(data, 0);
  if (bad) return fail('the stored data contains a forbidden key "' + bad + '".');
  try {
    if (!snapIsObj(data)) snapErr('Stored data', 'expected an object');
    snapKeys(data, ['snapshots'], ['draftKill'], 'Stored data');
    if (!Array.isArray(data.snapshots)) snapErr('Stored snapshots', 'expected a list');
    if (data.snapshots.length > SNAP_MAX_COUNT) snapErr('Stored snapshots', 'more than ' + SNAP_MAX_COUNT + ' snapshots');
    return { ok: true, snapshots: data.snapshots.map((x, i) => snapCheckOne(x, 'Snapshot ' + (i + 1))) };
  } catch (e) { return fail(e.message); }
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
// Long-run growth must stay at least TV_GROWTH_GAP points below the discount rate.
function snapGrowthGap(G, where){
  const gap = snapDeps().TV_GROWTH_GAP;
  if (G.tvGrowth > G.disc - gap) snapErr(where, 'long-run growth ' + G.tvGrowth + '% must be at least ' + gap + ' point below the discount rate (' + G.disc + '%)');
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
  if (SNAP_SCHEMA_READABLE.indexOf(v) < 0) snapErr(where, 'schema version ' + String(v).slice(0, 20) + ' is not compatible (this page reads schema versions ' + SNAP_SCHEMA_READABLE.join(' and ') + ')');
  return v;
}
// Checks settings and layer inputs and returns fresh objects built from whitelisted fields only. Shared by stored
// snapshots and links. o: { schema, caseId (null for your own five-layer scenario), alloc (allocations allowed),
// names (layer names required; otherwise the default names are used) }.
function snapCheckInputs(G, Ls, where, o){
  const d = snapDeps(), defIds = d.DEFAULT_LAYERS.map(L => L.id), res = { G: {}, layers: [] };
  snapKeys(G, SNAP_GLOBAL_KEYS.concat(['entryDef', 'capexModel', 'phases'], o.schema >= 5 ? ['tvMode', 'tvGrowth'] : []), [], where + ' settings');
  SNAP_GLOBAL_KEYS.forEach(k => { res.G[k] = snapNum(G[k], d.GLOBAL_RANGES[k], where + ' setting ' + k, SNAP_INT_KEYS.indexOf(k) >= 0); });
  res.G.entryDef = snapOneOf(G.entryDef, ['A', 'B'], where + ' setting entryDef');
  res.G.capexModel = snapOneOf(G.capexModel, ['sustaining', 'vintage'], where + ' setting capexModel');
  res.G.tvMode = o.schema >= 5 ? snapOneOf(G.tvMode, SNAP_TV_MODES, where + ' setting tvMode') : 'multiple';
  res.G.tvGrowth = o.schema >= 5 ? snapNum(G.tvGrowth, d.GLOBAL_RANGES.tvGrowth, where + ' setting tvGrowth') : 0;
  snapGrowthGap(res.G, where + ' setting tvGrowth');
  if (!Array.isArray(G.phases) || G.phases.length !== 2) snapErr(where + ' setting phases', 'expected two years');
  const p1 = snapNum(G.phases[0], d.PHASE_RANGES[0], where + ' setting phases', true);
  const p2 = snapNum(G.phases[1], d.PHASE_RANGES[1], where + ' setting phases', true);
  if (p1 >= p2) snapErr(where + ' setting phases', 'phase 2 must start before phase 3');
  res.G.phases = [p1, p2];
  // Layers: your own scenario has the five default layers; a case snapshot has the case's 1 to 6 layers.
  if (!Array.isArray(Ls) || Ls.length < 1 || Ls.length > SNAP_MAX_LAYERS) snapErr(where + ' layers', 'expected 1 to ' + SNAP_MAX_LAYERS + ' layers');
  if (o.caseId === null && Ls.length !== defIds.length) snapErr(where + ' layers', 'expected ' + defIds.length + ' layers');
  const ids = Ls.map((L, i) => {
    if (!snapIsObj(L) || typeof L.id !== 'string' || !/^[a-z][a-z0-9-]{0,29}$/.test(L.id)) snapErr(where + ' layer ' + (i + 1), 'unexpected layer id');
    if (o.caseId === null && L.id !== defIds[i]) snapErr(where + ' layer ' + (i + 1), 'expected layer id "' + defIds[i] + '"');
    return L.id;
  });
  if (new Set(ids).size !== ids.length) snapErr(where + ' layers', 'duplicate layer id');
  Ls.forEach((L, i) => {
    const w = where + ' layer ' + (i + 1), x = { id: ids[i] };
    snapKeys(L, ['id'].concat(SNAP_LAYER_NUM_KEYS, ['driftP', 'marginP'], o.names ? ['name'] : []), o.alloc ? ['alloc'] : [], w);
    x.name = o.names ? snapStr(L.name, 40, w + ' name') : d.DEFAULT_LAYERS[i].name;
    // Layer names are drawn into charts and tables, so markup characters are refused rather than trusted.
    if (!x.name.trim() || /[<>&"]/.test(x.name)) snapErr(w + ' name', 'must not be empty or contain < > & or "');
    SNAP_LAYER_NUM_KEYS.forEach(k => { x[k] = snapNum(L[k], d.LAYER_RANGES[k], w + ' ' + k, SNAP_INT_KEYS.indexOf(k) >= 0); });
    ['driftP', 'marginP'].forEach(k => {
      if (!Array.isArray(L[k]) || L[k].length !== 3) snapErr(w + ' ' + k, 'expected three phase values');
      x[k] = L[k].map(v => snapNum(v, d.LAYER_RANGES[k], w + ' ' + k));
    });
    if (o.alloc && Object.prototype.hasOwnProperty.call(L, 'alloc')) x.alloc = snapNum(L.alloc, d.LAYER_RANGES.alloc, w + ' alloc');
    res.layers.push(x);
  });
  return res;
}
// Validates one snapshot and returns a fresh object built only from whitelisted, checked fields.
function snapCheckOne(s, where){
  const d = snapDeps(), defIds = d.DEFAULT_LAYERS.map(L => L.id);
  if (!snapIsObj(s)) snapErr(where, 'expected an object');
  const schema = snapSchema(s.schemaVersion, where);
  snapNum(s.modelVersion, [1, 100000], where + ' modelVersion', true);
  if (s.modelVersion > d.MODEL_VERSION) snapErr(where, 'model version ' + s.modelVersion + ' is not compatible: it is newer than this page (model version ' + d.MODEL_VERSION + '). Update the page first');
  snapKeys(s, ['schemaVersion', 'name', 'created', 'note', 'modelVersion', 'inputs', 'outputs', 'kill'].concat(schema >= 3 ? ['response'] : [], schema >= 4 ? ['caseId'] : []), [], where);
  const out = { schemaVersion: SNAP_SCHEMA_VERSION, name: snapStr(s.name, SNAP_TEXT_MAX.name, where + ' name'),
    created: snapDate(s.created, where + ' created'), note: snapStr(s.note, SNAP_TEXT_MAX.note, where + ' note'),
    modelVersion: s.modelVersion, caseId: null, inputs: { G: {}, layers: [] }, outputs: [], kill: [], response: null };
  if (schema >= 4 && s.caseId !== null) {
    out.caseId = snapStr(s.caseId, 60, where + ' caseId');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(out.caseId)) snapErr(where + ' caseId', 'unexpected case id');
  }
  // Inputs
  snapKeys(s.inputs, ['G', 'layers'], [], where + ' inputs');
  out.inputs = snapCheckInputs(s.inputs.G, s.inputs.layers, where, { schema, caseId: out.caseId, alloc: true, names: schema >= 4 });
  const ids = out.inputs.layers.map(L => L.id);
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
    snapKeys(k, ['id', 'text', 'metric', 'direction', 'threshold', 'reviewBy', 'status'].concat(schema >= 2 ? ['answeredAt'] : []), [], w);
    if (k.id !== ids[i]) snapErr(w, 'expected layer id "' + ids[i] + '"');
    out.kill.push({ id: ids[i], text: snapStr(k.text, SNAP_TEXT_MAX.text, w + ' text'), metric: snapStr(k.metric, SNAP_TEXT_MAX.metric, w + ' metric'),
      direction: snapOneOf(k.direction, SNAP_DIRECTIONS, w + ' direction'),
      threshold: k.threshold === null ? null : snapNum(k.threshold, [-1e12, 1e12], w + ' threshold'),
      reviewBy: snapDay(k.reviewBy, w + ' reviewBy'), status: snapOneOf(k.status, SNAP_STATUS, w + ' status'),
      answeredAt: schema < 2 || k.answeredAt === '' ? '' : snapDate(k.answeredAt, w + ' answeredAt') });
  });
  // Trigger response (schema 3): null, or how the user responded to triggered criteria when saving.
  if (schema >= 3 && s.response !== null) out.response = snapCheckResponse(s.response, where + ' response', ids);
  return out;
}
function snapCheckResponse(r, where, ids){
  snapKeys(r, ['kind', 'reason', 'triggers', 'changedInputs'], [], where);
  const kind = snapOneOf(r.kind, SNAP_RESPONSE_KINDS, where + ' kind');
  const reason = snapStr(r.reason, SNAP_REASON_MAX, where + ' reason');
  if (kind === 'kept' && !reason.trim()) snapErr(where, '"kept my view" needs a reason');
  if (!Array.isArray(r.triggers) || r.triggers.length < 1 || r.triggers.length > 250) snapErr(where + ' triggers', 'expected 1 to 250 triggers');
  const triggers = r.triggers.map((t, i) => {
    const w = where + ' trigger ' + (i + 1);
    snapKeys(t, ['name', 'created', 'layerId'], [], w);
    return { name: snapStr(t.name, SNAP_TEXT_MAX.name, w + ' name'), created: snapDate(t.created, w + ' created'), layerId: snapOneOf(t.layerId, ids, w + ' layerId') };
  });
  if (!Array.isArray(r.changedInputs) || r.changedInputs.length > 500) snapErr(where + ' changedInputs', 'expected a list of at most 500');
  if (kind === 'kept' && r.changedInputs.length) snapErr(where, '"kept my view" cannot list changed inputs');
  const changedInputs = r.changedInputs.map((c, i) => {
    const w = where + ' changed input ' + (i + 1);
    snapKeys(c, ['path', 'before', 'after'], [], w);
    const path = snapStr(c.path, 80, w + ' path');
    if (!/^(settings\.[A-Za-z]+(\[[0-2]\])?|layer [a-z]+\.[A-Za-z]+(\[[0-2]\])?)$/.test(path) || /\.alloc$/.test(path)) snapErr(w + ' path', 'unexpected input name');
    const val = (v, ww) => typeof v === 'string' ? snapStr(v, 40, ww) : snapNum(v, [-1e9, 1e9], ww);
    return { path, before: val(c.before, w + ' before'), after: val(c.after, w + ' after') };
  });
  return { kind, reason, triggers, changedInputs };
}


// Criterion state at review time. Dates: review-by is a calendar date; answeredAt and created are ISO UTC and are
// converted to the viewer's local calendar date before comparing, so a time zone cannot flip a badge.
// - 'triggered': answered yes, until a later snapshot is saved or the criterion is reset.
// - 'overdue': unanswered or "unknown", and the review-by date is before today.
// - 'reviewed': answered no. Overdue again only if a next review-by date, later than the answer date, has passed.
// - 'open': has a review-by date still to come, or no date.
function snapCriterionState(k, today, laterSnapshotSaved){
  const answeredDay = k.answeredAt ? snapTodayLocal(new Date(k.answeredAt)) : '';
  if (k.status === 'yes') return laterSnapshotSaved ? { state: 'resolved', answeredDay } : { state: 'triggered', answeredDay };
  if (k.status === 'no') {
    const overdue = !!k.reviewBy && k.reviewBy > answeredDay && k.reviewBy < today;
    return { state: overdue ? 'overdue' : 'reviewed', answeredDay };
  }
  return { state: k.reviewBy && k.reviewBy < today ? 'overdue' : 'open', answeredDay };
}
function snapIsOverdue(k, today){ return snapCriterionState(k, today, false).state === 'overdue'; }
// Whether any snapshot in the list was saved after this criterion was answered (clears a "triggered" badge).
function snapLaterSaved(k, list){ return !!k.answeredAt && list.some(s => s.created > k.answeredAt); }
function snapTodayLocal(now){
  const d = now || new Date(), p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Flatten inputs to labelled paths for diffing, e.g. "settings.disc" or "layer hw.driftP[2]".
function snapFlatten(inputs){
  const out = {};
  SNAP_GLOBAL_KEYS.concat(['entryDef', 'capexModel', 'tvMode', 'tvGrowth']).forEach(k => { out['settings.' + k] = inputs.G[k]; });
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
// Two views can be compared only if they are of the same stack: same case (or both your own scenario), same layers.
function snapSameStack(a, b){
  return (a.caseId || null) === (b.caseId || null) && a.inputs.layers.length === b.inputs.layers.length && a.inputs.layers.every((L, i) => L.id === b.inputs.layers[i].id);
}
function snapStackName(s){ return s.caseId ? 'case “' + s.caseId + '”' : 'your own scenario'; }
function compareSnapshots(a, b){
  const d = snapDeps();
  const versionMismatch = a.modelVersion !== b.modelVersion || a.modelVersion !== d.MODEL_VERSION || b.modelVersion !== d.MODEL_VERSION;
  const recA = versionMismatch ? snapOutputs(a.inputs) : null, recB = versionMismatch ? snapOutputs(b.inputs) : null;
  if (!snapSameStack(a, b)) throw new Error('These two views are of different stacks (' + snapStackName(a) + ' and ' + snapStackName(b) + '), so they cannot be compared.');
  const layers = a.inputs.layers.map((L, i) => {
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

// Load a snapshot into the simulator: validated through the same strict path as an import, then turned into page
// state (inputs only; outputs are recomputed by the page). Allocations are restored only if the snapshot has them.
// Kill criteria fill the next snapshot's form, without answers. Returns { ok, state, warning } or { ok: false, error }.
function snapPrepareLoad(snapshot, currentLayers, currentModelVersion){
  const d = snapDeps(), cur = currentModelVersion || d.MODEL_VERSION;
  let checked;
  try {
    const r = snapReadStoredText(JSON.stringify({ snapshots: [snapshot] }));
    if (!r.ok) return { ok: false, error: r.error };
    checked = r.snapshots[0];
  } catch (e) { return { ok: false, error: 'the snapshot could not be read.' }; }
  const g = checked.inputs.G;
  const G = {}; SNAP_GLOBAL_KEYS.forEach(k => { G[k] = g[k]; });
  G.entryDef = g.entryDef; G.capexModel = g.capexModel; G.phases = g.phases.slice();
  G.tvMode = g.tvMode; G.tvGrowth = g.tvGrowth;
  // Layers come from the snapshot (ids and names); an allocation is restored only if the snapshot has it, otherwise
  // the current allocation of the same layer is kept (or the placeholder 20 for a layer not on the page).
  const layers = checked.inputs.layers.map(src => {
    const cur = currentLayers.find(L => L.id === src.id);
    const out = { id: src.id, name: src.name, alloc: cur ? cur.alloc : 20, driftP: src.driftP.slice(), marginP: src.marginP.slice() };
    SNAP_LAYER_NUM_KEYS.forEach(k => { out[k] = src[k]; });
    if (typeof src.alloc === 'number') out.alloc = src.alloc;
    return out;
  });
  const draftKill = checked.kill.map(k => ({ id: k.id, text: k.text, metric: k.metric, direction: k.direction, threshold: k.threshold, reviewBy: k.reviewBy, status: '', answeredAt: '' }));
  const warning = checked.modelVersion !== cur
    ? 'This snapshot was saved under model version ' + checked.modelVersion + '; this page uses version ' + cur + '. Its inputs will load, and results will recompute under the current model, so they may differ from the stored ones.'
    : '';
  return { ok: true, caseId: checked.caseId, state: { G, layers, draftKill }, warning, hasAllocations: checked.inputs.layers.every(L => typeof L.alloc === 'number') };
}

/* ---------- Links ---------- */
// "Copy link" puts the current scenario in the URL hash as #s=<base64url JSON>. Settings and layer inputs only: never
// allocations, snapshot names, notes or kill criteria. Anyone who has the link can read it.
// Your own scenario: { v, m, g, l } with every input. A case: { v, m, c (case id), ver (version id), d } where d holds
// only the inputs changed from that case version, keyed like the diff paths ("settings.disc", "layer hw.capex",
// "layer hw.driftP[2]", "settings.phases[0]"). v is the link format version, m the model version.
// Opening a link goes through the same strict checks as stored snapshots: size cap before decoding, base64url
// charset, JSON parse, prototype-key rejection, whitelisted fields, shared ranges, fresh objects.
const LINK_SCHEMA_VERSION = 1;
const LINK_MAX_CHARS = 6000;
const LINK_MAX_DIFFS = 200;
const LINK_SETTING_STRINGS = { entryDef: ['A', 'B'], capexModel: ['sustaining', 'vintage'], tvMode: SNAP_TV_MODES };
function linkB64Encode(text){
  const bytes = new TextEncoder().encode(text);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function linkB64Decode(s){
  if (!/^[A-Za-z0-9_-]+$/.test(s)) snapErr('Link', 'unexpected characters');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
// Builds the link text (without "#"). opts: { caseId, versionId, base: { G, layers } } for a case.
function makeLinkText(G, layers, opts){
  const o = opts || {}, d = snapDeps(), cur = snapInputs(G, layers);
  const p = { v: LINK_SCHEMA_VERSION, m: d.MODEL_VERSION };
  if (o.caseId) {
    const a = snapFlatten(snapInputs(o.base.G, o.base.layers)), b = snapFlatten(cur), diff = {};
    Object.keys(b).forEach(k => { if (!/\.alloc$/.test(k) && a[k] !== b[k]) diff[k] = b[k]; });
    Object.assign(p, { c: o.caseId, ver: o.versionId || 'base', d: diff });
  } else {
    p.g = cur.G;
    p.l = cur.layers.map(L => { const x = Object.assign({}, L); delete x.alloc; delete x.name; return x; });
  }
  return 's=' + linkB64Encode(JSON.stringify(p));
}
// Parses and checks a link (the hash, with or without "#"). Returns { ok: false, error } or { ok: true, kind: 'own',
// state: { G, layers } } or { ok: true, kind: 'case', caseId, versionId, diffs }. A case link is checked again,
// in full, by linkApplyCase once the case it names is known.
function parseLinkText(text){
  const fail = (msg) => ({ ok: false, error: msg });
  try {
    if (typeof text !== 'string') return fail('the link could not be read.');
    const t = text.replace(/^#/, '');
    if (t.slice(0, 2) !== 's=') return fail('this is not a scenario link.');
    if (t.length > LINK_MAX_CHARS) return fail('the link is longer than ' + LINK_MAX_CHARS + ' characters.');
    let p;
    try { p = JSON.parse(linkB64Decode(t.slice(2))); } catch (e) { return fail('the link is damaged (it could not be decoded).'); }
    const bad = snapForbiddenKey(p, 0);
    if (bad) return fail('the link contains a forbidden key "' + bad + '".');
    if (!snapIsObj(p)) return fail('the link is damaged (expected an object).');
    const d = snapDeps();
    if (p.v !== LINK_SCHEMA_VERSION) return fail('link format version ' + String(p.v).slice(0, 12) + ' is not supported (this page reads version ' + LINK_SCHEMA_VERSION + ').');
    if (typeof p.m !== 'number' || Math.round(p.m) !== p.m || p.m < 1) return fail('the link has no valid model version.');
    if (p.m > d.MODEL_VERSION) return fail('the link was made with model version ' + p.m + ', newer than this page (model version ' + d.MODEL_VERSION + '). Update the page first.');
    if ('c' in p) {
      snapKeys(p, ['v', 'm', 'c', 'ver', 'd'], [], 'Link');
      const caseId = snapStr(p.c, 60, 'Link case');
      if (!/^[a-z0-9][a-z0-9-]*$/.test(caseId)) snapErr('Link case', 'unexpected case id');
      const versionId = snapStr(p.ver, 30, 'Link version');
      if (!/^[a-z0-9][a-z0-9-]*$/.test(versionId)) snapErr('Link version', 'unexpected version id');
      if (!snapIsObj(p.d)) snapErr('Link changes', 'expected an object');
      const keys = Object.keys(p.d);
      if (keys.length > LINK_MAX_DIFFS) snapErr('Link changes', 'more than ' + LINK_MAX_DIFFS + ' changes');
      const nums = SNAP_GLOBAL_KEYS.concat(['tvGrowth']).join('|'), strs = Object.keys(LINK_SETTING_STRINGS).join('|'), lk = SNAP_LAYER_NUM_KEYS.join('|');
      const re = new RegExp('^(settings\\.(' + nums + '|' + strs + '|phases\\[[01]\\])|layer [a-z][a-z0-9-]{0,29}\\.((' + lk + ')|(driftP|marginP)\\[[0-2]\\]))$');
      const diffs = {};
      keys.forEach(k => {
        if (!re.test(k)) snapErr('Link changes', 'unknown input "' + k.slice(0, 60) + '"');
        const m = /^settings\.(\w+)$/.exec(k), v = p.d[k];
        if (m && LINK_SETTING_STRINGS[m[1]]) diffs[k] = snapOneOf(v, LINK_SETTING_STRINGS[m[1]], 'Link ' + k);
        else diffs[k] = snapNum(v, null, 'Link ' + k);
      });
      return { ok: true, kind: 'case', caseId, versionId, diffs, modelVersion: p.m };
    }
    snapKeys(p, ['v', 'm', 'g', 'l'], [], 'Link');
    const state = snapCheckInputs(p.g, p.l, 'Link', { schema: SNAP_SCHEMA_VERSION, caseId: null, alloc: false, names: false });
    return { ok: true, kind: 'own', state, modelVersion: p.m };
  } catch (e) { return fail(e.message); }
}
// Applies a case link's changes to fresh copies of the case version's inputs and checks the result in full.
function linkApplyCase(parsed, base){
  try {
    const G = JSON.parse(JSON.stringify(base.G)), layers = base.layers.map(L => JSON.parse(JSON.stringify(L)));
    Object.keys(parsed.diffs).forEach(k => {
      const v = parsed.diffs[k];
      let m = /^settings\.phases\[(\d)\]$/.exec(k);
      if (m) { G.phases[+m[1]] = v; return; }
      m = /^settings\.(\w+)$/.exec(k);
      if (m) { G[m[1]] = v; return; }
      m = /^layer ([a-z][a-z0-9-]*)\.(\w+)(?:\[(\d)\])?$/.exec(k);
      const L = layers.find(x => x.id === m[1]);
      if (!L) snapErr('Link changes', 'the case has no layer "' + m[1] + '"');
      if (m[3] === undefined) L[m[2]] = v; else L[m[2]][+m[3]] = v;
    });
    const inputs = snapInputs(G, layers);
    inputs.layers.forEach(L => { delete L.alloc; });
    return { ok: true, state: snapCheckInputs(inputs.G, inputs.layers, 'Link', { schema: SNAP_SCHEMA_VERSION, caseId: parsed.caseId, alloc: false, names: true }) };
  } catch (e) { return { ok: false, error: e.message }; }
}

if (typeof module !== 'undefined') module.exports = { snapSameStack, SNAP_MAX_LAYERS, snapByteLength, snapForbiddenKey, snapKeys, snapNum, snapStr, snapOneOf, snapDate, snapErr, snapIsObj, SNAP_SCHEMA_READABLE, snapTriggeredList, snapMakeResponse, snapCriterionState, snapLaterSaved, snapPrepareLoad, SNAP_SCHEMA_VERSION, snapReadStoredText, snapCheckInputs, LINK_SCHEMA_VERSION, LINK_MAX_CHARS, makeLinkText, parseLinkText, linkApplyCase, linkB64Encode, SNAP_MAX_BYTES, SNAP_MAX_COUNT, makeSnapshot, snapInputs, snapOutputs, snapBlankKill, snapIsOverdue, snapTodayLocal, diffInputs, compareSnapshots };
