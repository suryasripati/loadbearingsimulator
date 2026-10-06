const KEY = 'load-bearing-sim-v3', V2_KEY = 'load-bearing-sim-v2', OLD_KEY = 'layer-sim-v1';
const copyLayer = (l) => Object.assign({}, l, {driftP:l.driftP.slice(), marginP:l.marginP.slice()});
const freshG = () => Object.assign({}, DEFAULT_G, {entryDef:DEFAULT_DEF, capexModel:DEFAULT_CAPEX, tvMode:DEFAULT_TV_MODE, phases:DEFAULT_PHASES.slice()});
let G = freshG();
let layers = DEFAULT_LAYERS.map(copyLayer);
let sel = 1;

const num = (v) => typeof v==='number' && isFinite(v);
function load(){
  try{
    let s = localStorage.getItem(KEY), old = false, v2 = false;
    if(!s){ s = localStorage.getItem(V2_KEY); v2 = !!s; }
    if(!s){ s = localStorage.getItem(OLD_KEY); old = true; }
    if(!s) return;
    const o = JSON.parse(s);
    if(o && o.G){
      for(const k in DEFAULT_G){ if(num(o.G[k])) G[k]=o.G[k]; }
      if(o.G.entryDef==='A' || o.G.entryDef==='B') G.entryDef = o.G.entryDef;
      if(o.G.capexModel==='sustaining' || o.G.capexModel==='vintage') G.capexModel = o.G.capexModel;
      if(o.G.tvMode==='multiple' || o.G.tvMode==='perpetuity') G.tvMode = o.G.tvMode;
      keepGrowthGap();
      if(Array.isArray(o.G.phases) && o.G.phases.length===2 && o.G.phases.every(num) && o.G.phases[0]<o.G.phases[1]) G.phases = o.G.phases.slice();
    }
    if(o && Array.isArray(o.layers) && o.layers.length===DEFAULT_LAYERS.length){
      o.layers.forEach((l,i)=>{
        for(const k in DEFAULT_LAYERS[i]){
          if(k==='id'||k==='name') continue;
          if(Array.isArray(DEFAULT_LAYERS[i][k])){ if(Array.isArray(l[k]) && l[k].length===3 && l[k].every(num)) layers[i][k]=l[k].slice(); }
          else if(num(l[k])) layers[i][k]=l[k];
        }
        // v0.1 saves held one drift and one margin per layer: carry them into all three phases.
        if(old){ if(num(l.drift)) layers[i].driftP = ph(l.drift); if(num(l.margin)) layers[i].marginP = ph(l.margin); }
      });
    }
    // v2 saves started from the lead/lag placeholder offsets. If they are untouched, return to neutral defaults.
    if(v2 && layers.every((L,i) => L.offset===LEAD_LAG_EXAMPLE[i])) layers.forEach(L => { L.offset = 0; });
    if(Number.isInteger(o.sel) && o.sel>=0 && o.sel<layers.length) sel=o.sel;
  }catch(e){}
}
// While a case is open, edits are not saved over your own scenario (which waits in memory for "Return to my scenario").
function save(){ if(caseCtx) return; try{ localStorage.setItem(KEY, JSON.stringify({G:G, layers:layers, sel:sel})); }catch(e){} }

const $ = (id) => document.getElementById(id);
// Money unit: "$B" for your own scenario; a case sets its own (for example "\u00a3m") for every money label.
let moneyUnit = '$B';
const money = (x) => formatMoney(x, moneyUnit);
let caseCtx = null; // open case: { c, versionId, st (case state), mine (your scenario, kept in memory) }
const pct = (x, d) => (x<0?'\u2212':'') + Math.abs(x).toFixed(d||0) + '%';
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function runAll(g){ return layers.map(L => runLayer(L, g)); }
function binClass(o){
  if(o.bin==='Durable value') return 'c-green';
  if(o.bin==='Pays, but fragile' || o.bin==='Pays on assumptions, not evidence') return 'c-amber';
  if(o.bin==='Speculative') return 'c-red';
  return 'c-amber';
}
function binColor(o){
  const c = binClass(o);
  return c==='c-green' ? 'var(--green)' : c==='c-red' ? 'var(--red)' : 'var(--amber)';
}

