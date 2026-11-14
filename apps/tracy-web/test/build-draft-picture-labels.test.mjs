/**
 * A build draft's own pictures keep their vision labels on their own row (#610): an approved build reads the labels the
 * draft already paid for, and a picture the model gave no label for keeps why. Fictional Larkfen Racquet Club.
 *
 *   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-picture-labels.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'

import { labelWithVision, visionKey } from '../src/lib/picture-vision.js'
import { createBriefPictureLabels } from '../src/opportunities-build/brief-picture-labels.js'
import { createDraft } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const RUN = '33333333-3333-4333-8333-333333333333'
const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const VISION = { door: DOOR, key: visionKey(DOOR) }
const challengeFor = async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })

async function seed() {
  const { id: accountId } = await ensureAccount(db.pool, 'owner@larkfen-racquets.example')
  await createDraft(db.pool, accountId)
  const bytes = new Map()
  const media = []
  for (const i of [0, 1]) {
    const b = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 40 * i, g: 90, b: 60 } }
    })
      .jpeg()
      .toBuffer()
    const sha = createHash('sha256').update(b).digest('hex')
    const row = (
      await db.pool.query(
        `insert into build_draft_picture (account_id, research_run, kind, category, source, source_url, sha256, object_key,
           mime, bytes, width, height)
         values ($1, $2, 'image', 'other', 'website', $3, $4, $5, 'image/jpeg', $6, 1200, 800) returning *`,
        [
          accountId,
          RUN,
          `https://larkfen-racquets.example/p${i}.jpg`,
          sha,
          `build-drafts/${sha}.jpg`,
          b.length
        ]
      )
    ).rows[0]
    bytes.set(row.id, b)
    media.push({
      id: row.id,
      origin: 'draft',
      kind: 'image',
      category: 'other',
      sha256: sha,
      width: 1200,
      height: 800
    })
  }
  return { accountId, media, bytes }
}

test('a draft picture keeps its label, and the reason it got none, on its own row', opts, async () => {
  const { accountId, media, bytes } = await seed()
  const fetchImpl = async (_url, init) => {
    const asked = JSON.parse(init.body)
      .messages[0].content.filter((c) => c.type === 'text' && c.text.startsWith('Picture id: '))
      .map((c) => c.text.slice(12))
    // The model labels the first picture only; the second is left out of its answer.
    const pictures = asked
      .filter((id) => id === media[0].id)
      .map((id) => ({
        id,
        subject: 'people',
        content: 'people-in-action',
        caption: 'Two players at the net.'
      }))
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ pictures, imageCode: 'ABC12345' }) } }]
      })
    )
  }
  const out = await createBriefPictureLabels({
    pool: db.pool,
    objects: null,
    openDraftPicture: async (id) =>
      bytes.has(id)
        ? { bytes: bytes.get(id), mime: 'image/jpeg', sha256: media.find((m) => m.id === id).sha256 }
        : null,
    visionFor: async () => VISION,
    observe: null,
    label: (args) => labelWithVision({ ...args, challengeFor, fetchImpl }),
    chargeable: async (_spec, invoke) => invoke(),
    log: { warn() {} }
  })({ media, brand: {}, accountId, trade: 'fitness' })
  assert.equal(out.labels.size, 1, JSON.stringify(out.note))
  const { rows } = await db.pool.query(
    'select id, labels from build_draft_picture where account_id = $1 order by id = $2 desc',
    [accountId, media[0].id]
  )
  assert.equal(rows[0].labels.vision.key, VISION.key)
  assert.ok(rows[0].labels.vision.labels)
  assert.equal(rows[1].labels?.vision, undefined)
  assert.equal(rows[1].labels?.visionUnanswered?.key, VISION.key)
})
