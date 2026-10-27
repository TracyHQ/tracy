#!/usr/bin/env node
/**
 * The rows of a sweep summary (`results.jsonl`, one line per template × CMS) as tdsr-measurement/v1
 * files in the contract folder of each published version, so /ops shows "Measured on" for every
 * published line without waiting for anyone to fix a template (spec, T7 / #1316).
 *
 *   node scripts/sweep-to-measurement.mjs packages/design/tracy-ds-slot/test/fixtures/ds-sweep-2026-10-13-moxie \
 *     --measured-at 2026-10-13T13:16:25Z --machine imac --flow-version ccd9b52d4 [--skip tracy-business/emdash-0.x]
 *
 * A row whose version folder already holds a newer file (a real run) is left alone unless --force.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeMeasurement } from '../src/measurement-io.mjs'
import { fromSweepRow, measurementPath, validateMeasurement } from '../src/measurement.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const args = process.argv.slice(2)
const opt = (n, d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args[i + 1]
}
const dir = args.find((a) => !a.startsWith('--') && !args.includes(`--${a}`))
if (!dir) {
  console.error(
    'usage: sweep-to-measurement.mjs <evidence dir> --measured-at <iso> --machine <name> [--flow-version <sha>] [--skip <tag>,…] [--force]'
  )
  process.exit(1)
}
const evidence = resolve(ROOT, dir)
const rows = readFileSync(join(evidence, 'results.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
const measuredAt = opt('--measured-at') ?? new Date().toISOString()
const machine = opt('--machine') ?? 'unknown'
const flowVersion = opt('--flow-version')
const skip = new Set((opt('--skip') ?? '').split(',').filter(Boolean))
const force = args.includes('--force')
const evidenceRel = evidence.startsWith(`${ROOT}/`) ? evidence.slice(ROOT.length + 1) : null
let written = 0
for (const row of rows) {
  if (skip.has(row.tag)) {
    console.log(`skip ${row.tag} ${row.version}`)
    continue
  }
  const measuredBy = `tdsr ${row.cms === 'emdash' ? 'flow.mjs --cms emdash' : `pass-${row.cms}.mjs --no-tokenize --bands`} (sweep ${evidence.split('/').pop()})`
  const doc = fromSweepRow(row, { measuredAt, machine, measuredBy, flowVersion, evidence: evidenceRel })
  const why = validateMeasurement(doc)
  if (why.length) {
    console.error(`${row.tag} ${row.version}: ${why.join('; ')}`)
    process.exitCode = 1
    continue
  }
  const file = join(ROOT, measurementPath(doc))
  if (existsSync(file) && !force) {
    const have = JSON.parse(readFileSync(file, 'utf8'))
    if (Date.parse(have.measuredAt) >= Date.parse(measuredAt)) {
      console.log(`keep ${row.tag} ${row.version}: a newer file (${have.measuredAt}, ${have.machine})`)
      continue
    }
  }
  writeMeasurement(doc, { root: ROOT })
  written += 1
  console.log(`wrote ${measurementPath(doc)}`)
}
console.log(`${written} file(s) written from ${rows.length} row(s)`)
