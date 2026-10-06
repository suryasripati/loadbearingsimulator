// Case library: plain case files (cases/*.case.json) bundled into the page at build time. Users never import or edit
// them. This file validates a case (the build fails on any error), turns a case and version into page state, formats
// the case's money unit, and lines up the model's verdicts against recorded outcomes. Pure functions, no DOM.
// CommonJS export for tests and the build; stripped by the build and inlined before the UI code.
//
// Rules (also in CLAUDE.md): factual claims cite public sources. Inputs may cite only sources available at the as-of
// date (a period source published on or before it, or a compiled series that ends on or before it). Outcomes cite
// sources published after it. Sourced and derived values need sources; derived values show their calculation in the
// note; judgement values need a rationale in the note, may have no source, and are always labelled on the page.

const CASE_FORMAT = 'load-bearing-simulator-case';
const CASE_SCHEMA_VERSION = 1;
const CASE_MAX_LAYERS = 6;
const CASE_MAX_VERSIONS = 3;
const CASE_SETTING_KEYS = ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult', 'phase2Start', 'phase3Start'];
const CASE_LAYER_KEYS = ['evidence', 'share', 'offset', 'steepness', 'capex', 'buildStart', 'buildYears', 'unitCostDecline', 'passThrough', 'life', 'debt'];
const CASE_INT_KEYS = ['entry', 'phase2Start', 'phase3Start', 'evidence', 'buildStart', 'buildYears'];
const CASE_BASIS = ['sourced', 'derived', 'judgement'];
const CASE_SOURCE_KINDS = ['period', 'compiled', 'outcome'];
const CASE_OUTCOMES = ['yes', 'no', 'unknown', 'contested'];
const CASE_BANNER = 'Scored by someone who knew the outcome. Treat as a sanity check, not calibration. Too few cases for statistical conclusions.';
const CASE_DEFAULT_ALLOC = 20; // placeholder equal split; allocations are personal and never part of a case

function caseDeps(){
  if (typeof module !== 'undefined' && typeof require === 'function') return Object.assign({}, require('./defaults.js'));
  return { LAYER_RANGES, GLOBAL_RANGES, PHASE_RANGES };
}

/* ---------- Money unit ---------- */
// "$B", "£m", "€bn": leading symbol, then a letter suffix. Used in every money label.
function parseMoneyUnit(u){
  const m = /^([^\sA-Za-z0-9]{1,3})([A-Za-z]{0,3})$/.exec(String(u || ''));
  if (!m) return null;
  return { prefix: m[1], suffix: m[2], unit: m[1] + m[2] };
}
function formatMoney(x, unit){
  const u = parseMoneyUnit(unit) || { prefix: '$', suffix: 'B' };
  return (x < 0 ? '−' : '') + u.prefix + Math.abs(x).toFixed(0) + u.suffix;
}

/* ---------- Validation ---------- */
function caseErr(where, what){ throw new Error(where + ': ' + what); }
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function caseKeys(o, required, optional, where){
  if (!isObj(o)) caseErr(where, 'expected an object');
  const ok = required.concat(optional || []);
  Object.keys(o).forEach(k => { if (ok.indexOf(k) < 0) caseErr(where, 'unknown field "' + k + '"'); });
  required.forEach(k => { if (!Object.prototype.hasOwnProperty.call(o, k)) caseErr(where, 'missing field "' + k + '"'); });
}
function caseText(v, where, max, allowEmpty){
  if (typeof v !== 'string') caseErr(where, 'expected text');
  if (!allowEmpty && !v.trim()) caseErr(where, 'must not be empty');
  if (v.length > (max || 2000)) caseErr(where, 'text longer than ' + (max || 2000) + ' characters');
  return v;
}
function caseDay(v, where){
  caseText(v, where, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) caseErr(where, 'expected a date (YYYY-MM-DD)');
  const y = +m[1], mo = +m[2], d = +m[3];
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo < 1 || mo > 12 || d < 1 || d > dim[mo - 1]) caseErr(where, 'not a real calendar date');
  return v;
}
function caseNum(v, range, where, integer){
  if (typeof v !== 'number' || !isFinite(v)) caseErr(where, 'expected a number');
  if (v < range[0] || v > range[1]) caseErr(where, 'value ' + v + ' is outside the tool’s range ' + range[0] + ' to ' + range[1]);
  if (integer && Math.round(v) !== v) caseErr(where, 'expected a whole number');
  return v;
}
// Can this source back an input? Only what was available at the as-of date.
function sourceForInput(src, asOfDate){
  if (src.kind === 'period') return src.publicationDate <= asOfDate;
  if (src.kind === 'compiled') return !!src.seriesEndsOn && src.seriesEndsOn <= asOfDate;
  return false; // outcome sources never back inputs
}
// Can this source back an outcome? Only evidence published after the as-of date.
function sourceForOutcome(src, asOfDate){ return src.publicationDate > asOfDate; }

