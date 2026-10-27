/**
 * Creating a release's missing `tracy_setting.json` from the operations page: the proposal an
 * administrator reviews, and the press that writes it.
 *
 * WHY TWO DOORS AND NOT ONE. The reading is expensive and says nothing — it downloads a 50 MB
 * package to compute a checksum nobody signed — while the writing changes a release customers can
 * see. Folded into one call, opening the sheet WOULD BE the write, and "let me look at what it
 * would say" would have no answer. So the proposal is a GET that writes nothing, and the press
 * carries back the document a person actually approved.
 *
 * No network: GitHub is a stub, and the package is a real zip held in `_quickstart-package.mjs`.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { QUICKSTART_PACKAGE, QUICKSTART_SHA256 } from './_quickstart-package.mjs'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  TRACY_RELEASES_GITHUB_TOKEN: 'ghp_x'
}
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const TAG = 'quickstart/ja-space/j6'
const ZIP = 'ja-space-j6-quickstart.zip'
const SETTING = 'tracy_setting.json'
const door = (tag, tail) => `/api/ops/quickstart/${tail}?tag=${encodeURIComponent(tag)}`

/** The document a person would approve on the sheet — the proposal, unedited. */
const approved = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'joomla',
  label: 'JA Space',
  version: '1.0.0',
  cms: '6.0.3',
  template: 'ja_space',
  install: { installer: { file: ZIP, sha256: QUICKSTART_SHA256 } }
}

/**
 * GitHub, as much of it as these two doors touch: the release, its asset bytes, the delete and the
 * upload, and the re-read that follows a successful press. Every call is recorded, because "was
 * the package downloaded once" and "was the file uploaded once" are the assertions.
 */
function github({ assets = [{ id: 71, name: ZIP, size: QUICKSTART_PACKAGE.length }], settled } = {}) {
  const calls = []
  const state = { assets: [...assets] }
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const u = String(url)
    calls.push({ url: u, method, body: init.body })
    // The list, as the re-read after a press reads it.
    if (/\/releases\?per_page/.test(u))
      return new Response(
        JSON.stringify([
          {
            tag_name: TAG,
            name: 'Quickstart: JA Space / Joomla 6',
            draft: false,
            prerelease: false,
            published_at: '2026-09-14T10:55:20Z',
            assets: state.assets.map((a) => ({ ...a, url: `https://api.github.com/asset/${a.name}` }))
          }
        ]),
        { status: 200 }
      )
    if (/\/releases\/tags\//.test(u))
      return new Response(JSON.stringify({ id: 7, assets: state.assets }), { status: 200 })
    if (method === 'DELETE') {
      state.assets = state.assets.filter((a) => !u.endsWith(`/${a.id}`))
      return new Response(null, { status: 204 })
    }
    if (/uploads\.github\.com/.test(u)) {
      const name = new URL(u).searchParams.get('name')
      state.assets.push({ id: 900, name, size: String(init.body).length })
      settled?.(String(init.body))
      return new Response(JSON.stringify({ id: 900, name }), { status: 201 })
    }
    // An asset's bytes, by name: the package for the download, the setting for the re-read.
    if (u.endsWith(`/asset/${SETTING}`)) return new Response(JSON.stringify(approved), { status: 200 })
    if (u.endsWith(`/asset/${ZIP}`)) return new Response(QUICKSTART_PACKAGE, { status: 200 })
    if (/\/releases\/assets\/\d+$/.test(u)) return new Response(QUICKSTART_PACKAGE, { status: 200 })
    return new Response('unexpected', { status: 500 })
  }
  return { fetchImpl, calls }
}

function harness(pool, fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
    )
  const post = (path, cookie, body, origin = 'http://tracy.test') =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers: { ...(cookie ? { cookie } : {}), origin, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    )
  return { get, post, cookieFor }
}

