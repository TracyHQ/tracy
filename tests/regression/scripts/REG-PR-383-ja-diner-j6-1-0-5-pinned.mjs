/**
 * REG-PR-383: JA Diner (Joomla 6) 1.0.5 is sealed with the contract, the kit and the plugin it was
 * released with. No network, no stand:
 *   S1 ja-diner/j6/1.0.5 is byte for byte the contract Claude Cowork for Joomla 0.24.80 carries
 *      (SHA-256 read from the published release joomla-v0.24.80), its floor is 0.24.80, and the
 *      approved template-kit.json sits beside it;
 *   S2 both quickstarts.json pin quickstart/ja-diner/j6 at 1.0.5 or a later version (1.0.6 since the
 *      dark mode release) with the installer of that contract's manifest (file, bytes, sha256, a GitHub
 *      asset id) and every pinned contract file hash equal to the repository file's;
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
const C = 'packages/cms/tracy-joomla-quickstart/contracts/ja-diner/j6/1.0.5'

// S1
const CARRIED = {
  'content-map.json': '007259d97a25603720db82d46bdb59c2fb5804bced36146eccb2787fc2f106e2',
  'manifest.json': '019455aeb679e18de3f51fde173508dd6f96a8e61996eb178fd3194a86f65dd3',
  'presentation-lock.json': 'e8de147cd2daa6fe4d302649cae046c1fe8bf003794dce2e258ec0549c5af40e',
  'showcase-nav-map.json': 'b70293eeb0b61dd84391ba5640b8da6dbcad6521fb19ff37a861030dd913ed98'
}
for (const [f, want] of Object.entries(CARRIED))
  c.eq(`S1 ja-diner/j6/1.0.5 ${f} is the carried one`, sha(`${C}/${f}`), want)
const manifest = JSON.parse(readFileSync(join(ROOT, `${C}/manifest.json`), 'utf8'))
c.eq('S1 floor plugin', manifest.coworkContractVersion, '0.24.80')
c.eq('S1 quickstart version', manifest.quickstart.version, '1.0.5')
const kit = JSON.parse(readFileSync(join(ROOT, `${C}/template-kit.json`), 'utf8'))
c.eq('S1 kit approved by', kit.approval?.by, 'Akemi0x')
c.eq('S1 kit quickstart version', kit.quickstart?.version, '1.0.5')

// S2: the pin moved on from 1.0.5 (to 1.0.6 by the dark mode release); whatever version it names, it is sealed
// the same way: its contract folder exists, the installer is the one that contract's manifest records, and every
// pinned contract file hash equals the repository file's.
for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const pin = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))['quickstart/ja-diner/j6']
  const P = `packages/cms/tracy-joomla-quickstart/contracts/${pin.contract}`
  const pinned = JSON.parse(readFileSync(join(ROOT, `${P}/manifest.json`), 'utf8'))
  const installer = pinned.quickstart.parts.installer
  c.check(
    `S2 ${file}: no older than 1.0.5`,
    pin.version.localeCompare('1.0.5', 'en', { numeric: true }) >= 0,
    pin.version
  )
  c.eq(`S2 ${file}: contract`, pin.contract, `ja-diner/j6/${pin.version}`)
  c.eq(`S2 ${file}: contract quickstart version`, pinned.quickstart.version, pin.version)
  c.eq(`S2 ${file}: installer file`, pin.installer.file, installer.file)
  c.eq(`S2 ${file}: installer bytes`, pin.installer.bytes, installer.bytes)
  c.eq(`S2 ${file}: installer sha256`, pin.installer.sha256, installer.sha256)
  c.check(`S2 ${file}: installer asset id`, Number.isSafeInteger(pin.installer.githubAssetId), pin.installer)
  for (const [f, h] of Object.entries(pin.cowork.contractFiles))
    c.eq(`S2 ${file}: contract ${f}`, h, sha(`${P}/${f}`))
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
