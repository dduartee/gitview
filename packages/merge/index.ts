// Planejamento de merge e matriz de conflitos.
//
// `getReport` é o módulo mais fundo do projeto: uma chamada sem argumento, e atrás dela
// há probe de versão do git, categorização de refs, escolha de destino, merge-base,
// rev-list, diff, merge-tree e simulação sequencial com commit-tree.
//
// Nada aqui toca em ref nem em working tree. As simulações usam `commit-tree` para criar
// objetos órfãos, que o git descarta quando ninguém os referencia.

import { SIM_ENV, type Git } from "../git/index.ts"
import { catOf, type Model } from "../model/index.ts"

export type Step = { name: string; tip: string; clean: boolean; conflicts: string[]; ahead: number; behind: number; risk: string }

export type BranchRow = {
  name: string
  cat: string
  tip: string
  into: string
  base: string
  ahead: number
  behind: number
  merged: boolean
  files: number
  overlap: string[]
  /** `null` quando não deu para saber (git antigo, ou erro do merge-tree). `[]` quando sim, e não há conflito. */
  conflicts: string[] | null
  risk: string
  date: string
}

export type Report = {
  generated: string
  repo: string
  head: string
  gitVersion: string
  /** Conflitos exatos (`merge-tree --write-tree`, git >= 2.38) ou estimativa por arquivos em comum. */
  exact: boolean
  targets: { name: string; steps: Step[] }[]
  branches: BranchRow[]
}

export type Matrix = { names: string[]; cells: string[][][] }

export type MergeFlags = { main?: string; dev?: string }

/**
 * Linhas de saída do `merge-tree --write-tree` que são arquivos em conflito.
 * A primeira linha é o cabeçalho ("<info>"), daí o `i = 1`.
 */
const parseConflicts = (out: string): string[] => {
  const l = out.split("\n"), f: string[] = []
  for (let i = 1; i < l.length && l[i] !== ""; i++) f.push(l[i])
  return [...new Set(f)]
}

export function createMergePlanner(g: Git, m: Model, flags: MergeFlags = {}) {
  let cached: Report | null = null
  let cachedMatrix: Matrix | null | undefined

  function getReport(): Report {
    if (cached) return cached

    const gv = g.run(["--version"]).out.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
    const exact = !!gv && (+gv[1] > 2 || (+gv[1] === 2 && +gv[2] >= 38))   // merge-tree --write-tree

    const refs = [...m.loc].map(([name, tip]) => ({ name, tip, cat: catOf(name) }))
    const newest = (a: { tip: string }, b: { tip: string }) => m.idx.get(b.tip)! - m.idx.get(a.tip)!
    const pick = (cat: string, pref?: string) => refs.find(r => r.name === pref) ?? refs.filter(r => r.cat === cat).sort(newest)[0]
    const main = pick("main", flags.main), dev = pick("dev", flags.dev)

    const intoOf = (r: (typeof refs)[number]) => {
      if (r === main) return undefined
      const t = r.cat === "feature" || r.cat === "other" ? (dev ?? main) : main
      return t && t !== r ? t : undefined
    }

    const rows: BranchRow[] = []
    for (const r of refs) {
      const t = intoOf(r); if (!t) continue
      const base = g.run(["merge-base", t.tip, r.tip]).out.trim()
      const [behind, ahead] = g.run(["rev-list", "--left-right", "--count", `${t.tip}...${r.tip}`]).out.trim().split(/\s+/).map(Number)
      const merged = ahead === 0
      const names = (a: string, b: string) => (base && !merged ? g.run(["diff", "--name-only", a, b]).out.split("\n").filter(Boolean) : [])
      const mine = names(base, r.tip), theirs = new Set(names(base, t.tip)), overlap = mine.filter(f => theirs.has(f))

      let conflicts: string[] | null = null
      if (exact && !merged) {
        const mc = g.run(["merge-tree", "--write-tree", "--name-only", t.tip, r.tip])
        conflicts = mc.code === 0 ? [] : mc.code === 1 ? parseConflicts(mc.out) : null
      }
      const n = (conflicts ?? overlap).length
      rows.push({
        name: r.name, cat: r.cat, tip: r.tip, into: t.name, base, ahead, behind, merged,
        files: mine.length, overlap, conflicts,
        risk: merged ? "mesclada" : n === 0 ? "baixo" : n <= 2 ? "medio" : "alto",
        date: m.byHash.get(r.tip)!.date,
      })
    }

    // ordem recomendada por destino, simulando os merges em sequência (sem tocar em refs nem na working tree)
    const targets = [...new Set(rows.filter(x => !x.merged).map(x => x.into))].map(name => {
      const t = refs.find(r => r.name === name)!
      const size = (x: BranchRow) => (x.conflicts ?? x.overlap).length
      const pend = rows.filter(x => x.into === name && !x.merged).sort((a, b) => size(a) - size(b) || a.ahead - b.ahead)
      let cur = t.tip
      const steps: Step[] = pend.map(x => {
        let clean = size(x) === 0, conflicts = x.conflicts ?? x.overlap
        if (exact) {
          const mc = g.run(["merge-tree", "--write-tree", "--name-only", cur, x.tip])
          if (mc.code === 0) {
            clean = true; conflicts = []
            const c = g.run(["commit-tree", mc.out.split("\n")[0].trim(), "-p", cur, "-p", x.tip, "-m", "gitview: simulação"], SIM_ENV)
            if (c.code === 0) cur = c.out.trim()
          } else if (mc.code === 1) { clean = false; conflicts = parseConflicts(mc.out) }
        }
        if (conflicts.length) x.risk = conflicts.length <= 2 ? "medio" : "alto"   // risco considera a ordem sugerida
        return { name: x.name, tip: x.tip, clean, conflicts, ahead: x.ahead, behind: x.behind, risk: x.risk }
      })
      return { name, steps }
    })

    return (cached = { generated: new Date().toISOString(), repo: m.repo, head: m.headHash, gitVersion: gv?.[0] ?? "?", exact, targets, branches: rows })
  }

  /**
   * Conflitos lane × lane. Custo O(n²) de `merge-tree`, então corta nas 40 branches
   * abertas mais recentes.
   *
   * ATENÇÃO: o corte é silencioso. Com mais de 40 branches abertas a matriz sai
   * incompleta e nada no terminal avisa — o HTML diz, o TUI não. Ver issue aberta.
   */
  function getMatrix(): Matrix | null {
    if (cachedMatrix !== undefined) return cachedMatrix
    const R = getReport()
    if (!R.exact) return (cachedMatrix = null)
    const open = R.branches.filter(b => !b.merged).slice(0, 40), n = open.length
    const cells = open.map(() => open.map(() => [] as string[]))
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const mc = g.run(["merge-tree", "--write-tree", "--name-only", open[i].tip, open[j].tip])
      if (mc.code === 1) cells[i][j] = cells[j][i] = parseConflicts(mc.out)
    }
    return (cachedMatrix = { names: open.map(b => b.name), cells })
  }

  /** O plano como linhas com cor, para o painel do TUI. */
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

  return { getReport, getMatrix, planLines }
}