/**
 * The template lines the preview pass measures, and the demo each one is previewed on (G4 of PR 2,
 * 14/10/2026). Every comparison goes through `previewLineOf`, so a line spelled `tracy/j6` (the Add
 * site card), `tracy-base/j6` (the release), `tracy-base/emdash` (quickstarts.json) or
 * `tracy-base/emdash-0.x` (the demo row) is one line: no published line is skipped on a slug.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { previewLineOf } from '../../packages/design/tracy-ds-slot/src/measurement.mjs'

/** Dotted versions compared: true when `a` is newer than `b`. */
export const newer = (/** @type {string} */ a, /** @type {string} */ b) => {
  const pa = a.split(/[.-]/).map(Number)
  const pb = b.split(/[.-]/).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0
  }
  return false
}

/**
 * Every line with a measurement file in the tree, at its newest measured version: the files the
 * preview pass writes its rows into.
 * @param {string} root the tch root
 * @returns {{ key: string, tag: string, platform: string, version: string, file: string }[]}
 */
export function measuredLines(root) {
  /** @type {Map<string, any>} */
  const best = new Map()
  const walk = (/** @type {string} */ dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      // dist/ is a build copy (the seeder copies contracts there): its file is never the source to write
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist') walk(p)
      else if (e.name === 'design-system-measurement.json') {
        const doc = JSON.parse(readFileSync(p, 'utf8'))
        const line = previewLineOf({ platform: doc.cms, tag: doc.tag })
        if (!line) throw new Error(`${relative(root, p)}: tag ${doc.tag} names no template line`)
        const had = best.get(line.key)
        if (!had || newer(doc.version, had.version))
          best.set(line.key, {
            key: line.key,
            tag: doc.tag,
            platform: doc.cms,
            version: doc.version,
            file: p
          })
      }
    }
  }
  walk(join(root, 'packages/cms'))
  return [...best.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Each demo row (/api/ops/demos: a published line) put in exactly one bucket: measured on its demo,
 * a measured line with no demo, or a demo whose line has no measurement file yet. Nothing is dropped.
 * @param {{ key: string, tag: string, platform: string, version: string }[]} lines
 * @param {{ tag: string, platform: string, version?: string, address?: string }[]} demos
 */
export function sortLines(lines, demos) {
  /** @type {Map<string, any>} */
  const demoOf = new Map()
  for (const d of demos) {
    const line = previewLineOf({ platform: d.platform, tag: d.tag })
    if (line && d.address && !demoOf.has(line.key)) demoOf.set(line.key, d)
  }
  const withDemo = []
  const noDemo = []
  for (const l of lines) {
    const d = demoOf.get(l.key)
    // the version the door previews is the published one: the contract fits it
    if (d) withDemo.push({ tag: l.tag, platform: l.platform, version: l.version, address: d.address })
    else noDemo.push({ tag: l.tag, platform: l.platform, version: l.version, reason: 'NO_DEMO' })
  }
  const measured = new Set(lines.map((l) => l.key))
  const noMeasurement = demos
    .filter((d) => {
      const line = previewLineOf({ platform: d.platform, tag: d.tag })
      return !line || !measured.has(line.key)
    })
    .map((d) => ({
      tag: d.tag,
      platform: d.platform,
      version: d.version ?? null,
      reason: 'NO_MEASUREMENT_FILE'
    }))
  return { withDemo, noDemo, noMeasurement }
}
