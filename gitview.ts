#!/usr/bin/env bun
// gitview.ts — grafo git por lanes no terminal (OpenTUI)
// uso: bun gitview.ts [caminho-do-repo]
import { createCliRenderer, Renderable, RGBA, type MouseEvent, type OptimizedBuffer, type RenderContext } from "@opentui/core"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { basename, resolve } from "node:path"

// ───────── dados ─────────
type Commit = { hash: string; parents: string[]; author: string; email: string; date: string; subject: string; refs: string[] }
const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const repo = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? process.cwd()
const run = (a: string[], env?: Record<string, string>) => {
  try { return { out: execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 1 << 29, stdio: ["ignore", "pipe", "pipe"], env: env ? { ...process.env, ...env } : process.env }) as string, code: 0 } }
  catch (e: any) { return { out: String(e.stdout ?? ""), code: Number(e.status ?? 1) } }
}
const git = (...a: string[]) => { const r = run(a); if (r.code) throw new Error(`git ${a[0]} falhou`); return r.out }

const VERSAO = "1.2"
if (args.includes("--help") || args.includes("-h")) {
  console.log(`gitview ${VERSAO} — grafo git por lanes no terminal (OpenTUI)

uso: gitview [repo] [opcoes]

opcoes:
  --export <file.html>    exporta grafico HTML auto-contido (DAG + refs + plano + matriz)
  --template <file.html>  usa template proprio; se nao existir, cai no embutido
  --main <branch>         branch principal do plano de merge (default: autodetect)
  --dev <branch>          branch de desenvolvimento (default: autodetect)
  --dump                  lista o modelo de lanes e sai (debug)
  --version               versao
  -h, --help              esta ajuda

teclas no TUI:
  clique / setas   selecionar commit      2x clique / Enter   ancestrais
  p                plano de merge          e                   exportar HTML
  q                sair

exemplos:
  gitview .
  gitview ~/Projects/meu-repo --export grafo.html
  gitview ~/Projects/meu-repo --dump`)
  process.exit(0)
}
if (args.includes("--version")) { console.log(`gitview ${VERSAO}`); process.exit(0) }
if (!existsSync(resolve(repo))) { console.error("caminho nao encontrado:", repo); process.exit(1) }
if (run(["rev-parse", "--is-inside-work-tree"]).code) { console.error("nao e repositorio git:", resolve(repo)); process.exit(1) }

const commits: Commit[] = git("log", "--all", "--date-order", "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1e")
  .split("\x1e").map(r => r.trim()).filter(Boolean).map(r => {
    const [hash, p, author, email, date, refs, subject] = r.split("\x1f")
    return { hash, parents: p ? p.split(" ") : [], author, email, date, subject, refs: refs ? refs.split(", ").filter(Boolean) : [] }
  })
if (!commits.length) { console.error("repositório sem commits"); process.exit(1) }
const headHash = git("rev-parse", "HEAD").trim()

// ───────── modelo: branch de cada commit + linhas ─────────
const DX = 4, RH = 3
const PRIO = ["main", "dev", "release", "hotfix", "feature", "other"]
const COL: Record<string, string> = { main: "#4c9ffe", hotfix: "#b5b9bd", release: "#86c64a", dev: "#ffbf5e", feature: "#d9757d", other: "#b79cf0" }
const catOf = (n: string) => { const s = n.toLowerCase()
  return /(^|\/)(main|master|prod|production)$/.test(s) ? "main" : /hotfix/.test(s) ? "hotfix" : /release/.test(s) ? "release"
    : /(^|\/)(feat|feature|topic|wip)/.test(s) ? "feature" : /dev|homolog|staging/.test(s) ? "dev" : "other" }

type Br = { name: string; label: string; cat: string; list: string[]; x0: number; x1: number; L: number; R: number; y: number; tipAt?: number }
const cs = [...commits].reverse()                                   // mais antigo primeiro
const N = cs.length
const byHash = new Map(cs.map(c => [c.hash, c]))
const idx = new Map(cs.map((c, i) => [c.hash, i]))
const kids = new Map<string, string[]>()
cs.forEach(c => c.parents.forEach(p => { if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(c.hash) }))

