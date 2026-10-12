// Category of a branch by name convention. Determines the color.
//
// Lives in `lib/` because `lib/trunks.ts` needs it and `no-circular` forbids `lib` from
// importing the package index — it would be index → trunks → index.

/** Priority order of the categories: used to break ties between lanes of the same date. */
export const CATEGORY_ORDER = ["main", "dev", "release", "hotfix", "feature", "other"]

/**
 * `develop` is NOT category `main`: it stays `dev`. This is deliberate — the category is
 * what `merge` uses to pick a target, and `intoOf` sends feature and other to `dev ?? main`.
 * If `develop` were `main`, `pick("main")` would pick the newest commit between the two
 * and features would start aiming at `main` instead of `develop`: a silent merge-plan bug
 * traded for a color bug. `develop` is a default branch, and default branch is resolved
 * separately — see `lib/trunks.ts`.
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