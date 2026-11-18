import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyReads, covers, rootGlobs } from '../ci/turbo-inputs.mjs'
import { EXCLUDE } from '../ci/turbo-setup.mjs'

const credential = 'tch/.credentials.yaml'
const source = 'tch/profiles/native/cordis.patch.yml'
const globs = rootGlobs(['$TURBO_ROOT$/tch/*', '$TURBO_ROOT$/tch/profiles/native/**', ...EXCLUDE], '')

test('local credential files are excluded from broad Turbo inputs while profile sources remain covered', () => {
  assert.equal(covers(globs, credential), false)
  assert.equal(covers(globs, `${credential}.bak`), false)
  assert.equal(covers(globs, source), true)
})

test('excluding local credentials from a hash never permits a test to read them', () => {
  const result = classifyReads({
    reads: [credential, source],
    globs,
    env: [],
    hashed: new Set([source]),
    kind: () => 'file',
    isIgnored: (file) => file === credential,
    generated: []
  })
  assert.deepEqual(result.uncovered, [credential])
  assert.deepEqual(result.hashed, [source])
})
