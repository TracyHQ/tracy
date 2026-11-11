/**
 * A brief whose photographs were not labelled when it was made is recovered by the next Refresh or build, never only by
 * Research again (#555, #556):
 * - a brief written with no labelling step says so (`not_attempted`) instead of leaving `assetLabelling` out (#555);
 * - a brief made while another request still held the shared claims says `labels_pending`, not `no_bytes` (#556);
 * - both hash apart from the research the Details page reads, so the page offers Refresh, and once the labels exist a
 *   new revision is written; the incomplete one is never changed, and a labelled brief is still reused.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import * as domain from 'website-opportunities/domain'

import { visionKey } from '../src/lib/picture-vision.js'
import { createBriefPictureLabels } from '../src/opportunities-build/brief-picture-labels.js'
import { claimAnalyses, settleAnalysis } from '../src/opportunities-build/media-analysis.js'
import { randomUUID } from 'node:crypto'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { createPictureLabelRuns } from '../src/opportunities-build/picture-label-runs.js'
import { editRevision } from '../src/opportunities-build/brief-edits.js'
import { createWebsiteBuilder } from '../src/opportunities-build/route.js'
import {
  createRevision,
  currentResearchKey,
  freezeDemoResearchInput,
  revisionForAction,
  researchKey,
  researchKeySlots
} from '../src/opportunities-build/revisions.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const at = '2026-11-10T10:59:11.000Z'
const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const VISION = { door: DOOR, key: visionKey(DOOR) }
const sha = (b) => createHash('sha256').update(b).digest('hex')
const jpeg = (i) =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: i * 40, g: 90, b: 120 } } })
    .jpeg()
    .toBuffer()

/** A frozen research read of the fictional Harbour Sport Club holding these photographs. */
const frozenRead = (media) => ({
  opportunity: { name: 'Harbour Sport Club', branch: null, candidate: { trade: 'fitness' } },
  placeSnapshotId: null,
  profile: { name: 'Harbour Sport Club', phone: '+971 50 000 1234', address: 'Harbour Lane, Dubai' },
  brand: null,
  sources: [{ id: 'src-web', source: 'website', ref: 'https://harboursport.example', status: 'complete' }],
  rawSources: [],
  posts: [],
  media: structuredClone(media),
  socialStats: []
})

/** The place photographs of the read, as a live read holds them (no labels). */
const placeMedia = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `photo-${i}`,
    origin: 'place',
    kind: 'image',
    category: 'other',
    sha256: String(i + 1)
      .repeat(64)
      .slice(0, 64),
    width: 2000,
    height: 1200,
    source: 'google-places',
    sourceUrl: `https://photos.test/hsc-${i}.jpg`,
    labels: null
  }))

/** A pool that answers the statements `createRevision` sends, and keeps the revisions it wrote. */
function revisionPool() {
  const revisions = []
  const opp = {
    id: 'opp-1',
    account_id: 'acc-1',
    name: 'Harbour Sport Club',
    provider: 'google',
    candidate: {}
  }
  const client = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(begin|commit|rollback)$/.test(s)) return { rows: [] }
      if (s.startsWith('select * from wo_opportunity')) return { rows: [opp] }
      if (s.startsWith('select * from wo_revision where opportunity_id'))
        return {
          rows: revisions.filter(
            (r) => r.opportunity_id === params[0] && [params[1]].flat().includes(r.research_hash)
          )
        }
      if (s.startsWith('select * from wo_revision where id'))
        return { rows: revisions.filter((r) => r.id === params[0]) }
      if (s.startsWith('insert into wo_revision')) {
        const cols = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',')
        const values = [...params]
        const row = {}
        for (const col of cols) row[col] = col === 'n' ? revisions.length + 1 : values.shift()
        for (const key of Object.keys(row))
          if (typeof row[key] === 'string' && /^[[{n]/.test(row[key]) && key !== 'brief_md')
            row[key] = JSON.parse(row[key])
        if (revisions.some((r) => r.research_hash && r.research_hash === row.research_hash))
          throw Object.assign(new Error('duplicate research_hash'), { code: '23505' })
        revisions.push(row)
        return { rows: [row] }
      }
      throw new Error(`unexpected statement: ${s}`)
    },
    release() {}
  }
  return { connect: async () => client, revisions }
}

