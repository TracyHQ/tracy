#!/usr/bin/env node
// Apply our base changes to the published Tracy Business WordPress 1.2.0 (`tracy-business/wp7`),
// restored on a local stand by restore-release.mjs. Two halves, both re-runnable — a second run
// changes nothing:
//
//   theme     the stand's `wp-content/themes/wp-tracy-business/` becomes the theme this branch
//             builds (packages/cms/tracy-wordpress-theme/src/wp-tracy-business), replaced whole
//             the way a theme update replaces it. The release's webroot carries the theme, and
//             the contract profile's presentation lock pins its files.
//   database  apply-base-changes.php, run inside WordPress: the Contact card, form 25, the
//             Russian Contact page on form 25 without form 303, the Sitemap page and the
//             `footer-legal` menu in every language, the database footer part, the dark-mode
//             label of the database header part, and each home page's news band as the theme's
//             Query Loop of the latest posts instead of three typed cards, and the demo company
//             outside the contract as identity tokens (step 9).
//
// Usage: node apply-base-changes.mjs --stand <dir> [--project tracy-business-wp7-stand] [--keep-theme]
// --keep-theme leaves the webroot's theme as it is: a content-only cut (1.3.1 on 1.3.0) keeps the
// released theme, so the presentation lock of the version before it still describes the files.
// Then pack-and-verify.mjs packs the stand and checks the pack on a clean one.
import { cpSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { standEnv, wp } from './stand.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const THEME = path.resolve(HERE, '../../tracy-wordpress-theme/src/wp-tracy-business')

const { values: o } = parseArgs({
  options: {
    stand: { type: 'string' },
    project: { type: 'string', default: 'tracy-business-wp7-stand' },
    port: { type: 'string', default: '8291' },
    'keep-theme': { type: 'boolean', default: false }
  }
})
if (!o.stand) throw new Error('--stand <dir> is required (the folder restore-release.mjs filled)')
const env = standEnv({ stand: o.stand, port: o.port })

// Relative path → bytes of every file under `dir`, for "is the stand's copy already this one".
function tree(dir) {
  const files = new Map()
  const walk = (at) => {
    for (const name of readdirSync(at)) {
      const full = path.join(at, name)
      if (statSync(full).isDirectory()) walk(full)
      else files.set(path.relative(dir, full), readFileSync(full))
    }
  }
  walk(dir)
  return files
}
function sameTree(a, b) {
  if (a.size !== b.size) return false
  for (const [name, bytes] of a) if (!b.get(name)?.equals(bytes)) return false
  return true
}

const target = path.join(path.resolve(o.stand), 'webroot/wp-content/themes/wp-tracy-business')
const themeChanged = !o['keep-theme'] && !sameTree(tree(THEME), tree(target))
if (themeChanged) {
  rmSync(target, { recursive: true, force: true })
  cpSync(THEME, target, { recursive: true })
}

const report = JSON.parse(
  wp(o.project, env, ['eval-file', '-'], {
    input: readFileSync(path.join(HERE, 'apply-base-changes.php'), 'utf8')
  })
)
if (themeChanged) report.changed.unshift('theme wp-tracy-business')
else report.unchanged.unshift(o['keep-theme'] ? 'theme wp-tracy-business (kept)' : 'theme wp-tracy-business')
for (const what of report.changed) console.log(`changed    ${what}`)
console.log(`${report.changed.length} changed, ${report.unchanged.length} already as wanted`)
