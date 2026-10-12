// A view do grafo no terminal.
//
// Estado de navegação (seleção, pan, zoom, painel) e o desenho. A classe é autocontida:
// recebe tudo que precisa pelo construtor, e `renderSelf` é uma lista de chamadas.
//
// Nada aqui decide *o que* é tronco ou *o que* é categoria — isso é do `model`. A cor e a
// lane chegam prontas; a view só sabe colocar célula.

import { Renderable, type MouseEvent, type OptimizedBuffer, type RenderContext } from "@opentui/core"
import { BG, DX, visivel, type Model } from "../../model/index.ts"
import type { createMergePlanner } from "../../merge/index.ts"
import { BOT, C, GUT, Pintor, TOP } from "./pintor.ts"

/** Ancestrais do commit selecionado, ou null quando não está filtrando. */
type Ancestrais = Set<string> | null

export class GitView extends Renderable {
  cur: number
  sx = 0; sy = 0
  anc: Ancestrais = null
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

  /** A vista que o Pintor desenha. Um objeto, para o Pintor não conhecer o Renderable. */
  private vista() {
    return {
      sx: this.sx, sy: this.sy, width: this.width, height: this.height,
      x: this.x, y: this.y, cur: this.cur, hover: this.hover, anc: this.anc,
    }
  }

  /** Mantém o commit selecionado dentro da tela, com uma margem. */
  reveal() {
    const vw = this.width - GUT, vh = this.height - TOP - BOT
    const x = this.m.X[this.cur], y = this.m.Y[this.cur]
    if (x - this.sx < 3) this.sx = x - 3
    if (x - this.sx > vw - 5) this.sx = x - vw + 5
    if (y - this.sy < 1) this.sy = Math.max(0, y - 1)
    if (y - this.sy > vh - 3) this.sy = y - vh + 3
    this.sx = Math.max(-2, this.sx)
  }

  private clamp() {
    this.sx = Math.min(Math.max(-2, this.sx), this.m.X[this.m.N - 1])
    this.sy = Math.min(Math.max(0, this.sy), this.m.MAXY)
  }

