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

function load(opts = {}){
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => {
    // jsdom does not implement canvas; the page falls back to estimated label widths. Anything else is a real error.
    if (/Not implemented/.test(e.message)) return;
    errors.push(e.message);
  });
  // A URL gives the page a working localStorage; no network requests are made (external resources are not loaded).
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' + (opts.hash || ''), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse: (w) => { if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, opts.storage[k]); if (opts.beforeParse) opts.beforeParse(w); } });
  return { dom, doc: dom.window.document, win: dom.window, errors };
}
const heading = (doc) => doc.getElementById('detailTitle').textContent;
const verdicts = (doc) => [...doc.querySelectorAll('#score tbody tr')].map(r => r.cells[r.cells.length - 1].textContent.trim());
const panelText = (doc) => doc.getElementById('fragility').textContent;
const hasOffsetLine = (doc) => /Verdict depends on the timing offset \(set to 0\) for: /.test(panelText(doc));
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
  assert.equal(doc.title, 'AI Stack: Load Bearing Simulator');
  assert.ok(doc.querySelector('#score tbody tr'), 'scorecard rendered');
  assert.deepEqual(errors, []);
  win.close();
});

test('default verdicts at neutral settings equal the v0.1 fixture bins', () => {
  const { doc, win } = load();
  assert.deepEqual(verdicts(doc), fx.layers.map(l => l.bin));
  assert.ok(!hasOffsetLine(doc), 'no offset line while every offset is 0');
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

test('"Load lead/lag example" shows the offset line in the fragility panel naming the layers whose verdict depends on their offset', () => {
  const { doc, win } = load();
  const g = { ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, phases: D.DEFAULT_PHASES };
  const expected = D.DEFAULT_LAYERS
    .filter((L, i) => runLayer({ ...L, offset: D.LEAD_LAG_EXAMPLE[i] }, g).bin !== runLayer({ ...L, offset: 0 }, g).bin)
    .map(L => L.name);
  assert.ok(expected.length > 0, 'the example should move at least one verdict');
  click(win, doc.getElementById('leadlag'));
  assert.ok(panelText(doc).includes('Verdict depends on the timing offset (set to 0) for: ' + expected.join(', ') + '.'), panelText(doc));
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
  assert.ok(!hasOffsetLine(doc));
  assert.deepEqual(verdicts(doc), fx.layers.map(l => l.bin));
  assertSelected(doc, 1);
  win.close();
});

test('build start column and the build-later line (in the fragility panel) render', () => {
  const { doc, win } = load();
  const heads = [...doc.querySelectorAll('#inputs thead th')].map(th => th.textContent);
  assert.ok(heads.includes('Build starts, year'));
  assert.equal(doc.querySelectorAll('#inputs input[data-k="buildStart"]').length, D.DEFAULT_LAYERS.length);
  const note = doc.getElementById('fragility');
  assert.ok(/Verdict changes if the build starts two years later for: /.test(note.textContent), note.textContent);
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
  D.DEFAULT_LAYERS.forEach(L => assert.ok(items.some(t => t.includes(L.name) && t.includes('= demand')), L.name));
  // Two columns, three rows: End demand plus five layers.
  assert.equal(items.length, 6);
  const css = [...doc.querySelectorAll('style')].map(x => x.textContent).join('\n');
  assert.ok(/#adoptChart \.tlegend\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(css));
  assert.ok(/white-space:nowrap/.test(css));
  // The full wording lives in the card's info note.
  const cap = doc.getElementById('adoptCaption').textContent;
  D.DEFAULT_LAYERS.forEach(L => assert.ok(cap.includes(L.name + ': same as end demand'), L.name));
  click(win, doc.getElementById('leadlag'));
  const after = [...chart.querySelectorAll('.tlegend li')].map(li => li.textContent).join(' | ');
  assert.ok(/Data centres and powerleads 2y/.test(after), after);
  assert.ok(/Services and integrationlags 2y/.test(after), after);
  assert.ok(/Data centres and power: leads by 2 years/.test(doc.getElementById('adoptCaption').textContent));
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

test('verdict fragility panel: one row per layer matching verdictFragility, in both capex modes', () => {
  const { doc, win, errors } = load();
  const { verdictFragility } = require('../src/model.js');
  const check = (g) => {
    const rows = [...doc.querySelectorAll('#fragility tbody tr')];
    assert.equal(rows.length, D.DEFAULT_LAYERS.length);
    rows.forEach((r, i) => {
      const f = verdictFragility(layerFromInputs(doc, i), g);
      const split = f.n ? ': ' + f.worse + ' worse, ' + f.better + ' better' + (f.mixed ? ', ' + f.mixed + ' mixed' : '') : '';
      assert.ok(r.textContent.includes('flips under ' + f.n + ' of ' + f.m + ' shocks' + split), r.textContent);
      const money = (f.npv < 0 ? '\u2212' : '') + '$' + Math.abs(f.npv).toFixed(0) + 'B';
      assert.equal(r.cells[2].textContent, money, 'present value shown next to the verdict');
      if (f.n === 0) assert.ok(r.textContent.includes('No tested shock changes the verdict'));
      f.flips.forEach(x => assert.ok(r.textContent.includes(x.n + ' (' + x.direction + ': ' + x.bin + ')'), x.n));
    });
  };
  const g = { ...D.DEFAULT_G, entryDef: D.DEFAULT_DEF, phases: D.DEFAULT_PHASES, capexModel: D.DEFAULT_CAPEX };
  check(g);
  assert.ok(!/Pass-through/.test(panelText(doc)), 'no vintage shocks in the default mode');
  click(win, doc.getElementById('ucdExample'));
  check({ ...g, capexModel: 'vintage' });
  assert.ok(doc.querySelector('#fragility tbody tr.sel'), 'selected layer highlighted in the panel');
  assert.deepEqual(errors, []);
  win.close();
});

// Rebuild a layer object from the default layer plus the values currently in the input tables.
function layerFromInputs(doc, i){
  const L = { ...D.DEFAULT_LAYERS[i], driftP: D.DEFAULT_LAYERS[i].driftP.slice(), marginP: D.DEFAULT_LAYERS[i].marginP.slice() };
  doc.querySelectorAll('#inputs input[data-i="' + i + '"]:not([data-k="marginAll"]), #phaseTable input[data-i="' + i + '"]').forEach(inp => {
    const v = Number(inp.value);
    if (inp.dataset.p === undefined) L[inp.dataset.k] = v; else L[inp.dataset.k][+inp.dataset.p] = v;
  });
  return L;
}

test('low-share warning appears in any mode below the display threshold and names the layer', () => {
  const { doc, win } = load();
  const note = doc.getElementById('lowShare');
  assert.equal(note.hidden, true, 'no warning at defaults');
  const drift = doc.querySelector('#phaseTable input[data-i="2"][data-k="driftP"][data-p="0"]');
  for (const p of [0, 1, 2]) {
    const inp = doc.querySelector('#phaseTable input[data-i="2"][data-k="driftP"][data-p="' + p + '"]');
    inp.value = '-20'; inp.dispatchEvent(new win.Event('input', { bubbles: true }));
  }
  assert.ok(drift);
  assert.equal(note.hidden, false);
  assert.ok(note.textContent.includes('Models keeps'), note.textContent);
  assert.ok(/display threshold, not evidence/.test(note.textContent));
  win.close();
});

/* ---------- Ranges, build and saved settings ---------- */
test('every input range on the page equals the range the snapshot import validator uses', () => {
  const { doc, win } = load();
  const r3 = (e) => [Number(e.min), Number(e.max), Number(e.step)];
  const sliders = { g_speed: 'speed', g_mid: 'mid', g_pool: 'pool', g_prem: 'premium', g_mult: 'mult', g_entry: 'entry', g_disc: 'disc', g_rd: 'rd', g_tv: 'tv', g_tvg: 'tvGrowth' };
  for (const id in sliders) assert.deepEqual(r3(doc.getElementById(id)), D.GLOBAL_RANGES[sliders[id]], id);
  assert.deepEqual(Object.values(sliders).sort(), Object.keys(D.GLOBAL_RANGES).sort(), 'every global range has a slider');
  assert.deepEqual(r3(doc.getElementById('ph1')), D.PHASE_RANGES[0]);
  assert.deepEqual(r3(doc.getElementById('ph2')), D.PHASE_RANGES[1]);
  const keys = new Set();
  doc.querySelectorAll('#inputs input[data-k], #phaseTable input[data-k]').forEach(inp => {
    // The single cash-margin box (Basic and Advanced) sets all three margin phases, so it uses the margin range.
    const k = inp.dataset.k === 'marginAll' ? 'marginP' : inp.dataset.k;
    keys.add(k);
    assert.deepEqual(r3(inp), D.LAYER_RANGES[k], inp.dataset.k);
  });
  for (const k of ['buildStart', 'unitCostDecline', 'passThrough', 'offset', 'steepness', 'driftP', 'marginP']) assert.ok(keys.has(k), k + ' is on the page');
  assert.deepEqual([...keys].sort(), Object.keys(D.LAYER_RANGES).sort(), 'every layer range has an input on the page');
  // The validator accepts each range's ends and rejects just beyond them.
  const S = require('../src/snapshots.js');
  const G = { ...D.DEFAULT_G, entryDef: 'A', capexModel: 'sustaining', phases: D.DEFAULT_PHASES.slice() };
  const base = () => JSON.parse(JSON.stringify({ snapshots: [S.makeSnapshot({ name: 'r', G, layers: D.DEFAULT_LAYERS.map(L => ({ ...L })) })] }));
  const tryVal = (set) => { const f = base(); set(f.snapshots[0]); return S.snapReadStoredText(JSON.stringify(f)).ok; };
  for (const k in D.LAYER_RANGES) {
    const [lo, hi] = D.LAYER_RANGES[k];
    const put = (v) => (s) => { const L = s.inputs.layers[0]; if (Array.isArray(L[k])) L[k][0] = v; else L[k] = v; };
    assert.ok(tryVal(put(lo)) && tryVal(put(hi)), k + ' ends accepted');
    assert.ok(!tryVal(put(lo - 1)) && !tryVal(put(hi + 1)), k + ' beyond the ends rejected');
  }
  for (const k in D.GLOBAL_RANGES) {
    const [lo, hi] = D.GLOBAL_RANGES[k];
    // Growth must stay 1 point below the discount rate, so its top end is tried with the highest discount rate.
    const room = (s) => { if (k === 'tvGrowth') s.inputs.G.disc = D.GLOBAL_RANGES.disc[1]; };
    assert.ok(tryVal(s => { s.inputs.G[k] = lo; }) && tryVal(s => { room(s); s.inputs.G[k] = hi; }), k + ' ends accepted');
    assert.ok(!tryVal(s => { s.inputs.G[k] = lo - 1; }) && !tryVal(s => { s.inputs.G[k] = hi + 1; }), k + ' beyond the ends rejected');
  }
  assert.ok(tryVal(s => { s.inputs.G.phases = [D.PHASE_RANGES[0][0], D.PHASE_RANGES[1][1]]; }));
  // Model version 2 widened asset life to 1-100 and the terminal multiple to 0-30; the page's inputs reach the new ends.
  assert.deepEqual([D.LAYER_RANGES.life[0], D.LAYER_RANGES.life[1]], [1, 100]);
  assert.deepEqual([D.GLOBAL_RANGES.tv[0], D.GLOBAL_RANGES.tv[1]], [0, 30]);
  assert.equal(doc.getElementById('g_tv').max, '30');
  doc.querySelectorAll('#inputs input[data-k="life"]').forEach(i => assert.equal(i.max, '100'));
  assert.ok(tryVal(s => { s.inputs.layers[0].life = 100; s.inputs.G.tv = 30; }));
  // Growth above the discount rate minus 1 point is refused.
  assert.ok(tryVal(s => { s.inputs.G.tvMode = 'perpetuity'; s.inputs.G.disc = 10; s.inputs.G.tvGrowth = 9; }));
  assert.ok(!tryVal(s => { s.inputs.G.tvMode = 'perpetuity'; s.inputs.G.disc = 10; s.inputs.G.tvGrowth = 9.5; }));
  assert.ok(!tryVal(s => { s.inputs.G.phases = [D.PHASE_RANGES[0][0] - 1, 10]; }) && !tryVal(s => { s.inputs.G.phases = [5, D.PHASE_RANGES[1][1] + 1]; }));
  win.close();
});

test('build inlines every source file in order and strips their export lines', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  assert.ok(!/module\.exports/.test(html), 'no export lines in the page');
  const order = ['function runLayer(', 'const DEFAULT_LAYERS', 'function snapReadStoredText(', 'function snapInit('].map(m => html.indexOf(m));
  order.forEach((i, k) => assert.ok(i > 0, 'marker ' + k + ' present'));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'model, then defaults, then snapshots, then UI');
  for (const f of ['src/model.js', 'src/defaults.js', 'src/guide.js', 'src/cases.js', 'src/modes.js', 'src/snapshots.js']) {
    const body = read(f).split('\n').filter(l => !l.includes('module.exports')).join('\n');
    assert.ok(html.includes(body), f + ' is inlined unchanged apart from its export line');
  }
  assert.ok(html.includes(read('src/app.js')), 'src/app.js is inlined');
  // All files share one script scope, so a top-level name declared twice would break the whole page.
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const names = [...js.matchAll(/^(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dup, [], 'top-level names declared more than once: ' + dup.join(', '));
});

test('existing saved settings still load (v3, v2 and v1 keys)', () => {
  // Current format.
  const v3 = load({ storage: { 'load-bearing-sim-v3': JSON.stringify({ G: { ...D.DEFAULT_G, disc: 12, entryDef: 'B', capexModel: 'vintage', phases: [4, 9] }, layers: D.DEFAULT_LAYERS.map((L, i) => ({ ...L, share: i === 0 ? 40 : L.share })), sel: 3 }) } });
  assert.equal(v3.doc.getElementById('g_disc').value, '12');
  assert.equal(v3.doc.querySelector('#defSwitch [data-d="B"]').getAttribute('aria-pressed'), 'true');
  assert.equal(v3.doc.querySelector('#capexSwitch [data-c="vintage"]').getAttribute('aria-pressed'), 'true');
  assert.equal(v3.doc.querySelector('#inputs input[data-i="0"][data-k="share"]').value, '40');
  assert.equal(v3.doc.getElementById('ph1').value, '4');
  assert.equal(heading(v3.doc), 'Detail: ' + D.DEFAULT_LAYERS[3].name);
  assert.deepEqual(v3.errors, []); v3.win.close();
  // v2 save with the untouched lead/lag placeholder offsets returns to neutral offsets.
  const v2 = load({ storage: { 'load-bearing-sim-v2': JSON.stringify({ G: { ...D.DEFAULT_G }, layers: D.DEFAULT_LAYERS.map((L, i) => ({ ...L, offset: D.LEAD_LAG_EXAMPLE[i] })), sel: 1 }) } });
  assert.deepEqual([...v2.doc.querySelectorAll('#inputs input[data-k="offset"]')].map(i => Number(i.value)), [0, 0, 0, 0, 0]);
  v2.win.close();
  // v0.1 save: one drift and one margin per layer carry into all three phases.
  const v1 = load({ storage: { 'layer-sim-v1': JSON.stringify({ G: { ...D.DEFAULT_G, pool: 1500 }, layers: D.DEFAULT_LAYERS.map(L => ({ id: L.id, name: L.name, evidence: 4, share: L.share, drift: -4, margin: 33, capex: L.capex, buildYears: L.buildYears, life: L.life, debt: L.debt, alloc: L.alloc })), sel: 2 }) } });
  assert.equal(v1.doc.getElementById('g_pool').value, '1500');
  assert.deepEqual([0, 1, 2].map(p => Number(v1.doc.querySelector('#phaseTable input[data-i="0"][data-k="driftP"][data-p="' + p + '"]').value)), [-4, -4, -4]);
  assert.deepEqual([0, 1, 2].map(p => Number(v1.doc.querySelector('#phaseTable input[data-i="4"][data-k="marginP"][data-p="' + p + '"]').value)), [33, 33, 33]);
  assert.deepEqual(v1.errors, []); v1.win.close();
});

/* ---------- Snapshots UI ---------- */
function setVal(win, el, v, ev = 'input'){ el.value = v; el.dispatchEvent(new win.Event(ev, { bubbles: true })); }
function snapStored(win){ return JSON.parse(win.localStorage.getItem('load-bearing-snapshots-v1') || '{"snapshots":[]}'); }

test('snapshots: save, list, review, compare, delete', () => {
  const { doc, win, errors } = load();
  win.confirm = () => true;
  assert.ok(/No snapshots yet/.test(doc.getElementById('snapList').textContent));
  setVal(win, doc.getElementById('snapName'), 'Base <b>view</b>');
  setVal(win, doc.getElementById('snapNote'), 'Note with <img src=x onerror="window.__x=1">');
  const kt = doc.querySelectorAll('#killTable tbody tr')[1].querySelectorAll('input');
  setVal(win, kt[0], 'Revise if utilisation stays below 60%');
  setVal(win, kt[3], '2020-01-01');
  click(win, doc.getElementById('snapSave'));
  let rows = doc.querySelectorAll('#snapList tbody tr');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cells[0].textContent, 'Base <b>view</b>', 'name shown as text');
  assert.ok(/overdue \(1\)/.test(rows[0].textContent), 'overdue badge for a past review-by date');
  assert.equal(snapStored(win).snapshots[0].inputs.layers[0].alloc, D.DEFAULT_LAYERS[0].alloc, 'allocations kept in this browser');
  // Review shows the note as text, never as HTML.
  click(win, rows[0].querySelector('[data-snap="review"]'));
  const review = doc.getElementById('snapReview');
  assert.ok(review.textContent.includes('Note with <img src=x onerror="window.__x=1">'));
  assert.equal(review.querySelector('img'), null);
  assert.equal(win.__x, undefined);
  // Answering the criterion clears the overdue badge.
  const st = review.querySelectorAll('select')[1];
  setVal(win, st, 'no', 'change');
  assert.ok(!/overdue/.test(doc.querySelectorAll('#snapList tbody tr')[0].textContent));
  // Second snapshot after a change, then compare.
  click(win, doc.getElementById('leadlag'));
  setVal(win, doc.getElementById('snapName'), 'Lead/lag');
  click(win, doc.getElementById('snapSave'));
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, 2);
  doc.getElementById('cmpA').value = '0'; doc.getElementById('cmpB').value = '1';
  click(win, doc.getElementById('cmpGo'));
  const cmp = doc.getElementById('snapCompare').textContent;
  const S = require('../src/snapshots.js');
  const c = S.compareSnapshots(snapStored(win).snapshots[0], snapStored(win).snapshots[1]);
  assert.equal(c.inputs.length, 4, 'only the four non-zero offsets changed');
  for (const d of c.inputs) assert.ok(cmp.includes(d.path.replace(/^layer (\w+)\./, (m, id) => D.DEFAULT_LAYERS.find(L => L.id === id).name + ': ')), d.path);
  const changed = c.layers.filter(x => x.verdictChanged).map(x => x.name);
  assert.ok(cmp.includes('Verdict changed for: ' + changed.join(', ') + '.'), cmp);
  assert.ok(!/Model version differs/.test(cmp));
  // Delete asks first; a "no" keeps it.
  win.confirm = () => false;
  click(win, doc.querySelectorAll('#snapList [data-snap="delete"]')[0]);
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, 2);
  win.confirm = () => true;
  click(win, doc.querySelectorAll('#snapList [data-snap="delete"]')[0]);
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, 1);
  assert.equal(snapStored(win).snapshots[0].name, 'Lead/lag');
  assert.deepEqual(errors, []);
  win.close();
});

test('snapshots: no file import or export remains; stored snapshot names render as plain text', () => {
  const S = require('../src/snapshots.js');
  const G = { ...D.DEFAULT_G, entryDef: 'A', capexModel: 'sustaining', tvMode: 'multiple', phases: D.DEFAULT_PHASES.slice() };
  const snapA = S.makeSnapshot({ name: 'Stored <script>window.__y=1</script>', G, layers: D.DEFAULT_LAYERS.map(L => ({ ...L })) });
  const { doc, win, errors } = load({ storage: { 'load-bearing-snapshots-v1': JSON.stringify({ snapshots: [snapA] }) } });
  for (const id of ['snapExport', 'snapImport', 'expAlloc', 'expWarn']) assert.equal(doc.getElementById(id), null, id + ' is gone');
  assert.equal(doc.querySelectorAll('input[type="file"]').length, 0);
  assert.ok(![...doc.querySelectorAll('button, label')].some(b => /export|import/i.test(b.textContent)), 'no export or import controls');
  for (const f of ['exportSnapshots', 'exportSnapshotsText', 'importSnapshotsText']) assert.equal(S[f], undefined, f + ' removed');
  assert.ok(!/function (exportSnapshots|importSnapshotsText|snapImportFile|snapExport)\(/.test(html));
  const rows = doc.querySelectorAll('#snapList tbody tr');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cells[0].textContent, 'Stored <script>window.__y=1</script>');
  assert.equal(win.__y, undefined);
  assert.deepEqual(errors, []);
  win.close();
  // Stored data that fails the strict check is ignored with a reason, never half-loaded.
  const bad = JSON.parse(JSON.stringify(snapA)); bad.inputs.G.disc = 99;
  const b = load({ storage: { 'load-bearing-snapshots-v1': JSON.stringify({ snapshots: [bad] }) } });
  assert.match(b.doc.getElementById('snapErr').textContent, /Saved snapshots could not be read and were ignored: Snapshot 1 setting disc: value 99 is outside 5 to 20/);
  assert.equal(b.doc.querySelectorAll('#snapList tbody tr td').length, 1, 'only the "No snapshots yet" row');
  b.win.close();
});

test('snapshots: the browser holds at most 50, with a clear message', () => {
  const S = require('../src/snapshots.js');
  const G = { ...D.DEFAULT_G, entryDef: 'A', capexModel: 'sustaining', phases: D.DEFAULT_PHASES.slice() };
  const one = S.makeSnapshot({ name: 's', G, layers: D.DEFAULT_LAYERS.map(L => ({ ...L })) });
  const full = JSON.stringify({ snapshots: Array.from({ length: S.SNAP_MAX_COUNT }, () => one), draftKill: S.snapBlankKill() });
  const { doc, win } = load({ storage: { 'load-bearing-snapshots-v1': full } });
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, S.SNAP_MAX_COUNT);
  setVal(win, doc.getElementById('snapName'), 'One too many');
  click(win, doc.getElementById('snapSave'));
  assert.ok(/holds at most 50 snapshots/.test(doc.getElementById('snapMsg').textContent));
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, S.SNAP_MAX_COUNT);
  win.close();
});

