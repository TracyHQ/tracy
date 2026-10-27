/**
 * The desktop app's update feed (tasks/todo-desktop-auto-update.md): `update.<zone>/desktop/*` is
 * streamed read-only from the `tracy-releases` bucket; every channel-file read records the asking
 * install in `desktop_install`; a signed-in app links its install id to the person; `/ops` lists them.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/desktop-update.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const ORIGIN = 'https://cowork.tracy.test'
const FEED = 'https://update.tracy.test/desktop'
const ID = '3b2f9cbd-80a6-5c1e-9a8b-0123456789ab'
const YML = 'version: 0.2.1\nfiles:\n  - url: Tracy-Cowork-Dev-0.2.1-arm64.zip\n'

const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1',
  UPDATE_ORIGIN: 'https://update.tracy.test',
  ARTIFACT_S3_ENDPOINT: 'http://store.test:9000',
  ARTIFACT_S3_BUCKET: 'tracy-artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'ak',
  ARTIFACT_S3_SECRET_KEY: 'sk',
  RELEASES_S3_BUCKET: 'tracy-releases'
}

/** The object store: what each key holds, and every request it received. */
function fakeStore(objects) {
  const seen = []
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url)
    seen.push({ method: init.method ?? 'GET', path: u.pathname, auth: Boolean(init.headers?.authorization) })
    if (u.host !== 'store.test:9000') return Response.json({ error: 'unexpected' }, { status: 500 })
    const body = objects[u.pathname]
    if (body === undefined) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
    return new Response(init.method === 'HEAD' ? null : body, {
      status: 200,
      headers: { 'content-length': String(Buffer.byteLength(body)), etag: '"abc"' }
    })
  }
  return { fetchImpl, seen }
}

function harness(pool, { objects = {}, envOverride = {} } = {}) {
  const config = readConfig({ ...env, ...envOverride })
  const store = fakeStore(objects)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: store.fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const feed = (file, { method = 'GET', headers = {} } = {}) =>
    app.fetch(new Request(`${FEED}/${file}`, { method, headers }))
  const askAsApp = (channel, id = ID, extra = {}) =>
    feed(`${channel}-mac.yml`, {
      headers: {
        'x-user-staging-id': id,
        'app-version': '0.2.0',
        'x-channel': channel,
        'x-arch': 'arm64',
        'x-os-version': '27.0.1',
        ...extra
      }
    })
  const link = (cookie, body, headers = {}) =>
    app.fetch(
      new Request(`${ORIGIN}/api/desktop/installs/link`, {
        method: 'POST',
        headers: {
          ...(cookie ? { cookie } : {}),
          'sec-fetch-site': 'same-origin',
          origin: ORIGIN,
          'content-type': 'application/json',
          ...headers
        },
        body: JSON.stringify(body)
      })
    )
  const installs = (cookie) =>
    app.fetch(
      new Request(`${ORIGIN}/api/ops/desktop/installs`, {
        redirect: 'manual',
        headers: cookie ? { cookie } : {}
      })
    )
  return { app, store, feed, askAsApp, link, installs, cookieFor }
}

async function seedStaff(pool, email, role) {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') on conflict (display_name) do update set kind = excluded.kind returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
}

test('the channel file is streamed from tracy-releases, never cached', opts, async () => {
  const { askAsApp, store } = harness(db.pool, { objects: { '/tracy-releases/desktop/dev-mac.yml': YML } })
  const response = await askAsApp('dev')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), YML)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.match(response.headers.get('content-type'), /^text\/yaml/)
  assert.deepEqual(store.seen, [{ method: 'GET', path: '/tracy-releases/desktop/dev-mac.yml', auth: true }])
})

test('a zip is streamed with its length and cached for good; HEAD answers without a body', opts, async () => {
  const name = 'Tracy-Cowork-Dev-0.2.1-arm64.zip'
  const { feed } = harness(db.pool, { objects: { [`/tracy-releases/desktop/${name}`]: 'PK-zip-bytes' } })
  const got = await feed(name)
  assert.equal(got.status, 200)
  assert.equal(await got.text(), 'PK-zip-bytes')
  assert.equal(got.headers.get('content-length'), '12')
  assert.equal(got.headers.get('content-type'), 'application/zip')
  assert.match(got.headers.get('cache-control'), /immutable/)
  const head = await feed(name, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '12')
})

