// Calibration page UI. Vanilla JS, no framework. Episodes stay in this browser's local storage; nothing is fetched.
// Every piece of user text is written with textContent or .value, never as HTML.
const CAL_KEY = 'load-bearing-calibration-v1';
const CAL_MAX = 20;
const $c = (id) => document.getElementById(id);
let calStore = { episodes: [] };
let calSel = -1;   // selected episode
let calVar = 0;    // selected input version within it
let calWork = null; // working copy of the selected episode (may be mid-edit and not yet valid)

function cel(tag, props, kids){
  const e = document.createElement(tag);
  if (props) for (const k in props) { if (k === 'text') e.textContent = props[k]; else if (k === 'cls') e.className = props[k]; else e.setAttribute(k, props[k]); }
  (kids || []).forEach(c => { if (c !== null && c !== undefined) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function calLoad(){
  let raw = null;
  try { raw = localStorage.getItem(CAL_KEY); } catch (e) { $c('epMsg').textContent = 'This browser blocks local storage, so episodes cannot be kept here. Export them to keep a copy.'; return; }
  if (!raw) return;
  try {
    const o = JSON.parse(raw), list = o && Array.isArray(o.episodes) ? o.episodes.slice(0, CAL_MAX) : [];
    const kept = [], dropped = [];
    list.forEach((ep, i) => { const r = importEpisodeText(JSON.stringify(ep)); if (r.ok) kept.push(r.episode); else dropped.push((i + 1) + ': ' + r.error); });
    calStore.episodes = kept;
    if (dropped.length) $c('epMsg').textContent = 'Some saved episodes could not be read and were ignored (' + dropped.join('; ') + ').';
  } catch (e) { $c('epMsg').textContent = 'Saved episodes could not be read and were ignored.'; }
}
function calPersist(){
  try { localStorage.setItem(CAL_KEY, JSON.stringify(calStore)); return true; }
  catch (e) { $c('edSave').textContent = 'Not saved: the browser refused to store this (storage full or blocked). Export to keep a copy.'; return false; }
}
function calState(ep){
  const n = ep.variants.length, locked = ep.variants.filter(v => v.lock).length;
  const lk = locked === 0 ? 'draft' : locked === n ? 'locked' : locked + ' of ' + n + ' versions locked';
  return lk + (n > 1 ? ' (' + n + ' input versions)' : '') + (ep.outcomes.length ? ', outcomes recorded' : '');
}
const calAnyLocked = (w) => w.variants.some(v => v.lock);

/* ---------- List ---------- */
function calRenderList(){
  const t = $c('epList'); t.textContent = '';
  if (!calStore.episodes.length) { t.appendChild(cel('tbody', null, [cel('tr', null, [cel('td', { cls: 'l muted', text: 'No episodes yet.' })])])); return; }
  t.appendChild(cel('thead', null, [cel('tr', null, ['Episode', 'Version', 'As of', 'State', ''].map((h, i) => cel('th', { cls: i === 0 || i === 3 ? 'l' : '', text: h })))]));
  const tb = cel('tbody');
  calStore.episodes.forEach((ep, i) => {
    const open = cel('button', { 'data-ep': 'open' }, [calSel === i ? 'Open (editing)' : 'Open']);
    open.addEventListener('click', () => calOpen(i));
    const del = cel('button', { cls: 'reset', 'data-ep': 'delete' }, ['Delete']);
    del.addEventListener('click', () => calDelete(i));
    tb.appendChild(cel('tr', { cls: calSel === i ? 'sel' : '' }, [cel('td', { cls: 'l', text: ep.name || '(unnamed)' }), cel('td', { text: 'v' + ep.version }),
      cel('td', { text: ep.asOfDate || '—' }), cel('td', { cls: 'l', text: calState(ep) }), cel('td', null, [open, ' ', del])]));
  });
  t.appendChild(tb);
}
function calNew(){
  if (calStore.episodes.length >= CAL_MAX) { $c('epMsg').textContent = 'This browser holds at most ' + CAL_MAX + ' episodes. Export and delete some first.'; return; }
  calStore.episodes.push(validateEpisode(templateEpisode()));
  if (!calPersist()) { calStore.episodes.pop(); return; }
  calOpen(calStore.episodes.length - 1);
}
function calDelete(i){
  const ep = calStore.episodes[i]; if (!ep) return;
  if (!window.confirm('Delete the episode “' + (ep.name || '(unnamed)') + '” (version ' + ep.version + ')? This cannot be undone.')) return;
  const before = calStore.episodes.slice();
  calStore.episodes.splice(i, 1);
  if (!calPersist()) { calStore.episodes = before; return; }
  if (calSel === i) { calSel = -1; calWork = null; $c('editor').hidden = true; } else if (calSel > i) calSel--;
  calRenderAll();
}
function calOpen(i, vi){ $c('lockAck').hidden = true; calSel = i; calVar = vi || 0; calWork = JSON.parse(JSON.stringify(calStore.episodes[i])); $c('editor').hidden = false; calRenderAll(); }

/* ---------- Editing ---------- */
// Every edit updates the working copy, then validates it strictly. A valid copy is saved; an invalid one is kept on
// screen with the reason, and nothing invalid is stored.
function calCommit(){
  try {
    const ep = validateEpisode(JSON.parse(JSON.stringify(calWork)));
    calStore.episodes[calSel] = ep;
    const v = ep.variants[calVar];
    if (calPersist()) $c('edSave').textContent = 'Saved. ' + (v.lock ? '' : (lockProblems(ep, calVar).length ? 'Draft: ' + lockProblems(ep, calVar).length + ' item(s) still needed before this version can be locked.' : 'This version is ready to lock.'));
  } catch (e) { $c('edSave').textContent = 'Not saved yet: ' + e.message; }
  $c('edSave').classList.remove('warn');
  calRenderList(); calRenderBanners(); calRenderCompare(); calRenderStatus();
}
const calIdsText = (ids) => ids.join(', ');
const calIdsParse = (t) => String(t).split(',').map(x => x.trim()).filter(Boolean);
// In-page help: meaning, where to look at the as-of date, recipe and hindsight trap (from src/calibration-guide.js).
function calHelp(key){
  const g = GUIDE[key.replace(/\[\d\]$/, '')];
  if (!g) return null;
  return cel('details', { cls: 'help' }, [cel('summary', { text: 'Help' }),
    cel('p', null, [cel('b', { text: 'Meaning. ' }), g.meaning]), cel('p', null, [cel('b', { text: 'Where to look at the as-of date. ' }), g.where]),
    cel('p', null, [cel('b', { text: 'Recipe. ' }), g.recipe]), cel('p', null, [cel('b', { text: 'Hindsight trap. ' }), g.trap])]);
}
function calRecordRow(label, rec, range, locked, extra){
  const num = cel('input', { type: 'number', cls: 'txt', step: 'any', min: String(range[0]), max: String(range[1]), 'aria-label': label + ' value' });
  num.value = rec.value === null ? '' : rec.value;
  num.addEventListener('input', () => { const v = parseFloat(num.value); rec.value = num.value === '' || !isFinite(v) ? null : v; calCommit(); });
  const basis = cel('select', { cls: 'txt', 'aria-label': label + ' basis' }, [['', '—'], ['sourced', 'sourced'], ['derived', 'derived'], ['judgement', 'judgement']].map(o => cel('option', { value: o[0] }, [o[1]])));
  basis.value = rec.basis || '';
  basis.addEventListener('change', () => { rec.basis = basis.value || null; calCommit(); });
  const txt = (field, aria, parse) => {
    const e = cel('input', { cls: 'txt', 'aria-label': label + ' ' + aria, maxlength: '2000' });
    e.value = parse ? calIdsText(rec[field]) : rec[field];
    e.addEventListener('input', () => { rec[field] = parse ? calIdsParse(e.value) : e.value; calCommit(); });
    return e;
  };
  const ids = txt('sourceIds', 'source ids', true), calc = txt('calculation', 'calculation'), rat = txt('rationale', 'rationale');
  [num, basis, ids, calc, rat].forEach(e => { e.disabled = locked; });
  // Distinct label for a judgement with no cited source.
  const tag = cel('span', { cls: 'badge uncited', 'data-uncited': '' }, ['uncited judgement']);
  const refreshTag = () => { tag.hidden = !isUncitedJudgement(rec); };
  refreshTag();
  [num, basis, ids].forEach(e => { e.addEventListener('input', refreshTag); e.addEventListener('change', refreshTag); });
  const labelCell = cel('td', { cls: 'k l' }, [label, calHelp(label)]);
  if (extra) labelCell.appendChild(extra({ num, basis, calc, refreshTag }));
  return cel('tr', null, [labelCell, cel('td', null, [num]), cel('td', null, [basis, tag]), cel('td', null, [ids]), cel('td', null, [calc]), cel('td', null, [rat])]);
}
const calRecHead = () => cel('thead', null, [cel('tr', null, ['Input', 'Value', 'Basis', 'Sources (ids)', 'Calculation (derived)', 'Rationale (judgement)'].map((h, i) => cel('th', { cls: i === 0 ? 'l' : '', text: h })))]);
function calRangeOf(k){ return k === 'phase2Start' ? PHASE_RANGES[0] : k === 'phase3Start' ? PHASE_RANGES[1] : GLOBAL_RANGES[k] || LAYER_RANGES[k.replace(/\[\d\]$/, '')]; }

// Doubling-time helper for the adoption-speed record: fills a derived value and its calculation text.
function calSpeedHelper(rec, locked){
  return (ctl) => {
    const box = cel('div', { cls: 'helper' });
    const t = cel('input', { type: 'number', cls: 'txt', step: 'any', min: '0', 'aria-label': 'Early-phase doubling time in years', placeholder: 'T years' });
    const go = cel('button', { 'data-helper': 'doubling' }, ['Fill from doubling time']);
    const note = cel('div', { cls: 'muted', text: 'speed ≈ ln(81) / ln(2) × T. Early phase only; the midpoint is separate. Cite the source of T.' });
    [t, go].forEach(e => { e.disabled = locked; });
    go.addEventListener('click', () => {
      try {
        const r = doublingTimeToSpeed(parseFloat(t.value));
        rec.value = r.value; rec.basis = 'derived'; rec.calculation = r.calculation;
        ctl.num.value = r.value; ctl.basis.value = 'derived'; ctl.calc.value = r.calculation; ctl.refreshTag();
        calCommit();
      } catch (e) { $c('edSave').textContent = 'Doubling-time helper: ' + e.message; }
    });
    box.appendChild(t); box.appendChild(document.createTextNode(' ')); box.appendChild(go); box.appendChild(note);
    return box;
  };
}

function calRenderEditor(){
  if (!calWork) return;
  const w = calWork, shared = calAnyLocked(w);
  if (calVar >= w.variants.length) calVar = 0;
  const v = w.variants[calVar], locked = !!v.lock;
  $c('edTitle').textContent = (w.name || 'Unnamed episode') + ' (episode version ' + w.version + ')';
  const bind = (id, get, set, dis) => { const e = $c(id); e.value = get(); e.oninput = () => { set(e.value); calCommit(); }; e.onchange = e.oninput; e.disabled = dis; };
  // Shared fields are fixed once any input version is locked.
  bind('f_name', () => w.name, x => { w.name = x; }, shared);
  bind('f_id', () => w.id, x => { w.id = x.trim(); }, shared);
  bind('f_asOf', () => w.asOfDate || '', x => { w.asOfDate = x || null; }, shared);
  bind('f_rule', () => w.asOfRule, x => { w.asOfRule = x; }, shared);
  bind('f_horizon', () => w.outcomeHorizon, x => { w.outcomeHorizon = x; }, shared);
  bind('f_measure', () => w.outcomeMeasure, x => { w.outcomeMeasure = x; }, shared);
  bind('f_knew', () => w.scorer.knewAboutOutcome, x => { w.scorer.knewAboutOutcome = x; }, shared);
  // Scorer checklist
  const ct = $c('checkTable'); ct.textContent = '';
  const cb = cel('tbody');
  SCORER_CHECKLIST.forEach(c => {
    const sel = cel('select', { cls: 'txt', 'aria-label': c.text, 'data-check': c.key }, [['', 'not answered'], ['yes', 'yes'], ['no', 'no'], ['partly', 'partly']].map(o => cel('option', { value: o[0] }, [o[1]])));
    sel.value = w.scorer.checklist[c.key]; sel.disabled = shared;
    sel.onchange = () => { w.scorer.checklist[c.key] = sel.value; calCommit(); };
    cb.appendChild(cel('tr', null, [cel('td', { cls: 'l', text: c.text }), cel('td', null, [sel])]));
  });
  ct.appendChild(cb);
  // Sources (shared; a cited source cannot change once a version that cites it is locked)
  const st = $c('srcTable'); st.textContent = '';
  st.appendChild(cel('thead', null, [cel('tr', null, ['Id', 'Citation', 'Published', 'Kind', 'Series truncated at (compiled only)', ''].map((h, i) => cel('th', { cls: i < 2 ? 'l' : '', text: h })))]));
  const sb = cel('tbody');
  w.sources.forEach((s, i) => {
    const inp = (field, type, aria) => { const e = cel('input', { type: type || 'text', cls: 'txt', 'aria-label': 'Source ' + (i + 1) + ' ' + aria, maxlength: field === 'citation' ? '1000' : '40' }); e.value = s[field] || ''; e.oninput = () => { s[field] = type === 'date' ? (e.value || (field === 'truncatedAt' ? null : '')) : e.value; calCommit(); }; e.onchange = e.oninput; return e; };
    const kind = cel('select', { cls: 'txt', 'aria-label': 'Source ' + (i + 1) + ' kind' }, [['contemporary', 'contemporary'], ['compiled-from-period-data', 'compiled from period data'], ['retrospective', 'retrospective']].map(o => cel('option', { value: o[0] }, [o[1]])));
    kind.value = s.kind;
    kind.onchange = () => { s.kind = kind.value; if (s.kind !== 'compiled-from-period-data') s.truncatedAt = null; calCommit(); calRenderEditor(); };
    const rm = cel('button', { cls: 'reset' }, ['Remove']);
    rm.onclick = () => { w.sources.splice(i, 1); calCommit(); calRenderEditor(); };
    const trunc = inp('truncatedAt', 'date', 'truncated at'); trunc.disabled = s.kind !== 'compiled-from-period-data';
    sb.appendChild(cel('tr', null, [cel('td', null, [inp('id', 'text', 'id')]), cel('td', null, [inp('citation', 'text', 'citation')]), cel('td', null, [inp('publicationDate', 'date', 'published')]), cel('td', null, [kind]), cel('td', null, [trunc]), cel('td', null, [rm])]));
  });
  st.appendChild(sb);
  // Layer names (shared)
  const ln = $c('layerNames'); ln.textContent = '';
  w.layerNames.forEach((n, i) => {
    const name = cel('input', { cls: 'txt', maxlength: '120', 'aria-label': 'Layer ' + (i + 1) + ' name', placeholder: 'Layer name (free text)', style: 'max-width:320px' });
    name.value = n; name.disabled = shared; name.oninput = () => { w.layerNames[i] = name.value; calCommit(); };
    const rm = cel('button', { cls: 'reset' }, ['Remove layer']); rm.disabled = shared || w.layerNames.length < 2;
    rm.onclick = () => { w.layerNames.splice(i, 1); w.variants.forEach(x => x.layers.splice(i, 1)); calCommit(); calRenderEditor(); };
    ln.appendChild(cel('div', { cls: 'seg' }, [cel('b', { text: 'Layer ' + (i + 1) }), name, rm]));
  });
  $c('layerAdd').disabled = shared || w.layerNames.length >= 8;
  // Input version selector and label
  const vs = $c('varSel'); vs.textContent = '';
  w.variants.forEach((x, i) => vs.appendChild(cel('option', { value: String(i) }, [(x.label || '(unlabelled)') + (x.lock ? ' (locked)' : '')])));
  vs.value = String(calVar);
  vs.onchange = () => { calVar = +vs.value; $c('lockAck').hidden = true; calRenderEditor(); };
  const vl = $c('varLabel'); vl.value = v.label; vl.disabled = locked; vl.oninput = () => { v.label = vl.value; calCommit(); };
  $c('varAdd').disabled = w.outcomes.length > 0 || w.variants.length >= EP_MAX_VARIANTS;
  // Settings and layer inputs of the selected version
  $c('f_entryDef').value = v.settings.entryDef || ''; $c('f_entryDef').disabled = locked;
  $c('f_entryDef').onchange = () => { v.settings.entryDef = $c('f_entryDef').value || null; calCommit(); };
  $c('f_capex').value = v.settings.capexModel || ''; $c('f_capex').disabled = locked;
  $c('f_capex').onchange = () => { v.settings.capexModel = $c('f_capex').value || null; calCommit(); };
  const set = $c('setTable'); set.textContent = ''; set.appendChild(calRecHead());
  const setBody = cel('tbody');
  EP_SETTING_KEYS.forEach(k => setBody.appendChild(calRecordRow(k, v.settings[k], calRangeOf(k), locked, k === 'speed' ? calSpeedHelper(v.settings[k], locked) : null)));
  set.appendChild(setBody);
  const lb = $c('layerBox'); lb.textContent = '';
  v.layers.forEach((L, i) => {
    const t = cel('table', { cls: 'recs', 'aria-label': 'Layer ' + (i + 1) + ' inputs' }); t.appendChild(calRecHead());
    const tb = cel('tbody');
    EP_LAYER_KEYS.forEach(k => tb.appendChild(calRecordRow(k, L.inputs[k], LAYER_RANGES[k], locked)));
    ['driftP', 'marginP'].forEach(k => L.inputs[k].forEach((r, j) => tb.appendChild(calRecordRow(k + '[' + j + ']', r, LAYER_RANGES[k], locked))));
    t.appendChild(tb);
    lb.appendChild(cel('div', { cls: 'layercard' }, [cel('b', { text: 'Layer ' + (i + 1) + ': ' + (w.layerNames[i] || '(unnamed)') }), cel('div', { cls: 'scroll' }, [t])]));
  });
  $c('epLock').hidden = locked; $c('epLock').textContent = 'Lock this input version';
  $c('epVersion').hidden = !shared;
  calRenderOutcomes(); calRenderStatus(); calRenderBanners();
}
function calRenderStatus(){
  if (!calWork) return;
  const w = calWork, v = w.variants[calVar];
  $c('edStatus').textContent = 'Episode version ' + w.version + (w.previousHash ? ' (replaces a locked version, link ' + w.previousHash.slice(0, 12) + '…)' : '') + '. '
    + (calAnyLocked(w) ? 'At least one input version is locked, so the shared fields above are fixed.' : 'Nothing locked yet.');
  $c('varStatus').textContent = !v.lock
    ? '“' + (v.label || 'unlabelled') + '” is a draft. Its inputs can still change.'
    : '“' + v.label + '” was locked on ' + new Date(v.lock.lockedAt).toLocaleString() + ' under model version ' + v.lock.modelVersion + '. Input hash ' + v.lock.hash.slice(0, 16) + '….'
      + (v.lock.acknowledged ? ' Locked with an acknowledgement: ' + v.lock.counts.judgement + ' of ' + v.lock.counts.total + ' inputs judgement, ' + v.lock.counts.uncited + ' uncited.' : '')
      + (v.lock.checklistCaptured ? '' : ' Locked under an older schema: the scorer checklist was not captured in this lock.')
      + (v.lock.modelVersion !== MODEL_VERSION ? ' This page uses model version ' + MODEL_VERSION + ', so verdicts are recomputed under it.' : '');
}
function calRenderBanners(){
  $c('scorerBanner').textContent = EP_BANNER;
  $c('cmpBanner').textContent = EP_BANNER;
  const jb = $c('judgeBanner'), ub = $c('uncitedBanner');
  if (!calWork) { jb.hidden = true; ub.hidden = true; return; }
  const js = judgementShare(calWork, calVar), label = calWork.variants[calVar].label || 'this input version';
  jb.hidden = !js.heavy;
  if (js.heavy) jb.textContent = 'Judgement-heavy (' + label + '): ' + js.judgement + ' of ' + js.total + ' filled inputs are judgement rather than sourced or derived values'
    + (js.uncited ? ', including ' + js.uncited + ' uncited judgement' + (js.uncited === 1 ? '' : 's') : '') + '.';
  const un = unsourcedInputs(calWork);
  ub.hidden = !un.length;
  if (un.length) ub.textContent = 'Uncited judgement in ' + un.length + ' input' + (un.length === 1 ? '' : 's') + '. This episode can be locked and scored, but its file must stay out of the repository: export names it .private.json.';
}

/* ---------- Lock, versions, outcomes ---------- */
// Lock the selected input version. If it is judgement-heavy or has uncited inputs, ask first ("Lock anyway" or "Cancel").
function calLock(){
  let ep;
  try {
    ep = validateEpisode(JSON.parse(JSON.stringify(calWork)));
    const problems = lockProblems(ep, calVar);
    if (problems.length) throw new Error('Not ready to lock. Still needed: ' + problems.join(', ') + '.');
  } catch (e) { $c('edSave').textContent = 'Not locked: ' + e.message; return; }
  const ack = lockAcknowledgement(ep, calVar);
  if (ack.needed) { $c('lockAckText').textContent = ack.message; $c('lockAck').hidden = false; $c('lockAnyway').focus(); return; }
  calDoLock(false);
}
function calDoLock(acknowledged){
  $c('lockAck').hidden = true;
  try {
    const ep = lockVariant(validateEpisode(JSON.parse(JSON.stringify(calWork))), calVar, undefined, { acknowledged: acknowledged });
    const before = calStore.episodes[calSel];
    calStore.episodes[calSel] = ep;
    if (!calPersist()) { calStore.episodes[calSel] = before; return; }
    calWork = JSON.parse(JSON.stringify(ep));
    const lock = ep.variants[calVar].lock;
    $c('edSave').textContent = lock.acknowledged ? 'Locked, with your acknowledgement recorded.' : 'Locked.';
  } catch (e) { $c('edSave').textContent = 'Not locked: ' + e.message; }
  calRenderAll();
}
function calAddVariant(){
  const base = calWork.variants[calVar].label || 'Version';
  let label = base + ' (copy)', n = 2;
  while (calWork.variants.some(x => x.label === label)) label = base + ' (copy ' + (n++) + ')';
  try {
    const ep = addVariant(calStore.episodes[calSel], label, calVar);
    const before = calStore.episodes[calSel];
    calStore.episodes[calSel] = ep;
    if (!calPersist()) { calStore.episodes[calSel] = before; return; }
    calOpen(calSel, ep.variants.length - 1);
    $c('edSave').textContent = 'Added input version “' + label + '” as a copy. Rename it, change its inputs, then lock it.';
  } catch (e) { $c('edSave').textContent = e.message; }
}
function calNewVersion(){
  if (calStore.episodes.length >= CAL_MAX) { $c('edSave').textContent = 'This browser holds at most ' + CAL_MAX + ' episodes.'; return; }
  try {
    const ep = newEpisodeVersion(calStore.episodes[calSel]);
    calStore.episodes.push(ep);
    if (!calPersist()) { calStore.episodes.pop(); return; }
    calOpen(calStore.episodes.length - 1);
    $c('edSave').textContent = 'New draft episode version ' + ep.version + ' made; the locked version is kept unchanged.';
  } catch (e) { $c('edSave').textContent = e.message; }
}
function calRenderOutcomes(){
  const box = $c('outBox'), w = calWork;
  box.hidden = !w || !w.variants.every(v => v.lock);
  if (box.hidden) return;
  const t = $c('outTable'); t.textContent = '';
  t.appendChild(cel('thead', null, [cel('tr', null, ['Layer', 'Capital earned its cost?', 'Sources (ids)', 'Note', 'Contested: for (ids)', 'Contested: against (ids)', ''].map((h, i) => cel('th', { cls: i === 0 || i === 3 ? 'l' : '', text: h })))]));
  const tb = cel('tbody');
  w.layerNames.forEach((name, i) => {
    const nm = name || 'Layer ' + (i + 1), cur = w.outcomes.find(o => o.layer === i);
    const res = cel('select', { cls: 'txt', 'aria-label': nm + ' outcome' }, [['', 'not recorded'], ['yes', 'yes'], ['no', 'no'], ['unknown', 'unknown'], ['contested', 'contested']].map(o => cel('option', { value: o[0] }, [o[1]])));
    res.value = cur ? cur.result : '';
    const inp = (val, aria) => { const e = cel('input', { cls: 'txt', maxlength: '2000', 'aria-label': nm + ' ' + aria }); e.value = val; return e; };
    const ids = inp(cur ? calIdsText(cur.sourceIds) : '', 'outcome sources'), note = inp(cur ? cur.note : '', 'outcome note');
    const forI = inp(cur && cur.contested ? calIdsText(cur.contested.forSourceIds) : '', 'contested for'), agI = inp(cur && cur.contested ? calIdsText(cur.contested.againstSourceIds) : '', 'contested against');
    const save = cel('button', { 'data-ep': 'save-outcome' }, ['Save outcome']);
    save.onclick = () => {
      if (!res.value) { $c('edSave').textContent = 'Choose an outcome for ' + nm + ' first.'; return; }
      const o = { layer: i, result: res.value, sourceIds: calIdsParse(ids.value), note: note.value,
        contested: res.value === 'contested' ? { forSourceIds: calIdsParse(forI.value), againstSourceIds: calIdsParse(agI.value) } : null };
      try {
        const ep = setOutcome(calStore.episodes[calSel], o);
        const before = calStore.episodes[calSel];
        calStore.episodes[calSel] = ep;
        if (!calPersist()) { calStore.episodes[calSel] = before; return; }
        calWork = JSON.parse(JSON.stringify(ep));
        $c('edSave').textContent = 'Outcome saved for ' + nm + '.';
        calRenderAll();
      } catch (e) { $c('edSave').textContent = 'Outcome not saved: ' + e.message; }
    };
    tb.appendChild(cel('tr', null, [cel('td', { cls: 'l', text: nm }), cel('td', null, [res]), cel('td', null, [ids]), cel('td', { cls: 'l' }, [note]), cel('td', null, [forI]), cel('td', null, [agI]), cel('td', null, [save])]));
  });
  t.appendChild(tb);
}

/* ---------- Comparison ---------- */
function calBasisText(b){
  return 'judgement ' + b.judgement + ' of ' + b.total + ' (' + Math.round(b.share * 100) + '%), uncited ' + b.uncited
    + (b.recorded ? (b.acknowledged ? '; acknowledged at lock' : '') : '; computed from inputs (locked before counts were recorded)');
}
function calRenderCompare(){
  const c = compareEpisodes(calStore.episodes);
  $c('cmpCounts').textContent = 'Episodes: ' + c.episodes + '. Layers: ' + c.layers + '. ' + c.caveat;
  const box = $c('cmpBox'); box.textContent = '';
  if (!c.groups.length) { box.appendChild(cel('p', { cls: 'muted', text: 'No locked episodes yet.' })); return; }
  c.groups.forEach(g => {
    const labels = g.rows[0].variants.map(x => x.label);
    const t = cel('table', { 'aria-label': 'Verdicts for ' + (g.episode || 'unnamed episode') });
    t.appendChild(cel('thead', null, [cel('tr', null, [cel('th', { cls: 'l', text: 'Layer' })]
      .concat(labels.map(l => cel('th', { cls: 'l', text: 'Verdict: ' + l })))
      .concat([cel('th', { cls: 'l', text: 'Recorded outcome' })]))]));
    const tb = cel('tbody');
    g.rows.forEach(r => tb.appendChild(cel('tr', null, [cel('td', { cls: 'l', text: r.layer })]
      .concat(r.variants.map(x => cel('td', { cls: 'l', 'data-variant': x.label }, [
        cel('div', { text: x.verdict }),
        cel('div', { cls: 'muted', text: (x.npv < 0 ? '−' : '') + '$' + Math.abs(x.npv).toFixed(0) + 'B; capital earns its cost: ' + (x.modelSaysEarnsCost ? 'yes' : 'no') }),
        cel('div', { cls: 'muted', 'data-basis': '', text: 'Inputs at lock: ' + calBasisText(x.basis) }),
        x.versionDiffers ? cel('div', { cls: 'muted', text: 'Locked under model v' + x.lockedModelVersion + ', recomputed under v' + c.currentModelVersion }) : null])))
      .concat([cel('td', { cls: 'l', text: r.outcome || 'not recorded' })]))));
    t.appendChild(tb);
    box.appendChild(cel('div', { cls: 'cmpEp' }, [cel('h3', { text: (g.episode || '(unnamed)') + ' (episode version ' + g.version + ')' + (g.allLocked ? '' : ': some input versions not yet locked') }), cel('div', { cls: 'scroll' }, [t])]));
  });
}

/* ---------- Import and export ---------- */
function calExport(){
  let f;
  try { f = exportEpisodeFile(calStore.episodes[calSel]); } catch (e) { $c('edSave').textContent = 'Not exported: ' + e.message; return; }
  const url = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
  const a = cel('a', { href: url, download: f.filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 1000);
  $c('edSave').textContent = 'Exported as ' + f.filename + '. ' + (f.isPrivate ? f.warning : 'Every input cites a source. Commit it only if those sources are public.');
  $c('edSave').classList.toggle('warn', f.isPrivate);
}
function calImportFile(file){
  const msg = $c('epMsg');
  if (!file) return Promise.resolve();
  if (file.size > SNAP_MAX_BYTES) { msg.textContent = 'Import rejected: the file is larger than 1 MB.'; return Promise.resolve(); }
  return file.text().then(text => {
    const r = importEpisodeText(text);
    if (!r.ok) { msg.textContent = 'Import rejected: ' + r.error; return; }
    if (calStore.episodes.length >= CAL_MAX) { msg.textContent = 'Import rejected: this browser holds at most ' + CAL_MAX + ' episodes.'; return; }
    calStore.episodes.push(r.episode);
    if (!calPersist()) { calStore.episodes.pop(); msg.textContent = 'Import not kept: the browser refused to store more.'; return; }
    msg.textContent = 'Imported “' + (r.episode.name || '(unnamed)') + '”.';
    calRenderAll();
  }, () => { msg.textContent = 'Import rejected: the file could not be read.'; });
}

function calRenderAll(){ calRenderList(); calRenderEditor(); calRenderBanners(); calRenderCompare(); }
function calInit(){
  calLoad();
  $c('epNew').addEventListener('click', calNew);
  $c('epImport').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; calImportFile(f); e.target.value = ''; });
  $c('epLock').addEventListener('click', calLock);
  $c('lockAnyway').addEventListener('click', () => calDoLock(true));
  $c('lockCancel').addEventListener('click', () => { $c('lockAck').hidden = true; $c('edSave').textContent = 'Not locked.'; });
  $c('epVersion').addEventListener('click', calNewVersion);
  $c('epExport').addEventListener('click', calExport);
  $c('varAdd').addEventListener('click', calAddVariant);
  $c('srcAdd').addEventListener('click', () => { calWork.sources.push({ id: 'S' + (calWork.sources.length + 1), citation: '', publicationDate: '', kind: 'contemporary', truncatedAt: null }); calCommit(); calRenderEditor(); });
  $c('layerAdd').addEventListener('click', () => { calWork.layerNames.push(''); calWork.variants.forEach(x => x.layers.push({ inputs: calEmptyInputs() })); calCommit(); calRenderEditor(); });
  calRenderAll();
}
calInit();
