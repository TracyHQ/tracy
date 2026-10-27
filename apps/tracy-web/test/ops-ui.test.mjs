/**
 * The operator's User Interface switches (`tasks/plan-ui-switches.md`, phase B): which pieces of the
 * customer's dsh page are hidden. Read by anyone at `GET /api/ui`, shown to staff at
 * `GET /api/ops/ui`, written only by an owner or admin from this origin at `PUT /api/ops/ui` — and
 * the next read after a press answers the new value, with nothing rebuilt in between.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { readUiHidden, saveUiSwitches, uiSwitchOn } from '../src/lib/ui-setting.js'
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

// The one list of switches (`@tracy/core/ui-switches`). What `/ops` shows is compared with the file
// itself, id by id: a count typed here went red with every new switch and said nothing about which.
const CATALOGUE_IDS = JSON.parse(
  readFileSync(
    new URL('../../../packages/core/tracy-core/src/ui-switches/catalogue.json', import.meta.url),
    'utf8'
  )
)
  .switches.map((s) => s.id)
  .sort()

/**
 * The ids hidden by default — Lee's document of 28/09/2026, pasted from the mockup, with the right
 * column wired (phase D): `tab-browser` left (it duplicated `launch-browser`), Build and Live site joined
 * the + menu switches. Lee, 29/09: the Settings button is shown by default, and
 * "Open in app" is locked off (its plugin is off in every bundle). 03/10: the Releases and History
 * switches left with their tabs (ADR 0024). 06/10: the Need help? button is off by default.
 * 08/10: host-wide subscriptions are locked off in favor of account connections.
 * 07/10: the logo and favicon questions (`site-brand-uploads`) are off by default (#1013).
 * 11/10: the chat route to a design system (`chat-design-system`) is off by default (David).
 * 13/10: the role picker (`preset-picker`) is off by default (Lee).
 * 17/10: the embeddable website voice widget is off by default outside the dev trial.
 * 23/10: Build from my business (`site-from-business`) is off by default (#1640).
 * 25/10: Design system in the + menu (`launch-design-system`) is off by default (Akemi).
 */
const DEFAULT_HIDDEN = [
  'access-mode',
  'better-sidebar',
  'chat-design-system',
  'composer-enter',
  'dsh-open-in-app',
  'dsh-subscriptions',
  'guide-picture',
  'help-button',
  'hero-headline',
  'launch-brand',
  'launch-brand-builder',
  'launch-browser',
  'launch-build',
  'launch-changes',
  'launch-design-system',
  'launch-files',
  'launch-git',
  'launch-live-site',
  'launch-side-chat',
  'launch-subagent',
  'launch-team',
  'mode-platform-row',
  'model-picker',
  'other-sites',
  'performance-usage',
  'plugins',
  'preset-picker',
  'site-brand-uploads',
  'site-from-business',
  'site-sync-to-live',
  'split-button',
  'tracy-site',
  'transcript-view',
  'voice-plan-approval',
  'website-opportunities',
  'website-opportunities-public-find',
  'website-voice-widget'
]

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
  const hidden = async () => {
    const response = await app.fetch(new Request('https://cowork.tracy.test/api/ui'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return [...(await response.json()).hidden].sort()
  }
  const put = (cookie, body, headers = {}) =>
    app.fetch(
      new Request('https://cowork.tracy.test/api/ops/ui', {
        method: 'PUT',
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'https://cowork.tracy.test',
          'content-type': 'application/json',
          ...headers
        },
        body: JSON.stringify(body)
      })
    )
  return { app, hidden, put, cookieFor }
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

test('a fresh server hides exactly the code defaults, to a reader with no seat at all', opts, async () => {
  const { pool } = db
  assert.deepEqual(await harness(pool).hidden(), DEFAULT_HIDDEN)
})

test(
  'only an owner or admin from this origin may flip a switch; the next read answers it',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    await seedStaff(pool, 'admin@tracy.test', 'admin')
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const h = harness(pool)
    const owner = await h.cookieFor('owner@tracy.test')
    const admin = await h.cookieFor('admin@tracy.test')
    const dev = await h.cookieFor('dev@tracy.test')
    const press = { switches: { 'other-sites': true, language: false } }

    assert.notEqual((await h.put(null, press)).status, 200)
    assert.equal((await h.put(dev, press)).status, 403)
    assert.equal((await h.put(owner, press, { origin: 'https://evil.test' })).status, 403)
    assert.equal((await h.put(owner, { switches: { language: 'off' } })).status, 400)
    assert.equal((await h.put(owner, { switches: { model_picker: true } })).status, 400)
    assert.equal((await h.put(owner, { switches: 'language' })).status, 400)
    assert.deepEqual(await h.hidden(), DEFAULT_HIDDEN, 'no refused press changed anything')

    assert.equal((await h.put(admin, press)).status, 200)
    const after = await h.hidden()
    assert.ok(after.includes('language'))
    assert.ok(!after.includes('other-sites'))
    assert.equal(after.length, DEFAULT_HIDDEN.length)
  }
)

