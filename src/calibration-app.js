// Calibration page UI. Vanilla JS, no framework. Episodes stay in this browser's local storage; nothing is fetched.
// Every piece of user text is written with textContent or .value, never as HTML.
const CAL_KEY = 'load-bearing-calibration-v1';
const CAL_MAX = 20;
const $c = (id) => document.getElementById(id);
let calStore = { episodes: [] };
let calSel = -1;
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
function calState(ep){ return !ep.lock ? 'draft' : ep.outcomes.length ? 'locked, outcomes recorded' : 'locked'; }

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
function calOpen(i){ calSel = i; calWork = JSON.parse(JSON.stringify(calStore.episodes[i])); $c('editor').hidden = false; calRenderAll(); }

/* ---------- Editing ---------- */
// Every edit updates the working copy, then validates it strictly. A valid copy is saved; an invalid one is kept on
// screen with the reason, and nothing invalid is stored.
function calCommit(){
  try {
    const ep = validateEpisode(JSON.parse(JSON.stringify(calWork)));
    calStore.episodes[calSel] = ep;
    if (calPersist()) $c('edSave').textContent = 'Saved. ' + (ep.lock ? '' : (lockProblems(ep).length ? 'Draft: ' + lockProblems(ep).length + ' item(s) still needed before locking.' : 'Ready to lock.'));
  } catch (e) { $c('edSave').textContent = 'Not saved yet: ' + e.message; }
  calRenderList(); calRenderBanners(); calRenderCompare(); calRenderStatus();
}
const calIdsText = (ids) => ids.join(', ');
const calIdsParse = (t) => String(t).split(',').map(x => x.trim()).filter(Boolean);
function calRecordRow(label, rec, range, locked){
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
  [num, basis].forEach(e => { e.disabled = locked; });
  const ids = txt('sourceIds', 'source ids', true), calc = txt('calculation', 'calculation'), rat = txt('rationale', 'rationale');
  [ids, calc, rat].forEach(e => { e.disabled = locked; });
  // Distinct label for a judgement with no cited source.
  const tag = cel('span', { cls: 'badge uncited', 'data-uncited': '' }, ['uncited judgement']);
  const refreshTag = () => { tag.hidden = !isUncitedJudgement(rec); };
  refreshTag();
  [num, basis, ids].forEach(e => { e.addEventListener('input', refreshTag); e.addEventListener('change', refreshTag); });
  return cel('tr', null, [cel('td', { cls: 'k l', text: label }), cel('td', null, [num]), cel('td', null, [basis, tag]), cel('td', null, [ids]), cel('td', null, [calc]), cel('td', null, [rat])]);
}
const calRecHead = () => cel('thead', null, [cel('tr', null, ['Input', 'Value', 'Basis', 'Sources (ids)', 'Calculation (derived)', 'Rationale (judgement)'].map((h, i) => cel('th', { cls: i === 0 ? 'l' : '', text: h })))]);
function calRangeOf(k){ return k === 'phase2Start' ? PHASE_RANGES[0] : k === 'phase3Start' ? PHASE_RANGES[1] : GLOBAL_RANGES[k] || LAYER_RANGES[k.replace(/\[\d\]$/, '')]; }