test('only GET and HEAD of a plain file name under /desktop/ reach the store', opts, async () => {
  const { app, feed, store } = harness(db.pool)
  assert.equal((await feed('dev-mac.yml', { method: 'POST' })).status, 405)
  assert.equal((await feed('nothing-here.zip')).status, 404)
  for (const path of [
    '/desktop/',
    '/desktop/..%2Fsecret',
    '/desktop/a/b.zip',
    '/other/dev-mac.yml',
    '/login',
    '/api/ops/desktop'
  ])
    assert.equal((await app.fetch(new Request(`https://update.tracy.test${path}`))).status, 404, path)
  assert.deepEqual(
    store.seen.map((s) => s.path),
    ['/tracy-releases/desktop/nothing-here.zip']
  )
})

test(
  'a release file under <channel>/<version>/<build id>/ reaches the store; other nested paths do not',
  opts,
  async () => {
    const key = 'dev/0.3.0-dev.1/b-1/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip'
    const { app, feed, store } = harness(db.pool, {
      objects: { [`/tracy-releases/desktop/${key}`]: 'zip-bytes' }
    })
    const res = await feed(key)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    for (const path of [
      '/desktop/beta/0.3.0/b-1/a.zip',
      '/desktop/dev/0.3/b-1/a.zip',
      '/desktop/dev/0.3.0-dev.1/a.zip',
      '/desktop/dev/0.3.0-dev.1/b-1/x/a.zip',
      '/desktop/dev/0.3.0-dev.1/../a.zip',
      '/desktop/dev/0.3.0-dev.1/b-1/dev-mac.yml'
    ])
      assert.equal((await app.fetch(new Request(`https://update.tracy.test${path}`))).status, 404, path)
    assert.deepEqual(
      store.seen.map((s) => s.path),
      [`/tracy-releases/desktop/${key}`]
    )
  }
)

test(
  'every channel-file read records the install; a second read moves last_seen and the version',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'admin@tracy.test', 'admin')
    const h = harness(pool, { objects: { '/tracy-releases/desktop/dev-mac.yml': YML } })
    const admin = await h.cookieFor('admin@tracy.test')
    await h.askAsApp('dev')
    let [row] = (await (await h.installs(admin)).json()).installs
    assert.equal(row.installId, ID)
    assert.equal(row.channel, 'dev')
    assert.equal(row.version, '0.2.0')
    assert.equal(row.arch, 'arm64')
    assert.equal(row.osVersion, '27.0.1')
    assert.equal(row.email, null)
    await h.askAsApp('dev', ID, { 'app-version': '0.2.1' })
    ;[row] = (await (await h.installs(admin)).json()).installs
    assert.equal(row.version, '0.2.1')
    assert.ok(row.lastSeen >= row.firstSeen)
  }
)

test('a missing or malformed install id is not recorded, and the app still gets its file', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const h = harness(pool, { objects: { '/tracy-releases/desktop/stable-mac.yml': YML } })
  assert.equal((await h.askAsApp('stable', 'not-a-uuid')).status, 200)
  assert.equal((await h.feed('stable-mac.yml')).status, 200)
  assert.equal((await h.askAsApp('stable', ID, { 'app-version': 'x'.repeat(500) })).status, 200)
  const { installs } = await (await h.installs(await h.cookieFor('admin@tracy.test'))).json()
  assert.equal(installs.length, 1)
  assert.equal(installs[0].version, null)
})

test(
  'a signed-in app links its install to the person; nobody else and no other origin can',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'admin@tracy.test', 'admin')
    const h = harness(pool, { objects: { '/tracy-releases/desktop/dev-mac.yml': YML } })
    await h.askAsApp('dev')
    const person = await h.cookieFor('person@tracy.test')
    await pool.query("insert into account (email) values ('person@tracy.test')")

    assert.equal((await h.link(null, { installId: ID })).status, 401)
    assert.equal((await h.link(person, { installId: ID }, { 'sec-fetch-site': 'same-site' })).status, 403)
    assert.equal((await h.link(person, { installId: 'nope' })).status, 400)
    assert.equal((await h.link(person, { installId: '00000000-0000-4000-8000-000000000000' })).status, 404)
    assert.equal((await h.link(person, { installId: ID })).status, 204)

    const { installs } = await (await h.installs(await h.cookieFor('admin@tracy.test'))).json()
    assert.equal(installs[0].email, 'person@tracy.test')
    assert.ok(installs[0].linkedAt)
  }
)

