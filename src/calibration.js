// Calibration scaffold: a structure for scoring past episodes (for example British railways in the 1840s, telecom and
// fibre 1996-2001, dot-com applications, electricity) using only what was knowable at the time. SCAFFOLD ONLY: this
// file holds no episode data, and none may be invented. Sourced and derived inputs need cited sources; a judgement
// needs a rationale and may be uncited, but an episode with any uncited input must stay out of the repository.
// Pure functions, no DOM. CommonJS export for tests; the build strips the export line and inlines this file in
// docs/calibration.html after the model, the defaults, the snapshot code (whose strict-import helpers it reuses) and
// the guidance (src/calibration-guide.js).
//
// Episode shape (schema 3). Episode-level fields are shared by every input version: id, name, version, previousHash,
// asOfDate, asOfRule, outcomeHorizon, outcomeMeasure, scorer (statement plus checklist), layerNames, sources and
// outcomes. Each input version ("variant", for example hype against measured adoption speed) has a label, settings,
// layer inputs and its own lock.
// Hash schemes: 1 = schema 1 lock (no counts); 2 = schema 2 lock (counts and acknowledgement); 3 = this schema
// (per variant: shared fields, the variant's inputs, the sources it cites, counts, acknowledgement and the checklist).
// Schema 1 and 2 files import as a single variant "Main" whose lock keeps its original formula, with
// checklistCaptured false.

const EP_FORMAT = 'load-bearing-simulator-episode';
const EP_SCHEMA_VERSION = 3;
const EP_SCHEMA_READABLE = [1, 2, 3];
const EP_MAX_LAYERS = 8;
const EP_MAX_VARIANTS = 4;
const EP_MAX_SOURCES = 100;
const EP_MAX_IDS = 20;
const EP_TEXT = { name: 120, label: 60, citation: 1000, long: 2000, knew: 4000 };
const EP_SOURCE_KINDS = ['contemporary', 'compiled-from-period-data', 'retrospective'];
const EP_BASIS = ['sourced', 'derived', 'judgement'];
const EP_OUTCOMES = ['yes', 'no', 'unknown', 'contested'];
const EP_CHECK_ANSWERS = ['', 'yes', 'no', 'partly'];
const EP_SETTING_KEYS = ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult', 'phase2Start', 'phase3Start'];
const EP_LAYER_KEYS = ['evidence', 'share', 'offset', 'steepness', 'capex', 'buildStart', 'buildYears', 'unitCostDecline',
  'passThrough', 'life', 'debt'];
const EP_INT_KEYS = ['entry', 'phase2Start', 'phase3Start', 'evidence', 'buildStart', 'buildYears'];
const EP_BANNER = 'Scored by someone who knew the outcome. Treat as a sanity check, not calibration.';
const EP_FEW_CASES = 'Too few cases for statistical conclusions.';
const EP_LN81_LN2 = Math.log(81) / Math.log(2);

