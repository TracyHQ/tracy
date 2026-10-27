#!/usr/bin/env node
/**
 * Regression check for the design system dot-3a line (PR 1468): the committed probe-v10 measurements of
 * JA Resort Joomla 1.0.4 and JA Essence / Impact / Nova / Vega WordPress are judged as /ops judges them
 * (judgeMeasurement + preview-system-issues.json) and must leave no rule failing; SCREEN-1 may warn
 * (a first screen that is all picture). PREVIEW-PARITY is judged on Joomla only, as /ops does
 * (apps/tracy-web/src/lib/template-design-system-readiness/rules/built-site.js, platforms: ['joomla']). Then the unit tests the line added run: the four probe-10
 * detector false-finding fixes, the WordPress child-page address, and the worn-sheet equivalence.
 * Exit 0 only when both pass.
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
  'packages/cms/tracy-joomla-quickstart/contracts/ja-resort/j6/1.0.4',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.18',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-impact/wp7/1.0.9',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-nova/wp7/1.1.12',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-vega/wp7/1.1.15'
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
      !(id === PARITY_RULE && dir.includes('/tracy-wordpress-quickstart/'))
  )
  if (left.length) bad += 1
  console.log(
    `${left.length ? 'FAIL' : 'PASS'} ${dir}${left.map(([id, r]) => ` ${id}:${r.status}`).join('')}`
  )
}
const TESTS = [
  'apps/tracy-web/test/preview-detectors-button-dark-white-variant.test.mjs',
  'apps/tracy-web/test/preview-detectors-button-wrapper.test.mjs',
  'apps/tracy-web/test/preview-detectors-photo-text-same-colour.test.mjs',
  'apps/tracy-web/test/preview-probe-empty-in-template.test.mjs',
  'apps/tracy-web/test/preview-pages.test.mjs',
  'packages/design/tracy-ds-slot/test/wordpress-worn-sheet.test.mjs',
  'packages/design/tracy-ds-slot/test/side-merge.test.mjs'
]
const t = spawnSync(process.execPath, ['--test', ...TESTS], { cwd: ROOT, stdio: 'inherit' })
console.log(`${t.status === 0 ? 'PASS' : 'FAIL'} unit tests (${TESTS.length} files)`)
process.exit(bad || t.status !== 0 ? 1 : 0)
