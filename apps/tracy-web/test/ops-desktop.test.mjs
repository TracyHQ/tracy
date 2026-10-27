/**
 * `/ops` › User Interface › Desktop App (`tasks/todo-desktop-surface.md`, part A): the settings that
 * belong to the Tracy Cowork desktop app alone. Read by the app at `GET /api/desktop/config`, shown
 * to staff at `GET /api/ops/desktop`, written only by an owner or admin from this origin at
 * `PUT /api/ops/desktop` — and the next read after a press answers the new value.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { DESKTOP_PROVIDERS, readDesktopSetting } from '../src/lib/desktop-setting.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

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

/**
 * Every vendor of `@goodandready/dsh-subscriptions` 0.6.60 (`lib/refs.js` BUILTIN_PROVIDERS), Claude and
 * ChatGPT first (Lee, 07/10/2026), then Grok.
 */
/** Every vendor the server knows, in order, each with the home page its card links to; `offered: false` = off until an operator switches it on. */
const KNOWN = [
  { id: 'claude', name: 'Claude', homepage: 'https://claude.ai' },
  { id: 'codex', name: 'ChatGPT Codex', homepage: 'https://chatgpt.com/codex' },
  { id: 'copilot', name: 'GitHub Copilot', homepage: 'https://github.com/features/copilot' },
  { id: 'grok', name: 'Grok', homepage: 'https://grok.com' },
  { id: 'antigravity', name: 'Antigravity (Gemini)', homepage: 'https://antigravity.google', offered: false },
  { id: 'kimi', name: 'Kimi', homepage: 'https://www.kimi.com', offered: false },
  { id: 'glm', name: 'GLM', homepage: 'https://z.ai', offered: false },
  { id: 'qwen', name: 'Qwen', homepage: 'https://bailian.console.aliyun.com', offered: false }
]
/** The vendors a deployment nobody configured offers (Antigravity waits for a client Google accepts, 10/10/2026). */
const OFFERED = KNOWN.filter((p) => p.offered !== false).map(({ offered: _o, ...p }) => p)
const ALL_VENDORS = OFFERED.map((p) => p.id)

