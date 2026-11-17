// The store of a draft run's drawings (#575 pictures, port 1): a drawing is kept once as a draft picture under the
// draft's object key, named by its request key, and found again by that key with its bytes checked. A fake pool and
// fake objects stand in for Postgres and the object store.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-drawn-pictures.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawnPicturesStore } from '../src/build-draft/drawn-pictures.js'

function fakes() {
  const objects = new Map()
  const rows = []
  const pool = {
    async query(sql, args) {
      if (/^\s*with made as/.test(sql)) {
        const [account, , sourceUrl, sha256, objectKey, mime] = args
        let row = rows.find((r) => r.account === account && r.sha256 === sha256)
        if (!row)
          rows.push((row = { id: `row-${rows.length + 1}`, account, sourceUrl, sha256, objectKey, mime }))
        return { rows: [{ id: row.id }] }
      }
      const [account, sourceUrl] = args
      const row = rows.find((r) => r.account === account && r.sourceUrl === sourceUrl)
      return {
        rows: row ? [{ id: row.id, sha256: row.sha256, object_key: row.objectKey, mime: row.mime }] : []
      }
    }
  }
  const store = {
    put: async (key, bytes) => (objects.set(key, Buffer.from(bytes)), true),
    get: async (key) =>
      objects.has(key) ? { ok: true, arrayBuffer: async () => objects.get(key) } : { ok: false }
  }
  return { pool, store, objects, rows }
}

test('a drawing is stored once under the draft key and found again by its request key', async () => {
  const f = fakes()
  const drawn = drawnPicturesStore({ pool: f.pool, objects: f.store })
  const ctx = { accountId: 'account-invented' }
  const kept = await drawn.keep(
    { key: 'k1', bytes: Buffer.from('invented drawing'), mime: 'image/jpeg' },
    ctx
  )
  assert.equal(kept.id, 'row-1')
  assert.match([...f.objects.keys()][0], /^build-drafts\/account-invented\/[0-9a-f]{64}\.jpg$/)
  const found = await drawn.find('k1', ctx)
  assert.equal(found.id, 'row-1')
  assert.equal(found.bytes.toString(), 'invented drawing')
  assert.equal(await drawn.find('k2', ctx), null)
  assert.equal(await drawn.find('k1', { accountId: 'account-other' }), null)
})

test('bytes changed under the key are not a drawing found; no account or no store keeps nothing', async () => {
  const f = fakes()
  const drawn = drawnPicturesStore({ pool: f.pool, objects: f.store })
  const ctx = { accountId: 'account-invented' }
  await drawn.keep({ key: 'k1', bytes: Buffer.from('invented drawing') }, ctx)
  f.objects.set([...f.objects.keys()][0], Buffer.from('changed'))
  assert.equal(await drawn.find('k1', ctx), null)
  assert.equal(await drawn.keep({ key: 'k3', bytes: Buffer.from('x') }, {}), null)
  assert.equal(
    await drawnPicturesStore({ pool: f.pool, objects: null }).keep(
      { key: 'k', bytes: Buffer.from('x') },
      ctx
    ),
    null
  )
})
