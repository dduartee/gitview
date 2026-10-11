// O renderizador de terminal.
//
// Char grid via OpenTUI. Não sabe nada de HTML, e o HTML não sabe nada de terminal: os dois
// só compartilham o model. Zoom, filtro, eixo X e deep-link são do HTML — o glossário
// registra a assimetria.
//
// `GitView` está em `lib/view.ts` e o desenho em `lib/pintor.ts`. Aqui fica só o arranjo:
// construir, ligar teclado, rodar.

import { createCliRenderer } from "@opentui/core"
import type { Model } from "../model/index.ts"
import type { createMergePlanner } from "../merge/index.ts"
import { GitView } from "./lib/view.ts"

export type TuiDeps = {
  m: Model
  planner: ReturnType<typeof createMergePlanner>
  /** Injetado pelo app: mantém o TUI sem dependência do package de export. */
  onExport: () => string
}

export async function startTui({ m, planner, onExport }: TuiDeps): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: "#14161b", useMouse: true, enableMouseMovement: true })
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
