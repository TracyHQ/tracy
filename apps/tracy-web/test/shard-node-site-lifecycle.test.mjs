import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { verifyShardRequest } from '../src/lib/shard-channel.js'
import { mintSession } from '../src/lib/session.js'
import { mountSiteAddress } from '../src/sites/address.js'
import { dnsLabelOf } from '../src/sites/dns-label.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { answerTeardown } from './_host-teardown.mjs'
import { fakeCloudflare } from './_fake-cloudflare.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test('dnsLabelOf: the first label of a Tracy address, the fallback for anything else', () => {
  assert.equal(dnsLabelOf('shop.tracy.ai', 'tracy.ai', 'x'), 'shop')
  assert.equal(
    dnsLabelOf('fijitrips.example', 'tracy.ai', 'fijitrips-example-0871462c'),
    'fijitrips-example-0871462c'
  )
  assert.equal(dnsLabelOf('tracy.ai', 'tracy.ai', 'x'), 'x')
})

function renameDoor(reserveName, onRenamed = async () => {}) {
  const jobs = []
  const app = new Hono()
  mountSiteAddress(app, {
    pool: db.pool,
    customHostnames: fakeCloudflare().client,
    config: { origin: 'http://tracy.test:8080', siteDomain: 'localhost', siteAddressPrefix: '' },
    requireGrant: async () => ({ grant: { role: 'owner' }, email: 'owner@test.example' }),
    run: async (site, input) => {
      jobs.push(input)
      return { ok: true }
    },
    probe: async () => true,
    reserveName,
    onRenamed
  })
  const rename = (name) =>
    app.request('/api/sites/original.localhost/address', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, kind: 'managed' })
    })
  return { jobs, rename }
}
const original = () =>
  db.pool.query(
    "insert into site(site_key,label,host,platform,address,attached) values('original.localhost','original','s2','wordpress','http://original.localhost:8080/',true)"
  )

test(
  'renaming on a shard asks the master for the new name first; taken is NAME_TAKEN and the host is never asked',
  opts,
  async () => {
    await original()
    const asked = []
    const door = renameDoor(async (input) => {
      asked.push({ siteKey: input.site.site_key, name: input.name })
      return { taken: true }
    })
    const res = await door.rename('renamed.localhost')
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, 'NAME_TAKEN')
    assert.deepEqual(asked, [{ siteKey: 'original.localhost', name: 'renamed.localhost' }])
    assert.equal(door.jobs.length, 0)
  }
)

test(
  'the master not answering a rename is 503 and the old name stays; held, the rename goes through',
  opts,
  async () => {
    await original()
    const down = renameDoor(async () => ({ unavailable: true }))
    const refused = await down.rename('renamed.localhost')
    assert.equal(refused.status, 503)
    assert.equal((await refused.json()).code, 'LABEL_REGISTRY_UNAVAILABLE')
    const renamed = []
    const up = renameDoor(
      async () => ({ reserved: true }),
      async (e) => renamed.push([e.from, e.to])
    )
    assert.equal((await up.rename('renamed.localhost')).status, 200)
    assert.deepEqual(renamed, [['original.localhost', 'renamed.localhost']])
  }
)

test('deleting a site on a shard queues site.deleted once its host said it is gone', opts, async () => {
  const SECRET = 'ab'.repeat(32)
  const MASTER = 'http://master.tracy.test:8080'
  const jobs = new Map()
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(String(input))
    if (u.origin === MASTER) {
      const verified = verifyShardRequest({
        secret: SECRET,
        headers: init.headers,
        method: init.method ?? 'POST',
        path: u.pathname,
        body: init.body ?? ''
      })
      return verified.ok
        ? Response.json({ label: 'x' })
        : Response.json({ code: 'SIGNATURE_INVALID', why: verified.why }, { status: 403 })
    }
    const teardown = answerTeardown(input, init)
    if (teardown) return teardown
    if (u.pathname === '/_host/provision') {
      const id = `k-${JSON.parse(init.body).jobKey}`
      jobs.set(id, { state: 'running' })
      return Response.json({ jobId: id })
    }
    if (u.pathname.startsWith('/_host/jobs/'))
      return Response.json(jobs.get(u.pathname.slice(12)) ?? { state: 'unknown' })
    return Response.json({ ok: true })
  }
  const config = readConfig({
    TRACY_ORIGIN: 'http://s2.tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 's2',
    HOST_NAME: 's2',
    HOST_s2_ORIGIN: 'http://tracy-host.test',
    HOST_s2_DSH_ORIGIN: 'http://dsh.test',
    HOST_s2_SECRET: 'h',
    SEAT_s2_SECRET: 'k',
    TRACY_DEPLOYMENT_ROLE: 'shard',
    MASTER_ORIGIN: MASTER,
    SHARD_SECRET: SECRET,
    SESSION_COOKIE_NAME: 'tracy_sess_s2'
  })
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(db.pool, config),
    host: { hostCall, hostJob },
    fetchImpl
  })
  await db.pool.query(
    "insert into quickstart_releases (tag, release, tracy) values ('test/none', '{}', 'no-setting')"
  )
  const { rows } = await db.pool.query("insert into account (email) values ('a@x.y') returning id")
  await db.pool.query(
    "insert into shard_mirror (email, account_id, source, idempotency_key) values ('a@x.y', $1, 'master', 'm-1')",
    [rows[0].id]
  )
  const cookie = `tracy_sess_s2=${await mintSession('a@x.y', config.sessionSecret)}`
  const call = (method, path, body) =>
    app.fetch(
      new Request(`http://s2.tracy.test:8080${path}`, {
        method,
        headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    )
  const created = await (
    await call('POST', '/api/sites', {
      label: 'lantern',
      platform: 'wordpress',
      buildId: '11111111-2222-4333-8444-555555555555'
    })
  ).json()
  jobs.get(created.jobId).state = 'done'
  await call('GET', `/api/sites/${created.siteKey}/jobs/${created.jobId}`)
  const gone = await call('DELETE', `/api/sites/${created.siteKey}`)
  assert.equal(gone.status, 200, await gone.clone().text())
  const events = (await db.pool.query('select kind, data from shard_event_outbox order by created_at')).rows
  assert.deepEqual(
    events.map((e) => e.kind),
    ['site.created', 'site.deleted']
  )
  assert.deepEqual(events[1].data, { siteKey: 'lantern.localhost', label: 'lantern' })
})
