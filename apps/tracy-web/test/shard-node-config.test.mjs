// apps/tracy-web/test/shard-node-config.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, readConfig } from '../src/config.js'

const base = {
  TRACY_ORIGIN: 'https://s2.tracy.ai',
  SITE_DOMAIN: 'tracy.ai',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 's2',
  HOST_NAME: 's2',
  HOST_s2_ORIGIN: 'http://host.docker.internal:51720',
  HOST_s2_DSH_ORIGIN: 'http://tracy-dsh:8080',
  HOST_s2_SECRET: 'h'.repeat(32),
  SEAT_s2_SECRET: 'k'.repeat(32)
}
const shardEnv = {
  ...base,
  TRACY_DEPLOYMENT_ROLE: 'shard',
  MASTER_ORIGIN: 'https://cowork.tracy.ai',
  // The one shape of a shard secret (`SHARD_SECRET` of lib/shard-shapes.js, W1): 64 hex characters.
  SHARD_SECRET: 'ab'.repeat(32),
  SESSION_COOKIE_NAME: 'tracy_sess_s2'
}
const refused = (env, key) =>
  assert.throws(
    () => readConfig(env),
    (error) => error instanceof ConfigError && error.key === key,
    `expected ${key} to be refused`
  )

test('no role is the master: the legacy cookie name, no shard, own domains read from CLOUDFLARE_SAAS_*', () => {
  const config = readConfig(base)
  assert.equal(config.deploymentRole, 'master')
  assert.equal(config.shard, null)
  assert.equal(config.sessionCookieName, 'tracy_sess')
  assert.equal(config.customHostnames, null)
  assert.equal('role' in config, false, 'one role reader: W1’s deploymentRole')
})

test('TRACY_DEPLOYMENT_ROLE=shard reads the master origin, the channel secret and its own cookie name', () => {
  const config = readConfig(shardEnv)
  assert.equal(config.deploymentRole, 'shard')
  assert.deepEqual(config.shard, {
    name: 's2',
    masterOrigin: 'https://cowork.tracy.ai',
    secret: 'ab'.repeat(32),
    maxSites: null
  })
  assert.equal(config.sessionCookieName, 'tracy_sess_s2')
  assert.deepEqual(config.customHostnames, { brokered: true })
})

test('a shard refuses to start half-configured, and names the setting', () => {
  refused({ ...shardEnv, MASTER_ORIGIN: '' }, 'MASTER_ORIGIN')
  refused({ ...shardEnv, MASTER_ORIGIN: 'https://s2.tracy.ai' }, 'MASTER_ORIGIN')
  refused({ ...shardEnv, MASTER_ORIGIN: 'https://cowork.tracy.ai/login' }, 'MASTER_ORIGIN')
  refused({ ...shardEnv, SHARD_SECRET: 'short' }, 'SHARD_SECRET')
  // 64 characters but not hex, and 48 hex: both off the one shape of lib/shard-shapes.js.
  refused({ ...shardEnv, SHARD_SECRET: 'x'.repeat(64) }, 'SHARD_SECRET')
  refused({ ...shardEnv, SHARD_SECRET: 'ab'.repeat(24) }, 'SHARD_SECRET')
  refused({ ...shardEnv, SESSION_COOKIE_NAME: 'tracy_sess' }, 'SESSION_COOKIE_NAME')
  refused({ ...shardEnv, SESSION_COOKIE_NAME: 'tracy_sess_s3' }, 'SESSION_COOKIE_NAME')
  refused({ ...shardEnv, HOST_NAME: 'S-2', HOSTS: 'S-2' }, 'HOST_NAME')
  // `SHARD_NAME` of lib/shard-shapes.js: a letter first, at most 16 characters.
  refused({ ...shardEnv, HOST_NAME: '2s', HOSTS: '2s' }, 'HOST_NAME')
  refused({ ...shardEnv, SHARD_MAX_SITES: '0' }, 'SHARD_MAX_SITES')
})

test('a shard never holds the Cloudflare for SaaS token: the master registers its custom hostnames', () => {
  refused(
    { ...shardEnv, CLOUDFLARE_SAAS_ZONE_ID: '0123456789abcdef0123456789abcdef' },
    'CLOUDFLARE_SAAS_ZONE_ID'
  )
  refused({ ...shardEnv, CLOUDFLARE_SAAS_TOKEN: 'token' }, 'CLOUDFLARE_SAAS_TOKEN')
})

test('the master refuses shard-only settings instead of ignoring them', () => {
  for (const key of ['MASTER_ORIGIN', 'SHARD_SECRET', 'SESSION_COOKIE_NAME', 'SHARD_MAX_SITES'])
    refused({ ...base, [key]: shardEnv[key] ?? '10' }, key)
})

test('SHARD_MAX_SITES caps a shard when it is set', () => {
  assert.equal(readConfig({ ...shardEnv, SHARD_MAX_SITES: '200' }).shard.maxSites, 200)
})
