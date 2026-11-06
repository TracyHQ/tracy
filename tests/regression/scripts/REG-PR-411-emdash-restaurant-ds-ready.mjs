/**
 * REG-PR-411: JA Restaurant EmDash 1.0.1 wears a design system fully. The fence is what the release
 * is made of: the stylesheets read the type and shape tokens and no role a system does not define, the
 * slot contract is ready from 1.0.1, and the committed measurement of 1.0.1 judges every built-site
 * rule as pass.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, ROOT } from './lib.mjs'

const THEME = join(ROOT, 'packages/cms/tracy-emdash-theme-restaurant')
const SLOT = join(ROOT, 'packages/design/tracy-ds-slot')
const c = checks()
const read = (/** @type {string} */ f) => readFileSync(join(THEME, f), 'utf8')

for (const f of ['package.json', 'template.config.json']) {
  c.check(`${f} is 1.0.1`, JSON.parse(read(f)).version === '1.0.1', JSON.parse(read(f)).version)
}
c.check('Dockerfile label is 1.0.1', /io\.tracy\.template\.version="1\.0\.1"/.test(read('Dockerfile')))

const css = read('src/styles/global.css')
const reads = [
  ['display weight', /\.rs-display \{[^}]*font-weight: var\(--ds-weight-display, 300\)/],
  ['display size', /\.rs-display \{[^}]*font-size: var\(--ds-size-display, 58px\)/],
  ['display leading', /\.rs-display \{[^}]*line-height: var\(--ds-leading-display, 1\.1\)/],
  [
    'heading weight and size',
    /\.rs-section-title \{[^}]*var\(--ds-weight-heading, 300\)[^}]*var\(--ds-size-heading, 58px\)/
  ],
  ['body weight', /body \{[^}]*font-weight: var\(--ds-weight-body, 400\)/],
  [
    'button weight and radius',
    /\.rs-btn \{[^}]*var\(--ds-weight-button, 700\)[^}]*border-radius: var\(--ds-btn-radius, 0\)/
  ],
  ['card radius', /\.rs-post-card \{[^}]*border-radius: var\(--ds-card-radius, 0\)/]
]
for (const [name, re] of reads)
  c.check(`global.css reads the ${name} token with its own fallback`, re.test(css))

const tokens = read('src/styles/tokens.css')
for (const role of ['--ds-c-secondary', '--ds-c-on-ink-soft'])
  c.check(`tokens.css does not read ${role}`, !tokens.includes(role))

const contract = JSON.parse(readFileSync(join(SLOT, 'templates/emdash-tracy-restaurant.json'), 'utf8'))
c.check('the slot contract is ready', contract.ready === true)
c.check('the slot contract starts at 1.0.1', contract.minVersion?.['tracy-restaurant/emdash-0.x'] === '1.0.1')

const file = join(THEME, 'contracts/1.0.1/design-system-measurement.json')
c.check('the 1.0.1 measurement is committed', existsSync(file))
if (existsSync(file)) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const { judgeMeasurement } = await import(pathToFileURL(join(SLOT, 'src/measurement.mjs')).href)
  const verdicts = Object.entries(judgeMeasurement(doc))
  // PREVIEW-PARITY compares a Joomla template's two renderings; EmDash has none to measure
  const bad = verdicts.filter(
    ([id, v]) => v.status !== 'pass' && v.status !== 'not-applicable' && id !== 'PREVIEW-PARITY'
  )
  c.check('the measurement is of 1.0.1', doc.version === '1.0.1', doc.version)
  c.check(
    'every built-site rule passes on it',
    bad.length === 0,
    bad.map(([id, v]) => `${id} ${v.status}`).join(', ')
  )
}
c.done()
