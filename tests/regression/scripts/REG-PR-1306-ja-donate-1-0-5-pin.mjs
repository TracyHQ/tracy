/**
 * REG-PR-1306-ja-donate-1-0-5-pin: the JA Donate 1.0.5 release is pinned end to end — its contract is in the tree
 * with the files the build wrote and names the published archive and the Claude Cowork release that carries it, the
 * slot contract offers the door up to 1.0.5, and every Joomla quickstart pins a Claude Cowork for Joomla no older
 * than the one carrying the contract (both catalogue copies alike). S1 reads the files; S2 runs the door's
 * maxVersion tests.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const triple = (v) => String(v).split('.').map(Number)
const olderThan = (a, b) => {
  const [x, y] = [triple(a), triple(b)]
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i]
  return false
}

// S1: the contract and its pins
const dir = 'packages/cms/tracy-joomla-quickstart/contracts/ja-donate/j6'
for (const f of [
  '1.0.5/manifest.json',
  '1.0.5/content-map.json',
  '1.0.5/presentation-lock.json',
  '1.0.5.design.json',
  '1.0.5.copy.json'
])
  c.check(`S1: ${dir}/${f} exists`, existsSync(join(ROOT, dir, f)))
const m = json(`${dir}/1.0.5/manifest.json`)
c.eq('S1: contract id', m.id, 'ja-donate/j6/1.0.5')
c.eq('S1: quickstart version', m.quickstart?.version, '1.0.5')
c.eq('S1: quickstart release', m.quickstart?.release, 'quickstart/ja-donate/j6')
c.eq('S1: webroot archive', m.quickstart?.parts?.webroot?.file, 'ja-donate-j6-webroot-1.0.5.tar.gz')
c.eq(
  'S1: webroot sha256 is the published archive',
  m.quickstart?.parts?.webroot?.sha256,
  '8d447a0d48dec1dfbdb6d4b32c75b9dbda9793ae941b450bbf4aff85cd6746d6'
)
c.eq('S1: coworkContractVersion', m.coworkContractVersion, '0.24.26')
const t = json('packages/design/tracy-ds-slot/templates/joomla-ja-donate.json')
c.eq('S1: maxVersion', t.maxVersion?.['quickstart/ja-donate/j6'], '1.0.5')
c.check(
  'S1: minVersion <= maxVersion',
  !olderThan(t.maxVersion['quickstart/ja-donate/j6'], t.minVersion['quickstart/ja-donate/j6'])
)
c.check('S1: maxVersionNote says what 1.0.5 was checked against', /1\.0\.5/.test(t.maxVersionNote ?? ''))
const catalogues = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const pins = catalogues.map((p) =>
  Object.entries(json(p))
    .filter(([, e]) => e.platform === 'joomla' && e.cowork?.version)
    .map(([id, e]) => [id, e.cowork.version, e.cowork.sha256])
)
c.check('S1: the catalogue has Joomla pins', pins[0].length > 0, pins[0].length)
for (const [id, v] of pins[0])
  c.check(`S1: ${id} pins Claude Cowork for Joomla >= 0.24.26`, !olderThan(v, '0.24.26'), v)
c.check(
  'S1: both catalogue copies pin the same releases',
  JSON.stringify(pins[0]) === JSON.stringify(pins[1])
)

// S2: the door offers the moved maxVersion and refuses the next one
const s2 = nodeTest(['apps/tracy-web/test/design-system-door.test.mjs'], {
  extra: ['--test-name-pattern', 'maxVersion']
})
c.tapClean('S2', s2, { noSkip: false })
for (const name of [
  'contractFor refuses a release newer than the last one confirmed to wear the slot',
  'every ready contract names the last release confirmed for each release it wears',
  'a WordPress theme bumped in this tree is checked against its contract before it ships'
])
  c.passes('S2', s2, name)

c.done()
