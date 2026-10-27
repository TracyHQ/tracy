// The public REST layer `/v1` (tasks/todo-api-public.md S3/S4/S6): each resource route is a thin
// alias of one Apply action, called through the SAME `applyDoor` the cookie/actor doors use, on the
// api host, with a Bearer seat key and nothing else. Seams under test: the `/v1` HTTP routes through
// `buildApp` against a fake plugin (the answer must equal the door's for the same call), the
// `V1_ROUTES` table as the one source of routes and reference, and the api host's own OpenAPI variant.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { apiRoutes } from '../src/api/route.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { mintKey } from '../src/lib/api-key.js'
import { writeComponent } from '../src/sites/store.js'
import { APPLY_ACTIONS, applyToolsetLabel } from '../src/sites/route.js'
import { V1_ROUTES, recordRevision, v1RefusalStatus } from '../src/lib/v1-routes.js'
import { writeSiteDesign } from '../src/lib/site-design.js'
import { buildOpenApi } from '../src/api-reference/spec.js'
import { ROUTE_DOCS } from '../src/api-reference/routes/index.js'
import { DEMO_ROUTES } from '../src/api-reference/routes/demos.js'
import { ERROR_DOCS } from '../src/api-reference/errors.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const PEPPER = 'p'.repeat(32)

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  API_ORIGIN: 'http://api.test',
  API_KEY_PEPPER: PEPPER,
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const JOOMLA_ENVELOPE = JSON.parse(
  readFileSync(
    new URL('../../../packages/cms/tracy-content-api/test/fixtures/joomla.json', import.meta.url),
    'utf8'
  )
)

/** A fake Claude Cowork plugin: `answer(sent)` decides what it hands back; every call is recorded. */
function fakePlugin(answer) {
  const calls = []
  const fetchImpl = async (_input, init) => {
    const sent = JSON.parse(init.body)
    calls.push(sent)
    const out = typeof answer === 'function' ? answer(sent) : answer
    return Response.json(out)
  }
  return { calls, fetchImpl }
}

function harness(pool, fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  /** A call on the api host: Bearer, no cookie. */
  const v1 = (method, path, key, { body, headers = {} } = {}) =>
    app.fetch(
      new Request(`http://api.test${path}`, {
        method,
        headers: {
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  /**
   * The same action through the old door — the answer `/v1` must equal. On the cowork host with the
   * same person's cookie: `/api/*` is not on the api host's allowlist, and for one person with one
   * role the door's own principal (`seat:<hmac of site, email, role, policy, scope>`) is the same
   * whether a cookie or a key with every scope names them.
   */
  const door = async (email, action, params) =>
    app.fetch(
      new Request('http://tracy.test:8080/api/sites/lantern.localhost/apply', {
        method: 'POST',
        headers: { cookie: await cookieFor(email), 'content-type': 'application/json' },
        body: JSON.stringify({ action, params })
      })
    )
  return { app, config, v1, door, cookieFor }
}

async function accountId(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  return rows[0].id
}

async function seatRow(pool, siteKey, email, role) {
  const id = await accountId(pool, email)
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, id, role]
  )
  return id
}

/** A Joomla site with a paired plugin, an owner and an editor. */
async function pairedSite(pool, siteKey = 'lantern.localhost', label = 'lantern') {
  await pool.query(`insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'joomla')`, [
    siteKey,
    label
  ])
  await seatRow(pool, siteKey, 'owner@x.y', 'owner')
  await seatRow(pool, siteKey, 'editor@x.y', 'editor')
  await writeComponent(
    pool,
    siteKey,
    { endpoint: `https://${label}.example/cowork`, token: 'z'.repeat(20) },
    'owner@x.y'
  )
}

async function keyFor(pool, email, siteKey, scopes = ['content', 'code', 'site', 'lifecycle']) {
  return mintKey({
    pool,
    accountId: await accountId(pool, email),
    siteKey,
    label: 't',
    scopes,
    pepper: PEPPER
  })
}

/** The fake plugin's answer to `content.read`: the Joomla fixture, a page listing, or one record. */
function contentAnswers(sent) {
  if (sent.action !== 'content.read') return { ok: true, echoed: sent.params }
  const p = sent.params
  const site = {
    id: 's',
    name: 'Lantern',
    url: 'https://lantern.example',
    defaultLocale: 'en-GB',
    locales: ['en-GB']
  }
  const row = (id, extra = {}) => ({
    ...JOOMLA_ENVELOPE.contents[0],
    id,
    url: `https://lantern.example/${id}`,
    revision: `rev-${id}`,
    ...extra
  })
  const contents = p.id ? [row(p.id)] : [row('c-home'), row('c-about')]
  return {
    ...JOOMLA_ENVELOPE,
    site,
    snapshot: { revision: p.id ? `snap-${p.id}` : 'snap-list', readAt: '2026-09-28T00:00:00Z' },
    pagination: { limit: 100, nextCursor: null, total: contents.length },
    contents
  }
}

// ── The table ───────────────────────────────────────────────────────────────────────────────────

test('V1_ROUTES: exactly the S3 table — no software, database or aggregate applies routes', () => {
  assert.deepEqual(
    V1_ROUTES.map((r) => `${r.method} ${r.path}`),
    [
      'GET /v1/me',
      'GET /v1/sites/:key',
      'GET /v1/sites/:key/pages',
      'GET /v1/sites/:key/contents',
      'GET /v1/sites/:key/contents/:id',
      'GET /v1/sites/:key/changes',
      'GET /v1/sites/:key/design',
      'GET /v1/sites/:key/records/:kind',
      'GET /v1/sites/:key/records/:kind/:id',
      'PATCH /v1/sites/:key/records/:kind/:id',
      'DELETE /v1/sites/:key/records/:kind/:id',
      'POST /v1/sites/:key/contract/:operation',
      'GET /v1/sites/:key/applies',
      'GET /v1/sites/:key/applies/:id',
      'POST /v1/sites/:key/applies/:id/revert'
    ]
  )
  for (const row of V1_ROUTES) {
    assert.ok(row.summary && row.description, `${row.path}: words`)
    assert.equal(typeof row.writes, 'boolean', `${row.path}: writes`)
    assert.ok([null, 'snapshot', 'version', 'design', 'record'].includes(row.etag), `${row.path}: etag`)
    // A write answers no ETag (sweep #2, 11/10/2026): its answer is not the record, so it cannot name the
    // record's revision; the caller reads the record for it.
    assert.ok(!row.writes || row.etag === null, `${row.path}: a write has no etag`)
    if (row.action)
      assert.ok(APPLY_ACTIONS.includes(row.action), `${row.path}: ${row.action} is a door action`)
  }
})

test('recordRevision (sweep #2): the whole editable record, normalised — not the body alone, not how it was read', () => {
  const rev = 'a'.repeat(64)
  const answer = (item, extra = {}) => ({
    ok: true,
    kind: 'post',
    id: 314,
    key: '',
    item,
    body_revision: rev,
    ...extra
  })
  const base = {
    ID: 314,
    post_title: 'E2EF-W post',
    post_content: '<p>a</p>\n',
    post_status: 'publish',
    comment_count: '0'
  }
  const r = recordRevision(answer(base))
  assert.match(String(r), /^[a-f0-9]{64}$/)
  // Normalised: key order, CRLF, Unicode composition and a number sent as text do not move it.
  const reordered = Object.fromEntries(Object.entries(base).reverse())
  assert.equal(recordRevision(answer(reordered)), r)
  assert.equal(recordRevision(answer({ ...base, post_content: '<p>a</p>\r\n' })), r)
  assert.equal(recordRevision(answer({ ...base, ID: '314' })), r)
  assert.equal(
    recordRevision(answer({ ...base, post_title: 'Cafe\u0301' })),
    recordRevision(answer({ ...base, post_title: 'Caf\u00e9' }))
  )
  // What no write sets does not move it; what a write sets does — the title first (J13.2).
  assert.equal(recordRevision(answer({ ...base, comment_count: '5', filter: 'raw', ancestors: [] })), r)
  for (const field of ['post_title', 'post_content', 'post_excerpt', 'post_status', 'post_name'])
    assert.notEqual(recordRevision(answer({ ...base, [field]: 'changed' })), r, field)
  // The same body revision with a different title is a different record.
  assert.notEqual(recordRevision(answer({ ...base, post_title: 'v2' })), r)
  // No body revision (Joomla, an older plugin, a kind without a body): no tag at all.
  assert.equal(recordRevision(answer(base, { body_revision: undefined })), null)
  assert.equal(recordRevision({ ok: true, kind: 'post', body_revision: rev }), null)
})

test('v1RefusalStatus: the Q9 table — a plugin refusal gets one HTTP status by its error word', () => {
  const status = (error, extra = {}) => v1RefusalStatus({ ok: false, error, ...extra })
  assert.equal(status('bad_params'), 400)
  assert.equal(status('bad_action'), 400)
  assert.equal(status('not_found'), 404)
  assert.equal(status('conflict'), 409)
  assert.equal(status('locked'), 409)
  assert.equal(status('writer_busy'), 409)
  assert.equal(
    status('revision_stale'),
    409,
    'a body that moved since its read is a conflict (WordPress 0.17.0+)'
  )
  assert.equal(status('contract_failed'), 422)
  assert.equal(status('contract_unbound'), 422)
  assert.equal(
    status('contract_failed', { errors: [{ code: 'REVISION_STALE' }] }),
    409,
    'a stale revision is a conflict'
  )
  assert.equal(status('unsupported'), 501)
  assert.equal(status('unavailable'), 501)
  assert.equal(status('update_failed'), 500)
  assert.equal(status('fatal'), 500)
  assert.equal(status('too_large'), 413)
  assert.equal(status('refused'), 403)
  assert.equal(status('something_else'), 400, 'anything the table does not name is a bad request')
})

// ── /v1 over HTTP ───────────────────────────────────────────────────────────────────────────────

test('GET /v1/me answers who the key is, and every /v1 answer names the API version', opts, async () => {
  const { pool } = db
  const { v1 } = harness(pool, fakePlugin({ ok: true }).fetchImpl)
  await pairedSite(pool)
  const key = await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])
  const res = await v1('GET', '/v1/me', key.key)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-tracy-api-version'), 'v1')
  assert.deepEqual(await res.json(), {
    email: 'editor@x.y',
    keyId: key.id,
    siteKey: 'lantern.localhost',
    scopes: ['content']
  })
})

