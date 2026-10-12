// The model: the assignment of each commit to a lane, plus the order and position of
// the lanes.
//
// It is the only thing the two renderers share, and it knows nothing about drawing.
// Built once, from reading the repository — nothing here writes to a ref or to the
// working tree.
//
// `buildModel` is orchestration: read, assign lanes, measure, order and pack, in that
// order. The hard part lives in `lib/lanes.ts` (who owns each commit) and
// `lib/layout.ts` (where each lane sits on the Y axis).

import type { Git } from "../git/index.ts"
import { BG, COL, mix } from "./lib/color.ts"
import { CATEGORY_ORDER, catOf } from "./lib/category.ts"
import { assignLanes } from "./lib/lanes.ts"
import { DX, RH, packLanesY, measureLanes } from "./lib/layout.ts"
import {
  describeDefaultBranches, isDefaultBranch, resolveDefaultBranches, type DefaultBranchSource
} from "./lib/trunks.ts"

// `mix` and the default branches leave through the interface because the TUI and the
// export need them, and `lib/` is private. Divergent color between renderers is a reading
// bug; a default-branch list duplicated inside the template is the same kind of bug.
export { COL, mix, BG, isDefaultBranch, resolveDefaultBranches, describeDefaultBranches, DX, RH, CATEGORY_ORDER, catOf }
export type { DefaultBranchSource }

export type Commit = {
  hash: string
  parents: string[]
  author: string
  email: string
  date: string
  subject: string
  refs: string[]
}

/** A branch as one line of the graph. `list` are the hashes, from newest to oldest. */
export type Lane = {
  name: string
  label: string
  cat: string
  list: string[]
  x0: number
  x1: number
  /** Horizontal extent occupied, in terminal columns (includes the name). */
  L: number
  R: number
  /** Vertical line. In the HTML it is reindexed to 0..n-1 in the graph data. */
  y: number
  /** Tip commit when it is not in the log — the lane is invisible but does not disappear. */
  tipAt?: number
}

export type Model = {
  repo: string
  headHash: string
  /** `git log` order: newest first. */
  commits: Commit[]
  /** The same, reversed: oldest first. It is the X axis. */
  cs: Commit[]
  N: number
  /** All lanes, including invisible and branchless ones. */
  lanes: Lane[]
  /** Lane that owns each commit. */
  owner: Map<string, Lane>
  /** Branch name -> tip hash. Includes remote refs flattened to the short name. */
  tipByBranch: Map<string, string>
  idx: Map<string, number>
  byHash: Map<string, Commit>
  X: number[]
  Y: number[]
  B: Lane[]
  MAXY: number
  /** Fixed labels at the top (today only "tags"). */
  labels: { t: string; y: number }[]
  /** Lanes with nothing to deliver: merged, `ahead 0`, or with no branch at all. */
  inactive: Set<Lane>
  hasTags: boolean
  /** Resolved default branch names, and where they came from. Goes to the export so the template does not guess. */
  defaultBranches: string[]
  defaultBranchSource: DefaultBranchSource
}

export type BuildOptions = {
  /** `--default-branch a,b`, already split. Beats `.gitview.json`, which beats `origin/HEAD`, which beats the name. */
  defaultBranches?: string[]
}

/**
 * The lane's tip: its most recent commit. `list` is newest-first, and a lane whose tip was
 * claimed by another branch carries `tipAt` instead.
 */
export const laneTip = (cs: Commit[], b: Lane): string =>
  b.list[0] ?? (b.tipAt !== undefined ? cs[b.tipAt].hash : "")

/** Index of the lane's tip in `cs` — the key the lanes are ordered by. `tipAt` covers the invisible ones. */
const tipIndex = (idx: Map<string, number>, b: Lane): number => {
  const tip = b.list[0]
  return tip !== undefined ? idx.get(tip)! : (b.tipAt ?? 0)
}

/** Color of a lane, already desaturated when it is inactive. */
export const laneColor = (m: { inactive: Set<Lane> }, b: Lane): string => {
  const c = COL[b.cat] ?? "#b79cf0"
  return m.inactive.has(b) ? mix(c) : c
}

/** Does a lane occupy a line? Invisible ones do not, but they stay in the label column. */
export const visible = (b: Lane): boolean => b.list.length > 0 || b.tipAt !== undefined

/**
 * One log record -> one commit. The field order is the order of the `--pretty=format:` in
 * `readCommits`: hash, parents, author, email, date, refs, subject.
 */
function parseCommit(record: string): Commit {
  const [hash, parents, author, email, date, refs, subject] = record.split("\x1f")
  return {
    hash, parents: parents ? parents.split(" ") : [], author, email, date, subject,
    refs: refs ? refs.split(", ").filter(Boolean) : [],
  }
}

/** Reads the log and turns each line into the corresponding commit. */
function readCommits(g: Git): Commit[] {
  const raw = g.git("log", "--all", "--date-order", "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1e")
  return raw.split("\x1e").map(r => r.trim()).filter(Boolean).map(parseCommit)
}

