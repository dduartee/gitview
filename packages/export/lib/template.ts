// Template HTML embutido — gerado, não editado à mão.
//
// JS e CSS vivos que desenham a projeção. Não tem dependência de módulo: lê tudo de
// `window.__GRAPH__`. Por isso é dado puro e se move sem risco.
//
// espelhado por dentro: COL (packages/model/lib/color.ts). Se mudar a cor de uma
// categoria aqui, mude lá também. A lista de troncos NÃO é espelhada: vem em G.troncos.

export const TPL_DAG = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>gitview</title>
<style>
:root{--bg:#14161b;--panel:#1b1e25;--line:#2c3444;--fg:#d9dce3;--dim:#8a919c;--ok:#3fb950;--warn:#f0883e}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
header{padding:10px 16px;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:3}
h1{font-size:14px;margin:0}
.meta{color:var(--dim);font-size:12px;margin-top:2px}
#area{display:flex;height:62vh;border-bottom:1px solid var(--line)}
#dag{flex:1;min-width:0;overflow:hidden;cursor:grab;touch-action:none}
#dag:active{cursor:grabbing}
#colY{width:0;overflow:hidden;background:#10131a;border-left:1px solid var(--line);transition:width .15s ease}
#colY.on{width:270px;overflow-y:auto}
#colY .cy{padding:1px 10px;font-size:12px;white-space:nowrap;cursor:pointer;line-height:20px}
#colY .cy:hover{background:#1b1e25;color:#fff}
#dag:active{cursor:grabbing}
svg{display:block;width:100%;height:100%}
#ey text{transition:y .1s ease;cursor:pointer}
#ey text:hover{fill:#fff}
.seta{cursor:pointer;padding:0 4px;border-radius:4px;background:#232936;margin-right:4px;user-select:none}
.seta:hover{background:#3b465c}
.chk{display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;color:var(--dim)}
#faixa{padding:4px 16px;color:var(--dim);font-size:11px;border-top:1px solid var(--line);min-height:22px}
#scrollbar{height:14px;background:#10131a;border-top:1px solid var(--line);position:relative}
#thumb{position:absolute;top:2px;height:10px;background:#3b465c;border-radius:5px;min-width:24px}
.toolbar{padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:52px;z-index:2}
button{background:#232936;color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 12px;font:inherit;cursor:pointer}
button.on{background:#2b3550;border-color:#4c9ffe}
input[type=search]{background:#10131a;border:1px solid var(--line);color:var(--fg);border-radius:6px;padding:4px 8px;font:inherit;width:240px}
section.tab{display:none;padding:12px 16px 48px}
section.tab.on{display:block}
table{border-collapse:collapse;width:100%;margin:6px 0}
th,td{border:1px solid var(--line);padding:4px 8px;text-align:left;font-size:12px;white-space:nowrap}
th{background:var(--panel);color:#e4e7ec}
td.ok{color:var(--ok)}td.warn{color:var(--warn)}td.dim{color:var(--dim)}
tbody tr:hover{background:#1a1f2b}
.files{color:var(--dim);font-size:11px;margin:2px 0 8px 20px}
h3{font-size:13px;margin:14px 0 2px}
.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--dim);padding:6px 16px}
.sw{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:4px;vertical-align:-1px}
.m td,.m th{text-align:center}
.dim{color:var(--dim);font-size:11px}
</style>
</head>
<body>
<header>
<h1 id="t"></h1>
<div class="meta" id="m"></div>
<div class="meta" id="m2"></div>
</header>
<div id="area">
<div id="dag"><svg id="svg" xmlns="http://www.w3.org/2000/svg"><g id="world"><g id="ex"></g></g><g id="ey"></g></svg></div>
<div id="colY"></div>
</div>
<div id="scrollbar"><div id="thumb"></div></div>
<div class="toolbar">
<label class="chk"><input type="checkbox" id="tg-ey" checked> eixo Y auto</label>
<label class="chk" id="lbl-pin"><input type="checkbox" id="tg-pin" checked> pin tronco</label>
<label class="chk"><input type="checkbox" id="tg-hash" checked> hash</label>
<label class="chk"><input type="checkbox" id="tg-ghost" checked> fantasmas</label>
<label class="chk"><input type="checkbox" id="tg-merge" checked> merges</label>
<button id="b-refs" class="on">refs &amp; merge</button>
<button id="b-plan">plano de merge</button>
<button id="b-matrix">matriz de conflitos</button>
<button id="b-reset">reset</button>
<span id="cnt" class="dim"><span id="sc-up" class="seta">▲</span><span id="sc-dn" class="seta">▼</span><span id="cnt-n"></span></span>
<span id="cnt-f" class="dim"></span>
<span style="flex:1"></span>
<input type="search" id="f" placeholder="filtrar por nome de branch…">
</div>
<div id="faixa"></div>
<div class="legend" id="lg"></div>
<section id="t-refs" class="tab on"></section>
<section id="t-plan" class="tab"></section>
<section id="t-matrix" class="tab"></section>
<script>window.__GRAPH__ = null</script>
<script>
(function(){
var i, j;
var G = window.__GRAPH__;
if (!G || !G.commits || !G.commits.length) { document.getElementById('t').textContent = 'gitview — sem dados'; return }
var COL = {main:'#4c9ffe',hotfix:'#b5b9bd',release:'#86c64a',dev:'#ffbf5e',feature:'#d9757d',other:'#b79cf0'};
var NS = 'http://www.w3.org/2000/svg';
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function el(n, at){ var e = document.createElementNS(NS, n); for (var k in at) e.setAttribute(k, at[k]); return e }
document.getElementById('t').textContent = 'gitview — ' + G.repo;
document.getElementById('m').textContent = G.commits.length + ' commits · HEAD ' + G.head.slice(0,7) + ' · gerado ' + G.report.generated.slice(0,16).replace('T',' ') + ' · ' + (G.report.exact ? 'conflitos exatos (git merge-tree)' : 'estimativa por arquivos em comum (git < 2.38)');
var SRC = {flag:'--trunk', config:'.gitview.json', 'remote-head':'origin/HEAD', name:'convenção de nome'};
var lp = document.getElementById('lbl-pin');
if (lp && G.troncos && G.troncos.length) lp.appendChild(document.createTextNode(' (' + G.troncos.join(', ') + ' via ' + (SRC[G.troncosSource] || G.troncosSource) + ')'));
var lanes = G.lanes.filter(function(l){ return l.name || l.listLen });
var lane = {};
for (var i = 0; i < lanes.length; i++) lane[lanes[i].name || '#' + i] = true;
var lg = document.getElementById('lg');
for (var k in COL) lg.innerHTML += '<span><span class="sw" style="background:' + COL[k] + '"></span>' + k + '</span>';

// ── DAG em SVG: x = ordem do log, y = lane; nomes reais das branches ──
var ROW = 40, CW = 26, ML = 210, MT = 46;
var maxY = 0;
for (i = 0; i < lanes.length; i++) if (lanes[i].y > maxY) maxY = lanes[i].y;
var W = G.commits.length * CW + ML + 60, H = (maxY + 3) * ROW + MT + 20;
var svg = document.getElementById('svg'), world = document.getElementById('world'), ey = document.getElementById('ey');
var idx = {};
for (i = 0; i < G.commits.length; i++) idx[G.commits[i].hash] = i;
// identidade de lane sem nome: casa com refs pelo hash do tip (commit de indice x1)
function nomeCurto(rn) {                                       // refs/heads/x, refs/remotes/origin/x -> x
  if (rn.indexOf('refs/heads/') === 0) rn = rn.slice(11);
  else if (rn.indexOf('refs/remotes/') === 0) rn = rn.slice(13);
  if (rn.indexOf('origin/') === 0) rn = rn.slice(7);
  return rn;
}
var refPorHash = {};
var rf = G.refs || [];
for (i = 0; i < rf.length; i++) { if (rf[i].name.indexOf('refs/tags/') === 0) continue; refPorHash[rf[i].hash] = rf[i].name }
var laneEls = [];
var usados = {};
for (i = 0; i < lanes.length; i++) {
  var l0 = lanes[i];
  if (!l0.name && G.commits[l0.x1]) {
    var rn = refPorHash[G.commits[l0.x1].hash];
    if (rn) {
      var nm2 = nomeCurto(rn);
      while (usados[nm2]) nm2 += '~' + G.commits[l0.x1].hash.slice(0, 4);   // nunca dois nomes iguais
      usados[nm2] = 1; l0.name = nm2;
    }
  } else if (l0.name) usados[l0.name] = 1;
  laneEls.push({ nodes: [], edges: [], guide: null, label: null, eylabel: null });
}
var conflitos = {};
var brs = (G.report && G.report.branches) || [];
for (i = 0; i < brs.length; i++) conflitos[brs[i].name] = brs[i];
function chk(id){ return document.getElementById(id).checked }
function pastel(hex, f){                                   // cor dessaturada em direcao ao fundo (baixo contraste = inativa)
  var g = f || .3, a = parseInt(hex.slice(1), 16), b = 0x14161b;
  return '#' + [16, 8, 0].map(function (s) { return Math.round(((a >> s) & 255) * g + ((b >> s) & 255) * (1 - g)).toString(16).padStart(2, '0') }).join('');
}
function ativa(nome){ if (!nome) return false; var r = conflitos[nome]; return r ? (!r.merged && r.ahead > 0) : true }
function corLane(cat, nome){ var c = COL[cat] || '#9aa3b2'; return ativa(nome) ? c : pastel(c) }
// Troncos vêm do model (G.troncos), resolvidos por --trunk / .gitview.json /
// origin/HEAD / convenção de nome. Esta lista NÃO é repetida aqui de propósito: era
// duplicação que o TypeScript não conseguia verificar.
var TRONCO = G.troncos || [];
function laneY(li) { var l = lanes[li]; return l ? MT + l.y * ROW : MT }
for (i = 0; i < G.commits.length; i++) {
  var c = G.commits[i], x = ML + i * CW, y = laneY(G.laneOf[i]);
  var lo = G.laneOf[i] < 0 ? 0 : G.laneOf[i];
  for (var j = 0; j < c.parents.length; j++) {
    var p = idx[c.parents[j]]; if (p === undefined) continue;
    var px = ML + p * CW, py = laneY(G.laneOf[p]);
    var same = G.laneOf[i] === G.laneOf[p];
    var segundo = !same && j > 0 && c.parents.length > 1 && chk('tg-merge');
    var lp2 = lanes[G.laneOf[p] < 0 ? 0 : G.laneOf[p]];
    var col = same ? corLane(lanes[lo].cat, lanes[lo].name) : (segundo ? corLane(lp2.cat, lp2.name) : '#4a5262');
    var e;
    if (py === y) e = el('line', {x1:px, y1:py, x2:x, y2:y, stroke:col, 'stroke-width':same || segundo ? 2 : 1.4, 'stroke-dasharray':same?'':'3 3'});
    else e = el('polyline', {points:px+','+py+' '+x+','+py+' '+x+','+y, fill:'none', stroke:col, 'stroke-width':segundo ? 2 : 1.4, 'stroke-dasharray':'3 3'});
    world.appendChild(e);
    var rec = {e:e, a:G.laneOf[i], b:G.laneOf[p]};
    laneEls[lo].edges.push(rec); laneEls[G.laneOf[p] < 0 ? 0 : G.laneOf[p]].edges.push(rec);
  }
}
for (i = 0; i < G.commits.length; i++) {
  var c2 = G.commits[i], x2 = ML + i * CW, y2 = laneY(G.laneOf[i]);
  var lo2 = G.laneOf[i] < 0 ? 0 : G.laneOf[i];
  var ln = lanes[lo2], col2 = corLane(ln.cat, ln.name);
  var isHead = c2.hash === G.head;
  var merge = c2.parents.length > 1 && chk('tg-merge');
  var n = el('circle', {cx:x2, cy:y2, r:merge ? 8 : 4, fill:merge ? 'none' : col2, stroke:merge ? col2 : (isHead ? '#fff' : 'none'), 'stroke-width':merge ? 2.5 : (isHead ? 1.5 : 0)});
  var t = el('title');
  var txt = c2.hash.slice(0,7) + '  ' + c2.subject + '  [' + c2.author + ' · ' + c2.date.slice(0,16).replace('T',' ') + (c2.refs.length ? ' · ' + c2.refs.join(' | ') : '') + ']';
  if (merge) {
    txt += '  ||  MERGE de:';
    for (var mp = 0; mp < c2.parents.length; mp++) { var pl = lanes[G.laneOf[idx[c2.parents[mp]] < 0 ? 0 : (idx[c2.parents[mp]] || 0)]]; txt += '  ' + c2.parents[mp].slice(0, 7) + ' (' + (pl ? pl.name : '?') + ')' }
  }
  t.textContent = txt; n.appendChild(t); world.appendChild(n);
  laneEls[lo2].nodes.push(n);
  if (merge) {
    var mb = el('text', {x:x2 - 15, y:y2 - 15, fill:'#e3b341', 'font-size':9});
    mb.appendChild(document.createTextNode('merge')); world.appendChild(mb);
  }
  if (isHead) { var ht = el('text', {x:x2+8, y:y2-8, fill:'#fff', 'font-size':10}); ht.appendChild(document.createTextNode('HEAD')); world.appendChild(ht) }
}
// eixo X dinamico: so a faixa visivel, espacamento minimo de 130px (nunca sobrepoe)
function desenharEixoX(){
  var ex = document.getElementById('ex');
  while (ex.firstChild) ex.removeChild(ex.firstChild);
  var visW = dag.clientWidth / sc;
  var iMin = Math.max(0, Math.floor((-tx / sc - ML) / CW) - 1);
  var iMax = Math.min(G.commits.length - 1, Math.ceil((visW - tx / sc - ML) / CW) + 1);
  var span = Math.max(1, iMax - iMin);
  var fmt = span > 200 ? 0 : span > 25 ? 1 : 2;      // 0=ano  1=ano-mes  2=dia
  var ultimoX = -1e9;
  for (i = iMin; i <= iMax; i++) {
    var gx = ML + i * CW;
    if (gx - ultimoX < 130) continue;
    ultimoX = gx;
    ex.appendChild(el('line', {x1:gx, y1:MT - 8, x2:gx, y2:MT + (maxY + 2) * ROW + 6, stroke:'#262c38', 'stroke-width':1}));
    var d = G.commits[i].date;
    var tk = el('text', {x:gx + 4, y:MT - 14, fill:'#6b7280', 'font-size':10});
    tk.appendChild(document.createTextNode((fmt === 0 ? d.slice(0, 4) : fmt === 1 ? d.slice(0, 7) : d.slice(0, 10)) + '  ·' + i));
    ex.appendChild(tk);
  }
}
// tags no topo (marcadores amarelos, como no TUI)
for (i = 0; i < G.commits.length; i++) {
  var tg2 = [], rfs2 = G.commits[i].refs;
  for (j = 0; j < rfs2.length; j++) if (rfs2[j].slice(0, 5) === 'tag: ') tg2.push(rfs2[j].slice(5));
  if (!tg2.length) continue;
  var txx = ML + i * CW;
  world.appendChild(el('line', {x1:txx, y1:MT - 34, x2:txx, y2:MT - 8, stroke:'#3a4150', 'stroke-width':1, 'stroke-dasharray':'2 2'}));
  var tt2 = el('text', {x:txx + 4, y:MT - 38, fill:'#e3b341', 'font-size':10});
  tt2.appendChild(document.createTextNode(tg2.join(',')));
  world.appendChild(tt2);
}
// lanes: guia horizontal + nome no grafo + nome no EIXO Y fixo (fora do mundo, nao desloca no pan)
for (i = 0; i < lanes.length; i++) {
  var l = lanes[i]; if (!l.name && !l.listLen) continue;
  var lc2 = corLane(l.cat, l.name);
  var yl = laneY(i);
  var gu = el('line', {x1:ML - 6, y1:yl + ROW / 2, x2:ML + (l.x1 + 2) * CW, y2:yl + ROW / 2, stroke:lc2, 'stroke-width':1, opacity:.14});
  world.appendChild(gu); laneEls[i].guide = gu;
  var lab = el('text', {x:ML + (l.x1 + 1) * CW + 10, y:yl + ROW / 2 + 4, fill:lc2, 'font-size':12});
  var nmLab = l.name || ('(sem branch ' + (G.commits[l.x1] ? G.commits[l.x1].hash.slice(0, 3) : '?') + ')');
  lab.appendChild(document.createTextNode(nmLab.length > 30 ? nmLab.slice(0, 29) + '…' : nmLab));
  if (!ativa(nmLab)) { var li2 = el('tspan', {fill:'#5b6470', 'font-size':10}); li2.appendChild(document.createTextNode('  ·inativa')); lab.appendChild(li2) }
  var tipLab = G.commits[l.x1];
  if (tipLab && chk('tg-hash')) { var lh = el('tspan', {fill:'#8a919c', 'font-size':10}); lh.appendChild(document.createTextNode(' #' + tipLab.hash.slice(0, 7))); lab.appendChild(lh) }
  var cfL = conflitos[nmLab];
  if (cfL && !cfL.merged) { var ncl = (cfL.conflicts || cfL.overlap || []).length; if (ncl) { var lw = el('tspan', {fill:'#f0883e', 'font-size':10}); lw.appendChild(document.createTextNode('  ⚠' + ncl)); lab.appendChild(lw) } }
  var tl = el('title'); tl.textContent = (l.name || '(sem branch)') + ' (' + l.cat + ') · ' + l.listLen + ' commits' + (l.ghost ? ' · sem branch propria' : '') + (l.merged ? ' · ja fundida' : ''); lab.appendChild(tl);
  world.appendChild(lab); laneEls[i].label = lab;
  var nm = l.name || ('(sem branch ' + (G.commits[l.x1] ? G.commits[l.x1].hash.slice(0, 3) : '?') + ')');
  var pinL = chk('tg-pin') && !l.ghost && TRONCO.indexOf(l.name) >= 0;
  var hit = el('rect', {x:0, y:0, width:ML - 14, height:ROW, fill:'transparent', cursor:'pointer', 'data-lane':i});
  hit.setAttribute('data-y', yl + ROW / 2); hit.setAttribute('data-pin', pinL ? '1' : '0');
  var eyn = el('text', {x:10, y:0, fill:l.ghost ? '#8a919c' : lc2, 'font-size':12, cursor:'pointer', 'data-lane':i, 'paint-order':'stroke', stroke:'#14161b', 'stroke-width':3});
  eyn.setAttribute('data-y', yl + ROW / 2 + 4); eyn.setAttribute('data-pin', pinL ? '1' : '0');
  if (l.ghost) eyn.setAttribute('opacity', .55);
  eyn.appendChild(document.createTextNode(nm.length > 26 ? nm.slice(0, 25) + '…' : nm));
  var tipE = G.commits[l.x1];
  if (tipE && chk('tg-hash')) { var hh = el('tspan', {fill:'#6b7280', 'font-size':10}); hh.appendChild(document.createTextNode(' #' + tipE.hash.slice(0, 7))); eyn.appendChild(hh) }
  if (l.merged) { var ms = el('tspan', {fill:'#3fb950', 'font-size':10}); ms.appendChild(document.createTextNode(' ✓fundida')); eyn.appendChild(ms) }
  var cf = conflitos[nm];
  if (cf && !cf.merged) {
    var ncf = (cf.conflicts || cf.overlap || []).length;
    if (ncf) { var sp = el('tspan', {fill:'#f0883e', 'font-size':10}); sp.appendChild(document.createTextNode('  ⚠' + ncf)); eyn.appendChild(sp) }
  }
  var te = el('title'); te.textContent = nm + ' (' + l.cat + ') · ' + l.listLen + ' commits' + (l.ghost ? ' · sem branch propria' : '') + (l.merged ? ' · ja fundida' : '') + ' · clique = zoom na lane'; eyn.appendChild(te);
  hit.addEventListener('click', function (ev) { zoomLane(+ev.currentTarget.getAttribute('data-lane')) });
  eyn.addEventListener('click', function (ev) { zoomLane(+ev.currentTarget.getAttribute('data-lane')) });
  ey.appendChild(hit); ey.appendChild(eyn); laneEls[i].eylabel = eyn;
}
// fidelidade topologica auditavel no header
var pais = 0, arst = 0;
for (var pi = 0; pi < G.commits.length; pi++) { var pp2 = G.commits[pi].parents; pais += pp2.length; for (var pj = 0; pj < pp2.length; pj++) if (idx[pp2[pj]] !== undefined) arst++ }
document.getElementById('m2').textContent = 'pais ' + pais + ' · arestas ' + arst + (pais === arst ? ' · topologia fecha' : ' · ATENCAO: pais fora do log') + ' · lanes ' + lanes.length + ' · refs ' + (G.refs || []).length;
var sc = 1, tx = 16, ty = 8, drag = null, dag = document.getElementById('dag');
var headIdx = idx[G.head] !== undefined ? idx[G.head] : G.commits.length - 1;
function syncEY() {                                            // eixo Y: so visiveis; pinadas sempre; setas com contador
  var h = dag.clientHeight, acima = 0, abaixo = 0;
  var eyDyn = chk('tg-ey');
  var cs2 = ey.children;
  for (var k = 0; k < cs2.length; k++) {
    var nd = cs2[k], by = +nd.getAttribute('data-y');
    var yt = by * sc + ty;
    if (nd.tagName !== 'text') { nd.setAttribute('y', yt - 2); nd.setAttribute('height', ROW * sc); continue }
    nd.setAttribute('y', yt);
    if (!eyDyn) { nd.setAttribute('display', 'none'); continue }
    var dentro = yt > 6 && yt < h - 6;
    var pinE = nd.getAttribute('data-pin') === '1';
    if (dentro) nd.removeAttribute('display');
    else if (pinE) { nd.removeAttribute('display'); nd.setAttribute('y', Math.max(10, Math.min(h - 10, yt))) }
    else { nd.setAttribute('display', 'none'); if (yt <= 8) acima++; else abaixo++ }
  }
  var cn = document.getElementById('cnt-n');
  if (cn) cn.textContent = (acima ? ' ▲ +' + acima : '') + (abaixo ? ' ▼ +' + abaixo : '');
}
function irParaLane(dir){                                      // seta traz a proxima lane oculta
  var h = dag.clientHeight, alvo = null;
  var kids = ey.children;
  for (var k = 0; k < kids.length; k++) {
    var nd2 = kids[k];
    if (nd2.tagName !== 'text') continue;
    var yt2 = (+nd2.getAttribute('data-y')) * sc + ty;
    if (yt2 > 6 && yt2 < h - 6) continue;
    if (dir < 0 && yt2 <= 8 && (alvo === null || yt2 > alvo)) alvo = yt2;
    if (dir > 0 && yt2 >= h - 6 && (alvo === null || yt2 < alvo)) alvo = yt2;
  }
  if (alvo === null) return;
  ty += (dir < 0 ? 50 : h - 50) - alvo;
  aplicar();
}
function aplicar(){ world.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + sc + ')'); syncEY(); desenharEixoX(); atualizarScroll() }
function atualizarScroll(){                                    // barra inferior: posicao + largura proporcionais
  var thumb = document.getElementById('thumb'), bar = document.getElementById('scrollbar');
  if (!thumb || !bar || !bar.clientWidth) return;
  var mundoW = G.commits.length * CW, visW = dag.clientWidth / sc;
  var frac = Math.min(1, visW / mundoW);
  var ini = Math.max(0, Math.min(1, (-tx / sc) / mundoW));
  thumb.style.left = (ini * bar.clientWidth) + 'px';
  thumb.style.width = Math.max(24, frac * bar.clientWidth) + 'px';
}
var barScroll = document.getElementById('scrollbar');
if (barScroll) barScroll.addEventListener('pointerdown', function(ev){
  var r = this.getBoundingClientRect(); var f = (ev.clientX - r.left) / r.width;
  tx = -f * G.commits.length * CW * sc + dag.clientWidth / 2; aplicar();
});
function fitTo(ci, li) {                                       // centraliza num commit/lane
  var px = ML + ci * CW, py = laneY(li) + ROW / 2;
  sc = 1; tx = dag.clientWidth / 2 - px; ty = dag.clientHeight / 2 - py;
  aplicar();
}
function zoomLane(li) {                                        // clique no nome do eixo Y
  var l = lanes[li]; if (!l) return;
  var cx = ML + (l.x0 + l.x1) / 2 * CW, cy = laneY(li) + ROW / 2;
  var vw = dag.clientWidth, vh = dag.clientHeight;
  sc = Math.max(0.4, Math.min(3, Math.min(vw / Math.max(400, (l.x1 - l.x0) * CW + 300), vh / Math.max(300, (maxY + 1) * ROW + 80))));
  tx = vw / 2 - cx * sc; ty = vh / 2 - cy * sc;
  aplicar();
  if (history.replaceState) history.replaceState(null, '', '#lane=' + encodeURIComponent(l.name || '') + '&z=' + sc.toFixed(2));
}
var tinhaEstado = (function restaurar(){                        // estado da UI (interruptores + vista) em sessionStorage
  try {
    var sv = JSON.parse(sessionStorage.getItem('gitview-ui') || '{}');
    ['tg-ey','tg-pin','tg-hash','tg-ghost','tg-merge'].forEach(function(id7){ if (sv[id7] !== undefined) document.getElementById(id7).checked = sv[id7] });
    if (sv.tx !== undefined) { tx = sv.tx; ty = sv.ty; sc = sv.sc; return true }
  } catch (e2) {}
  return false
})();
if (!tinhaEstado) fitTo(headIdx, G.laneOf[headIdx]);             // S0: abre nos commits recentes (HEAD)
window.addEventListener('load', function(){                     // no load, hash manda; sem hash, HEAD
  var mh2 = /lane=([^&]+)/.exec(location.hash || '');
  if (mh2) { var w2 = decodeURIComponent(mh2[1]); for (var q2 = 0; q2 < lanes.length; q2++) if (lanes[q2].name === w2) { zoomLane(q2); return } }
  fitTo(headIdx, G.laneOf[headIdx])
});
dag.addEventListener('pointerdown', function(e){ drag = {x:e.clientX, y:e.clientY, tx:tx, ty:ty}; dag.setPointerCapture(e.pointerId) });
dag.addEventListener('pointermove', function(e){ if (!drag) return; tx = drag.tx + (e.clientX - drag.x); ty = drag.ty + (e.clientY - drag.y); aplicar() });
dag.addEventListener('pointerup', function(){ drag = null });
dag.addEventListener('wheel', function(e){ e.preventDefault(); var r = dag.getBoundingClientRect(); var mx = e.clientX - r.left, my = e.clientY - r.top; var k = e.deltaY < 0 ? 1.15 : 1/1.15; var ns = Math.max(.6, Math.min(4, sc * k)); tx = mx - (mx - tx) * ns / sc; ty = my - (my - ty) * ns / sc; sc = ns; aplicar() }, {passive:false});
dag.addEventListener('dblclick', function(){ fitTo(headIdx, G.laneOf[headIdx]) });
var bReset = document.getElementById('b-reset'); if (bReset) bReset.onclick = function(){ fitTo(headIdx, G.laneOf[headIdx]) };
document.addEventListener('keydown', function(ev){                 // zoom por teclado: + e -
  var f = (ev.key === '+' || ev.key === '=') ? 1.3 : (ev.key === '-' || ev.key === '_') ? 1 / 1.3 : 0;
  if (!f) return;
  var mx = dag.clientWidth / 2, my = dag.clientHeight / 2;
  var ns = Math.max(.6, Math.min(4, sc * f));
  tx = mx - (mx - tx) * ns / sc; ty = my - (my - ty) * ns / sc; sc = ns; aplicar();
});
(function () {                                                  // deep-link #lane=nome
  var mh = /lane=([^&]+)/.exec(location.hash || '');
  if (mh) { var want = decodeURIComponent(mh[1]); for (var q = 0; q < lanes.length; q++) if (lanes[q].name === want) { zoomLane(q); break } }
})();

// ── abas: refs · plano · matriz ──
var TABS = ['refs', 'plan', 'matrix'];
function tab(id){ TABS.forEach(function(k){ document.getElementById('t-' + k).classList.toggle('on', k === id); document.getElementById('b-' + k).classList.toggle('on', k === id) }) }
TABS.forEach(function(k){ document.getElementById('b-' + k).onclick = function(){ tab(k); aplicarFiltro(ultimoQ) } });
function cls(b){ return b.merged ? 'ok' : ((b.conflicts || b.overlap || []).length ? 'warn' : 'ok') }
var h = '<table><thead><tr><th>branch (nome real)</th><th>cat</th><th>+ahead/-behind</th><th>entra em</th><th>risco</th><th>estado</th></tr></thead><tbody>';
G.report.branches.forEach(function(b){
  h += '<tr><td>' + esc(b.name) + '</td><td>' + esc(b.cat) + '</td><td>+' + b.ahead + '/-' + b.behind + '</td><td>' + esc(b.into) + '</td><td class="' + cls(b) + '">' + esc(b.risk) + '</td><td>' + (b.merged ? 'mesclada' : 'aberta') + '</td></tr>';
});
h += '</tbody></table>';
var done = G.report.branches.filter(function(b){ return b.merged });
h += '<p class="dim">já integradas (' + done.length + '): ' + done.map(function(b){ return esc(b.name) }).join(', ') + '</p>';
var nomesRows = {};
G.report.branches.forEach(function (b) { nomesRows[b.name] = true });
var alvos = [];
var rf3 = G.refs || [];
for (var ri = 0; ri < rf3.length; ri++) {
  var nn = nomeCurto(rf3[ri].name);
  if (!nomesRows[nn] && alvos.indexOf(nn) < 0) alvos.push(nn);
}
if (alvos.length) h += '<p class="dim">alvos de merge (não mesclam em ninguém): ' + alvos.map(esc).join(', ') + '</p>';
document.getElementById('t-refs').innerHTML = h;

var hp = '';
if (!G.report.targets.length) hp = '<p class="dim">nenhum merge pendente.</p>';
G.report.targets.forEach(function(t){
  hp += '<h3>→ ' + esc(t.name) + ' <span class="dim">(' + t.steps.length + ' a mesclar, na ordem sugerida)</span></h3>';
  hp += '<table><thead><tr><th>#</th><th>branch</th><th></th><th>+/-</th><th>risco</th></tr></thead><tbody>';
  t.steps.forEach(function(s, i2){
    hp += '<tr><td>' + (i2 + 1) + '</td><td>' + esc(s.name) + '</td><td class="' + (s.clean ? 'ok' : 'warn') + '">' + (s.clean ? 'limpo' : s.conflicts.length + ' conflito(s)') + '</td><td>+' + s.ahead + '/-' + s.behind + '</td><td class="' + (s.risk === 'alto' ? 'warn' : 'ok') + '">' + esc(s.risk) + '</td></tr>';
    s.conflicts.slice(0, 8).forEach(function(f){ hp += '<tr><td></td><td colspan="4" class="files">' + esc(f) + '</td></tr>' });
    if (s.conflicts.length > 8) hp += '<tr><td></td><td colspan="4" class="files">… +' + (s.conflicts.length - 8) + '</td></tr>';
  });
  hp += '</tbody></table>';
});
document.getElementById('t-plan').innerHTML = hp;

var hm = '';
var MX = G.report.matrix;
if (!MX) hm = '<p class="dim">matriz indisponível: requer git ≥ 2.38 (merge-tree --write-tree).</p>';
else {
  hm = '<table class="m"><thead><tr><th></th>';
  MX.names.forEach(function(n2){ hm += '<th>' + esc(n2.length > 14 ? n2.slice(0, 13) + '…' : n2) + '</th>' });
  hm += '</tr></thead><tbody>';
  MX.names.forEach(function(n2, i2){
    hm += '<tr><th>' + esc(n2) + '</th>';
    MX.names.forEach(function(_, j2){
      if (i2 === j2) { hm += '<td class="dim">·</td>'; return }
      var cell = MX.cells[i2][j2] || [];
      hm += cell.length ? '<td class="warn" title="' + esc(cell.join(' · ')) + '">✗' + cell.length + '</td>' : '<td class="ok">✓</td>';
    });
    hm += '</tr>';
  });
  hm += '</tbody></table>';
  var abertas = 0;
  for (var ai = 0; ai < (G.report.branches || []).length; ai++) if (!G.report.branches[ai].merged) abertas++;
  if (abertas > MX.names.length) hm += '<p class="dim">matriz limitada as ' + MX.names.length + ' branches abertas mais recentes (de ' + abertas + ')</p>';
}
document.getElementById('t-matrix').innerHTML = hm;

// filtro compartilhado: DAG esmaece (nunca remove) + tabela visivel + contador
var ultimoQ = '';
function aplicarFiltro(q) {
  ultimoQ = q;
  var visLanes = 0;
  for (var li = 0; li < lanes.length; li++) {
    var nmL = lanes[li].name || '';
    var bate = !q || nmL.toLowerCase().indexOf(q) >= 0;
    if (bate && (nmL || lanes[li].listLen)) visLanes++;
    var L = laneEls[li];
    for (var a = 0; a < L.nodes.length; a++) L.nodes[a].setAttribute('opacity', bate ? 1 : 0.1);
    for (var b = 0; b < L.edges.length; b++) {
      var ed = L.edges[b], outra = ed.a === li ? ed.b : ed.a;
      var bOutra = !q || ((lanes[outra] && lanes[outra].name || '').toLowerCase().indexOf(q) >= 0);
      L.edges[b].e.setAttribute('opacity', (bate || bOutra) ? 1 : 0.06);
    }
    if (L.guide) L.guide.setAttribute('opacity', bate ? 0.14 : 0.02);
    if (L.label) L.label.setAttribute('opacity', bate ? 1 : 0.12);
    if (L.eylabel) L.eylabel.setAttribute('opacity', bate ? 1 : 0.2);
  }
  var cf2 = document.getElementById('cnt-f');
  if (cf2) cf2.textContent = q ? (visLanes + ' de ' + lanes.length + ' lanes') : (lanes.length + ' lanes');
  document.querySelectorAll('section.tab.on tbody tr').forEach(function (tr) {
    tr.style.display = (tr.textContent || '').toLowerCase().indexOf(q) >= 0 ? '' : 'none';
  });
}
document.getElementById('f').addEventListener('input', function (e) { aplicarFiltro(e.target.value.toLowerCase()) });
// faixa de fantasmas + interruptores + setas do eixo Y
function faixaGhost(){
  var nGhost = 0, cGhost = 0, q3;
  for (q3 = 0; q3 < lanes.length; q3++) if (lanes[q3].ghost) { nGhost++; cGhost += lanes[q3].listLen || 0 }
  document.getElementById('faixa').textContent = chk('tg-ghost') && nGhost ? (nGhost + ' lanes sem branch propria (' + cGhost + ' commits) — lados de merges de branches apagadas; ficam no grafo em cinza e saem do eixo Y quando fora da vista') : '';
}
faixaGhost();
function renderColY(){                                        // eixo fixo: coluna propria com scroll (todas as lanes)
  var colY = document.getElementById('colY');
  if (!colY) return;
  if (chk('tg-ey')) { colY.classList.remove('on'); colY.innerHTML = ''; return }
  colY.classList.add('on');
  var h = '';
  for (var li = 0; li < lanes.length; li++) {
    var l2 = lanes[li];
    if (!l2.name && !l2.listLen) continue;
    var nm2 = l2.name || ('(sem branch ' + (G.commits[l2.x1] ? G.commits[l2.x1].hash.slice(0, 3) : '?') + ')');
    var lc2 = COL[l2.cat] || '#b79cf0';
    h += '<div class="cy" data-lane="' + li + '" style="color:' + (l2.ghost ? '#8a919c' : lc2) + '">' + (nm2.length > 30 ? nm2.slice(0, 29) + '…' : nm2);
    if (G.commits[l2.x1]) h += ' <span style="color:#6b7280">#' + G.commits[l2.x1].hash.slice(0, 7) + '</span>';
    if (l2.merged) h += ' <span style="color:#3fb950">✓fundida</span>';
    h += '</div>';
  }
  colY.innerHTML = h;
  var rows = colY.querySelectorAll('.cy');
  for (var r = 0; r < rows.length; r++) rows[r].addEventListener('click', function (ev) { zoomLane(+ev.currentTarget.getAttribute('data-lane')) });
}
renderColY();
var su = document.getElementById('sc-up'), sd = document.getElementById('sc-dn');
if (su) su.onclick = function(){ irParaLane(-1) };
if (sd) sd.onclick = function(){ irParaLane(1) };
['tg-ey','tg-pin','tg-hash','tg-ghost','tg-merge'].forEach(function(id8){
  document.getElementById(id8).addEventListener('change', function(){
    var sv2 = {tx:tx, ty:ty, sc:sc};
    ['tg-ey','tg-pin','tg-hash','tg-ghost','tg-merge'].forEach(function(id9){ sv2[id9] = document.getElementById(id9).checked });
    sessionStorage.setItem('gitview-ui', JSON.stringify(sv2));
    location.reload();
  });
});
aplicarFiltro('');
})();
</script>
</body>
</html>`