test('snapshots: a browser that refuses to store shows a message and keeps the page working', () => {
  const { doc, win, errors } = load({ beforeParse: (w) => { w.Storage.prototype.setItem = function(){ throw new Error('QuotaExceededError'); }; } });
  setVal(win, doc.getElementById('snapName'), 'Will not fit');
  click(win, doc.getElementById('snapSave'));
  assert.ok(/refused to store more/.test(doc.getElementById('snapMsg').textContent), doc.getElementById('snapMsg').textContent);
  assert.ok(/No snapshots yet/.test(doc.getElementById('snapList').textContent), 'nothing half-saved');
  assert.deepEqual(errors, []);
  win.close();
});

test('snapshots: review states in the page (no shows last reviewed and a next date; yes triggers until a new snapshot; reset clears)', () => {
  const { doc, win, errors } = load();
  const kt = () => doc.querySelectorAll('#killTable tbody tr');
  setVal(win, kt()[0].querySelectorAll('input')[0], 'Revise chips if utilisation falls');
  setVal(win, kt()[1].querySelectorAll('input')[3], '2020-01-01'); // already past
  setVal(win, doc.getElementById('snapName'), 'Then');
  click(win, doc.getElementById('snapSave'));
  const row = () => doc.querySelectorAll('#snapList tbody tr')[0];
  assert.ok(/overdue \(1\)/.test(row().textContent));
  click(win, row().querySelector('[data-snap="review"]'));
  const sel = (i) => doc.querySelectorAll('#snapReview select')[i];
  const state = (i) => doc.querySelectorAll('#snapReview tbody tr')[i].lastChild;
  // "unknown" stays overdue.
  setVal(win, sel(1), 'unknown', 'change');
  assert.ok(/overdue \(1\)/.test(row().textContent));
  // "No" clears it, shows the review date and offers a next review-by date.
  setVal(win, sel(1), 'no', 'change');
  assert.ok(!/overdue/.test(row().textContent));
  assert.ok(/Last reviewed on .+ Next review by \(optional\)/.test(state(1).textContent), state(1).textContent);
  const stored = () => JSON.parse(win.localStorage.getItem('load-bearing-snapshots-v1')).snapshots[0].kill;
  assert.match(stored()[1].answeredAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'answer date stored as ISO UTC');
  setVal(win, state(1).querySelector('input[type="date"]'), '2099-12-31', 'change');
  assert.equal(stored()[1].reviewBy, '2099-12-31');
  // "Yes" shows the triggered badge, in the review and in the list.
  setVal(win, sel(0), 'yes', 'change');
  assert.ok(/Triggered: revise this layer/.test(state(0).textContent));
  assert.ok(/triggered \(1\)/.test(row().textContent));
  // Reset clears the answer and its date.
  click(win, state(0).querySelector('[data-snap="reset-criterion"]'));
  assert.equal(stored()[0].status, ''); assert.equal(stored()[0].answeredAt, '');
  assert.ok(!/triggered/.test(row().textContent));
  // Yes again, then saving a new snapshot resolves the trigger.
  setVal(win, sel(0), 'yes', 'change');
  assert.ok(/triggered \(1\)/.test(row().textContent));
  const later = new win.Date(Date.now() + 2000);
  const RealDate = win.Date;
  win.Date = class extends RealDate { constructor(...a){ super(...(a.length ? a : [later.getTime()])); } static now(){ return later.getTime(); } };
  setVal(win, doc.getElementById('snapName'), 'Now');
  click(win, doc.getElementById('snapSave'));
  assert.equal(doc.getElementById('snapRespond').hidden, false, 'saving with an open trigger prompts for a response');
  click(win, doc.getElementById('snapRespSkip'));
  win.Date = RealDate;
  assert.ok(!/triggered/.test(doc.querySelectorAll('#snapList tbody tr')[0].textContent), 'trigger resolved by the later snapshot');
  assert.ok(/a later snapshot has been saved/.test(doc.getElementById('snapReview').textContent));
  assert.deepEqual(errors, []);
  win.close();
});

