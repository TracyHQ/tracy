import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { updateFeedRoutes } from '../src/desktop/update-feed.js'
import {
  DOWNLOAD_COOKIE,
  DOWNLOAD_WINDOW_SECONDS,
  downloadToken,
  installerMetadata,
  recordDownload
} from '../src/lib/desktop-download.js'
import { fileDb } from './_db.mjs'
import { mintSession } from '../src/lib/session.js'

const FILE = 'dev/0.3.0-dev.1/build-1/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.dmg'
const UUID = '3b2f9cbd-80a6-5c1e-9a8b-0123456789ab'
const TOKEN = `${UUID}.1800000000`
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pg = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

function feed({ record = async () => {}, status = 200, log = { warn() {} } } = {}) {
  const app = updateFeedRoutes({
    getObject: async (_, method) => new Response(method === 'HEAD' ? null : 'installer bytes', { status }),
    record: null,
    recordDownload: record,
    log
  })
  return (name = FILE, options = {}, query = '') =>
    app.fetch(new Request(`https://update.tracy.test/desktop/${name}${query}`, options))
}

test('artifact metadata uses the served release path and permits unknown flat-name fields', () => {
  assert.deepEqual(installerMetadata(FILE), {
    file: FILE,
    channel: 'dev',
    version: '0.3.0-dev.1',
    platform: 'macos',
    arch: 'arm64'
  })
  assert.deepEqual(installerMetadata('Tracy-Cowork-0.3.0-x64.dmg'), {
    file: 'Tracy-Cowork-0.3.0-x64.dmg',
    channel: 'stable',
    version: '0.3.0',
    platform: 'macos',
    arch: 'x64'
  })
  assert.equal(installerMetadata('other.dmg').version, null)
  for (const name of ['../x.dmg', 'dev/1/build/x.dmg', 'app.zip', 'stable-mac.yml'])
    assert.equal(installerMetadata(name), null)
})

test('retry token expires after a fixed 15 minutes, rejecting malformed and future tokens', () => {
  const now = 1_800_000_000_000
  const cookie = `${DOWNLOAD_COOKIE}=${TOKEN}`
  assert.deepEqual(downloadToken(cookie, now + 10_000), { value: TOKEN, maxAge: 890 })
  assert.notEqual(downloadToken(cookie, now + DOWNLOAD_WINDOW_SECONDS * 1000).value, TOKEN)
  assert.notEqual(downloadToken(cookie, now - 1_000).value, TOKEN)
  assert.match(downloadToken(`${DOWNLOAD_COOKIE}=bad`, now).value, /^[0-9a-f-]+\.1800000000$/)
})

test('installer GET sets a private short-lived retry cookie and leaves ZIP caching untouched', async () => {
  const seen = []
  const ask = feed({ record: async (request) => seen.push(request) })
  const first = await ask()
  assert.equal(first.status, 200)
  assert.equal(await first.text(), 'installer bytes')
  assert.equal(first.headers.get('cache-control'), 'no-store')
  const cookie = first.headers.get('set-cookie')
  assert.match(cookie, /Path=\/desktop; Max-Age=900; HttpOnly; SameSite=Lax; Secure$/)
  await ask(FILE, { headers: { cookie: cookie.split(';')[0] } })
  assert.equal(seen[0].token, seen[1].token)
  const zip = await ask(FILE.replace('.dmg', '.zip'))
  assert.match(zip.headers.get('cache-control'), /immutable/)
  assert.equal(zip.headers.get('set-cookie'), null)
  assert.equal(seen.length, 2)
})

test('HEAD, range requests, ZIPs, failed storage responses and partial responses are not counted', async () => {
  const seen = []
  const record = async (request) => seen.push(request)
  const ask = feed({ record })
  await ask(FILE, { method: 'HEAD' })
  await ask(FILE, { headers: { range: 'bytes=0-999' } })
  await ask(FILE.replace('.dmg', '.zip'))
  assert.equal((await feed({ record, status: 404 })()).status, 404)
  assert.equal((await feed({ record, status: 503 })()).status, 502)
  await feed({ record, status: 206 })()
  assert.equal(seen.length, 0)
})