test(
  '/v1: no Bearer → 401 NOT_SIGNED_IN; a cookie alone is nobody; a bad key → 401 KEY_INVALID; another site’s key → 403',
  opts,
  async () => {
    const { pool } = db
    const { v1, cookieFor } = harness(pool, fakePlugin({ ok: true }).fetchImpl)
    await pairedSite(pool)
    await pairedSite(pool, 'moon.localhost', 'moon')
    const none = await v1('GET', '/v1/sites/lantern.localhost/pages', null)
    assert.equal(none.status, 401)
    assert.equal(none.headers.get('x-tracy-api-version'), 'v1')
    assert.deepEqual(await none.json(), { error: { code: 'NOT_SIGNED_IN' } })
    const cookie = await v1('GET', '/v1/me', null, { headers: { cookie: await cookieFor('owner@x.y') } })
    assert.equal(cookie.status, 401)
    assert.equal((await cookie.json()).error.code, 'NOT_SIGNED_IN')
    const bad = await v1('GET', '/v1/me', `trk_${'a'.repeat(16)}.${'A'.repeat(32)}`)
    assert.equal(bad.status, 401)
    assert.equal((await bad.json()).error.code, 'KEY_INVALID')
    const moon = await keyFor(pool, 'owner@x.y', 'moon.localhost')
    const other = await v1('GET', '/v1/sites/lantern.localhost/pages', moon.key)
    assert.equal(other.status, 403)
    assert.equal((await other.json()).error.code, 'SEAT_NOT_AUTHORIZED')
    // A key is read only on the api host: the same routes do not exist on the cowork host.
    const { app } = harness(pool, fakePlugin({ ok: true }).fetchImpl)
    const onCowork = await app.fetch(
      new Request('http://tracy.test:8080/v1/me', { headers: { authorization: `Bearer ${moon.key}` } })
    )
    assert.notEqual(onCowork.status, 200)
  }
)

test('/v1 reads equal the door’s answer for the same action, and carry an ETag', opts, async () => {
  const { pool } = db
  const plugin = fakePlugin(contentAnswers)
  const { v1, door } = harness(pool, plugin.fetchImpl)
  await pairedSite(pool)
  const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key

  const same = async (method, path, action, params, { etag = undefined, body } = {}) => {
    const viaV1 = await v1(method, path, key, body === undefined ? {} : { body })
    const viaDoor = await door('owner@x.y', action, params)
    assert.equal(viaV1.status, 200, `${method} ${path}: ${await viaV1.clone().text()}`)
    assert.equal(viaDoor.status, 200, `door ${action}`)
    const a = await viaV1.json()
    const b = await viaDoor.json()
    assert.deepEqual(a, b, `${method} ${path} = ${action}`)
    assert.equal(viaV1.headers.get('x-tracy-api-version'), 'v1')
    if (etag !== undefined) assert.equal(viaV1.headers.get('etag'), etag, `${path}: ETag`)
    return { a, viaV1 }
  }
  await same('GET', '/v1/sites/lantern.localhost', 'content.read', { describe: true }, { etag: null })
  const pages = await same('GET', '/v1/sites/lantern.localhost/pages?locale=en-GB', 'content.read', {
    view: 'pages',
    locale: 'en-GB'
  })
  assert.equal(pages.viaV1.headers.get('etag'), `W/"${pages.a.version}"`)
  await same(
    'GET',
    '/v1/sites/lantern.localhost/contents?type=page&limit=2&fields=title',
    'content.read',
    { type: 'page', limit: 2, fields: 'title' },
    { etag: 'W/"snap-list"' }
  )
  await same(
    'GET',
    '/v1/sites/lantern.localhost/contents/c-home?fields=title,blocks',
    'content.read',
    { id: 'c-home', fields: 'title,blocks' },
    { etag: 'W/"snap-c-home"' }
  )
  // `since` is recalled in the scope the pages walk was read in — the same `locale` here.
  const changes = await same(
    'GET',
    `/v1/sites/lantern.localhost/changes?since=${pages.a.version}&locale=en-GB`,
    'content.read',
    { changedSince: pages.a.version, locale: 'en-GB' }
  )
  assert.equal(changes.viaV1.headers.get('etag'), `W/"${changes.a.version}"`)
  await same('GET', '/v1/sites/lantern.localhost/records/article?offset=10&limit=5', 'content.list', {
    kind: 'article',
    offset: 10,
    limit: 5
  })
  await same(
    'GET',
    '/v1/sites/lantern.localhost/records/article/42',
    'content.get',
    { kind: 'article', id: 42 },
    { etag: null }
  )
  await same('GET', '/v1/sites/lantern.localhost/records/option/0?key=blogname', 'content.get', {
    kind: 'option',
    id: 0,
    key: 'blogname'
  })
  await same('GET', '/v1/sites/lantern.localhost/applies/contract-1', 'apply.list', {
    apply_id: 'contract-1'
  })
  await same('POST', '/v1/sites/lantern.localhost/applies/contract-1/revert', 'apply.revert', {
    apply_id: 'contract-1'
  })
  // The site key is canonicalised the way `/api/sites/:key` is (case, `www.`).
  const spelled = await v1('GET', '/v1/sites/WWW.Lantern.localhost/records/article/1', key)
  assert.equal(spelled.status, 200)
})

// ── GET /v1/sites/:key/records/:kind?search= (30/09/2026): the title search, and the guard behind it ─────────

