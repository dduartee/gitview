/** Color by branch category. Mirrored inside the HTML template — the two must agree. */
export const COL: Record<string, string> = {
  main: "#4c9ffe",
  hotfix: "#b5b9bd",
  release: "#86c64a",
  dev: "#ffbf5e",
  feature: "#d9757d",
  other: "#b79cf0",
}

/** Terminal background. Enters the desaturation calculation. */
export const BG = "#14161b"

/**
 * Mixes the color toward the background: `.28` of the original color, `.72` of the
 * background. It is the "low-contrast pastel" of inactive lanes — you can see the lane
 * exists without it competing with what matters.
 */
export const mix = (hex: string): string => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(BG.slice(1), 16)
  return "#" + [16, 8, 0].map(s => Math.round(((a >> s) & 255) * .28 + ((b >> s) & 255) * .72).toString(16).padStart(2, "0")).join("")
}