const briefArgs = (media, extra = {}) => ({
  accountId: 'acc-1',
  opportunityId: 'opp-1',
  domain,
  frozenResearchRead: frozenRead(media),
  researchSnapshotAt: at,
  now: () => Date.parse(at),
  ...extra
})

/** A labeller that labels every photograph it is given, as the shared cache would. */
const labelsAll = async ({ media }) => ({
  labels: new Map(
    media.map((m) => [m.id, { key: VISION.key, model: 'model-x', labels: { content: 'venue-exterior' } }])
  ),
  note: { status: 'cached', asked: 0, labelled: 0, cached: media.length, max: 60 }
})

test('#555: a brief written with no labelling step says so, and the next labelled Refresh writes a new revision', async () => {
  const media = placeMedia(2)
  const pool = revisionPool()
  const first = await createRevision(pool, briefArgs(media))
  assert.ok(first.revision, JSON.stringify(first))
  assert.deepEqual(
    {
      status: first.revision.brief.assetLabelling?.status,
      reason: first.revision.brief.assetLabelling?.reason
    },
    { status: 'failed', reason: 'not_attempted' },
    'the brief records that its photographs were never labelled'
  )
  assert.deepEqual(domain.validateBrief(first.revision.brief).errors, [])
  assert.match(first.revision.brief_md, /- Labels: pictures were not labelled when this brief was made/)
  const live = researchKey(domain, frozenRead(media))
  assert.notEqual(first.revision.research_hash, live, 'the Details page offers Refresh for it')
  const kept = structuredClone(first.revision)

  const refreshed = await createRevision(pool, briefArgs(media, { pictureLabels: labelsAll }))
  assert.ok(refreshed.revision, JSON.stringify(refreshed))
  assert.equal(refreshed.reused, undefined)
  assert.notEqual(refreshed.revision.id, first.revision.id)
  assert.equal(refreshed.revision.brief.assetLabelling.status, 'cached')
  assert.equal(refreshed.revision.research_hash, live, 'the labelled brief is current')
  assert.deepEqual(pool.revisions[0], kept, 'the unlabelled revision is never changed')

  // Nearest working case: a labelled brief of the same research is reused, by a labelled build or an unlabelled one,
  // and a Refresh of it never calls the labeller.
  let asked = 0
  const counting = async (input) => {
    asked += 1
    return labelsAll(input)
  }
  const again = await createRevision(pool, briefArgs(media, { pictureLabels: counting }))
  assert.equal(again.reused, true)
  assert.equal(asked, 0, 'a complete brief is found before anything is labelled')
  assert.equal(again.revision.id, refreshed.revision.id)
  const unlabelled = await createRevision(pool, briefArgs(media))
  assert.equal(unlabelled.reused, true)
  assert.equal(unlabelled.revision.id, refreshed.revision.id)
  assert.equal(pool.revisions.length, 2)
})