test('snapshots: load into the simulator (confirm, recompute, undo), and a malformed snapshot changes nothing', () => {
  const { doc, win, errors } = load();
  const settings = () => JSON.parse(win.localStorage.getItem('load-bearing-sim-v3'));
  // Save a snapshot of a distinctive state, with kill criteria.
  click(win, doc.getElementById('leadlag'));
  click(win, doc.querySelector('#capexSwitch [data-c="vintage"]'));
  setVal(win, doc.getElementById('g_disc'), '12');
  setVal(win, doc.querySelectorAll('#killTable tbody tr')[2].querySelectorAll('input')[0], 'Revise models if prices fall faster');
  setVal(win, doc.getElementById('snapName'), 'Distinct');
  click(win, doc.getElementById('snapSave'));
  const saved = JSON.parse(win.localStorage.getItem('load-bearing-snapshots-v1')).snapshots[0];
  // Move away from it.
  click(win, doc.getElementById('reset'));
  const before = settings();
  assert.equal(before.G.disc, 10);
  // Declining the confirmation changes nothing.
  win.confirm = () => false;
  click(win, doc.querySelector('#snapList [data-snap="load"]'));
  assert.deepEqual(settings(), before);
  // Accepting loads the inputs and recomputes.
  let asked = '';
  win.confirm = (m) => { asked = m; return true; };
  click(win, doc.querySelector('#snapList [data-snap="load"]'));
  assert.ok(/Load “Distinct” into the simulator\? Your current settings will be replaced \(you can undo once\)\./.test(asked), asked);
  assert.ok(!/model version/.test(asked), 'no version warning when versions match');
  assert.equal(doc.getElementById('g_disc').value, '12');
  assert.equal(doc.querySelector('#capexSwitch [data-c="vintage"]').getAttribute('aria-pressed'), 'true');
  const S = require('../src/snapshots.js');
  const now = settings();
  const resaved = S.makeSnapshot({ name: 'x', G: now.G, layers: now.layers });
  assert.deepEqual(resaved.inputs, saved.inputs, 'loading then saving reproduces the inputs');
  assert.deepEqual(verdicts(doc), saved.outputs.map(o => o.bin), 'results recomputed from the loaded inputs');
  assert.equal(doc.querySelectorAll('#killTable tbody tr')[2].querySelectorAll('input')[0].value, 'Revise models if prices fall faster', 'kill criteria fill the form');
  // Undo restores the previous state, once.
  assert.equal(doc.getElementById('snapUndo').hidden, false);
  click(win, doc.getElementById('snapUndo'));
  assert.deepEqual(settings(), before);
  assert.equal(doc.getElementById('g_disc').value, '10');
  assert.equal(doc.getElementById('snapUndo').hidden, true);
  // A malformed snapshot is rejected and changes nothing (tampered in memory after it was stored).
  win.eval('snapStore.snapshots[0].inputs.G.disc = 99');
  click(win, doc.querySelector('#snapList [data-snap="load"]'));
  assert.ok(/Not loaded: .*setting disc: value 99 is outside 5 to 20/.test(doc.getElementById('snapMsg').textContent), doc.getElementById('snapMsg').textContent);
  assert.deepEqual(settings(), before);
  assert.deepEqual(errors, []);
  win.close();
});

