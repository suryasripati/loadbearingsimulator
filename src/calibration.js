// Calibration scaffold: a structure for scoring past episodes (for example British railways in the 1840s, telecom and
// fibre 1996-2001, dot-com applications, electricity) using only what was knowable at the time. SCAFFOLD ONLY: this
// file holds no episode data, and none may be invented. Sourced and derived inputs need cited sources; a judgement
// needs a rationale and may be uncited, but an episode with any uncited input must stay out of the repository.
// Pure functions, no DOM. CommonJS export for tests; the build strips the export line and inlines this file in
// docs/calibration.html after the model, the defaults and the snapshot code (whose strict-import helpers it reuses).

const EP_FORMAT = 'load-bearing-simulator-episode';
const EP_SCHEMA_VERSION = 1;
const EP_MAX_LAYERS = 8;
const EP_MAX_SOURCES = 100;
const EP_MAX_IDS = 20;
const EP_TEXT = { name: 120, citation: 1000, long: 2000, knew: 4000 };
const EP_SOURCE_KINDS = ['contemporary', 'compiled-from-period-data', 'retrospective'];
const EP_BASIS = ['sourced', 'derived', 'judgement'];
const EP_OUTCOMES = ['yes', 'no', 'unknown', 'contested'];
const EP_SETTING_KEYS = ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult', 'phase2Start', 'phase3Start'];
const EP_LAYER_KEYS = ['evidence', 'share', 'offset', 'steepness', 'capex', 'buildStart', 'buildYears', 'unitCostDecline',
  'passThrough', 'life', 'debt'];
const EP_INT_KEYS = ['entry', 'phase2Start', 'phase3Start', 'evidence', 'buildStart', 'buildYears'];
const EP_BANNER = 'Scored by someone who knew the outcome. Treat as a sanity check, not calibration.';
const EP_FEW_CASES = 'Too few cases for statistical conclusions.';

function calDeps(){
  if (typeof module !== 'undefined' && typeof require === 'function') {
    return Object.assign({}, require('./model.js'), require('./defaults.js'), require('./snapshots.js'));
  }
  return { MODEL_VERSION, runLayer, LAYER_RANGES, GLOBAL_RANGES, PHASE_RANGES, H, SNAP_MAX_BYTES,
    snapByteLength, snapForbiddenKey, snapKeys, snapNum, snapStr, snapOneOf, snapDate, snapErr, snapIsObj };
}

/* ---------- Hash (SHA-256, pure JS) and canonical JSON ---------- */
function calSha256(text){
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,
    0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,
    0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,
    0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,
    0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = [];
  const utf8 = unescape(encodeURIComponent(text));
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map(x => x | 0);
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
// Stable JSON: object keys sorted, so the same content always hashes the same.
function calCanonical(v){
  if (Array.isArray(v)) return '[' + v.map(calCanonical).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + calCanonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
// The lock covers everything decided before the outcome is looked at: inputs, sources, rules and the scorer's
// statement. Outcomes are not covered (they are entered after locking).
function episodeHash(ep){
  return calSha256(calCanonical({ id: ep.id, name: ep.name, version: ep.version, previousHash: ep.previousHash, asOfDate: ep.asOfDate,
    asOfRule: ep.asOfRule, outcomeHorizon: ep.outcomeHorizon, outcomeMeasure: ep.outcomeMeasure, scorer: ep.scorer,
    settings: ep.settings, layers: ep.layers, sources: ep.sources }));
}

/* ---------- Template ---------- */
function calEmptyRecord(){ return { value: null, basis: null, sourceIds: [], calculation: '', rationale: '' }; }
function calEmptyLayer(){
  const inputs = {};
  EP_LAYER_KEYS.forEach(k => { inputs[k] = calEmptyRecord(); });
  inputs.driftP = [calEmptyRecord(), calEmptyRecord(), calEmptyRecord()];
  inputs.marginP = [calEmptyRecord(), calEmptyRecord(), calEmptyRecord()];
  return { name: '', inputs };
}
function templateEpisode(){
  const settings = {};
  EP_SETTING_KEYS.forEach(k => { settings[k] = calEmptyRecord(); });
  settings.entryDef = null; settings.capexModel = null;
  return { format: EP_FORMAT, schemaVersion: EP_SCHEMA_VERSION, id: '', name: '', version: 1, previousHash: null,
    asOfDate: null, asOfRule: '', outcomeHorizon: '', outcomeMeasure: '', scorer: { knewAboutOutcome: '' },
    settings, layers: [calEmptyLayer()], sources: [], lock: null, outcomes: [] };
}

/* ---------- Validation (strict; returns a fresh object) ---------- */
function calDay(v, where){
  const d = calDeps();
  d.snapStr(v, 10, where);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) d.snapErr(where, 'expected a date (YYYY-MM-DD)');
  const y = +m[1], mo = +m[2], da = +m[3];
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo < 1 || mo > 12 || da < 1 || da > dim[mo - 1]) d.snapErr(where, 'not a real calendar date');
  return v;
}
function calIds(v, where, known){
  const d = calDeps();
  if (!Array.isArray(v) || v.length > EP_MAX_IDS) d.snapErr(where, 'expected a list of at most ' + EP_MAX_IDS + ' source ids');
  v.forEach(id => { if (typeof id !== 'string' || !known.has(id)) d.snapErr(where, 'unknown source id "' + String(id).slice(0, 40) + '"'); });
  if (new Set(v).size !== v.length) d.snapErr(where, 'a source id is listed twice');
  return v.slice();
}
// Can this source back an input? Inputs may only use what was available at the as-of date.
function sourceValidForInput(src, asOfDate){
  if (!asOfDate) return true; // draft without an as-of date: checked again before locking
  if (src.kind === 'compiled-from-period-data') return !!src.truncatedAt && src.truncatedAt <= asOfDate;
  return src.publicationDate <= asOfDate;
}
// Can this source back an outcome? Outcome evidence must come after the as-of date.
function sourceValidForOutcome(src, asOfDate){ return !!asOfDate && src.publicationDate > asOfDate; }

