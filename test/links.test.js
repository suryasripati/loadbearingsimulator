// Scenario links (#s=...): what goes in (settings only, never allocations or notes), the strict checks on the way in,
// version checks, and opening a link in the built page (asks first, keeps allocations, can be undone).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const S = require('../src/snapshots.js');
const M = require('../src/model.js');
const D = require('../src/defaults.js');

const G0 = () => ({ ...D.DEFAULT_G, entryDef: 'A', capexModel: 'sustaining', tvMode: 'multiple', phases: D.DEFAULT_PHASES.slice() });
const L0 = () => D.DEFAULT_LAYERS.map(L => ({ ...L, driftP: L.driftP.slice(), marginP: L.marginP.slice() }));
const decode = (t) => JSON.parse(Buffer.from(t.replace(/^#?s=/, '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
const encode = (obj) => 's=' + S.linkB64Encode(JSON.stringify(obj));
const bad = (text, re) => { const r = S.parseLinkText(text); assert.equal(r.ok, false, 'expected rejection'); assert.match(r.error, re); };

test('round trip: every input comes back exactly; allocations, names and notes never go in', () => {
  const G = { ...G0(), disc: 12.5, entryDef: 'B', mult: 14, capexModel: 'vintage', tvMode: 'perpetuity', tvGrowth: 2, phases: [4, 11] };
  const layers = L0().map((L, i) => ({ ...L, alloc: 50 + i, offset: i - 2, driftP: [-1, -2, -3], unitCostDecline: i, life: 60 + i }));
  const t = S.makeLinkText(G, layers);
  const p = decode(t);
  assert.deepEqual(Object.keys(p).sort(), ['g', 'l', 'm', 'v']);
  assert.equal(p.v, S.LINK_SCHEMA_VERSION); assert.equal(p.m, M.MODEL_VERSION);
  assert.ok(!/alloc|name|note|kill/.test(JSON.stringify(p)), 'no allocations, names, notes or kill criteria');
  const r = S.parseLinkText('#' + t);
  assert.equal(r.ok, true, r.error); assert.equal(r.kind, 'own');
  const want = S.snapInputs(G, layers); want.layers.forEach(L => { delete L.alloc; });
  assert.deepEqual(r.state.G, want.G);
  assert.deepEqual(r.state.layers.map(L => { const x = { ...L }; return x; }), want.layers, 'names come back as the default names');
  assert.ok(t.length < S.LINK_MAX_CHARS);
});

test('malformed links are rejected with a reason: not a link, bad characters, bad base64 or JSON, wrong shape', () => {
  bad('#analyst', /not a scenario link/);
  bad('#s=abc$%', /damaged/);
  bad('#s=' + Buffer.from('{not json').toString('base64url'), /damaged/);
  bad(encode([1, 2]), /^This is not a valid scenario link\.$/);
  const p = decode(S.makeLinkText(G0(), L0()));
  bad(encode({ ...p, extra: 1 }), /Link: unknown field "extra"/);
  bad(encode({ ...p, g: { ...p.g, disc: 99 } }), /Link setting disc: value 99 is outside 5 to 20/);
  bad(encode({ ...p, g: { ...p.g, disc: '10' } }), /setting disc: expected a finite number/);
  bad(encode({ ...p, g: { ...p.g, disc: 6, tvGrowth: 5.5 } }), /long-run growth 5.5% must be at least 1 point below/);
  // Growth above today's 6% maximum (an older link) opens clamped, with a plain note.
  const old = S.parseLinkText(encode({ ...p, g: { ...p.g, tvGrowth: 8 } }));
  assert.equal(old.ok, true, old.error); assert.equal(old.state.G.tvGrowth, 6);
  assert.deepEqual(old.notes, ['This link: long-run growth of 8% a year is above the current maximum of 6%, so it loads as 6%.']);
  bad(encode({ ...p, l: p.l.slice(0, 4) }), /expected 5 layers/);
  bad(encode({ ...p, l: p.l.map((L, i) => i ? L : { ...L, alloc: 20 }) }), /Link layer 1: unknown field "alloc"/);
  bad(encode({ ...p, l: p.l.map((L, i) => i ? L : { ...L, name: 'x' }) }), /unknown field "name"/);
});

test('prototype keys are refused anywhere, and the size is capped before decoding', () => {
  const p = decode(S.makeLinkText(G0(), L0()));
  bad('#s=' + S.linkB64Encode('{"__proto__":{"x":1},"v":1}'), /forbidden key "__proto__"/);
  bad('#s=' + S.linkB64Encode(JSON.stringify(p).replace('"g":{', '"g":{"constructor":1,')), /forbidden key "constructor"/);
  bad('#s=' + 'A'.repeat(S.LINK_MAX_CHARS + 1), /longer than 6000 characters/);
  // Fresh objects: nothing parsed is merged into the prototype chain.
  assert.equal({}.x, undefined);
});

test('version checks: unknown link format and newer model versions are rejected; older model versions recompute', () => {
  const p = decode(S.makeLinkText(G0(), L0()));
  bad(encode({ ...p, v: 2 }), /link format version 2 is not supported \(this page reads version 1\)/);
  bad(encode({ ...p, v: '1' }), /^This is not a valid scenario link\.$/);
  bad(encode({ ...p, m: M.MODEL_VERSION + 1 }), new RegExp('made with model version ' + (M.MODEL_VERSION + 1) + ', newer than this page'));
  bad(encode({ ...p, m: 1.5 }), /no valid model version/);
  const old = S.parseLinkText(encode({ ...p, m: 1 }));
  assert.equal(old.ok, true, old.error); assert.equal(old.modelVersion, 1);
});

test('case links carry the case id, version and only the changed inputs, and are checked in full when applied', () => {
  const base = { G: G0(), layers: L0().slice(0, 3).map((L, i) => ({ ...L, id: 'syn-' + (i + 1), name: 'Synthetic layer ' + (i + 1) })) };
  const G = { ...base.G, disc: 12 }, layers = base.layers.map((L, i) => i === 1 ? { ...L, capex: 300, alloc: 77, driftP: [L.driftP[0], -4, L.driftP[2]] } : { ...L, alloc: 5 });
  const t = S.makeLinkText(G, layers, { caseId: 'synthetic-3-layer', versionId: 'measured', base });
  const p = decode(t);
  assert.deepEqual(p.d, { 'settings.disc': 12, 'layer syn-2.capex': 300, 'layer syn-2.driftP[1]': -4 }, 'only changes, never allocations');
  assert.deepEqual([p.c, p.ver], ['synthetic-3-layer', 'measured']);
  const r = S.parseLinkText(t);
  assert.equal(r.ok, true, r.error); assert.equal(r.kind, 'case');
  const a = S.linkApplyCase(r, base);
  assert.equal(a.ok, true, a.error);
  assert.equal(a.state.G.disc, 12); assert.equal(a.state.layers[1].capex, 300); assert.deepEqual(a.state.layers[1].driftP, layers[1].driftP);
  assert.deepEqual(a.state.layers.map(L => L.name), base.layers.map(L => L.name));
  // Unknown inputs or layers, bad values and wrong types are refused.
  bad(encode({ ...p, d: { 'settings.secret': 1 } }), /unknown input "settings.secret"/);
  bad(encode({ ...p, d: { 'layer syn-1.alloc': 1 } }), /unknown input "layer syn-1.alloc"/);
  bad(encode({ ...p, d: { 'settings.tvMode': 'forever' } }), /Link settings.tvMode: unexpected value/);
  bad(encode({ ...p, c: 'Bad Id' }), /unexpected case id/);
  const ghost = S.linkApplyCase(S.parseLinkText(encode({ ...p, d: { 'layer nope.capex': 5 } })), base);
  assert.equal(ghost.ok, false); assert.match(ghost.error, /the case has no layer "nope"/);
  const out = S.linkApplyCase(S.parseLinkText(encode({ ...p, d: { 'layer syn-1.capex': 1e9 } })), base);
  assert.equal(out.ok, false); assert.match(out.error, /capex: value 1000000000 is outside/);
});

/* ---------- In the built page (live build: no cases) ---------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
function load(opts = {}){
  const errors = [], vc = new VirtualConsole(), copied = [];
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' + (opts.hash || ''), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse: (w) => {
      if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, opts.storage[k]);
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: (t) => { copied.push(t); return Promise.resolve(); } }, configurable: true });
    } });
  return { doc: dom.window.document, win: dom.window, errors, copied };
}
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const setVal = (win, el, v) => { el.value = String(v); el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); };

test('Copy link: puts the scenario in the address and copies it, with the warning; no allocations in it', async () => {
  const { doc, win, errors, copied } = load({ hash: '#analyst' });
  setVal(win, doc.getElementById('g_disc'), 13);
  setVal(win, doc.querySelector('#scoreLite input[data-k="alloc"]'), 64);
  assert.match(doc.getElementById('linkWarn').textContent, /Anyone who has the link can read them\. It never includes your allocations/);
  click(win, doc.getElementById('copyLink'));
  await new Promise(r => setTimeout(r, 10));
  assert.match(win.location.hash, /^#s=[A-Za-z0-9_-]+$/);
  assert.equal(copied[0], win.location.href);
  assert.match(doc.getElementById('linkMsg').textContent, /Link copied/);
  const p = decode(win.location.hash);
  assert.equal(p.g.disc, 13);
  assert.ok(!/alloc|"64"/.test(JSON.stringify(p)));
  assert.deepEqual(errors, []);
  win.close();
});

test('opening a link asks first; OK applies it and keeps my allocations; Undo restores; Cancel changes nothing', () => {
  const G = { ...G0(), disc: 14, tvMode: 'perpetuity', tvGrowth: 1.5 };
  const hash = '#' + S.makeLinkText(G, L0().map(L => ({ ...L, capex: L.capex + 10 })));
  const stored = { 'load-bearing-sim-v3': JSON.stringify({ G: { ...G0(), disc: 9 }, layers: L0().map((L, i) => ({ ...L, alloc: 11 + i })), sel: 1 }) };
  // Cancel
  let pg = load({ hash, storage: stored });
  assert.equal(pg.doc.getElementById('confirmModal').hidden, false);
  assert.match(pg.doc.getElementById('confirmText').textContent, /Open the settings in this link\? Your current settings are replaced/);
  click(pg.win, pg.doc.getElementById('confirmCancel'));
  assert.equal(+pg.doc.getElementById('g_disc').value, 9);
  assert.ok(!/^#s=/.test(pg.win.location.hash), 'the link is cleared from the address once read');
  pg.win.close();
  // OK
  pg = load({ hash, storage: stored });
  click(pg.win, pg.doc.getElementById('confirmOk'));
  const d = pg.doc;
  assert.equal(+d.getElementById('g_disc').value, 14);
  assert.equal(d.querySelector('#tvSwitch [data-t="perpetuity"]').getAttribute('aria-pressed'), 'true');
  assert.equal(+d.querySelector('#inputs input[data-i="0"][data-k="capex"]').value, D.DEFAULT_LAYERS[0].capex + 10);
  assert.deepEqual([...d.querySelectorAll('#scoreLite input[data-k="alloc"]')].map(i => +i.value), [11, 12, 13, 14, 15], 'my allocations stay');
  assert.equal(d.getElementById('snapUndo').hidden, false);
  click(pg.win, d.getElementById('snapUndo'));
  assert.equal(+d.getElementById('g_disc').value, 9);
  assert.deepEqual(pg.errors, []);
  pg.win.close();
});

test('a malformed or incompatible link shows a plain message and changes nothing', () => {
  const p = decode(S.makeLinkText(G0(), L0()));
  for (const [hash, re] of [['#s=%%%', /damaged/], ['#' + encode({ ...p, m: M.MODEL_VERSION + 1 }), /newer than this page/], ['#' + encode({ ...p, v: 9 }), /link format version 9/],
    ['#' + encode({ v: 1, m: 2, c: 'synthetic-3-layer', ver: 'base', d: {} }), /which this page does not include/]]) {
    const { doc, win } = load({ hash });
    const n = doc.getElementById('linkNotice');
    assert.equal(n.hidden, false); assert.match(n.textContent, /^This link could not be opened: /); assert.match(n.textContent, re);
    assert.equal(doc.getElementById('confirmModal').hidden, true);
    assert.equal(+doc.getElementById('g_disc').value, D.DEFAULT_G.disc);
    win.close();
  }
  // Markup in a link never becomes HTML.
  const { doc, win } = load({ hash: '#' + encode({ v: 1, m: 2, c: 'x-img-src-x', ver: 'base', d: {} }) });
  assert.equal(doc.getElementById('linkNotice').children.length, 0);
  win.close();
});

test('header Share: in every mode; the popover has the warning and Copy link; Esc or a click outside closes it and focus returns', async () => {
  const { doc, win, errors, copied } = load({ hash: '#basic' });
  const btn = doc.getElementById('shareBtn'), pop = doc.getElementById('sharePop');
  assert.equal(btn.closest('[data-min]'), null, 'not tied to a mode');
  assert.equal(btn.getAttribute('aria-haspopup'), 'dialog');
  for (const m of ['basic', 'advanced', 'analyst']) {
    click(win, doc.querySelector('[data-mode-btn="' + m + '"]'));
    assert.equal(btn.hidden, false, m);
  }
  click(win, doc.querySelector('[data-mode-btn="basic"]'));
  setVal(win, doc.getElementById('g_disc'), 11);
  btn.focus(); click(win, btn);
  assert.equal(pop.hidden, false); assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(doc.activeElement, doc.getElementById('shareCopy'));
  assert.match(doc.getElementById('shareWarn').textContent, /Anyone who has the link can read them\. It never includes your allocations/);
  click(win, doc.getElementById('shareCopy'));
  await new Promise(r => setTimeout(r, 10));
  assert.match(win.location.hash, /^#s=/); assert.equal(copied[0], win.location.href);
  assert.equal(doc.getElementById('shareOut').value, win.location.href);
  assert.match(doc.getElementById('shareMsg').textContent, /Link copied/);
  assert.equal(decode(win.location.hash).g.disc, 11);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(pop.hidden, true); assert.equal(btn.getAttribute('aria-expanded'), 'false'); assert.equal(doc.activeElement, btn);
  click(win, btn); assert.equal(pop.hidden, false);
  click(win, doc.querySelector('main'));
  assert.equal(pop.hidden, true, 'a click outside closes it');
  // The Analyst snapshots control is still there.
  assert.ok(doc.getElementById('copyLink').closest('#snapshots'));
  assert.deepEqual(errors, []);
  win.close();
});

test('phones: Share moves into a "More" overflow menu (CSS below 600px); the menu item opens the same popover', () => {
  const { doc, win } = load();
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.ok(css.includes('@media (max-width:599px){#shareBtn{display:none}.morewrap{display:inline-block}}'));
  assert.equal(doc.getElementById('moreBtn').getAttribute('aria-label'), 'More');
  assert.ok(/\.morewrap\{display:none/.test(css));
  // jsdom has no media queries: show the phone menu the way the phone CSS does.
  const st = doc.createElement('style'); st.textContent = '#shareBtn{display:none}.morewrap{display:inline-block}'; doc.head.appendChild(st);
  const more = doc.getElementById('moreBtn'), menu = doc.getElementById('moreMenu');
  assert.equal(more.getAttribute('aria-haspopup'), 'menu');
  more.focus(); click(win, more);
  assert.equal(menu.hidden, false); assert.equal(doc.activeElement, doc.getElementById('moreBehind'), 'focus on the first item');
  doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(doc.activeElement, doc.getElementById('moreCases'), 'the live build ships a case, so Cases is in the menu');
  assert.equal(doc.getElementById('moreShare').getAttribute('role'), 'menuitem');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.hidden, true); assert.equal(doc.activeElement, more);
  click(win, more); click(win, doc.getElementById('moreShare'));
  assert.equal(menu.hidden, true); assert.equal(doc.getElementById('sharePop').hidden, false);
  assert.equal(doc.activeElement, doc.getElementById('shareCopy'));
  win.close();
});

test('a link that decodes but has no recognisable format version says "This is not a valid scenario link"; no message ever says "undefined"', () => {
  const p = decode(S.makeLinkText(G0(), L0()));
  const noV = { ...p }; delete noV.v;
  for (const obj of [{}, noV, { ...p, v: null }, { ...p, v: '1' }, { ...p, v: 1.5 }, { ...p, v: 0 }, { ...p, v: true }, [], 'text', 42, null]) {
    const r = S.parseLinkText(encode(obj));
    assert.equal(r.ok, false, JSON.stringify(obj).slice(0, 40));
    assert.equal(r.error, 'This is not a valid scenario link.', JSON.stringify(obj).slice(0, 40));
  }
  // Every rejection message, across many broken links, is free of "undefined", "null" and "NaN".
  const variants = [{ ...p, m: undefined }, { ...p, m: null }, { ...p, v: 3 }, { ...p, g: undefined }, { ...p, l: undefined }, { ...p, g: { ...p.g, disc: null } },
    { ...p, g: { ...p.g, entryDef: undefined } }, { ...p, l: [{}] }, { v: 1, m: 2, c: 'x', ver: undefined, d: {} }, { v: 1, m: 2, c: 'x', ver: 'base', d: { 'settings.disc': null } }, { v: 1, m: 2 }];
  for (const obj of variants) {
    const r = S.parseLinkText(encode(obj));
    if (!r.ok) assert.ok(!/undefined|NaN|\bnull\b/.test(r.error), r.error);
  }
  // In the page: the plain message, nothing else.
  const { doc, win } = load({ hash: '#' + encode({ hello: 'world' }) });
  assert.equal(doc.getElementById('linkNotice').textContent, 'This is not a valid scenario link.');
  assert.equal(doc.getElementById('confirmModal').hidden, true);
  win.close();
});
