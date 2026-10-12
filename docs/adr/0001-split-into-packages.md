# 0001 — Split the CLI into packages

**Status:** accepted · **Date:** 2026-10-11

## Context

`gitview` was born as a single file, `gitview.ts`, at 978 lines. That was a selling point
in the README ("One file, no build") and it worked: bun runs TypeScript directly, with no
build, no dependency beyond `@opentui/core`.

The problem showed up when the codebase had to be **verified**:

- The file was a sequence of top-level side effects — `git log --all` at module load (L50)
  and `await createCliRenderer(...)` (L972). An `import` of the file would take the
  terminal and block.
- So `bun test` had **no** tests, and still **passed**: the script was in the
  `package.json` reporting green over an empty suite. A check that lies is worse than no
  check at all.
- With the structure closed, a real bug had nowhere to be tested: `exportHtml` renumbered
  `b.y` in place, on the live objects, and the TUI graph came back misaligned after
  exporting.

We filled that void with golden output (a diff of `--dump` and of the exported HTML against
the pre-refactor behaviour), which gave enough confidence to touch things.

## Decision

Split into `packages/`, one package per concern, with `gitview.ts` as the composition root.

| package | entry point | responsibility |
| --- | --- | --- |
| `git` | `createGit(repo)`, `fake.ts` | the execution seam: `{ run, git }` |
| `model` | `buildModel(git)`, `catOf`, `laneColor`, `mix` | commit→lane assignment, order, colours |
| `merge` | `createMergePlanner(...)` | merge plan and conflict matrix |
| `export` | `exportHtml(...)`, `project(...)` | single-file HTML |
| `tui` | `startTui(...)` | terminal renderer |

The boundary criterion is **folder depth**: the files at a package's root are entry points
and everything in a subfolder is private. `dependency-cruiser` enforces this as an error,
with five rules.

## Why this design

**One package per renderer, not a `render` package.** The README claimed that the HTML and
the terminal used "the same renderer". It was false: they are two independent
implementations, with their own coordinates, interaction and features. Zoom, filter, the
X axis and deep-links exist only in the HTML. What the two share is the **model**, and only
it — so that is what became the boundary. A `render` package would have forced the two to
know each other in order to share the model, which is exactly the opposite of isolating the
asymmetry.

**`fake.ts` at the root, not in `lib/`.** It is the second adapter of the git seam. The
boundary rule stops a test from reaching any package's `lib/`, so a fixture in `lib/` would
be unreachable from outside. Entry point is the only position that satisfies "accessible to
the tests" and "not implementation".

**One real seam, not five.** Only git has two adapters (production and test). `model`,
`merge`, `export` and `tui` are pure transformations on top — the golden output is their
second adapter, and it stays outside the code.

## Consequences

**Gains:** the `b.y` bug was fixed and covered by a test verified to fail against the old
code; `bun test` has 19 passing tests; `bun run check` runs typecheck + boundaries + tests;
`tsc` clean; the model became testable with 6-line fixtures instead of a real repo.

**Cost:** the README's "One file" stops being true and was corrected. Whoever consumed the
repo by reading a single file now reads `packages/`. `bun build --compile` still produces a
single binary, and the HTML export is still a single file — which is the guarantee that
mattered.

**Out of scope, and why:** `noUncheckedIndexedAccess` stays off. Measured: 77 errors in the
single file, 80 after the split. The refactor did not solve this; solving it is separate
work.

**Debt recorded, not paid:** `getMatrix()` caps at 40 branches without warning in the TUI;
the HTML template duplicates `COL` and `TRUNK` from the TypeScript with no possible
verification; `develop` is not in `TRUNK` and is classified as `dev`, which gives the wrong
colour and loses pinning for whoever works on `develop`.