function calDeps(){
  if (typeof module !== 'undefined' && typeof require === 'function') {
    return Object.assign({}, require('./model.js'), require('./defaults.js'), require('./snapshots.js'), require('./calibration-guide.js'));
  }
  return { MODEL_VERSION, runLayer, LAYER_RANGES, GLOBAL_RANGES, PHASE_RANGES, H, SNAP_MAX_BYTES, SCORER_CHECKLIST,
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

/* ---------- Template and empty parts ---------- */
function calEmptyRecord(){ return { value: null, basis: null, sourceIds: [], calculation: '', rationale: '' }; }
function calEmptyInputs(){
  const inputs = {};
  EP_LAYER_KEYS.forEach(k => { inputs[k] = calEmptyRecord(); });
  inputs.driftP = [calEmptyRecord(), calEmptyRecord(), calEmptyRecord()];
  inputs.marginP = [calEmptyRecord(), calEmptyRecord(), calEmptyRecord()];
  return inputs;
}
function calEmptySettings(){
  const s = {};
  EP_SETTING_KEYS.forEach(k => { s[k] = calEmptyRecord(); });
  s.entryDef = null; s.capexModel = null;
  return s;
}
function calEmptyChecklist(){ const c = {}; calDeps().SCORER_CHECKLIST.forEach(i => { c[i.key] = ''; }); return c; }
function calEmptyVariant(label, nLayers){
  return { label: label, settings: calEmptySettings(), layers: Array.from({ length: nLayers }, () => ({ inputs: calEmptyInputs() })), lock: null };
}
function templateEpisode(){
  return { format: EP_FORMAT, schemaVersion: EP_SCHEMA_VERSION, id: '', name: '', version: 1, previousHash: null,
    asOfDate: null, asOfRule: '', outcomeHorizon: '', outcomeMeasure: '',
    scorer: { knewAboutOutcome: '', checklist: calEmptyChecklist() },
    layerNames: [''], sources: [], variants: [calEmptyVariant('Main', 1)], outcomes: [] };
}

/* ---------- Migration of schema 1 and 2 files (raw, before validation) ---------- */
// Old shape: settings, layers [{ name, inputs }] and lock at the top level; scorer { knewAboutOutcome }. Field sets are
// checked strictly here; everything is then validated again in the schema 3 shape.
function calMigrate(raw){
  const d = calDeps(), w = 'Episode (schema ' + raw.schemaVersion + ')';
  d.snapKeys(raw, ['format', 'schemaVersion', 'id', 'name', 'version', 'previousHash', 'asOfDate', 'asOfRule', 'outcomeHorizon',
    'outcomeMeasure', 'scorer', 'settings', 'layers', 'sources', 'lock', 'outcomes'], [], w);
  d.snapKeys(raw.scorer, ['knewAboutOutcome'], [], w + ' scorer');
  if (!Array.isArray(raw.layers)) d.snapErr(w + ' layers', 'expected a list');
  raw.layers.forEach((L, i) => d.snapKeys(L, ['name', 'inputs'], [], w + ' layer ' + (i + 1)));
  let lock = null;
  if (raw.lock !== null) {
    if (raw.schemaVersion === 1) {
      d.snapKeys(raw.lock, ['hash', 'lockedAt', 'modelVersion'], [], w + ' lock');
      lock = { hash: raw.lock.hash, lockedAt: raw.lock.lockedAt, modelVersion: raw.lock.modelVersion, hashScheme: 1, counts: null, acknowledged: null, checklistCaptured: false };
    } else {
      d.snapKeys(raw.lock, ['hash', 'lockedAt', 'modelVersion', 'hashScheme', 'counts', 'acknowledged'], [], w + ' lock');
      lock = { hash: raw.lock.hash, lockedAt: raw.lock.lockedAt, modelVersion: raw.lock.modelVersion, hashScheme: raw.lock.hashScheme,
        counts: raw.lock.counts, acknowledged: raw.lock.acknowledged, checklistCaptured: false };
    }
  }
  return { format: raw.format, schemaVersion: 3, id: raw.id, name: raw.name, version: raw.version, previousHash: raw.previousHash,
    asOfDate: raw.asOfDate, asOfRule: raw.asOfRule, outcomeHorizon: raw.outcomeHorizon, outcomeMeasure: raw.outcomeMeasure,
    scorer: { knewAboutOutcome: raw.scorer.knewAboutOutcome, checklist: calEmptyChecklist() },
    layerNames: raw.layers.map(L => L.name), sources: raw.sources,
    variants: [{ label: 'Main', settings: raw.settings, layers: raw.layers.map(L => ({ inputs: L.inputs })), lock }],
    outcomes: raw.outcomes };
}

/* ---------- Hashes ---------- */
// Scheme 1 and 2: the original formulas over the old shape (variant 0 only), so migrated locks stay valid.
function legacyHash(ep, vi, scheme, meta){
  const v = ep.variants[vi];
  const body = { id: ep.id, name: ep.name, version: ep.version, previousHash: ep.previousHash, asOfDate: ep.asOfDate,
    asOfRule: ep.asOfRule, outcomeHorizon: ep.outcomeHorizon, outcomeMeasure: ep.outcomeMeasure, scorer: { knewAboutOutcome: ep.scorer.knewAboutOutcome },
    settings: v.settings, layers: ep.layerNames.map((n, i) => ({ name: n, inputs: v.layers[i].inputs })), sources: ep.sources };
  if (scheme === 2) { body.counts = meta.counts; body.acknowledged = meta.acknowledged; }
  return calSha256(calCanonical(body));
}
// Scheme 3: shared fields (including the scorer checklist and layer names), this variant's label and inputs, the
// sources it cites, its counts and its acknowledgement. Changing a shared field after any lock breaks every lock.
function variantHash(ep, vi, meta){
  const v = ep.variants[vi], cited = citedSources(ep, vi);
  return calSha256(calCanonical({
    shared: { id: ep.id, name: ep.name, version: ep.version, previousHash: ep.previousHash, asOfDate: ep.asOfDate, asOfRule: ep.asOfRule,
      outcomeHorizon: ep.outcomeHorizon, outcomeMeasure: ep.outcomeMeasure, scorer: ep.scorer, layerNames: ep.layerNames },
    variant: { label: v.label, settings: v.settings, layers: v.layers },
    sources: ep.sources.filter(s => cited.has(s.id)),
    counts: meta.counts, acknowledged: meta.acknowledged }));
}
function citedSources(ep, vi){
  const ids = new Set();
  allRecords(ep, vi).forEach(([, r]) => r.sourceIds.forEach(id => ids.add(id)));
  return ids;
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

function validateEpisode(raw0){
  const d = calDeps();
  const where = 'Episode';
  if (!d.snapIsObj(raw0)) d.snapErr(where, 'expected an object');
  if (raw0.format !== EP_FORMAT) d.snapErr(where, 'not a Load Bearing Simulator episode file');
  if (EP_SCHEMA_READABLE.indexOf(raw0.schemaVersion) < 0) d.snapErr(where, 'schema version ' + String(raw0.schemaVersion).slice(0, 20) + ' is not compatible (this page reads schema versions ' + EP_SCHEMA_READABLE.join(', ') + ')');
  const raw = raw0.schemaVersion < 3 ? calMigrate(raw0) : raw0;
  d.snapKeys(raw, ['format', 'schemaVersion', 'id', 'name', 'version', 'previousHash', 'asOfDate', 'asOfRule', 'outcomeHorizon',
    'outcomeMeasure', 'scorer', 'layerNames', 'sources', 'variants', 'outcomes'], [], where);
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
  // Scorer: free text plus the checklist.
  d.snapKeys(raw.scorer, ['knewAboutOutcome', 'checklist'], [], where + ' scorer');
  const keys = d.SCORER_CHECKLIST.map(c => c.key);
  d.snapKeys(raw.scorer.checklist, keys, [], where + ' scorer checklist');
  const checklist = {};
  keys.forEach(k => { checklist[k] = d.snapOneOf(raw.scorer.checklist[k], EP_CHECK_ANSWERS, where + ' scorer checklist ' + k); });
  ep.scorer = { knewAboutOutcome: d.snapStr(raw.scorer.knewAboutOutcome, EP_TEXT.knew, where + ' scorer knewAboutOutcome'), checklist };
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
  // Layer names (shared by every variant)
  if (!Array.isArray(raw.layerNames) || raw.layerNames.length < 1 || raw.layerNames.length > EP_MAX_LAYERS) d.snapErr(where + ' layerNames', 'expected 1 to ' + EP_MAX_LAYERS + ' layers');
  ep.layerNames = raw.layerNames.map((n, i) => d.snapStr(n, EP_TEXT.name, where + ' layer ' + (i + 1) + ' name'));
  // Variants (input versions)
  if (!Array.isArray(raw.variants) || raw.variants.length < 1 || raw.variants.length > EP_MAX_VARIANTS) d.snapErr(where + ' variants', 'expected 1 to ' + EP_MAX_VARIANTS + ' input versions');
  ep.variants = raw.variants.map((v, vi) => calVariant(v, where + ' input version ' + (vi + 1), ep, ctx));
  const labels = ep.variants.map(v => v.label.trim()).filter(Boolean);
  if (new Set(labels).size !== labels.length) d.snapErr(where + ' variants', 'two input versions have the same label');
  // Locks, one per variant (needs the whole episode for the hashes)
  raw.variants.forEach((v, vi) => { ep.variants[vi].lock = v.lock === null ? null : calCheckLock(v.lock, where + ' input version ' + (vi + 1) + ' (' + (ep.variants[vi].label || 'unlabelled') + ') lock', ep, vi); });
  // Outcomes (only once every input version is locked)
  if (!Array.isArray(raw.outcomes)) d.snapErr(where + ' outcomes', 'expected a list');
  if (raw.outcomes.length && !allLocked(ep)) d.snapErr(where + ' outcomes', 'outcomes can only be entered after every input version is locked');
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
function calVariant(v, w, ep, ctx){
  const d = calDeps();
  d.snapKeys(v, ['label', 'settings', 'layers', 'lock'], [], w);
  const out = { label: d.snapStr(v.label, EP_TEXT.label, w + ' label'), settings: {}, layers: [], lock: null };
  const S = v.settings;
  d.snapKeys(S, EP_SETTING_KEYS.concat(['entryDef', 'capexModel']), [], w + ' settings');
  EP_SETTING_KEYS.forEach(k => {
    const range = k === 'phase2Start' ? d.PHASE_RANGES[0] : k === 'phase3Start' ? d.PHASE_RANGES[1] : d.GLOBAL_RANGES[k];
    out.settings[k] = calRecord(S[k], w + ' setting ' + k, range, EP_INT_KEYS.indexOf(k) >= 0, ctx);
  });
  out.settings.entryDef = S.entryDef === null ? null : d.snapOneOf(S.entryDef, ['A', 'B'], w + ' setting entryDef');
  out.settings.capexModel = S.capexModel === null ? null : d.snapOneOf(S.capexModel, ['sustaining', 'vintage'], w + ' setting capexModel');
  const p2 = out.settings.phase2Start.value, p3 = out.settings.phase3Start.value;
  if (p2 !== null && p3 !== null && p2 >= p3) d.snapErr(w + ' settings', 'phase 2 must start before phase 3');
  if (!Array.isArray(v.layers) || v.layers.length !== ep.layerNames.length) d.snapErr(w + ' layers', 'expected ' + ep.layerNames.length + ' layers, one per layer name');
  out.layers = v.layers.map((L, i) => {
    const lw = w + ' layer ' + (i + 1);
    d.snapKeys(L, ['inputs'], [], lw);
    d.snapKeys(L.inputs, EP_LAYER_KEYS.concat(['driftP', 'marginP']), [], lw + ' inputs');
    const inputs = {};
    EP_LAYER_KEYS.forEach(k => { inputs[k] = calRecord(L.inputs[k], lw + ' ' + k, d.LAYER_RANGES[k], EP_INT_KEYS.indexOf(k) >= 0, ctx); });
    ['driftP', 'marginP'].forEach(k => {
      if (!Array.isArray(L.inputs[k]) || L.inputs[k].length !== 3) d.snapErr(lw + ' ' + k, 'expected three phase records');
      inputs[k] = L.inputs[k].map((r, j) => calRecord(r, lw + ' ' + k + '[' + j + ']', d.LAYER_RANGES[k], false, ctx));
    });
    return { inputs };
  });
  return out;
}
// One variant's lock: { hash, lockedAt, modelVersion, hashScheme, counts, acknowledged, checklistCaptured }.
function calCheckLock(L, w, ep, vi){
  const d = calDeps();
  d.snapKeys(L, ['hash', 'lockedAt', 'modelVersion', 'hashScheme', 'counts', 'acknowledged', 'checklistCaptured'], [], w);
  const lock = { hash: d.snapStr(L.hash, 64, w + ' hash'), lockedAt: d.snapDate(L.lockedAt, w + ' lockedAt'),
    modelVersion: d.snapNum(L.modelVersion, [1, 100000], w + ' modelVersion', true),
    hashScheme: d.snapNum(L.hashScheme, [1, 3], w + ' hashScheme', true), counts: null, acknowledged: null, checklistCaptured: false };
  if (typeof L.checklistCaptured !== 'boolean') d.snapErr(w + ' checklistCaptured', 'expected true or false');
  lock.checklistCaptured = L.checklistCaptured;
  if (lock.hashScheme < 3 && vi !== 0) d.snapErr(w, 'only the first input version can carry a lock from an older schema');
  if (lock.hashScheme < 3 && lock.checklistCaptured) d.snapErr(w, 'a lock from an older schema did not capture the checklist');
  if (lock.hashScheme === 3 && !lock.checklistCaptured) d.snapErr(w, 'a scheme 3 lock always captures the checklist');
  const missing = lockProblems(ep, vi, { requireChecklist: lock.hashScheme === 3 });
  if (missing.length) d.snapErr(w, 'locked input version is incomplete: ' + missing[0]);
  const broken = 'the inputs do not match the lock hash; locked inputs cannot change without making a new version (and shared fields cannot change without a new episode version)';
  if (lock.hashScheme === 1) {
    if (L.counts !== null || L.acknowledged !== null) d.snapErr(w, 'a scheme 1 lock has no counts or acknowledgement');
    if (legacyHash(ep, vi, 1) !== lock.hash) d.snapErr(w, broken);
    return lock;
  }
  d.snapKeys(L.counts, ['judgement', 'uncited', 'total'], [], w + ' counts');
  const c = {}; ['judgement', 'uncited', 'total'].forEach(k => { c[k] = d.snapNum(L.counts[k], [0, 10000], w + ' counts ' + k, true); });
  if (typeof L.acknowledged !== 'boolean') d.snapErr(w + ' acknowledged', 'expected true or false');
  lock.counts = c; lock.acknowledged = L.acknowledged;
  const need = lockAcknowledgement(ep, vi);
  if (c.judgement !== need.judgement || c.uncited !== need.uncited || c.total !== need.total) d.snapErr(w + ' counts', 'the recorded counts do not match the inputs');
  if (need.needed && !lock.acknowledged) d.snapErr(w, 'this input version needed an acknowledgement at lock time and has none');
  if (!need.needed && lock.acknowledged) d.snapErr(w, 'an acknowledgement is recorded but none was needed');
  const meta = { counts: c, acknowledged: lock.acknowledged };
  if ((lock.hashScheme === 2 ? legacyHash(ep, vi, 2, meta) : variantHash(ep, vi, meta)) !== lock.hash) d.snapErr(w, broken);
  return lock;
}
function calOutcome(o, w, ep, ctx){
  const d = calDeps();
  d.snapKeys(o, ['layer', 'result', 'sourceIds', 'note', 'contested'], [], w);
  const out = { layer: d.snapNum(o.layer, [0, ep.layerNames.length - 1], w + ' layer', true),
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
function allLocked(ep){ return ep.variants.length > 0 && ep.variants.every(v => v.lock); }
function anyLocked(ep){ return ep.variants.some(v => v.lock); }

// What still has to be filled in before an input version can be locked (empty list when ready). The checklist is
// required for new locks; locks carried over from older schemas did not capture it.
function lockProblems(ep, vi, opts){
  const p = [], v = ep.variants[vi || 0], requireChecklist = !opts || opts.requireChecklist !== false;
  if (!ep.id) p.push('an id');
  if (!ep.name.trim()) p.push('a name');
  if (!ep.asOfDate) p.push('an as-of date');
  if (!ep.asOfRule.trim()) p.push('the as-of rule');
  if (!ep.outcomeHorizon.trim()) p.push('the outcome horizon');
  if (!ep.outcomeMeasure.trim()) p.push('the outcome measure');
  if (!ep.scorer.knewAboutOutcome.trim()) p.push('what the scorer already knew about the outcome');
  if (requireChecklist) calDeps().SCORER_CHECKLIST.forEach(c => { if (!ep.scorer.checklist[c.key]) p.push('checklist: ' + c.text.toLowerCase()); });
  if (!v.label.trim()) p.push('an input version label');
  if (!v.settings.entryDef) p.push('settings entryDef');
  if (!v.settings.capexModel) p.push('settings capexModel');
  EP_SETTING_KEYS.forEach(k => { if (v.settings[k].value === null) p.push('settings ' + k); });
  ep.layerNames.forEach((n, i) => {
    if (!n.trim()) p.push('layer ' + (i + 1) + ' name');
    calRecords(v.layers[i].inputs).forEach(([k, r]) => { if (r.value === null) p.push('layer ' + (i + 1) + ' ' + k); });
  });
  return p;
}
function calRecords(inputs){
  const out = [];
  EP_LAYER_KEYS.forEach(k => out.push([k, inputs[k]]));
  ['driftP', 'marginP'].forEach(k => inputs[k].forEach((r, j) => out.push([k + '[' + j + ']', r])));
  return out;
}
// Records of one input version (default the first).
function allRecords(ep, vi){
  const v = ep.variants[vi || 0];
  const out = EP_SETTING_KEYS.map(k => ['settings ' + k, v.settings[k]]);
  v.layers.forEach((L, i) => calRecords(L.inputs).forEach(([k, r]) => out.push(['layer ' + (i + 1) + ' ' + k, r])));
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
// Export file: NAME.episode.json when every input of every version is cited; NAME.private.json (gitignored) with a
// warning when any input is uncited, because such a file must stay out of the public repository.
function exportEpisodeFile(ep){
  const text = exportEpisodeText(ep), uncited = unsourcedInputs(ep);
  const base = (ep.id || 'episode') + '-v' + ep.version;
  return { text, uncited, isPrivate: uncited.length > 0, filename: base + (uncited.length ? '.private.json' : '.episode.json'),
    warning: uncited.length ? uncited.length + ' input' + (uncited.length === 1 ? ' is' : 's are') + ' uncited, so this file is named .private.json. Keep it out of the repository (calibration/private/ and *.private.json are gitignored).' : '' };
}

/* ---------- Workflow: draft, lock each input version, outcomes ---------- */
// Lock-time acknowledgement for one input version: needed when more than half its filled inputs are judgement or
// any is uncited. The page asks "Lock anyway" or "Cancel"; locking is never blocked; the answer and counts are
// recorded in the lock and covered by its hash.
function lockAcknowledgement(ep, vi){
  const js = judgementShare(ep, vi), uncited = allRecords(ep, vi).filter(([, r]) => r.value !== null && !r.sourceIds.length).length;
  const needed = js.heavy || uncited > 0;
  const parts = [];
  if (js.heavy) parts.push(js.judgement + ' of ' + js.total + ' filled inputs are judgement');
  if (uncited) parts.push(uncited + ' input' + (uncited === 1 ? ' is' : 's are') + ' uncited');
  const label = ep.variants[vi || 0].label;
  return { needed, judgement: js.judgement, uncited, total: js.total,
    message: needed ? 'Before locking' + (label ? ' “' + label + '”' : '') + ': ' + parts.join(', and ') + '. Lock anyway, or cancel and add sources?' : '' };
}
function lockVariant(ep, vi, now, opts){
  if (!ep.variants[vi]) throw new Error('No such input version.');
  if (ep.variants[vi].lock) throw new Error('This input version is already locked. Make a new episode version to change its inputs.');
  const problems = lockProblems(ep, vi);
  if (problems.length) throw new Error('Not ready to lock. Still needed: ' + problems.join(', ') + '.');
  const copy = validateEpisode(JSON.parse(JSON.stringify(ep)));
  const ack = lockAcknowledgement(copy, vi);
  if (ack.needed && !(opts && opts.acknowledged)) throw new Error('Needs acknowledgement: ' + ack.message);
  const meta = { counts: { judgement: ack.judgement, uncited: ack.uncited, total: ack.total }, acknowledged: ack.needed };
  copy.variants[vi].lock = { hash: variantHash(copy, vi, meta), lockedAt: (now || new Date()).toISOString(), modelVersion: calDeps().MODEL_VERSION,
    hashScheme: 3, counts: meta.counts, acknowledged: meta.acknowledged, checklistCaptured: true };
  return validateEpisode(copy);
}
// Convenience for single-version episodes.
function lockEpisode(ep, now, opts){ return lockVariant(ep, 0, now, opts); }
// Add an input version (for example "Measured" next to "Hype"), starting from a copy of another version's inputs.
// Not allowed once outcomes are recorded: its inputs would then be entered with the outcome already in view.
function addVariant(ep, label, fromIndex){
  if (ep.outcomes.length) throw new Error('Outcomes are already recorded, so a new input version would be entered with the outcome in view. Make a new episode version instead.');
  if (ep.variants.length >= EP_MAX_VARIANTS) throw new Error('An episode can have at most ' + EP_MAX_VARIANTS + ' input versions.');
  const name = String(label || '').trim();
  if (!name) throw new Error('Give the input version a label.');
  if (ep.variants.some(v => v.label.trim() === name)) throw new Error('Another input version already has that label.');
  const copy = JSON.parse(JSON.stringify(ep)), src = copy.variants[fromIndex || 0];
  copy.variants.push({ label: name, settings: JSON.parse(JSON.stringify(src.settings)), layers: JSON.parse(JSON.stringify(src.layers)), lock: null });
  return validateEpisode(copy);
}
// A new episode version keeps everything as a starting point, unlocks every input version and clears outcomes. It
// links to the previous version through a hash of that version's lock hashes.
function newEpisodeVersion(ep){
  if (!anyLocked(ep)) throw new Error('Only a locked episode needs a new version; a draft can be edited directly.');
  const copy = JSON.parse(JSON.stringify(ep));
  copy.version = ep.version + 1;
  copy.previousHash = calSha256(ep.variants.filter(v => v.lock).map(v => v.lock.hash).join(','));
  copy.variants.forEach(v => { v.lock = null; });
  copy.outcomes = [];
  return validateEpisode(copy);
}
function setOutcome(ep, outcome){
  if (!allLocked(ep)) throw new Error('Outcomes can only be entered after every input version is locked.');
  const copy = JSON.parse(JSON.stringify(ep));
  copy.outcomes = copy.outcomes.filter(o => o.layer !== outcome.layer).concat([outcome]).sort((a, b) => a.layer - b.layer);
  return validateEpisode(copy);
}

/* ---------- Derived-input helper ---------- */
// Adoption speed (years from 10% to 90%) from an early-phase doubling time T: speed = ln(81) / ln(2) x T. Applies to
// the early, near-exponential phase only; the midpoint is a separate input.
function doublingTimeToSpeed(T){
  const d = calDeps(), r = d.GLOBAL_RANGES.speed;
  if (typeof T !== 'number' || !isFinite(T) || T <= 0) throw new Error('Enter a doubling time in years, greater than zero.');
  const value = Math.round(EP_LN81_LN2 * T * 100) / 100;
  if (value < r[0] || value > r[1]) throw new Error('A doubling time of ' + T + ' years gives a speed of ' + value + ' years, outside the model range ' + r[0] + ' to ' + r[1] + '.');
  return { value, calculation: 'speed = ln(81) / ln(2) x doubling time = ' + EP_LN81_LN2.toFixed(4) + ' x ' + T + ' years = ' + value + ' years. Early-phase doubling time only; the midpoint is set separately.' };
}

/* ---------- Basis mix ---------- */
// Judgement share of one input version's filled inputs; uncited judgements count toward it like any other judgement.
function judgementShare(ep, vi){
  const filled = allRecords(ep, vi).filter(([, r]) => r.value !== null);
  if (!filled.length) return { judgement: 0, uncited: 0, total: 0, share: 0, heavy: false };
  const j = filled.filter(([, r]) => r.basis === 'judgement').length;
  const u = filled.filter(([, r]) => isUncitedJudgement(r)).length;
  return { judgement: j, uncited: u, total: filled.length, share: j / filled.length, heavy: j / filled.length > 0.5 };
}
function isUncitedJudgement(r){ return r.value !== null && r.basis === 'judgement' && !r.sourceIds.length; }
// Numeric inputs without a cited source, across every input version. The repository test requires this to be
// empty for every committed file under calibration/; export uses it to suggest a .private.json name.
function unsourcedInputs(ep){
  const out = [];
  ep.variants.forEach((v, vi) => allRecords(ep, vi).forEach(([k, r]) => {
    if (r.value !== null && !r.sourceIds.length) out.push((ep.variants.length > 1 ? (v.label || 'version ' + (vi + 1)) + ': ' : '') + k);
  }));
  return out;
}

/* ---------- Comparison ---------- */
function episodeModelInputs(ep, vi){
  const v = ep.variants[vi || 0], s = v.settings, G = {};
  ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'].forEach(k => { G[k] = s[k].value; });
  G.entryDef = s.entryDef; G.capexModel = s.capexModel; G.phases = [s.phase2Start.value, s.phase3Start.value];
  const layers = v.layers.map((L, i) => {
    const o = { id: 'layer' + (i + 1), name: ep.layerNames[i] };
    EP_LAYER_KEYS.forEach(k => { o[k] = L.inputs[k].value; });
    o.driftP = L.inputs.driftP.map(r => r.value); o.marginP = L.inputs.marginP.map(r => r.value);
    return o;
  });
  return { G, layers };
}
// Judgement share and uncited count from one version's lock record. Scheme 1 locks did not record them; locked
// inputs cannot change, so the counts are computed from the inputs and marked as such.
function basisFromLock(ep, vi){
  const lock = ep.variants[vi || 0].lock;
  const c = lock.counts || (() => { const a = lockAcknowledgement(ep, vi || 0); return { judgement: a.judgement, uncited: a.uncited, total: a.total }; })();
  return { judgement: c.judgement, uncited: c.uncited, total: c.total, share: c.total ? c.judgement / c.total : 0,
    acknowledged: lock.acknowledged, recorded: !!lock.counts, checklistCaptured: lock.checklistCaptured };
}
// For each layer of every episode with at least one locked input version: the model verdict for each locked version
// (current model), side by side, against the recorded outcome. Counts and the caveat; never a hit rate.
function compareEpisodes(episodes){
  const d = calDeps(), groups = [];
  episodes.filter(anyLocked).forEach(ep => {
    const locked = ep.variants.map((v, vi) => vi).filter(vi => ep.variants[vi].lock);
    const runs = locked.map(vi => {
      const m = episodeModelInputs(ep, vi), lock = ep.variants[vi].lock;
      return { label: ep.variants[vi].label, basis: basisFromLock(ep, vi), lockedModelVersion: lock.modelVersion,
        versionDiffers: lock.modelVersion !== d.MODEL_VERSION, results: m.layers.map(L => d.runLayer(L, m.G)) };
    });
    const rows = ep.layerNames.map((name, i) => {
      const outcome = ep.outcomes.find(x => x.layer === i) || null;
      return { layer: name, outcome: outcome ? outcome.result : null,
        variants: runs.map(r => ({ label: r.label, verdict: r.results[i].bin, npv: r.results[i].npv, modelSaysEarnsCost: r.results[i].npv >= 0,
          basis: r.basis, lockedModelVersion: r.lockedModelVersion, versionDiffers: r.versionDiffers })) };
    });
    groups.push({ episode: ep.name, episodeId: ep.id, version: ep.version, allLocked: allLocked(ep), rows });
  });
  return { groups, episodes: groups.length, layers: groups.reduce((a, g) => a + g.rows.length, 0), caveat: EP_FEW_CASES, banner: EP_BANNER,
    currentModelVersion: d.MODEL_VERSION };
}

if (typeof module !== 'undefined') module.exports = { EP_FORMAT, EP_SCHEMA_VERSION, EP_SCHEMA_READABLE, EP_MAX_VARIANTS, EP_BANNER, EP_FEW_CASES, EP_SETTING_KEYS, EP_LAYER_KEYS, EP_LN81_LN2, calSha256, calCanonical, legacyHash, variantHash, calEmptyRecord, calEmptyInputs, calEmptyVariant, templateEpisode, validateEpisode, lockProblems, allRecords, importEpisodeText, exportEpisodeText, exportEpisodeFile, lockAcknowledgement, lockVariant, lockEpisode, addVariant, newEpisodeVersion, setOutcome, doublingTimeToSpeed, judgementShare, isUncitedJudgement, unsourcedInputs, sourceValidForInput, sourceValidForOutcome, episodeModelInputs, basisFromLock, compareEpisodes, allLocked, anyLocked };