/* ---------- drivers ---------- */
const isB = () => G.entryDef==='B';
const isV = () => G.capexModel==='vintage';
const mx = (x, d) => (x<0?'−':'') + Math.abs(x).toFixed(d===undefined?1:d) + 'x';
function syncDriverLabels(){
  $('o_speed').textContent = G.speed.toFixed(1) + ' years';
  $('o_mid').textContent = 'year ' + G.mid.toFixed(1);
  $('o_pool').textContent = money(G.pool) + ' a year';
  $('o_prem').textContent = pct(G.premium);
  $('o_mult').textContent = mx(G.mult);
  $('o_entry').textContent = 'year ' + G.entry;
  $('o_disc').textContent = G.disc.toFixed(1) + '%';
  $('o_rd').textContent = G.rd.toFixed(1) + '%';
  $('o_tv').textContent = G.tv.toFixed(1) + 'x';
  // Perpetuity: growth and the multiple it implies at the current discount rate, (1 + g) / (r - g).
  $('o_tvg').textContent = G.tvGrowth.toFixed(1) + '% \u00b7 ' + mx(perpetuityMultiple(G.tvGrowth, G.disc));
  document.querySelectorAll('#tvSwitch button[data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t===G.tvMode ? 'true':'false'));
  $('ctl_tv').hidden = G.tvMode === 'perpetuity'; $('ctl_tvg').hidden = G.tvMode !== 'perpetuity';
  const btns = document.querySelectorAll('#scen button');
  btns.forEach(b => { const s = SCEN[b.dataset.s]; b.setAttribute('aria-pressed', (s.speed===G.speed && s.mid===G.mid) ? 'true':'false'); });
  document.querySelectorAll('#defSwitch button[data-d]').forEach(b => b.setAttribute('aria-pressed', b.dataset.d===G.entryDef ? 'true':'false'));
  document.querySelectorAll('#capexSwitch button[data-c]').forEach(b => b.setAttribute('aria-pressed', b.dataset.c===G.capexModel ? 'true':'false'));
  $('capexNote').innerHTML = isV()
    ? '<b>Vintage cohorts.</b> Each year\u2019s build spend is replaced at the end of its asset life, at the original cost \u00d7 (1 \u2212 unit-cost decline)<sup>life</sup>. Replacement after year 15 is not charged; value beyond year 15 uses a normalised sustaining spend. Unit-cost decline lowers your replacement cost; pass-through sets how much of it competition hands to customers as lower prices, applied through share drift (see the effective drift in the Phases table). Replacement before your entry year is not in the entry price, and debt covers the initial build only.'
    : '<b>Sustaining spend (v0.1).</b> After the build, build capex \u00f7 asset life is spent every year. Unit-cost decline is ignored in this mode.';
  document.querySelectorAll('#inputs input[data-k="unitCostDecline"], #inputs input[data-k="passThrough"]').forEach(i => { i.disabled = !isV(); });
  $('ctl_prem').hidden = isB(); $('ctl_mult').hidden = !isB();
  $('defNote').innerHTML = isB()
    ? '<b>Forward cash multiple.</b> You pay the multiple times the layer’s operating cash in year '+(G.entry+1)+' (before sustaining spend), at year '+G.entry+'. Build capex from year '+G.entry+' on is paid at cost.'
    : '<b>Replacement-cost premium.</b> You pay build capex already spent before year '+G.entry+', marked up by the premium, at year '+G.entry+'. Build capex from then on is also paid at the premium. At entry year 0 this is the v0.1 model.';
}
// Slider and phase-input ranges come from the shared definitions in defaults.js (also used by the snapshot validator).
const SLIDERS = {g_speed:'speed', g_mid:'mid', g_pool:'pool', g_prem:'premium', g_mult:'mult', g_entry:'entry', g_disc:'disc', g_rd:'rd', g_tv:'tv', g_tvg:'tvGrowth'};
// Long-run growth stays at least TV_GROWTH_GAP points below the discount rate: growth is pulled down when either moves.
function keepGrowthGap(){ if(G.tvGrowth > G.disc - TV_GROWTH_GAP){ G.tvGrowth = G.disc - TV_GROWTH_GAP; if($('g_tvg')) $('g_tvg').value = G.tvGrowth; } }
function applyRanges(){
  for(const id in SLIDERS){ const r = GLOBAL_RANGES[SLIDERS[id]], e = $(id); e.min = r[0]; e.max = r[1]; e.step = r[2]; }
  ['ph1','ph2'].forEach((id,i) => { const r = PHASE_RANGES[i], e = $(id); e.min = r[0]; e.max = r[1]; e.step = r[2]; });
}
function syncDriverInputs(){
  $('g_speed').value = G.speed; $('g_mid').value = G.mid; $('g_pool').value = G.pool;
  $('g_prem').value = G.premium; $('g_mult').value = G.mult; $('g_entry').value = G.entry;
  $('g_disc').value = G.disc; $('g_rd').value = G.rd; $('g_tv').value = G.tv; $('g_tvg').value = G.tvGrowth;
  $('ph1').value = G.phases[0]; $('ph2').value = G.phases[1];
}
// One dash pattern per layer (in DEFAULT_LAYERS order) so no layer line can be mistaken for the solid demand line.
const LAYER_DASH = ['8 3', '2 2', '8 3 2 3', '4 4', '12 2 2 2 2 2', '1 3']; // up to six layers (cases)
function timingText(L){
  const off = L.offset, st = L.steepness;
  if(off===0 && st===1) return 'same as end demand';
  const parts = [];
  if(off<0) parts.push('leads by '+(-off)+' year'+(off===-1?'':'s'));
  if(off>0) parts.push('lags by '+off+' year'+(off===1?'':'s'));
  if(st>1) parts.push('steeper (×'+st+')');
  if(st<1) parts.push('flatter (×'+st+')');
  return parts.join(', ');
}
// Short legend tag for a layer (the full wording goes in the card's info note).
function timingShort(L){
  if(L.offset===0 && L.steepness===1) return '= demand';
  const p = [];
  if(L.offset<0) p.push('leads '+(-L.offset)+'y');
  if(L.offset>0) p.push('lags '+L.offset+'y');
  if(L.steepness>1) p.push('×'+L.steepness+' steeper');
  if(L.steepness<1) p.push('×'+L.steepness+' flatter');
  return p.join(', ');
}
// The Timing chart is drawn at its real pixel size. Its height is chosen so the Timing card ends level with the
// Money assumptions card beside it (two columns, wide screens); otherwise a fixed height.
let adoptHeight = 170;
function adoptChart(){
  const box = $('adoptChart');
  const W = Math.max(260, Math.round(box.clientWidth) || 560), Hh = adoptHeight, m={l:38,r:10,t:8,b:24}, fs = 12;
  const iw=W-m.l-m.r, ih=Hh-m.t-m.b;
  const x = (t) => m.l + iw*t/H, y = (v) => m.t + ih*(1-v);
  const path = (f) => { let d=''; for(let t=0;t<=H;t+=0.25){ d += (t===0?'M':'L') + x(t).toFixed(1) + ' ' + y(f(t)).toFixed(1); } return d; };
  const desc = layers.map(L => L.name+': '+timingText(L)).join('; ');
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="'+W+'" height="'+Hh+'" role="img" aria-label="Share of full adoption by year for end demand and each layer. '+desc+'.">';
  [0,0.5,1].forEach(v => { s += '<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--grid)" stroke-width="1"/><text x="'+(m.l-4)+'" y="'+(y(v)+4)+'" font-size="'+fs+'" fill="var(--cap)" text-anchor="end">'+Math.round(v*100)+'%</text>'; });
  [0,5,10,15].forEach(t => { s += '<text x="'+x(t)+'" y="'+(Hh-6)+'" font-size="'+fs+'" fill="var(--cap)" text-anchor="'+(t===0?'start':t===H?'end':'middle')+'">year '+t+'</text>'; });
  // Selected layer: a wide translucent band underneath, so it stays visible even when it coincides with demand.
  s += '<path class="halo" d="'+path(t => layerAdoption(t,layers[sel],G))+'" fill="none" stroke="var(--copper)" stroke-opacity="0.28" stroke-width="7" stroke-linecap="round"/>';
  layers.forEach((L,i) => {
    s += '<path class="layer" data-layer="'+L.id+'" d="'+path(t => layerAdoption(t,L,G))+'" fill="none" stroke="var(--ink)" stroke-width="'+(i===sel?2:1.1)+'" stroke-dasharray="'+LAYER_DASH[i % LAYER_DASH.length]+'"/>';
  });
  // End demand last, so a dashed layer line never hides it.
  s += '<path class="demand" d="'+path(t => adoption(t,G))+'" fill="none" stroke="var(--copper)" stroke-width="2.2"/>';
  s += '</svg>';
  const sw = (dash, col, w) => '<svg width="26" height="8" aria-hidden="true"><line x1="1" x2="25" y1="4" y2="4" stroke="'+col+'" stroke-width="'+w+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/></svg>';
  // Two columns, three rows: End demand and the five layers, each on one line.
  s += '<ul class="tlegend"><li>'+sw('', 'var(--copper)', 2.2)+'<b>End demand</b></li>';
  layers.forEach((L,i) => {
    s += '<li>'+sw(LAYER_DASH[i % LAYER_DASH.length], 'var(--ink)', i===sel?2:1.2)+'<button data-sel="'+i+'" aria-pressed="'+(i===sel)+'">'+L.name+'</button><span class="muted tshort">'+timingShort(L)+'</span></li>';
  });
  s += '</ul>';
  box.innerHTML = s;
  const cap = $('adoptCaption');
  if(cap) cap.textContent = 'Share of full adoption by year. The highlighted band is the selected layer. A layer that is the same as end demand (“= demand”) sits under the copper line. ' + layers.map(L => L.name + ': ' + timingText(L)).join('; ') + '.';
  matchTimingHeight();
}
function matchTimingHeight(){
  const t = $('timing'), mc = $('moneyCard');
  if(!t || !mc || t.offsetParent === null || window.innerWidth <= 860) return;
  const svg = t.querySelector('#adoptChart > svg'); if(!svg) return;
  const other = t.offsetHeight - svg.getBoundingClientRect().height;
  const want = Math.max(110, Math.min(380, Math.round(mc.offsetHeight - other)));
  if(Math.abs(want - adoptHeight) > 1){ adoptHeight = want; adoptChart(); }
}

/* ---------- inputs tables ---------- */
// [key, label, min, max, step, phase index or undefined]
const LR = (k) => LAYER_RANGES[k];
const COLS = [
  ['evidence','Demand evidence (1-5)'],
  ['share','Share of pool, % at start'],
  ['offset','Timing offset, years (\u2212 leads, + lags)'],
  ['steepness','Curve steepness (1 = same as demand)'],
  ['capex','Build capex, $B'],
  ['buildStart','Build starts, year'],
  ['buildYears','Build years'],
  ['unitCostDecline','Unit-cost decline, % a year (vintage only)'],
  ['passThrough','Pass-through to prices, 0\u20131 (vintage only; no view, placeholder, unsourced)'],
  ['life','Asset life, years'],
  ['debt','Debt, % of build'],
  ['alloc','My allocation']
].map(c => c.concat(LR(c[0])));
const PCOLS = [0,1,2].map(p => ['driftP','Share drift, % a year'].concat(LR('driftP'), [p])).concat([0,1,2].map(p => ['marginP','Cash margin, %'].concat(LR('marginP'), [p])));
const getV = (L, c) => c[5]===undefined ? L[c[0]] : L[c[0]][c[5]];
// The view mode in which each layer-table column first appears (Basic otherwise).
// The layer table is Analyst-only as a whole (its section is tagged), so no column needs its own tag.
const COL_MODE = {};
const dm = (k) => COL_MODE[k] ? ' data-min="'+COL_MODE[k]+'"' : '';
function cellInput(L, i, c){
  return '<td'+(c[5]===undefined ? dm(c[0]) : '')+'><input type="number" data-i="'+i+'" data-k="'+c[0]+'"'+(c[5]===undefined?'':' data-p="'+c[5]+'"')+' min="'+c[2]+'" max="'+c[3]+'" step="'+c[4]+'" value="'+getV(L,c)+'" aria-label="'+L.name+': '+c[1]+(c[5]===undefined?'':', phase '+(c[5]+1))+'"></td>';
}
function phaseLabels(){
  const b = G.phases;
  return ['years 0–'+(b[0]-1), 'years '+b[0]+'–'+(b[1]-1), 'years '+b[1]+'–'+H];
}
function buildInputs(){
  // Basic and Advanced show one cash margin per layer; it sets all three phases. When the phases differ (set in
  // Analyst), the cell says so instead of offering an input that would overwrite them.
  const head = (c) => '<th'+dm(c[0])+'>'+c[1].replace('$B', esc(moneyUnit))+'</th>';
  let h = '<thead><tr><th class="l">Layer</th>' + COLS.map(c => head(c) + (c[0]==='share' ? '<th>Cash margin, %</th>' : '')).join('') + '</tr></thead><tbody>';
  layers.forEach((L,i) => {
    h += '<tr class="'+(i===sel?'sel':'')+'" data-i="'+i+'"><td>'+nameBtn(L,i)+'</td>';
    COLS.forEach(c => { h += cellInput(L, i, c); if(c[0]==='share') h += '<td class="mcell" data-i="'+i+'"></td>'; });
    h += '</tr>';
  });
  h += '</tbody>';
  $('inputs').innerHTML = h;
  buildPhaseTable();
  document.querySelectorAll('#inputs input').forEach(inp => inp.addEventListener('input', onLayerInput));
  updateMarginCells(true);
  buildScoreLite();
  renderChips();
}
// First-screen scorecard: layer, verdict, present value, headroom and an editable allocation. Built once so the
// allocation box keeps focus while typing; values are refreshed in place on every render.
function buildScoreLite(){
  const r = LR('alloc');
  let h = '<thead><tr><th class="l">Layer</th><th class="l">Verdict</th><th>Present value</th><th>Headroom</th><th>My allocation</th></tr></thead><tbody>';
  layers.forEach((L,i) => {
    h += '<tr class="'+(i===sel?'sel':'')+'" data-i="'+i+'"><td class="l">'+nameBtn(L,i)+'</td><td class="l v"></td><td class="pv"></td><td class="hr"></td>'
      + '<td><input type="number" data-i="'+i+'" data-k="alloc" data-lite="1" min="'+r[0]+'" max="'+r[1]+'" step="'+r[2]+'" value="'+L.alloc+'" aria-label="'+L.name+': My allocation"></td></tr>';
  });
  $('scoreLite').innerHTML = h + '</tbody>';
  $('scoreLite').querySelectorAll('input').forEach(inp => inp.addEventListener('input', onLayerInput));
}
function updateScoreLite(res){
  $('scoreLite').querySelectorAll('tbody tr').forEach(tr => {
    const i = +tr.dataset.i, o = res[i], L = layers[i];
    tr.querySelector('.v').innerHTML = '<span class="chip '+binClass(o)+'">'+o.bin+'</span>';
    const pv = tr.querySelector('.pv'); pv.textContent = money(o.npv); pv.className = 'pv ' + (o.npv<0?'neg':'pos');
    const hr = tr.querySelector('.hr');
    hr.textContent = isFinite(o.headroom) ? (o.headroom>0?'+':'') + (isB() ? mx(o.headroom) : pct(o.headroom)) : 'n/a';
    hr.className = 'hr ' + (!isFinite(o.headroom) ? 'muted' : o.headroom<0 ? 'neg' : 'pos');
    const a = tr.querySelector('input'); if(document.activeElement !== a) a.value = L.alloc;
  });
}
const uniformMargin = (L) => L.marginP.every(v => v === L.marginP[0]);
function updateMarginCells(force){
  document.querySelectorAll('#inputs td.mcell').forEach(td => {
    const i = +td.dataset.i, L = layers[i], inp = td.querySelector('input');
    if(uniformMargin(L)){
      if(inp && !force){ if(document.activeElement !== inp) inp.value = L.marginP[0]; return; }
      const r = LR('marginP');
      td.innerHTML = '<input type="number" data-i="'+i+'" data-k="marginAll" min="'+r[0]+'" max="'+r[1]+'" step="'+r[2]+'" value="'+L.marginP[0]+'" aria-label="'+L.name+': Cash margin, % (all phases)">';
      td.querySelector('input').addEventListener('input', onLayerInput);
    } else if(inp || force || !td.textContent){
      td.innerHTML = '<span class="muted" title="Set per phase in Analyst mode">varies by phase</span>';
    }
  });
}
// Any element with data-sel selects that layer: table names, the layer buttons under Detail, and quadrant dots.
function selectLayer(i){ if(!(i>=0 && i<layers.length)) return; sel = i; save(); markSel(); renderResults(); }
const nameBtn = (L, i) => '<button class="rowname" data-sel="'+i+'" aria-pressed="'+(i===sel)+'">'+L.name+'</button>';
function buildLayerPick(){
  $('layerPick').innerHTML = layers.map((L,i) => '<button data-sel="'+i+'" aria-pressed="'+(i===sel)+'">'+L.name+'</button>').join('');
}
function buildPhaseTable(){
  const pl = phaseLabels();
  let h = '<thead><tr><th class="l" rowspan="2">Layer</th><th colspan="3" style="text-align:center">Share drift, % a year</th><th colspan="3" style="text-align:center">Cash margin, %</th></tr><tr>'
    + pl.map(x => '<th>'+x+'</th>').join('') + pl.map(x => '<th>'+x+'</th>').join('') + '</tr></thead><tbody>';
  layers.forEach((L,i) => {
    h += '<tr class="'+(i===sel?'sel':'')+'" data-i="'+i+'"><td>'+nameBtn(L,i)+'</td>'
      + PCOLS.map(c => c[0]==='driftP' ? cellInput(L, i, c).replace('</td>', '<small class="eff" data-i="'+i+'" data-p="'+c[5]+'"></small></td>') : cellInput(L, i, c)).join('') + '</tr>';
  });
  h += '</tbody>';
  $('phaseTable').innerHTML = h;
  updateEffDrift();
  $('phaseTable').querySelectorAll('input').forEach(inp => inp.addEventListener('input', onLayerInput));
}
// Effective drift after pass-through, shown beside each drift input in Vintage mode only.
function updateEffDrift(){
  document.querySelectorAll('#phaseTable small.eff').forEach(el => {
    const L = layers[+el.dataset.i];
    el.textContent = isV() ? 'effective ' + pct(effectiveDrift(L.driftP[+el.dataset.p], L, G), 1) : '';
  });
  $('effNote').hidden = !isV();
}
function markSel(){
  document.querySelectorAll('#inputs tbody tr, #phaseTable tbody tr, #fragility tbody tr, #scoreLite tbody tr').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i===sel));
  document.querySelectorAll('button[data-sel]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.sel===sel ? 'true' : 'false'));
}
function onLayerInput(e){
  const inp = e.target, i = +inp.dataset.i, k = inp.dataset.k, p = inp.dataset.p;
  if(k==='marginAll'){
    const r = LR('marginP'); let m = parseFloat(inp.value);
    if(!isFinite(m)) return;
    m = clamp(m, r[0], r[1]);
    layers[i].marginP = [m, m, m];
    refreshInputsFromState(); save(); renderResults(); return;
  }
  const col = COLS.concat(PCOLS).find(c => c[0]===k);
  let v = parseFloat(inp.value);
  if(!isFinite(v)) return;
  v = clamp(v, col[2], col[3]);
  if(p===undefined) layers[i][k] = v; else layers[i][k][+p] = v;
  // The allocation is editable in two places (compact scorecard and Analyst layer table): keep the other in step.
  if(k==='alloc') document.querySelectorAll('input[data-k="alloc"][data-i="'+i+'"]').forEach(x => { if(x !== inp) x.value = v; });
  // Keep the build inside the horizon (the model clamps the same way); show the clamped value.
  if(k==='buildStart' || k==='buildYears'){
    const L = layers[i], bs = buildStartOf(L);
    if(bs !== L.buildStart){ L.buildStart = bs; const f = document.querySelector('#inputs input[data-i="'+i+'"][data-k="buildStart"]'); if(f) f.value = bs; }
  }
  save(); renderResults();
}
function refreshInputsFromState(){
  document.querySelectorAll('#inputs input, #phaseTable input').forEach(inp => {
    if(inp.dataset.k==='marginAll') return; // kept in step by updateMarginCells
    const L = layers[+inp.dataset.i]; inp.value = inp.dataset.p===undefined ? L[inp.dataset.k] : L[inp.dataset.k][+inp.dataset.p];
  });
  updateMarginCells(false);
}
function onPhaseBounds(){
  let a = Math.round(parseFloat($('ph1').value)), b = Math.round(parseFloat($('ph2').value));
  if(!isFinite(a) || !isFinite(b)) return;
  a = clamp(a, PHASE_RANGES[0][0], PHASE_RANGES[0][1]); b = clamp(b, Math.max(a+1, PHASE_RANGES[1][0]), PHASE_RANGES[1][1]);
  G.phases = [a, b];
  buildPhaseTable(); update();
}

