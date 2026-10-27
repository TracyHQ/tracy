// apps/tracy-web/test/shards-config.test.mjs
/**
 * The master half of the shard beta reads four things (docs/sre/2026-10-15-shard-beta-design.md
 * §1, §3.2, §6; docs/sre/hop-dong-cua-shard.md §1, §8): which side this process is, the shard seed,
 * the DNS token only a master holds, and who may be adopted onto a shard.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, readConfig } from '../src/config.js'
import { EVENT_ID, SHARD_NAME, TICKET, shardOriginOf } from '../src/lib/shard-shapes.js'

const BASE = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1'
}
const TUNNEL = '0b7c3f4e-1a2b-4c3d-8e9f-001122334455'
const S1 = {
  SHARDS: 's1',
  SHARD_s1_ORIGIN: 'https://s1.tracy.test',
  SHARD_s1_SECRET: 'a'.repeat(64),
  SHARD_s1_TUNNEL_ID: TUNNEL
}

const refused = (env, key) =>
  assert.throws(
    () => readConfig({ ...BASE, ...env }),
    (error) => error instanceof ConfigError && error.key === key,
    key
  )

test('a deployment that names nothing about shards is a master with no seed, no DNS token and adopt off', () => {
  const config = readConfig(BASE)
  assert.equal(config.deploymentRole, 'master')
  assert.deepEqual(config.shardSeed, [])
  assert.equal(config.shardDns, null)
  assert.deepEqual(config.shardAdoptAllow, { everyone: false, emails: [], domains: [] })
})

test('SHARDS seeds one row per name, and a shard is never a host this process signs for', () => {
  const config = readConfig({ ...BASE, ...S1, SHARD_s1_REGION: 'asia', SHARD_s1_PROVIDER: 'digitalocean' })
  assert.deepEqual(config.shardSeed, [
    {
      name: 's1',
      origin: 'https://s1.tracy.test',
      secret: 'a'.repeat(64),
      tunnelId: TUNNEL,
      provider: 'digitalocean',
      region: 'asia',
      maxSites: 200
    }
  ])
  assert.equal(config.hosts.has('s1'), false)
  assert.equal(
    readConfig({ ...BASE, ...S1 }).shardSeed[0].region,
    'unknown',
    'no REGION is the region unknown'
  )
  // A shard is refused when half-configured (W2 Task 1, shard-node-config.test.mjs), so the role is given its full set.
  const shard = {
    ...BASE,
    HOST_NAME: 's2',
    TRACY_DEPLOYMENT_ROLE: 'shard',
    MASTER_ORIGIN: 'https://master.tracy.test',
    SHARD_SECRET: 'a'.repeat(64),
    SESSION_COOKIE_NAME: 'tracy_sess_s2'
  }
  assert.equal(readConfig(shard).deploymentRole, 'shard')
})

test('a bad shard line stops the start and names its variable', () => {
  refused({ TRACY_DEPLOYMENT_ROLE: 'edge' }, 'TRACY_DEPLOYMENT_ROLE')
  refused({ ...S1, SHARDS: 's0' }, 'SHARDS')
  refused({ ...S1, SHARDS: 'S1' }, 'SHARDS')
  refused({ ...S1, SHARD_s1_ORIGIN: 'https://s1.tracy.test/app' }, 'SHARD_s1_ORIGIN')
  refused({ ...S1, SHARD_s1_SECRET: 'short' }, 'SHARD_s1_SECRET')
  refused({ ...S1, SHARD_s1_SECRET: 'A'.repeat(64) }, 'SHARD_s1_SECRET')
  refused({ ...S1, SHARD_s1_SECRET: 'a'.repeat(40) }, 'SHARD_s1_SECRET')
  refused({ ...S1, SHARD_s1_TUNNEL_ID: 'not-a-tunnel' }, 'SHARD_s1_TUNNEL_ID')
  refused({ ...S1, SHARD_s1_REGION: 'mars' }, 'SHARD_s1_REGION')
  refused({ ...S1, SHARD_s1_MAX_SITES: '0' }, 'SHARD_s1_MAX_SITES')
  const { SHARD_s1_SECRET: _dropped, ...noSecret } = S1
  refused(noSecret, 'SHARD_s1_SECRET')
})

test('the DNS token is both-or-nothing and the zone is a zone id', () => {
  assert.equal(readConfig({ ...BASE, CLOUDFLARE_DNS_TOKEN: 'tok' }).shardDns, null)
  assert.deepEqual(
    readConfig({ ...BASE, CLOUDFLARE_DNS_ZONE_ID: 'A'.repeat(32), CLOUDFLARE_DNS_TOKEN: 'tok' }).shardDns,
    { zoneId: 'a'.repeat(32), token: 'tok' }
  )
  refused({ CLOUDFLARE_DNS_ZONE_ID: 'zone', CLOUDFLARE_DNS_TOKEN: 'tok' }, 'CLOUDFLARE_DNS_ZONE_ID')
})

test('SHARD_ADOPT_ALLOW names everyone, addresses or domains; anything else is refused', () => {
  assert.deepEqual(readConfig({ ...BASE, SHARD_ADOPT_ALLOW: '*' }).shardAdoptAllow, {
    everyone: true,
    emails: [],
    domains: []
  })
  assert.deepEqual(readConfig({ ...BASE, SHARD_ADOPT_ALLOW: 'Ceo@Tracy.ai, joomlart.com' }).shardAdoptAllow, {
    everyone: false,
    emails: ['ceo@tracy.ai'],
    domains: ['joomlart.com']
  })
  refused({ SHARD_ADOPT_ALLOW: 'not a domain' }, 'SHARD_ADOPT_ALLOW')
})

test('a shard origin is an http(s) origin with nothing after it', () => {
  assert.equal(shardOriginOf('https://S1.tracy.test/'), 'https://s1.tracy.test')
  assert.equal(shardOriginOf('https://s1.tracy.test/x'), null)
  assert.equal(shardOriginOf('https://s1.tracy.test/?a=1'), null)
  assert.equal(shardOriginOf('ftp://s1.tracy.test'), null)
  assert.equal(shardOriginOf('not a url'), null)
})

test('the shapes of the door contract: a shard name, an event id, a handoff ticket', () => {
  for (const name of ['s1', 'd1', 'eu2', 'a'.repeat(16)]) assert.equal(SHARD_NAME.test(name), true, name)
  for (const name of ['', '1s', 'S1', 's-1', 'a'.repeat(17)]) assert.equal(SHARD_NAME.test(name), false, name)
  assert.equal(EVENT_ID.test('0123456789abcdef0123456789abcdef'), true)
  assert.equal(EVENT_ID.test('0123456789ABCDEF0123456789ABCDEF'), false)
  assert.equal(EVENT_ID.test('evt-00000001'), false)
  assert.equal(TICKET.test('A'.repeat(42) + '_'), true)
  assert.equal(TICKET.test('A'.repeat(42)), false)
  assert.equal(TICKET.test(`${'A'.repeat(42)}=`), false)
})
