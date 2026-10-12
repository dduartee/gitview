#!/usr/bin/env bun
// line-density — line width, inline functions and density.
//
// Measures what a line's width says about density and about INLINE candidates.
// Filters out what doesn't go into the binary: tests, node_modules, .git, dist.
// No dependencies; runs with Bun. Output is a table plus the inline list.
//
// usage: bun script/line-density.ts [path ...]   # no arg: the cwd

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const EXCLUDE = new Set([".git", "node_modules", "dist", "out", "coverage", ".next", ".turbo"])
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"])
const TEST = /(^|\/)(tests?)\/|\.test\./

// a brace block on a single line: function, arrow, if, for, catch — INLINE candidates
const INLINE = /\([^)]*\)\s*(?::[^=]+)?\s*\{.*\}\s*$|=>\s*.*;\s*$/

type Rel = {
  file: string
  lines: number
  max: number
  p95: number
  over80: number
  over100: number
  over120: number
  dens: number
  indent: number
  inline: [number, string][]
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]!
}

function collect(paths: string[]): string[] {
  const out = new Set<string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (EXCLUDE.has(e)) continue
      if (statSync(p).isDirectory()) walk(p)
      else if (EXT.has(p.slice(p.lastIndexOf("."))) && !TEST.test(p)) out.add(p)
    }
  }
  for (const p of paths) {
    if (statSync(p).isDirectory()) walk(p)
    else if (!TEST.test(p)) out.add(p)
  }
  return [...out].sort()
}

function analyze(file: string): Rel {
  const lines = readFileSync(file, "utf8").split("\n")
  const chars = lines.map(l => l.length)
  const nonspace = lines.map(l => l.length - (l.match(/ /g)?.length ?? 0))
  const indent = lines.map(l => {
    const m = l.match(/^ */)
    return m ? m[0]!.length : 0
  })
  const inline: [number, string][] = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim()
    if (INLINE.test(t)) inline.push([i + 1, t])
  }
  const sorted = [...chars].sort((a, b) => a - b)
  const total = chars.reduce((a, b) => a + b, 0) || 1
  return {
    file,
    lines: lines.length,
    max: sorted.at(-1) ?? 0,
    p95: pct(sorted, 95),
    over80: chars.filter(c => c > 80).length,
    over100: chars.filter(c => c > 100).length,
    over120: chars.filter(c => c > 120).length,
    dens: Math.round((nonspace.reduce((a, b) => a + b, 0) / total) * 1000) / 1000,
    indent: Math.max(...indent, 0),
    inline,
  }
}

function main() {
  const paths = process.argv.slice(2)
  const files = collect(paths.length ? paths : [process.cwd()])
  if (!files.length) { console.log("no files found"); return }

  const head = "file".padEnd(46) + " " +
    ["lines", "max", "p95", ">80", ">100", ">120", "dens", "ind", "inl"].map(s => s.padStart(5)).join(" ")
  console.log(head)
  let tLines = 0, t80 = 0, t100 = 0, t120 = 0
  const inlineAll: [string, number, string][] = []
  for (const f of files) {
    const r = analyze(f)
    const rel = relative(process.cwd(), f) || f
    console.log(
      rel.padEnd(46) + " " +
      String(r.lines).padStart(5) + " " + String(r.max).padStart(5) + " " + String(r.p95).padStart(5) + " " +
      String(r.over80).padStart(5) + " " + String(r.over100).padStart(5) + " " + String(r.over120).padStart(5) + " " +
      String(r.dens).padStart(5) + " " + String(r.indent).padStart(5) + " " + String(r.inline.length).padStart(5),
    )
    tLines += r.lines; t80 += r.over80; t100 += r.over100; t120 += r.over120
    for (const [ln, t] of r.inline) inlineAll.push([f, ln, t])
  }
  console.log()
  console.log(`total: ${tLines} lines | >80=${t80} >100=${t100} >120=${t120}`)
  console.log()
  console.log("inline (single-line brace blocks — INLINE candidates):")
  for (const [f, ln, t] of inlineAll) console.log(`  ${f}:${ln}  ${t.slice(0, 96)}`)
  if (!inlineAll.length) console.log("  none")
}

main()