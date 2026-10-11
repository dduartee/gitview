// O segundo adapter da seam `git`.
//
// Segundo entry point do package (ficar na raiz é o que o torna importável), para os
// testes falarem com a mesma interface de `createGit` sem spawnar um repositório.
//
// Não é mock: cada resposta é o stdout real que o git devolveria.

import type { Git, GitResult } from "./index.ts"

export type FakeGit = Git & {
  /** Toda chamada que chegou, na ordem. Serve para afirmar o que foi — e o que não foi — consultado. */
  readonly calls: string[]
  /** Sobrescreve uma resposta depois de criado. */
  set: (key: string, res: Partial<GitResult>) => FakeGit
}

/** Separadores do `--pretty=format:` que o model consome. */
const US = "\x1f", RS = "\x1e"

/**
 * @param responses  chave = argumentos unidos por espaço. Aceita prefixo: a entrada mais
 *                   longa que casar vence. `""` é o fallback (padrão: stdout vazio, código 0).
 */
export function createFakeGit(responses: Record<string, Partial<GitResult>> = {}): FakeGit {
  const calls: string[] = []
  const table: Record<string, GitResult> = {}
  let fallback: GitResult = { out: "", code: 0 }

  const put = (k: string, r: Partial<GitResult>) => {
    table[k] = { out: r.out ?? table[k]?.out ?? "", code: r.code ?? table[k]?.code ?? 0 }
  }
  for (const [k, r] of Object.entries(responses)) {
    if (k === "") { fallback = { out: r.out ?? "", code: r.code ?? 0 }; continue }
    put(k, r)
  }

  const lookup = (key: string): GitResult => {
    let best = ""
    for (const k of Object.keys(table)) {
      if ((key === k || key.startsWith(k + " ")) && k.length > best.length) best = k
    }
    return best ? table[best] : fallback
  }

  const run = (a: string[], _env?: Record<string, string>): GitResult => {
    const key = a.join(" ")
    calls.push(key)
    // o app usa isto para validar o repo antes de construir o model
    if (key === "rev-parse --is-inside-work-tree") return { out: "true\n", code: 0 }
    return lookup(key)
  }

  const git = (...a: string[]): string => {
    const r = run(a)
    if (r.code) throw new Error(`git ${a[0]} falhou`)
    return r.out
  }

  const self: FakeGit = {
    repo: "/fake/repo",
    run,
    git,
    calls,
    set: (k, r) => { put(k, r); return self },
  }
  return self
}

/** `git log --all` no formato que o model consome, montado a partir de commits legíveis. */
export function logOutput(commits: {
  hash: string
  parents?: string[]
  author?: string
  date?: string
  subject?: string
  refs?: string[]
}[]): string {
  return commits.map(c =>
    [
      c.hash,
      (c.parents ?? []).join(" "),
      c.author ?? "dev",
      "dev@local",
      c.date ?? "2026-01-01T00:00:00+00:00",
      (c.refs ?? []).join(", "),
      c.subject ?? "s",
    ].join(US) + RS
  ).join("")
}

/** `rev-list --left-right --count a...b` devolve `behind ahead`. */
export const leftRight = (behind: number, ahead: number) => `${behind}\t${ahead}\n`