#!/usr/bin/env node
/**
 * Regression check for the design system dot-3 "group A + step 3" line (PR 1492): the committed probe-v10
 * measurements of the nine releases it ships are judged as /ops judges them (judgeMeasurement +
 * preview-system-issues.json) and must leave no rule failing; SCREEN-1 may warn (a first screen that is
 * all picture). PREVIEW-PARITY is judged on Joomla only, as /ops does. Then the unit tests the line
 * touched run: the MODE-3 dormant dark stylesheet, the design-system door pins, the slot emitter
 * (cms.test.mjs) and the wp-ja-kinetic theme. Exit 0 only when both pass.
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
  'packages/cms/tracy-joomla-quickstart/contracts/ja-resort/j6/1.0.7',
  'packages/cms/tracy-joomla-quickstart/contracts/ja-kinetic/j6/1.0.9',
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.6',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.19',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-impact/wp7/1.0.10',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-nova/wp7/1.1.13',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-vega/wp7/1.1.16',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-kinetic/wp7/1.0.11',
  'packages/cms/tracy-emdash-theme-business/contracts/1.7.23'
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
  'apps/tracy-web/test/template-design-system-readiness-mode-3.test.mjs',
  'apps/tracy-web/test/design-system-door.test.mjs',
  'packages/design/tracy-ds-slot/test/cms.test.mjs',
  'packages/cms/tracy-wordpress-theme/test/wp-ja-kinetic.test.mjs'
]
const t = spawnSync(process.execPath, ['--test', ...TESTS], { cwd: ROOT, stdio: 'inherit' })
console.log(`${t.status === 0 ? 'PASS' : 'FAIL'} unit tests (${TESTS.length} files)`)
process.exit(bad || t.status !== 0 ? 1 : 0)
