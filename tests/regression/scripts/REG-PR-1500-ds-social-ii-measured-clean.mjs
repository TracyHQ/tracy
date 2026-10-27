#!/usr/bin/env node
/**
 * Regression check for JA Social II Joomla 1.0.5 (PR 1500): the committed probe-v10
 * measurement of the release is judged as /ops judges it (judgeMeasurement + preview-system-issues.json)
 * and must leave no rule failing; SCREEN-1 may warn. PREVIEW-PARITY is judged, as on every Joomla release.
 * Then the slot emitter test and the scripted-opacity detector fixture the re-measure relied on run.
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
const RELEASES = ['packages/cms/tracy-joomla-quickstart/contracts/ja-social-ii/j6/1.0.5']
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
  'apps/tracy-web/test/preview-detectors-missing-scripted.test.mjs'
]
const t = spawnSync(process.execPath, ['--test', ...TESTS], { cwd: ROOT, stdio: 'inherit' })
console.log(`${t.status === 0 ? 'PASS' : 'FAIL'} unit tests (${TESTS.length} files)`)
process.exit(bad || t.status !== 0 ? 1 : 0)