test('/ops lists installs to Tracy staff only, newest first, as JSON and as a page', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const h = harness(pool, {
    objects: { '/tracy-releases/desktop/dev-mac.yml': YML, '/tracy-releases/desktop/stable-mac.yml': YML }
  })
  await h.askAsApp('dev')
  await h.askAsApp('stable', '11111111-2222-4333-8444-555555555555')
  assert.equal((await h.installs(null)).status, 302)
  assert.equal((await h.installs(await h.cookieFor('outsider@tracy.test'))).status, 403)
  const admin = await h.cookieFor('admin@tracy.test')
  const { installs } = await (await h.installs(admin)).json()
  assert.deepEqual(
    installs.map((i) => i.channel),
    ['stable', 'dev']
  )
  const page = await h.app.fetch(
    new Request(`${ORIGIN}/ops/desktop/installs`, { headers: { cookie: admin } })
  )
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /<table/)
  assert.match(html, /11111111-2222-4333-8444-555555555555/)
  assert.match(html, /0\.2\.0/)
})

test('without UPDATE_ORIGIN the update hostname is not a feed', opts, async () => {
  const h = harness(db.pool, {
    objects: { '/tracy-releases/desktop/dev-mac.yml': YML },
    envOverride: { UPDATE_ORIGIN: '' }
  })
  const response = await h.askAsApp('dev')
  assert.notEqual(await response.text(), YML)
})

// ── Windows and Linux (tasks/todo-desktop-windows.md §4, agent S) ────────────────────────────────
// electron-updater 6.8.9's generic provider names the channel file by platform: NsisUpdater reads
// `<channel>.yml`, AppImageUpdater/DebUpdater read `<channel>-linux.yml` on x64 and
// `<channel>-linux-arm64.yml` on arm64 (Provider.getChannelFilePrefix), MacUpdater `<channel>-mac.yml`.

/** What the app sends on a channel-file read, from any platform. */
const appHeaders = (extra = {}) => ({
  'x-user-staging-id': ID,
  'app-version': '0.4.0',
  'x-arch': 'x64',
  'x-os-version': '10.0.26100',
  ...extra
})

test('the Windows channel file is streamed with no-store and records the install as win', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const h = harness(pool, { objects: { '/tracy-releases/desktop/stable.yml': YML } })
  const res = await h.feed('stable.yml', { headers: appHeaders() })
  assert.equal(res.status, 200)
  assert.equal(await res.text(), YML)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.match(res.headers.get('content-type'), /^text\/yaml/)
  const [row] = (await (await h.installs(await h.cookieFor('admin@tracy.test'))).json()).installs
  assert.equal(row.platform, 'win')
  assert.equal(row.channel, 'stable')
  assert.equal(row.arch, 'x64')
  assert.equal(row.osVersion, '10.0.26100')
})

test(
  'the Linux channel files — x64 and arm64 — are streamed and record the install as linux',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'admin@tracy.test', 'admin')
    const ARM = '11111111-2222-4333-8444-555555555555'
    const h = harness(pool, {
      objects: {
        '/tracy-releases/desktop/dev-linux.yml': YML,
        '/tracy-releases/desktop/dev-linux-arm64.yml': YML
      }
    })
    for (const [file, headers] of [
      ['dev-linux.yml', appHeaders({ 'x-os-version': '6.8.0' })],
      [
        'dev-linux-arm64.yml',
        appHeaders({ 'x-user-staging-id': ARM, 'x-arch': 'arm64', 'x-os-version': '6.8.0' })
      ]
    ]) {
      const res = await h.feed(file, { headers })
      assert.equal(res.status, 200, file)
      assert.equal(await res.text(), YML)
      assert.equal(res.headers.get('cache-control'), 'no-store', file)
    }
    const { installs } = await (await h.installs(await h.cookieFor('admin@tracy.test'))).json()
    assert.deepEqual(
      installs.map((i) => [i.installId, i.platform, i.channel, i.arch]).sort(),
      [
        [ARM, 'linux', 'dev', 'arm64'],
        [ID, 'linux', 'dev', 'x64']
      ].sort()
    )
  }
)

