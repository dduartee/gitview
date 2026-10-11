# Packages

Cada diretório aqui é um **módulo profundo**: muito comportamento atrás de uma interface
pequena. A superfície pública de um package são os **entry points** — os arquivos na raiz do
package. Tudo em subpasta é privado.

```
packages/
  git/            index.ts     ← entry point: createGit(repo) -> { run, git }
                  fake.ts      ← entry point: o adapter de teste
                  lib/exec.ts  ← privado
  model/          index.ts     ← entry point: buildModel(git), catOf, corLane, mix, DX, RH
                  lib/color.ts ← privado
  merge/          index.ts     ← entry point: createMergePlanner(git, model, flags)
  export/         index.ts     ← entry point: exportHtml(...), project(...)
                  lib/template.ts ← privado (o HTML embutido)
  tui/            index.ts     ← entry point: startTui({ g, m, planner, onExport })
```

## A regra

**Importe só pelos entry points de um package** — os arquivos na raiz dele. `lib/` é
implementação e não se importa de fora, nunca. A regra é por profundidade, não por nome de
pasta: qualquer subpasta é privada, então criar uma pasta nova não exige mexer na config.

Por que `packages/git/fake.ts` está na raiz e não em `lib/`: ele é o **segundo adapter** da
seam do git. Interface com um adapter só é indireção; com dois é seam de verdade — e o
adapter de teste precisa ser alcançável de `packages/*/tests/`, que por regra não enxerga
subpastas de ninguém. Por isso ele é entry point.

## Sem barrel

Um package **não** deve ter um `index.ts` que reexporta a subárvore inteira. Exponha vários
entry points pequenos (`index.ts`, `fake.ts`, `client.ts`) em vez de um `index.ts` gigante.
Barrel esconde o que está exposto e faz todo mundo importar pelo mesmo caminho, o que
destrói a razão de a interface ser pequena.

## Rodando

```bash
bun run lint:boundaries   # dependency-cruiser, 5 regras, todas erro
bun run check            # typecheck + lint:boundaries + testes
```

As cinco regras que o `depcruise` impõe:

| regra | o que proíbe |
| --- | --- |
| `entrypoint-boundary-from-app` | app/raiz alcançando `lib/` de qualquer package |
| `entrypoint-boundary-across-packages` | um package alcançando `lib/` de outro |
| `tests-through-entrypoints` | um teste alcançando `lib/`, nem do próprio package |
| `tests-folder-is-private` | algo fora de `tests/` importando fixture |
| `no-circular` | ciclo de dependência |

Alterar `.dependency-cruiser.cjs` é raro: as regras são por profundidade, então quase tudo
novo entra sem tocar na config. O único campo que se ajusta é `PACKAGES_ROOT`.

## Onde as coisas moram

`gitview.ts` na raiz é o **composition root**: parseia argumentos e escolhe o que rodar.
Ele é o único que faz I/O de processo e o único com side effect de boot, guardado por
`import.meta.main`. Toda a lógica está nos packages, alcançável por `import`.

Os dois renderizadores (`tui`, `export`) **não** se conhecem. Compartilham o `model`, e
só ele. Zoom, filtro, eixo X e deep-link são do HTML — o glossário registra a assimetria.
Se um dia você precisar que o TUI ganhe um recurso do HTML, o lugar disso é o `model`, não
uma importação entre os dois.

## O espelho dentro do template

`export/lib/template.ts` é JS e CSS vivos dentro de uma string, e ele **duplica** duas
coisas do TypeScript: as cores por categoria (`COL`) e a lista de troncos (`TRONCO`).
Não há como o TypeScript verificar isso. Se mudar a cor de uma categoria ou a lista de
troncos, mude nos dois lados, e deixe um comentário de volta no outro arquivo.