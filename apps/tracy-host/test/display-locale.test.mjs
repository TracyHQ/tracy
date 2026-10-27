// `POST /_host/display-locale` (display-locale.js): the language tag an EmDash site prints, written
// where its template reads it (`<privateRoot>/<label>/data/display-locale.json`, the container's
// `/app/data`). Apply runs the template's personalize tool from tracy-web, outside the container, so
// the tool's own write lands in a scratch folder: this door is how the decision reaches the site (#1013).
import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import { writeDisplayLocale } from '../src/display-locale.js'

const made = []
after(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true })
})

async function config() {
  const root = await mkdtemp(path.join(tmpdir(), 'display-locale-'))
  made.push(root)
  const dirs = {}
  for (const name of ['sites', 'private', 'scripts', 'jobs', 'logs']) {
    dirs[name] = path.join(root, name)
    await mkdir(dirs[name], { recursive: true })
  }
  return {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: dirs.sites,
    privateRoot: dirs.private,
    scriptsDir: dirs.scripts,
    jobsDir: dirs.jobs,
    logDir: dirs.logs,
    cloudflare: null,
    tokenOwnerUid: process.getuid()
  }
}

/** An EmDash site as provision leaves it: `data/` with the database in it. */
async function emdashSite(cfg, label) {
  await mkdir(path.join(cfg.privateRoot, label, 'data'), { recursive: true })
  await writeFile(path.join(cfg.privateRoot, label, 'data', 'data.db'), 'SQLite format 3\u0000')
}

const fileOf = (cfg, label) => path.join(cfg.privateRoot, label, 'data', 'display-locale.json')

test('the tag is written where the template reads it, whole, and replaced on the next call', async () => {
  const cfg = await config()
  await emdashSite(cfg, 'helixwatch')
  assert.deepEqual(await writeDisplayLocale({ label: 'helixwatch', locales: { en: 'vi-VN' }, config: cfg }), {
    ok: true
  })
  assert.deepEqual(JSON.parse(await readFile(fileOf(cfg, 'helixwatch'), 'utf8')), { en: 'vi-VN' })
  assert.equal(
    (await lstat(fileOf(cfg, 'helixwatch'))).mode & 0o777,
    0o644,
    'the site reads it as its own user'
  )
  await writeDisplayLocale({ label: 'helixwatch', locales: { en: 'en-US' }, config: cfg })
  assert.deepEqual(JSON.parse(await readFile(fileOf(cfg, 'helixwatch'), 'utf8')), { en: 'en-US' })
})

test('only language tags, and only on an EmDash site: anything else is refused and nothing is written', async () => {
  const cfg = await config()
  await emdashSite(cfg, 'helixwatch')
  for (const locales of [
    null,
    [],
    'vi-VN',
    { en: 'vi-VN; rm -rf /' },
    { '../x': 'vi-VN' },
    { en: 42 },
    Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [
        `${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`,
        'en'
      ])
    )
  ]) {
    const answer = await writeDisplayLocale({ label: 'helixwatch', locales, config: cfg })
    assert.equal(answer.ok, false, JSON.stringify(locales))
    assert.equal(answer.code, 'BAD_LOCALES')
  }
  await assert.rejects(lstat(fileOf(cfg, 'helixwatch')))
  // A Joomla or WordPress site has no such file to read: nothing is created there.
  await mkdir(path.join(cfg.privateRoot, 'joomlasite'), { recursive: true })
  await writeFile(path.join(cfg.privateRoot, 'joomlasite', '.env'), 'HOST_PORT=1\nPLATFORM=joomla\n')
  const other = await writeDisplayLocale({ label: 'joomlasite', locales: { en: 'vi-VN' }, config: cfg })
  assert.deepEqual(other, { ok: false, code: 'NOT_EMDASH' })
  await assert.rejects(lstat(path.join(cfg.privateRoot, 'joomlasite', 'data')))
})

test('a data folder or a file that is a link is never followed', async () => {
  const cfg = await config()
  await emdashSite(cfg, 'helixwatch')
  const outside = path.join(cfg.privateRoot, 'outside.json')
  await writeFile(outside, 'keep')
  await symlink(outside, fileOf(cfg, 'helixwatch'))
  const linked = await writeDisplayLocale({ label: 'helixwatch', locales: { en: 'vi-VN' }, config: cfg })
  assert.deepEqual(linked, { ok: false, code: 'NOT_A_FILE' })
  assert.equal(await readFile(outside, 'utf8'), 'keep')

  await mkdir(path.join(cfg.privateRoot, 'linked', 'elsewhere'), { recursive: true })
  await mkdir(path.join(cfg.privateRoot, 'linked', 'uploads'), { recursive: true })
  await symlink(
    path.join(cfg.privateRoot, 'linked', 'elsewhere'),
    path.join(cfg.privateRoot, 'linked', 'data')
  )
  const dataLink = await writeDisplayLocale({ label: 'linked', locales: { en: 'vi-VN' }, config: cfg })
  assert.deepEqual(dataLink, { ok: false, code: 'NO_DATA_DIR' })
})

test('POST /_host/display-locale: signed, label fenced, answers what it wrote', async () => {
  const cfg = await config()
  await emdashSite(cfg, 'helixwatch')
  const app = buildApp({
    config: cfg,
    jobs: { put: async () => ({}), get: async () => null },
    run: async () => ({})
  })
  const post = async (payload) => {
    const body = JSON.stringify(payload)
    const headers = await signHostCall({ secret: cfg.hostSecret, path: '/_host/display-locale', body })
    return app.fetch(
      new Request('http://tracy-host.test/_host/display-locale', { method: 'POST', headers, body })
    )
  }
  const ok = await post({ label: 'helixwatch', locales: { en: 'vi-VN' } })
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { ok: true })
  assert.deepEqual(JSON.parse(await readFile(fileOf(cfg, 'helixwatch'), 'utf8')), { en: 'vi-VN' })
  assert.equal((await post({ label: '../etc', locales: { en: 'vi-VN' } })).status, 400)
  assert.equal((await post({ label: 'helixwatch', locales: { en: 'not a tag' } })).status, 400)
  assert.equal((await post({ label: 'nosuchsite', locales: { en: 'vi-VN' } })).status, 404)
  const unsigned = await app.fetch(
    new Request('http://tracy-host.test/_host/display-locale', { method: 'POST', body: '{}' })
  )
  assert.equal(unsigned.status, 403, 'an unsigned call never reaches the door')
})
