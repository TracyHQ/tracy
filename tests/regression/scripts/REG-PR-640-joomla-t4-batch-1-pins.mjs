/**
 * REG-PR-640: JA Vega 1.0.10, JA Nova 1.0.12 and JA Kinetic 1.0.12 (Joomla 6) are pinned on Claude
 * Cowork for Joomla 0.24.95, sealed by their own contracts. No network, no stand:
 *   S1 both quickstarts.json pin each of the three at that version or a later one, on 0.24.95 or a later
 *      plugin, with contract <slug>/j6/<version>, the webroot and database of that version (asset id and
 *      a joomlart-products release url), and every recorded contract file hash (own and alsoCarries)
 *      equal to the repository file's; while the pin is still on the batch version, the version it
 *      replaced stays in contractVersions and alsoCarries, so sites built from it keep their plugin;
 *   S2 the JA Kinetic design reads the pinned contract with the same hashes, and its floor is not
 *      above the pinned plugin;
 *   S3 the plugin doors table knows 0.24.95 by its package SHA-256;
 *   S4 the gates that judge contracts, designs and demo-trim maps pass.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, ROOT, run } from './lib.mjs'

const c = checks()
const read = (p) => readFileSync(join(ROOT, p))
const sha = (p) => createHash('sha256').update(read(p)).digest('hex')
const json = (p) => JSON.parse(read(p).toString('utf8'))
const notOlder = (a, b) => a.localeCompare(b, 'en', { numeric: true }) >= 0
const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'
const PINS = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const DESIGNS = [
  'apps/tracy-web/src/design-templates.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json'
]
// The batch version and the version it replaced.
const BATCH = {
  'ja-vega': ['1.0.10', '1.0.9'],
  'ja-nova': ['1.0.12', '1.0.10'],
  'ja-kinetic': ['1.0.12', '1.0.11']
}
const COWORK = '0.24.95'
const COWORK_SHA = 'c03ec9be1fd05d547018e7156105feef6ab74e2cc11d086ad03ce98ec4fe295f'

const sealed = (label, id, files) => {
  c.check(`${label}: contract ${id} exists`, existsSync(join(ROOT, CONTRACTS, id, 'manifest.json')), id)
  for (const [f, h] of Object.entries(files ?? {}))
    c.eq(`${label}: ${id} ${f}`, h, sha(`${CONTRACTS}/${id}/${f}`))
}

// S1
c.check('S1 the two quickstarts.json are byte-identical', read(PINS[0]).equals(read(PINS[1])))
const pins = json(PINS[0])
for (const [slug, [version, previous]] of Object.entries(BATCH)) {
  const pin = pins[`quickstart/${slug}/j6`]
  const label = `S1 ${slug}`
  c.check(`${label}: version ${version} or later`, notOlder(pin.version, version), pin.version)
  c.eq(`${label}: contract`, pin.contract, `${slug}/j6/${pin.version}`)
  c.check(`${label}: plugin ${COWORK} or later`, notOlder(pin.cowork.version, COWORK), pin.cowork.version)
  c.eq(`${label}: plugin file`, pin.cowork.file, `pkg_claudecowork-${pin.cowork.version}.zip`)
  for (const part of ['webroot', 'database']) {
    const p = pin[part]
    c.check(`${label}: ${part} file is ${pin.version}`, p.file.includes(`-${part}-${pin.version}.`), p.file)
    c.check(
      `${label}: ${part} asset id`,
      Number.isSafeInteger(p.githubAssetId) && p.githubAssetId > 0,
      p.githubAssetId
    )
    c.eq(
      `${label}: ${part} url`,
      p.url,
      `https://github.com/JoomlArt-Products/joomlart-products/releases/download/quickstart%2F${slug}%2Fj6/${p.file}`
    )
  }
  sealed(label, pin.contract, pin.cowork.contractFiles)
  for (const [id, files] of Object.entries(pin.cowork.alsoCarries ?? {}))
    sealed(`${label} carries`, id, files)
  if (pin.version === version) {
    c.check(
      `${label}: still carries ${previous}`,
      pin.cowork.contractVersions?.includes(previous),
      pin.cowork.contractVersions
    )
    c.check(
      `${label}: alsoCarries ${slug}/j6/${previous}`,
      Boolean(pin.cowork.alsoCarries?.[`${slug}/j6/${previous}`])
    )
  }
}
if (pins['quickstart/ja-kinetic/j6'].cowork.version === COWORK)
  c.eq('S1 ja-kinetic: plugin sha256', pins['quickstart/ja-kinetic/j6'].cowork.sha256, COWORK_SHA)

// S2
c.check('S2 the two design-templates.json are byte-identical', read(DESIGNS[0]).equals(read(DESIGNS[1])))
const kinetic = json(DESIGNS[0]).designs['ja-kinetic']
const kineticPin = pins['quickstart/ja-kinetic/j6']
c.eq('S2 ja-kinetic design: base version', kinetic.base.version, kineticPin.version)
c.eq('S2 ja-kinetic design: profile', kinetic.contractProfile, kineticPin.contract)
c.eq('S2 ja-kinetic design: activation', kinetic.activation.id, kineticPin.contract)
c.check(
  'S2 ja-kinetic design: floor not above the pinned plugin',
  notOlder(kineticPin.cowork.version, kinetic.coworkMinVersion),
  kinetic.coworkMinVersion
)
sealed('S2 ja-kinetic design', kinetic.contractProfile, kinetic.contractFiles)

// S3
const doors = json('apps/tracy-web/src/lib/template-readiness/cowork-plugin-doors.json')
c.eq(`S3 doors know ${COWORK}`, JSON.stringify(doors).includes(`"${COWORK}":{"sha256":"${COWORK_SHA}"`), true)

// S4
const gates = run(
  'pnpm',
  [
    'exec',
    'tsx',
    'scripts/check-all.ts',
    '--only',
    'contracts',
    '--only',
    'design-templates',
    '--only',
    'joomla-demo-trim'
  ],
  { timeoutS: 900 }
)
c.check(
  'S4 contracts, design-templates and joomla-demo-trim pass',
  gates.status === 0,
  gates.stdout.split('\n').slice(-4).join(' ')
)
c.done()
