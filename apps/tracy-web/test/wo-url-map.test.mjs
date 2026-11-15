// The old URL → new page map of a demo (`opportunities-build/demo-pages.js`, `website-opportunities/src/url-map-view.js`):
// the demo's own page list read through its Apply door and kept on the build, the map answered by
// `GET …/builds/:buildId/url-map` and in the handover's answer, and its outreach line beside the drafts. Real Postgres;
// the Apply, Team and address doors are answered by a stand-in that records what the builder asked, so nothing leaves.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { createDemoBuilt } from '../src/opportunities-build/demo-preview.js'
import {
  DEMO_PAGES_MAX,
  demoPagesSnapshot,
  readDemoPages,
  saveDemoPages
} from '../src/opportunities-build/demo-pages.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'http://tracy.test:8080'
const BASE = '/api/website-opportunities'
const SELLER = 'seller@tracy.test'
const OTHER = 'someone@tracy.test'
const OWNER = 'owner@pho-ba.example'
let seq = 0
const AT = Date.parse('2026-11-15T08:00:00.000Z')
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

/** A `content.read {view: "pages"}` answer of the demo, as the Apply door gives it (`sites/content-pages.js`). */
const pagesDoc = (rows, site = {}) => ({
  schemaVersion: 'tracy-content-pages/v1',
  site: { url: 'http://pho-ba-demo.localhost:8080/', ...site },
  pages: rows.map((r, i) => ({
    id: `content_${i}`,
    type: 'page',
    url: `http://pho-ba-demo.localhost:8080${r.path}`,
    locale: 'en-GB',
    status: 'published',
    ...r
  })),
  truncated: false,
  version: 'cv1.abc'
})
const DEMO_ROWS = [
  { path: '/', title: 'Home' },
  { path: '/menu', title: 'Menu' },
  { path: '/contact', title: 'Contact' },
  { path: '/gallery', title: 'Gallery' }
]
/** The business's current website as research read it (the website source row's `collected.pages`). */
const OLD_PAGES = [
  {
    url: 'https://www.phoba.example/',
    title: 'Pho Ba | Pho in Hanoi',
    text: 'x',
    description: 'Pho since 1990.'
  },
  { url: 'https://www.phoba.example/our-menu', title: 'Our Menu | Pho Ba', text: 'x', description: 'Bowls.' },
  { url: 'https://www.phoba.example/contact-us', title: 'Contact Us | Pho Ba', text: 'x' },
  { url: 'https://www.phoba.example/tet-2024', title: 'Tet 2024 | Pho Ba', text: 'x' },
  { url: 'https://www.phoba.example/our-menu?utm_source=fb', title: 'Our Menu | Pho Ba', text: 'x' },
  { url: 'https://www.phoba.example/wp-login.php', title: 'Log in', text: 'x' }
]

test('the demo list keeps published pages of its own host and default language, one per path, bounded', () => {
  const snap = demoPagesSnapshot(
    pagesDoc(
      [
        ...DEMO_ROWS,
        { path: '/draft', title: 'Draft', status: 'draft' },
        { path: '/vi/thuc-don', title: 'Menu', locale: 'vi-VN' },
        { path: '/elsewhere', title: 'Partner', url: 'https://partner.example/x' },
        { path: '/menu', title: 'Menu again' },
        { path: '/blog/post', title: 'Post', type: 'article', status: null },
        { path: 'no-slash', title: 'Bad' }
      ],
      { locales: ['en-GB', 'vi-VN'], defaultLocale: 'en-GB' }
    ),
    AT
  )
  assert.equal(snap.readAt, '2026-11-15T08:00:00.000Z')
  assert.equal(snap.truncated, false)
  assert.deepEqual(snap.pages, [
    { path: '/', title: 'Home', type: 'page' },
    { path: '/menu', title: 'Menu', type: 'page' },
    { path: '/contact', title: 'Contact', type: 'page' },
    { path: '/gallery', title: 'Gallery', type: 'page' },
    { path: '/blog/post', title: 'Post', type: 'article' }
  ])
  const many = demoPagesSnapshot(
    pagesDoc(Array.from({ length: DEMO_PAGES_MAX + 5 }, (_, i) => ({ path: `/p${i}`, title: `P${i}` }))),
    AT
  )
  assert.equal(many.pages.length, DEMO_PAGES_MAX)
  assert.equal(many.truncated, true, 'a list cut short says so')
  assert.deepEqual(demoPagesSnapshot({ pages: [] }, AT), {
    readAt: '2026-11-15T08:00:00.000Z',
    reason: 'UNREADABLE'
  })
})