test('GET /v1 records: the route reads `search` from the query, drops it when blank, and still drops keys it does not know', () => {
  const row = V1_ROUTES.find((r) => r.method === 'GET' && r.path === '/v1/sites/:key/records/:kind')
  assert.ok(row, 'the records list route')
  const asked = (query) => row.params({ path: { kind: 'article' }, query, headers: {}, keyId: 'k', now: 1 })
  assert.deepEqual(asked({ search: 'roof repair', offset: '10', limit: '5', include_body: '1' }), {
    params: { kind: 'article', offset: 10, limit: 5, search: 'roof repair', include_body: true }
  })
  // A blank one — empty, or only spaces, tabs, newlines — filters nothing and is not sent: an older plugin
  // ignores a `search` it is sent, and the relay would then refuse a request that asked for no filter.
  for (const blank of ['', ' ', '   ', '\t', ' \n '])
    assert.deepEqual(
      asked({ search: blank }),
      { params: { kind: 'article' } },
      `a blank one filters nothing: ${JSON.stringify(blank)}`
    )
  // A text is sent as it came (the plugin trims it), and only `search` is judged this way.
  assert.deepEqual(asked({ search: ' roof ' }), { params: { kind: 'article', search: ' roof ' } })
  assert.deepEqual(asked({ name: ' ' }), { params: { kind: 'article', name: ' ' } })
  assert.deepEqual(
    asked({ query: 'roof', q: 'roof' }),
    { params: { kind: 'article' } },
    'other keys stay dropped'
  )
  // The reference says what it means and from which plugin release it is read.
  assert.match(row.query.search, /title/)
  assert.match(row.query.search, /Joomla plugin 0\.20\.0/)
  assert.match(row.query.search, /WordPress plugin 0\.16\.0/)
  assert.match(row.query.search, /LIST_SEARCH_UNSUPPORTED/)
  // A kind with no title is refused in the word a `/v1` caller reads: the plugin's `bad_params`, upper-cased.
  assert.match(row.query.search, /`400 BAD_PARAMS`/)
  assert.doesNotMatch(row.query.search, /bad_params/)
  assert.match(row.query.search, /blank value filters nothing/)
})

test('GET /v1 records of kind pattern (WordPress 0.17.0): the route passes `category` with `search`, `offset` and `limit`', () => {
  const row = V1_ROUTES.find((r) => r.method === 'GET' && r.path === '/v1/sites/:key/records/:kind')
  const asked = (query) => row.params({ path: { kind: 'pattern' }, query, headers: {}, keyId: 'k', now: 1 })

  assert.deepEqual(asked({ category: 'banner', search: 'hero', offset: '50', limit: '25' }), {
    params: { kind: 'pattern', offset: 50, limit: 25, search: 'hero', category: 'banner' }
  })
  // A blank one filters nothing and is not sent (the plugin refuses an empty category).
  assert.deepEqual(asked({ category: '  ' }), { params: { kind: 'pattern' } })
  assert.match(row.query.category, /`pattern`/)
  assert.match(row.description, /`pattern`/)
})

test(
  'GET /v1 records ?search=: a plugin that echoes it is passed on with its `matched`; one that ignores it is refused 501 LIST_SEARCH_UNSUPPORTED with no rows, and the code is the caller’s to branch on',
  opts,
  async () => {
    const { pool } = db
    const rows = [
      { id: 1, title: 'Roof repair', alias: 'roof-repair' },
      { id: 2, title: 'Gutter cleaning', alias: 'gutter-cleaning' }
    ]
    const echoing = fakePlugin((sent) => ({
      ok: true,
      kind: sent.params.kind,
      offset: 0,
      search: sent.params.search,
      matched: 1,
      items: [rows[0]]
    }))
    const ignoring = fakePlugin({ ok: true, kind: 'article', offset: 0, items: rows })
    await pairedSite(pool)
    const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key

    const read = await harness(pool, echoing.fetchImpl).v1(
      'GET',
      '/v1/sites/lantern.localhost/records/article?search=roof&limit=5',
      key
    )
    assert.equal(read.status, 200, await read.clone().text())
    assert.deepEqual(await read.json(), {
      ok: true,
      kind: 'article',
      offset: 0,
      search: 'roof',
      matched: 1,
      items: [rows[0]]
    })
    assert.deepEqual(
      echoing.calls.map((sent) => [sent.action, sent.params]),
      [['content.list', { kind: 'article', limit: 5, search: 'roof' }]],
      'the key reached the plugin'
    )

    const refused = await harness(pool, ignoring.fetchImpl).v1(
      'GET',
      '/v1/sites/lantern.localhost/records/article?search=roof',
      key
    )
    const text = await refused.text()
    assert.equal(refused.status, 501, text)
    assert.equal(refused.headers.get('x-tracy-api-version'), 'v1')
    const body = JSON.parse(text)
    assert.equal(body.error.code, 'LIST_SEARCH_UNSUPPORTED')
    assert.match(body.error.message, /Claude Cowork plugin/)
    assert.equal(text.includes('Roof repair'), false, 'nothing that looks filtered')
    assert.equal('items' in body, false)

    // The same list without `search` is the plain list, whatever the plugin says.
    const plain = await harness(pool, ignoring.fetchImpl).v1(
      'GET',
      '/v1/sites/lantern.localhost/records/article',
      key
    )
    assert.equal(plain.status, 200)
    assert.deepEqual((await plain.json()).items, rows)
    // A blank search — empty, or only spaces — is dropped before the door: the plugin was asked for the plain
    // list, so a plugin that ignores `search` is not refused for a filter nobody asked for.
    for (const blankQuery of ['search=', 'search=%20', 'search=%20%20%09']) {
      const blank = await harness(pool, ignoring.fetchImpl).v1(
        'GET',
        `/v1/sites/lantern.localhost/records/article?${blankQuery}`,
        key
      )
      assert.equal(blank.status, 200, `${blankQuery}: ${await blank.clone().text()}`)
      assert.equal('search' in ignoring.calls.at(-1).params, false, blankQuery)
    }
  }
)

test('/v1: If-None-Match matching the ETag → 304 with no body', opts, async () => {
  const { pool } = db
  const { v1 } = harness(pool, fakePlugin(contentAnswers).fetchImpl)
  await pairedSite(pool)
  const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key
  const first = await v1('GET', '/v1/sites/lantern.localhost/pages', key)
  const etag = first.headers.get('etag')
  assert.match(etag, /^W\/"cv1\./)
  const again = await v1('GET', '/v1/sites/lantern.localhost/pages', key, {
    headers: { 'if-none-match': etag }
  })
  assert.equal(again.status, 304)
  assert.equal(again.headers.get('etag'), etag)
  assert.equal(again.headers.get('x-tracy-api-version'), 'v1')
  assert.equal(await again.text(), '')
  const strong = await v1('GET', '/v1/sites/lantern.localhost/pages', key, {
    headers: { 'if-none-match': etag.slice(2) }
  })
  assert.equal(strong.status, 304, 'weak comparison: the W/ prefix does not matter')
  const other = await v1('GET', '/v1/sites/lantern.localhost/pages', key, {
    headers: { 'if-none-match': 'W/"something-else"' }
  })
  assert.equal(other.status, 200)
  const one = await v1('GET', '/v1/sites/lantern.localhost/contents/c-home', key, {
    headers: { 'if-none-match': '"snap-c-home"' }
  })
  assert.equal(one.status, 304)
})

test(
  'PATCH records: `fields` + Tracy-Apply-Id (or a generated api-<keyId>-<ms> apply_id); Idempotency-Key is refused here, and an If-Match that is no body revision',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin({ ok: true, kind: 'article', id: 7, created: false })
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const minted = await keyFor(pool, 'owner@x.y', 'lantern.localhost')
    const named = await v1('PATCH', '/v1/sites/lantern.localhost/records/article/7', minted.key, {
      body: { fields: { title: 'New' } },
      headers: { 'tracy-apply-id': 'title-fix-1' }
    })
    assert.equal(named.status, 200, await named.clone().text())
    assert.equal(named.headers.get('tracy-apply-id'), 'title-fix-1', 'the answer names the apply id sent')
    assert.deepEqual(await named.json(), { ok: true, kind: 'article', id: 7, created: false })
    assert.deepEqual(plugin.calls.at(-1).params, {
      kind: 'article',
      id: 7,
      fields: { title: 'New' },
      apply_id: 'title-fix-1'
    })

    const generated = await v1('PATCH', '/v1/sites/lantern.localhost/records/post/0', minted.key, {
      body: { fields: { post_title: 'Hello' }, key: 'ignored-by-joomla' }
    })
    assert.equal(generated.status, 200)
    const sent = plugin.calls.at(-1).params
    assert.match(sent.apply_id, new RegExp(`^api-${minted.id}-\\d{13}$`))
    // The made id is the only handle on this write: the answer must name it, or nothing can undo it
    // (measured on dev 29/09/2026 — the site logged it, no answer said it).
    assert.equal(generated.headers.get('tracy-apply-id'), sent.apply_id)
    assert.deepEqual(
      { ...sent, apply_id: undefined },
      {
        kind: 'post',
        id: 0,
        key: 'ignored-by-joomla',
        fields: { post_title: 'Hello' },
        apply_id: undefined
      }
    )

    for (const [body, headers, code] of [
      [{ fields: { a: 1 } }, { 'idempotency-key': 'r1' }, 'IDEMPOTENCY_KEY_NOT_SUPPORTED'],
      // An entity tag that is not a body revision is refused by its form (02/10/2026: If-Match is honoured).
      [{ fields: { a: 1 } }, { 'if-match': '"x"' }, 'INVALID_REQUEST'],
      [{ nofields: true }, {}, 'INVALID_REQUEST'],
      ['not an object', {}, 'INVALID_REQUEST']
    ]) {
      const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/article/7', minted.key, {
        body,
        headers
      })
      assert.equal(res.status, 400, code)
      assert.equal((await res.json()).error.code, code)
    }
    const notNumeric = await v1('PATCH', '/v1/sites/lantern.localhost/records/article/seven', minted.key, {
      body: { fields: { a: 1 } }
    })
    assert.equal(notNumeric.status, 400)
  }
)

