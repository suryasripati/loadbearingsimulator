// UI smoke test: loads the built page (docs/index.html) in jsdom and drives it like a user.
// jsdom has no layout engine, so it cannot test label overlap, clipping or anything visual on the charts.
// Those still need a real-browser check (see the README). Run `npm run build` first so docs/ matches src/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { runLayer } = require('../src/model.js');
const D = require('../src/defaults.js');
const fx = require('./fixtures/v0_1_defaults.json');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');

function load(){
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => {
    // jsdom does not implement canvas; the page falls back to estimated label widths. Anything else is a real error.
    if (/Not implemented/.test(e.message)) return;
    errors.push(e.message);
  });
  // A URL gives the page a working localStorage; no network requests are made (external resources are not loaded).
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc, pretendToBeVisual: true });
  return { dom, doc: dom.window.document, win: dom.window, errors };
}
const heading = (doc) => doc.getElementById('detailTitle').textContent;
const verdicts = (doc) => [...doc.querySelectorAll('#score tbody tr')].map(r => r.cells[r.cells.length - 1].textContent.trim());
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

// Every place that marks the selected layer must agree on the same index.
function assertSelected(doc, i){
  const name = D.DEFAULT_LAYERS[i].name;
  assert.equal(heading(doc), 'Detail: ' + name);
  for (const id of ['inputs', 'phaseTable', 'score']) {
    const rows = [...doc.querySelectorAll('#' + id + ' tbody tr.sel')];
    assert.equal(rows.length, 1, id + ' should highlight exactly one row');
    assert.equal(rows[0].querySelector('[data-sel]').dataset.sel, String(i), id + ' highlights the wrong layer');
  }
  const pressed = [...doc.querySelectorAll('#layerPick button[aria-pressed="true"]')];
  assert.equal(pressed.length, 1);
  assert.equal(pressed[0].dataset.sel, String(i));
  const dots = [...doc.querySelectorAll('#quad g.dot[aria-pressed="true"]')];
  assert.equal(dots.length, 1);
  assert.equal(dots[0].dataset.sel, String(i));
}

test('page loads from docs/index.html with no console errors', () => {
  const { doc, errors, win } = load();
  assert.equal(doc.title, 'Load Bearing Simulator');
  assert.ok(doc.querySelector('#score tbody tr'), 'scorecard rendered');
  assert.deepEqual(errors, []);
  win.close();
});

test('default verdicts at neutral settings equal the v0.1 fixture bins', () => {
  const { doc, win } = load();
  assert.deepEqual(verdicts(doc), fx.layers.map(l => l.bin));
  assert.equal(doc.getElementById('timingNote').hidden, true);
  win.close();
});

test('all five ways of choosing a layer switch the Detail heading and highlight the same layer', () => {
  const { doc, win, errors } = load();
  click(win, doc.querySelector('#inputs [data-sel="0"]'));       assertSelected(doc, 0);
  click(win, doc.querySelector('#layerPick [data-sel="2"]'));    assertSelected(doc, 2);
  click(win, doc.querySelector('#score [data-sel="3"]'));        assertSelected(doc, 3);
  click(win, doc.querySelector('#phaseTable [data-sel="4"]'));   assertSelected(doc, 4);
  click(win, doc.querySelector('#quad g.dot[data-sel="1"]'));    assertSelected(doc, 1);
  const dot = doc.querySelector('#quad g.dot[data-sel="0"]');
  dot.focus();
  dot.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assertSelected(doc, 0);
  assert.equal(doc.activeElement.getAttribute('data-sel'), '0', 'focus stays on the chosen dot after Enter');
  assert.deepEqual(errors, []);
  win.close();
});

test('"Load lead/lag example" shows the timing note naming the layers whose verdict depends on their offset', () => {
  const { doc, win } = load();
  const g = { ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, phases: D.DEFAULT_PHASES };
  const expected = D.DEFAULT_LAYERS
    .filter((L, i) => runLayer({ ...L, offset: D.LEAD_LAG_EXAMPLE[i] }, g).bin !== runLayer({ ...L, offset: 0 }, g).bin)
    .map(L => L.name);
  assert.ok(expected.length > 0, 'the example should move at least one verdict');
  click(win, doc.getElementById('leadlag'));
  const note = doc.getElementById('timingNote');
  assert.equal(note.hidden, false);
  assert.ok(note.textContent.includes('Verdict depends on the timing offset for: ' + expected.join(', ') + '.'), note.textContent);
  win.close();
});

test('Reset restores defaults', () => {
  const { doc, win } = load();
  click(win, doc.getElementById('leadlag'));
  click(win, doc.querySelector('#defSwitch [data-d="B"]'));
  click(win, doc.querySelector('#score [data-sel="4"]'));
  const share = doc.querySelector('#inputs input[data-i="0"][data-k="share"]');
  share.value = '60'; share.dispatchEvent(new win.Event('input', { bubbles: true }));
  click(win, doc.getElementById('reset'));
  assert.deepEqual([...doc.querySelectorAll('#inputs input[data-k="offset"]')].map(i => Number(i.value)), D.DEFAULT_LAYERS.map(L => L.offset));
  assert.equal(Number(doc.querySelector('#inputs input[data-i="0"][data-k="share"]').value), D.DEFAULT_LAYERS[0].share);
  assert.equal(doc.querySelector('#defSwitch [data-d="A"]').getAttribute('aria-pressed'), 'true');
  assert.equal(doc.getElementById('timingNote').hidden, true);
  assert.deepEqual(verdicts(doc), fx.layers.map(l => l.bin));
  assertSelected(doc, 1);
  win.close();
});

test('build start column and the build-later line render', () => {
  const { doc, win } = load();
  const heads = [...doc.querySelectorAll('#inputs thead th')].map(th => th.textContent);
  assert.ok(heads.includes('Build starts, year'));
  assert.equal(doc.querySelectorAll('#inputs input[data-k="buildStart"]').length, D.DEFAULT_LAYERS.length);
  const note = doc.getElementById('buildNote');
  assert.ok(!note.hidden && /Verdict changes if the build starts two years later for: /.test(note.textContent), note.textContent);
  const g = { ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, phases: D.DEFAULT_PHASES };
  const { verdictIfBuildLater } = require('../src/model.js');
  const expected = D.DEFAULT_LAYERS.filter(L => { const v = verdictIfBuildLater(L, g); return v.later !== v.now; }).map(L => L.name);
  assert.ok(note.textContent.includes(': ' + (expected.length ? expected.join(', ') : 'none') + '.'), note.textContent);
  assert.ok(doc.getElementById('tornado').textContent.includes('Build start (two years later only; cannot start before year 0)'));
  win.close();
});
