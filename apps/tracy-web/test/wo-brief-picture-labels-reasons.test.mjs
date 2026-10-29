/**
 * A coaching business's brief (fictional Harbour Sport Club): 19 photographs, a logo and 10 videos. The call holding the
 * eight largest photographs fails; the brief sends it once more inside its budget, and when it fails again the brief
 * says "partial", counts what failed and names the reason on every picture left unlabelled (F08).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'

import { labelWithVision, visionContentKey, visionKey } from '../src/lib/picture-vision.js'
import { labelThenRead as createBriefPictureLabels } from './_photo-labels.mjs'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const sha = (b) => createHash('sha256').update(b).digest('hex')
const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const VISION = { door: DOOR, key: visionKey(DOOR) }
const challengeFor = async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })

/** The pictures as a brief read holds them: 8 large portraits, 11 phone-sized ones, the logo and 10 videos. */
async function seed(pool) {
  const objects = new Map()
  const placeId = (
    await pool.query(`insert into wo_place (display_name) values ('Harbour Sport Club') returning id`)
  ).rows[0].id
  const sizes = [
    ...Array.from({ length: 8 }, (_, i) => [1200 + i * 40, 2133]),
    ...Array.from({ length: 11 }, () => [360, 640]),
    [1080, 1080]
  ]
  const media = []
  for (const [i, [w, h]] of sizes.entries()) {
    const bytes = await sharp({
      create: { width: w, height: h, channels: 3, background: { r: i * 9, g: 80, b: 140 } }
    })
      .jpeg()
      .toBuffer()
    const key = `places/${placeId}/${sha(bytes)}.jpg`
    objects.set(key, bytes)
    const row = (
      await pool.query(
        `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, width, height, kind, category,
           source, source_url)
         values ($1, $2, $3, 'stored', 'image/jpeg', $4, $5, $6, 'image', 'other', 'instagram', $7) returning *`,
        [placeId, sha(bytes), key, bytes.length, w, h, `https://cdn.test/hsc-${i}.jpg`]
      )
    ).rows[0]
    media.push({
      id: row.id,
      origin: 'place',
      kind: 'image',
      category: 'other',
      sha256: row.sha256,
      width: w,
      height: h
    })
  }
  for (let i = 0; i < 10; i += 1)
    media.push({ id: `video-${i}`, origin: 'place', kind: 'video', category: 'other', sha256: sha(`v${i}`) })
  const store = { get: async (k) => (objects.has(k) ? new Response(objects.get(k)) : null) }
  return { media, store, logo: media[19].id, large: media.slice(0, 8).map((m) => m.id) }
}

/** The real batched call, with a model that fails the call holding the large photographs `failures` times. */
function model(large, failures) {
  const calls = []
  let left = failures
  const fetchImpl = async (_url, init) => {
    const asked = JSON.parse(init.body)
      .messages[0].content.filter((c) => c.type === 'text' && c.text.startsWith('Picture id: '))
      .map((c) => c.text.slice(12))
    calls.push(asked)
    if (asked.includes(large[0]) && left > 0) {
      left -= 1
      return new Response('upstream timeout', { status: 504 })
    }
    const pictures = asked.map((id) => ({
      id,
      subject: 'people',
      content: 'people-in-action',
      caption: 'A coach on a court.'
    }))
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ pictures, imageCode: 'ABC12345' }) } }]
      })
    )
  }
  return { calls, label: (args) => labelWithVision({ ...args, challengeFor, fetchImpl }) }
}

const run = async (seeded, label, charged = []) =>
  createBriefPictureLabels({
    pool: db.pool,
    objects: seeded.store,
    visionFor: async () => VISION,
    label,
    chargeable: async (spec, invoke) => {
      charged.push(spec)
      return invoke()
    },
    log: { warn() {} }
  })({ media: seeded.media, brand: { logo: seeded.logo }, accountId: null, trade: 'fitness' })

test(
  'a failed call of the largest photographs is sent once more and every photograph is labelled',
  opts,
  async () => {
    const seeded = await seed(db.pool)
    const { calls, label } = model(seeded.large, 1)
    const charged = []
    const out = await run(seeded, label, charged)
    assert.equal(out.labels.size, 19)
    assert.equal(calls.length, 4)
    assert.equal(out.note.status, 'labelled')
    assert.equal(out.note.labelled, 19)
    // Each batch's budget names both rounds: its call and its retry.
    const batches = charged.filter((c) => c.purpose === 'picture-labels')
    assert.equal(batches.length, 3)
    assert.ok(batches.every((c) => c.maxCents === batches[0].maxCents && c.maxCents % 2 === 0))
    // Only what was never shown says why: the logo and the videos.
    assert.equal(out.note.unlabelled[seeded.logo], 'not_a_photograph')
    assert.equal(out.note.unlabelled['video-0'], 'video')
    assert.equal(Object.keys(out.note.unlabelled).length, 11)
  }
)

test(
  'a call that fails twice leaves a partial labelling that names the reason on every picture',
  opts,
  async () => {
    const seeded = await seed(db.pool)
    const { calls, label } = model(seeded.large, 2)
    const out = await run(seeded, label)
    assert.equal(calls.length, 4, 'the retry is one round, never more')
    assert.equal(out.labels.size, 11)
    assert.equal(out.note.status, 'partial')
    assert.equal(out.note.asked, 19)
    assert.equal(out.note.labelled, 11)
    assert.equal(out.note.failed, 8)
    assert.equal(out.note.reason, 'http_error')
    for (const id of seeded.large) assert.equal(out.note.unlabelled[id], 'http_error')
    // Their claims go back: a later build asks again.
    const { rows } = await db.pool.query(
      `select state, count(*)::int as n from wo_media_analysis where version = $1 group by state order by state`,
      [visionContentKey(DOOR)]
    )
    assert.deepEqual(
      rows.map((r) => [r.state, r.n]),
      [
        ['done', 11],
        ['failed', 8]
      ]
    )
  }
)