test('one read of the demo pages: the list, the door’s refusal code, a timeout or a throw, never thrown', async () => {
  const now = () => AT
  const asked = []
  const listed = await readDemoPages(
    async (call) => {
      asked.push(call)
      return pagesDoc(DEMO_ROWS)
    },
    { now }
  )
  assert.deepEqual(asked, [{ action: 'content.read', params: { view: 'pages' } }])
  assert.equal(listed.pages.length, 4)
  assert.equal(
    (await readDemoPages(async () => ({ ok: false, code: 'SEAT_NOT_AUTHORIZED' }), { now })).reason,
    'SEAT_NOT_AUTHORIZED'
  )
  assert.equal(
    (await readDemoPages(async () => ({ error: { code: 'CONTENT_ADAPTER_UNSUPPORTED' } }), { now })).reason,
    'CONTENT_ADAPTER_UNSUPPORTED'
  )
  assert.equal(
    (await readDemoPages(async () => ({ ok: false, code: 'no shape' }), { now })).reason,
    'REFUSED'
  )
  assert.equal((await readDemoPages(() => new Promise(() => {}), { now, timeoutMs: 20 })).reason, 'TIMEOUT')
  assert.equal(
    (
      await readDemoPages(
        async () => {
          throw new Error('socket hang up')
        },
        { now }
      )
    ).reason,
    'UNREACHABLE'
  )
})

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** An opportunity researched in full, with a finished demo whose site check passed, and its build. */
async function researchedDemo(
  pool,
  accountId,
  { built = null, oldPages = OLD_PAGES, status = 'complete' } = {}
) {
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Pho Ba', 'osm', $2, $3) returning *`,
      [
        accountId,
        `node/${randomUUID()}`,
        JSON.stringify({ name: 'Pho Ba', website: 'https://www.phoba.example/' })
      ]
    )
  ).rows[0]
  await pool.query(
    `insert into wo_job (account_id, opportunity_id, kind, request_id, state)
     values ($1, $2, 'research', $3, 'completed')`,
    [accountId, opp.id, `r-${randomUUID()}`]
  )
  await pool.query(
    `insert into wo_source (opportunity_id, source, ref, status, collected)
     values ($1, 'website', 'https://www.phoba.example/', $2, $3::jsonb)`,
    [opp.id, status, JSON.stringify({ pages: oldPages })]
  )
  const rev = await pool.query(
    `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
     values ($1, $2, 1, '{}'::jsonb, '') returning id`,
    [opp.id, accountId]
  )
  const label = `pho-ba-${++seq}`
  const siteKey = `${label}.localhost`
  const buildId = randomUUID()
  const build = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, state, site_key, label, qa, built,
         demo_expires_at, choice, choice_key)
       values ($1, $2, $3, $4, 'done', $5, $8, '{"state":"passed"}'::jsonb, $6::jsonb, $7,
         '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb,
         'fixture') returning id`,
      [
        accountId,
        rev.rows[0].id,
        `b-${randomUUID()}`,
        buildId,
        siteKey,
        built ? JSON.stringify(built) : null,
        new Date(Date.now() + 14 * 86_400_000),
        label
      ]
    )
  ).rows[0]
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state) values ($1, $2, 'h', 'done')`,
    [accountId, buildId]
  )
  await pool.query(`insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'joomla')`, [
    siteKey,
    label
  ])
  return { opp, buildId: build.id, siteKey }
}

