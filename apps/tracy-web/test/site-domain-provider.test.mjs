import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { addressChangeState, confirmOwnDomains, mountSiteAddress } from '../src/sites/address.js'
import {
  cloudflareHostnames,
  gateOf,
  hostnameGate,
  readHostname,
  reconcileHostnames,
  statusReason
} from '../src/sites/site-domain-provider.js'
import { fakeCloudflare, FAKE_TOKEN } from './_fake-cloudflare.mjs'
import { fileDb } from './_db.mjs'

// Cloudflare for SaaS, as tracy-web drives it (#1037, slice 2): every case is the real code against
// a stand-in API (`_fake-cloudflare.mjs`) that answers as Cloudflare documents it, on a real schema.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const SITE = 'shop.localhost'
const OTHER = 'other.localhost'
const DOMAIN = 'www.example.com'
const TOKEN = 'a'.repeat(48)

/** A site and its own domain, proven (`_tracy` TXT found) unless `proven: false`. */
async function reservation({
  siteKey = SITE,
  name = DOMAIN,
  token = TOKEN,
  proven = true,
  state = 'pending'
} = {}) {
  const { pool } = db
  await pool.query(
    `insert into site(site_key,label,host,platform,address,attached,publish)
     values($1,$2,'local','wordpress',$3,true,'published') on conflict do nothing`,
    [siteKey, siteKey.split('.')[0], `http://${siteKey}:8080/`]
  )
  await pool.query(
    `insert into site_name(name,site_key,kind,state,token,hold_until,ownership_proven_at)
     values($1,$2,'custom',$3,$4,now() + interval '72 hours',case when $5 then now() end)`,
    [name, siteKey, state, token, proven]
  )
}
const row = async (name = DOMAIN) =>
  (await db.pool.query('select * from site_custom_hostname where name = $1', [name])).rows[0] ?? null
/** Make every row due now, as the clock moving on would. */
const due = () => db.pool.query("update site_custom_hostname set next_at = now() - interval '1 second'")
const quiet = { warn: () => {}, error: () => {} }
const sync = (cf, extra = {}) => reconcileHostnames(db.pool, { hostnames: cf.client, log: quiet, ...extra })

test(
  'a reservation nobody proved gets no hostname; a proven one gets exactly one, made once',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation({ proven: false })
    await sync(cf)
    assert.equal(await row(), null, 'an unproven name is never registered')
    assert.deepEqual(cf.calls, [])

    await db.pool.query('update site_name set ownership_proven_at = now() where name = $1', [DOMAIN])
    await sync(cf)
    const made = await row()
    assert.equal(made.state, 'created')
    assert.equal(made.site_key, SITE)
    assert.equal(made.token, TOKEN)
    assert.equal(made.provider_id, cf.byName(DOMAIN).id)
    assert.deepEqual(cf.calls, [`POST /client/v4/zones/${cf.zoneId}/custom_hostnames`])

    // Asked again (a retry, a second replica, the door and the sweep): read by its id, never made twice.
    await due()
    await sync(cf)
    await sync(cf, { name: DOMAIN, force: true })
    assert.equal(cf.hostnames.size, 1)
    assert.equal(cf.calls.filter((c) => c.startsWith('POST')).length, 1)
    assert.ok(
      cf.calls
        .slice(1)
        .every((c) => c === `GET /client/v4/zones/${cf.zoneId}/custom_hostnames/${made.provider_id}`)
    )
  }
)

test(
  'pending validation, certificate pending, active: each read is written, and only both active is ready',
  opts,
  async () => {
    const cf = fakeCloudflare()
    cf.state = {
      status: 'pending',
      ssl: 'pending_validation',
      records: [
        { txt_name: '_acme-challenge.www.example.com', txt_value: 'challenge-1' },
        { http_url: 'http://www.example.com/.well-known/pki-validation/x.txt', http_body: 'body' },
        { txt_name: '_acme-challenge.www.example.com', txt_value: 'challenge-1' }
      ]
    }
    await reservation()
    // The name's route is installed and its probe waits on a long backoff.
    await db.pool.query(
      "update site_name set routed_at = now(), probe_secret = 's', probe_next_at = now() + interval '1 hour' where name = $1",
      [DOMAIN]
    )
    await sync(cf)
    let made = await row()
    assert.equal(made.hostname_status, 'pending')
    assert.equal(made.reason, 'HOSTNAME_PENDING')
    // Only DNS records, each once: the HTTP challenge is Cloudflare's own to serve.
    assert.deepEqual(made.records, [
      { type: 'TXT', name: '_acme-challenge.www.example.com', value: 'challenge-1' }
    ])
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'HOSTNAME_PENDING'
    })

    cf.set(DOMAIN, { status: 'active', ssl: 'pending_issuance' })
    await due()
    await sync(cf)
    made = await row()
    assert.equal(made.reason, 'CERT_PENDING')
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'CERT_PENDING'
    })

    cf.set(DOMAIN, { ssl: 'active' })
    await due()
    const out = await sync(cf)
    assert.deepEqual(out.ready, [DOMAIN])
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), { ready: true })
    made = await row()
    assert.equal(made.reason, null)
    // Both measured on the database's own clock, never this process's (the rows are stamped there).
    const clock = (
      await db.pool.query(
        `select h.next_at > clock_timestamp() + interval '5 hours' as later,
                n.probe_next_at <= clock_timestamp() as now
           from site_custom_hostname h join site_name n on n.name = h.name where h.name = $1`,
        [DOMAIN]
      )
    ).rows[0]
    assert.equal(clock.later, true, 'a ready hostname is read again hours later')
    assert.equal(clock.now, true, 'a routed name is asked at once when its hostname is ready')

    // A certificate that can no longer be issued says so.
    cf.set(DOMAIN, { ssl: 'validation_timed_out' })
    await due()
    await sync(cf)
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'CERT_FAILED'
    })
  }
)

