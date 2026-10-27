/**
 * The Widget screen's doors and what they change: a save at `/api/ops/widget/:id` is what
 * `/badge.js` serves next, a preview is the same script without the save, and every refusal a
 * customer's page would otherwise pay for happens here, by path.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { DEFAULT_SETTING } from '../src/lib/badge-setting.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const env = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1'
}
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: async () => Response.json({ error: 'unexpected' }, { status: 500 })
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        headers: cookie ? { cookie } : {},
        redirect: 'manual'
      })
    )
  const send = (method, path, cookie, body, headers = {}) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'https://cowork.tracy.test',
          'content-type': 'application/json',
          ...headers
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
  return { app, get, send, cookieFor }
}

async function seedStaff(pool, email, role = 'owner') {
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

test('a save is what the site gets next; a preview is the same script without the save', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedStaff(pool, 'editor@tracy.test', 'editor')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')
  const editor = await h.cookieFor('editor@tracy.test')

  // Nobody: the door is closed, the script is not.
  assert.notEqual((await h.get('/api/ops/widget')).status, 200)
  assert.equal((await h.get('/badge.js')).status, 200)

  // The read: both documents, the defaults, and whether this person may write.
  const asEditor = await h.get('/api/ops/widget', editor)
  assert.equal(asEditor.status, 200)
  const read = await asEditor.json()
  assert.deepEqual(read.seat, {
    setting: DEFAULT_SETTING.seat,
    revision: 0,
    updatedBy: null,
    updatedAt: null
  })
  assert.deepEqual(read.defaults, DEFAULT_SETTING)
  assert.equal(read.writable, false)
  assert.equal((await (await h.get('/api/ops/widget', owner)).json()).writable, true)

  // Off by default (01/10/2026): before anyone saves, the site's script draws nothing.
  assert.ok(!(await (await h.get('/badge.js')).text()).includes('Managed with Tracy'))
  const renamed = structuredClone(DEFAULT_SETTING.seat)
  renamed.on = true
  renamed.pillLabel = 'Built with Tracy'
  renamed.style.position = 'left'

  // The write: role, name, shape, then the revision.
  assert.equal(
    (await h.send('PUT', '/api/ops/widget/seat', editor, { setting: renamed, revision: 0 })).status,
    403
  )
  assert.equal(
    (await h.send('PUT', '/api/ops/widget/banner', owner, { setting: renamed, revision: 0 })).status,
    404
  )
  const bad = structuredClone(renamed)
  bad.style.accent = 'red'
  const refused = await h.send('PUT', '/api/ops/widget/seat', owner, { setting: bad, revision: 0 })
  assert.equal(refused.status, 400)
  assert.deepEqual(await refused.json(), { error: 'INVALID_SETTING', path: 'style.accent' })

  // Not yet saved: the preview renders it, the site does not get it.
  const preview = await h.send('POST', '/api/ops/widget/seat/preview', editor, { setting: renamed })
  assert.equal(preview.status, 200)
  assert.match(preview.headers.get('content-type') ?? '', /javascript/)
  assert.ok((await preview.text()).includes('Built with Tracy'))
  assert.ok(!(await (await h.get('/badge.js')).text()).includes('Built with Tracy'))
  assert.equal((await h.send('POST', '/api/ops/widget/seat/preview', editor, { setting: bad })).status, 400)

  const saved = await h.send('PUT', '/api/ops/widget/seat', owner, { setting: renamed, revision: 0 })
  assert.equal(saved.status, 200)
  const body = await saved.json()
  assert.equal(body.revision, 1)
  assert.deepEqual(body.setting, renamed)

  const served = await (await h.get('/badge.js')).text()
  assert.ok(served.includes('Built with Tracy'))
  assert.ok(served.includes('"position":"left"'))
  // The other badge is untouched.
  assert.ok((await (await h.get('/tracy-badge.js')).text()).includes('Customize with Tracy'))

  // Stale: the screen read revision 0, a colleague saved since.
  const stale = await h.send('PUT', '/api/ops/widget/seat', owner, {
    setting: DEFAULT_SETTING.seat,
    revision: 0
  })
  assert.equal(stale.status, 409)
  assert.deepEqual(await stale.json(), { error: 'BADGE_CHANGED' })
  const again = await h.send('PUT', '/api/ops/widget/seat', owner, {
    setting: DEFAULT_SETTING.seat,
    revision: 1
  })
  assert.equal(again.status, 200)
  assert.equal((await again.json()).revision, 2)
  const back = await (await h.get('/api/ops/widget', editor)).json()
  assert.equal(back.seat.revision, 2)
  // Saving the defaults switches the pill back off on every site.
  assert.equal(back.seat.setting.on, false)
  assert.ok(!(await (await h.get('/badge.js')).text()).includes('Built with Tracy'))
  assert.equal(back.seat.updatedBy, 'owner@tracy.test')
})

test('a write is admitted by the public origin and a JSON body, nothing else', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')
  const body = { setting: DEFAULT_SETTING.advert, revision: 0 }
  assert.equal(
    (await h.send('PUT', '/api/ops/widget/advert', owner, body, { origin: 'https://evil.test' })).status,
    403
  )
  // The app-wide guard (`lib/csrf.js`) answers a non-JSON body to a JSON door before the door's own check.
  const plain = await h.send('PUT', '/api/ops/widget/advert', owner, body, { 'content-type': 'text/plain' })
  assert.equal(plain.status, 415)
  assert.deepEqual(await plain.json(), { code: 'UNSUPPORTED_MEDIA_TYPE' })
  assert.equal((await h.send('PUT', '/api/ops/widget/advert', owner, body)).status, 200)
})

test('the advert motion switch saves, reads back, and previews as the script a demo gets', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')

  // Nothing saved yet: the switch is off, and "Defaults" offers it off.
  const first = await (await h.get('/api/ops/widget', owner)).json()
  assert.equal(first.advert.setting.style.animation, false)
  assert.equal(first.defaults.advert.style.animation, false)

  const moving = structuredClone(DEFAULT_SETTING.advert)
  moving.style.animation = true
  const preview = await h.send('POST', '/api/ops/widget/advert/preview', owner, { setting: moving })
  assert.equal(preview.status, 200)
  assert.ok((await preview.text()).includes('"animation":true'))
  assert.ok(
    (await (await h.get('/tracy-badge.js')).text()).includes('"animation":false'),
    'a preview saves nothing'
  )

  const saved = await h.send('PUT', '/api/ops/widget/advert', owner, { setting: moving, revision: 0 })
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).setting.style.animation, true)
  const back = await (await h.get('/api/ops/widget', owner)).json()
  assert.equal(back.advert.setting.style.animation, true)
  for (const path of ['/tracy-badge.js', '/build-with-tracy-demo.js'])
    assert.ok((await (await h.get(path)).text()).includes('"animation":true'), path)

  // The seat has no such switch.
  const seat = structuredClone(DEFAULT_SETTING.seat)
  seat.style.animation = true
  const refused = await h.send('PUT', '/api/ops/widget/seat', owner, { setting: seat, revision: 0 })
  assert.equal(refused.status, 400)
  assert.deepEqual(await refused.json(), { error: 'INVALID_SETTING', path: 'style.animation' })
})

test('an advert row saved before the motion switch existed reads back with its own words', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const old = structuredClone(DEFAULT_SETTING.advert)
  old.doors.customize.label = 'Like this design? Build it with Tracy'
  delete old.style.animation
  await pool.query(
    `insert into badge_setting (id, setting, updated_by) values ('advert', $1::jsonb, 'a@tracy.test')`,
    [JSON.stringify(old)]
  )
  const h = harness(pool)
  const read = await (await h.get('/api/ops/widget', await h.cookieFor('owner@tracy.test'))).json()
  assert.equal(read.advert.setting.doors.customize.label, 'Like this design? Build it with Tracy')
  assert.equal(read.advert.setting.style.animation, false)
  assert.equal(read.advert.revision, 1)
  assert.ok(
    (await (await h.get('/build-with-tracy-demo.js')).text()).includes(
      'Like this design? Build it with Tracy'
    )
  )
})
