import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import * as domain from '../domain/index.mjs'
import { BUILDER_METHODS, defineBuilder, loadBuilderFactories } from '../src/plugins/builders.js'
import createManualBuilder from '../src/plugins/builders/manual.js'
import createTracyBuilder from '../src/plugins/builders/tracy.js'

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa'
const MINE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const OPP = {
  id: MINE,
  account_id: ACCOUNT,
  name: 'Corner Cafe',
  branch: null,
  provider: 'osm',
  provider_id: 'node/1',
  place_id: null,
  candidate: {
    name: 'Corner Cafe',
    address: '1 Main Street, Springfield',
    phone: '+1 555 0100',
    lat: 40.7,
    lon: -74
  }
}

/** The database as the manual builder reads it: one opportunity of this account, no research rows yet. */
function fakePool() {
  return {
    async query(sql, params = []) {
      if (/select \* from wo_opportunity where id = \$1 and account_id = \$2/.test(sql))
        return { rows: params[0] === MINE && params[1] === ACCOUNT ? [OPP] : [] }
      if (/select id from wo_opportunity where account_id = \$1/.test(sql))
        return {
          rows: params[0] === ACCOUNT ? params[1].filter((id) => id === MINE).map((id) => ({ id })) : []
        }
      if (/from wo_profile/.test(sql)) return { rows: [] }
      return { rows: [] }
    }
  }
}

/** The host's object store, in memory. */
function memoryObjects() {
  const files = new Map()
  return {
    files,
    async put(key, bytes) {
      files.set(key, new TextDecoder().decode(bytes))
      return true
    },
    async get(key) {
      return files.has(key) ? new Response(files.get(key)) : new Response('missing', { status: 404 })
    },
    async delete(key) {
      files.delete(key)
    }
  }
}

/** The open router's helpers, as `builder.routes` receives them. */
function mount(builder) {
  const app = new Hono()
  const UUID = /^[0-9a-f-]{36}$/
  builder.routes(app, {
    caller: async () => ({ email: 'sam@example.com', accountId: ACCOUNT }),
    refuse: (c, status, code, next, extra = {}) => c.json({ code, next, ...extra }, status),
    notFound: (c, what) => c.json({ code: 'NOT_FOUND', next: what }, 404),
    featureOn: async () => true,
    featureOff: (c) => c.json({ code: 'FEATURE_OFF' }, 404),
    domainOr: async () => domain,
    body: (c) => c.req.json().catch(() => null),
    UUID
  })
  return app
}
const BASE = 'http://wo.test/api/website-opportunities'
const NOW = Date.parse('2026-10-24T09:00:00Z')

test('manual: Build demo writes the brief to files and the Markdown downloads', async () => {
  const objects = memoryObjects()
  const app = mount(createManualBuilder({ pool: fakePool(), objects, now: () => NOW }))
  const made = await app.request(`${BASE}/${MINE}/manual/brief`, { method: 'POST' })
  assert.equal(made.status, 200)
  const { brief, markdown, madeAt } = await made.json()
  assert.equal(madeAt, '2026-10-24T09:00:00.000Z')
  assert.equal(brief.business.name, 'Corner Cafe')
  assert.equal(domain.validateBrief(brief).ok, true)
  assert.match(markdown, /Corner Cafe/)
  assert.deepEqual([...objects.files.keys()].sort(), [
    `wo-manual/${ACCOUNT}/${MINE}/brief.json`,
    `wo-manual/${ACCOUNT}/${MINE}/brief.md`
  ])
  const download = await app.request(`${BASE}/${MINE}/manual/brief.md`)
  assert.equal(download.status, 200)
  assert.match(download.headers.get('content-disposition'), /^attachment; .*Corner-Cafe-brief\.md$/)
  assert.equal(await download.text(), markdown)
  assert.equal(
    (await app.request(`${BASE}/${OTHER}/manual/brief`, { method: 'POST' })).status,
    404,
    'not this account'
  )
})

