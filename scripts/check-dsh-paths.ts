/**
 * dsh path gate: a plugin's client must not call dsh's host half by an ABSOLUTE path.
 *
 * WHY A MACHINE, NOT A READER. Since 04/09 dsh can be served under a prefix
 * (`cowork.tracy.ai/<siteKey>/…`): the served page carries `<base href="/<siteKey>/">`, and an absolute
 * `fetch('/api/tracy-add-site/start')` bypasses that tag and hits the host root — where the Worker sits,
 * and the Worker does not know `/api/tracy-add-site`. That failure **works fine locally** (dsh at the root)
 * and only turns red on a prefixed lane, as a Worker 404 rather than a dsh error. Neither author nor
 * reviewer sees it: the line reads exactly like the `fetch('/api/sites')` lines next to it, and those ARE
 * right — the Worker is the host root, so the Worker's doors must be absolute.
 *
 * So the boundary is the PATH NAME, not the statement shape: dsh paths (`/api/tracy-*`, `/plugins/`,
 * `/sidebar/`, `/gateway/`) go through `dshUrl()`; Worker paths stay as they are.
 *
 * SCOPE: `src/client/**` of every package in `packages/` (code running in the dsh page), `.ts/.tsx/.js/.mjs`
 * files, comment lines skipped. `vendor/` stays out (RULE #5) — the two vendor packages Tracy edits have
 * their own tests for this.
 *
 * How it matches: a string literal starting with `'/api/tracy-`, `'/plugins/`, `'/sidebar/`, `'/gateway/`
 * (all three quote kinds). A path wrapped as `dshUrl('/api/tracy-…')` is still that literal, so the gate
 * looks at context: a literal right after `dshUrl(` counts as correct. That is the whole exception.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_ROOT = join(ROOT, 'packages')
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', '.turbo'])
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs'])

/** dsh paths: the prefixes dsh's host half (or its plugins) serve. */
const DSH_PATH = /(['"`])\/(?:api\/tracy-|plugins\/|sidebar\/|gateway\/)/g
/** The same literal, already passed through the helper — the right way to write it. */
const WRAPPED = /dshUrl\(\s*$/

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(full.slice(full.lastIndexOf('.'))) && /\/src\/client\//.test(full)) out.push(full)
  }
}

const files: string[] = []
walk(SCAN_ROOT, files)

const hits: string[] = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    if (/^\s*(\*|\/\*)/.test(line)) return
    for (const m of code.matchAll(DSH_PATH)) {
      const before = code.slice(0, m.index)
      if (WRAPPED.test(before)) continue
      hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
    }
  })
}

if (hits.length > 0) {
  console.error(
    `check-dsh-paths: ${hits.length} absolute dsh path(s) in plugin client code — wrap them in dshUrl():`
  )
  for (const h of hits) console.error(`  ${h}`)
  process.exit(1)
}
console.log(`check-dsh-paths: ${files.length} client files, no absolute dsh paths.`)
