// Exercises the template script against the DOM shim.
//
// What these tests guarantee: the template **runs without throwing**, the `id`s it looks
// up exist in the HTML, and execution is deterministic. It is the net that was missing on
// the riskiest file in the repo — before this, any change to the template was verified by
// opening the HTML by hand.

import { describe, expect, test } from "bun:test"
import { createFakeGit, leftRight, logOutput } from "../../git/fake.ts"
import { buildModel } from "../../model/index.ts"
import { createMergePlanner } from "../../merge/index.ts"
import { project, TPL_DAG } from "../index.ts"
import { interact, runTemplate, signature } from "./dom.ts"

const g = createFakeGit({
  "log --all": { out: logOutput([
    { hash: "f2", parents: ["d1"], refs: ["HEAD -> feature/x"] },
    { hash: "d1", parents: ["m1"], refs: ["HEAD -> develop"] },
    { hash: "m1", refs: ["HEAD -> main", "origin/main"] },
  ]) },
  "rev-parse HEAD": { out: "f2\n" },
  "--version": { out: "git version 2.45.0\n" },
  "rev-list --left-right --count m1...f2": { out: leftRight(0, 1) },
  "rev-list --left-right --count m1...d1": { out: leftRight(1, 0) },
})

const graph = () => {
  const m = buildModel(g)
  const p = createMergePlanner(g, m)
  return JSON.stringify(project(g, m, p.getReport(), p.getMatrix()))
}

describe("template HTML", () => {
  test("runs without throwing against a real projection", () => {
    const r = runTemplate(TPL_DAG, graph())
    expect(r.error).toBeNull()
  })

  test("every id the script looks up exists in the HTML", () => {
    const r = runTemplate(TPL_DAG, graph())
    // `getElementById` of a nonexistent id returns null in the browser, and the template
    // then breaks on `.textContent` of null. This set must be empty.
    expect([...r.dom.missingIds]).toEqual([])
  })

  test("builds the DAG: creates nodes and links", () => {
    const r = runTemplate(TPL_DAG, graph())
    // 3 commits, each becomes a node; `circle` is what the SVG uses
    expect(r.signature).toContain("circle:")
    expect(r.signature).toMatch(/nodes=[1-9]/)
  })

  test("is deterministic: two runs give the same signature", () => {
    const a = runTemplate(TPL_DAG, graph())
    const b = runTemplate(TPL_DAG, graph())
    expect(signature(b.dom)).toBe(signature(a.dom))
  })

  test("empty projection does not break: falls into the friendly error path", () => {
    const r = runTemplate(TPL_DAG, JSON.stringify({ repo: "x", commits: [] }))
    expect(r.error).toBeNull()
    // the script writes "no data" in the title when there are no commits
    const t = r.dom.byId.get("t")
    expect(t?.textContent).toContain("no data")
  })

  test("the interactions do not break: tabs, switches, search, and arrows", () => {
    // Covers the paths loading does not touch — zoom, filter, tab switching. A botched
    // `var`→`let` would show up here, not in the first render.
    const r = runTemplate(TPL_DAG, graph())
    expect(r.error).toBeNull()
    const ex = interact(r.dom)
    expect(ex.fired).toBeGreaterThan(0)
    expect(ex.errors).toEqual([])
    // toggling a switch writes session and reloads: that is the template's behavior
    expect(r.dom.reloads).toBeGreaterThan(0)
  })
})