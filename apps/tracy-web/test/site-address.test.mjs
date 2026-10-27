import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { Hono } from 'hono'
import { mountSiteAddress as mountAddressDoors } from '../src/sites/address.js'
import { fakeCloudflare } from './_fake-cloudflare.mjs'
import { fileDb } from './_db.mjs'

// Every mount here runs with Cloudflare for SaaS, as a deployment that offers own domains does: a
// stand-in of its own per mount, whose hostnames are active as soon as they are made (#1037, slice 2;
// what happens before they are is `site-domain-provider.test.mjs`).
const mountSiteAddress = (app, deps) =>
  mountAddressDoors(app, { customHostnames: fakeCloudflare().client, ...deps })

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test(
  'owner changes a managed address without changing the site identity and old name stays reserved',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site(site_key,label,host,platform,address,attached) values('original.localhost','original','local','wordpress','http://original.localhost:8080/',true)"
    )
    const jobs = []
    const app = new Hono()
    mountSiteAddress(app, {
      pool,
      config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost', siteAddressPrefix: '' },
      requireGrant: async () => ({ grant: { role: 'owner' }, email: 'owner@test.example' }),
      run: async (site, input) => {
        jobs.push(input)
        return { ok: true }
      },
      probe: async () => true
    })
    const response = await app.request('/api/sites/original.localhost/address', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'renamed.localhost' })
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      state: 'active',
      siteKey: 'original.localhost',
      displayName: 'renamed.localhost',
      siteUrl: 'http://renamed.localhost:8080/',
      workspaceUrl: '/renamed.localhost/'
    })
    assert.equal(jobs[0].kind, 'site-address')
    assert.equal(jobs[0].operation, 'apply')
    const available = await app.request(
      '/api/sites/original.localhost/address/availability?name=original.localhost'
    )
    assert.equal((await available.json()).available, true)
  }
)

test('a failed public probe rolls the host back and leaves the old name active', opts, async () => {
  const { pool } = db
  await pool.query(
    "insert into site(site_key,label,host,platform,address,attached) values('stable.localhost','stable','local','joomla','http://stable.localhost:8080/',true)"
  )
  const app = new Hono(),
    calls = []
  const { siteByPublicName } = await import('../src/sites/address.js')
  mountSiteAddress(app, {
    pool,
    config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost' },
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    run: async (site, input) => {
      calls.push(input.operation)
      return { ok: true }
    },
    probe: async () => false
  })
  const res = await app.request('/api/sites/stable.localhost/address', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'failure.localhost' })
  })
  assert.equal(res.status, 502)
  assert.equal((await res.json()).code, 'ADDRESS_PROBE_FAILED')
  assert.deepEqual(calls, ['apply', 'rollback'])
  assert.equal(await siteByPublicName(pool, 'failure.localhost'), null)
  assert.equal((await siteByPublicName(pool, 'stable.localhost')).address, 'http://stable.localhost:8080/')
})

test(
  'pending custom domains stay unroutable after TXT verification and require no host writes',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site(site_key,label,host,platform,address,attached) values('stable.localhost','stable','local','emdash','http://stable.localhost:8080/',true)"
    )
    let txt = []
    const app = new Hono()
    mountSiteAddress(app, {
      pool,
      config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost' },
      requireGrant: async () => ({ grant: { role: 'owner' } }),
      run: async () => assert.fail('custom must not write host'),
      dnsTxt: async () => txt
    })
    const res = await app.request('/api/sites/stable.localhost/address', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'shop.example.org' })
    })
    assert.equal(res.status, 202)
    const pending = (await res.json()).pending
    txt = [[pending.verification.value]]
    const verified = await app.request('/api/sites/stable.localhost/address/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'shop.example.org' })
    })
    assert.equal(verified.status, 202)
    assert.deepEqual((await verified.json()).pending.readiness, {
      ownership: true,
      routing: false,
      tls: false
    })
    const { siteByPublicName } = await import('../src/sites/address.js')
    assert.equal(await siteByPublicName(pool, 'shop.example.org'), null)
  }
)

test('a crashed apply can be safely rolled back by retry before a new activation', opts, async () => {
  const { pool } = db
  await pool.query(
    "insert into site(site_key,label,host,platform,address,attached) values('stable.localhost','stable','local','wordpress','http://stable.localhost:8080/',true)"
  )
  await pool.query(
    "insert into site_name(name,site_key,kind,state,change_id,previous_url) values('crashed.localhost','stable.localhost','managed','applying','11111111-2222-4333-8444-555555555555','http://stable.localhost:8080/')"
  )
  const calls = [],
    app = new Hono()
  mountSiteAddress(app, {
    pool,
    config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost' },
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    run: async (site, input) => {
      calls.push(input.operation)
      return { ok: true }
    },
    probe: async () => true
  })
  const res = await app.request('/api/sites/stable.localhost/address', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'crashed.localhost' })
  })
  assert.equal(res.status, 200)
  assert.deepEqual(calls, ['rollback', 'apply'])
})

// ── A host that refuses the apply (bug 03/10/2026, scv2wp) ──────────────────────────────────────
// The host answers a failed job with its JSON line as the job output, which runSiteJob hands back
// as `reason`.
const refusal = (code) => ({ ok: false, reason: JSON.stringify({ ok: false, code }) })

async function renameWith(pool, answers) {
  await pool.query(
    "insert into site(site_key,label,host,platform,address,attached) values('wp.localhost','wp','local','wordpress','http://wp.localhost:8080/',true)"
  )
  const calls = []
  const app = new Hono()
  mountSiteAddress(app, {
    pool,
    config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost' },
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    run: async (site, input) => {
      calls.push(input.operation)
      return answers[input.operation]
    },
    probe: async () => true
  })
  const res = await app.request('/api/sites/wp.localhost/address', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'wp-new.localhost' })
  })
  const row = (await pool.query("select state from site_name where name='wp-new.localhost'")).rows[0]
  return { status: res.status, body: await res.json(), calls, state: row?.state }
}

test(
  'an apply the host refused, rolled back as "nothing to undo", says why and leaves no change in flight',
  opts,
  async () => {
    const out = await renameWith(db.pool, {
      apply: refusal('WP_ADDRESS_CONSTANT'),
      rollback: { ok: true, output: JSON.stringify({ ok: true, undone: false }) }
    })
    assert.equal(out.status, 502)
    assert.deepEqual(out.body, { code: 'ADDRESS_APPLY_FAILED', reason: 'WP_ADDRESS_CONSTANT' })
    assert.deepEqual(out.calls, ['apply', 'rollback'])
    assert.equal(out.state, 'failed')
  }
)

test(
  'an older host answering CHANGE_UNKNOWN to the rollback of an apply it REFUSED is not left applying',
  opts,
  async () => {
    const out = await renameWith(db.pool, {
      apply: refusal('WP_ADDRESS_CONSTANT'),
      rollback: refusal('CHANGE_UNKNOWN')
    })
    assert.equal(out.status, 502)
    assert.deepEqual(out.body, { code: 'ADDRESS_APPLY_FAILED', reason: 'WP_ADDRESS_CONSTANT' })
    assert.equal(out.state, 'failed')
  }
)

test(
  'CHANGE_UNKNOWN after an apply whose outcome is unknown proves nothing: the change stays in flight',
  opts,
  async () => {
    // A timed-out apply may still be queued on the host behind the rollback.
    const out = await renameWith(db.pool, {
      apply: { ok: false, reason: 'timeout' },
      rollback: refusal('CHANGE_UNKNOWN')
    })
    assert.equal(out.status, 502)
    assert.equal(out.body.code, 'ADDRESS_ROLLBACK_FAILED')
    assert.equal(out.state, 'applying')
  }
)

// ── A domain of the customer's own: what is asked, what DNS answered, and when ───────────────────
// The doors are the real ones (`mountSiteAddress`); DNS is answered by the test, record by record,
// so every case below is a lookup that really returned that — never a state set by hand.
// Read through a namespace so this file still loads on a tree without these exports.
import * as addressModule from '../src/sites/address.js'

const OWN = 'shop.localhost'
const DOMAIN = 'shop.example.com'
const TARGET = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90.cfargotunnel.com'
const dnsError = (code) => Object.assign(new Error(`query${code}`), { code })

/**
 * One site with the address doors mounted. `dns.txt` / `dns.cname` are `{ name: answer }`, an answer
 * being the value, an Error to throw, or a function. `role` is the seat every request is made on.
 */
