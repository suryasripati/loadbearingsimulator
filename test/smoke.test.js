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
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc, pretendToBeVisual: true,
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
  assert.equal(doc.title, 'Load Bearing Simulator');
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
  doc.querySelectorAll('#inputs input[data-i="' + i + '"], #phaseTable input[data-i="' + i + '"]').forEach(inp => {
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
  const sliders = { g_speed: 'speed', g_mid: 'mid', g_pool: 'pool', g_prem: 'premium', g_mult: 'mult', g_entry: 'entry', g_disc: 'disc', g_rd: 'rd', g_tv: 'tv' };
  for (const id in sliders) assert.deepEqual(r3(doc.getElementById(id)), D.GLOBAL_RANGES[sliders[id]], id);
  assert.deepEqual(Object.values(sliders).sort(), Object.keys(D.GLOBAL_RANGES).sort(), 'every global range has a slider');
  assert.deepEqual(r3(doc.getElementById('ph1')), D.PHASE_RANGES[0]);
  assert.deepEqual(r3(doc.getElementById('ph2')), D.PHASE_RANGES[1]);
  const keys = new Set();
  doc.querySelectorAll('#inputs input[data-k], #phaseTable input[data-k]').forEach(inp => {
    keys.add(inp.dataset.k);
    assert.deepEqual(r3(inp), D.LAYER_RANGES[inp.dataset.k], inp.dataset.k);
  });
  for (const k of ['buildStart', 'unitCostDecline', 'passThrough', 'offset', 'steepness', 'driftP', 'marginP']) assert.ok(keys.has(k), k + ' is on the page');
  assert.deepEqual([...keys].sort(), Object.keys(D.LAYER_RANGES).sort(), 'every layer range has an input on the page');
  // The validator accepts each range's ends and rejects just beyond them.
  const S = require('../src/snapshots.js');
  const G = { ...D.DEFAULT_G, entryDef: 'A', capexModel: 'sustaining', phases: D.DEFAULT_PHASES.slice() };
  const base = () => JSON.parse(S.exportSnapshotsText([S.makeSnapshot({ name: 'r', G, layers: D.DEFAULT_LAYERS.map(L => ({ ...L })) })], { includeAllocations: true }));
  const tryVal = (set) => { const f = base(); set(f.snapshots[0]); return S.importSnapshotsText(JSON.stringify(f)).ok; };
  for (const k in D.LAYER_RANGES) {
    const [lo, hi] = D.LAYER_RANGES[k];
    const put = (v) => (s) => { const L = s.inputs.layers[0]; if (Array.isArray(L[k])) L[k][0] = v; else L[k] = v; };
    assert.ok(tryVal(put(lo)) && tryVal(put(hi)), k + ' ends accepted');
    assert.ok(!tryVal(put(lo - 1)) && !tryVal(put(hi + 1)), k + ' beyond the ends rejected');
  }
  for (const k in D.GLOBAL_RANGES) {
    const [lo, hi] = D.GLOBAL_RANGES[k];
    assert.ok(tryVal(s => { s.inputs.G[k] = lo; }) && tryVal(s => { s.inputs.G[k] = hi; }), k + ' ends accepted');
    assert.ok(!tryVal(s => { s.inputs.G[k] = lo - 1; }) && !tryVal(s => { s.inputs.G[k] = hi + 1; }), k + ' beyond the ends rejected');
  }
  assert.ok(tryVal(s => { s.inputs.G.phases = [D.PHASE_RANGES[0][0], D.PHASE_RANGES[1][1]]; }));
  assert.ok(!tryVal(s => { s.inputs.G.phases = [D.PHASE_RANGES[0][0] - 1, 10]; }) && !tryVal(s => { s.inputs.G.phases = [5, D.PHASE_RANGES[1][1] + 1]; }));
  win.close();
});

test('build inlines every source file in order and strips their export lines', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  assert.ok(!/module\.exports/.test(html), 'no export lines in the page');
  const order = ['function runLayer(', 'const DEFAULT_LAYERS', 'function importSnapshotsText(', 'function snapInit('].map(m => html.indexOf(m));
  order.forEach((i, k) => assert.ok(i > 0, 'marker ' + k + ' present'));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'model, then defaults, then snapshots, then UI');
  for (const f of ['src/model.js', 'src/defaults.js', 'src/snapshots.js']) {
    const body = read(f).split('\n').filter(l => !l.includes('module.exports')).join('\n');
    assert.ok(html.includes(body), f + ' is inlined unchanged apart from its export line');
  }
  assert.ok(html.includes(read('src/app.js')), 'src/app.js is inlined');
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
function stubDownloads(win){
  const blobs = [];
  win.URL.createObjectURL = (b) => { blobs.push(b); return 'blob:test/' + blobs.length; };
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function(){};
  return blobs;
}
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

test('snapshots: export leaves allocations out unless ticked; import is strict and shows what was rejected', async () => {
  const { doc, win, errors } = load();
  const blobs = stubDownloads(win);
  setVal(win, doc.getElementById('snapName'), 'For export');
  click(win, doc.getElementById('snapSave'));
  assert.ok(/public/.test(doc.getElementById('expWarn').textContent), 'public-repo warning is visible');
  click(win, doc.getElementById('snapExport'));
  const plain = JSON.parse(await blobs[0].text());
  assert.equal(plain.includesAllocations, false);
  assert.ok(plain.snapshots[0].inputs.layers.every(L => !('alloc' in L)));
  doc.getElementById('expAlloc').checked = true;
  doc.getElementById('expAlloc').dispatchEvent(new win.Event('change', { bubbles: true }));
  click(win, doc.getElementById('snapExport'));
  const withAlloc = JSON.parse(await blobs[1].text());
  assert.equal(withAlloc.includesAllocations, true);
  assert.equal(withAlloc.snapshots[0].inputs.layers[0].alloc, D.DEFAULT_LAYERS[0].alloc);
  // Import through the file input: a good file adds snapshots; a bad one is rejected with a reason.
  const input = doc.getElementById('snapImport');
  const send = async (text) => {
    const file = new win.File([text], 'x.snapshot.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
  };
  plain.snapshots[0].name = 'Imported <script>window.__y=1</script>';
  await send(JSON.stringify(plain));
  assert.ok(/Imported 1 snapshot/.test(doc.getElementById('snapErr').textContent), doc.getElementById('snapErr').textContent);
  const rows = doc.querySelectorAll('#snapList tbody tr');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].cells[0].textContent, 'Imported <script>window.__y=1</script>');
  assert.equal(win.__y, undefined);
  const bad = JSON.parse(JSON.stringify(plain)); bad.snapshots[0].inputs.G.disc = 99;
  await send(JSON.stringify(bad));
  assert.ok(/Import rejected: Snapshot 1 setting disc: value 99 is outside 5 to 20/.test(doc.getElementById('snapErr').textContent), doc.getElementById('snapErr').textContent);
  await send('{"__proto__": {"polluted": 1}}');
  assert.ok(/forbidden key "__proto__"/.test(doc.getElementById('snapErr').textContent));
  assert.equal(doc.querySelectorAll('#snapList tbody tr').length, 2, 'rejected files add nothing');
  assert.deepEqual(errors, []);
  win.close();
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
