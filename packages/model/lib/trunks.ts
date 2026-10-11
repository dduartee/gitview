// Quais lanes são tronco.
//
// Sem import de `../index.ts` de propósito: `catOf` mora em `lib/category.ts` e é
// reexportado pela interface. Importar o index de dentro do lib criaria o ciclo
// index → trunks → index, que o `no-circular` do dependency-cruiser rejeita.
//
// Um tronco é a linha de longão: a branch que as features miram e que fica fixa no topo
// do eixo Y. Não dá para adivinhar pelo grafo — medir "quantos descendentes" classifica
// `origin/21.03` (release velha, ancestral de tudo) acima de `develop`. O que resolve é
// **declaração**, na ordem de quem tem mais autoridade:
//
//   1. `--trunk a,b` na linha de comando      — o usuário, agora
//   2. `.gitview.json` no repo                — o time, versionado
//   3. `refs/remotes/origin/HEAD`             — o remote, sobre qual branch é default
//   4. convenção de nome (categoria `main`)   — o padrão de mercado
//
// Cada fonte vence a seguinte. Nenhuma delas é lista fixa no código.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Git } from "../../git/index.ts"
import { catOf } from "./category.ts"

/** De onde veio a lista. Aparece na UI e no log, para ninguém precisar adivinhar por quê. */
export type TrunkSource = "flag" | "config" | "remote-head" | "name" | "none"

export type Trunks = {
  /** Nomes de branch, achatados de `origin/x` para `x`. */
  names: string[]
  source: TrunkSource
}

export type TrunkOptions = {
  /** `--trunk a,b`, já splitado. Vazio = não veio da CLI. */
  flag?: string[]
}

/** `refs/remotes/<remote>/HEAD` → `main`. Só funciona se o remote tiver symbolic ref. */
function fromRemoteHead(g: Git): string[] {
  const r = g.run(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).out.trim()
  if (!r) return []
  const nome = r.replace(/^[^/]+\//, "")
  return nome ? [nome] : []
}

/** `.gitview.json` na raiz do repo, se existir e for parseável. */
function fromConfig(g: Git): string[] {
  let txt: string
  try { txt = readFileSync(resolve(g.repo, ".gitview.json"), "utf8") }
  catch { return [] }
  try {
    const j = JSON.parse(txt)
    const t = j?.troncos
    return Array.isArray(t) ? t.filter((x: unknown): x is string => typeof x === "string" && !!x) : []
  } catch (e: any) {
    console.error("aviso: .gitview.json inválido, ignorando —", e.message)
    return []
  }
}

/** Só as branches que a convenção de nome chama de `main` e que existem de fato. */
function fromNames(g: Git, exists: (n: string) => boolean): string[] {
  return ["main", "master", "prod", "production"].filter(n => exists(n))
}

/**
 * Resolve os troncos. `exists` recebe um nome e diz se há branch local com esse nome —
 * injetado para que isto não dependa de `Model` e siga testável pela interface.
 */
export function resolveTrunks(g: Git, exists: (n: string) => boolean, opts: TrunkOptions = {}): Trunks {
  if (opts.flag?.length) return { names: opts.flag, source: "flag" }
  const cfg = fromConfig(g)
  if (cfg.length) return { names: cfg, source: "config" }
  const rh = fromRemoteHead(g)
  if (rh.length) return { names: rh, source: "remote-head" }
  const nm = fromNames(g, exists)
  if (nm.length) return { names: nm, source: "name" }
  return { names: [], source: "none" }
}

/**
 * Um nome conta como tronco tanto pelo nome exato quanto pela categoria `main`.
 *
 * A categoria cobre `team/platform/main`, que não está em nenhuma lista e mesmo assim é
 * tronco. `catOf` já faz esse julgamento e é a mesma função que dá a cor, então as duas
 * coisas concordam por construção.
 */
export const isTrunk = (nome: string, tr: Trunks): boolean =>
  tr.names.includes(nome) || catOf(nome) === "main"

/** Uma linha para a status bar / cabeçalho do HTML: de onde a lista veio. */
export const describeTrunks = (tr: Trunks): string => {
  if (tr.source === "none" || !tr.names.length) return "sem tronco detectado"
  const lista = tr.names.join(", ")
  switch (tr.source) {
    case "flag": return `tronco (--trunk): ${lista}`
    case "config": return `tronco (.gitview.json): ${lista}`
    case "remote-head": return `tronco (origin/HEAD): ${lista}`
    default: return `tronco (convenção de nome): ${lista}`
  }
}