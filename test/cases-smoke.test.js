// Case mode in a DEV build (jsdom). The dev build bundles the SYNTHETIC fixtures in test/support/cases/ (placeholder
// values, fictitious sources; never shipped). Fit on screen and dark mode are checked in a real browser (stage report).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const Mo = require('../src/modes.js');
const C = require('../src/cases.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');
const { build } = require('../scripts/build.js');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-dev-'));
build({ dev: true, outDir: out });
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const FIX = {};
for (const n of [1, 3, 6]) { const c = C.validateCase(JSON.parse(fs.readFileSync(path.join(__dirname, 'support', 'cases', 'synthetic-' + n + '.case.json'), 'utf8'))); FIX[n] = c; }

function load(opts = {}){
  const errors = [], vc = new VirtualConsole(), asked = [];
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' + (opts.hash || ''), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse: (w) => { w.confirm = (q) => { asked.push(q); return opts.answer === undefined ? true : opts.answer; }; } });
  return { doc: dom.window.document, win: dom.window, errors, asked };
}
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const setMode = (win, doc, m) => click(win, doc.querySelector('[data-mode-btn="' + m + '"]'));
const $ = (doc, id) => doc.getElementById(id);
// Opening asks in an in-page dialog (not window.confirm); ok=false cancels.
function openCase(win, doc, id, ok = true){
  click(win, $(doc, 'casesBtn')); click(win, doc.querySelector('#casesList [data-case="' + id + '"]'));
  assert.equal($(doc, 'confirmModal').hidden, false, 'asks before opening');
  click(win, $(doc, ok ? 'confirmOk' : 'confirmCancel'));
}
function setInput(win, el, v){ el.value = String(v); el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); }
const sliderVal = (doc, id) => +$(doc, id).value;

test('Cases pill: shown in the dev build; the dialog lists title, as-of date and one line per case', () => {
  const { doc, win, errors } = load();
  assert.equal($(doc, 'casesBtn').hidden, false);
  click(win, $(doc, 'casesBtn'));
  assert.equal($(doc, 'casesModal').hidden, false);
  assert.equal(doc.activeElement, $(doc, 'casesClose'));
  const rows = [...doc.querySelectorAll('#casesList .case')];
  // The dev build has the three synthetic fixtures plus the shipped railway case.
  assert.equal(rows.length, 4);
  rows.filter(r => /^Synthetic/.test(r.querySelector('h3').textContent)).forEach(r => { assert.match(r.querySelector('h3').textContent, /^Synthetic \d-layer case$/); assert.match(r.textContent, /As of 1845-06-30\. Test fixture, not data/); });
  assert.equal(rows.filter(r => /^Synthetic/.test(r.querySelector('h3').textContent)).length, 3);
  click(win, $(doc, 'casesClose'));
  assert.equal($(doc, 'casesModal').hidden, true);
  assert.deepEqual(errors, []);
  win.close();
});

