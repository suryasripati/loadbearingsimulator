// The second real case (cases/telecom-fibre-1999.case.json): it validates, both versions run as defined, the judgement
// count matches the file, the arithmetic in its notes holds, each layer's timing offset reproduces its observed year-0
// revenue, and the live page lists and opens it beside the railway case.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const C = require('../src/cases.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');
const { build } = require('../scripts/build.js');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'cases', 'telecom-fibre-1999.case.json');
const RAW = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const CASE = C.validateCase(JSON.parse(JSON.stringify(RAW)));
const VERSIONS = ['base', 'period-claims'];
const runCase = (v) => { const st = C.caseState(CASE, v), G = { ...D.DEFAULT_G, ...st.G }; return st.layers.map(L => M.runLayer(L, G)); };
// Observed year-0 revenue, $bn: Level 3 1998 (P2), Lucent FY1999 (P3), AOL + Yahoo + Amazon + eBay annualised (P5-P8).
const OBSERVED = [0.392, 38.3, 7.3];

test('the telecom case validates, and the live build includes both cases (and no synthetic fixture)', () => {
  assert.equal(CASE.id, 'telecom-fibre-1999');
  assert.equal(CASE.schemaVersion, 4);
  assert.equal(CASE.moneyUnit, '$bn'); assert.equal(CASE.moneyDecimals, 1);
  const r = build({ outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-live-')) });
  assert.deepEqual(r.cases.slice().sort(), ['railway-mania-1845', 'telecom-fibre-1999']);
  const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
  assert.ok(html.includes('"id":"telecom-fibre-1999"') && html.includes('"id":"railway-mania-1845"'), 'docs/index.html carries both cases');
  assert.ok(!/synthetic-\d-layer/.test(html));
});

test('the two versions give different results for every layer', () => {
  const A = runCase('base'), B = runCase('period-claims');
  A.forEach((a, i) => assert.ok(Math.abs(a.npv - B[i].npv) > 0.01, 'layer ' + (i + 1) + ': ' + a.npv + ' vs ' + B[i].npv));
});

test('judgement count: counted from the file independently, equal to the page function', () => {
  // Every input record once; a per-phase input counts once (judgement if any phase is, default only if all are).
  const n = { total: 0, judgement: 0, defaults: 0 };
  const add = (recs) => {
    const b = recs.every(r => r.basis === 'default') ? 'default' : recs.some(r => r.basis === 'judgement') ? 'judgement' : recs[0].basis;
    if (b === 'default') n.defaults++; else { n.total++; if (b === 'judgement') n.judgement++; }
  };
  Object.values(RAW.settings).filter(r => r && typeof r === 'object').forEach(r => add([r]));
  RAW.layers.forEach(L => Object.values(L.inputs).forEach(r => add(Array.isArray(r) ? r : [r])));
  const k = C.caseBasisCounts(CASE);
  assert.deepEqual([k.judgement, k.total, k.defaults], [n.judgement, n.total, n.defaults]);
  assert.equal(C.caseCountText(CASE), n.judgement + ' of ' + n.total + ' case-specific inputs are judgement; ' + n.defaults + ' neutral defaults not counted.');
});

test('shares add to 100% and the layers\' full-adoption revenues (stated in the share notes) sum to the pool', () => {
  const shares = RAW.layers.map(L => L.inputs.share.value);
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 100) < 1e-9, String(shares));
  const full = RAW.layers.map(L => +/^Full-adoption revenue \$([\d.]+)bn/.exec(L.inputs.share.note)[1]);
  assert.deepEqual(full, [11.1, 50.0, 60.0]);
  assert.ok(Math.abs(full.reduce((a, b) => a + b, 0) - RAW.settings.pool.value) < 1e-9);
  // Each share is its full-adoption revenue over the pool, to one decimal.
  full.forEach((f, i) => assert.equal(Math.round(f / RAW.settings.pool.value * 1000) / 10, shares[i]));
});

