// View modes and layout in the built page (jsdom). jsdom has no layout, so "shown" is decided from the data-min tags
// against the current mode, and one test checks the stylesheet rule that does the hiding in a browser. Fit on screen,
// tip positions and dark mode are checked in a real browser (see the stage report), not here.
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
const key = (win, el, k, shift) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true }));
const modeOf = (doc) => doc.body.getAttribute('data-mode');
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
// The page's top-level blocks after the header, in document order, that are shown in the current mode.
const FIRST = ['#kpis', '#drivers', '#quadCard', '#liteCard'];
const blocks = (doc) => [...doc.querySelectorAll('main > *')].filter(e => e.tagName !== 'P' && e.id !== 'hiddenState' && shown(e)).map(e => e.id || e.className);

test('layout: title with a case-name variable, subtitle, header buttons, footer; no "How it works" section on the page', () => {
  const { doc, win, errors } = load();
  assert.equal(doc.title, 'AI Stack: Load Bearing Simulator');
  assert.equal(doc.querySelector('.tb-name').textContent, 'AI Stack: Load Bearing Simulator');
  assert.equal(doc.getElementById('caseName').textContent, Mo.CASE_NAME);
  assert.equal(doc.querySelector('.tb-sub').textContent, 'Which layers carry the weight, and who gets paid?');
  assert.deepEqual([...doc.querySelectorAll('.tb-right button')].map(b => b.textContent), ['Basic', 'Advanced', 'Analyst', 'Placeholder data', 'Behind the tool', 'Cases']);
  assert.equal(doc.getElementById('casesBtn').hidden, true, 'live build has no cases, so the Cases pill is hidden');
  assert.equal(doc.querySelector('footer.foot').textContent, 'Not financial advice.');
  assert.ok(![...doc.querySelectorAll('main h2, main h3')].some(h => /How it works/.test(h.textContent)), 'section removed from the page');
  assert.equal(doc.querySelector('a[href*="calibration"]'), null);
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(css.includes('body[data-mode="basic"] [data-min="advanced"],body[data-mode="basic"] [data-min="analyst"],body[data-mode="advanced"] [data-min="analyst"]{display:none !important}'));
  assert.ok(/max-height:84px/.test(css), 'tiles capped at 84px');
  assert.deepEqual(errors, []);
  win.close();
});

test('layout: Basic is the first screen only; Advanced and Analyst add their sections in the stated order', () => {
  const { doc, win } = load();
  setMode(win, doc, 'basic');
  assert.deepEqual(blocks(doc), ['kpis', 'first']);
  setMode(win, doc, 'advanced');
  assert.deepEqual(blocks(doc), ['kpis', 'first', 'detailScore', 'detailSection', 'lowerPair']);
  assert.ok(!shown(doc.getElementById('inputs')), 'no Layer assumptions in Advanced');
  setMode(win, doc, 'analyst');
  assert.deepEqual(blocks(doc), ['kpis', 'first', 'row2', 'detailScore', 'detailSection', 'lowerPair', 'layerSection', 'phaseSection', 'fragSection', 'snapshots']);
  // Analyst's first added row holds Timing and Money assumptions (with Entry and Capex model folded in).
  const row2 = doc.querySelector('.row2');
  for (const id of ['timing', 'moneyCard', 'defSwitch', 'g_entry', 'g_rd', 'g_tv', 'capexSwitch']) assert.ok(row2.contains(doc.getElementById(id)), id);
  // The first screen is the same block in every mode.
  for (const m of Mo.MODES) { setMode(win, doc, m); FIRST.forEach(sel => assert.ok(shown(doc.querySelector(sel)), m + ' ' + sel)); }
  // Within Advanced: detail row is a layer selector, then cash | tornado; then heatmap | allocation.
  const ds = doc.getElementById('detailSection');
  assert.ok(ds.querySelector('#layerPick') && ds.querySelector('.twocol #cashChart') && ds.querySelector('.twocol #tornado'));
  const lp = doc.getElementById('lowerPair');
  assert.ok(lp.querySelector('.twocol #heat') && lp.querySelector('.twocol #expo'));
  win.close();
});

