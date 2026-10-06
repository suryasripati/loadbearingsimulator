// Case library: format, validation rules and the build. Every case here is the SYNTHETIC fixture from
// test/support/make-synthetic-cases.js (placeholder values, fictitious sources): not data, never shipped.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('../src/cases.js');
const D = require('../src/defaults.js');
const { build } = require('../scripts/build.js');
const { makeCase } = require('./support/make-synthetic-cases.js');

const root = path.join(__dirname, '..');
const fresh = (n = 3, unit = '£m') => JSON.parse(JSON.stringify(makeCase(n, unit)));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-cases-'));
// Puts one case in a temp folder and builds from it alone.
function buildWith(c, opts = {}){
  const dir = tmp(), out = tmp();
  fs.writeFileSync(path.join(dir, (c.id || 'x') + '.case.json'), typeof c === 'string' ? c : JSON.stringify(c));
  return build(Object.assign({ caseDirs: [dir], outDir: out, dev: true }, opts));
}

// One mutation per rule, with the message the build must report.
const RULES = [
  ['sourced value with no source', c => { c.settings.pool.sourceIds = []; }, /settings pool: a sourced value needs at least one source/],
  ['derived value with no source', c => { c.settings.speed.sourceIds = []; }, /settings speed: a derived value needs at least one source/],
  ['derived value with no calculation', c => { c.settings.speed.note = ' '; }, /a derived value needs its calculation in the note/],
  ['judgement with no rationale', c => { c.layers[0].inputs.evidence.note = ''; }, /layer 1 evidence: a judgement needs a rationale in the note/],
  ['value outside the tool range', c => { c.settings.disc.value = D.GLOBAL_RANGES.disc[1] + 1; }, /outside the tool’s range/],
  ['layer value outside the tool range', c => { c.layers[1].inputs.capex.value = D.LAYER_RANGES.capex[1] + 1; }, /layer 2 capex value: value .* outside the tool’s range/],
  ['fraction where a whole number is needed', c => { c.settings.entry.value = 1.5; }, /expected a whole number/],
  ['input source published after the as-of date', c => { c.sources[0].publicationDate = '1846-01-01'; }, /source "SYN-P1" was not available at the as-of date 1845-06-30 \(published 1846-01-01\)/],
  ['compiled series ending after the as-of date', c => { c.sources[1].seriesEndsOn = '1850-12-31'; }, /a compiled series must end on or before it/],
  ['compiled source without seriesEndsOn', c => { delete c.sources[1].seriesEndsOn; }, /a compiled source needs seriesEndsOn/],
  ['outcome source backing an input', c => { c.settings.pool.sourceIds = ['SYN-O1']; }, /an outcome source cannot back an input/],
  ['outcome source published on or before the as-of date', c => { c.sources[2].publicationDate = '1845-06-30'; }, /an outcome source must be published after the as-of date/],
  ['outcome citing a period source', c => { c.outcomes[0].sourceIds = ['SYN-P1']; }, /outcome source "SYN-P1" must be published after the as-of date/],
  ['yes outcome with no source', c => { c.outcomes[0].status = 'yes'; c.outcomes[0].sourceIds = []; }, /an outcome of yes needs a source/],
  ['no outcome with no source', c => { c.outcomes[1].status = 'no'; c.outcomes[1].sourceIds = []; }, /an outcome of no needs a source/],
  ['contested outcome with one source', c => { c.outcomes[2].sourceIds = ['SYN-O1']; }, /a contested outcome needs at least two sources/],
  ['contested outcome without both positions', c => { c.outcomes[2].summary = 'Disputed.'; }, /states both positions/],
  ['unknown source id', c => { c.settings.pool.sourceIds = ['NOPE']; }, /unknown source "NOPE"/],
  ['unknown field', c => { c.extra = 1; }, /unknown field "extra"/],
  ['missing field', c => { delete c.asOfRule; }, /missing field "asOfRule"/],
  ['bad money unit', c => { c.moneyUnit = 'pounds'; }, /moneyUnit: expected a currency symbol/],
  ['hindsight disclosure on two lines', c => { c.hindsightDisclosure = 'a\nb'; }, /must be one line/],
  ['bad as-of date', c => { c.asOfDate = '1845-02-30'; }, /not a real calendar date/],
  ['no layers', c => { c.layers = []; c.outcomes = []; c.versions = []; }, /expected 1 to 6 layers/],
  ['seven layers', c => { const L = c.layers[0]; c.layers = Array.from({ length: 7 }, (_, i) => Object.assign({}, L, { id: 'l' + i })); c.outcomes = []; c.versions = []; }, /expected 1 to 6 layers/],
  ['duplicate layer id', c => { c.layers[1].id = c.layers[0].id; c.outcomes = []; c.versions = []; }, /duplicate layer id/],
  ['four versions', c => { c.versions = [1, 2, 3, 4].map(i => ({ id: 'v' + i, label: 'V' + i, settings: { mid: c.settings.mid } })); }, /at most 3 versions/],
  ['version with no override', c => { c.versions[0] = { id: 'empty', label: 'Empty' }; }, /a version must override at least one input/],
  ['phase 2 not before phase 3', c => { c.settings.phase2Start.value = 9; c.settings.phase3Start.value = 9; }, /phase 2 must start before phase 3/],
  ['wrong number of phase values', c => { c.layers[0].inputs.driftP.pop(); }, /expected three phase values/],
  ['markup in a layer name', c => { c.layers[0].name = '<img src=x onerror=alert(1)>'; }, /layer 1 name: must not contain/],
  ['bad basis', c => { c.settings.pool.basis = 'guess'; }, /expected sourced, derived or judgement/],
];

