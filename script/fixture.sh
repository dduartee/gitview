#!/usr/bin/env bash
# Builds the synthetic test repos under .fixtures/, outside version control
# (they are git repos, not source). Deterministic: fixed dates and contents.
# Usage: bash script/fixture.sh
#
#   complex    the old one: real files, every category, --no-ff merges, a deleted
#              branch, a tag tie, subjects with separators
#   gitflow    the repo in the README screenshot: main + develop, one tag, a
#              lane with no exclusive commit
#   synthetic  the cases the other two do not reach: branchless commits, a
#              remote-only lane, origin/develop behind local develop
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FX="$ROOT/.fixtures"
export GIT_AUTHOR_NAME=Fixture GIT_AUTHOR_EMAIL=fixture@test
export GIT_COMMITTER_NAME=Fixture GIT_COMMITTER_EMAIL=fixture@test

d() { export GIT_AUTHOR_DATE="2026-$1" GIT_COMMITTER_DATE="2026-$1"; }
b() { git checkout -q -b "$1"; }
c() { git add -A; git commit -q --allow-empty -m "$1"; }
# A merge commit takes the wall clock unless the date is pinned, and its hash moves with it.
m() { GIT_AUTHOR_DATE="2026-$1" GIT_COMMITTER_DATE="2026-$1" git merge -q --no-ff -m "$2" "$3"; }

start() { # start <dir> <main-branch>
  rm -rf "$1"; mkdir -p "$1"; cd "$1"
  git init -q -b "$2"
  git config commit.gpgsign false
  d 01-01T10:00:00-03:00
}

build_complex() {
  start "$FX/complex" main
  echo a > f.txt; c "chore: main"
  for i in $(seq 1 6); do echo "m$i" >> f.txt; c "feat: main $i"; done
  d 01-05T10:00:00-03:00; b feat/a;  echo a1 > a.txt; c "feat(a): one"
  d 01-06T10:00:00-03:00; b feat/b;  echo b1 > b.txt; c "feat(b): one"
  git checkout -q main;    b fix/c;      echo c1 > c.txt; c "fix(c): one"
  git checkout -q main;    b chore/d;    echo d1 > d.txt; c "chore(d): cleanup"
  git checkout -q main;    b docs/e;     echo e1 > e.txt; c "docs(e): notes"
  git checkout -q main;    b release/1.0; echo r1 > r.txt; c "release: 1.0.0"
  git checkout -q main;    b hotfix/urgent; echo h1 > h.txt; c "hotfix: urgent"
  git checkout -q release/1.0; b acceptance; echo hm > hm.txt; c "chore(release): 1.0.0 in acceptance"
  git checkout -q main;    b integration
  for i in $(seq 1 4); do echo "dev$i" >> f.txt; c "chore: integration $i"; done
  d 01-20T10:00:00-03:00; b staging; echo dv > dv.txt; c "chore: development"
  b spike/temp; echo sp > sp.txt; c "wip: off convention"
  b sandbox/tmp; echo cs > cs.txt; c "wip: long name"
  git checkout -q main
  # merges with --no-ff (verifiable landings)
  m 03-01T10:00:00-03:00 "Merge branch 'hotfix/urgent'" hotfix/urgent
  for i in $(seq 1 3); do echo "m$i" >> f.txt; c "feat: main post-merge $i"; done
  git tag -a v1.0.0 -m "v1.0.0" HEAD~2
  m 03-02T10:00:00-03:00 "Merge branch 'release/1.0'" release/1.0
  # long branch
  b feat/long; for i in $(seq 1 40); do echo "l$i" >> l.txt; c "feat: long $i"; done
  # single commit
  git checkout -q main; b feat/single; echo u > u.txt; c "feat: single commit"
  # orphan history (deleted branch)
  git checkout -q main; b junk; echo x > x.txt; c "wip: will be deleted"
  echo y > y.txt; git add -A; git commit -q -m "wip: also disappears"
  git checkout -q main; git branch -qD junk
  # same timestamp on different commits (tie-break)
  d 02-01T10:00:00-03:00; b feat/tie; echo e1 > e1.txt; c "feat: tie 1"
  echo e2 > e2.txt; c "feat: tie 2"
  echo e3 > e3.txt; c "feat: tie 3"
  # lightweight tag next to an annotated one on the same commit
  git checkout -q main; git tag v0.9.0
  git tag -a v0.9.0-ann -m annotated
  # subject with separators and multiple lines
  d 02-02T10:00:00-03:00; printf 'line1\nline2 with %% and \x1f\x1e' > weird.txt; git add -A
  git commit -q -m "fix: subject with separators and multiple lines" -m "body with % and | and -> and %x1f"
}

