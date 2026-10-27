/**
 * `@source` gate: every path Tailwind is told to scan must EXIST.
 *
 * WHY. Tailwind **says nothing** when `@source` points at a folder that does not exist. It just scans less,
 * the build stays green, and most of the UI is still right — because most classes also appear in the app's
 * own code. What disappears are classes that live only inside the library's components.
 *
 * Measured 30/08 on `packages/dev/tracy-design`: `@source "../../ui/tracy-ui/src"` went up two levels
 * instead of three, pointing at `packages/dev/ui/tracy-ui/src` — which does not exist. Result: `.ring-1` had
 * not ONE rule in the whole stylesheet, so `Card` lost its border and every card on the Gallery blended into
 * the background. The symptom was read as "a layout bug" and "the UI kit is broken"; nobody thought of a
 * missing `..`, because nothing pointed that way.
 *
 * WHY MEASURE THE PATH, NOT THE CONTENT. `@tracy/dsh-settings`'s `build-client.mjs` tried three
 * content-based measures and recorded that all three were blind: a byte threshold, a class-count threshold,
 * and a list of required classes — the short build still had 197 classes, the same as the full one. The
 * reason is that Tailwind v4 also auto-detects sources, so the library still gets in another way.
 *
 * A path leaves no room for that ambiguity: the folder exists or it does not. This gate is always red when
 * broken and cannot give a false positive — two properties a content threshold lacks.
 *
 * LIMIT, stated so nobody over-trusts it: the gate only proves the path EXISTS, not that it is the RIGHT
 * path. `@source "./"` pointing at an empty folder still passes. It catches typos, i.e. exactly the kind of
 * mistake that happened.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Scanned folders. */
const SCAN_DIRS = ['packages'] as const

/** `lib`/`dist` are build output: any `@source` there was already consumed by Tailwind. */
const SKIP = new Set(['node_modules', 'lib', 'dist', '.git', 'coverage'])

/**
 * `@source` with single OR double quotes.
 *
 * Both are used in the repo (`tracy-design` double, `tracy-settings` single). A regex catching only
 * double quotes silently skips two files — exactly what happened on the first manual scan, which
 * concluded "only two files use @source", wrongly.
 */
const SOURCE = /@source\s+(["'])([^"']+)\1/g

/** A declaration pointing into nothing. */
interface Violation {
  readonly file: string
  readonly line: number
  readonly spec: string
  readonly resolved: string
}

/**
 * Walks the tree and collects every CSS file.
 * @param dir - starting folder.
 * @param out - where results are collected.
 */
function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (entry.endsWith('.css')) out.push(full)
  }
}

const files: string[] = []
for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files)

const violations: Violation[] = []
let declarations = 0
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const [index, text] of lines.entries()) {
    SOURCE.lastIndex = 0
    for (const match of text.matchAll(SOURCE)) {
      declarations += 1
      const spec = match[2]
      // `@source` resolves against the CSS file's folder, like every relative path in CSS.
      const resolved = resolve(dirname(file), spec)
      if (existsSync(resolved)) continue
      violations.push({
        file: relative(ROOT, file),
        line: index + 1,
        spec,
        resolved: relative(ROOT, resolved)
      })
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`@source gate: ${violations.length} path(s) do not exist\n\n`)
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}  @source "${v.spec}"\n`)
    process.stderr.write(`    → ${v.resolved} — no such folder\n`)
  }
  process.stderr.write('\n  Tailwind does NOT report this; it just scans less and drops\n')
  process.stderr.write('  classes that only exist in the library. Recount the `..` levels from the folder\n')
  process.stderr.write('  holding the CSS file itself, not from the package root.\n')
  process.exit(1)
}

process.stdout.write(`@source gate: ${files.length} CSS files, ${declarations} declarations, all exist.\n`)
