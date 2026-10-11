# gitview

Grafo do git por *lanes* no terminal, e export HTML de um arquivo só. CLI em Bun, implementação
inteira em `gitview.ts`, sem build.

Ver [`README.md`](./README.md) para o que a ferramenta faz e como se usa.

## Comandos

- `bun run start` — abre o TUI
- `bun run dump` — despeja o grafo em texto e sai
- `bun run export <arquivo.html>` — gera o HTML auto-contido
- `bun test` — testes
- `bun run check` — typecheck + fronteiras + testes. Rode antes de dar trabalho por pronto.

## Packages

Packages são módulos profundos: muito comportamento atrás de uma interface pequena. Importe
só pelos entry points (os arquivos na raiz do package); `lib/` é privado e nunca se importa
de fora — `bun run lint:boundaries` falha se você violar. Ver
[`packages/README.md`](./packages/README.md) antes de adicionar ou importar um package.

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
  still produces a single binary.) The README used to say "um arquivo só" and no longer
  does — the *exported HTML* is still one file, which is a different claim.
- **The HTML export is self-contained.** No CDN, no external JS, no build. It opens on a double
  click and has to keep working when emailed or attached to a PR.
- **The two renderizers are independent implementations.** They share the *model* (see
  `GLOSSARY.md`), not a renderer. The terminal is a character grid, `DX=4 RH=3`; the HTML is
  SVG, `ROW=40 CW=26`. Zoom, filtering, X axis and `#lane=` deep-links exist **only in the
  HTML**. The README used to claim one shared renderer — it never did, and the glossary now
  says so explicitly. Don't write code that assumes parity.
- **Don't mutate the model while rendering it.** Fixed: `project()` builds a local
  `[lane, y]` pair list instead of writing `lane.y` through, and `packages/export/tests/`
  holds the regression test (verified to fail against the old code). New code that touches
  the model should copy, never write through.
- **Branches are never deleted to keep a commit visible.** Commits from deleted branches still
  appear in the graph, as grey "ghosts", counted in a footer band.
- **`getMatrix()` silently caps at 40 branches.** A repo with more open branches gets an
  incomplete matrix with no warning. The HTML says so; the TUI does not. Worth fixing.
- **`develop` is not a trunk.** `TRONCO` is `["main", "master", "default", "base"]` and
  `catOf` files `develop` under category `dev`. If your working trunk is `develop`, it gets
  the wrong colour and loses top-pinning. Add it to `TRONCO`, or teach `catOf` to treat
  `develop` as `main` — and mirror the change inside `export/lib/template.ts`.
