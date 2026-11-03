// The owner photo bytes of a picture run (#340): a revision's photos come through the brief asset reader, which looks
// each one up in the store its asset manifest names and checks its hash; a brief file's photos come from the bench's
// file store, checked again. A photo whose bytes changed is left out. Bytes are invented; the database is a fake that
// answers the three reads.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileStore } from '../src/site-pictures/file-store.js'
import { ownerPhotoBytes } from '../src/site-pictures/owner-photos.js'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const REVISION = '11111111-2222-4333-8444-555555555555'
const ACCOUNT = '99999999-2222-4333-8444-555555555555'
const bytes = {
  place: Buffer.from('a place photo'),
  own: Buffer.from('an own photo'),
  changed: Buffer.from('x')
}
const id = {
  place: 'aaaaaaaa-0000-4000-8000-000000000001',
  own: 'aaaaaaaa-0000-4000-8000-000000000002',
  changed: 'aaaaaaaa-0000-4000-8000-000000000003'
}

const brief = () => ({
  assets: [
    { id: id.place, kind: 'image', sha256: sha(bytes.place) },
    { id: id.own, kind: 'image', sha256: sha(bytes.own) },
    // The brief records one hash; the stored bytes are another.
    { id: id.changed, kind: 'image', sha256: sha(Buffer.from('what the brief saw')) },
    { id: 'v', kind: 'video', sha256: 'f'.repeat(64) }
  ]
})

test('a revision run reads each photo from the store its asset manifest names, hash checked', async () => {
  const asked = []
  const pool = {
    query: async (sql, params) => {
      asked.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40))
      if (/from wo_revision/.test(sql))
        return {
          rows: [
            {
              account_id: ACCOUNT,
              asset_manifest: [
                { id: id.place, origin: 'place' },
                { id: id.own, origin: 'own' },
                { id: id.changed }
              ]
            }
          ]
        }
      if (/from wo_place_media/.test(sql))
        return { rows: [{ id: id.place, sha256: sha(bytes.place), object_key: 'k-place' }] }
      if (/from wo_media/.test(sql)) {
        assert.equal(params[1], ACCOUNT)
        return {
          rows: [
            { id: id.own, sha256: sha(bytes.own), object_key: 'k-own' },
            { id: id.changed, sha256: sha(Buffer.from('what the brief saw')), object_key: 'k-changed' }
          ]
        }
      }
      throw new Error(`unexpected query ${sql}`)
    }
  }
  const held = { 'k-place': bytes.place, 'k-own': bytes.own, 'k-changed': bytes.changed }
  const objects = { get: async (key) => new Response(held[key]) }
  const row = { brief: brief(), photo_source: { kind: 'revision', revisionId: REVISION } }
  const got = await ownerPhotoBytes({ pool, objects, store: fileStore('/nowhere') }, row)
  assert.deepEqual([...got.keys()].sort(), [id.place, id.own].sort())
  assert.deepEqual(got.get(id.own), bytes.own)
  assert.equal(asked.length, 3)
})

test('a brief file run reads the photos the CLI stored, and leaves out one changed on disk', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-pictures-photos-'))
  try {
    const store = fileStore(dir)
    await store.putPhoto(bytes.place)
    const own = await store.putPhoto(bytes.own)
    writeFileSync(path.join(dir, 'photos', own), Buffer.from('changed on disk'))
    const row = { brief: brief(), photo_source: { kind: 'folder', name: 'photos', files: 2, used: 2 } }
    const got = await ownerPhotoBytes({ pool: null, store }, row)
    assert.deepEqual([...got.keys()], [id.place])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