test('snapshots: saving with an open trigger prompts "revised" or "kept my view", never blocks, and labels the list', () => {
  const { doc, win, errors } = load();
  const RealDate = win.Date; let t = Date.now();
  const tick = () => { t += 2000; const at = t; win.Date = class extends RealDate { constructor(...a){ super(...(a.length ? a : [at])); } static now(){ return at; } }; };
  const save = (name) => { tick(); setVal(win, doc.getElementById('snapName'), name); click(win, doc.getElementById('snapSave')); };
  const trigger = (rowIndex, layerIndex) => {
    click(win, doc.querySelectorAll('#snapList [data-snap="review"]')[rowIndex]);
    tick(); setVal(win, doc.querySelectorAll('#snapReview select')[layerIndex], 'yes', 'change');
  };
  save('First'); assert.equal(doc.getElementById('snapRespond').hidden, true, 'no prompt without triggers');
  trigger(0, 1);
  // Change two inputs, then save: the prompt lists them.
  setVal(win, doc.getElementById('g_disc'), '12');
  setVal(win, doc.querySelector('#inputs input[data-i="1"][data-k="offset"]'), '-2');
  save('Second');
  const panel = doc.getElementById('snapRespond');
  assert.equal(panel.hidden, false);
  assert.ok(/Data centres and power \(in “First”\)/.test(doc.getElementById('snapRespTrig').textContent));
  assert.ok(/Setting: disc 10 → 12/.test(doc.getElementById('snapRespDiff').textContent), doc.getElementById('snapRespDiff').textContent);
  assert.ok(/Data centres and power: offset 0 → -2/.test(doc.getElementById('snapRespDiff').textContent));
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, 1, 'not saved yet');
  // "Kept my view" without a reason is refused; nothing saved.
  doc.querySelector('input[name="snapResp"][value="kept"]').checked = true;
  click(win, doc.getElementById('snapRespSave'));
  assert.ok(/needs a short reason/.test(doc.getElementById('snapMsg').textContent));
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, 1);
  // "Revised" saves with the changed inputs listed.
  doc.querySelector('input[name="snapResp"][value="revised"]').checked = true;
  tick(); click(win, doc.getElementById('snapRespSave'));
  const stored = () => JSON.parse(win.localStorage.getItem('load-bearing-snapshots-v1')).snapshots;
  assert.equal(stored().length, 2);
  assert.equal(stored()[1].response.kind, 'revised');
  assert.deepEqual(stored()[1].response.changedInputs.map(c => c.path).sort(), ['layer dc.offset', 'settings.disc']);
  assert.ok(/triggered, revised/.test(doc.querySelectorAll('#snapList tbody tr')[1].textContent));
  assert.equal(panel.hidden, true);
  // A new trigger, then "kept my view" with a reason.
  trigger(1, 0);
  save('Third');
  doc.querySelector('input[name="snapResp"][value="kept"]').checked = true;
  setVal(win, doc.getElementById('snapRespReason'), 'One quarter of data is not enough');
  tick(); click(win, doc.getElementById('snapRespSave'));
  assert.equal(stored()[2].response.kind, 'kept');
  assert.equal(stored()[2].response.reason, 'One quarter of data is not enough');
  assert.ok(/triggered, kept view/.test(doc.querySelectorAll('#snapList tbody tr')[2].textContent));
  // Not blocked: with another trigger open, "save without recording" saves with no response.
  trigger(2, 2);
  save('Fourth');
  tick(); click(win, doc.getElementById('snapRespSkip'));
  assert.equal(stored().length, 4);
  assert.equal(stored()[3].response, null);
  win.Date = RealDate;
  assert.deepEqual(errors, []);
  win.close();
});
