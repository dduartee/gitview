# gitview

**Grafo do git por *lanes*, no terminal — e um export HTML de um arquivo só.**

Cada branch ocupa uma linha do grafo com o nome escrito na ponta, cor por categoria, branches
já fundidas apagadas em pastel de baixo contraste. O mesmo arquivo exporta um HTML
auto-contido para mandar no PR, revisar com o time ou arquivar.

Não é `git log --graph`: é um grafo de *lanes* com eixo Y de verdade, planeador de merge e
export HTML. Sem build: Bun + [OpenTUI](https://github.com/anomalyco/opentui).

---

## Isto resolve um problema pessoal

O `gitview` nasceu de uma necessidade específica e diária, não da ideia genérica de "mais uma
ferramenta de git". No repo onde trabalho, com **centenas de commits, dezenas de branches e
merges frequentes**, eu precisava responder a três coisas que nenhuma ferramenta me dava rápido:

1. **Qual lane é cada commit?** — `git log --graph` desenha linhas com caracteres, mas o nome da
   branch raramente aparece onde eu estou olhando. Eu caçava com `git branch --contains`,
   commit por commit.
2. **Quais branches ainda têm algo a me entregar?** — quem já foi fundida e quem está só atrás
   do alvo se mistura, com o mesmo peso visual. Aqui as inativas ficam em **pastel de baixo
   contraste**: dá pra ver o que existe sem ler o que importa.
3. **Qual a ordem de merge menos dolorida?** — quem vai primeiro, o que conflita com quem, e a
   ordem muda o resultado. O `gitview` simula os merges com `git merge-tree --write-tree`
   (**sem tocar em refs nem na working tree**) e sugere a ordem.

Se você também tem um repo com muitas branches e merges frequentes, provavelmente sente o mesmo.
Se tem um repo pequeno com 3 branches, use `git log --oneline` e economize o tempo — esta
ferramenta é para o outro caso.

---

## O que ele faz

- **Lane por branch, com o nome na ponta.** Cada branch é uma linha do grafo; o nome real
  aparece à direita do seu último commit (`feature/login #518a29a`), não num rótulo solto.
- **Eixo Y dinâmico.** Só as lanes visíveis aparecem; `main`/`master`/`default`/`base` ficam
  sempre pinadas no topo; as setas ▲/▼ pulam para a próxima lane fora da tela. Alternativa:
  coluna fixa com scroll para ver todas.
- **Eixo X sem sobreposição.** Só a faixa visível é desenhada, com espaçamento mínimo de 130 px
  e formato de data que muda com o zoom (ano → ano-mês → dia). Datas nunca se sobrepõem.
- **Branches inativas em pastel.** Fundidas ou só atrás do destino (`ahead 0`) aparecem com cor
  dessaturada em direção ao fundo, marcadas `✓fundida`.
- **Fantasmas.** Commits de branches já apagadas (lados de merges, tip duplicado, `wip/x`)
  continuam no grafo em cinza e são contados numa faixa no rodapé. Nenhum commit some por falta
  de ref.
- **Planejamento de merge** (tecla `p`, ou aba *plano de merge*): ordem sugerida por destino,
  com conflitos exatos via `git merge-tree` quando git ≥ 2.38, ou estimativa por arquivos em
  comum para git mais antigo.
- **Matriz de conflitos** branch × branch — o que vai explodir antes de explodir.
- **Export HTML de um arquivo só.** Sem CDN, sem JS externo, sem build. Abre com duplo clique,
  manda por e-mail/PR, e usa o mesmo renderizador do terminal: eixos, filtro, zoom e deep-link
  por lane (`#lane=nome`).
- **Nada é escrito no seu repo.** Nenhuma ref muda, nenhum arquivo aparece lá: tudo vem de
  `git log`/`rev-list`/`merge-tree` em modo leitura.

## Instalação

Requer **[Bun](https://bun.sh)** e `git` 2.30+ no `PATH`.

```bash
git clone https://github.com/dduartee/gitview
cd gitview
bun install
```

```bash
bun run gitview.ts ~/qualquer/repo   # a partir do clone
bun link && gitview ~/qualquer/repo   # comando global
```

## Experimentar sem repo grande

O clone traz um repo sintético determinístico — dezenas de commits, branches de todas as
categorias, merges `--no-ff`, tags, branch órfã e nomes propositalmente horríveis:

```bash
bash script/fixture.sh      # cria .fixtures/complex (fora do versionamento)
gitview .fixtures/complex
gitview .fixtures/complex --export grafo.html
```

## Uso

```bash
gitview                      # grafo do repo atual
gitview /caminho/do/repo     # grafo de outro repo
gitview --dump               # imprime o modelo de lanes (debug, sem UI)
gitview --export grafo.html  # exporta o HTML auto-contido
gitview --help               # todas as opções (--main, --dev, --template, …)
```

| tecla | ação |
|---|---|
| clique · `←` `→` | selecionar commit |
| `↑` `↓` | pular para o commit mais próximo na lane vizinha |
| `shift` + `←` `→` | pular 20 commits |
| `Home` `End` (`g` `G`) | primeiro / último commit |
| `h` | voltar ao HEAD |
| duplo clique · `Enter` | destacar ancestrais do commit (esmaece o resto) |
| arrastar · roda | navegar (`shift`+roda = vertical) |
| `p` | painel de planejamento de merge |
| `e` | exportar HTML na working directory |
| `q` · `Esc` | sair |

## Como a lane é montada

- **Lane por branch:** a lane segue o *first-parent* a partir da ponta (`tip`) de cada branch,
  parando onde outro dono já reivindicou o commit.
- **Tronco fixo no topo:** `main`/`master`/`default`/`base` ocupam as primeiras linhas, sozinhos;
  o resto é ordenado pela data do último commit (mais recente primeiro).
- **Categoria pela cor:** o prefixo do nome define a categoria (`main`, `hotfix`, `release`,
  `develop`, `feature`, `outros`).
- **Fantasma:** commit sem ref vira lane sem nome (no terminal, `~hash7`).
- **Inativa:** `ahead 0` em relação ao destino do merge → pastel.

O destino do merge é inferido pelo nome (`main`, ou `develop`/`dev` para features/outros) e pode
ser fixado com `--main` e `--dev`.

## Limitações conhecidas

- **Categoria por substring.** `catOf` olha o prefixo do nome; `maintenance/…` pode cair na
  categoria `main`. O mesmo vale para escolher o destino do merge.
- **Análise de conflitos é O(n²).** Um `git merge-tree` por par de branches abertas: instantâneo
  para dezenas, lento para centenas.
- **SVG sem virtualização.** O HTML desenha todos os commits como elementos; acima de ~5 000
  commits o navegador começa a engasgar.
- **Custo no start.** Para saber quais branches estão inativas, o TUI roda um
  `git rev-list --count` por branch no start (dezenas de ms cada). Em repo com centenas de
  branches a abertura leva alguns segundos.
- **Cobertura de teste em construção.** O desenho sai de um modelo conferível com `--dump`
  (dump vs. grafo foi validado num repo com centenas de commits), mas a suíte `bun test` ainda
  não cobre o renderizador.

## Roadmap

- [ ] Cobertura de teste para o modelo de lanes (`bun test`)
- [ ] Virtualização do SVG acima de alguns milhares de commits
- [ ] Cache da análise de conflitos entre aberturas
- [ ] Filtro por commit (mensagem, autor), além do nome da branch
- [ ] Export PNG a partir do HTML

## Contribuindo

Issues e PRs são bem-vindos. A ferramenta é pessoal na origem, e o que eu mais quero saber é
**o que falta para o seu grafo ficar legível**: se o seu repo tem muitas branches e o `gitview`
não mostra algo que você precisa, abre uma issue com o nome da branch e o que você esperava ver.

Código: sem build step, sem framework, sem transpilação — Bun rodando TypeScript direto.
Comentários em PT-BR.

O código vive em `packages/`, um diretório por preocupação — `git` (a seam de execução),
`model` (a atribuição commit→lane, compartilhada pelos dois renderizadores), `merge` (plano e
matriz de conflitos), `export` (o HTML) e `tui` (o terminal). O `gitview.ts` na raiz é só o
composition root: argumentos e dispatch. Cada package é um módulo profundo, e
`bun run lint:boundaries` falha se alguém alcançar um `lib/` de dentro de outro package.

Isso não é o mesmo que "um arquivo só": o **export HTML** continua sendo um arquivo só, sem
CDN e sem JS externo — é essa a garantia que importa. O binário também continua único, via
`bun build --compile`.

## Licença

[MIT](LICENSE) © 2026 [Gabriel Kleemann Duarte](https://github.com/dduartee)