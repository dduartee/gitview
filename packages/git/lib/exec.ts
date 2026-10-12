import { execFileSync } from "node:child_process"

/**
 * Wrapper around `execFileSync` in read mode.
 *
 * stdout and stderr are piped (never inherited) so that nothing escapes to the terminal, and
 * `stdio[0]` is `ignore` because no gitview git command reads stdin. The buffer limit is
 * generous on purpose: `git log --all` in a large repository easily passes Node's 10 MB default.
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
  } catch (e) {
    // `merge-tree --write-tree` signals a conflict through code 1, with the files on
    // stdout. That is data, not an error — hence the code comes back instead of throwing.
    // Node throws `ExecFileSyncException` with `stdout` and `status`; if something else comes,
    // the shape still exists, just without those two fields.
    const r = e as { stdout?: unknown; status?: unknown }
    return { out: typeof r.stdout === "string" ? r.stdout : "", code: typeof r.status === "number" ? r.status : 1 }
  }
}