async function ownDomainBed({ target = TARGET, role = 'owner', dropDomain, dnsResolver } = {}) {
  const { pool } = db
  await pool.query(
    "insert into site(site_key,label,host,platform,address,attached) values($1,'shop','local','wordpress','http://shop.localhost:8080/',true)",
    [OWN]
  )
  const bed = {
    pool,
    role,
    target,
    dns: { txt: {}, cname: {} },
    asked: [],
    dropped: [],
    targetCalls: 0,
    // What the site says when asked at its Tracy address before a removal (`addressStanding`), what
    // the HTTPS probe of the real domain finds, and the site-address jobs a removal ran (#1037).
    standing: 'ok',
    stood: [],
    probe: { status: 'failed', error: 'DNS_NXDOMAIN' },
    probed: [],
    jobs: [],
    job: null
  }
  const answer = async (kind, name) => {
    bed.asked.push(`${kind} ${name}`)
    const found = bed.dns[kind][name]
    if (found === undefined) throw dnsError(kind === 'txt' ? 'ENOTFOUND' : 'ENODATA')
    const value = typeof found === 'function' ? await found(name) : found
    if (value instanceof Error) throw value
    return value
  }
  const app = new Hono()
  mountSiteAddress(app, {
    pool,
    config: {
      origin: 'http://tracy.test:8080',
      siteDomain: 'localhost',
      siteAddressPrefix: '',
      ...(dnsResolver === undefined ? {} : { dnsResolver })
    },
    requireGrant: async () => ({ grant: { role: bed.role }, email: `${bed.role}@test.example` }),
    run: async (_site, input) => {
      if (bed.job === null) assert.fail('an own domain never runs a site-address job')
      bed.jobs.push(input)
      return typeof bed.job === 'function' ? bed.job(input) : bed.job
    },
    standing: async (site, name) => {
      bed.stood.push(name)
      const found = typeof bed.standing === 'function' ? await bed.standing(site, name) : bed.standing
      if (found instanceof Error) throw found
      return found
    },
    domainProbe: async (row) => {
      bed.probed.push(row)
      return typeof bed.probe === 'function' ? bed.probe(row) : bed.probe
    },
    // `dnsResolver` given: the doors read DNS with the resolver the configuration names, as deployed.
    ...(dnsResolver === undefined
      ? { dnsTxt: (name) => answer('txt', name), dnsCname: (name) => answer('cname', name) }
      : {}),
    dnsAskMs: 150,
    routingTarget: async () => {
      bed.targetCalls++
      if (bed.target instanceof Error) throw bed.target
      return bed.target
    },
    dropDomain:
      dropDomain ??
      (async (site, auth, choose) => {
        const chosen = await withNames(pool, site.site_key, choose)
        bed.dropped.push(chosen)
        return 'refusal' in chosen
          ? chosen.refusal
          : { status: 202, body: { op: 'drop-domain', state: 'running' } }
      })
  })
  bed.send = (method, path, body, raw) =>
    app.request(`/api/sites/${OWN}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {})
    })
  bed.save = async (name = DOMAIN) => {
    const res = await bed.send('PUT', '/address', { name, kind: 'custom' })
    return { status: res.status, body: await res.json() }
  }
  bed.check = async (name = DOMAIN) => {
    const res = await bed.send('POST', '/address/verify', { name })
    return { status: res.status, body: await res.json() }
  }
  bed.row = async (name = DOMAIN) =>
    (await pool.query('select * from site_name where name = $1', [name])).rows[0] ?? null
  bed.view = async (as = bed.role, at = bed.target) =>
    addressModule.addressChangeState(
      pool,
      await siteRow(pool),
      as,
      { siteDomain: 'localhost' },
      at instanceof Error ? null : at
    )
  return bed
}
const siteRow = async (pool) => (await pool.query('select * from site where site_key = $1', [OWN])).rows[0]
/** Run `choose` as `publish.js` does: inside a transaction (the names lock itself is tested there). */
async function withNames(pool, siteKey, choose) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const chosen = await choose(client)
    await client.query('commit')
    return chosen
  } finally {
    client.release()
  }
}
const check = (domain, record) => domain.checks.find((c) => c.record === record)

test(
  'a saved own domain says exactly which two records to create — and before any lookup nothing reads as checked, let alone verified',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const saved = await bed.save()
    assert.equal(saved.status, 202)
    const pending = saved.body.pending
    assert.equal(pending.name, DOMAIN)
    assert.equal(pending.state, 'pending')
    assert.match(pending.verification.value, /^[0-9a-f]{48}$/)
    assert.deepEqual(pending.verification, {
      type: 'TXT',
      name: `_tracy.${DOMAIN}`,
      value: pending.verification.value
    })
    assert.deepEqual(pending.routing, { type: 'CNAME', name: DOMAIN, value: TARGET })
    assert.deepEqual(pending.readiness, { ownership: false, routing: false, tls: false })
    assert.deepEqual(pending.checks, [
      {
        record: 'ownership',
        type: 'TXT',
        name: `_tracy.${DOMAIN}`,
        expected: pending.verification.value,
        status: 'unchecked',
        observed: []
      },
      { record: 'routing', type: 'CNAME', name: DOMAIN, expected: TARGET, status: 'unchecked', observed: [] }
    ])
    assert.equal('checkedAt' in pending, false, 'no lookup, no time of one')
    assert.deepEqual(bed.asked, [], 'saving a name asks DNS nothing')
    const row = await bed.row()
    assert.equal(row.checked_at, null)
    assert.equal(row.dns_reading, null)
    assert.equal(row.carried_at, null)
    // The same name again is the same reservation: the token does not change under the customer.
    const again = await bed.save()
    assert.equal(again.body.pending.verification.value, pending.verification.value)
  }
)

/**
 * What DNS may answer, and what the screen is then told. `[what, { txt, cname, target }, ownership,
 * routing]` — `txt(token)` answers `_tracy.<domain>`; `cname` is `{ name: answer }`; the two
 * expectations are `{ status, error?, observed? }` (`observed: 'token'` = the site's own token).
 */
const hang = () => new Promise(() => {})
const LOOKUPS = [
  [
    'both records right',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [TARGET] } },
    { status: 'ok', observed: 'token' },
    { status: 'ok', observed: [TARGET] }
  ],
  [
    'the TXT value split into chunks, among other TXT records',
    { txt: (t) => [['v=spf1 -all'], [t.slice(0, 20), t.slice(20)]], cname: { [DOMAIN]: [TARGET] } },
    { status: 'ok' },
    { status: 'ok' }
  ],
  [
    'the target with a trailing dot and in upper case',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [`${TARGET.toUpperCase()}.`] } },
    { status: 'ok' },
    { status: 'ok', observed: [TARGET] }
  ],
  [
    'a CNAME chain of two that ends at the target',
    { txt: (t) => [[t]], cname: { [DOMAIN]: ['edge.example.net'], 'edge.example.net': [TARGET] } },
    { status: 'ok' },
    { status: 'ok', observed: ['edge.example.net', TARGET] }
  ],
  [
    'no such name at all (NXDOMAIN)',
    { txt: () => dnsError('ENOTFOUND'), cname: { [DOMAIN]: dnsError('ENOTFOUND') } },
    { status: 'missing', error: 'NXDOMAIN', observed: [] },
    { status: 'missing', error: 'NXDOMAIN', observed: [] }
  ],
  [
    'the names exist with no such record (NODATA)',
    { txt: () => dnsError('ENODATA'), cname: { [DOMAIN]: dnsError('ENODATA') } },
    { status: 'missing', error: 'NODATA' },
    { status: 'missing', error: 'NODATA' }
  ],
  [
    'an empty TXT answer',
    { txt: () => [], cname: { [DOMAIN]: [TARGET] } },
    { status: 'missing', error: 'NODATA' },
    { status: 'ok' }
  ],
  [
    'a TXT record with another value',
    { txt: () => [['tracy-verify=somebody-else']], cname: { [DOMAIN]: [TARGET] } },
    { status: 'wrong', observed: ['tracy-verify=somebody-else'] },
    { status: 'ok' }
  ],
  [
    'the token with a space after it',
    { txt: (t) => [[`${t} `]], cname: { [DOMAIN]: [TARGET] } },
    { status: 'wrong' },
    { status: 'ok' }
  ],
  [
    'the token of an earlier reservation',
    { txt: () => [['0'.repeat(48)]], cname: { [DOMAIN]: [TARGET] } },
    { status: 'wrong', observed: ['0'.repeat(48)] },
    { status: 'ok' }
  ],
  [
    'a resolver that fails (SERVFAIL)',
    { txt: () => dnsError('ESERVFAIL'), cname: { [DOMAIN]: dnsError('ESERVFAIL') } },
    { status: 'unknown', error: 'ESERVFAIL' },
    { status: 'unknown', error: 'ESERVFAIL' }
  ],
  [
    'a resolver that refuses',
    { txt: () => dnsError('EREFUSED'), cname: { [DOMAIN]: dnsError('ECONNREFUSED') } },
    { status: 'unknown', error: 'EREFUSED' },
    { status: 'unknown', error: 'ECONNREFUSED' }
  ],
  [
    'the resolver saying it timed out',
    { txt: () => dnsError('ETIMEOUT'), cname: { [DOMAIN]: dnsError('ETIMEOUT') } },
    { status: 'unknown', error: 'TIMEOUT' },
    { status: 'unknown', error: 'TIMEOUT' }
  ],
  [
    'a resolver that never answers',
    { txt: hang, cname: { [DOMAIN]: hang } },
    { status: 'unknown', error: 'TIMEOUT' },
    { status: 'unknown', error: 'TIMEOUT' }
  ],
  [
    'an error with a code nobody knows',
    { txt: () => dnsError('EWHATEVER'), cname: { [DOMAIN]: new Error('no code') } },
    { status: 'unknown', error: 'LOOKUP_FAILED' },
    { status: 'unknown', error: 'LOOKUP_FAILED' }
  ],
  [
    'a resolver that throws before it returns a promise',
    {
      txt: () => {
        throw dnsError('ESERVFAIL')
      },
      cname: {
        [DOMAIN]: () => {
          throw new TypeError('boom')
        }
      }
    },
    { status: 'unknown', error: 'ESERVFAIL' },
    { status: 'unknown', error: 'LOOKUP_FAILED' }
  ],
  [
    'answers that are not DNS answers',
    { txt: () => 'v=token', cname: { [DOMAIN]: () => ({ target: TARGET }) } },
    { status: 'unknown', error: 'MALFORMED' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'a TXT answer of strings instead of chunks, a CNAME answer of a number',
    { txt: (t) => [t], cname: { [DOMAIN]: [7] } },
    { status: 'unknown', error: 'MALFORMED' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'null answers',
    { txt: () => null, cname: { [DOMAIN]: () => null } },
    { status: 'unknown', error: 'MALFORMED' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'an empty CNAME answer',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [] } },
    { status: 'ok' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'two CNAMEs in one answer, the first of them the target',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [TARGET, 'parked.registrar.example'] } },
    { status: 'ok' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'two CNAMEs in one answer, both the target',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [TARGET, TARGET] } },
    { status: 'ok' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'the target followed by something that is not a name',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [TARGET, null] } },
    { status: 'ok' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'two CNAMEs further down the chain',
    {
      txt: (t) => [[t]],
      cname: { [DOMAIN]: ['edge.example.net'], 'edge.example.net': [TARGET, 'other.example.net'] }
    },
    { status: 'ok' },
    { status: 'unknown', error: 'MALFORMED', observed: ['edge.example.net'] }
  ],
  [
    'a CNAME that is not a host name',
    { txt: (t) => [[t]], cname: { [DOMAIN]: ['not a name'] } },
    { status: 'ok' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'a CNAME that is an empty string',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [''] } },
    { status: 'ok' },
    { status: 'unknown', error: 'MALFORMED' }
  ],
  [
    'a CNAME to somewhere else',
    { txt: (t) => [[t]], cname: { [DOMAIN]: ['parked.registrar.example'] } },
    { status: 'ok' },
    { status: 'wrong', observed: ['parked.registrar.example'] }
  ],
  [
    'a CNAME to another tunnel of the same provider',
    { txt: (t) => [[t]], cname: { [DOMAIN]: ['ffffffff-0000-4000-8000-000000000000.cfargotunnel.com'] } },
    { status: 'ok' },
    { status: 'wrong', observed: ['ffffffff-0000-4000-8000-000000000000.cfargotunnel.com'] }
  ],
  [
    'a name that only ends with the target',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [`${TARGET}.evil.example`] } },
    { status: 'ok' },
    { status: 'wrong' }
  ],
  [
    'a CNAME loop',
    {
      txt: (t) => [[t]],
      cname: {
        [DOMAIN]: ['a.example.net'],
        'a.example.net': ['b.example.net'],
        'b.example.net': ['a.example.net']
      }
    },
    { status: 'ok' },
    { status: 'wrong', error: 'LOOP', observed: ['a.example.net', 'b.example.net', 'a.example.net'] }
  ],
  [
    'a CNAME that points at itself',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [DOMAIN] } },
    { status: 'ok' },
    { status: 'wrong', error: 'LOOP' }
  ],
  [
    'a chain longer than is followed',
    {
      txt: (t) => [[t]],
      cname: {
        [DOMAIN]: ['h1.example.net'],
        'h1.example.net': ['h2.example.net'],
        'h2.example.net': ['h3.example.net'],
        'h3.example.net': ['h4.example.net'],
        'h4.example.net': ['h5.example.net'],
        'h5.example.net': [TARGET]
      }
    },
    { status: 'ok' },
    { status: 'unknown', error: 'TOO_MANY_HOPS' }
  ],
  [
    'a chain that breaks half-way',
    {
      txt: (t) => [[t]],
      cname: { [DOMAIN]: ['edge.example.net'], 'edge.example.net': dnsError('ESERVFAIL') }
    },
    { status: 'ok' },
    { status: 'unknown', error: 'ESERVFAIL', observed: ['edge.example.net'] }
  ],
  // A provider that flattens the CNAME (an apex record, a proxy in front) answers addresses only:
  // there is no CNAME to read, and the same addresses as the target's would prove nothing.
  [
    'a flattened record: addresses, no CNAME',
    { txt: (t) => [[t]], cname: { [DOMAIN]: dnsError('ENODATA') } },
    { status: 'ok' },
    { status: 'missing', error: 'NODATA', observed: [] }
  ],
  [
    'a host that gives no routing target',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [TARGET] }, target: null },
    { status: 'ok' },
    { status: 'unknown', error: 'NO_TARGET' }
  ],
  [
    'a host that cannot be asked for its target',
    { txt: (t) => [[t]], cname: { [DOMAIN]: [TARGET] }, target: new Error('unreachable') },
    { status: 'ok' },
    { status: 'unknown', error: 'NO_TARGET' }
  ]
]

test(
  'a resolver setting that is not an address never stops the doors from mounting: each lookup reads unknown, and nothing is verified',
  opts,
  async () => {
    for (const dnsResolver of ['x', 'dns.example.com', '1.1.1.1,']) {
      await db.reset()
      // Mounting is the first thing the bed does with the setting: it must not throw.
      const bed = await ownDomainBed({ dnsResolver })
      assert.equal((await bed.save()).status, 202, dnsResolver)
      const res = await bed.check()
      assert.equal(res.status, 202, dnsResolver)
      for (const record of ['ownership', 'routing']) {
        const got = check(res.body.pending, record)
        assert.equal(got.status, 'unknown', `${dnsResolver}: ${record}`)
        assert.equal(got.error, 'LOOKUP_FAILED', `${dnsResolver}: ${record}`)
        assert.equal(res.body.pending.readiness[record], false, `${dnsResolver}: ${record}`)
      }
      const row = await bed.row()
      assert.equal(row.ownership_verified_at, null, dnsResolver)
      assert.equal(row.routing_verified_at, null, dnsResolver)
      // The other doors of the same mount still answer.
      assert.equal((await bed.send('DELETE', '/address/domain', { name: DOMAIN })).status, 200, dnsResolver)
    }
  }
)

test(
  'Check DNS: each record reads what the lookup returned — what was asked, what was expected, what was found or why nothing was, and when; only a record that was found right reads ready',
  opts,
  async () => {
    for (const [what, dns, ownership, routing] of LOOKUPS) {
      await db.reset()
      const bed = await ownDomainBed({ target: 'target' in dns ? dns.target : TARGET })
      const token = (await bed.save()).body.pending.verification.value
      bed.dns.txt[`_tracy.${DOMAIN}`] = () => dns.txt(token)
      Object.assign(bed.dns.cname, dns.cname)
      const before = (await bed.pool.query('select now() as now')).rows[0].now
      const res = await bed.check()
      assert.equal(res.status, 202, what)
      const domain = res.body.pending
      assert.equal(domain.state, 'pending', `${what}: a check connects nothing`)
      for (const [record, want] of [
        ['ownership', ownership],
        ['routing', routing]
      ]) {
        const got = check(domain, record)
        const how = `${what}: ${record}`
        assert.equal(got.status, want.status, `${how} — ${JSON.stringify(got)}`)
        assert.equal(got.error, want.error, how)
        if (want.observed === 'token') assert.deepEqual(got.observed, [token], how)
        else if (want.observed) assert.deepEqual(got.observed, want.observed, how)
        assert.equal(got.type, record === 'ownership' ? 'TXT' : 'CNAME', how)
        assert.equal(got.name, record === 'ownership' ? `_tracy.${DOMAIN}` : DOMAIN, how)
        // The time of the lookup, on the database's clock, and the same one on both records.
        assert.equal(got.checkedAt, domain.checkedAt, how)
        assert.equal(domain.readiness[record], want.status === 'ok', `${how}: ready only when found right`)
      }
      assert.equal(check(domain, 'ownership').expected, token, what)
      assert.equal(check(domain, 'routing').expected, bed.target instanceof Error ? null : bed.target, what)
      assert.equal(
        domain.readiness.tls,
        false,
        `${what}: nothing measures HTTPS, so nothing says it is ready`
      )
      const row = await bed.row()
      assert.ok(row.checked_at >= before, `${what}: stamped by this lookup`)
      assert.equal(new Date(domain.checkedAt).getTime(), row.checked_at.getTime(), what)
      assert.equal(row.ownership_verified_at !== null, ownership.status === 'ok', what)
      assert.equal(row.routing_verified_at !== null, routing.status === 'ok', what)
      assert.equal(row.routing_target, routing.status === 'ok' ? TARGET : null, what)
      assert.equal(row.state, 'pending', what)
      assert.equal(row.carried_at, null, `${what}: a check hands nothing to the host`)
      // Only TXT at `_tracy.<name>` and CNAMEs were asked for: never an address record to compare.
      for (const asked of bed.asked) assert.match(asked, /^(txt _tracy\.shop\.example\.com|cname \S+)$/, what)
      // What the Settings read says afterwards is this reading, not a newer guess.
      const view = await bed.view()
      assert.deepEqual(view.pending.checks, domain.checks, what)
      assert.equal(view.status, 'pending', what)
      assert.deepEqual(view.connected, [], what)
    }
  }
)

test(
  'a record taken away again reads missing again: a reading is what DNS said at that check, not the best it ever said',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    bed.dns.cname[DOMAIN] = [TARGET]
    assert.deepEqual((await bed.check()).body.pending.readiness, {
      ownership: true,
      routing: true,
      tls: false
    })
    delete bed.dns.txt[`_tracy.${DOMAIN}`]
    delete bed.dns.cname[DOMAIN]
    const gone = (await bed.check()).body.pending
    assert.deepEqual(gone.readiness, { ownership: false, routing: false, tls: false })
    assert.equal(check(gone, 'ownership').status, 'missing')
    assert.equal(check(gone, 'routing').status, 'missing')
    const row = await bed.row()
    assert.equal(row.ownership_verified_at, null)
    assert.equal(row.routing_verified_at, null)
    assert.equal(row.routing_target, null)
  }
)

test(
  'a routing reading counts only for the target it was measured against: after the host moves to another tunnel it reads unknown beside the new record, never ready',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    bed.dns.cname[DOMAIN] = [TARGET]
    await bed.check()
    assert.equal((await bed.view()).pending.readiness.routing, true)

    const moved = 'aaaaaaaa-0000-4000-8000-000000000000.cfargotunnel.com'
    const view = await bed.view('owner', moved)
    assert.deepEqual(view.pending.routing, { type: 'CNAME', name: DOMAIN, value: moved })
    assert.equal(view.pending.readiness.routing, false)
    const routing = check(view.pending, 'routing')
    assert.equal(routing.status, 'unknown')
    assert.equal(routing.error, 'TARGET_CHANGED')
    assert.equal(routing.expected, moved)
    assert.equal(view.pending.readiness.ownership, true, 'the TXT record does not depend on the tunnel')

    // A host that gives no target at all: no routing record to show, nothing called ready.
    const none = await bed.view('owner', null)
    assert.equal('routing' in none.pending, false)
    assert.equal(none.pending.readiness.routing, false)
    assert.equal(check(none.pending, 'routing').status, 'unknown')
    assert.equal(check(none.pending, 'routing').error, 'NO_TARGET')
  }
)

test(
  'a lookup that comes back after the name was removed, or removed and saved again, writes nothing: the new reservation starts unchecked',
  opts,
  async () => {
    for (const again of [false, true]) {
      await db.reset()
      const bed = await ownDomainBed()
      const first = (await bed.save()).body.pending.verification.value
      let release
      const held = new Promise((resolve) => {
        release = resolve
      })
      let asking
      const asked = new Promise((resolve) => {
        asking = resolve
      })
      // The lookup is in flight: it will answer the FIRST reservation's token.
      bed.dns.txt[`_tracy.${DOMAIN}`] = async () => {
        asking()
        await held
        return [[first]]
      }
      bed.dns.cname[DOMAIN] = [TARGET]
      const late = bed.send('POST', '/address/verify', { name: DOMAIN })
      // Wait until the lookup has read the row and is asking — not a fixed time, which a loaded machine outruns.
      await asked
      const removed = await bed.send('DELETE', '/address/domain', { name: DOMAIN })
      assert.equal(removed.status, 200)
      let second = null
      if (again) {
        second = (await bed.save()).body.pending.verification.value
        assert.notEqual(second, first, 'a new reservation has a token of its own')
      }
      release()
      const res = await late
      assert.equal(res.status, 404, 'the reading matched no row')
      assert.deepEqual(await res.json(), { code: 'NAME_NOT_RESERVED' })
      const row = await bed.row()
      if (!again) {
        assert.equal(row, null)
        continue
      }
      assert.equal(row.token, second)
      assert.equal(row.checked_at, null, 'nothing of the late answer is on the new reservation')
      assert.equal(row.ownership_verified_at, null)
      assert.equal(row.routing_verified_at, null)
      assert.equal(row.dns_reading, null)
      const view = await bed.view()
      assert.equal(check(view.pending, 'ownership').status, 'unchecked')
      assert.equal(check(view.pending, 'routing').status, 'unchecked')
    }
  }
)

test(
  'two Check DNS of one reservation that end in the other order than they began: the later LOOK stays on record with the time it was asked — the earlier one never paints over it, and is answered what is on record',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    let release
    const held = new Promise((resolve) => {
      release = resolve
    })
    let asking
    const asked = new Promise((resolve) => {
      asking = resolve
    })
    // The first lookup is slow and will say both records are RIGHT (as they were when it asked).
    bed.dns.txt[`_tracy.${DOMAIN}`] = async () => {
      asking()
      await held
      return [[token]]
    }
    bed.dns.cname[DOMAIN] = [TARGET]
    const early = bed.send('POST', '/address/verify', { name: DOMAIN })
    // Wait until the first lookup is asking, not a fixed time.
    await asked
    // The records are taken away, and a second lookup — begun later — says so and ends first.
    delete bed.dns.txt[`_tracy.${DOMAIN}`]
    delete bed.dns.cname[DOMAIN]
    const later = await bed.check()
    assert.equal(later.status, 202)
    assert.equal(check(later.body.pending, 'ownership').status, 'missing')
    const onRecord = await bed.row()
    release()
    const res = await early
    assert.equal(res.status, 202)
    const answered = (await res.json()).pending
    // Answered with the later reading, dated as that one — not its own, and not "just now".
    assert.equal(check(answered, 'ownership').status, 'missing')
    assert.equal(check(answered, 'routing').status, 'missing')
    assert.equal(answered.checkedAt, later.body.pending.checkedAt)
    assert.deepEqual(answered.readiness, { ownership: false, routing: false, tls: false })
    const row = await bed.row()
    assert.equal(row.checked_at.getTime(), onRecord.checked_at.getTime(), 'the time was not moved')
    assert.equal(row.dns_turn, onRecord.dns_turn)
    assert.deepEqual(row.dns_reading, onRecord.dns_reading)
    assert.equal(row.ownership_verified_at, null)
    assert.equal(row.routing_verified_at, null)
    const view = await bed.view()
    assert.equal(check(view.pending, 'ownership').status, 'missing')

    // In order, each lookup is written: the next one is later than both.
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    bed.dns.cname[DOMAIN] = [TARGET]
    const next = await bed.check()
    assert.equal(check(next.body.pending, 'ownership').status, 'ok')
    assert.ok(BigInt((await bed.row()).dns_turn) > BigInt(onRecord.dns_turn))
    assert.ok(new Date(next.body.pending.checkedAt) >= new Date(later.body.pending.checkedAt))
  }
)

test(
  'a body that carries a field its door does not take, or a `kind` that is not one of the two words, is refused before anything is reserved, looked up, removed or sent to the host',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    const before = await bed.row()
    bed.asked.length = 0
    bed.targetCalls = 0
    const OTHER = 'other.example.com'
    /** `[what, method, path, body, the field or reason the refusal names]` */
    const BODIES = [
      [
        'PUT with a field it does not take',
        'PUT',
        '/address',
        { name: OTHER, kind: 'custom', force: true },
        'force'
      ],
      ['PUT with domains', 'PUT', '/address', { name: OTHER, kind: 'custom', domains: [OTHER] }, 'domains'],
      ['PUT with a token', 'PUT', '/address', { name: DOMAIN, kind: 'custom', token: 'x' }, 'token'],
      ['PUT with kind null', 'PUT', '/address', { name: OTHER, kind: null }, 'kind'],
      ['PUT with kind a list', 'PUT', '/address', { name: OTHER, kind: ['custom'] }, 'kind'],
      ['PUT with kind a number', 'PUT', '/address', { name: OTHER, kind: 1 }, 'kind'],
      ['PUT with kind an empty string', 'PUT', '/address', { name: OTHER, kind: '' }, 'kind'],
      ['verify with a kind', 'POST', '/address/verify', { name: DOMAIN, kind: 'custom' }, 'kind'],
      ['verify with a target', 'POST', '/address/verify', { name: DOMAIN, target: TARGET }, 'target'],
      ['verify with a null field', 'POST', '/address/verify', { name: DOMAIN, token: null }, 'token'],
      ['DELETE with a kind', 'DELETE', '/address/domain', { name: DOMAIN, kind: 'custom' }, 'kind'],
      ['DELETE with force', 'DELETE', '/address/domain', { name: DOMAIN, force: true }, 'force'],
      ['DELETE with names', 'DELETE', '/address/domain', { name: DOMAIN, names: [DOMAIN] }, 'names']
    ]
    for (const [what, method, path, body, named] of BODIES) {
      const res = await bed.send(method, path, body)
      assert.equal(res.status, 400, what)
      const answer = await res.json()
      assert.equal(answer.code, 'INVALID_REQUEST', what)
      assert.ok(answer.field === named || answer.reason === `unknown field: ${named}`, `${what}: says which`)
    }
    assert.deepEqual(await bed.row(), before, 'the reservation is as it was')
    assert.equal(before.token, token)
    assert.equal(await bed.row(OTHER), null, 'nothing was reserved')
    assert.deepEqual(bed.asked, [], 'DNS was never asked')
    assert.equal(bed.targetCalls, 0, 'the host was never asked')
    assert.deepEqual(bed.dropped, [])
  }
)

test(
  "a reading written for one site is never read as another site's: the name moved to a second site reads unchecked there",
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    bed.dns.cname[DOMAIN] = [TARGET]
    await bed.check()
    // The name leaves this site and is saved on another (by hand: the second site has no doors here).
    await bed.send('DELETE', '/address/domain', { name: DOMAIN })
    await bed.pool.query(
      "insert into site(site_key,label,host,platform,address,attached) values('other.localhost','other','local','wordpress','http://other.localhost:8080/',true)"
    )
    await bed.pool.query(
      "insert into site_name(name,site_key,kind,state,token) values($1,'other.localhost','custom','pending','b'||repeat('0',47))",
      [DOMAIN]
    )
    const other = (await bed.pool.query("select * from site where site_key = 'other.localhost'")).rows[0]
    const view = await addressModule.addressChangeState(
      bed.pool,
      other,
      'owner',
      { siteDomain: 'localhost' },
      TARGET
    )
    assert.deepEqual(view.pending.readiness, { ownership: false, routing: false, tls: false })
    assert.equal(check(view.pending, 'ownership').status, 'unchecked')
    // And this site can no longer check, save or remove it.
    assert.equal((await bed.check()).status, 404)
    const taken = await bed.save()
    assert.equal(taken.status, 409)
    assert.equal(taken.body.code, 'NAME_TAKEN')
    assert.equal((await bed.send('DELETE', '/address/domain', { name: DOMAIN })).status, 404)
    const availability = await bed.send('GET', `/address/availability?name=${DOMAIN}&kind=custom`)
    assert.deepEqual(await availability.json(), {
      name: DOMAIN,
      kind: 'custom',
      available: false,
      code: 'NAME_TAKEN'
    })
  }
)

/** Names that are not a domain a customer can connect: `[what, name, code]`. */
const BAD_NAMES = [
  ['a scheme', 'https://shop.example.com', 'DOMAIN_NOT_BARE'],
  ['a path', 'shop.example.com/pricing', 'DOMAIN_NOT_BARE'],
  ['a query', 'shop.example.com?x=1', 'DOMAIN_NOT_BARE'],
  ['a fragment', 'shop.example.com#top', 'DOMAIN_NOT_BARE'],
  ['a port', 'shop.example.com:8443', 'DOMAIN_NOT_BARE'],
  ['userinfo', 'user@shop.example.com', 'DOMAIN_NOT_BARE'],
  ['a space inside', 'shop example.com', 'DOMAIN_NOT_BARE'],
  ['a backslash', 'shop\\example.com', 'DOMAIN_NOT_BARE'],
  ['an IPv6 address', '[2001:db8::1]', 'DOMAIN_NOT_BARE'],
  ['an IPv4 address', '192.0.2.7', 'INVALID_SITE_KEY'],
  ['a wildcard', '*.example.com', 'INVALID_SITE_KEY'],
  ['an underscore label', '_dmarc.example.com', 'INVALID_SITE_KEY'],
  ['one label', 'localhost', 'INVALID_SITE_KEY'],
  ['a label that starts with a hyphen', '-shop.example.com', 'INVALID_SITE_KEY'],
  ['a label that ends with a hyphen', 'shop-.example.com', 'INVALID_SITE_KEY'],
  ['an empty label', 'shop..example.com', 'INVALID_SITE_KEY'],
  ['a name nobody can own', 'printer.local', 'INVALID_SITE_KEY'],
  ['an internal name', 'db.internal', 'INVALID_SITE_KEY'],
  ['a numeric top-level label', 'shop.example.123', 'INVALID_SITE_KEY'],
  ['an option', '--remove', 'INVALID_SITE_KEY'],
  ['an empty string', '', 'INVALID_SITE_KEY'],
  ['only spaces', '   ', 'INVALID_SITE_KEY'],
  ['a label over 63 characters', `${'a'.repeat(64)}.example.com`, 'DOMAIN_TOO_LONG'],
  [
    'a name over 253 characters',
    `${Array.from({ length: 5 }, () => 'a'.repeat(60)).join('.')}.com`,
    'DOMAIN_TOO_LONG'
  ],
  ['a megabyte of text', 'a'.repeat(1_000_000), 'DOMAIN_TOO_LONG'],
  ["Tracy's own host", 'tracy.test', 'INVALID_SITE_KEY'],
  ['a Tracy address', 'other.localhost', 'DOMAIN_IS_TRACY'],
  ["the Tracy sites' own domain", 'localhost', 'INVALID_SITE_KEY'],
  ['a number', 7, 'INVALID_SITE_KEY'],
  ['null', null, 'INVALID_SITE_KEY'],
  ['a list', ['shop.example.com'], 'INVALID_SITE_KEY'],
  ['an object', { name: 'shop.example.com' }, 'INVALID_SITE_KEY'],
  ['true', true, 'INVALID_SITE_KEY']
]

test(
  'a name that is not a bare domain is refused by every door before anything is reserved, looked up or sent to the host — and so is a body that is not an object',
  opts,
  async () => {
    const bed = await ownDomainBed()
    for (const [what, name, code] of BAD_NAMES) {
      for (const [door, send] of [
        ['PUT', () => bed.send('PUT', '/address', { name, kind: 'custom' })],
        ['verify', () => bed.send('POST', '/address/verify', { name })],
        ['DELETE', () => bed.send('DELETE', '/address/domain', { name })]
      ]) {
        const res = await send()
        assert.equal(res.status, 400, `${what} at ${door}`)
        assert.deepEqual(await res.json(), { code }, `${what} at ${door}`)
      }
      if (typeof name === 'string') {
        const res = await bed.send(
          'GET',
          `/address/availability?kind=custom&name=${encodeURIComponent(name)}`
        )
        assert.equal(res.status, 400, `${what} at availability`)
      }
    }
    for (const raw of ['', '{', 'null', '[]', '["shop.example.com"]', '"shop.example.com"', '7', 'true']) {
      for (const [method, path] of [
        ['PUT', '/address'],
        ['POST', '/address/verify'],
        ['DELETE', '/address/domain']
      ]) {
        const res = await bed.send(method, path, undefined, raw)
        assert.equal(res.status, 400, `${JSON.stringify(raw)} at ${method} ${path}`)
        assert.equal((await res.json()).code, 'INVALID_SITE_KEY')
      }
    }
    // A kind that is neither of the two is refused; a domain sent as a Tracy address is told so.
    const kind = await bed.send('PUT', '/address', { name: DOMAIN, kind: 'wildcard' })
    assert.equal(kind.status, 400)
    const managed = await bed.send('PUT', '/address', { name: DOMAIN, kind: 'managed' })
    assert.deepEqual(await managed.json(), { code: 'ADDRESS_NOT_TRACY' })
    assert.equal(
      (await bed.pool.query("select count(*)::int as n from site_name where kind = 'custom'")).rows[0].n,
      0
    )
    assert.deepEqual(bed.asked, [], 'DNS was never asked')
    assert.equal(bed.targetCalls, 0, 'the host was never asked')
    assert.deepEqual(bed.dropped, [])
  }
)

test(
  'what is typed is made into the one name it means: case, a trailing dot and a Unicode name — and `www.` is a name of its own',
  opts,
  async () => {
    for (const [typed, name] of [
      ['Shop.Example.COM', 'shop.example.com'],
      ['shop.example.com.', 'shop.example.com'],
      ['  shop.example.com  ', 'shop.example.com'],
      ['shop.bücher.de', 'shop.xn--bcher-kva.de'],
      ['www.shop.example.com', 'www.shop.example.com']
    ]) {
      await db.reset()
      const bed = await ownDomainBed()
      const saved = await bed.save(typed)
      assert.equal(saved.status, 202, typed)
      assert.equal(saved.body.pending.name, name, typed)
      assert.equal(saved.body.pending.verification.name, `_tracy.${name}`, typed)
      assert.notEqual(await bed.row(name), null, typed)
    }
  }
)

test(
  'only the Owner connects, checks or removes a domain — and only the Owner is ever shown the proof: another role sees the name, the state and what was found for routing, never the token',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    bed.dns.cname[DOMAIN] = [TARGET]
    await bed.check()
    for (const role of ['admin', 'developer', 'editor', 'viewer']) {
      bed.role = role
      for (const [method, path, body] of [
        ['PUT', '/address', { name: 'second.example.com', kind: 'custom' }],
        ['POST', '/address/verify', { name: DOMAIN }],
        ['DELETE', '/address/domain', { name: DOMAIN }],
        ['GET', `/address/availability?name=${DOMAIN}`, undefined]
      ]) {
        const res = await bed.send(method, path, body)
        assert.equal(res.status, 403, `${role} ${method} ${path}`)
        assert.deepEqual(await res.json(), { code: 'NOT_SITE_OWNER' })
      }
      const view = await bed.view(role)
      assert.equal(view.allowed, false, role)
      assert.equal(view.pending.name, DOMAIN, role)
      assert.equal(view.pending.readiness.ownership, true, role)
      assert.equal(check(view.pending, 'ownership').status, 'ok', role)
      assert.equal(check(view.pending, 'routing').expected, TARGET, role)
      assert.equal(
        JSON.stringify(view).includes(token),
        false,
        `${role}: the token is nowhere in what this seat is told`
      )
      assert.equal('verification' in view.pending, false, role)
    }
    assert.notEqual(await bed.row(), null, 'nothing was removed')
    assert.equal(await bed.row('second.example.com'), null)
    const owner = await bed.view('owner')
    assert.equal(owner.allowed, true)
    assert.equal(owner.pending.verification.value, token)
  }
)

test(
  'one own domain at a time: a second name is refused while one is being connected or is connected, and the same name again is not a second one',
  opts,
  async () => {
    const bed = await ownDomainBed()
    await bed.save()
    const second = await bed.save('second.example.com')
    assert.equal(second.status, 409)
    assert.deepEqual(second.body, { code: 'DOMAIN_LIMIT', max: 1 })
    const asked = await bed.send('GET', '/address/availability?kind=custom&name=second.example.com')
    assert.equal(asked.status, 409)
    assert.equal((await bed.save()).status, 202)
    assert.equal(await bed.row('second.example.com'), null)
    // Removed (it was only a reservation), the place is free again.
    assert.equal((await bed.send('DELETE', '/address/domain', { name: DOMAIN })).status, 200)
    assert.equal((await bed.save('second.example.com')).status, 202)
  }
)

test(
  'removing a domain that was only reserved takes its row away at once and asks the host nothing; one the host may have a rule for goes out as an operation and keeps its row until the host says so',
  opts,
  async () => {
    const bed = await ownDomainBed()
    await bed.save()
    const plain = await bed.send('DELETE', '/address/domain', { name: DOMAIN })
    assert.equal(plain.status, 200)
    assert.equal((await plain.json()).removed, DOMAIN)
    assert.equal(await bed.row(), null)
    assert.deepEqual(bed.dropped, [], 'no host operation for a name that never left this book')
    const audited = (await bed.pool.query("select detail from audit where action = 'site.domain.remove'"))
      .rows
    assert.deepEqual(
      audited.map((r) => r.detail),
      [{ name: DOMAIN, was: 'pending' }]
    )

    for (const [what, mark] of [
      ['connected', "update site_name set state = 'active' where name = $1"],
      [
        'handed to a host job whose answer was never heard',
        'update site_name set carried_at = now() where name = $1'
      ]
    ]) {
      await bed.save()
      await bed.pool.query(mark, [DOMAIN])
      bed.dropped.length = 0
      const res = await bed.send('DELETE', '/address/domain', { name: DOMAIN })
      assert.equal(res.status, 202, what)
      assert.deepEqual(await res.json(), { op: 'drop-domain', state: 'running' }, what)
      assert.deepEqual(bed.dropped, [{ domains: [DOMAIN] }], what)
      assert.notEqual(await bed.row(), null, `${what}: the row stays until the host said the rule is out`)
      await bed.pool.query('delete from site_name where name = $1', [DOMAIN])
    }
    // A name the site does not have.
    const unknown = await bed.send('DELETE', '/address/domain', { name: 'never.example.com' })
    assert.equal(unknown.status, 404)
    assert.deepEqual(await unknown.json(), { code: 'NAME_NOT_RESERVED' })
  }
)

test(
  'while a publish, a draft or a domain removal holds the site, its names stay as they are: saving, checking and removing are refused, and nothing is written',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    bed.dns.cname[DOMAIN] = [TARGET]
    for (const state of ['starting', 'running']) {
      await bed.pool.query('delete from site_publish_op')
      await bed.pool.query(
        "insert into site_publish_op (site_key, op, state, ref) values ($1, 'live', $2, 'r1')",
        [OWN, state]
      )
      for (const [what, send] of [
        ['check', () => bed.send('POST', '/address/verify', { name: DOMAIN })],
        ['remove', () => bed.send('DELETE', '/address/domain', { name: DOMAIN })],
        ['save the same name', () => bed.send('PUT', '/address', { name: DOMAIN, kind: 'custom' })],
        ['rename the Tracy address', () => bed.send('PUT', '/address', { name: 'renamed.localhost' })]
      ]) {
        const res = await send()
        assert.equal(res.status, 409, `${state}: ${what}`)
        assert.deepEqual(await res.json(), { code: 'ADDRESS_CHANGE_BUSY' }, `${state}: ${what}`)
      }
      const row = await bed.row()
      assert.equal(row.checked_at, null, `${state}: the reading was not written over the operation's proof`)
      assert.equal(row.token, token)
    }
    // Ended: the doors answer again.
    await bed.pool.query("update site_publish_op set state = 'done'")
    assert.equal((await bed.check()).status, 202)
  }
)

