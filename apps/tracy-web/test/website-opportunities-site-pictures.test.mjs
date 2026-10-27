/**
 * The collected pictures of the site an opportunity built, as the brief engines read them: nothing at all for a site no
 * opportunity built, the presser's own account by id, only the revision's stored pictures whose bytes match, and a plan
 * written once.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'

import { pictureFeatures } from '../src/lib/picture-cut.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createSitePictures } from '../src/opportunities-build/site-pictures.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const sha = (b) => createHash('sha256').update(b).digest('hex')
const jpeg = (background) =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background } })
    .jpeg()
    .toBuffer()

/** A store that answers the bytes put in it, by key. */
function store() {
  const files = new Map()
  return {
    files,
    get: async (key) => (files.has(key) ? new Response(files.get(key)) : null)
  }
}

/** `sitemap`: the brief's pages, for a build whose brief names dish photos (by the index of `media`). */
async function seed(pool, objects, sitemap = null) {
  const account = (await pool.query(`insert into account (email) values ('Owner@Tracy.test') returning id`))
    .rows[0].id
  const other = (await pool.query(`insert into account (email) values ('other@tracy.test') returning id`))
    .rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Tamarel', 'osm', 'node/1', '{}'::jsonb) returning id`,
      [account]
    )
  ).rows[0].id
  const media = []
  for (const [i, colour] of ['#aa3322', '#2255aa', '#33aa55'].entries()) {
    const bytes = await jpeg(colour)
    const key = `opportunities/${account}/${opp}/${sha(bytes)}.jpg`
    objects.files.set(key, bytes)
    const row = (
      await pool.query(
        `insert into wo_media (account_id, opportunity_id, sha256, object_key, status, mime, bytes, width, height, kind,
           category, source, source_url)
         values ($1, $2, $3, $4, 'stored', 'image/jpeg', $5, 1200, 800, 'image', 'food', 'facebook', $6) returning *`,
        [account, opp, sha(bytes), key, bytes.length, `https://cdn.test/p${i}.jpg`]
      )
    ).rows[0]
    media.push(row)
  }
  await pool.query(
    `insert into wo_source (opportunity_id, source, ref, status, collected)
     values ($1, 'facebook', 'https://facebook.com/tamarel', 'complete', $2::jsonb)`,
    [
      opp,
      JSON.stringify({
        media: [{ url: 'https://cdn.test/p0.jpg', caption: 'Grilled squid tonight', kind: 'image' }]
      })
    ]
  )
  // The manifest names two of the three; the second with a sha256 the stored bytes do not have.
  const manifest = [
    { id: media[0].id, kind: 'image', sha256: media[0].sha256 },
    { id: media[1].id, kind: 'image', sha256: 'f'.repeat(64) }
  ]
  const revision = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest)
       values ($1, $2, 1, $3::jsonb, '', $4::jsonb) returning id`,
      [
        opp,
        account,
        JSON.stringify({
          brand: {
            colors: [
              { hex: '#010101', role: 'neutral' },
              { hex: '#b5452a', role: 'accent' }
            ]
          },
          ...(sitemap ? { sitemap: sitemap(media) } : {})
        }),
        JSON.stringify(manifest)
      ]
    )
  ).rows[0].id
  const buildId = '11111111-1111-4111-8111-111111111111'
  const build = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, choice, choice_key) values ($1, $2, 'req-1', $3, 'pic-tamarel.tracy.test', '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture') returning id`,
      [account, revision, buildId]
    )
  ).rows[0].id
  await pool.query(
    `insert into site (site_key, label, host) values ('pic-tamarel.tracy.test', 'pic-tamarel', 'local')`
  )
  await pool.query(`insert into site (site_key, label, host) values ('plain.tracy.test', 'plain', 'local')`)
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state, site_key) values ($1, $2, 'h', 'provisioning', 'pic-tamarel.tracy.test')`,
    [account, buildId]
  )
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state, site_key) values ($1, 'form-build', 'h', 'provisioning', 'plain.tracy.test')`,
    [account]
  )
  return { account, other, media, build }
}

test('a site made from the Add site form answers null, and so does an unknown site', opts, async () => {
  const objects = store()
  await seed(db.pool, objects)
  const pictures = createSitePictures({
    pool: db.pool,
    objects,
    measure: pictureFeatures,
    log: { warn() {} }
  })
  assert.equal(await pictures.forSite({ siteKey: 'plain.tracy.test', email: 'owner@tracy.test' }), null)
  assert.equal(await pictures.forSite({ siteKey: 'nobody.tracy.test', email: 'owner@tracy.test' }), null)
})

