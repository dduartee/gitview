// The graph drawing in the terminal.
//
// `renderSelf` used to call each step directly, and the edge step alone took 15 lines with
// three chained geometry cases. Here each step is a method, and the drawing order is
// visible on one screen: background, tags, edges, names, commits, column, chrome.
//
// Nothing here decides *what* is the default branch or *what* is a category — that is the
// `model`'s job. The colour and the lane arrive ready; the Painter only knows how to place
// a cell.

import { RGBA, type OptimizedBuffer } from "@opentui/core"
import { BG, laneColor, laneTip, DX, mix, visible, type Lane, type Model } from "../../model/index.ts"

const EDGE = "#9aa3b2"
export const GUT = 12, TOP = 1, BOT = 2

/** RGBA is expensive to build; the graph palette has few values. */
const colorCache = new Map<string, RGBA>()
export const C = (h: string): RGBA => {
  let c = colorCache.get(h)
  if (!c) { c = RGBA.fromHex(h); colorCache.set(h, c) }
  return c
}

/** The viewport: what is in focus and where, to know what is visible and what to dim. */
export type Viewport = {
  sx: number; sy: number
  width: number; height: number; x: number; y: number
  cur: number; hover: number | null
  /** null = everything visible; otherwise, only the ancestors of the selected commit. */
  anc: Set<string> | null
}

export class Painter {
  constructor(private v: Viewport, private buf: OptimizedBuffer, private m: Model) {}

  /** Is a commit in focus? With no ancestors mode, everything is. */
  private on = (h: string) => !this.v.anc || this.v.anc.has(h)

  /** Colour in focus or dimmed, depending on the ancestors mode. */
  private f = (hex: string, ok: boolean) => ok ? hex : mix(hex)

  /** Writes a cell in world coordinates, skipping whatever leaves the viewport. */
  put(wx: number, wy: number, ch: string, fg: string, bg = BG) {
    const { sx, sy, width: W, height: H, x: ox, y: oy } = this.v
    const x = GUT + wx - sx, y = TOP + wy - sy
    if (x < GUT || x >= W || y < TOP || y >= H - BOT) return
    this.buf.setCell(ox + x, oy + y, ch, C(fg), C(bg))
  }

  txt(wx: number, wy: number, s: string, fg: string) {
    for (let i = 0; i < s.length; i++) this.put(wx + i, wy, s[i], fg)
  }

  /** 40-column margin: draws a little off-screen so panning never shows a hole. */
  private vis(wx: number) {
    const x = GUT + wx - this.v.sx
    return x > GUT - 40 && x < this.v.width + 40
  }

  /** Tags at the top, with a dotted line running down to the commit. */
  tags() {
    const { cs, X, Y } = this.m
    for (let i = 0; i < this.m.N; i++) {
      const tags = cs[i].refs.filter(r => r.startsWith("tag: ")).map(r => r.slice(5))
      if (!tags.length || !this.vis(X[i])) continue
      const ok = this.on(cs[i].hash)
      for (let y = 1; y < Y[i]; y++) this.put(X[i], y, "┊", this.f("#3a4150", ok))
      this.txt(X[i] - Math.floor(tags.join(",").length / 2), 0, tags.join(","), this.f("#e3b341", ok))
    }
  }