// ── Review findings after #988: a bare domain, a reservation held with no proof, and the switch ──
// Each test below was red on the tree before the fix (`origin/develop` c999b8370), by its own
// assertions: the door took `example.com`, a name nobody proved stayed held for ever, and the
// `site-connect-domain` switch closed no door.
import { saveUiSwitches } from '../src/lib/ui-setting.js'
import { sweepExpired } from '../src/cron.js'

/** Another site of its own, with the address doors mounted for it, sharing `bed`'s DNS. */
async function otherSite(bed, key, label) {
  await bed.pool.query(
    "insert into site(site_key,label,host,platform,address,attached) values($1,$2,'local','wordpress',$3,true)",
    [key, label, `http://${key}:8080/`]
  )
  const app = new Hono()
  mountSiteAddress(app, {
    pool: bed.pool,
    config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost', siteAddressPrefix: '' },
    requireGrant: async () => ({ grant: { role: 'owner' }, email: `owner@${label}.test.example` }),
    run: async () => assert.fail('an own domain never runs a site-address job'),
    dnsTxt: async (name) => {
      const found = bed.dns.txt[name]
      if (found === undefined) throw dnsError('ENOTFOUND')
      return typeof found === 'function' ? found(name) : found
    },
    dnsCname: async () => {
      throw dnsError('ENODATA')
    },
    dnsAskMs: 150,
    routingTarget: async () => TARGET
  })
  const send = (method, path, body) =>
    app.request(`/api/sites/${key}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  return {
    send,
    save: async (name = DOMAIN) => {
      const res = await send('PUT', '/address', { name, kind: 'custom' })
      return { status: res.status, body: await res.json() }
    },
    view: async () =>
      addressModule.addressChangeState(
        bed.pool,
        (await bed.pool.query('select * from site where site_key = $1', [key])).rows[0],
        'owner',
        { siteDomain: 'localhost' },
        TARGET
      )
  }
}

/**
 * Move a reservation `hours` into the past, on the database's own clock. On a tree that has no
 * deadline for a reservation there is no such column: nothing moves, and the assertions after it
 * say what that tree does with an old reservation (it keeps holding the name).
 */
async function age(pool, name, hours) {
  await pool
    .query(
      'update site_name set hold_until = hold_until - make_interval(hours => $2), created_at = created_at - make_interval(hours => $2) where name = $1',
      [name, hours]
    )
    .catch(() =>
      pool.query(
        'update site_name set created_at = created_at - make_interval(hours => $2) where name = $1',
        [name, hours]
      )
    )
}

test(
  'a bare (registrable) domain is refused by its own code with the subdomain to enter instead — before anything is written or asked',
  opts,
  async () => {
    const bed = await ownDomainBed()
    for (const [typed, name] of [
      ['example.com', 'example.com'],
      ['Example.COM.', 'example.com'],
      ['example.co.uk', 'example.co.uk'],
      ['bücher.de', 'xn--bcher-kva.de'],
      // A wildcard rule (`*.ck`): `foo.ck` is a suffix, so `bar.foo.ck` is the registrable name —
      // and an exception to it (`!www.ck`) is registrable at two labels.
      ['bar.foo.ck', 'bar.foo.ck'],
      ['www.ck', 'www.ck']
    ]) {
      for (const [method, path, body] of [
        ['PUT', '/address', { name: typed, kind: 'custom' }],
        // An older caller that names no kind: a name outside Tracy's domain is a reservation too.
        ['PUT', '/address', { name: typed }],
        ['GET', `/address/availability?kind=custom&name=${encodeURIComponent(typed)}`, undefined]
      ]) {
        const res = await bed.send(method, path, body)
        assert.equal(res.status, 400, `${typed} at ${method} ${path}`)
        assert.deepEqual(
          await res.json(),
          { code: 'DOMAIN_APEX_UNSUPPORTED', name, suggestion: `www.${name}` },
          `${typed} at ${method} ${path}`
        )
      }
    }
    // A public suffix itself, and a name under a suffix the list does not know, belong to nobody.
    for (const typed of ['co.uk', 'foo.ck', 'shop.example', 'shop.notatld']) {
      const res = await bed.send('PUT', '/address', { name: typed, kind: 'custom' })
      assert.equal(res.status, 400, typed)
      assert.deepEqual(await res.json(), { code: 'INVALID_SITE_KEY' }, typed)
    }
    assert.equal(
      (await bed.pool.query("select count(*)::int as n from site_name where kind = 'custom'")).rows[0].n,
      0
    )
    assert.deepEqual(bed.asked, [], 'DNS was never asked')
    assert.equal(bed.targetCalls, 0, 'the host was never asked')
    // A name UNDER a registrable domain is taken, as before.
    for (const typed of ['www.example.co.uk', 'shop.bücher.de', 'blog.foo.github.io', 'www.bar.foo.ck']) {
      await db.reset()
      const fresh = await ownDomainBed()
      assert.equal((await fresh.save(typed)).status, 202, typed)
    }
  }
)

test(
  'every name reserved before the server stopped taking it is not stuck, carried to the host or not: a bare domain and a name under a suffix the list does not know each say why, Check DNS refuses them by name, and Remove takes them away the right way',
  opts,
  async () => {
    for (const [name, problem, suggestion] of [
      ['example.com', 'DOMAIN_APEX_UNSUPPORTED', 'www.example.com'],
      ['shop.example', 'INVALID_SITE_KEY', undefined]
    ]) {
      for (const carried of [false, true]) {
        const what = `${name}${carried ? ', carried' : ''}`
        await db.reset()
        const bed = await ownDomainBed()
        await bed.pool.query(
          `insert into site_name(name,site_key,kind,state,token,carried_at)
           values($1,$2,'custom','pending',repeat('a',48),case when $3 then now() end)`,
          [name, OWN, carried]
        )
        const pending = (await bed.view()).pending
        assert.equal(pending.name, name, what)
        assert.equal(pending.problem, problem, what)
        assert.equal(pending.suggestion, suggestion, what)
        assert.equal('routing' in pending, false, `${what}: no CNAME is asked for`)
        const checked = await bed.send('POST', '/address/verify', { name })
        assert.equal(checked.status, 400, what)
        assert.equal((await checked.json()).code, problem, what)
        assert.deepEqual(bed.asked, [], `${what}: DNS was never asked`)
        const removed = await bed.send('DELETE', '/address/domain', { name })
        if (carried) {
          // The host may have a rule for it: out through the host, and the row stays until it says so.
          assert.equal(removed.status, 202, what)
          assert.deepEqual(bed.dropped, [{ domains: [name] }], what)
          assert.notEqual(await bed.row(name), null, what)
        } else {
          assert.equal(removed.status, 200, what)
          assert.deepEqual(bed.dropped, [], what)
          assert.equal(await bed.row(name), null, what)
          // The slot is free: a name the server takes under it can be connected now.
          if (suggestion)
            assert.equal((await bed.save(suggestion)).status, 202, `${what}: ${suggestion} after Remove`)
        }
      }
    }
  }
)

test(
  'a reservation whose ownership was never proven stops holding the name after 72 hours: another site may take it (a new token), and the first sees it lapsed',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const first = (await bed.save()).body.pending.verification.value
    const thief = await otherSite(bed, 'other.localhost', 'other')
    // Inside the 72 hours the name is held.
    await age(bed.pool, DOMAIN, 71)
    assert.equal((await thief.save()).status, 409)
    await age(bed.pool, DOMAIN, 2)
    const available = await thief.send('GET', `/address/availability?kind=custom&name=${DOMAIN}`)
    assert.equal((await available.json()).available, true)
    const taken = await thief.save()
    assert.equal(taken.status, 202)
    assert.notEqual(taken.body.pending.verification.value, first)
    const row = await bed.row()
    assert.equal(row.site_key, 'other.localhost')
    // The first holder is told, after a reload, that its reservation lapsed — never the new token.
    const view = await bed.view()
    assert.equal(view.pending, undefined)
    assert.deepEqual(
      view.lapsed.map((d) => ({ name: d.name, state: d.state })),
      [{ name: DOMAIN, state: 'lapsed' }]
    )
    assert.match(view.lapsed[0].lapsedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(JSON.stringify(view).includes(taken.body.pending.verification.value), false)
    const checked = await bed.check()
    assert.equal(checked.status, 409)
    assert.equal(checked.body.code, 'RESERVATION_LAPSED')
    // Reserving it again: the name is somebody else's now.
    assert.deepEqual((await bed.save()).body, { code: 'NAME_TAKEN' })
    // Remove clears the notice.
    assert.equal((await bed.send('DELETE', '/address/domain', { name: DOMAIN })).status, 200)
    assert.deepEqual((await bed.view()).lapsed, [])
    assert.equal((await bed.row()).site_key, 'other.localhost', 'the new holder keeps it')
  }
)

test(
  'a lapsed reservation can be made again by its holder, with a new token and a new 72 hours; saving again before then never extends it',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const first = (await bed.save()).body.pending.verification.value
    const before = await bed.row()
    await age(bed.pool, DOMAIN, 1)
    const again = await bed.save()
    assert.equal(again.body.pending.verification.value, first)
    assert.equal(
      (await bed.row()).hold_until.getTime(),
      before.hold_until.getTime() - 3600_000,
      'the deadline did not move'
    )
    assert.equal(
      Math.round((before.hold_until - before.created_at) / 3600_000),
      72,
      'held for 72 hours from the reservation, on the database clock'
    )
    await age(bed.pool, DOMAIN, 72)
    assert.equal((await bed.view()).lapsed[0].name, DOMAIN)
    assert.equal((await bed.view()).pending, undefined)
    const renewed = await bed.save()
    assert.equal(renewed.status, 202)
    assert.notEqual(renewed.body.pending.verification.value, first)
    const view = await bed.view()
    assert.equal(view.pending.name, DOMAIN)
    assert.deepEqual(view.lapsed, [], 'the new reservation replaces the notice')
    // A lapsed reservation is no place taken: another name can be reserved instead.
    await age(bed.pool, DOMAIN, 73)
    assert.equal((await bed.save('second.example.com')).status, 202)
  }
)

test(
  'a reservation whose ownership was proven once is never taken away by age — even after the TXT record is gone again',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    await bed.check()
    delete bed.dns.txt[`_tracy.${DOMAIN}`]
    const missing = await bed.check()
    assert.equal(
      check(missing.body.pending, 'ownership').status,
      'missing',
      'the latest reading says what it read'
    )
    const row = await bed.row()
    assert.notEqual(row.ownership_proven_at, null, 'the proof is kept')
    await age(bed.pool, DOMAIN, 500)
    await sweepExpired(bed.pool)
    const thief = await otherSite(bed, 'other.localhost', 'other')
    assert.deepEqual((await thief.save()).body, { code: 'NAME_TAKEN' })
    assert.equal((await bed.row()).site_key, OWN)
    assert.equal((await bed.view()).pending.name, DOMAIN)
  }
)

test(
  'a reading that arrives after the reservation lapsed proves nothing and writes nothing',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = async () => {
      await age(bed.pool, DOMAIN, 73)
      return [[token]]
    }
    const checked = await bed.check()
    assert.equal(checked.status, 409)
    assert.equal(checked.body.code, 'RESERVATION_LAPSED')
    const row = await bed.row()
    assert.equal(row.ownership_proven_at, null)
    assert.equal(row.checked_at, null)
  }
)

test(
  'a Check DNS that found the TXT record and ended after a later one that did not still proves the name: the later reading stays on record, and age never lets the name go',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    let release
    const held = new Promise((resolve) => {
      release = resolve
    })
    let asking
    const asked = new Promise((resolve) => {
      asking = resolve
    })
    // The first lookup is slow and finds the record right, as it was when it asked.
    bed.dns.txt[`_tracy.${DOMAIN}`] = async () => {
      asking()
      await held
      return [[token]]
    }
    const early = bed.send('POST', '/address/verify', { name: DOMAIN })
    // Wait until the first lookup is asking, not a fixed time.
    await asked
    // The record is taken away; a second lookup, begun later, says so and ends first.
    delete bed.dns.txt[`_tracy.${DOMAIN}`]
    const later = await bed.check()
    assert.equal(check(later.body.pending, 'ownership').status, 'missing')
    const onRecord = await bed.row()
    assert.equal(onRecord.ownership_proven_at, null)
    release()
    const res = await early
    assert.equal(res.status, 202)
    // Answered what is on record — the later reading — and the reading on record did not move.
    assert.equal(check((await res.json()).pending, 'ownership').status, 'missing')
    const row = await bed.row()
    assert.notEqual(row.ownership_proven_at, null, 'what the early lookup found proves the name')
    assert.equal(row.dns_turn, onRecord.dns_turn)
    assert.equal(row.checked_at.getTime(), onRecord.checked_at.getTime())
    assert.deepEqual(row.dns_reading, onRecord.dns_reading)
    assert.equal(row.ownership_verified_at, null, 'the latest reading still says missing')
    await age(bed.pool, DOMAIN, 500)
    await sweepExpired(bed.pool)
    const thief = await otherSite(bed, 'other.localhost', 'other')
    assert.deepEqual((await thief.save()).body, { code: 'NAME_TAKEN' })
    assert.equal((await bed.row()).site_key, OWN)
  }
)

test(
  'a Check DNS that began before the deadline and waited for the row past it proves nothing: the deadline is read when the row is written, not when the transaction began',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    const holder = await bed.pool.connect()
    try {
      await holder.query('begin')
      // The row locked, with a deadline two seconds away.
      const { hold_until: deadline } = (
        await holder.query(
          "update site_name set hold_until = clock_timestamp() + interval '2 seconds' where name = $1 returning hold_until",
          [DOMAIN]
        )
      ).rows[0]
      let ended = false
      const pending = bed.check().finally(() => {
        ended = true
      })
      // Wait until the check's write is queued behind the lock — its transaction has begun.
      const waitingAt = await waitingForRow(bed.pool, holder, () => ended)
      assert.ok(waitingAt, 'the check waits for the row')
      assert.ok(waitingAt < deadline, 'it began waiting before the deadline')
      // Hold the lock until the deadline has passed, on the database's clock.
      await holder.query(
        'select pg_sleep(greatest(0, extract(epoch from $1::timestamptz - clock_timestamp())) + 0.2)',
        [deadline]
      )
      await holder.query('commit')
      const checked = await pending
      assert.equal(checked.status, 409)
      assert.equal(checked.body.code, 'RESERVATION_LAPSED')
    } finally {
      await holder.query('rollback').catch(() => {})
      holder.release()
    }
    const row = await bed.row()
    assert.equal(row.ownership_proven_at, null, 'a name already free is not proven')
    assert.equal(row.checked_at, null)
  }
)

/**
 * Give the reservation of `name` a deadline `seconds` away on the database's clock, committed, and
 * answer it.
 */
async function deadlineIn(pool, name, seconds) {
  return (
    await pool.query(
      'update site_name set hold_until = clock_timestamp() + make_interval(secs => $2) where name = $1 returning hold_until',
      [name, seconds]
    )
  ).rows[0].hold_until
}

/**
 * Wait until another session waits for a row lock on `site_name` (not `holder`'s), or until `done()`
 * says the work it was waiting for already ended; the database's clock when it was seen waiting,
 * or null.
 */
async function waitingForRow(pool, holder, done) {
  const { rows: mine } = await holder.query('select pg_backend_pid() as pid')
  for (let i = 0; i < 300; i++) {
    const { rows } = await pool.query(
      `select clock_timestamp() as at from pg_stat_activity
        where wait_event_type = 'Lock' and pid <> pg_backend_pid() and pid <> $1
          and query like '%site_name%'`,
      [mine[0].pid]
    )
    if (rows[0]) return rows[0].at
    if (done()) return null
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return null
}

/** Hold `holder`'s locks until `deadline` has passed on the database's clock, then commit. */
async function commitAfter(holder, deadline) {
  await holder.query(
    'select pg_sleep(greatest(0, extract(epoch from $1::timestamptz - clock_timestamp())) + 0.2)',
    [deadline]
  )
  await holder.query('commit')
}

test(
  'a Check DNS that waits past the deadline behind a session that only LOCKED the row (changed nothing) proves nothing: the deadline is read after the lock is taken',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    const deadline = await deadlineIn(bed.pool, DOMAIN, 2)
    const holder = await bed.pool.connect()
    try {
      await holder.query('begin')
      await holder.query('select 1 from site_name where name = $1 for update', [DOMAIN])
      let ended = false
      const pending = bed.check().finally(() => {
        ended = true
      })
      const waitingAt = await waitingForRow(bed.pool, holder, () => ended)
      assert.ok(waitingAt, 'the check waits for the row')
      assert.ok(waitingAt < deadline, 'it began waiting before the deadline')
      await commitAfter(holder, deadline)
      const checked = await pending
      assert.equal(checked.status, 409)
      assert.equal(checked.body.code, 'RESERVATION_LAPSED')
    } finally {
      await holder.query('rollback').catch(() => {})
      holder.release()
    }
    const row = await bed.row()
    assert.equal(row.ownership_proven_at, null, 'a name already free is not proven')
    assert.equal(row.checked_at, null)
  }
)

test(
  'another site reserving a name while a session that only locked it holds it past the deadline: the deadline is read once the lock is let go — the name is taken, and the first holder is told it lapsed',
  opts,
  async () => {
    const bed = await ownDomainBed()
    await bed.save()
    const deadline = await deadlineIn(bed.pool, DOMAIN, 2)
    const thief = await otherSite(bed, 'other.localhost', 'other')
    const holder = await bed.pool.connect()
    let taken
    try {
      await holder.query('begin')
      await holder.query('select 1 from site_name where name = $1 for update', [DOMAIN])
      let ended = false
      const pending = thief.save().finally(() => {
        ended = true
      })
      const waitingAt = await waitingForRow(bed.pool, holder, () => ended)
      // A tree that does not wait answers before the deadline, with the name as it was then.
      if (waitingAt) assert.ok(waitingAt < deadline, 'it began waiting before the deadline')
      await commitAfter(holder, deadline)
      taken = await pending
    } finally {
      await holder.query('rollback').catch(() => {})
      holder.release()
    }
    assert.equal(taken.status, 202, JSON.stringify(taken.body))
    assert.equal((await bed.row()).site_key, 'other.localhost')
    assert.deepEqual(
      (await bed.view()).lapsed.map((d) => d.name),
      [DOMAIN]
    )
  }
)

test(
  'the order reversed — a proof written before the deadline by a session that holds the row past it, and a sweep begun after the deadline that waits for it: the proven name stays, and nobody is told it lapsed',
  opts,
  async () => {
    const bed = await ownDomainBed()
    await bed.save()
    const deadline = await deadlineIn(bed.pool, DOMAIN, 2)
    const holder = await bed.pool.connect()
    try {
      await holder.query('begin')
      await holder.query('select 1 from site_name where name = $1 for update', [DOMAIN])
      await holder.query(
        'update site_name set ownership_proven_at = clock_timestamp() where name = $1 and hold_until > clock_timestamp()',
        [DOMAIN]
      )
      // The sweep begins once the deadline has passed, while the proof is not committed yet.
      await bed.pool.query(
        'select pg_sleep(greatest(0, extract(epoch from $1::timestamptz - clock_timestamp())) + 0.2)',
        [deadline]
      )
      let ended = false
      const sweeping = sweepExpired(bed.pool).finally(() => {
        ended = true
      })
      assert.ok(await waitingForRow(bed.pool, holder, () => ended), 'the sweep waits for the row')
      await holder.query('commit')
      await sweeping
    } finally {
      await holder.query('rollback').catch(() => {})
      holder.release()
    }
    const row = await bed.row()
    assert.notEqual(row, null, 'the proven name stays')
    assert.notEqual(row.ownership_proven_at, null)
    assert.deepEqual((await bed.view()).lapsed, [])
  }
)

test(
  'the hourly sweep lets lapsed reservations go and keeps the notice for their site; connected, carried and proven names stay',
  opts,
  async () => {
    const bed = await ownDomainBed()
    await bed.save()
    await bed.pool.query(
      "insert into site(site_key,label,host,platform,address,attached) values('b.localhost','b','local','wordpress','http://b.localhost:8080/',true)"
    )
    for (const [name, extra] of [
      ['active.example.com', "state = 'active'"],
      ['carried.example.com', 'carried_at = now()'],
      ['proven.example.com', 'ownership_proven_at = now()']
    ]) {
      await bed.pool.query(
        "insert into site_name(name,site_key,kind,state,token) values($1,'b.localhost','custom','pending',repeat('b',48))",
        [name]
      )
      // Each one past a deadline it was given, so only what it is keeps it.
      await bed.pool
        .query(`update site_name set hold_until = now() - interval '1 hour', ${extra} where name = $1`, [
          name
        ])
        .catch(() => {})
    }
    await age(bed.pool, DOMAIN, 73)
    await sweepExpired(bed.pool)
    assert.equal(await bed.row(), null, 'the lapsed name is free')
    assert.deepEqual(
      (await bed.view()).lapsed.map((d) => d.name),
      [DOMAIN]
    )
    for (const name of ['active.example.com', 'carried.example.com', 'proven.example.com'])
      assert.notEqual(await bed.row(name), null, name)
  }
)

test(
  'two sites taking the same lapsed name at once: exactly one gets it, the other is told NAME_TAKEN, and the first holder keeps its notice',
  opts,
  async () => {
    for (let round = 0; round < 5; round++) {
      await db.reset()
      const bed = await ownDomainBed()
      await bed.save()
      await age(bed.pool, DOMAIN, 73)
      const b = await otherSite(bed, 'b.localhost', 'b')
      const c = await otherSite(bed, 'c.localhost', 'c')
      const answers = await Promise.all([b.save(), c.save()])
      const statuses = answers.map((a) => a.status).sort()
      assert.deepEqual(statuses, [202, 409], `round ${round}`)
      const lost = answers.find((a) => a.status === 409)
      assert.deepEqual(lost.body, { code: 'NAME_TAKEN' })
      const won = answers.find((a) => a.status === 202)
      const row = await bed.row()
      assert.equal(row.token, won.body.pending.verification.value, 'the winner’s token is the one kept')
      assert.deepEqual(
        (await bed.view()).lapsed.map((d) => d.name),
        [DOMAIN]
      )
      assert.equal(
        (await bed.pool.query("select count(*)::int as n from site_name where kind = 'custom'")).rows[0].n,
        1
      )
    }
  }
)

test(
  'with the site-connect-domain switch off, the doors that start an own domain refuse by name; a domain the site has stays shown and can be removed',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const token = (await bed.save()).body.pending.verification.value
    bed.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    await saveUiSwitches(bed.pool, { 'site-connect-domain': false }, 'ops@test.example')
    bed.asked.length = 0
    for (const [method, path, body] of [
      ['PUT', '/address', { name: 'second.example.com', kind: 'custom' }],
      ['PUT', '/address', { name: 'second.example.com' }],
      ['PUT', '/address', { name: DOMAIN, kind: 'custom' }],
      ['POST', '/address/verify', { name: DOMAIN }],
      ['GET', '/address/availability?kind=custom&name=second.example.com', undefined]
    ]) {
      const res = await bed.send(method, path, body)
      assert.equal(res.status, 403, `${method} ${path} ${JSON.stringify(body)}`)
      assert.deepEqual(await res.json(), { code: 'OWN_DOMAIN_DISABLED' }, `${method} ${path}`)
    }
    assert.deepEqual(bed.asked, [], 'DNS was never asked')
    assert.equal(await bed.row('second.example.com'), null)
    assert.equal((await bed.row()).checked_at, null)
    // What the site has is still shown, and still goes.
    assert.equal((await bed.view()).pending.name, DOMAIN)
    // Renaming the Tracy address is not an own domain.
    const renamed = await bed.send('GET', '/address/availability?name=renamed.localhost')
    assert.equal(renamed.status, 200)
    assert.equal((await bed.send('DELETE', '/address/domain', { name: DOMAIN })).status, 200)
    // On again: the doors answer again.
    await saveUiSwitches(bed.pool, { 'site-connect-domain': true }, 'ops@test.example')
    assert.equal((await bed.save()).status, 202)
  }
)

test(
  'a switch that cannot be read opens no door: reserving and checking refuse for now and write nothing',
  opts,
  async () => {
    const bed = await ownDomainBed()
    const app = new Hono()
    mountSiteAddress(app, {
      pool: bed.pool,
      config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost', siteAddressPrefix: '' },
      requireGrant: async () => ({ grant: { role: 'owner' } }),
      run: async () => assert.fail('no host job'),
      dnsTxt: async () => assert.fail('DNS is not asked'),
      dnsCname: async () => assert.fail('DNS is not asked'),
      connectDomainOn: async () => {
        throw new Error('connection terminated')
      }
    })
    for (const [method, path, body] of [
      ['PUT', '/address', { name: DOMAIN, kind: 'custom' }],
      ['POST', '/address/verify', { name: DOMAIN }],
      ['GET', `/address/availability?kind=custom&name=${DOMAIN}`, undefined]
    ]) {
      const res = await app.request(`/api/sites/${OWN}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
      assert.equal(res.status, 503, `${method} ${path}`)
      assert.deepEqual(await res.json(), { code: 'UI_SETTING_UNREADABLE' })
    }
    assert.equal(await bed.row(), null)
  }
)

