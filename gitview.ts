#!/usr/bin/env bun
// gitview — git graph by lanes in the terminal (OpenTUI), and single-file HTML export.
//
// Composition root app: it only parses arguments and picks what to run. All the logic
// lives in the packages, reachable by import — this file is the only one that does
// process I/O and the only one with a boot side effect.
//
// usage: bun gitview.ts [repo-path] [options]

import { existsSync } from "node:fs"
import { basename, resolve } from "node:path"
import { createGit } from "./packages/git/index.ts"
import { visible, buildModel, describeDefaultBranches, type Model } from "./packages/model/index.ts"
import { createMergePlanner } from "./packages/merge/index.ts"
import { exportHtml } from "./packages/export/index.ts"
import { startTui } from "./packages/tui/index.ts"

const VERSION = "1.2"

/** Flags that consume the next argument. The value can't be read as a repo. */
const VALUED = new Set(["--export", "--template", "--main", "--dev", "--default-branch"])

const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }

/**
 * First argument that is neither a flag nor a flag value.
 *
 * This used to be `args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i-1].startsWith("--")))`,
 * which silently discarded a repo given *after* any flag: `gitview --dump ~/other`
 * analyzed the current directory. See open issue.
 */
function repoArg(): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (VALUED.has(a)) { i++; continue }
    if (a.startsWith("-")) continue
    return a
  }
  return undefined
}

function main() {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`gitview ${VERSION} — git graph by lanes in the terminal (OpenTUI)

usage: gitview [repo] [options]

options:
  --export <file.html>      export self-contained HTML graph (DAG + refs + plan + matrix)
  --template <file.html>    use your own template; falls back to built-in if missing
  --main <branch>           main branch of the merge plan (default: autodetect)
  --dev <branch>            development branch (default: autodetect)
  --default-branch <a,b>    branches pinned to the top of the Y axis (default: autodetect)
  --dump                    list the lane model and exit (debug)
  --version                 version
  -h, --help                this help

keys in the TUI:
  click / arrows   select commit       double-click / Enter   ancestors
  p                merge plan          e                      export HTML
  q                quit

examples:
  gitview .
  gitview ~/Projects/my-repo --export graph.html
  gitview ~/Projects/my-repo --dump`)
    return
  }
  if (args.includes("--version")) { console.log(`gitview ${VERSION}`); return }

  const repo = repoArg() ?? process.cwd()
  if (!existsSync(resolve(repo))) { console.error("path not found:", repo); process.exit(1) }

  const g = createGit(resolve(repo))
  if (g.run(["rev-parse", "--is-inside-work-tree"]).code) { console.error("not a git repository:", g.repo); process.exit(1) }

  const defaultBranchFlag = flag("--default-branch")
  let m: Model
  try { m = buildModel(g, { defaultBranches: defaultBranchFlag ? defaultBranchFlag.split(",").map(s => s.trim()).filter(Boolean) : undefined }) }
  catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) }

  const planner = createMergePlanner(g, m, { main: flag("--main"), dev: flag("--dev") })

  if (args.includes("--dump")) {
    const visibleLanes = m.lanes.filter(visible)
    console.log(`commits: ${m.N}  lanes: ${visibleLanes.length}  refs: ${m.loc.size}  ${describeDefaultBranches({ names: m.defaultBranches, source: m.defaultBranchSource })}`)
    for (const b of [...visibleLanes].sort((a, b) => a.y - b.y)) {
      console.log(`${String(b.list.length).padStart(4)}${b.tipAt !== undefined ? "*" : " "} ${b.cat.padEnd(8)} ${b.name || "(no branch)"}`)
    }
    // The original dump had an `else if (b.name)` here printing "(invisible: tip outside
    // the log)". It was dead code: the filter above had already removed those lanes. Left
    // out on purpose — resurrecting it is a feature, not a refactor. See open issue.
    return
  }

  const exportTo = flag("--export")
  if (exportTo) {
    try {
      console.log("exported:", exportHtml(g, m, planner.getReport(), planner.getMatrix(), exportTo, flag("--template")))
      return
    } catch (e) { console.error("export error:", e instanceof Error ? e.message : String(e)); process.exit(1) }
  }

  startTui({
    m,
    planner,
    onExport: () => exportHtml(g, m, planner.getReport(), planner.getMatrix(), `gitview-${basename(resolve(g.repo))}.html`),
  })
}

if (import.meta.main) main()