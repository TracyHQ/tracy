/**
 * The quickstart download door (`src/quickstarts/download.js`): a signed-in person gets the
 * quickstart zip of a JoomlArt template streamed off a private GitHub release, and the GitHub
 * token never leaves this server.
 *
 *   node --test apps/tracy-web/test/quickstart-download.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR } from '../src/lib/policy.js'
import { mintSession } from '../src/lib/session.js'
import { quickstartAsset, quickstartDownloadRoutes } from '../src/quickstarts/download.js'

const sha = (c) => c.repeat(64)

const release = (assets, version = '1.0.0') => ({
  tag: 'quickstart/ja-kinetic/j6',
  assets,
  setting: { platform: 'joomla', version, install: {} }
})

test('quickstartAsset: the one `*-quickstart-x.y.z.zip` of a release, with its API address and GitHub digest', () => {
  const found = quickstartAsset(
    release([
      { name: 'ja-kinetic-j6-webroot-1.0.4.tar.gz', size: 10, id: 1 },
      { name: 'ja-kinetic-j6-quickstart-1.0.0.zip', size: 55, id: 42, digest: `sha256:${sha('a')}` },
      { name: 'tracy_setting.json', size: 3, id: 3 }
    ])
  )
  assert.deepEqual(found, {
    name: 'ja-kinetic-j6-quickstart-1.0.0.zip',
    size: 55,
    apiUrl: 'https://api.github.com/repos/JoomlArt-Products/joomlart-products/releases/assets/42',
    sha256: sha('a')
  })
})

test('quickstartAsset: among several, the one whose version is the setting version, else the highest', () => {
  const three = [
    { name: 'ja-kinetic-j6-quickstart-1.0.0.zip', size: 1, id: 1 },
    { name: 'ja-kinetic-j6-quickstart-1.0.10.zip', size: 2, id: 2 },
    { name: 'ja-kinetic-j6-quickstart-1.0.9.zip', size: 3, id: 3 }
  ]
  assert.equal(quickstartAsset(release(three, '1.0.9')).name, 'ja-kinetic-j6-quickstart-1.0.9.zip')
  // The setting pins 1.0.4 (the stand's real `quickstart/ja-kinetic/j6`): no such zip, so the newest.
  assert.equal(quickstartAsset(release(three, '1.0.4')).name, 'ja-kinetic-j6-quickstart-1.0.10.zip')
})

test('quickstartAsset: no digest → sha256 null; no quickstart zip or no asset id → null', () => {
  assert.equal(
    quickstartAsset(release([{ name: 'ja-kinetic-j6-quickstart-1.0.0.zip', size: 1, id: 1 }])).sha256,
    null
  )
  assert.equal(
    quickstartAsset(release([{ name: 'ja-kinetic-j6-webroot-1.0.0.tar.gz', size: 1, id: 1 }])),
    null
  )
  assert.equal(
    quickstartAsset(release([{ name: 'ja-kinetic-j6-quickstart-1.0.0.zip', size: 1, id: null }])),
    null
  )
  assert.equal(quickstartAsset({ tag: 't', assets: [], setting: null }), null)
})

// ---------------------------------------------------------------------------------------------
// The door.

const TOKEN = 'ghp_never_leaves_the_server'
const ENV = {
  TRACY_ORIGIN: 'https://cowork.example',
  SITE_DOMAIN: 'example',
  SESSION_SECRET: 'quickstart-download-session-secret',
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  TRACY_RELEASES_GITHUB_TOKEN: TOKEN
}
const TAG = 'quickstart/ja-kinetic/j6'
const ZIP = 'ja-kinetic-j6-quickstart-1.0.0.zip'
const ASSET_URL = `https://api.github.com/repos/JoomlArt-Products/joomlart-products/releases/assets/42`
const BYTES = Buffer.from('PK\u0003\u0004 not really a zip, but exactly these bytes')
const DOOR = '/api/quickstarts/ja-kinetic/j6/quickstart.zip'

/** One `quickstart_releases` row as the table holds it (`readReleases` reads these columns). */
function row({ tag = TAG, tracy = 'ready', assets, version = '1.0.0' } = {}) {
  return {
    tag,
    release: {
      name: `Quickstart: ${tag}`,
      kind: 'quickstart',
      github: 'published',
      publishedAt: '2026-09-14T19:33:55Z',
      assets: assets ?? [
        { name: 'ja-kinetic-j6-webroot-1.0.4.tar.gz', size: 10, id: 1 },
        { name: ZIP, size: BYTES.length, id: 42, digest: `sha256:${sha('a')}` }
      ]
    },
    setting: {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Kinetic',
      version,
      cms: '6.0.3',
      template: 'ja_kinetic',
      install: {
        webroot: { file: 'ja-kinetic-j6-webroot-1.0.4.tar.gz', sha256: sha('b') },
        database: { file: 'ja-kinetic-j6-database-1.0.4.sql.gz', sha256: sha('c') }
      }
    },
    inspiration: null,
    inspiration_hidden: false,
    pages: null,
    tracy,
    reason: tracy === 'ready' ? null : 'No tracy_setting.json among the assets.',
    fetched_at: new Date()
  }
}

