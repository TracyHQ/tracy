import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { migrate } from '../src/schema/index.js'
import { scratchDatabase } from './scratch-database.mjs'
import { readPlaceProfile } from '../src/place-profile-read.js'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

let db
before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool, { lockId: createHash('sha256').update(db.url).digest().readUInt32BE(0) })
})
after(async () => {
  await db?.close()
})
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test(
  'read by opportunity or shared place preserves source posts and excludes revoked media',
  opts,
  async () => {
    const q = (sql, values) => db.pool.query(sql, values)
    const place = (await q("insert into wo_place (display_name) values ('Example Gym') returning id")).rows[0]
      .id
    await q(
      "insert into wo_place_identity (place_id, namespace, external_id, source) values ($1, 'google', 'example-gym', 'google')",
      [place]
    )
    const snapshot = (await q('insert into wo_place_snapshot (place_id) values ($1) returning id', [place]))
      .rows[0].id
    await q('insert into wo_place_snapshot_profile (snapshot_id, profile) values ($1, $2)', [
      snapshot,
      { name: 'Example Gym', googlePlace: { primaryType: 'gym', types: ['gym'] } }
    ])
    await q(
      `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, collected)
    values ($1, 'website', 'https://example.test', 'complete', $2)`,
      [
        snapshot,
        {
          profile: { name: 'Example Gym' },
          posts: [{ url: 'https://example.test/news', caption: 'Classes this week.' }]
        }
      ]
    )
    for (const revoked of [false, true]) {
      const media = (
        await q(
          `insert into wo_place_media (place_id, sha256, kind, source, source_url, revoked_at)
      values ($1, $2, 'image', 'website', $3, $4) returning id`,
          [
            place,
            revoked ? 'revoked' : 'kept',
            `https://example.test/${revoked}.jpg`,
            revoked ? new Date() : null
          ]
        )
      ).rows[0].id
      await q('insert into wo_place_snapshot_media (snapshot_id, media_id) values ($1, $2)', [
        snapshot,
        media
      ])
    }
    await q("update wo_place_snapshot set state = 'published', published_at = now() where id = $1", [
      snapshot
    ])
    await q('update wo_place set current_snapshot_id = $1 where id = $2', [snapshot, place])
    const account = (await q("insert into wo_principal (kind) values ('test') returning id")).rows[0].id
    const opp = (
      await q(
        `insert into wo_opportunity (account_id, name, provider, provider_id, place_id)
    values ($2, 'Example Gym', 'google-places', 'example-gym', $1) returning id`,
        [place, account]
      )
    ).rows[0].id
    for (const selector of [{ placeId: place }, { opportunityId: opp }]) {
      const doc = await readPlaceProfile(db.pool, selector)
      assert.deepEqual(validatePlaceProfile(doc), { ok: true, errors: [] })
      assert.equal(doc.classification.derivedCategories[0].value.code, 'fitness')
      assert.equal(doc.media.length, 1)
      assert.equal(doc.media[0].value.url, 'https://example.test/false.jpg')
      assert.equal(doc.quotes[0].value.text, 'Classes this week.')
    }
    await q('update wo_opportunity set place_id = null where id = $1', [opp])
    await q('insert into wo_profile (opportunity_id, profile) values ($1, $2)', [
      opp,
      { name: 'Private Studio', businessType: 'DaySpa' }
    ])
    await q(
      `insert into wo_source (opportunity_id, source, ref, status, collected)
    values ($1, 'website', 'https://private.test', 'complete', $2)`,
      [opp, { posts: [{ caption: 'Private news.' }] }]
    )
    const own = await readPlaceProfile(db.pool, { opportunityId: opp })
    assert.deepEqual(validatePlaceProfile(own), { ok: true, errors: [] })
    assert.equal(own.business.name.value, 'Private Studio')
    assert.equal(own.quotes[0].value.text, 'Private news.')
    assert.equal(await readPlaceProfile(db.pool, { placeId: '00000000-0000-0000-0000-000000000000' }), null)
    await assert.rejects(readPlaceProfile(db.pool, {}), /exactly one/)
  }
)

test('the read carries the social-stats cache count of a profile the place links to', opts, async () => {
  const q = (sql, values) => db.pool.query(sql, values)
  const account = (await q("insert into wo_principal (kind) values ('test') returning id")).rows[0].id
  const opp = (
    await q(
      `insert into wo_opportunity (account_id, name, provider, provider_id)
    values ($1, 'Linked Cafe', 'google-places', 'linked-cafe') returning id`,
      [account]
    )
  ).rows[0].id
  await q('insert into wo_profile (opportunity_id, profile) values ($1, $2)', [
    opp,
    { name: 'Linked Cafe', socials: { tiktok: 'https://www.tiktok.com/@linkedcafe' } }
  ])
  await q(
    `insert into wo_social_stat (stat_key, network, url, status, followers, provider, fetched_at)
    values ('tiktok:linkedcafe', 'tiktok', 'https://www.tiktok.com/@linkedcafe', 'done', 4321, 'tiktok/api23', now())`
  )
  const doc = await readPlaceProfile(db.pool, { opportunityId: opp })
  assert.deepEqual(validatePlaceProfile(doc), { ok: true, errors: [] })
  assert.deepEqual(
    doc.claims.statistics.map((f) => [f.value.label, f.value.amount, f.value.scope]),
    [['followers', 4321, 'https://www.tiktok.com/@linkedcafe']]
  )
})
