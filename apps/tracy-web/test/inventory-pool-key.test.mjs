/**
 * The pool name and the generation hash — what makes two prepared instances interchangeable, and
 * what must split them into two pools. No database: both are pure.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generationOf, poolKeyOf, VERIFIER_VERSION } from '../src/lib/inventory-pool-key.js'

const identity = {
  environment: 'prod',
  host: 'prod1',
  platform: 'joomla',
  quickstartTag: 'tracy-business/j6',
  quickstartVersion: '1.0.0',
  generation: 'abcdef0123456789abcdef0123456789'
}

/** A `resolveInstall`-shaped entry. */
function install(over = {}) {
  return {
    platform: 'joomla',
    version: '1.0.0',
    format: 'tracy-setting/v1',
    archive: {
      file: 'site.tar.zst',
      sha256: 'aaa',
      bytes: 10,
      githubAssetId: 1,
      url: 'https://example.test/a'
    },
    database: {
      file: 'site.sql.zst',
      sha256: 'bbb',
      bytes: 20,
      githubAssetId: 2,
      url: 'https://example.test/b'
    },
    contract: 'tracy-business-j6-1.0.0',
    coworkMinVersion: '1.4.0',
    ...over
  }
}

test('the key reads as the six facts it is made of, generation cut to twelve', () => {
  assert.equal(poolKeyOf(identity), 'prod:prod1:joomla:tracy-business/j6:1.0.0:abcdef012345')
})

test('a tag keeps its slash — the key is read by people, not split by them', () => {
  assert.match(poolKeyOf(identity), /tracy-business\/j6/)
})

test('a missing field is refused, never spelled as undefined', () => {
  for (const field of Object.keys(identity)) {
    assert.throws(() => poolKeyOf({ ...identity, [field]: undefined }), TypeError, `${field} not refused`)
    assert.throws(() => poolKeyOf({ ...identity, [field]: '' }), TypeError, `empty ${field} not refused`)
  }
})

test("a ':' outside the tag is refused, because it would make one pool read as two", () => {
  assert.throws(() => poolKeyOf({ ...identity, host: 'prod1:b' }), TypeError)
  assert.throws(() => poolKeyOf({ ...identity, environment: 'a:b' }), TypeError)
  assert.throws(() => poolKeyOf({ ...identity, quickstartVersion: '1:0' }), TypeError)
})

test("a ':' inside the tag is escaped, so the key still has six parts", () => {
  const key = poolKeyOf({ ...identity, quickstartTag: 'vendor:kit/j6' })
  assert.equal(key.split(':').length, 6)
  assert.match(key, /vendor\|kit\/j6/)
})

test('two pools of the same release at different generations are different pools', () => {
  assert.notEqual(poolKeyOf(identity), poolKeyOf({ ...identity, generation: 'ffffffffffff0000' }))
})

test('the generation is the checksums, the version, the contract, the floor and the verifier', () => {
  const base = generationOf({ install: install() })
  assert.match(base, /^[0-9a-f]{64}$/)
  assert.equal(base, generationOf({ install: install() }), 'not stable across calls')
  for (const change of [
    { archive: { file: 'site.tar.zst', sha256: 'CHANGED' } },
    { version: '1.0.1' },
    { contract: 'other-contract' },
    { coworkMinVersion: '1.5.0' }
  ])
    assert.notEqual(
      generationOf({ install: install(change) }),
      base,
      `${Object.keys(change)[0]} did not move it`
    )
  assert.notEqual(generationOf({ install: install(), verifierVersion: VERIFIER_VERSION + 1 }), base)
})

test('a re-upload that changes only the asset id or the URL is the SAME generation', () => {
  // The bytes are identical, so every instance already in the pool installs the same site. Splitting
  // the pool here would strand warm stock for no gain.
  const moved = install({
    archive: {
      file: 'site.tar.zst',
      sha256: 'aaa',
      bytes: 10,
      githubAssetId: 99,
      url: 'https://elsewhere.test/a'
    }
  })
  assert.equal(generationOf({ install: moved }), generationOf({ install: install() }))
})

test('key order in the entry does not change the generation', () => {
  const reordered = { coworkMinVersion: '1.4.0', contract: 'tracy-business-j6-1.0.0', version: '1.0.0' }
  const a = generationOf({ install: { ...install(), ...reordered } })
  const b = generationOf({ install: install() })
  assert.equal(a, b)
})

test('an entry with no checksummed part is refused rather than hashing to a constant', () => {
  assert.throws(() => generationOf({ install: { platform: 'joomla', version: '1.0.0' } }), TypeError)
  assert.throws(() => generationOf({ install: null }), TypeError)
})