/* ---------- quadrant ---------- */
function sq(x){ return Math.sign(x)*Math.sqrt(Math.abs(x)); }
// Quadrant drawn at its real pixel size, so font sizes are pixels: 11.5px when the chart is at least 380px wide
// (true at 1440 and 1280), 10.5px down to 320px (phones), 10px below. On wide screens its height fills the first-screen row
// down to the bottom of the viewport; on narrow screens it keeps a 0.72 aspect ratio.
function quadFontFor(W){ return W >= 380 ? 11.5 : W >= 320 ? 10.5 : 10; }
let quadFs = 11.5;
function quadSize(){
  const box = $('quad'), W = Math.round(box.clientWidth) || 640;
  if(!box.clientWidth) return { W: 640, Hh: 400 };
  if(window.innerWidth <= 700) return { W, Hh: Math.round(Math.max(240, Math.min(420, W * 0.72))) };
  const top = box.getBoundingClientRect().top + window.scrollY;
  // Leave room for the card's bottom padding, the page's bottom padding and the footer, so Basic never scrolls.
  const foot = document.querySelector('.foot'), wrap = document.querySelector('main.wrap');
  const below = 14 + (wrap ? parseFloat(getComputedStyle(wrap).paddingBottom) || 0 : 0) + (foot ? foot.offsetHeight : 0) + 2;
  const extra = $('lowShare') && !$('lowShare').hidden ? $('lowShare').offsetHeight + 8 : 0;
  return { W, Hh: Math.round(Math.max(260, Math.min(620, window.innerHeight - top - below - extra))) };
}
function quadChart(res){
  const sz = quadSize(), W = sz.W, Hh = sz.Hh, fs = quadFontFor(W);
  quadFs = fs;
  const m={l:Math.round(fs*4), r:16, t:16, b:Math.round(fs*4.2)};
  const iw=W-m.l-m.r, ih=Hh-m.t-m.b;
  const XMIN = isB() ? -20 : -200, XMAX = isB() ? 60 : 800;
  const sx = (v) => m.l + iw*(sq(clamp(v,XMIN,XMAX))-sq(XMIN))/(sq(XMAX)-sq(XMIN));
  const sy = (e) => m.t + ih*(1-(e-0.6)/(5.4-0.6));
  const x0 = sx(0), yg = sy(2.5);
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="'+W+'" height="'+Hh+'" role="img" aria-label="Quadrant chart: demand evidence against headroom for each layer">';
  s += '<rect x="'+m.l+'" y="'+m.t+'" width="'+(x0-m.l)+'" height="'+(yg-m.t)+'" fill="var(--amber-bg)"/>';
  s += '<rect x="'+x0+'" y="'+m.t+'" width="'+(W-m.r-x0)+'" height="'+(yg-m.t)+'" fill="var(--green-bg)"/>';
  s += '<rect x="'+m.l+'" y="'+yg+'" width="'+(x0-m.l)+'" height="'+(m.t+ih-yg)+'" fill="var(--red-bg)"/>';
  s += '<rect x="'+x0+'" y="'+yg+'" width="'+(W-m.r-x0)+'" height="'+(m.t+ih-yg)+'" fill="var(--amber-bg)" opacity="0.6"/>';
  s += '<text class="qq" x="'+(m.l+8)+'" y="'+(m.t+fs+4)+'" font-size="'+fs+'" fill="var(--amber)">Useful, capital does not earn its cost</text>';
  // On narrow charts the two corner labels in a row can meet; then the right-hand one moves one line inwards.
  const cornerGap = (l, r) => labelWidth(l) + labelWidth(r) + 24 > iw ? Math.round(fs * 1.3) : 0;
  const topShift = cornerGap('Useful, capital does not earn its cost', 'Durable or fragile value'), botShift = cornerGap('Speculative', 'Pays on assumptions, not evidence');
  s += '<text class="qq" x="'+(W-m.r-8)+'" y="'+(m.t+fs+4+topShift)+'" font-size="'+fs+'" fill="var(--green)" text-anchor="end">Durable or fragile value</text>';
  s += '<text class="qq" x="'+(m.l+8)+'" y="'+(m.t+ih-8)+'" font-size="'+fs+'" fill="var(--red)">Speculative</text>';
  s += '<text class="qq" x="'+(W-m.r-8)+'" y="'+(m.t+ih-8-botShift)+'" font-size="'+fs+'" fill="var(--amber)" text-anchor="end">Pays on assumptions, not evidence</text>';
  s += '<line x1="'+x0+'" x2="'+x0+'" y1="'+m.t+'" y2="'+(m.t+ih)+'" stroke="var(--ink)" stroke-width="1.2"/>';
  s += '<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+yg+'" y2="'+yg+'" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="4 3"/>';
  [1,2,3,4,5].forEach(e => { s += '<text class="qa" x="'+(m.l-8)+'" y="'+(sy(e)+4)+'" font-size="'+fs+'" fill="var(--cap)" text-anchor="end">'+e+'</text>'; });
  (isB() ? [-10,0,10,30,60] : [-100,0,100,300,600]).forEach(v => { s += '<text class="qa" x="'+sx(v)+'" y="'+(m.t+ih+fs+5)+'" font-size="'+fs+'" fill="var(--cap)" text-anchor="middle">'+(v>0?'+':'')+v+(isB()?'x':'%')+'</text>'; });
  s += '<text class="qa" x="'+(m.l+iw/2)+'" y="'+(Hh-6)+'" font-size="'+fs+'" fill="var(--ink)" text-anchor="middle">'+(isB() ? 'Headroom: break-even multiple minus your multiple' : 'Headroom: break-even premium minus your entry premium')+'</text>';
  s += '<text class="qa" transform="translate('+(fs+2)+' '+(m.t+ih/2)+') rotate(-90)" font-size="'+fs+'" fill="var(--ink)" text-anchor="middle">Demand evidence</text>';
  const tot = layers.reduce((a,L)=>a+L.alloc,0) || 1;
  const skipped = [], dots = [];
  res.forEach((o,i) => {
    const L = layers[i];
    if(!isFinite(o.headroom)){ skipped.push(L.name); return; }
    const r = 6 + 12*Math.sqrt(L.alloc/tot);
    dots.push({i:i, o:o, L:L, cx:sx(o.headroom), cy:sy(L.evidence), r:r, rr:o.flags.length ? r+3.5 : r});
  });
  const labels = placeLabels(dots, {x0:m.l, y0:m.t, x1:W-m.r, y1:m.t+ih});
  dots.forEach((d,k) => {
    const lb = labels[k];
    s += '<g class="dot'+(d.i===sel?' on':'')+'" data-sel="'+d.i+'" role="button" tabindex="0" aria-pressed="'+(d.i===sel)+'" aria-label="'+d.L.name+': '+d.o.bin+'. Select to see detail.">';
    s += '<circle cx="'+d.cx.toFixed(1)+'" cy="'+d.cy.toFixed(1)+'" r="'+d.r.toFixed(1)+'" fill="'+binColor(d.o)+'" fill-opacity="0.85" stroke="var(--card)" stroke-width="1.5"/>';
    if(d.o.flags.length) s += '<circle cx="'+d.cx.toFixed(1)+'" cy="'+d.cy.toFixed(1)+'" r="'+d.rr.toFixed(1)+'" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-dasharray="3 2"/>';
    if(d.i===sel) s += '<circle cx="'+d.cx.toFixed(1)+'" cy="'+d.cy.toFixed(1)+'" r="'+(d.rr+4).toFixed(1)+'" fill="none" stroke="var(--copper)" stroke-width="2"/>';
    if(lb.leader) s += '<line x1="'+d.cx.toFixed(1)+'" y1="'+d.cy.toFixed(1)+'" x2="'+lb.lx.toFixed(1)+'" y2="'+lb.ly.toFixed(1)+'" stroke="var(--cap)" stroke-width="0.8"/>';
    s += '<text class="qlab" x="'+lb.x.toFixed(1)+'" y="'+(lb.y + labBase()).toFixed(1)+'" font-size="'+quadFs+'" font-weight="700" fill="var(--ink)">'+d.L.name+'</text>';
    s += '</g>';
  });
  s += '</svg>';
  if(skipped.length) s += '<div class="legend">Not plotted: '+skipped.join(', ')+'. Year '+(G.entry+1)+' operating cash is close to zero, so a cash multiple is not meaningful.</div>';
  $('quad').innerHTML = s;
}

// Label placement: for each dot, try above, below, right and left; take the first spot that stays inside the plot and
// clears every placed label and every dot. Otherwise move further out in the same directions and draw a leader line.
// Label box height and baseline follow the quadrant's font size (bold Arial at quadFs pixels).
const labH = () => Math.round(quadFs * 1.3), labBase = () => Math.round(quadFs * 0.95);
let measureCtx = null;
function labelWidth(text){
  // Measure with a canvas in the same font; fall back to a generous per-character estimate.
  try{ if(!measureCtx) measureCtx = document.createElement('canvas').getContext('2d'); measureCtx.font = 'bold ' + quadFs + 'px Arial, "Helvetica Neue", sans-serif'; return measureCtx.measureText(text).width + 2; }
  catch(e){ return text.length * quadFs * 0.63; }
}
function placeLabels(dots, box){
  const placed = [], obstacles = dots.map(d => ({x:d.cx-d.rr, y:d.cy-d.rr, w:2*d.rr, h:2*d.rr}));
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = (a) => a.x >= box.x0 && a.y >= box.y0 && a.x + a.w <= box.x1 && a.y + a.h <= box.y1;
  const clampBox = (a) => ({x:clamp(a.x, box.x0, box.x1 - a.w), y:clamp(a.y, box.y0, box.y1 - a.h), w:a.w, h:a.h});
  const ok = (a) => inside(a) && !placed.some(p => hit(a, p)) && !obstacles.some(o => hit(a, o));
  // Place labels for larger dots first so the most important names get the closest spots.
  const order = dots.map((d,k) => k).sort((a,b) => dots[b].r - dots[a].r);
  const out = [];
  order.forEach(k => {
    const d = dots[k], w = labelWidth(d.L.name), g = 4;
    // Above and below: centred on the dot, then slid sideways (kept inside the plot) so edge dots still get a spot.
    const at = (dist) => {
      const up = d.cy - d.rr - dist - labH(), dn = d.cy + d.rr + dist, mid = d.cy - labH()/2;
      const xs = [d.cx - w/2, d.cx - w + 6, d.cx - 6];
      return [].concat(
        xs.map(x => clampBox({x:x, y:up, w:w, h:labH()})),
        xs.map(x => clampBox({x:x, y:dn, w:w, h:labH()})),
        [{x:d.cx + d.rr + dist, y:mid, w:w, h:labH()}, {x:d.cx - d.rr - dist - w, y:mid, w:w, h:labH()}]
      ).filter(c => c.y + c.h <= d.cy - d.rr - dist + 0.01 || c.y >= d.cy + d.rr + dist - 0.01 || c.x >= d.cx + d.rr || c.x + c.w <= d.cx - d.rr);
    };
    let pick = null, leader = false;
    for(const c of at(g)){ if(ok(c)){ pick = c; break; } }
    for(let dist = 16; !pick && dist <= 64; dist += 12){
      for(const c of at(dist)){ if(ok(c)){ pick = c; leader = true; break; } }
    }
    // Then the nearest free spot anywhere in the plot, joined by a leader line.
    if(!pick){
      let best = null, bestD = Infinity;
      for(let y = box.y0; y + labH() <= box.y1; y += 6) for(let x = box.x0; x + w <= box.x1; x += 8){
        const c = {x:x, y:y, w:w, h:labH()};
        const dd = Math.hypot(x + w/2 - d.cx, y + labH()/2 - d.cy);
        if(dd < bestD && ok(c)){ best = c; bestD = dd; }
      }
      if(best){ pick = best; leader = true; }
    }
    // Last resort: stay inside the plot even if it overlaps, so a name is never clipped.
    if(!pick){ pick = clampBox({x:d.cx - w/2, y:d.cy - d.rr - g - labH(), w:w, h:labH()}); }
    placed.push(pick);
    const lx = clamp(d.cx, pick.x, pick.x + pick.w), ly = clamp(d.cy, pick.y, pick.y + pick.h);
    out[k] = {x:pick.x, y:pick.y, leader:leader, lx:lx, ly:ly};
  });
  return out;
}

/* ---------- scorecard ---------- */
function beText(o){ return isB() ? (o.bMeaningful ? mx(o.breakEvenM) : 'not meaningful') : pct(o.breakEven); }
function hrText(o){
  if(!isFinite(o.headroom)) return '<td class="muted">n/a</td>';
  const v = isB() ? mx(o.headroom) : pct(o.headroom);
  return '<td class="'+(o.headroom<0?'neg':'pos')+'">'+(o.headroom>0?'+':'')+v+'</td>';
}
// Bounds, not forecasts: present value with pass-through at 0 and at 1, everything else as set.
function ptCells(L){
  const a = runLayer(Object.assign({}, L, {passThrough:0}), G).npv, b = runLayer(Object.assign({}, L, {passThrough:1}), G).npv;
  const c = (v) => '<td class="'+(v<0?'neg':'pos')+'">'+money(v)+'</td>';
  return c(a) + c(b) + '<td>'+money(a-b)+'</td>';
}
function scoreTable(res){
  // Basic: layer, present value, headroom, verdict. Advanced adds break-even, IRR, payback and flags. Analyst adds the rest.
  const A = ' data-min="advanced"', Z = ' data-min="analyst"';
  let h = '<thead><tr><th class="l">Layer</th><th'+Z+'>Evidence gate</th><th>Present value at year '+G.entry+'</th><th'+A+'>'+(isB()?'Break-even multiple':'Break-even premium')+'</th><th>Headroom</th><th'+A+'>Return on cash (IRR)</th><th'+A+'>Cash payback</th><th'+Z+'>Debt</th>'+(isV()?'<th'+Z+'>Value if owner keeps savings (pass-through 0)</th><th'+Z+'>Value if competition takes savings (pass-through 1)</th><th'+Z+'>Value at stake in pricing power</th><th'+Z+'>Peak stranded value, % of capex (not a cash item)</th>':'')+'<th'+A+'>Flags</th><th class="l">Verdict</th></tr></thead><tbody>';
  res.forEach((o,i) => {
    const L = layers[i];
    const irr = isNaN(o.irr) ? (o.npv<0 ? 'below −50%' : 'n/a') : pct(o.irr*100,1);
    const pb = o.payback===null ? 'not by year '+H : 'year '+o.payback+' of a '+L.life+'-year asset';
    const debt = L.debt===0 ? 'None' : (o.flags.indexOf('debt')>=0 ? 'Short by '+money(o.shortfall) : 'Covered');
    const fl = o.flags.length ? o.flags.map(f => f==='life'?'Life':f==='debt'?'Debt':'Tail').join(', ') : 'None';
    h += '<tr class="'+(i===sel?'sel':'')+'"><td>'+nameBtn(L,i)+'</td>'
      + '<td'+Z+'><span class="chip '+(o.merit?'c-green':'c-amber')+'">'+(o.merit?'Pass':'Forecast bet')+'</span></td>'
      + '<td class="'+(o.npv<0?'neg':'pos')+'">'+money(o.npv)+'</td>'
      + '<td'+A+'>'+beText(o)+'</td>'
      + hrText(o)
      + '<td'+A+'>'+irr+'</td><td'+A+'>'+pb+'</td><td'+Z+'>'+debt+'</td>'+(isV()?ptCells(L).replace(/<td/g, '<td'+Z)+'<td'+Z+'>'+pct(o.strandedPeakPct)+'</td>':'')+'<td'+A+'>'+fl+'</td>'
      + '<td class="l"><span class="chip '+binClass(o)+'">'+o.bin+'</span></td></tr>';
  });
  h += '</tbody>';
  $('score').innerHTML = h;
  $('beLegend').innerHTML = isB()
    ? '<b>Break-even multiple.</b> The most you could pay, as a multiple of year-'+(G.entry+1)+' operating cash, and still earn the discount rate. Headroom is that figure minus your multiple. “Not meaningful” means that year’s cash is close to zero, which is normal early on the S-curve and is itself a finding about early-stage multiples.'
    : '<b>Break-even premium.</b> The most you could pay above build cost and still earn the discount rate. Headroom is that figure minus your entry premium.';
}

/* ---------- selected layer ---------- */
function cashChart(o){
  const W=420, Hh=250, m={l:50,r:12,t:14,b:30};
  const iw=W-m.l-m.r, ih=Hh-m.t-m.b;
  const vals = o.cumArr.concat(o.cf, [0]);
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if(hi-lo < 1){ hi = lo + 1; }
  const pad = (hi-lo)*0.08; lo -= pad; hi += pad;
  const x = (t) => m.l + iw*t/H, y = (v) => m.t + ih*(1-(v-lo)/(hi-lo));
  const bw = iw/(H+1)*0.6;
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="100%" role="img" aria-label="Cumulative cash for the selected layer">';
  for(let k=0;k<=4;k++){ const v = lo + (hi-lo)*k/4; s += '<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--grid)" stroke-width="0.8"/><text x="'+(m.l-5)+'" y="'+(y(v)+3.5)+'" font-size="10" fill="var(--cap)" text-anchor="end">'+(v<0?'−':'')+Math.abs(v).toFixed(0)+'</text>'; }
  s += '<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="var(--ink)" stroke-width="1.2"/>';
  o.cf.forEach((v,t) => { if(t<o.entry) return; const y0=y(0), y1=y(v); s += '<rect x="'+(x(t)-bw/2).toFixed(1)+'" y="'+Math.min(y0,y1).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.abs(y1-y0).toFixed(1)+'" fill="var(--navy-bg)" stroke="var(--hair)" stroke-width="0.5"/>'; });
  let d=''; o.cumArr.forEach((v,t) => { if(t<o.entry) return; d += (t===o.entry?'M':'L') + x(t).toFixed(1)+' '+y(v).toFixed(1); });
  s += '<path d="'+d+'" fill="none" stroke="var(--copper)" stroke-width="2.4"/>';
  const L = layers[sel];
  if(o.entry>0){ s += '<line x1="'+x(o.entry)+'" x2="'+x(o.entry)+'" y1="'+m.t+'" y2="'+(m.t+ih)+'" stroke="var(--ink)" stroke-width="1" stroke-dasharray="2 3"/><text x="'+(x(o.entry)-4)+'" y="'+(m.t+ih-4)+'" font-size="10.5" fill="var(--ink)" text-anchor="end">entry</text>'; }
  const lifeEnd = o.entry + L.life;
  if(lifeEnd<=H){ s += '<line x1="'+x(lifeEnd)+'" x2="'+x(lifeEnd)+'" y1="'+m.t+'" y2="'+(m.t+ih)+'" stroke="var(--red)" stroke-width="1.2" stroke-dasharray="4 3"/><text x="'+(x(lifeEnd)+4)+'" y="'+(m.t+11)+'" font-size="10.5" fill="var(--red)">asset life ends</text>'; }
  if(o.payback!==null){ s += '<circle cx="'+x(o.payback)+'" cy="'+y(o.cumArr[o.payback])+'" r="4.5" fill="var(--green)" stroke="var(--card)" stroke-width="1.5"/><text x="'+(x(o.payback)+7)+'" y="'+(y(o.cumArr[o.payback])-7)+'" font-size="10.5" fill="var(--green)">payback</text>'; }
  [0,5,10,15].forEach(t => { s += '<text x="'+x(t)+'" y="'+(Hh-10)+'" font-size="10" fill="var(--cap)" text-anchor="middle">year '+t+'</text>'; });
  s += '</svg><div class="legend">Line: cumulative cash, '+esc(moneyUnit)+'. Bars: cash each year, '+esc(moneyUnit)+'.</div>';
  $('cashNote').textContent = 'Cash is counted from your entry year; the entry-year bar includes the price you pay.';
  $('cashChart').innerHTML = s;
}