function calRecord(r, where, range, integer, ctx){
  const d = calDeps();
  d.snapKeys(r, ['value', 'basis', 'sourceIds', 'calculation', 'rationale'], [], where);
  const out = { value: r.value === null ? null : d.snapNum(r.value, range, where + ' value', integer),
    basis: r.basis === null ? null : d.snapOneOf(r.basis, EP_BASIS, where + ' basis'),
    sourceIds: calIds(r.sourceIds, where + ' sources', ctx.known),
    calculation: d.snapStr(r.calculation, EP_TEXT.long, where + ' calculation'),
    rationale: d.snapStr(r.rationale, EP_TEXT.long, where + ' rationale') };
  if (out.value !== null) {
    if (out.basis === null) d.snapErr(where, 'a value needs a basis (sourced, derived or judgement)');
    // Sourced and derived values need at least one cited source; a judgement needs a rationale and may be uncited
    // (shown as "uncited judgement", and the episode must then stay out of the repository).
    if (out.basis !== 'judgement' && !out.sourceIds.length) d.snapErr(where, 'a ' + out.basis + ' value needs at least one cited source');
    if (out.basis === 'derived' && !out.calculation.trim()) d.snapErr(where, 'a derived value needs its calculation shown');
    if (out.basis === 'judgement' && !out.rationale.trim()) d.snapErr(where, 'a judgement needs a rationale');
  }
  out.sourceIds.forEach(id => {
    if (!sourceValidForInput(ctx.byId[id], ctx.asOfDate)) {
      const s = ctx.byId[id];
      d.snapErr(where, 'source "' + id + '" was not available at the as-of date ' + ctx.asOfDate
        + (s.kind === 'compiled-from-period-data' ? ' (a compiled series must be truncated on or before the as-of date)' : ' (published ' + s.publicationDate + ')'));
    }
  });
  return out;
}

