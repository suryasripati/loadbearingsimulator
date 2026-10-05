// View modes in the built page (jsdom). jsdom has no layout, so "shown" is decided from the data-min tags against
// the current mode, and one test checks the stylesheet rule that does the hiding in a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const Mo = require('../src/modes.js');
const D = require('../src/defaults.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
function load(opts = {}){
  const errors = [], vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' + (opts.hash || ''), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse: (w) => { if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, opts.storage[k]); } });
  return { doc: dom.window.document, win: dom.window, errors };
}
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const modeOf = (doc) => doc.body.getAttribute('data-mode');
// Shown when no ancestor (or the element itself) needs a higher mode, and nothing is [hidden].
function shown(el){
  const doc = el.ownerDocument, lvl = Mo.modeLevel(modeOf(doc));
  for (let e = el; e && e !== doc.body; e = e.parentElement) {
    if (e.hidden) return false;
    const need = e.getAttribute && e.getAttribute('data-min');
    if (need && Mo.modeLevel(need) > lvl) return false;
  }
  return true;
}
const setMode = (win, doc, m) => click(win, doc.querySelector('[data-mode-btn="' + m + '"]'));
const visibleHeads = (doc, id) => [...doc.querySelectorAll('#' + id + ' thead th')].filter(shown).map(th => th.textContent.replace(/ at year \d+/, ''));

// Sections, by a stable element inside each, and the mode they first appear in.
const SECTIONS = {
  basic: ['#drivers', '#quad', '#inputs', '#score', '#kpis', '#reset'],
  advanced: ['#heat', '#cashChart', '#tornado', '#expo', 'details.evidence', '#layerPick'],
  analyst: ['#timing', '#defSwitch', '#g_entry', '#g_rd', '#g_tv', '#capexSwitch', '#phaseTable', '#fragility', '#leadlag', '#ucdExample', '#arch_rail', '#snapshots']
};

test('modes: first visit is Basic; the stylesheet hides higher-mode elements; header, pill and footer are present', () => {
  const { doc, win, errors } = load();
  assert.equal(modeOf(doc), 'basic');
  assert.deepEqual([...doc.querySelectorAll('[data-mode-btn]')].map(b => [b.textContent, b.getAttribute('aria-pressed')]), [['Basic', 'true'], ['Advanced', 'false'], ['Analyst', 'false']]);
  assert.equal(doc.getElementById('modeSwitch').getAttribute('role'), 'group');
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(css.includes('body[data-mode="basic"] [data-min="advanced"],body[data-mode="basic"] [data-min="analyst"],body[data-mode="advanced"] [data-min="analyst"]{display:none !important}'));
  assert.ok(/position:sticky/.test(css) && /max-height:56px/.test(css) && /safe-area-inset-top/.test(css));
  const pill = doc.getElementById('phPill');
  assert.equal(pill.textContent, 'Placeholder data');
  assert.ok(/Placeholders, not data\..*Not financial advice\./.test(doc.getElementById('phTip').textContent));
  click(win, pill); assert.equal(pill.getAttribute('aria-expanded'), 'true', 'a tap opens the explanation');
  click(win, pill); assert.equal(pill.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.querySelector('footer.foot').textContent, 'Not financial advice.');
  assert.equal(doc.querySelector('a[href*="calibration"]'), null, 'no link to the calibration page');
  assert.deepEqual(errors, []);
  win.close();
});

test('modes: each mode shows exactly its sections', () => {
  const { doc, win } = load();
  for (const m of Mo.MODES) {
    setMode(win, doc, m);
    for (const [need, sels] of Object.entries(SECTIONS)) for (const sel of sels) {
      const el = doc.querySelector(sel);
      assert.ok(el, sel + ' exists in every mode (inputs are never removed)');
      assert.equal(shown(el), Mo.modeLevel(need) <= Mo.modeLevel(m), m + ': ' + sel);
    }
  }
  win.close();
});

test('modes: layer table and scorecard columns per mode', () => {
  const { doc, win } = load();
  const basicInputs = ['Layer', 'Demand evidence (1-5)', 'Share of pool, % at start', 'Cash margin, %', 'Build capex, $B', 'Asset life, years', 'My allocation'];
  setMode(win, doc, 'basic');
  assert.deepEqual(visibleHeads(doc, 'inputs'), basicInputs);
  assert.deepEqual(visibleHeads(doc, 'score'), ['Layer', 'Present value', 'Headroom', 'Verdict']);
  setMode(win, doc, 'advanced');
  assert.deepEqual(visibleHeads(doc, 'inputs'), basicInputs);
  assert.deepEqual(visibleHeads(doc, 'score'), ['Layer', 'Present value', 'Break-even premium', 'Headroom', 'Return on cash (IRR)', 'Cash payback', 'Flags', 'Verdict']);
  setMode(win, doc, 'analyst');
  const all = visibleHeads(doc, 'inputs');
  for (const h of ['Timing offset, years (− leads, + lags)', 'Curve steepness (1 = same as demand)', 'Build starts, year', 'Build years', 'Unit-cost decline, % a year (vintage only)', 'Pass-through to prices, 0–1 (vintage only; no view, placeholder, unsourced)', 'Debt, % of build']) assert.ok(all.includes(h), h);
  assert.deepEqual(visibleHeads(doc, 'score'), ['Layer', 'Evidence gate', 'Present value', 'Break-even premium', 'Headroom', 'Return on cash (IRR)', 'Cash payback', 'Debt', 'Flags', 'Verdict']);
  // Body cells follow their headers.
  for (const m of Mo.MODES) {
    setMode(win, doc, m);
    const nHead = visibleHeads(doc, 'score').length;
    doc.querySelectorAll('#score tbody tr').forEach(tr => assert.equal([...tr.cells].filter(shown).length, nHead, m));
    const nIn = visibleHeads(doc, 'inputs').length;
    doc.querySelectorAll('#inputs tbody tr').forEach(tr => assert.equal([...tr.cells].filter(shown).length, nIn, m));
  }
  win.close();
});

test('modes: switching keeps every input, and results are identical in every mode', () => {
  const { doc, win, errors } = load();
  const set = (sel, v) => { const e = doc.querySelector(sel); e.value = v; e.dispatchEvent(new win.Event('input', { bubbles: true })); };
  set('#g_disc', '12'); set('#inputs input[data-i="1"][data-k="share"]', '18'); set('#inputs input[data-i="0"][data-k="alloc"]', '45');
  set('#inputs input[data-i="2"][data-k="offset"]', '-1'); set('#phaseTable input[data-i="3"][data-k="driftP"][data-p="2"]', '-2');
  const state = () => win.localStorage.getItem('load-bearing-sim-v3');
  const values = () => [...doc.querySelectorAll('input')].filter(i => i.type !== 'file' && i.type !== 'checkbox').map(i => (i.id || i.dataset.k + i.dataset.i + (i.dataset.p || '')) + '=' + i.value).join('|');
  const results = () => [doc.getElementById('score').textContent, doc.getElementById('kpis').textContent, doc.getElementById('quad').innerHTML, doc.getElementById('fragility').textContent].join('#');
  const s0 = state(), v0 = values(), r0 = results();
  for (const m of ['advanced', 'analyst', 'basic', 'analyst', 'advanced']) {
    setMode(win, doc, m);
    assert.equal(state(), s0, m + ': saved inputs unchanged');
    assert.equal(values(), v0, m + ': every input keeps its value');
    assert.equal(results(), r0, m + ': results identical');
  }
  assert.deepEqual(errors, []);
  win.close();
});

test('modes: the mode persists in local storage and the URL hash; the hash wins; hashchange switches', () => {
  let p = load();
  setMode(p.win, p.doc, 'advanced');
  assert.equal(p.win.localStorage.getItem('load-bearing-mode'), 'advanced');
  assert.equal(p.win.location.hash, '#advanced');
  p.win.close();
  p = load({ storage: { 'load-bearing-mode': 'advanced' } });
  assert.equal(modeOf(p.doc), 'advanced', 'remembered from local storage');
  assert.equal(p.doc.querySelector('[data-mode-btn="advanced"]').getAttribute('aria-pressed'), 'true');
  p.win.close();
  p = load({ hash: '#analyst', storage: { 'load-bearing-mode': 'basic' } });
  assert.equal(modeOf(p.doc), 'analyst', 'a link with #analyst opens Analyst');
  p.win.location.hash = '#basic';
  p.win.dispatchEvent(new p.win.HashChangeEvent('hashchange'));
  assert.equal(modeOf(p.doc), 'basic');
  p.win.close();
  p = load({ hash: '#nonsense', storage: { 'load-bearing-mode': 'not-a-mode' } });
  assert.equal(modeOf(p.doc), 'basic', 'bad values fall back to Basic');
  p.win.close();
  // Storage that throws does not break the page.
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc,
    beforeParse: (w) => { w.Storage.prototype.getItem = () => { throw new Error('blocked'); }; w.Storage.prototype.setItem = () => { throw new Error('blocked'); }; } });
  assert.equal(dom.window.document.body.getAttribute('data-mode'), 'basic');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('modes: KPI tiles in the page show the values kpiTiles computes, with text chips and keyboard-reachable info', () => {
  const { doc, win } = load();
  const check = () => {
    // Nothing is saved until the first edit, so fall back to the defaults.
    const stored = JSON.parse(win.localStorage.getItem('load-bearing-sim-v3')) || { G: { ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, capexModel: D.DEFAULT_CAPEX, phases: D.DEFAULT_PHASES.slice() }, layers: D.DEFAULT_LAYERS };
    const layers = stored.layers.map((L, i) => ({ ...L, name: D.DEFAULT_LAYERS[i].name }));
    const k = Mo.kpiTiles(layers, stored.G);
    assert.equal(doc.querySelector('#kEarn .big').textContent, k.earn.n + ' of ' + k.earn.N);
    assert.ok(doc.querySelector('#kTight .big small').textContent === k.tight.name);
    assert.equal(doc.querySelector('#kFlips .big').textContent, k.flips.n + ' of ' + k.flips.N);
    assert.deepEqual([...doc.querySelectorAll('#kpis .status')].map(s => s.textContent), [k.earn.chip, k.tight.chip, k.alloc.chip, k.flips.chip]);
    return k;
  };
  const k0 = check();
  assert.ok(/placeholder equal/.test(doc.getElementById('kAlloc').textContent), 'placeholder allocation is labelled');
  assert.ok(k0.alloc.placeholder);
  // Change an allocation: the label drops "placeholder" and the value follows the model.
  const a = doc.querySelector('#inputs input[data-i="1"][data-k="alloc"]'); a.value = '60'; a.dispatchEvent(new win.Event('input', { bubbles: true }));
  const k1 = check();
  assert.ok(!/placeholder/.test(doc.getElementById('kAlloc').textContent));
  assert.equal(doc.querySelector('#kAlloc .big').textContent.replace('−', '-'), Math.abs(k1.alloc.pct).toFixed(0) + '%');
  // Info buttons are real buttons (focusable) with a tooltip; a tap toggles it.
  const infos = [...doc.querySelectorAll('#kpis .info')];
  assert.equal(infos.length, 4);
  infos.forEach(b => { assert.equal(b.tagName, 'BUTTON'); assert.ok(doc.getElementById(b.getAttribute('aria-controls')).textContent.length > 20); });
  click(win, infos[0]); assert.equal(infos[0].getAttribute('aria-expanded'), 'true');
  click(win, infos[1]); assert.equal(infos[0].getAttribute('aria-expanded'), 'false', 'opening one closes the other');
  win.close();
});

test('modes: hidden-state indicator counts analyst-only settings, links to Analyst, and resets only those', () => {
  const { doc, win, errors } = load();
  const box = doc.getElementById('hiddenState');
  assert.equal(box.hidden, true, 'nothing hidden at defaults');
  // Save a snapshot first, and set an allocation, to prove the reset leaves both alone.
  const alloc = doc.querySelector('#inputs input[data-i="0"][data-k="alloc"]'); alloc.value = '33'; alloc.dispatchEvent(new win.Event('input', { bubbles: true }));
  const nm = doc.getElementById('snapName'); nm.value = 'Before'; nm.dispatchEvent(new win.Event('input', { bubbles: true }));
  click(win, doc.getElementById('snapSave'));
  click(win, doc.getElementById('leadlag')); // sets four non-zero offsets (an Analyst-only setting)
  assert.equal(box.hidden, false);
  assert.ok(/^4 advanced assumptions active: /.test(doc.getElementById('hiddenText').textContent), doc.getElementById('hiddenText').textContent);
  setMode(win, doc, 'advanced'); assert.equal(box.hidden, false, 'shown in Advanced too');
  setMode(win, doc, 'analyst'); assert.equal(box.hidden, true, 'not shown in Analyst');
  setMode(win, doc, 'basic');
  click(win, doc.getElementById('hiddenGo'));
  assert.equal(modeOf(doc), 'analyst', 'the link switches to Analyst');
  setMode(win, doc, 'basic');
  click(win, doc.getElementById('hiddenReset'));
  assert.equal(box.hidden, true);
  assert.deepEqual([...doc.querySelectorAll('#inputs input[data-k="offset"]')].map(i => Number(i.value)), [0, 0, 0, 0, 0]);
  assert.equal(doc.querySelector('#inputs input[data-i="0"][data-k="alloc"]').value, '33', 'allocation kept');
  assert.equal(JSON.parse(win.localStorage.getItem('load-bearing-snapshots-v1')).snapshots.length, 1, 'snapshots untouched');
  // A margin that varies by phase counts, shows "varies by phase" in Basic, and resets to its first-phase value.
  setMode(win, doc, 'analyst');
  const m = doc.querySelector('#phaseTable input[data-i="2"][data-k="marginP"][data-p="2"]'); m.value = '20'; m.dispatchEvent(new win.Event('input', { bubbles: true }));
  setMode(win, doc, 'basic');
  assert.ok(/1 advanced assumption active: Models: cash margin varies by phase/.test(doc.getElementById('hiddenText').textContent));
  assert.equal(doc.querySelector('#inputs td.mcell[data-i="2"]').textContent, 'varies by phase');
  click(win, doc.getElementById('hiddenReset'));
  const mi = doc.querySelector('#inputs td.mcell[data-i="2"] input');
  assert.ok(mi, 'a single margin input again');
  assert.equal(mi.value, String(D.DEFAULT_LAYERS[2].marginP[0]));
  // The single margin box sets all three phases.
  mi.value = '40'; mi.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.deepEqual(JSON.parse(win.localStorage.getItem('load-bearing-sim-v3')).layers[2].marginP, [40, 40, 40]);
  assert.equal(box.hidden, true, 'a uniform margin is a Basic input, not hidden state');
  assert.deepEqual(errors, []);
  win.close();
});
