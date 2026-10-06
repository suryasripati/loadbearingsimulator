// The first real case (cases/railway-mania-1845.case.json) and the case-format features it needs: schema 3
// (source notes, base version name, description, "default" basis), per-case money ranges, and the live build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const C = require('../src/cases.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');
const S = require('../src/snapshots.js');
const { build } = require('../scripts/build.js');

const root = path.join(__dirname, '..');
const RAW = JSON.parse(fs.readFileSync(path.join(root, 'cases', 'railway-mania-1845.case.json'), 'utf8'));
const fresh = () => JSON.parse(JSON.stringify(RAW));
const CASE = C.validateCase(fresh());
const runCase = (versionId) => { const st = C.caseState(CASE, versionId), G = { ...D.DEFAULT_G, ...st.G }; return st.layers.map(L => M.runLayer(L, G)); };

test('the shipped case validates, and the live build includes it (and no synthetic fixture)', () => {
  assert.equal(CASE.id, 'railway-mania-1845');
  assert.equal(CASE.schemaVersion, 4);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-live-'));
  const r = build({ outDir: out });
  assert.ok(r.cases.includes('railway-mania-1845'));
  const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
  assert.ok(html.includes('"id":"railway-mania-1845"'), 'docs/index.html carries the case');
  assert.ok(!/synthetic-\d-layer/.test(html));
});

test('pool and shares: the pool equals its stated calculation and the two shares add to 100%', () => {
  // Authorised miles: 805 in 1844 (L2) + 2,816 in 1845 (L1) = 3,621.
  const miles = 805 + 2816, pool = (2240 * 3280 + miles * 1670) / 1e6;
  assert.equal(miles, 3621);
  assert.equal(Math.round(pool * 100) / 100, CASE.settings.pool.value);
  assert.ok(Math.abs(CASE.layers.reduce((a, L) => a + L.inputs.share.value, 0) - 100) < 1e-9, 'shares add to 100%');
  // Each share is its layer's revenue over the unrounded pool, rounded to one decimal, as its note says.
  assert.equal(Math.round(2240 * 3280 / 1e6 / pool * 1000) / 10, CASE.layers[0].inputs.share.value);
  assert.equal(Math.round(miles * 1670 / 1e6 / pool * 1000) / 10, CASE.layers[1].inputs.share.value);
  // Layer 2 build capex under both versions.
  assert.equal(Math.round(miles * 15600 / 1e5) / 10, CASE.layers[1].inputs.capex.value);
  assert.equal(Math.round(miles * 35700 / 1e5) / 10, CASE.versions[0].layers.authorised.capex.value);
  // Every derived value writes its calculation in the note.
  for (const r of [CASE.settings.pool, CASE.layers[0].inputs.share, CASE.layers[1].inputs.share, CASE.layers[1].inputs.capex]) assert.match(r.note, /3,621|2,240 x/);
});

test('versions: the base is named "Promoters\' plans"; "Existing-line costs" changes only layer 2, and its results differ', () => {
  assert.equal(CASE.baseLabel, "Promoters' plans");
  assert.deepEqual(CASE.versions.map(v => v.label), ['Existing-line costs']);
  const A = runCase('base'), B = runCase('existing-line-costs');
  assert.equal(A[0].npv, B[0].npv, 'layer 1 is the same in both');
  assert.notEqual(A[1].npv, B[1].npv);
  assert.ok(B[1].npv < A[1].npv, 'higher build cost lowers layer 2');
  assert.equal(C.caseState(CASE, 'existing-line-costs').layers[1].capex, 129.3);
  const rows = C.caseVersionRows(CASE);
  assert.deepEqual(rows.map(v => v.label), ["Promoters' plans", 'Existing-line costs']);
  rows.forEach((v, i) => v.layers.forEach((r, j) => { const o = (i ? B : A)[j]; assert.equal(r.npv, o.npv); assert.equal(r.bin, o.bin); }));
  assert.deepEqual(rows[0].layers.map(r => r.outcome), ['contested', 'no']);
});

