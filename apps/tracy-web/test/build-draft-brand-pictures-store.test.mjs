// The brand step's pictures in the draft picture store (#575, P1 of the brand audit): stored once per bytes, opened
// by id with their hash checked, kept by the prune of a newer research while the draft's brand file (or an approved
// build's, until it ends) names them, and gone once no brand file does. An approved build keeps the brand file in its
// snapshot. Invented club, invented bytes.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-brand-pictures-store.test.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { approveBuild } from '../src/build-draft/build-store.js'
import { createDraftPictures } from '../src/build-draft/pictures.js'
import { createDraft } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const LOGO = Buffer.from('invented light logo bytes')
const OTHER_RUN = '55555555-5555-4555-8555-555555555555'

function memoryObjects() {
  const kept = new Map()
  return {
    kept,
    put: async (key, bytes) => (kept.set(key, Buffer.from(bytes)), true),
    get: async (key) => (kept.has(key) ? new Response(kept.get(key)) : null),
    delete: async (key) => kept.delete(key)
  }
}

async function seed() {
  const { id: accountId } = await ensureAccount(db.pool, 'owner@fernway-boxing.example')
  await createDraft(db.pool, accountId)
  const objects = memoryObjects()
  return { accountId, objects, pictures: createDraftPictures({ pool: db.pool, objects }) }
}
const keep = (pictures, accountId, bytes = LOGO) =>
  pictures.keepBrand(accountId, { bytes, sha256: sha256(bytes), mime: 'image/png', name: 'spots/a.png' })
const setBrand = (accountId, id) =>
  db.pool.query('update build_draft set brand = $2::jsonb where account_id = $1', [
    accountId,
    id === null
      ? null
      : JSON.stringify({
          record: { schema: 'tracy-brand-look/v1' },
          template: { slug: 'ja-boxing', version: '1.0.11' },
          file: { kit: 'ja-boxing@1.0.11', pictures: { 'spots/a.png': { id, sha256: sha256(LOGO) } } }
        })
  ])

test('a brand picture is stored once per bytes and opens by its id, hash checked', opts, async () => {
  const { accountId, pictures, objects } = await seed()
  const id = await keep(pictures, accountId)
  assert.match(id, /^[0-9a-f-]{36}$/)
  assert.equal(await keep(pictures, accountId), id, 'the same bytes, the same row')
  assert.equal(objects.kept.size, 1)
  const opened = await pictures.open(id, { accountId, hash: sha256 })
  assert.deepEqual(opened.bytes, LOGO)
  assert.equal(opened.mime, 'image/png')
  const { rows } = await db.pool.query('select category, source from build_draft_picture where id = $1', [id])
  assert.deepEqual(rows[0], { category: 'brand', source: 'brand-step' })
})

test(
  'the prune of a newer research keeps the pictures the brand file names, and drops them once it names none',
  opts,
  async () => {
    const { accountId, pictures } = await seed()
    const id = await keep(pictures, accountId)
    await setBrand(accountId, id)
    assert.equal(await pictures.prune(accountId, OTHER_RUN), 0, 'kept: the brand file names it')
    await setBrand(accountId, null)
    assert.equal(await pictures.prune(accountId, OTHER_RUN), 1, 'gone with the brand record')
  }
)

test(
  'an approved build keeps the brand file in its snapshot, and its pictures while it runs',
  opts,
  async () => {
    const { accountId, pictures } = await seed()
    const id = await keep(pictures, accountId)
    await setBrand(accountId, id)
    const plan = { id: 'plan-1', revision: 1, pages: [{ id: 'home', blocks: [] }] }
    await db.pool.query(
      'update build_draft set plan = $2::jsonb, needs_profile = $3::jsonb where account_id = $1',
      [accountId, JSON.stringify(plan), JSON.stringify({ facts: {} })]
    )
    const approved = await approveBuild(db.pool, accountId, { plan: { id: 'plan-1', revision: 1 } })
    assert.equal(approved.created, true)
    assert.equal(approved.build.snapshot.brand.file.pictures['spots/a.png'].id, id)
    assert.deepEqual(approved.build.snapshot.brand.template, { slug: 'ja-boxing', version: '1.0.11' })
    // A newer research drops the living brand record; the running build still names the picture.
    await setBrand(accountId, null)
    assert.equal(await pictures.prune(accountId, OTHER_RUN), 0)
  }
)