test('DELETE records needs Tracy-Apply-Id → 400 APPLY_ID_REQUIRED without it', opts, async () => {
  const { pool } = db
  const plugin = fakePlugin({ ok: true, trashed: 1 })
  const { v1 } = harness(pool, plugin.fetchImpl)
  await pairedSite(pool)
  const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key
  const bare = await v1('DELETE', '/v1/sites/lantern.localhost/records/article/7', key)
  assert.equal(bare.status, 400)
  assert.deepEqual((await bare.json()).error.code, 'APPLY_ID_REQUIRED')
  assert.equal(plugin.calls.length, 0, 'the site was not called')
  const ok = await v1('DELETE', '/v1/sites/lantern.localhost/records/article/7?key=k', key, {
    headers: { 'tracy-apply-id': 'trash-7' }
  })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('tracy-apply-id'), 'trash-7')
  assert.deepEqual(plugin.calls.at(-1).params, { kind: 'article', id: 7, key: 'k', apply_id: 'trash-7' })
})

test(
  '/v1 never answers 502 or 504: the site failing is 500, the site silent is 503, both readable JSON',
  opts,
  async () => {
    // Cloudflare, in front of the api host, replaces a 502/504 body with its own page (measured on
    // api.tracy.site 29/09/2026: `error code: 502`, then an HTML page), so the caller lost the site's words.
    const { pool } = db
    const failing = fakePlugin({
      ok: false,
      error: 'write_failed',
      message: 'no writable field for kind post; given title'
    })
    const { v1 } = harness(pool, failing.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key
    const failed = await v1('PATCH', '/v1/sites/lantern.localhost/records/post/95', key, {
      body: { fields: { title: 'x' } },
      headers: { 'tracy-apply-id': 'fails-1' }
    })
    assert.equal(failed.status, 500)
    const failedBody = await failed.json()
    assert.equal(failedBody.error.code, 'WRITE_FAILED')
    assert.match(failedBody.error.message, /no writable field/)

    const silent = harness(pool, async () => {
      throw new Error('connect ECONNREFUSED')
    })
    const down = await silent.v1('GET', '/v1/sites/lantern.localhost/records/article/7', key)
    assert.equal(down.status, 503, await down.clone().text())
    assert.equal((await down.json()).error.code, 'COMPONENT_UNREACHABLE')
  }
)

test(
  'contract/apply: If-Match "<contentId>:<revision>" → expected_content_revisions; Idempotency-Key → request_id; a stale one → 409',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin((sent) =>
      sent.params.operation !== 'apply' || sent.params.expected_content_revisions?.c_home === 'rev-1'
        ? { ok: true, applied: 1, revision: 'r2' }
        : {
            ok: false,
            error: 'contract_failed',
            message: 'Content changed; inspect again',
            errors: [
              {
                code: 'REVISION_STALE',
                message: 'stale',
                field: { slotKey: 'hero.0', contentId: 'c_home' },
                current: 'rev-9'
              }
            ],
            next: 'read again'
          }
    )
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key
    const body = { apply_id: 'contract-hero-1', changes: { 'hero.0': 'Fresh bread' } }
    const fresh = await v1('POST', '/v1/sites/lantern.localhost/contract/apply', key, {
      body,
      headers: { 'if-match': 'W/"c_home:rev-1"', 'idempotency-key': 'hero-1' }
    })
    assert.equal(fresh.status, 200, await fresh.clone().text())
    assert.deepEqual(await fresh.json(), { ok: true, applied: 1, revision: 'r2' })
    assert.deepEqual(plugin.calls.at(-1).params, {
      ...body,
      operation: 'apply',
      request_id: 'hero-1',
      expected_content_revisions: { c_home: 'rev-1' }
    })

    const stale = await v1('POST', '/v1/sites/lantern.localhost/contract/apply', key, {
      body,
      headers: { 'if-match': '"c_home:rev-0", "c_about:rev-3"' }
    })
    assert.equal(stale.status, 409)
    assert.deepEqual(plugin.calls.at(-1).params.expected_content_revisions, {
      c_home: 'rev-0',
      c_about: 'rev-3'
    })
    const refused = await stale.json()
    assert.equal(refused.error.code, 'CONTRACT_FAILED')
    assert.equal(refused.error.message, 'Content changed; inspect again')
    assert.equal(refused.errors[0].code, 'REVISION_STALE')
    assert.equal(refused.next, 'read again')
    assert.equal('ok' in refused, false)

    // If-Match is honoured on `apply` alone; a malformed tag is a bad request.
    const inspect = await v1('POST', '/v1/sites/lantern.localhost/contract/inspect', key, {
      body: {},
      headers: { 'if-match': '"c_home:rev-1"' }
    })
    assert.equal(inspect.status, 400)
    assert.equal((await inspect.json()).error.code, 'IF_MATCH_NOT_SUPPORTED')
    const malformed = await v1('POST', '/v1/sites/lantern.localhost/contract/apply', key, {
      body,
      headers: { 'if-match': '"rev-1"' }
    })
    assert.equal(malformed.status, 400)
    assert.equal((await malformed.json()).error.code, 'INVALID_REQUEST')
    // The body may not name another operation than the path.
    const twoOps = await v1('POST', '/v1/sites/lantern.localhost/contract/inspect', key, {
      body: { operation: 'apply' }
    })
    assert.equal(twoOps.status, 400)
    // Without If-Match the plugin's own precondition params still travel as sent.
    const plain = await v1('POST', '/v1/sites/lantern.localhost/contract/inspect', key, { body: {} })
    assert.equal(plain.status, 200)
    assert.deepEqual(plugin.calls.at(-1).params, { operation: 'inspect' })
  }
)

test(
  '/v1: a plugin refusal inside a 200 becomes the Q9 status; a door refusal keeps its code and fields',
  opts,
  async () => {
    const { pool } = db
    let answer = { ok: false, error: 'not_found', message: 'No article 99', next: 'list articles' }
    const plugin = fakePlugin(() => answer)
    const { v1, door } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const owner = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key
    const missing = await v1('GET', '/v1/sites/lantern.localhost/records/article/99', owner)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), {
      error: { code: 'NOT_FOUND', message: 'No article 99' },
      errors: [],
      next: 'list articles'
    })
    // The old door is untouched: the same refusal is still a 200 there.
    const viaDoor = await door('owner@x.y', 'content.get', { kind: 'article', id: 99 })
    assert.equal(viaDoor.status, 200)
    assert.deepEqual(await viaDoor.json(), answer)

    // A refusal that names a specific code keeps it, and its extra fields ride along.
    answer = {
      ok: false,
      error: 'locked',
      code: 'SLOT_LOCKED_BY_USER',
      lockedBy: 'ann',
      message: 'open in editor'
    }
    const locked = await v1('DELETE', '/v1/sites/lantern.localhost/records/article/7', owner, {
      headers: { 'tracy-apply-id': 'x' }
    })
    assert.equal(locked.status, 409)
    assert.deepEqual(await locked.json(), {
      error: { code: 'SLOT_LOCKED_BY_USER', message: 'open in editor' },
      errors: [],
      lockedBy: 'ann'
    })

    // Door refusals: the toolset gate, the site's own reader refusals, rate limits.
    const editor = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key
    const gated = await v1('PATCH', '/v1/sites/lantern.localhost/records/module/1', editor, {
      body: { fields: { title: 'x' } }
    })
    assert.equal(gated.status, 403)
    assert.deepEqual(await gated.json(), {
      error: { code: 'TOOLSET_NOT_GRANTED' },
      toolset: 'code',
      role: 'editor'
    })
    const badQuery = await v1('GET', '/v1/sites/lantern.localhost/contents?limit=500', owner)
    assert.equal(badQuery.status, 400)
    const q = await badQuery.json()
    assert.equal(q.error.code, 'CONTENT_BAD_QUERY')
    assert.ok(q.error.message.includes('limit'))
    const noSince = await v1('GET', '/v1/sites/lantern.localhost/changes', owner)
    assert.equal(noSince.status, 400)
    assert.equal((await noSince.json()).error.code, 'INVALID_REQUEST')
  }
)

