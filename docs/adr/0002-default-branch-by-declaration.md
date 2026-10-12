# 0002 — Default branch by declaration, not by a fixed list

**Status:** accepted · **Date:** 2026-10-11

## Context

`TRUNK` was a constant: `["main", "master", "default", "base"]`. Two consequences:

**`develop` was missing.** Whoever worked in git-flow had their real working branch
classified as category `dev` — orange colour, no pinning, reordered by date. A merge plan
with `main` and `develop` at the top was a misreading, not just cosmetics.

**The list was duplicated.** `export/lib/template.ts` had `var PIN = [...]`, a literal copy
that no type check could verify. Changing one and forgetting the other would leave HTML and
terminal disagreeing about what a default branch is — the same class of bug as the colour by
category.

## What would not work: guessing from the graph

The first idea was to detect the default branch by structure: the branch with the most
branches descending from it. **Measured in the real repo, it comes out wrong:**

| branch | no. of descendants | last commit |
| --- | --- | --- |
| `origin/21.03` | **8** | 2026-03-22 |
| `origin/develop` | 6 | 2026-05-06 |
| `main` | 5 | 2026-09-05 |

`origin/21.03` — an old release — had more branches descending from it than `develop`. An old
release is an ancestor of almost everything, so the metric rewards exactly the branches that
should not be default. Any graph heuristic has this problem: "important" and "ancestor" blur
together in a long history.

## Decision

The default branch is a **declaration**, resolved in a cascade by authority:

1. `--default-branch a,b` — the user, now
2. `.gitview.json` in the repo — the team, versioned
3. `refs/remotes/origin/HEAD` — the remote, on which branch is default
4. name convention (category `main`) — the industry default

Each source beats the next. `Model` carries `defaultBranches` and `defaultBranchSource`, and
the projection takes both to the HTML — the template reads `G.defaultBranches` instead of
repeating the list.

## The distinction that sustains the decision

**Default branch is a category *of name*; merge target is a category *of flow*.** They are
different things, and confusing them is what produced the bug.

`develop` is a default branch (position on the Y axis, pinning) but stays category `dev`
(colour, merge target). Promoting it to category `main` would make `pick("main")` choose the
most recent commit between `main` and `develop`; in a repo where `develop` was ahead,
**features would start aiming at `main`** — a silent bug in the merge plan, trading a colour
bug.

The same distinction holds for inactive detection: `target` became the first resolved default
branch, instead of the literal `loc.get("main") ?? loc.get("master")`. In a repo whose
default branch is `develop`, measuring "behind the target" against `main` would give the
wrong answer for every lane.

## Consequences

`catOf` moved to `lib/category.ts` because `lib/trunks.ts` needs it and `lib` cannot import
the index — that would be a cycle, and dependency-cruiser's `no-circular` rejects it. The
interface re-exports, so nothing changed from the outside.

**Gains:** `develop` works in any repo, with nothing to configure; the duplicated list in the
template disappeared; the `target` of inactive detection follows the real default branch; 10
new tests cover the cascade and the pinning.

**Debt:** inactive detection runs one `rev-list` per branch against the default branch. In a
repo with many branches and a remote default branch (which may be behind the local one), the
number can diverge from what the graph shows.

**Out of scope:** `.gitview.json` was implemented but not documented in the README — only the
`--default-branch` flag appears in `--help`. The preference for `.gitview.json` is the
user's, not the tool's.