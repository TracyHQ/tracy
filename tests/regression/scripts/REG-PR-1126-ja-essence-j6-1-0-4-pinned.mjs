/**
 * REG-PR-1126: JA Essence (Joomla) 1.0.4 is sealed with the contract and the plugin it was released
 * with. No network, no stand:
 *   S1 ja-essence/j6/1.0.4 is byte for byte the contract Claude Cowork for Joomla 0.24.9 carries
 *      (SHA-256 read from the published pkg_claudecowork-0.24.9.zip), and its floor is 0.24.9;
 *   S2 both quickstarts.json pin quickstart/ja-essence/j6 at 1.0.4 on Claude Cowork 0.24.9 with the
 *      1.0.4 pack's own webroot and database, every pinned contract file hash equal to the tch file's,
 *      and the 1.0.3 contract the plugin also carries equal to tch's;
 *   S3 the gates that judge contracts and pins pass.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, ROOT, run } from './lib.mjs'

const c = checks()
const sha = (p) =>
  createHash('sha256')
    .update(readFileSync(join(ROOT, p)))
    .digest('hex')
const C = 'packages/cms/tracy-joomla-quickstart/contracts/ja-essence/j6'

// S1
const CARRIED = {
  'manifest.json': '14661d62ba7a5f5ce8a14bd33ad54cc8e8e10aef9a294e7d40677a03486938f6',
  'content-map.json': '836b332e6c76f5f97d537f4d4f6984f3d2386f3ec8dfd952d2654faaf2570f77',
  'presentation-lock.json': '9e190a616802d5bceeb4bfba364f1edc0a48debf1f4ec42a05f889414afe87f8'
}
for (const [f, want] of Object.entries(CARRIED))
  c.eq(`S1 ja-essence/j6/1.0.4 ${f} is the carried one`, sha(`${C}/1.0.4/${f}`), want)
const manifest = JSON.parse(readFileSync(join(ROOT, `${C}/1.0.4/manifest.json`), 'utf8'))
c.eq('S1 floor plugin', manifest.coworkContractVersion, '0.24.9')
c.eq('S1 quickstart version', manifest.quickstart.version, '1.0.4')

// S2
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const pin = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))['quickstart/ja-essence/j6']
  c.eq(`S2 ${file}: version`, pin.version, '1.0.4')
  c.eq(`S2 ${file}: contract`, pin.contract, 'ja-essence/j6/1.0.4')
  c.eq(`S2 ${file}: Claude Cowork`, pin.cowork.version, '0.24.9')
  c.eq(`S2 ${file}: webroot`, pin.webroot.sha256, manifest.quickstart.parts.webroot.sha256)
  c.eq(`S2 ${file}: database`, pin.database.sha256, manifest.quickstart.parts.database.sha256)
  c.check(`S2 ${file}: webroot asset id`, Number.isSafeInteger(pin.webroot.githubAssetId), pin.webroot)
  c.check(`S2 ${file}: database asset id`, Number.isSafeInteger(pin.database.githubAssetId), pin.database)
  for (const [f, h] of Object.entries(pin.cowork.contractFiles))
    c.eq(`S2 ${file}: contract ${f}`, h, sha(`${C}/1.0.4/${f}`))
  c.eq(`S2 ${file}: also carries`, JSON.stringify(pin.cowork.contractVersions), '["1.0.3"]')
  for (const [f, h] of Object.entries(pin.cowork.alsoCarries['ja-essence/j6/1.0.3']))
    c.eq(`S2 ${file}: also carries 1.0.3 ${f}`, h, sha(`${C}/1.0.3/${f}`))
}

// S3
const gates = run(
  'pnpm',
  ['exec', 'tsx', 'scripts/check-all.ts', '--only', 'contracts', '--only', 'quickstart-overrides'],
  { timeoutS: 900 }
)
c.check(
  'S3 contracts and quickstart-overrides pass',
  gates.status === 0,
  gates.stdout.split('\n').slice(-4).join(' ')
)
c.done()