// ── #1037: removing a connected domain — the Tracy address is checked first ─────────────────────
// Order: the site answers at its Tracy address (restored there if somebody moved the CMS onto the
// domain) → this app stops serving the name → the host takes its rule out → the row goes. A step
// that fails is named, and nothing after it has happened.

/** A bed whose domain is connected, as a publish and its probe leave it. */
async function connectedBed(options) {
  const bed = await ownDomainBed(options)
  await bed.save()
  await bed.pool.query(
    "update site_name set state = 'active', carried_at = now(), routed_at = now(), probe_secret = repeat('b', 64) where name = $1",
    [DOMAIN]
  )
  bed.remove = async () => {
    const res = await bed.send('DELETE', '/address/domain', { name: DOMAIN })
    return { status: res.status, body: await res.json() }
  }
  return bed
}

test(
  '#1037 removal: the site is asked at its Tracy address before anything is taken away; answering there, the name goes out through the host and no address job runs',
  opts,
  async () => {
    const bed = await connectedBed()
    const removed = await bed.remove()
    assert.equal(removed.status, 202)
    assert.deepEqual(bed.stood, [DOMAIN], 'asked once, before the host')
    assert.deepEqual(bed.jobs, [], 'the CMS never left its Tracy address: nothing to put back')
    assert.deepEqual(bed.dropped, [{ domains: [DOMAIN] }])
  }
)