test('opening a case asks in an in-page dialog (focus inside, Esc or Cancel changes nothing, focus returns); no window.confirm', () => {
  const { doc, win, asked } = load();
  const before = doc.querySelector('.tb-name').textContent;
  click(win, $(doc, 'casesBtn')); click(win, doc.querySelector('#casesList [data-case="synthetic-3-layer"]'));
  const m = $(doc, 'confirmModal');
  assert.equal(m.hidden, false); assert.equal($(doc, 'casesModal').hidden, true);
  assert.equal(m.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
  assert.equal($(doc, 'confirmText').textContent, 'Open the case “Synthetic 3-layer case” (as of 1845-06-30)? Your current scenario is kept in memory; use “Return to my scenario” to get it back.');
  assert.ok(m.contains(doc.activeElement), 'focus is inside the dialog');
  // Tab is trapped: from the last button it wraps to the first.
  $(doc, 'confirmCancel').focus();
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.ok(m.contains(doc.activeElement));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(m.hidden, true);
  assert.equal(doc.activeElement, $(doc, 'casesBtn'), 'focus returns to the Cases button');
  openCase(win, doc, 'synthetic-3-layer', false);
  assert.equal(doc.querySelector('.tb-name').textContent, before);
  assert.equal($(doc, 'caseBar').hidden, true);
  openCase(win, doc, 'synthetic-3-layer');
  assert.equal($(doc, 'caseBar').hidden, false);
  assert.equal(doc.activeElement, $(doc, 'casesBtn'));
  assert.deepEqual(asked, [], 'window.confirm is not used to open a case');
  win.close();
});

test('case header: subtitle hidden, full title in a title attribute; example and profile buttons hidden in a case only', () => {
  const { doc, win } = load({ hash: '#analyst' });
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(css.includes('body.case-mode .tb-sub{display:none}'));
  assert.ok(/\.tb-name\{overflow:hidden;text-overflow:ellipsis\}/.test(css));
  assert.ok(css.includes('body.case-mode .nocase{display:none !important}'));
  for (const id of ['arch_rail', 'arch_app', 'leadlag', 'ucdExample']) assert.ok($(doc, id).classList.contains('nocase'), id);
  assert.ok(doc.querySelector('[aria-controls="tip24"]').closest('.tipwrap').classList.contains('nocase'));
  assert.equal(doc.querySelector('.tb-name').title, 'AI Stack: Load Bearing Simulator');
  openCase(win, doc, 'synthetic-6-layer');
  assert.equal(doc.querySelector('.tb-name').title, 'Synthetic 6-layer case: Load Bearing Simulator');
  assert.ok(doc.body.classList.contains('case-mode'));
  click(win, $(doc, 'caseReturn'));
  assert.equal(doc.querySelector('.tb-name').title, 'AI Stack: Load Bearing Simulator');
  assert.ok(!doc.body.classList.contains('case-mode'));
  win.close();
});

test('What happened button: in every mode, opens the outcome content in a dialog; the card stays in Advanced and Analyst', () => {
  const c = FIX[6], { doc, win } = load({ hash: '#basic' });
  openCase(win, doc, c.id);
  const btn = $(doc, 'caseWhat');
  assert.ok($(doc, 'caseBar').contains(btn) && !btn.closest('[data-min]'), 'button shown in every mode');
  btn.focus(); click(win, btn);
  const m = $(doc, 'whModal'), body = $(doc, 'whModalBody');
  assert.equal(m.hidden, false);
  assert.equal(doc.activeElement, $(doc, 'whClose'));
  assert.equal(body.querySelector('[data-wh="whBanner"]').textContent, $(doc, 'whBanner').textContent);
  assert.equal(body.querySelectorAll('[data-wh="outcomeTable"] tbody tr').length, 6);
  assert.equal(body.querySelector('[data-wh="whCounts"]').textContent, $(doc, 'whCounts').textContent);
  assert.equal(body.querySelectorAll('[id]').length, 0, 'no duplicate ids in the copy');
  // Sources dates stay whole.
  assert.ok([...body.querySelectorAll('.nowrap')].every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.textContent)) && body.querySelectorAll('.nowrap').length > 0);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(m.hidden, true);
  assert.equal(doc.activeElement, btn);
  assert.equal($(doc, 'whatHappened').getAttribute('data-min'), 'advanced');
  win.close();
});