/**
 * Short branch name -> tip hash.
 *
 * Ignores tags and refs that are not branches. Remote is flattened (`origin/x` → `x`), and
 * the local wins when both point to the same names — what you have on disk rules.
 */
function linkRefs(commits: Commit[]): Map<string, string> {
  const local = new Map<string, string>(), remote = new Map<string, string>()
  for (const c of commits) for (const raw of c.refs) {
    if (raw.startsWith("tag: ") || raw.startsWith("refs/")) continue
    const ref = raw.replace(/^HEAD -> /, "")
    if (ref === "HEAD" || /\/HEAD$/.test(ref)) continue
    if (/^(origin|upstream)\//.test(ref)) {
      const short = ref.replace(/^[^/]+\//, "")
      if (!remote.has(short)) remote.set(short, c.hash)
    } else {
      local.set(ref, c.hash)
    }
  }
  for (const [short, hash] of remote) if (!local.has(short)) local.set(short, hash)
  return local
}

/** hash -> child hashes. Used to discover the lane of a commit without a ref. */
function linkChildren(cs: Commit[]): Map<string, string[]> {
  const kids = new Map<string, string[]>()
  for (const c of cs) for (const p of c.parents) {
    if (!kids.has(p)) kids.set(p, [])
    kids.get(p)!.push(c.hash)
  }
  return kids
}

/**
 * Lanes with nothing to deliver: merged, or merely behind the target.
 *
 * `target` is the first resolved default branch, not the literal `"main"` — it is into it
 * that work flows. Without a default branch, it falls back to HEAD: against HEAD nothing is
 * "behind", so the set comes out empty instead of wrong.
 *
 * Keyed by lane, not by name: a lane with no branch (the leftover commits of a deleted
 * branch, reachable through a merge parent) has nothing left to deliver either — its branch
 * is gone. Keying by name silently skipped exactly those lanes, which is why a merged
 * branchless lane stayed bright while an identical named one went pastel.
 */
function detectInactive(
  g: Git, lanes: Lane[], cs: Commit[], targetHash: string, isDefaultBranchName: (n: string) => boolean,
): Set<Lane> {
  const inactive = new Set<Lane>()
  for (const b of lanes) {
    if (!b.name) { inactive.add(b); continue }
    if (isDefaultBranchName(b.name)) continue
    const tip = laneTip(cs, b)
    if (!tip) continue
    const [, ahead] = g.run(["rev-list", "--left-right", "--count", `${targetHash}...${tip}`])
      .out.trim().split(/\s+/).map(Number)
    if (ahead === 0) inactive.add(b)
  }
  return inactive
}

export function buildModel(g: Git, opts: BuildOptions = {}): Model {
  const commits = readCommits(g)
  if (!commits.length) throw new Error("repository with no commits")
  const headHash = g.git("rev-parse", "HEAD").trim()

  const cs = [...commits].reverse()                                   // oldest first
  const N = cs.length
  const byHash = new Map(cs.map(c => [c.hash, c]))
  const idx = new Map(cs.map((c, i) => [c.hash, i]))
  const kids = linkChildren(cs)
  const tipByBranch = linkRefs(commits)

  const { owner, br } = assignLanes(tipByBranch, idx, byHash, kids, cs)

  // Resolved before layout: pinning and inactive detection depend on the list.
  const tr = resolveDefaultBranches(g, n => tipByBranch.has(n), { flag: opts.defaultBranches })
  const defaultBranches = [
    ...tr.names.filter(n => tipByBranch.has(n)),
    ...[...tipByBranch.keys()].filter(n => !tr.names.includes(n) && catOf(n) === "main"),
  ]
  const rank = (name: string) => defaultBranches.indexOf(name)

  const hasTags = commits.some(c => c.refs.some(r => r.startsWith("tag: ")))
  const labels: { t: string; y: number }[] = hasTags ? [{ t: "tags", y: 0 }] : []
  const ordered = br.filter(visible)
  measureLanes(ordered, idx)

  // A pinned lane sorts above every unpinned one; within each group, newest first.
  const pinned = (b: Lane) => { const i = rank(b.name); return i < 0 ? Number.MAX_SAFE_INTEGER : i }
  ordered.sort((a, b) => pinned(a) - pinned(b) || tipIndex(idx, b) - tipIndex(idx, a))
  const MAXY = packLanesY(ordered, rank, hasTags ? 3 : 1)

  const X = cs.map((_, i) => i * DX)
  const Y = cs.map(c => owner.get(c.hash)!.y)
  const B = cs.map(c => owner.get(c.hash)!)

  const firstDefault = defaultBranches[0]
  const targetHash = (firstDefault && tipByBranch.get(firstDefault)) || headHash
  const inactive = detectInactive(g, br, cs, targetHash, n => rank(n) >= 0)

  return {
    repo: g.repo, headHash, commits, cs, N, lanes: br, owner, tipByBranch, idx, byHash,
    X, Y, B, MAXY, labels, inactive, hasTags,
    defaultBranches, defaultBranchSource: tr.source,
  }
}