// A door refusal that carries a SENTENCE beside its code — `{ code, error: "<sentence>", … }` — is the shape
// `shape()` (`api/route.js`) used to break: `...rest` spread `error` back over `{ error: { code } }`, so the
// caller got the bare sentence and lost the code the reference documents (30/09/2026). Two door refusals are
// made that way: `SITE_BUSY` (18/09, on `/v1` since it opened) and `LIST_SEARCH_UNSUPPORTED` (30/09).
test(
  '/v1: a write refused SITE_BUSY answers 409 with the code under error.code and the sentence under error.message, the lease fields riding along',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin({ ok: true, kind: 'article', id: 7, created: false })
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const holder = (await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])).key
    const other = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key
    const record = '/v1/sites/lantern.localhost/records/article/7'

    // The write lease is keyed `key:<id>`: the first key's write takes it, and the second key meets it.
    const first = await v1('PATCH', record, holder, { body: { fields: { title: 'One' } } })
    assert.equal(first.status, 200, await first.clone().text())
    const written = plugin.calls.length

    for (const [what, refused] of /** @type {const} */ ([
      ['PATCH', await v1('PATCH', record, other, { body: { fields: { title: 'Two' } } })],
      ['DELETE', await v1('DELETE', record, other, { headers: { 'tracy-apply-id': 'remove-7' } })]
    ])) {
      const text = await refused.text()
      assert.equal(refused.status, 409, `${what}: ${text}`)
      assert.equal(refused.headers.get('x-tracy-api-version'), 'v1')
      const body = JSON.parse(text)
      assert.equal(typeof body.error, 'object', `${what}: error is the envelope, not the bare sentence`)
      assert.equal(body.error.code, 'SITE_BUSY', what)
      assert.equal(body.error.message, 'owner@x.y is changing lantern.localhost right now.', what)
      // What the door says about the hold rides along, unchanged; the code is not repeated at the top.
      assert.equal(body.holder, 'owner@x.y', what)
      assert.equal(body.holderIsYou, false, what)
      assert.equal(typeof body.aheadOfYou, 'number', what)
      assert.equal(typeof body.freeInSeconds, 'number', what)
      assert.match(body.next, /Tell the customer who is working on the site/, what)
      assert.equal('code' in body, false, what)
    }
    assert.equal(plugin.calls.length, written, 'a refused write never reached the plugin')
  }
)

test('/v1 shape: a door refusal keeps its code under error.code — its sentence is the message (message first, then error), an error object is kept, nothing else changes', async () => {
  let answer = { status: 409, body: {} }
  const routes = apiRoutes({
    pool: null,
    door: async () => answer,
    resolvePrincipal: async () => ({
      email: 'owner@x.y',
      key: { keyId: 'key-1', siteKey: 'lantern.localhost', scopes: ['content'] }
    }),
    canonicalSiteKey: async (_pool, name) => name,
    listApplies: async () => [],
    readDesign: async () => ({ design: null }),
    isApiHost: () => true
  })
  const ask = async (status, body) => {
    answer = { status, body }
    const res = await routes.fetch(
      new Request('http://api.test/v1/sites/lantern.localhost/records/article?limit=1')
    )
    return { status: res.status, body: await res.json() }
  }
  // Both a `message` and an `error` sentence: the message is what the reference calls the message.
  assert.deepEqual(await ask(409, { code: 'DOOR_CODE', message: 'm', error: 'e', extra: 1 }), {
    status: 409,
    body: { error: { code: 'DOOR_CODE', message: 'm' }, extra: 1 }
  })
  // A blank message does not hide the sentence.
  assert.deepEqual((await ask(409, { code: 'DOOR_CODE', message: '', error: 'e' })).body, {
    error: { code: 'DOOR_CODE', message: 'e' }
  })
  // Only the sentence, only the message, and neither.
  assert.deepEqual((await ask(501, { code: 'DOOR_CODE', error: 'e', next: 'n' })).body, {
    error: { code: 'DOOR_CODE', message: 'e' },
    next: 'n'
  })
  assert.deepEqual((await ask(400, { code: 'DOOR_CODE', message: 'm' })).body, {
    error: { code: 'DOOR_CODE', message: 'm' }
  })
  assert.deepEqual((await ask(429, { code: 'DOOR_CODE' })).body, { error: { code: 'DOOR_CODE' } })
  // An `error` that is already an object is kept, its fields beside the door's code (the code is the door's).
  assert.deepEqual((await ask(409, { code: 'DOOR_CODE', error: { detail: 'd', code: 'other' } })).body, {
    error: { detail: 'd', code: 'DOOR_CODE' }
  })
  // A content refusal is already `{ error: { code } }` and has no top-level code: it passes as it is.
  const content = { error: { code: 'CONTENT_BAD_QUERY', message: 'limit is too big' } }
  assert.deepEqual((await ask(400, content)).body, content)
})

test('GET /v1/sites/:key/applies lists what this key applied through /v1', opts, async () => {
  const { pool } = db
  const plugin = fakePlugin({ ok: true, kind: 'article', id: 7, created: false })
  const { v1 } = harness(pool, plugin.fetchImpl)
  await pairedSite(pool)
  const minted = await keyFor(pool, 'owner@x.y', 'lantern.localhost')
  const other = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
  for (const id of ['one', 'two']) {
    const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/article/7', minted.key, {
      body: { fields: { title: id } },
      headers: { 'tracy-apply-id': id }
    })
    assert.equal(res.status, 200)
  }
  // Reads are recorded in the same session but are not changes to revert.
  assert.equal((await v1('GET', '/v1/sites/lantern.localhost/records/article/7', minted.key)).status, 200)
  const listed = await v1('GET', '/v1/sites/lantern.localhost/applies', minted.key)
  assert.equal(listed.status, 200)
  const body = await listed.json()
  assert.deepEqual(body.applyIds, ['one', 'two'], 'this key’s writes, in order')
  // Another key of the same person is another session: it lists nothing of these.
  const theirs = await v1('GET', '/v1/sites/lantern.localhost/applies', other.key)
  assert.deepEqual(await theirs.json(), { applies: [], applyIds: [] })
  assert.deepEqual(
    body.applies.map((a) => [a.action, a.ok, a.applyId, a.actor]),
    [
      ['content.update', true, 'one', 'owner@x.y'],
      ['content.update', true, 'two', 'owner@x.y'],
      ['content.get', true, null, 'owner@x.y']
    ]
  )
  const since = await v1('GET', '/v1/sites/lantern.localhost/applies?since=2099-01-01T00:00:00Z', minted.key)
  assert.deepEqual(await since.json(), { applies: [], applyIds: [] })
  const badSince = await v1('GET', '/v1/sites/lantern.localhost/applies?since=yesterday', minted.key)
  assert.equal(badSince.status, 400)
})