test('layout: first-screen cards hold the right controls; scenario sliders compact; helper text in info notes', () => {
  const { doc, win } = load();
  const drv = doc.getElementById('drivers');
  for (const id of ['g_speed', 'g_mid', 'g_pool', 'g_prem', 'g_disc']) assert.ok(drv.contains(doc.getElementById(id)), id);
  assert.equal(drv.querySelectorAll('small').length, 0, 'no visible helper text under the sliders');
  assert.equal(drv.querySelectorAll('.cctl .info').length, 5, 'one info note per slider');
  assert.ok(doc.getElementById('quadCard').querySelector('.ctitle .info'), 'quadrant legend lives in an info note');
  assert.equal(doc.getElementById('quadCard').querySelectorAll('p').length, 0);
  // Every card title in Advanced and Analyst has an info note, and no long paragraphs remain visible in cards.
  setMode(win, doc, 'analyst');
  for (const t of doc.querySelectorAll('main .card h2.ctitle, main .card h3.ctitle, main section > h2.ctitle')) {
    if (t.id === 'detailTitle') continue;
    assert.ok(t.querySelector('.info'), 'info note on: ' + t.textContent);
  }
  const longVisible = [...doc.querySelectorAll('main p, main .legend, main .muted')].filter(e => shown(e) && !e.closest('.tip') && e.textContent.trim().length > 160 && !e.closest('#snapshots') && !e.classList.contains('intro'));
  assert.deepEqual(longVisible.map(e => e.textContent.slice(0, 60)), [], 'explanations are in info notes');
  win.close();
});

test('layout: compact scorecard shows layer, verdict, present value, headroom and an editable allocation', () => {
  const { doc, win, errors } = load();
  assert.deepEqual([...doc.querySelectorAll('#scoreLite thead th')].map(t => t.textContent), ['Layer', 'Verdict', 'Present value', 'Headroom', 'My allocation']);
  const full = [...doc.querySelectorAll('#score tbody tr')], lite = [...doc.querySelectorAll('#scoreLite tbody tr')];
  assert.equal(lite.length, full.length);
  lite.forEach((tr, i) => {
    assert.equal(tr.querySelector('.v').textContent, full[i].cells[full[i].cells.length - 1].textContent, 'same verdict as the detailed scorecard');
  });
  const a = doc.querySelector('#scoreLite input[data-i="1"]');
  assert.deepEqual([a.min, a.max, a.step].map(Number), D.LAYER_RANGES.alloc);
  a.value = '55'; a.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(JSON.parse(win.localStorage.getItem('load-bearing-sim-v3')).layers[1].alloc, 55);
  assert.equal(doc.querySelector('#inputs input[data-i="1"][data-k="alloc"]').value, '55', 'the Analyst layer table follows');
  assert.ok(!/placeholder/.test(doc.getElementById('kAlloc').textContent));
  click(win, doc.querySelector('#scoreLite [data-sel="3"]'));
  assert.equal(doc.querySelector('#scoreLite tbody tr.sel').dataset.i, '3');
  assert.deepEqual(errors, []);
  win.close();
});

test('modes: detailed scorecard columns in Advanced and Analyst; Layer assumptions only in Analyst', () => {
  const { doc, win } = load();
  setMode(win, doc, 'advanced');
  assert.deepEqual(visibleHeads(doc, 'score'), ['Layer', 'Present value', 'Break-even premium', 'Headroom', 'Return on cash (IRR)', 'Cash payback', 'Flags', 'Verdict']);
  setMode(win, doc, 'analyst');
  assert.deepEqual(visibleHeads(doc, 'score'), ['Layer', 'Evidence gate', 'Present value', 'Break-even premium', 'Headroom', 'Return on cash (IRR)', 'Cash payback', 'Debt', 'Flags', 'Verdict']);
  const ins = visibleHeads(doc, 'inputs');
  for (const h of ['Demand evidence (1-5)', 'Share of pool, % at start', 'Cash margin, %', 'Timing offset, years (− leads, + lags)', 'Build starts, year', 'Unit-cost decline, % a year (vintage only)', 'Debt, % of build', 'My allocation']) assert.ok(ins.includes(h), h);
  for (const m of Mo.MODES) {
    setMode(win, doc, m);
    const n = visibleHeads(doc, 'score').length;
    doc.querySelectorAll('#score tbody tr').forEach(tr => assert.equal([...tr.cells].filter(shown).length, n, m));
  }
  win.close();
});