test('validation: the synthetic fixtures (1, 3 and 6 layers) pass', () => {
  for (const [n, u] of [[1, '$B'], [3, '£m'], [6, '€bn']]) assert.doesNotThrow(() => C.validateCase(fresh(n, u)));
  // The committed fixture files match the generator.
  for (const n of [1, 3, 6]) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, 'support', 'cases', 'synthetic-' + n + '.case.json'), 'utf8')).id, 'synthetic-' + n + '-layer');
});

for (const [name, mutate, msg] of RULES) {
  test('validation and build fail: ' + name, () => {
    const c = fresh(); mutate(c);
    assert.throws(() => C.validateCase(c, 'case'), msg);
    let err = null;
    try { buildWith(c); } catch (e) { err = e; }
    assert.ok(err, 'build must fail');
    assert.match(err.message, /^Case validation failed:/);
    assert.match(err.message, msg);
  });
}

test('validation: a judgement value needs no source; a sourced value may carry a note', () => {
  const c = fresh();
  c.settings.mid = { value: 8, basis: 'judgement', sourceIds: [], note: 'Synthetic rationale.' };
  c.settings.pool.note = 'Synthetic note on a sourced value.';
  assert.doesNotThrow(() => C.validateCase(c));
  Object.assign(c.outcomes[0], { status: 'unknown', sourceIds: [] });
  assert.doesNotThrow(() => C.validateCase(c), 'unknown outcomes need no source');
});

test('date rules: period sources on or before the as-of date; compiled by series end; outcomes strictly after', () => {
  const a = '1845-06-30';
  assert.equal(C.sourceForInput({ kind: 'period', publicationDate: a }, a), true);
  assert.equal(C.sourceForInput({ kind: 'period', publicationDate: '1845-07-01' }, a), false);
  assert.equal(C.sourceForInput({ kind: 'compiled', publicationDate: '2001-01-01', seriesEndsOn: a }, a), true);
  assert.equal(C.sourceForInput({ kind: 'compiled', publicationDate: '2001-01-01', seriesEndsOn: '1845-07-01' }, a), false);
  assert.equal(C.sourceForInput({ kind: 'outcome', publicationDate: '1800-01-01' }, a), false);
  assert.equal(C.sourceForOutcome({ publicationDate: a }, a), false);
  assert.equal(C.sourceForOutcome({ publicationDate: '1845-07-01' }, a), true);
});

test('build: fails on invalid JSON, duplicate ids and synthetic ids in the live build; CLI exits 1', () => {
  assert.throws(() => buildWith('{not json'), /not valid JSON/);
  const dir = tmp(), out = tmp();
  fs.writeFileSync(path.join(dir, 'a.case.json'), JSON.stringify(fresh()));
  fs.writeFileSync(path.join(dir, 'b.case.json'), JSON.stringify(fresh()));
  assert.throws(() => build({ caseDirs: [dir], outDir: out, dev: true }), /duplicate case id/);
  assert.throws(() => buildWith(fresh(), { dev: false }), /synthetic fixtures are never shipped/);
  // CLI: a bad case gives a non-zero exit and the message on stderr; a good one builds.
  const bad = fresh(); bad.settings.pool.sourceIds = [];
  const bdir = tmp(); fs.writeFileSync(path.join(bdir, 'x.case.json'), JSON.stringify(bad));
  let code = 0, stderr = '';
  try { execFileSync(process.execPath, ['scripts/build.js', '--dev', '--cases=' + bdir, '--out=' + tmp()], { cwd: root, stdio: 'pipe' }); }
  catch (e) { code = e.status; stderr = String(e.stderr); }
  assert.equal(code, 1);
  assert.match(stderr, /a sourced value needs at least one source/);
  const gdir = tmp(), gout = tmp(); fs.writeFileSync(path.join(gdir, 'x.case.json'), JSON.stringify(fresh()));
  const ok = execFileSync(process.execPath, ['scripts/build.js', '--dev', '--cases=' + gdir, '--out=' + gout], { cwd: root }).toString();
  assert.match(ok, /1 case: synthetic-3-layer/);
  assert.ok(fs.existsSync(path.join(gout, 'index.html')));
});