test('another account’s email reads nothing, even for the right site', opts, async () => {
  const objects = store()
  await seed(db.pool, objects)
  const pictures = createSitePictures({
    pool: db.pool,
    objects,
    measure: pictureFeatures,
    log: { warn() {} }
  })
  assert.equal(await pictures.forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'other@tracy.test' }), null)
  assert.equal(await pictures.forSite({ siteKey: 'pic-tamarel.tracy.test', email: '' }), null)
})

test(
  'only the manifest’s stored pictures whose sha matches, measured and with their words, and the brand’s own colours',
  opts,
  async () => {
    const objects = store()
    const { media } = await seed(db.pool, objects)
    const pictures = createSitePictures({
      pool: db.pool,
      objects,
      measure: pictureFeatures,
      log: { warn() {} }
    })
    const read = await pictures.forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'owner@tracy.test' })
    assert.deepEqual(
      read.pictures.map((p) => p.id),
      [media[0].id]
    )
    const [p] = read.pictures
    assert.match(p.dhash, /^[0-9a-f]{16}$/)
    assert.equal(p.features.v, 1)
    assert.equal(p.caption, 'Grilled squid tonight')
    assert.deepEqual(read.colours, ['#b5452a'])
    assert.equal(sha(await read.bytes(media[0].id)), media[0].sha256)
    assert.equal(await read.bytes(media[2].id), null)
    // Measured once: the row keeps it.
    const row = (
      await db.pool.query('select dhash, caption, labels from wo_media where id = $1', [media[0].id])
    ).rows[0]
    assert.equal(row.dhash, p.dhash)
    assert.equal(row.caption, 'Grilled squid tonight')
  }
)

test(
  'asked only whether there are any (the EmDash engine, `app.js`): no store and no vision model still answers the pictures, and reads no byte',
  opts,
  async () => {
    const objects = store()
    const { media } = await seed(db.pool, objects)
    const pictures = createSitePictures({
      pool: db.pool,
      objects: null,
      measure: async () => assert.fail('nothing is measured'),
      log: { warn() {} }
    })
    const read = await pictures.forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'owner@tracy.test' })
    assert.deepEqual(
      read.pictures.map((p) => p.id),
      [media[0].id]
    )
    assert.equal(read.vision, null)
    assert.equal(await pictures.forSite({ siteKey: 'plain.tracy.test', email: 'owner@tracy.test' }), null)
  }
)

test('a store that answers other bytes than the manifest names gives no picture', opts, async () => {
  const objects = store()
  const { media } = await seed(db.pool, objects)
  objects.files.set(media[0].object_key, Buffer.from('tampered'))
  const pictures = createSitePictures({
    pool: db.pool,
    objects,
    measure: pictureFeatures,
    log: { warn() {} }
  })
  const read = await pictures.forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'owner@tracy.test' })
  assert.equal(await read.bytes(media[0].id), null)
})

test(
  'the plan is written once: a second plan is answered with the first; receipts sit beside it',
  opts,
  async () => {
    const objects = store()
    const { build } = await seed(db.pool, objects)
    const pictures = createSitePictures({
      pool: db.pool,
      objects,
      measure: pictureFeatures,
      log: { warn() {} }
    })
    const first = await pictures.recordPlan(build, {
      version: 1,
      placements: [{ groupId: 'a', mediaId: 'x' }]
    })
    const second = await pictures.recordPlan(build, {
      version: 1,
      placements: [{ groupId: 'a', mediaId: 'y' }]
    })
    assert.deepEqual(second, first)
    await pictures.recordOutcome(build, {
      receipts: { a: { state: 'uploaded', path: 'images/tracy-content/1.jpg' } }
    })
    await pictures.recordOutcome(build, { receipts: { b: { state: 'uploaded' } }, report: { placed: 1 } })
    const held = (await db.pool.query('select pictures from wo_build where id = $1', [build])).rows[0]
      .pictures
    assert.equal(held.plan.placements[0].mediaId, 'x')
    assert.deepEqual(Object.keys(held.receipts).sort(), ['a', 'b'])
    assert.deepEqual(held.report, { placed: 1 })
    const read = await pictures.forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'owner@tracy.test' })
    assert.equal(read.plan.placements[0].mediaId, 'x')
  }
)

test('a database that fails is a null answer and a warning, never a throw', opts, async () => {
  const warned = []
  const pictures = createSitePictures({
    pool: { query: async () => Promise.reject(new Error('down')) },
    objects: null,
    measure: pictureFeatures,
    log: { warn: (m) => warned.push(m) }
  })
  assert.equal(await pictures.forSite({ siteKey: 'x', email: 'y' }), null)
  assert.equal(warned.length, 1)
})

