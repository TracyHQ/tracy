#!/usr/bin/env node
/**
 * Regression check for the batch 2 design system line: every dot-2 template's committed measurement
 * (contracts/<slug>/j6/<version>/design-system-measurement.json) is judged as /ops judges it
 * (judgeMeasurement + preview-system-issues.json) and must leave no rule failing; SCREEN-1 may warn
 * (a first screen that is all picture). Then the unit tests the line added for the probe-v10 detectors,
 * the Joomla module size bound and the lane port table run. Exit 0 only when both pass.
 * To commit as tests/regression/scripts/<case id>.mjs once the PR number exists.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CONTRACTS = join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const { judgeMeasurement } = await import(join(ROOT, 'packages/design/tracy-ds-slot/src/measurement.mjs'))
const systemIssues = JSON.parse(
  readFileSync(join(ROOT, 'packages/design/tracy-ds-slot/templates/preview-system-issues.json'), 'utf8')
)
const DOT_TWO = [
  ['tracy-apple', '1.3.1'],
  ['tracy-base', '1.0.5'],
  ['ja-spa', '1.0.7'],
  ['ja-sensei', '1.0.5'],
  ['ja-vogue', '1.0.7'],
  ['ja-morgan', '1.0.7'],
  ['ja-trip', '1.0.7'],
  ['ja-essence', '1.0.9'],
  ['ja-seven', '1.0.4'],
  ['ja-nova', '1.0.8'],
  ['ja-resume', '1.0.5'],
  ['ja-podcast', '1.0.6'],
  ['ja-vital', '1.0.6'],
  ['ja-voyara', '1.0.10'],
  ['ja-impact', '1.0.4'],
  ['ja-phio', '1.0.7'],
  ['ja-tour', '1.0.4'],
  ['ja-vega', '1.0.7']
]
const ALLOWED_WARN = new Set(['SCREEN-1'])
let bad = 0
for (const [slug, version] of DOT_TWO) {
  const file = join(CONTRACTS, slug, 'j6', version, 'design-system-measurement.json')
  if (!existsSync(file)) {
    console.log(`FAIL ${slug} ${version}: no measurement file`)
    bad += 1
    continue
  }
  const judged = judgeMeasurement(JSON.parse(readFileSync(file, 'utf8')), undefined, { systemIssues })
  const left = Object.entries(judged).filter(
    ([id, r]) =>
      !['pass', 'not-applicable'].includes(r.status) && !(r.status === 'warn' && ALLOWED_WARN.has(id))
  )
  if (left.length) bad += 1
  console.log(
    `${left.length ? 'FAIL' : 'PASS'} ${slug} ${version}${left.map(([id, r]) => ` ${id}:${r.status}`).join('')}`
  )
}
const TESTS = [
  'apps/tracy-web/test/preview-detectors-accent-leak.test.mjs',
  'apps/tracy-web/test/preview-parity.test.mjs',
  'apps/tracy-web/test/preview-detectors-empty-block-picture-under.test.mjs',
  'packages/design/tracy-ds-slot/test/compact-css.test.mjs',
  'packages/design/tracy-ds-slot/test/accent-leak-rule.test.mjs',
  'packages/design/tracy-ds-slot/test/lane-ports.test.mjs',
  'packages/design/tracy-ds-slot/test/lane-contract.test.mjs'
]
const t = spawnSync(process.execPath, ['--test', ...TESTS], { cwd: ROOT, stdio: 'inherit' })
console.log(`${t.status === 0 ? 'PASS' : 'FAIL'} unit tests (${TESTS.length} files)`)
process.exit(bad || t.status !== 0 ? 1 : 0)