function validateEpisode(raw){
  const d = calDeps();
  const where = 'Episode';
  if (!d.snapIsObj(raw)) d.snapErr(where, 'expected an object');
  if (raw.format !== EP_FORMAT) d.snapErr(where, 'not a Load Bearing Simulator episode file');
  if (raw.schemaVersion !== EP_SCHEMA_VERSION) d.snapErr(where, 'schema version ' + String(raw.schemaVersion).slice(0, 20) + ' is not compatible (this page reads schema version ' + EP_SCHEMA_VERSION + ')');
  d.snapKeys(raw, ['format', 'schemaVersion', 'id', 'name', 'version', 'previousHash', 'asOfDate', 'asOfRule', 'outcomeHorizon',
    'outcomeMeasure', 'scorer', 'settings', 'layers', 'sources', 'lock', 'outcomes'], [], where);
  const ep = { format: EP_FORMAT, schemaVersion: EP_SCHEMA_VERSION };
  ep.id = d.snapStr(raw.id, 60, where + ' id');
  if (ep.id && !/^[a-z0-9][a-z0-9-]*$/.test(ep.id)) d.snapErr(where + ' id', 'use lower-case letters, digits and hyphens');
  ep.name = d.snapStr(raw.name, EP_TEXT.name, where + ' name');
  ep.version = d.snapNum(raw.version, [1, 10000], where + ' version', true);
  ep.previousHash = raw.previousHash === null ? null : d.snapStr(raw.previousHash, 64, where + ' previousHash');
  if (ep.previousHash !== null && !/^[0-9a-f]{64}$/.test(ep.previousHash)) d.snapErr(where + ' previousHash', 'expected a SHA-256 hash');
  ep.asOfDate = raw.asOfDate === null ? null : calDay(raw.asOfDate, where + ' asOfDate');
  ep.asOfRule = d.snapStr(raw.asOfRule, EP_TEXT.long, where + ' asOfRule');
  ep.outcomeHorizon = d.snapStr(raw.outcomeHorizon, EP_TEXT.long, where + ' outcomeHorizon');
  ep.outcomeMeasure = d.snapStr(raw.outcomeMeasure, EP_TEXT.long, where + ' outcomeMeasure');
  d.snapKeys(raw.scorer, ['knewAboutOutcome'], [], where + ' scorer');
  ep.scorer = { knewAboutOutcome: d.snapStr(raw.scorer.knewAboutOutcome, EP_TEXT.knew, where + ' scorer knewAboutOutcome') };
  // Sources first, so inputs and outcomes can be checked against them.
  if (!Array.isArray(raw.sources) || raw.sources.length > EP_MAX_SOURCES) d.snapErr(where + ' sources', 'expected a list of at most ' + EP_MAX_SOURCES);
  const byId = {};
  ep.sources = raw.sources.map((s, i) => {
    const w = where + ' source ' + (i + 1);
    d.snapKeys(s, ['id', 'citation', 'publicationDate', 'kind', 'truncatedAt'], [], w);
    const src = { id: d.snapStr(s.id, 40, w + ' id'), citation: d.snapStr(s.citation, EP_TEXT.citation, w + ' citation'),
      publicationDate: calDay(s.publicationDate, w + ' publicationDate'), kind: d.snapOneOf(s.kind, EP_SOURCE_KINDS, w + ' kind'),
      truncatedAt: s.truncatedAt === null ? null : calDay(s.truncatedAt, w + ' truncatedAt') };
    if (!/^[A-Za-z0-9_-]+$/.test(src.id)) d.snapErr(w + ' id', 'use letters, digits, hyphens and underscores');
    if (byId[src.id]) d.snapErr(w + ' id', 'duplicate source id "' + src.id + '"');
    if (!src.citation.trim()) d.snapErr(w + ' citation', 'a source needs a citation');
    if (src.kind === 'compiled-from-period-data' && src.truncatedAt === null) d.snapErr(w, 'a compiled series needs the date it is truncated at');
    if (src.kind !== 'compiled-from-period-data' && src.truncatedAt !== null) d.snapErr(w, 'only a compiled series has a truncation date');
    byId[src.id] = src;
    return src;
  });
  const ctx = { known: new Set(Object.keys(byId)), byId, asOfDate: ep.asOfDate };
  // Settings
  const S = raw.settings;
  d.snapKeys(S, EP_SETTING_KEYS.concat(['entryDef', 'capexModel']), [], where + ' settings');
  ep.settings = {};
  EP_SETTING_KEYS.forEach(k => {
    const range = k === 'phase2Start' ? d.PHASE_RANGES[0] : k === 'phase3Start' ? d.PHASE_RANGES[1] : d.GLOBAL_RANGES[k];
    ep.settings[k] = calRecord(S[k], where + ' setting ' + k, range, EP_INT_KEYS.indexOf(k) >= 0, ctx);
  });
  ep.settings.entryDef = S.entryDef === null ? null : d.snapOneOf(S.entryDef, ['A', 'B'], where + ' setting entryDef');
  ep.settings.capexModel = S.capexModel === null ? null : d.snapOneOf(S.capexModel, ['sustaining', 'vintage'], where + ' setting capexModel');
  const p2 = ep.settings.phase2Start.value, p3 = ep.settings.phase3Start.value;
  if (p2 !== null && p3 !== null && p2 >= p3) d.snapErr(where + ' settings', 'phase 2 must start before phase 3');
  // Layers (episode-specific; names are free text)
  if (!Array.isArray(raw.layers) || raw.layers.length < 1 || raw.layers.length > EP_MAX_LAYERS) d.snapErr(where + ' layers', 'expected 1 to ' + EP_MAX_LAYERS + ' layers');
  ep.layers = raw.layers.map((L, i) => {
    const w = where + ' layer ' + (i + 1);
    d.snapKeys(L, ['name', 'inputs'], [], w);
    d.snapKeys(L.inputs, EP_LAYER_KEYS.concat(['driftP', 'marginP']), [], w + ' inputs');
    const inputs = {};
    EP_LAYER_KEYS.forEach(k => { inputs[k] = calRecord(L.inputs[k], w + ' ' + k, d.LAYER_RANGES[k], EP_INT_KEYS.indexOf(k) >= 0, ctx); });
    ['driftP', 'marginP'].forEach(k => {
      if (!Array.isArray(L.inputs[k]) || L.inputs[k].length !== 3) d.snapErr(w + ' ' + k, 'expected three phase records');
      inputs[k] = L.inputs[k].map((r, j) => calRecord(r, w + ' ' + k + '[' + j + ']', d.LAYER_RANGES[k], false, ctx));
    });
    return { name: d.snapStr(L.name, EP_TEXT.name, w + ' name'), inputs };
  });
  // Lock
  if (raw.lock === null) ep.lock = null;
  else {
    d.snapKeys(raw.lock, ['hash', 'lockedAt', 'modelVersion'], [], where + ' lock');
    ep.lock = { hash: d.snapStr(raw.lock.hash, 64, where + ' lock hash'), lockedAt: d.snapDate(raw.lock.lockedAt, where + ' lock lockedAt'),
      modelVersion: d.snapNum(raw.lock.modelVersion, [1, 100000], where + ' lock modelVersion', true) };
    const missing = lockProblems(ep);
    if (missing.length) d.snapErr(where + ' lock', 'locked episode is incomplete: ' + missing[0]);
    if (episodeHash(ep) !== ep.lock.hash) d.snapErr(where + ' lock', 'the inputs do not match the lock hash; locked inputs cannot change without making a new version');
  }
  // Outcomes (only after locking)
  if (!Array.isArray(raw.outcomes)) d.snapErr(where + ' outcomes', 'expected a list');
  if (raw.outcomes.length && !ep.lock) d.snapErr(where + ' outcomes', 'outcomes can only be entered after the episode is locked');
  const seen = new Set();
  ep.outcomes = raw.outcomes.map((o, i) => {
    const w = where + ' outcome ' + (i + 1);
    const out = calOutcome(o, w, ep, ctx);
    if (seen.has(out.layer)) d.snapErr(w, 'layer ' + (out.layer + 1) + ' already has an outcome');
    seen.add(out.layer);
    return out;
  });
  return ep;
}
function calOutcome(o, w, ep, ctx){
  const d = calDeps();
  d.snapKeys(o, ['layer', 'result', 'sourceIds', 'note', 'contested'], [], w);
  const out = { layer: d.snapNum(o.layer, [0, ep.layers.length - 1], w + ' layer', true),
    result: d.snapOneOf(o.result, EP_OUTCOMES, w + ' result'),
    sourceIds: calIds(o.sourceIds, w + ' sources', ctx.known), note: d.snapStr(o.note, EP_TEXT.long, w + ' note'), contested: null };
  if (!out.note.trim()) d.snapErr(w, 'an outcome needs a note');
  const after = (ids, ww) => ids.forEach(id => { if (!sourceValidForOutcome(ctx.byId[id], ep.asOfDate)) d.snapErr(ww, 'outcome source "' + id + '" must be published after the as-of date ' + ep.asOfDate); });
  if (out.result === 'contested') {
    if (o.contested === null) d.snapErr(w, 'a contested outcome needs citations on both sides');
    d.snapKeys(o.contested, ['forSourceIds', 'againstSourceIds'], [], w + ' contested');
    const f = calIds(o.contested.forSourceIds, w + ' contested for', ctx.known), a = calIds(o.contested.againstSourceIds, w + ' contested against', ctx.known);
    if (!f.length || !a.length) d.snapErr(w, 'a contested outcome needs at least one citation on each side');
    after(f, w + ' contested for'); after(a, w + ' contested against');
    out.contested = { forSourceIds: f, againstSourceIds: a };
  } else {
    if (o.contested !== null) d.snapErr(w, 'only a contested outcome has citations on both sides');
    if ((out.result === 'yes' || out.result === 'no') && !out.sourceIds.length) d.snapErr(w, 'an outcome of yes or no needs a cited source');
  }
  after(out.sourceIds, w + ' sources');
  return out;
}

