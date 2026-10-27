/**
 * The brief's photographs are labelled when the brief is made (F08), with the build's batched vision call and its shared
 * cache: at most a fixed number of pictures, the logo never sent, a later run (or build) paying nothing again, and a
 * failure that leaves the pictures unlabelled and says so instead of failing the brief.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'

import { visionKey } from '../src/lib/picture-vision.js'
import { createBriefPictureLabels } from '../src/opportunities-build/brief-picture-labels.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const sha = (b) => createHash('sha256').update(b).digest('hex')
const jpeg = (i, width = 1200, height = 800) =>
  sharp({
    create: { width, height, channels: 3, background: { r: (i * 37) % 255, g: (i * 91) % 255, b: 120 } }
  })
    .jpeg()
    .toBuffer()

const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const VISION = { door: DOOR, key: visionKey(DOOR) }

function store() {
  const files = new Map()
  return { files, get: async (key) => (files.has(key) ? new Response(files.get(key)) : null) }
}

/** A fake `labelWithVision`: one call per 8 pictures, each labelled venue-exterior; counts what it was sent. */
function fakeLabel() {
  const sent = []
  const label = async ({ pictures }) => {
    sent.push(...pictures.map((p) => p.id))
    return {
      labels: new Map(
        pictures.map((p) => [
          p.id,
          { subject: 'exterior', content: 'venue-exterior', caption: `Photo ${p.id}` }
        ])
      ),
      usage: { calls: Math.ceil(pictures.length / 8), promptTokens: 10, completionTokens: 5, requests: [] },
      failed: 0
    }
  }
  return { sent, label }
}

/** `n` stored place pictures of the fictional Harbour Sport Club, as a brief read holds them (origin place). */
async function seedPlace(pool, objects, n) {
  const placeId = (
    await pool.query(`insert into wo_place (display_name) values ('Harbour Sport Club') returning id`)
  ).rows[0].id
  const media = []
  for (let i = 0; i < n; i += 1) {
    const bytes = await jpeg(i)
    const key = `places/${placeId}/${sha(bytes)}.jpg`
    objects.files.set(key, bytes)
    const row = (
      await pool.query(
        `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, width, height, kind, category,
           source, source_url)
         values ($1, $2, $3, 'stored', 'image/jpeg', $4, 1200, 800, 'image', 'other', 'google-places', $5) returning *`,
        [placeId, sha(bytes), key, bytes.length, `https://photos.test/hsc-${i}.jpg`]
      )
    ).rows[0]
    media.push({
      id: row.id,
      origin: 'place',
      kind: 'image',
      category: 'other',
      sha256: row.sha256,
      width: 1200,
      height: 800,
      source: 'google-places',
      sourceUrl: row.source_url,
      labels: null
    })
  }
  return media
}

test(
  'labels at most the cap of photographs, never the logo, and a second run pays nothing',
  opts,
  async () => {
    const objects = store()
    const media = await seedPlace(db.pool, objects, 30)
    const brand = { logo: media[0].id }
    const { sent, label } = fakeLabel()
    const charged = []
    const labelPictures = createBriefPictureLabels({
      pool: db.pool,
      objects,
      visionFor: async () => VISION,
      label,
      chargeable: async (spec, invoke) => {
        charged.push(spec)
        return invoke()
      },
      maxPictures: 24
    })
    const first = await labelPictures({ media, brand, accountId: null, trade: 'fitness' })
    assert.equal(sent.length, 24)
    assert.ok(!sent.includes(media[0].id), 'the logo is never sent')
    assert.equal(charged.length, 1)
    assert.equal(charged[0].purpose, 'picture-labels')
    assert.equal(first.labels.size, 24)
    assert.deepEqual(first.labels.get(sent[0]), {
      key: VISION.key,
      model: 'model-x',
      labels: { subject: 'exterior', content: 'venue-exterior', caption: `Photo ${sent[0]}` }
    })
    const { unlabelled, ...counts } = first.note
    assert.deepEqual(counts, { status: 'labelled', asked: 24, labelled: 24, cached: 0, max: 24 })
    // The pictures never shown say why: the logo, and the five past the cap.
    assert.equal(unlabelled[media[0].id], 'not_a_photograph')
    assert.equal(Object.values(unlabelled).filter((r) => r === 'over_cap').length, 5)
    const { rows } = await db.pool.query(
      `select count(*)::int as n from wo_media_analysis where model = 'model-x' and version = $1 and state = 'done'`,
      [VISION.key]
    )
    assert.equal(rows[0].n, 24)

    const again = fakeLabel()
    const second = await createBriefPictureLabels({
      pool: db.pool,
      objects,
      visionFor: async () => VISION,
      label: again.label,
      maxPictures: 24
    })({ media, brand, accountId: null, trade: 'fitness' })
    assert.equal(again.sent.length, 0)
    assert.equal(second.labels.size, 24)
    assert.deepEqual(
      { ...second.note, unlabelled: undefined },
      { status: 'cached', asked: 0, labelled: 0, cached: 24, max: 24, unlabelled: undefined }
    )
  }
)