for (const n of [1, 3, 6]) {
  test('case with ' + n + ' layer' + (n > 1 ? 's' : '') + ': title, badge, money unit and every panel follow the case in all modes', () => {
    const c = FIX[n];
    const { doc, win, errors } = load();
    openCase(win, doc, c.id);
    assert.equal(doc.querySelector('.tb-name').textContent, c.title + ': Load Bearing Simulator');
    assert.equal(doc.title, c.title + ': Load Bearing Simulator');
    assert.equal($(doc, 'caseBar').hidden, false);
    const badge = doc.querySelector('.casebadge').cloneNode(true); badge.querySelector('.tipwrap').remove();
    assert.equal(badge.textContent.trim(), 'Case: ' + c.title + ', as of ' + c.asOfDate);
    assert.match($(doc, 'caseTip').textContent, new RegExp('As-of rule: .*Hindsight: ' + c.hindsightDisclosure));
    assert.ok(doc.body.classList.contains('case-mode'));
    assert.match($(doc, 'o_pool').textContent, new RegExp('^' + c.moneyUnit[0].replace('$', '\\$')));
    assert.ok($(doc, 'o_pool').textContent.endsWith(c.moneyUnit.slice(1) + ' a year'));
    const st = C.caseState(c, 'base');
    const G = Object.assign({}, D.DEFAULT_G, st.G), res = st.layers.map(L => M.runLayer(L, G));
    for (const m of Mo.MODES) {
      setMode(win, doc, m);
      const k = Mo.kpiTiles(st.layers, G, { G: st.G, layers: st.layers });
      assert.match($(doc, 'kpis').textContent, new RegExp(k.earn.n + ' of ' + n));
      assert.equal(doc.querySelectorAll('#quad .qlab').length, res.filter(o => isFinite(o.headroom)).length, m + ' quadrant labels');
      assert.equal(doc.querySelectorAll('#scoreLite tbody tr').length, n, m + ' compact scorecard');
      assert.equal(doc.querySelectorAll('#score tbody tr').length, n, m + ' detailed scorecard');
      assert.equal(doc.querySelectorAll('#fragility tbody tr').length, n, m + ' fragility');
      assert.equal(doc.querySelectorAll('#inputs tbody tr').length, n, m + ' layer inputs');
      assert.equal(doc.querySelectorAll('#killTable tbody tr').length, n, m + ' kill criteria');
      assert.equal(doc.querySelectorAll('#adoptChart .tlegend li').length, n + 1, m + ' timing legend');
      assert.equal(doc.querySelectorAll('#outcomeTable tbody tr').length, n, m + ' what happened');
      assert.ok([...doc.querySelectorAll('#inputs thead th')].some(th => th.textContent === 'Build capex, ' + c.moneyUnit), m + ' capex header unit');
      assert.ok(!/\$B/.test($(doc, 'cashChart').textContent) || c.moneyUnit === '$B', m + ' cash legend unit');
      assert.equal($(doc, 'hiddenState').hidden, true, m + ': a fresh case has no hidden changes against the case');
    }
    // Layer names come from the case.
    assert.deepEqual([...doc.querySelectorAll('#scoreLite tbody tr')].map(tr => tr.querySelector('td, th').textContent.trim()), c.layers.map(L => L.name));
    // Inputs on screen equal the case values.
    assert.equal(sliderVal(doc, 'g_speed'), st.G.speed); assert.equal(sliderVal(doc, 'g_pool'), st.G.pool);
    assert.equal(+doc.querySelector('#inputs input[data-i="0"][data-k="capex"]').value, st.layers[0].capex);
    assert.deepEqual(errors, []);
    win.close();
  });
}

test('What happened: Advanced and Analyst only; the banner, outcomes with sources, verdicts and counts; no hit rate', () => {
  const c = FIX[6], { doc, win } = load();
  openCase(win, doc, c.id);
  const sec = $(doc, 'whatHappened');
  assert.equal(sec.hidden, false); assert.equal(sec.getAttribute('data-min'), 'advanced');
  assert.equal($(doc, 'whBanner').textContent, 'Scored by someone who knew the outcome. Treat as a sanity check, not calibration. Too few cases for statistical conclusions.');
  assert.equal($(doc, 'whHindsight').textContent, 'Hindsight: ' + c.hindsightDisclosure);
  const rows = [...doc.querySelectorAll('#outcomeTable tbody tr')];
  assert.deepEqual(rows.map(r => r.querySelector('[data-outcome]').textContent), c.outcomes.map(o => o.status));
  assert.match(rows[0].textContent, /Synthetic outcome source \(fictitious, not data\) \(1856-01-01\)/);
  assert.match(rows[2].textContent, /For: .* Against: /);
  assert.equal($(doc, 'whCounts').textContent, 'Layers: 6. Outcomes recorded: yes 2, no 2, contested 1, unknown 1; not recorded 0. Too few cases for statistical conclusions.');
  const body = sec.cloneNode(true); body.querySelectorAll('.tipwrap').forEach(t => t.remove());
  assert.ok(!/hit rate|accuracy|\d%/i.test(body.textContent), 'no hit rate or accuracy figure');
  assert.match($(doc, 'whTip').textContent, /There is no hit rate/);
  // Gone again after returning to your own scenario.
  click(win, $(doc, 'caseReturn'));
  assert.equal(sec.hidden, true);
  win.close();
});

