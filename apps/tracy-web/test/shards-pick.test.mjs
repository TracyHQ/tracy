/** Which shard a new person goes to (spec §4.1): filter, then the emptiest, then the nearest. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accepts, areaOf, eligible, pickShard } from '../src/shards/pick.js'

const NOW = Date.parse('2026-10-20T03:00:00Z')
function shard(name, { heartbeat = {}, ...rest } = {}) {
  return {
    name,
    secret: 'x'.repeat(64),
    accepting: true,
    degradedUntil: null,
    maxSites: 200,
    region: 'asia',
    heartbeatAt: new Date(NOW - 30_000),
    heartbeat: {
      sites: 10,
      mem_available_mb: 8000,
      releases_read_at: '2026-10-20T02:50:00Z',
      accepting: true,
      ...heartbeat
    },
    ...rest
  }
}

test('a shard is passed over when closed here or there, degraded, silent, full, short of memory, unread, without a catalogue or a secret', () => {
  const refused = [
    shard('a', { accepting: false }),
    shard('b', { degradedUntil: new Date(NOW + 60_000) }),
    shard('c', { heartbeatAt: new Date(NOW - 4 * 60_000) }),
    shard('d', { heartbeatAt: null }),
    shard('e', { heartbeat: { sites: 200 } }),
    shard('f', { heartbeat: { mem_available_mb: 2048 } }),
    shard('g', { heartbeat: { releases_read_at: null } }),
    shard('h', { secret: null }),
    shard('i', { heartbeat: { accepting: false } }),
    shard('j', { heartbeat: { sites: null, mem_available_mb: null } })
  ]
  for (const s of refused) assert.equal(eligible(s, NOW), false, s.name)
  assert.equal(pickShard(refused, { now: NOW }), null)
  assert.equal(eligible(shard('ok'), NOW), true)
  assert.equal(
    eligible(shard('lapsed', { degradedUntil: new Date(NOW - 1000) }), NOW),
    true,
    'a lapsed mark is no mark'
  )
  assert.equal(accepts(shard('i', { heartbeat: { accepting: false } })), false)
  assert.equal(
    accepts(shard('old', { heartbeat: { accepting: undefined } })),
    true,
    'a heartbeat that does not say is not a no'
  )
})

test('the emptiest shard by share of its own limit wins', () => {
  const picked = pickShard(
    [
      shard('s1', { heartbeat: { sites: 100 } }),
      shard('s2', { heartbeat: { sites: 30 }, maxSites: 50 }),
      shard('s3', { heartbeat: { sites: 40 } })
    ],
    { now: NOW }
  )
  assert.equal(picked.name, 's3')
})

test('on a tie the region of CF-IPCountry wins, then the larger free memory', () => {
  const tied = [
    shard('us', { region: 'america', heartbeat: { mem_available_mb: 9000 } }),
    shard('sg', { region: 'asia', heartbeat: { mem_available_mb: 4000 } }),
    shard('sg2', { region: 'asia', heartbeat: { mem_available_mb: 6000 } })
  ]
  assert.equal(pickShard(tied, { now: NOW, country: 'VN' }).name, 'sg2')
  assert.equal(pickShard(tied, { now: NOW, country: 'us' }).name, 'us')
  assert.equal(pickShard(tied, { now: NOW, country: 'ZZ' }).name, 'us')
  assert.equal(pickShard(tied, { now: NOW, country: 'VN', exclude: ['sg2'] }).name, 'sg')
})

test('areaOf reads a country code in any case and knows nothing it was not told', () => {
  assert.equal(areaOf('vn'), 'asia')
  assert.equal(areaOf('US'), 'america')
  assert.equal(areaOf('DE'), 'europe')
  assert.equal(areaOf('XX'), null)
  assert.equal(areaOf(null), null)
})
