// The vertical position of the lanes.
//
// Two rules, in this order:
//
// 1. **A default branch has its own line, at the top.** `main` and `develop` (see
//    `lib/trunks.ts`) stay fixed at the top, in the order of the resolved list, without
//    competing for space.
// 2. **The rest is packed into columns.** A lane only drops to the next line if it
//    *overlaps* horizontally another already placed. Since [L, R] is the occupied extent
//    (leftmost commit to the end of the name), lanes that do not cross in x share the
//    same line — it is what keeps the graph short in a repo with many branches.

import type { Lane } from "../index.ts"

/** Horizontal spacing between commits, in terminal columns. */
export const DX = 4

/** Height of a lane, in lines. */
export const RH = 3

/** Fills x0/x1 (commit extent) and L/R (extent including the name). */
export function measureLanes(lanes: Lane[], idx: Map<string, number>): void {
  for (const b of lanes) {
    const ix = b.list.map(h => idx.get(h)!)
    if (b.tipAt !== undefined) ix.push(b.tipAt)
    b.x0 = Math.min(...ix)
    b.x1 = Math.max(...ix)

    // the name stays centered on the lane, but never shrinks the extent: L/R is what
    // packing uses to decide overlap
    const cx = (b.x0 + b.x1) * DX / 2, len = b.label.length
    b.L = Math.min(b.x0 * DX, Math.floor(cx - len / 2))
    b.R = Math.max(b.x1 * DX, Math.ceil(cx + len / 2))
  }
}

/**
 * Distributes the lanes on the Y axis. `rank` returns the default branch position, or -1.
 * Returns MAXY, used to clamp the pan.
 */
export function packLanesY(ordered: Lane[], rank: (name: string) => number, initialY: number): number {
  const defaultBranches = ordered.filter(b => rank(b.name) >= 0)
  const rest = ordered.filter(b => rank(b.name) < 0)

  defaultBranches.forEach((b, i) => { b.y = initialY + i * RH })
  const baseY = initialY + defaultBranches.length * RH

  // `ends[r]` is the right edge of the last lane placed on line r
  const ends: number[] = []
  for (const b of rest) {
    let r = ends.findIndex(e => e < b.L - 1)
    if (r < 0) { r = ends.length; ends.push(0) }
    ends[r] = b.R
    b.y = baseY + r * RH
  }

  return Math.max(...ordered.map(b => b.y))
}