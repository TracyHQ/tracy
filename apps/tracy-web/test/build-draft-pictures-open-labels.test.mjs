// A draft picture opens with the labels its row keeps (#609), so a later build can reuse what the draft paid for.
// There is no owner upload path in the build chat yet, so nothing marks an uploaded picture. Invented club.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-pictures-open-labels.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createDraftPictures } from '../src/build-draft/pictures.js'
import { createDraft } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const RUN = '44444444-4444-4444-8444-444444444444'
const BYTES = Buffer.from('invented picture bytes')

async function seed(labels) {
  const { id: accountId } = await ensureAccount(db.pool, 'owner@larkfen-racquets.example')
  await createDraft(db.pool, accountId)
  const sha = 'c'.repeat(64)
  const { rows } = await db.pool.query(
    `insert into build_draft_picture (account_id, research_run, kind, source, source_url, sha256, object_key, mime,
       bytes, width, height, labels)
     values ($1, $2, 'image', 'website', 'https://larkfen-racquets.example/p.jpg', $3, $4, 'image/jpeg', $5,
       1200, 800, $6::jsonb) returning id`,
    [
      accountId,
      RUN,
      sha,
      `build-drafts/${accountId}/${sha}.jpg`,
      BYTES.length,
      labels && JSON.stringify(labels)
    ]
  )
  return { accountId, id: rows[0].id }
}
const picturesOf = () =>
  createDraftPictures({
    pool: db.pool,
    objects: { get: async () => new Response(BYTES) },
    mediaStoreOf: () => ({}),
    withinTime: async (run) => run()
  })

test('a stored picture opens with its labels', opts, async () => {
  const labels = { subject: 'tennis court', people: false }
  const { accountId, id } = await seed(labels)
  const opened = await picturesOf().open(id, { accountId })
  assert.deepEqual(opened.labels, labels)
  assert.deepEqual(opened.bytes, BYTES)
})

test('a picture with no labels opens with none, not a made up set', opts, async () => {
  const { accountId, id } = await seed(null)
  assert.equal((await picturesOf().open(id, { accountId })).labels, null)
})