test(
  '#556: labels still being made by another request recover into a new labelled revision',
  opts,
  async () => {
    // The photographs' bytes are stored: the place's media rows the labeller reads them through.
    const objects = { files: new Map() }
    objects.get = async (key) => (objects.files.has(key) ? new Response(objects.files.get(key)) : null)
    const placeId = (
      await db.pool.query(`insert into wo_place (display_name) values ('Harbour Sport Club') returning id`)
    ).rows[0].id
    const media = []
    for (let i = 0; i < 3; i += 1) {
      const bytes = await jpeg(i)
      const key = `places/${placeId}/${sha(bytes)}.jpg`
      objects.files.set(key, bytes)
      const row = (
        await db.pool.query(
          `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, width, height, kind, category,
           source, source_url)
         values ($1, $2, $3, 'stored', 'image/jpeg', $4, 1200, 800, 'image', 'other', 'google-places', $5) returning *`,
          [placeId, sha(bytes), key, bytes.length, `https://photos.test/hsc-${i}.jpg`]
        )
      ).rows[0]
      media.push({ ...placeMedia(1)[0], id: row.id, sha256: row.sha256, width: 1200, height: 800 })
    }
    let calls = 0
    const pictureLabels = createBriefPictureLabels({
      pool: db.pool,
      objects,
      visionFor: async () => VISION,
      observe: null,
      label: async ({ pictures }) => {
        calls += 1
        return {
          labels: new Map(pictures.map((p) => [p.id, { content: 'venue-exterior' }])),
          usage: { calls: 1, requests: [] }
        }
      },
      chargeable: async (_spec, invoke) => invoke()
    })
    // The first Refresh, cut off mid-request, still holds the claims on every photograph.
    const held = await claimAnalyses(
      db.pool,
      media.map((m) => m.sha256),
      VISION
    )
    assert.equal(held.size, 3)

    const pool = revisionPool()
    const second = await createRevision(pool, briefArgs(media, { pictureLabels }))
    assert.ok(second.revision, JSON.stringify(second))
    const note = second.revision.brief.assetLabelling
    assert.equal(note.reason, 'labels_pending', 'not no_bytes: the labels are being made elsewhere')
    assert.equal(note.pending, 3)
    assert.equal(calls, 0, 'nothing is sent while another request holds the claims')
    assert.deepEqual(domain.validateBrief(second.revision.brief).errors, [])
    assert.match(second.revision.brief_md, /- Labels: 3 picture\(s\) were still being labelled/)
    const live = researchKey(domain, frozenRead(media))
    assert.notEqual(second.revision.research_hash, live, 'the Details page offers Refresh for it')
    const kept = structuredClone(second.revision)

    // A Refresh while the claims are still held reuses the same pending brief: no revision per press.
    const pressed = await createRevision(pool, briefArgs(media, { pictureLabels }))
    assert.equal(pressed.reused, true)
    assert.equal(pressed.revision.id, second.revision.id)

    // The first request's labels then land in the shared cache.
    for (const m of media) await settleAnalysis(db.pool, m.sha256, { content: 'venue-exterior' }, VISION)

    const recovered = await createRevision(pool, briefArgs(media, { pictureLabels }))
    assert.ok(recovered.revision, JSON.stringify(recovered))
    assert.equal(recovered.reused, undefined)
    assert.notEqual(recovered.revision.id, second.revision.id)
    assert.equal(recovered.revision.brief.assetLabelling.status, 'cached')
    assert.equal(recovered.revision.brief.assetLabelling.cached, 3)
    assert.ok(recovered.revision.brief.assets.every((a) => a.content === 'venue-exterior'))
    assert.equal(recovered.revision.research_hash, live, 'the recovered brief is current')
    assert.equal(calls, 0, 'the cached labels are not paid for again')
    assert.deepEqual(pool.revisions[0], kept, 'the pending revision is never changed')
  }
)

/** A labeller that labels the first `n` photographs and says the model left the others out. */
const labelsFirst =
  (n) =>
  async ({ media }) => ({
    labels: new Map(
      media
        .slice(0, n)
        .map((m) => [m.id, { key: VISION.key, model: 'model-x', labels: { content: 'venue-exterior' } }])
    ),
    note: {
      status: 'partial',
      asked: media.length,
      labelled: n,
      failed: media.length - n,
      cached: 0,
      reason: 'not_in_answer'
    }
  })

