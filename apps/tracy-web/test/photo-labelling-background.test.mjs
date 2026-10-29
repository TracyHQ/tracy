/**
 * Photos are labelled beside the research, not in a request (item 27): content labels per sha256 in batches of 8, four
 * in flight, saved after every batch; links to the brief's closed list as a cheap text step that alone runs again when
 * the list changes; a build that waits while the labelling moves and goes on once it settles or stalls.
 * Fictional businesses only: the Copper Ladle Kitchen (150 dishes, 300 photos) and the Northgate Family Clinic
 * (40 services, 60 photos). Fake models answer with recorded latencies; no network.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'

import { visionContentKey, visionKey } from '../src/lib/picture-vision.js'
import { createBriefPictureLabels } from '../src/opportunities-build/brief-picture-labels.js'
import {
  PHOTO_LABEL_STALL_MS,
  createPhotoLabelling,
  photosToLabel
} from '../src/opportunities-build/photo-labelling.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const sha = (b) => createHash('sha256').update(b).digest('hex')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Recorded latencies of a vision batch (ms, scaled down a thousand times): the fake replays them in turn. */
const BATCH_LATENCIES = [41, 63, 38, 55, 72, 47, 59, 44]
/** Recorded latency of a text link call (ms, scaled). */
const LINK_LATENCY = 9

/** A fake content labeller: counts calls and the most batches in flight at once; never sees a closed list. */
function fakeVision({ hang = false } = {}) {
  const calls = []
  let inFlight = 0
  let most = 0
  const label = async (input) => {
    calls.push({
      ids: input.pictures.map((p) => p.id),
      closedList: input.closedList ?? null,
      trade: input.trade
    })
    inFlight += 1
    most = Math.max(most, inFlight)
    try {
      if (hang) await new Promise(() => {})
      await sleep(BATCH_LATENCIES[calls.length % BATCH_LATENCIES.length] / 4)
      return {
        labels: new Map(
          input.pictures.map((p) => [
            p.id,
            {
              subject: 'food',
              content: 'food',
              oneLine: `plate ${p.id}`,
              caption: `A plate (${p.id})`,
              depicts: 'general'
            }
          ])
        ),
        usage: { calls: 1, promptTokens: 10, completionTokens: 5, requests: [] },
        failed: 0
      }
    } finally {
      inFlight -= 1
    }
  }
  return { calls, label, most: () => most }
}

/** A fake text linker: links every photo to the first offering of the list it was handed. */
function fakeLink() {
  const calls = []
  const link = async ({ items, closedList }) => {
    calls.push({ n: items.length, first: closedList?.offerings?.[0]?.id ?? null })
    await sleep(LINK_LATENCY)
    const { mergedLabel } = await import('../src/lib/picture-link-text.js')
    return {
      labels: new Map(
        items.map((i) => [
          i.id,
          mergedLabel(i.content, { depicts: closedList?.offerings?.[0]?.id }, closedList)
        ])
      ),
      usage: { calls: 1, promptTokens: 3, completionTokens: 2, requests: [] },
      failed: 0
    }
  }
  return { calls, link }
}

function store() {
  const files = new Map()
  return { files, get: async (key) => (files.has(key) ? new Response(files.get(key)) : null) }
}

/** `n` stored place photos of a fictional business, as its research holds them. */
async function seedPlace(pool, objects, name, n) {
  const placeId = (await pool.query(`insert into wo_place (display_name) values ($1) returning id`, [name]))
    .rows[0].id
  const media = []
  for (let i = 0; i < n; i += 1) {
    const bytes = Buffer.from(`${name} photo ${i}`)
    const key = `places/${placeId}/${sha(bytes)}.jpg`
    objects.files.set(key, bytes)
    // Larger photos first in labelling order: the width falls with i.
    const width = 2000 - i
    const row = (
      await pool.query(
        `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, width, height, kind, category,
           source, source_url)
         values ($1, $2, $3, 'stored', 'image/jpeg', $4, $5, 900, 'image', 'other', 'google-places', $6) returning *`,
        [placeId, sha(bytes), key, bytes.length, width, `https://photos.test/${i}.jpg`]
      )
    ).rows[0]
    media.push({
      id: row.id,
      origin: 'place',
      kind: 'image',
      category: 'other',
      sha256: row.sha256,
      width,
      height: 900,
      source: 'google-places',
      sourceUrl: row.source_url,
      labels: null
    })
  }
  return media
}