/** The app, with the builder's own requests answered by a stand-in for the Apply, Team and address doors. */
async function world() {
  const { pool } = db
  const config = readConfig(env)
  const calls = []
  const state = { pages: pagesDoc(DEMO_ROWS), applyRefusal: null }
  const team = new Map() // siteKey → seats
  const request = async (path, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ path, method, body, headers: init.headers ?? {} })
    const site = /^\/api\/sites\/([^/]+)\/apply$/.exec(path)
    if (site && method === 'POST') {
      if (state.applyRefusal) return Response.json({ code: state.applyRefusal }, { status: 502 })
      return Response.json(state.pages)
    }
    if (path === '/api/team' && method === 'GET')
      return Response.json({
        sites: [...team.keys()].map((siteKey) => ({
          siteKey,
          myRole: 'owner',
          status: 'accepted',
          seats: team.get(siteKey)
        }))
      })
    if (path === '/api/team/invite' && method === 'POST') {
      const [siteKey] = body.siteKeys
      if (!team.has(siteKey)) team.set(siteKey, [])
      team.get(siteKey).push({ id: randomUUID(), email: body.emails[0], role: body.role, status: 'invited' })
      return Response.json({
        results: [{ email: body.emails[0], notified: true, sites: [{ siteKey, outcome: 'invited' }] }]
      })
    }
    return Response.json({ code: 'UNEXPECTED' }, { status: 500 })
  }
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    websiteOpportunitiesRequest: request,
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
  const call = async (email, method, path, body) => {
    const res = await app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    return { status: res.status, body: await res.json() }
  }
  const account = async (email) =>
    (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
  const builtOf = async (id) =>
    (await pool.query('select built from wo_build where id = $1', [id])).rows[0].built
  return { pool, app, calls, state, team, call, account, builtOf }
}

const byPath = (urlMap) => Object.fromEntries(urlMap.pages.map((p) => [p.path, p]))

test(
  'the map door reads the demo’s pages as the caller, keeps them, and maps each old page or says it is unmatched',
  opts,
  async () => {
    const w = await world()
    const seller = await w.account(SELLER)
    const { buildId } = await researchedDemo(w.pool, seller)
    const answer = await w.call(SELLER, 'GET', `${BASE}/builds/${buildId}/url-map`)
    assert.equal(answer.status, 200)
    const map = answer.body.urlMap
    assert.equal(map.state, 'ready')
    assert.equal(map.version, 'old-url-map/1')
    // Asked through the demo's own Apply door, as the caller (their cookie and this deployment's Origin).
    const read = w.calls.find((c) => c.path.endsWith('/apply'))
    assert.deepEqual(read.body, { action: 'content.read', params: { view: 'pages' } })
    assert.match(read.headers.cookie, /^tracy_sess=/)
    assert.equal(read.headers.origin, ORIGIN)
    const pages = byPath(map)
    assert.deepEqual(Object.keys(pages), ['/', '/our-menu', '/contact-us', '/tet-2024'])
    assert.deepEqual([pages['/'].match, pages['/'].to.path], ['home', '/'])
    assert.deepEqual([pages['/our-menu'].match, pages['/our-menu'].to.path], ['same-topic', '/menu'])
    assert.equal(pages['/our-menu'].description, 'Bowls.', 'the old meta description is carried over')
    assert.deepEqual([pages['/contact-us'].match, pages['/contact-us'].to.path], ['same-topic', '/contact'])
    assert.deepEqual([pages['/tet-2024'].match, pages['/tet-2024'].to], ['unmatched', null])
    assert.deepEqual(
      map.skipped.map((s) => s.reason),
      ['duplicate', 'system']
    )
    assert.deepEqual(map.counts, {
      pages: 4,
      matched: 3,
      unmatched: 1,
      skipped: 2,
      byMatch: { home: 1, 'same-slug': 0, 'same-title': 0, 'same-topic': 2 }
    })
    // The list read is kept on the build for the outreach line and for a later read that fails.
    const kept = (await w.builtOf(buildId)).pages
    assert.equal(kept.pages.length, 4)
    assert.equal(map.demo.readAt, kept.readAt)
  }
)

