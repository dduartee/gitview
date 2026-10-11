import { execFileSync } from "node:child_process"

/**
 * Envolvimento de `execFileSync` em modo leitura.
 *
 * stdout e stderr são piped (nunca herdados) para que nada escape para o terminal, e
 * `stdio[0]` é `ignore` porque nenhum comando git do gitview lê stdin. O limite de
 * buffer é generoso de propósito: `git log --all` num repositório grande passa fácil
 * dos 10 MB padrão do Node.
 */
export function execGit(repo: string, a: string[], env?: Record<string, string>): { out: string; code: number } {
  try {
    const out = execFileSync("git", ["-C", repo, ...a], {
      encoding: "utf8",
      maxBuffer: 1 << 29,
      stdio: ["ignore", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env,
    }) as string
    return { out, code: 0 }
  } catch (e: any) {
    // `merge-tree --write-tree` sinaliza conflito pelo código 1, com os arquivos na
    // stdout. Isso é dado, não erro — por isso o código volta em vez de estourar.
    return { out: String(e.stdout ?? ""), code: Number(e.status ?? 1) }
  }
}