test('review 3: a partial labelling short of readiness is recovered once the missing labels exist', async () => {
  const media = placeMedia(3)
  const pool = revisionPool()
  const live = researchKey(domain, frozenRead(media))
  const partial = await createRevision(pool, briefArgs(media, { pictureLabels: labelsFirst(1) }))
  assert.equal(partial.revision.brief.assetLabelling.status, 'partial')
  assert.notEqual(partial.revision.research_hash, live, 'one of three labelled: Refresh is offered')
  const recovered = await createRevision(pool, briefArgs(media, { pictureLabels: labelsAll }))
  assert.equal(recovered.reused, undefined)
  assert.notEqual(recovered.revision.id, partial.revision.id)
  assert.equal(recovered.revision.research_hash, live)
})

test('review 3: a partial labelling that readiness passes is complete, keeps its hash and is reused', async () => {
  const media = placeMedia(10)
  const pool = revisionPool()
  const made = await createRevision(pool, briefArgs(media, { pictureLabels: labelsFirst(9) }))
  const share = made.revision.brief.readiness.checks.find((c) => c.id === 'labelled-share')
  assert.equal(share.verdict, 'pass')
  assert.equal(made.revision.research_hash, researchKey(domain, frozenRead(media)), 'no staleness for it')
  let asked = 0
  const again = await createRevision(
    pool,
    briefArgs(media, {
      pictureLabels: async (input) => {
        asked += 1
        return labelsAll(input)
      }
    })
  )
  assert.equal(again.reused, true)
  assert.equal(again.revision.id, made.revision.id)
  assert.equal(asked, 0)
})

test('review 3: a brief made with no vision model assigned is recovered once a model labels', async () => {
  const media = placeMedia(2)
  const pool = revisionPool()
  const off = async () => ({
    labels: new Map(),
    note: { status: 'off', asked: 0, labelled: 0, cached: 0, max: 60, reason: 'no_vision_model' }
  })
  const first = await createRevision(pool, briefArgs(media, { pictureLabels: off }))
  const live = researchKey(domain, frozenRead(media))
  assert.equal(first.revision.brief.assetLabelling.status, 'off')
  assert.notEqual(first.revision.research_hash, live, 'Refresh is offered for it')
  // Still no model: the same brief stands, no revision per press.
  assert.equal(
    (await createRevision(pool, briefArgs(media, { pictureLabels: off }))).revision.id,
    first.revision.id
  )
  const labelled = await createRevision(pool, briefArgs(media, { pictureLabels: labelsAll }))
  assert.notEqual(labelled.revision.id, first.revision.id)
  assert.equal(labelled.revision.research_hash, live)
  assert.equal(pool.revisions.length, 2)
})

/** `n` stored place photographs of the fictional Harbour Sport Club and the store holding their bytes. */
async function seedPlace(n) {
  const objects = { files: new Map() }
  objects.get = async (key) => (objects.files.has(key) ? new Response(objects.files.get(key)) : null)
  const placeId = (
    await db.pool.query(`insert into wo_place (display_name) values ('Harbour Sport Club') returning id`)
  ).rows[0].id
  const media = []
  for (let i = 0; i < n; i += 1) {
    const bytes = await jpeg(i)
    const key = `places/${placeId}/${sha(bytes)}.jpg`
    objects.files.set(key, bytes)
    const row = (
      await db.pool.query(
        `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, width, height, kind, category,
           source, source_url)
         values ($1, $2, $3, 'stored', 'image/jpeg', $4, 1200, 800, 'image', 'other', 'google-places', $5) returning *`,
        [placeId, sha(bytes), key, bytes.length, `https://photos.test/hsc-${i}.jpg`]
      )
    ).rows[0]
    media.push({ ...placeMedia(1)[0], id: row.id, sha256: row.sha256, width: 1200, height: 800 })
  }
  return { objects, media }
}

