# gitview

**Git graph by *lanes*, in the terminal — plus a self-contained HTML export.**

Each branch occupies one row of the graph with its name written at the tip, colour by category,
already-merged branches dimmed in low-contrast pastel. The same file exports a self-contained
HTML you can attach to a PR, review with the team or archive.

It is not `git log --graph`: it is a *lane* graph with a real Y axis, a merge planner and HTML
export. No build: Bun + [OpenTUI](https://github.com/anomalyco/opentui).

---

## This solves a personal problem

`gitview` was born from a specific, daily need, not from the generic idea of "yet another git
tool". In the repo where I work, with **hundreds of commits, dozens of branches and frequent
merges**, I needed to answer three things no tool gave me quickly:

1. **Which lane is each commit in?** — `git log --graph` draws lines with characters, but the
   branch name rarely appears where I am looking. I hunted with `git branch --contains`,
   commit by commit.
2. **Which branches still have something to deliver?** — who was already merged and who is just
   behind the target blend together, with the same visual weight. Here the inactive ones are in
   **low-contrast pastel**: you can see what exists without reading what matters.
3. **What is the least painful merge order?** — who goes first, what conflicts with what, and the
   order changes the result. `gitview` simulates the merges with `git merge-tree --write-tree`
   (**without touching refs or the working tree**) and suggests the order.

If you also have a repo with many branches and frequent merges, you probably feel the same.
If you have a small repo with 3 branches, use `git log --oneline` and save the time — this
tool is for the other case.

---

## What it does

- **Lane per branch, with the name at the tip.** Each branch is a row of the graph; the real
  name appears to the right of its last commit (`feature/login #518a29a`), not in a loose label.
- **Dynamic Y axis.** Only the visible lanes appear; `main`/`master`/`default`/`base` are
  always pinned at the top; the ▲/▼ arrows jump to the next lane off screen. Alternative: a
  fixed column with scroll to see all.
- **X axis without overlap.** Only the visible band is drawn, with a minimum spacing of 130 px
  and a date format that changes with zoom (year → year-month → day). Dates never overlap.
- **Inactive branches in pastel.** Merged or just behind the target (`ahead 0`) appear with
  colour desaturated toward the background, marked `✓merged`.
- **Branchless.** Commits of already-deleted branches (sides of merges, duplicate tip, `wip/x`)
  remain in the graph in grey and are counted in a band at the footer. No commit vanishes for
  lack of a ref.
- **Merge planning** (`p` key, or the *merge plan* tab): order suggested by target, with exact
  conflicts via `git merge-tree` when git ≥ 2.38, or an estimate by shared files for older git.
- **Conflict matrix** branch × branch — what will blow up before it blows up.
- **Self-contained HTML export.** No CDN, no external JS, no build. Opens on a double click,
  keeps working when emailed or attached to a PR, and is an independent renderer: its SVG has
  the X axis, filter, zoom and per-lane deep link (`#lane=name`), none of which the terminal
  has.
- **Nothing is written to your repo.** No ref moves, no file appears there: everything comes
  from `git log`/`rev-list`/`merge-tree` in read mode.

## Installation

Requires **[Bun](https://bun.sh)** and `git` 2.30+ on the `PATH`.

```bash
git clone https://github.com/dduartee/gitview
cd gitview
bun install
```

```bash
bun run gitview.ts ~/any/repo   # from the clone
bun link && gitview ~/any/repo  # global command
```

## Try it without a big repo

The clone ships a deterministic synthetic repo — dozens of commits, branches of every category,
`--no-ff` merges, tags, a deleted branch and deliberately awful names:

```bash
bash script/fixture.sh      # creates .fixtures/complex (outside version control)
gitview .fixtures/complex
gitview .fixtures/complex --export graph.html
```

## Usage

```bash
gitview                      # graph of the current repo
gitview /path/to/repo        # graph of another repo
gitview --dump               # prints the lane model (debug, no UI)
gitview --export graph.html  # exports the self-contained HTML
gitview --help               # all options (--main, --dev, --template, …)
```

| key | action |
|---|---|
| click · `←` `→` | select commit |
| `↑` `↓` | jump to the nearest commit in the neighbouring lane |
| `shift` + `←` `→` | jump 20 commits |
| `Home` `End` (`g` `G`) | first / last commit |
| `h` | back to HEAD |
| double click · `Enter` | highlight the commit's ancestors (dims the rest) |
| drag · wheel | pan (`shift`+wheel = vertical) |
| `p` | merge planning panel |
| `e` | export HTML into the working directory |
| `q` · `Esc` | quit |

## How a lane is built

- **Lane per branch:** the lane follows the *first-parent* from the tip of each branch,
  stopping where another owner has already claimed the commit.
- **Fixed default branch at the top:** `main`/`master`/`default`/`base` occupy the first rows,
  alone; the rest is ordered by the date of the last commit (most recent first).
- **Category by colour:** the name prefix defines the category (`main`, `hotfix`, `release`,
  `develop`, `feature`, `other`).
- **Branchless:** a commit with no ref becomes a lane with no name (in the terminal, `~hash7`).
- **Inactive:** `ahead 0` relative to the merge target → pastel.

The merge target is inferred from the name (`main`, or `develop`/`dev` for features/other) and
can be fixed with `--main` and `--dev`.

### Default branch

The default branch is the branch that stays fixed at the top of the Y axis. It is not a fixed
list in the code — it is resolved by cascade, and the first source that exists wins:

| order | source | who decides |
| --- | --- | --- |
| 1 | `--default-branch main,develop` | you, now |
| 2 | `.gitview.json` in the repo → `{"defaultBranches": [...]}` | the team, versioned |
| 3 | `refs/remotes/origin/HEAD` | the remote, about which branch is default |
| 4 | name convention (category `main`) | the market default |

The order matters because **guessing from the graph goes wrong**: the branch with the most
descendants tends to be an old release, not the default branch. In `gaabe.space`, `origin/21.03`
has 8 descendants against 6 for `develop` — and it is precisely the dead branch that the
heuristic would choose.

Note that the default branch and the merge target are different things. `develop` can be the
default branch (position, pinning) while remaining the target of features (category `dev`).
Promoting it to category `main` would make features start aiming at `main` in any repo where
`develop` was ahead.

## Known limitations

- **Category by substring.** `catOf` looks at the name prefix; `maintenance/…` can fall into the
  `main` category. The same goes for choosing the merge target.
- **Conflict analysis is O(n²).** One `git merge-tree` per pair of open branches: instant for
  dozens, slow for hundreds.
- **SVG without virtualization.** The HTML draws every commit as an element; above ~5,000
  commits the browser starts to choke.
- **Default branch not detected in a repo with no remote.** Without `origin/HEAD`, without
  `.gitview.json` and without `--default-branch`, it falls back to the name convention. If your
  default branch has another name and the repo has no remote, the top of the Y axis stays
  unpinned until you pass `--default-branch`.
- **Startup cost.** To know which branches are inactive, the TUI runs one
  `git rev-list --count` per branch at startup (dozens of ms each). In a repo with hundreds of
  branches, opening takes a few seconds.
- **Test coverage under construction.** The drawing comes from a model that can be checked with
  `--dump` (dump vs. graph validated on a repo with hundreds of commits), but the `bun test`
  suite does not yet cover the renderer.

## Roadmap

- [ ] Test coverage for the lane model (`bun test`)
- [ ] SVG virtualization above a few thousand commits
- [ ] Cache the conflict analysis between openings
- [ ] Filter by commit (message, author), beyond the branch name
- [ ] PNG export from the HTML

## Contributing

Issues and PRs are welcome. The tool is personal in origin, and what I most want to know is
**what is missing for your graph to become readable**: if your repo has many branches and
`gitview` does not show something you need, open an issue with the branch name and what you
expected to see.

Code: no build step, no framework, no transpilation — Bun running TypeScript directly.
Comments in English.

The code lives in `packages/`, one directory per concern — `git` (the execution seam),
`model` (the commit→lane assignment, shared by the two renderers), `merge` (the merge plan and
conflict matrix), `export` (the HTML) and `tui` (the terminal). `gitview.ts` at the root is just
the composition root: arguments and dispatch. Each package is a deep module, and
`bun run lint:boundaries` fails if anyone reaches into a `lib/` from inside another package.

This is not the same as "a single file": the **HTML export** is still a single file, with no
CDN and no external JS — that is the guarantee that matters. The binary is also still a single
one, via `bun build --compile`.

## License

[MIT](LICENSE) © 2026 [Gabriel Kleemann Duarte](https://github.com/dduartee)