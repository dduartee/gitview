# Packages

Each directory here is a **deep module**: a lot of behaviour behind a small interface. A
package's public surface is its **entry points** — the files at the package root. Everything
in a subfolder is private.

```
packages/
  git/            index.ts     ← entry point: createGit(repo) -> { run, git }
                  fake.ts      ← entry point: the test adapter
                  lib/exec.ts  ← private
  model/          index.ts     ← entry point: buildModel(git), catOf, laneColor, mix, DX, RH
                  lib/color.ts ← private
  merge/          index.ts     ← entry point: createMergePlanner(git, model, flags)
  export/         index.ts     ← entry point: exportHtml(...), project(...)
                  lib/template.ts ← private (the embedded HTML)
  tui/            index.ts     ← entry point: startTui({ g, m, planner, onExport })
```

## The rule

**Import only through a package's entry points** — the files at its root. `lib/` is
implementation and is never imported from outside. The rule is by depth, not by folder name:
any subfolder is private, so creating a new folder does not require touching the config.

Why `packages/git/fake.ts` is at the root and not in `lib/`: it is the **second adapter** of
the git seam. An interface with a single adapter is indirection; with two it is a real seam —
and the test adapter must be reachable from `packages/*/tests/`, which by rule cannot see
anyone's subfolders. That is why it is an entry point.

## No barrel

A package must **not** have an `index.ts` that re-exports the whole subtree. Expose several
small entry points (`index.ts`, `fake.ts`, `client.ts`) instead of one giant `index.ts`. A
barrel hides what is exposed and makes everyone import through the same path, which destroys
the reason for the interface to be small.

## Running

```bash
bun run lint:boundaries   # dependency-cruiser, 5 rules, all errors
bun run check            # typecheck + lint:boundaries + tests
```

The five rules that `depcruise` enforces:

| rule | what it forbids |
| --- | --- |
| `entrypoint-boundary-from-app` | app/root reaching any package's `lib/` |
| `entrypoint-boundary-across-packages` | one package reaching another's `lib/` |
| `tests-through-entrypoints` | a test reaching `lib/`, not even its own package's |
| `tests-folder-is-private` | something outside `tests/` importing a fixture |
| `no-circular` | dependency cycle |

Changing `.dependency-cruiser.cjs` is rare: the rules are by depth, so almost anything new
fits without touching the config. The only field that gets adjusted is `PACKAGES_ROOT`.

## Where things live

`gitview.ts` at the root is the **composition root**: it parses arguments and chooses what to
run. It is the only one that does process I/O and the only one with a boot side effect, guarded
by `import.meta.main`. All the logic lives in the packages, reachable through `import`.

The two renderers (`tui`, `export`) do **not** know each other. They share the `model`, and
only it. Zoom, filtering, X axis and deep-link belong to the HTML — the glossary records the
asymmetry. If one day you need the TUI to gain a feature from the HTML, the place for it is the
`model`, not an import between the two.

## The mirror inside the template

`export/lib/template.ts` is live JS and CSS inside a string, and it **duplicates** the colours
per category (`COL`, plus `pastel` mirroring `mix`). There is no way for TypeScript to verify
this. If you change a category's colour, change both sides, and leave a comment back in the
other file. The list of default branches is *not* duplicated: the template reads
`G.defaultBranches`, which the model resolved.