test(
  'a read of the demo that fails answers from the list kept before; with none kept, the map says it was not read',
  opts,
  async () => {
    const w = await world()
    const seller = await w.account(SELLER)
    const kept = {
      readAt: '2026-11-14T10:00:00.000Z',
      truncated: false,
      pages: [
        { path: '/', title: 'Home', type: 'page' },
        { path: '/menu', title: 'Menu', type: 'page' }
      ]
    }
    const { buildId } = await researchedDemo(w.pool, seller, {
      built: { at: '2026-11-14T10:00:00.000Z', pages: kept }
    })
    w.state.applyRefusal = 'CONTENT_ADAPTER_UNSUPPORTED'
    const answer = await w.call(SELLER, 'GET', `${BASE}/builds/${buildId}/url-map`)
    assert.equal(answer.status, 200)
    assert.equal(answer.body.urlMap.state, 'ready')
    assert.equal(answer.body.urlMap.demo.readAt, '2026-11-14T10:00:00.000Z', 'the list kept before, and when')
    assert.deepEqual((await w.builtOf(buildId)).pages, kept, 'a failed read never replaces a kept list')
    assert.equal((await w.builtOf(buildId)).at, '2026-11-14T10:00:00.000Z', 'the rest of `built` stays')

    const fresh = await researchedDemo(w.pool, seller)
    const none = await w.call(SELLER, 'GET', `${BASE}/builds/${fresh.buildId}/url-map`)
    assert.equal(none.body.urlMap.state, 'demo-not-read')
    assert.equal(none.body.urlMap.reason, 'CONTENT_ADAPTER_UNSUPPORTED')
    assert.deepEqual(none.body.urlMap.pages, [])
  }
)

test('only the build’s own account, and only a demo that still has its site', opts, async () => {
  const w = await world()
  const seller = await w.account(SELLER)
  await w.account(OTHER)
  const { buildId } = await researchedDemo(w.pool, seller)
  assert.equal((await w.call(OTHER, 'GET', `${BASE}/builds/${buildId}/url-map`)).status, 404)
  assert.equal((await w.call(SELLER, 'GET', `${BASE}/builds/${randomUUID()}/url-map`)).status, 404)
  await w.pool.query('update wo_build set demo_deleted_at = now() where id = $1', [buildId])
  const gone = await w.call(SELLER, 'GET', `${BASE}/builds/${buildId}/url-map`)
  assert.deepEqual([gone.status, gone.body.code], [409, 'DEMO_DELETED'])
  await w.pool.query('update wo_build set site_key = null where id = $1', [buildId])
  const unbuilt = await w.call(SELLER, 'GET', `${BASE}/builds/${buildId}/url-map`)
  assert.deepEqual([unbuilt.status, unbuilt.body.code], [409, 'NO_DEMO'])
  assert.equal(w.calls.filter((c) => c.path.endsWith('/apply')).length, 0, 'nothing read for a refused call')
})

test('before this card’s research finished, nothing of the old site is mapped', opts, async () => {
  const w = await world()
  const seller = await w.account(SELLER)
  const { opp, buildId } = await researchedDemo(w.pool, seller)
  await w.pool.query("delete from wo_job where opportunity_id = $1 and kind = 'research'", [opp.id])
  const answer = await w.call(SELLER, 'GET', `${BASE}/builds/${buildId}/url-map`)
  assert.equal(answer.body.urlMap.state, 'old-site-not-read')
  assert.deepEqual(answer.body.urlMap.pages, [])
})

