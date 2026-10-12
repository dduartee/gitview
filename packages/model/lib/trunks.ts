// Which lanes are default branches.
//
// No import of `../index.ts` on purpose: `catOf` lives in `lib/category.ts` and is
// re-exported by the interface. Importing the index from inside lib would create the
// cycle index → trunks → index, which dependency-cruiser's `no-circular` rejects.
//
// A default branch is the long line: the branch features aim at and that stays pinned
// at the top of the Y axis. It cannot be guessed from the graph — measuring "how many
// descendants" ranks `origin/21.03` (an old release, ancestor of everything) above
// `develop`. What resolves it is **declaration**, in order of authority:
//
//   1. `--default-branch a,b` on the command line — the user, now
//   2. `.gitview.json` in the repo               — the team, versioned
//   3. `refs/remotes/origin/HEAD`                — the remote, on which branch is default
//   4. name convention (category `main`)         — the industry default
//
// Each source beats the next. None of them is a hardcoded list in the code.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Git } from "../../git/index.ts"
import { catOf } from "./category.ts"

/** Where the list came from. Shows in the UI and the log, so nobody has to guess why. */
export type DefaultBranchSource = "flag" | "config" | "remote-head" | "name" | "none"

export type DefaultBranches = {
  /** Branch names, flattened from `origin/x` to `x`. */
  names: string[]
  source: DefaultBranchSource
}

export type DefaultBranchOptions = {
  /** `--default-branch a,b`, already split. Empty = did not come from the CLI. */
  flag?: string[]
}

/** `refs/remotes/<remote>/HEAD` → `main`. Only works if the remote has a symbolic ref. */
function fromRemoteHead(g: Git): string[] {
  const r = g.run(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).out.trim()
  if (!r) return []
  const name = r.replace(/^[^/]+\//, "")
  return name ? [name] : []
}

/** `.gitview.json` at the repo root, if it exists and parses. */
function fromConfig(g: Git): string[] {
  let txt: string
  try { txt = readFileSync(resolve(g.repo, ".gitview.json"), "utf8") }
  catch { return [] }
  try {
    const j = JSON.parse(txt)
    const t = j?.defaultBranches
    return Array.isArray(t) ? t.filter((x: unknown): x is string => typeof x === "string" && !!x) : []
  } catch (e) {
    console.error("warning: invalid .gitview.json, ignoring —", e instanceof Error ? e.message : String(e))
    return []
  }
}

/** Only the branches the name convention calls `main` and that actually exist. */
function fromNames(g: Git, exists: (n: string) => boolean): string[] {
  return ["main", "master", "prod", "production"].filter(n => exists(n))
}

/**
 * Resolves the default branches. `exists` takes a name and says whether a local branch
 * with that name exists — injected so this does not depend on `Model` and stays testable
 * through the interface.
 */
export function resolveDefaultBranches(g: Git, exists: (n: string) => boolean, opts: DefaultBranchOptions = {}): DefaultBranches {
  if (opts.flag?.length) return { names: opts.flag, source: "flag" }
  const cfg = fromConfig(g)
  if (cfg.length) return { names: cfg, source: "config" }
  const rh = fromRemoteHead(g)
  if (rh.length) return { names: rh, source: "remote-head" }
  const nm = fromNames(g, exists)
  if (nm.length) return { names: nm, source: "name" }
  return { names: [], source: "none" }
}

/**
 * A name counts as a default branch both by its exact name and by category `main`.
 *
 * The category covers `team/platform/main`, which is in no list and is still a default
 * branch. `catOf` already makes that judgement and is the same function that gives the
 * color, so the two agree by construction.
 */
export const isDefaultBranch = (name: string, db: DefaultBranches): boolean =>
  db.names.includes(name) || catOf(name) === "main"

/** One line for the status bar / HTML header: where the list came from. */
export const describeDefaultBranches = (db: DefaultBranches): string => {
  if (db.source === "none" || !db.names.length) return "no default branch detected"
  const list = db.names.join(", ")
  switch (db.source) {
    case "flag": return `default branch (--default-branch): ${list}`
    case "config": return `default branch (.gitview.json): ${list}`
    case "remote-head": return `default branch (origin/HEAD): ${list}`
    default: return `default branch (name convention): ${list}`
  }
}