function tornado(){
  const sens = sensitivity(layers[sel], G), base = sens.base, rows = sens.rows;
  const W=420, rowH=26, m={l:190,r:12,t:8,b:8}, Hh=m.t+m.b+rows.length*rowH;
  const maxD = Math.max.apply(null, rows.map(r => Math.max(Math.abs(r.bad-base), Math.abs(r.good-base), 1)));
  const iw = W-m.l-m.r, cx = m.l + iw/2, sc = (iw/2)/maxD;
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="100%" role="img" aria-label="Sensitivity of present value to each input">';
  rows.forEach((r,i) => {
    const y = m.t + i*rowH;
    const xb = cx + (r.bad-base)*sc, xg = cx + (r.good-base)*sc;
    s += '<text x="'+(m.l-6)+'" y="'+(y+rowH/2+3)+'" font-size="11" fill="var(--ink)" text-anchor="end">'+r.n+'</text>';
    s += '<rect x="'+Math.min(xb,cx).toFixed(1)+'" y="'+(y+4)+'" width="'+Math.abs(xb-cx).toFixed(1)+'" height="'+(rowH-10)+'" fill="var(--red)" fill-opacity="0.75"/>';
    s += '<rect x="'+Math.min(xg,cx).toFixed(1)+'" y="'+(y+4)+'" width="'+Math.abs(xg-cx).toFixed(1)+'" height="'+(rowH-10)+'" fill="var(--green)" fill-opacity="0.75"/>';
  });
  s += '<line x1="'+cx+'" x2="'+cx+'" y1="'+m.t+'" y2="'+(Hh-m.b)+'" stroke="var(--ink)" stroke-width="1.2"/></svg>';
  let note = '<span>Centre line is today’s present value at year '+G.entry+' of '+money(base)+'. Red is the worse end of each move, green the better end.</span> ';
  note += '<span><b>Shock sizes:</b> '+rows.map(r => r.n+' '+r.lab).join('; ')+'. Drift moves in points, the offset in years and the premium in points; the others move by 25%, so bar lengths are not like-for-like. The build-start bar is one-sided: it moves the build two years later only, because a build cannot start before year 0.'+(isV()?' Unit-cost decline moves by \u00b13 points (a negative value means unit costs rise); pass-through by \u00b10.25, clamped to 0\u20131, so it can be one-sided at the ends.':'')+'</span>';
  $('tornadoNote').innerHTML = note;
  $('tornado').innerHTML = s;
}

/* ---------- entry heatmap ---------- */
const HM_ENTRIES = [0,1,2,3,4,5,6,7,8,9,10];
const HM_PREM = []; for(let p=-50;p<=300;p+=25) HM_PREM.push(p);
const HM_MULT = []; for(let m=0;m<=40;m+=2.5) HM_MULT.push(m);
function heatChart(){
  const L = layers[sel], prices = isB() ? HM_MULT : HM_PREM;
  const grid = heatmap(L, G, HM_ENTRIES, prices);
  const W=640, m={l:52,r:12,t:10,b:44}, cw=(W-m.l-m.r)/prices.length, ch=22, Hh=m.t+m.b+ch*HM_ENTRIES.length;
  const maxAbs = Math.max(1, Math.max.apply(null, grid.map(r => Math.max.apply(null, r.map(Math.abs)))));
  const px = (v) => m.l + cw*((v - prices[0])/(prices[1]-prices[0]) + 0.5);
  const ey = (e) => m.t + ch*(e + 0.5);
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="100%" role="img" aria-label="Present value by entry year and '+(isB()?'multiple':'premium')+' for '+L.name+'">';
  grid.forEach((row,i) => row.forEach((v,j) => {
    const a = 0.12 + 0.78*Math.sqrt(Math.abs(v)/maxAbs);
    s += '<rect x="'+(m.l+j*cw).toFixed(1)+'" y="'+(m.t+i*ch)+'" width="'+(cw-1).toFixed(1)+'" height="'+(ch-1)+'" fill="'+(v>=0?'var(--green)':'var(--red)')+'" fill-opacity="'+a.toFixed(2)+'"><title>Entry year '+HM_ENTRIES[i]+', '+(isB()?mx(prices[j]):pct(prices[j]))+': '+money(v)+'</title></rect>';
  }));
  // Zero contour: NPV is linear in the price, so the break-even point for each entry year is exact.
  let d = '', pen = false;
  HM_ENTRIES.forEach(e => {
    const o = runLayer(L, Object.assign({}, G, {entry:e}));
    const be = isB() ? o.breakEvenM : o.breakEven;
    const inRange = isFinite(be) && be >= prices[0] - (prices[1]-prices[0])/2 && be <= prices[prices.length-1] + (prices[1]-prices[0])/2;
    if(inRange){ d += (pen?'L':'M') + px(be).toFixed(1) + ' ' + ey(e).toFixed(1); pen = true; } else pen = false;
  });
  if(d) s += '<path d="'+d+'" fill="none" stroke="var(--ink)" stroke-width="2.2"/>';
  const cur = isB() ? G.mult : G.premium;
  if(cur >= prices[0] && cur <= prices[prices.length-1]) s += '<circle cx="'+px(cur).toFixed(1)+'" cy="'+ey(G.entry).toFixed(1)+'" r="5" fill="var(--copper)" stroke="var(--card)" stroke-width="1.5"/>';
  HM_ENTRIES.forEach(e => { s += '<text x="'+(m.l-6)+'" y="'+(ey(e)+3.5)+'" font-size="10" fill="var(--cap)" text-anchor="end">'+e+'</text>'; });
  prices.forEach((p,j) => { if(j%2===0) s += '<text x="'+px(p).toFixed(1)+'" y="'+(m.t+ch*HM_ENTRIES.length+14)+'" font-size="10" fill="var(--cap)" text-anchor="middle">'+(isB()?p+'x':p+'%')+'</text>'; });
  s += '<text x="'+(m.l+(W-m.l-m.r)/2)+'" y="'+(Hh-6)+'" font-size="12" fill="var(--ink)" text-anchor="middle">'+(isB()?'Multiple of next-year operating cash':'Premium over build cost')+'</text>';
  s += '<text transform="translate(12 '+(m.t+ch*HM_ENTRIES.length/2)+') rotate(-90)" font-size="12" fill="var(--ink)" text-anchor="middle">Entry year</text>';
  s += '</svg>';
  $('heat').innerHTML = s;
  $('heatTitle').firstChild.textContent = 'When you enter and what you pay: ' + L.name;
}

/* ---------- exposure ---------- */
function expoTable(){
  const tot = layers.reduce((a,L)=>a+L.alloc,0);
  if(tot<=0){ $('expo').innerHTML = '<tbody><tr><td class="l">Enter an allocation above to see exposure.</td></tr></tbody>'; $('expoNote').textContent=''; return; }
  const w = layers.map(L => L.alloc/tot);
  const failAll = layers.map(() => true);
  let h = '<thead><tr><th class="l">Scenario</th><th>Allocation in layers where capital does not earn its cost</th><th>Allocation in layers with a fragility flag</th><th class="l">Layers that fail</th></tr></thead><tbody>';
  Object.keys(SCEN).forEach(k => {
    const g = Object.assign({}, G, SCEN[k]);
    const rs = runAll(g);
    let f=0, fr=0; const names=[];
    rs.forEach((o,i) => { if(!o.pays){ f+=w[i]; names.push(layers[i].name); } else failAll[i]=false; if(o.flags.length) fr+=w[i]; });
    h += '<tr><td>'+SCEN_NAMES[k]+'</td><td>'+pct(f*100)+'</td><td>'+pct(fr*100)+'</td><td class="l" style="white-space:normal">'+(names.length?names.join(', '):'None')+'</td></tr>';
  });
  h += '</tbody>';
  $('expo').innerHTML = h;
  const cur = runAll(G);
  const gateFail = cur.reduce((a,o,i) => a + (o.merit ? 0 : w[i]), 0);
  const biggest = layers.reduce((b,L,i) => w[i]>w[b] ? i : b, 0);
  const always = layers.filter((L,i) => failAll[i]).map(L => L.name);
  $('expoNote').innerHTML = 'Scenario rows use your other settings, including entry year and price, and change only adoption speed and midpoint. '
    + (always.length ? '<b>Fails in all three:</b> '+always.join(', ')+'. ' : 'No layer fails in all three scenarios. ')
    + '<b>'+pct(gateFail*100)+'</b> of your allocation sits in layers below the evidence gate. Your largest single layer is '+layers[biggest].name+' at '+pct(w[biggest]*100)+'.';
}

/* ---------- render ---------- */
function renderResults(){
  const res = runAll(G);
  const s = layers.reduce((a,L)=>a+L.share,0);
  $('shareCheck').innerHTML = 'Shares add up to <b>'+s.toFixed(0)+'%</b> at the start' + (s>100.5 ? ' — above 100%, so layers together claim more than the whole pool.' : '.');
  renderKpis(); renderHiddenState(); lowShareNote();
  quadChart(res); scoreTable(res); updateScoreLite(res); fragilityPanel(); updateEffDrift(); updateMarginCells(false);
  if(caseCtx){ renderCaseBar(); updateChips(); renderWhatHappened(res); }
  $('detailTitle').textContent = 'Detail: ' + layers[sel].name;
  buildLayerPick();
  adoptChart(); cashChart(res[sel]); tornado(); heatChart(); expoTable();
}
// Verdict fragility panel: one row per layer listing the tested shocks that change its verdict. It folds in the two
// earlier notes: the summary lines keep "timing offset set to 0" (when any offset is set) and "build starts two
// years later" (always). The shock set is a display choice.
function fragilityPanel(){
  const fr = layers.map(L => verdictFragility(L, G));
  const names = (id) => layers.filter((L,i) => fr[i].results.some(r => r.id===id && r.flips)).map(L => L.name);
  const list = (a) => a.length ? a.join(', ') : 'none';
  let h = '<p style="margin:0 0 6px"><b>Verdict changes if the build starts two years later for: '+list(names('build-late'))+'.</b>';
  if(layers.some(L => L.offset!==0)) h += '<br><b>Verdict depends on the timing offset (set to 0) for: '+list(names('offset-zero'))+'.</b> Offsets are your judgement, not data.';
  h += '</p><div class="scroll"><table class="frag"><thead><tr><th class="l">Layer</th><th class="l">Verdict now</th><th>Present value</th><th>Flips under</th><th class="l">Shocks that change the verdict (direction, new verdict)</th></tr></thead><tbody>';
  fr.forEach((f,i) => {
    const L = layers[i];
    const split = f.n ? ': '+f.worse+' worse, '+f.better+' better'+(f.mixed ? ', '+f.mixed+' mixed' : '') : '';
    h += '<tr class="'+(i===sel?'sel':'')+'" data-i="'+i+'"><td>'+nameBtn(L,i)+'</td><td class="l"><span class="chip '+binClass(f)+'">'+f.bin+'</span></td>'
      + '<td class="'+(f.npv<0?'neg':'pos')+'">'+money(f.npv)+'</td>'
      + '<td class="frag-n">flips under '+f.n+' of '+f.m+' shocks'+split+'</td><td class="l" style="white-space:normal">'
      + (f.n ? f.flips.map(r => r.n+' <span class="muted">('+r.direction+': '+r.bin+')</span>').join('; ') : 'No tested shock changes the verdict')+'</td></tr>';
  });
  h += '</tbody></table></div>';
  $('fragility').innerHTML = h;
}
// Shown in any mode when a layer's share falls below the display threshold by year 15 at the current inputs.
function lowShareNote(){
  const low = lowShareLayers(layers, G), el = $('lowShare');
  el.hidden = !low.length;
  if(low.length) el.innerHTML = '<b>Share nearly gone by year 15:</b> '+low.map(x => x.L.name+' keeps '+pct(x.pct,1)+' of its starting share').join('; ')
    + '. Check that this much erosion is what you mean. The '+LOW_SHARE_PCT+'% line is a display threshold, not evidence.';
}
function renderDrivers(){ syncDriverLabels(); adoptChart(); }
function update(){ save(); renderDrivers(); renderResults(); }