/**
 * The two statements the door issues, on memory: the catalogue read `readReleases` does, and the
 * one insert that counts the hour and writes the row together (no row back = over the limit).
 */
function fakePool({ releases = [row()], broken = false } = {}) {
  const downloads = []
  const query = async (text, values = []) => {
    if (broken) throw new Error('connection refused')
    if (/from quickstart_releases/i.test(text)) return { rows: releases.map((r) => ({ ...r })) }
    if (/^\s*insert into quickstart_download/i.test(text)) {
      const [id, accountId, tag, limit, referrer] = values
      const hourAgo = Date.now() - 60 * 60 * 1000
      const recent = downloads.filter((d) => d.account_id === accountId && d.at > hourAgo).length
      if (recent >= limit) return { rows: [] }
      downloads.push({ id, account_id: accountId, tag, at: Date.now(), referrer })
      return { rows: [{ id }] }
    }
    throw new Error(`fake pool: unexpected statement ${text}`)
  }
  return { query, downloads }
}

/**
 * GitHub, as much as the door touches: the asset by API address (200 with the bytes, or a 302 to
 * wherever the test says), and the object store the 302 points at. Every request is recorded with
 * the headers it carried — "the token never went there" is the assertion.
 */
function github({ redirectTo = null, objectHost = 'https://objects.githubusercontent.com' } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    calls.push({ url: u, headers: new Headers(init.headers ?? {}), redirect: init.redirect })
    if (u === ASSET_URL) {
      if (redirectTo) return new Response(null, { status: 302, headers: { location: redirectTo } })
      return new Response(BYTES, { status: 200, headers: { 'content-length': String(BYTES.length) } })
    }
    if (u.startsWith(`${objectHost}/`))
      return new Response(BYTES, {
        status: 200,
        headers: { 'content-length': String(BYTES.length), 'set-cookie': 'leak=1' }
      })
    return new Response('not here', { status: 404 })
  }
  return { fetchImpl, calls }
}

async function harness({ pool = fakePool(), gh = github(), signedIn = 'ana@example.com' } = {}) {
  const config = readConfig(ENV)
  const identity = memoryIdentityStore()
  const account = signedIn ? await identity.touchAccount(signedIn) : null
  const app = quickstartDownloadRoutes({ pool, config, identity, fetchImpl: gh.fetchImpl })
  const cookie = signedIn ? `tracy_sess=${await mintSession(signedIn, config.sessionSecret)}` : null
  const get = (path = DOOR, init = {}) =>
    app.request(path, { ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } })
  return { app, get, pool, gh, account, config, identity }
}

test('no session → 401, and GitHub is never asked', async () => {
  const { get, gh } = await harness({ signedIn: null })
  const res = await get()
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'NOT_SIGNED_IN')
  assert.equal(gh.calls.length, 0)
})

test('a tag not in the catalogue, or one Tracy cannot read → 404 QUICKSTART_NOT_AVAILABLE', async () => {
  const unknown = await harness()
  const res = await unknown.get('/api/quickstarts/ja-nope/j6/quickstart.zip')
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'QUICKSTART_NOT_AVAILABLE' })

  const off = await harness({ pool: fakePool({ releases: [row({ tracy: 'no-setting' })] }) })
  const refused = await off.get()
  assert.equal(refused.status, 404)
  assert.deepEqual(await refused.json(), { error: 'QUICKSTART_NOT_AVAILABLE' })
  assert.equal(off.gh.calls.length, 0, 'nothing was fetched')
  assert.equal(off.pool.downloads.length, 0, 'nothing was counted')
})

test('a catalogue that cannot be read → 503', async () => {
  const { get } = await harness({ pool: fakePool({ broken: true }) })
  const res = await get()
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: 'CATALOGUE_UNAVAILABLE' })
})

