// A atribuição de cada commit a uma lane.
//
// É o núcleo do model, e o algoritmo tem duas fases com propósitos diferentes:
//
// 1. **Por ponta de branch**: cada branch anda pelo first-parent a partir da sua ponta e
//    reivindica os commits que ainda não têm dono. Isso faz o miolo de uma feature pertencer
//    à feature, e não ao tronco que ela saiu.
// 2. **Sobra**: o que restou não tem ref — são commits de branches já apagadas, que
//    continuam no grafo como fantasmas. Vão para a lane do primeiro filho que já tem dono,
//    ou para uma lane sem nome.

import type { Commit, Lane } from "../index.ts"
import { PRIO, catOf } from "./category.ts"

/** Cria uma lane vazia e a registra na lista. `label` é o nome truncado para caber na coluna. */
const criar = (lista: Lane[]) => (name: string, cat: string): Lane => {
  const b: Lane = {
    name,
    label: name.length > 36 ? name.slice(0, 35) + "…" : name,
    cat,
    list: [],
    x0: 0, x1: 0, L: 0, R: 0, y: 0,
  }
  lista.push(b)
  return b
}

type Lanes = { owner: Map<string, Lane>; br: Lane[] }

/**
 * @param loc       nome de branch -> hash da ponta
 * @param idx       hash -> posição em `cs` (mais antigo primeiro)
 * @param byHash    hash -> commit
 * @param kids      hash -> hashes dos filhos
 * @param cs        commits, mais antigo primeiro
 */
export function atribuirLanes(
  loc: Map<string, string>,
  idx: Map<string, number>,
  byHash: Map<string, Commit>,
  kids: Map<string, string[]>,
  cs: Commit[],
): Lanes {
  const owner = new Map<string, Lane>()
  const br: Lane[] = []
  const mk = criar(br)

  // Ordena as pontas pela prioridade da categoria e depois pela data: em empate, a branch
  // mais recente de cada categoria reivindica primeiro, e as de maior prioridade antes.
  const tips = [...loc].map(([n, h]) => ({ n, h, cat: catOf(n) }))
    .sort((a, b) => PRIO.indexOf(a.cat) - PRIO.indexOf(b.cat) || idx.get(b.h)! - idx.get(a.h)!)

  for (const t of tips) {
    const b = mk(t.n, t.cat)
    let h: string | undefined = t.h
    // anda para trás pelo first-parent, parando no primeiro commit já reivindicado
    while (h && byHash.has(h) && !owner.has(h)) {
      owner.set(h, b)
      b.list.push(h)
      h = byHash.get(h)!.parents[0]
    }
    // ponta que não conseguiu nenhum commit exclusivo (outra branch já tinha o mesmo tip):
    // registra a posição para a lane continuar visível sem lista
    if (!b.list.length) b.tipAt = idx.get(t.h)!
  }

  // sobrou commit sem dono: veio de branch apagada
  for (let i = cs.length - 1; i >= 0; i--) {
    const h = cs[i].hash
    if (owner.has(h)) continue
    // procura um filho que já tenha lane e cujo first-parent seja este commit: é a lane
    // que este commit continuava, então o fantasma pertence a ela
    const filho = (kids.get(h) ?? []).find(k => byHash.get(k)!.parents[0] === h)
    const b = (filho && owner.get(filho)) || mk("", "other")
    owner.set(h, b)
    b.list.push(h)
  }

  return { owner, br }
}