function setProfile(p){
  const L = layers[sel];
  Object.assign(L, {life:p.life, debt:p.debt, buildYears:p.buildYears, evidence:p.evidence});
  L.driftP = ph(p.drift); L.marginP = ph(p.margin);
  refreshInputsFromState(); save(); renderResults();
}
function bind(){
  [['g_speed','speed'],['g_mid','mid'],['g_pool','pool'],['g_prem','premium'],['g_mult','mult'],['g_entry','entry'],['g_disc','disc'],['g_rd','rd'],['g_tv','tv'],['g_tvg','tvGrowth']].forEach(p => {
    $(p[0]).addEventListener('input', e => { G[p[1]] = parseFloat(e.target.value); keepGrowthGap(); update(); });
  });
  document.querySelectorAll('#tvSwitch button[data-t]').forEach(b => b.addEventListener('click', () => { G.tvMode = b.dataset.t; update(); }));
  document.querySelectorAll('#scen button').forEach(b => b.addEventListener('click', () => {
    const s = SCEN[b.dataset.s]; G.speed = s.speed; G.mid = s.mid; syncDriverInputs(); update();
  }));
  document.querySelectorAll('#defSwitch button[data-d]').forEach(b => b.addEventListener('click', () => { G.entryDef = b.dataset.d; update(); }));
  document.querySelectorAll('#capexSwitch button[data-c]').forEach(b => b.addEventListener('click', () => { G.capexModel = b.dataset.c; update(); }));
  // The example only has an effect in Vintage mode, so it switches that mode on.
  $('ucdExample').addEventListener('click', () => { layers.forEach((L,i) => { L.unitCostDecline = UCD_EXAMPLE[i]; }); G.capexModel = 'vintage'; refreshInputsFromState(); update(); });
  $('ph1').addEventListener('change', onPhaseBounds); $('ph2').addEventListener('change', onPhaseBounds);
  $('arch_rail').addEventListener('click', () => setProfile({life:25, drift:-6, margin:35, debt:60, buildYears:5, evidence:4}));
  $('leadlag').addEventListener('click', () => { layers.forEach((L,i) => { L.offset = LEAD_LAG_EXAMPLE[i]; }); refreshInputsFromState(); save(); renderResults(); });
  document.addEventListener('click', e => { const t = e.target.closest('[data-sel]'); if(t) selectLayer(+t.dataset.sel); });
  $('quad').addEventListener('keydown', e => {
    const t = e.target.closest('[data-sel]');
    if(t && (e.key==='Enter' || e.key===' ')){ e.preventDefault(); selectLayer(+t.dataset.sel); const f = $('quad').querySelector('[data-sel="'+sel+'"]'); if(f) f.focus(); }
  });
  $('arch_app').addEventListener('click', () => setProfile({life:4, drift:0, margin:30, debt:0, buildYears:2, evidence:3}));
  $('reset').addEventListener('click', () => {
    if(caseCtx){ resetToCase(); return; }
    G = freshG(); layers = DEFAULT_LAYERS.map(copyLayer); sel = 1;
    syncDriverInputs(); buildInputs(); update();
  });
}
/* ---------- snapshots ---------- */
// Separate storage key from the settings. Snapshots keep allocations in this browser; exports leave them out unless
// the box is ticked. Every piece of user text is written with textContent or .value, never as HTML.
const SNAP_KEY = 'load-bearing-snapshots-v1';
let snapStore = { snapshots: [], draftKill: snapBlankKill() };
let snapOpen = -1;
function el(tag, props, kids){
  const e = document.createElement(tag);
  if(props) for(const k in props){ if(k==='text') e.textContent = props[k]; else if(k==='cls') e.className = props[k]; else e.setAttribute(k, props[k]); }
  (kids || []).forEach(c => { if(c !== null && c !== undefined) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function snapLoad(){
  let raw = null;
  try{ raw = localStorage.getItem(SNAP_KEY); }catch(e){ $('snapErr').textContent = 'This browser blocks local storage, so snapshots cannot be kept here.'; return; }
  if(!raw) return;
  try{
    const o = JSON.parse(raw);
    // Stored data goes through the strict check (fresh objects, whitelisted fields only).
    const list = o && Array.isArray(o.snapshots) ? o.snapshots.slice(0, SNAP_MAX_COUNT) : [];
    const r = snapReadStoredText(JSON.stringify({ snapshots: list }));
    if(r.ok) snapStore.snapshots = r.snapshots; else $('snapErr').textContent = 'Saved snapshots could not be read and were ignored: ' + r.error;
    if(Array.isArray(o.draftKill) && o.draftKill.length === layers.length) snapStore.draftKill = o.draftKill.map((k,i) => snapCleanKill(k, i));
  }catch(e){ $('snapErr').textContent = 'Saved snapshots could not be read and were ignored.'; }
}
function snapSaveStore(){
  try{ localStorage.setItem(SNAP_KEY, JSON.stringify(snapStore)); return true; }
  catch(e){ $('snapErr').textContent = 'This browser would not store the snapshots (storage full or blocked).'; return false; }
}
function snapCleanKill(k, i){
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  return { id: layers[i].id, text: str(k && k.text, 2000), metric: str(k && k.metric, 120),
    direction: ['above','below'].indexOf(k && k.direction) >= 0 ? k.direction : '',
    threshold: k && typeof k.threshold === 'number' && isFinite(k.threshold) ? k.threshold : null,
    reviewBy: k && /^\d{4}-\d{2}-\d{2}$/.test(k.reviewBy) ? k.reviewBy : '',
    status: '', answeredAt: '' }; // the draft is for the next snapshot, so it carries no answers
}
// Info note for the trigger columns (metric, direction, threshold), wired like every other info note.
let triggerTipN = 0;
function triggerTip(){
  const id = 'trigTip' + (++triggerTipN);
  return el('span', {cls:'tipwrap'}, [el('button', {cls:'info', type:'button', 'aria-label':'About: Trigger', 'aria-expanded':'false', 'aria-controls': id}, ['i']),
    el('span', {cls:'tip', role:'tooltip', id: id, text: 'Trigger: a metric, a direction (above or below) and a threshold that you will check yourself at the review-by date. Nothing is fetched. Leave blank to keep the criterion as text only.'})]);
}
function snapBuildKillTable(){
  const t = $('killTable'); t.textContent = '';
  t.appendChild(el('thead', null, [el('tr', null, ['Layer','What would make me revise this layer','Metric','Direction','Threshold','Review by'].map((h,i) => el('th', {cls: i<2 ? 'l' : ''}, i===2 ? [h, ' ', triggerTip()] : [h])))]));
  const tb = el('tbody');
  layers.forEach((L,i) => {
    const k = snapStore.draftKill[i];
    const inp = (type, field, attrs) => { const e = el('input', Object.assign({type, cls:'txt', 'aria-label': L.name+': '+field}, attrs||{})); e.value = k[field]===null ? '' : k[field]; e.addEventListener('input', () => snapDraft(i, field, e)); return e; };
    const dir = el('select', {cls:'txt', 'aria-label': L.name+': direction'}, [['','—'],['above','above'],['below','below']].map(o => { const op = el('option', {value:o[0]}, [o[1]]); return op; }));
    dir.value = k.direction; dir.addEventListener('change', () => snapDraft(i, 'direction', dir));
    tb.appendChild(el('tr', null, [el('td', {text: L.name}), el('td', {cls:'l'}, [inp('text','text',{maxlength:'2000'})]), el('td', null, [inp('text','metric',{maxlength:'120'})]),
      el('td', null, [dir]), el('td', null, [inp('number','threshold',{step:'any'})]), el('td', null, [inp('date','reviewBy')])]));
  });
  t.appendChild(tb);
}
function snapDraft(i, field, e){
  const k = snapStore.draftKill[i];
  if(field==='threshold'){ const v = parseFloat(e.value); k.threshold = isFinite(v) ? v : null; }
  else if(field==='reviewBy') k.reviewBy = /^\d{4}-\d{2}-\d{2}$/.test(e.value) ? e.value : '';
  else k[field] = String(e.value).slice(0, field==='metric' ? 120 : 2000);
  snapSaveStore();
}
const snapWhen = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(undefined, {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}); };
const snapStateOf = (k, today) => snapCriterionState(k, today, snapLaterSaved(k, snapStore.snapshots));
const snapCount = (s, today, state) => s.kill.filter(k => snapStateOf(k, today).state === state).length;
const snapShowDay = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}); };
function snapRenderList(){
  const t = $('snapList'); t.textContent = '';
  const list = snapStore.snapshots, today = snapTodayLocal();
  if(!list.length){ t.appendChild(el('tbody', null, [el('tr', null, [el('td', {cls:'l muted', text:'No snapshots yet.'})])])); }
  else {
    t.appendChild(el('thead', null, [el('tr', null, ['Name','Saved','Model version','Kill criteria',''].map((h,i) => el('th', {cls: i<2||i===3 ? 'l' : ''}, [h])))]));
    const tb = el('tbody');
    list.forEach((s,i) => {
      const set = s.kill.filter(k => k.text || k.metric || k.reviewBy).length, od = snapCount(s, today, 'overdue'), tr = snapCount(s, today, 'triggered');
      const crit = el('td', {cls:'l'}, [set ? set+' of '+s.kill.length+' layers' : 'none',
        tr ? el('span', {cls:'badge trig', text: 'triggered ('+tr+')'}) : null, od ? el('span', {cls:'badge', text: 'overdue ('+od+')'}) : null,
        s.response ? el('span', {cls:'badge resp', text: s.response.kind==='revised' ? 'triggered, revised' : 'triggered, kept view'}) : null]);
      const review = el('button', {'data-snap':'review', 'aria-expanded': String(snapOpen===i)}, [snapOpen===i ? 'Close' : 'Review']);
      review.addEventListener('click', () => { snapOpen = snapOpen===i ? -1 : i; snapRenderList(); });
      const del = el('button', {cls:'reset', 'data-snap':'delete'}, ['Delete']);
      del.addEventListener('click', () => snapDelete(i));
      const ld = el('button', {'data-snap':'load'}, ['Load into simulator']);
      ld.addEventListener('click', () => snapLoadInto(i));
      tb.appendChild(el('tr', null, [el('td', {cls:'l', text: s.name}), el('td', {cls:'l', text: snapWhen(s.created)}),
        el('td', {text: 'v'+s.modelVersion + (s.modelVersion!==MODEL_VERSION ? ' (current v'+MODEL_VERSION+')' : '')}), crit, el('td', null, [review, ' ', ld, ' ', del])]));
    });
    t.appendChild(tb);
  }
  snapRenderReview(); snapFillSelects();
}
function snapRenderReview(){
  const box = $('snapReview'); box.textContent = '';
  const s = snapStore.snapshots[snapOpen]; if(!s) return;
  const today = snapTodayLocal();
  box.appendChild(el('div', {cls:'snapbox'}, [el('h3', {text: 'Review: ' + s.name}), el('p', {cls:'muted', text: 'Saved ' + snapWhen(s.created) + ' under model version ' + s.modelVersion + '.'}),
    el('p', {cls:'pre', text: s.note || '(no note)'}),
    s.response ? el('p', {cls:'pre', text: (s.response.kind==='revised' ? 'Response to triggers: revised. Changed inputs: ' + (s.response.changedInputs.length ? s.response.changedInputs.map(d => snapLabel(d.path) + ' ' + snapFmt(d.before) + ' → ' + snapFmt(d.after)).join('; ') : 'none') : 'Response to triggers: kept my view. Reason: ' + s.response.reason)}) : null]));
  const t = el('table', {'aria-label':'Kill criteria for this snapshot'});
  t.appendChild(el('thead', null, [el('tr', null, ['Layer','What would make me revise it','Trigger','Review by','Met?','State'].map((h,i) => el('th', {cls: i<3||i===5 ? 'l' : ''}, i===2 ? [h, ' ', triggerTip()] : [h])))]));
  const tb = el('tbody');
  s.kill.forEach((k,i) => {
    const trig = k.metric ? k.metric + (k.direction ? ' ' + k.direction + ' ' : ' ') + (k.threshold===null ? '' : k.threshold) : '—';
    const st = el('select', {cls:'txt', 'aria-label': layers[i].name+': criterion met?'}, [['','not reviewed'],['yes','yes'],['no','no'],['unknown','unknown']].map(o => el('option', {value:o[0]}, [o[1]])));
    st.value = k.status;
    // Answering records the date and time (ISO UTC); clearing the answer clears the date.
    st.addEventListener('change', () => { k.status = st.value; k.answeredAt = st.value ? new Date().toISOString() : ''; snapSaveStore(); snapRenderList(); });
    const cs = snapStateOf(k, today), stateCell = el('td', {cls:'l'});
    if(cs.state==='triggered') stateCell.appendChild(el('span', {cls:'badge trig', text:'Triggered: revise this layer'}));
    if(cs.state==='resolved') stateCell.appendChild(el('span', {cls:'muted', text:'Triggered on ' + snapShowDay(k.answeredAt) + '; a later snapshot has been saved.'}));
    if(cs.state==='overdue') stateCell.appendChild(el('span', {cls:'badge', text:'overdue'}));
    if(k.status==='no'){
      stateCell.appendChild(el('span', {cls:'muted', text: 'Last reviewed on ' + snapShowDay(k.answeredAt) + '. Next review by (optional): '}));
      const nx = el('input', {type:'date', cls:'txt', 'aria-label': layers[i].name+': next review by'});
      nx.value = k.reviewBy > cs.answeredDay ? k.reviewBy : '';
      nx.addEventListener('change', () => { k.reviewBy = /^\d{4}-\d{2}-\d{2}$/.test(nx.value) ? nx.value : ''; snapSaveStore(); snapRenderList(); });
      stateCell.appendChild(nx);
    }
    if(k.status){
      const rs = el('button', {cls:'reset', 'data-snap':'reset-criterion'}, ['Reset']);
      rs.addEventListener('click', () => { k.status = ''; k.answeredAt = ''; snapSaveStore(); snapRenderList(); });
      stateCell.appendChild(document.createTextNode(' ')); stateCell.appendChild(rs);
    }
    tb.appendChild(el('tr', null, [el('td', {text: layers[i].name}), el('td', {cls:'l pre', text: k.text || '—'}), el('td', {cls:'l', text: trig}),
      el('td', {text: k.reviewBy || '—'}), el('td', null, [st]), stateCell]));
  });
  t.appendChild(tb);
  box.firstChild.appendChild(el('div', {cls:'scroll'}, [t]));
}
function snapFillSelects(){
  ['cmpA','cmpB'].forEach((id, j) => {
    const sel = $(id), prev = sel.value; sel.textContent = '';
    sel.appendChild(el('option', {value:'current'}, ['Current settings']));
    snapStore.snapshots.forEach((s,i) => sel.appendChild(el('option', {value:String(i)}, [s.name + ' (' + snapWhen(s.created) + ')'])));
    const n = snapStore.snapshots.length;
    sel.value = [...sel.options].some(o => o.value===prev) ? prev : (j===0 ? (n ? String(n-1) : 'current') : 'current');
  });
}
function snapCurrent(){ return makeSnapshot({ name: 'Current settings', note: '', G: G, layers: layers, kill: snapStore.draftKill, caseId: caseCtx ? caseCtx.c.id : null }); }
function snapPick(v){ return v==='current' ? snapCurrent() : snapStore.snapshots[+v]; }
// Saving while criteria are triggered opens a prompt to record "revised" or "kept my view". Never blocks saving.
function snapSaveNew(){
  const name = $('snapName').value.trim();
  if(!name){ $('snapMsg').textContent = 'Give the snapshot a name first.'; $('snapName').focus(); return; }
  if(snapStore.snapshots.length >= SNAP_MAX_COUNT){ $('snapMsg').textContent = 'This browser holds at most ' + SNAP_MAX_COUNT + ' snapshots. Export and delete some first.'; return; }
  const trig = snapTriggeredList(snapStore.snapshots);
  if(trig.length){ snapShowRespond(trig); return; }
  snapCommitSave(null);
}
function snapRespKind(){ const r = document.querySelector('input[name="snapResp"]:checked'); return r ? r.value : ''; }
function snapShowRespond(trig){
  const names = (id) => (layers.find(L => L.id===id) || {name:id}).name;
  $('snapRespTrig').textContent = 'Triggered: ' + trig.map(t => names(t.layerId) + ' (in “' + t.name + '”)').join('; ') + '.';
  const from = snapStore.snapshots[trig[0].index];
  const diff = snapMakeResponse('revised', '', trig, from.inputs, snapInputs(G, layers)).changedInputs;
  $('snapRespDiff').textContent = diff.length ? 'Changed since “' + from.name + '”: ' + diff.map(d => snapLabel(d.path) + ' ' + snapFmt(d.before) + ' → ' + snapFmt(d.after)).join('; ') + '.' : 'No inputs have changed since “' + from.name + '”.';
  $('snapRespond').hidden = false;
}
function snapHideRespond(){ $('snapRespond').hidden = true; document.querySelectorAll('input[name="snapResp"]').forEach(r => { r.checked = false; }); $('snapRespReason').value = ''; }
function snapRespSave(){
  const kind = snapRespKind(), reason = $('snapRespReason').value.trim();
  if(!kind){ $('snapMsg').textContent = 'Choose “revised” or “kept my view”, or save without recording.'; return; }
  if(kind==='kept' && !reason){ $('snapMsg').textContent = '“Kept my view” needs a short reason.'; $('snapRespReason').focus(); return; }
  const trig = snapTriggeredList(snapStore.snapshots);
  snapCommitSave(trig.length ? snapMakeResponse(kind, reason, trig, snapStore.snapshots[trig[0].index].inputs, snapInputs(G, layers)) : null);
}
function snapCommitSave(response){
  const name = $('snapName').value.trim();
  snapHideRespond();
  snapStore.snapshots.push(makeSnapshot({ name: name, note: $('snapNote').value, G: G, layers: layers, kill: snapStore.draftKill, response: response, caseId: caseCtx ? caseCtx.c.id : null }));
  if(snapSaveStore()){ $('snapMsg').textContent = 'Saved “' + name.slice(0,120) + '”.'; $('snapName').value = ''; $('snapNote').value = ''; }
  else { snapStore.snapshots.pop(); $('snapMsg').textContent = 'Not saved: the browser refused to store more. Export and delete some snapshots, then try again.'; }
  snapRenderList();
}
// One-step undo for "Load into simulator": the settings, layers, selection and kill-criteria draft just before it.
let snapUndo = null;
function snapPageState(){ return { G: JSON.parse(JSON.stringify(G)), layers: layers.map(copyLayer), sel: sel, draftKill: snapStore.draftKill.map(k => Object.assign({}, k)), caseCtx: caseCtx }; }
function snapApplyState(st){
  if('caseCtx' in st) setCaseContext(st.caseCtx);
  G = Object.assign(freshG(), st.G); layers = st.layers.map(copyLayer);
  if(typeof st.sel === 'number') sel = st.sel;
  snapStore.draftKill = st.draftKill.map(k => Object.assign({}, k));
  syncDriverInputs(); buildInputs(); update(); snapBuildKillTable(); snapSaveStore();
}
function snapLoadInto(i){
  const s = snapStore.snapshots[i]; if(!s) return;
  const plan = snapPrepareLoad(s, layers);
  if(!plan.ok){ $('snapMsg').textContent = 'Not loaded: ' + plan.error; return; }
  const ask = 'Load “' + s.name + '” into the simulator? Your current settings will be replaced (you can undo once).'
    + (plan.warning ? '\n\n' + plan.warning : '') + (plan.hasAllocations ? '' : '\n\nThis snapshot has no allocations, so your current allocations stay.');
  // A snapshot of a case opens that case first; one of your own scenario leaves any open case.
  let ctx = null;
  if(plan.caseId){
    const c = CASES.find(x => x.id === plan.caseId);
    if(!c){ $('snapMsg').textContent = 'Not loaded: this snapshot is from the case \u201c' + plan.caseId + '\u201d, which this page does not include.'; return; }
    if(c.layers.length !== plan.state.layers.length || c.layers.some((L, j) => L.id !== plan.state.layers[j].id)){ $('snapMsg').textContent = 'Not loaded: the case \u201c' + c.title + '\u201d has different layers now.'; return; }
    ctx = { c: c, versionId: 'base', st: caseState(c, 'base'), mine: caseCtx ? caseCtx.mine : snapMine() };
  }
  if(!window.confirm(ask)) return;
  snapUndo = snapPageState();
  snapApplyState(Object.assign({ sel: 0, caseCtx: ctx }, plan.state));
  if(!ctx && snapUndo.caseCtx) restoreMineDraft(snapUndo.caseCtx.mine);
  $('snapMsg').textContent = 'Loaded “' + s.name + '”. Results are recomputed from its inputs.' + (plan.warning ? ' ' + plan.warning : '');
  $('snapUndo').hidden = false;
}
function snapUndoLoad(){
  if(!snapUndo) return;
  snapApplyState(snapUndo); snapUndo = null;
  $('snapUndo').hidden = true;
  $('snapMsg').textContent = 'Load undone: your previous settings are back.';
}
function snapDelete(i){
  const s = snapStore.snapshots[i]; if(!s) return;
  if(!window.confirm('Delete the snapshot “' + s.name + '”? This cannot be undone.')) return;
  snapStore.snapshots.splice(i, 1);
  if(snapOpen===i) snapOpen = -1; else if(snapOpen>i) snapOpen--;
  snapSaveStore(); snapRenderList(); $('snapCompare').textContent = '';
}
function snapFmt(v){ return typeof v === 'number' ? String(Math.round(v*1000)/1000) : String(v); }
function snapRenderCompare(){
  const a = snapPick($('cmpA').value), b = snapPick($('cmpB').value), box = $('snapCompare');
  box.textContent = '';
  if(!a || !b) return;
  let c;
  try { c = compareSnapshots(a, b); } catch(e){ box.appendChild(el('p', {cls:'notice', text: e.message})); return; }
  const wrap = el('div', {cls:'snapbox'});
  wrap.appendChild(el('h3', {text: 'Before: ' + a.name + '   →   After: ' + b.name}));
  if(c.versionMismatch) wrap.appendChild(el('p', {cls:'notice', text: 'Model version differs (before v' + c.versions.before + ', after v' + c.versions.after + ', current v' + c.versions.current + '). Both sides are recomputed under the current model; the outputs stored at the time are shown alongside.'}));
  // Inputs that changed
  if(!c.inputs.length) wrap.appendChild(el('p', {text: 'No inputs changed.'}));
  else {
    const t = el('table', {'aria-label':'Changed inputs'});
    t.appendChild(el('thead', null, [el('tr', null, [el('th', {cls:'l', text:'Input that changed'}), el('th', {text:'Before'}), el('th', {text:'After'})])]));
    const tb = el('tbody');
    c.inputs.forEach(d => tb.appendChild(el('tr', null, [el('td', {cls:'l', text: snapLabel(d.path)}), el('td', {text: snapFmt(d.before)}), el('td', {text: snapFmt(d.after)})])));
    t.appendChild(tb); wrap.appendChild(el('div', {cls:'scroll'}, [t]));
  }
  // Verdicts, present value and fragility per layer
  const heads = ['Layer','Verdict before','Verdict after','Present value before','Present value after','Fragility before','Fragility after'].concat(c.versionMismatch ? ['Stored at the time (before → after)'] : []);
  const t = el('table', {'aria-label':'Verdicts before and after'});
  t.appendChild(el('thead', null, [el('tr', null, heads.map((h,i) => el('th', {cls: i<3||i===7 ? 'l' : '', text: h})))]));
  const tb = el('tbody');
  const frag = (f) => f.n + ' of ' + f.m + ' (' + f.worse + ' worse, ' + f.better + ' better' + (f.mixed ? ', ' + f.mixed + ' mixed' : '') + ')';
  c.layers.forEach(x => {
    const cells = [el('td', {text: x.name}), el('td', {cls:'l', text: x.before.bin}),
      el('td', {cls:'l'}, [x.after.bin, x.verdictChanged ? el('span', {cls:'badge', text:'changed'}) : null]),
      el('td', {text: money(x.before.npv)}), el('td', {text: money(x.after.npv) + ' (' + (x.npvChange>=0?'+':'') + money(x.npvChange) + ')'}),
      el('td', {text: frag(x.before.fragility)}), el('td', {text: frag(x.after.fragility)})];
    if(c.versionMismatch) cells.push(el('td', {cls:'l', text: money(x.storedBefore.npv) + ' ' + x.storedBefore.bin + ' → ' + money(x.storedAfter.npv) + ' ' + x.storedAfter.bin}));
    tb.appendChild(el('tr', null, cells));
  });
  t.appendChild(tb); wrap.appendChild(el('div', {cls:'scroll'}, [t]));
  const changed = c.layers.filter(x => x.verdictChanged).map(x => x.name);
  wrap.appendChild(el('p', {cls:'legend', text: changed.length ? 'Verdict changed for: ' + changed.join(', ') + '.' : 'No verdict changed.'}));
  box.appendChild(wrap);
}
function snapLabel(path){
  const m = /^layer (\w+)\.(.+)$/.exec(path);
  if(m){ const L = layers.find(x => x.id===m[1]); return (L ? L.name : m[1]) + ': ' + m[2]; }
  return path.replace(/^settings\./, 'Setting: ');
}
/* ---------- links ---------- */
// "Copy link" puts the current settings in the address (#s=...), never allocations or notes, and copies the address.
function copyLink(){
  const text = caseCtx ? makeLinkText(G, layers, { caseId: caseCtx.c.id, versionId: caseCtx.versionId, base: caseCtx.st }) : makeLinkText(G, layers);
  try{ history.replaceState(null, '', location.pathname + location.search + '#' + text); }catch(e){}
  const url = location.href, out = $('linkOut');
  out.value = url; out.hidden = false;
  const done = () => { $('linkMsg').textContent = 'Link copied. Anyone who has it can read these settings; your allocations are not in it.'; };
  const manual = () => { out.focus(); out.select(); $('linkMsg').textContent = 'The browser did not allow copying. The link is selected above: copy it yourself.'; };
  try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, manual); else manual(); }catch(e){ manual(); }
}
// The address keeps the view mode only, once a link has been read.
function clearLinkHash(){ try{ history.replaceState(null, '', location.pathname + location.search + '#' + mode); }catch(e){} }
function linkNotice(text){ const n = $('linkNotice'); n.textContent = text; n.hidden = !text; }
// Opening a link: strict checks first; then ask (in-page) before replacing anything. Your allocations stay.
function openLink(hash){
  if(!/^#s=/.test(hash || '')) return;
  const r = parseLinkText(hash);
  const fail = (msg) => { linkNotice('This link could not be opened: ' + msg); clearLinkHash(); };
  if(!r.ok) return fail(r.error);
  linkNotice('');
  if(r.kind === 'own'){
    const st = r.state;
    const same = !caseCtx && caseInputsOf(G, layers) === caseInputsOf(st.G, st.layers.map((L, i) => Object.assign({}, L, { name: layers[i].name })));
    if(same){ clearLinkHash(); return; }
    askConfirm({ title: 'Open link', ok: 'Open link', returnTo: $('behindBtn'),
      text: 'Open the settings in this link? Your current settings are replaced (undo once from Snapshots); your allocations stay.' + (r.modelVersion < MODEL_VERSION ? ' The link was made with an older model version, so results are recomputed.' : ''),
      onOk: () => {
        snapUndo = snapPageState();
        const mine = caseCtx ? caseCtx.mine : null;
        if(caseCtx) setCaseContext(null);
        const own = mine ? mine.layers : layers;
        G = Object.assign(freshG(), st.G);
        layers = st.layers.map((L, i) => Object.assign(copyLayer(L), { name: own[i].name, alloc: own[i].alloc }));
        if(mine) restoreMineDraft(mine);
        syncDriverInputs(); buildInputs(); update(); snapBuildKillTable();
        $('snapUndo').hidden = false; $('snapMsg').textContent = 'Opened the link. Undo restores your previous settings.';
      } });
    clearLinkHash();
    return;
  }
  const c = CASES.find(x => x.id === r.caseId);
  if(!c) return fail('it is for the case “' + r.caseId + '”, which this page does not include.');
  if(r.versionId !== 'base' && !c.versions.some(v => v.id === r.versionId)) return fail('the case “' + c.title + '” has no version “' + r.versionId + '”.');
  const st = caseState(c, r.versionId), a = linkApplyCase(r, st);
  if(!a.ok) return fail(a.error);
  askConfirm({ title: 'Open link', ok: 'Open link', returnTo: $('behindBtn'),
    text: 'Open the case “' + c.title + '” (as of ' + c.asOfDate + ') with the ' + Object.keys(r.diffs).length + ' change' + (Object.keys(r.diffs).length === 1 ? '' : 's') + ' in this link? Your current scenario is kept in memory; use “Return to my scenario” to get it back.',
    onOk: () => {
      openCase(c.id, r.versionId, { noConfirm: true });
      G = Object.assign(freshG(), a.state.G);
      layers = a.state.layers.map((L, i) => Object.assign(copyLayer(L), { alloc: layers[i].alloc }));
      syncDriverInputs(); buildInputs(); update();
    } });
  clearLinkHash();
}
function snapInit(){
  snapLoad(); snapBuildKillTable(); snapRenderList();
  $('snapSave').addEventListener('click', snapSaveNew);
  $('snapUndo').addEventListener('click', snapUndoLoad);
  $('snapRespSave').addEventListener('click', snapRespSave);
  $('snapRespSkip').addEventListener('click', () => snapCommitSave(null));
  $('snapRespCancel').addEventListener('click', snapHideRespond);
  $('cmpGo').addEventListener('click', snapRenderCompare);
  $('copyLink').addEventListener('click', copyLink);
}
/* ---------- view modes, KPI tiles, hidden state ---------- */
// Modes only change what is shown (CSS hides elements tagged data-min above the current mode). Every input stays in
// the page, so switching modes never changes an input or a result.
const MODE_KEY = 'load-bearing-mode';
let mode = 'basic';
function setMode(m, opts){
  if(MODES.indexOf(m) < 0) m = 'basic';
  mode = m;
  document.body.setAttribute('data-mode', m);
  document.querySelectorAll('[data-mode-btn]').forEach(b => b.setAttribute('aria-pressed', b.dataset.modeBtn===m ? 'true' : 'false'));
  if(!(opts && opts.noStore)){ try{ localStorage.setItem(MODE_KEY, m); }catch(e){} }
  if(!(opts && opts.noHash) && location.hash !== '#'+m){ try{ history.replaceState(null, '', '#'+m); }catch(e){ location.hash = m; } }
  renderHiddenState();
  if(typeof layersReady !== 'undefined' && layersReady){ adoptChart(); quadChart(runAll(G)); }
}
let layersReady = false;
function initialMode(){
  const fromHash = modeFromHash(location.hash);
  if(fromHash) return fromHash;
  try{ const st = localStorage.getItem(MODE_KEY); if(MODES.indexOf(st) >= 0) return st; }catch(e){}
  return 'basic';
}
function tile(id, big, sub, label, info, chip){
  const cls = chip==='Stable' ? 's-stable' : chip==='Watch' ? 's-watch' : chip==='Fragile' ? 's-fragile' : 's-none';
  return '<div class="tile" id="'+id+'"><div class="big">'+big+'</div><span class="status '+cls+'">'+chip+'</span>'
    + (sub ? '<div class="sub">'+sub+'</div>' : '')
    + '<div class="lab"><span>'+label+'</span><span class="tipwrap"><button class="info" type="button" aria-label="About: '+label+'" aria-expanded="false" aria-controls="'+id+'Tip">i</button><span class="tip" role="tooltip" id="'+id+'Tip">'+info+'</span></span></div></div>';
}
function esc(t){ return String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function renderKpis(){
  const k = kpiTiles(layers, G, caseBase());
  const t = k.tight;
  const tightBig = t ? (t.headroom>0?'+':'') + (t.unit==='x' ? mx(t.headroom) : pct(t.headroom)) : 'n/a';
  let allocBig = 'n/a', allocLabel = 'My allocation in layers below cost';
  if(k.alloc.pct !== null) allocBig = pct(k.alloc.pct);
  $('kpis').innerHTML =
    tile('kEarn', k.earn.n+' of '+k.earn.N, null, 'Layers that earn their cost',
      'Layers whose present value at your entry year is zero or more at your discount rate. Placeholder inputs; not a forecast.', k.earn.chip)
    + tile('kTight', tightBig, t ? esc(t.name) : 'no meaningful headroom', 'Tightest layer (lowest headroom)',
      'Headroom is the break-even '+(isB() ? 'multiple' : 'premium')+' minus what you pay. The lowest one is the layer closest to not earning its cost. The status uses the sign only: below zero is Fragile.', t ? t.chip : 'n/a')
    + tile('kAlloc', allocBig, k.alloc.placeholder ? 'placeholder equal split' : null, allocLabel,
      'Share of your allocation sitting in layers whose present value is below zero, that is, layers that do not earn their cost. '+(k.alloc.placeholder ? 'Your allocation is still the placeholder equal split; enter your own in the layer scorecard.' : 'Allocation is your own split, kept in this browser.'), k.alloc.chip)
    + tile('kFlips', k.flips.n+' of '+k.flips.N, null, 'Verdict flips under a tested shock',
      'Number of layers where at least one of the verdict-fragility shocks (timing, build start, drift, scale, discount rate, asset life, and in Vintage mode pass-through and decline) changes the verdict. The shocks are a display choice.', k.flips.chip);
}
// Shown in Basic and Advanced when any Analyst-only setting differs from its default.
function renderHiddenState(){
  const el = $('hiddenState'); if(!el) return;
  const diffs = analystDiffs(G, layers, caseBase());
  el.hidden = mode === 'analyst' || !diffs.length;
  if(el.hidden) return;
  $('hiddenText').textContent = diffs.length + ' advanced assumption' + (diffs.length===1 ? '' : 's') + ' active: ' + diffs.slice(0, 4).map(d => d.label).join('; ') + (diffs.length > 4 ? '; and ' + (diffs.length - 4) + ' more' : '') + '.';
}
function resetHidden(){
  const r = resetAnalyst(G, layers, caseBase());
  G = r.G; layers = r.layers;
  syncDriverInputs(); buildInputs(); update();
}
function bindModes(){
  document.querySelectorAll('[data-mode-btn]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.modeBtn)));
  window.addEventListener('hashchange', () => { if(/^#s=/.test(location.hash)){ openLink(location.hash); return; } const m = modeFromHash(location.hash); if(m && m !== mode) setMode(m, { noHash: true }); });
  $('hiddenGo').addEventListener('click', () => setMode('analyst'));
  $('hiddenReset').addEventListener('click', resetHidden);
  bindTips(); bindBehind();
}
/* Info tips: hover, keyboard focus or tap opens; Esc closes. A tapped tip stays open (aria-expanded) until tapped
   again, another tip opens, or Esc. Placement is collision-aware (placeTip): prefer below, flip left or up near an
   edge, clamp inside the viewport with an 8px margin. Tips are position: fixed, so cards never clip them. */
const tipOf = (b) => document.getElementById(b.getAttribute('aria-controls'));
function openTip(b){
  const t = tipOf(b); if(!t) return;
  t.classList.add('open');
  const a = b.getBoundingClientRect(), r = t.getBoundingClientRect();
  const p = placeTip({ left:a.left, top:a.top, right:a.right, bottom:a.bottom }, { width:r.width, height:r.height }, { width:window.innerWidth, height:window.innerHeight }, 8, 6);
  t.style.left = p.left + 'px'; t.style.top = p.top + 'px'; t.dataset.placement = p.placement;
}
function closeTip(b, force){
  if(!force && b.getAttribute('aria-expanded')==='true') return;
  const t = tipOf(b); if(t) t.classList.remove('open');
  if(force) b.setAttribute('aria-expanded', 'false');
}
function closeAllTips(except){ document.querySelectorAll('.tipwrap > button').forEach(x => { if(x !== except) closeTip(x, true); }); }
function bindTips(){
  document.addEventListener('mouseover', e => { const w = e.target.closest('.tipwrap'); if(w){ const b = w.querySelector(':scope > button'); if(b) openTip(b); } });
  document.addEventListener('mouseout', e => { const w = e.target.closest('.tipwrap'); if(w && !w.contains(e.relatedTarget)){ const b = w.querySelector(':scope > button'); if(b) closeTip(b); } });
  document.addEventListener('focusin', e => { const b = e.target.closest('.tipwrap > button'); if(b) openTip(b); });
  document.addEventListener('focusout', e => { const b = e.target.closest('.tipwrap > button'); if(b) closeTip(b); });
  document.addEventListener('click', e => {
    const b = e.target.closest('.tipwrap > button');
    closeAllTips(b);
    if(b){ const on = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', on ? 'true' : 'false'); if(on) openTip(b); else closeTip(b, true); }
  });
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeAllTips(null); });
  const reposition = () => document.querySelectorAll('.tipwrap > button').forEach(b => { const t = tipOf(b); if(t && t.classList.contains('open')) openTip(b); });
  window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition);
}
/* Dialogs ("Behind the tool", Cases, Sources): focus moves in, Tab is trapped inside, Esc or Close shuts it, and
   focus returns to whatever opened it. */
// MODALS maps each dialog to its close (or cancel) button, which also takes focus on opening.
const MODALS = { behindModal: 'behindClose', casesModal: 'casesClose', sourcesModal: 'sourcesClose', whModal: 'whClose', confirmModal: 'confirmCancel' };
let modalReturn = null, modalOpen = null;
// returnTo (optional): an element, or a function giving one, to focus on closing instead of the opener.
function openModal(id, returnTo){
  if(modalOpen) closeModal(true);
  modalReturn = returnTo || document.activeElement; modalOpen = id;
  $(id).hidden = false;
  $(MODALS[id]).focus();
}
function closeModal(keepFocus){
  if(!modalOpen) return;
  $(modalOpen).hidden = true; modalOpen = null;
  if(keepFocus) return;
  focusBack();
}
function focusBack(){
  let r = typeof modalReturn === 'function' ? modalReturn() : modalReturn;
  const shown = (e) => e.checkVisibility ? e.checkVisibility() : !e.closest('[hidden]');
  if(!(r && document.contains(r) && r !== document.body && shown(r))) r = $('behindBtn');
  r.focus(); modalReturn = null;
}
// In-page confirmation (replaces window.confirm for opening a case): OK runs onOk, Cancel or Esc does nothing.
let confirmAction = null;
function askConfirm(o){
  $('confirmTitle').textContent = o.title; $('confirmText').textContent = o.text; $('confirmOk').textContent = o.ok;
  confirmAction = o.onOk;
  openModal('confirmModal', o.returnTo);
}
const openBehind = () => openModal('behindModal'), closeBehind = () => closeModal();
function bindBehind(){
  $('behindBtn').addEventListener('click', openBehind);
  $('casesBtn').addEventListener('click', () => { renderCasesList(); openModal('casesModal'); });
  $('caseSources').addEventListener('click', () => { renderSources(); openModal('sourcesModal'); });
  $('caseWhat').addEventListener('click', () => { renderWhModal(); openModal('whModal'); });
  $('confirmOk').addEventListener('click', () => {
    const f = confirmAction; confirmAction = null;
    $('confirmModal').hidden = true; modalOpen = null;
    if(f) f();
    focusBack();
  });
  for(const id in MODALS){
    $(MODALS[id]).addEventListener('click', () => closeModal());
    $(id).addEventListener('click', e => { if(e.target === $(id)) closeModal(); });
  }
  document.addEventListener('keydown', e => {
    if(!modalOpen) return;
    const m = $(modalOpen);
    if(e.key==='Escape'){ e.preventDefault(); closeModal(); return; }
    if(e.key==='Tab'){
      const f = [...m.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled);
      if(!f.length) return;
      const first = f[0], last = f[f.length-1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      else if(!m.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    }
  });
}
// Input guide (in "Behind the tool"): meaning, where to look, recipe and hindsight trap for every input.
// Input guide (the "Input guide" tab): one table from guideRows(), grouped by section, with a search by input name
// and a "Case guidance" toggle for the as-of-date columns. On phones the CSS turns each row into a card.
const GUIDE_COLS = [['label', 'Input', 'k'], ['meaning', 'What it means'], ['range', 'Range and default', 'rg'], ['shownIn', 'Shown in'],
  ['where', 'Where to look at the as-of date', 'cg'], ['recipe', 'Recipe', 'cg'], ['trap', 'Hindsight trap', 'cg']];
// Text with `formulas` in backticks: formulas go in <code>, everything as text nodes (never HTML).
function guideText(t){
  const f = document.createDocumentFragment();
  String(t).split('`').forEach((part, i) => { if(part) f.appendChild(i % 2 ? el('code', {text: part}) : document.createTextNode(part)); });
  return f;
}
const guideLabel = (t) => t.replace('$B', moneyUnit);
function renderGuide(){
  const intro = $('guideIntro'); intro.textContent = '';
  GUIDE_INTRO.forEach(t => intro.appendChild(el('p', {cls:'legend', text: t})));
  const t = $('guideTable'); t.textContent = '';
  t.appendChild(el('thead', null, [el('tr', null, GUIDE_COLS.map(c => el('th', {scope:'col', cls: c[2] === 'cg' ? 'cg' : '', text: c[1]})))]));
  const tb = el('tbody');
  let group = null;
  guideRows().forEach(r => {
    if(r.group !== group){ group = r.group; tb.appendChild(el('tr', {cls:'grp', 'data-group': group}, [el('th', {colspan: String(GUIDE_COLS.length), scope:'colgroup', text: group})])); }
    tb.appendChild(el('tr', {'data-key': r.key, 'data-group': r.group, 'data-name': guideLabel(r.label).toLowerCase()}, GUIDE_COLS.map(c => {
      const td = el('td', {cls: c[2] || '', 'data-label': c[1]});
      td.appendChild(c[0] === 'label' ? document.createTextNode(guideLabel(r.label)) : guideText(r[c[0]]));
      return td;
    })));
  });
  tb.appendChild(el('tr', {cls:'none', hidden:''}, [el('td', {colspan: String(GUIDE_COLS.length), text: 'No input matches.'})]));
  t.appendChild(tb);
  guideFilter();
}
// Search filters rows by input name; group headers show only when a row in the group matches.
function guideFilter(){
  const q = $('guideSearch').value.trim().toLowerCase(), cg = $('guideCase').checked;
  let n = 0;
  const rows = [...document.querySelectorAll('#guideTable tbody tr[data-key]')];
  rows.forEach(tr => { const on = !q || tr.dataset.name.indexOf(q) >= 0; tr.hidden = !on; if(on) n++; });
  document.querySelectorAll('#guideTable tbody tr.grp').forEach(tr => { tr.hidden = !rows.some(x => !x.hidden && x.dataset.group === tr.dataset.group); });
  document.querySelector('#guideTable tr.none').hidden = n > 0;
  document.querySelectorAll('#guideTable .cg').forEach(c => { c.hidden = !cg; });
  $('guideCount').textContent = n + ' of ' + rows.length + ' inputs';
}
// Info icons on the sliders take their text from the guide (single source).
function fillGuideTips(){ document.querySelectorAll('.tip[data-guide]').forEach(t => { const g = GUIDE[t.dataset.guide]; t.textContent = g && g.tip ? g.tip : ''; }); }
// Tabs: click or arrow keys (Left, Right, Home, End) move between tabs; the selected tab is the only one in the Tab order.
function selectTab(tab, focus){
  const tabs = [...document.querySelectorAll('#behindModal [role="tab"]')];
  tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; $(t.getAttribute('aria-controls')).hidden = !on; });
  $('behindBody').scrollTop = 0;
  if(focus) tab.focus();
}
function bindTabs(){
  const tabs = [...document.querySelectorAll('#behindModal [role="tab"]')];
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t, true));
    t.addEventListener('keydown', e => {
      const k = e.key, n = tabs.length;
      const j = k === 'ArrowRight' ? (i + 1) % n : k === 'ArrowLeft' ? (i - 1 + n) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
      if(j < 0) return;
      e.preventDefault(); selectTab(tabs[j], true);
    });
  });
  $('guideSearch').addEventListener('input', guideFilter);
  $('guideCase').addEventListener('change', guideFilter);
}

