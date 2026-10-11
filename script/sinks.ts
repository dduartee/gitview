#!/usr/bin/env bun
// slick: valida o repo contra o CONSTRAINTS.md.
//
// Lê os tetos do próprio CONSTRAINTS.md — não os duplica aqui. Um teto escrito em dois
// lugares diverge; quando diverge, ninguém sabe qual vale.
//
// Sai com 1 se estourar, para entrar no `check`.

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const RAIZ = new URL("..", import.meta.url).pathname

/**
 * Tetos lidos do CONSTRAINTS.md — não duplicados aqui.
 *
 * Procura o par chave/valor no arquivo inteiro em vez de num bloco ```yaml específico:
 * o arquivo tem dois blocos yaml, e o que tem os tetos não é o primeiro. Se o formato
 * mudar, o erro diz qual chave faltou em vez de devolver 0 em silêncio.
 */
function tetos(): { loc: number; deps: number; fn: number } {
  const md = readFileSync(join(RAIZ, "CONSTRAINTS.md"), "utf8")
  const pega = (k: string) => {
    const v = Number(md.match(new RegExp(`^\\s*${k}:\\s*(\\d+)`, "m"))?.[1] ?? 0)
    if (!v) throw new Error(`não achei ${k}: <número> no CONSTRAINTS.md`)
    return v
  }
  return { loc: pega("max_lines_of_code"), deps: pega("max_dependencies_direct"), fn: pega("max_lines_per_function") }
}

/**
 * Maior função por número de linhas, e onde.
 *
 * Heurística por profundeidade de indentação: conta linhas até a próxima linha no mesmo
 * ou menor nível que abre a função. Custa pouco e erra para o lado de reportar demais —
 * um falso positivo é uma olhada, um falso negativo é uma função ilegível passando.
 *
 * Não pega arrow function de uma linha nem callback aninhado; para isso seria um parser.
 */
function maioresFuncoes(arq: string, fonte: string, min: number): { arq: string; linha: number; n: number; nome: string }[] {
  const l = fonte.split("\n")
  const out: { arq: string; linha: number; n: number; nome: string }[] = []
  for (let i = 0; i < l.length; i++) {
    const abre = l[i].match(/^(\s*)(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\()/)
    if (!abre) continue
    const base = abre[1].length
    const nome = abre[2] ?? abre[3] ?? "?"
    let fim = i + 1
    for (let j = i + 1; j < l.length; j++) {
      if (!l[j].trim()) continue
      if (l[j].match(/^(\s*)/)![1].length <= base) { fim = j; break }
    }
    const n = fim - i
    if (n >= min) out.push({ arq, linha: i + 1, n, nome })
  }
  return out
}

/** Todo `.ts` versionado do projeto, exceto o próprio script. */
function fontes(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "out") continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) fontes(p, acc)
    else if (e.endsWith(".ts")) acc.push(p)
  }
  return acc
}

/** Teste não vai para o binário. Contá-lo no teto puniria quem escreve verificação. */
const ehTeste = (f: string) => f.includes("/tests/") || f.endsWith(".test.ts")

const { loc: MAX_LOC, deps: MAX_DEPS, fn: MAX_FN } = tetos()
const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"))
const eu = relative(RAIZ, new URL(import.meta.url).pathname)

const arquivos = fontes(RAIZ).filter(f => relative(RAIZ, f) !== eu)
const envio = arquivos.filter(f => !ehTeste(relative(RAIZ, f)))
const testes = arquivos.filter(f => ehTeste(relative(RAIZ, f)))

/** LOC medido sobre o que vai para o binário. Testes são reportados à parte. */
const linhas = envio.map(f => [relative(RAIZ, f), readFileSync(f, "utf8").split("\n").length - 1] as const)
const linhasTeste = testes.map(f => [relative(RAIZ, f), readFileSync(f, "utf8").split("\n").length - 1] as const)
const total = linhas.reduce((s, [, n]) => s + n, 0)
const totalTeste = linhasTeste.reduce((s, [, n]) => s + n, 0)

const nDeps = Object.keys(pkg.dependencies ?? {}).length
const fnsLongas = envio.flatMap(f => maioresFuncoes(relative(RAIZ, f), readFileSync(f, "utf8"), MAX_FN))
  .sort((a, b) => b.n - a.n)

const pct = (n: number, max: number) => Math.round((n / max) * 100)
const barra = (n: number, max: number) => {
  const cheio = Math.min(20, Math.round((n / max) * 20))
  return "█".repeat(cheio) + "░".repeat(20 - cheio)
}

console.log(`\n  LOC ${total} / ${MAX_LOC}  ${barra(total, MAX_LOC)} ${pct(total, MAX_LOC)}%   (binário; testes à parte: ${totalTeste})`)
console.log(`  deps runtime ${nDeps} / ${MAX_DEPS}`)
console.log(`  funções > ${MAX_FN} linhas  ${fnsLongas.length}  ${barra(fnsLongas.length, 5)}`)

const maiores = [...linhas].sort((a, b) => b[1] - a[1]).slice(0, 6)
console.log("\n  maiores arquivos:")
for (const [f, n] of maiores) {
  console.log(`    ${String(n).padStart(5)}  ${f}`)
}

if (fnsLongas.length) {
  console.log(`\n  funções longas:`)
  for (const f of fnsLongas.slice(0, 5)) {
    console.log(`    ${String(f.n).padStart(4)}  ${f.arq}:${f.linha}  ${f.nome}()`)
  }
}

let falhou = false

if (total > MAX_LOC) {
  console.log(`\n  ✗ ${total - MAX_LOC} linhas acima do teto. Corte, ou justifique no corpo do PR e`)
  console.log(`    suba o teto no CONSTRAINTS.md — não deixe o número e o código divergirem.`)
  falhou = true
}
if (nDeps > MAX_DEPS) {
  console.log(`\n  ✗ ${nDeps - MAX_DEPS} dependências runtime acima do teto.`)
  falhou = true
}
if (fnsLongas.length) {
  console.log(`\n  ✗ ${fnsLongas.length} função(ões) acima de ${MAX_FN} linhas. Esta é a que dói:`)
  console.log(`    ${fnsLongas[0].arq}:${fnsLongas[0].linha} ${fnsLongas[0].nome}() — ${fnsLongas[0].n} linhas.`)
  console.log(`    Quebre em funções nomeadas. O nome é o que torna o código legível.`)
  falhou = true
}

console.log(falhou ? "\n  ✗ fora dos constraints\n" : "\n  ✓ dentro dos constraints\n")
process.exit(falhou ? 1 : 0)