test(
  'a name Cloudflare already holds for somebody else is refused, never taken over, and never deleted',
  opts,
  async () => {
    const cf = fakeCloudflare()
    const theirs = cf.seed(DOMAIN)
    await reservation()
    await sync(cf)
    const held = await row()
    assert.equal(held.state, 'conflict')
    assert.equal(held.provider_id, null)
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'HOSTNAME_CONFLICT'
    })
    // The reservation goes: its row goes, and the other holder's hostname is untouched.
    await db.pool.query('delete from site_name where name = $1', [DOMAIN])
    await due()
    await sync(cf)
    assert.equal(await row(), null)
    assert.ok(cf.hostnames.has(theirs.id))
    assert.equal(
      cf.calls.some((c) => c.startsWith('DELETE')),
      false
    )
  }
)

test(
  "a create whose answer never came: nothing found under the name is made again; something found is NOT taken as Tracy's",
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    cf.fail = ({ method }) => (method === 'POST' ? 'hang' : undefined)
    await sync(cf)
    let left = await row()
    assert.equal(left.state, 'posting')
    assert.equal(left.reason, 'HOSTNAME_UNCONFIRMED')
    assert.deepEqual(gateOf(left), { ready: false, reason: 'HOSTNAME_UNCONFIRMED' })

    // It never landed: the next pass finds nothing, and makes it.
    cf.fail = () => undefined
    await due()
    await sync(cf)
    await due()
    await sync(cf)
    left = await row()
    assert.equal(left.state, 'created')
    assert.equal(cf.hostnames.size, 1)

    // A second reservation whose create DID land but whose answer was lost.
    await db.pool.query('delete from site_name where name = $1', [DOMAIN])
    await due()
    await sync(cf)
    assert.equal(await row(), null)
    const name = 'shop.example.org'
    await reservation({ siteKey: OTHER, name, token: 'b'.repeat(48) })
    cf.fail = ({ method }) => (method === 'POST' ? 'land-then-hang' : undefined)
    await sync(cf)
    cf.fail = () => undefined
    await due()
    await sync(cf)
    left = await row(name)
    assert.equal(left.state, 'posting', 'a hostname nobody can prove is this create is not adopted')
    assert.equal(left.provider_id, null)
    // Its reservation removed: still not deleted, because nothing proves it is Tracy's.
    const deletes = cf.calls.filter((c) => c.startsWith('DELETE')).length
    await db.pool.query('delete from site_name where name = $1', [name])
    await due()
    await sync(cf)
    assert.equal((await row(name)).state, 'deleting')
    assert.equal(cf.byName(name) !== null, true)
    assert.equal(cf.calls.filter((c) => c.startsWith('DELETE')).length, deletes)
  }
)

test(
  'a refused create is tried again later; an unreadable status keeps the last one read and says why',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    cf.fail = ({ method }) =>
      method === 'POST'
        ? { status: 400, body: { success: false, errors: [{ code: 1409, message: 'bad' }] } }
        : undefined
    await sync(cf)
    let left = await row()
    assert.equal(left.state, 'creating')
    assert.equal(left.reason, 'REFUSED_HTTP_400')
    cf.fail = () => undefined
    await due()
    await sync(cf)
    left = await row()
    assert.equal(left.state, 'created')
    assert.equal(left.hostname_status, 'active')

    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), { ready: true })

    cf.fail = ({ method }) => (method === 'GET' ? { status: 500, body: null } : undefined)
    await due()
    await sync(cf)
    left = await row()
    assert.equal(left.reason, 'READ_HTTP_500')
    assert.equal(left.hostname_status, 'active', 'what was read last is kept')
    // …but not believed: a read that failed is no evidence the hostname still serves.
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'HOSTNAME_UNREAD'
    })
    cf.fail = ({ method }) => (method === 'GET' ? 'hang' : undefined)
    await due()
    await sync(cf)
    assert.equal((await row()).reason, 'READ_TIMEOUT')
    // A 200 that is not a readable hostname is a failed read too, never one that succeeded.
    cf.fail = ({ method }) =>
      method === 'GET' ? { status: 200, body: { success: true, result: {} } } : undefined
    await due()
    await sync(cf)
    assert.equal((await row()).reason, 'READ_MALFORMED')
    assert.equal((await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE })).reason, 'HOSTNAME_UNREAD')
    // An answer for another name than the row's is not this hostname.
    cf.fail = ({ method, path }) =>
      method === 'GET'
        ? {
            status: 200,
            body: {
              success: true,
              result: {
                id: path.split('/').pop(),
                hostname: 'else.example.net',
                status: 'active',
                ssl: { status: 'active' }
              }
            }
          }
        : undefined
    await due()
    await sync(cf)
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'HOSTNAME_CONFLICT'
    })
    // A read that succeeds again is believed again.
    cf.fail = () => undefined
    await due()
    await sync(cf)
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), { ready: true })
  }
)

