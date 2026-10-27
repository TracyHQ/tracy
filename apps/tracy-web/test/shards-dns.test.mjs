/** The master's DNS writes (spec §3.2): create-if-absent, never overwrite, failures named. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DnsUnavailable, tunnelTarget, zoneNames } from '../src/shards/dns.js'
import { DNS_TOKEN, fakeDns } from './_fake-dns.mjs'

const S1 = tunnelTarget('11111111-1111-4111-8111-111111111111')

test('a missing name gets a proxied CNAME to the tunnel; the same one is left; another one is a conflict, untouched', async () => {
  const dns = fakeDns()
  assert.equal(await dns.client.ensureCname('shop.tracy.test', S1), 'created')
  assert.deepEqual([...dns.records.values()][0], {
    id: 'r1',
    type: 'CNAME',
    name: 'shop.tracy.test',
    content: S1,
    proxied: true,
    ttl: 1
  })
  assert.equal(await dns.client.ensureCname('shop.tracy.test', S1), 'present')
  dns.seed('taken.tracy.test', 'elsewhere.example')
  assert.equal(await dns.client.ensureCname('taken.tracy.test', S1), 'conflict')
  assert.deepEqual(dns.names(), [`CNAME shop.tracy.test ${S1}`, 'CNAME taken.tracy.test elsewhere.example'])
})

test('only a CNAME to this tunnel is removed; one pointing elsewhere is kept', async () => {
  const dns = fakeDns()
  dns.seed('shop.tracy.test', S1)
  dns.seed('other.tracy.test', 'elsewhere.example')
  assert.equal(await dns.client.removeCname('shop.tracy.test', S1), 'removed')
  assert.equal(await dns.client.removeCname('shop.tracy.test', S1), 'absent')
  assert.equal(await dns.client.removeCname('other.tracy.test', S1), 'kept')
  assert.deepEqual(dns.names(), ['CNAME other.tracy.test elsewhere.example'])
})

test('the whole zone is read page by page', async () => {
  const dns = fakeDns({ pageSize: 2 })
  for (const name of ['a', 'b', 'c', 'd', 'e']) dns.seed(`${name}.tracy.test`, S1)
  assert.deepEqual(
    (await dns.client.listAll()).map((r) => r.name),
    ['a', 'b', 'c', 'd', 'e'].map((n) => `${n}.tracy.test`)
  )
  assert.equal(dns.calls.filter((call) => call.startsWith('GET')).length, 3)
})

test('a refusing or absent API is DnsUnavailable, and the token is never in the error', async () => {
  const dns = fakeDns()
  dns.down = true
  await assert.rejects(dns.client.ensureCname('shop.tracy.test', S1), (error) => {
    assert.ok(error instanceof DnsUnavailable)
    assert.equal(error.why, 'HTTP_503')
    assert.equal(String(error.message).includes(DNS_TOKEN), false)
    return true
  })
})

test('zone names are read once per ttl; a failed read answers from what was known and retries a minute later', async () => {
  const dns = fakeDns()
  dns.seed('cowork.tracy.test', 'master.cfargotunnel.com')
  let t = 0
  const zone = zoneNames(dns.client, { ttlMs: 300_000, retryMs: 60_000, now: () => t, log: { warn() {} } })
  assert.equal(await zone.has('COWORK.tracy.test'), true)
  assert.equal(await zone.has('shop.tracy.test'), false)
  assert.equal(dns.calls.length, 1)
  t = 301_000
  dns.down = true
  assert.equal(await zone.has('cowork.tracy.test'), true, 'the last good read still answers')
  t = 330_000
  await zone.has('cowork.tracy.test')
  assert.equal(dns.calls.length, 2, 'no retry inside the minute')
  assert.equal(await zoneNames(null).has('cowork.tracy.test'), false)
})
