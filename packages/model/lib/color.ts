/** Cor por categoria de branch. Espelhada dentro do template HTML — as duas têm de concordar. */
export const COL: Record<string, string> = {
  main: "#4c9ffe",
  hotfix: "#b5b9bd",
  release: "#86c64a",
  dev: "#ffbf5e",
  feature: "#d9757d",
  other: "#b79cf0",
}

/** Fundo do terminal. Entra no cálculo da dessaturação. */
export const BG = "#14161b"

/**
 * Mistura a cor na direção do fundo: `.28` da cor original, `.72` do fundo.
 * É o "pastel de baixo contraste" das lanes inativas — dá pra ver que a lane existe
 * sem ela competir com o que importa.
 */
export const mix = (hex: string): string => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(BG.slice(1), 16)
  return "#" + [16, 8, 0].map(s => Math.round(((a >> s) & 255) * .28 + ((b >> s) & 255) * .72).toString(16).padStart(2, "0")).join("")
}