const loc = new Map<string, string>(), rem = new Map<string, string>()
commits.forEach(c => c.refs.forEach(r0 => {
  if (r0.startsWith("tag: ") || r0.startsWith("refs/")) return
  const r = r0.replace(/^HEAD -> /, "")
  if (r === "HEAD" || /\/HEAD$/.test(r)) return
  if (/^(origin|upstream)\//.test(r)) { const n = r.replace(/^[^/]+\//, ""); if (!rem.has(n)) rem.set(n, c.hash) } else loc.set(r, c.hash)
}))
rem.forEach((h, n) => { if (!loc.has(n)) loc.set(n, h) })

const owner = new Map<string, Br>(), br: Br[] = []
const mk = (name: string, cat: string) => { const b: Br = { name, label: name.length > 36 ? name.slice(0, 35) + "…" : name, cat, list: [], x0: 0, x1: 0, L: 0, R: 0, y: 0 }; br.push(b); return b }
const tips = [...loc].map(([n, h]) => ({ n, h, cat: catOf(n) }))
  .sort((a, b) => PRIO.indexOf(a.cat) - PRIO.indexOf(b.cat) || idx.get(b.h)! - idx.get(a.h)!)
for (const t of tips) {                                              // first-parent a partir de cada ponta
  const b = mk(t.n, t.cat); let h: string | undefined = t.h
  while (h && byHash.has(h) && !owner.has(h)) { owner.set(h, b); b.list.push(h); h = byHash.get(h)!.parents[0] }
  if (!b.list.length) b.tipAt = idx.get(t.h)!                       // ponta sem commit exclusivo: marca no tip, não desaparece
}
for (let i = N - 1; i >= 0; i--) {                                   // commits sem ref (branches apagadas)
  const h = cs[i].hash; if (owner.has(h)) continue
  const fp = (kids.get(h) ?? []).find(k => byHash.get(k)!.parents[0] === h)
  const b = (fp && owner.get(fp)) || mk("", "other"); owner.set(h, b); b.list.push(h)
}

const hasTags = commits.some(c => c.refs.some(r => r.startsWith("tag: ")))
const labels: { t: string; y: number }[] = hasTags ? [{ t: "tags", y: 0 }] : []
let yy = hasTags ? 3 : 1
const TRONCO = ["main", "master", "default", "base"]             // sempre no topo, nesta ordem
const dataTip = (b: Br) => b.list.length ? idx.get(b.list[0])! : (b.tipAt ?? 0)   // list[0] = ponta = commit mais recente
const ordenadas = br.filter(b => b.list.length || b.tipAt !== undefined)
ordenadas.forEach(b => {
  const ix = b.list.map(h => idx.get(h)!)
  if (b.tipAt !== undefined) ix.push(b.tipAt)
  b.x0 = Math.min(...ix); b.x1 = Math.max(...ix)
  const cx = (b.x0 + b.x1) * DX / 2, len = b.label.length
  b.L = Math.min(b.x0 * DX, Math.floor(cx - len / 2)); b.R = Math.max(b.x1 * DX, Math.ceil(cx + len / 2))
})
ordenadas.sort((a, b) => {                                        // tronco no topo; resto por data (recente primeiro)
  const ta = TRONCO.indexOf(a.name), tb = TRONCO.indexOf(b.name)
  if (ta >= 0 || tb >= 0) return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb)
  return dataTip(b) - dataTip(a)
})
const ends: number[] = []                                         // empacota lanes que não se sobrepõem em x
const troncos = ordenadas.filter(b => TRONCO.indexOf(b.name) >= 0)
const resto = ordenadas.filter(b => TRONCO.indexOf(b.name) < 0)
troncos.forEach((b, i) => { b.y = yy + i * RH })                 // tronco: linha propria, sempre no topo
const baseY = yy + troncos.length * RH
for (const b of resto) { let r = ends.findIndex(e => e < b.L - 1); if (r < 0) { r = ends.length; ends.push(0) } ends[r] = b.R; b.y = baseY + r * RH }
yy = baseY + ends.length * RH + 1
const MAXY = Math.max(...br.filter(b => b.list.length || b.tipAt !== undefined).map(b => b.y))
const X = cs.map((_, i) => i * DX), Y = cs.map(c => owner.get(c.hash)!.y), B = cs.map(c => owner.get(c.hash)!)

