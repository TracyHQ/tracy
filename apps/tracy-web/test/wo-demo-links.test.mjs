// A demo's share link (`lib/wo-demo-links.js`, `opportunities-build/demo-link-route.js`) and the seller's outreach
// state (`website-opportunities/src/outreach-state.js`): the outreach hands out `/d/<token>`, each open by a person is
// counted with nothing that names them, bots and the seller's own session are not, and the seller marks the outreach
// sent, replied, won or lost through an owner-only door. Driven through the whole app on a real Postgres; no outbound
// call is made.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { listWoQueue } from '../src/lib/wo-ops.js'
import {
  askedPath,
  automatedOpen,
  DEMO_OPENS_PER_HOUR,
  demoTarget,
  deviceClassOf
} from '../src/lib/wo-demo-links.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const ORIGIN = 'http://tracy.test:8080'
const BASE = '/api/website-opportunities'
const A = 'seller@tracy.test'
const B = 'someone@tracy.test'
const DEMO = 'http://pho-ba-demo.localhost:8080/'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function world() {
  const { pool } = db
  const config = readConfig(env)
  const domain = await websiteOpportunitiesDomain()
  const fetched = []
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesRequest: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    fetchImpl: async (input) => {
      fetched.push(String(input))
      return Response.json({ code: 'NO_NETWORK' }, { status: 500 })
    }
  })
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
  const cookieOf = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const call = async (email, method, path, body, headers = {}) => {
    const sent = { origin: ORIGIN, ...headers }
    if (email) sent.cookie = await cookieOf(email)
    if (body !== undefined) sent['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: sent,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: res.status, body: parsed, headers: res.headers }
  }
  /** Open a share link the way a browser or a program would; answers the raw response. */
  const open = async (path, { ua = IPHONE, method = 'GET', email = null, headers = {} } = {}) =>
    app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(ua ? { 'user-agent': ua } : {}),
          ...(email ? { cookie: await cookieOf(email) } : {}),
          ...headers
        }
      })
    )
  const accountOf = async (email, name = null) =>
    (
      await pool.query(
        `insert into account (email, display_name) values ($1, $2)
         on conflict (email) do update set display_name = excluded.display_name returning id`,
        [email, name]
      )
    ).rows[0].id
  return { pool, config, call, open, accountOf, fetched }
}