test('manual: a demo built elsewhere is recorded and read back by the list, the detail and Find', async () => {
  const objects = memoryObjects()
  const builder = createManualBuilder({ pool: fakePool(), objects, now: () => NOW })
  const app = mount(builder)
  const put = (b) =>
    app.request(`${BASE}/${MINE}/manual/built`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(b)
    })
  assert.equal((await put({ url: 'javascript:alert(1)' })).status, 422)
  assert.equal((await put({ url: 'https://user:pw@demo.example/' })).status, 422)
  const saved = await put({ url: 'https://demo.example/corner', note: 'Made by our designer' })
  assert.equal(saved.status, 200)
  const demo = {
    builtElsewhere: true,
    url: 'https://demo.example/corner',
    note: 'Made by our designer',
    recordedAt: '2026-10-24T09:00:00.000Z'
  }
  assert.deepEqual(await saved.json(), { demo })
  assert.deepEqual(await builder.listedDemoOf(ACCOUNT, [MINE, OTHER]), new Map([[MINE, { demo }]]))
  assert.deepEqual(await builder.detailOf(OPP, ACCOUNT), { demo })
  assert.deepEqual(
    await builder.demoFactsOf(ACCOUNT, [MINE, OTHER]),
    new Map([[MINE, { built: true, liveSiteKey: null, queuedActionId: null }]])
  )
  assert.deepEqual(await builder.listedDemoOf('someone-else', [MINE]), new Map())
  await app.request(`${BASE}/${MINE}/manual/built`, { method: 'DELETE' })
  assert.deepEqual(await builder.detailOf(OPP, ACCOUNT), { demo: null })
})

test('manual: nothing to set, no templates, the stage stays the research one', async () => {
  const builder = createManualBuilder({ pool: fakePool(), objects: memoryObjects() })
  assert.deepEqual(await builder.settingsOf(domain, ACCOUNT), { builder: 'manual' })
  assert.equal((await builder.saveSettings(domain, ACCOUNT, {})).status, 404)
  assert.deepEqual(await builder.templateChoicesOf({}), {})
  assert.equal(builder.demoJourneySql, null)
})

test('manual: without a file store the doors say so instead of losing the brief', async () => {
  const app = mount(createManualBuilder({ pool: fakePool(), objects: null }))
  const r = await app.request(`${BASE}/${MINE}/manual/brief`, { method: 'POST' })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).code, 'STORE_UNAVAILABLE')
})

test('tracy: a real builder that needs a database and a Tracy connection (end to end: plugins-builder-tracy)', () => {
  assert.throws(() => createTracyBuilder({}), /needs pool and connection/)
  const builder = createTracyBuilder({ pool: fakePool(), connection: { tracyUrl: 'https://tracy.example' } })
  assert.equal(builder.id, 'tracy')
  for (const m of BUILDER_METHODS) assert.equal(typeof builder[m], 'function')
  assert.equal(typeof builder.demoJourneySql, 'function')
})

test('defineBuilder: every member the router calls must be there', () => {
  const ok = Object.fromEntries(BUILDER_METHODS.map((m) => [m, () => {}]))
  assert.equal(defineBuilder({ id: 'x', ...ok }).demoJourneySql, null)
  for (const m of BUILDER_METHODS) {
    const { [m]: _gone, ...rest } = ok
    assert.throws(() => defineBuilder({ id: 'x', ...rest }), new RegExp(`${m} is missing`))
  }
  assert.throws(() => defineBuilder({ id: 'x', ...ok, demoJourneySql: 'select 1' }), /demoJourneySql/)
})

test('loadBuilderFactories: each file of a folder is a factory, named by its file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wo-builders-'))
  const methods = BUILDER_METHODS.map((m) => `${m}: () => {}`).join(', ')
  await writeFile(
    join(dir, 'agency.js'),
    `export default (deps) => ({ id: 'agency', ${methods}, endpoint: deps.endpoint })\n`
  )
  const factories = await loadBuilderFactories(dir)
  assert.deepEqual(Object.keys(factories), ['agency'])
  assert.equal(factories.agency({ endpoint: 'https://agency.example' }).endpoint, 'https://agency.example')
})