test(
  'the store keeps only differences from the defaults, and presses on different switches add up',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    const h = harness(pool)
    const owner = await h.cookieFor('owner@tracy.test')
    const overrides = async () => (await pool.query('select overrides from ui_setting')).rows[0]?.overrides

    assert.equal((await h.put(owner, { switches: { 'other-sites': true } })).status, 200)
    assert.equal((await h.put(owner, { switches: { language: false } })).status, 200)
    assert.deepEqual(await overrides(), { 'other-sites': true, language: false })

    // Pressed back to its default: it leaves the document instead of pinning today's default.
    assert.equal((await h.put(owner, { switches: { 'other-sites': false } })).status, 200)
    assert.deepEqual(await overrides(), { language: false })
    const { rows } = await pool.query('select updated_by from ui_setting')
    assert.deepEqual(rows, [{ updated_by: 'owner@tracy.test' }])
  }
)

test(
  'staff read the catalogue with each switch state; only owner and admin read it as writable',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const h = harness(pool)
    const owner = await h.cookieFor('owner@tracy.test')
    const dev = await h.cookieFor('dev@tracy.test')
    const read = (cookie) =>
      h.app.fetch(
        new Request('https://cowork.tracy.test/api/ops/ui', {
          redirect: 'manual',
          headers: cookie ? { cookie } : {}
        })
      )

    assert.notEqual((await read(null)).status, 200)
    await h.put(owner, { switches: { language: false } })

    const asDev = await read(dev)
    assert.equal(asDev.status, 200)
    assert.equal(asDev.headers.get('cache-control'), 'no-store')
    const body = await asDev.json()
    assert.equal(body.writable, false)
    assert.deepEqual(
      body.areas.map((a) => a.id),
      ['settings', 'sidebar', 'right-column', 'new-session', 'composer', 'dsh', 'assistant', 'onboarding']
    )
    assert.deepEqual(
      body.switches.map((s) => s.id).sort(),
      CATALOGUE_IDS,
      'every switch of the catalogue, once'
    )
    const byId = Object.fromEntries(body.switches.map((s) => [s.id, s]))
    assert.equal(byId.language.on, false)
    assert.equal(byId.language.defaultOn, true)
    assert.equal(byId['tracy-account'].on, true)
    assert.deepEqual(byId['launch-build'].tabs, [
      'tracy:build:wordpress',
      'tracy:build:joomla',
      'tracy:build:emdash'
    ])
    assert.match(byId['settings-button'].warning, /sign out/i)
    assert.equal(body.updatedBy, 'owner@tracy.test')

    assert.equal((await (await read(owner)).json()).writable, true)
  }
)

test('no database, or one that fails, reads as the code defaults — not as everything shown', async () => {
  assert.deepEqual((await readUiHidden(null)).sort(), DEFAULT_HIDDEN)
  const broken = { query: async () => Promise.reject(new Error('relation "ui_setting" does not exist')) }
  assert.deepEqual((await readUiHidden(broken)).sort(), DEFAULT_HIDDEN)
})