const listOf = (prefix, n) => ({
  offerings: Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, label: `${prefix} item ${i}` })),
  people: []
})

function labeller(pool, objects, subject, extra = {}) {
  const vision = extra.vision ?? fakeVision()
  const linker = extra.linker ?? fakeLink()
  const service = createPhotoLabelling({
    pool,
    objects,
    visionFor: async () => DOOR,
    readPhotos: async () => subject.current,
    label: vision.label,
    link: linker.link,
    log: { warn() {} },
    ...(extra.now ? { now: extra.now } : {})
  })
  return { service, vision, linker }
}

const ACCOUNT = '00000000-0000-4000-8000-0000000000a1'
const OPP = '00000000-0000-4000-8000-0000000000b1'

test(
  'a restaurant with 300 photos: content labels in batches of 8, four in flight, each linked to its 150 dishes',
  opts,
  async () => {
    const objects = store()
    const media = await seedPlace(db.pool, objects, 'Copper Ladle Kitchen', 300)
    const subject = {
      current: { media, closedList: listOf('dish', 150), businessName: 'Copper Ladle Kitchen' }
    }
    const { service, vision, linker } = labeller(db.pool, objects, subject)
    await service.run({ accountId: ACCOUNT, opportunityId: OPP })
    assert.equal(vision.calls.length, 38, 'ceil(300 / 8) vision calls')
    assert.ok(vision.calls.every((c) => c.ids.length <= 8))
    assert.equal(vision.most(), 4, 'four batches in flight at most')
    assert.ok(
      vision.calls.every((c) => c.closedList === null && !c.trade),
      'the content prompt carries no list and no trade'
    )
    const content = await db.pool.query(
      `select count(*)::int as n from wo_media_analysis where version = $1 and state = 'done'`,
      [visionContentKey(DOOR)]
    )
    assert.equal(content.rows[0].n, 300)
    const merged = await db.pool.query(
      `select result from wo_media_analysis where version = $1 and state = 'done'`,
      [visionKey(DOOR)]
    )
    assert.equal(merged.rows.length, 300)
    assert.ok(merged.rows.every((r) => r.result.depicts === 'dish-0' && r.result.closedList))
    assert.equal(linker.calls.length, 38, 'each batch is linked as soon as it is labelled')
    const p = await service.progress({ accountId: ACCOUNT, opportunityId: OPP })
    assert.deepEqual([p.state, p.total, p.looked, p.linked, p.failed], ['done', 300, 300, 300, 0])
  }
)

test('labels are saved after every batch, before the run ends', opts, async () => {
  const objects = store()
  const media = await seedPlace(db.pool, objects, 'Copper Ladle Kitchen', 40)
  const subject = { current: { media, closedList: listOf('dish', 5), businessName: null } }
  const seenDone = []
  const base = fakeVision()
  const vision = {
    ...base,
    label: async (input) => {
      const { rows } = await db.pool.query(
        `select count(*)::int as n from wo_media_analysis where version = $1 and state = 'done'`,
        [visionContentKey(DOOR)]
      )
      seenDone.push(rows[0].n)
      return base.label(input)
    }
  }
  const { service } = labeller(db.pool, objects, subject, { vision })
  await service.run({ accountId: ACCOUNT, opportunityId: OPP })
  assert.ok(seenDone.at(-1) >= 8, `a later batch saw earlier batches saved (${seenDone.join(',')})`)
})

test('a changed list of offerings re-runs the text links only, never the vision model', opts, async () => {
  const objects = store()
  const media = await seedPlace(db.pool, objects, 'Copper Ladle Kitchen', 24)
  const subject = { current: { media, closedList: listOf('dish', 150), businessName: null } }
  const { service, vision, linker } = labeller(db.pool, objects, subject)
  await service.run({ accountId: ACCOUNT, opportunityId: OPP })
  assert.equal(vision.calls.length, 3)
  subject.current = { ...subject.current, closedList: listOf('menu', 150) }
  await service.run({ accountId: ACCOUNT, opportunityId: OPP })
  assert.equal(vision.calls.length, 3, 'no new vision call')
  assert.deepEqual(
    linker.calls.at(-1),
    { n: 24, first: 'menu-0' },
    'one text call links all 24 to the new list'
  )
  const merged = await db.pool.query(`select result from wo_media_analysis where version = $1`, [
    visionKey(DOOR)
  ])
  assert.ok(merged.rows.every((r) => r.result.depicts === 'menu-0'))
})