function caseRecord(r, where, range, integer, ctx){
  caseKeys(r, ['value', 'basis', 'sourceIds', 'note'], [], where);
  const out = { value: caseNum(r.value, range, where + ' value', integer), basis: r.basis, sourceIds: [], note: caseText(r.note, where + ' note', 2000, true) };
  if (CASE_BASIS.indexOf(r.basis) < 0) caseErr(where + ' basis', 'expected sourced, derived or judgement');
  if (!Array.isArray(r.sourceIds)) caseErr(where + ' sourceIds', 'expected a list');
  r.sourceIds.forEach(id => {
    const s = ctx.byId[id];
    if (!s) caseErr(where + ' sourceIds', 'unknown source "' + id + '"');
    if (!sourceForInput(s, ctx.asOfDate)) caseErr(where, 'source "' + id + '" was not available at the as-of date ' + ctx.asOfDate
      + (s.kind === 'compiled' ? ' (a compiled series must end on or before it)' : s.kind === 'outcome' ? ' (an outcome source cannot back an input)' : ' (published ' + s.publicationDate + ')'));
    out.sourceIds.push(id);
  });
  if (out.basis !== 'judgement' && !out.sourceIds.length) caseErr(where, 'a ' + out.basis + ' value needs at least one source');
  if (out.basis === 'derived' && !out.note.trim()) caseErr(where, 'a derived value needs its calculation in the note');
  if (out.basis === 'judgement' && !out.note.trim()) caseErr(where, 'a judgement needs a rationale in the note');
  return out;
}
function settingRange(k, d){ return k === 'phase2Start' ? d.PHASE_RANGES[0] : k === 'phase3Start' ? d.PHASE_RANGES[1] : d.GLOBAL_RANGES[k]; }
function caseSettings(S, where, ctx, partial){
  const d = caseDeps();
  caseKeys(S, partial ? [] : CASE_SETTING_KEYS.concat(['entryDef', 'capexModel']), partial ? CASE_SETTING_KEYS.concat(['entryDef', 'capexModel']) : [], where);
  const out = {};
  CASE_SETTING_KEYS.forEach(k => { if (k in S) out[k] = caseRecord(S[k], where + ' ' + k, settingRange(k, d), CASE_INT_KEYS.indexOf(k) >= 0, ctx); });
  if ('entryDef' in S) { if (['A', 'B'].indexOf(S.entryDef) < 0) caseErr(where + ' entryDef', 'expected "A" or "B"'); out.entryDef = S.entryDef; }
  if ('capexModel' in S) { if (['sustaining', 'vintage'].indexOf(S.capexModel) < 0) caseErr(where + ' capexModel', 'expected "sustaining" or "vintage"'); out.capexModel = S.capexModel; }
  return out;
}
function caseInputs(I, where, ctx, partial){
  const d = caseDeps(), all = CASE_LAYER_KEYS.concat(['driftP', 'marginP']);
  caseKeys(I, partial ? [] : all, partial ? all : [], where);
  const out = {};
  CASE_LAYER_KEYS.forEach(k => { if (k in I) out[k] = caseRecord(I[k], where + ' ' + k, d.LAYER_RANGES[k], CASE_INT_KEYS.indexOf(k) >= 0, ctx); });
  ['driftP', 'marginP'].forEach(k => {
    if (!(k in I)) return;
    if (!Array.isArray(I[k]) || I[k].length !== 3) caseErr(where + ' ' + k, 'expected three phase values');
    out[k] = I[k].map((r, j) => caseRecord(r, where + ' ' + k + '[' + j + ']', d.LAYER_RANGES[k], false, ctx));
  });
  return out;
}
function phaseOrder(settings, where){
  const p2 = settings.phase2Start && settings.phase2Start.value, p3 = settings.phase3Start && settings.phase3Start.value;
  if (p2 != null && p3 != null && p2 >= p3) caseErr(where, 'phase 2 must start before phase 3');
}

