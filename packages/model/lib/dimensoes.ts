// Dimensões do desenho em células de terminal.
//
// Mora em `lib/` para que `lib/lanes.ts` e `lib/layout.ts` as usem sem importar o index do
// package — o `no-circular` do dependency-cruiser proíbe `lib` → index.

/** Espaçamento horizontal entre commits, em colunas. */
export const DX = 4

/** Altura de uma lane, em linhas. */
export const RH = 3