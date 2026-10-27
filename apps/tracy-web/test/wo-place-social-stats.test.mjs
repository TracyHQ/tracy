// The social measurements a place profile reads, from where this deployment keeps them: its own cache
// (`wo_social_stat`) when it collects them itself, the shared authority's replica (`wo_social_replica_*`) when it is a
// client of one. Real isolated Postgres; no network.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import {
  socialStatsOfRead,
  useSocialStatsSource,
  withSocialStats
} from 'website-opportunities/src/place-social-stats.js'

const options = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const ORIGIN = 'https://social-authority.example.test'
const AUTHORITY = '6f1c1d5e-2b7a-4c1e-9d4f-0a1b2c3d4e5f'
const AT = new Date('2026-10-20T12:00:00Z')
const READ = { profile: { socials: { instagram: 'https://www.instagram.com/restaurant/' } }, sources: [] }

async function ownCache({ followers = 47, posts = 130 } = {}) {
  await db.pool.query(
    `insert into wo_social_stat(stat_key,network,url,status,platform_id,followers,posts,coverage,provider,fetched_at,checked_at)
     values('instagram:restaurant','instagram','https://www.instagram.com/restaurant/','done','123',$1,$2,'partial','apify',$3,$3)`,
    [followers, posts, AT]
  )
}

async function replica({
  origin = ORIGIN,
  followers = 5200,
  posts = 310,
  invalidated = null,
  status = 'done'
} = {}) {
  await db.pool.query(
    'insert into wo_social_replica_authority(origin,authority_id,pinned_at) values($1,$2,$3) on conflict do nothing',
    [origin, AUTHORITY, AT]
  )
  await db.pool.query(
    `insert into wo_social_replica_identity(origin,authority_id,identity_key,network,platform_id,version,snapshot,fetched_at,synced_at)
     values($1,$2,'instagram:id:123','instagram','123',7,$3,$4,$4)`,
    [
      origin,
      AUTHORITY,
      {
        followers,
        posts,
        last_post_at: null,
        posts_per_month: null,
        coverage: 'partial',
        provider: 'instagram/apify',
        handle: 'restaurant'
      },
      AT
    ]
  )
  await db.pool.query(
    `insert into wo_social_replica_alias(origin,authority_id,alias_key,identity_key,binding_revision,observed_at,verified_at,
       invalidated_at,state,state_revision,state_observed_at,synced_at)
     values($1,$2,'instagram:restaurant','instagram:id:123',3,$3,$3,$4,$5,1,$3,$3)`,
    [origin, AUTHORITY, AT, invalidated, { status }]
  )
}

test('a deployment that collects its own counts reads its own cache, posts included', options, async () => {
  await ownCache()
  await replica()
  assert.deepEqual(await socialStatsOfRead(db.pool, READ, { role: 'standalone' }), [
    {
      network: 'instagram',
      url: 'https://www.instagram.com/restaurant/',
      followers: 47,
      posts: 130,
      fetchedAt: AT.toISOString(),
      provider: 'instagram/apify'
    }
  ])
})

test(
  'a client of the shared authority reads the replica of that authority only, never its old own cache',
  options,
  async () => {
    await ownCache()
    await replica()
    // Another authority's copy of the same handle is not this deployment's.
    await replica({ origin: 'https://other-authority.example.test', followers: 1 })
    const got = await socialStatsOfRead(db.pool, READ, { role: 'client', origin: ORIGIN })
    assert.deepEqual(got, [
      {
        network: 'instagram',
        url: 'https://www.instagram.com/restaurant/',
        handle: 'restaurant',
        followers: 5200,
        posts: 310,
        fetchedAt: AT.toISOString(),
        provider: 'instagram/apify'
      }
    ])
    // With no authority configured there is nothing shared to read.
    assert.deepEqual(await socialStatsOfRead(db.pool, READ, { role: 'client', origin: null }), [])
  }
)

test(
  'a replica binding the authority invalidated, or a handle it found missing, gives nothing',
  options,
  async () => {
    await replica({ invalidated: AT })
    assert.deepEqual(await socialStatsOfRead(db.pool, READ, { role: 'client', origin: ORIGIN }), [])
    await db.reset()
    await replica({ status: 'not_found' })
    assert.deepEqual(await socialStatsOfRead(db.pool, READ, { role: 'client', origin: ORIGIN }), [])
  }
)

test('the deployment’s own mode is the default a research read follows', options, async () => {
  await ownCache()
  await replica()
  try {
    useSocialStatsSource({ role: 'client', origin: ORIGIN })
    assert.equal((await withSocialStats(db.pool, READ)).socialStats[0].followers, 5200)
    useSocialStatsSource({ role: 'central', origin: ORIGIN })
    assert.equal((await withSocialStats(db.pool, READ)).socialStats[0].followers, 47)
  } finally {
    useSocialStatsSource({ role: 'standalone' })
  }
})