// branches inativas: nada a contribuir (mergida ou so atras do destino) -> cor pastel
const INATIVAS = new Set<string>()
{
  const alvo = loc.get("main") ?? loc.get("master") ?? headHash
  for (const [n, h] of loc) {
    if (n === "main" || n === "master") continue
    const r = run(["rev-list", "--left-right", "--count", `${alvo}...${h}`]).out.trim().split(/\s+/).map(Number)
    if (r[1] === 0) INATIVAS.add(n)
  }
}
const corLane = (b: Br) => { const c = COL[b.cat] ?? "#b79cf0"; return b.name && INATIVAS.has(b.name) ? mix(c) : c }

const dumpTo = args.includes("--dump")                             // debug: lista o modelo de lanes
if (dumpTo) {
  console.log(`commits: ${N}  lanes: ${br.filter(b => b.list.length || b.tipAt !== undefined).length}  refs: ${loc.size}`)
  for (const b of [...br].filter(b => b.list.length || b.tipAt !== undefined).sort((a, b) => a.y - b.y)) {
    if (b.list.length || b.tipAt !== undefined) console.log(`${String(b.list.length).padStart(4)}${b.tipAt !== undefined ? "*" : " "} ${b.cat.padEnd(8)} ${b.name || "(fantasma)"}`)
    else if (b.name) console.log(`   ?  ${b.cat.padEnd(8)} ${b.name}  (invisivel: tip fora do log)`)
  }
  process.exit(0)
}

// ───────── planejamento de merge + análise de conflitos ─────────
type Step = { name: string; tip: string; clean: boolean; conflicts: string[]; ahead: number; behind: number; risk: string }
type BranchRow = { name: string; cat: string; tip: string; into: string; base: string; ahead: number; behind: number; merged: boolean; files: number; overlap: string[]; conflicts: string[] | null; risk: string; date: string }
type Report = { generated: string; repo: string; head: string; gitVersion: string; exact: boolean; targets: { name: string; steps: Step[] }[]; branches: BranchRow[] }
const SIM_ENV = { GIT_AUTHOR_NAME: "gitview", GIT_AUTHOR_EMAIL: "gitview@local", GIT_COMMITTER_NAME: "gitview", GIT_COMMITTER_EMAIL: "gitview@local" }
const parseConflicts = (out: string) => { const l = out.split("\n"), f: string[] = []; for (let i = 1; i < l.length && l[i] !== ""; i++) f.push(l[i]); return [...new Set(f)] }

let cached: Report | null = null
function getReport(): Report {
  if (cached) return cached
  const gv = run(["--version"]).out.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  const exact = !!gv && (+gv[1] > 2 || (+gv[1] === 2 && +gv[2] >= 38))   // merge-tree --write-tree
  const refs = [...loc].map(([name, tip]) => ({ name, tip, cat: catOf(name) }))
  const newest = (a: { tip: string }, b: { tip: string }) => idx.get(b.tip)! - idx.get(a.tip)!
  const pick = (cat: string, pref?: string) => refs.find(r => r.name === pref) ?? refs.filter(r => r.cat === cat).sort(newest)[0]
  const main = pick("main", flag("--main")), dev = pick("dev", flag("--dev"))
  const intoOf = (r: (typeof refs)[number]) => {
    if (r === main) return undefined
    const t = r.cat === "feature" || r.cat === "other" ? (dev ?? main) : main
    return t && t !== r ? t : undefined
  }
  const rows: BranchRow[] = []
  for (const r of refs) {
    const t = intoOf(r); if (!t) continue
    const base = run(["merge-base", t.tip, r.tip]).out.trim()
    const [behind, ahead] = run(["rev-list", "--left-right", "--count", `${t.tip}...${r.tip}`]).out.trim().split(/\s+/).map(Number)
    const merged = ahead === 0
    const names = (a: string, b: string) => (base && !merged ? run(["diff", "--name-only", a, b]).out.split("\n").filter(Boolean) : [])
    const mine = names(base, r.tip), theirs = new Set(names(base, t.tip)), overlap = mine.filter(f => theirs.has(f))
    let conflicts: string[] | null = null
    if (exact && !merged) { const m = run(["merge-tree", "--write-tree", "--name-only", t.tip, r.tip]); conflicts = m.code === 0 ? [] : m.code === 1 ? parseConflicts(m.out) : null }
    const n = (conflicts ?? overlap).length
    rows.push({ name: r.name, cat: r.cat, tip: r.tip, into: t.name, base, ahead, behind, merged, files: mine.length, overlap, conflicts,
      risk: merged ? "mesclada" : n === 0 ? "baixo" : n <= 2 ? "medio" : "alto", date: byHash.get(r.tip)!.date })
  }
  // ordem recomendada por destino, simulando os merges em sequência (sem tocar em refs nem na working tree)
  const targets = [...new Set(rows.filter(x => !x.merged).map(x => x.into))].map(name => {
    const t = refs.find(r => r.name === name)!, size = (x: BranchRow) => (x.conflicts ?? x.overlap).length
    const pend = rows.filter(x => x.into === name && !x.merged).sort((a, b) => size(a) - size(b) || a.ahead - b.ahead)
    let cur = t.tip
    const steps: Step[] = pend.map(x => {
      let clean = size(x) === 0, conflicts = x.conflicts ?? x.overlap
      if (exact) {
        const m = run(["merge-tree", "--write-tree", "--name-only", cur, x.tip])
        if (m.code === 0) {
          clean = true; conflicts = []
          const c = run(["commit-tree", m.out.split("\n")[0].trim(), "-p", cur, "-p", x.tip, "-m", "gitview: simulação"], SIM_ENV)
          if (c.code === 0) cur = c.out.trim()
        } else if (m.code === 1) { clean = false; conflicts = parseConflicts(m.out) }
      }
      if (conflicts.length) x.risk = conflicts.length <= 2 ? "medio" : "alto"   // risco considera a ordem sugerida
      return { name: x.name, tip: x.tip, clean, conflicts, ahead: x.ahead, behind: x.behind, risk: x.risk }
    })
    return { name, steps }
  })
  return (cached = { generated: new Date().toISOString(), repo, head: headHash, gitVersion: gv?.[0] ?? "?", exact, targets, branches: rows })
}

