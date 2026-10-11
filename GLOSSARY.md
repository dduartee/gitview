# gitview

Grafo de histórico git organizado por *lanes* — uma branch por linha — legível tanto num TUI
quanto num HTML de arquivo único. Existe para responder, num repositório com muitas branches e
merges, três perguntas que o `git log` não responde rápido: qual lane é cada commit, quais
branches ainda têm algo a entregar, e em que ordem mesclar.

## Language

### O grafo

**Lane**:
Uma branch, ocupando uma linha horizontal do grafo. Derivada por caminhada *first-parent* a
partir da ponta da branch; é a unidade de leitura, não a de dado — vários commits por lane.
_Avoid_: linha, row, trilha, serie

**Ponta (tip)**:
O commit mais recente de uma lane. É onde o nome da branch aparece, à direita.
_Avoid_: head, topo, latest

**Fantasma (ghost)**:
Um commit cuja branch de origem já foi apagada. Continua no grafo, desenhado em cinza, e conta
numa faixa no rodapé. Nenhum commit some por falta de ref.
_Avoid_: órfão, lixo, dangling

**Lane invisível**:
Branch cuja ponta está fora do log e portanto não ocupa linha, mas cujo nome ainda aparece na
coluna de rótulos marcada como invisível.
_Avoid_: lane vazia, lane oculta

**Categoria**:
O agrupamento de uma lane por convenção de nome — `main`, `dev`, `release`, `hotfix`, `feature`,
`other`. Determina a cor.
_Avoid_: tipo, classe, grupo

**Inativa**:
Lane que nada tem a entregar: já foi fundida no destino, ou está `ahead 0`. Renderizada em
pastel de baixo contraste e marcada `✓fundida`. Existe, mas não pesa.
_Avoid_: morta, velha,arquivada

**Tronco**:
`main`, `master`, `default` ou `base`. Sempre fixado no topo do eixo Y, nessa ordem, com linha
própria, nunca reordenado por data.
_Avoid_: base, destino, principal

**Destino (alvo)**:
O tronco para onde uma branch seria fundida. Para `feature` e `other` é o `dev` quando existe,
senão o `main`; para as demais categorias é o `main`.
_Avoid_: destino de merge, upstream, base

**Eixo Y**:
O eixo das lanes. Só as visíveis são desenhadas; o tronco fica sempre pinado, e setas ▲▼ pulam
para a próxima lane fora da tela.
_Avoid_: eixo de branches, coluna de lanes

**Eixo X**:
O eixo temporal, na ordem do log. A data é formatada conforme o zoom (ano → ano-mês → dia) e
nunca se sobrepõe.
_Avoid_: eixo do tempo, linha do tempo

### O modelo e suas duas renderizações

**Model**:
A atribuição de cada commit a uma lane, mais a ordem e a posição horizontal das lanes. Calculado
uma vez, é a única coisa que os dois renderizadores compartilham. Não sabe desenhar nada.
_Avoid_: dados, estado, grafo (o grafo é o que se vê; o model é o que se calcula)

**Renderizador**:
Uma das duas maneiras de mostrar o model na tela: o TUI no terminal e o SVG no HTML. São
implementações independentes, com coordenadas, interação e recursos próprios. Um recurso
presente num não implica presente no outro.
_Avoid_: renderer do grafo (sugere que é o mesmo)

**Projeção**:
A forma serializada do model que o renderizador HTML consome. É o contrato entre os dois
renderizadores — e o ponto onde um dado pode divergir do model se for escrito no lugar em vez de
copiado.
_Avoid_: payload, export, snapshot

**Plano de merge**:
A ordem sugerida de fundir as lanes de um mesmo destino, simulando os merges em sequência. Cada
passo sabe se fica limpo e quais arquivos conflitam.
_Avoid_: merge planner, ordem de merge

**Matriz de conflitos**:
A tabela lane × lane dos arquivos em conflito ao mesclar cada par de lanes abertas.
_Avoid_: tabela de conflitos, pairwise

**Conflito exato**:
A lista de arquivos em conflito vinda do git de verdade, quando a versão suporta a simulação.
**Estimativa por arquivos em comum** é o degradê quando não suporta, e o relatório diz qual dos
dois foi usado.
_Avoid_: erro de merge (é um aviso prévio, não um erro)

**Simulação**:
O cálculo do resultado de um merge sem tocar em ref nem em working tree. É a razão de o
gitview poder existir dentro de um repositório alheio.
_Avoid_: dry run, preview

**Risco**:
`baixo`, `medio` ou `alto`, derivado do número de arquivos em conflito. Considera a ordem sugerida,
então o mesmo par pode mudar de risco conforme o plano.
_Avoid_: severidade, prioridade

**Export**:
O HTML auto-contido de um arquivo só, com o grafo, o plano e a matriz. Abre com duplo clique e
precisa continuar funcionando depois de ir por e-mail ou anexo de PR.
_Avoid_: relatório, snapshot, screenshot