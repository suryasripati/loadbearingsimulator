// Input guide: one row per input, ranges and defaults generated from src/defaults.js, and the guide table, search,
// case-guidance toggle, tabs and tooltips in the built page (jsdom). Fit inside the viewport is checked in a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const Gd = require('../src/guide.js');
const D = require('../src/defaults.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
function load(hash){
  const errors = [], vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' + (hash || ''), virtualConsole: vc, pretendToBeVisual: true });
  return { doc: dom.window.document, win: dom.window, errors };
}
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const key = (win, el, k) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
const SWITCHES = ['entryDef', 'capexModel', 'tvMode'];

test('every input in the shared ranges, plus the three switches, has exactly one guide row with every field', () => {
  const rows = Gd.guideRows(), keys = rows.map(r => r.key);
  assert.equal(new Set(keys).size, keys.length);
  const want = Object.keys(D.GLOBAL_RANGES).concat(Object.keys(D.LAYER_RANGES), ['phase2Start', 'phase3Start'], SWITCHES);
  assert.deepEqual(keys.slice().sort(), want.slice().sort());
  rows.forEach(r => { for (const f of ['label', 'meaning', 'range', 'shownIn', 'where', 'recipe', 'trap']) assert.ok(r[f] && r[f].trim(), r.key + ' ' + f); });
  assert.deepEqual([...new Set(rows.map(r => r.group))], Gd.GUIDE_GROUPS, 'grouped in section order');
  assert.ok(keys.includes('tvMode') && keys.includes('tvGrowth'));
});

test('"Range and default" equals the shared definitions for every input', () => {
  const n = (v) => String(Math.round(v * 1000) / 1000);
  for (const r of Gd.guideRows()) {
    const k = r.key;
    if (SWITCHES.includes(k)) {
      const def = { entryDef: D.DEFAULT_DEF, capexModel: D.DEFAULT_CAPEX, tvMode: D.DEFAULT_TV_MODE }[k];
      assert.ok(r.range.endsWith('default ' + def), k);
      continue;
    }
    const rg = D.GLOBAL_RANGES[k] || D.LAYER_RANGES[k] || D.PHASE_RANGES[k === 'phase2Start' ? 0 : 1];
    const m = /^(-?[\d.]+) to (-?[\d.]+), step ([\d.]+); default (.+)$/.exec(r.range);
    assert.ok(m, k + ': ' + r.range);
    assert.deepEqual([+m[1], +m[2], +m[3]], rg, k + ' range');
    let def;
    if (k in D.GLOBAL_RANGES) def = n(D.DEFAULT_G[k]);
    else if (k === 'phase2Start') def = n(D.DEFAULT_PHASES[0]);
    else if (k === 'phase3Start') def = n(D.DEFAULT_PHASES[1]);
    else { const v = D.DEFAULT_LAYERS.map(L => Array.isArray(L[k]) ? L[k][0] : L[k]); def = v.every(x => x === v[0]) ? n(v[0]) + ' for every layer' : 'by layer ' + v.map(n).join(', ') + ' (table order)'; }
    assert.equal(m[4], def, k + ' default');
  }
});

test('guide table in the page: one row per input under group headers, values from guideRows, "Shown in" matches where the input really is', () => {
  const { doc, errors } = load();
  const rows = [...doc.querySelectorAll('#guideTable tbody tr[data-key]')];
  const g = Gd.guideRows();
  assert.deepEqual(rows.map(r => r.dataset.key), g.map(r => r.key));
  assert.deepEqual([...doc.querySelectorAll('#guideTable tr.grp')].map(r => r.textContent), Gd.GUIDE_GROUPS);
  assert.ok(doc.querySelector('#guideTable thead th'), 'header row');
  rows.forEach((tr, i) => {
    const td = [...tr.children];
    assert.equal(td[2].textContent, g[i].range);
    assert.equal(td[3].textContent, g[i].shownIn);
  });
  // Where each input lives: no data-min ancestor means every mode; data-min="analyst" means Analyst only.
  const sliders = { speed: 'g_speed', mid: 'g_mid', pool: 'g_pool', premium: 'g_prem', mult: 'g_mult', entry: 'g_entry', disc: 'g_disc', rd: 'g_rd', tv: 'g_tv', tvGrowth: 'g_tvg' };
  const elOf = (k) => sliders[k] ? doc.getElementById(sliders[k]) : k === 'phase2Start' ? doc.getElementById('ph1') : k === 'phase3Start' ? doc.getElementById('ph2')
    : k === 'entryDef' ? doc.getElementById('defSwitch') : k === 'capexModel' ? doc.getElementById('capexSwitch') : k === 'tvMode' ? doc.getElementById('tvSwitch')
    : k === 'alloc' ? doc.querySelector('#scoreLite input[data-k="alloc"]') : doc.querySelector('#inputs input[data-k="' + k + '"], #phaseTable input[data-k="' + k + '"]');
  const minMode = (e) => { const m = e.closest('[data-min]'); return m ? m.getAttribute('data-min') : 'basic'; };
  g.forEach(r => {
    const e = elOf(r.key);
    assert.ok(e, r.key + ' is on the page');
    assert.equal(minMode(e), r.shownIn === 'Analyst' ? 'analyst' : 'basic', r.key);
  });
  // Formulas are in monospace code elements.
  assert.ok(doc.querySelectorAll('#guideTable code').length >= 15);
  assert.equal(doc.querySelector('#guideTable tr[data-key="disc"] code').textContent, 'disc = r + p');
  assert.deepEqual(errors, []);
});

test('search filters rows by input name and hides empty groups; the case-guidance toggle shows and hides three columns', () => {
  const { doc, win } = load();
  const s = doc.getElementById('guideSearch'), shown = () => [...doc.querySelectorAll('#guideTable tbody tr[data-key]')].filter(r => !r.hidden).map(r => r.dataset.key);
  const type = (v) => { s.value = v; s.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const all = shown().length;
  type('discount'); assert.deepEqual(shown(), ['disc']);
  assert.deepEqual([...doc.querySelectorAll('#guideTable tr.grp')].filter(r => !r.hidden).map(r => r.textContent), ['Money']);
  type('BUILD'); assert.deepEqual(shown(), ['premium', 'capex', 'debt', 'buildStart', 'buildYears'], 'case-insensitive, matches anywhere in the name');
  type('build s'); assert.deepEqual(shown(), ['buildStart']);
  type('zzz'); assert.deepEqual(shown(), []); assert.equal(doc.querySelector('#guideTable tr.none').hidden, false);
  assert.equal(doc.getElementById('guideCount').textContent, '0 of ' + all + ' inputs');
  type(''); assert.equal(shown().length, all);
  const cg = () => [...doc.querySelectorAll('#guideTable .cg')];
  assert.equal(cg().length, 3 * (all + 0) + 3, 'three header cells and three cells per row');
  assert.ok(cg().every(c => c.hidden), 'off by default');
  assert.deepEqual([...doc.querySelectorAll('#guideTable thead th')].filter(t => !t.hidden).map(t => t.textContent), ['Input', 'What it means', 'Range and default', 'Shown in']);
  const box = doc.getElementById('guideCase'); box.checked = true; box.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.ok(cg().every(c => !c.hidden));
  assert.deepEqual([...doc.querySelectorAll('#guideTable thead th')].filter(t => !t.hidden).map(t => t.textContent).slice(4), ['Where to look at the as-of date', 'Recipe', 'Hindsight trap']);
  box.checked = false; box.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.ok(cg().every(c => c.hidden));
  // Phones: each cell carries its column name for the stacked-card layout.
  assert.ok([...doc.querySelectorAll('#guideTable tbody tr[data-key] td')].every(td => td.dataset.label));
  win.close();
});

test('Behind the tool: a real modal with four tabs; arrow keys, Home and End move between tabs; one panel shown at a time', () => {
  const { doc, win } = load();
  const btn = doc.getElementById('behindBtn'); btn.focus(); click(win, btn);
  const dlg = doc.querySelector('#behindModal [role="dialog"]');
  assert.equal(dlg.getAttribute('aria-modal'), 'true');
  const tabs = [...doc.querySelectorAll('#behindModal [role="tab"]')];
  assert.deepEqual(tabs.map(t => t.textContent), ['How it works', 'Where it is weak', 'Input guide', 'Research']);
  const state = () => tabs.map(t => [t.getAttribute('aria-selected'), t.tabIndex, doc.getElementById(t.getAttribute('aria-controls')).hidden]);
  assert.deepEqual(state()[0], ['true', 0, false]);
  assert.ok(state().slice(1).every(s => s[0] === 'false' && s[1] === -1 && s[2] === true));
  tabs[0].focus(); key(win, tabs[0], 'ArrowRight');
  assert.equal(doc.activeElement, tabs[1]); assert.deepEqual(state()[1], ['true', 0, false]); assert.equal(state()[0][2], true);
  key(win, tabs[1], 'End'); assert.equal(doc.activeElement, tabs[3]);
  key(win, tabs[3], 'ArrowRight'); assert.equal(doc.activeElement, tabs[0], 'wraps');
  key(win, tabs[0], 'ArrowLeft'); assert.equal(doc.activeElement, tabs[3]);
  key(win, tabs[3], 'Home'); assert.equal(doc.activeElement, tabs[0]);
  click(win, tabs[2]); assert.equal(doc.getElementById('bpanel-guide').hidden, false);
  assert.match(doc.getElementById('bpanel-research').textContent, /Pastor and Veronesi/);
  assert.match(doc.getElementById('bpanel-weak').textContent, /straight-line model/);
  // Esc closes and focus returns.
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(doc.getElementById('behindModal').hidden, true); assert.equal(doc.activeElement, btn);
  // Size rules: 85vh with internal scroll, up to 1000px wide, full width on phones.
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(css.includes('.modal.tall{max-height:85vh;display:flex;flex-direction:column;overflow:hidden}'));
  assert.ok(css.includes('.modal.wide{max-width:1000px}'));
  assert.ok(/\.modal\.tall \.modal-body\{overflow:auto/.test(css));
  assert.ok(/@media \(max-width:640px\)\{\s*\.modal-back\{padding:8px\}\s*\.modal\.wide\{max-width:none\}/.test(css));
  win.close();
});

test('slider info notes take their text from the guide (single source)', () => {
  const { doc } = load();
  const tips = [...doc.querySelectorAll('.tip[data-guide]')];
  assert.ok(tips.length >= 11);
  tips.forEach(t => assert.equal(t.textContent, Gd.GUIDE[t.dataset.guide].tip, t.dataset.guide));
  assert.equal(doc.getElementById('tip3').textContent, 'Years to go from 10% to 90% of full adoption.');
});
