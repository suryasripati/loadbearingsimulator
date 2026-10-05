const KEY = 'load-bearing-sim-v3', V2_KEY = 'load-bearing-sim-v2', OLD_KEY = 'layer-sim-v1';
const copyLayer = (l) => Object.assign({}, l, {driftP:l.driftP.slice(), marginP:l.marginP.slice()});
const freshG = () => Object.assign({}, DEFAULT_G, {entryDef:DEFAULT_DEF, capexModel:DEFAULT_CAPEX, phases:DEFAULT_PHASES.slice()});
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
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({G:G, layers:layers, sel:sel})); }catch(e){} }

const $ = (id) => document.getElementById(id);
const money = (x) => (x<0?'\u2212':'') + '$' + Math.abs(x).toFixed(0) + 'B';
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
  $('o_pool').textContent = '$' + G.pool.toFixed(0) + 'B a year';
  $('o_prem').textContent = pct(G.premium);
  $('o_mult').textContent = mx(G.mult);
  $('o_entry').textContent = 'year ' + G.entry;
  $('o_disc').textContent = G.disc.toFixed(1) + '%';
  $('o_rd').textContent = G.rd.toFixed(1) + '%';
  $('o_tv').textContent = G.tv.toFixed(1) + 'x';
  const btns = document.querySelectorAll('#scen button');
  btns.forEach(b => { const s = SCEN[b.dataset.s]; b.setAttribute('aria-pressed', (s.speed===G.speed && s.mid===G.mid) ? 'true':'false'); });
  document.querySelectorAll('#defSwitch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.d===G.entryDef ? 'true':'false'));
  document.querySelectorAll('#capexSwitch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c===G.capexModel ? 'true':'false'));
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
const SLIDERS = {g_speed:'speed', g_mid:'mid', g_pool:'pool', g_prem:'premium', g_mult:'mult', g_entry:'entry', g_disc:'disc', g_rd:'rd', g_tv:'tv'};
function applyRanges(){
  for(const id in SLIDERS){ const r = GLOBAL_RANGES[SLIDERS[id]], e = $(id); e.min = r[0]; e.max = r[1]; e.step = r[2]; }
  ['ph1','ph2'].forEach((id,i) => { const r = PHASE_RANGES[i], e = $(id); e.min = r[0]; e.max = r[1]; e.step = r[2]; });
}
function syncDriverInputs(){
  $('g_speed').value = G.speed; $('g_mid').value = G.mid; $('g_pool').value = G.pool;
  $('g_prem').value = G.premium; $('g_mult').value = G.mult; $('g_entry').value = G.entry;
  $('g_disc').value = G.disc; $('g_rd').value = G.rd; $('g_tv').value = G.tv;
  $('ph1').value = G.phases[0]; $('ph2').value = G.phases[1];
}
// One dash pattern per layer (in DEFAULT_LAYERS order) so no layer line can be mistaken for the solid demand line.
const LAYER_DASH = ['8 3', '2 2', '8 3 2 3', '4 4', '12 2 2 2 2 2'];
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
function adoptChart(){
  const W=320, Hh=150, m={l:30,r:8,t:8,b:22};
  const iw=W-m.l-m.r, ih=Hh-m.t-m.b;
  const x = (t) => m.l + iw*t/H, y = (v) => m.t + ih*(1-v);
  const path = (f) => { let d=''; for(let t=0;t<=H;t+=0.25){ d += (t===0?'M':'L') + x(t).toFixed(1) + ' ' + y(f(t)).toFixed(1); } return d; };
  const desc = layers.map(L => L.name+': '+timingText(L)).join('; ');
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="100%" role="img" aria-label="Share of full adoption by year for end demand and each layer. '+desc+'.">';
  [0,0.5,1].forEach(v => { s += '<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--grid)" stroke-width="1"/><text x="'+(m.l-4)+'" y="'+(y(v)+3)+'" font-size="9" fill="var(--cap)" text-anchor="end">'+Math.round(v*100)+'%</text>'; });
  [0,5,10,15].forEach(t => { s += '<text x="'+x(t)+'" y="'+(Hh-6)+'" font-size="9" fill="var(--cap)" text-anchor="'+(t===0?'start':t===H?'end':'middle')+'">year '+t+'</text>'; });
  // Selected layer: a wide translucent band underneath, so it stays visible even when it coincides with demand.
  s += '<path class="halo" d="'+path(t => layerAdoption(t,layers[sel],G))+'" fill="none" stroke="var(--copper)" stroke-opacity="0.28" stroke-width="7" stroke-linecap="round"/>';
  layers.forEach((L,i) => {
    s += '<path class="layer" data-layer="'+L.id+'" d="'+path(t => layerAdoption(t,L,G))+'" fill="none" stroke="var(--ink)" stroke-width="'+(i===sel?2:1.1)+'" stroke-dasharray="'+LAYER_DASH[i % LAYER_DASH.length]+'"/>';
  });
  // End demand last, so a dashed layer line never hides it.
  s += '<path class="demand" d="'+path(t => adoption(t,G))+'" fill="none" stroke="var(--copper)" stroke-width="2.2"/>';
  s += '</svg>';
  const sw = (dash, col, w) => '<svg width="30" height="8" aria-hidden="true"><line x1="1" x2="29" y1="4" y2="4" stroke="'+col+'" stroke-width="'+w+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/></svg>';
  s += '<ul class="tlegend"><li>'+sw('', 'var(--copper)', 2.2)+'<span><b>End demand</b></span></li>';
  layers.forEach((L,i) => {
    s += '<li>'+sw(LAYER_DASH[i % LAYER_DASH.length], 'var(--ink)', i===sel?2:1.2)+'<span><button data-sel="'+i+'" aria-pressed="'+(i===sel)+'">'+L.name+'</button> <span class="muted">— '+timingText(L)+'</span></span></li>';
  });
  s += '</ul><div class="muted" style="font-size:12px;margin-top:4px">Share of full adoption by year. The highlighted band is the selected layer. A layer that is the same as end demand sits under the copper line.</div>';
  $('adoptChart').innerHTML = s;
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
function cellInput(L, i, c){
  return '<td><input type="number" data-i="'+i+'" data-k="'+c[0]+'"'+(c[5]===undefined?'':' data-p="'+c[5]+'"')+' min="'+c[2]+'" max="'+c[3]+'" step="'+c[4]+'" value="'+getV(L,c)+'" aria-label="'+L.name+': '+c[1]+(c[5]===undefined?'':', phase '+(c[5]+1))+'"></td>';
}
function phaseLabels(){
  const b = G.phases;
  return ['years 0–'+(b[0]-1), 'years '+b[0]+'–'+(b[1]-1), 'years '+b[1]+'–'+H];
}
function buildInputs(){
  let h = '<thead><tr><th class="l">Layer</th>' + COLS.map(c => '<th>'+c[1]+'</th>').join('') + '</tr></thead><tbody>';
  layers.forEach((L,i) => {
    h += '<tr class="'+(i===sel?'sel':'')+'" data-i="'+i+'"><td>'+nameBtn(L,i)+'</td>';
    COLS.forEach(c => { h += cellInput(L, i, c); });
    h += '</tr>';
  });
  h += '</tbody>';
  $('inputs').innerHTML = h;
  buildPhaseTable();
  document.querySelectorAll('#inputs input').forEach(inp => inp.addEventListener('input', onLayerInput));
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
  document.querySelectorAll('#inputs tbody tr, #phaseTable tbody tr, #fragility tbody tr').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i===sel));
  document.querySelectorAll('button[data-sel]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.sel===sel ? 'true' : 'false'));
}
function onLayerInput(e){
  const inp = e.target, i = +inp.dataset.i, k = inp.dataset.k, p = inp.dataset.p;
  const col = COLS.concat(PCOLS).find(c => c[0]===k);
  let v = parseFloat(inp.value);
  if(!isFinite(v)) return;
  v = clamp(v, col[2], col[3]);
  if(p===undefined) layers[i][k] = v; else layers[i][k][+p] = v;
  // Keep the build inside the horizon (the model clamps the same way); show the clamped value.
  if(k==='buildStart' || k==='buildYears'){
    const L = layers[i], bs = buildStartOf(L);
    if(bs !== L.buildStart){ L.buildStart = bs; const f = document.querySelector('#inputs input[data-i="'+i+'"][data-k="buildStart"]'); if(f) f.value = bs; }
  }
  save(); renderResults();
}
function refreshInputsFromState(){
  document.querySelectorAll('#inputs input, #phaseTable input').forEach(inp => {
    const L = layers[+inp.dataset.i]; inp.value = inp.dataset.p===undefined ? L[inp.dataset.k] : L[inp.dataset.k][+inp.dataset.p];
  });
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
function quadChart(res){
  const W=640, Hh=400, m={l:46,r:16,t:16,b:50};
  const iw=W-m.l-m.r, ih=Hh-m.t-m.b;
  const XMIN = isB() ? -20 : -200, XMAX = isB() ? 60 : 800;
  const sx = (v) => m.l + iw*(sq(clamp(v,XMIN,XMAX))-sq(XMIN))/(sq(XMAX)-sq(XMIN));
  const sy = (e) => m.t + ih*(1-(e-0.6)/(5.4-0.6));
  const x0 = sx(0), yg = sy(2.5);
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="100%" role="img" aria-label="Quadrant chart: demand evidence against headroom for each layer">';
  s += '<rect x="'+m.l+'" y="'+m.t+'" width="'+(x0-m.l)+'" height="'+(yg-m.t)+'" fill="var(--amber-bg)"/>';
  s += '<rect x="'+x0+'" y="'+m.t+'" width="'+(W-m.r-x0)+'" height="'+(yg-m.t)+'" fill="var(--green-bg)"/>';
  s += '<rect x="'+m.l+'" y="'+yg+'" width="'+(x0-m.l)+'" height="'+(m.t+ih-yg)+'" fill="var(--red-bg)"/>';
  s += '<rect x="'+x0+'" y="'+yg+'" width="'+(W-m.r-x0)+'" height="'+(m.t+ih-yg)+'" fill="var(--amber-bg)" opacity="0.6"/>';
  s += '<text x="'+(m.l+8)+'" y="'+(m.t+16)+'" font-size="12" fill="var(--amber)">Useful, capital does not earn its cost</text>';
  s += '<text x="'+(W-m.r-8)+'" y="'+(m.t+16)+'" font-size="12" fill="var(--green)" text-anchor="end">Durable or fragile value</text>';
  s += '<text x="'+(m.l+8)+'" y="'+(m.t+ih-8)+'" font-size="12" fill="var(--red)">Speculative</text>';
  s += '<text x="'+(W-m.r-8)+'" y="'+(m.t+ih-8)+'" font-size="12" fill="var(--amber)" text-anchor="end">Pays on assumptions, not evidence</text>';
  s += '<line x1="'+x0+'" x2="'+x0+'" y1="'+m.t+'" y2="'+(m.t+ih)+'" stroke="var(--ink)" stroke-width="1.2"/>';
  s += '<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+yg+'" y2="'+yg+'" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="4 3"/>';
  [1,2,3,4,5].forEach(e => { s += '<text x="'+(m.l-8)+'" y="'+(sy(e)+4)+'" font-size="11" fill="var(--cap)" text-anchor="end">'+e+'</text>'; });
  (isB() ? [-10,0,10,30,60] : [-100,0,100,300,600]).forEach(v => { s += '<text x="'+sx(v)+'" y="'+(m.t+ih+16)+'" font-size="11" fill="var(--cap)" text-anchor="middle">'+(v>0?'+':'')+v+(isB()?'x':'%')+'</text>'; });
  s += '<text x="'+(m.l+iw/2)+'" y="'+(Hh-8)+'" font-size="12" fill="var(--ink)" text-anchor="middle">'+(isB() ? 'Headroom: break-even multiple minus your multiple' : 'Headroom: break-even premium minus your entry premium')+'</text>';
  s += '<text transform="translate(12 '+(m.t+ih/2)+') rotate(-90)" font-size="12" fill="var(--ink)" text-anchor="middle">Demand evidence</text>';
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
    s += '<text class="qlab" x="'+lb.x.toFixed(1)+'" y="'+(lb.y + LAB_BASE).toFixed(1)+'" font-size="11.5" font-weight="700" fill="var(--ink)">'+d.L.name+'</text>';
    s += '</g>';
  });
  s += '</svg>';
  if(skipped.length) s += '<div class="legend">Not plotted: '+skipped.join(', ')+'. Year '+(G.entry+1)+' operating cash is close to zero, so a cash multiple is not meaningful.</div>';
  $('quad').innerHTML = s;
}

// Label placement: for each dot, try above, below, right and left; take the first spot that stays inside the plot and
// clears every placed label and every dot. Otherwise move further out in the same directions and draw a leader line.
const LAB_H = 15, LAB_BASE = 11; // label box height and baseline offset, in chart units (11.5px bold Arial)
let measureCtx = null;
function labelWidth(text){
  // Measure with a canvas in the same font; fall back to a generous per-character estimate.
  try{ if(!measureCtx){ measureCtx = document.createElement('canvas').getContext('2d'); measureCtx.font = 'bold 11.5px Arial, "Helvetica Neue", sans-serif'; } return measureCtx.measureText(text).width + 2; }
  catch(e){ return text.length * 7.2; }
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
      const up = d.cy - d.rr - dist - LAB_H, dn = d.cy + d.rr + dist, mid = d.cy - LAB_H/2;
      const xs = [d.cx - w/2, d.cx - w + 6, d.cx - 6];
      return [].concat(
        xs.map(x => clampBox({x:x, y:up, w:w, h:LAB_H})),
        xs.map(x => clampBox({x:x, y:dn, w:w, h:LAB_H})),
        [{x:d.cx + d.rr + dist, y:mid, w:w, h:LAB_H}, {x:d.cx - d.rr - dist - w, y:mid, w:w, h:LAB_H}]
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
      for(let y = box.y0; y + LAB_H <= box.y1; y += 6) for(let x = box.x0; x + w <= box.x1; x += 8){
        const c = {x:x, y:y, w:w, h:LAB_H};
        const dd = Math.hypot(x + w/2 - d.cx, y + LAB_H/2 - d.cy);
        if(dd < bestD && ok(c)){ best = c; bestD = dd; }
      }
      if(best){ pick = best; leader = true; }
    }
    // Last resort: stay inside the plot even if it overlaps, so a name is never clipped.
    if(!pick){ pick = clampBox({x:d.cx - w/2, y:d.cy - d.rr - g - LAB_H, w:w, h:LAB_H}); }
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
  let h = '<thead><tr><th class="l">Layer</th><th>Evidence gate</th><th>Present value at year '+G.entry+'</th><th>'+(isB()?'Break-even multiple':'Break-even premium')+'</th><th>Headroom</th><th>Return on cash (IRR)</th><th>Cash payback</th><th>Debt</th>'+(isV()?'<th>Value if owner keeps savings (pass-through 0)</th><th>Value if competition takes savings (pass-through 1)</th><th>Value at stake in pricing power</th><th>Peak stranded value, % of capex (not a cash item)</th>':'')+'<th>Flags</th><th class="l">Read</th></tr></thead><tbody>';
  res.forEach((o,i) => {
    const L = layers[i];
    const irr = isNaN(o.irr) ? (o.npv<0 ? 'below −50%' : 'n/a') : pct(o.irr*100,1);
    const pb = o.payback===null ? 'not by year '+H : 'year '+o.payback+' of a '+L.life+'-year asset';
    const debt = L.debt===0 ? 'None' : (o.flags.indexOf('debt')>=0 ? 'Short by '+money(o.shortfall) : 'Covered');
    const fl = o.flags.length ? o.flags.map(f => f==='life'?'Life':f==='debt'?'Debt':'Tail').join(', ') : 'None';
    h += '<tr class="'+(i===sel?'sel':'')+'"><td>'+nameBtn(L,i)+'</td>'
      + '<td><span class="chip '+(o.merit?'c-green':'c-amber')+'">'+(o.merit?'Pass':'Forecast bet')+'</span></td>'
      + '<td class="'+(o.npv<0?'neg':'pos')+'">'+money(o.npv)+'</td>'
      + '<td>'+beText(o)+'</td>'
      + hrText(o)
      + '<td>'+irr+'</td><td>'+pb+'</td><td>'+debt+'</td>'+(isV()?ptCells(L)+'<td>'+pct(o.strandedPeakPct)+'</td>':'')+'<td>'+fl+'</td>'
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
  s += '</svg><div class="legend">Line: cumulative cash from your entry year, $B. Bars: cash in each year, $B. The entry-year bar includes the price you pay.</div>';
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
  s += '<div class="legend">Centre line is today’s present value at year '+G.entry+' of '+money(base)+'. Red is the worse end of each move, green the better end.</div>';
  s += '<div class="legend"><b>Shock sizes:</b> '+rows.map(r => r.n+' '+r.lab).join('; ')+'. Drift moves in points, the offset in years and the premium in points; the others move by 25%, so bar lengths are not like-for-like. The build-start bar is one-sided: it moves the build two years later only, because a build cannot start before year 0.'+(isV()?' Unit-cost decline moves by \u00b13 points (a negative value means unit costs rise); pass-through by \u00b10.25, clamped to 0\u20131, so it can be one-sided at the ends.':'')+'</div>';
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
  $('heatTitle').textContent = 'When you enter and what you pay: ' + L.name;
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
  quadChart(res); scoreTable(res); fragilityPanel(); updateEffDrift(); lowShareNote();
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
  [['g_speed','speed'],['g_mid','mid'],['g_pool','pool'],['g_prem','premium'],['g_mult','mult'],['g_entry','entry'],['g_disc','disc'],['g_rd','rd'],['g_tv','tv']].forEach(p => {
    $(p[0]).addEventListener('input', e => { G[p[1]] = parseFloat(e.target.value); update(); });
  });
  document.querySelectorAll('#scen button').forEach(b => b.addEventListener('click', () => {
    const s = SCEN[b.dataset.s]; G.speed = s.speed; G.mid = s.mid; syncDriverInputs(); update();
  }));
  document.querySelectorAll('#defSwitch button').forEach(b => b.addEventListener('click', () => { G.entryDef = b.dataset.d; update(); }));
  document.querySelectorAll('#capexSwitch button').forEach(b => b.addEventListener('click', () => { G.capexModel = b.dataset.c; update(); }));
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
  try{ raw = localStorage.getItem(SNAP_KEY); }catch(e){ $('snapErr').textContent = 'This browser blocks local storage, so snapshots cannot be kept here. Export them to keep a copy.'; return; }
  if(!raw) return;
  try{
    const o = JSON.parse(raw);
    // Stored data goes through the same strict check as an import (fresh objects, whitelisted fields only).
    const list = o && Array.isArray(o.snapshots) ? o.snapshots.slice(0, SNAP_MAX_COUNT) : [];
    const r = importSnapshotsText(JSON.stringify({ format: SNAP_FORMAT, schemaVersion: SNAP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), includesAllocations: true, snapshots: list }));
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
function snapBuildKillTable(){
  const t = $('killTable'); t.textContent = '';
  t.appendChild(el('thead', null, [el('tr', null, ['Layer','What would make me revise this layer','Metric','Direction','Threshold','Review by'].map((h,i) => el('th', {cls: i<2 ? 'l' : ''}, [h])))]));
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
        tr ? el('span', {cls:'badge trig', text: 'triggered ('+tr+')'}) : null, od ? el('span', {cls:'badge', text: 'overdue ('+od+')'}) : null]);
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
    el('p', {cls:'pre', text: s.note || '(no note)'})]));
  const t = el('table', {'aria-label':'Kill criteria for this snapshot'});
  t.appendChild(el('thead', null, [el('tr', null, ['Layer','What would make me revise it','Trigger','Review by','Met?','State'].map((h,i) => el('th', {cls: i<3||i===5 ? 'l' : ''}, [h])))]));
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
function snapCurrent(){ return makeSnapshot({ name: 'Current settings', note: '', G: G, layers: layers, kill: snapStore.draftKill }); }
function snapPick(v){ return v==='current' ? snapCurrent() : snapStore.snapshots[+v]; }
function snapSaveNew(){
  const name = $('snapName').value.trim();
  if(!name){ $('snapMsg').textContent = 'Give the snapshot a name first.'; $('snapName').focus(); return; }
  if(snapStore.snapshots.length >= SNAP_MAX_COUNT){ $('snapMsg').textContent = 'This browser holds at most ' + SNAP_MAX_COUNT + ' snapshots. Export and delete some first.'; return; }
  snapStore.snapshots.push(makeSnapshot({ name: name, note: $('snapNote').value, G: G, layers: layers, kill: snapStore.draftKill }));
  if(snapSaveStore()){ $('snapMsg').textContent = 'Saved “' + name.slice(0,120) + '”.'; $('snapName').value = ''; $('snapNote').value = ''; }
  else { snapStore.snapshots.pop(); $('snapMsg').textContent = 'Not saved: the browser refused to store more. Export and delete some snapshots, then try again.'; }
  snapRenderList();
}
// One-step undo for "Load into simulator": the settings, layers, selection and kill-criteria draft just before it.
let snapUndo = null;
function snapPageState(){ return { G: JSON.parse(JSON.stringify(G)), layers: layers.map(copyLayer), sel: sel, draftKill: snapStore.draftKill.map(k => Object.assign({}, k)) }; }
function snapApplyState(st){
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
  if(!window.confirm(ask)) return;
  snapUndo = snapPageState();
  snapApplyState(Object.assign({ sel: sel }, plan.state));
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
  const c = compareSnapshots(a, b), wrap = el('div', {cls:'snapbox'});
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
function snapExport(){
  const include = $('expAlloc').checked;
  const text = exportSnapshotsText(snapStore.snapshots, { includeAllocations: include });
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'load-bearing-' + snapTodayLocal() + (include ? '-with-allocations' : '') + '.snapshot.json' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try{ URL.revokeObjectURL(url); }catch(e){} }, 1000);
  $('snapErr').textContent = 'Exported ' + snapStore.snapshots.length + ' snapshot' + (snapStore.snapshots.length===1?'':'s') + (include ? ', including allocations.' : ', without allocations.');
}
function snapImportFile(file){
  const err = $('snapErr');
  if(!file) return;
  if(file.size > SNAP_MAX_BYTES){ err.textContent = 'Import rejected: the file is larger than 1 MB.'; return Promise.resolve(); }
  return file.text().then(text => {
    const r = importSnapshotsText(text);
    if(!r.ok){ err.textContent = 'Import rejected: ' + r.error; return; }
    if(snapStore.snapshots.length + r.snapshots.length > SNAP_MAX_COUNT){ err.textContent = 'Import rejected: this browser holds at most ' + SNAP_MAX_COUNT + ' snapshots, and this file would take it to ' + (snapStore.snapshots.length + r.snapshots.length) + '.'; return; }
    const before = snapStore.snapshots;
    snapStore.snapshots = before.concat(r.snapshots);
    if(!snapSaveStore()){ snapStore.snapshots = before; err.textContent = 'Import not kept: the browser refused to store more. Export and delete some snapshots, then try again.'; return; }
    snapRenderList();
    err.textContent = 'Imported ' + r.snapshots.length + ' snapshot' + (r.snapshots.length===1?'':'s') + '.';
  }, () => { err.textContent = 'Import rejected: the file could not be read.'; });
}
function snapInit(){
  snapLoad(); snapBuildKillTable(); snapRenderList();
  $('snapSave').addEventListener('click', snapSaveNew);
  $('snapUndo').addEventListener('click', snapUndoLoad);
  $('cmpGo').addEventListener('click', snapRenderCompare);
  $('snapExport').addEventListener('click', snapExport);
  $('expAlloc').addEventListener('change', () => { $('expWarn').classList.toggle('strong', $('expAlloc').checked); });
  $('snapImport').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; snapImportFile(f); e.target.value = ''; });
}
function init(){
  applyRanges(); load(); syncDriverInputs(); buildInputs(); bind(); renderDrivers(); renderResults(); snapInit();
}
init();