test(
  '#1037 removal: every name whose route may be on the host is checked, not only a connected one — handed to a publish and never heard back, or on a site that cannot be asked',
  opts,
  async () => {
    // Carried and still pending: the host may be routing it, so the Tracy address is asked first.
    const bed = await connectedBed()
    await bed.pool.query("update site_name set state = 'pending', routed_at = null where name = $1", [DOMAIN])
    assert.equal((await bed.remove()).status, 202)
    assert.deepEqual(bed.stood, [DOMAIN])
    assert.deepEqual(bed.dropped, [{ domains: [DOMAIN] }])
    for (const state of ['pending', 'active']) {
      await db.reset()
      const down = await connectedBed()
      await down.pool.query('update site_name set state = $2 where name = $1', [DOMAIN, state])
      down.standing = 'unreachable'
      const refused = await down.remove()
      assert.equal(refused.status, 502, state)
      assert.deepEqual(refused.body, { code: 'DOMAIN_REMOVE_FAILED', step: 'verify-address' }, state)
      assert.deepEqual(down.dropped, [], `${state}: nothing was taken away`)
      assert.equal((await down.row()).state, state)
    }
    // A site with no copy to ask, or no address on record: nothing says the Tracy address serves it.
    for (const broken of ['attached = false', 'address = null']) {
      await db.reset()
      const lost = await connectedBed()
      await lost.pool.query(`update site set ${broken} where site_key = $1`, [OWN])
      lost.standing = () => assert.fail('a site that cannot be asked is not asked')
      const refused = await lost.remove()
      assert.equal(refused.status, 502, broken)
      assert.deepEqual(
        refused.body,
        { code: 'DOMAIN_REMOVE_FAILED', step: 'verify-address', reason: 'SITE_NOT_READY' },
        broken
      )
      assert.deepEqual(lost.dropped, [], broken)
      assert.equal((await lost.row()).state, 'active', broken)
    }
    // A reservation the host never saw is still removed at once, whatever the site says.
    await db.reset()
    const plain = await ownDomainBed()
    await plain.save()
    plain.standing = () => assert.fail('a reservation is on no host')
    assert.equal((await plain.send('DELETE', '/address/domain', { name: DOMAIN })).status, 200)
  }
)

test(
  '#1037 removal: a CMS that was moved onto the domain is put back at its Tracy address by the address job, checked again, and only then is the name taken out',
  opts,
  async () => {
    const bed = await connectedBed()
    const answers = ['moved', 'ok']
    bed.standing = () => answers.shift()
    bed.job = { ok: true }
    const removed = await bed.remove()
    assert.equal(removed.status, 202)
    assert.deepEqual(bed.stood, [DOMAIN, DOMAIN], 'asked, restored, asked again')
    assert.equal(bed.jobs.length, 1)
    const { changeId, ...job } = bed.jobs[0]
    assert.match(changeId, /^[0-9a-f-]{36}$/)
    assert.deepEqual(job, {
      kind: 'site-address',
      oldUrl: `https://${DOMAIN}/`,
      newUrl: 'http://shop.localhost:8080/',
      operation: 'apply'
    })
    assert.deepEqual(bed.dropped, [{ domains: [DOMAIN] }])
  }
)

test(
  '#1037 removal that cannot be made safe stops before the host is asked — the step is named, the restore is rolled back, and the domain goes on serving',
  opts,
  async () => {
    const refusal = { ok: false, reason: 'log line\n{"ok":false,"code":"WP_ADDRESS_CONSTANT"}' }
    const cases = [
      ['the site does not answer', () => 'unreachable', null, 'verify-address', undefined, []],
      [
        'asking the site throws',
        () => {
          throw new Error('ECONNREFUSED')
        },
        null,
        'verify-address',
        undefined,
        []
      ],
      ['an answer that is not one', () => 'maybe', null, 'verify-address', undefined, []],
      [
        'the Tracy address sends visitors to some other host',
        () => 'elsewhere',
        null,
        'verify-address',
        'ADDRESS_REDIRECTS_ELSEWHERE',
        []
      ],
      [
        'the host refuses to put the address back',
        () => 'moved',
        (input) => (input.operation === 'apply' ? refusal : { ok: true }),
        'restore-address',
        'WP_ADDRESS_CONSTANT',
        ['apply', 'rollback']
      ],
      [
        'the address job gives no answer',
        () => 'moved',
        (input) => {
          if (input.operation === 'apply') throw new Error('timeout')
          return { ok: true }
        },
        'restore-address',
        undefined,
        ['apply', 'rollback']
      ],
      [
        'put back, and the site still sends its Tracy address to the domain',
        () => 'moved',
        () => ({ ok: true }),
        'verify-address',
        undefined,
        ['apply', 'rollback']
      ],
      [
        'put back, checked, and now it sends visitors elsewhere',
        (() => {
          const answers = ['moved', 'elsewhere']
          return () => answers.shift()
        })(),
        () => ({ ok: true }),
        'verify-address',
        'ADDRESS_REDIRECTS_ELSEWHERE',
        ['apply', 'rollback']
      ]
    ]
    for (const [what, standing, job, step, reason, operations] of cases) {
      await db.reset()
      const bed = await connectedBed()
      bed.standing = standing
      bed.job = job
      const refused = await bed.remove()
      assert.equal(refused.status, 502, what)
      assert.deepEqual(
        refused.body,
        { code: 'DOMAIN_REMOVE_FAILED', step, ...(reason ? { reason } : {}) },
        what
      )
      assert.deepEqual(
        bed.jobs.map((input) => input.operation),
        operations,
        what
      )
      if (bed.jobs.length === 2)
        assert.equal(bed.jobs[0].changeId, bed.jobs[1].changeId, `${what}: the same change is undone`)
      assert.deepEqual(bed.dropped, [], `${what}: the host was never asked to remove anything`)
      const row = await bed.row()
      assert.equal(row.state, 'active', `${what}: still connected`)
      assert.notEqual(row.probe_secret, null, what)
      const tombstone = await bed.pool.query('select 1 from site_name_released where name = $1', [DOMAIN])
      assert.equal(tombstone.rowCount, 0, what)
    }
  }
)

