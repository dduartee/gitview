// The terminal renderer.
//
// Char grid via OpenTUI. It knows nothing about HTML, and HTML knows nothing about the
// terminal: the two only share the model. Zoom, filtering, X axis and deep-links are HTML
// only — the glossary records the asymmetry.
//
// `GitView` lives in `lib/view.ts` and the drawing in `lib/pintor.ts`. Only the wiring
// stays here: build, bind the keyboard, run.

import { createCliRenderer } from "@opentui/core"
import type { Model } from "../model/index.ts"
import type { createMergePlanner } from "../merge/index.ts"
import { GitView } from "./lib/view.ts"

export type TuiDeps = {
  m: Model
  planner: ReturnType<typeof createMergePlanner>
  /** Injected by the app: keeps the TUI without a dependency on the export package. */
  onExport: () => string
}

export async function startTui({ m, planner, onExport }: TuiDeps): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true, backgroundColor: "#14161b", useMouse: true, enableMouseMovement: true })
  const view = new GitView(renderer, m, planner, onExport)
  renderer.root.add(view)

  renderer.keyInput.on("keypress", (key: { name: string; shift?: boolean }) => {
    if (key.name === "q" || (key.name === "escape" && !view.panel)) {
      renderer.destroy()
      process.exit(0)
    }
    view.handleKey(key.name, !!key.shift)
  })
}
