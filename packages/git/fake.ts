// The second adapter of the `git` seam.
//
// The package's second entry point (being at the root is what makes it importable), so that
// tests can talk to the same interface as `createGit` without spawning a repository.
//
// It is not a mock: every response is the real stdout that git would return.

import type { Git, GitResult } from "./index.ts"

export type FakeGit = Git & {
  /** Every call that arrived, in order. Used to assert what was — and what was not — consulted. */
  readonly calls: string[]
  /** Overwrites a response after creation. */
  set: (key: string, res: Partial<GitResult>) => FakeGit
}

/** Separators of the `--pretty=format:` that the model consumes. */
const US = "\x1f", RS = "\x1e"

/**
 * @param responses  key = arguments joined by space. Accepts a prefix: the longest
 *                   entry that matches wins. `""` is the fallback (default: empty stdout, code 0).
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
    // the app uses this to validate the repo before building the model
    if (key === "rev-parse --is-inside-work-tree") return { out: "true\n", code: 0 }
    return lookup(key)
  }

  const git = (...a: string[]): string => {
    const r = run(a)
    if (r.code) throw new Error(`git ${a[0]} failed`)
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

/** `git log --all` in the format the model consumes, assembled from readable commits. */
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

/** `rev-list --left-right --count a...b` returns `behind ahead`. */
export const leftRight = (behind: number, ahead: number) => `${behind}\t${ahead}\n`