test('signed in → the exact bytes, streamed, with the download headers; the token goes to GitHub only', async () => {
  const { get, gh, pool, account } = await harness()
  const res = await get()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/zip')
  assert.equal(res.headers.get('content-length'), String(BYTES.length))
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="${ZIP}"`)
  assert.equal(res.headers.get('x-tracy-sha256'), sha('a'))
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('set-cookie'), null)
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), BYTES)
  assert.equal(gh.calls.length, 1)
  assert.equal(gh.calls[0].url, ASSET_URL)
  assert.equal(gh.calls[0].headers.get('authorization'), `Bearer ${TOKEN}`)
  assert.equal(gh.calls[0].headers.get('accept'), 'application/octet-stream')
  assert.equal(gh.calls[0].redirect, 'manual')
  assert.deepEqual(
    pool.downloads.map((d) => [d.account_id, d.tag]),
    [[account.id, TAG]],
    'one row written, for this account and tag'
  )
})

test('GitHub answers 302 to its object store → followed once, WITHOUT the token; nothing of the hop reaches the person', async () => {
  const gh = github({ redirectTo: 'https://objects.githubusercontent.com/github-production/42?sig=x' })
  const { get } = await harness({ gh })
  const res = await get()
  assert.equal(res.status, 200)
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), BYTES)
  assert.equal(res.headers.get('set-cookie'), null)
  assert.equal(res.headers.get('location'), null)
  assert.equal(gh.calls.length, 2)
  assert.equal(gh.calls[1].url, 'https://objects.githubusercontent.com/github-production/42?sig=x')
  assert.equal(gh.calls[1].headers.get('authorization'), null, 'the token stays with api.github.com')
  assert.equal(gh.calls[1].headers.get('accept'), 'application/octet-stream')
})

test('GitHub answers 302 to a foreign host → 502, the hop is not taken and no header carries the token', async () => {
  for (const foreign of ['https://evil.example/asset', 'http://objects.githubusercontent.com/plain']) {
    const gh = github({ redirectTo: foreign })
    const { get } = await harness({ gh })
    const res = await get()
    assert.equal(res.status, 502, foreign)
    assert.deepEqual(await res.json(), { error: 'UPSTREAM_FAILED' })
    assert.equal(res.headers.get('location'), null)
    assert.equal(gh.calls.length, 1, `${foreign}: the redirect was not followed`)
    for (const call of gh.calls)
      if (call.url !== ASSET_URL) assert.equal(call.headers.get('authorization'), null)
  }
})

test('a redirect whose target answers with another redirect → 502 (one hop, never two)', async () => {
  const gh = github({ redirectTo: 'https://objects.githubusercontent.com/again' })
  const inner = gh.fetchImpl
  const hops = []
  gh.fetchImpl = async (url, init) => {
    hops.push(String(url))
    return String(url) === 'https://objects.githubusercontent.com/again'
      ? new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/x' } })
      : inner(url, init)
  }
  const { get } = await harness({ gh })
  const res = await get()
  assert.equal(res.status, 502)
  assert.deepEqual(hops, [ASSET_URL, 'https://objects.githubusercontent.com/again'])
})

test('the 11th download in an hour → 429 before anything is fetched', async () => {
  const { get, gh } = await harness()
  for (let i = 0; i < QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential downloads, by design.
    const res = await get()
    assert.equal(res.status, 200)
    // eslint-disable-next-line no-await-in-loop -- same.
    await res.arrayBuffer()
  }
  assert.equal(gh.calls.length, QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR)
  const over = await get()
  assert.equal(over.status, 429)
  assert.deepEqual(await over.json(), { error: 'RATE_LIMITED' })
  assert.equal(gh.calls.length, QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR, 'nothing more was fetched')
})

test('a third stream for one account while two are open → 429, and the slot frees when a stream ends', async () => {
  // Upstream bodies that do not end until the test says so.
  const gates = []
  const gh = github()
  gh.fetchImpl = async (url, init) => {
    gh.calls.push({ url: String(url), headers: new Headers(init.headers ?? {}) })
    let open
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(BYTES.subarray(0, 4))
        open = () => {
          controller.enqueue(BYTES.subarray(4))
          controller.close()
        }
      }
    })
    gates.push(() => open())
    return new Response(body, { status: 200 })
  }
  const { get, pool } = await harness({ gh })
  const first = await get()
  const second = await get()
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const third = await get()
  assert.equal(third.status, 429)
  assert.deepEqual(await third.json(), { error: 'TOO_MANY_STREAMS' })
  assert.equal(pool.downloads.length, 2, 'the refused stream was not counted against the hour')
  gates[0]()
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), BYTES)
  const fourth = await get()
  assert.equal(fourth.status, 200, 'the slot of the finished stream is free again')
  gates[1]()
  gates[2]()
  await second.arrayBuffer()
  await fourth.arrayBuffer()
})

test('an asset GitHub states no digest for → no x-tracy-sha256 header, size from the catalogue', async () => {
  const pool = fakePool({ releases: [row({ assets: [{ name: ZIP, size: BYTES.length, id: 42 }] })] })
  const gh = github()
  const inner = gh.fetchImpl
  // An upstream that states no length either: the catalogue's size is what the person gets.
  gh.fetchImpl = async (url, init) => {
    const res = await inner(url, init)
    return new Response(res.body, { status: res.status })
  }
  const { get } = await harness({ pool, gh })
  const res = await get()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-tracy-sha256'), null)
  assert.equal(res.headers.get('content-length'), String(BYTES.length))
  await res.arrayBuffer()
})

test('a template or cms spelled outside a tag part → 404 without reading anything', async () => {
  const { get, pool } = await harness()
  pool.query = async () => assert.fail('nothing should be read')
  // eslint-disable-next-line no-await-in-loop -- a handful of paths.
  for (const path of [
    '/api/quickstarts/JA-Kinetic/j6/quickstart.zip',
    '/api/quickstarts/ja%2Fkinetic/j6/quickstart.zip'
  ])
    assert.equal((await get(path)).status, 404, path)
})

test('the person closes the connection → the upstream fetch is aborted with it', async () => {
  const gh = github()
  const inner = gh.fetchImpl
  const signals = []
  gh.fetchImpl = async (url, init) => {
    signals.push(init.signal)
    return inner(url, init)
  }
  const { get } = await harness({ gh })
  const client = new AbortController()
  const res = await get(DOOR, { signal: client.signal })
  assert.equal(res.status, 200)
  assert.equal(signals[0].aborted, false)
  client.abort()
  assert.equal(signals[0].aborted, true, 'the abort reached GitHub')
})

// ---------------------------------------------------------------------------------------------
// The hour, on a real Postgres: the migration and the one statement that writes and counts.

import { after, before, beforeEach } from 'node:test'
import { pgIdentityStore } from '../src/identity/store.js'
import { fileDb } from './_db.mjs'

test('the referring page the landing passed is stored with the row; anything else is stored as null and still served', async () => {
  const page = 'https://www.joomlart.com/joomla/templates/ja-kinetic'
  const { get, pool } = await harness()
  const ok = await get(`${DOOR}?ref=${encodeURIComponent(page)}`)
  assert.equal(ok.status, 200)
  await ok.arrayBuffer()
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,x',
    `https://x.example/${'a'.repeat(600)}`,
    'nope'
  ]) {
    const res = await get(`${DOOR}?ref=${encodeURIComponent(bad)}`)
    assert.equal(res.status, 200, bad)
    await res.arrayBuffer()
  }
  const none = await get()
  await none.arrayBuffer()
  assert.deepEqual(
    pool.downloads.map((d) => d.referrer),
    [page, null, null, null, null, null]
  )
})

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pg = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test(
  'on Postgres: ten downloads an hour per account, counted in the table; an hour later the slot is back',
  pg,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [TAG, JSON.stringify(row().release), JSON.stringify(row().setting)]
    )
    const email = 'ana@example.com'
    const accountId = (await pool.query('insert into account (email) values ($1) returning id', [email]))
      .rows[0].id
    await pool.query("insert into account (email) values ('bo@example.com')")
    const config = readConfig(ENV)
    const gh = github()
    const app = quickstartDownloadRoutes({
      pool,
      config,
      identity: pgIdentityStore(pool),
      fetchImpl: gh.fetchImpl
    })
    const cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    const get = (ref = 'https://www.joomlart.com/') =>
      app.request(`${DOOR}?ref=${encodeURIComponent(ref)}`, { headers: { cookie } })

    for (let i = 0; i < QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential, by design.
      const res = await get()
      assert.equal(res.status, 200, `download ${i + 1}`)
      // eslint-disable-next-line no-await-in-loop -- same.
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), BYTES)
    }
    assert.equal((await get()).status, 429)
    const { rows } = await pool.query(
      'select account_id, tag, count(*)::int as n from quickstart_download group by account_id, tag'
    )
    assert.deepEqual(rows, [
      { account_id: accountId, tag: TAG, n: QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR }
    ])
    const referrers = await pool.query('select distinct referrer from quickstart_download')
    assert.deepEqual(referrers.rows, [{ referrer: 'https://www.joomlart.com/' }])
    assert.equal(
      gh.calls.length,
      QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR,
      'the refused one fetched nothing'
    )
    // Another account is its own bucket.
    const bo = `tracy_sess=${await mintSession('bo@example.com', config.sessionSecret)}`
    const theirs = await app.request(DOOR, { headers: { cookie: bo } })
    assert.equal(theirs.status, 200)
    await theirs.arrayBuffer()
    // Rows older than an hour no longer count.
    await pool.query(
      "update quickstart_download set at = now() - interval '61 minutes' where account_id = $1",
      [accountId]
    )
    const again = await get()
    assert.equal(again.status, 200)
    await again.arrayBuffer()
  }
)
