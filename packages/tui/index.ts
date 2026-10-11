// O renderizador de terminal.
//
// Char grid via OpenTUI. Não sabe nada de HTML, e o HTML não sabe nada de terminal: os dois
// só compartilham o model. Zoom, filtro por nome e deep-link existem **aqui não** —
// são recursos do renderizador HTML, e o glossário registra a assimetria.

import { createCliRenderer, Renderable, RGBA, type MouseEvent, type OptimizedBuffer, type RenderContext } from "@opentui/core"
import type { Git } from "../git/index.ts"
import { BG, corLane, DX, mix, visivel, type Model } from "../model/index.ts"
import type { createMergePlanner } from "../merge/index.ts"

const EDGE = "#9aa3b2", GUT = 12, TOP = 1, BOT = 2

export type TuiDeps = {
  g: Git
  m: Model
  planner: ReturnType<typeof createMergePlanner>
  /** Injetado pelo app: mantém o TUI sem dependência do package de export. */
  onExport: () => string
}

export async function startTui({ g, m, planner, onExport }: TuiDeps): Promise<void> {
  const { idx, byHash, cs, X, Y, B, MAXY, N, headHash } = m

  const cache = new Map<string, RGBA>()
  const C = (h: string) => { let c = cache.get(h); if (!c) { c = RGBA.fromHex(h); cache.set(h, c) } return c }

  class GitView extends Renderable {
    cur = idx.get(headHash) ?? N - 1
    sx = 0; sy = 0
    anc: Set<string> | null = null
    hover: number | null = null
    panel = false
    pscroll = 0
    msg = ""
    private ready = false
    private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null
    private last = { i: -1, t: 0 }
    constructor(ctx: RenderContext) { super(ctx, { id: "lanes", width: "100%", height: "100%" }) }

    reveal() {
      const vw = this.width - GUT, vh = this.height - TOP - BOT, x = X[this.cur], y = Y[this.cur]
      if (x - this.sx < 3) this.sx = x - 3
      if (x - this.sx > vw - 5) this.sx = x - vw + 5
      if (y - this.sy < 1) this.sy = Math.max(0, y - 1)
      if (y - this.sy > vh - 3) this.sy = y - vh + 3
      this.sx = Math.max(-2, this.sx)
    }

    private clamp() { this.sx = Math.min(Math.max(-2, this.sx), X[N - 1]); this.sy = Math.min(Math.max(0, this.sy), MAXY) }

    // commit sob o ponteiro (ou ponta da branch, se for o nome dela); -1 se nada
    private hit(ex: number, ey: number): number {
      const wx = ex - this.x - GUT + this.sx, wy = ey - this.y - TOP + this.sy
      const i = Math.round(wx / DX)
      if (i >= 0 && i < N && Math.abs(X[i] - wx) <= 1 && Y[i] === wy) return i
      for (const b of m.lanes) if (b.label && visivel(b) && wy === b.y) {
        const s = b.x1 * DX + 2
        if (wx >= s && wx < s + b.label.length) return b.x1
      }
      return -1
    }

    // mouse: clique seleciona · duplo-clique ancestrais · arrastar move · roda ↔ · shift+roda ↕
    protected override onMouseEvent(e: MouseEvent) {
      if (this.panel) {
        if (e.type === "scroll" && e.scroll) { this.pscroll = Math.max(0, this.pscroll + (e.scroll.direction === "up" ? -3 : 3)); this.requestRender() }
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
          const i = this.hit(e.x, e.y), now = Date.now()
          if (i < 0) { this.anc = null; break }
          const dbl = i === this.last.i && now - this.last.t < 400
          this.cur = i; this.last = dbl ? { i: -1, t: 0 } : { i, t: now }
          if (dbl) { this.anc = null; this.toggle() }
          break
        }
        case "scroll": {
          const s = e.scroll; if (!s) break
          const dir = s.direction as string, n = Math.max(1, Math.round(Number(s.delta) || 1))
          const sign = dir === "up" || dir === "left" ? -1 : 1
          if (dir === "left" || dir === "right" || !e.modifiers?.shift) this.sx += sign * 8 * n; else this.sy += sign * 3 * n
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

    /** Adia trabalho caro para fora do ciclo de render, e mostra o resultado na status bar. */
    private later(f: () => void) {
      setTimeout(() => {
        try { f() } catch (e: any) { this.msg = "erro: " + e.message }
        this.requestRender()
      }, 30)
    }

    openPlan() { this.msg = "analisando merges…"; this.requestRender(); this.later(() => { planner.getReport(); this.panel = true; this.pscroll = 0; this.msg = "" }) }

    doExport() {
      this.msg = "analisando e exportando…"; this.requestRender()
      this.later(() => {
        try { this.msg = "exportado: " + onExport(); setTimeout(() => { this.msg = ""; this.requestRender() }, 7000) }
        catch (e: any) { this.msg = "erro: " + e.message; this.requestRender() }
      })
    }

    handleKey(name: string, shift: boolean) {
      const n = name
      if (this.panel) {
        if (n === "p" || n === "escape") this.panel = false
        else if (n === "up") this.pscroll = Math.max(0, this.pscroll - 1)
        else if (n === "down") this.pscroll++
        else if (n === "pageup") this.pscroll = Math.max(0, this.pscroll - 10)
        else if (n === "pagedown") this.pscroll += 10
        this.requestRender(); return
      }
      this.hover = null
      if (n === "left") this.cur = Math.max(0, this.cur - (shift ? 20 : 1))
      else if (n === "right") this.cur = Math.min(N - 1, this.cur + (shift ? 20 : 1))
      else if (n === "up" || n === "down") {                        // commit mais próximo na lane vizinha
        const d = n === "up" ? -1 : 1; let best = -1, bs = 1e9
        for (let i = 0; i < N; i++) { const dy = (Y[i] - Y[this.cur]) * d; if (dy <= 0) continue
          const s = dy * 10000 + Math.abs(X[i] - X[this.cur]); if (s < bs) { bs = s; best = i } }
        if (best >= 0) this.cur = best
      }
      else if (n === "home" || (n === "g" && !shift)) this.cur = 0
      else if (n === "end" || (n === "g" && shift)) this.cur = N - 1
      else if (n === "h") this.cur = idx.get(headHash) ?? N - 1
      else if (n === "p") { this.openPlan(); return }
      else if (n === "e") { this.doExport(); return }
      else if (n === "return" || n === "enter") this.toggle()
      this.reveal(); this.requestRender()
    }

    toggle() {
      if (this.anc) { this.anc = null; return }
      const s = new Set<string>(), st = [cs[this.cur].hash]
      while (st.length) { const h = st.pop()!; if (s.has(h)) continue; s.add(h); byHash.get(h)?.parents.forEach(p => st.push(p)) }
      this.anc = s
    }

    protected override renderSelf(buf: OptimizedBuffer) {
      if (!this.ready) { this.ready = true; this.reveal() }
      const W = this.width, H = this.height, ox = this.x, oy = this.y
      const on = (h: string) => !this.anc || this.anc.has(h)
      const f = (hex: string, ok: boolean) => ok ? hex : mix(hex)
      buf.fillRect(ox, oy, W, H, C(BG))

      const put = (wx: number, wy: number, ch: string, fg: string, bg = BG) => {
        const x = GUT + wx - this.sx, y = TOP + wy - this.sy
        if (x < GUT || x >= W || y < TOP || y >= H - BOT) return
        buf.setCell(ox + x, oy + y, ch, C(fg), C(bg))
      }
      const txt = (wx: number, wy: number, s: string, fg: string) => { for (let i = 0; i < s.length; i++) put(wx + i, wy, s[i], fg) }
      const vis = (wx: number) => { const x = GUT + wx - this.sx; return x > GUT - 40 && x < W + 40 }

      // tags (linha pontilhada + nome no topo)
      for (let i = 0; i < N; i++) {
        const tags = cs[i].refs.filter(r => r.startsWith("tag: ")).map(r => r.slice(5)); if (!tags.length || !vis(X[i])) continue
        const t = tags.join(","), ok = on(cs[i].hash)
        for (let y = 1; y < Y[i]; y++) put(X[i], y, "┊", f("#3a4150", ok))
        txt(X[i] - Math.floor(t.length / 2), 0, t, f("#e3b341", ok))
      }
      // arestas: sólidas na mesma branch; tracejadas (corre pela lane do pai, entra na vertical no filho) entre branches
      for (let i = 0; i < N; i++) for (const p of cs[i].parents) {
        const j = idx.get(p); if (j === undefined) continue
        const ax = X[j], ay = Y[j], bx = X[i], by = Y[i]
        if (!vis(ax) && !vis(bx)) continue
        const ok = on(p) && on(cs[i].hash)
        if (B[i] === B[j]) { const col = f(corLane(m, B[i]), ok); for (let x = ax + 1; x < bx; x++) put(x, ay, "─", col); continue }
        const col = f(EDGE, ok)
        if (ay === by) { for (let x = ax + 1; x < bx - 1; x++) put(x, ay, "┄", col); put(bx - 1, ay, "▸", col); continue }
        const d = Math.sign(by - ay)
        for (let x = ax + 1; x < bx; x++) put(x, ay, "┄", col)
        put(bx, ay, d > 0 ? "╮" : "╯", col)
        for (let y = ay + d; y !== by - d; y += d) put(bx, y, "┆", col)
        put(bx, by - d, d > 0 ? "▾" : "▴", col)
      }
      // nomes das branches na PONTA da lane (direita do ultimo commit), com hash quando ligado
      for (const b of m.lanes) if (visivel(b) && b.label) {
        const ok = !this.anc || b.list.some(h => this.anc!.has(h))
        txt(b.x1 * DX + 2, b.y, b.label, f(corLane(m, b), ok))
      }
      // commits
      for (let i = 0; i < N; i++) {
        if (!vis(X[i])) continue
        const ok = on(cs[i].hash), isCur = i === this.cur
        put(X[i], Y[i], cs[i].parents.length > 1 ? "◉" : "●", f(corLane(m, B[i]), ok), isCur ? "#2b3550" : i === this.hover ? "#232938" : BG)
        if (isCur) { put(X[i] - 1, Y[i], "[", "#ffffff"); put(X[i] + 1, Y[i], "]", "#ffffff") }
      }
      // coluna fixa: tags no topo + nome REAL de cada branch alinhado à sua lane
      buf.fillRect(ox, oy + TOP, GUT, H - TOP - BOT, C(BG))
      for (const l of m.labels) { const y = TOP + l.y - this.sy; if (y >= TOP && y < H - BOT) buf.drawText(l.t, ox + 1, oy + y, C("#7a828e")) }
      for (const b of m.lanes) if (visivel(b)) {
        const y = TOP + b.y - this.sy; if (y < TOP || y >= H - BOT) continue
        const tipH = b.list[b.list.length - 1] ?? (b.tipAt !== undefined ? cs[b.tipAt].hash : "")
        const nm0 = curto(b.name) || "~" + tipH.slice(0, 7)
        const nm = nm0.length > GUT - 1 ? nm0.slice(0, GUT - 2) + "…" : nm0
        buf.drawText(nm, ox + 1, oy + y, C(b.name ? corLane(m, b) : "#5b6470"))
      }

      // cabeçalho e rodapé
      const c = cs[this.hover ?? this.cur], hbg = C("#1b1e25")
      buf.fillRect(ox, oy, W, 1, hbg)
      const fora = m.lanes.filter(b => visivel(b) && (b.y < this.sy || b.y > this.sy + H - TOP - BOT - 1)).length
      // O tronco aparece no cabeçalho porque o TUI não tem toggle de pinning: aqui a lista
      // é sempre aplicada. No HTML existe o interruptor `pin main`, então lá ela é opcional.
      const tr = m.troncos.length ? ` · tronco: ${m.troncos.join(", ")}` : " · sem tronco"
      buf.drawText(` gitview  ${m.repo}  ${N} commits · ${m.loc.size} branches${tr}${fora ? ` · ▼ +${fora} fora da vista` : ''}${this.anc ? "  [ancestrais]" : ""}`, ox, oy, C("#d9dce3"), hbg)
      buf.fillRect(ox, oy + H - BOT, W, BOT, hbg)
      buf.drawText(`${c.hash.slice(0, 7)}  ${c.author}  ${c.date.slice(0, 16).replace("T", " ")}  ${c.refs.join(", ")}`, ox + 1, oy + H - 2, C("#8a919c"), hbg)
      buf.drawText(`${c.subject}`.slice(0, Math.max(0, W - 2)), ox + 1, oy + H - 1, C("#e4e7ec"), hbg)
      const help = "clique/←→↑↓ selecionar  2×/⏎ ancestrais  p merge  e exportar  q sair"
      if (this.msg) { buf.fillRect(ox, oy + H - 1, W, 1, hbg); buf.drawText(this.msg.slice(0, W - 2), ox + 1, oy + H - 1, C("#e3b341"), hbg) }
      else if (W > help.length + c.subject.length + 6) buf.drawText(help, ox + W - help.length - 1, oy + H - 1, C("#6b7280"), hbg)

      if (this.panel) {                                              // painel de planejamento de merge
        const lines = planner.planLines(planner.getReport()), w = Math.min(W - 4, 110), ph = H - TOP - BOT - 2, pbg = C("#1b1e25")
        const x0 = ox + Math.floor((W - w) / 2), y0 = oy + TOP + 1, vh = ph - 2
        this.pscroll = Math.min(this.pscroll, Math.max(0, lines.length - vh))
        buf.fillRect(x0, y0, w, ph, pbg)
        buf.drawText(" Planejamento de merge — ↑↓/roda rolar · p fechar ", x0 + 1, y0, C("#e4e7ec"), pbg)
        lines.slice(this.pscroll, this.pscroll + vh).forEach((l, k) => buf.drawText(l.t.slice(0, w - 4), x0 + 2, y0 + 1 + k, C(l.c), pbg))
      }
    }
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: BG, useMouse: true, enableMouseMovement: true })
  const view = new GitView(renderer)
  renderer.root.add(view)
  renderer.keyInput.on("keypress", (key: any) => {
    if (key.name === "q" || (key.name === "escape" && !view.panel)) { renderer.destroy(); process.exit(0) }
    view.handleKey(key.name, !!key.shift)
  })
}

/** Abrevia o prefixo da branch na coluna fixa, onde cabem 11 colunas. */
const curto = (n: string): string => n
  ? n.replace(/^(feature|feat)\//, "f/").replace(/^(hotfix|fix)\//, "h/").replace(/^release\//, "r/")
      .replace(/^(docs|doc)\//, "d/").replace(/^chore\//, "c/").replace(/^(migracao|migration)\//, "m/")
      .replace(/^test\//, "t/").replace(/^sync\//, "s/").replace(/^codespace\//, "cs/")
  : ""