test('modes: switching keeps every input, and results are identical in every mode', () => {
  const { doc, win, errors } = load();
  const set = (sel, v) => { const e = doc.querySelector(sel); e.value = v; e.dispatchEvent(new win.Event('input', { bubbles: true })); };
  set('#g_disc', '12'); set('#inputs input[data-i="1"][data-k="share"]', '18'); set('#scoreLite input[data-i="0"]', '45');
  set('#inputs input[data-i="2"][data-k="offset"]', '-1'); set('#phaseTable input[data-i="3"][data-k="driftP"][data-p="2"]', '-2');
  const state = () => win.localStorage.getItem('load-bearing-sim-v3');
  const values = () => [...doc.querySelectorAll('input')].filter(i => i.type !== 'file' && i.type !== 'checkbox' && i.type !== 'radio').map(i => (i.id || i.dataset.k + i.dataset.i + (i.dataset.p || '') + (i.dataset.lite || '')) + '=' + i.value).join('|');
  const results = () => [doc.getElementById('score').textContent, doc.getElementById('scoreLite').textContent, doc.getElementById('kpis').textContent, doc.getElementById('quad').innerHTML, doc.getElementById('fragility').textContent].join('#');
  const s0 = state(), v0 = values(), r0 = results();
  for (const m of ['advanced', 'analyst', 'basic', 'analyst', 'advanced']) {
    setMode(win, doc, m);
    assert.equal(state(), s0, m); assert.equal(values(), v0, m); assert.equal(results(), r0, m);
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
  assert.equal(modeOf(p.doc), 'advanced');
  p.win.close();
  p = load({ hash: '#analyst', storage: { 'load-bearing-mode': 'basic' } });
  assert.equal(modeOf(p.doc), 'analyst');
  p.win.location.hash = '#basic';
  p.win.dispatchEvent(new p.win.HashChangeEvent('hashchange'));
  assert.equal(modeOf(p.doc), 'basic');
  p.win.close();
  p = load({ hash: '#nonsense', storage: { 'load-bearing-mode': 'not-a-mode' } });
  assert.equal(modeOf(p.doc), 'basic');
  p.win.close();
});

test('KPI tiles: values equal kpiTiles; compact layout with a non-serif second line; text chips; info notes', () => {
  const { doc, win } = load();
  const k = Mo.kpiTiles(D.DEFAULT_LAYERS.map(L => ({ ...L })), { ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, capexModel: D.DEFAULT_CAPEX, phases: D.DEFAULT_PHASES.slice() });
  assert.equal(doc.querySelector('#kEarn .big').textContent, k.earn.n + ' of ' + k.earn.N);
  assert.equal(doc.querySelector('#kTight .sub').textContent, k.tight.name);
  assert.equal(doc.querySelector('#kAlloc .sub').textContent, 'placeholder equal split');
  assert.equal(doc.querySelector('#kFlips .big').textContent, k.flips.n + ' of ' + k.flips.N);
  assert.deepEqual([...doc.querySelectorAll('#kpis .status')].map(s => s.textContent), [k.earn.chip, k.tight.chip, k.alloc.chip, k.flips.chip]);
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(/\.tile \.sub,\.tile \.lab\{font:12\.5px\/1\.3 Arial/.test(css), 'second line uses the label font, not serif');
  assert.equal(doc.querySelectorAll('#kpis .info').length, 4);
  win.close();
});

test('info notes: hover, focus and tap open; Esc closes; every note is a button with a tooltip', () => {
  const { doc, win } = load();
  const btns = [...doc.querySelectorAll('.tipwrap > button')];
  assert.ok(btns.length >= 30, 'notes across the page: ' + btns.length);
  btns.forEach(b => { assert.equal(b.tagName, 'BUTTON'); assert.ok(doc.getElementById(b.getAttribute('aria-controls')), b.getAttribute('aria-controls')); });
  const b = doc.querySelector('#drivers .info'), t = doc.getElementById(b.getAttribute('aria-controls'));
  b.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  assert.ok(t.classList.contains('open'), 'hover opens');
  b.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true, relatedTarget: doc.body }));
  assert.ok(!t.classList.contains('open'), 'leaving closes');
  b.focus();
  assert.ok(t.classList.contains('open'), 'keyboard focus opens');
  key(win, b, 'Escape');
  assert.ok(!t.classList.contains('open'), 'Esc closes');
  click(win, b);
  assert.equal(b.getAttribute('aria-expanded'), 'true'); assert.ok(t.classList.contains('open'), 'tap opens and pins');
  b.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true, relatedTarget: doc.body }));
  assert.ok(t.classList.contains('open'), 'a tapped note stays open');
  const other = doc.querySelector('#quadCard .info');
  click(win, other);
  assert.ok(!t.classList.contains('open') && b.getAttribute('aria-expanded') === 'false', 'opening another closes it');
  key(win, other, 'Escape');
  assert.ok(!doc.getElementById(other.getAttribute('aria-controls')).classList.contains('open'));
  win.close();
});

