# 0001 — Dividir o CLI em packages

**Status:** aceito · **Data:** 2026-10-11

## Contexto

`gitview` nasceu como um arquivo só, `gitview.ts`, com 978 linhas. Isso era argumento de venda
no README ("Um arquivo só, sem build") e funcionava: bun executa TypeScript direto, sem build,
sem dependência além de `@opentui/core`.

O problema apareceu quando a base de código precisou ser **verificada**:

- O arquivo era uma sequência de side effects no top level — `git log --all` no load do
  módulo (L50) e `await createCliRenderer(...)` (L972). Um `import` do arquivo tomava o
  terminal e bloqueava.
- Logo, `bun test` não tinha **nenhum** teste, e ainda assim **passava**: o script estava no
  `package.json` reportando verde sobre uma suíte vazia. Um check que mente é pior do que
  check nenhum.
- Com a estrutura fechada, um bug real não tinha onde ser testado: `exportHtml` renumerava
  `b.y` no lugar, nos objetos vivos, e o grafo do TUI voltava desalinhado depois de exportar.

Ocupamos esse vazio com golden output (diff de `--dump` e do HTML exportado contra o
comportamento pré-refactor), o que deu confiança suficiente para mexer.

## Decisão

Dividir em `packages/`, um package por preocupação, com `gitview.ts` como composition root.

| package | entry point | responsabilidade |
| --- | --- | --- |
| `git` | `createGit(repo)`, `fake.ts` | a seam de execução: `{ run, git }` |
| `model` | `buildModel(git)`, `catOf`, `corLane`, `mix` | atribuição commit→lane, ordem, cores |
| `merge` | `createMergePlanner(...)` | plano e matriz de conflitos |
| `export` | `exportHtml(...)`, `project(...)` | HTML de arquivo único |
| `tui` | `startTui(...)` | renderizador de terminal |

O critério de fronteira é **profundidade de pasta**: os arquivos na raiz de um package são
entry points e tudo em subpasta é privado. `dependency-cruiser` impõe isso como erro, com
cinco regras.

## Por que este desenho

**Um package por renderizador, não um package `render`.** O README afirmava que o HTML e o
terminal usavam "o mesmo renderizador". Era falso: são duas implementações independentes, com
coordenadas, interação e recursos próprios. Zoom, filtro, eixo X e deep-link existem só no
HTML. O que os dois compartilham é o **model**, e só ele — então foi isso que virou a
fronteira. Um package `render` teria forçado os dois a se conhecerem para poderem compartilhar
o model, que é justamente o oposto de isolar a assimetria.

**`fake.ts` na raiz, não em `lib/`.** Ele é o segundo adapter da seam do git. A regra de
fronteira impede um teste de alcançar `lib/` de qualquer package, então um fixture em
`lib/` seria inalcançável de fora. Entry point é a única posição que satisfaz "acessível aos
testes" e "não é implementação".

**Uma seam de verdade, não cinco.** Só o git tem dois adapters (produção e teste). `model`,
`merge`, `export` e `tui` são transformações puras por cima — o golden output é o segundo
adapter deles, e fica fora do código.

## Consequências

**Ganhos:** o bug do `b.y` foi corrigido e coberto por teste que se verificou falhar contra o
código antigo; `bun test` tem 19 testes que passam; `bun run check` roda typecheck + fronteiras
+ testes; `tsc` limpo; o model virou testável com fixtures de 6 linhas em vez de um repo real.

**Custo:** o "Um arquivo só" do README deixa de ser verdade e foi corrigido. Quem consumia o
repo lendo um arquivo único agora lê `packages/`. `bun build --compile` continua produzindo
binário único, e o export HTML continua sendo um arquivo só — que é a garantia que importava.

**Fora de escopo, e por quê:** `noUncheckedIndexedAccess` continua desligado. Medido: 77 erros
no arquivo único, 80 depois do split. O refactor não resolveu isso; resolver é trabalho
separado.

**Debt registrado, não pago:** `getMatrix()` corta em 40 branches sem avisar no TUI; o
template HTML duplica `COL` e `TRONCO` do TypeScript sem verificação possível; `develop` não
está em `TRONCO` e é classificado como `dev`, o que dá cor errada e perde pinning para quem
trabalha em `develop`.