test('basis chips: one per case input, labelled, with citation, calculation or rationale; edits show on the chip and as "modified from case"', () => {
  const c = FIX[3], st = C.caseState(c, 'base'), { doc, win } = load({ hash: '#analyst' });
  openCase(win, doc, c.id);
  const chips = [...doc.querySelectorAll('.bchip')];
  const keys = new Set(chips.map(b => b.dataset.key));
  assert.equal(keys.size, chips.length, 'no duplicate chips');
  assert.equal(chips.length, Object.keys(st.recs).length, 'every input in the case has a chip');
  chips.forEach(b => {
    const rec = st.recs[b.dataset.key], tip = $(doc, b.getAttribute('aria-controls')).textContent;
    assert.ok(b.classList.contains('b-' + rec.basis));
    assert.match(b.getAttribute('aria-label'), new RegExp('Basis: ' + rec.basis));
    if (rec.basis === 'sourced') assert.match(tip, /Sources: Synthetic period source \(fictitious, not data\) \(1845-01-15\)/);
    if (rec.basis === 'derived') assert.match(tip, /Calculation: Synthetic calculation/);
    if (rec.basis === 'judgement') { assert.match(tip, /Rationale: Synthetic rationale/); assert.match(tip, /No source\./); }
  });
  assert.equal(doc.querySelector('.bchip[data-key="layer syn-1.evidence"]').textContent, 'J');
  assert.equal(doc.querySelector('.bchip[data-key="settings.speed"]').textContent, 'D');
  assert.equal($(doc, 'caseModified').hidden, true);
  const cap = doc.querySelector('#inputs input[data-i="1"][data-k="capex"]');
  setInput(win, cap, st.layers[1].capex + 50);
  const chip = doc.querySelector('.bchip[data-key="layer syn-2.capex"]');
  assert.ok(chip.classList.contains('edited'));
  assert.match($(doc, chip.getAttribute('aria-controls')).textContent, /You changed this from the case value \d+ \(now \d+\)/);
  assert.equal($(doc, 'caseModified').hidden, false);
  assert.equal($(doc, 'caseModified').textContent, 'modified from case');
  // Allocations are personal: changing one does not mark the case as modified.
  click(win, $(doc, 'caseReset')); click(win, $(doc, 'confirmOk'));
  setInput(win, doc.querySelector('#scoreLite input[data-k="alloc"]'), 55);
  assert.equal($(doc, 'caseModified').hidden, true);
  win.close();
});