/** An opportunity with a finished demo whose site check passed: what the outreach is offered for. */
async function readyDemo(pool, accountId, { name = 'Pho Ba', qa = 'passed' } = {}) {
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, $2, 'osm', $3, $4) returning *`,
      [accountId, name, `node/${randomUUID()}`, JSON.stringify({ name, phone: '+84 24 1234 5678' })]
    )
  ).rows[0]
  const rev = await pool.query(
    `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
     values ($1, $2, 1, '{}'::jsonb, '') returning id`,
    [opp.id, accountId]
  )
  const buildId = randomUUID()
  const build = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, state, site_key, label, qa, choice,
         choice_key)
       values ($1, $2, $3, $4, 'done', 'pho-ba-demo.localhost', 'pho-ba-demo', $5::jsonb,
         '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb,
         'fixture') returning id`,
      [accountId, rev.rows[0].id, `b-${randomUUID()}`, buildId, JSON.stringify({ state: qa })]
    )
  ).rows[0]
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state) values ($1, $2, 'h', 'done')`,
    [accountId, buildId]
  )
  return { opp, buildId: build.id }
}

const tokenOf = (url) => /\/d\/([A-Za-z0-9_-]{32})$/.exec(url)?.[1]

test('the device class and what counts as a person are read from the request alone', () => {
  const h = (values) => new Headers(values)
  assert.equal(deviceClassOf(h({ 'user-agent': IPHONE })), 'phone')
  assert.equal(
    deviceClassOf(h({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36' })),
    'phone'
  )
  assert.equal(deviceClassOf(h({ 'user-agent': 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)' })), 'phone')
  assert.equal(deviceClassOf(h({ 'user-agent': MAC, 'sec-ch-ua-mobile': '?1' })), 'phone')
  assert.equal(deviceClassOf(h({ 'user-agent': MAC })), 'desktop')
  assert.equal(deviceClassOf(h({})), 'desktop')

  const person = (ua, extra = {}, method = 'GET') => !automatedOpen(method, h({ 'user-agent': ua, ...extra }))
  assert.equal(person(IPHONE), true)
  assert.equal(person(MAC), true)
  // In-app browsers of the chat apps a seller sends the link through are people.
  assert.equal(person(`${IPHONE} [FBAN/FBIOS;FBAV/450.0]`), true)
  assert.equal(person(`${IPHONE} Zalo iOS/24.04`), true)
  assert.equal(person('Mozilla/5.0 (Linux; Android 13; CUBOT X30) Mobile Safari/537.36'), true)
  // Link previews, crawlers, scanners, libraries, prefetches and HEAD are not.
  for (const ua of [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    `${MAC} facebookexternalhit/1.1 Facebot Twitterbot/1.0`,
    'WhatsApp/2.23.20.0 A',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0 Safari/537.36',
    'curl/8.4.0',
    'python-requests/2.31',
    ''
  ])
    assert.equal(person(ua), false, ua)
  assert.equal(person(IPHONE, { 'sec-purpose': 'prefetch;prerender' }), false)
  assert.equal(person(IPHONE, { purpose: 'prefetch' }), false)
  assert.equal(person(IPHONE, {}, 'HEAD'), false)

  assert.equal(askedPath(''), '/')
  assert.equal(askedPath('/menu'), '/menu')
  assert.equal(askedPath('//menu//today'), '/menu/today')
  assert.equal(askedPath('/../admin'), '/')
  assert.equal(askedPath('/%2e%2e/admin'), '/')
  assert.equal(askedPath(`/${'x'.repeat(200)}`), '/')
  assert.equal(askedPath('/a"b'), '/')
  assert.equal(demoTarget(DEMO, '/menu', '?lang=vi'), 'http://pho-ba-demo.localhost:8080/menu?lang=vi')
  assert.equal(demoTarget('https://x.example/shop/', '/cart'), 'https://x.example/shop/cart')
  assert.equal(
    demoTarget(DEMO, askedPath('//evil.example/x')),
    'http://pho-ba-demo.localhost:8080/evil.example/x'
  )
  assert.equal(demoTarget('javascript:alert(1)', '/'), null)
})

test(
  'the outreach hands out a share link that sends people to the demo and counts them, never the seller or a bot',
  opts,
  async () => {
    const { pool, call, open, accountOf, fetched } = await world()
    const a = await accountOf(A, 'Lee Nguyen')
    await accountOf(B, 'Somebody')
    const { opp, buildId } = await readyDemo(pool, a)

    const draft = await call(A, 'GET', `${BASE}/${opp.id}/outreach`)
    assert.equal(draft.status, 200)
    const link = draft.body.outreach.url
    const token = tokenOf(link)
    assert.ok(token, link)
    assert.equal(link, `${ORIGIN}/d/${token}`)
    assert.equal(draft.body.outreach.siteUrl, DEMO)
    assert.match(draft.body.outreach.message.auto, new RegExp(`/d/${token}`))
    assert.doesNotMatch(draft.body.outreach.message.auto, /pho-ba-demo\.localhost/)
    // The same link on every read, one live link per build.
    assert.equal((await call(A, 'GET', `${BASE}/${opp.id}/outreach`)).body.outreach.url, link)
    assert.equal(
      (await pool.query('select count(*)::int as n from wo_demo_link where build_id = $1', [buildId])).rows[0]
        .n,
      1
    )
    // Another account reads nothing of it.
    assert.equal((await call(B, 'GET', `${BASE}/${opp.id}/outreach`)).status, 404)
    let detail = await call(A, 'GET', `${BASE}/${opp.id}`)
    assert.equal(detail.body.demo.shareUrl, link)
    assert.deepEqual(detail.body.demo.opens, {
      total: 0,
      phone: 0,
      desktop: 0,
      lastOpenedAt: null,
      firstOpenedAt: null
    })

    // People: a phone, a desktop on a sub page, and another signed-in Tracy person.
    const phone = await open(`/d/${token}`)
    assert.equal(phone.status, 302)
    assert.equal(phone.headers.get('location'), DEMO)
    assert.equal(phone.headers.get('cache-control'), 'no-store')
    assert.equal(phone.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(phone.headers.get('set-cookie'), null, 'no cookie is set')
    const desk = await open(`/d/${token}/menu?lang=vi`, { ua: MAC })
    assert.equal(desk.headers.get('location'), `${DEMO}menu?lang=vi`)
    assert.equal((await open(`/d/${token}`, { ua: MAC, email: B })).status, 302)

    // Not people, or the seller: still sent on, never counted.
    const notCounted = [
      await open(`/d/${token}`, { method: 'HEAD' }),
      await open(`/d/${token}`, { ua: 'facebookexternalhit/1.1' }),
      await open(`/d/${token}`, { ua: 'WhatsApp/2.23.20.0 A' }),
      await open(`/d/${token}`, { ua: 'curl/8.4.0' }),
      await open(`/d/${token}`, { ua: null }),
      await open(`/d/${token}`, { headers: { 'sec-purpose': 'prefetch' } }),
      await open(`/d/${token}`, { email: A })
    ]
    for (const res of notCounted) assert.equal(res.status, 302)

    const rows = (await pool.query('select * from wo_demo_open order by opened_at')).rows
    assert.equal(rows.length, 3)
    // 🔒 Nothing that names the visitor: the table holds exactly these columns.
    assert.deepEqual(Object.keys(rows[0]).sort(), ['device', 'id', 'link_id', 'opened_at', 'path'])
    assert.deepEqual(
      rows.map((r) => [r.path, r.device]),
      [
        ['/', 'phone'],
        ['/menu', 'desktop'],
        ['/', 'desktop']
      ]
    )
    const columns = (
      await pool.query(
        `select column_name from information_schema.columns where table_name = 'wo_demo_open' order by 1`
      )
    ).rows.map((r) => r.column_name)
    assert.deepEqual(columns, ['device', 'id', 'link_id', 'opened_at', 'path'])
    const linkRow = (await pool.query('select * from wo_demo_link where token = $1', [token])).rows[0]
    assert.equal(linkRow.first_opened_at.toISOString(), rows[0].opened_at.toISOString())

    detail = await call(A, 'GET', `${BASE}/${opp.id}`)
    assert.equal(detail.body.demo.opens.total, 3)
    assert.equal(detail.body.demo.opens.phone, 1)
    assert.equal(detail.body.demo.opens.desktop, 2)
    assert.equal(detail.body.demo.opens.lastOpenedAt, rows[2].opened_at.toISOString())
    // The list row reads the same, and so does /ops/wo.
    const listed = (await call(A, 'GET', BASE)).body.opportunities.find((o) => o.id === opp.id)
    assert.equal(listed.demo.opens.total, 3)
    assert.equal(listed.demo.shareUrl, link)
    const ops = (await listWoQueue(pool, readConfig(env))).opportunities.find((o) => o.id === opp.id)
    assert.equal(ops.demoOpens.total, 3)
    assert.equal(ops.demoOpens.phone, 1)
    assert.deepEqual(fetched, [], 'no outbound call')
  }
)

test(
  'an unknown, malformed or stopped link answers 404, a deleted demo 410, and none of them counts',
  opts,
  async () => {
    const { pool, call, open, accountOf } = await world()
    const a = await accountOf(A, 'Lee')
    const { opp, buildId } = await readyDemo(pool, a)
    const token = tokenOf((await call(A, 'GET', `${BASE}/${opp.id}/outreach`)).body.outreach.url)
    assert.equal((await open(`/d/${'x'.repeat(32)}`)).status, 404)
    assert.equal((await open('/d/short')).status, 404)
    assert.equal((await open(`/d/${token}`)).status, 302)

    // Stopping is owner-only; the old token then answers 404 and the next outreach read hands out a new one.
    await accountOf(B)
    assert.equal((await call(B, 'DELETE', `${BASE}/${opp.id}/demo/link`)).status, 404)
    assert.equal((await call(null, 'DELETE', `${BASE}/${opp.id}/demo/link`)).status, 401)
    const stopped = await call(A, 'DELETE', `${BASE}/${opp.id}/demo/link`)
    assert.equal(stopped.status, 200)
    assert.equal(stopped.body.revoked, 1)
    assert.equal((await open(`/d/${token}`)).status, 404)
    const fresh = tokenOf((await call(A, 'GET', `${BASE}/${opp.id}/outreach`)).body.outreach.url)
    assert.ok(fresh && fresh !== token)
    // Opens counted on the stopped link stay with the build.
    assert.equal((await call(A, 'GET', `${BASE}/${opp.id}`)).body.demo.opens.total, 1)

    await pool.query(`update wo_build set state = 'deleted', demo_deleted_at = now() where id = $1`, [
      buildId
    ])
    assert.equal((await open(`/d/${fresh}`)).status, 410)
    assert.equal((await pool.query('select count(*)::int as n from wo_demo_open')).rows[0].n, 1)
  }
)

test('past the hourly cap of one link a person is still sent on, uncounted', opts, async () => {
  const { pool, call, open, accountOf } = await world()
  const a = await accountOf(A, 'Lee')
  const { opp } = await readyDemo(pool, a)
  const token = tokenOf((await call(A, 'GET', `${BASE}/${opp.id}/outreach`)).body.outreach.url)
  const link = (await pool.query('select id from wo_demo_link where token = $1', [token])).rows[0]
  const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  await pool.query('insert into rate_bucket (bucket, window_start, count) values ($1, $2, $3)', [
    `wo-demo-open:${link.id}`,
    hour,
    DEMO_OPENS_PER_HOUR
  ])
  assert.equal((await open(`/d/${token}`)).status, 302)
  assert.equal((await pool.query('select count(*)::int as n from wo_demo_open')).rows[0].n, 0)
})

test('a demo not ready for outreach gets no link, and reads no opens', opts, async () => {
  const { pool, call, accountOf } = await world()
  const a = await accountOf(A, 'Lee')
  const { opp } = await readyDemo(pool, a, { qa: 'pending' })
  assert.equal((await call(A, 'GET', `${BASE}/${opp.id}/outreach`)).status, 409)
  const detail = await call(A, 'GET', `${BASE}/${opp.id}`)
  assert.equal(detail.body.demo.shareUrl, null)
  assert.equal(detail.body.demo.opens, null)
  assert.equal((await pool.query('select count(*)::int as n from wo_demo_link')).rows[0].n, 0)
})

test(
  'the outreach state door marks sent, replied, won or lost for the owner only, with the time of each',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const a = await accountOf(A, 'Lee')
    await accountOf(B)
    const { opp } = await readyDemo(pool, a)
    const path = `${BASE}/${opp.id}/outreach/state`

    // Who may mark it: the owner, signed in, from Tracy's own origin, with a JSON body.
    assert.equal((await call(null, 'PUT', path, { state: 'sent' })).status, 401)
    assert.equal((await call(B, 'PUT', path, { state: 'sent' })).status, 404)
    assert.equal(
      (await call(A, 'PUT', `${BASE}/${randomUUID()}/outreach/state`, { state: 'sent' })).status,
      404
    )
    assert.equal(
      (await call(A, 'PUT', path, { state: 'sent' }, { origin: 'https://evil.example' })).status,
      403
    )
    assert.equal(
      (await call(A, 'PUT', path, { state: 'sent' }, { 'sec-fetch-site': 'same-site' })).status,
      403
    )
    for (const state of ['opened', '', null, 7])
      assert.equal((await call(A, 'PUT', path, { state })).body.code, 'INVALID_OUTREACH_STATE')
    assert.equal(
      (await pool.query('select count(*)::int as n from wo_outreach')).rows[0].n,
      0,
      'nothing written by a refused call'
    )
    assert.equal((await call(A, 'GET', `${BASE}/${opp.id}`)).body.outreachState.state, null)

    const sent = await call(A, 'PUT', path, { state: 'sent' })
    assert.equal(sent.status, 200)
    assert.equal(sent.body.outreachState.state, 'sent')
    assert.ok(sent.body.outreachState.sentAt)
    // Marking it again keeps the first time.
    const again = await call(A, 'PUT', path, { state: 'sent' })
    assert.equal(again.body.outreachState.sentAt, sent.body.outreachState.sentAt)
    const replied = (await call(A, 'PUT', path, { state: 'replied' })).body.outreachState
    assert.equal(replied.state, 'replied')
    assert.equal(replied.sentAt, sent.body.outreachState.sentAt)
    const won = (await call(A, 'PUT', path, { state: 'won' })).body.outreachState
    assert.equal(won.state, 'won')
    assert.ok(won.wonAt)
    const lost = (await call(A, 'PUT', path, { state: 'lost' })).body.outreachState
    assert.deepEqual([lost.state, lost.wonAt, Boolean(lost.lostAt)], ['lost', null, true])

    // Every reader agrees: the detail, the list row and /ops/wo.
    assert.equal((await call(A, 'GET', `${BASE}/${opp.id}`)).body.outreachState.state, 'lost')
    const listed = (await call(A, 'GET', BASE)).body.opportunities.find((o) => o.id === opp.id)
    assert.equal(listed.outreachState.state, 'lost')
    assert.equal(listed.outreachState.repliedAt, replied.repliedAt)
    const ops = (await listWoQueue(pool, readConfig(env))).opportunities.find((o) => o.id === opp.id)
    assert.equal(ops.outreachState.state, 'lost')

    const cleared = (await call(A, 'PUT', path, { state: 'none' })).body.outreachState
    assert.deepEqual(
      [cleared.state, cleared.sentAt, cleared.repliedAt, cleared.wonAt, cleared.lostAt],
      [null, null, null, null, null]
    )
    // The row goes with its opportunity.
    await pool.query('delete from wo_opportunity where id = $1', [opp.id])
    assert.equal((await pool.query('select count(*)::int as n from wo_outreach')).rows[0].n, 0)
  }
)
