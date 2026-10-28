/**
 * Vision labelling v2 coverage (#48): every photo the business published is labelled and customer photos fill up to 60 in
 * total, own photos first; the brief's closed list goes to the model; a second run with the same list asks nothing, and a
 * label made against another list is asked again. Fixtures are fictional (the Lantern Hill Racquet Club).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'

import { visionKey } from '../src/lib/picture-vision.js'
import { createBriefPictureLabels } from '../src/opportunities-build/brief-picture-labels.js'
import { closedListDigest } from 'website-opportunities/domain/pictures/picture-links.mjs'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const NAME = 'Lantern Hill Racquet Club'
const sha = (b) => createHash('sha256').update(b).digest('hex')
const jpeg = (i, width, height) =>
  sharp({
    create: { width, height, channels: 3, background: { r: i % 255, g: (i * 7) % 255, b: (i * 13) % 255 } }
  })
    .jpeg()
    .toBuffer()
const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const VISION = { door: DOOR, key: visionKey(DOOR) }
const LIST = {
  offerings: [
    { id: 'se_tennis', label: 'Tennis class' },
    { id: 'se_padel', label: 'Padel class' }
  ],
  people: [{ id: 'te_mara', label: 'Mara Okonkwo' }]
}

function store() {
  const files = new Map()
  return { files, get: async (key) => (files.has(key) ? new Response(files.get(key)) : null) }
}

/** A fake `labelWithVision` that records the pictures and the closed list it was sent, labelling as the real one holds. */
function fakeLabel() {
  const sent = []
  const lists = []
  const label = async ({ pictures, closedList }) => {
    sent.push(...pictures.map((p) => p.id))
    lists.push(closedList)
    const digest = closedListDigest(closedList)
    return {
      labels: new Map(
        pictures.map((p) => [
          p.id,
          {
            subject: 'interior',
            content: 'venue-interior',
            depicts: 'general',
            ...(digest ? { closedList: digest } : {})
          }
        ])
      ),
      usage: { calls: Math.ceil(pictures.length / 8), promptTokens: 1, completionTokens: 1, requests: [] },
      failed: 0
    }
  }
  return { sent, lists, label }
}

/** Stored place pictures, each `{source, credit?, width, height}`, as a brief read holds them (origin place). */
async function seed(objects, specs) {
  const placeId = (
    await db.pool.query(`insert into wo_place (display_name) values ($1) returning id`, [NAME])
  ).rows[0].id
  const media = []
  for (const [i, spec] of specs.entries()) {
    const bytes = await jpeg(i, spec.width, spec.height)
    const key = `places/${placeId}/${sha(bytes)}.jpg`
    objects.files.set(key, bytes)
    const row = (
      await db.pool.query(
        `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, width, height, kind, category,
           source, source_url)
         values ($1, $2, $3, 'stored', 'image/jpeg', $4, $5, $6, 'image', 'other', $7, $8) returning *`,
        [
          placeId,
          sha(bytes),
          key,
          bytes.length,
          spec.width,
          spec.height,
          spec.source,
          `https://photos.test/lh-${i}.jpg`
        ]
      )
    ).rows[0]
    media.push({
      id: row.id,
      origin: 'place',
      kind: 'image',
      category: 'other',
      sha256: row.sha256,
      width: spec.width,
      height: spec.height,
      source: spec.source,
      ...(spec.credit ? { credit: spec.credit } : {}),
      labels: null
    })
  }
  return media
}

const own = (n) => Array.from({ length: n }, () => ({ source: 'website', width: 600, height: 500 }))
// Guests' review photos, larger than the business's own: size never puts them first.
const guests = (n) =>
  Array.from({ length: n }, () => ({
    source: 'google-maps',
    credit: { provider: 'Google', photoSource: 'review', authors: [] },
    width: 2400,
    height: 1600
  }))

test(
  "up to 60 photos are labelled, the business's own first, customers only in what is left",
  opts,
  async () => {
    const objects = store()
    const media = await seed(objects, [...guests(20), ...own(50)])
    const { sent, lists, label } = fakeLabel()
    const out = await createBriefPictureLabels({
      pool: db.pool,
      objects,
      visionFor: async () => VISION,
      label
    })({
      media,
      brand: null,
      accountId: null,
      trade: 'fitness',
      closedList: LIST,
      businessName: NAME
    })
    assert.equal(sent.length, 60)
    const ownIds = new Set(media.filter((m) => m.source === 'website').map((m) => m.id))
    assert.equal(sent.filter((id) => ownIds.has(id)).length, 50, 'every own photo')
    assert.equal(out.note.max, 60)
    assert.equal(Object.values(out.note.unlabelled ?? {}).filter((r) => r === 'over_cap').length, 10)
    assert.ok(
      lists.every((l) => l === LIST),
      'the closed list goes to the model'
    )
  }
)

test('every own photo is labelled even past 60; no customer photo then', opts, async () => {
  const objects = store()
  const media = await seed(objects, [...guests(3), ...own(62)])
  const { sent, label } = fakeLabel()
  await createBriefPictureLabels({ pool: db.pool, objects, visionFor: async () => VISION, label })({
    media,
    brand: null,
    accountId: null,
    trade: 'fitness',
    closedList: LIST,
    businessName: NAME
  })
  assert.equal(sent.length, 62)
  assert.ok(sent.every((id) => media.find((m) => m.id === id).source === 'website'))
})

test(
  'a Google photo its author posted as the business counts as its own, before an unknown one',
  opts,
  async () => {
    const objects = store()
    const asBusiness = {
      provider: 'Google',
      authors: [{ displayName: NAME, uri: 'https://maps.example.test/c/1' }]
    }
    const media = await seed(objects, [
      {
        source: 'google-places',
        width: 3000,
        height: 2000,
        credit: { provider: 'Google', authors: [{ displayName: 'Pat Visitor' }] }
      },
      { source: 'google-places', width: 700, height: 500, credit: asBusiness }
    ])
    const { sent, label } = fakeLabel()
    await createBriefPictureLabels({
      pool: db.pool,
      objects,
      visionFor: async () => VISION,
      label,
      maxPictures: 1
    })({ media, brand: null, accountId: null, trade: 'fitness', closedList: LIST, businessName: NAME })
    assert.deepEqual(sent, [media[1].id])
  }
)

test(
  'a second run on the same photos and list makes no model call; another list asks again',
  opts,
  async () => {
    const objects = store()
    const media = await seed(objects, own(5))
    const make = (label) =>
      createBriefPictureLabels({ pool: db.pool, objects, visionFor: async () => VISION, label })
    const input = {
      media,
      brand: null,
      accountId: null,
      trade: 'fitness',
      closedList: LIST,
      businessName: NAME
    }
    const first = fakeLabel()
    await make(first.label)(input)
    assert.equal(first.sent.length, 5)
    const second = fakeLabel()
    const again = await make(second.label)(input)
    assert.equal(second.sent.length, 0)
    assert.equal(again.note.status, 'cached')
    assert.equal(again.labels.size, 5)
    // The brief gained an offering: the links were made against another list, so the photos are asked again.
    const third = fakeLabel()
    const grown = { ...LIST, offerings: [...LIST.offerings, { id: 'se_camp', label: 'Junior tennis camp' }] }
    await make(third.label)({ ...input, closedList: grown })
    assert.equal(third.sent.length, 5)
    const fourth = fakeLabel()
    await make(fourth.label)({ ...input, closedList: grown })
    assert.equal(fourth.sent.length, 0)
  }
)
