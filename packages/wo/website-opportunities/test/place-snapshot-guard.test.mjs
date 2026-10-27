// A published place snapshot is what every account's research and brief cites: the database refuses to edit or
// delete what it says. Only its lifecycle (published -> superseded) and its sources' scheduling facts (when they were
// last tried, how it ended, which rule tried) move after publication.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'
import { migrate } from '../src/schema/index.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const REFUSED = /place snapshot guard/

let db
before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  const lockId = createHash('sha256').update(db.url).digest().readUInt32BE(0)
  await migrate(db.pool, { lockId })
})
after(async () => {
  await db?.close()
})

const q = (sql, params) => db.pool.query(sql, params)

/** A place with one snapshot (sources, profile, one picture, an import row), left in `state`. */
async function snapshotIn(state) {
  const place = (await q('insert into wo_place (display_name) values ($1) returning id', ['Cafe'])).rows[0].id
  const snapshot = (await q('insert into wo_place_snapshot (place_id) values ($1) returning id', [place]))
    .rows[0].id
  const media = (
    await q(
      `insert into wo_place_media (place_id, sha256, kind, source, source_url)
       values ($1, 'abc', 'image', 'google', 'https://example.com/a.jpg') returning id`,
      [place]
    )
  ).rows[0].id
  await q(
    `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, collected, collected_at, attempted_at)
     values ($1, 'facebook-search', 'https://example.com', 'complete',
             '{"pages":[{"url":"https://facebook.com/cafe","name":"Cafe"}]}', now(), now())`,
    [snapshot]
  )
  await q(
    `insert into wo_place_snapshot_source (snapshot_id, source, status) values ($1, 'website', 'pending')`,
    [snapshot]
  )
  await q(
    `insert into wo_place_snapshot_profile (snapshot_id, profile) values ($1, '{"phone":"+1 555 0100"}')`,
    [snapshot]
  )
  await q('insert into wo_place_snapshot_media (snapshot_id, media_id) values ($1, $2)', [snapshot, media])
  const imp = (
    await q(`insert into wo_place_import (origin, outcome) values ('peer', 'imported') returning id`)
  ).rows[0].id
  await q(
    `insert into wo_place_snapshot_import (snapshot_id, import_id, origin, origin_snapshot_id)
     values ($1, $2, 'peer', gen_random_uuid())`,
    [snapshot, imp]
  )
  if (state !== 'preparing')
    await q(`update wo_place_snapshot set state = 'published', published_at = now() where id = $1`, [
      snapshot
    ])
  if (state === 'superseded')
    await q(`update wo_place_snapshot set state = 'superseded' where id = $1`, [snapshot])
  return { place, snapshot, media }
}

test(
  "a snapshot being prepared is the run's own: its parts change freely, then it publishes",
  opts,
  async () => {
    const { snapshot, media } = await snapshotIn('preparing')
    await q(
      `update wo_place_snapshot_profile set profile = '{"phone":"+1 555 0199"}' where snapshot_id = $1`,
      [snapshot]
    )
    await q(
      `update wo_place_snapshot_source set collected = '{}', status = 'failed' where snapshot_id = $1`,
      [snapshot]
    )
    await q('delete from wo_place_snapshot_media where snapshot_id = $1 and media_id = $2', [snapshot, media])
    await q(`update wo_place_snapshot set enrichment_scope = 'prefetch' where id = $1`, [snapshot])
    await q(`update wo_place_snapshot set state = 'published', published_at = now() where id = $1`, [
      snapshot
    ])
    assert.equal(
      (await q('select state from wo_place_snapshot where id = $1', [snapshot])).rows[0].state,
      'published'
    )
  }
)

test('published content cannot be edited, added to, or deleted', opts, async () => {
  const { place, snapshot, media } = await snapshotIn('published')
  const refused = [
    [
      `update wo_place_snapshot_profile set profile = '{"phone":"+1 555 0199"}' where snapshot_id = $1`,
      [snapshot]
    ],
    [`update wo_place_snapshot_profile set brand = '{}' where snapshot_id = $1`, [snapshot]],
    [
      `update wo_place_snapshot_source set collected = '{"text":"x"}' where snapshot_id = $1 and source = 'website'`,
      [snapshot]
    ],
    [
      `update wo_place_snapshot_source set status = 'failed' where snapshot_id = $1 and source = 'website'`,
      [snapshot]
    ],
    [
      `update wo_place_snapshot_source set collected = jsonb_set(collected, '{pages,0,url}', '"https://evil.example"')
       where snapshot_id = $1 and source = 'facebook-search'`,
      [snapshot]
    ],
    [
      `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, collected, collected_at)
       values ($1, 'instagram', 'https://instagram.com/cafe', 'complete', '{"text":"x"}', now())`,
      [snapshot]
    ],
    [
      `update wo_place_snapshot_source set ref = 'https://evil.example' where snapshot_id = $1 and source = 'facebook-search'`,
      [snapshot]
    ],
    [`delete from wo_place_snapshot_source where snapshot_id = $1 and source = 'website'`, [snapshot]],
    [`delete from wo_place_snapshot_profile where snapshot_id = $1`, [snapshot]],
    [`delete from wo_place_snapshot_media where snapshot_id = $1`, [snapshot]],
    [
      `insert into wo_place_snapshot_media (snapshot_id, media_id)
       select $1, id from wo_place_media where place_id = $2 and id <> $3`,
      [snapshot, place, media]
    ],
    [`update wo_place_snapshot_import set origin = 'other' where snapshot_id = $1`, [snapshot]],
    [`delete from wo_place_snapshot_import where snapshot_id = $1`, [snapshot]],
    [`update wo_place_snapshot set published_at = now() - interval '1 day' where id = $1`, [snapshot]],
    [`update wo_place_snapshot set enrichment_scope = 'prefetch' where id = $1`, [snapshot]],
    [
      `update wo_place_snapshot set place_id = (select id from wo_place where id <> $2 limit 1) where id = $1`,
      [snapshot, place]
    ],
    [`update wo_place_snapshot set state = 'preparing' where id = $1`, [snapshot]],
    [`update wo_place_snapshot set state = 'failed' where id = $1`, [snapshot]],
    [`delete from wo_place_snapshot where id = $1`, [snapshot]]
  ]
  // A second media row, so the insert above names a real picture.
  await q(
    `insert into wo_place_media (place_id, sha256, kind, source, source_url)
     values ($1, 'def', 'image', 'google', 'https://example.com/b.jpg')`,
    [place]
  )
  await q('insert into wo_place (display_name) values ($1)', ['Other'])
  for (const [sql, params] of refused) await assert.rejects(q(sql, params), REFUSED, sql)
})

