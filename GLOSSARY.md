# gitview

Git history graph organised by *lanes* — one branch per row — readable both in a TUI and in a
single-file HTML. It exists to answer, in a repository with many branches and merges, three
questions `git log` does not answer quickly: which lane each commit is in, which branches still
have something to deliver, and in what order to merge.

## Language

### The graph

**Lane**:
A branch, occupying one horizontal row of the graph. Derived by a *first-parent* walk from the
branch tip; it is the unit of reading, not the unit of data — several commits per lane. git has
no term for this, so *lane* is the tool's own word.
_Avoid_: line, row, track, series

**Tip**:
The most recent commit of a lane. It is where the branch name appears, to the right.
_Avoid_: head, top, latest

**Branchless**:
A commit whose originating branch has already been deleted. It remains in the graph, drawn in
grey, and is counted in a band at the footer. No commit vanishes for lack of a ref.
_Avoid_: ghost, orphan, dangling, unreachable, junk

**Invisible lane**:
A branch whose tip is outside the log and therefore does not occupy a row, but whose name still
appears in the label column marked as invisible.
_Avoid_: empty lane, hidden lane

**Category**:
The grouping of a lane by name convention — `main`, `dev`, `release`, `hotfix`, `feature`,
`other`. It determines the colour.
_Avoid_: type, class, group

**Inactive**:
A lane with nothing to deliver: it has already been merged into the target, or is at
`ahead 0`. Rendered in low-contrast pastel and marked `✓merged`. It exists, but carries no
weight.
_Avoid_: dead, old, archived

**Default branch**:
`main`, `master`, `default` or `base`. Always pinned at the top of the Y axis, in that order,
with its own row, never reordered by date.
_Avoid_: trunk, base, mainline, target

**Merge target**:
The default branch a branch would be merged into. For `feature` and `other` it is `dev` when
one exists, otherwise `main`; for the other categories it is `main`.
_Avoid_: merge destination, upstream, base

**Y axis**:
The lane axis. Only the visible ones are drawn; the default branch stays pinned, and the ▲▼
arrows jump to the next lane off screen.
_Avoid_: branch axis, lane column

**X axis**:
The time axis, in log order. The date is formatted according to the zoom (year → year-month →
day) and never overlaps.
_Avoid_: time axis, timeline

### The model and its two renderings

**Model**:
The assignment of each commit to a lane, plus the order and horizontal position of the lanes.
Computed once, it is the only thing the two renderers share. It does not know how to draw
anything.
_Avoid_: data, state, graph (the graph is what you see; the model is what you compute)

**Renderer**:
One of the two ways to show the model on screen: the TUI in the terminal and the SVG in the
HTML. They are independent implementations, with their own coordinates, interaction and
features. A feature present in one does not imply it is present in the other.
_Avoid_: graph renderer (suggests it is the same one)

**Graph data**:
The serialized form of the model that the HTML renderer consumes. It is the contract between
the two renderers — and the point where a piece of data can diverge from the model if it is
written in place instead of copied.
_Avoid_: projection, payload, export, snapshot

**Merge plan**:
The suggested order for merging the lanes that share a target, simulating the merges in
sequence. Each step knows whether it stays clean and which files conflict.
_Avoid_: merge planner, merge order

**Conflict matrix**:
The lane × lane table of files in conflict when merging each pair of open lanes.
_Avoid_: conflict table, pairwise

**Exact conflict**:
The list of conflicting files coming from real git, when the version supports the simulation.
**Estimate by shared files** is the degraded mode when it does not, and the report says which
of the two was used.
_Avoid_: merge error (it is a prior warning, not an error)

**Simulation**:
The computation of the result of a merge without touching a ref or the working tree. It is the
reason gitview can exist inside someone else's repository.
_Avoid_: dry run, preview

**Risk**:
`low`, `medium` or `high`, derived from the number of files in conflict. It takes the suggested
order into account, so the same pair can change risk depending on the plan.
_Avoid_: severity, priority

**Export**:
The self-contained single-file HTML, with the graph, the plan and the matrix. It opens on a
double click and must keep working after travelling by email or as a PR attachment.
_Avoid_: report, snapshot, screenshot