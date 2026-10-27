/**
 * REG-PR-1337-tdsr-contracts-round-4b: round 4b of #1317. JA Impact, Directory, Prodex and Seven pass every built-site
 * rule from the measurement file of their published version, JA Sensei passes ROLE-1 (its SCREEN-1 is the template's
 * hero photo), and Tracy Business EmDash 1.7.18 carries its re-measured file: every rule passes but UNDO-1 (the theme
 * keeps a worn dark side in the visitor's browser), so the file says what a visitor sees, not a stale pass.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  judgeMeasurement,
  validateMeasurement
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { checks, ROOT } from './lib.mjs'

const c = checks()
const read = (p) => {
  const file = join(ROOT, p, 'design-system-measurement.json')
  c.check(`${p} has a measurement file`, existsSync(file), file)
  if (!existsSync(file)) return null
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  c.eq(`${p} file is valid`, validateMeasurement(doc).join('; '), '')
  return doc
}
const J6 = 'packages/cms/tracy-joomla-quickstart/contracts'
const failing = (doc) =>
  Object.entries(judgeMeasurement(doc))
    .filter(([, v]) => v.status === 'fail')
    .map(([k]) => k)

// S1: four rows pass every built-site rule, Sensei passes ROLE-1
for (const [slug, version] of [
  ['ja-impact', '1.0.2'],
  ['ja-directory', '1.0.2'],
  ['ja-prodex', '1.0.2'],
  ['ja-seven', '1.0.2']
]) {
  const doc = read(`${J6}/${slug}/j6/${version}`)
  if (doc) c.eq(`S1: ${slug} ${version} fails no rule`, failing(doc).join(','), '')
}
const sensei = read(`${J6}/ja-sensei/j6/1.0.3`)
if (sensei) {
  c.eq('S1: ja-sensei 1.0.3 ROLE-1', judgeMeasurement(sensei)['ROLE-1'].status, 'pass')
  c.eq('S1: ja-sensei 1.0.3 fails only SCREEN-1', failing(sensei).join(','), 'SCREEN-1')
}

// S2: Tracy Business EmDash 1.7.18 re-measured with both modes, UNDO-1 its one failure
const em = read('packages/cms/tracy-emdash-theme-business/contracts/1.7.18')
if (em) {
  c.check(
    'S2: measured on 14/10 or later',
    Date.parse(em.measuredAt) >= Date.parse('2026-10-14T00:00:00Z'),
    em.measuredAt
  )
  c.check(
    'S2: both modes measured',
    ['native', 'derived'].every((m) => em.modes.includes(m)),
    em.modes
  )
  c.eq('S2: UNDO-1 is the one failure', failing(em).join(','), 'UNDO-1')
}

c.done()
