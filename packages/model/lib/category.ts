// Categoria de uma branch por convenção de nome. Determina a cor.
//
// Mora em `lib/` porque `lib/trunks.ts` precisa dela e o `no-circular` proíbe `lib` de
// importar o index do package — seria index → trunks → index.

/** Ordem de prioridade das categorias: usada para desempatar lanes de mesma data. */
export const PRIO = ["main", "dev", "release", "hotfix", "feature", "other"]

/**
 * `develop` NÃO é categoria `main`: continua `dev`. Isso é deliberado — a categoria é o
 * que `merge` usa para escolher alvo, e `intoOf` manda feature e other para `dev ?? main`.
 * Se `develop` fosse `main`, `pick("main")` escolheria o commit mais recente entre as duas
 * e as features passariam a mirar `main` em vez de `develop`: bug silencioso de plano de
 * merge trocando um bug de cor. `develop` é tronco, e tronco se resolve à parte — veja
 * `lib/trunks.ts`.
 */
export const catOf = (n: string): string => {
  const s = n.toLowerCase()
  return /(^|\/)(main|master|prod|production)$/.test(s) ? "main"
    : /hotfix/.test(s) ? "hotfix"
    : /release/.test(s) ? "release"
    : /(^|\/)(feat|feature|topic|wip)/.test(s) ? "feature"
    : /dev|homolog|staging/.test(s) ? "dev"
    : "other"
}