test('each channel file has a detached signature, served with no-store and never counted', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const files = ['stable-mac.yml.sig', 'stable.yml.sig', 'dev-linux.yml.sig', 'dev-linux-arm64.yml.sig']
  const h = harness(pool, {
    objects: Object.fromEntries(files.map((f) => [`/tracy-releases/desktop/${f}`, `sig of ${f}`]))
  })
  for (const file of files) {
    const res = await h.feed(file, { headers: appHeaders() })
    assert.equal(res.status, 200, file)
    assert.equal(await res.text(), `sig of ${file}`)
    assert.equal(res.headers.get('cache-control'), 'no-store', file)
    assert.equal(res.headers.get('content-type'), 'application/octet-stream', file)
  }
  const { installs } = await (await h.installs(await h.cookieFor('admin@tracy.test'))).json()
  assert.deepEqual(installs, [])
})

test(
  'exe, AppImage and deb stream flat or from a release folder, uncached, and an updater GET counts as nothing',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'admin@tracy.test', 'admin')
    const files = {
      'stable/0.4.0/b-7/Tracy-Cowork-0.4.0-win-x64-setup.exe':
        'application/vnd.microsoft.portable-executable',
      'stable/0.4.0/b-7/Tracy-Cowork-0.4.0-win-arm64-setup.exe':
        'application/vnd.microsoft.portable-executable',
      'dev/0.4.0-dev.2/b-7/Tracy-Cowork-Dev-0.4.0-dev.2-linux-x64.AppImage': 'application/vnd.appimage',
      'stable/0.4.0/b-7/Tracy-Cowork-0.4.0-linux-arm64.deb': 'application/vnd.debian.binary-package',
      'Tracy-Cowork-0.4.0-win-x64-setup.exe': 'application/vnd.microsoft.portable-executable',
      'Tracy-Cowork-0.4.0-linux-arm64.AppImage': 'application/vnd.appimage',
      'Tracy-Cowork-0.4.0-linux-x64.deb': 'application/vnd.debian.binary-package'
    }
    const h = harness(pool, {
      objects: Object.fromEntries(Object.keys(files).map((f) => [`/tracy-releases/desktop/${f}`, 'bytes']))
    })
    for (const [file, type] of Object.entries(files)) {
      const res = await h.feed(file, { headers: appHeaders() })
      assert.equal(res.status, 200, file)
      assert.equal(await res.text(), 'bytes')
      assert.equal(res.headers.get('content-type'), type, file)
      assert.equal(res.headers.get('cache-control'), 'no-store', file)
      assert.equal(res.headers.get('set-cookie'), null, file)
    }
    const { installs } = await (await h.installs(await h.cookieFor('admin@tracy.test'))).json()
    assert.deepEqual(installs, [])
    assert.equal((await pool.query('select count(*)::int as n from desktop_download')).rows[0].n, 0)
  }
)

test('names outside the contract are refused before the store is asked', opts, async () => {
  const { app, store } = harness(db.pool)
  for (const name of [
    // electron-updater never asks for a blockmap with differential download off
    'Tracy-Cowork-0.4.0-win-x64-setup.exe.blockmap',
    'stable/0.4.0/b-7/Tracy-Cowork-0.4.0-win-x64-setup.exe.blockmap',
    // channel files of other channels or platforms electron-updater would name
    'latest.yml',
    'latest-mac.yml',
    'beta.yml',
    'stable-win.yml',
    'stable-linux-armv7l.yml',
    'stable-linux-ia32.yml',
    // a signature of anything but a channel file, or in a release folder
    'Tracy-Cowork-0.4.0-win-x64-setup.exe.sig',
    'stable/0.4.0/b-7/stable.yml.sig',
    'stable/0.4.0/b-7/stable.yml',
    // the release manifest and anything else
    'stable/0.4.0/b-7/manifest.json',
    'notes.txt',
    'Tracy-Cowork-0.4.0.msi',
    'Tracy-Cowork-0.4.0.rpm',
    'Tracy-Cowork-0.4.0.appimage'
  ])
    assert.equal((await app.fetch(new Request(`${FEED}/${name}`))).status, 404, name)
  assert.deepEqual(store.seen, [])
})