build_gitflow() {
  start "$FX/gitflow" main
  c "main: base";   A1=$(git rev-parse HEAD)
  c "main: work A"; A2=$(git rev-parse HEAD)
  c "main: work B"; A3=$(git rev-parse HEAD)

  git checkout -q -b feature/login "$A2"
  d 02-01T10:00:00-03:00; c "login: part 1"; c "login: part 2"

  git checkout -q -b feature/old "$A2"
  c "old: thing"
  git checkout -q main
  m 04-03T10:00:00-03:00 "main: merge feature/old" feature/old

  # a lane whose tip is main's tip: no exclusive commit
  git branch release/1.0 "$A3"

  git checkout -q -b wip/scratch "$A3"
  d 03-01T10:00:00-03:00; c "scratch: 1"; c "scratch: 2"

  git checkout -q -b develop "$A2"
  d 04-01T10:00:00-03:00; c "develop: work"; D=$(git rev-parse HEAD)
  git checkout -q main
  git checkout -q -b feature/over-develop "$D"
  d 04-02T10:00:00-03:00; c "over develop"
  git checkout -q main
  m 04-04T10:00:00-03:00 "main: merge develop" develop

  git tag v1.0.0
  # origin/HEAD points to main: the model must find main
  git update-ref refs/remotes/origin/main "$(git rev-parse main)"
  git update-ref refs/remotes/origin/develop "$D"
  git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
}

build_synthetic() {
  start "$FX/synthetic" main
  c "main: base";    A1=$(git rev-parse HEAD)
  c "main: work A"; A2=$(git rev-parse HEAD)
  c "main: work B"; A3=$(git rev-parse HEAD)

  git checkout -q -b develop "$A2"
  d 02-01T10:00:00-03:00; c "develop: work"; D1=$(git rev-parse HEAD)

  git checkout -q -b feature/login "$D1"
  d 03-01T10:00:00-03:00; c "login: part 1"; c "login: part 2"
  git checkout -q develop
  m 03-03T10:00:00-03:00 "develop: merge feature/login" feature/login

  # merged, then deleted: its commits stay, reachable only through the merge
  git checkout -q -b feature/gone "$D1"
  d 04-01T10:00:00-03:00; c "gone: part 1"; c "gone: part 2"
  git checkout -q develop
  m 04-03T10:00:00-03:00 "develop: merge feature/gone" feature/gone
  git branch -q -D feature/gone

  # never merged, deleted locally, kept on the remote
  git checkout -q -b feature/remote-only "$D1"
  d 05-01T10:00:00-03:00; c "remote only: 1"; c "remote only: 2"
  RO=$(git rev-parse HEAD)
  git checkout -q develop
  git branch -q -D feature/remote-only

  # from main, merged into main and develop
  git checkout -q -b hotfix/urgent "$A3"
  d 06-01T10:00:00-03:00; c "urgent: fix"
  git checkout -q main
  m 06-02T10:00:00-03:00 "main: merge hotfix/urgent" hotfix/urgent
  git checkout -q develop
  m 06-03T10:00:00-03:00 "develop: merge hotfix/urgent" hotfix/urgent

  # from main, merged into main and develop, tagged
  git checkout -q -b release/1.0 "$A3"
  d 07-01T10:00:00-03:00; c "release: bump"
  git checkout -q main
  m 07-02T10:00:00-03:00 "main: merge release/1.0" release/1.0
  git tag v1.0.0
  git checkout -q develop
  m 07-03T10:00:00-03:00 "develop: merge release/1.0" release/1.0

  git checkout -q -b wip/scratch "$A3"
  d 08-01T10:00:00-03:00; c "scratch: 1"; c "scratch: 2"
  git checkout -q main

  # points at main's tip: a lane with no exclusive commit
  git branch release/1.1 "$(git rev-parse main)"

  # origin/HEAD -> develop, origin/develop behind local (local wins), and a ref
  # for the branch that no longer exists locally
  git update-ref refs/remotes/origin/main "$(git rev-parse main)"
  git update-ref refs/remotes/origin/develop "$D1"
  git update-ref refs/remotes/origin/feature/remote-only "$RO"
  git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/develop
}

build_complex
build_gitflow
build_synthetic

echo "fixtures at $FX (outside version control):"
for d in "$FX"/*/; do
  printf "  %-12s %s commits, %s branches, %s tags\n" "$(basename "$d")" \
    "$(git -C "$d" rev-list --all --count)" \
    "$(git -C "$d" for-each-ref --format='%(refname:short)' refs/heads | wc -l | tr -d ' ')" \
    "$(git -C "$d" for-each-ref --format='%(refname:short)' refs/tags | wc -l | tr -d ' ')"
done
