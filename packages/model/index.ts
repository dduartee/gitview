// O model: a atribuição de cada commit a uma lane, mais a ordem e a posição das lanes.
//
// É a única coisa que os dois renderizadores compartilham, e não sabe desenhar nada.
// Construído uma vez, a partir de leitura do repositório — nada aqui escreve em ref
// nem em working tree.

import type { Git } from "../git/index.ts"
import { BG, COL, mix } from "./lib/color.ts"
import { PRIO, catOf } from "./lib/category.ts"
import { describeTrunks, isTrunk, resolveTrunks, type TrunkSource } from "./lib/trunks.ts"

// `mix` e os troncos saem pela interface porque o TUI e o export precisam deles, e
// `lib/` é privado. Cor divergente entre renderizadores é bug de leitura; lista de
// tronco duplicada dentro do template é o mesmo tipo de bug.
export { COL, mix, BG, isTrunk, resolveTrunks, describeTrunks }
export type { TrunkSource }

export type Commit = {
  hash: string
  parents: string[]
  author: string
  email: string
  date: string
  subject: string
  refs: string[]
}

/** Uma branch como uma linha do grafo. `list` são os hashes, do mais recente para o mais antigo. */
export type Lane = {
  name: string
  label: string
  cat: string
  list: string[]
  x0: number
  x1: number
  /** Extensão horizontal ocupada, em colunas de terminal (inclui o nome). */
  L: number
  R: number
  /** Linha vertical. No HTML é reindexada para 0..n-1 na projeção. */
  y: number
  /** Commit da ponta quando ele não está no log — a lane fica invisível mas não some. */
  tipAt?: number
}

/** Espaçamento horizontal entre commits, em colunas de terminal. */
export const DX = 4
/** Altura de uma lane, em linhas de terminal. */
export const RH = 3

/** Ordem de prioridade das categorias: usada para desempatar lanes de mesma data. */
export { PRIO, catOf }

export type Model = {
  repo: string
  headHash: string
  /** Ordem do `git log`: mais recente primeiro. */
  commits: Commit[]
  /** O mesmo, invertido: mais antigo primeiro. É o eixo X. */
  cs: Commit[]
  N: number
  /** Todas as lanes, incluindo invisíveis e fantasmas. */
  lanes: Lane[]
  /** Lane dona de cada commit. */
  owner: Map<string, Lane>
  /** Nome da branch -> hash da ponta. Inclui refs remotas achatadas para o nome curto. */
  loc: Map<string, string>
  idx: Map<string, number>
  byHash: Map<string, Commit>
  X: number[]
  Y: number[]
  B: Lane[]
  MAXY: number
  /** Rótulos fixos do topo (hoje só "tags"). */
  labels: { t: string; y: number }[]
  /** Lanes que nada têm a entregar: fundidas ou `ahead 0`. */
  inactivas: Set<string>
  hasTags: boolean
  /** Nomes de tronco resolvidos, e de onde vieram. Vai para o export para o template não adivinhar. */
  troncos: string[]
  troncosSource: TrunkSource
}

/** Cor de uma lane, já dessaturada quando ela está inativa. */
export const corLane = (m: { inactivas: Set<string> }, b: Lane): string => {
  const c = COL[b.cat] ?? "#b79cf0"
  return b.name && m.inactivas.has(b.name) ? mix(c) : c
}

export type BuildOptions = {
  /** `--trunk a,b`, já splitado. Vence `.gitview.json`, que vence `origin/HEAD`, que vence o nome. */
  trunk?: string[]
}

