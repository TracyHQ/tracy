/**
 * REG-PR-1330-readiness-pins-1318: the JA Voyara 1.0.8 and Tracy Business 1.2.3 releases are pinned end to end — each
 * contract is in the tree with the files the build wrote, names the published archive and the Claude Cowork release that
 * carries it, the two slot contracts offer the door up to 1.0.8 and 1.2.3, and every Joomla quickstart pins a Claude
 * Cowork for Joomla no older than the one carrying the contracts (both catalogue copies alike). S1 reads the files; S2
 * runs the door's maxVersion tests.
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
const COWORK = '0.24.27'

// S1: the two contracts and their pins
const pinned = [
  {
    dir: 'packages/cms/tracy-joomla-quickstart/contracts/ja-voyara/j6',
    version: '1.0.8',
    id: 'ja-voyara/j6/1.0.8',
    release: 'quickstart/ja-voyara/j6',
    files: ['manifest.json', 'content-map.json', 'presentation-lock.json'],
    webroot: 'ja-voyara-j6-webroot-1.0.8.tar.gz',
    sha256: 'e71d15d765831a2f904f4182020ec2bcfa9269b58f33201b0be74fbf311a8dde',
    template: 'packages/design/tracy-ds-slot/templates/joomla-ja-voyara.json'
  },
  {
    dir: 'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6',
    version: '1.2.3',
    id: 'tracy-business/j6/1.2.3',
    release: 'tracy-business/j6',
    files: [
      'manifest.json',
      'content-map.json',
      'presentation-lock.json',
      'multilingual-map.json',
      'editions.json',
      'demo-trim-map.json',
      'questions.json'
    ],
    webroot: 'tracy-business-j6-webroot-1.2.3.tar.gz',
    sha256: '04ec5c411559618ad422d17936c3d60a4c143c642f36ffc543d767b2f44bb511',
    template: 'packages/design/tracy-ds-slot/templates/joomla-tracy-business.json'
  }
]
for (const p of pinned) {
  for (const f of [
    ...p.files.map((f) => `${p.version}/${f}`),
    `${p.version}.design.json`,
    `${p.version}.copy.json`
  ])
    c.check(`S1: ${p.dir}/${f} exists`, existsSync(join(ROOT, p.dir, f)))
  const m = json(`${p.dir}/${p.version}/manifest.json`)
  c.eq(`S1: ${p.id} contract id`, m.id, p.id)
  c.eq(`S1: ${p.id} quickstart version`, m.quickstart?.version, p.version)
  c.eq(`S1: ${p.id} quickstart release`, m.quickstart?.release, p.release)
  c.eq(`S1: ${p.id} webroot archive`, m.quickstart?.parts?.webroot?.file, p.webroot)
  c.eq(`S1: ${p.id} webroot sha256 is the published archive`, m.quickstart?.parts?.webroot?.sha256, p.sha256)
  c.eq(`S1: ${p.id} coworkContractVersion`, m.coworkContractVersion, COWORK)
  for (const f of ['multilingual-map.json', 'editions.json', 'demo-trim-map.json'].filter((f) =>
    p.files.includes(f)
  ))
    c.eq(`S1: ${p.id} ${f} is pinned to this contract`, json(`${p.dir}/${p.version}/${f}`).contract, p.id)
  const t = json(p.template)
  c.eq(`S1: ${p.release} maxVersion`, t.maxVersion?.[p.release], p.version)
  c.check(
    `S1: ${p.release} minVersion <= maxVersion`,
    !olderThan(t.maxVersion[p.release], t.minVersion[p.release])
  )
  c.check(
    `S1: ${p.release} maxVersionNote says what ${p.version} was checked against`,
    new RegExp(p.version.replaceAll('.', '\\.')).test(t.maxVersionNote ?? '')
  )
}
const catalogues = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const pins = catalogues.map((p) =>
  Object.entries(json(p))
    .filter(([, e]) => e.platform === 'joomla' && e.cowork?.version)
    .map(([id, e]) => [id, e.cowork.version, e.cowork.sha256, e.contract, e.version])
)
c.check('S1: the catalogue has Joomla pins', pins[0].length > 0, pins[0].length)
for (const [id, v] of pins[0])
  c.check(`S1: ${id} pins Claude Cowork for Joomla >= ${COWORK}`, !olderThan(v, COWORK), v)
for (const p of pinned) {
  const row = pins[0].find(([id]) => id === p.release)
  c.eq(`S1: ${p.release} catalogue row names the contract`, row?.[3], p.id)
  c.eq(`S1: ${p.release} catalogue row serves ${p.version}`, row?.[4], p.version)
}
c.check(
  'S1: both catalogue copies pin the same releases',
  JSON.stringify(pins[0]) === JSON.stringify(pins[1])
)

// S2: the door offers the moved maxVersions and refuses the next one
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