async function seedStaff(pool, email, role = 'owner') {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  // One Tracy workspace per database, however many people are seated in it.
  const ws = (
    await pool.query(
      `insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin')
       on conflict (display_name) do update set kind = excluded.kind returning id`
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
     values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
}

/** One release with no setting, as a read of GitHub would have left it. */
async function seedRelease(pool, over = {}) {
  const release = {
    name: 'Quickstart: JA Space / Joomla 6',
    kind: 'quickstart',
    github: 'published',
    publishedAt: '2026-09-14T10:55:20Z',
    assets: [{ name: ZIP, size: QUICKSTART_PACKAGE.length, id: 71 }],
    ...over
  }
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, $4, $5)`,
    [
      TAG,
      JSON.stringify(release),
      over.setting ? JSON.stringify(over.setting) : null,
      over.setting ? 'ready' : 'no-setting',
      over.setting ? null : 'No tracy_setting.json among the assets.'
    ]
  )
}

test('the proposal fills in every field from the release, and marks which are guesses', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = github()
  const { get, cookieFor } = harness(pool, fetchImpl)
  await seedRelease(pool)

  assert.equal((await get(door(TAG, 'setting-proposal'))).status, 302, 'a stranger signs in first')
  const outsider = await cookieFor('outside@example.test')
  assert.equal((await get(door(TAG, 'setting-proposal'), outsider)).status, 403)

  await seedStaff(pool, 'owner@example.test')
  const owner = await cookieFor('owner@example.test')
  const body = await (await get(door(TAG, 'setting-proposal'), owner)).json()

  assert.deepEqual(
    Object.fromEntries(Object.entries(body.fields).map(([k, f]) => [k, [f.value, f.source]])),
    {
      platform: ['joomla', 'release'],
      label: ['JA Space', 'release'],
      version: ['1.0.0', 'default'],
      cms: ['6.0.3', 'package'],
      template: ['ja_space', 'package']
    }
  )
  assert.deepEqual(body.document, approved)
  assert.deepEqual(body.problems, [])
  assert.equal(body.package.file, ZIP)
  assert.equal(body.package.sha256, QUICKSTART_SHA256)
  assert.equal(
    calls.filter((c) => c.url.endsWith('assets/71')).length,
    1,
    'the package is downloaded once, not once per field'
  )
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0, 'a proposal writes nothing')

  assert.equal((await get(door('quickstart/nope/j6', 'setting-proposal'), owner)).status, 404)
})

test('a release that has nothing to propose is refused, with the reason', opts, async () => {
  const { pool } = db
  const { fetchImpl } = github()
  const { get, cookieFor } = harness(pool, fetchImpl)
  await seedStaff(pool, 'owner@example.test')
  const owner = await cookieFor('owner@example.test')

  await seedRelease(pool, { setting: approved })
  const ready = await get(door(TAG, 'setting-proposal'), owner)
  assert.equal(ready.status, 409)
  assert.equal((await ready.json()).error, 'ALREADY_READY')
  await pool.query('delete from quickstart_releases')

  await seedRelease(pool, { github: 'draft' })
  const draft = await get(door(TAG, 'setting-proposal'), owner)
  assert.equal(draft.status, 409, 'a draft is not a release anything may be written to')
  assert.equal((await draft.json()).error, 'DRAFT')
  await pool.query('delete from quickstart_releases')

  await seedRelease(pool, {
    assets: [
      { name: 'a-quickstart.zip', size: 1, id: 1 },
      { name: 'b-quickstart.zip', size: 1, id: 2 }
    ]
  })
  const two = await get(door(TAG, 'setting-proposal'), owner)
  assert.equal(two.status, 409)
  const said = await two.json()
  assert.equal(said.error, 'NO_PACKAGE')
  assert.match(said.reason, /a-quickstart\.zip, b-quickstart\.zip/)
})

test(
  'the press writes the reviewed document to the release, once, and the row turns Ready',
  opts,
  async () => {
    const { pool } = db
    const written = []
    const { fetchImpl, calls } = github({ settled: (body) => written.push(body) })
    const { get, post, cookieFor } = harness(pool, fetchImpl)
    await seedRelease(pool)
    await seedStaff(pool, 'owner@example.test')
    await seedStaff(pool, 'editor@example.test', 'editor')
    const owner = await cookieFor('owner@example.test')
    const editor = await cookieFor('editor@example.test')

    assert.equal((await post(door(TAG, 'setting'), editor, approved)).status, 403, 'reading is not writing')
    assert.equal(
      (await post(door(TAG, 'setting'), owner, approved, 'http://elsewhere.test')).status,
      403,
      'and not from another page'
    )
    assert.equal(written.length, 0)

    const refused = await post(door(TAG, 'setting'), owner, { ...approved, cms: '' })
    assert.equal(refused.status, 400)
    const problems = (await refused.json()).problems
    assert.ok(
      problems.some((p) => /cms/.test(p)),
      'the validator’s own sentences, not a shrug'
    )
    assert.equal(written.length, 0, 'a document the product would refuse never reaches the release')

    const done = await post(door(TAG, 'setting'), owner, approved)
    assert.equal(done.status, 200)
    assert.deepEqual(await done.json(), { ok: true, replaced: false, tracy: 'ready' })
    assert.equal(written.length, 1)
    assert.deepEqual(JSON.parse(written[0]), approved)
    const upload = calls.find((c) => /uploads\.github\.com/.test(c.url))
    assert.equal(new URL(upload.url).searchParams.get('name'), SETTING)

    // The row is Ready without a Refresh press: the whole point of re-reading here.
    const listed = await (await get('/api/ops/quickstarts', owner)).json()
    const row = listed.releases.find((r) => r.tag === TAG)
    assert.equal(row.tracy, 'ready')
    assert.equal(row.label, 'JA Space')
    assert.equal(row.choosable, true)
  }
)
