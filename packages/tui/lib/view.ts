// The graph view in the terminal.
//
// Navigation state (selection, pan, zoom, panel) and the drawing. The class is
// self-contained: it receives everything it needs through the constructor, and `renderSelf`
// is a list of calls.
//
// Nothing here decides *what* is the default branch or *what* is a category — that is the
// `model`'s job. The colour and the lane arrive ready; the view only knows how to place a
// cell.

import { Renderable, type MouseEvent, type OptimizedBuffer, type RenderContext } from "@opentui/core"
import { BG, DX, visible, type Model } from "../../model/index.ts"
import type { createMergePlanner } from "../../merge/index.ts"
import { BOT, C, GUT, Painter, TOP } from "./pintor.ts"

/** Ancestors of the selected commit, or null when not filtering. */
type Ancestors = Set<string> | null

/** Pan can go two columns past the left edge, so the first lane is not glued to the gutter. */
const MIN_SX = -2

export class GitView extends Renderable {
  cur: number
  sx = 0; sy = 0
  anc: Ancestors = null
  hover: number | null = null
  panel = false
  pscroll = 0
  msg = ""
  private ready = false
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null
  private last = { i: -1, t: 0 }

  constructor(
    ctx: RenderContext,
    private m: Model,
    private planner: ReturnType<typeof createMergePlanner>,
    private onExport: () => string,
  ) {
    super(ctx, { id: "lanes", width: "100%", height: "100%" })
    this.cur = m.idx.get(m.headHash) ?? m.N - 1
  }

  /** The viewport the Painter draws. An object, so the Painter does not know the Renderable. */
  private viewport() {
    return {
      sx: this.sx, sy: this.sy, width: this.width, height: this.height,
      x: this.x, y: this.y, cur: this.cur, hover: this.hover, anc: this.anc,
    }
  }

  /** Keeps the selected commit on screen, with a margin. */
  reveal() {
    const vw = this.width - GUT, vh = this.height - TOP - BOT
    const x = this.m.X[this.cur], y = this.m.Y[this.cur]
    if (x - this.sx < 3) this.sx = x - 3
    if (x - this.sx > vw - 5) this.sx = x - vw + 5
    if (y - this.sy < 1) this.sy = Math.max(0, y - 1)
    if (y - this.sy > vh - 3) this.sy = y - vh + 3
    this.sx = Math.max(MIN_SX, this.sx)
  }

  private clamp() {
    this.sx = Math.min(Math.max(MIN_SX, this.sx), this.m.X[this.m.N - 1])
    this.sy = Math.min(Math.max(0, this.sy), this.m.MAXY)
  }

  /** The commit under the pointer, or the branch tip if the pointer is on the name. -1 if none. */
  private hit(ex: number, ey: number): number {
    const wx = ex - this.x - GUT + this.sx, wy = ey - this.y - TOP + this.sy
    const i = Math.round(wx / DX)
    if (i >= 0 && i < this.m.N && Math.abs(this.m.X[i] - wx) <= 1 && this.m.Y[i] === wy) return i
    for (const b of this.m.lanes) {
      if (!b.label || !visible(b) || wy !== b.y) continue
      const s = b.x1 * DX + 2
      if (wx >= s && wx < s + b.label.length) return b.x1
    }
    return -1
  }

