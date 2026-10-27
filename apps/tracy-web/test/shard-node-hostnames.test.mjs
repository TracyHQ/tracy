import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { verifyShardRequest } from '../src/lib/shard-channel.js'
import { hostnameBroker } from '../src/shard/master-link.js'
import {
  BROKERED_ZONE,
  brokeredHostnames,
  hostnamesFromConfig,
  reconcileHostnames
} from '../src/sites/site-domain-provider.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
/** The master's answer to the custom-hostname door, as the contract writes it (§5). */
const H = (id, hostname, status = 'active') => ({
  hostname,
  id,
  status,
  sslStatus: status,
  validationRecords: [{ type: 'TXT', name: `_acme-challenge.${hostname}`, value: 'v-1' }]
})
const ok = (body) => ({ ok: true, status: 200, body })
const no = (status, body = null) => ({ ok: false, status, body })

test('the adapter: add, status and remove of the master, read as the Cloudflare client the own-domain code knows', async () => {
  const asked = []
  const answers = {
    add: ok(H('cf-1', 'www.example.com', 'pending')),
    status: ok(H('cf-1', 'www.example.com')),
    remove: ok(H('cf-1', 'www.example.com', 'deleted'))
  }
  const client = brokeredHostnames({
    call: async (body) => {
      asked.push(body)
      return answers[body.op]
    }
  })
  const row = { name: 'www.example.com', site_key: 'shop.tracy.ai', provider_id: 'cf-1' }
  assert.equal(client.zoneId, BROKERED_ZONE)
  // The shared signature (contract §5): the row rides in the options object, beside W1's `originServer`.
  const made = await client.create('www.example.com', { row })
  assert.equal(made.created.id, 'cf-1')
  assert.equal(made.created.status, 'pending')
  assert.deepEqual(made.created.records, [
    { type: 'TXT', name: '_acme-challenge.www.example.com', value: 'v-1' }
  ])
  assert.equal((await client.get('cf-1', { row })).found.sslStatus, 'active')
  assert.deepEqual(await client.get('cf-other', { row }), { error: 'MISMATCH' })
  assert.equal((await client.find('www.example.com', { row })).found.length, 1)
  assert.deepEqual(await client.remove('cf-1', { row }), { removed: true })
  assert.deepEqual(
    asked.map((a) => a.op),
    ['add', 'status', 'status', 'status', 'remove']
  )
  assert.deepEqual(asked[0], { siteKey: 'shop.tracy.ai', domain: 'www.example.com', op: 'add' })
  assert.ok(
    asked.every((a) => ['add', 'status', 'remove'].includes(a.op)),
    'never create, get or find'
  )
  // `originServer` is the master's business (W1 Task 15): handed in, it changes nothing here.
  assert.equal(
    (await client.create('www.example.com', { originServer: 's2.tracy.ai', row })).created.id,
    'cf-1'
  )
})

test('the master’s refusals and silences are read as the closed outcomes, never as a hostname or an absence', async () => {
  const say = (answer) => brokeredHostnames({ call: async () => answer })
  const row = { name: 'www.example.com', site_key: 'shop.tracy.ai' }
  const create = (answer) => say(answer).create('www.example.com', { row })
  assert.deepEqual(await create(no(0)), { uncertain: 'UNREACHABLE' })
  assert.deepEqual(await create(no(502, { code: 'CLOUDFLARE', detail: 'timeout' })), {
    uncertain: 'CLOUDFLARE'
  })
  assert.deepEqual(await create(no(503)), { uncertain: 'HTTP_503' })
  assert.deepEqual(await create(no(409, { code: 'DOMAIN_TAKEN', shard: 's3' })), { refused: 'DOMAIN_TAKEN' })
  assert.deepEqual(await create(no(404, { code: 'UNKNOWN_SITE' })), { refused: 'UNKNOWN_SITE' })
  assert.deepEqual(await create(no(403, { code: 'SIGNATURE_INVALID', why: 'signature' })), {
    refused: 'SIGNATURE_INVALID'
  })
  assert.deepEqual(await create(ok(H('cf-1', 'evil.example.com'))), { uncertain: 'MALFORMED' })
  assert.deepEqual(await say(ok({})).find('www.example.com', { row }), { error: 'MALFORMED' })
  assert.deepEqual(await say(no(404, { code: 'UNKNOWN_SITE' })).get('cf-1', { row }), {
    error: 'UNKNOWN_SITE'
  })
  assert.deepEqual(await say(no(404, { code: 'UNKNOWN_SITE' })).remove('cf-1', { row }), { gone: true })
  assert.deepEqual(await say(no(502, { code: 'CLOUDFLARE' })).remove('cf-1', { row }), {
    error: 'CLOUDFLARE'
  })
  assert.deepEqual(await say(ok(H('cf-1', 'www.example.com'))).remove('cf-1'), { error: 'NO_ROW' })
  assert.deepEqual(await say(ok(H('cf-1', 'www.example.com'))).get('cf-1', { row: null }), {
    error: 'NO_ROW'
  })
})

