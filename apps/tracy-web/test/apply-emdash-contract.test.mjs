/**
 * The Apply door's `content.contract` and `info` on an EmDash site (`sites/emdash-contract.js`): the release's content map
 * read and written over the site's own MCP tools, which the site's host runs (`POST /_host/emdash-content`) — tracy-web
 * holds no EmDash write token. The same seat check, toolset gate and `site_write` row as on Joomla; a picture the door
 * uploaded is written by the path it was uploaded under.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/apply-emdash-contract.test.mjs
 */
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { EMDASH_INFO } from '../src/sites/emdash-contract.js'
import { DINER_CONTRACT, emdashMcpSite } from './_emdash-mcp-site.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'component-actor-test-key'
}
const SITE = 'harbour.localhost'
const SHA = 'a'.repeat(64)
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64')

/** A host whose `/_host/emdash-content` is the fake site's tools and whose `/_host/emdash-media` places one picture. */
function fakeHost(site) {
  const calls = []
  const fetchImpl = async (input, init) => {
    const url = String(input)
    if (!url.startsWith('http://tracy-host.test/_host/')) throw new Error(`unexpected fetch ${url}`)
    const body = JSON.parse(init.body)
    const where = new URL(url).pathname
    calls.push({ path: where, body })
    const json =
      where === '/_host/emdash-content'
        ? await site.calls(body.calls)
        : where === '/_host/emdash-media'
          ? { ok: true, id: 'MEDIA01', url: '/_emdash/api/media/file/k1.png', deduplicated: true }
          : { code: 'NOT_FOUND' }
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { calls, fetchImpl }
}

async function setup(pool, fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, quickstart_tag, quickstart_version)
     values ($1, 'harbour', 'local', 'emdash', 'fleet_born', 'tracy-diner/emdash-0.x', '0.1.4')`,
    [SITE]
  )
  for (const [email, role] of [
    ['owner@x.y', 'owner'],
    ['viewer@x.y', 'viewer']
  ]) {
    const { rows } = await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [SITE, rows[0].id, role]
    )
  }
  const apply = async (email, body) => {
    const res = await app.fetch(
      new Request(`http://tracy.test/api/sites/${SITE}/apply`, {
        method: 'POST',
        headers: {
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    )
    return { status: res.status, body: await res.json() }
  }
  return { apply }
}

const writes = async (pool) =>
  (await pool.query('select action, outcome from site_write where site_key = $1 order by id', [SITE])).rows

test(
  'an owner inspects and applies the contract on EmDash through the host; the write is one site_write row',
  opts,
  async () => {
    const { pool } = db
    const site = emdashMcpSite()
    const host = fakeHost(site)
    const { apply } = await setup(pool, host.fetchImpl)

    const reading = await apply('owner@x.y', { action: 'content.contract', params: { operation: 'inspect' } })
    assert.equal(reading.status, 200)
    assert.equal(reading.body.ok, true)
    assert.equal(reading.body.contract, DINER_CONTRACT)
    assert.ok(reading.body.slots.some((s) => s.key === 'pages.home.title'))
    assert.deepEqual(new Set(host.calls.map((c) => c.path)), new Set(['/_host/emdash-content']))
    assert.equal(host.calls[0].body.label, 'harbour')
    assert.deepEqual(await writes(pool), [], 'an inspect writes nothing')

    const done = await apply('owner@x.y', {
      action: 'content.contract',
      params: {
        operation: 'apply',
        expected_revision: reading.body.revision,
        apply_id: 'contract-harbour-1',
        request_id: 'r1',
        changes: { 'pages.home.title': 'Harbour Kitchen' },
        evidence: {}
      }
    })
    assert.equal(done.status, 200)
    assert.equal(done.body.ok, true, JSON.stringify(done.body))
    assert.equal(site.entry('pages', 'home').data.title, 'Harbour Kitchen')
    assert.deepEqual(await writes(pool), [{ action: 'content.contract', outcome: 'ok' }])
  }
)

test('info answers what EmDash takes, without asking the host', opts, async () => {
  const { pool } = db
  const host = fakeHost(emdashMcpSite())
  const { apply } = await setup(pool, host.fetchImpl)
  const answer = await apply('owner@x.y', { action: 'info', params: {} })
  assert.equal(answer.status, 200)
  assert.deepEqual(answer.body, { ok: true, info: JSON.parse(JSON.stringify(EMDASH_INFO)) })
  assert.equal(host.calls.length, 0)
})

test(
  'a picture the door uploaded, held already under another name, is written by the path it was uploaded under',
  opts,
  async () => {
    const { pool } = db
    const site = emdashMcpSite({
      media: [{ id: 'MEDIA01', filename: 'item-1.png', storageKey: 'k1.png', mimeType: 'image/png' }]
    })
    const host = fakeHost(site)
    const { apply } = await setup(pool, host.fetchImpl)
    const path = `images/tracy-content/${SHA}.png`
    const up = await apply('owner@x.y', {
      action: 'media.upload',
      params: { apply_id: 'pictures-1', path, content_b64: PNG_B64 }
    })
    assert.equal(up.body.id, 'MEDIA01')
    const { body: reading } = await apply('owner@x.y', {
      action: 'content.contract',
      params: { operation: 'inspect' }
    })
    const done = await apply('owner@x.y', {
      action: 'content.contract',
      params: {
        operation: 'apply',
        expected_revision: reading.revision,
        apply_id: 'contract-harbour-2',
        changes: { 'slideshow.slideshow.items[0].image': path }
      }
    })
    assert.equal(done.body.ok, true, JSON.stringify(done.body))
    assert.equal(site.entry('slideshow', 'slideshow').data.items[0].image.id, 'MEDIA01')
  }
)

test(
  'a viewer inspects but is refused an apply at the toolset gate; the host is never asked to write',
  opts,
  async () => {
    const { pool } = db
    const site = emdashMcpSite()
    const host = fakeHost(site)
    const { apply } = await setup(pool, host.fetchImpl)
    const reading = await apply('viewer@x.y', {
      action: 'content.contract',
      params: { operation: 'inspect' }
    })
    assert.equal(reading.body.ok, true)
    const refused = await apply('viewer@x.y', {
      action: 'content.contract',
      params: {
        operation: 'apply',
        expected_revision: reading.body.revision,
        apply_id: 'x',
        changes: { 'pages.home.title': 'No' }
      }
    })
    assert.equal(refused.status, 403)
    assert.equal(site.entry('pages', 'home').data.title, 'Home')
    assert.ok(site.sent.every((c) => !/update|publish/.test(c.tool)))
  }
)