test('review 2: Refreshes of pictures the model cannot label pay once and keep one brief', opts, async () => {
  const { objects, media } = await seedPlace(3)
  let calls = 0
  const pictureLabels = createBriefPictureLabels({
    pool: db.pool,
    objects,
    visionFor: async () => VISION,
    observe: null,
    label: async ({ pictures }) => {
      calls += 1
      return {
        labels: new Map(),
        reasons: new Map(pictures.map((p) => [p.id, 'not_in_answer'])),
        usage: { calls: 1, requests: [] }
      }
    },
    chargeable: async (_spec, invoke) => invoke()
  })
  const pool = revisionPool()
  const made = []
  for (let i = 0; i < 3; i += 1) made.push(await createRevision(pool, briefArgs(media, { pictureLabels })))
  assert.equal(calls, 1, 'the model is asked once; the cache says it gave no label')
  assert.equal(pool.revisions.length, 1, 'no revision per Refresh')
  assert.deepEqual(
    made.map((m) => m.reused ?? false),
    [false, true, true]
  )
  const note = made[2].revision.brief.assetLabelling
  assert.equal(note.status, 'failed')
  assert.equal(note.reason, 'not_in_answer')
})

test(
  'review 1: Details offers Refresh for a stored brief with absent or failed labels, and Refresh makes a labelled one',
  opts,
  async () => {
    const accountId = (
      await db.pool.query(`insert into account (email) values ('owner@tracy.test') returning id`)
    ).rows[0].id
    const builder = createWebsiteBuilder({
      config: { origin: 'http://tracy.test:8080' },
      pool: db.pool,
      request: async () => Response.json({}),
      loadDomain: async () => domain
    })
    // Revision 1 of the Portland case (labelling absent) and revision 2 (failed / no_bytes), each held under the
    // research key the Details page reads, as briefs made before this fix are.
    for (const [i, legacy] of [
      null,
      { status: 'failed', asked: 0, labelled: 0, cached: 0, reason: 'no_bytes' }
    ].entries()) {
      const opp = (
        await db.pool.query(
          `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
           values ($1, 'Harbour Sport Club', 'osm', $2, '{}'::jsonb) returning *`,
          [accountId, `node/${i}`]
        )
      ).rows[0]
      for (let j = 0; j < 2; j += 1)
        await db.pool.query(
          `insert into wo_media (account_id, opportunity_id, sha256, object_key, status, mime, bytes, width, height,
             kind, category, source, source_url)
           values ($1, $2, $3, $4, 'stored', 'image/jpeg', 1000, 2000, 1200, 'image', 'other', 'instagram', $5)`,
          [accountId, opp.id, `${i}${j}`.repeat(32), `o/${opp.id}/${j}.jpg`, `https://cdn.test/${i}-${j}.jpg`]
        )
      const args = { accountId, opportunityId: opp.id, domain }
      const made = (await createRevision(db.pool, args)).revision
      const brief = { ...made.brief }
      if (legacy) brief.assetLabelling = legacy
      else delete brief.assetLabelling
      assert.equal(brief.readiness.checks.find((c) => c.id === 'labelled-share').verdict, 'block')
      const key = await currentResearchKey(db.pool, opp, domain)
      await db.pool.query('delete from wo_revision where id = $1', [made.id])
      const old = (
        await db.pool.query(
          `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest, research_hash)
           values ($1, $2, 1, $3::jsonb, '', '[]'::jsonb, $4) returning *`,
          [opp.id, accountId, JSON.stringify(brief), key]
        )
      ).rows[0]
      assert.equal((await builder.detailOf(opp, accountId)).brief.current, false, 'Details offers Refresh')
      // A seller's edit of it (`brief-edits.js`) keeps its missing labels: still Refresh. It edits a text the brief holds.
      const [field] = Object.entries(brief.business ?? {}).find(([, v]) => typeof v === 'string' && v) ?? []
      assert.ok(field, JSON.stringify(brief.business))
      const textPath = `business.${field}`
      const rename = (revisionId) =>
        editRevision(db.pool, {
          accountId,
          opportunityId: opp.id,
          revisionId,
          edits: [{ path: textPath, value: 'Harbour Sport Club Dubai' }],
          domain
        })
      const editedOld = await rename(old.id)
      assert.ok(editedOld.revision, JSON.stringify(editedOld))
      assert.equal(editedOld.revision.brief.edited.fromHash, key)
      assert.equal(
        (await builder.detailOf(opp, accountId)).brief.current,
        false,
        'an edit of it still offers Refresh'
      )

      const refreshed = await createRevision(db.pool, { ...args, pictureLabels: labelsAll })
      assert.equal(refreshed.reused, undefined, 'the incomplete brief is not reused')
      assert.notEqual(refreshed.revision.id, old.id)
      assert.equal(refreshed.revision.research_hash, researchKeySlots(key).relabelled)
      assert.ok(refreshed.revision.brief.assets.every((a) => a.content === 'venue-exterior'))
      const status = (await builder.detailOf(opp, accountId)).brief
      assert.deepEqual([status.id, status.current], [refreshed.revision.id, true])
      // A seller's edit of the labelled brief is the current one.
      const edited = await rename(refreshed.revision.id)
      assert.ok(edited.revision, JSON.stringify(edited))
      const afterEdit = (await builder.detailOf(opp, accountId)).brief
      assert.deepEqual([afterEdit.id, afterEdit.current], [edited.revision.id, true])
      const kept = (await db.pool.query('select * from wo_revision where id = $1', [old.id])).rows[0]
      assert.deepEqual(kept.brief, brief, 'the stored brief is never changed')
      assert.equal(kept.research_hash, key)

      let asked = 0
      const again = await createRevision(db.pool, {
        ...args,
        pictureLabels: async (input) => {
          asked += 1
          return labelsAll(input)
        }
      })
      assert.deepEqual([again.reused, again.revision.id, asked], [true, refreshed.revision.id, 0])
    }
  }
)

