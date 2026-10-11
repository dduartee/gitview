# 0002 — Tronco por declaração, não por lista fixa

**Status:** aceito · **Data:** 2026-10-11

## Contexto

`TRONCO` era uma constante: `["main", "master", "default", "base"]`. Duas consequências:

**Faltava `develop`.** Quem trabalha em git-flow tinha a branch de trabalho real classificada
como categoria `dev` — cor laranja, sem pinning, reordenada por data. Um plano de merge com
`main` e `develop` no topo era leitura errada, não só estética.

**A lista estava duplicada.** `export/lib/template.ts` tinha `var PIN = [...]`, cópia literal
que nenhuma checagem de tipos podia verificar. Mudar uma e esquecer a outra daria HTML e
terminal discordando sobre o que é tronco — a mesma classe de bug da cor por categoria.

## O que não funcionaria: adivinhar pelo grafo

A primeira ideia era detectar tronco por estrutura: a branch que mais branches descendem dela.
**Medido no repo real, dá errado:**

| branch | nº de descendentes | último commit |
| --- | --- | --- |
| `origin/21.03` | **8** | 2026-03-22 |
| `origin/develop` | 6 | 2026-05-06 |
| `main` | 5 | 2026-09-05 |

`origin/21.03` — uma release velha — descendia de mais branches que `develop`. Release antiga
é ancestral de quase tudo, então a métrica premia exatamente as branches que não deveriam ser
tronco. Qualquer heurística de grafo tem esse problema: "importante" e "ancestral" se confundem
em histórico longo.

## Decisão

Tronco é **declaração**, resolvida em cascata por autoridade:

1. `--trunk a,b` — o usuário, agora
2. `.gitview.json` no repo — o time, versionado
3. `refs/remotes/origin/HEAD` — o remote, sobre qual branch é default
4. convenção de nome (categoria `main`) — o padrão de mercado

Cada fonte vence a seguinte. `Model` carrega `troncos` e `troncosSource`, e a projeção leva os
dois para o HTML — o template lê `G.troncos` em vez de repetir a lista.

## A distinção que sustenta a decisão

**Tronco é categoria *de nome*; destino de merge é categoria *de fluxo*.** São coisas
diferentes, e confundi-las é o que produziu o bug.

`develop` é tronco (posição no eixo Y, pinning) mas continua categoria `dev` (cor, alvo de
merge). Promovê-lo a categoria `main` faria `pick("main")` escolher o commit mais recente entre
`main` e `develop`; num repo onde `develop` estivesse à frente, **features passariam a mirar
`main`** — bug silencioso no plano de merge, trocando um bug de cor.

A mesma distinção vale para a detecção de inativas: `alvo` passou a ser o primeiro tronco
resolvido, em vez do literal `loc.get("main") ?? loc.get("master")`. Num repo cujo tronco é
`develop`, medir "atrás do alvo" contra `main` daria a resposta errada para toda lane.

## Consequências

`catOf` foi para `lib/category.ts` porque `lib/trunks.ts` precisa dela e `lib` não pode
importar o index — seria ciclo, e o `no-circular` do dependency-cruiser rejeita. A interface
reexporta, então nada mudou para fora.

**Ganhos:** `develop` funciona em qualquer repo, sem configurar nada; a lista duplicada no
template desapareceu; `alvo` da detecção de inativas acompanha o tronco real; 10 testes
novos cobrem a cascata e o pinning.

**Debt:** a detecção de inativas faz um `rev-list` por branch contra o tronco. Em repo com
muitas branches e tronco remoto (que pode estar atrás do local), o número pode divergir do que
se vê no grafo.

**Fora de escopo:** `.gitview.json` foi implementado mas não documentado no README — só a
flag `--trunk` aparece no `--help`. A preferência por `.gitview.json` é do usuário, não da
ferramenta.