test('a Mac app gets byte-for-byte the answers it got before Windows and Linux', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const DMG = 'stable/0.3.0/b-1/Tracy-Cowork-0.3.0-universal.dmg'
  const ZIP = 'stable/0.3.0/b-1/Tracy-Cowork-0.3.0-arm64.zip'
  const h = harness(pool, {
    objects: {
      '/tracy-releases/desktop/stable-mac.yml': YML,
      [`/tracy-releases/desktop/${DMG}`]: 'dmg-bytes',
      [`/tracy-releases/desktop/${ZIP}`]: 'zip-bytes',
      '/tracy-releases/desktop/Tracy-Cowork-0.3.0-arm64.dmg': 'flat-dmg',
      '/tracy-releases/desktop/Tracy-Cowork-0.3.0-arm64.zip': 'flat-zip'
    }
  })
  const answer = async (res) => ({
    status: res.status,
    body: await res.text(),
    headers: Object.fromEntries([...res.headers].filter(([k]) => k !== 'set-cookie'))
  })
  const macHeaders = appHeaders({ 'x-arch': 'arm64', 'x-os-version': '15.5.0', 'app-version': '0.3.0' })
  // The literals below are what the feed answered on origin/feat/desktop-windows (981ad4fa6e).
  assert.deepEqual(await answer(await h.feed('stable-mac.yml', { headers: macHeaders })), {
    status: 200,
    body: YML,
    headers: {
      'cache-control': 'no-store',
      'content-length': String(Buffer.byteLength(YML)),
      'content-type': 'text/yaml; charset=utf-8',
      etag: '"abc"'
    }
  })
  for (const [file, body, cache] of [
    [ZIP, 'zip-bytes', 'public, max-age=31536000, immutable'],
    ['Tracy-Cowork-0.3.0-arm64.zip', 'flat-zip', 'public, max-age=31536000, immutable']
  ])
    assert.deepEqual(await answer(await h.feed(file, { headers: macHeaders })), {
      status: 200,
      body,
      headers: {
        'cache-control': cache,
        'content-length': String(body.length),
        'content-type': 'application/zip',
        etag: '"abc"'
      }
    })
  for (const [file, body] of [
    [DMG, 'dmg-bytes'],
    ['Tracy-Cowork-0.3.0-arm64.dmg', 'flat-dmg']
  ]) {
    const res = await h.feed(file)
    assert.match(res.headers.get('set-cookie'), /^tracy_download_request=/)
    assert.deepEqual(await answer(res), {
      status: 200,
      body,
      headers: {
        'cache-control': 'no-store',
        'content-length': String(body.length),
        'content-type': 'application/x-apple-diskimage',
        etag: '"abc"'
      }
    })
  }
  const [row] = (await (await h.installs(await h.cookieFor('admin@tracy.test'))).json()).installs
  assert.equal(row.platform, 'mac')
  assert.equal(row.version, '0.3.0')
  assert.equal((await pool.query('select count(*)::int as n from desktop_download')).rows[0].n, 2)
})

test('/ops/desktop/installs shows each install’s operating system, not a macOS column', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const h = harness(pool, {
    objects: {
      '/tracy-releases/desktop/stable-mac.yml': YML,
      '/tracy-releases/desktop/stable.yml': YML,
      '/tracy-releases/desktop/stable-linux-arm64.yml': YML
    }
  })
  await h.askAsApp('stable')
  await h.feed('stable.yml', {
    headers: appHeaders({ 'x-user-staging-id': '11111111-2222-4333-8444-555555555555' })
  })
  await h.feed('stable-linux-arm64.yml', {
    headers: appHeaders({
      'x-user-staging-id': '22222222-2222-4333-8444-555555555555',
      'x-arch': 'arm64',
      'x-os-version': '6.8.0'
    })
  })
  const page = await h.app.fetch(
    new Request(`${ORIGIN}/ops/desktop/installs`, {
      headers: { cookie: await h.cookieFor('admin@tracy.test') }
    })
  )
  const html = await page.text()
  assert.match(html, /<th align="left">OS<\/th>/)
  assert.doesNotMatch(html, /<th align="left">macOS<\/th>/)
  assert.match(html, /<td>macOS 27\.0\.1<\/td>/)
  assert.match(html, /<td>Windows 10\.0\.26100<\/td>/)
  assert.match(html, /<td>Linux 6\.8\.0<\/td>/)
})
