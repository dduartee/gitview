// Testes da resolução de troncos, pela interface: `buildModel(git, { trunk })`.
//
// Nenhum import de `lib/`. As fontes de verdade são o fake do git e o repo em disco.

import { describe, expect, test } from "bun:test"
import { createFakeGit, logOutput } from "../../git/fake.ts"
import { buildModel, type BuildOptions } from "../index.ts"

/**
 * Repo com `main`, `develop` e duas features. Todos com ref, para `loc` saber quais
 * branches existem — `resolveTrunks` recebe `exists` daqui.
 */
const repo = (over: Record<string, { out: string; code?: number }> = {}) => createFakeGit({
  "log --all": {
    out: logOutput([
      { hash: "f2", parents: ["d1"], refs: ["HEAD -> feature/sobre-develop"] },
      { hash: "d1", parents: ["m1"], refs: ["HEAD -> develop", "origin/develop"] },
      { hash: "f1", parents: ["m1"], refs: ["HEAD -> feature/login"] },
      { hash: "m1", refs: ["HEAD -> main", "origin/main"] },
    ]),
  },
  "rev-parse HEAD": { out: "f2\n" },
  ...over,
})

const construir = (over?: Record<string, { out: string; code?: number }>, opts?: BuildOptions) =>
  buildModel(repo(over), opts)

describe("origem dos troncos", () => {
  test("--trunk vence tudo", () => {
    const m = construir({ "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/main\n" } }, { trunk: ["develop", "main"] })
    expect(m.troncosSource).toBe("flag")
    expect(m.troncos).toEqual(["develop", "main"])
  })

  test("origin/HEAD vence a convenção de nome", () => {
    const m = construir({ "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/develop\n" } })
    expect(m.troncosSource).toBe("remote-head")
    // `main` entra mesmo assim: `catOf("main") === "main"`, então é tronco por
    // convenção independentemente do que o remote disse.
    expect(m.troncos[0]).toBe("develop")
    expect(m.troncos).toContain("main")
  })

  test("sem remote e sem flag, cai na convenção de nome", () => {
    const m = construir()   // o fake devolve stdout vazio para symbolic-ref => code 0, out ""
    expect(m.troncosSource).toBe("name")
    expect(m.troncos).toContain("main")
  })

  test("nenhuma fonte => nenhum tronco, e o modelo ainda constrói", () => {
    // repo sem main/master em loc, sem remote, sem flag
    const g = createFakeGit({
      "log --all": { out: logOutput([{ hash: "z1", refs: ["HEAD -> wip/scratch"] }]) },
      "rev-parse HEAD": { out: "z1\n" },
    })
    const m = buildModel(g)
    expect(m.troncosSource).toBe("none")
    expect(m.troncos).toEqual([])
    expect(m.N).toBe(1)
  })
})

describe("pinning", () => {
  test("os troncos ficam no topo do eixo Y, na ordem da lista", () => {
    const m = construir({ "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/main\n" } }, { trunk: ["main", "develop"] })
    const y = (n: string) => m.lanes.find(b => b.name === n)!.y
    expect(y("main")).toBeLessThan(y("develop"))
    expect(y("develop")).toBeLessThan(y("feature/login"))
    expect(y("develop")).toBeLessThan(y("feature/sobre-develop"))
  })

  test("cada tronco ganha linha própria, espaçada de RH", () => {
    const m = construir({}, { trunk: ["main", "develop"] })
    const y = (n: string) => m.lanes.find(b => b.name === n)!.y
    expect(y("main")).toBe(1)          // linha 0 é dos rótulos (há tag? não aqui) — ver abaixo
    expect(y("develop") - y("main")).toBe(3)   // RH
  })

  test("sem tronco, ninguém é pinned e a ordem é só por data", () => {
    const g = createFakeGit({
      "log --all": {
        out: logOutput([
          { hash: "c1", parents: ["a1"], refs: ["HEAD -> feature/b"] },
          { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/a"] },
          { hash: "a1", refs: ["HEAD -> wip/base"] },
        ]),
      },
      "rev-parse HEAD": { out: "c1\n" },
    })
    const m = buildModel(g)
    expect(m.troncos).toEqual([])
    // nenhuma lane tem y abaixo do bloco dos troncos — o topo é simplesmente a data
    const ys = m.lanes.filter(b => b.list.length).map(b => b.y).sort((x, z) => x - z)
    expect(ys[0]).toBe(1)
  })
})

describe("trunk não é categoria main", () => {
  test("develop é tronco mas continua categoria dev", () => {
    const m = construir({}, { trunk: ["develop"] })
    const d = m.lanes.find(b => b.name === "develop")!
    expect(d.cat).toBe("dev")
    // e o plano de merge continua mirando develop, não main — é o que a categoria dev garante
    expect(m.troncos).toContain("develop")
  })
})

describe("detecção de inativas", () => {
  test("mede contra o primeiro tronco, não contra o literal main", () => {
    // origin/HEAD = develop, e develop tem 1 commit à frente de feature/login.
    // Comparar contra develop é o certo; contra main daria outro resultado.
    const m = construir({
      "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/develop\n" },
      "rev-list --left-right --count d1...f1": { out: "0\t0\n" },   // feature/login já está em develop
      "rev-list --left-right --count m1...f1": { out: "1\t0\n" },
      "rev-list --left-right --count d1...f2": { out: "0\t0\n" },
    })
    expect(m.inactivas.has("feature/login")).toBe(true)
  })

  test("nenhum tronco é tronco de si mesmo: nunca sai da lista de inativas", () => {
    const m = construir({}, { trunk: ["main", "develop"] })
    expect(m.inactivas.has("main")).toBe(false)
    expect(m.inactivas.has("develop")).toBe(false)
  })
})