  protected override onMouseEvent(e: MouseEvent) {
    if (this.panel) {
      if (e.type === "scroll" && e.scroll) {
        this.pscroll = Math.max(0, this.pscroll + (e.scroll.direction === "up" ? -3 : 3))
        this.requestRender()
      }
      return
    }
    switch (e.type as string) {
      case "down":
        if (e.button === 0) this.drag = { x: e.x, y: e.y, sx: this.sx, sy: this.sy, moved: false }
        break
      case "drag":
        if (this.drag) {
          const dx = this.drag.x - e.x, dy = this.drag.y - e.y
          if (Math.abs(dx) + Math.abs(dy) > 1) this.drag.moved = true
          if (this.drag.moved) { this.sx = this.drag.sx + dx; this.sy = this.drag.sy + dy; this.clamp() }
        }
        break
      case "up": {
        const d = this.drag; this.drag = null
        if (!d || d.moved || e.button !== 0) break
        const i = this.hit(e.x, e.y)
        if (i < 0) { this.anc = null; break }
        this.select(i)
        break
      }
      case "scroll": {
        const s = e.scroll; if (!s) break
        const dir = s.direction as string, n = Math.max(1, Math.round(Number(s.delta) || 1))
        const sign = dir === "up" || dir === "left" ? -1 : 1
        if (dir === "left" || dir === "right" || !e.modifiers?.shift) this.sx += sign * 8 * n
        else this.sy += sign * 3 * n
        this.clamp()
        break
      }
      case "move": case "over": {
        const i = this.hit(e.x, e.y), h = i < 0 ? null : i
        if (h !== this.hover) { this.hover = h; this.requestRender() }
        return
      }
      case "out":
        if (this.hover !== null) { this.hover = null; this.requestRender() }
        return
      default: return
    }
    this.requestRender()
  }

  /** Defers expensive work out of the render cycle, and shows the error in the status bar. */
  private later(f: () => void) {
    setTimeout(() => {
      try { f() } catch (e) { this.msg = "error: " + this.err(e) }
      this.requestRender()
    }, 30)
  }

  /** Message of an unknown thrown value, for the status bar. */
  private err(e: unknown): string { return e instanceof Error ? e.message : String(e) }

  openPlan() {
    this.msg = "analyzing merges…"; this.requestRender()
    this.later(() => { this.planner.getReport(); this.panel = true; this.pscroll = 0; this.msg = "" })
  }

  doExport() {
    this.msg = "analyzing and exporting…"; this.requestRender()
    this.later(() => {
      try {
        this.msg = "exported: " + this.onExport()
        setTimeout(() => { this.msg = ""; this.requestRender() }, 7000)
      } catch (e) { this.msg = "error: " + this.err(e); this.requestRender() }
    })
  }

  handleKey(name: string, shift: boolean) {
    if (this.panel) {
      if (name === "p" || name === "escape") this.panel = false
      else if (name === "up") this.pscroll = Math.max(0, this.pscroll - 1)
      else if (name === "down") this.pscroll++
      else if (name === "pageup") this.pscroll = Math.max(0, this.pscroll - 10)
      else if (name === "pagedown") this.pscroll += 10
      this.requestRender(); return
    }
    this.hover = null
    if (name === "left") this.cur = Math.max(0, this.cur - (shift ? 20 : 1))
    else if (name === "right") this.cur = Math.min(this.m.N - 1, this.cur + (shift ? 20 : 1))
    else if (name === "up" || name === "down") { this.neighborLane(name === "up" ? -1 : 1) }
    else if (name === "home" || (name === "g" && !shift)) this.cur = 0
    else if (name === "end" || (name === "g" && shift)) this.cur = this.m.N - 1
    else if (name === "h") this.cur = this.m.idx.get(this.m.headHash) ?? this.m.N - 1
    else if (name === "p") { this.openPlan(); return }
    else if (name === "e") { this.doExport(); return }
    else if (name === "return" || name === "enter") this.toggle()
    this.reveal(); this.requestRender()
  }

  /** The nearest commit in the lane above (d = -1) or below (d = +1). */
  private neighborLane(d: number) {
    let best = -1, bs = 1e9
    for (let i = 0; i < this.m.N; i++) {
      const dy = (this.m.Y[i] - this.m.Y[this.cur]) * d
      if (dy <= 0) continue
      // vertical distance weighs 10000× the horizontal: it picks the lane first, then the commit
      const s = dy * 10000 + Math.abs(this.m.X[i] - this.m.X[this.cur])
      if (s < bs) { bs = s; best = i }
    }
    if (best >= 0) this.cur = best
  }

  /**
   * Selects a commit. A second click on the same commit within 400ms toggles the ancestor
   * filter; `last` is cleared so a third click starts a fresh pair.
   */
  private select(i: number) {
    const now = Date.now()
    const double = i === this.last.i && now - this.last.t < 400
    this.cur = i
    this.last = double ? { i: -1, t: 0 } : { i, t: now }
    if (double) { this.anc = null; this.toggle() }
  }