function calRenderEditor(){
  if (!calWork) return;
  const w = calWork, locked = !!w.lock;
  $c('edTitle').textContent = (w.name || 'Unnamed episode') + ' (version ' + w.version + ')';
  const bind = (id, get, set) => { const e = $c(id); e.value = get(); e.oninput = () => { set(e.value); calCommit(); }; e.onchange = e.oninput; e.disabled = locked; };
  bind('f_name', () => w.name, v => { w.name = v; });
  bind('f_id', () => w.id, v => { w.id = v.trim(); });
  bind('f_asOf', () => w.asOfDate || '', v => { w.asOfDate = v || null; });
  bind('f_rule', () => w.asOfRule, v => { w.asOfRule = v; });
  bind('f_horizon', () => w.outcomeHorizon, v => { w.outcomeHorizon = v; });
  bind('f_measure', () => w.outcomeMeasure, v => { w.outcomeMeasure = v; });
  bind('f_knew', () => w.scorer.knewAboutOutcome, v => { w.scorer.knewAboutOutcome = v; });
  bind('f_entryDef', () => w.settings.entryDef || '', v => { w.settings.entryDef = v || null; });
  bind('f_capex', () => w.settings.capexModel || '', v => { w.settings.capexModel = v || null; });
  // Sources
  const st = $c('srcTable'); st.textContent = '';
  st.appendChild(cel('thead', null, [cel('tr', null, ['Id', 'Citation', 'Published', 'Kind', 'Series truncated at (compiled only)', ''].map((h, i) => cel('th', { cls: i < 2 ? 'l' : '', text: h })))]));
  const sb = cel('tbody');
  w.sources.forEach((s, i) => {
    const inp = (field, type, aria) => { const e = cel('input', { type: type || 'text', cls: 'txt', 'aria-label': 'Source ' + (i + 1) + ' ' + aria, maxlength: field === 'citation' ? '1000' : '40' }); e.value = s[field] || ''; e.oninput = () => { s[field] = type === 'date' ? (e.value || (field === 'truncatedAt' ? null : '')) : e.value; calCommit(); }; e.onchange = e.oninput; e.disabled = locked; return e; };
    const kind = cel('select', { cls: 'txt', 'aria-label': 'Source ' + (i + 1) + ' kind' }, [['contemporary', 'contemporary'], ['compiled-from-period-data', 'compiled from period data'], ['retrospective', 'retrospective']].map(o => cel('option', { value: o[0] }, [o[1]])));
    kind.value = s.kind; kind.disabled = locked;
    kind.onchange = () => { s.kind = kind.value; if (s.kind !== 'compiled-from-period-data') s.truncatedAt = null; calCommit(); calRenderEditor(); };
    const rm = cel('button', { cls: 'reset' }, ['Remove']); rm.disabled = locked;
    rm.onclick = () => { w.sources.splice(i, 1); calCommit(); calRenderEditor(); };
    const trunc = inp('truncatedAt', 'date', 'truncated at'); trunc.disabled = locked || s.kind !== 'compiled-from-period-data';
    sb.appendChild(cel('tr', null, [cel('td', null, [inp('id', 'text', 'id')]), cel('td', null, [inp('citation', 'text', 'citation')]), cel('td', null, [inp('publicationDate', 'date', 'published')]), cel('td', null, [kind]), cel('td', null, [trunc]), cel('td', null, [rm])]));
  });
  st.appendChild(sb);
  $c('srcAdd').disabled = locked;
  // Settings
  const set = $c('setTable'); set.textContent = ''; set.appendChild(calRecHead());
  const setBody = cel('tbody');
  EP_SETTING_KEYS.forEach(k => setBody.appendChild(calRecordRow(k, w.settings[k], calRangeOf(k), locked)));
  set.appendChild(setBody);
  // Layers
  const lb = $c('layerBox'); lb.textContent = '';
  w.layers.forEach((L, i) => {
    const name = cel('input', { cls: 'txt', maxlength: '120', 'aria-label': 'Layer ' + (i + 1) + ' name', placeholder: 'Layer name (free text)' });
    name.value = L.name; name.disabled = locked; name.oninput = () => { L.name = name.value; calCommit(); };
    const rm = cel('button', { cls: 'reset' }, ['Remove layer']); rm.disabled = locked || w.layers.length < 2;
    rm.onclick = () => { w.layers.splice(i, 1); calCommit(); calRenderEditor(); };
    const t = cel('table', { cls: 'recs', 'aria-label': 'Layer ' + (i + 1) + ' inputs' }); t.appendChild(calRecHead());
    const tb = cel('tbody');
    EP_LAYER_KEYS.forEach(k => tb.appendChild(calRecordRow(k, L.inputs[k], LAYER_RANGES[k], locked)));
    ['driftP', 'marginP'].forEach(k => L.inputs[k].forEach((r, j) => tb.appendChild(calRecordRow(k + '[' + j + ']', r, LAYER_RANGES[k], locked))));
    t.appendChild(tb);
    lb.appendChild(cel('div', { cls: 'layercard' }, [cel('div', { cls: 'seg' }, [cel('b', { text: 'Layer ' + (i + 1) }), name, rm]), cel('div', { cls: 'scroll' }, [t])]));
  });
  $c('layerAdd').disabled = locked || w.layers.length >= 8;
  $c('epLock').hidden = locked; $c('epVersion').hidden = !locked;
  calRenderOutcomes(); calRenderStatus(); calRenderBanners();
}
function calRenderStatus(){
  if (!calWork) return;
  const w = calWork;
  $c('edStatus').textContent = !w.lock
    ? 'Draft, version ' + w.version + (w.previousHash ? ' (replaces a locked version with hash ' + w.previousHash.slice(0, 12) + '…)' : '') + '. Inputs can still change.'
    : 'Locked on ' + new Date(w.lock.lockedAt).toLocaleString() + ' under model version ' + w.lock.modelVersion + '. Input hash ' + w.lock.hash.slice(0, 16) + '…. Inputs cannot change; make a new version to revise them.'
      + (w.lock.modelVersion !== MODEL_VERSION ? ' This page uses model version ' + MODEL_VERSION + ', so verdicts are recomputed under it.' : '');
}
function calRenderBanners(){
  $c('scorerBanner').textContent = EP_BANNER;
  $c('cmpBanner').textContent = EP_BANNER;
  const jb = $c('judgeBanner');
  if (!calWork) { jb.hidden = true; return; }
  const js = judgementShare(calWork);
  jb.hidden = !js.heavy;
  if (js.heavy) jb.textContent = 'Judgement-heavy: ' + js.judgement + ' of ' + js.total + ' filled inputs are judgement rather than sourced or derived values'
    + (js.uncited ? ', including ' + js.uncited + ' uncited judgement' + (js.uncited === 1 ? '' : 's') : '') + '.';
  const ub = $c('uncitedBanner'), un = unsourcedInputs(calWork);
  ub.hidden = !un.length;
  if (un.length) ub.textContent = 'Uncited judgement in ' + un.length + ' input' + (un.length === 1 ? '' : 's') + '. This episode can be locked and scored, but its file must stay out of the repository: export names it .private.json.';
}

