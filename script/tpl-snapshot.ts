// Snapshot do comportamento do template, para comparar antes/depois de mexer.
// Uso: bun script/tpl-snapshot.ts

import { createFakeGit, leftRight, logOutput } from "../packages/git/fake.ts"
import { buildModel } from "../packages/model/index.ts"
import { createMergePlanner } from "../packages/merge/index.ts"
import { project, TPL_DAG } from "../packages/export/index.ts"
import { assinatura, exercitar, rodarTemplate } from "../packages/export/tests/dom.ts"

const g = createFakeGit({
  "log --all": { out: logOutput([
    { hash: "f2", parents: ["d1"], refs: ["HEAD -> feature/x"] },
    { hash: "d1", parents: ["m1"], refs: ["HEAD -> develop"] },
    { hash: "m1", refs: ["HEAD -> main", "origin/main"] },
    { hash: "t1", parents: ["m1"] },
  ]) },
  "rev-parse HEAD": { out: "f2\n" },
  "--version": { out: "git version 2.45.0\n" },
  "rev-list --left-right --count m1...f2": { out: leftRight(0, 1) },
  "rev-list --left-right --count m1...d1": { out: leftRight(1, 0) },
})

const m = buildModel(g)
const p = createMergePlanner(g, m)
const projeto = JSON.stringify(project(g, m, p.getReport(), p.getMatrix()))

const antes = rodarTemplate(TPL_DAG, projeto)
const ex = exercitar(antes.dom)
console.log("erro no load:", antes.erro?.message ?? "nenhum")
console.log("erros nos handlers:", ex.erros.length ? ex.erros.map(e => `${e.onde}: ${e.erro.message}`).join(" | ") : "nenhum")
console.log("handlers acionados:", ex.acionados)
console.log("recarregamentos:", antes.dom.reloads)
console.log("assinatura:", antes.assinatura)
console.log("ids que faltaram no HTML:", [...antes.dom.idsFaltando].join(", ") || "nenhum")
console.log("ids tocados:", antes.dom.porId.size)