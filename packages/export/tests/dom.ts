// Shim de DOM suficiente para rodar o script do template fora do navegador.
//
// Existe porque `packages/export/lib/template.ts` é o arquivo mais arriscado do repo — JS
// sem tipos dentro de uma string, que o `tsc` não vê e que só era exercitado abrindo o
// HTML na mão. Sem isto, qualquer mudança nele é fé.
//
// O shim é permissivo de propósito: não valida CSS nem layout, e devolve um elemento para
// qualquer `id` que o HTML declare. O que ele pega é erro de execução — referência a
// método que não existe, acesso a propriedade de `undefined`, uso de variável fora de
// escopo (o que `var` permitia e `let` não permite).
//
// Está em `tests/` porque é fixture: a regra de fronteira do projeto não deixa outro
// package importá-lo, e isso é correto — ele não é código de produção.

/** Elemento de brinquedo com o que o template usa. */
class El {
  tagName: string
  attrs: Record<string, string> = {}
  children: El[] = []
  childNodes: El[] = []
  parent: El | null = null
  textContent = ""
  innerHTML = ""
  checked = true
  value = ""
  onclick: (() => void) | null = null
  style: Record<string, string> = {}
  listeners: Record<string, (() => void)[]> = {}
  /** O template lê isto para calcular a faixa visível; valor fixo evita layout de verdade. */
  clientWidth = 1200
  clientHeight = 600

  constructor(tag: string) { this.tagName = tag }

  setAttribute(k: string, v: unknown) { this.attrs[k] = String(v) }
  getAttribute(k: string) { return this.attrs[k] ?? null }
  removeAttribute(k: string) { delete this.attrs[k] }
  appendChild(e: El) { e.parent = this; this.children.push(e); this.childNodes.push(e); return e }
  removeChild(e: El) {
    const i = this.childNodes.indexOf(e)
    if (i >= 0) { this.childNodes.splice(i, 1); this.children.splice(this.children.indexOf(e), 1) }
    return e
  }
  get firstChild() { return this.childNodes[0] ?? null }
  addEventListener(t: string, f: () => void) { (this.listeners[t] ??= []).push(f) }
  querySelectorAll() { return [] as El[] }
  getBoundingClientRect() { return { x: 0, y: 0, width: this.clientWidth, height: this.clientHeight, top: 0, left: 0, right: this.clientWidth, bottom: this.clientHeight } }
  get classList() {
    const set = new Set<string>()
    return {
      add: (c: string) => set.add(c),
      remove: (c: string) => set.delete(c),
      contains: (c: string) => set.has(c),
      toggle: (c: string, on?: boolean) => (on === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : on ? set.add(c) : set.delete(c)),
    }
  }
  /** Dispara um listener registrado, opcionalmente com um evento. */
  disparar(tipo: string, ev?: unknown) { for (const f of this.listeners[tipo] ?? []) (f as (e?: unknown) => void)(ev) }
  /** Dispara o `onclick` atribuído direto, o padrão do template. */
  clicar() { this.onclick?.() }
  /** Muda o valor e dispara `change`, exercitando checkboxes. */
  mudar() { this.disparar("change", { target: this }) }
  /** Dispara `input` com o evento que o handler de busca espera. */
  digitar(v: string) { this.value = v; this.disparar("input", { target: this }) }
}

export type Dom = {
  document: {
    getElementById: (id: string) => El | null
    createElement: (t: string) => El
    createElementNS: (ns: string, t: string) => El
    createTextNode: (s: string) => El
    querySelectorAll: (s: string) => El[]
    addEventListener: (t: string, f: () => void) => void
  }
  window: { addEventListener: (t: string, f: () => void) => void; location: { hash: string; reload: () => void }; sessionStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }; __GRAPH__?: unknown }
  /** Todos os elementos que o script tocou, por id. Para inspeção nos testes. */
  porId: Map<string, El>
  /** Ids que o script buscou e o HTML não declarava. Deveria ser só os opcionais. */
  idsFaltando: Set<string>
  reloads: number
}

/**
 * Aciona o que o usuário acionaria: abas, interruptores, busca, setas do eixo.
 *
 * O carregamento só exercita o primeiro render e o `fitTo`. Zoom, filtro, troca de aba e
 * os handlers de checkbox vivem em caminhos que ninguém tocava — e é aí que um `var`→`let`
 * mal feito se esconderia. Devolve quantos handlers disparou.
 */