/* ---------- Lock, version, outcomes ---------- */
function calLock(){
  try {
    const ep = lockEpisode(validateEpisode(JSON.parse(JSON.stringify(calWork))));
    const before = calStore.episodes[calSel];
    calStore.episodes[calSel] = ep;
    if (!calPersist()) { calStore.episodes[calSel] = before; return; }
    calWork = JSON.parse(JSON.stringify(ep));
    $c('edSave').textContent = 'Locked.';
  } catch (e) { $c('edSave').textContent = 'Not locked: ' + e.message; }
  calRenderAll();
}
function calNewVersion(){
  if (calStore.episodes.length >= CAL_MAX) { $c('edSave').textContent = 'This browser holds at most ' + CAL_MAX + ' episodes.'; return; }
  try {
    const ep = newEpisodeVersion(calStore.episodes[calSel]);
    calStore.episodes.push(ep);
    if (!calPersist()) { calStore.episodes.pop(); return; }
    calOpen(calStore.episodes.length - 1);
    $c('edSave').textContent = 'New draft version ' + ep.version + ' made; the locked version is kept unchanged.';
  } catch (e) { $c('edSave').textContent = e.message; }
}
function calRenderOutcomes(){
  const box = $c('outBox'), w = calWork;
  box.hidden = !w || !w.lock;
  if (box.hidden) return;
  const t = $c('outTable'); t.textContent = '';
  t.appendChild(cel('thead', null, [cel('tr', null, ['Layer', 'Capital earned its cost?', 'Sources (ids)', 'Note', 'Contested: for (ids)', 'Contested: against (ids)', ''].map((h, i) => cel('th', { cls: i === 0 || i === 3 ? 'l' : '', text: h })))]));
  const tb = cel('tbody');
  w.layers.forEach((L, i) => {
    const cur = w.outcomes.find(o => o.layer === i);
    const res = cel('select', { cls: 'txt', 'aria-label': (L.name || 'Layer ' + (i + 1)) + ' outcome' }, [['', 'not recorded'], ['yes', 'yes'], ['no', 'no'], ['unknown', 'unknown'], ['contested', 'contested']].map(o => cel('option', { value: o[0] }, [o[1]])));
    res.value = cur ? cur.result : '';
    const inp = (v, aria) => { const e = cel('input', { cls: 'txt', maxlength: '2000', 'aria-label': (L.name || 'Layer ' + (i + 1)) + ' ' + aria }); e.value = v; return e; };
    const ids = inp(cur ? calIdsText(cur.sourceIds) : '', 'outcome sources'), note = inp(cur ? cur.note : '', 'outcome note');
    const forI = inp(cur && cur.contested ? calIdsText(cur.contested.forSourceIds) : '', 'contested for'), agI = inp(cur && cur.contested ? calIdsText(cur.contested.againstSourceIds) : '', 'contested against');
    const save = cel('button', { 'data-ep': 'save-outcome' }, ['Save outcome']);
    save.onclick = () => {
      if (!res.value) { $c('edSave').textContent = 'Choose an outcome for ' + (L.name || 'layer ' + (i + 1)) + ' first.'; return; }
      const o = { layer: i, result: res.value, sourceIds: calIdsParse(ids.value), note: note.value,
        contested: res.value === 'contested' ? { forSourceIds: calIdsParse(forI.value), againstSourceIds: calIdsParse(agI.value) } : null };
      try {
        const ep = setOutcome(calStore.episodes[calSel], o);
        const before = calStore.episodes[calSel];
        calStore.episodes[calSel] = ep;
        if (!calPersist()) { calStore.episodes[calSel] = before; return; }
        calWork = JSON.parse(JSON.stringify(ep));
        $c('edSave').textContent = 'Outcome saved for ' + (L.name || 'layer ' + (i + 1)) + '.';
        calRenderAll();
      } catch (e) { $c('edSave').textContent = 'Outcome not saved: ' + e.message; }
    };
    tb.appendChild(cel('tr', null, [cel('td', { cls: 'l', text: L.name || 'Layer ' + (i + 1) }), cel('td', null, [res]), cel('td', null, [ids]), cel('td', { cls: 'l' }, [note]), cel('td', null, [forI]), cel('td', null, [agI]), cel('td', null, [save])]));
  });
  t.appendChild(tb);
}