test('tracking failure or a stalled recorder cannot prevent the installer response', async () => {
  const warnings = []
  const log = { warn: (value) => warnings.push(value) }
  for (const record of [
    async () => {
      throw new Error('db unavailable')
    },
    () => new Promise(() => {})
  ]) {
    const start = Date.now()
    const response = await feed({ record, log })()
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'installer bytes')
    assert.ok(Date.now() - start < 2000)
  }
  assert.equal(warnings.length, 2)
})

test('one artifact/token pair writes once, another artifact or token counts separately', pg, async () => {
  const request = { file: FILE, token: TOKEN }
  assert.equal(await recordDownload(db.pool, request), true)
  assert.equal(await recordDownload(db.pool, request), false)
  assert.equal(await recordDownload(db.pool, { ...request, token: `${UUID}.1800000900` }), true)
  assert.equal(await recordDownload(db.pool, { ...request, file: FILE.replace('build-1', 'build-2') }), true)
  assert.equal((await db.pool.query('select count(*)::int as n from desktop_download')).rows[0].n, 3)
})

test(
  'direct requests never trust account/install claims; source is sanitized, version uses the path',
  pg,
  async () => {
    await recordDownload(db.pool, {
      file: FILE,
      token: TOKEN,
      accountId: UUID,
      installId: UUID,
      version: 'spoofed',
      params: new URLSearchParams(
        'account_id=' +
          UUID +
          '&install_id=' +
          UUID +
          '&utm_source=Email%3Cscript%3E&utm_medium=spam&utm_campaign=Campaign'
      )
    })
    const [row] = (await db.pool.query('select * from desktop_download')).rows
    assert.equal(row.account_id, null)
    assert.equal(row.install_id, null)
    assert.equal(row.version, '0.3.0-dev.1')
    assert.deepEqual(row.source, { source: 'emailscript', medium: 'other', campaign: 'campaign' })
    assert.equal(await recordDownload(db.pool, { file: '../secret.dmg', token: TOKEN }), false)
    assert.equal(await recordDownload(db.pool, { file: FILE, token: 'not-a-token' }), false)
  }
)

test('route plus database preserves retry dedupe and leaves install/user counts unchanged', pg, async () => {
  const ask = feed({ record: (request) => recordDownload(db.pool, request) })
  const first = await ask()
  const cookie = first.headers.get('set-cookie').split(';')[0]
  await ask(FILE, { headers: { cookie, 'x-user-staging-id': UUID } })
  await ask(FILE, { headers: { cookie, range: 'bytes=0-' } })
  await ask(FILE, { method: 'HEAD' })
  assert.equal((await db.pool.query('select count(*)::int as n from desktop_download')).rows[0].n, 1)
  assert.equal((await db.pool.query('select count(*)::int as n from desktop_install')).rows[0].n, 0)
  assert.equal((await db.pool.query('select count(*)::int as n from account')).rows[0].n, 0)
})

test(
  'the real app wires installer tracking before session middleware without inferring identity',
  pg,
  async () => {
    const config = readConfig({
      TRACY_ORIGIN: 'https://cowork.tracy.test',
      SITE_DOMAIN: 'tracy.test',
      SESSION_SECRET: 's'.repeat(32),
      UPDATE_ORIGIN: 'https://update.tracy.test',
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://host',
      HOST_local_DSH_ORIGIN: 'http://dsh',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      ARTIFACT_S3_ENDPOINT: 'http://store.test:9000',
      ARTIFACT_S3_BUCKET: 'tracy-artifacts',
      ARTIFACT_S3_ACCESS_KEY: 'ak',
      ARTIFACT_S3_SECRET_KEY: 'sk',
      RELEASES_S3_BUCKET: 'tracy-releases'
    })
    const account = (
      await db.pool.query("insert into account (email) values ('person@tracy.test') returning id")
    ).rows[0].id
    await db.pool.query(
      "insert into desktop_install (install_id, channel, account_id) values ($1, 'dev', $2)",
      [UUID, account]
    )
    const app = buildApp({
      config,
      pool: db.pool,
      mail: { send: async () => {} },
      fetchImpl: async () => new Response('DMG bytes', { status: 200 })
    })
    const session = await mintSession('person@tracy.test', config.sessionSecret)
    const response = await app.fetch(
      new Request(`https://update.tracy.test/desktop/${FILE}`, {
        headers: { cookie: `tracy_sess=${session}`, 'x-user-staging-id': UUID }
      })
    )
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'DMG bytes')
    const [download] = (await db.pool.query('select * from desktop_download')).rows
    assert.equal(download.file, FILE)
    assert.equal(download.account_id, null)
    assert.equal(download.install_id, null)
  }
)

