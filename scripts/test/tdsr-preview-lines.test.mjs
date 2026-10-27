/**
 * G4 of PR 2 (14/10/2026): no published line is skipped by the preview pass on a slug. Tracy Base is
 * the Add site card `tracy` on Joomla and WordPress and `tracy-base` on EmDash, its releases are all
 * tagged `tracy-base/...`, quickstarts.json pins EmDash as `tracy-base/emdash` and the demo rows say
 * `tracy-base/emdash-0.x`. Every spelling must land on one line, and every published line on exactly
 * one source of measured preview rows.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import {
  CARD_ALIASES,
  measurementLineDir,
  previewLineOf
} from '../../packages/design/tracy-ds-slot/src/measurement.mjs'
import {
  CARD_ALIASES as READER_ALIASES,
  treeMeasurementFiles
} from '../../apps/tracy-web/src/lib/template-design-system-readiness/readers/measurement.js'
import { measuredLines, sortLines } from '../tdsr/preview-lines.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const pins = JSON.parse(readFileSync(join(ROOT, 'apps/tracy-web/src/quickstarts.json'), 'utf8'))
const published = Object.entries(pins).map(([tag, p]) => ({ tag, platform: p.platform, version: p.version }))
const measured = measuredLines(ROOT)

test('every published line in quickstarts.json maps to exactly one measured preview row source', () => {
  assert.ok(published.length > 0)
  for (const p of published) {
    const line = previewLineOf(p)
    assert.ok(line, `${p.tag}: names no template line`)
    // the rows of this line go to one folder of the tree, and only one line of the tree claims it
    const dir = measurementLineDir(line)
    assert.ok(existsSync(join(ROOT, dir)), `${p.tag}: no contract folder ${dir}`)
    const claims = measured.filter((m) => m.key === line.key)
    assert.ok(claims.length <= 1, `${p.tag}: ${claims.length} measured lines`)
    for (const m of claims) assert.ok(m.file.startsWith(join(ROOT, dir)), `${p.tag}: rows in ${m.file}`)
  }
  // and no published line falls out of the pass: measured on its demo, or listed as not measured
  const demos = published.map((p) => ({ ...p, address: `https://${p.tag.replace(/\//g, '-')}.example/` }))
  const { withDemo, noMeasurement } = sortLines(measured, demos)
  for (const p of published) {
    const key = previewLineOf(p)?.key
    const inMeasured = withDemo.filter((w) => previewLineOf(w)?.key === key).length
    const inMissing = noMeasurement.filter((n) => n.tag === p.tag).length
    assert.equal(inMeasured + inMissing, 1, `${p.tag}: in ${inMeasured + inMissing} buckets`)
  }
})

test('Tracy Base: both Add site slugs and every tag spelling are one line per CMS', () => {
  const lines = [
    ['joomla', ['tracy/j6', 'tracy-base/j6', 'local/tracy-base/j6']],
    ['wordpress', ['tracy/wp7', 'tracy-base/wp7']],
    ['emdash', ['tracy-base/emdash', 'tracy-base/emdash-0.x', 'local/tracy-base/emdash-0.x']]
  ]
  for (const [platform, tags] of lines) {
    const keys = new Set(tags.map((tag) => previewLineOf({ platform, tag })?.key))
    assert.equal(keys.size, 1, `${platform}: ${[...keys].join(' | ')}`)
    const [key] = keys
    assert.equal(
      measured.filter((m) => m.key === key).length,
      1,
      `${platform}: Tracy Base has a measurement file`
    )
  }
  // a demo row filed under the card id still reaches the measured line
  const tracyJ6 = measured.find((m) => m.key === 'joomla tracy-base/j6')
  const { withDemo } = sortLines(
    [tracyJ6],
    [{ tag: 'tracy/j6', platform: 'joomla', address: 'https://x.example/' }]
  )
  assert.equal(withDemo.length, 1)
})

test('/ops reads the measurement of Tracy Base under either slug', () => {
  assert.deepEqual(READER_ALIASES, CARD_ALIASES)
  const j6 = measured.find((m) => m.key === 'joomla tracy-base/j6')
  const wp = measured.find((m) => m.key === 'wordpress tracy-base/wp7')
  const em = measured.find((m) => m.key === 'emdash tracy-base/emdash')
  for (const [tag, line] of [
    ['tracy/j6', j6],
    ['tracy-base/j6', j6],
    ['tracy/wp7', wp],
    ['tracy-base/wp7', wp],
    ['tracy-base/emdash-0.x', em]
  ]) {
    const files = treeMeasurementFiles({ tag, version: line.version })
    assert.ok(files.includes(line.file), `${tag}@${line.version}: ${files.join(', ') || 'no file'}`)
  }
})