/* ---------- Comparison ---------- */
function calRenderCompare(){
  const c = compareEpisodes(calStore.episodes);
  $c('cmpCounts').textContent = 'Episodes: ' + c.episodes + '. Layers: ' + c.layers + '. ' + c.caveat;
  const t = $c('cmpTable'); t.textContent = '';
  if (!c.rows.length) { t.appendChild(cel('tbody', null, [cel('tr', null, [cel('td', { cls: 'l muted', text: 'No locked episodes yet.' })])])); return; }
  t.appendChild(cel('thead', null, [cel('tr', null, ['Episode', 'Layer', 'Model verdict (current model)', 'Present value', 'Model: capital earns its cost?', 'Recorded outcome', 'Model version'].map((h, i) => cel('th', { cls: i < 3 || i === 5 ? 'l' : '', text: h })))]));
  const tb = cel('tbody');
  c.rows.forEach(r => tb.appendChild(cel('tr', null, [cel('td', { cls: 'l', text: r.episode + ' (v' + r.version + ')' }), cel('td', { cls: 'l', text: r.layer }),
    cel('td', { cls: 'l', text: r.verdict }), cel('td', { text: (r.npv < 0 ? '−' : '') + '$' + Math.abs(r.npv).toFixed(0) + 'B' }),
    cel('td', { text: r.modelSaysEarnsCost ? 'yes' : 'no' }), cel('td', { cls: 'l', text: r.outcome || 'not recorded' }),
    cel('td', { text: r.versionDiffers ? 'locked under v' + r.lockedModelVersion + ', recomputed under v' + c.currentModelVersion : 'v' + r.lockedModelVersion })])));
  t.appendChild(tb);
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
  $c('epVersion').addEventListener('click', calNewVersion);
  $c('epExport').addEventListener('click', calExport);
  $c('srcAdd').addEventListener('click', () => { calWork.sources.push({ id: 'S' + (calWork.sources.length + 1), citation: '', publicationDate: '', kind: 'contemporary', truncatedAt: null }); calCommit(); calRenderEditor(); });
  $c('layerAdd').addEventListener('click', () => { calWork.layers.push(calEmptyLayer()); calCommit(); calRenderEditor(); });
  calRenderAll();
}
calInit();