// ── Windows and Linux installers (tasks/todo-desktop-windows.md §4, agent S) ────────────────────
// On Windows and Linux the installer IS the update payload: NsisUpdater/AppImageUpdater download the
// same exe/AppImage a person downloads from /download. electron-updater sends the app's request
// headers (`App-Name`, `App-Version`, … from the app's `updateHeaders`) on that download; a browser
// sends neither. Only a GET without them is a download.
const WIN = 'stable/0.4.0/b-7/Tracy-Cowork-0.4.0-win-arm64-setup.exe'
const APPIMAGE = 'dev/0.4.0-dev.2/b-7/Tracy-Cowork-Dev-0.4.0-dev.2-linux-x64.AppImage'
const DEB = 'Tracy-Cowork-0.4.0-linux-arm64.deb'
const UPDATER = { 'app-name': 'Tracy Cowork', 'app-version': '0.3.9', 'x-arch': 'arm64', accept: '*/*' }

test('Windows and Linux installer names give platform, arch, channel and version', () => {
  assert.deepEqual(installerMetadata(WIN), {
    file: WIN,
    channel: 'stable',
    version: '0.4.0',
    platform: 'windows',
    arch: 'arm64'
  })
  assert.deepEqual(installerMetadata(APPIMAGE), {
    file: APPIMAGE,
    channel: 'dev',
    version: '0.4.0-dev.2',
    platform: 'linux',
    arch: 'x64'
  })
  assert.deepEqual(installerMetadata(DEB), {
    file: DEB,
    channel: 'stable',
    version: '0.4.0',
    platform: 'linux',
    arch: 'arm64'
  })
  assert.deepEqual(installerMetadata('other.exe'), {
    file: 'other.exe',
    channel: null,
    version: null,
    platform: 'windows',
    arch: null
  })
  for (const name of ['x.exe.blockmap', 'x.appimage', 'x.rpm', 'x.msi'])
    assert.equal(installerMetadata(name), null, name)
})

test('a browser GET of an exe, AppImage or deb counts; the updater fetching the same file does not', async () => {
  const seen = []
  const ask = feed({ record: async (request) => seen.push(request.file) })
  for (const file of [WIN, APPIMAGE, DEB]) {
    const browser = await ask(file, {}, '?utm_source=newsletter')
    assert.equal(browser.status, 200, file)
    assert.equal(browser.headers.get('cache-control'), 'no-store', file)
    assert.match(browser.headers.get('set-cookie'), /^tracy_download_request=/)
    const updater = await ask(file, { headers: UPDATER })
    assert.equal(updater.status, 200, file)
    assert.equal(await updater.text(), 'installer bytes')
    assert.equal(updater.headers.get('cache-control'), 'no-store', file)
    assert.equal(updater.headers.get('set-cookie'), null, file)
    // Either header alone marks the updater.
    await ask(file, { headers: { 'app-name': 'Tracy Cowork' } })
    await ask(file, { headers: { 'app-version': '0.3.9' } })
  }
  assert.deepEqual(seen, [WIN, APPIMAGE, DEB])
})

test('Windows and Linux downloads are stored with platform, arch and source', pg, async () => {
  const ask = feed({ record: (request) => recordDownload(db.pool, request) })
  await ask(WIN, {}, '?utm_source=newsletter&utm_medium=email')
  await ask(APPIMAGE)
  await ask(APPIMAGE, { headers: UPDATER })
  const { rows } = await db.pool.query(
    'select file, channel, version, platform, arch, source from desktop_download order by file'
  )
  assert.deepEqual(
    rows.map((r) => [r.file, r.channel, r.version, r.platform, r.arch]),
    [
      [APPIMAGE, 'dev', '0.4.0-dev.2', 'linux', 'x64'],
      [WIN, 'stable', '0.4.0', 'windows', 'arm64']
    ]
  )
  assert.equal(rows[1].source.source, 'newsletter')
  assert.equal(rows[1].source.medium, 'email')
})