// What still has to be filled in before an episode can be locked (empty list when ready).
function lockProblems(ep){
  const p = [];
  if (!ep.id) p.push('an id');
  if (!ep.name.trim()) p.push('a name');
  if (!ep.asOfDate) p.push('an as-of date');
  if (!ep.asOfRule.trim()) p.push('the as-of rule');
  if (!ep.outcomeHorizon.trim()) p.push('the outcome horizon');
  if (!ep.outcomeMeasure.trim()) p.push('the outcome measure');
  if (!ep.scorer.knewAboutOutcome.trim()) p.push('what the scorer already knew about the outcome');
  if (!ep.settings.entryDef) p.push('settings entryDef');
  if (!ep.settings.capexModel) p.push('settings capexModel');
  EP_SETTING_KEYS.forEach(k => { if (ep.settings[k].value === null) p.push('settings ' + k); });
  ep.layers.forEach((L, i) => {
    if (!L.name.trim()) p.push('layer ' + (i + 1) + ' name');
    calRecords(L.inputs).forEach(([k, r]) => { if (r.value === null) p.push('layer ' + (i + 1) + ' ' + k); });
  });
  return p;
}
function calRecords(inputs){
  const out = [];
  EP_LAYER_KEYS.forEach(k => out.push([k, inputs[k]]));
  ['driftP', 'marginP'].forEach(k => inputs[k].forEach((r, j) => out.push([k + '[' + j + ']', r])));
  return out;
}
function allRecords(ep){
  const out = EP_SETTING_KEYS.map(k => ['settings ' + k, ep.settings[k]]);
  ep.layers.forEach((L, i) => calRecords(L.inputs).forEach(([k, r]) => out.push(['layer ' + (i + 1) + ' ' + k, r])));
  return out;
}

