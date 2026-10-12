# CONSTRAINTS

```yaml
Projeto: gitview
Descrição: grafo git por lanes no terminal, e export HTML de um arquivo só
Nível: 2 — PRAGMÁTICO
```

Escolhido por três eixos de `../suckless-manifest/DEPTH-CONSTRAINTS.md`: 1 pessoa
mantendo (Nível 1–2), criticidade baixa — CLI pessoal, não serviço (Nível 1–2),
overhead pequeno (Nível 2). O template `cli-tool` do manifesto (Nível 1, 500 LOC, C)
é para um `dmenu`; o gitview faz duas coisas — TUI e export HTML — e tem interface
TTY com mouse.

## Constraints

```yaml
max_lines_of_code: 2400        # inclui o template HTML embutido; mede volume, não complexidade
max_dependencies_direct: 5     # runtime apenas; dev não conta
max_lines_per_function: 50     # o limite que mede legibilidade de verdade
allowed_languages: [TypeScript]
transpilation_allowed: false
build_step: none               # bun executa TypeScript direto
```

**O teto é 2400, e hoje o código está em 1987.** O número veio de medição, não de gosto:
partimos de 2021, a decomposição em packages levou a um pico de 2198, e daí o teto de 2400.
Depois de extrair `GitView` e `Pintor` de `renderSelf`, quebrar `buildModel` e
`createMergePlanner`, e eliminar exports mortos e uma função duplicada, o total **caiu abaixo
do ponto de partida**.

| | pico | hoje |
| --- | --- | --- |
| `tui/index.ts` | 225 | 34 |
| `tui/lib/view.ts` | — | 248 |
| `tui/lib/pintor.ts` | — | 157 |
| `merge/index.ts` | 122 | 202 |
| **total (binário)** | 2198 | **1987** |

`view.ts` e `pintor.ts` não são código novo: é o desenho que estava dentro de `renderSelf`,
agora com endereço. Por isso LOC de arquivo mede **volume**, não complexidade — e é por isso
que o teto que de fato pegaria uma função ilegível é o outro, `max_lines_per_function`.

**Folga de 17%.** Com o código em 1987, os 2400 sobraram. Baixar para ~2100 daria folga real
de ~5%, que é o que um teto existe para fazer: obrigar a justificar cada linha nova.

**Testes ficam fora da conta.** `script/sinks.ts` mede só o que vai para o binário; testes
aparecem à parte. Contá-los no teto puniria quem escreve verificação, que é o inverso do que
este arquivo existe para incentivar.

`+80` em `merge` é o preço de nomes que substituíram funções de 60+ linhas com oito variáveis
de estado. Custo conhecido em troca de legibilidade, não crescimento acidental.

**O que este teto não mede:** `packages/export/lib/template.ts` são 497 linhas de CSS e JS
dentro de uma string literal, fora do alcance do `tsc`. É o arquivo mais arriscado do
repo e nenhuma métrica automática o alcança — ver regra 4.

## approved_packages

| package | kind | reason |
| --- | --- | --- |
| `@opentui/core` | runtime | sem ele não há TUI em TypeScript. Escrever o buffer de células, o parse de mouse e o modo raw do terminal é o @dmenu inteiro. **Única dep runtime.** |
| `bun-types` (`@types/bun`) | dev | tipos do runtime |
| `dependency-cruiser` | dev | impõe as 5 regras de fronteira de package. TypeScript não expressa "não alcance `lib/` de fora" — um deep import compila igual. Framework de arquitetura, sim; questionável pelos critérios do manifesto, mantido porque a regra é verificável e o custo é zero em runtime. |

## rejected_packages

| package | reason |
| --- | --- |
| qualquer renderer de UI (React, Ink, blessed,…) | cada um traz 100+ deps transitivas e um modelo de estado que competiria com o `GitView` |
| CLI framework (commander, yargs) | são 6 linhas de `args.indexOf`. `VALUED` + `flag()` dão o controle e 0 deps |
| parser de argv (yargs-parser, minimist) | idem |
| bundler (esbuild, tsup, rollup) | `bun gitview.ts` já executa. Build seria passo sem retorno |
| gerador de HTML (lit, preact, react) | o export precisa ser **um arquivo só, sem CDN e sem JS externo**. Framework de template violaria a garantia central da ferramenta |
| test runner (jest, vitest) | `bun test` já existe |
| ORM / db / http client | a ferramenta é read-only sobre `git` e o sistema de arquivos. Nada de rede |

## Regras

1. **Linhas removidas > linhas adicionadas.** O lema do manifesto é a métrica de cada
   mudança. Um PR que adiciona sem remover precisa justificar no corpo.
2. **Dep nova é rejeição por padrão.** Só entra com o motivo escrito acima do motivo real.
3. **Toda função cabe na tela.** Mais de ~50 linhas é dívida de legibilidade, não
   complexidade intrínseca. O limite não é automático: é revisado.
4. **`packages/export/lib/template.ts` é o arquivo mais arriscado do repo.** É JS sem
   tipos dentro de uma string, não passa por `tsc` e só é exercitado por abrir o HTML.
   Toda mudança nele exige rodar `--export` e olhar o resultado.
5. **Sem framework de arquitetura novo.** O `dependency-cruiser` já é o limite de
   quanta indireção este projeto aceita.

## Validação

```bash
bun run check              # typecheck + fronteiras + testes
bun run sinks              # este arquivo: LOC e deps contra os tetos
```

## Onde este arquivo erra

Um teto que ninguém olha não é constraint, é decoração. `sinks` existe para que a
primeira pessoa que estourar receba o número na cara, e para que este arquivo possa ser
corrigido com evidência em vez de bom senso.