/** An opportunity of the fictional Harbour Sport Club with `n` own pictures stored, and a labeller the model never
 * answers for (`why` per picture), counting its calls. */
async function ownWorld(n, why) {
  const accountId = (
    await db.pool.query(`insert into account (email) values ('own@tracy.test') returning id`)
  ).rows[0].id
  const opportunityId = (
    await db.pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Harbour Sport Club', 'osm', 'node/7', '{}'::jsonb) returning id`,
      [accountId]
    )
  ).rows[0].id
  const objects = { files: new Map() }
  objects.get = async (key) => (objects.files.has(key) ? new Response(objects.files.get(key)) : null)
  const ids = []
  for (let i = 0; i < n; i += 1) {
    const bytes = await jpeg(i + 3)
    const key = `opportunities/${accountId}/${opportunityId}/${sha(bytes)}.jpg`
    objects.files.set(key, bytes)
    ids.push(
      (
        await db.pool.query(
          `insert into wo_media (account_id, opportunity_id, sha256, object_key, status, mime, bytes, width, height,
             kind, category, source, source_url)
           values ($1, $2, $3, $4, 'stored', 'image/jpeg', $5, 1200, 800, 'image', 'other', 'instagram', $6)
           returning id`,
          [accountId, opportunityId, sha(bytes), key, bytes.length, `https://cdn.test/own-${i}.jpg`]
        )
      ).rows[0].id
    )
  }
  const counter = { calls: 0 }
  const pictureLabels = createBriefPictureLabels({
    pool: db.pool,
    objects,
    visionFor: async () => VISION,
    observe: null,
    label: async ({ pictures }) => {
      counter.calls += 1
      return {
        labels: new Map(),
        reasons: new Map(pictures.map((p) => [p.id, why])),
        usage: { calls: 1, requests: [] }
      }
    },
    chargeable: async (_spec, invoke) => invoke()
  })
  const revisions = async () =>
    (await db.pool.query('select id from wo_revision where opportunity_id = $1', [opportunityId])).rows
  return { accountId, opportunityId, ids, counter, pictureLabels, revisions }
}