test(
  'vision: the pictures without a label of the current key are labelled once and kept; another model labels again',
  opts,
  async () => {
    const objects = store()
    const { media } = await seed(db.pool, objects)
    const asked = []
    const label = async ({ pictures }) => {
      asked.push(pictures.map((p) => p.id))
      return {
        labels: new Map(
          pictures.map((p) => [p.id, { subject: 'interior', textPresence: 'absent', heroWorthy: true }])
        ),
        usage: { calls: 1, promptTokens: 300, completionTokens: 40 },
        failed: 0
      }
    }
    const door = { url: 'https://v.test', key: 'k', model: 'deepseek-chat' }
    const make = (key) =>
      createSitePictures({
        pool: db.pool,
        objects,
        measure: pictureFeatures,
        vision: { door, key, label },
        log: { warn() {} }
      })
    const first = await make('deepseek-chat|p1').forSite({
      siteKey: 'pic-tamarel.tracy.test',
      email: 'owner@tracy.test'
    })
    assert.deepEqual(asked, [[media[0].id]])
    assert.equal(first.pictures[0].vision.subject, 'interior')
    assert.deepEqual(
      { labelled: first.vision.labelled, tokens: first.vision.tokens },
      { labelled: 1, tokens: 340 }
    )
    const again = await make('deepseek-chat|p1').forSite({
      siteKey: 'pic-tamarel.tracy.test',
      email: 'owner@tracy.test'
    })
    assert.equal(asked.length, 1)
    assert.equal(again.pictures[0].vision.subject, 'interior')
    await make('other|p1').forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'owner@tracy.test' })
    assert.equal(asked.length, 2)
    // Without a vision model, no label is read: an old answer is not a fact of this deployment.
    const plain = await createSitePictures({
      pool: db.pool,
      objects,
      measure: pictureFeatures,
      log: { warn() {} }
    }).forSite({
      siteKey: 'pic-tamarel.tracy.test',
      email: 'owner@tracy.test'
    })
    assert.equal(plain.pictures[0].vision, null)
  }
)

test(
  'a dish photo the brief left a candidate is accepted when this build’s vision calls it a dish, and only then',
  opts,
  async () => {
    const objects = store()
    await seed(db.pool, objects, (media) => [
      {
        slug: 'menu',
        sections: [
          {
            kind: 'menu',
            menuItems: [
              {
                name: 'Grilled squid',
                photo: { assetId: media[0].id, status: 'candidate', how: 'caption', matcher: 'dish-photos/1' }
              }
            ]
          }
        ]
      }
    ])
    const visionSays = (subject) =>
      createSitePictures({
        pool: db.pool,
        objects,
        measure: pictureFeatures,
        vision: {
          door: { url: 'https://v.test', key: 'k', model: 'deepseek-chat' },
          key: `deepseek-chat|${subject}`,
          label: async ({ pictures }) => ({
            labels: new Map(pictures.map((p) => [p.id, { subject, textPresence: 'absent' }])),
            usage: { calls: 1, promptTokens: 1, completionTokens: 1 },
            failed: 0
          })
        },
        log: { warn() {} }
      }).forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'owner@tracy.test' })
    assert.equal((await visionSays('food')).pictures[0].dish, 'Grilled squid')
    assert.equal((await visionSays('people')).pictures[0].dish, undefined)
    const unseen = await createSitePictures({
      pool: db.pool,
      objects,
      measure: pictureFeatures,
      log: { warn() {} }
    }).forSite({ siteKey: 'pic-tamarel.tracy.test', email: 'owner@tracy.test' })
    assert.equal(unseen.pictures[0].dish, undefined)
  }
)

