// Merge plan and conflict matrix.
//
// `getReport` is the deepest module in the project: a call with no arguments, and behind it
// there is a git version probe, ref categorization, merge target selection, merge-base,
// rev-list, diff, merge-tree and sequential simulation with commit-tree.
//
// Nothing here touches a ref or the working tree. Simulations use `commit-tree` to create
// orphan objects, which git discards when nobody references them.

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
  /** `null` when it could not be determined (old git, or a merge-tree error). `[]` when it could, and there is no conflict. */
  conflicts: string[] | null
  risk: string
  date: string
}

export type Report = {
  generated: string
  repo: string
  head: string
  gitVersion: string
  /** Exact conflicts (`merge-tree --write-tree`, git >= 2.38) or an estimate by shared files. */
  exact: boolean
  targets: { name: string; steps: Step[] }[]
  branches: BranchRow[]
}

export type Matrix = { names: string[]; cells: string[][][] }

export type MergeFlags = { main?: string; dev?: string }

type Ref = { name: string; tip: string; cat: string }

/**
 * Output lines of `merge-tree --write-tree` that are files in conflict.
 * The first line is the header ("<info>"), hence `i = 1`.
 */
const parseConflicts = (out: string): string[] => {
  const lines = out.split("\n"), files: string[] = []
  for (let i = 1; i < lines.length && lines[i] !== ""; i++) files.push(lines[i])
  return [...new Set(files)]
}

// git >= 2.38 has `merge-tree --write-tree`, which gives the exact conflict; before that, only an estimate.
function supportsMergeTree(g: Git): { exact: boolean; version: string } {
  const gv = g.run(["--version"]).out.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  const major = Number(gv?.[1] ?? 0), minor = Number(gv?.[2] ?? 0)
  const exact = major > 2 || (major === 2 && minor >= 38)
  return { exact, version: gv?.[0] ?? "?" }
}

// code 1 brings the conflict list on stdout; code 2 is a real error
function conflictsBetween(g: Git, a: string, b: string): string[] | null {
  const r = g.run(["merge-tree", "--write-tree", "--name-only", a, b])
  return r.code === 0 ? [] : r.code === 1 ? parseConflicts(r.out) : null
}

// the flag wins; without a flag, the most recent branch in the category. `develop` is included
// because its category is `dev` — see packages/model/lib/category.ts on why it is not `main`.
function resolveTargets(g: Git, m: Model, refs: Ref[], flags: MergeFlags): { main?: Ref; dev?: Ref } {
  const newest = (a: Ref, b: Ref) => m.idx.get(b.tip)! - m.idx.get(a.tip)!
  const pick = (cat: string, pref?: string) =>
    refs.find(r => r.name === pref) ?? refs.filter(r => r.cat === cat).sort(newest)[0]
  return { main: pick("main", flags.main), dev: pick("dev", flags.dev) }
}

// undefined when the branch is itself the target
function mergeTargetOf(r: Ref, main?: Ref, dev?: Ref): Ref | undefined {
  if (r === main) return undefined
  const t = r.cat === "feature" || r.cat === "other" ? (dev ?? main) : main
  return t && t !== r ? t : undefined
}

const sizeOf = (x: BranchRow) => (x.conflicts ?? x.overlap).length

const riskOf = (merged: boolean, n: number) =>
  merged ? "merged" : n === 0 ? "low" : n <= 2 ? "medium" : "high"

function evaluateBranch(g: Git, m: Model, r: Ref, t: Ref, exact: boolean): BranchRow {
  const base = g.run(["merge-base", t.tip, r.tip]).out.trim()
  const [behind, ahead] = g.run(["rev-list", "--left-right", "--count", `${t.tip}...${r.tip}`]).out.trim().split(/\s+/).map(Number)
  const merged = ahead === 0

  // diff is expensive and says nothing on an already merged branch
  const files = (a: string, b: string) =>
    (base && !merged ? g.run(["diff", "--name-only", a, b]).out.split("\n").filter(Boolean) : [])
  const mine = files(base, r.tip)
  const theirs = new Set(files(base, t.tip))
  const overlap = mine.filter(f => theirs.has(f))

  const conflicts = exact && !merged ? conflictsBetween(g, t.tip, r.tip) : null
  return {
    name: r.name, cat: r.cat, tip: r.tip, into: t.name, base, ahead, behind, merged,
    files: mine.length, overlap, conflicts,
    risk: riskOf(merged, (conflicts ?? overlap).length),
    date: m.byHash.get(r.tip)!.date,
  }
}

/**
 * Simulates the merges IN SEQUENCE: each step against the result of the previous one, not against the
 * original target. That is why the risk of a pair changes with the order. Synthetic commits come from
 * `commit-tree`, which only creates orphan objects — no ref moves.
 */