test(
  '#1037 removal: a restore whose rollback nobody confirmed is reported as uncertain, with the change to finish, and written down — never passed off as a plain failed restore',
  opts,
  async () => {
    const refusal = { ok: false, reason: '{"ok":false,"code":"WP_ADDRESS_CONSTANT"}' }
    const unknown = { ok: false, reason: '{"ok":false,"code":"CHANGE_UNKNOWN"}' }
    const cases = [
      [
        'the rollback throws',
        (input) => {
          if (input.operation === 'rollback') throw new Error('host down')
          return { ok: false }
        },
        ['moved'],
        undefined
      ],
      ['the rollback answers a failure', () => ({ ok: false }), ['moved'], undefined],
      [
        'the apply refused and the rollback fails too',
        (input) => (input.operation === 'apply' ? refusal : { ok: false }),
        ['moved'],
        'WP_ADDRESS_CONSTANT'
      ],
      [
        // An apply that gave no answer may still be queued: `CHANGE_UNKNOWN` then proves nothing.
        'the apply timed out and the host knows no such change',
        (input) => {
          if (input.operation === 'apply') throw new Error('timeout')
          return unknown
        },
        ['moved'],
        undefined
      ],
      [
        'put back, still not serving, and the rollback fails',
        (input) => (input.operation === 'apply' ? { ok: true } : { ok: false }),
        ['moved', 'unreachable'],
        undefined
      ]
    ]
    for (const [what, job, answers, reason] of cases) {
      await db.reset()
      const bed = await connectedBed()
      bed.standing = () => answers.shift()
      bed.job = job
      const refused = await bed.remove()
      assert.equal(refused.status, 502, what)
      const { changeId, ...body } = refused.body
      assert.deepEqual(
        body,
        {
          code: 'DOMAIN_REMOVE_FAILED',
          step: 'rollback-address',
          uncertain: true,
          ...(reason ? { reason } : {})
        },
        what
      )
      assert.equal(changeId, bed.jobs[0].changeId, `${what}: the change to finish is named`)
      assert.deepEqual(
        bed.jobs.map((input) => input.operation),
        ['apply', 'rollback'],
        what
      )
      assert.deepEqual(bed.dropped, [], `${what}: the host was never asked to remove anything`)
      assert.equal((await bed.row()).state, 'active', what)
      const kept = await bed.pool.query(
        "select detail from audit where action = 'site.domain.restore.uncertain' and site_key = $1",
        [OWN]
      )
      assert.equal(kept.rowCount, 1, `${what}: written down`)
      assert.deepEqual(kept.rows[0].detail, {
        name: DOMAIN,
        changeId,
        oldUrl: `https://${DOMAIN}/`,
        newUrl: 'http://shop.localhost:8080/'
      })
    }
    // The host says it holds no such change after REFUSING the apply: nothing was written, so the
    // restore simply failed — the one case `CHANGE_UNKNOWN` is a confirmed rollback.
    await db.reset()
    const bed = await connectedBed()
    bed.standing = 'moved'
    bed.job = (input) => (input.operation === 'apply' ? refusal : unknown)
    assert.deepEqual((await bed.remove()).body, {
      code: 'DOMAIN_REMOVE_FAILED',
      step: 'restore-address',
      reason: 'WP_ADDRESS_CONSTANT'
    })
  }
)

test(
  '#1037 removal: a removal the host could not start says which step it stopped at; a reservation removed outright is remembered as let go, and saving the name again forgets that',
  opts,
  async () => {
    const bed = await connectedBed({
      dropDomain: async () => ({ status: 504, body: { code: 'HOST_UNREACHABLE' } })
    })
    const unreachable = await bed.remove()
    assert.equal(unreachable.status, 504)
    assert.deepEqual(unreachable.body, { code: 'HOST_UNREACHABLE', step: 'remove-route' })

    await db.reset()
    const plain = await ownDomainBed()
    await plain.save()
    assert.equal((await plain.send('DELETE', '/address/domain', { name: DOMAIN })).status, 200)
    const released = () => plain.pool.query('select 1 from site_name_released where name = $1', [DOMAIN])
    assert.equal((await released()).rowCount, 1)
    assert.deepEqual(await addressModule.ownDomainByName(plain.pool, DOMAIN), {
      name: DOMAIN,
      state: 'released',
      routedAt: null,
      probeSecret: null,
      site: null
    })
    assert.equal((await plain.save()).status, 202)
    assert.equal((await released()).rowCount, 0)
    assert.equal((await addressModule.ownDomainByName(plain.pool, DOMAIN)).site.site_key, OWN)
  }
)

test("#1037 addressStanding: the site is asked THROUGH TRACY'S PROXY as its Tracy address — only a WHOLE page it serves there reads ok (200, an HTML document read to its end, reached through redirects that stay on that origin), only a redirect to the own domain reads moved", async () => {
  const site = { host: 'local', label: 'shop', platform: 'wordpress', address: 'https://shop.tracy.site/' }
  const config = { hostName: 'local', siteDomain: 'tracy.site' }
  const asked = []
  /** `responses`: one answer, or a function of the path asked (for a chain of redirects). */
  const answer = (responses, deps = {}) =>
    addressModule.addressStanding(site, DOMAIN, {
      config,
      proxy: proxySite,
      ms: 1500,
      fetchImpl: async (request) => {
        asked.push({
          url: request.url,
          host: request.headers.get('x-forwarded-host'),
          proto: request.headers.get('x-forwarded-proto'),
          tracy: [...request.headers.keys()].filter((name) => name.startsWith('x-tracy-')),
          cookie: request.headers.get('cookie'),
          redirect: request.redirect
        })
        const response =
          typeof responses === 'function' ? responses(new URL(request.url), request) : responses
        if (response instanceof Error) throw response
        return response
      },
      ...deps
    })
  const html = (body = '<!doctype html><html><body>home</body></html>', init = {}) =>
    new Response(body, { ...init, headers: { 'content-type': 'text/html; charset=utf-8', ...init.headers } })
  assert.equal(await answer(html()), 'ok')
  // The request is the one the proxy makes for a visitor of the Tracy address: the site's copy,
  // told that address, nobody vouched for.
  assert.deepEqual(asked[0], {
    url: 'http://shop-web-1/',
    host: 'shop.tracy.site',
    proto: 'https',
    tracy: [],
    cookie: null,
    redirect: 'manual'
  })
  const to = (location, status = 301) => new Response(null, { status, headers: { location } })
  assert.equal(await answer(to(`https://${DOMAIN}/`)), 'moved')
  assert.equal(await answer(to(`http://${DOMAIN.toUpperCase()}/x`, 302)), 'moved')
  // Its own redirects stay on the Tracy address and are FOLLOWED to the page a browser would see —
  // as the proxy hands them to that browser (the site's own host name always at the Tracy origin).
  for (const [location, next] of [
    ['/en/', '/en/'],
    ['https://shop.tracy.site/en/?a=1', '/en/?a=1'],
    ['http://SHOP.tracy.site/home', '/home'],
    ['http://shop-web-1/internal', '/internal'],
    ['en/', '/en/']
  ]) {
    asked.length = 0
    assert.equal(await answer((url) => (url.pathname === '/' ? to(location) : html())), 'ok', location)
    assert.deepEqual(
      asked.map((call) => call.url),
      ['http://shop-web-1/', `http://shop-web-1${next}`],
      location
    )
    assert.equal(asked[1].host, 'shop.tracy.site')
  }
  // 🔒 A redirect that never arrives is not a page: back to itself — in any spelling of the Tracy
  // address, plain `http` included — round in a circle, a chain longer than a browser's patience,
  // or onto an error.
  for (const self of [
    '/',
    'https://shop.tracy.site/',
    'http://shop.tracy.site/',
    'https://shop.tracy.site:8443/'
  ]) {
    asked.length = 0
    assert.equal(await answer(to(self)), 'unreachable', `/ → ${self}`)
    assert.equal(asked.length, 1, `${self}: seen once, not followed round`)
  }
  assert.equal(await answer((url) => to(url.pathname === '/a' ? '/b' : '/a')), 'unreachable', 'a circle')
  let n = 0
  asked.length = 0
  assert.equal(await answer(() => to(`/step-${++n}`)), 'unreachable', 'an endless chain')
  assert.ok(asked.length <= 6, `bounded: ${asked.length} requests`)
  assert.equal(
    await answer((url) => (url.pathname === '/' ? to('/en/') : new Response('nf', { status: 404 }))),
    'unreachable'
  )
  // A redirect that leaves, at any hop, is judged as leaving.
  assert.equal(
    await answer((url) => (url.pathname === '/' ? to('/en/') : to(`https://${DOMAIN}/en/`))),
    'moved'
  )
  assert.equal(
    await answer((url) => (url.pathname === '/' ? to('/en/') : to('https://pay.example/'))),
    'elsewhere'
  )
  // 🔒 A redirect off the Tracy address's ORIGIN — a near name, a third party, credentials, another
  // scheme of URL, a Location that is no URL or is missing — is NOT the Tracy address serving the
  // site.
  for (const location of [
    `https://x.${DOMAIN}/`,
    'https://pay.example/',
    'https://shop.tracy.site.evil.example/',
    'https://shop.tracy.site@pay.example/',
    'https://user:pw@shop.tracy.site/en/',
    'javascript:alert(1)',
    'http://[',
    ''
  ])
    assert.equal(await answer(to(location)), 'elsewhere', JSON.stringify(location))
  assert.equal(await answer(new Response(null, { status: 302 })), 'elsewhere', 'no Location at all')
  // 🔒 The ORIGIN is compared, never the host name alone (review of #1037: `http://<same host>/`
  // passed as the `https` address). Through Tracy's proxy such a Location never reaches a browser;
  // whatever proxy is asked through, one that does is not the Tracy address.
  const raw = (location) =>
    addressModule.addressStanding(site, DOMAIN, {
      config,
      ms: 1500,
      proxy: async (request) => (new URL(request.url).pathname === '/' ? to(location) : html())
    })
  assert.equal(await raw('https://shop.tracy.site/en/'), 'ok')
  for (const location of [
    'http://shop.tracy.site/en/',
    'https://shop.tracy.site:8443/en/',
    'http://shop.tracy.site:443/en/',
    'https://shop.tracy.site@shop.tracy.site/en/',
    '//shop.tracy.site.evil.example/en/'
  ])
    assert.equal(await raw(location), 'elsewhere', location)
  // No proxy to ask through is never a page.
  assert.equal(await addressModule.addressStanding(site, DOMAIN, { config }), 'unreachable')
  // 🔒 A success that carries no page is not the site being served: no content, partial content,
  // an empty body, a body that is not an HTML document, or HTML under another content type.
  for (const [what, response] of [
    ['204', new Response(null, { status: 204 })],
    ['205', new Response(null, { status: 205 })],
    ['206', html(undefined, { status: 206, headers: { 'content-range': 'bytes 0-10/100' } })],
    ['201', html(undefined, { status: 201 })],
    ['an empty 200', html('')],
    ['white space', html('  \n ')],
    ['200 with no body', new Response(null, { status: 200, headers: { 'content-type': 'text/html' } })],
    ['text, not a document', html('It works!')],
    [
      'plain text',
      new Response('<html><body>x</body></html>', { headers: { 'content-type': 'text/plain' } })
    ],
    ['JSON', new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })],
    ['no content type', new Response(new TextEncoder().encode('<html></html>'))]
  ])
    assert.equal(await answer(response), 'unreachable', what)
  for (const body of [
    '<!DOCTYPE html>\n<html lang="en">',
    '﻿<html>',
    '<!-- cache --><HTML >',
    '<head>',
    '<body class="home">',
    `${' '.repeat(70_000)}<html>`
  ])
    assert.equal(await answer(html(body)), 'ok', body.trim().slice(0, 30))
  assert.equal(
    await answer(new Response('<html></html>', { headers: { 'content-type': 'application/xhtml+xml' } })),
    'ok'
  )
  // 🔒 A page that BEGINS is not a page that was served (review of #1037: an `<html>` prefix read
  // 'ok' and the domain was taken away): broken off, stalled, or never ending — all 'unreachable',
  // within the deadline.
  const body = (make) => (_url, request) =>
    new Response(new ReadableStream(make(request)), { headers: { 'content-type': 'text/html' } })
  const prefix = new TextEncoder().encode('<!doctype html><html><body>begin')
  for (const [what, make] of [
    [
      'cut off after the document began',
      () => ({
        start: (controller) => controller.enqueue(prefix),
        pull: (controller) => controller.error(new Error('ECONNRESET'))
      })
    ],
    [
      'stalled after the document began',
      (request) => ({
        start(controller) {
          controller.enqueue(prefix)
          request.signal.addEventListener('abort', () => controller.error(request.signal.reason))
        }
      })
    ],
    [
      'never ending',
      (request) => ({
        start: (controller) => controller.enqueue(prefix),
        async pull(controller) {
          if (request.signal.aborted) return controller.error(request.signal.reason)
          await new Promise((resolve) => setTimeout(resolve, 5))
          controller.enqueue(new Uint8Array(16_384).fill(0x20))
        }
      })
    ]
  ]) {
    const started = Date.now()
    assert.equal(await answer(body(make), { ms: 300 }), 'unreachable', what)
    assert.ok(Date.now() - started < 5000, `${what}: decided within the deadline`)
  }
  // The same through a proxy that hands the body on as it arrives.
  const streamed = (make) =>
    addressModule.addressStanding(site, DOMAIN, {
      config,
      ms: 300,
      proxy: async (request) =>
        new Response(new ReadableStream(make(request)), { headers: { 'content-type': 'text/html' } })
    })
  assert.equal(
    await streamed(() => ({
      start: (controller) => controller.enqueue(prefix),
      pull: (controller) => controller.error(new Error('ECONNRESET'))
    })),
    'unreachable'
  )
  assert.equal(await streamed(() => ({ start: (controller) => controller.enqueue(prefix) })), 'unreachable')
  // An error is not the site's page, whichever error it is — a dial that fails included.
  for (const status of [401, 403, 404, 410, 500, 502, 503])
    assert.equal(await answer(html('<html>no</html>', { status })), 'unreachable', String(status))
  assert.equal(await answer(new Error('ECONNREFUSED')), 'unreachable')
})

// ── #1037: the HTTPS probe of the real domain ───────────────────────────────────────────────────
import {
  PAGE_BYTES_MAX,
  bodyDigest,
  pageProof,
  probeDomain as probeDomainWith,
  probeProof,
  publicAddress,
  readWhole,
  servedPage
} from '../src/sites/domain-probe.js'
import { proxySite } from '../src/bar/site-proxy.js'

/**
 * The page window of a row as `confirmOwnDomains` gives it to the prober, in memory: what was
 * opened (the nonce and path the proxy would sign with), and whether it was shut.
 */
function pageWindow({ refuse = false } = {}) {
  const window = {
    opened: [],
    closed: 0,
    current: null,
    open: async (asked) => {
      window.opened.push(asked)
      window.current = refuse ? null : asked
      return !refuse
    },
    close: async () => {
      window.closed += 1
      window.current = null
    }
  }
  return window
}
/** The window of the probe that is running, for the stand-in proxies below. */
let probing = pageWindow()
const probeDomain = (row, deps) => {
  probing = deps.page ?? pageWindow()
  return probeDomainWith(row, { ...deps, page: probing })
}
const HOME = '<!doctype html><html><body>home</body></html>'

const PROBE_ROW = { name: DOMAIN, siteKey: OWN, secret: 's'.repeat(64) }
const fail = (code) => async () => {
  throw Object.assign(new Error(code), { code })
}
/** A resolver that answers `v4` / `v6` (values, or functions), counting what it was asked. */
function probeResolver({ v4 = ['203.0.113.10'], v6 = fail('ENODATA') } = {}) {
  const asked = []
  const answer = (found) => async (name) => {
    asked.push(name)
    return typeof found === 'function' ? found(name) : found
  }
  return { asked, resolve4: answer(v4), resolve6: answer(v6) }
}
// 203.0.113.0/24 is documentation space (not public): the tests that dial say so with `allowPrivate`
// only where the address itself is not what is under test.
const PUBLIC_V4 = '93.184.216.34'

