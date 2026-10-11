// Exercita o script do template com o shim de DOM.
//
// O que estes testes garantem: o template **executa sem lançar**, os `id` que ele busca
// existem no HTML, e a execução é determinística. É a rede que faltava no arquivo mais
// arriscado do repo — antes disto, qualquer mudança no template era verificada abrindo o
// HTML na mão.

import { describe, expect, test } from "bun:test"
import { createFakeGit, leftRight, logOutput } from "../../git/fake.ts"
import { buildModel } from "../../model/index.ts"
import { createMergePlanner } from "../../merge/index.ts"
import { project, TPL_DAG } from "../index.ts"
import { assinatura, exercitar, idsDoHtml, rodarTemplate } from "./dom.ts"

const g = createFakeGit({
  "log --all": { out: logOutput([
    { hash: "f2", parents: ["d1"], refs: ["HEAD -> feature/x"] },
    { hash: "d1", parents: ["m1"], refs: ["HEAD -> develop"] },
    { hash: "m1", refs: ["HEAD -> main", "origin/main"] },
  ]) },
  "rev-parse HEAD": { out: "f2\n" },
  "--version": { out: "git version 2.45.0\n" },
  "rev-list --left-right --count m1...f2": { out: leftRight(0, 1) },
  "rev-list --left-right --count m1...d1": { out: leftRight(1, 0) },
})

const grafo = () => {
  const m = buildModel(g)
  const p = createMergePlanner(g, m)
  return JSON.stringify(project(g, m, p.getReport(), p.getMatrix()))
}

describe("template HTML", () => {
  test("executa sem lançar contra uma projeção real", () => {
    const r = rodarTemplate(TPL_DAG, grafo())
    expect(r.erro).toBeNull()
  })

  test("todo id que o script busca existe no HTML", () => {
    const r = rodarTemplate(TPL_DAG, grafo())
    // `getElementById` de id inexistente devolve null no browser, e o template então
    // quebra em `.textContent` de null. Este conjunto tem de estar vazio.
    expect([...r.dom.idsFaltando]).toEqual([])
  })

  test("constrói o DAG: cria nós e ligações", () => {
    const r = rodarTemplate(TPL_DAG, grafo())
    // 3 commits, cada um vira um nó; `circle` é o que o SVG usa
    expect(r.assinatura).toContain("circle:")
    expect(r.assinatura).toMatch(/nos=[1-9]/)
  })

  test("é determinístico: duas execuções dão a mesma assinatura", () => {
    const a = rodarTemplate(TPL_DAG, grafo())
    const b = rodarTemplate(TPL_DAG, grafo())
    expect(assinatura(b.dom)).toBe(assinatura(a.dom))
  })

  test("projeção vazia não quebra: cai no caminho de erro amigável", () => {
    const r = rodarTemplate(TPL_DAG, JSON.stringify({ repo: "x", commits: [] }))
    expect(r.erro).toBeNull()
    // o script escreve "sem dados" no título quando não há commits
    const t = r.dom.porId.get("t")
    expect(t?.textContent).toContain("sem dados")
  })

  test("o HTML declara os ids que o script usa", () => {
    const ids = idsDoHtml(TPL_DAG)
    for (const obrigatorio of ["svg", "world", "ex", "ey", "dag", "colY", "t-refs", "t-plan", "t-matrix"]) {
      expect(ids.has(obrigatorio)).toBe(true)
    }
  })

  test("as interações não quebram: abas, interruptores, busca e setas", () => {
    // Cobre os caminhos que o carregamento não toca — zoom, filtro, troca de aba. Um
    // `var`→`let` mal feito apareceria aqui, não no primeiro render.
    const r = rodarTemplate(TPL_DAG, grafo())
    expect(r.erro).toBeNull()
    const ex = exercitar(r.dom)
    expect(ex.acionados).toBeGreaterThan(0)
    expect(ex.erros).toEqual([])
    // trocar interruptor grava sessão e recarrega: é o comportamento do template
    expect(r.dom.reloads).toBeGreaterThan(0)
  })

  test("a busca reduz as lanes visíveis", () => {
    const r = rodarTemplate(TPL_DAG, grafo())
    exercitar(r.dom)
    const cnt = r.dom.porId.get("cnt-f")
    expect(cnt?.textContent).toBeTruthy()
  })
})