/* ---------- Strict import and export ---------- */
function importEpisodeText(text){
  const d = calDeps(), fail = (m) => ({ ok: false, error: m });
  if (typeof text !== 'string') return fail('the file could not be read as text.');
  if (d.snapByteLength(text) > d.SNAP_MAX_BYTES) return fail('the file is larger than 1 MB.');
  let data;
  try { data = JSON.parse(text); } catch (e) { return fail('the file is not valid JSON.'); }
  const bad = d.snapForbiddenKey(data, 0);
  if (bad) return fail('the file contains a forbidden key "' + bad + '".');
  try { return { ok: true, episode: validateEpisode(data) }; } catch (e) { return fail(e.message); }
}
function exportEpisodeText(ep){ return JSON.stringify(validateEpisode(JSON.parse(JSON.stringify(ep))), null, 2); }
// Export file: NAME.episode.json when every input is cited; NAME.private.json (gitignored) with a warning when any
// input is uncited, because such a file must stay out of the public repository.
function exportEpisodeFile(ep){
  const text = exportEpisodeText(ep), uncited = unsourcedInputs(ep);
  const base = (ep.id || 'episode') + '-v' + ep.version;
  return { text, uncited, isPrivate: uncited.length > 0, filename: base + (uncited.length ? '.private.json' : '.episode.json'),
    warning: uncited.length ? uncited.length + ' input' + (uncited.length === 1 ? ' is' : 's are') + ' uncited, so this file is named .private.json. Keep it out of the repository (calibration/private/ and *.private.json are gitignored).' : '' };
}

