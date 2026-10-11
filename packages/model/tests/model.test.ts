// Testes do model, pela interface pública: `buildModel(git)`.
//
// Nada aqui importa `lib/`. As respostas do git saem do fake, que é entry point.

import { describe, expect, test } from "bun:test"
import { createFakeGit, leftRight, logOutput } from "../../git/fake.ts"
import { buildModel, catOf, visivel, DX } from "../index.ts"

/**
 * Repo de 5 commits: main, três branches que saem de `a1`, e uma continuation.
 *
 * A lista está na ordem que o `git log` realmente entrega: **mais recente primeiro**.
 * `e1` (filho de `b1`) vem no topo. O model inverte para `cs`, e é aí que `a1` vira 0.
 */
const repo = (over: Record<string, { out: string; code?: number }> = {}) => createFakeGit({
  "log --all": {
    out: logOutput([
      { hash: "e1", parents: ["b1"] },
      { hash: "d1", parents: ["a1"], refs: ["HEAD -> topic/spike"] },
      { hash: "c1", parents: ["a1"], refs: ["HEAD -> hotfix/urgent"] },
      { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/login"] },
      { hash: "a1", refs: ["HEAD -> main", "origin/main"] },
    ]),
  },
  "rev-parse HEAD": { out: "e1\n" },
  // O `alvo` da detecção de inativas é o **hash** da ponta de main (`a1`), não o nome
  // "main" — é isso que `loc.get("main")` devolve. As chaves abaixo são o que o model
  // realmente pede; se o código mudar a consulta, os testes falham em vez de mentirem.
  "rev-list --left-right --count a1...b1": { out: leftRight(0, 2) },
  "rev-list --left-right --count a1...c1": { out: leftRight(0, 1) },
  "rev-list --left-right --count a1...d1": { out: leftRight(0, 1) },
  ...over,
})

const lane = (m: ReturnType<typeof buildModel>, name: string) => m.lanes.find(b => b.name === name)!

describe("buildModel", () => {
  test("cada commit cai na lane da branch que o possui", () => {
    const m = buildModel(repo())
    expect(m.owner.get("a1")!.name).toBe("main")
    expect(m.owner.get("b1")!.name).toBe("feature/login")
    expect(m.owner.get("c1")!.name).toBe("hotfix/urgent")
    expect(m.owner.get("d1")!.name).toBe("topic/spike")
  })

  test("commit que nenhum first-parent alcança fica órfão, e vira lane sem nome", () => {
    // `e1` é filho de `b1`, que já é de feature/login. A caminhada first-parent de
    // feature/login vai de b1 para a1 e para — nunca chega em e1, porque e1 é mais
    // recente que a ponta. Sobra sem dono e vira fantasma.
    const m = buildModel(repo())
    expect(m.lanes.filter(b => b.name === "").map(b => b.list)).toEqual([["e1"]])
  })

  test("a lane de uma branch caminha por first-parent, da ponta para trás", () => {
    const m = buildModel(repo())
    // feature/login tem b1 como ponta; o first-parent de b1 é a1, que já é de main
    expect(lane(m, "feature/login").list).toEqual(["b1"])
    // main vai até a1 e para. `e1` (filho de b1) não é alcançado por first-parent,
    // então sobra sem dono e vira fantasma — é o que a lane sem nome abaixo representa.
    expect(lane(m, "main").list).toEqual(["a1"])
  })

  test("o eixo X é o índice do commit vezes DX", () => {
    const m = buildModel(repo())
    expect(m.X).toEqual([0, DX, DX * 2, DX * 3, DX * 4])
  })

  test("`cs` é o log invertido, então X cresce para trás no tempo", () => {
    const m = buildModel(repo())
    // O `git log` entrega mais recente primeiro (`commits[0]` é `e1`); `cs` inverte para
    // que o índice cresça com o tempo — commit mais antigo no índice 0.
    expect(m.commits[0].hash).toBe("e1")
    expect(m.cs[0].hash).toBe("a1")        // mais antigo
    expect(m.cs[m.N - 1].hash).toBe("e1")  // mais recente
  })

  test("main fica pinado no topo do eixo Y, com linha própria", () => {
    const m = buildModel(repo())
    // A linha 0 é reservada aos rótulos ("tags") quando há tags; sem elas, o tronco
    // começa na 1. main é o primeiro tronco, então é a lane mais alta de todas.
    const ys = m.lanes.filter(visivel).map(b => b.y)
    expect(lane(m, "main").y).toBe(Math.min(...ys))
    expect(m.labels).toEqual([])   // este repo não tem tag
  })

  test("cada lane visível ocupa uma linha inteira de altura RH", () => {
    const m = buildModel(repo())
    const ys = m.lanes.filter(visivel).map(b => b.y).sort((a, b) => a - b)
    // main fica sozinha na linha 1 (a 0 é reservada a rótulos); as outras são empacotadas
    // por não se sobrepor em x, de 3 em 3.
    expect(ys).toEqual([1, 4, 7, 10, 13])   // RH = 3
  })

  test("lane cuja ponta já pertence a outra fica sem lista, marcada no tip", () => {
    // main e release/1.0 apontam para o MESMO commit `a1`. main (PRIO menor) anda
    // primeiro e fica com `a1`; release/1.0 então não tem commit exclusivo, e o model
    // marca `tipAt` no índice de `a1` em vez de deixar a lane sumir.
    const g = createFakeGit({
      "log --all": {
        out: logOutput([
          { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/x"] },
          { hash: "a1", refs: ["HEAD -> main", "origin/main", "release/1.0"] },
        ]),
      },
      "rev-parse HEAD": { out: "b1\n" },
      "rev-list --left-right --count a1...b1": { out: leftRight(0, 1) },
    })
    const m = buildModel(g)
    const rel = lane(m, "release/1.0")
    expect(rel.list).toEqual([])
    expect(rel.tipAt).toBe(0)          // índice de `a1` em cs (a1 é o mais antigo)
    expect(visivel(rel)).toBe(true)   // visível, mas sem commits
    expect(m.owner.get("a1")!.name).toBe("main")
  })

  test("commit de branch apagada vira fantasma, e continua no grafo", () => {
    // `w1` não tem ref nenhuma: foi apagado. Vira lane sem nome. O ponto do teste é
    // que ele continua no grafo e continua dono de um commit — nenhum commit some
    // por falta de ref.
    const g = createFakeGit({
      "log --all": {
        out: logOutput([
          { hash: "a1", refs: ["HEAD -> main", "origin/main"] },
          { hash: "w1", parents: ["a1"] },
          { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/x"] },
        ]),
      },
      "rev-parse HEAD": { out: "b1\n" },
      "rev-list --left-right --count a1...b1": { out: leftRight(0, 1) },
    })
    const m = buildModel(g)
    const ghosts = m.lanes.filter(b => b.name === "" && visivel(b))
    expect(ghosts.length).toBe(1)
    expect(ghosts[0].list).toEqual(["w1"])
    expect(m.cs.some(c => c.hash === "w1")).toBe(true)
    expect(m.owner.get("w1")).toBe(ghosts[0])
    // e a lane do fantasma ocupa lugar no eixo Y, como qualquer outra
    expect(m.Y[1]).toBe(ghosts[0].y)
  })

  test("ahead 0 marca a lane como inativa", () => {
    const m = buildModel(repo({ "rev-list --left-right --count a1...d1": { out: leftRight(3, 0) } }))
    expect(m.inactivas.has("topic/spike")).toBe(true)
    expect(m.inactivas.has("hotfix/urgent")).toBe(false)
  })

  test("main e master nunca são marcadas inativas", () => {
    const m = buildModel(repo())
    expect(m.inactivas.has("main")).toBe(false)
  })
})

describe("catOf", () => {
  test("classifica pelo sufixo e pelo prefixo do nome", () => {
    expect(catOf("main")).toBe("main")
    expect(catOf("release/1.2")).toBe("release")
    expect(catOf("hotfix/urgent")).toBe("hotfix")
    expect(catOf("feat/login")).toBe("feature")
    expect(catOf("topic/spike")).toBe("feature")
    expect(catOf("wip/experiment")).toBe("feature")
    expect(catOf("whatever")).toBe("other")
  })

  test("develop cai em `dev`, não em `main`", () => {
    // É o comportamento atual, e é o que a GLOSSARY registra. `develop` NÃO é tronco,
    // então não ganha pinning nem a cor de main. Ver issue aberta.
    expect(catOf("develop")).toBe("dev")
  })

  test("um path aninhado termina em main continua sendo main", () => {
    expect(catOf("team/platform/main")).toBe("main")
    expect(catOf("team/platform/develop")).toBe("dev")
  })
})