  /** Toggles the ancestors filter. `null` shows everything again. */
  toggle() {
    if (this.anc) { this.anc = null; return }
    const s = new Set<string>(), stack = [this.m.cs[this.cur].hash]
    while (stack.length) {
      const h = stack.pop()!
      if (s.has(h)) continue
      s.add(h)
      this.m.byHash.get(h)?.parents.forEach(p => stack.push(p))
    }
    this.anc = s
  }

  protected override renderSelf(buf: OptimizedBuffer) {
    if (!this.ready) { this.ready = true; this.reveal() }
    const p = new Painter(this.viewport(), buf, this.m)

    buf.fillRect(this.x, this.y, this.width, this.height, C(BG))
    p.tags()           // yellow markers at the top
    p.edges()          // links, including the "hair" between lanes
    p.laneNames()      // each branch name at its tip
    p.commits()        // the dots
    p.fixedColumn()    // abbreviated names, which do not scroll with the pan
    this.chrome(buf)   // header and footer
    if (this.panel) this.mergePanel(buf)
  }

  private chrome(buf: OptimizedBuffer) {
    const { x: ox, y: oy, width: W, height: H } = this
    const hbg = C("#1b1e25")
    const c = this.m.cs[this.hover ?? this.cur]
    const outOfView = this.m.lanes.filter(b => visible(b) && (b.y < this.sy || b.y > this.sy + H - TOP - BOT - 1)).length
    // The default branch shows because the TUI has no pinning toggle: here the list is
    // always applied. The HTML has the switch, so there it is optional.
    const defaultBranchHint = this.m.defaultBranches.length ? ` · default branch: ${this.m.defaultBranches.join(", ")}` : " · no default branch"

    buf.fillRect(ox, oy, W, 1, hbg)
    buf.drawText(` gitview  ${this.m.repo}  ${this.m.N} commits · ${this.m.tipByBranch.size} branches${defaultBranchHint}${outOfView ? ` · ▼ +${outOfView} out of view` : ''}${this.anc ? "  [ancestors]" : ""}`, ox, oy, C("#d9dce3"), hbg)

    buf.fillRect(ox, oy + H - BOT, W, BOT, hbg)
    buf.drawText(`${c.hash.slice(0, 7)}  ${c.author}  ${c.date.slice(0, 16).replace("T", " ")}  ${c.refs.join(", ")}`, ox + 1, oy + H - 2, C("#8a919c"), hbg)
    buf.drawText(`${c.subject}`.slice(0, Math.max(0, W - 2)), ox + 1, oy + H - 1, C("#e4e7ec"), hbg)

    const help = "click/←→↑↓ select  2×/⏎ ancestors  p merge  e export  q quit"
    if (this.msg) {
      buf.fillRect(ox, oy + H - 1, W, 1, hbg)
      buf.drawText(this.msg.slice(0, W - 2), ox + 1, oy + H - 1, C("#e3b341"), hbg)
    } else if (W > help.length + c.subject.length + 6) {
      buf.drawText(help, ox + W - help.length - 1, oy + H - 1, C("#6b7280"), hbg)
    }
  }

  /** Merge plan panel, overlaid on the graph. */
  private mergePanel(buf: OptimizedBuffer) {
    const { x: ox, y: oy, width: W, height: H } = this
    const lines = this.planner.planLines(this.planner.getReport())
    const w = Math.min(W - 4, 110), ph = H - TOP - BOT - 2, pbg = C("#1b1e25")
    const x0 = ox + Math.floor((W - w) / 2), y0 = oy + TOP + 1, vh = ph - 2
    this.pscroll = Math.min(this.pscroll, Math.max(0, lines.length - vh))
    buf.fillRect(x0, y0, w, ph, pbg)
    buf.drawText(" Merge plan — ↑↓/wheel scroll · p close ", x0 + 1, y0, C("#e4e7ec"), pbg)
    lines.slice(this.pscroll, this.pscroll + vh).forEach((l, k) => buf.drawText(l.t.slice(0, w - 4), x0 + 2, y0 + 1 + k, C(l.c), pbg))
  }
}