test(
  'GET /v1/sites/:key/design answers Tracy’s record of the look, null included, with an ETag',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin({ ok: true })
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const minted = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])

    // No record yet: an answer, not an error.
    const none = await v1('GET', '/v1/sites/lantern.localhost/design', minted.key)
    assert.equal(none.status, 200)
    assert.deepEqual(await none.json(), { design: null })
    assert.equal(none.headers.get('etag'), 'W/"design:none"')
    assert.equal(none.headers.get('x-tracy-api-version'), 'v1')

    await writeSiteDesign(
      pool,
      'lantern.localhost',
      {
        id: 'apple',
        source: 'catalog',
        name: 'Apple',
        platform: 'joomla',
        tokens: { '--accent': '#0071e3', '--font-body': 'SF Pro Text' },
        tokensFrom: 'tracy-web:design-tokens.json',
        manifestDesign: { id: 'apple', source: 'catalog' }
      },
      'build'
    )
    const read = await v1('GET', '/v1/sites/lantern.localhost/design', minted.key)
    assert.equal(read.status, 200)
    const body = await read.json()
    assert.deepEqual(Object.keys(body.design).sort(), [
      'id',
      'name',
      'platform',
      'source',
      'tokens',
      'tokensFrom',
      'updatedAt'
    ])
    assert.equal(body.design.id, 'apple')
    assert.equal(body.design.tokens['--accent'], '#0071e3')
    assert.equal(
      'wroteBy' in body.design || 'manifestDesign' in body.design,
      false,
      'internal fields stay in'
    )
    const etag = read.headers.get('etag')
    assert.equal(etag, `W/"design:${body.design.updatedAt}"`)
    const again = await v1('GET', '/v1/sites/lantern.localhost/design', minted.key, {
      headers: { 'if-none-match': etag }
    })
    assert.equal(again.status, 304)

    // The content scope is what reading it needs; another site is another seat.
    const codeOnly = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['code'])
    const refused = await v1('GET', '/v1/sites/lantern.localhost/design', codeOnly.key)
    assert.equal(refused.status, 403)
    assert.equal((await refused.json()).error.code, 'TOOLSET_NOT_GRANTED')
    const elsewhere = await v1('GET', '/v1/sites/elsewhere.localhost/design', minted.key)
    assert.equal(elsewhere.status, 403)
    const anonymous = await v1('GET', '/v1/sites/lantern.localhost/design', null)
    assert.equal(anonymous.status, 401)
    assert.equal(plugin.calls.length, 0, 'the site is never asked')
  }
)

// ── The reference (S4) ──────────────────────────────────────────────────────────────────────────

const spec = (over = {}) =>
  buildOpenApi({
    origin: 'https://tracy.example',
    applyActions: APPLY_ACTIONS,
    toolsetOf: applyToolsetLabel,
    ...over
  })

test('every /v1 route is documented once, from the table, as a bearer operation', () => {
  // `/v1/demos*` take an account token, not a seat key, so they are documented apart from the table MCP tools come from.
  const demoPaths = new Set(DEMO_ROUTES.map((r) => `${r.method} ${r.path}`))
  const docs = ROUTE_DOCS.filter((r) => r.path.startsWith('/v1') && !demoPaths.has(`${r.method} ${r.path}`))
  assert.ok(demoPaths.size > 0)
  for (const r of ROUTE_DOCS.filter((d) => demoPaths.has(`${d.method} ${d.path}`))) {
    assert.equal(r.tag, 'API v1: Demos', r.path)
    assert.equal(r.internal, false, r.path)
  }
  assert.deepEqual(
    docs.map((r) => `${r.method} ${r.path}`),
    V1_ROUTES.map((r) => `${r.method} ${r.path}`)
  )
  for (const doc of docs) {
    assert.equal(doc.auth, 'token', doc.path)
    assert.equal(doc.internal, false, doc.path)
    assert.equal(doc.tag, 'API v1', doc.path)
  }
  const doc = spec()
  for (const row of V1_ROUTES) {
    const path = row.path.replace(/:([A-Za-z]+)/g, '{$1}')
    const op = doc.paths[path]?.[row.method.toLowerCase()]
    assert.ok(op, `${row.method} ${path} in the document`)
    assert.deepEqual(op.security, [{ bearer: [] }], `${path}: bearer`)
    assert.ok(op.responses['200'] || op.responses['204'], `${path}: a success`)
    if (row.etag) {
      assert.ok(op.responses['304'], `${path}: 304`)
      assert.ok(
        op.parameters.some((p) => p.in === 'header' && p.name === 'If-None-Match'),
        `${path}: If-None-Match`
      )
      assert.ok(op.responses['200'].headers?.ETag, `${path}: ETag documented`)
    }
    for (const status of ['400', '401', '403', '404', '409', '422', '429', '500', '501', '503'])
      assert.ok(op.responses[status] || row.action === null, `${path}: ${status}`)
    // What Cloudflare would swallow is never promised to a caller.
    assert.ok(!op.responses['502'] && !op.responses['504'], `${path}: no 502/504`)
    if (row.headers.includes('Tracy-Apply-Id'))
      assert.ok(op.responses['200'].headers?.['Tracy-Apply-Id'], `${path}: Tracy-Apply-Id answered`)
  }
  assert.equal(doc.components.securitySchemes.bearer.type, 'http')
  assert.equal(doc.components.securitySchemes.bearer.scheme, 'bearer')
  const patch = doc.paths['/v1/sites/{key}/records/{kind}/{id}'].patch
  assert.ok(patch.parameters.some((p) => p.in === 'header' && p.name === 'Tracy-Apply-Id'))
  assert.deepEqual(Object.keys(patch.requestBody.content['application/json'].schema.properties).sort(), [
    'fields',
    'key'
  ])
  const contract = doc.paths['/v1/sites/{key}/contract/{operation}'].post
  assert.ok(contract.parameters.some((p) => p.in === 'header' && p.name === 'If-Match'))
  assert.ok(contract.parameters.some((p) => p.in === 'header' && p.name === 'Idempotency-Key'))
  const del = doc.paths['/v1/sites/{key}/records/{kind}/{id}'].delete
  assert.equal(del.parameters.find((p) => p.name === 'Tracy-Apply-Id').required, true)
  // The /v1-only refusals are in the error table, family door.
  for (const code of ['APPLY_ID_REQUIRED', 'IF_MATCH_NOT_SUPPORTED', 'IDEMPOTENCY_KEY_NOT_SUPPORTED'])
    assert.ok(
      ERROR_DOCS.some((e) => e.code === code && e.family === 'door' && e.status === 400),
      code
    )
})

