// Tests of default branch resolution, through the interface: `buildModel(git, { defaultBranches })`.
//
// No import of `lib/`. The sources of truth are the git fake and the repo on disk.

import { describe, expect, test } from "bun:test"
import { createFakeGit, logOutput } from "../../git/fake.ts"
import { buildModel, type BuildOptions } from "../index.ts"

/**
 * Repo with `main`, `develop` and two features. All with refs, so `loc` knows which
 * branches exist — `resolveDefaultBranches` receives `exists` from here.
 */
const repo = (over: Record<string, { out: string; code?: number }> = {}) => createFakeGit({
  "log --all": {
    out: logOutput([
      { hash: "f2", parents: ["d1"], refs: ["HEAD -> feature/over-develop"] },
      { hash: "d1", parents: ["m1"], refs: ["HEAD -> develop", "origin/develop"] },
      { hash: "f1", parents: ["m1"], refs: ["HEAD -> feature/login"] },
      { hash: "m1", refs: ["HEAD -> main", "origin/main"] },
    ]),
  },
  "rev-parse HEAD": { out: "f2\n" },
  ...over,
})

const build = (over?: Record<string, { out: string; code?: number }>, opts?: BuildOptions) =>
  buildModel(repo(over), opts)

/** `inactive` is keyed by lane, so a name lookup goes through `lanes`. */
const inactive = (m: ReturnType<typeof build>, name: string) =>
  m.inactive.has(m.lanes.find(b => b.name === name)!)

describe("default branch source", () => {
  test("--default-branch beats everything", () => {
    const m = build({ "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/main\n" } }, { defaultBranches: ["develop", "main"] })
    expect(m.defaultBranchSource).toBe("flag")
    expect(m.defaultBranches).toEqual(["develop", "main"])
  })

  test("origin/HEAD beats the name convention", () => {
    const m = build({ "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/develop\n" } })
    expect(m.defaultBranchSource).toBe("remote-head")
    // `main` still enters: `catOf("main") === "main"`, so it is a default branch by
    // convention regardless of what the remote said.
    expect(m.defaultBranches[0]).toBe("develop")
    expect(m.defaultBranches).toContain("main")
  })

  test("with no remote and no flag, falls back to the name convention", () => {
    const m = build()   // the fake returns empty stdout for symbolic-ref => code 0, out ""
    expect(m.defaultBranchSource).toBe("name")
    expect(m.defaultBranches).toContain("main")
  })

  test("no source => no default branch, and the model still builds", () => {
    // repo with no main/master in loc, no remote, no flag
    const g = createFakeGit({
      "log --all": { out: logOutput([{ hash: "z1", refs: ["HEAD -> wip/scratch"] }]) },
      "rev-parse HEAD": { out: "z1\n" },
    })
    const m = buildModel(g)
    expect(m.defaultBranchSource).toBe("none")
    expect(m.defaultBranches).toEqual([])
    expect(m.N).toBe(1)
  })
})

describe("pinning", () => {
  test("default branches stay at the top of the Y axis, in list order", () => {
    const m = build({ "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/main\n" } }, { defaultBranches: ["main", "develop"] })
    const y = (n: string) => m.lanes.find(b => b.name === n)!.y
    expect(y("main")).toBeLessThan(y("develop"))
    expect(y("develop")).toBeLessThan(y("feature/login"))
    expect(y("develop")).toBeLessThan(y("feature/over-develop"))
  })

  test("each default branch gets its own line, spaced by RH", () => {
    const m = build({}, { defaultBranches: ["main", "develop"] })
    const y = (n: string) => m.lanes.find(b => b.name === n)!.y
    expect(y("main")).toBe(1)          // line 0 is for labels (a tag? not here) — see below
    expect(y("develop") - y("main")).toBe(3)   // RH
  })

  test("without a default branch, nothing is pinned and the order is only by date", () => {
    const g = createFakeGit({
      "log --all": {
        out: logOutput([
          { hash: "c1", parents: ["a1"], refs: ["HEAD -> feature/b"] },
          { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/a"] },
          { hash: "a1", refs: ["HEAD -> wip/base"] },
        ]),
      },
      "rev-parse HEAD": { out: "c1\n" },
    })
    const m = buildModel(g)
    expect(m.defaultBranches).toEqual([])
    // no lane has y below the default-branch block — the top is simply the date
    const ys = m.lanes.filter(b => b.list.length).map(b => b.y).sort((x, z) => x - z)
    expect(ys[0]).toBe(1)
  })
})

describe("a default branch is not category main", () => {
  test("develop is a default branch but stays category dev", () => {
    const m = build({}, { defaultBranches: ["develop"] })
    const d = m.lanes.find(b => b.name === "develop")!
    expect(d.cat).toBe("dev")
    // and the merge plan keeps aiming at develop, not main — that is what category dev guarantees
    expect(m.defaultBranches).toContain("develop")
  })
})

describe("inactive detection", () => {
  test("measures against the first default branch, not the literal main", () => {
    // origin/HEAD = develop, and develop has 1 commit ahead of feature/login.
    // Comparing against develop is right; against main it would give another result.
    const m = build({
      "symbolic-ref --short refs/remotes/origin/HEAD": { out: "origin/develop\n" },
      "rev-list --left-right --count d1...f1": { out: "0\t0\n" },   // feature/login is already in develop
      "rev-list --left-right --count m1...f1": { out: "1\t0\n" },
      "rev-list --left-right --count d1...f2": { out: "0\t0\n" },
    })
    expect(inactive(m, "feature/login")).toBe(true)
  })

  test("no default branch is a default branch of itself: it never enters the inactive list", () => {
    const m = build({}, { defaultBranches: ["main", "develop"] })
    expect(inactive(m, "main")).toBe(false)
    expect(inactive(m, "develop")).toBe(false)
  })
})