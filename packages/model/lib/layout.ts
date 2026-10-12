// A posição vertical das lanes.
//
// Duas regras, nesta ordem:
//
// 1. **Tronco tem linha própria, no topo.** `main` e `develop` (ver `lib/trunks.ts`) ficam
//    fixos no alto, na ordem da lista resolvida, sem competir por espaço.
// 2. **O resto é empacotado em colunas.** Uma lane só desce para a linha seguinte se
//    *sobrepuser* horizontalmente outra já colocada. Como [L, R] é a extensão ocupada
//    (commit mais à esquerda até o fim do nome), lanes que não se cruzam em x dividem a
//    mesma linha — é o que mantém o grafo curto em repo com muitas branches.

import type { Lane } from "../index.ts"

/** Espaçamento horizontal entre commits, em colunas de terminal. */
export const DX = 4

/** Altura de uma lane, em linhas. */
export const RH = 3

/** Preenche x0/x1 (extensão dos commits) e L/R (extensão incluindo o nome). */
export function medirLanes(lanes: Lane[], idx: Map<string, number>): void {
  for (const b of lanes) {
    const ix = b.list.map(h => idx.get(h)!)
    if (b.tipAt !== undefined) ix.push(b.tipAt)
    b.x0 = Math.min(...ix)
    b.x1 = Math.max(...ix)

    // o nome fica centrado na lane, mas nunca encolhe a extensão: L/R é o que o
    // empacotamento usa para decidir sobreposição
    const cx = (b.x0 + b.x1) * DX / 2, len = b.label.length
    b.L = Math.min(b.x0 * DX, Math.floor(cx - len / 2))
    b.R = Math.max(b.x1 * DX, Math.ceil(cx + len / 2))
  }
}

/**
 * Distribui as lanes no eixo Y. `rank` devolve a posição do tronco, ou -1.
 * Devolve o MAXY, usado para clampar o pan.
 */
export function empacotarY(ordenadas: Lane[], rank: (nome: string) => number, yInicial: number): number {
  const troncos = ordenadas.filter(b => rank(b.name) >= 0)
  const resto = ordenadas.filter(b => rank(b.name) < 0)

  troncos.forEach((b, i) => { b.y = yInicial + i * RH })
  const baseY = yInicial + troncos.length * RH

  // `ends[r]` é a borda direita da última lane posta na linha r
  const ends: number[] = []
  for (const b of resto) {
    let r = ends.findIndex(e => e < b.L - 1)
    if (r < 0) { r = ends.length; ends.push(0) }
    ends[r] = b.R
    b.y = baseY + r * RH
  }

  return Math.max(...ordenadas.map(b => b.y))
}