test(
  'a clinic build waits while its 60 photos are looked at, then goes on with every label read',
  opts,
  async () => {
    const objects = store()
    const media = await seedPlace(db.pool, objects, 'Northgate Family Clinic', 60)
    const subject = { current: { media, closedList: listOf('service', 40), businessName: null } }
    const { service } = labeller(db.pool, objects, subject)
    const first = await service.gate({ accountId: ACCOUNT, opportunityId: OPP })
    assert.equal(first.pending, true)
    assert.deepEqual([first.progress.total, first.progress.looked], [60, 0])
    // The gate started the labelling; it settles in the background.
    for (let i = 0; i < 200; i += 1) {
      const p = await service.progress({ accountId: ACCOUNT, opportunityId: OPP })
      if (p.state === 'done') break
      await sleep(20)
    }
    const last = await service.gate({ accountId: ACCOUNT, opportunityId: OPP })
    assert.equal(last.ready, true)
    assert.deepEqual([last.progress.state, last.progress.looked, last.progress.linked], ['done', 60, 60])
    // The brief reads them, asking no model.
    const read = await createBriefPictureLabels({ pool: db.pool, visionFor: async () => DOOR })({
      media,
      brand: null,
      accountId: ACCOUNT,
      opportunityId: OPP,
      closedList: subject.current.closedList
    })
    assert.equal(read.labels.size, 60)
    assert.equal(read.note.status, 'labelled')
  }
)

test(
  'a labelling that makes no progress for 15 minutes lets the build go on, and the brief says so',
  opts,
  async () => {
    const objects = store()
    const media = await seedPlace(db.pool, objects, 'Northgate Family Clinic', 60)
    const subject = { current: { media, closedList: listOf('service', 40), businessName: null } }
    let clock = Date.now()
    const { service } = labeller(db.pool, objects, subject, {
      vision: fakeVision({ hang: true }),
      now: () => clock
    })
    const since = clock
    const waiting = await service.gate({ accountId: ACCOUNT, opportunityId: OPP, waitingSince: since })
    assert.equal(waiting.pending, true)
    clock += PHOTO_LABEL_STALL_MS - 1000
    assert.equal(
      (await service.gate({ accountId: ACCOUNT, opportunityId: OPP, waitingSince: since })).pending,
      true
    )
    clock += 2000
    const ended = await service.gate({ accountId: ACCOUNT, opportunityId: OPP, waitingSince: since })
    assert.equal(ended.ready, true)
    assert.equal(ended.progress.state, 'stalled')
    const read = await createBriefPictureLabels({ pool: db.pool, visionFor: async () => DOOR })({
      media,
      brand: null,
      accountId: ACCOUNT,
      opportunityId: OPP,
      closedList: subject.current.closedList,
      waited: ended.progress
    })
    assert.equal(read.note.status, 'stalled')
    assert.equal(read.labels.size, 0)
    assert.ok(Object.values(read.note.unlabelled).every((r) => r === 'labelling_stalled'))
  }
)

test('the owner photos come first, the largest first, at most the stored media', () => {
  const photo = (id, width, uploader) => ({
    id,
    kind: 'image',
    category: 'other',
    sha256: id.padEnd(64, '0'),
    width,
    height: 900,
    source: 'instagram',
    ...(uploader ? { uploaderRole: uploader } : {})
  })
  const media = [photo('a1', 1000, 'customer'), photo('b2', 1200, 'owner'), photo('c3', 3000, 'customer')]
  const { wanted, skipped } = photosToLabel(media, { ceiling: 2 })
  assert.deepEqual(
    wanted.map((m) => m.id),
    ['b2', 'c3']
  )
  assert.equal(skipped.get('a1'), 'over_cap')
})
