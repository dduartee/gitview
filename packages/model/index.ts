// O model: a atribuição de cada commit a uma lane, mais a ordem e a posição das lanes.
//
// É a única coisa que os dois renderizadores compartilham, e não sabe desenhar nada.
// Construído uma vez, a partir de leitura do repositório — nada aqui escreve em ref
// nem em working tree.
//
// `buildModel` é orquestração: lê, atribui lanes, mede, ordena e empacota, nessa ordem.
// A parte difícil mora em `lib/lanes.ts` (quem é dono de cada commit) e `lib/layout.ts`
// (onde cada lane fica no eixo Y).

import type { Git } from "../git/index.ts"
import { BG, COL, mix } from "./lib/color.ts"
import { PRIO, catOf } from "./lib/category.ts"
import { atribuirLanes } from "./lib/lanes.ts"
import { DX, RH, empacotarY, medirLanes } from "./lib/layout.ts"
import { describeTrunks, isTrunk, resolveTrunks, type TrunkSource } from "./lib/trunks.ts"

// `mix` e os troncos saem pela interface porque o TUI e o export precisam deles, e
// `lib/` é privado. Cor divergente entre renderizadores é bug de leitura; lista de
// tronco duplicada dentro do template é o mesmo tipo de bug.
export { COL, mix, BG, isTrunk, resolveTrunks, describeTrunks, DX, RH, PRIO, catOf }
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

export type BuildOptions = {
  /** `--trunk a,b`, já splitado. Vence `.gitview.json`, que vence `origin/HEAD`, que vence o nome. */
  trunk?: string[]
}

/** Cor de uma lane, já dessaturada quando ela está inativa. */
export const corLane = (m: { inactivas: Set<string> }, b: Lane): string => {
  const c = COL[b.cat] ?? "#b79cf0"
  return b.name && m.inactivas.has(b.name) ? mix(c) : c
}

/** Uma lane ocupa linha? As invisíveis não, mas continuam na coluna de rótulos. */
export const visivel = (b: Lane): boolean => b.list.length > 0 || b.tipAt !== undefined

/** Lê o log e transforma cada linha no commit correspondente. */
function lerCommits(g: Git): Commit[] {
  const bruto = g.git("log", "--all", "--date-order", "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1e")
  return bruto
    .split("\x1e").map(r => r.trim()).filter(Boolean).map(r => {
      const [hash, p, author, email, date, refs, subject] = r.split("\x1f")
      return { hash, parents: p ? p.split(" ") : [], author, email, date, subject, refs: refs ? refs.split(", ").filter(Boolean) : [] }
    })
}

/**
 * Nome curto de branch -> hash da ponta.
 *
 * Ignora tags e refs que não são branch. Remote é achatado (`origin/x` → `x`), e o local
 * ganha quando os dois apontam para nomes iguais — o que você tem em disco manda.
 */
function ligarRefs(commits: Commit[]): Map<string, string> {
  const loc = new Map<string, string>(), rem = new Map<string, string>()
  for (const c of commits) for (const r0 of c.refs) {
    if (r0.startsWith("tag: ") || r0.startsWith("refs/")) continue
    const r = r0.replace(/^HEAD -> /, "")
    if (r === "HEAD" || /\/HEAD$/.test(r)) continue
    if (/^(origin|upstream)\//.test(r)) {
      const n = r.replace(/^[^/]+\//, "")
      if (!rem.has(n)) rem.set(n, c.hash)
    } else {
      loc.set(r, c.hash)
    }
  }
  for (const [n, h] of rem) if (!loc.has(n)) loc.set(n, h)
  return loc
}

/** hash -> hashes dos filhos. Usado para descobrir a lane de um commit sem ref. */
function ligarFilhos(cs: Commit[]): Map<string, string[]> {
  const kids = new Map<string, string[]>()
  for (const c of cs) for (const p of c.parents) {
    if (!kids.has(p)) kids.set(p, [])
    kids.get(p)!.push(c.hash)
  }
  return kids
}

/**
 * Lanes que nada têm a entregar: fundidas, ou apenas atrás do destino.
 *
 * `alvo` é o primeiro tronco resolvido, não o literal `"main"` — é para ele que o trabalho
 * flui. Sem tronco, cai no HEAD: contra o HEAD nada está "atrás", então o conjunto sai vazio
 * em vez de sair errado.
 */
function detectarInativas(
  g: Git, loc: Map<string, string>, alvoHash: string, ehTronco: (n: string) => boolean,
): Set<string> {
  const inactivas = new Set<string>()
  for (const [n, h] of loc) {
    if (ehTronco(n)) continue
    const r = g.run(["rev-list", "--left-right", "--count", `${alvoHash}...${h}`]).out.trim().split(/\s+/).map(Number)
    if (r[1] === 0) inactivas.add(n)
  }
  return inactivas
}

export function buildModel(g: Git, opts: BuildOptions = {}): Model {
  const commits = lerCommits(g)
  if (!commits.length) throw new Error("repositório sem commits")
  const headHash = g.git("rev-parse", "HEAD").trim()

  const cs = [...commits].reverse()                                   // mais antigo primeiro
  const N = cs.length
  const byHash = new Map(cs.map(c => [c.hash, c]))
  const idx = new Map(cs.map((c, i) => [c.hash, i]))
  const kids = ligarFilhos(cs)
  const loc = ligarRefs(commits)

  const { owner, br } = atribuirLanes(loc, idx, byHash, kids, cs)

  // Resolvido antes do layout: pinning e detecção de inativas dependem da lista.
  const tr = resolveTrunks(g, n => loc.has(n), { flag: opts.trunk })
  const troncos = [
    ...tr.names.filter(n => loc.has(n)),
    ...[...loc.keys()].filter(n => !tr.names.includes(n) && catOf(n) === "main"),
  ]
  const rank = (nome: string) => troncos.indexOf(nome)

  const hasTags = commits.some(c => c.refs.some(r => r.startsWith("tag: ")))
  const labels: { t: string; y: number }[] = hasTags ? [{ t: "tags", y: 0 }] : []
  const ordenadas = br.filter(visivel)
  medirLanes(ordenadas, idx)

  const dataTip = (b: Lane) => b.list.length ? idx.get(b.list[0])! : (b.tipAt ?? 0)
  ordenadas.sort((a, b) => {
    // tronco no topo, na ordem da lista; o resto por data, mais recente primeiro
    const ta = rank(a.name), tb = rank(b.name)
    if (ta >= 0 || tb >= 0) return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb)
    return dataTip(b) - dataTip(a)
  })
  const MAXY = empacotarY(ordenadas, rank, hasTags ? 3 : 1)

  const X = cs.map((_, i) => i * DX)
  const Y = cs.map(c => owner.get(c.hash)!.y)
  const B = cs.map(c => owner.get(c.hash)!)

  const alvoHash = troncos.length ? (loc.get(troncos[0]) ?? headHash) : headHash
  const inactivas = detectarInativas(g, loc, alvoHash, n => rank(n) >= 0)

  return {
    repo: g.repo, headHash, commits, cs, N, lanes: br, owner, loc, idx, byHash,
    X, Y, B, MAXY, labels, inactivas, hasTags,
    troncos, troncosSource: tr.source,
  }
}