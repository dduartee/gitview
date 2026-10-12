# gitview

Git graph by *lanes* in the terminal, and single-file HTML export. A Bun CLI with no
build step.

See [`README.md`](./README.md) for what the tool does and how to use it.

## Commands

- `bun run start` — opens the TUI
- `bun run dump` — dumps the graph as text and exits
- `bun run export <file.html>` — generates the self-contained HTML
- `bun test` — tests
- `bun run check` — typecheck + boundaries + tests. Run it before calling work done.

## Packages

Packages are deep modules: a lot of behaviour behind a small interface. Import only through
the entry points (the files at the package root); `lib/` is private and is never imported from
outside — `bun run lint:boundaries` fails if you violate that. See
[`packages/README.md`](./packages/README.md) before adding or importing a package.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `dduartee/gitview`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Constraints worth knowing up front

These come from the project's own README, not from the skill templates. They are the kind of thing
an agent gets wrong by assumption:

- **Nothing is written to the user's repo.** No ref moves, no file appears in the working tree.
  Everything comes from `git log` / `rev-list` / `merge-tree` in read-only mode. Do not add
  checkout, reset, or anything that mutates refs.
- **One package per concern, no build step.** `gitview.ts` at the root is the composition
  root — args, dispatch, nothing else. Everything else lives under `packages/`. Bun runs the
  TypeScript directly; there is no bundler, no `dist/`, no transpile. (`bun build --compile`
  still produces a single binary.) The README used to say "a single file" and no longer
  does — the *exported HTML* is still one file, which is a different claim.
- **The HTML export is self-contained.** No CDN, no external JS, no build. It opens on a double
  click and has to keep working when emailed or attached to a PR.
- **The two renderers are independent implementations.** They share the *model* (see
  `GLOSSARY.md`), not a renderer. The terminal is a character grid, `DX=4 RH=3`; the HTML is
  SVG, `ROW=40 CW=26`. Zoom, filtering, X axis and `#lane=` deep-links exist **only in the
  HTML**. The README used to claim one shared renderer — it never did, and the glossary now
  says so explicitly. Don't write code that assumes parity.
- **Don't mutate the model while rendering it.** Fixed: `project()` builds a local
  `[lane, y]` pair list instead of writing `lane.y` through, and `packages/export/tests/`
  holds the regression test (verified to fail against the old code). New code that touches
  the model should copy, never write through.
- **Branches are never deleted to keep a commit visible.** Commits from deleted branches still
  appear in the graph, as grey "branchless" commits, counted in a footer band.
- **`getMatrix()` silently caps at 40 branches.** A repo with more open branches gets an
  incomplete matrix with no warning. The HTML says so; the TUI does not. Worth fixing.
- **The default branch is declared, never hardcoded.** `--default-branch a,b` → `.gitview.json` →
  `refs/remotes/origin/HEAD` → name convention (category `main`). Don't add branch names to a
  list in the code. Structural guessing is a trap: in a real repo `origin/21.03`, a stale
  release, has *more* descendants than `develop`, so "most branches descend from it" ranks dead
  branches as the default branch. See `docs/adr/0002-default-branch-by-declaration.md`.
- **The default branch is not the same thing as the merge destination.** `develop` is the
  default branch (top of the Y axis, pinned) while staying category `dev` (colour, merge
  target). Promoting it to category `main` makes `pick("main")` choose the newest of the two,
  and features start aiming at `main` — a silent merge-plan bug traded for a colour bug. The
  same distinction makes `target` in the inactive-branch check the first resolved default
  branch rather than the literal `"main"`.