const planLines = (R: Report) => {
  const L: { t: string; c: string }[] = [], add = (t: string, c = "#d9dce3") => L.push({ t, c })
  add(`${R.exact ? "conflitos exatos (git merge-tree)" : "estimativa por arquivos em comum (git < 2.38)"} · ${R.branches.length} branches analisadas`, "#8a919c")
  for (const t of R.targets) {
    add(""); add(`→ ${t.name}   (${t.steps.length} a mesclar, na ordem sugerida)`, "#e4e7ec")
    t.steps.forEach((s, i) => {
      add(`${String(i + 1).padStart(2)}. ${s.name}   ${s.clean ? "✔ limpo" : `⚠ ${s.conflicts.length} conflito(s)`}   +${s.ahead}/-${s.behind}`, s.clean ? "#3fb950" : "#f0883e")
      s.conflicts.slice(0, 6).forEach(f => add(`        ${f}`, "#8a919c"))
      if (s.conflicts.length > 6) add(`        … +${s.conflicts.length - 6}`, "#8a919c")
    })
  }
  const done = R.branches.filter(b => b.merged)
  add(""); add(`Já integradas (${done.length}): ${done.map(b => b.name).join(", ") || "—"}`, "#8a919c")
  return L
}

// matriz branch × branch: arquivos em conflito ao mesclar cada par (só branches ainda abertas; precisa de git ≥ 2.38)
type Matrix = { names: string[]; cells: string[][][] }
let cachedMatrix: Matrix | null | undefined
function getMatrix(): Matrix | null {
  if (cachedMatrix !== undefined) return cachedMatrix
  const R = getReport(); if (!R.exact) return (cachedMatrix = null)
  const open = R.branches.filter(b => !b.merged).slice(0, 40), n = open.length
  const cells = open.map(() => open.map(() => [] as string[]))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const m = run(["merge-tree", "--write-tree", "--name-only", open[i].tip, open[j].tip])
    if (m.code === 1) cells[i][j] = cells[j][i] = parseConflicts(m.out)
  }
  return (cachedMatrix = { names: open.map(b => b.name), cells })
}