test(
  'a door that enforces a switch reads it strictly: its default, the press, the lock — and a failed read throws instead of answering the default',
  opts,
  async () => {
    const { pool } = db
    assert.equal(await uiSwitchOn(pool, 'site-connect-domain'), true, 'no row: the catalogue default')
    await saveUiSwitches(pool, { 'site-connect-domain': false }, 'owner@tracy.test')
    assert.equal(await uiSwitchOn(pool, 'site-connect-domain'), false)
    await saveUiSwitches(pool, { 'site-connect-domain': true }, 'owner@tracy.test')
    assert.equal(await uiSwitchOn(pool, 'site-connect-domain'), true, 'back to its default')
    // A stored answer that is not a boolean opens nothing: it throws, as a failed read does. A locked
    // switch is its default whatever was stored.
    await pool.query(
      `update ui_setting set overrides = '{"site-connect-domain": "off", "dsh-open-in-app": true}'::jsonb`
    )
    await assert.rejects(uiSwitchOn(pool, 'site-connect-domain'), /not a boolean/)
    assert.equal(await uiSwitchOn(pool, 'dsh-open-in-app'), false)
    const broken = { query: async () => Promise.reject(new Error('connection terminated')) }
    await assert.rejects(uiSwitchOn(broken, 'site-connect-domain'), /connection terminated/)
    await assert.rejects(uiSwitchOn(pool, 'no-such-switch'), /not a UI switch/)
  }
)

test('a locked switch refuses every press and ignores an override stored before the lock', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')

  const refused = await h.put(owner, { switches: { 'dsh-open-in-app': true, language: false } })
  assert.equal(refused.status, 400)
  assert.deepEqual(await refused.json(), { error: 'SWITCH_LOCKED', id: 'dsh-open-in-app' })
  assert.deepEqual(await h.hidden(), DEFAULT_HIDDEN, 'the refused press wrote nothing, not even language')

  // An operator turned it on before the lock existed: the row still says so.
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, '{"dsh-open-in-app": true}', 'owner@tracy.test')
       on conflict (id) do update set overrides = excluded.overrides`
  )
  assert.ok((await h.hidden()).includes('dsh-open-in-app'))
  const doc = await (
    await h.app.fetch(new Request('https://cowork.tracy.test/api/ops/ui', { headers: { cookie: owner } }))
  ).json()
  const sw = doc.switches.find((s) => s.id === 'dsh-open-in-app')
  assert.equal(sw.on, false)
  assert.match(sw.locked, /upstream/i)
})

test(
  'a stored switch the catalogue no longer lists answers nothing: not hidden, not on /ops, presses still land',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    const h = harness(pool)
    const owner = await h.cookieFor('owner@tracy.test')
    // Rows written while the Releases and History switches existed (they left with their tabs, ADR 0024).
    const retired = { 'tab-releases': true, 'launch-releases': true, 'tab-history': true }
    await pool.query(
      `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'owner@tracy.test')
         on conflict (id) do update set overrides = excluded.overrides`,
      [JSON.stringify({ ...retired, 'other-sites': true })]
    )
    const hidden = await h.hidden()
    assert.deepEqual(
      hidden,
      DEFAULT_HIDDEN.filter((id) => id !== 'other-sites')
    )
    for (const id of Object.keys(retired)) assert.ok(!hidden.includes(id), `${id} is not hidden`)

    const doc = await (
      await h.app.fetch(new Request('https://cowork.tracy.test/api/ops/ui', { headers: { cookie: owner } }))
    ).json()
    assert.deepEqual(
      doc.switches.map((s) => s.id).sort(),
      CATALOGUE_IDS,
      'the catalogue, and nothing stored beside it'
    )
    for (const id of Object.keys(retired))
      assert.ok(!doc.switches.some((s) => s.id === id), `${id} is not on /ops`)
    assert.equal(doc.switches.find((s) => s.id === 'other-sites').on, true, 'a live override still reads')

    // A press neither trips over the old keys nor brings them back.
    assert.equal((await h.put(owner, { switches: { language: false } })).status, 200)
    assert.deepEqual(
      await h.hidden(),
      [...DEFAULT_HIDDEN.filter((id) => id !== 'other-sites'), 'language'].sort()
    )
    // And a press naming one is refused like any unknown id.
    const refused = await h.put(owner, { switches: { 'tab-releases': true } })
    assert.equal(refused.status, 400)
    assert.deepEqual(await refused.json(), { error: 'UNKNOWN_SWITCH', id: 'tab-releases' })
  }
)