test("an opportunity's own picture keeps its label on its row, as a build does", opts, async () => {
  const objects = store()
  const account = (
    await db.pool.query(`insert into account (email) values ('owner@tracy.test') returning id`)
  ).rows[0].id
  const opp = (
    await db.pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Harbour Sport Club', 'osm', 'node/1', '{}'::jsonb) returning id`,
      [account]
    )
  ).rows[0].id
  const bytes = await jpeg(3)
  const key = `opportunities/${account}/${opp}/${sha(bytes)}.jpg`
  objects.files.set(key, bytes)
  const row = (
    await db.pool.query(
      `insert into wo_media (account_id, opportunity_id, sha256, object_key, status, mime, bytes, width, height, kind,
         category, source, source_url)
       values ($1, $2, $3, $4, 'stored', 'image/jpeg', $5, 1200, 800, 'image', 'other', 'instagram', 'https://cdn.test/a.jpg')
       returning *`,
      [account, opp, sha(bytes), key, bytes.length]
    )
  ).rows[0]
  const { label } = fakeLabel()
  const out = await createBriefPictureLabels({
    pool: db.pool,
    objects,
    visionFor: async () => VISION,
    label
  })({
    media: [{ id: row.id, kind: 'image', sha256: row.sha256, width: 1200, height: 800, labels: null }],
    brand: null,
    accountId: account,
    trade: 'fitness'
  })
  assert.equal(out.labels.get(row.id).labels.content, 'venue-exterior')
  const held = (await db.pool.query('select labels from wo_media where id = $1', [row.id])).rows[0].labels
  assert.equal(held.vision.key, VISION.key)
  assert.equal(held.vision.labels.content, 'venue-exterior')
})

test('a vision failure labels nothing, frees its claims for a later build, and says why', opts, async () => {
  const objects = store()
  const media = await seedPlace(db.pool, objects, 3)
  const warned = []
  const out = await createBriefPictureLabels({
    pool: db.pool,
    objects,
    visionFor: async () => VISION,
    label: async () => {
      throw Object.assign(new Error('the vision model answered 503'), { code: 'LLM_HTTP_503' })
    },
    log: { warn: (...a) => warned.push(a) }
  })({ media, brand: null, accountId: null, trade: 'fitness' })
  assert.equal(out.labels.size, 0)
  assert.deepEqual(out.note, {
    status: 'failed',
    asked: 3,
    labelled: 0,
    cached: 0,
    max: 24,
    reason: 'LLM_HTTP_503',
    unlabelled: Object.fromEntries(media.map((m) => [m.id, 'vision_failed']))
  })
  assert.equal(warned.length, 1)
  const { rows } = await db.pool.query(`select distinct state from wo_media_analysis`)
  assert.deepEqual(
    rows.map((r) => r.state),
    ['failed']
  )
})

test('without a vision model nothing is asked and the brief says so', opts, async () => {
  const out = await createBriefPictureLabels({
    pool: db.pool,
    objects: store(),
    visionFor: async () => null
  })({
    media: [{ id: 'a', kind: 'image', sha256: 'a'.repeat(64), width: 1200, height: 800 }],
    brand: null,
    accountId: null,
    trade: null
  })
  assert.equal(out.labels.size, 0)
  assert.deepEqual(out.note, {
    status: 'off',
    asked: 0,
    labelled: 0,
    cached: 0,
    max: 24,
    reason: 'no_vision_model',
    unlabelled: { a: 'no_vision_model' }
  })
})