test('build: the live build has no cases today and never includes the synthetic fixtures; the dev build does', () => {
  const live = build({ outDir: tmp() }), dev = build({ dev: true, outDir: tmp() });
  assert.deepEqual(live.cases, fs.existsSync(path.join(root, 'cases')) ? fs.readdirSync(path.join(root, 'cases')).filter(f => f.endsWith('.case.json')).map(f => JSON.parse(fs.readFileSync(path.join(root, 'cases', f), 'utf8')).id) : []);
  assert.ok(live.cases.every(id => !/^synthetic/.test(id)));
  assert.deepEqual(dev.cases.filter(id => /^synthetic/.test(id)).sort(), ['synthetic-1-layer', 'synthetic-3-layer', 'synthetic-6-layer']);
  const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
  assert.ok(!/synthetic-\d-layer/.test(html), 'docs/index.html carries no fixture');
  assert.ok(/^docs-dev\/$/m.test(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')), 'docs-dev/ is gitignored');
});

test('money unit: parsed and used for formatting; bad units rejected', () => {
  assert.deepEqual(C.parseMoneyUnit('£m'), { prefix: '£', suffix: 'm', unit: '£m' });
  assert.equal(C.formatMoney(1234.4, '€bn'), '€1234bn');
  assert.equal(C.formatMoney(-5, '$B'), '−$5B');
  for (const u of ['', 'GBP', '£ m', '£million', 12]) assert.equal(C.parseMoneyUnit(u), null, String(u));
});

test('case state: versions override only what they name; every input has its record; allocations are the placeholder split', () => {
  const c = C.validateCase(fresh());
  const base = C.caseState(c, 'base'), m = C.caseState(c, 'measured'), none = C.caseState(c, 'nope');
  assert.equal(base.versionId, 'base'); assert.equal(none.versionId, 'base');
  assert.equal(m.G.speed, 12); assert.equal(m.layers[1].capex, 180);
  assert.equal(m.recs['settings.speed'].basis, 'judgement');
  assert.deepEqual(Object.assign({}, m.G, { speed: base.G.speed }), base.G);
  assert.equal(m.layers[0].capex, base.layers[0].capex);
  assert.ok(base.layers.every(L => L.alloc === C.CASE_DEFAULT_ALLOC));
  // One record per input: 11 settings + per layer 11 inputs + 3 drift + 3 margin.
  assert.equal(Object.keys(base.recs).length, 11 + c.layers.length * (C.CASE_LAYER_KEYS.length + 6));
  assert.equal(base.recs['layer syn-1.marginP[2]'].value, base.layers[0].marginP[2]);
});

test('what happened: verdict against outcome per layer, counts by status, the banner, and no hit rate', () => {
  const M = require('../src/model.js');
  const c = C.validateCase(fresh(6, '€bn')), st = C.caseState(c, 'base');
  const G = Object.assign({}, D.DEFAULT_G, st.G);
  const res = st.layers.map(L => M.runLayer(L, G));
  const w = C.caseOutcomeRows(c, st.layers, res);
  assert.equal(w.banner, 'Scored by someone who knew the outcome. Treat as a sanity check, not calibration. Too few cases for statistical conclusions.');
  assert.deepEqual(w.counts, { layers: 6, yes: 2, no: 2, unknown: 1, contested: 1, none: 0 });
  w.rows.forEach((r, i) => { assert.equal(r.verdict, res[i].bin); assert.equal(r.earnsCost, res[i].npv >= 0); });
  assert.ok(!('hitRate' in w) && !Object.keys(w.counts).some(k => /hit|rate|accur/i.test(k)));
});
