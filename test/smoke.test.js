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

test('timing chart: one path per layer plus the end-demand line, with neutral layers captioned', () => {
  const { doc, win } = load();
  const chart = doc.getElementById('adoptChart');
  assert.ok(doc.getElementById('timing').contains(chart), 'chart lives in the Timing card');
  assert.ok(!doc.getElementById('drivers').contains(chart), 'chart is no longer in the Technology scenario card');
  assert.equal(chart.querySelectorAll('path.layer').length, D.DEFAULT_LAYERS.length);
  assert.equal(chart.querySelectorAll('path.demand').length, 1);
  const paths = [...chart.querySelectorAll('svg path')];
  assert.equal(paths[paths.length - 1].getAttribute('class'), 'demand', 'demand line is drawn last, on top');
  const dashes = [...chart.querySelectorAll('path.layer')].map(p => p.getAttribute('stroke-dasharray'));
  assert.ok(dashes.every(d => d && d !== 'none'), 'every layer line is dashed, so none looks like the solid demand line');
  assert.equal(new Set(dashes).size, dashes.length, 'each layer has its own line style');
  const items = [...chart.querySelectorAll('.tlegend li')].map(li => li.textContent);
  D.DEFAULT_LAYERS.forEach(L => assert.ok(items.some(t => t.includes(L.name) && t.includes('same as end demand')), L.name));
  click(win, doc.getElementById('leadlag'));
  const after = [...chart.querySelectorAll('.tlegend li')].map(li => li.textContent).join(' | ');
  assert.ok(/Data centres and power — leads by 2 years/.test(after), after);
  assert.ok(/Services and integration — lags by 2 years/.test(after), after);
  win.close();
});

test('capex model toggle and the unit-cost-decline example', () => {
  const { doc, win, errors } = load();
  const pressed = () => doc.querySelector('#capexSwitch button[aria-pressed="true"]').dataset.c;
  const heads = () => [...doc.querySelectorAll('#score thead th')].map(th => th.textContent);
  assert.equal(pressed(), D.DEFAULT_CAPEX);
  assert.ok(!heads().some(h => /stranded|pass-through|pricing power/i.test(h)));
  assert.equal(doc.querySelector('#phaseTable small.eff').textContent, '');
  assert.ok(doc.querySelector('#inputs input[data-k="unitCostDecline"]').disabled, 'decline input is inactive in sustaining mode');
  click(win, doc.querySelector('#capexSwitch [data-c="vintage"]'));
  assert.equal(pressed(), 'vintage');
  assert.ok(heads().some(h => /Peak stranded value/.test(h)));
  assert.ok(!doc.querySelector('#inputs input[data-k="unitCostDecline"]').disabled);
  assert.ok(doc.getElementById('tornado').textContent.includes('Unit-cost decline'));
  assert.ok(doc.getElementById('tornado').textContent.includes('Pass-through to prices'));
  for (const h of ['pass-through 0', 'pass-through 1', 'Value at stake in pricing power', 'not a cash item']) assert.ok(heads().some(x => x.includes(h)), h);
  assert.ok(!doc.querySelector('#inputs input[data-k="passThrough"]').disabled);
  assert.ok(/^effective /.test(doc.querySelector('#phaseTable small.eff').textContent));
  assert.equal(doc.getElementById('effNote').hidden, false);
  click(win, doc.querySelector('#capexSwitch [data-c="sustaining"]'));
  click(win, doc.getElementById('ucdExample'));
  assert.equal(pressed(), 'vintage', 'the example switches on vintage cohorts');
  assert.deepEqual([...doc.querySelectorAll('#inputs input[data-k="unitCostDecline"]')].map(i => Number(i.value)), D.UCD_EXAMPLE);
  assert.ok(/invented round numbers, not data/.test(doc.body.textContent));
  click(win, doc.getElementById('reset'));
  assert.equal(pressed(), D.DEFAULT_CAPEX);
  assert.deepEqual(verdicts(doc), fx.layers.map(l => l.bin));
  assert.deepEqual(errors, []);
  win.close();
});