test('publicApi: only /v1 paths, the api origin as server, bearer as the one security scheme', () => {
  const doc = spec({ publicApi: true, origin: 'https://api.example' })
  assert.deepEqual(doc.servers, [{ url: 'https://api.example' }])
  const operations = Object.values(doc.paths).flatMap((item) => Object.keys(item))
  assert.equal(operations.length, V1_ROUTES.length + DEMO_ROUTES.length)
  assert.ok(
    Object.keys(doc.paths).every((p) => p.startsWith('/v1/')),
    Object.keys(doc.paths).join()
  )
  assert.deepEqual(doc.security, [{ bearer: [] }])
  assert.deepEqual(Object.keys(doc.components.securitySchemes), ['bearer'])
  assert.deepEqual(
    doc.tags.map((t) => t.name),
    ['API v1', 'API v1: Demos']
  )
  assert.match(doc.info.description, /## Authentication/)
  assert.match(doc.info.description, /## Errors/)
  assert.match(doc.info.description, /REVISION_STALE/)
  assert.doesNotMatch(doc.info.description, /## Actions/)
  // Every reference still resolves.
  const walk = (node, out = []) => {
    if (Array.isArray(node)) node.forEach((n) => walk(n, out))
    else if (node && typeof node === 'object') {
      if (
        typeof node.$ref === 'string' &&
        !(node.$ref.replace('#/components/schemas/', '') in doc.components.schemas)
      )
        out.push(node.$ref)
      Object.values(node).forEach((n) => walk(n, out))
    }
    return out
  }
  assert.deepEqual(walk(doc), [])
})

test('on the api host /docs/api/openapi.json and llms.txt are the public variant; the cowork host is unchanged', async () => {
  const config = readConfig(env)
  const app = buildApp({ config, mail: { send: async () => {} } })
  const onApi = await app.fetch(new Request('http://api.test/docs/api/openapi.json'))
  assert.equal(onApi.status, 200)
  const doc = await onApi.json()
  assert.ok(Object.keys(doc.paths).every((p) => p.startsWith('/v1/')))
  assert.deepEqual(doc.servers, [{ url: 'http://api.test' }])
  const llms = await (await app.fetch(new Request('http://api.test/docs/api/llms.txt'))).text()
  assert.match(llms, /GET \/v1\/me/)
  assert.doesNotMatch(llms, /\/api\/sites\/\{key\}\/apply/)
  const onCowork = await app.fetch(new Request('http://tracy.test:8080/docs/api/openapi.json'))
  const cowork = await onCowork.json()
  assert.ok(cowork.paths['/api/sites/{key}/apply'], 'the cowork reference still has the door')
  assert.ok(cowork.paths['/v1/me'], 'and the /v1 routes beside it')
})

test('an unknown /v1 path on the api host is a 404 of the API, never the dsh catch-all', opts, async () => {
  // Measured on dev 29/09 before this route existed: `GET /v1/me` with a Bearer answered 302 (the
  // workspace catch-all), because S2's allowlist admits `/v1/*` and nothing else claimed the path.
  const { pool } = db
  const { v1 } = harness(pool, fakePlugin({ ok: true }).fetchImpl)
  await pairedSite(pool)
  const key = await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])
  for (const path of ['/v1/nope', '/v1/sites/lantern.localhost/nothing', '/v1']) {
    const res = await v1('GET', path, key.key)
    assert.equal(res.status, 404, path)
    assert.equal(res.headers.get('x-tracy-api-version'), 'v1', path)
    assert.deepEqual(await res.json(), { error: { code: 'NOT_FOUND', message: 'No such /v1 route.' } }, path)
  }
  const posted = await v1('POST', '/v1/sites/lantern.localhost/nothing', key.key)
  assert.equal(posted.status, 404)
})

test(
  'off the api host, /v1 paths are not claimed: the request goes on to whatever is mounted after',
  opts,
  async () => {
    const { pool } = db
    const { app } = harness(pool, fakePlugin({ ok: true }).fetchImpl)
    const res = await app.request('http://cowork.test/v1/nope', { headers: { host: 'cowork.test' } })
    assert.notEqual(res.headers.get('x-tracy-api-version'), 'v1')
    assert.notEqual((await res.text()).includes('No such /v1 route'), true)
  }
)

// ── If-Match on a record write: the ETag is the WHOLE editable record (sweep #2, council 11/10/2026) ──
// Until 11/10 the ETag was the body's `body_revision` alone, so a stale If-Match still matched after the
// title changed and the second PATCH overwrote it (04/10 dev E2E J13.2). The tag now covers every field the
// record holds; the body is still held to the plugin's lock with `expected_body_revision`.

const sha = (/** @type {string} */ text) => createHash('sha256').update(text, 'utf8').digest('hex')
const BODY_A = '<!-- wp:paragraph -->\n<p>Hello</p>\n<!-- /wp:paragraph -->'
const BODY_B = '<!-- wp:paragraph -->\n<p>Changed in WordPress admin</p>\n<!-- /wp:paragraph -->'

/**
 * A fake WordPress plugin 0.17.0 holding post 42 and the template part `header`: a record is its body plus
 * a title, an excerpt, a status and a comment count; reads answer `body_revision`, a write checks
 * `expected_body_revision` and answers the new one. `revision: false` is a plugin older than 0.17.0, which
 * answers no `body_revision` and ignores the key. `onWrite` runs when a write arrives, before the plugin
 * compares (a write that landed in between).
 */
function revisionPlugin({ revision = true } = {}) {
  const fresh = (body) => ({ body, title: 'Hello', excerpt: '', status: 'publish', comments: '0' })
  const records = { 'post:42': fresh(BODY_A), 'templatePart:header': fresh(BODY_A) }
  let onWrite = () => {}
  const itemOf = (kind, r) =>
    kind === 'post'
      ? {
          ID: 42,
          post_content: r.body,
          post_title: r.title,
          post_excerpt: r.excerpt,
          post_status: r.status,
          comment_count: r.comments
        }
      : { slug: 'header', content: r.body, title: r.title }
  const plugin = fakePlugin((sent) => {
    const p = sent.params
    const at = p.kind === 'post' ? `post:${p.id}` : `${p.kind}:${p.key}`
    if (p.kind === 'option')
      return sent.action === 'content.get'
        ? { ok: true, kind: 'option', key: p.key, item: { value: 'x' } }
        : { ok: true, kind: 'option', key: p.key, created: false }
    const r = records[at]
    if (r === undefined) return { ok: false, error: 'not_found', message: 'no such record' }
    const rev = () => (revision ? { body_revision: sha(r.body) } : {})
    if (sent.action === 'content.get')
      return { ok: true, kind: p.kind, id: p.id, key: p.key ?? null, item: itemOf(p.kind, r), ...rev() }
    if (sent.action === 'content.update') {
      onWrite()
      if (
        revision &&
        typeof p.expected_body_revision === 'string' &&
        p.expected_body_revision !== sha(r.body)
      )
        return {
          ok: false,
          error: 'revision_stale',
          message: 'The body changed after it was read, so nothing was written.',
          ...rev()
        }
      const f = p.fields ?? {}
      const bodyField = p.kind === 'post' ? 'post_content' : 'content'
      if (typeof f[bodyField] === 'string') r.body = f[bodyField]
      if (typeof f.post_title === 'string') r.title = f.post_title
      if (typeof f.title === 'string') r.title = f.title
      if (typeof f.post_excerpt === 'string') r.excerpt = f.post_excerpt
      if (typeof f.post_status === 'string') r.status = f.post_status
      return { ok: true, kind: p.kind, id: p.id, key: p.key ?? null, created: false, ...rev() }
    }
    return { ok: true }
  })
  return {
    ...plugin,
    records,
    /** @param {() => void} fn */
    onWrite: (fn) => {
      onWrite = fn
    }
  }
}
const actions = (/** @type {any[]} */ calls) => calls.map((c) => c.action)
const TAG = /^"[a-f0-9]{64}"$/

/** The ETag a caller reads for a record, as it would read it. */
async function etagOf(v1, key, path = 'post/42') {
  const res = await v1('GET', `/v1/sites/lantern.localhost/records/${path}`, key)
  assert.equal(res.status, 200)
  return /** @type {string} */ (res.headers.get('etag'))
}

test(
  'GET /v1 record: the ETag covers the whole record — a changed title, excerpt or status is a new tag, If-None-Match on it is 304; a record with no body revision has none',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key

    const first = await etagOf(v1, key)
    assert.match(first, TAG)
    assert.notEqual(first, `"${sha(BODY_A)}"`, 'no longer the body’s revision alone')
    assert.equal(await etagOf(v1, key), first, 'nothing moved, same tag')
    const same = await v1('GET', '/v1/sites/lantern.localhost/records/post/42', key, {
      headers: { 'if-none-match': first }
    })
    assert.equal(same.status, 304)
    // A visitor's comment is no edit of the record: the tag does not move.
    plugin.records['post:42'].comments = '3'
    assert.equal(await etagOf(v1, key), first)
    const seen = new Set([first])
    for (const change of [
      (r) => (r.title = 'Hello again'),
      (r) => (r.excerpt = 'Short'),
      (r) => (r.status = 'draft'),
      (r) => (r.body = BODY_B)
    ]) {
      change(plugin.records['post:42'])
      const tag = await etagOf(v1, key)
      assert.match(tag, TAG)
      assert.ok(!seen.has(tag), `a new tag after ${change}`)
      seen.add(tag)
    }
    assert.match(await etagOf(v1, key, 'templatePart/0?key=header'), TAG)
    const option = await v1('GET', '/v1/sites/lantern.localhost/records/option/0?key=blogname', key)
    assert.equal(option.status, 200)
    assert.equal(option.headers.get('etag'), null)
  }
)

test(
  'PATCH /v1 record with If-Match: the record is read first, then written with expected_body_revision of that read',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key

    for (const weak of [false, true]) {
      const tag = await etagOf(v1, key)
      const next = weak ? BODY_A : BODY_B
      const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/post/42', key, {
        body: { fields: { post_content: next } },
        headers: { 'if-match': weak ? `W/${tag}` : tag, 'tracy-apply-id': 'home-words' }
      })
      assert.equal(res.status, 200, String(weak))
      const [readCall, writeCall] = plugin.calls.slice(-2)
      assert.deepEqual([readCall.action, readCall.params], ['content.get', { kind: 'post', id: 42 }])
      assert.equal(writeCall.action, 'content.update')
      assert.equal(writeCall.params.expected_body_revision, sha(weak ? BODY_B : BODY_A))
      // The record's tag after the write is read, not guessed from the write's answer.
      assert.equal(res.headers.get('etag'), null)
    }
    assert.equal(plugin.records['post:42'].body, BODY_A)
  }
)

