// Smoke test for docs/calibration.html in jsdom. jsdom has no layout, so this checks behaviour, not appearance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const C = require('../src/calibration.js');
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
const $ = (doc, id) => doc.getElementById(id);
async function importText(win, doc, text){
  const input = $(doc, 'epImport');
  Object.defineProperty(input, 'files', { value: [new win.File([text], 'e.episode.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
}

test('calibration page: built from src with no export lines or duplicate names, and loads with no errors', () => {
  assert.ok(!/module\.exports/.test(html));
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const names = [...js.matchAll(/^(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
  for (const marker of ['function runLayer(', 'const LAYER_RANGES', 'function importSnapshotsText(', 'function validateEpisode(', 'function calInit(']) assert.ok(html.includes(marker), marker);
  assert.ok(!/https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(html.replace(/<link[^>]+>/g, '')), 'no network access beyond the font stylesheet');
  const { doc, errors, win } = load();
  assert.equal(doc.title, 'Calibration Scaffold');
  assert.equal($(doc, 'scorerBanner').textContent, C.EP_BANNER);
  assert.equal($(doc, 'cmpBanner').textContent, C.EP_BANNER);
  assert.equal($(doc, 'cmpCounts').textContent, 'Episodes: 0. Layers: 0. Too few cases for statistical conclusions.');
  assert.ok(/Scaffold only, no data/.test(doc.body.textContent));
  assert.deepEqual(errors, []);
  win.close();
});

test('calibration page: draft, lock refused until ready, then import, lock, outcomes and comparison', async () => {
  const { doc, win, errors } = load();
  click(win, $(doc, 'epNew'));
  assert.equal($(doc, 'editor').hidden, false);
  assert.equal($(doc, 'outBox').hidden, true, 'no outcome entry for a draft');
  click(win, $(doc, 'epLock'));
  assert.ok(/Not locked: Not ready to lock\. Still needed: .*the as-of rule, the outcome horizon, the outcome measure/.test($(doc, 'edSave').textContent), $(doc, 'edSave').textContent);
  // Import a complete synthetic episode (fictitious sources; not data).
  const ep = syntheticEpisode(); ep.name = '<img src=x onerror="window.__x=1">';
  await importText(win, doc, JSON.stringify(ep));
  assert.ok(/Imported/.test($(doc, 'epMsg').textContent), $(doc, 'epMsg').textContent);
  const rows = doc.querySelectorAll('#epList tbody tr');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].cells[0].textContent, ep.name, 'name shown as text');
  assert.equal(doc.querySelector('#epList img'), null); assert.equal(win.__x, undefined);
  click(win, rows[1].querySelector('[data-ep="open"]'));
  click(win, $(doc, 'epLock'));
  assert.equal($(doc, 'edSave').textContent, 'Locked.');
  assert.ok(/Locked on .* under model version 1\. Input hash [0-9a-f]{16}/.test($(doc, 'edStatus').textContent));
  assert.equal($(doc, 'f_name').disabled, true, 'locked inputs cannot be edited');
  assert.ok([...doc.querySelectorAll('#setTable input, #layerBox input')].every(i => i.disabled));
  assert.equal($(doc, 'epVersion').hidden, false);
  // Outcomes after locking.
  assert.equal($(doc, 'outBox').hidden, false);
  const orow = doc.querySelectorAll('#outTable tbody tr')[0];
  orow.querySelector('select').value = 'no';
  const inputs = orow.querySelectorAll('input');
  inputs[0].value = 'SYN-IN'; inputs[1].value = 'synthetic note';
  click(win, orow.querySelector('[data-ep="save-outcome"]'));
  assert.ok(/Outcome not saved: .*must be published after the as-of date/.test($(doc, 'edSave').textContent), 'an input-period source cannot back an outcome');
  inputs[0].value = 'SYN-OUT';
  click(win, orow.querySelector('[data-ep="save-outcome"]'));
  assert.ok(/Outcome saved/.test($(doc, 'edSave').textContent), $(doc, 'edSave').textContent);
  // Comparison table and counts.
  assert.equal($(doc, 'cmpCounts').textContent, 'Episodes: 1. Layers: 3. Too few cases for statistical conclusions.');
  const crow = doc.querySelectorAll('#cmpTable tbody tr')[0];
  const c = C.compareEpisodes([C.setOutcome(C.lockEpisode(C.validateEpisode(JSON.parse(JSON.stringify(ep)))), { layer: 0, result: 'no', sourceIds: ['SYN-OUT'], note: 'synthetic note', contested: null })]);
  assert.equal(crow.cells[2].textContent, c.rows[0].verdict);
  assert.equal(crow.cells[5].textContent, 'no');
  assert.ok(!/hit rate|accuracy|%/i.test($(doc, 'cmpCounts').textContent));
  // New version: an unlocked draft linked to the old hash.
  click(win, $(doc, 'epVersion'));
  assert.ok(/New draft version 2 made/.test($(doc, 'edSave').textContent));
  assert.equal(doc.querySelectorAll('#epList tbody tr').length, 3);
  assert.equal($(doc, 'f_name').disabled, false);
  // Stored episodes survive a strict reload.
  const stored = JSON.parse(win.localStorage.getItem('load-bearing-calibration-v1')).episodes;
  assert.equal(stored.length, 3);
  stored.forEach(e => assert.equal(C.importEpisodeText(JSON.stringify(e)).ok, true));
  assert.deepEqual(errors, []);
  win.close();
});

test('calibration page: judgement-heavy banner, and strict import errors shown', async () => {
  const { doc, win, errors } = load();
  await importText(win, doc, JSON.stringify(syntheticEpisode({ basis: 'judgement' })));
  click(win, doc.querySelector('#epList [data-ep="open"]'));
  assert.equal($(doc, 'judgeBanner').hidden, false);
  assert.ok(/Judgement-heavy: \d+ of \d+ filled inputs are judgement/.test($(doc, 'judgeBanner').textContent));
  await importText(win, doc, '{"__proto__": {"x": 1}}');
  assert.ok(/Import rejected: the file contains a forbidden key "__proto__"/.test($(doc, 'epMsg').textContent));
  const bad = JSON.parse(JSON.stringify(syntheticEpisode())); bad.layers[0].inputs.share.sourceIds = [];
  await importText(win, doc, JSON.stringify(bad));
  assert.ok(/Import rejected: .*a value needs at least one cited source/.test($(doc, 'epMsg').textContent), $(doc, 'epMsg').textContent);
  assert.equal(doc.querySelectorAll('#epList tbody tr').length, 1, 'rejected files add nothing');
  assert.deepEqual(errors, []);
  win.close();
});