test('offsets equal the formula applied to the stored speed and midpoint (two decimals), in both versions', () => {
  VERSIONS.forEach(v => {
    const st = C.caseState(CASE, v), k = Math.log(81) / st.G.speed;
    st.layers.forEach((L, i) => {
      const full = +/^Full-adoption revenue \$([\d.]+)bn/.exec(RAW.layers[i].inputs.share.note)[1];
      const f = OBSERVED[i] / full;
      const want = Math.round((Math.log((1 - f) / f) / k - st.G.mid) * 100) / 100;
      assert.equal(L.offset, want, v + ' layer ' + (i + 1));
    });
  });
  // Midpoint = speed / 2, rounded to one decimal, in both versions.
  assert.equal(RAW.settings.mid.value, 3.2); assert.equal(RAW.versions[0].settings.mid.value, 1.0);
});

test('no stored value differs from the value the model runs (both versions, every input)', () => {
  VERSIONS.forEach(v => {
    const st = C.caseState(CASE, v), ver = RAW.versions.find(x => x.id === v) || {};
    const S = Object.assign({}, RAW.settings, ver.settings || {});
    ['pool', 'speed', 'mid', 'disc', 'rd', 'tv', 'premium', 'entry', 'mult'].forEach(key => assert.equal(st.G[key], S[key].value, v + ' ' + key));
    assert.deepEqual(st.G.phases, [S.phase2Start.value, S.phase3Start.value]);
    st.layers.forEach((L, i) => {
      const I = Object.assign({}, RAW.layers[i].inputs, ((ver.layers || {})[RAW.layers[i].id]) || {});
      Object.keys(I).forEach(key => assert.deepEqual(L[key], Array.isArray(I[key]) ? I[key].map(r => r.value) : I[key].value, v + ' ' + L.id + ' ' + key));
    });
  });
});

test('each layer\'s modelled year-0 revenue is within 5% of its observed figure, in both versions', () => {
  VERSIONS.forEach(v => runCase(v).forEach((o, i) => {
    const gap = o.rev[0] / OBSERVED[i] - 1;
    assert.ok(Math.abs(gap) < 0.05, v + ' layer ' + (i + 1) + ': modelled ' + o.rev[0].toFixed(3) + ' against ' + OBSERVED[i]);
  }));
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

test('live page: the Cases dialog lists both cases; the telecom card shows its judgement count; the case opens and runs the stored values', () => {
  const { doc, win, errors } = load('#analyst');
  const $ = (id) => doc.getElementById(id);
  click(win, $('casesBtn'));
  const titles = [...doc.querySelectorAll('#casesList .case h3')].map(h => h.textContent);
  assert.deepEqual(titles.slice().sort(), ['British railway mania, 1840s', 'Telecom and fibre, 1990s']);
  const card = [...doc.querySelectorAll('#casesList .case')].find(c => c.querySelector('h3').textContent === 'Telecom and fibre, 1990s');
  assert.equal(card.querySelector('.casecount').textContent, C.caseCountText(CASE));
  assert.match(card.querySelector('.casecount').textContent, /^22 of 29 case-specific inputs are judgement/);
  click(win, doc.querySelector('[data-case="telecom-fibre-1999"]')); click(win, $('confirmOk'));
  assert.deepEqual([...doc.querySelectorAll('#caseVersions button')].map(b => b.textContent), ['Measured growth', 'Period claims']);
  assert.match($('caseTip').textContent, /no supply-and-demand link/);
  // Present values on the page equal direct model calls on the stored values, in both versions.
  const pv = () => [...doc.querySelectorAll('#score tbody tr')].map(tr => tr.children[2].textContent);
  const fm = (x) => C.formatMoney(x, '$bn', 1);
  assert.deepEqual(pv(), runCase('base').map(o => fm(o.npv)));
  click(win, doc.querySelector('#caseVersions button[data-version="period-claims"]')); click(win, $('confirmOk'));
  assert.deepEqual(pv(), runCase('period-claims').map(o => fm(o.npv)));
  // Sources list every period and outcome source.
  click(win, $('caseSources'));
  assert.deepEqual([...doc.querySelectorAll('#sourcesTable tbody tr')].map(tr => tr.children[0].textContent).sort(),
    ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);
  click(win, $('sourcesClose'));
  // What happened: outcomes no, no, contested for each version.
  const vrows = [...doc.querySelectorAll('#versionTable tbody tr')].map(tr => tr.children[5].textContent);
  assert.deepEqual(vrows, ['no', 'no', 'contested', 'no', 'no', 'contested']);
  assert.deepEqual(errors, []);
  win.close();
});