export function buildModel(g: Git, opts: BuildOptions = {}): Model {
  const commits: Commit[] = g.git("log", "--all", "--date-order", "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1e")
    .split("\x1e").map(r => r.trim()).filter(Boolean).map(r => {
      const [hash, p, author, email, date, refs, subject] = r.split("\x1f")
      return { hash, parents: p ? p.split(" ") : [], author, email, date, subject, refs: refs ? refs.split(", ").filter(Boolean) : [] }
    })
  if (!commits.length) throw new Error("repositório sem commits")
  const headHash = g.git("rev-parse", "HEAD").trim()

  const cs = [...commits].reverse()                                   // mais antigo primeiro
  const N = cs.length
  const byHash = new Map(cs.map(c => [c.hash, c]))
  const idx = new Map(cs.map((c, i) => [c.hash, i]))
  const kids = new Map<string, string[]>()
  cs.forEach(c => c.parents.forEach(p => { if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(c.hash) }))

  // refs locais e remotas, achatadas para o nome curto; remote ganha de local quando colidem
  const loc = new Map<string, string>(), rem = new Map<string, string>()
  commits.forEach(c => c.refs.forEach(r0 => {
    if (r0.startsWith("tag: ") || r0.startsWith("refs/")) return
    const r = r0.replace(/^HEAD -> /, "")
    if (r === "HEAD" || /\/HEAD$/.test(r)) return
    if (/^(origin|upstream)\//.test(r)) { const n = r.replace(/^[^/]+\//, ""); if (!rem.has(n)) rem.set(n, c.hash) } else loc.set(r, c.hash)
  }))
  rem.forEach((h, n) => { if (!loc.has(n)) loc.set(n, h) })

  const owner = new Map<string, Lane>(), br: Lane[] = []
  const mk = (name: string, cat: string): Lane => {
    const b: Lane = { name, label: name.length > 36 ? name.slice(0, 35) + "…" : name, cat, list: [], x0: 0, x1: 0, L: 0, R: 0, y: 0 }
    br.push(b)
    return b
  }
  const tips = [...loc].map(([n, h]) => ({ n, h, cat: catOf(n) }))
    .sort((a, b) => PRIO.indexOf(a.cat) - PRIO.indexOf(b.cat) || idx.get(b.h)! - idx.get(a.h)!)
  for (const t of tips) {                                           // first-parent a partir de cada ponta
    const b = mk(t.n, t.cat)
    let h: string | undefined = t.h
    while (h && byHash.has(h) && !owner.has(h)) { owner.set(h, b); b.list.push(h); h = byHash.get(h)!.parents[0] }
    if (!b.list.length) b.tipAt = idx.get(t.h)!                    // ponta sem commit exclusivo: marca no tip, não desaparece
  }
  for (let i = N - 1; i >= 0; i--) {                               // commits sem ref (branches apagadas)
    const h = cs[i].hash; if (owner.has(h)) continue
    const fp = (kids.get(h) ?? []).find(k => byHash.get(k)!.parents[0] === h)
    const b = (fp && owner.get(fp)) || mk("", "other")
    owner.set(h, b); b.list.push(h)
  }

  // Resolvido antes do layout, porque pinning e a detecção de inativas dependem da lista.
  const tr = resolveTrunks(g, n => loc.has(n), { flag: opts.trunk })

  const hasTags = commits.some(c => c.refs.some(r => r.startsWith("tag: ")))
  const labels: { t: string; y: number }[] = hasTags ? [{ t: "tags", y: 0 }] : []
  let yy = hasTags ? 3 : 1
  const dataTip = (b: Lane) => b.list.length ? idx.get(b.list[0])! : (b.tipAt ?? 0)
  const ordenadas = br.filter(b => b.list.length || b.tipAt !== undefined)
  ordenadas.forEach(b => {
    const ix = b.list.map(h => idx.get(h)!)
    if (b.tipAt !== undefined) ix.push(b.tipAt)
    b.x0 = Math.min(...ix); b.x1 = Math.max(...ix)
    const cx = (b.x0 + b.x1) * DX / 2, len = b.label.length
    b.L = Math.min(b.x0 * DX, Math.floor(cx - len / 2)); b.R = Math.max(b.x1 * DX, Math.ceil(cx + len / 2))
  })
  // Ordem dos troncos: a ordem da lista resolvida, e depois qualquer branch que a
    // convenção de nome chame de `main` (cobre `team/platform/main`, que não está em
    // nenhuma lista). Expandir aqui deixa `troncos` completo para o export, e a ordenação
    // e o pinning são só um `indexOf`.
    const troncosOrdenados = [
      ...tr.names.filter(n => loc.has(n)),
      ...[...loc.keys()].filter(n => !tr.names.includes(n) && catOf(n) === "main"),
    ]
    const rank = (nome: string) => troncosOrdenados.indexOf(nome)

  ordenadas.sort((a, b) => {                                        // tronco no topo; resto por data (recente primeiro)
    const ta = rank(a.name), tb = rank(b.name)
    if (ta >= 0 || tb >= 0) return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb)
    return dataTip(b) - dataTip(a)
  })
  const ends: number[] = []                                         // empacota lanes que não se sobrepõem em x
  const troncos = ordenadas.filter(b => rank(b.name) >= 0)
  const resto = ordenadas.filter(b => rank(b.name) < 0)
  troncos.forEach((b, i) => { b.y = yy + i * RH })                 // tronco: linha propria, sempre no topo
  const baseY = yy + troncos.length * RH
  for (const b of resto) { let r = ends.findIndex(e => e < b.L - 1); if (r < 0) { r = ends.length; ends.push(0) } ends[r] = b.R; b.y = baseY + r * RH }
  yy = baseY + ends.length * RH + 1
  const MAXY = Math.max(...br.filter(b => b.list.length || b.tipAt !== undefined).map(b => b.y))
  const X = cs.map((_, i) => i * DX)
  const Y = cs.map(c => owner.get(c.hash)!.y)
  const B = cs.map(c => owner.get(c.hash)!)

  // branches inativas: nada a contribuir (mergida ou so atras do destino) -> cor pastel
  //
  // `alvo` é o primeiro tronco resolvido, não o literal "main": é para ele que o trabalho
  // flui. Sem tronco nenhum, cai no HEAD — a comparação continua válida, porque contra o
  // HEAD nada está "atrás".
  const inactivas = new Set<string>()
  const alvo = troncosOrdenados.length ? loc.get(troncosOrdenados[0]) ?? headHash : headHash
  for (const [n, h] of loc) {
    if (rank(n) >= 0) continue
    const r = g.run(["rev-list", "--left-right", "--count", `${alvo}...${h}`]).out.trim().split(/\s+/).map(Number)
    if (r[1] === 0) inactivas.add(n)
  }

  return {
    repo: g.repo, headHash, commits, cs, N, lanes: br, owner, loc, idx, byHash,
    X, Y, B, MAXY, labels, inactivas, hasTags,
    troncos: troncosOrdenados, troncosSource: tr.source,
  }
}

/** Uma lane ocupa linha? As invisíveis não, mas continuam na coluna de rótulos. */
export const visivel = (b: Lane): boolean => b.list.length > 0 || b.tipAt !== undefined