/* ---------- case library ---------- */
// Cases are bundled at build time (CASES). Opening one keeps your own scenario in memory for "Return to my scenario"
// (one step), loads the case's inputs, shows its title, money unit and badge, and marks each input with its basis.
function caseBase(){ return caseCtx ? { G: caseCtx.st.G, layers: caseCtx.st.layers } : undefined; }
function snapMine(){ return { G: JSON.parse(JSON.stringify(G)), layers: layers.map(copyLayer), sel: sel, draftKill: snapStore.draftKill.map(k => Object.assign({}, k)) }; }
function restoreMineDraft(mine){ snapStore.draftKill = mine.draftKill.map(k => Object.assign({}, k)); snapBuildKillTable(); }
// Applies title, unit and page markers for a case context (or none); does not touch inputs.
function setCaseContext(ctx){
  caseCtx = ctx;
  moneyUnit = ctx ? ctx.c.moneyUnit : '$B';
  const name = ctx ? ctx.c.title : CASE_NAME;
  $('caseName').textContent = name; document.title = name + ': Load Bearing Simulator';
  // The subtitle is hidden in a case (CSS); the full title stays available when the name is cut with an ellipsis.
  document.querySelector('.tb-name').title = ctx ? name + ': Load Bearing Simulator' : '';
  document.body.classList.toggle('case-mode', !!ctx);
  if(!ctx && modalOpen === 'whModal') closeModal(true);
  renderGuide(); // labels carry the money unit
  $('caseBar').hidden = !ctx;
  $('whatHappened').hidden = !ctx;
  if(ctx) renderCaseBar();
}
// Asks first (in-page dialog) unless opts.noConfirm; opts.returnTo is where focus goes afterwards.
function openCase(id, versionId, opts){
  const c = CASES.find(x => x.id === id); if(!c) return false;
  const o = opts || {};
  const switching = caseCtx && caseCtx.c.id === id;
  if(!o.noConfirm){
    const label = versionId === 'base' ? 'Base' : (c.versions.find(v => v.id === versionId) || {}).label;
    askConfirm(switching
      ? { title: 'Switch version', ok: 'Switch version', returnTo: o.returnTo,
          text: 'Switch to the \u201c' + label + '\u201d version of this case?' + (caseModified() ? ' Your edits to the case will be replaced.' : ''),
          onOk: () => openCase(id, versionId, { noConfirm: true }) }
      : { title: 'Open case', ok: 'Open case', returnTo: o.returnTo,
          text: 'Open the case \u201c' + c.title + '\u201d (as of ' + c.asOfDate + ')? Your current scenario is kept in memory; use \u201cReturn to my scenario\u201d to get it back.',
          onOk: () => openCase(id, versionId, { noConfirm: true }) });
    return false;
  }
  const mine = caseCtx ? caseCtx.mine : snapMine();
  const st = caseState(c, versionId || 'base');
  setCaseContext({ c: c, versionId: st.versionId, st: st, mine: mine });
  G = Object.assign(freshG(), JSON.parse(JSON.stringify(st.G))); layers = st.layers.map(copyLayer); sel = 0;
  if(!switching) snapStore.draftKill = snapBlankKill(layers);
  syncDriverInputs(); buildInputs(); update(); snapBuildKillTable();
  return true;
}
function resetToCase(){ if(caseCtx) openCase(caseCtx.c.id, caseCtx.versionId, { noConfirm: true }); }
function returnToScenario(){
  if(!caseCtx) return;
  const mine = caseCtx.mine;
  setCaseContext(null);
  G = mine.G; layers = mine.layers.map(copyLayer); sel = mine.sel;
  restoreMineDraft(mine);
  syncDriverInputs(); buildInputs(); update();
}
// Inputs only (allocations are personal and not part of a case).
function caseInputsOf(g, ls){ const x = snapInputs(g, ls); x.layers.forEach(L => { delete L.alloc; }); return JSON.stringify(x); }
function caseModified(){ return !!caseCtx && caseInputsOf(G, layers) !== caseInputsOf(caseCtx.st.G, caseCtx.st.layers); }
function renderCaseBar(){
  if(!caseCtx) return;
  const c = caseCtx.c;
  $('caseBadgeText').textContent = c.title + ', as of ' + c.asOfDate;
  const tip = $('caseTip'); tip.textContent = '';
  [c.subtitle, 'As-of rule: ' + c.asOfRule, 'Hindsight: ' + c.hindsightDisclosure, 'Money in ' + c.moneyUnit + '.'].forEach(t => tip.appendChild(el('p', {text: t, style: 'margin:0 0 4px'})));
  const vb = $('caseVersions'); vb.textContent = '';
  if(c.versions.length){
    [{ id: 'base', label: 'Base' }].concat(c.versions).forEach(v => {
      const b = el('button', {type:'button', 'data-version': v.id, 'aria-pressed': String(v.id === caseCtx.versionId)}, [v.label]);
      b.addEventListener('click', () => { if(v.id !== caseCtx.versionId) openCase(c.id, v.id, { returnTo: () => document.querySelector('#caseVersions button[aria-pressed="true"]') }); });
      vb.appendChild(b);
    });
  }
  $('caseModified').hidden = !caseModified();
}
function renderCasesList(){
  const box = $('casesList'); box.textContent = '';
  const list = el('div', {cls:'caselist'});
  CASES.forEach(c => {
    const open = el('button', {type:'button', 'data-case': c.id}, [caseCtx && caseCtx.c.id === c.id ? 'Open again' : 'Open']);
    open.addEventListener('click', () => openCase(c.id, 'base', { returnTo: $('casesBtn') }));
    list.appendChild(el('div', {cls:'case'}, [el('div', null, [el('h3', {text: c.title}), el('p', {cls:'muted', text: 'As of ' + c.asOfDate + '. ' + c.subtitle, style:'margin:2px 0 0;font-size:13px'})]), open]));
  });
  box.appendChild(list);
}
function renderSources(){
  const t = $('sourcesTable'); t.textContent = '';
  if(!caseCtx) return;
  t.appendChild(el('thead', null, [el('tr', null, ['Id', 'Citation', 'Published', 'Kind', 'Series ends'].map((h,i) => el('th', {cls: i < 2 ? 'l' : '', text: h})))]));
  const tb = el('tbody');
  caseCtx.c.sources.forEach(s => tb.appendChild(el('tr', null, [el('td', {cls:'l', text: s.id}), el('td', {cls:'l', text: s.citation, style:'white-space:normal'}), el('td', {text: s.publicationDate}), el('td', {text: s.kind}), el('td', {text: s.seriesEndsOn || '\u2014'})])));
  t.appendChild(tb);
}
// Basis chips: each case input shows sourced (S), derived (D) or judgement (J); its tooltip shows the citations, the
// calculation or the rationale, and says when you have changed the value from the case.
const SLIDER_KEYS = { g_speed:'speed', g_mid:'mid', g_pool:'pool', g_prem:'premium', g_disc:'disc', g_entry:'entry', g_mult:'mult', g_rd:'rd', g_tv:'tv', g_tvg:'tvGrowth' };
const BASIS_LETTER = { sourced: 'S', derived: 'D', judgement: 'J' };
let chipN = 0;
function chipTargets(){
  const out = [];
  for(const id in SLIDER_KEYS){ const inp = $(id); if(inp) out.push({ key: 'settings.' + SLIDER_KEYS[id], host: inp.closest('.cctl').querySelector('.cctl-h output'), before: true, cur: () => G[SLIDER_KEYS[id]] }); }
  out.push({ key: 'settings.phase2Start', host: $('ph1'), cur: () => G.phases[0] }, { key: 'settings.phase3Start', host: $('ph2'), cur: () => G.phases[1] });
  document.querySelectorAll('#inputs input[data-k], #phaseTable input[data-k]').forEach(inp => {
    const k = inp.dataset.k, i = +inp.dataset.i, p = inp.dataset.p;
    if(k === 'alloc' || k === 'marginAll') return;
    const L = layers[i]; if(!L) return;
    out.push({ key: 'layer ' + L.id + '.' + k + (p === undefined ? '' : '[' + p + ']'), host: inp, cur: () => p === undefined ? layers[i][k] : layers[i][k][+p] });
  });
  return out;
}
function chipTip(rec, edited, cur){
  const cite = (ids) => ids.map(id => { const s = caseCtx.c.sources.find(x => x.id === id); return s ? s.citation + ' (' + s.publicationDate + ')' : id; });
  const parts = [];
  parts.push(rec.basis === 'sourced' ? 'Sourced.' : rec.basis === 'derived' ? 'Derived.' : 'Judgement.');
  if(rec.basis === 'derived') parts.push('Calculation: ' + rec.note);
  if(rec.basis === 'judgement') parts.push('Rationale: ' + rec.note);
  if(rec.basis === 'sourced' && rec.note) parts.push(rec.note);
  if(rec.sourceIds.length) parts.push('Sources: ' + cite(rec.sourceIds).join('; ') + '.');
  else parts.push('No source.');
  if(edited) parts.push('You changed this from the case value ' + rec.value + ' (now ' + cur + ').');
  return parts;
}
function renderChips(){
  document.querySelectorAll('.bchipwrap').forEach(e => e.remove());
  if(!caseCtx) return;
  chipTargets().forEach(t => {
    const rec = caseCtx.st.recs[t.key]; if(!rec || !t.host) return;
    const id = 'bc' + (++chipN);
    const b = el('button', {cls: 'bchip b-' + rec.basis, type: 'button', 'aria-expanded': 'false', 'aria-controls': id, 'data-key': t.key,
      'aria-label': 'Basis: ' + rec.basis + (rec.basis === 'judgement' ? ' (labelled judgement)' : '')}, [BASIS_LETTER[rec.basis]]);
    const tip = el('span', {cls: 'tip', role: 'tooltip', id: id});
    const w = el('span', {cls: 'tipwrap bchipwrap'}, [b, tip]);
    if(t.before) t.host.parentNode.insertBefore(w, t.host); else t.host.insertAdjacentElement('afterend', w);
  });
  updateChips();
}
function updateChips(){
  if(!caseCtx) return;
  const targets = chipTargets();
  document.querySelectorAll('.bchip').forEach(b => {
    const t = targets.find(x => x.key === b.dataset.key), rec = caseCtx.st.recs[b.dataset.key];
    if(!t || !rec) return;
    const cur = t.cur(), edited = cur !== rec.value;
    b.classList.toggle('edited', edited);
    const tip = document.getElementById(b.getAttribute('aria-controls')); tip.textContent = '';
    chipTip(rec, edited, cur).forEach(x => tip.appendChild(el('p', {text: x, style: 'margin:0 0 3px'})));
  });
}
// What happened: each layer's recorded outcome beside the model's verdict for the inputs on screen. No hit rate.
function renderWhatHappened(res){
  if(!caseCtx) return;
  const c = caseCtx.c, w = caseOutcomeRows(c, layers, res);
  $('whBanner').textContent = w.banner;
  $('whHindsight').textContent = 'Hindsight: ' + c.hindsightDisclosure;
  const t = $('outcomeTable'); t.textContent = '';
  t.appendChild(el('thead', null, [el('tr', null, ['Layer', 'Model verdict (inputs on screen)', 'Model: capital earns its cost?', 'What happened', 'Summary', 'Sources', 'Horizon'].map((h,i) => el('th', {cls: i===2 ? '' : 'l', text: h})))]));
  const tb = el('tbody');
  w.rows.forEach(r => {
    // Each source as "citation (date)", with the date kept on one line.
    const srcs = el('td', {cls:'l'});
    r.sourceIds.forEach((id, j) => { const s = c.sources.find(x => x.id === id); if(j) srcs.appendChild(document.createTextNode('; '));
      if(s){ srcs.appendChild(document.createTextNode(s.citation + ' (')); srcs.appendChild(el('span', {cls:'nowrap', text: s.publicationDate})); srcs.appendChild(document.createTextNode(')')); }
      else srcs.appendChild(document.createTextNode(id)); });
    if(!r.sourceIds.length) srcs.textContent = '\u2014';
    tb.appendChild(el('tr', null, [el('td', {cls:'l', text: r.layer}), el('td', {cls:'l', text: r.verdict}), el('td', {text: r.earnsCost ? 'yes' : 'no'}),
      el('td', {cls:'l', 'data-outcome': r.outcome || '', text: r.outcome || 'not recorded'}), el('td', {cls:'l', text: r.summary || '\u2014'}), srcs, el('td', {cls:'l', text: r.horizon || '\u2014'})]));
  });
  // Phones show each row as a card; every cell carries its column name.
  const heads = [...t.querySelectorAll('thead th')].map(h => h.textContent);
  tb.querySelectorAll('tr').forEach(tr => [...tr.children].forEach((td, i) => td.setAttribute('data-label', heads[i])));
  t.appendChild(tb);
  const k = w.counts;
  $('whCounts').textContent = 'Layers: ' + k.layers + '. Outcomes recorded: yes ' + k.yes + ', no ' + k.no + ', contested ' + k.contested + ', unknown ' + k.unknown + '; not recorded ' + k.none + '. Too few cases for statistical conclusions.';
  if(modalOpen === 'whModal') renderWhModal();
}
// The "What happened" dialog (any mode) shows a copy of the card's content, without its ids.
function renderWhModal(){
  const box = $('whModalBody'), copy = $('whBody').cloneNode(true);
  copy.removeAttribute('id'); copy.classList.remove('card');
  copy.querySelectorAll('[id]').forEach(e => { e.setAttribute('data-wh', e.id); e.removeAttribute('id'); });
  box.textContent = ''; box.appendChild(copy);
}
function bindCases(){
  $('casesBtn').hidden = !CASES.length;
  $('caseReturn').addEventListener('click', returnToScenario);
  $('caseReset').addEventListener('click', () => { if(!caseModified() || window.confirm('Reset every input to the case values? Your edits to the case will be lost.')) resetToCase(); });
}
function init(){
  $('caseName').textContent = CASE_NAME; document.title = CASE_NAME + ': Load Bearing Simulator';
  const linkHash = /^#s=/.test(location.hash) ? location.hash : ''; // read before the mode takes over the address
  setMode(initialMode(), { noStore: false, noHash: !!linkHash }); bindModes(); bindCases(); bindTabs(); fillGuideTips(); renderGuide();
  applyRanges(); load(); syncDriverInputs(); buildInputs(); bind(); renderDrivers(); renderResults(); snapInit();
  layersReady = true;
  if(linkHash) openLink(linkHash);
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { adoptChart(); quadChart(runAll(G)); }, 80); });
}
init();