  /**
   * Edges between commits.
   *
   * Three geometries, in order:
   * 1. same lane → solid line at the lane's height
   * 2. parent and child on the same row → dashed with an arrow, no vertical detour
   * 3. different rows → leaves horizontally, turns vertically in the child's column, enters
   *    with an arrow. It is the "hair" that shows which lane the commit came from.
   */
  edges() {
    const { cs, X, Y, B, idx } = this.m
    for (let i = 0; i < this.m.N; i++) for (const p of cs[i].parents) {
      const j = idx.get(p)
      if (j === undefined) continue
      const ax = X[j], ay = Y[j], bx = X[i], by = Y[i]
      if (!this.vis(ax) && !this.vis(bx)) continue
      const ok = this.on(p) && this.on(cs[i].hash)

      if (B[i] === B[j]) {
        const col = this.f(laneColor(this.m, B[i]), ok)
        for (let x = ax + 1; x < bx; x++) this.put(x, ay, "─", col)
        continue
      }
      const col = this.f(EDGE, ok)
      // The arrowhead carries the colour of the lane the edge links to — the merged-in
      // branch, or the branch a commit forked from — so a merge and a fork read by colour.
      // The dashed path stays neutral and does not compete with the lanes.
      const acol = this.f(laneColor(this.m, B[j]), ok)
      if (ay === by) {
        for (let x = ax + 1; x < bx - 1; x++) this.put(x, ay, "┄", col)
        this.put(bx - 1, ay, "▶", acol)
        continue
      }
      const d = Math.sign(by - ay)
      for (let x = ax + 1; x < bx; x++) this.put(x, ay, "┄", col)
      this.put(bx, ay, d > 0 ? "╮" : "╯", col)
      for (let y = ay + d; y !== by - d; y += d) this.put(bx, y, "┆", col)
      this.put(bx, by - d, d > 0 ? "▼" : "▲", acol)
    }
  }

  /** Each branch name at the tip of its lane — it is the tool's main reading. */
  laneNames() {
    for (const b of this.m.lanes) {
      if (!visible(b) || !b.label) continue
      const ok = !this.v.anc || b.list.some(h => this.v.anc!.has(h))
      this.txt(b.x1 * DX + 2, b.y, b.label, this.f(laneColor(this.m, b), ok))
    }
  }

  /** The dots: `●` normal, `◉` merge, and brackets on the selected one. */
  commits() {
    const { cs, X, Y, B } = this.m
    for (let i = 0; i < this.m.N; i++) {
      if (!this.vis(X[i])) continue
      const ok = this.on(cs[i].hash), isCur = i === this.v.cur
      const bg = isCur ? "#2b3550" : i === this.v.hover ? "#232938" : BG
      this.put(X[i], Y[i], cs[i].parents.length > 1 ? "◉" : "●", this.f(laneColor(this.m, B[i]), ok), bg)
      if (isCur) { this.put(X[i] - 1, Y[i], "[", "#ffffff"); this.put(X[i] + 1, Y[i], "]", "#ffffff") }
    }
  }

  /** Left column, which does not scroll with the pan: fixed labels + abbreviated name per lane. */
  fixedColumn() {
    const { x: ox, y: oy, height: H } = this.v
    this.buf.fillRect(ox, oy + TOP, GUT, H - TOP - BOT, C(BG))

    for (const l of this.m.labels) {
      const y = TOP + l.y - this.v.sy
      if (y >= TOP && y < H - BOT) this.buf.drawText(l.t, ox + 1, oy + y, C("#7a828e"))
    }
    for (const b of this.m.lanes) {
      if (!visible(b)) continue
      const y = TOP + b.y - this.v.sy
      if (y < TOP || y >= H - BOT) continue
      const nm = this.shortName(b)
      this.buf.drawText(nm, ox + 1, oy + y, C(b.name ? laneColor(this.m, b) : "#5b6470"))
    }
  }

  /** 11 columns cannot fit `feature/imu-admin-upload-curation`: abbreviates the known prefix. */
  private shortName(b: Lane): string {
    const tip = laneTip(this.m.cs, b)
    const abbreviated = (b.name
      ? b.name.replace(/^(feature|feat)\//, "f/").replace(/^(hotfix|fix)\//, "h/").replace(/^release\//, "r/")
          .replace(/^(docs|doc)\//, "d/").replace(/^chore\//, "c/").replace(/^(migracao|migration)\//, "m/")
          .replace(/^test\//, "t/").replace(/^sync\//, "s/").replace(/^codespace\//, "cs/")
      : "~" + tip.slice(0, 7))
    return abbreviated.length > GUT - 1 ? abbreviated.slice(0, GUT - 2) + "…" : abbreviated
  }
}