test('a hostname the master does not hold, or Cloudflare no longer has, is gone for get and nothing for find', async () => {
  const say = (answer) => brokeredHostnames({ call: async () => answer })
  const row = { name: 'www.example.com', site_key: 'shop.tracy.ai', provider_id: 'cf-1' }
  // Contract §5: `status` of a name never registered answers 200 with `status: "absent"` and no id.
  const absent = ok({
    hostname: 'www.example.com',
    id: null,
    status: 'absent',
    sslStatus: null,
    validationRecords: []
  })
  assert.deepEqual(await say(absent).get('cf-1', { row }), { gone: true })
  assert.deepEqual(await say(absent).find('www.example.com', { row }), { found: [] })
  // Contract §6: a name in the master's table that Cloudflare no longer has is 404 HOSTNAME_GONE.
  const vanished = no(404, { code: 'HOSTNAME_GONE' })
  assert.deepEqual(await say(vanished).get('cf-1', { row }), { gone: true })
  assert.deepEqual(await say(vanished).find('www.example.com', { row }), { found: [] })
  // Neither is a certain removal: `remove` keeps the contract's one gone answer, UNKNOWN_SITE.
  assert.deepEqual(await say(vanished).remove('cf-1', { row }), { error: 'HOSTNAME_GONE' })
  // A bare `absent` on another name is not this hostname's absence either.
  const other = ok({
    hostname: 'other.example.com',
    id: null,
    status: 'absent',
    sslStatus: null,
    validationRecords: []
  })
  assert.deepEqual(await say(other).find('www.example.com', { row }), { error: 'MALFORMED' })
})

test(
  'on a shard the configured client is the brokered one; a proven domain is added through the master, with no event',
  opts,
  async () => {
    const SECRET = 'ab'.repeat(32)
    const seen = []
    const fetchImpl = async (input, init) => {
      const u = new URL(String(input))
      assert.deepEqual(
        verifyShardRequest({
          secret: SECRET,
          headers: init.headers,
          method: init.method,
          path: u.pathname,
          body: init.body
        }),
        { ok: true }
      )
      const body = JSON.parse(init.body)
      seen.push([u.pathname, body.op, body.domain, body.siteKey])
      return Response.json(H('cf-9', body.domain, body.op === 'add' ? 'pending' : 'active'))
    }
    const config = readConfig({
      TRACY_ORIGIN: 'https://s2.tracy.ai',
      SITE_DOMAIN: 'tracy.ai',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 's2',
      HOST_NAME: 's2',
      HOST_s2_ORIGIN: 'http://host',
      HOST_s2_DSH_ORIGIN: 'http://dsh',
      HOST_s2_SECRET: 'h',
      SEAT_s2_SECRET: 'k',
      TRACY_DEPLOYMENT_ROLE: 'shard',
      MASTER_ORIGIN: 'https://cowork.tracy.ai',
      SHARD_SECRET: SECRET,
      SESSION_COOKIE_NAME: 'tracy_sess_s2'
    })
    assert.equal(
      hostnamesFromConfig(config, fetchImpl),
      null,
      'no broker handed in: own domains are off, said plainly'
    )
    assert.equal(
      hostnameBroker({ deploymentRole: 'master', shard: null }, fetchImpl),
      null,
      'the master brokers nothing'
    )
    const client = hostnamesFromConfig(config, fetchImpl, hostnameBroker(config, fetchImpl))
    assert.equal(client.zoneId, BROKERED_ZONE)
    await db.pool.query(
      "insert into site(site_key,label,host,platform) values('shop.tracy.ai','shop','s2','wordpress')"
    )
    await db.pool.query(
      "insert into site_name(name,site_key,kind,state,token,hold_until,ownership_proven_at) values('www.example.com','shop.tracy.ai','custom','pending','t0',now() + interval '72 hours',now())"
    )
    await reconcileHostnames(db.pool, { hostnames: client, log: { warn() {}, error() {} } })
    assert.deepEqual(seen[0], ['/api/shards/s2/custom-hostname', 'add', 'www.example.com', 'shop.tracy.ai'])
    const row = (
      await db.pool.query(
        "select state, provider_id, zone_id from site_custom_hostname where name = 'www.example.com'"
      )
    ).rows[0]
    assert.deepEqual(row, { state: 'created', provider_id: 'cf-9', zone_id: BROKERED_ZONE })
    assert.equal(
      (await db.pool.query('select count(*)::int as n from shard_event_outbox')).rows[0].n,
      0,
      'a custom domain travels only through the custom-hostname door, never as an event'
    )
  }
)
