#!/usr/bin/env node
/**
 * The design system issues of the preview (PR 2, 14/10/2026): from the newest measurement file of every
 * published line, the detector kinds a system causes on most templates (`systemIssuesOf` in
 * `tracy-ds-slot/src/measurement.mjs`), written to `packages/design/tracy-ds-slot/templates/preview-system-issues.json`.
 * /ops shows each once as the system's issue and no template's readiness counts it.
 *
 *   node scripts/tdsr/preview-system-issues.mjs [--share 0.6] [--min 10]
 *
 * `preview-measure-all.mjs` runs it at the end of a pass; run it again after copying rows measured on
 * another machine into the tree.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { systemIssuesOf } from '../../packages/design/tracy-ds-slot/src/measurement.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
export const SYSTEM_ISSUES_FILE = join(
  ROOT,
  'packages/design/tracy-ds-slot/templates/preview-system-issues.json'
)

/** Semver-ish: a newer than b. */
const newer = (/** @type {string} */ a, /** @type {string} */ b) => {
  const pa = a.split(/[.-]/).map(Number)
  const pb = b.split(/[.-]/).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0
  }
  return false
}

/** The newest measurement file of each line in the tree. */
export function newestMeasurements(root = ROOT) {
  /** @type {Map<string, any>} */
  const best = new Map()
  const walk = (/** @type {string} */ dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      // dist/ is build output (a copy of the contracts for the seeder image): only the tracked tree counts
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist') walk(p)
      else if (e.name === 'design-system-measurement.json') {
        const doc = JSON.parse(readFileSync(p, 'utf8'))
        const key = `${doc.cms} ${doc.tag}`
        const had = best.get(key)
        if (!had || newer(doc.version, had.version)) best.set(key, doc)
      }
    }
  }
  walk(join(root, 'packages/cms'))
  return [...best.values()]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const opt = (/** @type {string} */ n, /** @type {number} */ d) => {
    const i = args.indexOf(n)
    return i === -1 ? d : Number(args[i + 1])
  }
  const docs = newestMeasurements()
  const out = systemIssuesOf(docs, { share: opt('--share', 0.6), min: opt('--min', 10) })
  writeFileSync(SYSTEM_ISSUES_FILE, `${JSON.stringify({ lines: docs.length, ...out }, null, 2)}\n`)
  for (const [system, kinds] of Object.entries(out.systems))
    for (const [kind, k] of Object.entries(kinds)) console.log(`${system} ${kind}: ${k.lines}/${k.of} lines`)
  console.log(`written: ${SYSTEM_ISSUES_FILE}`)
}
