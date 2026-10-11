#!/usr/bin/env bash
# Gera o repo sintético de teste em .fixtures/complex, fora do controle de
# versão (é repo git, não fonte). Determinístico: datas e conteúdo fixos.
# Uso: bash script/fixture.sh
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
d 01-01T10:00:00-03:00; echo a > f.txt; c "chore: tronco"
for i in $(seq 1 6);  do echo "m$i" >> f.txt; c "feat: tronco $i"; done
d 01-05T10:00:00-03:00; b feat/a;  echo a1 > a.txt; c "feat(a): um"
d 01-06T10:00:00-03:00; b feat/b;  echo b1 > b.txt; c "feat(b): um"
git checkout -q main;    b fix/c;      echo c1 > c.txt; c "fix(c): um"
git checkout -q main;    b chore/d;    echo d1 > d.txt; c "chore(d): limpeza"
git checkout -q main;    b docs/e;     echo e1 > e.txt; c "docs(e): notas"
git checkout -q main;    b release/1.0; echo r1 > r.txt; c "release: 1.0.0"
git checkout -q main;    b hotfix/urgent; echo h1 > h.txt; c "hotfix: urgente"
git checkout -q release/1.0; b acceptance; echo hm > hm.txt; c "chore(release): 1.0.0 em aceite"
git checkout -q main;    b integration
for i in $(seq 1 4); do echo "dev$i" >> f.txt; c "chore: integracao $i"; done
d 01-20T10:00:00-03:00; b staging; echo dv > dv.txt; c "chore: desenvolvemento" 
b spike/temp; echo sp > sp.txt; c "wip: fora do padrao"
b sandbox/tmp; echo cs > cs.txt; c "wip: nome longo"
git checkout -q main
# merges com --no-ff (pouso verificável)
git merge -q --no-ff -m "Merge branch 'hotfix/urgent'" hotfix/urgent
for i in $(seq 1 3); do echo "m$i" >> f.txt; c "feat: tronco pos-merge $i"; done
git tag -a v1.0.0 -m "v1.0.0" HEAD~2
git merge -q --no-ff -m "Merge branch 'release/1.0'" release/1.0
# branch longa
b feat/longa; for i in $(seq 1 40); do echo "l$i" >> l.txt; c "feat: longa $i"; done
# commit único
git checkout -q main; b feat/um; echo u > u.txt; c "feat: um commit so"
# história órfã (branch apagada)
git checkout -q main; b lixo; echo x > x.txt; c "wip: vai ser apagado"
echo y > y.txt; git add -A; git commit -q -m "wip: tambem some"
git checkout -q main; git branch -qD lixo
# mesmo timestamp em commits diferentes (desempate)
d 02-01T10:00:00-03:00; b feat/empate; echo e1 > e1.txt; c "feat: empate 1"
echo e2 > e2.txt; c "feat: empate 2"
echo e3 > e3.txt; c "feat: empate 3"
# tag leve junto de anotada no mesmo commit
git checkout -q main; git tag v0.9.0
git tag -a v0.9.0-ann -m anotada
# assunto com separadores e multi-linha
d 02-02T10:00:00-03:00; printf 'linha1\nlinha2 com %% e \x1f\x1e' > weird.txt; git add -A
git commit -q -m "fix: assunto com separadores e multi-linha" -m "corpo com % e | e -> e %x1f"
echo "fixture: $(git rev-list --count --all) commits, $(git for-each-ref --format='%(refname:short)' refs/heads | wc -l) branches"
