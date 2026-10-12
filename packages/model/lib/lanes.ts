// The assignment of each commit to a lane.
//
// It is the core of the model, and the algorithm has two phases with different purposes:
//
// 1. **By branch tip**: each branch walks first-parent from its tip and claims the
//    commits that still have no owner. This makes the meat of a feature belong to the
//    feature, not to the default branch it came from.
// 2. **Leftovers**: whatever is left has no ref — commits from already-deleted branches,
//    which stay in the graph as branchless. They go to the lane of the first child that
//    already has an owner, or to a nameless lane.

import type { Commit, Lane } from "../index.ts"
import { CATEGORY_ORDER, catOf } from "./category.ts"

/** Creates an empty lane and registers it in the list. `label` is the name truncated to fit the column. */
const newLane = (lanes: Lane[]) => (name: string, cat: string): Lane => {
  const b: Lane = {
    name,
    label: name.length > 36 ? name.slice(0, 35) + "…" : name,
    cat,
    list: [],
    x0: 0, x1: 0, L: 0, R: 0, y: 0,
  }
  lanes.push(b)
  return b
}

type Lanes = { owner: Map<string, Lane>; br: Lane[] }

/**
 * @param loc       branch name -> tip hash
 * @param idx       hash -> position in `cs` (oldest first)
 * @param byHash    hash -> commit
 * @param kids      hash -> child hashes
 * @param cs        commits, oldest first
 */
export function assignLanes(
  loc: Map<string, string>,
  idx: Map<string, number>,
  byHash: Map<string, Commit>,
  kids: Map<string, string[]>,
  cs: Commit[],
): Lanes {
  const owner = new Map<string, Lane>()
  const br: Lane[] = []
  const mk = newLane(br)

  // Sorts the tips by category priority and then by date: on a tie, the newest branch of
  // each category claims first, and higher-priority ones before lower.
  const tips = [...loc].map(([n, h]) => ({ n, h, cat: catOf(n) }))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat) || idx.get(b.h)! - idx.get(a.h)!)

  for (const t of tips) {
    const b = mk(t.n, t.cat)
    let h: string | undefined = t.h
    // walks back through first-parent, stopping at the first already-claimed commit
    while (h && byHash.has(h) && !owner.has(h)) {
      owner.set(h, b)
      b.list.push(h)
      h = byHash.get(h)!.parents[0]
    }
    // tip that claimed no exclusive commit (another branch already had the same tip):
    // records the position so the lane stays visible without a list
    if (!b.list.length) b.tipAt = idx.get(t.h)!
  }

  // a commit was left with no owner: it came from a deleted branch
  for (let i = cs.length - 1; i >= 0; i--) {
    const h = cs[i].hash
    if (owner.has(h)) continue
    // looks for a child that already has a lane and whose first-parent is this commit: it
    // is the lane this commit continued, so the branchless commit belongs to it
    const child = (kids.get(h) ?? []).find(k => byHash.get(k)!.parents[0] === h)
    const b = (child && owner.get(child)) || mk("", "other")
    owner.set(h, b)
    b.list.push(h)
  }

  return { owner, br }
}