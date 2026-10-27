#!/usr/bin/env node
/**
 * Regression check for the design system dot-3 "group B" line (PR 1499): the committed probe-v10
 * measurements of the eight releases it ships are judged as /ops judges them (judgeMeasurement +
 * preview-system-issues.json) and must leave no rule failing; SCREEN-1 may warn (a first screen that is
 * all picture). PREVIEW-PARITY is judged on Joomla only, as /ops does. Then the unit tests the line
 * touched run: the slot emitter (cms.test.mjs), the wordmark identity, the detector false-positive
 * fixtures kept at v10, the PARITY slot carrier and map widget, the MODE-3 readiness rule, the
 * design-system door and the wp-ja-morgan theme. Exit 0 only when both pass.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { judgeMeasurement, PARITY_RULE } = await import(
  join(ROOT, 'packages/design/tracy-ds-slot/src/measurement.mjs')
)
const systemIssues = JSON.parse(
  readFileSync(join(ROOT, 'packages/design/tracy-ds-slot/templates/preview-system-issues.json'), 'utf8')
)
const RELEASES = [
  'packages/cms/tracy-joomla-quickstart/contracts/ja-prodex/j6/1.0.4',
  'packages/cms/tracy-joomla-quickstart/contracts/ja-smallbiz/j6/1.0.4',
  'packages/cms/tracy-joomla-quickstart/contracts/ja-rent/j6/1.0.5',
  'packages/cms/tracy-joomla-quickstart/contracts/ja-mood/j6/1.0.4',
  'packages/cms/tracy-joomla-quickstart/contracts/ja-symphony/j6/1.0.4',
  'packages/cms/tracy-joomla-quickstart/contracts/ja-donate/j6/1.0.7',
  'packages/cms/tracy-joomla-quickstart/contracts/ja-space/j6/1.0.6',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-morgan/wp7/1.1.16'
]
const ALLOWED_WARN = new Set(['SCREEN-1'])
let bad = 0
for (const dir of RELEASES) {
  const file = join(ROOT, dir, 'design-system-measurement.json')
  if (!existsSync(file)) {
    console.log(`FAIL ${dir}: no measurement file`)
    bad += 1
    continue
  }
  const judged = judgeMeasurement(JSON.parse(readFileSync(file, 'utf8')), undefined, { systemIssues })
  const left = Object.entries(judged).filter(
    ([id, r]) =>
      !['pass', 'not-applicable'].includes(r.status) &&
      !(r.status === 'warn' && ALLOWED_WARN.has(id)) &&
      !(id === PARITY_RULE && !dir.includes('/tracy-joomla-quickstart/'))
  )
  if (left.length) bad += 1
  console.log(
    `${left.length ? 'FAIL' : 'PASS'} ${dir}${left.map(([id, r]) => ` ${id}:${r.status}`).join('')}`
  )
}
const TESTS = [
  'packages/design/tracy-ds-slot/test/cms.test.mjs',
  'packages/design/tracy-ds-slot/test/identity.test.mjs',
  'packages/design/tracy-ds-slot/test/release-content-edits.test.mjs',
  'apps/tracy-web/test/preview-detectors-button-size-wrapped-link.test.mjs',
  'apps/tracy-web/test/preview-detectors-carousel-edge.test.mjs',
  'apps/tracy-web/test/preview-detectors-empty-block-scrim.test.mjs',
  'apps/tracy-web/test/preview-detectors-heading-edge.test.mjs',
  'apps/tracy-web/test/preview-detectors-missing-scripted.test.mjs',
  'apps/tracy-web/test/preview-detectors-reveal-carousel-identity.test.mjs',
  'apps/tracy-web/test/preview-parity-slot-carrier.test.mjs',
  'apps/tracy-web/test/preview-parity-third-party-map.test.mjs',
  'apps/tracy-web/test/preview-probe-unseen-text.test.mjs',
  'apps/tracy-web/test/template-design-system-readiness-mode-3.test.mjs',
  'apps/tracy-web/test/design-system-door.test.mjs',
  'packages/cms/tracy-wordpress-theme/test/wp-ja-morgan.test.mjs'
]
const t = spawnSync(process.execPath, ['--test', ...TESTS], { cwd: ROOT, stdio: 'inherit' })
console.log(`${t.status === 0 ? 'PASS' : 'FAIL'} unit tests (${TESTS.length} files)`)
process.exit(bad || t.status !== 0 ? 1 : 0)