function validateCase(raw, where0){
  const where = where0 || 'Case';
  caseKeys(raw, ['format', 'schemaVersion', 'id', 'title', 'subtitle', 'asOfDate', 'asOfRule', 'hindsightDisclosure', 'moneyUnit', 'sources', 'settings', 'layers', 'outcomes'], ['versions'], where);
  if (raw.format !== CASE_FORMAT) caseErr(where, 'format must be "' + CASE_FORMAT + '"');
  if (raw.schemaVersion !== CASE_SCHEMA_VERSION) caseErr(where, 'schemaVersion must be ' + CASE_SCHEMA_VERSION);
  const c = { format: CASE_FORMAT, schemaVersion: CASE_SCHEMA_VERSION };
  c.id = caseText(raw.id, where + ' id', 60);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(c.id)) caseErr(where + ' id', 'use lower-case letters, digits and hyphens');
  c.title = caseText(raw.title, where + ' title', 60);
  c.subtitle = caseText(raw.subtitle, where + ' subtitle', 160);
  c.asOfDate = caseDay(raw.asOfDate, where + ' asOfDate');
  c.asOfRule = caseText(raw.asOfRule, where + ' asOfRule', 1000);
  c.hindsightDisclosure = caseText(raw.hindsightDisclosure, where + ' hindsightDisclosure', 240);
  if (/\n/.test(c.hindsightDisclosure)) caseErr(where + ' hindsightDisclosure', 'must be one line');
  if (!parseMoneyUnit(raw.moneyUnit)) caseErr(where + ' moneyUnit', 'expected a currency symbol and an optional unit, e.g. "$B" or "£m"');
  c.moneyUnit = raw.moneyUnit;
  // Sources
  if (!Array.isArray(raw.sources) || raw.sources.length > 200) caseErr(where + ' sources', 'expected a list');
  const byId = {};
  c.sources = raw.sources.map((s, i) => {
    const w = where + ' source ' + (i + 1);
    caseKeys(s, ['id', 'citation', 'publicationDate', 'kind'], ['seriesEndsOn'], w);
    const o = { id: caseText(s.id, w + ' id', 40), citation: caseText(s.citation, w + ' citation', 1000), publicationDate: caseDay(s.publicationDate, w + ' publicationDate'), kind: s.kind, seriesEndsOn: null };
    if (!/^[A-Za-z0-9_-]+$/.test(o.id)) caseErr(w + ' id', 'use letters, digits, hyphens and underscores');
    if (byId[o.id]) caseErr(w + ' id', 'duplicate source id "' + o.id + '"');
    if (CASE_SOURCE_KINDS.indexOf(s.kind) < 0) caseErr(w + ' kind', 'expected period, compiled or outcome');
    if (s.kind === 'compiled') { if (s.seriesEndsOn == null) caseErr(w, 'a compiled source needs seriesEndsOn'); o.seriesEndsOn = caseDay(s.seriesEndsOn, w + ' seriesEndsOn'); }
    else if (s.seriesEndsOn != null) caseErr(w, 'only a compiled source has seriesEndsOn');
    if (s.kind === 'outcome' && !(o.publicationDate > c.asOfDate)) caseErr(w, 'an outcome source must be published after the as-of date ' + c.asOfDate);
    byId[o.id] = o;
    return o;
  });
  const ctx = { byId, asOfDate: c.asOfDate };
  // Settings and layers
  c.settings = caseSettings(raw.settings, where + ' settings', ctx, false);
  phaseOrder(c.settings, where + ' settings');
  if (!Array.isArray(raw.layers) || raw.layers.length < 1 || raw.layers.length > CASE_MAX_LAYERS) caseErr(where + ' layers', 'expected 1 to ' + CASE_MAX_LAYERS + ' layers');
  const ids = new Set();
  c.layers = raw.layers.map((L, i) => {
    const w = where + ' layer ' + (i + 1);
    caseKeys(L, ['id', 'name', 'inputs'], [], w);
    const id = caseText(L.id, w + ' id', 30);
    if (!/^[a-z][a-z0-9-]*$/.test(id)) caseErr(w + ' id', 'use lower-case letters, digits and hyphens, starting with a letter');
    if (ids.has(id)) caseErr(w + ' id', 'duplicate layer id "' + id + '"');
    ids.add(id);
    const name = caseText(L.name, w + ' name', 40);
    // Layer names are drawn into charts and tables, so markup characters are refused.
    if (/[<>&"]/.test(name)) caseErr(w + ' name', 'must not contain < > & or "');
    return { id, name, inputs: caseInputs(L.inputs, w, ctx, false) };
  });
  // Versions: labelled overrides of settings or layer inputs, selected with a pill.
  const vs = raw.versions === undefined ? [] : raw.versions;
  if (!Array.isArray(vs) || vs.length > CASE_MAX_VERSIONS) caseErr(where + ' versions', 'expected at most ' + CASE_MAX_VERSIONS + ' versions');
  const labels = new Set();
  c.versions = vs.map((v, i) => {
    const w = where + ' version ' + (i + 1);
    caseKeys(v, ['id', 'label'], ['settings', 'layers'], w);
    const o = { id: caseText(v.id, w + ' id', 30), label: caseText(v.label, w + ' label', 30), settings: {}, layers: {} };
    if (!/^[a-z0-9][a-z0-9-]*$/.test(o.id) || o.id === 'base') caseErr(w + ' id', 'use lower-case letters, digits and hyphens (not "base")');
    if (labels.has(o.label)) caseErr(w + ' label', 'duplicate version label');
    labels.add(o.label);
    if (v.settings !== undefined) o.settings = caseSettings(v.settings, w + ' settings', ctx, true);
    if (v.layers !== undefined) {
      if (!isObj(v.layers)) caseErr(w + ' layers', 'expected an object keyed by layer id');
      Object.keys(v.layers).forEach(lid => {
        if (!ids.has(lid)) caseErr(w + ' layers', 'unknown layer "' + lid + '"');
        o.layers[lid] = caseInputs(v.layers[lid], w + ' layer ' + lid, ctx, true);
      });
    }
    if (!Object.keys(o.settings).length && !Object.keys(o.layers).length) caseErr(w, 'a version must override at least one input');
    phaseOrder(Object.assign({}, c.settings, o.settings), w + ' settings');
    return o;
  });
  // Outcomes per layer
  if (!Array.isArray(raw.outcomes)) caseErr(where + ' outcomes', 'expected a list');
  const seen = new Set();
  c.outcomes = raw.outcomes.map((o, i) => {
    const w = where + ' outcome ' + (i + 1);
    caseKeys(o, ['layer', 'status', 'summary', 'sourceIds', 'horizon'], [], w);
    if (!ids.has(o.layer)) caseErr(w + ' layer', 'unknown layer "' + o.layer + '"');
    if (seen.has(o.layer)) caseErr(w + ' layer', 'layer "' + o.layer + '" already has an outcome');
    seen.add(o.layer);
    if (CASE_OUTCOMES.indexOf(o.status) < 0) caseErr(w + ' status', 'expected yes, no, unknown or contested');
    const out = { layer: o.layer, status: o.status, summary: caseText(o.summary, w + ' summary', 1500), sourceIds: [], horizon: caseText(o.horizon, w + ' horizon', 200) };
    if (!Array.isArray(o.sourceIds)) caseErr(w + ' sourceIds', 'expected a list');
    o.sourceIds.forEach(id => {
      const s = byId[id];
      if (!s) caseErr(w + ' sourceIds', 'unknown source "' + id + '"');
      if (!sourceForOutcome(s, c.asOfDate)) caseErr(w, 'outcome source "' + id + '" must be published after the as-of date ' + c.asOfDate);
      out.sourceIds.push(id);
    });
    if ((out.status === 'yes' || out.status === 'no') && !out.sourceIds.length) caseErr(w, 'an outcome of ' + out.status + ' needs a source');
    if (out.status === 'contested') {
      if (out.sourceIds.length < 2) caseErr(w, 'a contested outcome needs at least two sources');
      if (!/\bFor:/.test(out.summary) || !/\bAgainst:/.test(out.summary)) caseErr(w, 'a contested outcome states both positions in the summary ("For: … Against: …")');
    }
    return out;
  });
  return c;
}

/* ---------- Case to page state ---------- */
// Apply a version's overrides on top of the base case. Returns plain inputs for the page plus the record (basis,
// sources, note) behind every input, keyed like "settings.pool" or "layer chips.driftP[2]".
function caseState(c, versionId){
  const v = c.versions.find(x => x.id === versionId) || null;
  const settings = Object.assign({}, c.settings, v ? v.settings : {});
  const recs = {};
  const G = {};
  ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'].forEach(k => { G[k] = settings[k].value; recs['settings.' + k] = settings[k]; });
  G.phases = [settings.phase2Start.value, settings.phase3Start.value];
  recs['settings.phase2Start'] = settings.phase2Start; recs['settings.phase3Start'] = settings.phase3Start;
  G.entryDef = settings.entryDef; G.capexModel = settings.capexModel;
  const layers = c.layers.map(L => {
    const inp = Object.assign({}, L.inputs, v && v.layers[L.id] ? v.layers[L.id] : {});
    const o = { id: L.id, name: L.name, alloc: CASE_DEFAULT_ALLOC };
    CASE_LAYER_KEYS.forEach(k => { o[k] = inp[k].value; recs['layer ' + L.id + '.' + k] = inp[k]; });
    o.driftP = inp.driftP.map(r => r.value); o.marginP = inp.marginP.map(r => r.value);
    inp.driftP.forEach((r, j) => { recs['layer ' + L.id + '.driftP[' + j + ']'] = r; });
    inp.marginP.forEach((r, j) => { recs['layer ' + L.id + '.marginP[' + j + ']'] = r; });
    return o;
  });
  return { G, layers, recs, versionId: v ? v.id : 'base', versionLabel: v ? v.label : 'Base' };
}

/* ---------- What happened ---------- */
// The model's verdict (from the page's current results) against each layer's recorded outcome, with counts by status.
// No hit rate: one case is far too few for one.
function caseOutcomeRows(c, layers, results){
  const rows = layers.map((L, i) => {
    const o = c.outcomes.find(x => x.layer === L.id) || null;
    return { layer: L.name, verdict: results[i].bin, earnsCost: results[i].npv >= 0, outcome: o ? o.status : null, summary: o ? o.summary : '', horizon: o ? o.horizon : '', sourceIds: o ? o.sourceIds.slice() : [] };
  });
  const counts = { layers: rows.length, yes: 0, no: 0, unknown: 0, contested: 0, none: 0 };
  rows.forEach(r => { counts[r.outcome || 'none']++; });
  return { rows, counts, banner: CASE_BANNER };
}

if (typeof module !== 'undefined') module.exports = { CASE_FORMAT, CASE_SCHEMA_VERSION, CASE_MAX_LAYERS, CASE_BANNER, CASE_DEFAULT_ALLOC, CASE_SETTING_KEYS, CASE_LAYER_KEYS, parseMoneyUnit, formatMoney, validateCase, caseState, caseOutcomeRows, sourceForInput, sourceForOutcome };