function planFor(g: Git, m: Model, name: string, rows: BranchRow[], refs: Ref[], exact: boolean): { name: string; steps: Step[] } {
  const target = refs.find(r => r.name === name)!
  const pending = rows.filter(x => x.into === name && !x.merged).sort((a, b) => sizeOf(a) - sizeOf(b) || a.ahead - b.ahead)

  let cursor = target.tip
  const steps: Step[] = pending.map(x => {
    let clean = sizeOf(x) === 0, conflicts = x.conflicts ?? x.overlap
    if (exact) {
      const r = g.run(["merge-tree", "--write-tree", "--name-only", cursor, x.tip])
      if (r.code === 0) {
        clean = true; conflicts = []
        const c = g.run(["commit-tree", r.out.split("\n")[0].trim(), "-p", cursor, "-p", x.tip, "-m", "gitview: simulation"], SIM_ENV)
        if (c.code === 0) cursor = c.out.trim()
      } else if (r.code === 1) { clean = false; conflicts = parseConflicts(r.out) }
    }
    // risk accounts for the suggested order, so it is recomputed from this step's conflicts
    const risk = conflicts.length ? (conflicts.length <= 2 ? "medium" : "high") : x.risk
    return { name: x.name, tip: x.tip, clean, conflicts, ahead: x.ahead, behind: x.behind, risk }
  })
  return { name, steps }
}

/** The plan as colored lines, for the TUI panel. Depends only on the report, so it does not live in the closure. */
export function planLines(R: Report): { t: string; c: string }[] {
  const L: { t: string; c: string }[] = [], add = (t: string, c = "#d9dce3") => L.push({ t, c })
  add(`${R.exact ? "exact conflicts (git merge-tree)" : "estimate by shared files (git < 2.38)"} · ${R.branches.length} branches analyzed`, "#8a919c")
  for (const t of R.targets) {
    add(""); add(`→ ${t.name}   (${t.steps.length} to merge, in the suggested order)`, "#e4e7ec")
    t.steps.forEach((s, i) => {
      add(`${String(i + 1).padStart(2)}. ${s.name}   ${s.clean ? "✔ clean" : `⚠ ${s.conflicts.length} conflict(s)`}   +${s.ahead}/-${s.behind}`, s.clean ? "#3fb950" : "#f0883e")
      s.conflicts.slice(0, 6).forEach(f => add(`        ${f}`, "#8a919c"))
      if (s.conflicts.length > 6) add(`        … +${s.conflicts.length - 6}`, "#8a919c")
    })
  }
  const done = R.branches.filter(b => b.merged)
  add(""); add(`Already merged (${done.length}): ${done.map(b => b.name).join(", ") || "—"}`, "#8a919c")
  return L
}

/** Cap on the conflict matrix. `merge-tree` costs O(n²), so only the newest open branches enter. */
const MATRIX_CAP = 40

/**
 * Lane × lane conflicts, `null` when the git is too old for an exact conflict.
 *
 * WARNING: the cut is silent. With more open branches than `MATRIX_CAP` the matrix comes out
 * incomplete and nothing in the terminal warns about it — the HTML says so, the TUI does not. See open issue.
 */
function buildMatrix(g: Git, R: Report): Matrix | null {
  if (!R.exact) return null
  const open = R.branches.filter(b => !b.merged).slice(0, MATRIX_CAP)
  const n = open.length
  const cells = open.map(() => open.map(() => [] as string[]))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const mc = g.run(["merge-tree", "--write-tree", "--name-only", open[i].tip, open[j].tip])
    if (mc.code !== 1) continue
    const files = parseConflicts(mc.out)
    cells[i][j] = files; cells[j][i] = files
  }
  return { names: open.map(b => b.name), cells }
}

export function createMergePlanner(g: Git, m: Model, flags: MergeFlags = {}) {
  let cached: Report | null = null
  let cachedMatrix: Matrix | null | undefined

  function getReport(): Report {
    if (cached) return cached

    const { exact, version } = supportsMergeTree(g)
    const refs: Ref[] = [...m.tipByBranch].map(([name, tip]) => ({ name, tip, cat: catOf(name) }))
    const { main, dev } = resolveTargets(g, m, refs, flags)

    const rows: BranchRow[] = []
    for (const r of refs) {
      const t = mergeTargetOf(r, main, dev)
      if (t) rows.push(evaluateBranch(g, m, r, t, exact))
    }

    const targets = [...new Set(rows.filter(x => !x.merged).map(x => x.into))]
      .map(name => planFor(g, m, name, rows, refs, exact))

    return (cached = {
      generated: new Date().toISOString(), repo: m.repo, head: m.headHash,
      gitVersion: version, exact, targets, branches: rows,
    })
  }

  /** Cached wrapper: the matrix is a second O(n²) pass, so it is computed at most once. */
  function getMatrix(): Matrix | null {
    if (cachedMatrix !== undefined) return cachedMatrix
    return (cachedMatrix = buildMatrix(g, getReport()))
  }

  return { getReport, getMatrix, planLines }
}