test('the handover answers the map beside its steps, read again as the caller', opts, async () => {
  const w = await world()
  const seller = await w.account(SELLER)
  const { buildId, siteKey } = await researchedDemo(w.pool, seller)
  w.team.set(siteKey, [])
  const answer = await w.call(SELLER, 'POST', `${BASE}/builds/${buildId}/handover`, { email: OWNER })
  assert.equal(answer.status, 200)
  assert.equal(answer.body.handover.steps[0].step, 'team_invite')
  assert.equal(answer.body.handover.urlMap.state, 'ready')
  assert.equal(answer.body.handover.urlMap.counts.matched, 3)
  assert.equal(w.calls.filter((c) => c.path.endsWith('/apply')).length, 1)
  // A demo whose pages cannot be read still hands over: the map then says so, the steps are unchanged.
  w.state.applyRefusal = 'SEAT_NOT_AUTHORIZED'
  const other = await researchedDemo(w.pool, seller)
  w.team.set(other.siteKey, [])
  const again = await w.call(SELLER, 'POST', `${BASE}/builds/${other.buildId}/handover`, { email: OWNER })
  assert.equal(again.status, 200)
  assert.equal(again.body.handover.urlMap.state, 'demo-not-read')
})

test(
  'the outreach line counts the old pages that have a match, from the list the build kept; none without one',
  opts,
  async () => {
    const w = await world()
    const seller = await w.account(SELLER)
    const listed = demoPagesSnapshot(pagesDoc(DEMO_ROWS), AT)
    const { opp } = await researchedDemo(w.pool, seller, { built: { pages: listed } })
    const draft = await w.call(SELLER, 'GET', `${BASE}/${opp.id}/outreach`)
    assert.equal(draft.status, 200)
    assert.equal(
      draft.body.outreach.urlMapProof,
      '3 of your 4 current pages have a matching page on the demo, so their old addresses can lead there.'
    )
    assert.equal(w.calls.filter((c) => c.path.endsWith('/apply')).length, 0, 'the draft reads no demo page')
    assert.doesNotMatch(
      draft.body.outreach.message.auto,
      /matching page/,
      'data beside the drafts, not in them'
    )

    // A partial read never names the whole; no kept list, no line.
    const partial = await researchedDemo(w.pool, seller, { built: { pages: listed }, status: 'partial' })
    assert.equal(
      (await w.call(SELLER, 'GET', `${BASE}/${partial.opp.id}/outreach`)).body.outreach.urlMapProof,
      '3 of your current pages have a matching page on the demo, so their old addresses can lead there.'
    )
    const unread = await researchedDemo(w.pool, seller)
    assert.equal(
      (await w.call(SELLER, 'GET', `${BASE}/${unread.opp.id}/outreach`)).body.outreach.urlMapProof,
      null
    )
  }
)

test(
  'a finished build keeps the demo’s page list; a read with no list never replaces one',
  opts,
  async () => {
    const w = await world()
    const seller = await w.account(SELLER)
    const { buildId } = await researchedDemo(w.pool, seller)
    const build = (await w.pool.query('select * from wo_build where id = $1', [buildId])).rows[0]
    const asked = []
    const built = createDemoBuilt({
      pool: w.pool,
      pages: async (b) => {
        asked.push(b.id)
        return readDemoPages(async () => pagesDoc(DEMO_ROWS), { now: () => AT })
      },
      log: { warn: () => {}, info: () => {} }
    })
    await built({ build, acceptedAt: new Date(AT - 600_000), at: AT })
    assert.deepEqual(asked, [buildId])
    const kept = await w.builtOf(buildId)
    assert.equal(kept.minutes, 10, 'the build facts are kept as before')
    assert.equal(kept.pages.pages.length, 4)
    assert.equal(kept.pages.readAt, '2026-11-15T08:00:00.000Z')
    assert.equal(
      await saveDemoPages(w.pool, buildId, { readAt: '2026-11-16T00:00:00.000Z', reason: 'TIMEOUT' }),
      false
    )
    assert.equal((await w.builtOf(buildId)).pages.pages.length, 4)
    const empty = await researchedDemo(w.pool, seller)
    assert.equal(
      await saveDemoPages(w.pool, empty.buildId, { readAt: '2026-11-16T00:00:00.000Z', reason: 'TIMEOUT' }),
      true
    )
    assert.equal((await w.builtOf(empty.buildId)).pages.reason, 'TIMEOUT')
  }
)
