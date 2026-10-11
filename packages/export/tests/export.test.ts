// Regressão do bug do `exportHtml` renumerando `b.y` no lugar.
//
// Antes do split, `exportHtml` fazia `vis.forEach((b, i) => { b.y = i })` direto nos
// objetos `Br` vivos. O TUI desenha os commits a partir de `Y` (snapshot de primitivos,
// portanto correto) e os nomes das lanes a partir de `lane.y` (o objeto, renumerado).
// Aperta `e` para exportar de dentro do TUI, o arquivo sai certo e o grafo volta
// desalinhado: commits nas linhas certas, nomes nas linhas erradas.

import { describe, expect, test } from "bun:test"
import { createFakeGit, logOutput } from "../../git/fake.ts"
import { buildModel, visivel } from "../../model/index.ts"
import { createMergePlanner } from "../../merge/index.ts"
import { project } from "../index.ts"

const RESP = {
  "log --all": {
    out: logOutput([
      { hash: "a1", refs: ["HEAD -> main", "origin/main"] },
      { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/login"] },
      { hash: "c1", parents: ["a1"], refs: ["HEAD -> hotfix/urgent"] },
      { hash: "d1", parents: ["a1"], refs: ["HEAD -> topic/spike"] },
      { hash: "e1", parents: ["b1"] },
    ]),
  },
  "rev-parse HEAD": { out: "e1\n" },
  "--version": { out: "git version 2.45.0\n" },
  "rev-list --left-right --count main...feature/login": { out: "0\t2\n" },
  "rev-list --left-right --count main...hotfix/urgent": { out: "0\t1\n" },
  "rev-list --left-right --count main...topic/spike": { out: "0\t1\n" },
}

const build = () => {
  const g = createFakeGit(RESP)
  const m = buildModel(g)
  return { g, m, planner: createMergePlanner(g, m) }
}

describe("project não muta o model", () => {
  test("os y das lanes do model são os mesmos depois da projeção", () => {
    const { g, m, planner } = build()

    const antes = m.lanes.filter(visivel).map(b => [b.name, b.y])
    expect(antes.length).toBeGreaterThan(0)

    project(g, m, planner.getReport(), planner.getMatrix())

    const depois = m.lanes.filter(visivel).map(b => [b.name, b.y])
    expect(depois).toEqual(antes)
  })

  test("exportar duas vezes dá a mesma projeção", () => {
    const { g, m, planner } = build()
    const a = project(g, m, planner.getReport(), planner.getMatrix())
    const b = project(g, m, planner.getReport(), planner.getMatrix())
    expect(b.lanes).toEqual(a.lanes)
  })

  test("os commits continuam na linha que o TUI desenharia", () => {
    const { g, m, planner } = build()
    const graph = project(g, m, planner.getReport(), planner.getMatrix())

    // `laneOf` tem que concordar com `lanes[].y`, senão o HTML e o TUI mostram
    // o mesmo commit em linhas diferentes.
    graph.lanes.forEach((l, i) => {
      graph.laneOf.forEach((li, commit) => {
        if (li === i) expect(l.y).toBe(i)
      })
    })

    // e nenhum commit pode ficar apontando para uma lane que não existe
    expect(graph.laneOf.every(i => i >= 0 && i < graph.lanes.length)).toBe(true)
  })
})

describe("a projeção usa y reindexado, sem tocar no model", () => {
  test("o HTML numera as lanes em sequência, na ordem do model", () => {
    const { g, m, planner } = build()
    const graph = project(g, m, planner.getReport(), planner.getMatrix())
    expect(graph.lanes.map(l => l.y)).toEqual(graph.lanes.map((_, i) => i))
  })

  test("a ordem das lanes no HTML é a ordem vertical do terminal", () => {
    const { g, m, planner } = build()
    const graph = project(g, m, planner.getReport(), planner.getMatrix())
    const ordemDoModel = m.lanes.filter(visivel).sort((a, b) => a.y - b.y).map(b => b.name)
    expect(graph.lanes.map(l => l.name)).toEqual(ordemDoModel)
  })
})