test(
  'PATCH /v1 record by key with If-Match: the read names the same kind and key the write does',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    // A template part is the `code` toolset: the owner's key.
    const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key
    const tag = await etagOf(v1, key, 'templatePart/0?key=header')

    const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/templatePart/0', key, {
      body: { key: 'header', fields: { content: BODY_B } },
      headers: { 'if-match': tag }
    })

    assert.equal(res.status, 200)
    assert.deepEqual(plugin.calls.at(-2).params, { kind: 'templatePart', id: 0, key: 'header' })
    assert.equal(plugin.calls.at(-1).params.expected_body_revision, sha(BODY_A))
  }
)

test(
  '🔒 J13.2: a second PATCH with the same If-Match after a TITLE change is 412 REVISION_STALE with the current ETag, nothing written',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key
    const tag = await etagOf(v1, key)
    const patch = (title) =>
      v1('PATCH', '/v1/sites/lantern.localhost/records/post/42', key, {
        body: { fields: { post_title: title } },
        headers: { 'if-match': tag }
      })

    assert.equal((await patch('E2EF-W post v2')).status, 200)
    const writesBefore = actions(plugin.calls).filter((a) => a === 'content.update').length
    const res = await patch('E2EF-W post v3')

    assert.equal(res.status, 412)
    const body = await res.json()
    assert.equal(body.error.code, 'REVISION_STALE')
    assert.equal(res.headers.get('etag'), await etagOf(v1, key))
    assert.notEqual(res.headers.get('etag'), tag)
    assert.equal(
      actions(plugin.calls).filter((a) => a === 'content.update').length,
      writesBefore,
      'no write sent'
    )
    assert.equal(plugin.records['post:42'].title, 'E2EF-W post v2', 'the first write stands')
  }
)

test(
  '🔒 PATCH /v1 record whose If-Match no longer names the body: 412 REVISION_STALE with the current ETag, nothing written',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key
    const tag = await etagOf(v1, key)
    plugin.records['post:42'].body = BODY_B
    const before = plugin.calls.length

    const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/post/42', key, {
      body: { fields: { post_content: '<p>mine</p>' } },
      headers: { 'if-match': tag }
    })

    assert.equal(res.status, 412)
    assert.equal((await res.json()).error.code, 'REVISION_STALE')
    assert.match(String(res.headers.get('etag')), TAG)
    assert.notEqual(res.headers.get('etag'), tag)
    assert.deepEqual(actions(plugin.calls.slice(before)), ['content.get'], 'no write was sent')
    assert.equal(plugin.records['post:42'].body, BODY_B)
  }
)

test(
  '🔒 PATCH /v1 record: a body write that lands between the read and the plugin’s lock comes back 412 REVISION_STALE from the plugin, with the record’s current ETag',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key
    const tag = await etagOf(v1, key)
    plugin.onWrite(() => {
      plugin.records['post:42'].body = BODY_B
    })

    const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/post/42', key, {
      body: { fields: { post_content: '<p>mine</p>' } },
      headers: { 'if-match': tag }
    })

    assert.equal(res.status, 412)
    assert.equal((await res.json()).error.code, 'REVISION_STALE')
    plugin.onWrite(() => {})
    assert.equal(res.headers.get('etag'), await etagOf(v1, key))
    assert.equal(plugin.records['post:42'].body, BODY_B, 'the other write stands')
  }
)

test(
  '🔒 PATCH /v1 record with If-Match where the site answers no body revision: 400 IF_MATCH_NOT_SUPPORTED saying why, nothing written',
  opts,
  async () => {
    const { pool } = db
    for (const [label, plugin, path, body, why] of [
      [
        'a plugin older than 0.17.0 (or Joomla)',
        revisionPlugin({ revision: false }),
        'post/42',
        { fields: { post_content: 'x' } },
        /0\.17\.0/
      ],
      [
        'a kind with no body',
        revisionPlugin(),
        'option/0',
        { key: 'blogname', fields: { value: 'x' } },
        /option/
      ]
    ]) {
      await db.reset()
      const { v1 } = harness(pool, plugin.fetchImpl)
      await pairedSite(pool)
      const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key

      const res = await v1('PATCH', `/v1/sites/lantern.localhost/records/${path}`, key, {
        body,
        headers: { 'if-match': `"${sha(BODY_A)}"` }
      })

      assert.equal(res.status, 400, label)
      const said = (await res.json()).error
      assert.equal(said.code, 'IF_MATCH_NOT_SUPPORTED', label)
      assert.match(said.message, why, label)
      assert.deepEqual(actions(plugin.calls), ['content.get'], `${label}: no write was sent`)
    }
  }
)

test(
  'PATCH /v1 record: an If-Match that is not one record revision is refused by its form before the site is called',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key
    const tag = sha(BODY_A)

    for (const header of ['*', `"${tag}", "${tag}"`, '"abc"', tag, `"${tag.toUpperCase()}"`, `"${tag}0"`]) {
      const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/post/42', key, {
        body: { fields: { post_content: 'x' } },
        headers: { 'if-match': header }
      })
      assert.equal(res.status, 400, header)
      const said = (await res.json()).error
      assert.equal(said.code, 'INVALID_REQUEST', header)
      assert.match(said.message, /If-Match/, header)
      assert.match(said.message, /64/, header)
    }
    assert.equal(plugin.calls.length, 0)
  }
)

test(
  'PATCH /v1 record without If-Match writes as before — one call, no expected_body_revision; If-None-Match on a write never makes a 304',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key

    const res = await v1('PATCH', '/v1/sites/lantern.localhost/records/post/42', key, {
      body: { fields: { post_content: BODY_B } },
      headers: { 'if-none-match': `"${sha(BODY_B)}"` }
    })

    assert.equal(res.status, 200)
    assert.deepEqual(actions(plugin.calls), ['content.update'])
    assert.equal('expected_body_revision' in plugin.calls[0].params, false)
  }
)

test(
  'DELETE /v1 record still refuses If-Match: the plugin checks no revision on a delete',
  opts,
  async () => {
    const { pool } = db
    const plugin = revisionPlugin()
    const { v1 } = harness(pool, plugin.fetchImpl)
    await pairedSite(pool)
    const key = (await keyFor(pool, 'owner@x.y', 'lantern.localhost')).key

    const res = await v1('DELETE', '/v1/sites/lantern.localhost/records/post/42', key, {
      headers: { 'if-match': `"${sha(BODY_A)}"`, 'tracy-apply-id': 'gone' }
    })

    assert.equal(res.status, 400)
    assert.equal((await res.json()).error.code, 'IF_MATCH_NOT_SUPPORTED')
    assert.equal(plugin.calls.length, 0)
  }
)

test(
  '/v1: one code, one wording — the plugin’s revision_stale on an If-Match PATCH answers Tracy’s REVISION_STALE sentence',
  opts,
  async () => {
    const { pool } = db
    const atRead = revisionPlugin()
    const atLock = revisionPlugin()
    await pairedSite(pool)
    const key = (await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])).key
    const readHarness = harness(pool, atRead.fetchImpl).v1
    const lockHarness = harness(pool, atLock.fetchImpl).v1
    const [tagRead, tagLock] = [await etagOf(readHarness, key), await etagOf(lockHarness, key)]
    const patch = (/** @type {any} */ v1, tag) =>
      v1('PATCH', '/v1/sites/lantern.localhost/records/post/42', key, {
        body: { fields: { post_content: '<p>mine</p>' } },
        headers: { 'if-match': tag }
      })
    // Stale at Tracy's read (V3), and stale only at the plugin's lock (V8).
    atRead.records['post:42'].body = BODY_B
    atLock.onWrite(() => {
      atLock.records['post:42'].body = BODY_B
    })

    const v3 = await patch(readHarness, tagRead)
    const v8 = await patch(lockHarness, tagLock)

    const [a, b] = [await v3.json(), await v8.json()]
    assert.deepEqual([v3.status, v8.status], [412, 412])
    assert.equal(b.error.code, 'REVISION_STALE')
    assert.equal(b.error.message, a.error.message)
    assert.doesNotMatch(b.error.message, /content\.get/)
  }
)