test('judgement count comes from the file: per-phase inputs counted once, neutral defaults counted separately', () => {
  // Independent count from the raw file.
  let total = 0, judgement = 0, defaults = 0;
  const one = (recs) => { const b = recs.every(r => r.basis === 'default') ? 'default' : recs.some(r => r.basis === 'judgement') ? 'judgement' : recs[0].basis; if (b === 'default') defaults++; else { total++; if (b === 'judgement') judgement++; } };
  for (const k in RAW.settings) if (RAW.settings[k] && RAW.settings[k].basis) one([RAW.settings[k]]);
  RAW.layers.forEach(L => { for (const k in L.inputs) one(Array.isArray(L.inputs[k]) ? L.inputs[k] : [L.inputs[k]]); });
  const n = C.caseBasisCounts(CASE);
  assert.deepEqual([n.judgement, n.total, n.defaults], [judgement, total, defaults]);
  assert.equal(C.caseCountText(CASE), judgement + ' of ' + total + ' case-specific inputs are judgement; ' + defaults + ' neutral defaults not counted.');
  assert.equal(defaults, 14, 'the 14 neutral settings are basis "default"');
  assert.deepEqual([n.versionInputs, n.versionJudgement], [1, 1]);
});

test('schema 3: source notes, "default" basis (no source, no rationale needed), description; none of them allowed in schema 2', () => {
  assert.ok(CASE.sources.every(s => !/\[/.test(s.citation)), 'caveats moved out of the citations');
  assert.match(CASE.sources.find(s => s.id === 'P1').note, /original not opened/);
  assert.match(CASE.description, /depends heavily on asset life and terminal value/);
  const d = fresh(); d.settings.rd.note = ''; assert.doesNotThrow(() => C.validateCase(d), 'a default needs no rationale');
  const ds = fresh(); ds.settings.rd.sourceIds = ['C1']; assert.throws(() => C.validateCase(ds), /a default value is a neutral tool setting and cites no source/);
  const s2 = fresh(); s2.schemaVersion = 2; assert.throws(() => C.validateCase(s2), /unknown field "description"/);
  const s3 = fresh(); s3.schemaVersion = 3; assert.throws(() => C.validateCase(s3), /unknown field "moneyDecimals"/, 'moneyDecimals is schema 4');
  const s2b = fresh(); s2b.schemaVersion = 2; for (const k of ['description', 'baseLabel', 'moneyRanges', 'moneyDecimals']) delete s2b[k]; s2b.sources.forEach(s => delete s.note);
  s2b.settings.pool.value = 1200; // inside the shared range, so the basis check is the one that fails
  assert.throws(() => C.validateCase(s2b), /expected sourced, derived or judgement$/, '"default" is schema 3 only');
  const n2 = fresh(); n2.schemaVersion = 2; for (const k of ['description', 'baseLabel', 'moneyRanges', 'moneyDecimals']) delete n2[k]; n2.settings.pool.value = 1200;
  assert.throws(() => C.validateCase(n2), /unknown field "note"/);
  const j = fresh(); j.layers[1].inputs.buildYears.note = ''; assert.throws(() => C.validateCase(j), /a judgement needs a rationale in the note/, 'judgement still needs a rationale');
  assert.equal(CASE.layers[1].inputs.buildYears.note, 'Judgement: lines authorised in 1844-45 were expected to open over several years; no source found for completion deadlines.');
});

test('money ranges: values must lie inside the case\'s declared ranges; ranges need 0 < min < max; outside a case the shared ranges apply', () => {
  assert.deepEqual(CASE.moneyRanges, { pool: [1, 50], capex: [1, 500] });
  assert.deepEqual(C.caseRanges(CASE), { pool: [1, 50, 0.01], capex: [1, 500, 0.1] });
  const bad = (mut, re) => { const c = fresh(); mut(c); assert.throws(() => C.validateCase(c), re); };
  bad(c => { c.settings.pool.value = 60; }, /settings pool value: value 60 is outside the tool’s range 1 to 50/);
  bad(c => { c.settings.pool.value = 0.5; }, /outside the tool’s range 1 to 50/);
  bad(c => { c.layers[0].inputs.capex.value = 501; }, /layer 1 capex value: value 501 is outside the tool’s range 1 to 500/);
  bad(c => { c.versions[0].layers.authorised.capex.value = 600; }, /version 1 layer authorised capex value: value 600 is outside/);
  bad(c => { c.moneyRanges.pool = [0, 50]; }, /moneyRanges pool: min must be above 0/);
  bad(c => { c.moneyRanges.capex = [500, 500]; }, /moneyRanges capex: min must be below max/);
  bad(c => { c.moneyRanges.share = [1, 2]; }, /moneyRanges: unknown field "share"/);
  bad(c => { c.moneyRanges.pool = [1]; }, /expected \[min, max\]/);
  // Without declared ranges the shared ones apply, so this case's pool would be rejected.
  bad(c => { delete c.moneyRanges; }, /settings pool value: value 13.39 is outside the tool’s range 200 to 3000/);
  // Snapshots: a case's own range applies only to that case's snapshots.
  S.snapSetCaseRanges(id => id === CASE.id ? C.caseRanges(CASE) : null);
  try {
    const st = C.caseState(CASE, 'base');
    const snap = S.makeSnapshot({ name: 'Railway', G: { ...st.G }, layers: st.layers, caseId: CASE.id });
    assert.equal(S.snapReadStoredText(JSON.stringify({ snapshots: [snap] })).ok, true);
    const mine = JSON.parse(JSON.stringify(snap)); mine.caseId = null;
    mine.inputs.layers = D.DEFAULT_LAYERS.map(L => ({ ...L })); mine.outputs = S.makeSnapshot({ name: 'x', G: { ...D.DEFAULT_G, entryDef: 'A', capexModel: 'sustaining', phases: [5, 10] }, layers: D.DEFAULT_LAYERS }).outputs; mine.kill = S.snapBlankKill();
    const r = S.snapReadStoredText(JSON.stringify({ snapshots: [mine] }));
    assert.equal(r.ok, false); assert.match(r.error, /setting pool: value 13.39 is outside 200 to 3000/);
    // A case link carries changes only, checked against the case's ranges.
    const link = S.makeLinkText({ ...st.G, pool: 20 }, st.layers, { caseId: CASE.id, versionId: 'base', base: st });
    const p = S.parseLinkText(link); assert.equal(p.ok, true, p.error);
    assert.equal(S.linkApplyCase(p, st).ok, true);
    const far = S.parseLinkText(S.makeLinkText({ ...st.G, pool: 60 }, st.layers, { caseId: CASE.id, versionId: 'base', base: st }));
    const a = S.linkApplyCase(far, st); assert.equal(a.ok, false); assert.match(a.error, /pool: value 60 is outside 1 to 50/);
  } finally { S.snapSetCaseRanges(null); }
});

/* ---------- In the live page ---------- */
const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
function load(hash){
  const errors = [], vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' + (hash || ''), virtualConsole: vc, pretendToBeVisual: true });
  return { doc: dom.window.document, win: dom.window, errors };
}
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const open = (win, doc) => { click(win, doc.getElementById('casesBtn')); click(win, doc.querySelector('[data-case="railway-mania-1845"]')); click(win, doc.getElementById('confirmOk')); };

test('live page: the Cases pill shows; the card gives the judgement count; the case opens with its versions, ranges, notes and chips', () => {
  const { doc, win, errors } = load('#analyst');
  const $ = (id) => doc.getElementById(id);
  assert.equal($('casesBtn').hidden, false);
  assert.equal($('g_pool').min, '200', 'outside a case the shared ranges apply'); assert.equal($('g_pool').max, '3000');
  click(win, $('casesBtn'));
  const card = doc.querySelector('#casesList .case');
  assert.equal(card.querySelector('h3').textContent, 'British railway mania, 1840s');
  assert.equal(card.querySelector('.casecount').textContent, C.caseCountText(CASE));
  click(win, doc.querySelector('[data-case="railway-mania-1845"]')); click(win, $('confirmOk'));
  assert.deepEqual([...doc.querySelectorAll('#caseVersions button')].map(b => b.textContent), ["Promoters' plans", 'Existing-line costs']);
  assert.deepEqual([$('g_pool').min, $('g_pool').max, $('g_pool').step], ['1', '50', '0.01']);
  assert.equal(+$('g_pool').value, 13.39);
  assert.equal($('o_pool').textContent, '£13.4m a year', 'one decimal (moneyDecimals 1)');
  doc.querySelectorAll('#inputs input[data-k="capex"]').forEach(i => { assert.equal(i.min, '1'); assert.equal(i.max, '500'); });
  assert.equal(doc.querySelector('.bchip[data-key="settings.rd"]').textContent, 'N');
  assert.match($(doc.querySelector('.bchip[data-key="settings.rd"]').getAttribute('aria-controls')).textContent, /Neutral default, not used by this case\./);
  assert.match($('caseTip').textContent, /The original-lines result depends heavily on asset life/);
  // Input guide shows the case's money ranges.
  assert.match(doc.querySelector('#guideTable tr[data-key="pool"]').children[2].textContent, /^1 to 50, step 0.01 \(this case's range, £m\); case value 13.39$/);
  assert.match(doc.querySelector('#guideTable tr[data-key="capex"]').children[2].textContent, /case values by layer 80, 56.5/);
  // Sources show their notes.
  click(win, $('caseSources'));
  const p1 = [...doc.querySelectorAll('#sourcesTable tbody tr')].find(tr => tr.children[0].textContent === 'P1');
  assert.match(p1.children[2].textContent, /original not opened/);
  click(win, $('sourcesClose'));
  // Results on the page equal direct model calls; switching versions recomputes.
  const pv = () => [...doc.querySelectorAll('#score tbody tr')].map(tr => tr.children[2].textContent);
  const A = runCase('base'), B = runCase('existing-line-costs');
  const fm = (x) => C.formatMoney(x, '£m', 1);
  assert.deepEqual(pv(), A.map(o => fm(o.npv)));
  click(win, doc.querySelector('#caseVersions button[data-version="existing-line-costs"]')); click(win, $('confirmOk'));
  assert.deepEqual(pv(), B.map(o => fm(o.npv)));
  // What happened: each version's verdict against the recorded outcomes.
  const vrows = [...doc.querySelectorAll('#versionTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
  assert.deepEqual(vrows.map(r => [r[0], r[1], r[3], r[5]]), [
    ["Promoters' plans", 'Original lines in operation', A[0].bin, 'contested'], ["Promoters' plans", 'Lines authorised 1844-45', A[1].bin, 'no'],
    ['Existing-line costs', 'Original lines in operation', B[0].bin, 'contested'], ['Existing-line costs', 'Lines authorised 1844-45', B[1].bin, 'no']]);
  assert.equal($('versionBlock').hidden, false);
  // Back to my scenario: the shared ranges return.
  click(win, $('caseReturn'));
  assert.deepEqual([$('g_pool').min, $('g_pool').max], ['200', '3000']);
  doc.querySelectorAll('#inputs input[data-k="capex"]').forEach(i => assert.equal(i.max, '2000'));
  assert.deepEqual(errors, []);
  win.close();
});

test('live page: a saved snapshot of the case survives a reload (case ranges apply to stored snapshots)', () => {
  let { doc, win } = load('#analyst');
  open(win, doc);
  const nm = doc.getElementById('snapName'); nm.value = 'Railway view'; nm.dispatchEvent(new win.Event('input', { bubbles: true }));
  click(win, doc.getElementById('snapSave'));
  const stored = win.localStorage.getItem('load-bearing-snapshots-v1');
  win.close();
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/#analyst', pretendToBeVisual: true, beforeParse: (w) => w.localStorage.setItem('load-bearing-snapshots-v1', stored) });
  const d2 = dom.window.document;
  assert.equal(d2.getElementById('snapErr').textContent, '');
  assert.equal(d2.querySelectorAll('#snapList tbody tr').length, 1);
  assert.equal(d2.querySelector('#snapList tbody tr td').textContent, 'Railway view');
  dom.window.close();
});

test('schema 4: moneyDecimals is 0, 1 or 2 (default 0); the railway case uses 1; formatting', () => {
  assert.equal(CASE.moneyDecimals, 1);
  const bad = (v) => { const c = fresh(); c.moneyDecimals = v; assert.throws(() => C.validateCase(c), /moneyDecimals: expected 0, 1 or 2/); };
  for (const v of [3, -1, 0.5, '1', null]) bad(v);
  const z = fresh(); delete z.moneyDecimals; assert.equal(C.validateCase(z).moneyDecimals, 0);
  assert.equal(C.formatMoney(-14.2755, '£m', 1), '−£14.3m');
  assert.equal(C.formatMoney(13.394, '£m', 2), '£13.39m');
  assert.equal(C.formatMoney(271.4, '$B'), '$271B', 'my own scenario: whole units');
  assert.equal(C.formatMoney(-0.04, '£m', 1), '£0.0m', 'no minus sign on a value that rounds to zero');
});

test('sources: full citations for O1 and O2; L1 and L2 replace C3; date rules hold; P1 keeps its note', () => {
  const by = Object.fromEntries(CASE.sources.map(s => [s.id, s]));
  assert.deepEqual(Object.keys(by), ['P1', 'C1', 'C2', 'L1', 'L2', 'O1', 'O2', 'O3']);
  assert.equal(by.C3, undefined, 'C3 removed (no longer used)');
  assert.ok(!/"C3"/.test(JSON.stringify(RAW)));
  assert.equal(by.O1.citation, 'Odlyzko, A. (2011). The collapse of the Railway Mania, the development of capital markets, and the forgotten role of Robert Lucas Nash. Accounting History Review 21(3), 309-345.');
  assert.equal(by.O2.citation, 'Odlyzko, A. (2012). The Railway Mania: Fraud, disappointed expectations, and the modern economy (revised 14 Aug 2012).');
  assert.ok(!/same paper as/.test(JSON.stringify(RAW)));
  assert.deepEqual([by.L1.kind, by.L1.publicationDate, by.L1.seriesEndsOn], ['compiled', '1936-12-31', '1845-07-31']);
  assert.match(by.L1.note, /^Secondary: reported by Wikipedia; the original was not opened\. Other sources give about 2,700 to 3,000\./);
  assert.deepEqual([by.L2.kind, by.L2.publicationDate, by.L2.seriesEndsOn], ['compiled', '2026-10-06', '1844-12-31']);
  assert.match(by.L2.note, /^Secondary and low quality; the primary source was not found\./);
  assert.match(by.P1.note, /original not opened/);
  // Date rules: both compiled series end on or before the as-of date; moving either end past it is rejected.
  for (const id of ['L1', 'L2']) { assert.ok(C.sourceForInput(by[id], CASE.asOfDate)); const c = fresh(); c.sources.find(s => s.id === id).seriesEndsOn = '1845-10-01';
    assert.throws(() => C.validateCase(c), /a compiled series must end on or before it/); }
  // The discount rate is a pure judgement with no source.
  assert.deepEqual([CASE.settings.disc.basis, CASE.settings.disc.sourceIds], ['judgement', []]);
  assert.match(CASE.settings.disc.note, /^5% is my choice: long-term government bonds paid about 3% in this period \(not verified to a specific source here\); I added 2 points for equity risk\.$/);
});

test('case data pill: "Case data" with its tooltip in a case; "Placeholder data" in my own scenario; phone line; no placeholder wording on case inputs', () => {
  const { doc, win, errors } = load('#analyst');
  const $ = (id) => doc.getElementById(id);
  const mineTip = $('phTip').textContent;
  assert.equal($('phPill').textContent, 'Placeholder data');
  assert.match(mineTip, /^Placeholders, not data\./);
  assert.match($('tip14').textContent, /placeholder/, 'tool default tips keep their wording outside a case');
  open(win, doc);
  assert.equal($('phPill').textContent, 'Case data');
  assert.equal($('phTip').textContent, 'Inputs in a case are sourced, derived, judgement or default (see the chips). The case is scored by tool author. Not financial advice.');
  assert.ok(![...doc.querySelectorAll('#inputs thead th')].some(th => /placeholder/i.test(th.textContent)), 'no placeholder wording in the case input headers');
  assert.ok(![...doc.querySelectorAll('.tip[data-guide]')].some(t => /placeholder/i.test(t.textContent)), 'no placeholder wording in the slider notes');
  // Phones: the header pill is hidden there, so a case line shows instead of the placeholder line.
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(css.includes('body:not(.case-mode) .caseonly{display:none !important}'));
  assert.ok(css.includes('body.case-mode .nocase{display:none !important}'));
  assert.ok(doc.querySelector('.phonenote.caseonly') && doc.querySelector('.phonenote.nocase'));
  assert.match(doc.querySelector('.phonenote.caseonly').textContent, /^Case data\. Inputs in a case are sourced, derived, judgement or default/);
  assert.equal(doc.querySelector('footer.foot').textContent, 'Not financial advice.');
  // Money labels use one decimal in this case: scorecard, What happened, cash chart axis.
  assert.ok([...doc.querySelectorAll('#score tbody tr')].every(tr => /^−?£\d+\.\dm$/.test(tr.children[2].textContent)));
  assert.ok([...doc.querySelectorAll('#versionTable tbody tr')].every(tr => /^−?£\d+\.\dm$/.test(tr.children[2].textContent)));
  assert.ok([...doc.querySelectorAll('#cashChart svg text')].filter(t => /^−?\d/.test(t.textContent)).some(t => /\.\d$/.test(t.textContent)));
  // Back to my own scenario: everything returns.
  click(win, $('caseReturn'));
  assert.equal($('phPill').textContent, 'Placeholder data');
  assert.equal($('phTip').textContent, mineTip);
  assert.match($('tip14').textContent, /placeholder/);
  assert.ok([...doc.querySelectorAll('#score tbody tr')].every(tr => /^−?\$\d+B$/.test(tr.children[2].textContent)), 'whole units in my scenario');
  assert.deepEqual(errors, []);
  win.close();
});