/** What a deployment nobody configured answers: plan connection on, every vendor offered (Lee, 07/10/2026). */
const DEFAULT_LLM = { connect: true, providers: ALL_VENDORS }

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
  /** The app's own read: no cookie, no origin. */
  const desktop = async () => {
    const response = await app.fetch(new Request('https://cowork.tracy.test/api/desktop/config'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return response.json()
  }
  const read = (cookie) =>
    app.fetch(
      new Request('https://cowork.tracy.test/api/ops/desktop', {
        redirect: 'manual',
        headers: cookie ? { cookie } : {}
      })
    )
  const put = (cookie, body, headers = {}) =>
    app.fetch(
      new Request('https://cowork.tracy.test/api/ops/desktop', {
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
  return { app, desktop, read, put, cookieFor }
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

test(
  'a fresh server tells the app: plan connection on, every vendor offered, the model left to Tracy',
  opts,
  async () => {
    const { pool } = db
    assert.deepEqual(await harness(pool).desktop(), {
      llm: DEFAULT_LLM,
      tracyModel: { provider: null, model: null },
      catalogue: OFFERED
    })
  }
)

test(
  'only an owner or admin from this origin may press; a refused press writes nothing; the next read answers',
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
    const press = { llm: { connect: true, providers: ['codex', 'claude'] } }

    assert.notEqual((await h.put(null, press)).status, 200)
    assert.equal((await h.put(dev, press)).status, 403)
    assert.equal((await h.put(owner, press, { origin: 'https://evil.test' })).status, 403)

    const refusals = [
      [{ llm: { connect: 'yes' } }, { error: 'NOT_BOOLEAN', key: 'llm.connect' }],
      [{ llm: { connect: true, model: 'claude' } }, { error: 'UNKNOWN_KEY', key: 'llm.model' }],
      [{ theme: 'dark' }, { error: 'UNKNOWN_KEY', key: 'theme' }],
      [{ llm: { providers: 'claude' } }, { error: 'NOT_LIST', key: 'llm.providers' }],
      [
        { llm: { connect: true, providers: ['claude', 'anthropic'] } },
        { error: 'UNKNOWN_PROVIDER', key: 'llm.providers', id: 'anthropic' }
      ],
      [{ llm: true }, { error: 'NOT_OBJECT', key: 'llm' }],
      [[], { error: 'BODY_NOT_OBJECT' }]
    ]
    for (const [body, error] of refusals) {
      const response = await h.put(owner, body)
      assert.equal(response.status, 400, JSON.stringify(body))
      assert.deepEqual(await response.json(), error)
    }
    assert.deepEqual((await h.desktop()).llm, DEFAULT_LLM, 'no refused press changed anything')

    const accepted = await h.put(admin, press)
    assert.equal(accepted.status, 200)
    // The vendor list comes back in the screen's order, whatever order it was sent in.
    const expected = { connect: true, providers: ['claude', 'codex'] }
    assert.deepEqual((await accepted.json()).llm, expected)
    assert.deepEqual((await h.desktop()).llm, expected)
  }
)

test('a press on one key keeps the other, and an empty vendor list is an answer', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')

  assert.equal((await h.put(owner, { llm: { providers: ['claude'] } })).status, 200)
  assert.equal((await h.put(owner, { llm: { connect: true } })).status, 200)
  assert.deepEqual((await h.desktop()).llm, { connect: true, providers: ['claude'] })

  assert.equal((await h.put(owner, { llm: { providers: [] } })).status, 200)
  assert.deepEqual((await h.desktop()).llm, { connect: true, providers: [] })
  const { rows } = await pool.query('select updated_by from desktop_setting')
  assert.deepEqual(rows, [{ updated_by: 'owner@tracy.test' }])
})

test(
  'staff read the document with the vendors on offer; only owner and admin read it as writable',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const h = harness(pool)
    const owner = await h.cookieFor('owner@tracy.test')
    const dev = await h.cookieFor('dev@tracy.test')

    assert.notEqual((await h.read(null)).status, 200)
    await h.put(owner, { llm: { connect: true } })

    const asDev = await h.read(dev)
    assert.equal(asDev.status, 200)
    assert.equal(asDev.headers.get('cache-control'), 'no-store')
    const body = await asDev.json()
    assert.equal(body.writable, false)
    assert.deepEqual(body.llm, DEFAULT_LLM)
    assert.deepEqual(body.tracyModel, { provider: null, model: null })
    assert.equal(body.updatedBy, 'owner@tracy.test')
    // The admin document lists every known vendor, the off-by-default one included, so it can be switched on.
    assert.deepEqual(
      body.providers.map((p) => p.id),
      KNOWN.map((p) => p.id)
    )
    assert.deepEqual(body.providers, KNOWN)
    assert.equal((await (await h.read(owner)).json()).writable, true)
  }
)

test("the app is told the agent door's vendor from Model & AI, and never its key", opts, async () => {
  const { pool } = db
  await pool.query(
    `insert into llm_provider (id, preset_id, name, api_key_cipher, enabled, updated_by)
       values ('deepseek', 'deepseek', 'DeepSeek', 'v1.secret-cipher', true, 'owner@tracy.test')`
  )
  await pool.query(
    `insert into llm_assignment (door, provider_id, model, updated_by) values ('agent', 'deepseek', null, 'owner@tracy.test')`
  )
  const response = await harness(pool).app.fetch(new Request('https://cowork.tracy.test/api/desktop/config'))
  const text = await response.text()
  assert.deepEqual(JSON.parse(text).tracyModel, { provider: 'deepseek', model: null })
  assert.ok(!text.includes('secret-cipher'), 'no key, sealed or not, reaches a public door')
})

test(
  'a stored vendor the list no longer offers, or a value of the wrong type, reads as the list and the default',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into desktop_setting (id, config, updated_by)
       values (true, '{"llm": {"connect": "on", "providers": ["retired-vendor", "grok"]}}', 'owner@tracy.test')`
    )
    assert.deepEqual((await harness(pool).desktop()).llm, { connect: true, providers: ['grok'] })
  }
)

test(
  'a list saved with the old pi-ai ids only, none offered any more, never enables additional providers',
  opts,
  async () => {
    const { pool } = db
    // What stands that ran the first build of this screen hold (07/10/2026).
    await pool.query(
      `insert into desktop_setting (id, config, updated_by)
       values (true, '{"llm": {"connect": true, "providers": ["anthropic", "openai-codex", "github-copilot", "xai", "kimi-coding", "meta"]}}', 'owner@tracy.test')`
    )
    assert.deepEqual((await harness(pool).desktop()).llm, { connect: true, providers: [] })
  }
)

test('no database, or one that fails, reads as the defaults', async () => {
  assert.deepEqual((await readDesktopSetting(null)).llm, DEFAULT_LLM)
  const broken = { query: async () => Promise.reject(new Error('relation "desktop_setting" does not exist')) }
  assert.deepEqual((await readDesktopSetting(broken)).llm, DEFAULT_LLM)
})

test('the supported broker vendors use the wire adapter ids and names', async () => {
  // A wrong id is dropped by dsh-subscriptions' `allowedVendors` without a word (the vendor then
  // never becomes connectable), so the list is checked against the vendored plugin itself.
  const plugin = '../../../vendor/tracy/dsh-subscriptions/lib/'
  const { providers } = await import('../src/seat-plan/providers.js')
  const { getVendor } = await import(`${plugin}vendors/index.js`)
  assert.deepEqual(DESKTOP_PROVIDERS.map((p) => p.id).sort(), Object.keys(providers).sort())
  // Where Tracy names a vendor more plainly than the plugin does, the plugin's name still leads it.
  const shownAs = { antigravity: 'Antigravity (Gemini)' }
  // Where the plugin prefixes the maker ('Moonshot Kimi'), Tracy shows the vendor's own name, which
  // the plugin's name still contains.
  const shortName = { kimi: 'Kimi', glm: 'GLM', qwen: 'Qwen' }
  for (const { id, name } of DESKTOP_PROVIDERS) {
    const plugin = getVendor(id).providerInfo(id).name
    if (shortName[id]) {
      assert.equal(name, shortName[id], id)
      assert.ok(plugin.endsWith(` ${name}`), id)
      assert.equal(providers[id].providerInfo().name, name, id)
      continue
    }
    assert.equal(name, shownAs[id] ?? plugin, id)
    assert.ok(name.startsWith(plugin), id)
    assert.equal(providers[id].providerInfo().name, name, id)
  }
})

test(
  'the public config carries the catalogue of the vendors on offer, with their home pages',
  opts,
  async () => {
    const { pool } = db
    assert.deepEqual((await harness(pool).desktop()).catalogue, OFFERED)
  }
)
