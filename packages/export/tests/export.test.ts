// Regression for the `exportHtml` bug that renumbered `b.y` in place.
//
// Before the split, `exportHtml` did `vis.forEach((b, i) => { b.y = i })` directly on
// the live `Br` objects. The TUI draws commits from `Y` (a snapshot of primitives,
// therefore correct) and lane names from `lane.y` (the object, renumbered). Press `e` to
// export from inside the TUI, the file comes out right and the graph comes back
// misaligned: commits on the right rows, names on the wrong rows.

import { describe, expect, test } from "bun:test"
import { createFakeGit, logOutput } from "../../git/fake.ts"
import { buildModel, visible } from "../../model/index.ts"
import { createMergePlanner } from "../../merge/index.ts"
import { project } from "../index.ts"

const RESP = {
  "log --all": {
    out: logOutput([
      { hash: "a1", refs: ["HEAD -> main", "origin/main"] },
      { hash: "b1", parents: ["a1"], refs: ["HEAD -> feature/login"] },
      { hash: "c1", parents: ["a1"], refs: ["HEAD -> hotfix/urgent"] },
      { hash: "d1", parents: ["a1"], refs: ["HEAD -> topic/spike"] },
      { hash: "e1", parents: ["b1"] },
    ]),
  },
  "rev-parse HEAD": { out: "e1\n" },
  "--version": { out: "git version 2.45.0\n" },
  "rev-list --left-right --count main...feature/login": { out: "0\t2\n" },
  "rev-list --left-right --count main...hotfix/urgent": { out: "0\t1\n" },
  "rev-list --left-right --count main...topic/spike": { out: "0\t1\n" },
}

const build = () => {
  const g = createFakeGit(RESP)
  const m = buildModel(g)
  return { g, m, planner: createMergePlanner(g, m) }
}

describe("project does not mutate the model", () => {
  test("the model's lane y values are the same after projection", () => {
    const { g, m, planner } = build()

    const before = m.lanes.filter(visible).map(b => [b.name, b.y])
    expect(before.length).toBeGreaterThan(0)

    project(g, m, planner.getReport(), planner.getMatrix())

    const after = m.lanes.filter(visible).map(b => [b.name, b.y])
    expect(after).toEqual(before)
  })

  test("exporting twice yields the same projection", () => {
    const { g, m, planner } = build()
    const a = project(g, m, planner.getReport(), planner.getMatrix())
    const b = project(g, m, planner.getReport(), planner.getMatrix())
    expect(b.lanes).toEqual(a.lanes)
  })

  test("the commits stay on the row the TUI would draw", () => {
    const { g, m, planner } = build()
    const graph = project(g, m, planner.getReport(), planner.getMatrix())

    // `laneOf` must agree with `lanes[].y`, otherwise the HTML and the TUI show
    // the same commit on different rows.
    graph.lanes.forEach((l, i) => {
      graph.laneOf.forEach((li, commit) => {
        if (li === i) expect(l.y).toBe(i)
      })
    })

    // and no commit may point at a lane that does not exist
    expect(graph.laneOf.every(i => i >= 0 && i < graph.lanes.length)).toBe(true)
  })
})

describe("the projection uses reindexed y, without touching the model", () => {
  test("the HTML numbers the lanes in sequence, in model order", () => {
    const { g, m, planner } = build()
    const graph = project(g, m, planner.getReport(), planner.getMatrix())
    expect(graph.lanes.map(l => l.y)).toEqual(graph.lanes.map((_, i) => i))
  })

  test("the lane order in the HTML is the terminal's vertical order", () => {
    const { g, m, planner } = build()
    const graph = project(g, m, planner.getReport(), planner.getMatrix())
    const modelOrder = m.lanes.filter(visible).sort((a, b) => a.y - b.y).map(b => b.name)
    expect(graph.lanes.map(l => l.name)).toEqual(modelOrder)
  })
})