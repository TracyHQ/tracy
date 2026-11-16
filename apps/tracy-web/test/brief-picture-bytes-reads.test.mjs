// A revision's owner photos are read from the object store several at a time (lib/brief-picture-bytes.js
// PICTURE_READS_AT_ONCE), in the rows' order, each still checked against its hash and size. Fake store and pool.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { briefPictureBytes, PICTURE_READS_AT_ONCE } from '../src/lib/brief-picture-bytes.js'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function stand(count, { wrongHash = new Set(), missing = new Set() } = {}) {
  const bytes = Array.from({ length: count }, (_, n) => Buffer.from(`photo ${n}`))
  let inFlight = 0
  let most = 0
  const pool = {
    async query(_sql, [ids]) {
      return {
        rows: ids.map((rowId) => {
          const n = Number(rowId.slice(-12))
          return { id: rowId, sha256: sha(bytes[n]), object_key: `k/${n}` }
        })
      }
    }
  }
  const objects = {
    async get(key) {
      const n = Number(key.slice(2))
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      if (missing.has(n)) return null
      const body = wrongHash.has(n) ? Buffer.from('other') : bytes[n]
      return { ok: true, arrayBuffer: async () => body }
    }
  }
  const rows = bytes.map((b, n) => ({ id: id(n), sha256: sha(b), origin: 'own' }))
  return { pool, objects, rows, most: () => most }
}

test('photos are read several at a time, at most PICTURE_READS_AT_ONCE, and come back in the rows order', async () => {
  const s = stand(40)
  const got = await briefPictureBytes({ pool: s.pool, objects: s.objects }, s.rows, 'account')
  assert.deepEqual(
    got.map((p) => p.id),
    s.rows.map((r) => r.id)
  )
  assert.ok(s.most() > 1, `${s.most()} read at a time`)
  assert.ok(s.most() <= PICTURE_READS_AT_ONCE, `${s.most()} read at a time`)
})

test('a photo whose bytes are missing or of another hash is still left out', async () => {
  const s = stand(6, { wrongHash: new Set([1]), missing: new Set([4]) })
  const got = await briefPictureBytes({ pool: s.pool, objects: s.objects }, s.rows, 'account')
  assert.deepEqual(
    got.map((p) => p.id),
    [0, 2, 3, 5].map(id)
  )
})
