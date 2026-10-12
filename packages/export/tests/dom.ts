// DOM shim, enough to run the template script outside the browser.
//
// It exists because `packages/export/lib/template.ts` is the riskiest file in the repo —
// untyped JS inside a string, invisible to `tsc`, and only ever exercised by opening the
// HTML by hand. Without this, any change to it runs on faith.
//
// The shim is permissive on purpose: it validates neither CSS nor layout, and returns an
// element for any `id` the HTML declares. What it catches is execution errors — a
// reference to a method that does not exist, access to a property of `undefined`, use of
// a variable out of scope (which `var` allowed and `let` does not).
//
// It lives in `tests/` because it is a fixture: the project's boundary rule does not let
// another package import it, and that is correct — it is not production code.

/** Toy element with what the template uses. */
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
  /** The template reads this to compute the visible band; a fixed value avoids real layout. */
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
  /** Fires a registered listener, optionally with an event. */
  fire(type: string, ev?: unknown) { for (const f of this.listeners[type] ?? []) (f as (e?: unknown) => void)(ev) }
  /** Fires the directly-assigned `onclick`, the template's default. */
  click() { this.onclick?.() }
  /** Changes the value and fires `change`, exercising checkboxes. */
  change() { this.fire("change", { target: this }) }
  /** Fires `input` with the event the search handler expects. */
  type(v: string) { this.value = v; this.fire("input", { target: this }) }
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
  /** All elements the script touched, by id. For inspection in tests. */
  byId: Map<string, El>
  /** Ids the script looked up that the HTML did not declare. Should be only the optional ones. */
  missingIds: Set<string>
  reloads: number
}

/**
 * Triggers what the user would trigger: tabs, switches, search, axis arrows.
 *
 * Loading only exercises the first render and `fitTo`. Zoom, filter, tab switching, and
 * the checkbox handlers live on paths nobody touched — and that is where a botched
 * `var`→`let` would hide. Returns how many handlers it fired.
 */
export function interact(dom: Dom): { fired: number; errors: { where: string; error: Error }[] } {
  let n = 0
  const errors: { where: string; error: Error }[] = []
  const attempt = (where: string, f: () => void) => {
    try { f(); n++ } catch (e) { errors.push({ where, error: e instanceof Error ? e : new Error(String(e)) }) }
  }

  for (const id of ["t-refs", "t-plan", "t-matrix"]) {
    const b = dom.byId.get("b-" + id.slice(2))
    if (b) attempt(`tab ${id}`, () => b.click())
  }
  for (const id of ["tg-ey", "tg-pin", "tg-hash", "tg-branchless", "tg-merge"]) {
    const e = dom.byId.get(id)
    if (e) { e.checked = !e.checked; attempt(`switch ${id}`, () => e.change()) }
  }
  const f = dom.byId.get("f")
  if (f) for (const q of ["main", "feature", "zzz"]) attempt(`search ${q}`, () => f.type(q))
  for (const id of ["sc-up", "sc-dn"]) {
    const e = dom.byId.get(id)
    if (e) attempt(`arrow ${id}`, () => e.click())
  }
  const reset = dom.byId.get("b-reset")
  if (reset) attempt("reset", () => reset.click())

  return { fired: n, errors }
}

/** Ids declared in the template HTML. The script may only expect these to exist. */
function idsInHtml(tpl: string): Set<string> {
  const ids = new Set<string>()
  for (const m of tpl.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1])
  return ids
}

/** Builds the shim. `ids` are the ones declared in the HTML; the rest return `null`, as in the browser. */
export function createDom(ids: Set<string>): Dom {
  const byId = new Map<string, El>()
  const missingIds = new Set<string>()
  let reloads = 0

  const getById = (id: string): El | null => {
    if (byId.has(id)) return byId.get(id)!
    if (!ids.has(id)) { missingIds.add(id); return null }
    const e = new El("div")
    e.setAttribute("id", id)
    byId.set(id, e)
    return e
  }

  const document = {
    getElementById: getById,
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
    document, window, byId, missingIds,
    // getter, not a value: the counter lives in the closure
    get reloads() { return reloads },
  }
}

/**
 * Runs the template script against the shim.
 *
 * Returns success/error and a signature of what was built — the signature is what lets
 * you compare "before and after" a refactor without opening a browser.
 */
export function runTemplate(tpl: string, graph: unknown) {
  const ids = idsInHtml(tpl)
  const dom = createDom(ids)

  // The template has two <script>: the first only declares `window.__GRAPH__ = null`, and
  // it is the one `exportHtml` replaces. Here we pass the projection through the same path.
  const scripts = [...tpl.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  const body = scripts.find(s => /^\s*\(function/.test(s))
  if (!body) throw new Error("could not find the template script")

  // `window` is the object the script reads; `__GRAPH__` receives the projection, as in the browser.
  dom.window.__GRAPH__ = typeof graph === "string" ? JSON.parse(graph) : graph

  const fn = new Function("window", "document", "sessionStorage", "location", body)
  let error: Error | null = null
  try {
    fn(dom.window, dom.document, dom.window.sessionStorage, dom.window.location)
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e))
  }

  return { error, dom, signature: signature(dom) }
}

/**
 * Stable summary of the built DOM: how many nodes of each tag, how many attributes.
 * Two runs of the same template must give the same signature.
 */
export function signature(dom: Dom): string {
  const counts: Record<string, number> = {}
  let nodes = 0, attrs = 0
  const visit = (e: El) => {
    nodes++
    counts[e.tagName] = (counts[e.tagName] ?? 0) + 1
    attrs += Object.keys(e.attrs).length
    for (const c of e.children) visit(c)
  }
  for (const e of dom.byId.values()) visit(e)
  const tags = Object.keys(counts).sort().map(t => `${t}:${counts[t]}`).join(",")
  return `nodes=${nodes} attrs=${attrs} ${tags}`
}
