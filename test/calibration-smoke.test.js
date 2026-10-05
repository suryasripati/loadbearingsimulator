// Smoke test for docs/calibration.html in jsdom. jsdom has no layout, so this checks behaviour, not appearance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const C = require('../src/calibration.js');
const G = require('../src/calibration-guide.js');
const { syntheticEpisode } = require('./support/synthetic-episode.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'calibration.html'), 'utf8');
function load(){
  const errors = [], vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/calibration.html', virtualConsole: vc, pretendToBeVisual: true });
  return { doc: dom.window.document, win: dom.window, errors };
}
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const change = (win, el, v) => { el.value = v; el.dispatchEvent(new win.Event('change', { bubbles: true })); };
const $ = (doc, id) => doc.getElementById(id);
const stored = (win) => JSON.parse(win.localStorage.getItem('load-bearing-calibration-v1')).episodes;
async function importText(win, doc, text){
  const input = $(doc, 'epImport');
  Object.defineProperty(input, 'files', { value: [new win.File([text], 'e.episode.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
}
const openEp = (win, doc, i) => click(win, doc.querySelectorAll('#epList [data-ep="open"]')[i || 0]);

test('calibration page: built from src with no export lines or duplicate names, and loads with no errors', () => {
  assert.ok(!/module\.exports/.test(html));
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const names = [...js.matchAll(/^(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
  for (const marker of ['function runLayer(', 'const LAYER_RANGES', 'function importSnapshotsText(', 'const GUIDE =', 'function validateEpisode(', 'function calInit(']) assert.ok(html.includes(marker), marker);
  assert.ok(!/https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(html.replace(/<link[^>]+>/g, '')), 'no network access beyond the font stylesheet');
  const { doc, errors, win } = load();
  assert.equal(doc.title, 'Calibration Scaffold');
  assert.equal($(doc, 'scorerBanner').textContent, C.EP_BANNER);
  assert.equal($(doc, 'cmpCounts').textContent, 'Episodes: 0. Layers: 0. Too few cases for statistical conclusions.');
  assert.deepEqual(errors, []);
  win.close();
});

test('calibration page: checklist and in-page help for every input', () => {
  const { doc, win, errors } = load();
  click(win, $(doc, 'epNew'));
  const checks = [...doc.querySelectorAll('#checkTable select[data-check]')];
  assert.deepEqual(checks.map(s => s.dataset.check), G.SCORER_CHECKLIST.map(c => c.key));
  assert.deepEqual([...checks[0].options].map(o => o.value), ['', 'yes', 'no', 'partly']);
  // Help on every settings and layer input row, with all four parts.
  const rows = [...doc.querySelectorAll('#setTable tbody tr, #layerBox tbody tr')];
  assert.equal(rows.length, C.EP_SETTING_KEYS.length + C.EP_LAYER_KEYS.length + 6);
  rows.forEach(r => {
    const h = r.querySelector('details.help');
    assert.ok(h, r.firstChild.textContent);
    assert.ok(/Meaning\. .*Where to look at the as-of date\. .*Recipe\. .*Hindsight trap\. /.test(h.textContent));
  });
  // Lock is refused until every checklist item is answered.
  click(win, $(doc, 'epLock'));
  assert.ok(/checklist: knew the peak date, checklist: knew the size of the fall/.test($(doc, 'edSave').textContent), $(doc, 'edSave').textContent);
  checks.forEach(s => change(win, s, 'partly'));
  assert.deepEqual(stored(win)[0].scorer.checklist, Object.fromEntries(G.SCORER_CHECKLIST.map(c => [c.key, 'partly'])));
  click(win, $(doc, 'epLock'));
  assert.ok(!/checklist:/.test($(doc, 'edSave').textContent));
  assert.deepEqual(errors, []);
  win.close();
});

test('calibration page: the doubling-time helper fills a derived speed with its calculation', async () => {
  const { doc, win, errors } = load();
  await importText(win, doc, JSON.stringify(syntheticEpisode()));
  openEp(win, doc);
  const row = [...doc.querySelectorAll('#setTable tbody tr')].find(tr => tr.firstChild.firstChild.textContent === 'speed');
  const helper = row.querySelector('.helper');
  assert.ok(/Early phase only; the midpoint is separate/.test(helper.textContent));
  helper.querySelector('input').value = '1.5';
  click(win, helper.querySelector('[data-helper="doubling"]'));
  const sp = stored(win)[0].variants[0].settings.speed;
  assert.deepEqual([sp.value, sp.basis], [C.doublingTimeToSpeed(1.5).value, 'derived']);
  assert.equal(sp.calculation, C.doublingTimeToSpeed(1.5).calculation);
  assert.deepEqual(sp.sourceIds, ['SYN-IN'], 'its cited source is kept');
  helper.querySelector('input').value = '10';
  click(win, helper.querySelector('[data-helper="doubling"]'));
  assert.ok(/outside the model range/.test($(doc, 'edSave').textContent));
  assert.deepEqual(errors, []);
  win.close();
});

test('calibration page: two input versions, each locked separately; shared fields freeze; outcomes after both; comparison side by side', async () => {
  const { doc, win, errors } = load();
  await importText(win, doc, JSON.stringify(syntheticEpisode()));
  openEp(win, doc);
  click(win, $(doc, 'varAdd'));
  assert.equal($(doc, 'varSel').options.length, 2);
  const lbl = $(doc, 'varLabel'); lbl.value = 'Measured'; lbl.dispatchEvent(new win.Event('input', { bubbles: true }));
  // Change the measured version's adoption speed.
  const speed = [...doc.querySelectorAll('#setTable tbody tr')].find(tr => tr.firstChild.firstChild.textContent === 'speed').cells[1].querySelector('input'); // the value cell, not the helper's box
  speed.value = '14'; speed.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.deepEqual(stored(win)[0].variants.map(v => [v.label, v.settings.speed.value]), [['Main', 8], ['Measured', 14]]);
  // Lock "Measured" first; shared fields freeze; "Main" can still be edited.
  click(win, $(doc, 'epLock'));
  assert.equal($(doc, 'edSave').textContent, 'Locked.');
  assert.ok($(doc, 'f_rule').disabled && $(doc, 'f_asOf').disabled && doc.querySelector('#checkTable select').disabled && doc.querySelector('#layerNames input').disabled);
  assert.equal($(doc, 'outBox').hidden, true, 'no outcomes until every version is locked');
  change(win, $(doc, 'varSel'), '0');
  assert.equal(doc.querySelector('#setTable input[type="number"]').disabled, false, 'Main is still a draft');
  click(win, $(doc, 'epLock'));
  const vs = stored(win)[0].variants;
  assert.ok(vs.every(v => v.lock && v.lock.hashScheme === 3 && v.lock.checklistCaptured));
  assert.notEqual(vs[0].lock.hash, vs[1].lock.hash);
  // Outcomes now; then no new input version.
  assert.equal($(doc, 'outBox').hidden, false);
  const orow = doc.querySelectorAll('#outTable tbody tr')[0];
  orow.querySelector('select').value = 'no';
  const inputs = orow.querySelectorAll('input'); inputs[0].value = 'SYN-OUT'; inputs[1].value = 'synthetic note';
  click(win, orow.querySelector('[data-ep="save-outcome"]'));
  assert.ok(/Outcome saved/.test($(doc, 'edSave').textContent));
  assert.equal($(doc, 'varAdd').disabled, true);
  // Comparison: one column per version, side by side, with the recorded outcome.
  assert.equal($(doc, 'cmpCounts').textContent, 'Episodes: 1. Layers: 3. Too few cases for statistical conclusions.');
  const heads = [...doc.querySelectorAll('#cmpBox th')].map(th => th.textContent);
  assert.deepEqual(heads, ['Layer', 'Verdict: Main', 'Verdict: Measured', 'Recorded outcome']);
  const ep = C.importEpisodeText(JSON.stringify(stored(win)[0])).episode, c = C.compareEpisodes([ep]);
  const r0 = doc.querySelectorAll('#cmpBox tbody tr')[0];
  assert.equal(r0.querySelector('[data-variant="Main"]').firstChild.textContent, c.groups[0].rows[0].variants[0].verdict);
  assert.equal(r0.querySelector('[data-variant="Measured"]').firstChild.textContent, c.groups[0].rows[0].variants[1].verdict);
  assert.equal(r0.lastChild.textContent, 'no');
  assert.ok([...doc.querySelectorAll('#cmpBox [data-basis]')].every(x => /^Inputs at lock: judgement 0 of \d+ \(0%\), uncited 0$/.test(x.textContent)));
  assert.deepEqual(errors, []);
  win.close();
});

test('calibration page: lock confirmation, uncited label and private export still work', async () => {
  const { doc, win, errors } = load();
  const names = [];
  win.URL.createObjectURL = () => 'blob:x'; win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function(){ names.push(this.getAttribute('download')); };
  const ep = JSON.parse(JSON.stringify(syntheticEpisode()));
  ep.variants[0].layers[0].inputs.share = { ...ep.variants[0].layers[0].inputs.share, basis: 'judgement', sourceIds: [], rationale: 'synthetic uncited judgement' };
  await importText(win, doc, JSON.stringify(ep));
  openEp(win, doc);
  assert.equal([...doc.querySelectorAll('#layerBox [data-uncited]')].filter(t => !t.hidden).length, 1);
  click(win, $(doc, 'epLock'));
  assert.equal($(doc, 'lockAckText').textContent, 'Before locking “Main”: 1 input is uncited. Lock anyway, or cancel and add sources?');
  click(win, $(doc, 'lockCancel'));
  assert.equal(stored(win)[0].variants[0].lock, null);
  click(win, $(doc, 'epLock')); click(win, $(doc, 'lockAnyway'));
  assert.equal($(doc, 'edSave').textContent, 'Locked, with your acknowledgement recorded.');
  click(win, $(doc, 'epExport'));
  assert.equal(names[0], 'synthetic-test-v1.private.json');
  assert.deepEqual(errors, []);
  win.close();
});

test('calibration page: a schema 2 file with a lock imports and says the checklist was not captured', async () => {
  const { doc, win, errors } = load();
  await importText(win, doc, fs.readFileSync(path.join(__dirname, 'fixtures', 'episode_schema2_locked.json'), 'utf8'));
  assert.ok(/Imported/.test($(doc, 'epMsg').textContent), $(doc, 'epMsg').textContent);
  openEp(win, doc);
  assert.ok(/Locked under an older schema: the scorer checklist was not captured in this lock\./.test($(doc, 'varStatus').textContent));
  assert.ok(/Locked with an acknowledgement: 2 of \d+ inputs judgement, 2 uncited\./.test($(doc, 'varStatus').textContent));
  // A tampered multi-version file is refused with the version named.
  let two = C.addVariant(syntheticEpisode(), 'Measured', 0);
  two = C.lockVariant(C.lockVariant(two, 0), 1);
  const t = JSON.parse(C.exportEpisodeText(two)); t.variants[1].settings.disc.value = 12;
  await importText(win, doc, JSON.stringify(t));
  assert.ok(/Import rejected: .*input version 2 \(Measured\) lock: .*do not match the lock hash/.test($(doc, 'epMsg').textContent), $(doc, 'epMsg').textContent);
  assert.equal(doc.querySelectorAll('#epList tbody tr').length, 1);
  assert.deepEqual(errors, []);
  win.close();
});