test(
  'removed, or its site deleted: the hostname is deleted at Cloudflare; gone already counts; a failed delete is kept and tried again',
  opts,
  async () => {
    const cf = fakeCloudflare()
    // Removed.
    await reservation()
    await sync(cf)
    const id = (await row()).provider_id
    await db.pool.query('delete from site_name where name = $1', [DOMAIN])
    cf.fail = ({ method }) => (method === 'DELETE' ? { status: 502, body: null } : undefined)
    await due()
    await sync(cf)
    const kept = await row()
    assert.equal(kept.state, 'deleting')
    assert.equal(kept.reason, 'DELETE_HTTP_502')
    assert.ok(cf.hostnames.has(id))
    // A 2xx that does not say it succeeded is no deletion: the row and its id stay.
    cf.fail = ({ method }) =>
      method === 'DELETE'
        ? { status: 200, body: { success: false, errors: [{ code: 1000, message: 'no' }], result: null } }
        : undefined
    await due()
    await sync(cf)
    assert.equal((await row()).reason, 'DELETE_UNCONFIRMED')
    assert.equal((await row()).provider_id, id)
    assert.ok(cf.hostnames.has(id))
    cf.fail = () => undefined
    await due()
    const out = await sync(cf)
    assert.deepEqual(out.deleted, [DOMAIN])
    assert.equal(await row(), null)
    assert.equal(cf.hostnames.has(id), false)

    // Its site deleted (the reservation goes with it), and the hostname already gone at Cloudflare.
    await reservation({ siteKey: OTHER, token: 'c'.repeat(48) })
    await due()
    await sync(cf)
    const second = (await row()).provider_id
    cf.hostnames.delete(second)
    await db.pool.query('delete from site where site_key = $1', [OTHER])
    await due()
    await sync(cf)
    assert.equal(await row(), null)
    assert.ok(cf.calls.includes(`DELETE /client/v4/zones/${cf.zoneId}/custom_hostnames/${second}`))
  }
)

test(
  'a create answered after its reservation was removed: the late answer is written, and the hostname deleted',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    const real = cf.fetchImpl
    // The reservation goes while the create is in the air.
    cf.client = (await import('../src/sites/site-domain-provider.js')).cloudflareHostnames({
      zoneId: cf.zoneId,
      token: cf.token,
      apiBase: 'https://cf.test/client/v4',
      fetchImpl: async (url, init) => {
        if ((init.method ?? 'GET') === 'POST') {
          // Another pass of the sweep, meanwhile, sees the reservation gone (`markUnbound`).
          await db.pool.query('delete from site_name where name = $1', [DOMAIN])
          await db.pool.query(
            "update site_custom_hostname set state = 'deleting' where name = $1 and state = 'posting'",
            [DOMAIN]
          )
        }
        return real(url, init)
      }
    })
    await sync(cf)
    const late = await row()
    assert.equal(late.state, 'deleting')
    assert.ok(late.provider_id, 'the id of what was made is kept, so it can be deleted')
    assert.equal(late.claimed_until, null, 'the pass let the row go')
    assert.equal(
      (await db.pool.query('select next_at <= clock_timestamp() as due from site_custom_hostname')).rows[0]
        .due,
      true,
      'an ACTIVE hostname whose reservation went is due for its delete at once, not in six hours'
    )
    // No `due()`: the next ordinary pass deletes it.
    await sync(cf)
    assert.equal(await row(), null)
    assert.equal(cf.hostnames.size, 0)
  }
)