  /** O commit sob o ponteiro, ou a ponta da branch se o ponteiro estiver no nome. -1 se nada. */
  private hit(ex: number, ey: number): number {
    const wx = ex - this.x - GUT + this.sx, wy = ey - this.y - TOP + this.sy
    const i = Math.round(wx / DX)
    if (i >= 0 && i < this.m.N && Math.abs(this.m.X[i] - wx) <= 1 && this.m.Y[i] === wy) return i
    for (const b of this.m.lanes) {
      if (!b.label || !visivel(b) || wy !== b.y) continue
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

  /** Adia trabalho caro para fora do ciclo de render, e mostra o erro na status bar. */
  private later(f: () => void) {
    setTimeout(() => {
      try { f() } catch (e) { this.msg = "erro: " + (e instanceof Error ? e.message : String(e)) }
      this.requestRender()
    }, 30)
  }

  openPlan() {
    this.msg = "analisando merges…"; this.requestRender()
    this.later(() => { this.planner.getReport(); this.panel = true; this.pscroll = 0; this.msg = "" })
  }

  doExport() {
    this.msg = "analisando e exportando…"; this.requestRender()
    this.later(() => {
      try {
        this.msg = "exportado: " + this.onExport()
        setTimeout(() => { this.msg = ""; this.requestRender() }, 7000)
      } catch (e) { this.msg = "erro: " + (e instanceof Error ? e.message : String(e)); this.requestRender() }
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
    else if (name === "up" || name === "down") { this.laneVizinha(name === "up" ? -1 : 1) }
    else if (name === "home" || (name === "g" && !shift)) this.cur = 0
    else if (name === "end" || (name === "g" && shift)) this.cur = this.m.N - 1
    else if (name === "h") this.cur = this.m.idx.get(this.m.headHash) ?? this.m.N - 1
    else if (name === "p") { this.openPlan(); return }
    else if (name === "e") { this.doExport(); return }
    else if (name === "return" || name === "enter") this.toggle()
    this.reveal(); this.requestRender()
  }

  /** O commit mais próximo na lane acima (d = -1) ou abaixo (d = +1). */
  private laneVizinha(d: number) {
    let best = -1, bs = 1e9
    for (let i = 0; i < this.m.N; i++) {
      const dy = (this.m.Y[i] - this.m.Y[this.cur]) * d
      if (dy <= 0) continue
      // distância vertical pesa 10000× a horizontal: primeiro escolhe a lane, depois o commit
      const s = dy * 10000 + Math.abs(this.m.X[i] - this.m.X[this.cur])
      if (s < bs) { bs = s; best = i }
    }
    if (best >= 0) this.cur = best
  }

  /** Alterna o filtro de ancestrais. `null` volta a mostrar tudo. */
  toggle() {
    if (this.anc) { this.anc = null; return }
    const s = new Set<string>(), pilha = [this.m.cs[this.cur].hash]
    while (pilha.length) {
      const h = pilha.pop()!
      if (s.has(h)) continue
      s.add(h)
      this.m.byHash.get(h)?.parents.forEach(p => pilha.push(p))
    }
    this.anc = s
  }

  protected override renderSelf(buf: OptimizedBuffer) {
    if (!this.ready) { this.ready = true; this.reveal() }
    const p = new Pintor(this.vista(), buf, this.m)

    buf.fillRect(this.x, this.y, this.width, this.height, C(BG))
    p.tags()           // marcadores amarelos no topo
    p.arestas()        // ligações, incluso o "cabelo" entre lanes
    p.nomesDasLanes()  // o nome de cada branch na ponta
    p.commits()        // os pontos
    p.colunaFixa()     // nomes abreviados, que não rolam com o pan
    this.chrome(buf)   // cabeçalho e rodapé
    if (this.panel) this.painelDeMerge(buf)
  }

  private chrome(buf: OptimizedBuffer) {
    const { x: ox, y: oy, width: W, height: H } = this
    const hbg = C("#1b1e25")
    const c = this.m.cs[this.hover ?? this.cur]
    const fora = this.m.lanes.filter(b => visivel(b) && (b.y < this.sy || b.y > this.sy + H - TOP - BOT - 1)).length
    // O tronco aparece porque o TUI não tem toggle de pinning: aqui a lista é sempre
    // aplicada. No HTML existe o interruptor, então lá ela é opcional.
    const tr = this.m.troncos.length ? ` · tronco: ${this.m.troncos.join(", ")}` : " · sem tronco"

    buf.fillRect(ox, oy, W, 1, hbg)
    buf.drawText(` gitview  ${this.m.repo}  ${this.m.N} commits · ${this.m.loc.size} branches${tr}${fora ? ` · ▼ +${fora} fora da vista` : ''}${this.anc ? "  [ancestrais]" : ""}`, ox, oy, C("#d9dce3"), hbg)

    buf.fillRect(ox, oy + H - BOT, W, BOT, hbg)
    buf.drawText(`${c.hash.slice(0, 7)}  ${c.author}  ${c.date.slice(0, 16).replace("T", " ")}  ${c.refs.join(", ")}`, ox + 1, oy + H - 2, C("#8a919c"), hbg)
    buf.drawText(`${c.subject}`.slice(0, Math.max(0, W - 2)), ox + 1, oy + H - 1, C("#e4e7ec"), hbg)

    const help = "clique/←→↑↓ selecionar  2×/⏎ ancestrais  p merge  e exportar  q sair"
    if (this.msg) {
      buf.fillRect(ox, oy + H - 1, W, 1, hbg)
      buf.drawText(this.msg.slice(0, W - 2), ox + 1, oy + H - 1, C("#e3b341"), hbg)
    } else if (W > help.length + c.subject.length + 6) {
      buf.drawText(help, ox + W - help.length - 1, oy + H - 1, C("#6b7280"), hbg)
    }
  }

  /** Painel do plano de merge, sobreposto ao grafo. */
  private painelDeMerge(buf: OptimizedBuffer) {
    const { x: ox, y: oy, width: W, height: H } = this
    const lines = this.planner.planLines(this.planner.getReport())
    const w = Math.min(W - 4, 110), ph = H - TOP - BOT - 2, pbg = C("#1b1e25")
    const x0 = ox + Math.floor((W - w) / 2), y0 = oy + TOP + 1, vh = ph - 2
    this.pscroll = Math.min(this.pscroll, Math.max(0, lines.length - vh))
    buf.fillRect(x0, y0, w, ph, pbg)
    buf.drawText(" Planejamento de merge — ↑↓/roda rolar · p fechar ", x0 + 1, y0, C("#e4e7ec"), pbg)
    lines.slice(this.pscroll, this.pscroll + vh).forEach((l, k) => buf.drawText(l.t.slice(0, w - 4), x0 + 2, y0 + 1 + k, C(l.c), pbg))
  }
}