test('#1037 probe: only the proof of THIS row for THIS attempt is "ok" — an echo, another site, an older attempt, another name and every other answer are not', async () => {
  const resolver = probeResolver({ v4: [PUBLIC_V4] })
  const dialled = []
  /** What the proxy signs: everything it sent — status, type, Location, the digest of every byte. */
  const sign = (row, path, sent, bytes, nonce = probing.current?.nonce) =>
    pageProof(row.secret, {
      ...row,
      nonce,
      path,
      status: sent.status,
      contentType: sent.contentType ?? null,
      location: sent.location ?? null,
      digest: bodyDigest(bytes ?? Buffer.alloc(0))
    })
  /**
   * The site's page as the proxy answers it while the window is open — signed for `row` with the
   * nonce and path ON THE ROW, nothing of the request — and as the prober's request reads it: the
   * WHOLE body (`extra.body`: its text; `undefined`: a request that read no whole body).
   */
  const pageOf =
    (row, status = 200, extra = {}) =>
    async (input) => {
      const { body: text = HOME, ...rest } = 'body' in extra ? { ...extra, body: extra.body ?? null } : extra
      const bytes = text === null ? undefined : Buffer.from(text)
      const sent = { status, contentType: 'text/html; charset=utf-8', ...rest }
      return { ...sent, bytes, proof: await sign(row, input.path, sent, bytes) }
    }
  const answering =
    (make, page = pageOf(PROBE_ROW)) =>
    async (input) => {
      dialled.push(input)
      return input.kind === 'page' ? page(input) : { status: 200, body: await make(input) }
    }
  const proofWith = (row) => (input) => probeProof(row.secret, { ...row, challenge: input.challenge })
  assert.deepEqual(await probeDomain(PROBE_ROW, { resolver, request: answering(proofWith(PROBE_ROW)) }), {
    status: 'ok'
  })
  // What was dialled: the address DNS gave, as the name, on 443, with a fresh random challenge.
  assert.equal(dialled[0].name, DOMAIN)
  assert.equal(dialled[0].address, PUBLIC_V4)
  assert.equal(dialled[0].port, 443)
  assert.match(dialled[0].challenge, /^[0-9a-f]{48}$/)
  assert.deepEqual(resolver.asked, [DOMAIN, DOMAIN], 'resolved once per family, never again for the dial')
  // Then the site's home page, through the same checked address — 🔒 AN ORDINARY REQUEST: nothing
  // in it is this attempt's (review of #1037: a key in the request let whatever answers at the
  // domain relay the probe and serve visitors something else). The nonce went to the ROW instead.
  assert.deepEqual(
    dialled.map((d) => d.kind),
    ['route', 'page']
  )
  assert.equal(dialled[1].address, PUBLIC_V4)
  assert.equal(dialled[1].port, 443)
  assert.equal(dialled[1].path, '/')
  assert.deepEqual(
    Object.keys(dialled[1]).filter(
      (key) => !['name', 'address', 'family', 'port', 'ca', 'kind', 'path', 'pageMs'].includes(key)
    ),
    [],
    'no challenge, key or nonce travels with the page request'
  )
  const first = probing
  assert.equal(first.opened.length, 1)
  assert.equal(first.opened[0].path, '/')
  assert.match(first.opened[0].nonce, /^[0-9a-f]{48}$/)
  assert.equal(first.closed, 1, 'the window is shut when the probe ends')
  await probeDomain(PROBE_ROW, { resolver, request: answering(proofWith(PROBE_ROW)) })
  assert.notEqual(dialled[0].challenge, dialled[2].challenge)
  assert.notEqual(first.opened[0].nonce, probing.opened[0].nonce, 'a fresh nonce per probe')
  // 🔒 THE ROUTE PROOF ALONE CONNECTS NOTHING (review of #1037): the web process gives it from its
  // database, so it is right while the CMS is stopped, and right when another server relays it and
  // serves pages of its own. Only a page the site SERVED through the proxy, for this attempt, is.
  const route = proofWith(PROBE_ROW)
  const pageCase = (page, deps = {}) =>
    probeDomain(PROBE_ROW, { resolver, request: answering(route, page), ...deps })
  // 🔒 A SUCCESS THAT CARRIES NO PAGE IS NOT A PAGE (review of #1037: any 2xx connected the name
  // on headers alone). Each of these is signed by the proxy as what the site really answered.
  for (const [what, status, extra] of [
    ['204 no content', 204, { body: '' }],
    ['205', 205, { body: '' }],
    ['206 partial content', 206, {}],
    ['201', 201, {}],
    ['an empty 200', 200, { body: '' }],
    ['white space', 200, { body: ' \n\t' }],
    ['text that is no document', 200, { body: 'It works!' }],
    ['a document under another type', 200, { contentType: 'text/plain' }],
    ['JSON', 200, { contentType: 'application/json', body: '{"ok":true}' }],
    ['no content type', 200, { contentType: null }]
  ])
    assert.deepEqual(
      await pageCase(pageOf(PROBE_ROW, status, extra)),
      { status: 'failed', error: 'PAGE_EMPTY' },
      what
    )
  for (const body of [
    '<!DOCTYPE html><html lang="en">',
    '<html>',
    '﻿<!-- c --><HTML >',
    '<head>',
    '<body class="x">',
    `${' '.repeat(70_000)}<html>`
  ])
    assert.deepEqual(
      await pageCase(pageOf(PROBE_ROW, 200, { body })),
      { status: 'ok' },
      body.trim().slice(0, 30)
    )
  // 🔒 THE PROOF IS OF THE BYTES THAT WERE READ (review of #1037: the proof signed the status and the
  // path only, so a server at the domain could relay the probe to Tracy, keep the signed header and
  // send a page of its own). Every one of these carries the proxy's genuine header for THIS probe.
  const genuine = pageOf(PROBE_ROW)
  for (const [what, tamper] of [
    [
      'the body replaced by unrelated HTML',
      { bytes: Buffer.from('<html><body>somebody else</body></html>') }
    ],
    ['the body cut after it began', { bytes: Buffer.from(HOME).subarray(0, 21) }],
    ['one byte more', { bytes: Buffer.from(`${HOME}\n`) }],
    ['one byte changed', { bytes: Buffer.from(HOME.replace('home', 'h0me')) }],
    ['an empty body', { bytes: Buffer.alloc(0) }],
    ['another content type', { contentType: 'text/html' }],
    ['a Location added', { location: '/elsewhere' }],
    ['another status', { status: 203 }]
  ])
    assert.deepEqual(
      await pageCase(async (input) => ({ ...(await genuine(input)), ...tamper })),
      { status: 'failed', error: 'PAGE_NOT_SITE' },
      what
    )
  // …and a redirect's `Location` is signed too: the genuine header beside another one leads nowhere.
  assert.deepEqual(
    await pageCase(async (input) => ({
      ...(await pageOf(PROBE_ROW, 302, { location: '/en/' })(input)),
      location: '/mine/'
    })),
    { status: 'failed', error: 'PAGE_NOT_SITE' }
  )
  // 🔒 NO WHOLE BODY, NO PAGE: a request that could not read the answer to its end says so, and a
  // request function that hands back anything but the whole body's bytes has read no page.
  for (const error of ['PAGE_INCOMPLETE', 'PAGE_TOO_LARGE'])
    assert.deepEqual(await pageCase(async () => ({ error })), { status: 'failed', error })
  for (const [what, extra] of [
    ['no body at all', { bytes: undefined }],
    ['a body handed back as text', { bytes: HOME }],
    ['a prefix under the old name', { bytes: undefined, body: HOME }]
  ])
    assert.deepEqual(
      await pageCase(async (input) => ({ ...(await genuine(input)), ...extra })),
      { status: 'failed', error: 'PAGE_INCOMPLETE' },
      what
    )
  assert.deepEqual(
    await pageCase(pageOf(PROBE_ROW, 200, { contentType: 'application/xhtml+xml', body: '<html>' })),
    { status: 'ok' }
  )
  // 🔒 A REDIRECT THAT STAYS ON THE DOMAIN IS FOLLOWED TO THE PAGE, each hop asked as an ordinary
  // request and proven with a nonce of its own for the path it asks (review: `/` → `/` connected).
  for (const [location, next] of [
    ['/en/', '/en/'],
    [`https://${DOMAIN}/en/?a=1`, '/en/?a=1'],
    ['en/', '/en/'],
    [`https://${DOMAIN.toUpperCase()}/home`, '/home']
  ]) {
    dialled.length = 0
    const page = (input) =>
      input.path === '/' ? pageOf(PROBE_ROW, 302, { location })(input) : pageOf(PROBE_ROW)(input)
    assert.deepEqual(await pageCase(page), { status: 'ok' }, location)
    assert.deepEqual(
      dialled.filter((d) => d.kind === 'page').map((d) => d.path),
      ['/', next],
      location
    )
    assert.deepEqual(
      probing.opened.map((asked) => asked.path),
      ['/', next]
    )
    assert.notEqual(probing.opened[0].nonce, probing.opened[1].nonce)
    assert.equal(probing.closed, 1)
  }
  // Round in a circle, back to itself, or on and on: no page was reached — and it stops.
  for (const [what, location] of [
    ['/ → /', () => '/'],
    ['a circle', (path) => (path === '/a' ? '/b' : '/a')],
    ['an endless chain', (path) => `${path}x/`]
  ]) {
    dialled.length = 0
    assert.deepEqual(
      await pageCase((input) => pageOf(PROBE_ROW, 302, { location: location(input.path) })(input)),
      { status: 'failed', error: 'PAGE_REDIRECT' },
      what
    )
    assert.equal(dialled.filter((d) => d.kind === 'page').length, 4, `${what}: bounded`)
  }
  // A hop whose page is an error, is empty, or is not the site's, fails as that.
  const then = (second) => (input) =>
    input.path === '/' ? pageOf(PROBE_ROW, 301, { location: '/en/' })(input) : second(input)
  assert.deepEqual(await pageCase(then(pageOf(PROBE_ROW, 404))), {
    status: 'failed',
    error: 'SITE_NOT_ANSWERING'
  })
  assert.deepEqual(await pageCase(then(pageOf(PROBE_ROW, 204, { body: '' }))), {
    status: 'failed',
    error: 'PAGE_EMPTY'
  })
  assert.deepEqual(
    await pageCase(then(async () => ({ status: 200, contentType: 'text/html', bytes: Buffer.from(HOME) }))),
    {
      status: 'failed',
      error: 'PAGE_NOT_SITE'
    }
  )
  // The proof of the FIRST hop does not prove the second: the nonce and the path are both in it.
  let kept = null
  assert.deepEqual(
    await pageCase(async (input) => {
      if (input.path === '/') {
        kept = await pageOf(PROBE_ROW, 200)(input)
        return pageOf(PROBE_ROW, 302, { location: '/en/' })(input)
      }
      return kept
    }),
    { status: 'failed', error: 'PAGE_NOT_SITE' }
  )
  for (const location of [
    'https://lantern.tracy.test/',
    `http://${DOMAIN}/`,
    `https://${DOMAIN}.evil.example/`,
    `https://${DOMAIN}:8443/`,
    `https://user@${DOMAIN}/`,
    `//elsewhere.example/`,
    'https://[bad',
    `/${'a'.repeat(3000)}`
  ])
    assert.deepEqual(
      await pageCase(pageOf(PROBE_ROW, 301, { location })),
      { status: 'failed', error: 'PAGE_REDIRECT' },
      `a redirect off the domain: ${location.slice(0, 60)}`
    )
  assert.deepEqual(
    await pageCase(pageOf(PROBE_ROW, 302, { location: undefined })),
    { status: 'failed', error: 'PAGE_REDIRECT' },
    'a redirect with no Location'
  )
  for (const status of [400, 404, 500, 502, 503])
    assert.deepEqual(
      await pageCase(pageOf(PROBE_ROW, status)),
      { status: 'failed', error: 'SITE_NOT_ANSWERING' },
      `the site answered ${status} (502 is the proxy saying the CMS is down)`
    )
  const page200 = { status: 200, contentType: 'text/html', bytes: Buffer.from(HOME) }
  for (const [what, page] of [
    ['a page with no proof (another server answers the pages)', async () => ({ ...page200 })],
    ['a page with an empty proof', async () => ({ ...page200, proof: '' })],
    ['a proof that is not a string', async () => ({ ...page200, proof: 7 })],
    ['the nonce sent back as the proof', async () => ({ ...page200, proof: probing.current.nonce })],
    ['the proof of an older attempt', pageOf({ ...PROBE_ROW, secret: 'o'.repeat(64) })],
    ["another site's proof", pageOf({ ...PROBE_ROW, siteKey: 'other.localhost' })],
    ["another name's proof", pageOf({ ...PROBE_ROW, name: 'other.example.com' })],
    [
      'a proof of another status (a 502 dressed as a 200)',
      async (input) => ({ ...(await pageOf(PROBE_ROW, 502)(input)), status: 200 })
    ],
    [
      'the proof of another nonce (an answer kept from an earlier window)',
      async (input) => ({
        ...page200,
        proof: await sign(PROBE_ROW, input.path, page200, page200.bytes, 'c'.repeat(48))
      })
    ],
    [
      'the proof of another path',
      async () => ({
        ...page200,
        proof: await sign(PROBE_ROW, '/other', page200, page200.bytes)
      })
    ],
    ['a status that is not one', async (input) => ({ ...(await pageOf(PROBE_ROW)(input)), status: 'ok' })],
    ['nothing', async () => undefined]
  ])
    assert.deepEqual(
      await pageCase(page),
      { status: 'failed', error: what === 'nothing' ? 'CONNECT_FAILED' : 'PAGE_NOT_SITE' },
      what
    )
  for (const error of ['TIMEOUT', 'TLS_INVALID', 'CONNECT_FAILED'])
    assert.deepEqual(await pageCase(async () => ({ error })), { status: 'failed', error })
  assert.deepEqual(
    await pageCase(async () => {
      throw new Error('socket hang up')
    }),
    { status: 'failed', error: 'CONNECT_FAILED' }
  )
  assert.equal(probing.closed, 1, 'shut after a failure too')
  // The row is no longer this attempt's (removed, handed to a newer attempt): the window does not
  // open, the page is never asked, and nothing connects. A window that cannot be shut fails nothing.
  dialled.length = 0
  assert.deepEqual(await pageCase(pageOf(PROBE_ROW), { page: pageWindow({ refuse: true }) }), {
    status: 'failed',
    error: 'NO_ATTEMPT'
  })
  assert.deepEqual(
    dialled.map((d) => d.kind),
    ['route']
  )
  const stuck = pageWindow()
  stuck.close = async () => {
    throw new Error('database gone')
  }
  assert.deepEqual(await pageCase(pageOf(PROBE_ROW), { page: stuck }), { status: 'ok' })
  assert.deepEqual(
    await probeDomainWith(PROBE_ROW, { resolver, request: answering(route) }),
    { status: 'failed', error: 'NO_ATTEMPT' },
    'no window at all: the page cannot be proven'
  )
  // `servedPage` is the one rule, here and for a removal's check of the Tracy address.
  assert.equal(servedPage({ status: 200, contentType: 'TEXT/HTML; charset=UTF-8', body: HOME }), true)
  assert.equal(servedPage({ status: 200, contentType: 'text/html', body: null }), false)
  assert.equal(servedPage({ status: 304, contentType: 'text/html', body: HOME }), false)
  // `readWhole` is the one way a fetched body is read for it: all of it, or an error — never a prefix.
  const stream = (make) => new ReadableStream(make)
  assert.deepEqual(await readWhole(null), { bytes: Buffer.alloc(0) })
  assert.equal((await readWhole(new Response(HOME).body)).bytes.toString(), HOME)
  assert.deepEqual(
    await readWhole(
      stream({
        start: (controller) => controller.enqueue(Buffer.from('<html>')),
        pull: (controller) => controller.error(new Error('ECONNRESET'))
      })
    ),
    { error: 'PAGE_INCOMPLETE' }
  )
  assert.deepEqual(
    await readWhole(stream({ start: (controller) => controller.enqueue(Buffer.from('<html>')) }), { ms: 60 }),
    { error: 'PAGE_INCOMPLETE' },
    'a body that stalls'
  )
  assert.deepEqual(
    await readWhole(stream({ pull: (controller) => controller.enqueue(Buffer.alloc(4096)) }), {
      max: 10_000
    }),
    { error: 'PAGE_TOO_LARGE' },
    'a body that never ends'
  )
  assert.equal(
    (await readWhole(new Response(Buffer.alloc(10_000)).body, { max: 10_000 })).bytes.length,
    10_000
  )
  assert.ok(PAGE_BYTES_MAX >= 5 * 1024 * 1024)
  // A trailing newline is the answer of a server that writes lines.
  assert.equal(
    (
      await probeDomain(PROBE_ROW, {
        resolver,
        request: answering(async (i) => `${await proofWith(PROBE_ROW)(i)}\n`)
      })
    ).status,
    'ok'
  )
  for (const [what, make] of [
    ['an echo of the challenge', (input) => input.challenge],
    ['the proof of an older attempt', proofWith({ ...PROBE_ROW, secret: 'o'.repeat(64) })],
    ["another site's proof", proofWith({ ...PROBE_ROW, siteKey: 'other.localhost' })],
    ["another name's proof", proofWith({ ...PROBE_ROW, name: 'other.example.com' })],
    [
      'the proof of another challenge',
      () => probeProof(PROBE_ROW.secret, { ...PROBE_ROW, challenge: 'c'.repeat(48) })
    ],
    ['a page', () => '<html>parked</html>'],
    ['the proof with more after it', async (i) => `${await proofWith(PROBE_ROW)(i)}x`]
  ])
    assert.deepEqual(
      await probeDomain(PROBE_ROW, { resolver, request: answering(make) }),
      { status: 'failed', error: 'WRONG_ANSWER' },
      what
    )
  for (const body of ['', '  \n', null, undefined])
    assert.deepEqual(
      await probeDomain(PROBE_ROW, { resolver, request: async () => ({ status: 200, body }) }),
      {
        status: 'failed',
        error: 'EMPTY'
      }
    )
  for (const error of ['REDIRECT', 'HTTP_STATUS', 'TOO_LARGE', 'TIMEOUT', 'TLS_INVALID', 'CONNECT_FAILED'])
    assert.deepEqual(await probeDomain(PROBE_ROW, { resolver, request: async () => ({ error }) }), {
      status: 'failed',
      error
    })
  assert.deepEqual(
    await probeDomain(PROBE_ROW, {
      resolver,
      request: async () => {
        throw new Error('socket hang up')
      }
    }),
    { status: 'failed', error: 'CONNECT_FAILED' }
  )
  // No attempt in hand: nothing is resolved and nothing dialled.
  const idle = probeResolver()
  for (const secret of [null, undefined, '', 7])
    assert.deepEqual(
      await probeDomain({ ...PROBE_ROW, secret }, { resolver: idle, request: () => assert.fail('dialled') }),
      { status: 'failed', error: 'NO_ATTEMPT' }
    )
  assert.deepEqual(idle.asked, [])
})