/* ---------- Workflow: draft, locked, outcomes ---------- */
function lockEpisode(ep, now){
  if (ep.lock) throw new Error('This episode is already locked. Make a new version to change its inputs.');
  const problems = lockProblems(ep);
  if (problems.length) throw new Error('Not ready to lock. Still needed: ' + problems.join(', ') + '.');
  const copy = validateEpisode(JSON.parse(JSON.stringify(ep)));
  copy.lock = { hash: episodeHash(copy), lockedAt: (now || new Date()).toISOString(), modelVersion: calDeps().MODEL_VERSION };
  return validateEpisode(copy);
}
// A new version keeps the inputs as a starting point, links to the old lock and starts as an unlocked draft.
function newEpisodeVersion(ep){
  if (!ep.lock) throw new Error('Only a locked episode needs a new version; a draft can be edited directly.');
  const copy = JSON.parse(JSON.stringify(ep));
  copy.version = ep.version + 1; copy.previousHash = ep.lock.hash; copy.lock = null; copy.outcomes = [];
  return validateEpisode(copy);
}
function setOutcome(ep, outcome){
  if (!ep.lock) throw new Error('Outcomes can only be entered after the episode is locked.');
  const copy = JSON.parse(JSON.stringify(ep));
  copy.outcomes = copy.outcomes.filter(o => o.layer !== outcome.layer).concat([outcome]).sort((a, b) => a.layer - b.layer);
  return validateEpisode(copy);
}

/* ---------- Basis mix ---------- */
// Judgement share of the filled inputs; uncited judgements count toward it like any other judgement.
function judgementShare(ep){
  const filled = allRecords(ep).filter(([, r]) => r.value !== null);
  if (!filled.length) return { judgement: 0, uncited: 0, total: 0, share: 0, heavy: false };
  const j = filled.filter(([, r]) => r.basis === 'judgement').length;
  const u = filled.filter(([, r]) => isUncitedJudgement(r)).length;
  return { judgement: j, uncited: u, total: filled.length, share: j / filled.length, heavy: j / filled.length > 0.5 };
}
function isUncitedJudgement(r){ return r.value !== null && r.basis === 'judgement' && !r.sourceIds.length; }
// Numeric inputs without a cited source (any basis). The repository test requires this to be empty for every
// committed file under calibration/; export uses it to suggest a .private.json name.
function unsourcedInputs(ep){ return allRecords(ep).filter(([, r]) => r.value !== null && !r.sourceIds.length).map(([k]) => k); }

/* ---------- Comparison ---------- */
function episodeModelInputs(ep){
  const s = ep.settings, G = {};
  ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'].forEach(k => { G[k] = s[k].value; });
  G.entryDef = s.entryDef; G.capexModel = s.capexModel; G.phases = [s.phase2Start.value, s.phase3Start.value];
  const layers = ep.layers.map((L, i) => {
    const o = { id: 'layer' + (i + 1), name: L.name };
    EP_LAYER_KEYS.forEach(k => { o[k] = L.inputs[k].value; });
    o.driftP = L.inputs.driftP.map(r => r.value); o.marginP = L.inputs.marginP.map(r => r.value);
    return o;
  });
  return { G, layers };
}
// Model verdict (current model) against the recorded outcome, per layer of every locked episode. No hit rate.
function compareEpisodes(episodes){
  const d = calDeps(), rows = [];
  episodes.filter(ep => ep.lock).forEach(ep => {
    const m = episodeModelInputs(ep);
    m.layers.forEach((L, i) => {
      const o = d.runLayer(L, m.G), outcome = ep.outcomes.find(x => x.layer === i) || null;
      rows.push({ episode: ep.name, episodeId: ep.id, version: ep.version, layer: L.name, verdict: o.bin, npv: o.npv,
        modelSaysEarnsCost: o.npv >= 0, outcome: outcome ? outcome.result : null,
        lockedModelVersion: ep.lock.modelVersion, versionDiffers: ep.lock.modelVersion !== d.MODEL_VERSION });
    });
  });
  const lockedEps = episodes.filter(ep => ep.lock);
  return { rows, episodes: lockedEps.length, layers: rows.length, caveat: EP_FEW_CASES, banner: EP_BANNER, currentModelVersion: d.MODEL_VERSION };
}

if (typeof module !== 'undefined') module.exports = { EP_FORMAT, EP_SCHEMA_VERSION, EP_BANNER, EP_FEW_CASES, EP_SETTING_KEYS, EP_LAYER_KEYS, calSha256, calCanonical, episodeHash, calEmptyRecord, calEmptyLayer, templateEpisode, validateEpisode, lockProblems, allRecords, importEpisodeText, exportEpisodeText, exportEpisodeFile, isUncitedJudgement, lockEpisode, newEpisodeVersion, setOutcome, judgementShare, unsourcedInputs, sourceValidForInput, sourceValidForOutcome, episodeModelInputs, compareEpisodes };
