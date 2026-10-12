// Tests of the model, through the public interface: `buildModel(git)`.
//
// Nothing here imports `lib/`. The git answers come from the fake, which is an entry point.

import { describe, expect, test } from "bun:test"
import { createFakeGit, leftRight, logOutput } from "../../git/fake.ts"
import { buildModel, catOf, visible, DX } from "../index.ts"

/** `inactive` is keyed by lane, so a name lookup goes through `lanes`. */
const inactive = (m: ReturnType<typeof buildModel>, name: string) =>
  m.inactive.has(m.lanes.find(b => b.name === name)!)

/**
 * Repo with 5 commits: main, three branches that come off `a1`, and a continuation.
 *
 * The list is in the order `git log` actually delivers: **newest first**.
 * `e1` (child of `b1`) comes at the top. The model reverses to `cs`, and that is where
 * `a1` becomes 0.
 */
const repo = (over: Record<string, { out: string; code?: number }> = {}) => createFakeGit({
  "log --all": {
    out: logOutput([
      { hash: "e1", parents: ["b1"] },
      { hash: "d1", parents: ["a1"], refs: ["HEAD -> topic/spike"] },
      { hash: "c1", parents: ["a1"], refs: ["HEAD -> hotfix/urgent"] },
      { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/login"] },
      { hash: "a1", refs: ["HEAD -> main", "origin/main"] },
    ]),
  },
  "rev-parse HEAD": { out: "e1\n" },
  // The `target` of inactive detection is the **hash** of main's tip (`a1`), not the name
  // "main" — that is what `tipByBranch.get("main")` returns. The keys below are what the model
  // actually asks for; if the code changes the query, the tests fail instead of lying.
  "rev-list --left-right --count a1...b1": { out: leftRight(0, 2) },
  "rev-list --left-right --count a1...c1": { out: leftRight(0, 1) },
  "rev-list --left-right --count a1...d1": { out: leftRight(0, 1) },
  ...over,
})

const lane = (m: ReturnType<typeof buildModel>, name: string) => m.lanes.find(b => b.name === name)!

describe("buildModel", () => {
  test("each commit falls into the lane of the branch that owns it", () => {
    const m = buildModel(repo())
    expect(m.owner.get("a1")!.name).toBe("main")
    expect(m.owner.get("b1")!.name).toBe("feature/login")
    expect(m.owner.get("c1")!.name).toBe("hotfix/urgent")
    expect(m.owner.get("d1")!.name).toBe("topic/spike")
  })

  test("a commit no first-parent reaches is orphaned, and becomes a nameless lane", () => {
    // `e1` is a child of `b1`, which already belongs to feature/login. The first-parent
    // walk of feature/login goes from b1 to a1 and stops — it never reaches e1, because
    // e1 is newer than the tip. It is left with no owner and becomes branchless.
    const m = buildModel(repo())
    expect(m.lanes.filter(b => b.name === "").map(b => b.list)).toEqual([["e1"]])
  })

  test("a branch lane walks first-parent, from the tip backwards", () => {
    const m = buildModel(repo())
    // feature/login has b1 as its tip; b1's first-parent is a1, which already belongs to main
    expect(lane(m, "feature/login").list).toEqual(["b1"])
    // main goes up to a1 and stops. `e1` (child of b1) is not reached by first-parent,
    // so it is left with no owner and becomes branchless — that is what the nameless
    // lane below represents.
    expect(lane(m, "main").list).toEqual(["a1"])
  })

  test("the X axis is the commit index times DX", () => {
    const m = buildModel(repo())
    expect(m.X).toEqual([0, DX, DX * 2, DX * 3, DX * 4])
  })

  test("`cs` is the reversed log, so X grows backwards in time", () => {
    const m = buildModel(repo())
    // `git log` delivers newest first (`commits[0]` is `e1`); `cs` reverses so the index
    // grows with time — oldest commit at index 0.
    expect(m.commits[0].hash).toBe("e1")
    expect(m.cs[0].hash).toBe("a1")        // oldest
    expect(m.cs[m.N - 1].hash).toBe("e1")  // newest
  })

  test("main stays pinned at the top of the Y axis, with its own line", () => {
    const m = buildModel(repo())
    // Line 0 is reserved for labels ("tags") when there are tags; without them, the
    // default branch starts at 1. main is the first default branch, so it is the highest
    // lane of all.
    const ys = m.lanes.filter(visible).map(b => b.y)
    expect(lane(m, "main").y).toBe(Math.min(...ys))
    expect(m.labels).toEqual([])   // this repo has no tag
  })

  test("each visible lane occupies a whole line of height RH", () => {
    const m = buildModel(repo())
    const ys = m.lanes.filter(visible).map(b => b.y).sort((a, b) => a - b)
    // main sits alone on line 1 (0 is reserved for labels); the others are packed by not
    // overlapping in x, every 3.
    expect(ys).toEqual([1, 4, 7, 10, 13])   // RH = 3
  })

  test("a lane whose tip already belongs to another has no list, marked by its tip", () => {
    // main and release/1.0 point to the SAME commit `a1`. main (lower CATEGORY_ORDER)
    // goes first and keeps `a1`; release/1.0 then has no exclusive commit, and the model
    // marks `tipAt` at the index of `a1` instead of letting the lane disappear.
    const g = createFakeGit({
      "log --all": {
        out: logOutput([
          { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/x"] },
          { hash: "a1", refs: ["HEAD -> main", "origin/main", "release/1.0"] },
        ]),
      },
      "rev-parse HEAD": { out: "b1\n" },
      "rev-list --left-right --count a1...b1": { out: leftRight(0, 1) },
    })
    const m = buildModel(g)
    const rel = lane(m, "release/1.0")
    expect(rel.list).toEqual([])
    expect(rel.tipAt).toBe(0)          // index of `a1` in cs (a1 is the oldest)
    expect(visible(rel)).toBe(true)   // visible, but with no commits
    expect(m.owner.get("a1")!.name).toBe("main")
  })

  test("a commit from a deleted branch becomes branchless, and stays in the graph", () => {
    // `w1` has no ref at all: it was deleted. It becomes a nameless lane. The point of
    // the test is that it stays in the graph and keeps owning a commit — no commit
    // disappears for lack of a ref.
    const g = createFakeGit({
      "log --all": {
        out: logOutput([
          { hash: "a1", refs: ["HEAD -> main", "origin/main"] },
          { hash: "w1", parents: ["a1"] },
          { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/x"] },
        ]),
      },
      "rev-parse HEAD": { out: "b1\n" },
      "rev-list --left-right --count a1...b1": { out: leftRight(0, 1) },
    })
    const m = buildModel(g)
    const branchless = m.lanes.filter(b => b.name === "" && visible(b))
    expect(branchless.length).toBe(1)
    expect(branchless[0].list).toEqual(["w1"])
    expect(m.cs.some(c => c.hash === "w1")).toBe(true)
    expect(m.owner.get("w1")).toBe(branchless[0])
    // and the branchless lane takes a spot on the Y axis, like any other
    expect(m.Y[1]).toBe(branchless[0].y)
    // and it is inactive: a lane with no branch has nothing left to deliver. Keying the
    // set by branch name used to skip exactly these lanes.
    expect(m.inactive.has(branchless[0])).toBe(true)
  })

  test("ahead 0 marks the lane as inactive", () => {
    const m = buildModel(repo({ "rev-list --left-right --count a1...d1": { out: leftRight(3, 0) } }))
    expect(inactive(m, "topic/spike")).toBe(true)
    expect(inactive(m, "hotfix/urgent")).toBe(false)
  })

  test("main and master are never marked inactive", () => {
    const m = buildModel(repo())
    expect(inactive(m, "main")).toBe(false)
  })
})

describe("catOf", () => {
  test("classifies by the name's suffix and prefix", () => {
    expect(catOf("main")).toBe("main")
    expect(catOf("release/1.2")).toBe("release")
    expect(catOf("hotfix/urgent")).toBe("hotfix")
    expect(catOf("feat/login")).toBe("feature")
    expect(catOf("topic/spike")).toBe("feature")
    expect(catOf("wip/experiment")).toBe("feature")
    expect(catOf("whatever")).toBe("other")
  })

  test("develop falls into `dev`, not `main`", () => {
    // It is the current behavior, and it is what the GLOSSARY records. `develop` is NOT a
    // default branch, so it gets no pinning and not main's color. See open issue.
    expect(catOf("develop")).toBe("dev")
  })

  test("a nested path ending in main is still main", () => {
    expect(catOf("team/platform/main")).toBe("main")
    expect(catOf("team/platform/develop")).toBe("dev")
  })
})