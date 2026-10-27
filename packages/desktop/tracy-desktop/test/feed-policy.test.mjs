/**
 * The app's copy of the channel file's policy reader (`src/feed-policy.js`): the packaged app carries
 * only `src/`, so it cannot import build/release-feed.mjs. These tests hold the copy to the original —
 * the same answer, or both refusing, for every file below — and name the channel file the app reads.
 *
 *   node --test packages/desktop/tracy-desktop/test/feed-policy.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { readPolicy as buildReadPolicy } from '../build/release-feed.mjs'

const require = createRequire(import.meta.url)
const { readPolicy, channelFileName } = require('../src/feed-policy.js')
const updateChannel = require('../build/update-channel.cjs')

const head = 'version: 0.6.0\nfiles:\n  - url: a.zip\n    sha512: x\n    size: 1\npath: a.zip\n'
const devHead = 'version: 0.6.0-dev.12\npath: a.zip\n'
const FILES = {
  none: head,
  minimum: `${head}minimumVersion: 0.5.2\npolicyRevision: 3\n`,
  dated: `${head}minimumVersion: 0.6.0\nminimumVersionAfter: '2026-10-20T00:00:00Z'\npolicyRevision: 4\n`,
  cleared: `${head}policyRevision: 7\n`,
  dev: `${devHead}minimumVersion: 0.6.0-dev.10\npolicyRevision: 2\n`,
  quotedRevision: `${head}minimumVersion: '0.5.2'\npolicyRevision: '3'\n`,
  noRevision: `${head}minimumVersion: 0.5.2\n`,
  badRevision: `${head}minimumVersion: 0.5.2\npolicyRevision: 1.5\n`,
  twoLines: `${head}minimumVersion: 0.5.2\nminimumVersion: 0.5.3\npolicyRevision: 3\n`,
  aboveOffered: `${head}minimumVersion: 0.7.0\npolicyRevision: 3\n`,
  zoneless: `${head}minimumVersion: 0.5.2\nminimumVersionAfter: '2026-10-20T00:00:00'\npolicyRevision: 3\n`,
  afterAlone: `${head}minimumVersionAfter: '2026-10-20T00:00:00Z'\npolicyRevision: 3\n`,
  stableAskingDev: `${head}minimumVersion: 0.6.0-dev.1\npolicyRevision: 3\n`,
  zeroRevision: `${head}minimumVersion: 0.5.2\npolicyRevision: 0\n`,
  notes: `${head}minimumVersion: 0.5.2\npolicyRevision: 3\nreleaseNotes: |\n  minimumVersion: 9.9.9 in prose\n`
}

const outcome = (read, text) => {
  try {
    return { policy: read(text) }
  } catch {
    return { refused: true }
  }
}

for (const [name, text] of Object.entries(FILES))
  test(`the app reads "${name}" exactly as the release tools do`, () => {
    assert.deepEqual(outcome(readPolicy, text), outcome(buildReadPolicy, text))
  })

test('the readings themselves: a policy, none, a cleared one, a refusal', () => {
  assert.deepEqual(readPolicy(FILES.dated), {
    minimumVersion: '0.6.0',
    minimumVersionAfter: '2026-10-20T00:00:00Z',
    policyRevision: 4
  })
  assert.equal(readPolicy(FILES.none), null)
  assert.deepEqual(readPolicy(FILES.cleared), { policyRevision: 7 })
  assert.throws(() => readPolicy(FILES.noRevision), /policyRevision/)
})

test('the channel file the app reads is the one the release writes, per platform and arch', () => {
  const cases = [
    ['darwin', 'arm64', 'mac'],
    ['darwin', 'x64', 'mac'],
    ['win32', 'x64', 'win'],
    ['win32', 'arm64', 'win'],
    ['linux', 'x64', 'linux'],
    ['linux', 'arm64', 'linux']
  ]
  for (const channel of ['stable', 'dev'])
    for (const [platform, arch, builds] of cases)
      assert.equal(
        channelFileName({ channel, platform, arch }),
        updateChannel.channelFile({ channel, platform: builds, arch }),
        `${channel} ${platform} ${arch}`
      )
  assert.equal(channelFileName({ channel: 'stable', platform: 'freebsd', arch: 'x64' }), null)
})
