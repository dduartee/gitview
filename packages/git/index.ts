// The only way to talk to git in the whole project.
//
// Interface: `createGit(repo)` returns `{ repo, run, git }`. No other package sees
// `execFileSync`, the 512 MB buffer or the exit codes — they only know this here.
//
// Two adapters: the production one (`createGit`) and a fake in `tests/`, which returns the same
// format from fixtures. That is why the seam is real.

import { execGit } from "./lib/exec.ts"

/** Result of a git command. `code !== 0` is not an error — it is how a conflict is discovered. */
export type GitResult = { out: string; code: number }

export type Git = {
  /** Repository path, already resolved. Every command runs with `-C repo`. */
  repo: string
  /** Command that may fail. Returns stdout and code, never throws. */
  run: (a: string[], env?: Record<string, string>) => GitResult
  /** Command that must succeed. Throws on code != 0. */
  git: (...a: string[]) => string
}

/** Fixed identity for the merge planner's synthetic commits. */
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
    if (r.code) throw new Error(`git ${a[0]} failed`)
    return r.out
  }
  return { repo, run, git }
}