test(
  'the token is sent only as the bearer header: never in a row, a reading, a log line or an error',
  opts,
  async () => {
    const cf = fakeCloudflare()
    const logged = []
    const log = { warn: (...a) => logged.push(a.join(' ')), error: (...a) => logged.push(a.join(' ')) }
    await reservation()
    cf.fail = ({ method }) =>
      method === 'POST' ? { status: 500, body: { errors: [{ code: 1, message: FAKE_TOKEN }] } } : undefined
    await reconcileHostnames(db.pool, { hostnames: cf.client, log })
    cf.fail = () => undefined
    await due()
    await reconcileHostnames(db.pool, { hostnames: cf.client, log })
    const everything = JSON.stringify([
      (await db.pool.query('select * from site_custom_hostname')).rows,
      logged
    ])
    assert.equal(everything.includes(FAKE_TOKEN), false)
    // And a wrong token is an answer like any other failure, not a crash.
    const wrong = fakeCloudflare({ token: 'another' })
    wrong.client = (await import('../src/sites/site-domain-provider.js')).cloudflareHostnames({
      zoneId: wrong.zoneId,
      token: 'not-the-token',
      apiBase: 'https://cf.test/client/v4',
      fetchImpl: wrong.fetchImpl
    })
    assert.deepEqual(await wrong.client.create('x.example.com'), { refused: 'HTTP_403' })
  }
)

test('statusReason and readHostname read only what Cloudflare said', () => {
  assert.equal(statusReason('active', 'active'), null)
  assert.equal(statusReason('pending', 'initializing'), 'HOSTNAME_PENDING')
  assert.equal(statusReason('active', 'pending_deployment'), 'CERT_PENDING')
  assert.equal(statusReason('blocked', 'active'), 'HOSTNAME_FAILED')
  assert.equal(statusReason('active', 'expired'), 'CERT_FAILED')
  assert.equal(readHostname({ id: 1 }), null)
  // Every validation record, each whole: ten of them, one value far past 255 characters.
  const long = 'v'.repeat(600)
  const many = Array.from({ length: 10 }, (_, i) => ({
    txt_name: `_acme-${i}.www.example.com`,
    txt_value: i ? `v${i}` : long
  }))
  const read = readHostname({
    id: 'x',
    hostname: 'www.example.com',
    status: 'pending',
    ssl: { status: 'pending_validation', validation_records: many }
  })
  assert.equal(read.records.length, 10)
  assert.equal(read.records[0].value, long)
  assert.equal(read.recordsWhole, true)
  // More than can be shown whole has no list to show, rather than one cut short — and the hostname
  // keeps its identity: its id is never lost to what the card can show.
  const raw = (records) => ({
    id: 'x',
    hostname: 'www.example.com',
    status: 'pending',
    ssl: { validation_records: records }
  })
  for (const over of [
    raw(Array.from({ length: 33 }, (_, i) => ({ txt_name: `_a${i}.www.example.com`, txt_value: 'v' }))),
    raw([{ txt_name: '_a.www.example.com', txt_value: 'v'.repeat(4097) }])
  ]) {
    const kept = readHostname(over)
    assert.equal(kept.id, 'x')
    assert.equal(kept.hostname, 'www.example.com')
    assert.deepEqual(kept.records, [])
    assert.equal(kept.recordsWhole, false)
  }
  assert.deepEqual(
    readHostname({ id: 'x', hostname: 'WWW.Example.com.', status: 'active', ssl: { status: 'active' } }),
    {
      id: 'x',
      hostname: 'www.example.com',
      status: 'active',
      sslStatus: 'active',
      records: [],
      recordsWhole: true
    }
  )
})

// ── the doors and the probe, with a stand-in Cloudflare ─────────────────────────────────────────

