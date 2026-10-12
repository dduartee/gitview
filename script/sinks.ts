#!/usr/bin/env bun
// Validates the repo against the ceilings declared in CONSTRAINTS.md.
//
// Reads the ceilings from CONSTRAINTS.md itself — doesn't duplicate them here. A ceiling
// written in two places drifts; when it drifts, nobody knows which one holds.
//
// Exits with 1 if it goes over, so it can join `check`.

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname

/**
 * Ceilings read from CONSTRAINTS.md — not duplicated here.
 *
 * Looks for the key/value pair in the whole file instead of a specific ```yaml block:
 * the file has two yaml blocks, and the one with the ceilings isn't the first. If the
 * format changes, the error names the missing key instead of silently returning 0.
 */
function ceilings(): { loc: number; deps: number; fn: number } {
  const md = readFileSync(join(ROOT, "CONSTRAINTS.md"), "utf8")
  const readKey = (k: string) => {
    const v = Number(md.match(new RegExp(`^\\s*${k}:\\s*(\\d+)`, "m"))?.[1] ?? 0)
    if (!v) throw new Error(`didn't find ${k}: <number> in CONSTRAINTS.md`)
    return v
  }
  return { loc: readKey("max_lines_of_code"), deps: readKey("max_dependencies_direct"),
    fn: readKey("max_lines_per_function") }
}

/**
 * Longest function by line count, and where.
 *
 * Indentation-depth heuristic: counts lines up to the next line at the same or lower
 * level that opens the function. Cheap and errs on the side of over-reporting — a false
 * positive is a glance, a false negative is an unreadable function slipping through.
 *
 * Doesn't catch one-line arrow functions or nested callbacks; that would take a parser.
 */
function longestFunctions(file: string, source: string, min: number):
  { file: string; line: number; n: number; name: string }[] {
  const l = source.split("\n")
  const out: { file: string; line: number; n: number; name: string }[] = []
  for (let i = 0; i < l.length; i++) {
    // Two shapes only: `function name(` and `const name = (` with an optional type. Kept as
    // two matches instead of one alternation, so the capture index is never in doubt.
    const declared = l[i].match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
      ?? l[i].match(/^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/)
    if (!declared) continue
    const base = l[i].match(/^(\s*)/)![1].length
    const name = declared[1]
    let end = i + 1
    for (let j = i + 1; j < l.length; j++) {
      if (!l[j].trim()) continue
      if (l[j].match(/^(\s*)/)![1].length <= base) { end = j; break }
    }
    const n = end - i
    if (n > min) out.push({ file, line: i + 1, n, name })
  }
  return out
}

/** Every versioned `.ts` in the project, except the script itself. */
function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "out") continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) sources(p, acc)
    else if (e.endsWith(".ts")) acc.push(p)
  }
  return acc
}

/** Tests don't go into the binary. Counting them in the ceiling would punish whoever writes verification. */
const isTest = (f: string) => f.includes("/tests/")

/**
 * The embedded template is CSS and JS inside a string, not TypeScript. Wrapping its long lines is
 * a readability gain, and charging the added lines to the same ceiling would punish that gain.
 * Counted separately, like the tests.
 */
const RESOURCE = "packages/export/lib/template.ts"
const isResource = (f: string) => relative(ROOT, f) === RESOURCE

const { loc: MAX_LOC, deps: MAX_DEPS, fn: MAX_FN } = ceilings()
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
const self = relative(ROOT, new URL(import.meta.url).pathname)

const files = sources(ROOT).filter(f => relative(ROOT, f) !== self)
const shipped = files.filter(f => !isTest(relative(ROOT, f)) && !isResource(f))
const tests = files.filter(f => isTest(relative(ROOT, f)))
const resources = files.filter(isResource)

/** LOC measured over what goes into the binary. Tests and the embedded template are reported separately. */
/** Lines of a file, excluding the trailing empty one. */
const locOf = (f: string) => [relative(ROOT, f), readFileSync(f, "utf8").split("\n").length - 1] as const
const lines = shipped.map(locOf)
const testLines = tests.map(locOf)
const resourceLines = resources.map(locOf)
const total = lines.reduce((s, [, n]) => s + n, 0)
const totalTests = testLines.reduce((s, [, n]) => s + n, 0)
const totalResources = resourceLines.reduce((s, [, n]) => s + n, 0)

const nDeps = Object.keys(pkg.dependencies ?? {}).length
const longFunctions = shipped.flatMap(f => longestFunctions(relative(ROOT, f), readFileSync(f, "utf8"), MAX_FN))
  .sort((a, b) => b.n - a.n)

const pct = (n: number, max: number) => Math.round((n / max) * 100)
const bar = (n: number, max: number) => {
  const filled = Math.min(20, Math.round((n / max) * 20))
  return "█".repeat(filled) + "░".repeat(20 - filled)
}

console.log(`\n  LOC ${total} / ${MAX_LOC}  ${bar(total,
  MAX_LOC)} ${pct(total, MAX_LOC)}%   (binary; separately: tests ${totalTests}, template ${totalResources})`)
console.log(`  runtime deps ${nDeps} / ${MAX_DEPS}`)
console.log(`  functions > ${MAX_FN} lines  ${longFunctions.length}  ${bar(longFunctions.length, 5)}`)

const largest = [...lines].sort((a, b) => b[1] - a[1]).slice(0, 6)
console.log("\n  largest files:")
for (const [f, n] of largest) {
  console.log(`    ${String(n).padStart(5)}  ${f}`)
}

if (longFunctions.length) {
  console.log(`\n  long functions:`)
  for (const f of longFunctions.slice(0, 5)) {
    console.log(`    ${String(f.n).padStart(4)}  ${f.file}:${f.line}  ${f.name}()`)
  }
}

let failed = false

if (total > MAX_LOC) {
  console.log(`\n  ✗ ${total - MAX_LOC} lines above the ceiling. Cut, or justify it in the PR body and`)
  console.log(`    raise the ceiling in CONSTRAINTS.md — don't let the number and the code diverge.`)
  failed = true
}
if (nDeps > MAX_DEPS) {
  console.log(`\n  ✗ ${nDeps - MAX_DEPS} runtime dependencies above the ceiling.`)
  failed = true
}
if (longFunctions.length) {
  console.log(`\n  ✗ ${longFunctions.length} function(s) above ${MAX_FN} lines. This is the one that hurts:`)
  console.log(`    ${longFunctions[0].file}:${longFunctions[0].line} ${longFunctions[0].name}() — ${
    longFunctions[0].n} lines.`)
  console.log(`    Break it into named functions. The name is what makes code readable.`)
  failed = true
}

console.log(failed ? "\n  ✗ outside the constraints\n" : "\n  ✓ within the constraints\n")
process.exit(failed ? 1 : 0)