test('Sources dialog lists every source with publication date, kind and series end', () => {
  const c = FIX[3], { doc, win } = load();
  openCase(win, doc, c.id);
  click(win, $(doc, 'caseSources'));
  assert.equal($(doc, 'sourcesModal').hidden, false);
  const rows = [...doc.querySelectorAll('#sourcesTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
  assert.deepEqual(rows, c.sources.map(s => [s.id, s.citation, s.note || '—', s.publicationDate, s.kind, s.seriesEndsOn || '—']));
  assert.ok($(doc, 'sourcesTable').classList.contains('cards'));
  assert.ok([...doc.querySelectorAll('#sourcesTable tbody td')].every(td => td.dataset.label), 'phone cards: every cell labelled');
  win.close();
});

test('versions: pills switch the case version (with a prompt) and only the overridden inputs change', () => {
  const c = FIX[3], { doc, win, asked } = load();
  openCase(win, doc, c.id);
  const pills = [...doc.querySelectorAll('#caseVersions button')];
  assert.deepEqual(pills.map(b => b.textContent), ['Base', 'Hype', 'Measured', 'Long run']);
  assert.equal(pills[0].getAttribute('aria-pressed'), 'true');
  const pool = sliderVal(doc, 'g_pool');
  click(win, pills[2]);
  assert.match($(doc, 'confirmText').textContent, /^Switch to the “Measured” version of this case\?/);
  click(win, $(doc, 'confirmOk'));
  assert.equal(sliderVal(doc, 'g_speed'), 12);
  assert.equal(+doc.querySelector('#inputs input[data-i="1"][data-k="capex"]').value, 180);
  assert.equal(sliderVal(doc, 'g_pool'), pool);
  assert.equal(doc.querySelector('#caseVersions button[data-version="measured"]').getAttribute('aria-pressed'), 'true');
  assert.equal($(doc, 'caseModified').hidden, true, 'a version is not a modification');
  // The 1-layer case has no versions, so no pills.
  click(win, $(doc, 'caseReturn')); openCase(win, doc, 'synthetic-1-layer');
  assert.equal(doc.querySelectorAll('#caseVersions button').length, 0);
  win.close();
});

test('Return to my scenario restores it exactly; Reset to case restores the case; the case never overwrites saved settings', () => {
  const { doc, win } = load();
  setInput(win, $(doc, 'g_disc'), 13);
  setInput(win, doc.querySelector('#scoreLite input[data-k="alloc"]'), 42);
  const saved = win.localStorage.getItem('load-bearing-sim-v3');
  const mine = { disc: sliderVal(doc, 'g_disc'), alloc: doc.querySelector('#scoreLite input[data-k="alloc"]').value, title: doc.querySelector('.tb-name').textContent, unit: $(doc, 'o_pool').textContent };
  openCase(win, doc, 'synthetic-6-layer');
  const caseDisc = sliderVal(doc, 'g_disc');
  setInput(win, $(doc, 'g_disc'), 17);
  assert.equal(win.localStorage.getItem('load-bearing-sim-v3'), saved, 'edits in a case are not saved over my scenario');
  // Reset to case asks first when the case was edited: Cancel (or Esc) keeps the edit and returns focus.
  $(doc, 'caseReset').focus(); click(win, $(doc, 'caseReset'));
  assert.equal($(doc, 'confirmText').textContent, 'Reset every input to the case values? Your edits to the case will be lost.');
  click(win, $(doc, 'confirmCancel'));
  assert.equal(sliderVal(doc, 'g_disc'), 17); assert.equal(doc.activeElement, $(doc, 'caseReset'));
  click(win, $(doc, 'caseReset')); doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(sliderVal(doc, 'g_disc'), 17);
  click(win, $(doc, 'caseReset')); click(win, $(doc, 'confirmOk'));
  assert.equal(sliderVal(doc, 'g_disc'), caseDisc);
  // "Reset everything" inside a case also resets to the case.
  setInput(win, $(doc, 'g_disc'), 17); click(win, $(doc, 'reset'));
  assert.equal(sliderVal(doc, 'g_disc'), caseDisc);
  click(win, $(doc, 'caseReturn'));
  assert.equal(sliderVal(doc, 'g_disc'), mine.disc);
  assert.equal(doc.querySelector('#scoreLite input[data-k="alloc"]').value, mine.alloc);
  assert.equal(doc.querySelector('.tb-name').textContent, mine.title);
  assert.equal($(doc, 'o_pool').textContent, mine.unit);
  assert.equal(doc.querySelectorAll('#scoreLite tbody tr').length, 5);
  assert.equal(doc.querySelectorAll('.bchip').length, 0);
  assert.ok(!doc.body.classList.contains('case-mode'));
  win.close();
});

test('snapshots in a case: saved with the case id; cannot be compared with my scenario; loading one opens its case; undo restores', () => {
  const { doc, win } = load({ hash: '#analyst' });
  setInput(win, $(doc, 'snapName'), 'Mine');
  click(win, $(doc, 'snapSave'));
  openCase(win, doc, 'synthetic-3-layer');
  setInput(win, $(doc, 'snapName'), 'Case view');
  click(win, $(doc, 'snapSave'));
  const store = JSON.parse(win.localStorage.getItem('load-bearing-snapshots-v1'));
  assert.deepEqual(store.snapshots.map(s => s.caseId), [null, 'synthetic-3-layer']);
  assert.equal(store.snapshots[1].inputs.layers.length, 3);
  // Compare across stacks gives a plain message, not an error.
  $(doc, 'cmpA').value = '0'; $(doc, 'cmpB').value = '1';
  click(win, $(doc, 'cmpGo'));
  assert.match($(doc, 'snapCompare').textContent, /different stacks/);
  // Back to my scenario, then load the case snapshot: the case opens.
  click(win, $(doc, 'caseReturn'));
  const loads = [...doc.querySelectorAll('#snapList [data-snap="load"]')];
  click(win, loads[1]); assert.match($(doc, 'confirmText').textContent, /^Load “Case view” into the simulator\?/); click(win, $(doc, 'confirmOk'));
  assert.equal($(doc, 'caseBar').hidden, false);
  assert.match(doc.querySelector('.tb-name').textContent, /^Synthetic 3-layer case/);
  assert.equal(doc.querySelectorAll('#scoreLite tbody tr').length, 3);
  click(win, $(doc, 'snapUndo'));
  assert.equal($(doc, 'caseBar').hidden, true);
  assert.equal(doc.querySelectorAll('#scoreLite tbody tr').length, 5);
  win.close();
});

test('the input guide labels follow the case money unit', () => {
  const { doc, win } = load();
  assert.match(doc.querySelector('#guideTable tr[data-key="capex"] td').textContent, /\$B/);
  openCase(win, doc, 'synthetic-3-layer');
  assert.match(doc.querySelector('#guideTable tr[data-key="capex"] td').textContent, /£m/);
  win.close();
});

test('case-mode link: carries the case, version and only the changed inputs; opening it opens the case with those changes', () => {
  const S = require('../src/snapshots.js');
  let { doc, win } = load({ hash: '#analyst' });
  openCase(win, doc, 'synthetic-3-layer');
  click(win, doc.querySelector('#caseVersions button[data-version="measured"]')); click(win, $(doc, 'confirmOk'));
  setInput(win, $(doc, 'g_disc'), 12);
  setInput(win, doc.querySelector('#scoreLite input[data-k="alloc"]'), 61);
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true });
  click(win, $(doc, 'copyLink'));
  const hash = win.location.hash;
  const p = JSON.parse(Buffer.from(hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.deepEqual([p.c, p.ver, p.d], ['synthetic-3-layer', 'measured', { 'settings.disc': 12 }]);
  win.close();
  ({ doc, win } = load({ hash }));
  assert.equal($(doc, 'confirmModal').hidden, false);
  assert.match($(doc, 'confirmText').textContent, /Open the case “Synthetic 3-layer case” \(as of 1845-06-30\) with the 1 change in this link\?/);
  click(win, $(doc, 'confirmOk'));
  assert.equal($(doc, 'caseBar').hidden, false);
  assert.equal(doc.querySelector('#caseVersions button[data-version="measured"]').getAttribute('aria-pressed'), 'true');
  assert.equal(sliderVal(doc, 'g_disc'), 12);
  assert.equal(sliderVal(doc, 'g_speed'), 12, 'the version value');
  assert.equal($(doc, 'caseModified').hidden, false);
  assert.ok(!/^#s=/.test(win.location.hash));
  // An unknown version is refused with a plain message.
  win.close();
  const bad = '#s=' + S.linkB64Encode(JSON.stringify({ ...p, ver: 'nope' }));
  ({ doc, win } = load({ hash: bad }));
  assert.match($(doc, 'linkNotice').textContent, /has no version “nope”/);
  win.close();
});

test('What happened: the card and the dialog copy share the wrapping rule (a class, not the id)', () => {
  const { doc, win } = load();
  openCase(win, doc, 'synthetic-3-layer');
  click(win, $(doc, 'caseWhat'));
  assert.ok($(doc, 'whModalBody').querySelector('table.outcomes'));
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(css.includes('table.outcomes td{white-space:normal;vertical-align:top}'));
  assert.ok([...doc.querySelectorAll('#outcomeTable tbody td')].every(td => td.dataset.label), 'cells carry column names for the phone cards');
  win.close();
});

test('phone header: one non-sticky row; Behind the tool, Cases and Share in the More menu; Cases opens its dialog from there', () => {
  const { doc, win } = load();
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(/@media \(max-width:599px\)\{\s*\.topbar\{position:static\}\s*\.tb-in\{flex-wrap:nowrap/.test(css), 'not sticky, no wrapping');
  assert.ok(css.includes('.tb-right > .tipwrap,#behindBtn,#casesBtn{display:none}'));
  assert.ok(css.includes('.tb-sub{display:none}'));
  assert.ok(/\.phonenote\{display:block/.test(css), 'the placeholder notice stays on the page on phones');
  assert.match(doc.querySelector('.phonenote').textContent, /^Placeholders, not data\./);
  // jsdom has no media queries: show the phone menu as the phone CSS does.
  const st = doc.createElement('style'); st.textContent = '#shareBtn,#behindBtn,#casesBtn{display:none}.morewrap{display:inline-block}'; doc.head.appendChild(st);
  const more = $(doc, 'moreBtn');
  assert.deepEqual([...doc.querySelectorAll('#moreMenu [role="menuitem"]')].filter(b => !b.hidden).map(b => b.textContent), ['Behind the tool', 'Cases', 'Share a link']);
  more.focus(); click(win, more); click(win, $(doc, 'moreCases'));
  assert.equal($(doc, 'casesModal').hidden, false); assert.equal($(doc, 'moreMenu').hidden, true);
  assert.equal(doc.querySelectorAll('#casesList .case').length, 4);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(doc.activeElement, more, 'focus returns to More');
  click(win, more); click(win, $(doc, 'moreBehind'));
  assert.equal($(doc, 'behindModal').hidden, false);
  click(win, $(doc, 'behindClose')); assert.equal(doc.activeElement, more);
  // Opening a case from the More menu path works end to end.
  click(win, more); click(win, $(doc, 'moreCases')); click(win, doc.querySelector('[data-case="synthetic-1-layer"]')); click(win, $(doc, 'confirmOk'));
  assert.equal($(doc, 'caseBar').hidden, false);
  win.close();
});
