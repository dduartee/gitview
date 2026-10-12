# CONSTRAINTS

```yaml
Project: gitview
Description: git graph by lanes in the terminal, and single-file HTML export
Level: 2 — PRAGMATIC
```

Chosen by three axes of `../suckless-manifest/DEPTH-CONSTRAINTS.md`: 1 person
maintaining (Level 1–2), low criticality — a personal CLI, not a service (Level 1–2),
small overhead (Level 2). The manifest's `cli-tool` template (Level 1, 500 LOC, C)
is for a `dmenu`; gitview does two things — TUI and HTML export — and has a TTY
interface with mouse.

## Constraints

```yaml
max_lines_of_code: 2400        # includes the embedded HTML template; measures volume, not complexity
max_dependencies_direct: 5     # runtime only; dev doesn't count
max_lines_per_function: 50     # the limit that actually measures readability
allowed_languages: [TypeScript]
transpilation_allowed: false
build_step: none               # bun runs TypeScript directly
```

**The ceiling is 2400, and today the code sits at 1987.** The number came from measurement,
not taste: we started at 2021, the decomposition into packages led to a peak of 2198, hence
the 2400 ceiling. After extracting `GitView` and `Painter` from `renderSelf`, splitting
`buildModel` and `createMergePlanner`, and removing dead exports and a duplicated function,
the total **fell below the starting point**.

| | peak | today |
| --- | --- | --- |
| `tui/index.ts` | 225 | 34 |
| `tui/lib/view.ts` | — | 248 |
| `tui/lib/pintor.ts` | — | 157 |
| `merge/index.ts` | 122 | 202 |
| **total (binary)** | 2198 | **1987** |

`view.ts` and `pintor.ts` are not new code: it is the drawing that used to live inside
`renderSelf`, now with an address. That is why file LOC measures **volume**, not complexity —
and why the ceiling that would actually catch an unreadable function is the other one,
`max_lines_per_function`.

**17% of headroom.** With the code at 1987, the 2400 left plenty of room. Lowering it to
~2100 would give real headroom of ~5%, which is what a ceiling exists to do: force every
new line to be justified.

**Tests stay out of the count.** `script/sinks.ts` measures only what goes into the binary;
tests appear separately. Counting them toward the ceiling would punish whoever writes
verification, the opposite of what this file exists to encourage.

The `+80` in `merge` is the price of names that replaced 60+ line functions with eight state
variables. A known cost in exchange for readability, not accidental growth.

**What this ceiling does not measure:** `packages/export/lib/template.ts` is 497 lines of CSS
and JS inside a string literal, beyond `tsc`'s reach. It is the riskiest file in the repo and
no automatic metric reaches it — see rule 4.

## approved_packages

| package | kind | reason |
| --- | --- | --- |
| `@opentui/core` | runtime | without it there is no TUI in TypeScript. Writing the cell buffer, the mouse parsing and the terminal raw mode is the whole @dmenu. **Only runtime dep.** |
| `bun-types` (`@types/bun`) | dev | runtime types |
| `dependency-cruiser` | dev | enforces the 5 package boundary rules. TypeScript does not express "don't reach `lib/` from outside" — a deep import compiles the same. An architecture framework, yes; questionable by the manifest's criteria, kept because the rule is verifiable and the cost is zero at runtime. |

## rejected_packages

| package | reason |
| --- | --- |
| any UI renderer (React, Ink, blessed,…) | each one brings 100+ transitive deps and a state model that would compete with `GitView` |
| CLI framework (commander, yargs) | it is 6 lines of `args.indexOf`. `VALUED` + `flag()` give control and 0 deps |
| argv parser (yargs-parser, minimist) | same |
| bundler (esbuild, tsup, rollup) | `bun gitview.ts` already runs. A build would be a step with no return |
| HTML generator (lit, preact, react) | the export must be **a single file, with no CDN and no external JS**. A template framework would violate the tool's central guarantee |
| test runner (jest, vitest) | `bun test` already exists |
| ORM / db / http client | the tool is read-only over `git` and the filesystem. No network |

## Rules

1. **Removed lines > added lines.** The manifest's motto is the metric for every change.
   A PR that adds without removing must justify it in the body.
2. **A new dep is rejected by default.** It only gets in with the reason written above the
   real reason.
3. **Every function fits on screen.** More than ~50 lines is readability debt, not intrinsic
   complexity. The limit is not automatic: it is reviewed.
4. **`packages/export/lib/template.ts` is the riskiest file in the repo.** It is untyped JS
   inside a string, does not pass through `tsc` and is only exercised by opening the HTML.
   Every change to it requires running `--export` and looking at the result.
5. **No new architecture framework.** `dependency-cruiser` is already the limit of how much
   indirection this project accepts.

## Validation

```bash
bun run check              # typecheck + boundaries + tests
bun run sinks              # this file: LOC and deps against the ceilings
```

## Where this file is wrong

A ceiling nobody looks at is not a constraint, it is decoration. `sinks` exists so that the
first person to blow it gets the number in their face, and so that this file can be corrected
with evidence instead of common sense.