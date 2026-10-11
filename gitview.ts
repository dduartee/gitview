#!/usr/bin/env bun
// gitview — grafo git por lanes no terminal (OpenTUI), e export HTML de um arquivo só.
//
// App de composition root: só parseia argumentos e escolhe o que rodar. Toda a lógica
// está nos packages, alcançáveis por import — este arquivo é o único que faz I/O de
// processo e é o único com side effect de boot.
//
// uso: bun gitview.ts [caminho-do-repo] [opcoes]

import { existsSync } from "node:fs"
import { basename, resolve } from "node:path"
import { createGit } from "./packages/git/index.ts"
import { visivel, buildModel, describeTrunks, type Model } from "./packages/model/index.ts"
import { createMergePlanner } from "./packages/merge/index.ts"
import { exportHtml } from "./packages/export/index.ts"
import { startTui } from "./packages/tui/index.ts"

const VERSAO = "1.2"

/** Flags que consomem o argumento seguinte. O valor não pode ser lido como repo. */
const VALUED = new Set(["--export", "--template", "--main", "--dev", "--trunk"])

const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }

/**
 * Primeiro argumento que não é flag nem valor de flag.
 *
 * Antes isto era `args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i-1].startsWith("--")))`,
 * que descartava silenciosamente um repo informado *depois* de qualquer flag:
 * `gitview --dump ~/outro` analisava o diretório atual. Ver issue aberta.
 */
function repoArg(): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (VALUED.has(a)) { i++; continue }
    if (a.startsWith("-")) continue
    return a
  }
  return undefined
}

function main() {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`gitview ${VERSAO} — grafo git por lanes no terminal (OpenTUI)

uso: gitview [repo] [opcoes]

opcoes:
  --export <file.html>    exporta grafico HTML auto-contido (DAG + refs + plano + matriz)
  --template <file.html>  usa template proprio; se nao existir, cai no embutido
  --main <branch>         branch principal do plano de merge (default: autodetect)
  --dev <branch>          branch de desenvolvimento (default: autodetect)
  --trunk <a,b>           branches fixadas no topo do eixo Y (default: autodetect)
  --dump                  lista o modelo de lanes e sai (debug)
  --version               versao
  -h, --help              esta ajuda

teclas no TUI:
  clique / setas   selecionar commit      2x clique / Enter   ancestrais
  p                plano de merge          e                   exportar HTML
  q                sair

exemplos:
  gitview .
  gitview ~/Projects/meu-repo --export grafo.html
  gitview ~/Projects/meu-repo --dump`)
    return
  }
  if (args.includes("--version")) { console.log(`gitview ${VERSAO}`); return }

  const repo = repoArg() ?? process.cwd()
  if (!existsSync(resolve(repo))) { console.error("caminho nao encontrado:", repo); process.exit(1) }

  const g = createGit(resolve(repo))
  if (g.run(["rev-parse", "--is-inside-work-tree"]).code) { console.error("nao e repositorio git:", g.repo); process.exit(1) }

  const trunkFlag = flag("--trunk")
  let m: Model
  try { m = buildModel(g, { trunk: trunkFlag ? trunkFlag.split(",").map(s => s.trim()).filter(Boolean) : undefined }) }
  catch (e: any) { console.error(e.message); process.exit(1) }

  const planner = createMergePlanner(g, m, { main: flag("--main"), dev: flag("--dev") })

  if (args.includes("--dump")) {
    const vis = m.lanes.filter(visivel)
    console.log(`commits: ${m.N}  lanes: ${vis.length}  refs: ${m.loc.size}  ${describeTrunks({ names: m.troncos, source: m.troncosSource })}`)
    for (const b of [...vis].sort((a, b) => a.y - b.y)) {
      console.log(`${String(b.list.length).padStart(4)}${b.tipAt !== undefined ? "*" : " "} ${b.cat.padEnd(8)} ${b.name || "(fantasma)"}`)
    }
    // O dump original tinha um `else if (b.name)` aqui imprimeindo "(invisivel: tip fora
    // do log)". Era código morto: o filtro de cima já tinha removido essas lanes. Deixado
    // fora de propósito — ressuscitar isso é feature, não refactor. Ver issue aberta.
    return
  }

  const exportTo = flag("--export")
  if (exportTo) {
    try {
      console.log("exportado:", exportHtml(g, m, planner.getReport(), planner.getMatrix(), exportTo, flag("--template")))
      return
    } catch (e: any) { console.error("erro ao exportar:", e.message); process.exit(1) }
  }

  startTui({
    g,
    m,
    planner,
    onExport: () => exportHtml(g, m, planner.getReport(), planner.getMatrix(), `gitview-${basename(resolve(g.repo))}.html`),
  })
}

if (import.meta.main) main()