#!/usr/bin/env bash
# Builds the synthetic test repo at .fixtures/complex, outside version control
# (it is a git repo, not source). Deterministic: fixed dates and contents.
# Usage: bash script/fixture.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FX="$ROOT/.fixtures/complex"
rm -rf "$FX"; mkdir -p "$FX"
cd "$FX"
export GIT_AUTHOR_NAME=Fixture GIT_AUTHOR_EMAIL=fixture@test
export GIT_COMMITTER_NAME=Fixture GIT_COMMITTER_EMAIL=fixture@test
d() { export GIT_AUTHOR_DATE="2026-$1" GIT_COMMITTER_DATE="2026-$1"; }
b() { git checkout -q -b "$1"; }
c() { git add -A; git commit -q --allow-empty -m "$1"; }
git init -q -b main
d 01-01T10:00:00-03:00; echo a > f.txt; c "chore: main"
for i in $(seq 1 6);  do echo "m$i" >> f.txt; c "feat: main $i"; done
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
git merge -q --no-ff -m "Merge branch 'hotfix/urgent'" hotfix/urgent
for i in $(seq 1 3); do echo "m$i" >> f.txt; c "feat: main post-merge $i"; done
git tag -a v1.0.0 -m "v1.0.0" HEAD~2
git merge -q --no-ff -m "Merge branch 'release/1.0'" release/1.0
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
echo "fixture: $(git rev-list --count --all) commits, $(git for-each-ref --format='%(refname:short)' refs/heads | wc -l) branches"