test(
  'review: Refreshes of an own picture the model never answers pay once and keep one brief',
  opts,
  async () => {
    const w = await ownWorld(2, 'not_in_answer')
    const args = {
      accountId: w.accountId,
      opportunityId: w.opportunityId,
      domain,
      pictureLabels: w.pictureLabels
    }
    const made = []
    for (let i = 0; i < 3; i += 1) made.push(await createRevision(db.pool, args))
    assert.equal(w.counter.calls, 1, 'the row keeps that the model gave no label')
    assert.equal((await w.revisions()).length, 1, 'no revision per Refresh')
    assert.deepEqual(
      made.map((m) => m.reused ?? false),
      [false, true, true]
    )
    assert.equal(made[2].revision.brief.assetLabelling.reason, 'not_in_answer')
    const row = (await db.pool.query('select labels from wo_media where id = $1', [w.ids[0]])).rows[0]
    assert.deepEqual(
      [row.labels.visionUnanswered.key, row.labels.visionUnanswered.reason],
      [VISION.key, 'not_in_answer']
    )
    assert.equal(row.labels.vision, undefined, 'never a label')
  }
)

test('review: an own picture whose call timed out is asked again', opts, async () => {
  const w = await ownWorld(1, 'timeout')
  const args = {
    accountId: w.accountId,
    opportunityId: w.opportunityId,
    domain,
    pictureLabels: w.pictureLabels
  }
  await createRevision(db.pool, args)
  await createRevision(db.pool, args)
  assert.equal(w.counter.calls, 2)
  assert.equal((await w.revisions()).length, 1)
})

/** Three build runs of one opportunity, each with a run set of its own: the revision ids they built from. */
async function threeBuildRuns(w, label) {
  const loaded = await websiteOpportunitiesDomain()
  const researchInput = await freezeDemoResearchInput(db.pool, w.opportunityId, w.accountId)
  const selection = {
    cms: 'emdash',
    design: 'business',
    quickstart: 'synthetic/emdash',
    version: '1.0.0',
    workflow: 'agent-demo/1',
    researchInput,
    snapshotAt: new Date().toISOString()
  }
  const cards = [
    { id: 'business', platforms: [{ platform: 'emdash', tag: 'synthetic/emdash', version: '1.0.0' }] }
  ]
  const ids = []
  for (let i = 0; i < 3; i += 1) {
    // Each run its own: a restarted runner, or a new action, holds no run of the last one.
    const pictureLabelRuns = createPictureLabelRuns({ label })
    const action = {
      id: randomUUID(),
      account_id: w.accountId,
      opportunity_id: w.opportunityId,
      revision_id: randomUUID(),
      build_request_id: randomUUID(),
      selection
    }
    const ask = () =>
      revisionForAction(db.pool, {
        action,
        domain: loaded,
        templates: async () => cards,
        ops: { defaultCms: 'emdash' },
        pictureLabelRuns
      })
    let made = await ask()
    if (made.pending) {
      await pictureLabelRuns.idle()
      made = await ask()
    }
    assert.ok(made.revision, JSON.stringify(made))
    ids.push(made.revision.id)
  }
  return ids
}

test(
  'review: build runs of an own picture the model never answers pay once and share one brief',
  opts,
  async () => {
    const w = await ownWorld(2, 'not_in_answer')
    const ids = await threeBuildRuns(w, w.pictureLabels)
    assert.equal(w.counter.calls, 1, 'the model is asked once over three builds')
    assert.equal(new Set(ids).size, 1, 'one brief for the three builds')
    assert.equal((await w.revisions()).length, 1)
  }
)

test('review: a build run adopts a labelled brief before asking any labelling', opts, async () => {
  const w = await ownWorld(2, 'not_in_answer')
  let asked = 0
  const ids = await threeBuildRuns(w, async ({ media }) => {
    asked += 1
    return labelsAll({ media })
  })
  assert.equal(asked, 1, 'the second and third builds find the labelled brief first')
  assert.equal(new Set(ids).size, 1)
  assert.equal((await w.revisions()).length, 1)
})