test('#1037 probe: a name that does not resolve, or resolves to an address nothing public is at, is never dialled — every family, mixed answers and malformed ones', async () => {
  const never = () => assert.fail('dialled')
  for (const [what, resolver, error] of [
    ['no such name', probeResolver({ v4: fail('ENOTFOUND'), v6: fail('ENOTFOUND') }), 'DNS_NXDOMAIN'],
    ['no address records', probeResolver({ v4: fail('ENODATA'), v6: fail('ENODATA') }), 'DNS_NO_ADDRESS'],
    ['empty answers', probeResolver({ v4: [], v6: [] }), 'DNS_NO_ADDRESS'],
    ['the resolver times out', probeResolver({ v4: fail('ETIMEOUT'), v6: fail('ETIMEOUT') }), 'DNS_TIMEOUT'],
    ['the resolver fails', probeResolver({ v4: fail('ESERVFAIL'), v6: fail('ESERVFAIL') }), 'DNS_FAILED'],
    [
      'the resolver never answers',
      probeResolver({ v4: () => new Promise(() => {}), v6: () => new Promise(() => {}) }),
      'DNS_TIMEOUT'
    ],
    ['an answer that is not a list', probeResolver({ v4: 'x', v6: null }), 'DNS_NO_ADDRESS'],
    ['a list of things that are not addresses', probeResolver({ v4: [7, null, {}] }), 'DNS_NO_ADDRESS'],
    ['text that is not an address', probeResolver({ v4: ['not-an-ip'] }), 'ADDRESS_NOT_PUBLIC'],
    ['a resolver without the questions', { resolve4: undefined, resolve6: undefined }, 'DNS_FAILED']
  ])
    assert.deepEqual(
      await probeDomain(PROBE_ROW, { resolver, request: never, dnsAskMs: 60 }),
      { status: 'failed', error },
      what
    )
  const notPublic = [
    '127.0.0.1',
    '127.8.8.8',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255'
  ]
  for (const address of notPublic) {
    assert.equal(publicAddress(address), false, address)
    assert.deepEqual(
      await probeDomain(PROBE_ROW, { resolver: probeResolver({ v4: [address] }), request: never }),
      { status: 'failed', error: 'ADDRESS_NOT_PUBLIC' },
      address
    )
  }
  for (const address of [
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:10.0.0.1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    // The same IPv4 addresses with the tail spelt in hex, in full, and in upper case (review of
    // #1037: only the dotted spelling was recognised, so `::ffff:7f00:1` was dialled as public).
    '::ffff:7f00:1',
    '::FFFF:7F00:1',
    '0:0:0:0:0:ffff:7f00:1',
    '0000:0000:0000:0000:0000:ffff:0a00:0001',
    '::ffff:a9fe:a9fe',
    '::ffff:c0a8:101',
    // IPv4-translated (SIIT), IPv4-compatible, 6to4, NAT64 (both prefixes) and Teredo.
    '::ffff:0:7f00:1',
    '::ffff:0:10.0.0.1',
    '::7f00:1',
    '::10.0.0.1',
    '2002:7f00:1::',
    '2002:a00:1::1',
    '2002:c0a8:101:1::1',
    '64:ff9b::7f00:1',
    '64:ff9b::1.1.1.1',
    '64:ff9b:1::a00:1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    'fec0::1',
    'fe80::1%eth0'
  ]) {
    assert.equal(publicAddress(address), false, address)
    assert.deepEqual(
      await probeDomain(PROBE_ROW, {
        resolver: probeResolver({ v4: fail('ENODATA'), v6: [address] }),
        request: never
      }),
      { status: 'failed', error: 'ADDRESS_NOT_PUBLIC' },
      address
    )
  }
  // One private address among public ones is enough: the answer says nothing sure about visitors.
  assert.deepEqual(
    await probeDomain(PROBE_ROW, {
      resolver: probeResolver({ v4: [PUBLIC_V4, '10.0.0.5'] }),
      request: never
    }),
    { status: 'failed', error: 'ADDRESS_NOT_PUBLIC' }
  )
  assert.deepEqual(
    await probeDomain(PROBE_ROW, {
      resolver: probeResolver({ v4: [PUBLIC_V4], v6: ['::1'] }),
      request: never
    }),
    { status: 'failed', error: 'ADDRESS_NOT_PUBLIC' }
  )
  for (const address of [
    PUBLIC_V4,
    '1.1.1.1',
    '172.32.0.1',
    '2606:4700:4700::1111',
    '2606:4700:4700:0:0:0:0:1111',
    '::ffff:1.1.1.1',
    '::ffff:101:101',
    '2002:101:101::1'
  ])
    assert.equal(publicAddress(address), true, address)
  for (const junk of ['', 'example.com', '1.2.3', null, undefined, 7])
    assert.equal(publicAddress(junk), false)
  // A local stand says so explicitly, and names its port; the dial then goes to the checked address.
  const dialled = []
  await probeDomain(PROBE_ROW, {
    resolver: probeResolver({ v4: ['172.20.0.9'] }),
    options: { allowPrivate: true, port: 8443 },
    request: async (input) => {
      dialled.push(input)
      return { error: 'HTTP_STATUS' }
    }
  })
  assert.deepEqual(
    dialled.map(({ address, port, family }) => ({ address, port, family })),
    [{ address: '172.20.0.9', port: 8443, family: 4 }]
  )
})

// The real dial (`requestOnce`), against a TLS server this test owns on loopback: what a certificate
// nobody vouches for, a redirect, a status, an oversized or silent answer each read as — and that
// the socket goes to the address that was CHECKED, whatever the name would resolve to.
test("#1037 probe, over a real TLS socket: only a valid certificate and this row's proof connect; every other answer has its own reason", async (t) => {
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
  const { createServer } = await import('node:https')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'own-domain-probe-'))
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '2',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
        '-subj',
        `/CN=${DOMAIN}`,
        '-addext',
        `subjectAltName=DNS:${DOMAIN}`
      ],
      { stdio: 'ignore' }
    )
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    if (process.env.CI) throw error
    return t.skip('openssl is not available on this machine')
  }
  const cert = readFileSync(join(dir, 'cert.pem'), 'utf8')
  let behave = 'proof'
  const seen = []
  const pageRequests = []
  const { gzipSync, brotliCompressSync } = await import('node:zlib')
  const server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert }, async (req, res) => {
    seen.push({ host: req.headers.host, path: req.url, cookie: req.headers.cookie ?? null })
    const challenge = req.headers['x-tracy-domain-probe']
    if (behave === 'redirect') return res.writeHead(301, { location: 'https://elsewhere.example/' }).end()
    if (behave === 'status') return res.writeHead(404).end('no')
    if (behave === 'large') return res.writeHead(200).end('x'.repeat(5000))
    if (behave === 'empty') return res.writeHead(200).end()
    if (behave === 'echo') return res.writeHead(200).end(challenge)
    if (behave === 'silent') return undefined
    if (req.url !== '/__tracy/domain-probe') {
      // The proxy's part: the window on the row says which page is being asked, and what is sent —
      // status, type, Location, the digest of the whole body — is signed with its nonce. The
      // request itself carries nothing of the probe.
      pageRequests.push(req.headers)
      const type = 'text/html; charset=utf-8'
      const signed = async (status, bytes, location = null) => ({
        'x-tracy-domain-probe-page': await pageProof(PROBE_ROW.secret, {
          ...PROBE_ROW,
          nonce: probing.current?.nonce,
          path: req.url,
          status,
          contentType: type,
          location,
          digest: bodyDigest(bytes)
        }),
        'content-type': type,
        ...(location ? { location } : {})
      })
      const home = Buffer.from(HOME)
      const long = Buffer.from(`${HOME}${'x'.repeat(200_000)}`)
      const none = Buffer.alloc(0)
      if (behave === 'other-pages')
        return res.writeHead(200, { 'content-type': 'text/html' }).end('<html>somebody else</html>')
      // The genuine header of this very probe, beside a body of the server's own.
      if (behave === 'swap')
        return res.writeHead(200, await signed(200, home)).end('<html><body>mine</body></html>')
      if (behave === 'site-down') return res.writeHead(502, await signed(502, home)).end(home)
      if (behave === 'hop' && req.url === '/')
        return res.writeHead(302, await signed(302, none, '/en/')).end()
      if (behave === 'no-content') return res.writeHead(204, await signed(204, none)).end()
      if (behave === 'blank') return res.writeHead(200, await signed(200, none)).end()
      if (behave === 'gzip')
        return res
          .writeHead(200, { ...(await signed(200, long)), 'content-encoding': 'gzip' })
          .end(gzipSync(long))
      if (behave === 'brotli')
        return res
          .writeHead(200, { ...(await signed(200, long)), 'content-encoding': 'br' })
          .end(brotliCompressSync(long))
      // Packed, and the packing breaks off or is not what it says: not a body that was read.
      if (behave === 'gzip-cut') {
        const packed = gzipSync(long)
        return res
          .writeHead(200, { ...(await signed(200, long)), 'content-encoding': 'gzip' })
          .end(packed.subarray(0, packed.length - 12))
      }
      if (behave === 'gzip-garbage')
        return res.writeHead(200, { ...(await signed(200, home)), 'content-encoding': 'gzip' }).end(home)
      if (behave === 'unknown-coding')
        return res.writeHead(200, { ...(await signed(200, home)), 'content-encoding': 'zstd' }).end(home)
      // The document begins, and then: the socket is cut (announced length, and chunked), the
      // answer stalls, or it never ends.
      if (behave === 'cut-length') {
        res.writeHead(200, { ...(await signed(200, home)), 'content-length': String(home.length + 500) })
        res.write(home)
        return setTimeout(() => req.socket.destroy(), 30)
      }
      if (behave === 'cut-chunked') {
        res.writeHead(200, await signed(200, home))
        res.write(home)
        return setTimeout(() => req.socket.destroy(), 30)
      }
      if (behave === 'stall') {
        res.writeHead(200, await signed(200, home))
        return res.write(home)
      }
      if (behave === 'huge') {
        res.writeHead(200, await signed(200, home))
        res.write(home)
        const more = setInterval(() => res.write('x'.repeat(262_144)), 2)
        return res.on('close', () => clearInterval(more))
      }
      return res.writeHead(200, await signed(200, home)).end(home)
    }
    res.writeHead(200).end(await probeProof(PROBE_ROW.secret, { ...PROBE_ROW, challenge }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  // DNS says a PUBLIC address; the stand-in resolver below is what a local stand's override reaches.
  const local = probeResolver({ v4: ['127.0.0.1'] })
  const ask = (options, deps = {}) =>
    probeDomain(PROBE_ROW, { resolver: local, options: { port, ...options }, ...deps })
  try {
    // Loopback is refused before any dial unless a stand says so.
    assert.deepEqual(await ask({ ca: cert }), { status: 'failed', error: 'ADDRESS_NOT_PUBLIC' })
    assert.equal(seen.length, 0)
    // A certificate no authority vouches for is not a domain that opens the site.
    assert.deepEqual(await ask({ allowPrivate: true }), { status: 'failed', error: 'TLS_INVALID' })
    assert.equal(seen.length, 0, 'nothing is sent over a connection that was not verified')
    // Vouched for: the row's proof connects, and the request carried the name, the path, no cookie.
    assert.deepEqual(await ask({ allowPrivate: true, ca: cert }), { status: 'ok' })
    assert.deepEqual(seen, [
      { host: `${DOMAIN}:${port}`, path: '/__tracy/domain-probe', cookie: null },
      { host: `${DOMAIN}:${port}`, path: '/', cookie: null }
    ])
    for (const [how, error] of [
      ['redirect', 'REDIRECT'],
      ['status', 'HTTP_STATUS'],
      ['large', 'TOO_LARGE'],
      ['empty', 'EMPTY'],
      ['echo', 'WRONG_ANSWER'],
      // The route proof is right in both; what answers `/` is not the site.
      ['site-down', 'SITE_NOT_ANSWERING'],
      ['other-pages', 'PAGE_NOT_SITE'],
      // The site answered, with no page in it.
      ['no-content', 'PAGE_EMPTY'],
      ['blank', 'PAGE_EMPTY'],
      // 🔒 The genuine proof beside another body, and every way an answer that BEGINS like the page
      // fails to be one (review of #1037: each of these read "connected").
      ['swap', 'PAGE_NOT_SITE'],
      ['cut-length', 'PAGE_INCOMPLETE'],
      ['cut-chunked', 'PAGE_INCOMPLETE'],
      ['stall', 'PAGE_INCOMPLETE'],
      ['gzip-cut', 'PAGE_INCOMPLETE'],
      ['gzip-garbage', 'PAGE_INCOMPLETE'],
      ['unknown-coding', 'PAGE_INCOMPLETE'],
      ['huge', 'PAGE_TOO_LARGE']
    ]) {
      behave = how
      const started = Date.now()
      assert.deepEqual(
        await ask({ allowPrivate: true, ca: cert }, { pageMs: how === 'huge' ? 20_000 : 700 }),
        { status: 'failed', error },
        how
      )
      assert.ok(Date.now() - started < 15_000, `${how}: decided, not waited out`)
    }
    // A page behind a redirect on the name, and a packed one (read whole, hashed unpacked).
    for (const how of ['hop', 'gzip', 'brotli']) {
      behave = how
      assert.deepEqual(await ask({ allowPrivate: true, ca: cert }), { status: 'ok' }, how)
    }
    // 🔒 The page request is an ordinary one: no header of it names the probe or this attempt.
    assert.ok(pageRequests.length > 0)
    for (const headers of pageRequests) {
      assert.deepEqual(
        Object.keys(headers).filter(
          (name) => name.startsWith('x-') || name === 'cookie' || name === 'authorization'
        ),
        []
      )
      assert.match(headers.accept, /text\/html/)
      assert.doesNotMatch(headers['user-agent'], /probe/i)
    }
    // A certificate for another name is not this name's.
    behave = 'proof'
    assert.deepEqual(
      await probeDomain(
        { ...PROBE_ROW, name: 'other.example.com' },
        { resolver: local, options: { port, allowPrivate: true, ca: cert } }
      ),
      { status: 'failed', error: 'TLS_INVALID' }
    )
    // Nothing listening: a connection that fails, said as that.
    server.close()
    server.closeAllConnections()
    assert.deepEqual(await ask({ allowPrivate: true, ca: cert }), {
      status: 'failed',
      error: 'CONNECT_FAILED'
    })
  } finally {
    server.close()
    server.closeAllConnections?.()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('#1037 the zone names for own domains are no Tracy address a site can be renamed to', opts, async () => {
  const { pool } = db
  await pool.query(
    "insert into site(site_key,label,host,platform,address,attached) values('original.localhost','original','local','wordpress','http://original.localhost:8080/',true)"
  )
  const app = new Hono()
  mountSiteAddress(app, {
    pool,
    config: {
      origin: 'http://tracy.test:8080',
      siteDomain: 'localhost',
      siteAddressPrefix: '',
      ownDomainLabels: { connect: 'connect', origin: 'origin-dev' }
    },
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    run: async () => assert.fail('nothing is applied'),
    probe: async () => true
  })
  for (const name of ['connect.localhost', 'origin-dev.localhost']) {
    const res = await app.request('/api/sites/original.localhost/address', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, kind: 'managed' })
    })
    assert.equal(res.status, 400, name)
    assert.equal((await res.json()).code, 'INVALID_SITE_KEY', name)
  }
})

test(
  'a Tracy name a shard holds or uses is NAME_TAKEN here, before anything is reserved or applied',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into site(site_key,label,host,platform,address,attached) values('original.localhost','original','local','wordpress','http://original.localhost:8080/',true)"
    )
    const asked = []
    const app = new Hono()
    mountSiteAddress(app, {
      pool,
      config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost', siteAddressPrefix: '' },
      requireGrant: async () => ({ grant: { role: 'owner' } }),
      run: async () => assert.fail('nothing is applied'),
      probe: async () => true,
      holdLabel: async (label, siteKey) => {
        asked.push([label, siteKey])
        return { ok: false, reason: 'in_use', shard: 's1' }
      }
    })
    const res = await app.request('/api/sites/original.localhost/address', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'heldbyshard.localhost' })
    })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), { code: 'NAME_TAKEN' })
    assert.deepEqual(asked, [['heldbyshard', 'original.localhost']])
    assert.equal(
      (await pool.query("select 1 from site_name where name = 'heldbyshard.localhost'")).rowCount,
      0
    )
  }
)