// template HTML embutido — auto-contido (sem CDN, sem arquivo externo); consome window.__GRAPH__
const TPL_DAG = `<!doctype html>
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
<label class="chk"><input type="checkbox" id="tg-pin" checked> pin main</label>
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
if (!G || !G.commits) { document.getElementById('t').textContent = 'gitview — sem dados'; return }
var COL = {main:'#4c9ffe',hotfix:'#b5b9bd',release:'#86c64a',dev:'#ffbf5e',feature:'#d9757d',other:'#b79cf0'};
var NS = 'http://www.w3.org/2000/svg';
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function el(n, at){ var e = document.createElementNS(NS, n); for (var k in at) e.setAttribute(k, at[k]); return e }
document.getElementById('t').textContent = 'gitview — ' + G.repo;
document.getElementById('m').textContent = G.commits.length + ' commits · HEAD ' + G.head.slice(0,7) + ' · gerado ' + G.report.generated.slice(0,16).replace('T',' ') + ' · ' + (G.report.exact ? 'conflitos exatos (git merge-tree)' : 'estimativa por arquivos em comum (git < 2.38)');
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
var PIN = ['main', 'master', 'default', 'base']
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
  var pinL = chk('tg-pin') && !l.ghost && PIN.indexOf(l.name) >= 0;
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

function exportHtml(file: string, template?: string): string {
  let tpl = TPL_DAG
  if (template) {
    try { tpl = readFileSync(resolve(template), "utf8") }
    catch { console.error("template nao encontrado, usando o embutido:", template) }
  }
  const refs = run(["for-each-ref", "--format=%(refname)\t%(objectname)", "refs/heads", "refs/remotes", "refs/tags"]).out.split("\n").filter(Boolean)
    .map(l => { const [name, hash] = l.split("\t"); return { name, hash } })
  const vis = br.filter(b => b.list.length || b.tipAt !== undefined).sort((a, b) => a.y - b.y)
  vis.forEach((b, i) => { b.y = i })                                    // uma lane por linha no HTML, na ordem do modelo
  const laneIdx = new Map(vis.map((b, i) => [b, i]))
  const mergedRefs = new Set(getReport().branches.filter(b => b.merged).map(b => b.name))
  const data = JSON.stringify({
    repo, commits: cs, refs, head: headHash,
    lanes: vis.map(b => ({ name: b.name, label: b.label, cat: b.cat, x0: b.x0, x1: b.x1, y: b.y, listLen: b.list.length, ghost: b.name ? 0 : 1, merged: mergedRefs.has(b.name) ? 1 : 0 })),
    laneOf: cs.map(c => laneIdx.get(owner.get(c.hash)!) ?? -1),
    report: { ...getReport(), matrix: getMatrix() },
  }).replace(/</g, "\\u003c")
  const out = resolve(file)
  writeFileSync(out, tpl.replace("window.__GRAPH__ = null", () => `window.__GRAPH__ = ${data}`))
  return out
}
const exportTo = flag("--export")
if (exportTo) {
  try { console.log("exportado:", exportHtml(exportTo, flag("--template"))) }
  catch (e: any) { console.error("erro ao exportar:", e.message); process.exit(1) }
  process.exit(0)
}

// ───────── desenho ─────────
const BG = "#14161b", EDGE = "#9aa3b2", GUT = 12, TOP = 1, BOT = 2
const cache = new Map<string, RGBA>()
const C = (h: string) => { let c = cache.get(h); if (!c) { c = RGBA.fromHex(h); cache.set(h, c) } return c }
const mix = (hex: string) => { const a = parseInt(hex.slice(1), 16), b = parseInt(BG.slice(1), 16)
  return "#" + [16, 8, 0].map(s => Math.round(((a >> s) & 255) * .28 + ((b >> s) & 255) * .72).toString(16).padStart(2, "0")).join("") }

class GitView extends Renderable {
  cur = idx.get(headHash) ?? N - 1
  sx = 0; sy = 0
  anc: Set<string> | null = null
  hover: number | null = null
  panel = false
  pscroll = 0
  msg = ""
  private ready = false
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null
  private last = { i: -1, t: 0 }
  constructor(ctx: RenderContext) { super(ctx, { id: "lanes", width: "100%", height: "100%" }) }

  reveal() {
    const vw = this.width - GUT, vh = this.height - TOP - BOT, x = X[this.cur], y = Y[this.cur]
    if (x - this.sx < 3) this.sx = x - 3
    if (x - this.sx > vw - 5) this.sx = x - vw + 5
    if (y - this.sy < 1) this.sy = Math.max(0, y - 1)
    if (y - this.sy > vh - 3) this.sy = y - vh + 3
    this.sx = Math.max(-2, this.sx)
  }

  private clamp() { this.sx = Math.min(Math.max(-2, this.sx), X[N - 1]); this.sy = Math.min(Math.max(0, this.sy), MAXY) }

  // commit sob o ponteiro (ou ponta da branch, se for o nome dela); -1 se nada
  private hit(ex: number, ey: number): number {
    const wx = ex - this.x - GUT + this.sx, wy = ey - this.y - TOP + this.sy
    const i = Math.round(wx / DX)
    if (i >= 0 && i < N && Math.abs(X[i] - wx) <= 1 && Y[i] === wy) return i
    for (const b of br) if (b.label && (b.list.length || b.tipAt !== undefined) && wy === b.y) {
      const s = b.x1 * DX + 2
      if (wx >= s && wx < s + b.label.length) return b.x1
    }
    return -1
  }

  // mouse: clique seleciona · duplo-clique ancestrais · arrastar move · roda ↔ · shift+roda ↕
  protected override onMouseEvent(e: MouseEvent) {
    if (this.panel) {
      if (e.type === "scroll" && e.scroll) { this.pscroll = Math.max(0, this.pscroll + (e.scroll.direction === "up" ? -3 : 3)); this.requestRender() }
      return
    }
    switch (e.type as string) {
      case "down":
        if (e.button === 0) this.drag = { x: e.x, y: e.y, sx: this.sx, sy: this.sy, moved: false }
        break
      case "drag":
        if (this.drag) {
          const dx = this.drag.x - e.x, dy = this.drag.y - e.y
          if (Math.abs(dx) + Math.abs(dy) > 1) this.drag.moved = true
          if (this.drag.moved) { this.sx = this.drag.sx + dx; this.sy = this.drag.sy + dy; this.clamp() }
        }
        break
      case "up": {
        const d = this.drag; this.drag = null
        if (!d || d.moved || e.button !== 0) break
        const i = this.hit(e.x, e.y), now = Date.now()
        if (i < 0) { this.anc = null; break }
        const dbl = i === this.last.i && now - this.last.t < 400
        this.cur = i; this.last = dbl ? { i: -1, t: 0 } : { i, t: now }
        if (dbl) { this.anc = null; this.toggle() }
        break
      }
      case "scroll": {
        const s = e.scroll; if (!s) break
        const dir = s.direction as string, n = Math.max(1, Math.round(Number(s.delta) || 1))
        const sign = dir === "up" || dir === "left" ? -1 : 1
        if (dir === "left" || dir === "right" || !e.modifiers?.shift) this.sx += sign * 8 * n; else this.sy += sign * 3 * n
        this.clamp()
        break
      }
      case "move": case "over": {
        const i = this.hit(e.x, e.y), h = i < 0 ? null : i
        if (h !== this.hover) { this.hover = h; this.requestRender() }
        return
      }
      case "out":
        if (this.hover !== null) { this.hover = null; this.requestRender() }
        return
      default: return
    }
    this.requestRender()
  }

  private later(f: () => void) { setTimeout(() => { try { f() } catch (e: any) { this.msg = "erro: " + e.message } this.requestRender() }, 30) }
  openPlan() { this.msg = "analisando merges…"; this.requestRender(); this.later(() => { getReport(); this.panel = true; this.pscroll = 0; this.msg = "" }) }
  doExport() {
    this.msg = "analisando e exportando…"; this.requestRender()
    this.later(() => {
      const nm = basename(resolve(repo))
      try { const out = exportHtml(`gitview-${nm}.html`); this.msg = "exportado: " + out; setTimeout(() => { this.msg = ""; this.requestRender() }, 7000) }
      catch (e: any) { this.msg = "erro: " + e.message; this.requestRender() }
    })
  }

  handleKey(name: string, shift: boolean) {
    const n = name
    if (this.panel) {
      if (n === "p" || n === "escape") this.panel = false
      else if (n === "up") this.pscroll = Math.max(0, this.pscroll - 1)
      else if (n === "down") this.pscroll++
      else if (n === "pageup") this.pscroll = Math.max(0, this.pscroll - 10)
      else if (n === "pagedown") this.pscroll += 10
      this.requestRender(); return
    }
    this.hover = null
    if (n === "left") this.cur = Math.max(0, this.cur - (shift ? 20 : 1))
    else if (n === "right") this.cur = Math.min(N - 1, this.cur + (shift ? 20 : 1))
    else if (n === "up" || n === "down") {                           // commit mais próximo na lane vizinha
      const d = n === "up" ? -1 : 1; let best = -1, bs = 1e9
      for (let i = 0; i < N; i++) { const dy = (Y[i] - Y[this.cur]) * d; if (dy <= 0) continue
        const s = dy * 10000 + Math.abs(X[i] - X[this.cur]); if (s < bs) { bs = s; best = i } }
      if (best >= 0) this.cur = best
    }
    else if (n === "home" || (n === "g" && !shift)) this.cur = 0
    else if (n === "end" || (n === "g" && shift)) this.cur = N - 1
    else if (n === "h") this.cur = idx.get(headHash) ?? N - 1
    else if (n === "p") { this.openPlan(); return }
    else if (n === "e") { this.doExport(); return }
    else if (n === "return" || n === "enter") this.toggle()
    this.reveal(); this.requestRender()
  }

  toggle() {
    if (this.anc) { this.anc = null; return }
    const s = new Set<string>(), st = [cs[this.cur].hash]
    while (st.length) { const h = st.pop()!; if (s.has(h)) continue; s.add(h); byHash.get(h)?.parents.forEach(p => st.push(p)) }
    this.anc = s
  }

  protected override renderSelf(buf: OptimizedBuffer) {
    if (!this.ready) { this.ready = true; this.reveal() }
    const W = this.width, H = this.height, ox = this.x, oy = this.y
    const on = (h: string) => !this.anc || this.anc.has(h)
    const f = (hex: string, ok: boolean) => ok ? hex : mix(hex)
    buf.fillRect(ox, oy, W, H, C(BG))

    const put = (wx: number, wy: number, ch: string, fg: string, bg = BG) => {
      const x = GUT + wx - this.sx, y = TOP + wy - this.sy
      if (x < GUT || x >= W || y < TOP || y >= H - BOT) return
      buf.setCell(ox + x, oy + y, ch, C(fg), C(bg))
    }
    const txt = (wx: number, wy: number, s: string, fg: string) => { for (let i = 0; i < s.length; i++) put(wx + i, wy, s[i], fg) }
    const vis = (wx: number) => { const x = GUT + wx - this.sx; return x > GUT - 40 && x < W + 40 }

    // tags (linha pontilhada + nome no topo)
    for (let i = 0; i < N; i++) {
      const tags = cs[i].refs.filter(r => r.startsWith("tag: ")).map(r => r.slice(5)); if (!tags.length || !vis(X[i])) continue
      const t = tags.join(","), ok = on(cs[i].hash)
      for (let y = 1; y < Y[i]; y++) put(X[i], y, "┊", f("#3a4150", ok))
      txt(X[i] - Math.floor(t.length / 2), 0, t, f("#e3b341", ok))
    }
    // arestas: sólidas na mesma branch; tracejadas (corre pela lane do pai, entra na vertical no filho) entre branches
    for (let i = 0; i < N; i++) for (const p of cs[i].parents) {
      const j = idx.get(p); if (j === undefined) continue
      const ax = X[j], ay = Y[j], bx = X[i], by = Y[i]
      if (!vis(ax) && !vis(bx)) continue
      const ok = on(p) && on(cs[i].hash)
      if (B[i] === B[j]) { const col = f(corLane(B[i]), ok); for (let x = ax + 1; x < bx; x++) put(x, ay, "─", col); continue }
      const col = f(EDGE, ok)
      if (ay === by) { for (let x = ax + 1; x < bx - 1; x++) put(x, ay, "┄", col); put(bx - 1, ay, "▸", col); continue }
      const d = Math.sign(by - ay)
      for (let x = ax + 1; x < bx; x++) put(x, ay, "┄", col)
      put(bx, ay, d > 0 ? "╮" : "╯", col)
      for (let y = ay + d; y !== by - d; y += d) put(bx, y, "┆", col)
      put(bx, by - d, d > 0 ? "▾" : "▴", col)
    }
    // nomes das branches na PONTA da lane (direita do ultimo commit), com hash quando ligado
    for (const b of br) if ((b.list.length || b.tipAt !== undefined) && b.label) {
      const ok = !this.anc || b.list.some(h => this.anc!.has(h))
      const nm = b.label
      txt(b.x1 * DX + 2, b.y, nm, f(corLane(b), ok))
    }
    // commits
    for (let i = 0; i < N; i++) {
      if (!vis(X[i])) continue
      const ok = on(cs[i].hash), isCur = i === this.cur
      put(X[i], Y[i], cs[i].parents.length > 1 ? "◉" : "●", f(corLane(B[i]), ok), isCur ? "#2b3550" : i === this.hover ? "#232938" : BG)
      if (isCur) { put(X[i] - 1, Y[i], "[", "#ffffff"); put(X[i] + 1, Y[i], "]", "#ffffff") }
    }
    // coluna fixa: tags no topo + nome REAL de cada branch alinhado à sua lane
    buf.fillRect(ox, oy + TOP, GUT, H - TOP - BOT, C(BG))
    for (const l of labels) { const y = TOP + l.y - this.sy; if (y >= TOP && y < H - BOT) buf.drawText(l.t, ox + 1, oy + y, C("#7a828e")) }
    for (const b of br) if (b.list.length || b.tipAt !== undefined) {
      const y = TOP + b.y - this.sy; if (y < TOP || y >= H - BOT) continue
      const tipH = b.list[b.list.length - 1] ?? (b.tipAt !== undefined ? cs[b.tipAt].hash : "")
      const nm0 = b.name ? b.name.replace(/^(feature|feat)\//, "f/").replace(/^(hotfix|fix)\//, "h/").replace(/^release\//, "r/").replace(/^(docs|doc)\//, "d/").replace(/^chore\//, "c/").replace(/^(migracao|migration)\//, "m/").replace(/^test\//, "t/").replace(/^sync\//, "s/").replace(/^codespace\//, "cs/") : "~" + tipH.slice(0, 7)
      const nm = nm0.length > GUT - 1 ? nm0.slice(0, GUT - 2) + "…" : nm0
      buf.drawText(nm, ox + 1, oy + y, C(b.name ? corLane(b) : "#5b6470"))
    }

    // cabeçalho e rodapé
    const c = cs[this.hover ?? this.cur], hbg = C("#1b1e25")
    buf.fillRect(ox, oy, W, 1, hbg)
    const fora = br.filter(b => (b.list.length || b.tipAt !== undefined) && (b.y < this.sy || b.y > this.sy + H - TOP - BOT - 1)).length
  buf.drawText(` gitview  ${repo}  ${N} commits · ${loc.size} branches${fora ? ` · ▼ +${fora} fora da vista` : ''}${this.anc ? "  [ancestrais]" : ""}`, ox, oy, C("#d9dce3"), hbg)
    buf.fillRect(ox, oy + H - BOT, W, BOT, hbg)
    buf.drawText(`${c.hash.slice(0, 7)}  ${c.author}  ${c.date.slice(0, 16).replace("T", " ")}  ${c.refs.join(", ")}`, ox + 1, oy + H - 2, C("#8a919c"), hbg)
    buf.drawText(`${c.subject}`.slice(0, Math.max(0, W - 2)), ox + 1, oy + H - 1, C("#e4e7ec"), hbg)
    const help = "clique/←→↑↓ selecionar  2×/⏎ ancestrais  p merge  e exportar  q sair"
    if (this.msg) { buf.fillRect(ox, oy + H - 1, W, 1, hbg); buf.drawText(this.msg.slice(0, W - 2), ox + 1, oy + H - 1, C("#e3b341"), hbg) }
    else if (W > help.length + c.subject.length + 6) buf.drawText(help, ox + W - help.length - 1, oy + H - 1, C("#6b7280"), hbg)

    if (this.panel) {                                              // painel de planejamento de merge
      const lines = planLines(getReport()), w = Math.min(W - 4, 110), ph = H - TOP - BOT - 2, pbg = C("#1b1e25")
      const x0 = ox + Math.floor((W - w) / 2), y0 = oy + TOP + 1, vh = ph - 2
      this.pscroll = Math.min(this.pscroll, Math.max(0, lines.length - vh))
      buf.fillRect(x0, y0, w, ph, pbg)
      buf.drawText(" Planejamento de merge — ↑↓/roda rolar · p fechar ", x0 + 1, y0, C("#e4e7ec"), pbg)
      lines.slice(this.pscroll, this.pscroll + vh).forEach((l, k) => buf.drawText(l.t.slice(0, w - 4), x0 + 2, y0 + 1 + k, C(l.c), pbg))
    }
  }
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: BG, useMouse: true, enableMouseMovement: true })
const view = new GitView(renderer)
renderer.root.add(view)
renderer.keyInput.on("keypress", (key: any) => {
  if (key.name === "q" || (key.name === "escape" && !view.panel)) { renderer.destroy(); process.exit(0) }
  view.handleKey(key.name, !!key.shift)
})