test('"Behind the tool" modal: opens with the full explanation and research list; traps focus; Esc closes and returns focus', () => {
  const { doc, win, errors } = load();
  const btn = doc.getElementById('behindBtn'), modal = doc.getElementById('behindModal');
  assert.equal(modal.hidden, true);
  btn.focus(); click(win, btn);
  assert.equal(modal.hidden, false);
  assert.equal(doc.activeElement, doc.getElementById('behindClose'), 'focus moves into the modal');
  assert.equal(modal.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
  assert.ok(modal.querySelectorAll('ul.note li').length >= 9, 'full "How it works" list');
  assert.ok(/Pastor and Veronesi/.test(modal.textContent) && /Hobijn and Jovanovic/.test(modal.textContent), 'research list');
  // Focus trap: the close button is the only focusable element, so Tab and Shift+Tab stay on it.
  key(win, doc.activeElement, 'Tab'); assert.ok(modal.contains(doc.activeElement));
  key(win, doc.activeElement, 'Tab', true); assert.ok(modal.contains(doc.activeElement));
  key(win, doc.activeElement, 'Escape');
  assert.equal(modal.hidden, true);
  assert.equal(doc.activeElement, btn, 'focus returns to the button');
  click(win, btn); click(win, doc.getElementById('behindClose'));
  assert.equal(modal.hidden, true);
  assert.deepEqual(errors, []);
  win.close();
});

test('hidden state: counts analyst-only settings (now including the Analyst layer inputs), links to Analyst, resets only those', () => {
  const { doc, win, errors } = load();
  const box = doc.getElementById('hiddenState');
  assert.equal(box.hidden, true);
  const alloc = doc.querySelector('#scoreLite input[data-i="0"]'); alloc.value = '33'; alloc.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(box.hidden, true, 'allocation is a first-screen input');
  const nm = doc.getElementById('snapName'); nm.value = 'Before'; nm.dispatchEvent(new win.Event('input', { bubbles: true }));
  click(win, doc.getElementById('snapSave'));
  click(win, doc.getElementById('leadlag'));
  assert.equal(box.hidden, false);
  assert.ok(/^4 advanced assumptions active: /.test(doc.getElementById('hiddenText').textContent));
  setMode(win, doc, 'analyst'); assert.equal(box.hidden, true);
  setMode(win, doc, 'advanced'); assert.equal(box.hidden, false);
  click(win, doc.getElementById('hiddenGo')); assert.equal(modeOf(doc), 'analyst');
  const share = doc.querySelector('#inputs input[data-i="2"][data-k="share"]'); share.value = '20'; share.dispatchEvent(new win.Event('input', { bubbles: true }));
  setMode(win, doc, 'basic');
  assert.ok(/^5 advanced assumptions active: /.test(doc.getElementById('hiddenText').textContent), 'share is now an Analyst-only input');
  click(win, doc.getElementById('hiddenReset'));
  assert.equal(box.hidden, true);
  assert.deepEqual([...doc.querySelectorAll('#inputs input[data-k="offset"]')].map(i => Number(i.value)), [0, 0, 0, 0, 0]);
  assert.equal(doc.querySelector('#inputs input[data-i="2"][data-k="share"]').value, String(D.DEFAULT_LAYERS[2].share));
  assert.equal(doc.querySelector('#scoreLite input[data-i="0"]').value, '33', 'allocation kept');
  assert.equal(JSON.parse(win.localStorage.getItem('load-bearing-snapshots-v1')).snapshots.length, 1, 'snapshots untouched');
  assert.deepEqual(errors, []);
  win.close();
});

test('quadrant: drawn at pixel size; axis, quadrant and layer labels at least 11px when 380px wide or more, 10.5px on phones', () => {
  const { doc, win } = load();
  assert.equal(win.quadFontFor(436), 11.5, 'quadrant width at 1440');
  assert.equal(win.quadFontFor(400), 11.5, 'quadrant width at 1280');
  assert.equal(win.quadFontFor(380), 11.5);
  assert.equal(win.quadFontFor(350), 10.5, 'phone width');
  assert.equal(win.quadFontFor(300), 10);
  // jsdom has no layout, so the chart falls back to 640 by 400; every label uses the font for that width.
  const svg = doc.querySelector('#quad svg');
  assert.equal(svg.getAttribute('width'), '640');
  const groups = { axis: '.qa', quadrants: '.qq', layers: '.qlab' };
  for (const [name, sel] of Object.entries(groups)) {
    const ts = [...svg.querySelectorAll('text' + sel)];
    assert.ok(ts.length > 0, name);
    ts.forEach(t => assert.ok(+t.getAttribute('font-size') >= 11, name + ' ' + t.getAttribute('font-size')));
  }
  win.close();
});

test('timing card: chart drawn at pixel size with 12px axis text; legend has End demand plus one entry per layer', () => {
  const { doc, win } = load();
  setMode(win, doc, 'analyst');
  const svg = doc.querySelector('#adoptChart > svg');
  assert.ok(svg.getAttribute('width') && svg.getAttribute('height'));
  [...svg.querySelectorAll('text')].forEach(t => assert.equal(t.getAttribute('font-size'), '12'));
  const items = [...doc.querySelectorAll('#adoptChart .tlegend li')];
  assert.equal(items.length, D.DEFAULT_LAYERS.length + 1);
  assert.ok(items.slice(1).every(li => li.querySelector('.tshort').textContent === '= demand'));
  win.close();
});

test('info notes inside the entry-definition and capex-model switches open their note and change no setting', () => {
  const { doc, win, errors } = load({ hash: '#analyst' });
  const before = doc.getElementById('score').textContent;
  for (const id of ['defSwitch', 'capexSwitch']) {
    const info = doc.querySelector('#' + id + ' .tipwrap > button');
    click(win, info);
    assert.equal(info.getAttribute('aria-expanded'), 'true');
    assert.equal(doc.querySelectorAll('#' + id + ' button[aria-pressed="true"]').length, 1, id + ': one option still selected');
    click(win, info);
  }
  assert.equal(doc.getElementById('score').textContent, before, 'results unchanged');
  assert.deepEqual(errors, []);
  win.close();
});

test('value beyond year 15: multiple by default; perpetuity shows growth with its implied multiple; growth kept 1 point below the discount rate', () => {
  const { doc, win, errors } = load({ hash: '#analyst' });
  const $ = (id) => doc.getElementById(id);
  const before = $('score').textContent;
  assert.equal(doc.querySelector('#tvSwitch [data-t="multiple"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('ctl_tv').hidden, false); assert.equal($('ctl_tvg').hidden, true);
  click(win, doc.querySelector('#tvSwitch [data-t="perpetuity"]'));
  assert.equal($('ctl_tv').hidden, true); assert.equal($('ctl_tvg').hidden, false);
  assert.equal($('o_tvg').textContent, '0.0% · 10.0x', 'growth 0 at a 10% rate implies 1 / r = 10x');
  assert.notEqual($('score').textContent, before, 'results follow the mode');
  setMode(win, doc, 'basic'); assert.match($('hiddenText').textContent, /Value beyond year 15: mode/); setMode(win, doc, 'analyst');
  const set = (id, v) => { $(id).value = String(v); $(id).dispatchEvent(new win.Event('input', { bubbles: true })); };
  set('g_tvg', 2);
  assert.equal($('o_tvg').textContent, '2.0% · 12.8x');
  set('g_disc', 6);
  assert.equal(+$('g_tvg').value, 2, 'still 4 points below');
  set('g_tvg', 8);
  assert.equal(+$('g_tvg').value, 5, 'growth pulled down to the rate minus 1 point');
  assert.equal($('o_tvg').textContent, '5.0% · 105.0x');
  set('g_disc', 5);
  assert.equal(+$('g_tvg').value, 4, 'lowering the rate pulls growth down too');
  click(win, doc.querySelector('#tvSwitch [data-t="multiple"]'));
  assert.equal($('ctl_tv').hidden, false);
  assert.equal(doc.querySelectorAll('#tvSwitch button[aria-pressed="true"]').length, 1);
  assert.deepEqual(errors, []);
  win.close();
});
