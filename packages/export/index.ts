// The HTML export: a single file, no CDN, no external JS, no build.
//
// Takes the model and writes the **graph data** — the serialized shape the template
// consumes via `window.__GRAPH__`. It is the contract between the two renderers.

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Git } from "../git/index.ts"
import { visible, type Lane, type Model } from "../model/index.ts"
import type { Matrix, Report } from "../merge/index.ts"
import { TPL_DAG } from "./lib/template.ts"

export { TPL_DAG }

/** What goes inside the HTML. It is the contract — changing here breaks every old export. */
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
    branchless: 0 | 1
    merged: 0 | 1
  }[]
  laneOf: number[]
  /** Default branches resolved by the model and where they came from. The template uses this instead of repeating the list. */
  defaultBranches: string[]
  defaultBranchSource: string
  report: Report & { matrix: Matrix | null }
}

/**
 * Builds the graph data.
 *
 * In the HTML each lane is a row: the model's `y` (terminal spacing, `RH = 3`) is
 * reindexed to 0..n-1 here, preserving order. The order comes from the model; only the
 * density changes.
 *
 * `lanesInOrder` returns [lane, y-in-html] pairs instead of writing `lane.y` — the
 * terminal renderer holds the same live lanes and needs them to stay where they were.
 */
export function project(g: Git, m: Model, report: Report, matrix: Matrix | null): Graph {
  const refs = g.run(["for-each-ref", "--format=%(refname)\t%(objectname)", "refs/heads", "refs/remotes", "refs/tags"]).out
    .split("\n").filter(Boolean)
    .map(l => { const [name, hash] = l.split("\t"); return { name, hash } })

  const vis = m.lanes.filter(visible).sort((a, b) => a.y - b.y)
  const lanesInOrder = vis.map((b, i): [Lane, number] => [b, i])
  const yInHtml = new Map(lanesInOrder)
  const mergedRefs = new Set(report.branches.filter(b => b.merged).map(b => b.name))

  return {
    repo: m.repo,
    commits: m.cs,
    refs,
    head: m.headHash,
    lanes: lanesInOrder.map(([b, y]) => ({
      name: b.name,
      label: b.label,
      cat: b.cat,
      x0: b.x0,
      x1: b.x1,
      y,
      listLen: b.list.length,
      branchless: (b.name ? 0 : 1) as 0 | 1,
      merged: (mergedRefs.has(b.name) ? 1 : 0) as 0 | 1,
    })),
    laneOf: m.cs.map(c => yInHtml.get(m.owner.get(c.hash)!) ?? -1),
    defaultBranches: m.defaultBranches,
    defaultBranchSource: m.defaultBranchSource,
    report: { ...report, matrix },
  }
}

/**
 * Writes the HTML to `file`.
 *
 * `template` swaps the built-in for a file of its own — falls back to the built-in if the
 * path does not exist, instead of failing.
 */
export function exportHtml(g: Git, m: Model, report: Report, matrix: Matrix | null, file: string, template?: string): string {
  let tpl = TPL_DAG
  if (template) {
    try { tpl = readFileSync(resolve(template), "utf8") }
    catch { console.error("template not found, falling back to built-in:", template) }
  }
  const data = JSON.stringify(project(g, m, report, matrix)).replace(/</g, "\\u003c")
  const out = resolve(file)
  writeFileSync(out, tpl.replace("window.__GRAPH__ = null", () => `window.__GRAPH__ = ${data}`))
  return out
}