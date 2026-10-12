// O desenho do grafo no terminal.
//
// `renderSelf` chamava cada passo direto, e o passo de arestas sozinho ocupava 15 linhas
// com três casos de geometria encadeados. Aqui cada passo é um método, e a ordem de
// desenho fica visível numa tela: fundo, tags, arestas, nomes, commits, coluna, chrome.
//
// Nada aqui decide *o que* é tronco ou *o que* é categoria — isso é do `model`. A cor e a
// lane chegam prontas; o Pintor só sabe colocar célula.

import { RGBA, type OptimizedBuffer } from "@opentui/core"
import { BG, corLane, DX, mix, visivel, type Lane, type Model } from "../../model/index.ts"

const EDGE = "#9aa3b2"
export const GUT = 12, TOP = 1, BOT = 2

/** RGBA é caro de construir; a paleta do grafo tem poucos valores. */
const cacheCor = new Map<string, RGBA>()
export const C = (h: string): RGBA => {
  let c = cacheCor.get(h)
  if (!c) { c = RGBA.fromHex(h); cacheCor.set(h, c) }
  return c
}

/** A vista: o que está em foco e onde, para saber o que está visível e o que escurecer. */
export type Vista = {
  sx: number; sy: number
  width: number; height: number; x: number; y: number
  cur: number; hover: number | null
  /** null = tudo visível; caso contrário, só os ancestrais do commit selecionado. */
  anc: Set<string> | null
}

export class Pintor {
  constructor(private v: Vista, private buf: OptimizedBuffer, private m: Model) {}

  /** Um commit está no foco? Sem modo ancestrais, tudo está. */
  private on = (h: string) => !this.v.anc || this.v.anc.has(h)

  /** Cor no foco ou esmaecida, conforme o modo ancestrais. */
  private f = (hex: string, ok: boolean) => ok ? hex : mix(hex)

  /** Escreve uma célula em coordenadas do mundo, ignorando o que sai da viewport. */
  put(wx: number, wy: number, ch: string, fg: string, bg = BG) {
    const { sx, sy, width: W, height: H, x: ox, y: oy } = this.v
    const x = GUT + wx - sx, y = TOP + wy - sy
    if (x < GUT || x >= W || y < TOP || y >= H - BOT) return
    this.buf.setCell(ox + x, oy + y, ch, C(fg), C(bg))
  }

  txt(wx: number, wy: number, s: string, fg: string) {
    for (let i = 0; i < s.length; i++) this.put(wx + i, wy, s[i], fg)
  }

  /** Margem de 40 colunas: desenha um pouco fora da tela para o pan não mostrar buraco. */
  private vis(wx: number) {
    const x = GUT + wx - this.v.sx
    return x > GUT - 40 && x < this.v.width + 40
  }

  /** Tags no topo, com linha pontilhada descendo até o commit. */
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
   * Arestas entre commits.
   *
   * Três geometries, na ordem:
   * 1. mesma lane      → linha sólida na altura da lane
   * 2. pai e filho na mesma linha → tracejado com seta, sem desvio vertical
   * 3. linhas diferentes → sai na horizontal, vira na vertical na coluna do filho, entra
   *    com seta. É o "cabelo" que mostra de qual lane o commit veio.
   */
  arestas() {
    const { cs, X, Y, B, idx } = this.m
    for (let i = 0; i < this.m.N; i++) for (const p of cs[i].parents) {
      const j = idx.get(p)
      if (j === undefined) continue
      const ax = X[j], ay = Y[j], bx = X[i], by = Y[i]
      if (!this.vis(ax) && !this.vis(bx)) continue
      const ok = this.on(p) && this.on(cs[i].hash)

      if (B[i] === B[j]) {
        const col = this.f(corLane(this.m, B[i]), ok)
        for (let x = ax + 1; x < bx; x++) this.put(x, ay, "─", col)
        continue
      }
      const col = this.f(EDGE, ok)
      if (ay === by) {
        for (let x = ax + 1; x < bx - 1; x++) this.put(x, ay, "┄", col)
        this.put(bx - 1, ay, "▸", col)
        continue
      }
      const d = Math.sign(by - ay)
      for (let x = ax + 1; x < bx; x++) this.put(x, ay, "┄", col)
      this.put(bx, ay, d > 0 ? "╮" : "╯", col)
      for (let y = ay + d; y !== by - d; y += d) this.put(bx, y, "┆", col)
      this.put(bx, by - d, d > 0 ? "▾" : "▴", col)
    }
  }

  /** O nome de cada branch na ponta da sua lane — é a leitura principal da ferramenta. */
  nomesDasLanes() {
    for (const b of this.m.lanes) {
      if (!visivel(b) || !b.label) continue
      const ok = !this.v.anc || b.list.some(h => this.v.anc!.has(h))
      this.txt(b.x1 * DX + 2, b.y, b.label, this.f(corLane(this.m, b), ok))
    }
  }

  /** Os pontos: `●` normal, `◉` merge, e colchetes no selecionado. */
  commits() {
    const { cs, X, Y, B } = this.m
    for (let i = 0; i < this.m.N; i++) {
      if (!this.vis(X[i])) continue
      const ok = this.on(cs[i].hash), isCur = i === this.v.cur
      const bg = isCur ? "#2b3550" : i === this.v.hover ? "#232938" : BG
      this.put(X[i], Y[i], cs[i].parents.length > 1 ? "◉" : "●", this.f(corLane(this.m, B[i]), ok), bg)
      if (isCur) { this.put(X[i] - 1, Y[i], "[", "#ffffff"); this.put(X[i] + 1, Y[i], "]", "#ffffff") }
    }
  }

  /** Coluna da esquerda, que não rola com o pan: rótulos fixos + nome abreviado por lane. */
  colunaFixa() {
    const { x: ox, y: oy, height: H } = this.v
    this.buf.fillRect(ox, oy + TOP, GUT, H - TOP - BOT, C(BG))

    for (const l of this.m.labels) {
      const y = TOP + l.y - this.v.sy
      if (y >= TOP && y < H - BOT) this.buf.drawText(l.t, ox + 1, oy + y, C("#7a828e"))
    }
    for (const b of this.m.lanes) {
      if (!visivel(b)) continue
      const y = TOP + b.y - this.v.sy
      if (y < TOP || y >= H - BOT) continue
      const nm = this.nomeCurto(b)
      this.buf.drawText(nm, ox + 1, oy + y, C(b.name ? corLane(this.m, b) : "#5b6470"))
    }
  }

  /** 11 colunas não cabem `feature/imu-admin-upload-curation`: abrevia o prefixo conhecido. */
  private nomeCurto(b: Lane): string {
    const tip = b.list[b.list.length - 1] ?? (b.tipAt !== undefined ? this.m.cs[b.tipAt].hash : "")
    const abreviado = (b.name
      ? b.name.replace(/^(feature|feat)\//, "f/").replace(/^(hotfix|fix)\//, "h/").replace(/^release\//, "r/")
          .replace(/^(docs|doc)\//, "d/").replace(/^chore\//, "c/").replace(/^(migracao|migration)\//, "m/")
          .replace(/^test\//, "t/").replace(/^sync\//, "s/").replace(/^codespace\//, "cs/")
      : "~" + tip.slice(0, 7))
    return abreviado.length > GUT - 1 ? abreviado.slice(0, GUT - 2) + "…" : abreviado
  }
}