// The brief picture reader and the picture bench's owner photo reader on a draft picture (origin `draft`, #597): the
// bytes come from `openDraftPicture`, never from wo_media; a gone picture, a missing reader or an unknown account leaves
// the picture out. Bytes and ids are invented.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { briefPictureBytes } from '../src/lib/brief-picture-bytes.js'
import { ownerPhotoBytes } from '../src/site-pictures/owner-photos.js'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const ACCOUNT = '99999999-2222-4333-8444-555555555555'
const DRAFT = 'dddddddd-0000-4000-8000-000000000001'
const GONE = 'dddddddd-0000-4000-8000-000000000002'
const OWN = 'aaaaaaaa-0000-4000-8000-000000000002'
const draftBytes = Buffer.from('an invented draft picture')
const ownBytes = Buffer.from('an invented own picture')

const noSql = async (sql) => {
  throw new Error(`unexpected query ${sql}`)
}
const opened = []
const openDraftPicture = async (id, opts) => {
  opened.push([id, opts])
  return id === DRAFT ? { id, sha256: sha(draftBytes), mime: 'image/jpeg', bytes: draftBytes } : null
}
const rows = [
  { id: DRAFT, sha256: sha(draftBytes), origin: 'draft' },
  { id: GONE, sha256: sha(draftBytes), origin: 'draft' }
]

test('a draft picture is read through openDraftPicture for the account, and a gone one is left out', async () => {
  opened.length = 0
  const got = await briefPictureBytes(
    { pool: { query: noSql }, objects: null, openDraftPicture },
    rows,
    ACCOUNT
  )
  assert.deepEqual(got, [{ id: DRAFT, bytes: draftBytes }])
  assert.deepEqual(opened[0], [DRAFT, { accountId: ACCOUNT }])
})

test('a draft picture is left out with no reader, no account, a changed hash or a throwing reader', async () => {
  const pool = { query: noSql }
  assert.deepEqual(await briefPictureBytes({ pool, objects: null }, rows, ACCOUNT), [])
  assert.deepEqual(await briefPictureBytes({ pool, objects: null, openDraftPicture }, rows, null), [])
  const changed = [{ id: DRAFT, sha256: sha(Buffer.from('another')), origin: 'draft' }]
  assert.deepEqual(await briefPictureBytes({ pool, objects: null, openDraftPicture }, changed, ACCOUNT), [])
  const boom = async () => {
    throw new Error('store down')
  }
  assert.deepEqual(
    await briefPictureBytes({ pool, objects: null, openDraftPicture: boom }, rows, ACCOUNT),
    []
  )
})

test('draft and own pictures mix: only the own id is looked up in wo_media', async () => {
  const pool = {
    query: async (sql, params) => {
      assert.match(sql, /from wo_media/)
      assert.deepEqual(params[0], [OWN])
      return { rows: [{ id: OWN, sha256: sha(ownBytes), object_key: 'k-own' }] }
    }
  }
  const objects = { get: async () => new Response(ownBytes) }
  const mixed = [...rows.slice(0, 1), { id: OWN, sha256: sha(ownBytes), origin: 'own' }]
  const got = await briefPictureBytes({ pool, objects, openDraftPicture }, mixed, ACCOUNT)
  assert.deepEqual(got.map((p) => p.id).sort(), [DRAFT, OWN].sort())
})

test('the owner photo reader counts a draft manifest entry as the owner own picture and opens it as a draft', async () => {
  opened.length = 0
  const pool = {
    query: async (sql) => {
      if (/from wo_revision/.test(sql))
        return {
          rows: [{ account_id: ACCOUNT, asset_manifest: [{ id: DRAFT, origin: 'draft', credit: null }] }]
        }
      throw new Error(`unexpected query ${sql}`)
    }
  }
  const row = {
    brief: { assets: [{ id: DRAFT, kind: 'image', sha256: sha(draftBytes) }] },
    photo_source: { kind: 'revision', revisionId: '11111111-2222-4333-8444-555555555555' }
  }
  const got = await ownerPhotoBytes({ pool, objects: null, store: null, openDraftPicture }, row)
  assert.deepEqual(got.get(DRAFT), draftBytes)
  assert.deepEqual(opened, [[DRAFT, { accountId: ACCOUNT }]])
})
