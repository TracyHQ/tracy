// Test-only: shards for the master-half tests (docs/sre/2026-10-15-shard-beta-design.md).
import { signShardRequest } from '../src/lib/shard-channel.js'
import { seedShards } from '../src/shards/store.js'

export const SESSION_SECRET = 's'.repeat(32)
/** 64 hex each, the shape `openssl rand -hex 32` prints (docs/sre/hop-dong-cua-shard.md §2). */
export const SHARD_SECRETS = { s1: 'a'.repeat(64), s2: 'b'.repeat(64), s3: 'c'.repeat(64) }
export const TUNNELS = {
  s1: '11111111-1111-4111-8111-111111111111',
  s2: '22222222-2222-4222-8222-222222222222',
  s3: '33333333-3333-4333-8333-333333333333'
}
/** A master on `cowork.tracy.test` whose cookies span `tracy.test`, adopting everyone. */
export const MASTER_ENV = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_DOMAIN: 'tracy.test',
  SESSION_SECRET,
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1',
  SHARD_ADOPT_ALLOW: '*'
}

/** Shards `https://<name>.tracy.test`, region asia unless `regions` names another. */
export async function seedTestShards(pool, names = ['s1', 's2'], regions = {}) {
  await seedShards(
    pool,
    names.map((name) => ({
      name,
      origin: `https://${name}.tracy.test`,
      secret: SHARD_SECRETS[name],
      tunnelId: TUNNELS[name],
      provider: 'test',
      region: regions[name] ?? 'asia',
      maxSites: 200
    })),
    SESSION_SECRET
  )
}

/**
 * A fresh heartbeat that makes a shard eligible for new people, with `over` merged into it. The
 * heartbeat time is the JS clock, not SQL `now()`: eligibility is judged on the JS clock, so a test
 * that moves `Date.now()` (scripts/clock-shift.mjs) must seed on that same clock.
 */
export async function healthy(pool, name, over = {}) {
  const beat = {
    sites: 10,
    mem_available_mb: 8000,
    releases_read_at: new Date().toISOString(),
    accepting: true,
    updating: false,
    ...over
  }
  await pool.query(
    'update shard set accepting = true, last_seen_at = $4, last_heartbeat = $2, sites = $3 where name = $1',
    [name, beat, Number.isSafeInteger(beat.sites) ? beat.sites : null, new Date(Date.now())]
  )
}

/**
 * POST `body` to `/api/shards/<shard><path>` on `app`, signed as that shard (or with `secret`), at
 * `now` (a clock off by more than 120 s is how a test sends a skewed shard).
 */
export async function signedPost(app, shard, path, body, secret = SHARD_SECRETS[shard], now = Date.now()) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const full = `/api/shards/${shard}${path}`
  const headers = await signShardRequest({ secret, method: 'POST', path: full, body: raw, now })
  return app.request(`https://cowork.tracy.test${full}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw
  })
}
