const KEY = 'load-bearing-sim-v3', V2_KEY = 'load-bearing-sim-v2', OLD_KEY = 'layer-sim-v1';
const copyLayer = (l) => Object.assign({}, l, {driftP:l.driftP.slice(), marginP:l.marginP.slice()});
let G = Object.assign({}, DEFAULT_G, {entryDef:DEFAULT_DEF, phases:DEFAULT_PHASES.slice()});
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
  $('ctl_prem').hidden = isB(); $('ctl_mult').hidden = !isB();
  $('defNote').innerHTML = isB()
    ? '<b>Forward cash multiple.</b> You pay the multiple times the layer’s operating cash in year '+(G.entry+1)+' (before sustaining spend), at year '+G.entry+'. Build capex from year '+G.entry+' on is paid at cost.'
    : '<b>Replacement-cost premium.</b> You pay build capex already spent before year '+G.entry+', marked up by the premium, at year '+G.entry+'. Build capex from then on is also paid at the premium. At entry year 0 this is the v0.1 model.';
}
function syncDriverInputs(){
  $('g_speed').value = G.speed; $('g_mid').value = G.mid; $('g_pool').value = G.pool;
  $('g_prem').value = G.premium; $('g_mult').value = G.mult; $('g_entry').value = G.entry;
  $('g_disc').value = G.disc; $('g_rd').value = G.rd; $('g_tv').value = G.tv;
  $('ph1').value = G.phases[0]; $('ph2').value = G.phases[1];
}
function adoptChart(){
  const W=300, Hh=96, m={l:26,r:8,t:8,b:20};
  const iw=W-m.l-m.r, ih=Hh-m.t-m.b;
  const x = (t) => m.l + iw*t/H, y = (v) => m.t + ih*(1-v);
  const path = (f) => { let d=''; for(let t=0;t<=H;t+=0.25){ d += (t===0?'M':'L') + x(t).toFixed(1) + ' ' + y(f(t)).toFixed(1); } return d; };
  const L = layers[sel];
  let s = '<svg viewBox="0 0 '+W+' '+Hh+'" width="100%" role="presentation">';
  [0,0.5,1].forEach(v => { s += '<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--grid)" stroke-width="1"/><text x="'+(m.l-4)+'" y="'+(y(v)+3)+'" font-size="9" fill="var(--cap)" text-anchor="end">'+Math.round(v*100)+'%</text>'; });
  [0,5,10,15].forEach(t => { s += '<text x="'+x(t)+'" y="'+(Hh-5)+'" font-size="9" fill="var(--cap)" text-anchor="middle">'+t+'</text>'; });
  s += '<path d="'+path(t => adoption(t,G))+'" fill="none" stroke="var(--copper)" stroke-width="2.2"/>';
  s += '<path d="'+path(t => layerAdoption(t,L,G))+'" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="4 3"/>';
  s += '</svg><div class="muted" style="font-size:12px;margin-top:2px">Share of full adoption by year. Solid: end demand. Dashed: '+L.name+' (offset '+(L.offset>0?'+':'')+L.offset+' years, steepness '+L.steepness+').</div>';
  $('adoptChart').innerHTML = s;
}

/* ---------- inputs tables ---------- */
// [key, label, min, max, step, phase index or undefined]
const COLS = [
  ['evidence','Demand evidence (1-5)',1,5,1],
  ['share','Share of pool, % at start',0,100,1],
  ['offset','Timing offset, years (− leads, + lags)',-5,5,0.5],
  ['steepness','Curve steepness (1 = same as demand)',0.25,4,0.25],
  ['capex','Build capex, $B',1,2000,5],
  ['buildStart','Build starts, year',0,H-1,1],
  ['buildYears','Build years',1,10,1],
  ['life','Asset life, years',1,40,1],
  ['debt','Debt, % of build',0,100,5],
  ['alloc','My allocation',0,1000,1]
];
const PCOLS = [0,1,2].map(p => ['driftP','Share drift, % a year',-20,20,0.5,p]).concat([0,1,2].map(p => ['marginP','Cash margin, %',0,90,1,p]));
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
  layers.forEach((L,i) => { h += '<tr class="'+(i===sel?'sel':'')+'" data-i="'+i+'"><td>'+nameBtn(L,i)+'</td>' + PCOLS.map(c => cellInput(L, i, c)).join('') + '</tr>'; });
  h += '</tbody>';
  $('phaseTable').innerHTML = h;
  $('phaseTable').querySelectorAll('input').forEach(inp => inp.addEventListener('input', onLayerInput));
}
function markSel(){
  document.querySelectorAll('#inputs tbody tr, #phaseTable tbody tr').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i===sel));
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
  a = clamp(a, 1, H-1); b = clamp(b, a+1, H);
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
function scoreTable(res){
  let h = '<thead><tr><th class="l">Layer</th><th>Evidence gate</th><th>Present value at year '+G.entry+'</th><th>'+(isB()?'Break-even multiple':'Break-even premium')+'</th><th>Headroom</th><th>Return on cash (IRR)</th><th>Cash payback</th><th>Debt</th><th>Flags</th><th class="l">Read</th></tr></thead><tbody>';
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
      + '<td>'+irr+'</td><td>'+pb+'</td><td>'+debt+'</td><td>'+fl+'</td>'
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
  s += '<div class="legend"><b>Shock sizes:</b> '+rows.map(r => r.n+' '+r.lab).join('; ')+'. Drift moves in points, the offset in years and the premium in points; the others move by 25%, so bar lengths are not like-for-like. The build-start bar is one-sided: it moves the build two years later only, because a build cannot start before year 0.</div>';
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
  quadChart(res); scoreTable(res); timingNote(res); buildNote();
  $('detailTitle').textContent = 'Detail: ' + layers[sel].name;
  buildLayerPick();
  adoptChart(); cashChart(res[sel]); tornado(); heatChart(); expoTable();
}
// Shown whenever any offset is non-zero: layers whose verdict changes when their own offset is set to 0.
function timingNote(res){
  const el = $('timingNote');
  if(layers.every(L => L.offset===0)){ el.hidden = true; return; }
  const dep = layers.filter((L,i) => runLayer(Object.assign({}, L, {offset:0}), G).bin !== res[i].bin).map(L => L.name);
  el.hidden = false;
  el.innerHTML = dep.length
    ? '<b>Verdict depends on the timing offset for: '+dep.join(', ')+'.</b> Set to 0, the verdict changes. Offsets are your judgement, not data.'
    : 'Timing offsets are set, but no layer’s verdict changes when its offset is set to 0.';
}
// Always visible: exposes the build-timing assumption (v0.1 fixed every build at year 0 without saying so).
function buildNote(){
  const dep = layers.filter(L => { const v = verdictIfBuildLater(L, G); return v.shifted > 0 && v.later !== v.now; }).map(L => L.name);
  $('buildNote').innerHTML = '<b>Verdict changes if the build starts two years later for: '+(dep.length ? dep.join(', ') : 'none')+'.</b> '
    + 'The two-year shift is a display choice, not evidence about typical delays. Build start is your judgement; the default is year 0.';
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
    G = Object.assign({}, DEFAULT_G, {entryDef:DEFAULT_DEF, phases:DEFAULT_PHASES.slice()}); layers = DEFAULT_LAYERS.map(copyLayer); sel = 1;
    syncDriverInputs(); buildInputs(); update();
  });
}
function init(){
  load(); syncDriverInputs(); buildInputs(); bind(); renderDrivers(); renderResults();
}
init();