export function exercitar(dom: Dom): { acionados: number; erros: { onde: string; erro: Error }[] } {
  let n = 0
  const erros: { onde: string; erro: Error }[] = []
  const mexer = (onde: string, f: () => void) => {
    try { f(); n++ } catch (e) { erros.push({ onde, erro: e instanceof Error ? e : new Error(String(e)) }) }
  }

  for (const id of ["t-refs", "t-plan", "t-matrix"]) {
    const b = dom.porId.get("b-" + id.slice(2))
    if (b) mexer(`aba ${id}`, () => b.clicar())
  }
  for (const id of ["tg-ey", "tg-pin", "tg-hash", "tg-ghost", "tg-merge"]) {
    const e = dom.porId.get(id)
    if (e) { e.checked = !e.checked; mexer(`interruptor ${id}`, () => e.mudar()) }
  }
  const f = dom.porId.get("f")
  if (f) for (const q of ["main", "feature", "zzz"]) mexer(`busca ${q}`, () => f.digitar(q))
  for (const id of ["sc-up", "sc-dn"]) {
    const e = dom.porId.get(id)
    if (e) mexer(`seta ${id}`, () => e.clicar())
  }
  const reset = dom.porId.get("b-reset")
  if (reset) mexer("reset", () => reset.clicar())

  return { acionados: n, erros }
}

/** Ids declarados no HTML do template. O script só pode esperar que estes existam. */
function idsDoHtml(tpl: string): Set<string> {
  const ids = new Set<string>()
  for (const m of tpl.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1])
  return ids
}

/** Monta o shim. `ids` são os declarados no HTML; os demais devolvem `null`, como no browser. */
export function criarDom(ids: Set<string>): Dom {
  const porId = new Map<string, El>()
  const idsFaltando = new Set<string>()
  let reloads = 0

  const pegar = (id: string): El | null => {
    if (porId.has(id)) return porId.get(id)!
    if (!ids.has(id)) { idsFaltando.add(id); return null }
    const e = new El("div")
    e.setAttribute("id", id)
    porId.set(id, e)
    return e
  }

  const document = {
    getElementById: pegar,
    createElement: (t: string) => new El(t),
    createElementNS: (_ns: string, t: string) => new El(t),
    createTextNode: (s: string) => { const e = new El("#text"); e.textContent = s; return e },
    querySelectorAll: () => [] as El[],
    addEventListener: () => {},
  }

  const window = {
    addEventListener: () => {},
    location: { hash: "", reload: () => { reloads++ } },
    sessionStorage: { getItem: () => null, setItem: () => {} },
  }

  return {
    document, window, porId, idsFaltando,
    // getter, não valor: o contador vive na closure
    get reloads() { return reloads },
  }
}

/**
 * Roda o script do template com o shim.
 *
 * Devolve sucesso/erro e uma assinatura do que foi construído — a assinatura é o que
 * permite comparar "antes e depois" de uma refatoração sem abrir navegador.
 */
export function rodarTemplate(tpl: string, graph: unknown) {
  const ids = idsDoHtml(tpl)
  const dom = criarDom(ids)

  // O template tem dois <script>: o primeiro só declara `window.__GRAPH__ = null`, e é o
  // que `exportHtml` substitui. Aqui repassamos a projeção pelo mesmo caminho.
  const scripts = [...tpl.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  const corpo = scripts.find(s => /^\s*\(function/.test(s))
  if (!corpo) throw new Error("não achei o script do template")

  // `window` é o objeto que o script lê; `__GRAPH__` recebe a projeção, como no browser.
  dom.window.__GRAPH__ = typeof graph === "string" ? JSON.parse(graph) : graph

  const fn = new Function("window", "document", "sessionStorage", "location", corpo)
  let erro: Error | null = null
  try {
    fn(dom.window, dom.document, dom.window.sessionStorage, dom.window.location)
  } catch (e) {
    erro = e instanceof Error ? e : new Error(String(e))
  }

  return { erro, dom, assinatura: assinatura(dom) }
}

/**
 * Resumo estável do DOM construído: quantos nós de cada tag, quantos atributos.
 * Duas execuções do mesmo template têm de dar a mesma assinatura.
 */
export function assinatura(dom: Dom): string {
  const contagem: Record<string, number> = {}
  let nos = 0, attrs = 0
  const visitar = (e: El) => {
    nos++
    contagem[e.tagName] = (contagem[e.tagName] ?? 0) + 1
    attrs += Object.keys(e.attrs).length
    for (const c of e.children) visitar(c)
  }
  for (const e of dom.porId.values()) visitar(e)
  const tags = Object.keys(contagem).sort().map(t => `${t}:${contagem[t]}`).join(",")
  return `nos=${nos} attrs=${attrs} ${tags}`
}