test(
  'a published snapshot may name a page for the next run, but never what was collected',
  opts,
  async () => {
    const { snapshot } = await snapshotIn('published')
    // Naming: an empty source row, or a ref on a row with no ref and nothing collected (Research again reads it).
    await q(
      `insert into wo_place_snapshot_source (snapshot_id, source, ref) values ($1, 'instagram', 'https://instagram.com/cafe')`,
      [snapshot]
    )
    await q(
      `update wo_place_snapshot_source set ref = 'https://cafe.example' where snapshot_id = $1 and source = 'website'`,
      [snapshot]
    )
    // Once named, the ref stays: renaming is refused like any edit.
    await assert.rejects(
      q(
        `update wo_place_snapshot_source set ref = 'https://evil.example' where snapshot_id = $1 and source = 'website'`,
        [snapshot]
      ),
      REFUSED
    )
    // A named row cannot carry collected data into the published snapshot either.
    await assert.rejects(
      q(
        `update wo_place_snapshot_source set collected = '{"text":"x"}' where snapshot_id = $1 and source = 'instagram'`,
        [snapshot]
      ),
      REFUSED
    )
  }
)

test("after publication only the lifecycle and the sources' scheduling facts move", opts, async () => {
  const { snapshot, media } = await snapshotIn('published')
  // A later run that found the same data carries its tries onto the published snapshot (`place-jobs.js`).
  await q(
    `update wo_place_snapshot_source set attempted_at = now(), last_error = '{"reason":"timeout"}',
       coverage = '{"version":"v2"}', collected_at = now(), collector_version = 'v2'
     where snapshot_id = $1 and source = 'website'`,
    [snapshot]
  )
  // An operator's verdict on a page the social search found (`wo-places-store.js judgeSocialPage`).
  await q(
    `update wo_place_snapshot_source
        set collected = jsonb_set(collected, '{pages}', jsonb_build_array(collected->'pages'->0
              || '{"verdict":"confirmed","judgedBy":"ops@example.com","judgedAt":"2026-10-24T00:00:00Z"}'))
      where snapshot_id = $1 and source = 'facebook-search'`,
    [snapshot]
  )
  // Revoking a picture is a fact of the picture, not of the snapshot that shows it.
  await q(`update wo_place_media set revoked_at = now(), revoke_reason = 'owner asked' where id = $1`, [
    media
  ])
  await q(`update wo_place_snapshot set state = 'superseded' where id = $1`, [snapshot])
  await assert.rejects(
    q(`update wo_place_snapshot set state = 'published' where id = $1`, [snapshot]),
    REFUSED
  )
  await assert.rejects(q(`delete from wo_place_snapshot where id = $1`, [snapshot]), REFUSED)
})

test('an import or backfill writes a published snapshot and its parts in one transaction', opts, async () => {
  const client = await db.pool.connect()
  try {
    await client.query('begin')
    const place = (await client.query('insert into wo_place default values returning id')).rows[0].id
    const snapshot = (
      await client.query(
        `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'published', now()) returning id`,
        [place]
      )
    ).rows[0].id
    await client.query(
      `insert into wo_place_snapshot_source (snapshot_id, source, status) values ($1, 'website', 'complete')`,
      [snapshot]
    )
    await client.query(`insert into wo_place_snapshot_profile (snapshot_id, profile) values ($1, '{}')`, [
      snapshot
    ])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})

test(
  'a snapshot that never published can be failed or set aside, and a failed one deleted',
  opts,
  async () => {
    const a = await snapshotIn('preparing')
    await q(`update wo_place_snapshot set state = 'failed' where id = $1`, [a.snapshot])
    await assert.rejects(
      q(`update wo_place_snapshot set state = 'published' where id = $1`, [a.snapshot]),
      REFUSED
    )
    for (const t of [
      'wo_place_snapshot_source',
      'wo_place_snapshot_profile',
      'wo_place_snapshot_media',
      'wo_place_snapshot_import'
    ])
      await q(`delete from ${t} where snapshot_id = $1`, [a.snapshot])
    await q('delete from wo_place_snapshot where id = $1', [a.snapshot])
    const b = await snapshotIn('preparing')
    await q(`update wo_place_snapshot set state = 'superseded', published_at = now() where id = $1`, [
      b.snapshot
    ])
  }
)