/** A place with two stored pictures (the second revoked) and an opportunity of `email`'s built from a brief of both. */
async function seedPlace(pool, objects, email, place = null) {
  const account = (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0]
    .id
  const placeId =
    place ??
    (await pool.query(`insert into wo_place (display_name) values ('Tamarel') returning id`)).rows[0].id
  const media = []
  if (!place)
    for (const [i, colour] of ['#aa3322', '#2255aa'].entries()) {
      const bytes = await jpeg(colour)
      const key = `places/${placeId}/${sha(bytes)}.jpg`
      objects.files.set(key, bytes)
      media.push(
        (
          await pool.query(
            `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, width, height, kind, category,
               source, source_url, caption, revoked_at)
             values ($1, $2, $3, 'stored', 'image/jpeg', $4, 1200, 800, 'image', 'food', 'website', $5, 'Squid', $6)
             returning *`,
            [
              placeId,
              sha(bytes),
              key,
              bytes.length,
              `https://tamarel.test/p${i}.jpg`,
              i === 1 ? new Date() : null
            ]
          )
        ).rows[0]
      )
    }
  else
    media.push(
      ...(await pool.query('select * from wo_place_media where place_id = $1 order by source_url', [place]))
        .rows
    )
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate, place_id)
       values ($1, 'Tamarel', 'osm', 'node/9', '{}'::jsonb, $2) returning id`,
      [account, placeId]
    )
  ).rows[0].id
  const manifest = media.map((m) => ({ id: m.id, origin: 'place', kind: 'image', sha256: m.sha256 }))
  const revision = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest)
       values ($1, $2, 1, '{}'::jsonb, '', $3::jsonb) returning id`,
      [opp, account, JSON.stringify(manifest)]
    )
  ).rows[0].id
  const buildId = (await pool.query('select gen_random_uuid() as id')).rows[0].id
  const siteKey = `pic-${account.slice(0, 8)}.tracy.test`
  await pool.query(
    `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, choice, choice_key) values ($1, $2, 'req-1', $3, $4, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture')`,
    [account, revision, buildId, siteKey]
  )
  await pool.query(`insert into site (site_key, label, host) values ($1, $1, 'local')`, [siteKey])
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state, site_key) values ($1, $2, 'h', 'provisioning', $3)`,
    [account, buildId, siteKey]
  )
  return { placeId, media, siteKey }
}

test(
  "a place's pictures: built through the revision's manifest, never a revoked one; vision labels each picture once for every account",
  opts,
  async () => {
    const objects = store()
    const a = await seedPlace(db.pool, objects, 'a@tracy.test')
    const b = await seedPlace(db.pool, objects, 'b@tracy.test', a.placeId)
    const asked = []
    const label = async ({ pictures }) => {
      asked.push(pictures.map((p) => p.id))
      return {
        labels: new Map(pictures.map((p) => [p.id, { subject: 'food', textPresence: 'absent' }])),
        usage: { calls: 1, promptTokens: 10, completionTokens: 5 },
        failed: 0
      }
    }
    const pictures = createSitePictures({
      pool: db.pool,
      objects,
      measure: pictureFeatures,
      vision: {
        door: { url: 'https://v.test', key: 'k', model: 'deepseek-chat' },
        key: 'deepseek-chat|p1',
        label
      },
      log: { warn() {} }
    })
    const seenA = await pictures.forSite({ siteKey: a.siteKey, email: 'a@tracy.test' })
    assert.deepEqual(
      seenA.pictures.map((p) => p.id),
      [a.media[0].id],
      'the revoked picture is not built'
    )
    assert.equal(seenA.pictures[0].caption, 'Squid')
    assert.equal(seenA.pictures[0].vision.subject, 'food')
    assert.ok(await seenA.bytes(a.media[0].id))
    const seenB = await pictures.forSite({ siteKey: b.siteKey, email: 'b@tracy.test' })
    assert.equal(seenB.pictures[0].vision.subject, 'food', "B's build reads the label A's build paid for")
    assert.equal(asked.length, 1, 'one model call for one picture, whichever account builds')
    const analysis = (await db.pool.query('select * from wo_media_analysis')).rows
    assert.deepEqual(
      analysis.map((r) => [r.media_sha256, r.model, r.version, r.state]),
      [[a.media[0].sha256, 'deepseek-chat', 'deepseek-chat|p1', 'done']]
    )
    assert.equal(
      (await db.pool.query('select labels from wo_place_media where id = $1', [a.media[0].id])).rows[0]
        .labels,
      null,
      'the place media row is not written'
    )

    // A picture another build is labelling right now (its claim holds) is not sent twice.
    await db.pool.query(
      `update wo_media_analysis set state = 'pending', lease_until = now() + interval '5 minutes'`
    )
    await pictures.forSite({ siteKey: a.siteKey, email: 'a@tracy.test' })
    assert.equal(asked.length, 1)
  }
)

test(
  'vision over the research cap: no model call, the claims go back, the build carries on without labels',
  opts,
  async () => {
    const objects = store()
    const a = await seedPlace(db.pool, objects, 'a@tracy.test')
    let calls = 0
    const pictures = createSitePictures({
      pool: db.pool,
      objects,
      measure: pictureFeatures,
      vision: {
        door: { url: 'https://v.test', key: 'k', model: 'deepseek-chat' },
        key: 'deepseek-chat|p1',
        label: async () => {
          calls += 1
          return { labels: new Map(), usage: { calls: 1, promptTokens: 0, completionTokens: 0 }, failed: 0 }
        }
      },
      chargeable: createChargeable(
        createCostLedger({ pool: db.pool, caps: async () => ({ dailyCapCents: 0, jobCapCents: 0 }) })
      ),
      log: { warn() {} }
    })
    const seen = await pictures.forSite({ siteKey: a.siteKey, email: 'a@tracy.test' })
    assert.equal(calls, 0)
    assert.equal(seen.pictures.length, 1)
    assert.equal(seen.pictures[0].vision, null)
    assert.equal(seen.vision, null)
    const [claim] = (await db.pool.query('select state, lease_until from wo_media_analysis')).rows
    assert.deepEqual(claim, { state: 'failed', lease_until: null })
  }
)
