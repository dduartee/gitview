// O export HTML: um arquivo só, sem CDN, sem JS externo, sem build.
//
// Recebe o model e escreve a **projeção** — a forma serializada que o template consome
// via `window.__GRAPH__`. É o contrato entre os dois renderizadores.

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Git } from "../git/index.ts"
import { visivel, type Lane, type Model } from "../model/index.ts"
import type { Matrix, Report } from "../merge/index.ts"
import { TPL_DAG } from "./lib/template.ts"

export { TPL_DAG }

/** O que vai dentro do HTML. É o contrato — mudar aqui é quebrar todo export antigo. */
export type Graph = {
  repo: string
  commits: Model["cs"]
  refs: { name: string; hash: string }[]
  head: string
  lanes: {
    name: string
    label: string
    cat: string
    x0: number
    x1: number
    y: number
    listLen: number
    ghost: 0 | 1
    merged: 0 | 1
  }[]
  laneOf: number[]
  /** Troncos resolvidos pelo model e de onde vieram. O template usa em vez de repetir a lista. */
  troncos: string[]
  troncosSource: string
  report: Report & { matrix: Matrix | null }
}

/**
 * Monta a projeção.
 *
 * No HTML cada lane é uma linha: o `y` do model (espaçamento de terminal, `RH = 3`) é
 * reindexado para 0..n-1 aqui, preservando a ordem. A ordem vem do model; só a
 * densidade muda.
 *
 * `lanesEmOrdem` devolve pares [lane, y-no-html] em vez de escrever `lane.y` — o
 * renderizador do terminal tem as mesmas lanes vivas e precisa que continuem onde
 * estavam.
 */
export function project(g: Git, m: Model, report: Report, matrix: Matrix | null): Graph {
  const refs = g.run(["for-each-ref", "--format=%(refname)\t%(objectname)", "refs/heads", "refs/remotes", "refs/tags"]).out
    .split("\n").filter(Boolean)
    .map(l => { const [name, hash] = l.split("\t"); return { name, hash } })

  const vis = m.lanes.filter(visivel).sort((a, b) => a.y - b.y)
  const lanesEmOrdem = vis.map((b, i): [Lane, number] => [b, i])
  const yNoHtml = new Map(lanesEmOrdem)
  const mergedRefs = new Set(report.branches.filter(b => b.merged).map(b => b.name))

  return {
    repo: m.repo,
    commits: m.cs,
    refs,
    head: m.headHash,
    lanes: lanesEmOrdem.map(([b, y]) => ({
      name: b.name,
      label: b.label,
      cat: b.cat,
      x0: b.x0,
      x1: b.x1,
      y,
      listLen: b.list.length,
      ghost: (b.name ? 0 : 1) as 0 | 1,
      merged: (mergedRefs.has(b.name) ? 1 : 0) as 0 | 1,
    })),
    laneOf: m.cs.map(c => yNoHtml.get(m.owner.get(c.hash)!) ?? -1),
    troncos: m.troncos,
    troncosSource: m.troncosSource,
    report: { ...report, matrix },
  }
}

/**
 * Escreve o HTML em `file`.
 *
 * `template` troca o embutido por um arquivo próprio — cai no embutido se o path não
 * existir, em vez de falhar.
 */
export function exportHtml(g: Git, m: Model, report: Report, matrix: Matrix | null, file: string, template?: string): string {
  let tpl = TPL_DAG
  if (template) {
    try { tpl = readFileSync(resolve(template), "utf8") }
    catch { console.error("template nao encontrado, usando o embutido:", template) }
  }
  const data = JSON.stringify(project(g, m, report, matrix)).replace(/</g, "\\u003c")
  const out = resolve(file)
  writeFileSync(out, tpl.replace("window.__GRAPH__ = null", () => `window.__GRAPH__ = ${data}`))
  return out
}