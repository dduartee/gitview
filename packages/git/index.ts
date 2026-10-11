// Única forma de falar com o git em todo o projeto.
//
// Interface: `createGit(repo)` devolve `{ repo, run, git }`. Nenhum outro package vê
// `execFileSync`, o buffer de 512 MB ou os códigos de saída — eles conhecem só isto aqui.
//
// Dois adapters: o de produção (`createGit`) e um fake em `tests/`, que devolve o mesmo
// formato a partir de fixtures. É por isso que a seam é real.

import { execGit } from "./lib/exec.ts"

/** Resultado de um comando git. `code !== 0` não é erro — é como se descobre conflito. */
export type GitResult = { out: string; code: number }

export type Git = {
  /** Caminho do repositório, já resolvido. Todos os comandos rodam com `-C repo`. */
  repo: string
  /** Comando que pode falhar. Devolve stdout e código, nunca lança. */
  run: (a: string[], env?: Record<string, string>) => GitResult
  /** Comando que tem de dar certo. Lança no código != 0. */
  git: (...a: string[]) => string
}

/** Identidade fixa para os commits sintéticos do planejador de merge. */
export const SIM_ENV = {
  GIT_AUTHOR_NAME: "gitview",
  GIT_AUTHOR_EMAIL: "gitview@local",
  GIT_COMMITTER_NAME: "gitview",
  GIT_COMMITTER_EMAIL: "gitview@local",
}

export function createGit(repo: string): Git {
  const run = (a: string[], env?: Record<string, string>): GitResult => execGit(repo, a, env)
  const git = (...a: string[]): string => {
    const r = run(a)
    if (r.code) throw new Error(`git ${a[0]} falhou`)
    return r.out
  }
  return { repo, run, git }
}