import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openStore, realStoreChannel, realStores } from '../build/release-store.mjs'

function tempStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-store-'))
  return { dir, store: openStore(dir), done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('a file store gives back what was put, with an etag, and null for a key never put', async () => {
  const { store, done } = tempStore()
  try {
    assert.equal(await store.get('dev-mac.yml'), null)
    const { etag } = await store.put('dev/0.3.0-dev.1/b1/manifest.json', Buffer.from('{"a":1}'))
    const got = await store.get('dev/0.3.0-dev.1/b1/manifest.json')
    assert.equal(got.body.toString(), '{"a":1}')
    assert.equal(got.etag, etag)
  } finally {
    done()
  }
})

test('if-none-match * refuses to replace an existing key — the publish lock', async () => {
  const { store, done } = tempStore()
  try {
    await store.put('.publish.lock', Buffer.from('first'), { ifNoneMatch: '*' })
    await assert.rejects(store.put('.publish.lock', Buffer.from('second'), { ifNoneMatch: '*' }), {
      code: 'PRECONDITION'
    })
    assert.equal((await store.get('.publish.lock')).body.toString(), 'first')
    await store.remove('.publish.lock')
    assert.equal(await store.get('.publish.lock'), null)
  } finally {
    done()
  }
})

test('if-match refuses when the key changed since it was read — the feed guard', async () => {
  const { store, done } = tempStore()
  try {
    const { etag } = await store.put('dev-mac.yml', Buffer.from('version: 0.3.0-dev.1\n'))
    await store.put('dev-mac.yml', Buffer.from('version: 0.3.0-dev.2\n'))
    await assert.rejects(store.put('dev-mac.yml', Buffer.from('x'), { ifMatch: etag }), {
      code: 'PRECONDITION'
    })
    // An if-match on a key that is gone is a change too.
    await store.remove('dev-mac.yml')
    await assert.rejects(store.put('dev-mac.yml', Buffer.from('x'), { ifMatch: etag }), {
      code: 'PRECONDITION'
    })
  } finally {
    done()
  }
})

test('a key cannot leave the store', async () => {
  const { store, done } = tempStore()
  try {
    for (const key of ['../escape', '/abs', 'a/../../b', ''])
      await assert.rejects(store.put(key, Buffer.from('x')), /key/)
  } finally {
    done()
  }
})

test('two real stores, one channel each: tracy-releases is stable, tracy-releases-dev is dev; anything else is a test target', () => {
  assert.equal(realStoreChannel('s3://tracy-releases/desktop'), 'stable')
  assert.equal(realStoreChannel('s3://tracy-releases-dev/desktop'), 'dev')
  assert.equal(realStoreChannel('s3://tracy-releases-relcheck/desktop'), null)
  assert.equal(realStoreChannel('s3://tracy-artifacts/desktop-release-test'), null)
  assert.equal(realStoreChannel('/tmp/feed'), null)
  assert.equal(realStoreChannel('file:///tmp/feed'), null)
})

test('a fork names its own real release buckets; unset keeps tracy-releases and tracy-releases-dev', () => {
  assert.deepEqual(realStores({}), { 'tracy-releases': 'stable', 'tracy-releases-dev': 'dev' })
  assert.deepEqual(
    realStores({ TRACY_RELEASE_BUCKET_STABLE: 'acme-releases', TRACY_RELEASE_BUCKET_DEV: 'acme-dev' }),
    {
      'acme-releases': 'stable',
      'acme-dev': 'dev'
    }
  )
  assert.throws(
    () => realStores({ TRACY_RELEASE_BUCKET_STABLE: 'same', TRACY_RELEASE_BUCKET_DEV: 'same' }),
    /must differ/
  )
})