function doors({ cf = fakeCloudflare(), probe = async () => ({ status: 'ok' }), txt = {} } = {}) {
  const app = new Hono()
  const probed = []
  mountSiteAddress(app, {
    pool: db.pool,
    config: { origin: 'http://tracy.test:8080', siteDomain: 'tracy.test', siteAddressPrefix: '' },
    requireGrant: async () => ({ grant: { role: 'owner' }, email: 'owner@test.example' }),
    run: async () => assert.fail('an own domain runs no site-address job'),
    connectDomainOn: async () => true,
    dnsTxt: async (name) => {
      if (txt[name]) return txt[name]
      throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' })
    },
    dnsCname: async () => {
      throw Object.assign(new Error('nodata'), { code: 'ENODATA' })
    },
    dnsAskMs: 200,
    routingTarget: async () => 'connect.tracy.test',
    domainProbe: async (r) => {
      probed.push(r.name)
      return probe(r)
    },
    customHostnames: cf ? cf.client : null
  })
  const send = async (method, path, body) => {
    const res = await app.request(`/api/sites/${SITE}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { status: res.status, body: await res.json() }
  }
  return { app, send, probed, cf }
}

test(
  'without Cloudflare for SaaS configured the Connect domain doors say it is not available, and write nothing',
  opts,
  async () => {
    await db.pool.query(
      "insert into site(site_key,label,host,platform,address,attached) values($1,'shop','local','wordpress','http://shop.localhost:8080/',true)",
      [SITE]
    )
    const { send } = doors({ cf: null })
    assert.deepEqual(await send('PUT', '/address', { name: DOMAIN, kind: 'custom' }), {
      status: 503,
      body: { code: 'OWN_DOMAIN_UNAVAILABLE' }
    })
    assert.deepEqual(await send('POST', '/address/verify', { name: DOMAIN }), {
      status: 503,
      body: { code: 'OWN_DOMAIN_UNAVAILABLE' }
    })
    assert.equal(
      (await db.pool.query("select count(*)::int as n from site_name where kind = 'custom'")).rows[0].n,
      0
    )
  }
)

test(
  'the card names CNAME → connect.<zone> and the TXT proof; proving it registers the hostname at once, and a later reservation of the name waits for its deletion',
  opts,
  async () => {
    await db.pool.query(
      "insert into site(site_key,label,host,platform,address,attached,publish) values($1,'shop','local','wordpress','http://shop.localhost:8080/',true,'published')",
      [SITE]
    )
    const cf = fakeCloudflare()
    cf.state = {
      status: 'pending',
      ssl: 'pending_validation',
      records: [{ txt_name: `_acme-challenge.${DOMAIN}`, txt_value: 'v1' }]
    }
    const txt = {}
    const { send } = doors({ cf, txt })
    const saved = await send('PUT', '/address', { name: DOMAIN, kind: 'custom' })
    assert.equal(saved.status, 202)
    assert.deepEqual(saved.body.pending.routing, { type: 'CNAME', name: DOMAIN, value: 'connect.tracy.test' })
    assert.equal(saved.body.pending.verification.name, `_tracy.${DOMAIN}`)
    assert.equal('hostname' in saved.body.pending, false, 'nothing is registered for a name nobody proved')
    assert.equal(cf.calls.length, 0)

    txt[`_tracy.${DOMAIN}`] = [[saved.body.pending.verification.value]]
    const checked = await send('POST', '/address/verify', { name: DOMAIN })
    assert.equal(checked.status, 202)
    assert.deepEqual(checked.body.pending.hostname, { ready: false, reason: 'HOSTNAME_PENDING' })
    assert.deepEqual(
      checked.body.pending.checks.filter((c) => c.record === 'validation'),
      [
        {
          record: 'validation',
          type: 'TXT',
          name: `_acme-challenge.${DOMAIN}`,
          expected: 'v1',
          status: 'unchecked',
          observed: []
        }
      ]
    )
    assert.equal(cf.hostnames.size, 1)

    // Removed (never handed to the host): the hostname is deleted before the door answers.
    const removed = await send('DELETE', '/address/domain', { name: DOMAIN })
    assert.equal(removed.status, 200)
    assert.equal(cf.hostnames.size, 0)
    assert.equal(await row(), null)

    // A name whose hostname could not be deleted yet is not reserved again until it is.
    await send('PUT', '/address', { name: DOMAIN, kind: 'custom' })
    txt[`_tracy.${DOMAIN}`] = [
      [(await db.pool.query('select token from site_name where name=$1', [DOMAIN])).rows[0].token]
    ]
    await send('POST', '/address/verify', { name: DOMAIN })
    cf.fail = ({ method }) => (method === 'DELETE' ? { status: 503, body: null } : undefined)
    assert.equal((await send('DELETE', '/address/domain', { name: DOMAIN })).status, 200)
    assert.equal((await row()).state, 'deleting')
    assert.deepEqual(await send('PUT', '/address', { name: DOMAIN, kind: 'custom' }), {
      status: 409,
      body: { code: 'DOMAIN_RELEASING' }
    })
    cf.fail = () => undefined
    assert.equal(
      (await send('PUT', '/address', { name: DOMAIN, kind: 'custom' })).status,
      202,
      'free once it is deleted'
    )
  }
)

test(
  'connected needs the hostname AND its certificate active AND the HTTPS probe: the probe is not even made before',
  opts,
  async () => {
    const cf = fakeCloudflare()
    cf.state = { status: 'active', ssl: 'pending_validation', records: [] }
    await reservation()
    await db.pool.query(
      "update site_name set routed_at = now(), carried_at = now(), probe_secret = 's', probe_next_at = now() where name = $1",
      [DOMAIN]
    )
    const probed = []
    const confirm = () =>
      confirmOwnDomains(db.pool, {
        probe: async (r) => {
          probed.push(r.name)
          return { status: 'ok' }
        },
        force: true,
        hostname: {
          refresh: (name) =>
            reconcileHostnames(db.pool, { hostnames: cf.client, name, force: true, log: quiet })
        }
      })
    let out = await confirm()
    assert.deepEqual(out.connected, [])
    assert.deepEqual(probed, [], 'no HTTPS request while the certificate is pending')
    let name = (await db.pool.query('select * from site_name where name = $1', [DOMAIN])).rows[0]
    assert.equal(name.state, 'pending')
    assert.deepEqual(name.probe_reading, { status: 'failed', error: 'CERT_PENDING' })

    cf.set(DOMAIN, { ssl: 'active' })
    out = await confirm()
    assert.deepEqual(out.connected, [DOMAIN])
    assert.deepEqual(probed, [DOMAIN])
    name = (await db.pool.query('select * from site_name where name = $1', [DOMAIN])).rows[0]
    assert.equal(name.state, 'active')
    assert.ok(name.connected_at)

    // A failing probe with both active stays pending, with the probe's own reason.
    await reservation({ siteKey: OTHER, name: 'shop.example.org', token: 'd'.repeat(48) })
    await db.pool.query(
      "update site_name set routed_at = now(), carried_at = now(), probe_secret = 't', probe_next_at = now() where name = 'shop.example.org'"
    )
    cf.state = { status: 'active', ssl: 'active', records: [] }
    await confirmOwnDomains(db.pool, {
      probe: async () => ({ status: 'failed', error: 'PAGE_NOT_SITE' }),
      siteKey: OTHER,
      force: true,
      hostname: {
        refresh: (n) =>
          reconcileHostnames(db.pool, { hostnames: cf.client, name: n, force: true, log: quiet })
      }
    })
    const other = (await db.pool.query("select * from site_name where name = 'shop.example.org'")).rows[0]
    assert.equal(other.state, 'pending')
    assert.deepEqual(other.probe_reading, { status: 'failed', error: 'PAGE_NOT_SITE' })
  }
)

test(
  'a READY hostname whose reservation goes is deleted on the next pass, not at its next read hours later',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    await sync(cf)
    assert.equal((await row()).reason, null, 'ready: next read in hours')
    await db.pool.query('delete from site_name where name = $1', [DOMAIN])
    // No `due()`: the sweep's ordinary pass, with the clock where it is.
    const out = await sync(cf)
    assert.deepEqual(out.deleted, [DOMAIN])
    assert.equal(cf.hostnames.size, 0)
  }
)

test(
  'a forced pass never takes a row another pass holds: a create in the air is not looked up by name, sent again, or robbed of its id',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    let during = null
    cf.client = cloudflareHostnames({
      zoneId: cf.zoneId,
      token: cf.token,
      apiBase: 'https://cf.test/client/v4',
      fetchImpl: async (url, init) => {
        if ((init.method ?? 'GET') === 'POST' && during === null) {
          // Check DNS, and the probe's read just before it asks, while the create is in the air.
          during = await reconcileHostnames(db.pool, {
            hostnames: cf.client,
            name: DOMAIN,
            force: true,
            log: quiet
          })
          assert.equal((await row()).state, 'posting')
        }
        return cf.fetchImpl(url, init)
      }
    })
    await sync(cf)
    assert.equal(during.taken, 0, 'the forced pass took nothing')
    const made = await row()
    assert.equal(made.state, 'created')
    assert.equal(made.provider_id, cf.byName(DOMAIN).id)
    assert.equal(made.claimed_until, null)
    assert.equal(cf.calls.filter((c) => c.startsWith('POST')).length, 1)
    assert.equal(cf.calls.filter((c) => c.includes('?hostname=')).length, 0)
  }
)

test(
  "a create's answer is written only on the row of that create (attempt), never on a later one",
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    cf.client = cloudflareHostnames({
      zoneId: cf.zoneId,
      token: cf.token,
      apiBase: 'https://cf.test/client/v4',
      fetchImpl: async (url, init) => {
        // Another attempt of the row began meanwhile (a claim run out, say).
        if ((init.method ?? 'GET') === 'POST')
          await db.pool.query('update site_custom_hostname set attempt = attempt + 1 where name = $1', [
            DOMAIN
          ])
        return cf.fetchImpl(url, init)
      }
    })
    await sync(cf, { name: DOMAIN })
    const left = await row()
    assert.equal(left.provider_id, null, 'the answer of an earlier create lands on no later attempt')
    assert.equal(left.state, 'posting')
    // …and is not lost: kept by its id, and deleted at Cloudflare on the next sweep.
    const made = cf.byName(DOMAIN).id
    const kept = (await db.pool.query('select * from site_custom_hostname_orphan')).rows
    assert.deepEqual(
      kept.map((o) => [o.provider_id, o.name, o.zone_id]),
      [[made, DOMAIN, cf.zoneId]]
    )
    await sync(cf)
    assert.equal(cf.hostnames.has(made), false)
    assert.equal(
      (await db.pool.query('select count(*)::int as n from site_custom_hostname_orphan')).rows[0].n,
      0
    )
  }
)

test(
  'a pass that outlived its claim writes nothing and lets go of no later claim; the hostname it was answered is deleted, and the name converges on one hostname of its own',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    let later = null
    const real = cf.fetchImpl
    cf.client = cloudflareHostnames({
      zoneId: cf.zoneId,
      token: cf.token,
      apiBase: 'https://cf.test/client/v4',
      fetchImpl: async (url, init) => {
        if ((init.method ?? 'GET') === 'POST' && later === null) {
          // The create hangs past its claim; a later pass takes the row, finds nothing under the name
          // (the create has not landed yet) and puts it back to `creating` under its own claim.
          await db.pool.query("update site_custom_hostname set claimed_until = now() - interval '1 second'")
          later = await reconcileHostnames(db.pool, {
            hostnames: cf.client,
            name: DOMAIN,
            force: true,
            log: quiet
          })
          await db.pool.query(
            "update site_custom_hostname set claimed_until = now() + interval '1 minute', claim_id = gen_random_uuid()"
          )
        }
        return real(url, init)
      }
    })
    await sync(cf, { name: DOMAIN })
    assert.equal(later.taken, 1)
    const left = await row()
    assert.equal(left.state, 'creating', 'the late answer did not overwrite the later pass')
    assert.equal(left.provider_id, null)
    assert.ok(left.claim_id, 'the earlier pass let go of no claim but its own')
    const first = cf.byName(DOMAIN).id
    assert.equal(
      (await db.pool.query('select provider_id from site_custom_hostname_orphan')).rows[0].provider_id,
      first
    )

    // The claim runs out; the sweep deletes the orphan, and the row makes the name's own hostname.
    await db.pool.query('update site_custom_hostname set claimed_until = null, claim_id = null')
    cf.client = cloudflareHostnames({
      zoneId: cf.zoneId,
      token: cf.token,
      apiBase: 'https://cf.test/client/v4',
      fetchImpl: real
    })
    // A create of the name answers `conflict` while the orphan stands; once it is deleted the name
    // is looked at again at once, found free, and created.
    for (let pass = 0; pass < 3; pass++) {
      await due()
      await sync(cf)
    }
    assert.equal(cf.hostnames.has(first), false)
    assert.equal(cf.hostnames.size, 1)
    const made = await row()
    assert.equal(made.state, 'created')
    assert.equal(made.provider_id, cf.byName(DOMAIN).id)
  }
)

test(
  'validation records that cannot be shown whole never cost a hostname its id: the create is kept, it is not ready while it needs them, and a lookup that cannot be read is never "nothing there"',
  opts,
  async () => {
    const cf = fakeCloudflare()
    cf.state = {
      status: 'pending',
      ssl: 'pending_validation',
      records: Array.from({ length: 40 }, (_, i) => ({ txt_name: `_a${i}.${DOMAIN}`, txt_value: `v${i}` }))
    }
    await reservation()
    await sync(cf)
    const made = await row()
    assert.equal(made.state, 'created')
    assert.equal(made.provider_id, cf.byName(DOMAIN).id, 'the id of what was made is kept')
    assert.deepEqual(made.records, [])
    assert.equal(made.reason, 'READ_RECORDS')
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'HOSTNAME_UNREAD'
    })
    // Active, it needs no records: ready.
    cf.set(DOMAIN, { status: 'active', ssl: 'active' })
    await due()
    await sync(cf)
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), { ready: true })

    // A lookup by name whose answer holds an entry that is not a hostname is unreadable, not empty:
    // a row being deleted without an id is never let go on it.
    await db.pool.query(
      "update site_custom_hostname set state = 'deleting', provider_id = null, next_at = now() where name = $1",
      [DOMAIN]
    )
    await db.pool.query('delete from site_name where name = $1', [DOMAIN])
    cf.fail = ({ method, search }) =>
      method === 'GET' && search.includes('hostname=')
        ? { status: 200, body: { success: true, result: [{ hostname: DOMAIN }] } }
        : undefined
    await sync(cf)
    const kept = await row()
    assert.equal(kept.state, 'deleting')
    assert.equal(kept.reason, 'HOSTNAME_UNCONFIRMED')
  }
)

test(
  'a connected domain reads connected only while its hostname is ready as last read: Cloudflare saying otherwise, or not answering, takes the card back to pending with the reason',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    await db.pool.query(
      "update site_name set routed_at = now(), carried_at = now(), probe_secret = 's', probe_next_at = now() where name = $1",
      [DOMAIN]
    )
    await confirmOwnDomains(db.pool, {
      probe: async () => ({ status: 'ok' }),
      force: true,
      hostname: {
        refresh: (name) =>
          reconcileHostnames(db.pool, { hostnames: cf.client, name, force: true, log: quiet })
      }
    })
    const card = () =>
      addressChangeState(
        db.pool,
        { site_key: SITE },
        'owner',
        { siteDomain: 'tracy.test' },
        'connect.tracy.test'
      )
    let state = await card()
    assert.deepEqual(
      state.connected.map((d) => [d.name, d.state]),
      [[DOMAIN, 'connected']]
    )

    cf.set(DOMAIN, { ssl: 'expired' })
    await due()
    await sync(cf)
    state = await card()
    assert.deepEqual(state.connected, [])
    assert.equal(state.pending.name, DOMAIN)
    assert.deepEqual(state.pending.hostname, { ready: false, reason: 'CERT_FAILED' })
    // The proof that stood before is not shown as one: the connection says why, and nothing reads ready.
    assert.equal(state.pending.connection.status, 'failed')
    assert.equal(state.pending.connection.error, 'CERT_FAILED')
    assert.equal(state.pending.readiness.tls, false)

    cf.set(DOMAIN, { ssl: 'active' })
    cf.fail = ({ method }) => (method === 'GET' ? { status: 502, body: null } : undefined)
    await due()
    await sync(cf)
    state = await card()
    assert.equal(state.pending.name, DOMAIN)
    assert.deepEqual(state.pending.hostname, { ready: false, reason: 'HOSTNAME_UNREAD' })
    assert.equal(state.pending.connection.error, 'HOSTNAME_UNREAD')

    cf.fail = () => undefined
    await due()
    await sync(cf)
    state = await card()
    assert.deepEqual(
      state.connected.map((d) => [d.name, d.state]),
      [[DOMAIN, 'connected']],
      'the proof of this attempt still stands once the hostname reads ready again'
    )
  }
)

test(
  'a probe whose hostname could not be read fresh is not made and writes nothing: another pass holds the row, or the read failed to run',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    await sync(cf)
    await db.pool.query(
      "update site_name set routed_at = now(), carried_at = now(), probe_secret = 's', probe_next_at = now() where name = $1",
      [DOMAIN]
    )
    const probed = []
    const confirm = (refresh) =>
      confirmOwnDomains(db.pool, {
        probe: async (r) => {
          probed.push(r.name)
          return { status: 'ok' }
        },
        force: true,
        hostname: { refresh }
      })
    // Another pass holds the row: the active status on it is not read again, so nothing is asked.
    await db.pool.query(
      "update site_custom_hostname set claimed_until = now() + interval '1 minute', claim_id = gen_random_uuid()"
    )
    let out = await confirm((name) =>
      reconcileHostnames(db.pool, { hostnames: cf.client, name, force: true, log: quiet })
    )
    assert.deepEqual(out.connected, [])
    assert.deepEqual(probed, [])
    let name = (await db.pool.query('select * from site_name where name = $1', [DOMAIN])).rows[0]
    assert.equal(name.probe_reading, null, 'no reading written')
    assert.equal(name.state, 'pending')
    // The refresh itself fails: the same.
    out = await confirm(async () => {
      throw new Error('down')
    })
    assert.deepEqual(probed, [])
    // Read fresh: asked, and connected.
    await db.pool.query('update site_custom_hostname set claimed_until = null, claim_id = null')
    out = await confirm((n) =>
      reconcileHostnames(db.pool, { hostnames: cf.client, name: n, force: true, log: quiet })
    )
    assert.deepEqual(out.connected, [DOMAIN])
    assert.deepEqual(probed, [DOMAIN])
  }
)

test(
  'only the exact answer to the question asked is read: a read answered for another id never replaces the id on the row, and a lookup holding another name is never "nothing there"',
  opts,
  async () => {
    const cf = fakeCloudflare()
    await reservation()
    await sync(cf, { name: DOMAIN })
    const mine = (await row()).provider_id
    const other = cf.seed('elsewhere.example.net')
    // A read of this row's id answered with another hostname's: an error, not that hostname.
    cf.fail = ({ method, path }) =>
      method === 'GET' && path.endsWith(mine)
        ? {
            status: 200,
            body: { success: true, errors: [], result: { ...other, ssl: { status: 'active' } } }
          }
        : undefined
    await due()
    await sync(cf, { name: DOMAIN })
    const read = await row()
    assert.equal(read.provider_id, mine, 'the id on the row is never replaced')
    assert.equal(read.reason, 'READ_MISMATCH')
    assert.deepEqual(await hostnameGate(db.pool, { name: DOMAIN, siteKey: SITE }), {
      ready: false,
      reason: 'HOSTNAME_UNREAD'
    })
    // Removed while its id is unknown, and the lookup by name answers another name: kept, never forgotten.
    cf.fail = () => undefined
    await db.pool.query(
      "update site_custom_hostname set state = 'deleting', provider_id = null, next_at = now() where name = $1",
      [DOMAIN]
    )
    await db.pool.query('delete from site_name where name = $1', [DOMAIN])
    cf.fail = ({ method, search }) =>
      method === 'GET' && search.includes('hostname=')
        ? {
            status: 200,
            body: { success: true, errors: [], result: [{ ...other, ssl: { status: 'active' } }] }
          }
        : undefined
    await sync(cf, { name: DOMAIN })
    const kept = await row()
    assert.equal(kept.state, 'deleting')
    assert.equal(kept.reason, 'HOSTNAME_UNCONFIRMED')
    assert.ok(cf.hostnames.has(other.id), 'nothing of another name is deleted')
  }
)
