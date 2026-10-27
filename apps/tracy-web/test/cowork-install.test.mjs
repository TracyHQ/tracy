// Which Claude Cowork plugin a new site gets (`lib/cowork-install.js`): the order `resolveInstall`
// uses, and the fleet's own `cowork_latest` road (latest or floor). No network.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  coworkNewer,
  coworkSelection,
  fleetCandidates,
  installedCowork,
  pinOf
} from '../src/lib/cowork-install.js'

const PIN = {
  file: 'pkg_claudecowork-0.24.40.zip',
  sha256: 'a'.repeat(64),
  bytes: 10,
  url: 'https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v0.24.40/pkg_claudecowork-0.24.40.zip',
  version: '0.24.40'
}
const pins = (cowork, more = {}) => ({ 'quickstart/ja-boxing/j6': { version: '1.0.3', cowork, ...more } })
const OWN = {
  file: 'pkg_claudecowork-0.24.10.zip',
  sha256: 'b'.repeat(64),
  bytes: 5,
  githubAssetId: 9,
  url: 'https://github.com/TracyHQ/releases/x'
}
const CONTRACT = { coworkMinVersion: '0.24.63' }
const LATEST = {
  version: '0.24.64',
  package:
    'https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v0.24.64/pkg_claudecowork-0.24.64.zip'
}
const sel = (more) =>
  coworkSelection({
    platform: 'joomla',
    tag: 'quickstart/ja-boxing/j6',
    version: '1.0.3',
    own: null,
    contract: CONTRACT,
    pins: {},
    latest: LATEST,
    ...more
  })

test('the release zip wins over a pin, unless the pin says overridesRelease', () => {
  assert.equal(sel({ own: OWN, pins: pins(PIN) }).source, 'release')
  const over = sel({ own: OWN, pins: pins({ ...PIN, overridesRelease: true }) })
  assert.equal(over.source, 'pin')
  assert.equal(over.candidates[0].sha256, PIN.sha256)
  assert.equal(sel({ pins: pins(PIN) }).source, 'pin')
  // installedCowork hands resolveInstall the pin without its flag.
  assert.deepEqual(
    Object.keys(installedCowork(null, { ...PIN, overridesRelease: true }).cowork).includes(
      'overridesRelease'
    ),
    false
  )
})

test('a pin for another version, or a half-written pin, is not selected', () => {
  assert.equal(sel({ version: '1.0.4', pins: pins(PIN) }).source, 'fleet')
  assert.equal(sel({ version: '1.0.2', pins: pins({ ...PIN, contractVersions: ['1.0.2'] }) }).source, 'pin')
  assert.equal(pinOf(pins({ ...PIN, url: 'http://insecure' }), 'quickstart/ja-boxing/j6', '1.0.3'), null)
  // alsoCarries does not make a pin apply (resolveInstall never reads it).
  assert.equal(sel({ version: '1.0.1', pins: pins({ ...PIN, alsoCarries: ['1.0.1'] }) }).source, 'fleet')
})

test('a pin is only asked when a contract seals the version', () => {
  assert.equal(sel({ contract: null, pins: pins(PIN) }).source, 'fleet')
})

test('a local pack reads the pin of the release it stands for', () => {
  assert.equal(sel({ tag: 'local/quickstart/ja-boxing/j6', pins: pins(PIN) }).source, 'pin')
})

test('the fleet: the latest above the contract floor, and the floor, are both candidates', () => {
  const s = sel({})
  assert.equal(s.floor, '0.24.63')
  assert.deepEqual(
    s.candidates.map((c) => [c.role, c.version, c.url]),
    [
      ['latest', '0.24.64', LATEST.package],
      [
        'floor',
        '0.24.63',
        'https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v0.24.63/pkg_claudecowork-0.24.63.zip'
      ]
    ]
  )
  // Not above the floor, outside claude-cowork's releases, or unusable: only the floor.
  assert.deepEqual(
    fleetCandidates('joomla', '0.24.63', { ...LATEST, version: '0.24.63' }).map((c) => c.role),
    ['floor']
  )
  assert.deepEqual(
    fleetCandidates('joomla', '0.24.63', { ...LATEST, package: 'https://evil.test/p.zip' }).map(
      (c) => c.role
    ),
    ['floor']
  )
  assert.deepEqual(
    fleetCandidates('joomla', '0.24.63', null).map((c) => c.role),
    ['floor']
  )
  // Never read: the latest is a candidate nobody can name.
  assert.deepEqual(fleetCandidates('joomla', '0.24.63', 'unread')[0], {
    role: 'latest',
    version: null,
    file: null,
    url: null
  })
  // No contract floor: the platform default.
  assert.equal(sel({ contract: {}, platform: 'wordpress' }).floor, '0.8.0')
})

test('coworkNewer compares part by part as numbers', () => {
  assert.equal(coworkNewer('0.24.10', '0.24.9'), true)
  assert.equal(coworkNewer('0.24.9', '0.24.10'), false)
  assert.equal(coworkNewer('0.24.63', '0.24.63'), false)
  assert.equal(coworkNewer('1.0', '0.99.99'), true)
})
