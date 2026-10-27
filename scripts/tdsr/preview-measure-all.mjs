#!/usr/bin/env node
/**
 * Measure the Add site preview of EVERY published template line (PR 2 of 14/10/2026), so /ops judges
 * each one instead of "preview not measured". A measured line is the newest version that has a
 * measurement file in the tree (`measurementPath`); its demo address comes from /api/ops/demos. Lines
 * and demos meet through `previewLineOf` (preview-lines.mjs), so Tracy Base's two slugs (`tracy` on
 * Joomla and WordPress, `tracy-base` on EmDash) and the EmDash `emdash` / `emdash-0.x` spellings are
 * one line each, and a demo whose line has no measurement file is listed, never dropped.
 *
 *   node scripts/tdsr/preview-measure-all.mjs --demos <demos.json> --out <dir>
 *        [--systems <id,…>] [--schemes light,dark] [--only <slug,…>] [--pages all|home] [--port <n>] [--dry]
 *
 * --pages: every page each template declares (`all`, the default: a release measurement) or the
 * home page alone (`home`, a quick look; the other declared pages then stay unmeasured on /ops).
 *
 * For each visitor scheme it runs `apps/tracy-web/scripts/preview-check.mjs --write` over all lines,
 * one demo at a time (the fleet01 demos are light-capacity: never in parallel), and prints the lines
 * that have no demo: those cannot be previewed and stay unmeasured on /ops.
 * Writes <out>/lines.json (what was measured), <out>/no-demo.json, <out>/no-measurement.json,
 * <out>/<scheme>/… (preview-check).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { measuredLines, sortLines } from './preview-lines.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const opt = (/** @type {string} */ n, /** @type {string | null} */ d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args[i + 1]
}
const DEMOS = opt('--demos')
const OUT = resolve(opt('--out', 'preview-measure-all') ?? 'preview-measure-all')
// Moxie (dark) and Stripe (light): one system of each side at least
const SYSTEMS = opt('--systems', 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0,stripe') ?? ''
const SCHEMES = (opt('--schemes', 'light,dark') ?? '').split(',').filter(Boolean)
const ONLY = (opt('--only') ?? '').split(',').filter(Boolean)
const DRY = args.includes('--dry')
const PAGES = opt('--pages', 'all') ?? 'all'
// another measuring run on the same machine holds 9611: pick another port
const PORT = opt('--port', '9611') ?? '9611'
if (!DEMOS) {
  console.error('usage: preview-measure-all.mjs --demos <demos.json> --out <dir> [--systems …] [--schemes …]')
  process.exit(2)
}

const slugOf = (/** @type {string} */ t) => t.replace(/^quickstart\//, '').replace(/\//g, '-')
const demos = JSON.parse(readFileSync(DEMOS, 'utf8'))
const lines = measuredLines(ROOT).filter((l) => !ONLY.length || ONLY.includes(slugOf(l.tag)))
const { withDemo, noDemo, noMeasurement } = sortLines(
  lines,
  demos.filter((/** @type {any} */ d) => !ONLY.length || ONLY.includes(slugOf(d.tag)))
)
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'lines.json'), `${JSON.stringify(withDemo, null, 1)}\n`)
writeFileSync(join(OUT, 'no-demo.json'), `${JSON.stringify(noDemo, null, 1)}\n`)
writeFileSync(join(OUT, 'no-measurement.json'), `${JSON.stringify(noMeasurement, null, 1)}\n`)
console.log(`${lines.length} measured lines: ${withDemo.length} with a demo, ${noDemo.length} without`)
for (const l of noDemo) console.log(`  no demo: ${l.tag} ${l.version}`)
// a published demo whose line has no measurement file: its rows have nowhere to go, say so
for (const d of noMeasurement)
  console.log(`  no measurement file (not measured): ${d.tag} ${d.version ?? ''}`)
if (DRY) process.exit(0)

for (const scheme of SCHEMES) {
  console.log(`\n== visitor scheme ${scheme} ==`)
  const dir = join(OUT, scheme)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  execFileSync(
    process.execPath,
    [
      join(ROOT, 'apps/tracy-web/scripts/preview-check.mjs'),
      '--demos',
      join(OUT, 'lines.json'),
      '--out',
      dir,
      '--systems',
      SYSTEMS,
      '--scheme',
      scheme,
      '--port',
      PORT,
      '--pages',
      PAGES,
      '--write'
    ],
    { stdio: 'inherit', cwd: ROOT }
  )
}

// the measurement files in the repo's own format (biome), so the lint gate takes them as written
try {
  const changed = execFileSync('git', ['diff', '--name-only', '--', 'packages/cms'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
    .split('\n')
    .filter((f) => f.endsWith('design-system-measurement.json'))
  if (changed.length)
    execFileSync(join(ROOT, 'node_modules/.bin/biome'), ['format', '--write', ...changed], {
      cwd: ROOT,
      stdio: 'ignore'
    })
} catch {
  console.log('could not format the measurement files: run pnpm exec biome format --write on them')
}

// the kinds a system causes on most templates, from every line's file now in the tree
execFileSync(process.execPath, [join(ROOT, 'scripts/tdsr/preview-system-issues.mjs')], {
  stdio: 'inherit',
  cwd: ROOT
})
