/**
 * REG-PR-1336-tdsr-contracts-round-4: the ten Joomla rows whose slot contracts round 4 of #1317 fixed pass ROLE-1 in
 * the measurement file of their published version, with UNDO-1 still at zero differences, and the Tracy Base
 * measurement files sit only in the folder /ops reads (contracts/tracy-base/, never contracts/tracy/). S1 scores each
 * file with the rules /ops runs (judgeMeasurement); S2 checks the folders.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  judgeMeasurement,
  validateMeasurement
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { checks, ROOT } from './lib.mjs'

const c = checks()
const J6 = 'packages/cms/tracy-joomla-quickstart/contracts'
const rows = [
  ['ja-donate', '1.0.5'],
  ['ja-spa', '1.0.5'],
  ['ja-social-ii', '1.0.3'],
  ['ja-mood', '1.0.2'],
  ['ja-essence', '1.0.7'],
  ['ja-vega', '1.0.5'],
  ['ja-vogue', '1.0.5'],
  ['ja-resume', '1.0.3'],
  ['ja-symphony', '1.0.2'],
  ['ja-resort', '1.0.4']
]

// S1: every fixed row passes ROLE-1 and its controls show nothing of a system
for (const [slug, version] of rows) {
  const file = join(ROOT, J6, slug, 'j6', version, 'design-system-measurement.json')
  c.check(`S1: ${slug} ${version} has a measurement file`, existsSync(file), file)
  if (!existsSync(file)) continue
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  c.eq(`S1: ${slug} ${version} file is valid`, validateMeasurement(doc).join('; '), '')
  c.eq(`S1: ${slug} file is of ${version}`, doc.version, version)
  const judged = judgeMeasurement(doc)
  c.eq(`S1: ${slug} ${version} ROLE-1`, judged['ROLE-1'].status, 'pass')
  c.eq(`S1: ${slug} ${version} UNDO-1`, judged['UNDO-1'].status, 'pass')
  c.check(`S1: ${slug} ${version} CON-1 not failed`, judged['CON-1'].status !== 'fail', judged['CON-1'].note)
}

// S2: Tracy Base measured where /ops reads it, not in the template-name folder it never reads
for (const [cms, dir, version] of [
  ['j6', 'packages/cms/tracy-joomla-quickstart/contracts', '1.0.3'],
  ['wp7', 'packages/cms/tracy-wordpress-quickstart/contracts', '1.1.4']
]) {
  c.check(
    `S2: tracy-base/${cms}/${version} measured`,
    existsSync(join(ROOT, dir, 'tracy-base', cms, version, 'design-system-measurement.json'))
  )
  c.check(`S2: no contracts/tracy/${cms}`, !existsSync(join(ROOT, dir, 'tracy', cms)))
}

c.done()
