#!/usr/bin/env node
/**
 * Writes `src/font-widths.json`: how wide each face sets a line of words, as the average advance of its
 * lowercase Latin letters in em at each upright weight (capsize's `xWidthAvg` of the `latin` subset ÷
 * `unitsPerEm`). A size says how tall a line is, not how wide: Eddie's Inter 600 sets 0.487em a letter where
 * Tracy Business's Newsreader 400 sets 0.428em, so the same words at the same size run 14% longer (14/10/2026).
 *
 * The source is the npm package @capsizecss/metrics (MIT), read as text from an unpacked copy: nothing of it
 * is run or shipped, only the reduced table.
 *
 *   npm pack @capsizecss/metrics && tar -xzf capsizecss-metrics-*.tgz
 *   node scripts/font-widths.mjs <unpacked>/package
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PKG = process.argv[2]
if (!PKG || !existsSync(join(PKG, 'entireMetricsCollection'))) {
  console.error('usage: node scripts/font-widths.mjs <unpacked @capsizecss/metrics package dir>')
  process.exit(2)
}
const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version
const ROOT = join(PKG, 'entireMetricsCollection')

/** familyName and the Latin average advance in em from one metrics module, read as text. */
function read(file) {
  const s = readFileSync(file, 'utf8')
  const family = /familyName:\s*'([^']+)'/.exec(s)?.[1]
  const upm = Number(/unitsPerEm:\s*(\d+)/.exec(s)?.[1])
  // the latin subset's own figure when there is one, else the face's
  const latin = /latin:\s*\{\s*xWidthAvg:\s*(\d+)/.exec(s)?.[1] ?? /xWidthAvg:\s*(\d+)/.exec(s)?.[1]
  return family && upm > 0 && latin ? { family, em: Math.round((Number(latin) / upm) * 1000) / 1000 } : null
}

const fonts = {}
for (const dir of readdirSync(ROOT).sort()) {
  const at = {}
  let family = null
  for (const style of readdirSync(join(ROOT, dir))) {
    const weight = style === 'regular' ? 400 : /^\d{3}$/.test(style) ? Number(style) : null
    const file = join(ROOT, dir, style, 'index.mjs')
    if (!weight || !existsSync(file)) continue
    const m = read(file)
    if (!m) continue
    family = m.family
    at[weight] = m.em
  }
  if (family && Object.keys(at).length) fonts[family] = at
}

const doc = {
  _meta: {
    source: `@capsizecss/metrics ${version} (MIT), entireMetricsCollection`,
    generated: new Date().toISOString().slice(0, 10),
    families: Object.keys(fonts).length,
    note: 'family → { upright weight: average advance of a lowercase Latin letter in em } (xWidthAvg of the latin subset ÷ unitsPerEm). Written by scripts/font-widths.mjs; read by fonts.mjs advanceOf'
  },
  fonts
}
const out = new URL('../src/font-widths.json', import.meta.url)
writeFileSync(out, `${JSON.stringify(doc)}\n`)
console.log(`${doc._meta.families} families → ${out.pathname}`)
