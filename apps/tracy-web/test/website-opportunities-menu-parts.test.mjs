// The Menu's two research parts on a real database (tasks/todo-wo-menu-items.md): `menu-file` and `menu-photos` are rows
// of the place's snapshot, a Research again limited to them reads only the photos it froze, and a place that is not a
// food or drink business has no menu parts. Scratch Postgres; the website, file store and vision model are fakes.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import {
  MENU_PHOTO_SYSTEM,
  menuPhotoCeilingCents,
  menuVisionDoorOf
} from 'website-opportunities/src/menu-photo-reading.js'
import { joinPlace } from 'website-opportunities/src/place-jobs.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { placeAgainPlan, queueResearchAgain } from 'website-opportunities/src/research-again.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { placeAgainPreview, placeDetail } from 'website-opportunities/src/wo-places-store.js'
import { websiteOpportunitiesRoutes } from 'website-opportunities/src/route.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)
const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

const PLACE_ID = 'ChIJMenuParts1'
const MENU = ['https://cafe.test/uploads/menu-1.png', 'https://cafe.test/uploads/menu-2.png']
/** Pictures nothing names a menu (flat, so text-heavy guesses): read only up to the not-menu streak. */
const GUESSES = Array.from({ length: 7 }, (_, n) => `https://cafe.test/uploads/photo-${n + 1}.png`)
const pictures = new Map()
before(async () => {
  const png = (background) =>
    sharp({ create: { width: 800, height: 600, channels: 3, background } })
      .png()
      .toBuffer()
  pictures.set(MENU[0], await png('#945432'))
  pictures.set(MENU[1], await png('#2f5d8a'))
  for (const [n, url] of GUESSES.entries()) pictures.set(url, await png(`#1${n}a0c${n}`))
})

const door = (model) =>
  menuVisionDoorOf(
    {
      state: 'ok',
      credential: { apiKey: 'k', baseUrl: 'https://vision.test', model },
      snapshot: { presetId: 'deepseek', metadata: { vision: true } }
    },
    woHost
  )

async function fixture({ food = true, guesses = 0, notMenuAfter = Infinity } = {}) {
  const { pool } = db
  const accountId = (await pool.query("insert into account(email) values('menu@tracy.test') returning id"))
    .rows[0].id
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'Cafe Menu',
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Cafe Menu' }
  })
  const real = await websiteOpportunitiesDomain()
  const stats = { website: 0, menuCalls: 0 }
  const vision = { current: door('deepseek-flash') }
  const blocked = { available: false, collect: async () => ({ status: 'blocked', media: [] }) }
  const stored = new Map()
  const domain = {
    ...real,
    connectorsFor: () => ({
      ...Object.fromEntries(['facebook', 'instagram', 'tiktok', 'youtube'].map((s) => [s, blocked])),
      website: {
        available: true,
        collect: async () => {
          stats.website += 1
          return {
            source: 'website',
            status: 'complete',
            cursor: null,
            profile: { name: 'Cafe Menu' },
            pages: [],
            menus: [],
            bookings: [],
            socials: {},
            media: (food ? [...MENU, ...GUESSES.slice(0, guesses)] : []).map((url) => ({
              url,
              kind: 'image',
              sourceUrl: 'https://cafe.test/'
            })),
            logos: [],
            coverage: { fetched: 1 }
          }
        }
      }
    }),
    fetchPlaceDetails: async () => ({
      id: PLACE_ID,
      displayName: { text: 'Cafe Menu' },
      websiteUri: 'https://cafe.test/',
      ...(food ? { servesDinner: true } : {})
    }),
    fetchLimited: async (url) => ({ url, status: 200, mime: 'image/png', bytes: pictures.get(url) })
  }
  const settings = {
    ...normalizeWoOpsSettings({
      pageSpeedCheckEnabled: false,
      googlePlacesPhotos: false,
      providerOrder: { 'menu-items': ['document-text', 'photo-vision'] }
    }),
    tripadvisorReviews: false
  }
  const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 }) })
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({ keys: { google: 'test-google' }, settings }),
    chargeable: createChargeable(ledger),
    menuVisionDoor: async () => vision.current,
    apiFetch: async (url, init) => {
      const body = JSON.parse(init.body)
      const menu = body.messages[0].content === MENU_PHOTO_SYSTEM
      if (menu) stats.menuCalls += 1
      const content = !menu
        ? { kind: 'photo' }
        : stats.menuCalls > notMenuAfter
          ? { isMenu: false, items: [] }
          : { isMenu: true, items: [{ name: `Dish ${stats.menuCalls}`, price: '30', currency: 'AED' }] }
      return Response.json({
        id: 'r',
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 900, completion_tokens: 600 }
      })
    },
    objects: {
      put: async (key, bytes) => {
        stored.set(key, Buffer.from(bytes))
        return true
      },
      get: async (key) => (stored.has(key) ? new Response(stored.get(key)) : null)
    },
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    switchOn: async () => true,
    log: { warn() {}, error() {}, log() {}, info() {} }
  })
  const drain = async () => {
    for (let i = 0; i < 20; i++) {
      const { claimed, done } = await ex.tick()
      if (!claimed) return
      await done
    }
  }
  await requestResearch(pool, { accountId, opportunity, requestId: 'menu-first', requiredSources: {} })
  await drain()
  const placeId = (await pool.query('select place_id from wo_opportunity where id = $1', [opportunity.id]))
    .rows[0].place_id
  const deps = { domain, settings, keys: { google: 'test-google', menuVision: async () => vision.current } }
  return { pool, accountId, opportunity, placeId, stats, vision, drain, deps, domain }
}

const menuRows = async (pool, placeId) =>
  (
    await pool.query(
      `select ss.source, ss.status, ss.reason, ss.collector_version, ss.collected
         from wo_place p join wo_place_snapshot_source ss on ss.snapshot_id = p.current_snapshot_id
        where p.id = $1 and ss.source like 'menu-%' order by ss.source`,
      [placeId]
    )
  ).rows

test(
  'a food place: its menu photos are a research part of their own, read once and shown as the Menu',
  opts,
  async () => {
    const h = await fixture()
    assert.equal(h.stats.menuCalls, 2)
    const rows = await menuRows(h.pool, h.placeId)
    assert.deepEqual(
      rows.map((r) => [r.source, r.status, r.reason]),
      [
        ['menu-file', 'skipped', 'not_found'],
        ['menu-photos', 'complete', null]
      ]
    )
    assert.match(rows[1].collector_version, /^menu-photos-/)
    assert.deepEqual(
      rows[1].collected.photos.map((p) => [p.result, p.items]),
      [
        ['menu', 1],
        ['menu', 1]
      ]
    )
    const menu = (await placeViewOf(h.pool, h.opportunity)).menu
    assert.equal(menu.state, 'read')
    assert.deepEqual(menu.counts, { file: 0, photo: 2, photosRead: 2, photosTotal: 2, limit: 24 })
    assert.equal(menu.currency, 'AED')
    assert.equal(menu.photos[0].costCents, undefined, 'the customer does not see costs')
    const ops = (await placeDetail(h.pool, h.placeId, Date.now())).menu
    assert.equal(ops.photos[0].model, 'deepseek-flash')
    assert.ok(ops.photos[0].costCents >= 1)
    const charged = (
      await h.pool.query("select count(*)::int as n from wo_cost_ledger where provider = 'vision'")
    ).rows[0].n
    assert.equal(charged, 2)
  }
)

test(
  'Read menu again: nothing to read is up to date; a new vision model reads the frozen photos and nothing else',
  opts,
  async () => {
    const h = await fixture()
    const now = Date.now()
    const parts = ['menu-file', 'menu-photos']
    const idle = await placeAgainPlan(h.pool, h.placeId, { now, ...h.deps, onlyParts: parts })
    assert.deepEqual(idle.run, [])
    assert.deepEqual(
      idle.kept.map((k) => [k.part, k.reason]),
      [
        ['menu-file', 'none'],
        ['menu-photos', 'up-to-date']
      ]
    )
    h.vision.current = door('other-model')
    const plan = await placeAgainPreview(h.pool, h.placeId, { nowMs: now, ...h.deps, onlyParts: parts })
    assert.deepEqual(plan.plan.run, [
      {
        part: 'menu-photos',
        reason: 'rule-changed',
        ceilingCents: 2 * menuPhotoCeilingCents('other-model'),
        photos: 2
      }
    ])
    assert.ok(
      plan.plan.kept.every((k) => parts.includes(k.part)),
      'parts limits the plan'
    )
    const website = h.stats.website
    const queued = await queueResearchAgain(h.pool, h.placeId, {
      now,
      starter: { kind: 'operator' },
      ...h.deps,
      onlyParts: parts
    })
    assert.ok(queued.job.again_plan)
    await h.drain()
    assert.equal(h.stats.menuCalls, 4)
    assert.equal(h.stats.website, website, 'nothing outside the menu parts is collected again')
    const [, photos] = await menuRows(h.pool, h.placeId)
    assert.ok(photos.collected.photos.every((p) => p.model === 'other-model'))
  }
)

// Lee (24/10/2026): past the photos a source labels as a menu, reading stops after 4 not-menus in a row; the photos
// left say so, and Read menu again reads the next batch, its preview saying how many.
test(
  'menu photos past 4 not-menus in a row stop early; Read menu again previews and reads the next batch',
  opts,
  async () => {
    const h = await fixture({ guesses: 7, notMenuAfter: 2 })
    assert.equal(h.stats.menuCalls, 6, 'two labeled photos and four guesses')
    const first = (await placeDetail(h.pool, h.placeId, Date.now())).menu
    assert.deepEqual(
      first.photos.map((p) => p.result),
      [
        'menu',
        'menu',
        'not-menu',
        'not-menu',
        'not-menu',
        'not-menu',
        'stopped-early',
        'stopped-early',
        'stopped-early'
      ]
    )
    assert.equal(first.state, 'read', 'a stop is not a partly read menu')
    const now = Date.now()
    const plan = await placeAgainPreview(h.pool, h.placeId, {
      nowMs: now,
      ...h.deps,
      onlyParts: ['menu-photos']
    })
    assert.deepEqual(
      plan.plan.run.map((r) => [r.part, r.photos]),
      [['menu-photos', 3]]
    )
    await queueResearchAgain(h.pool, h.placeId, {
      now,
      starter: { kind: 'operator' },
      ...h.deps,
      onlyParts: ['menu-photos']
    })
    await h.drain()
    assert.equal(h.stats.menuCalls, 9)
    const after = (await placeDetail(h.pool, h.placeId, Date.now())).menu
    assert.equal(after.photos.filter((p) => p.result === 'stopped-early').length, 0)
  }
)

test(
  'Try again of the menu photos alone is a run of that part; with every photo read it calls no model',
  opts,
  async () => {
    const h = await fixture()
    const client = await h.pool.connect()
    try {
      await client.query('begin')
      await joinPlace(client, h.placeId, { onlySource: 'menu-photos', starter: { kind: 'operator' } })
      await client.query('commit')
    } finally {
      client.release()
    }
    await h.drain()
    assert.equal(h.stats.menuCalls, 2)
    const job = (
      await h.pool.query('select state, only_source from wo_place_job where only_source is not null')
    ).rows[0]
    assert.deepEqual([job.state, job.only_source], ['completed', 'menu-photos'])
  }
)

test(
  'a place that is not a food or drink business has no menu parts, no Menu and nothing to read again',
  opts,
  async () => {
    const h = await fixture({ food: false })
    assert.deepEqual(await menuRows(h.pool, h.placeId), [])
    assert.equal((await placeViewOf(h.pool, h.opportunity)).menu, null)
    const plan = await placeAgainPlan(h.pool, h.placeId, { now: Date.now(), ...h.deps })
    assert.ok(![...plan.run, ...plan.kept].some((p) => p.part.startsWith('menu-')))
    assert.equal(h.stats.menuCalls, 0)
  }
)

test(
  'an account presses Read menu again: its run holds the menu parts only and is its own to pay',
  opts,
  async () => {
    const h = await fixture()
    // Everything else is due again too (a month later), yet only the menu parts run.
    const later = Date.now() + 40 * 86_400_000
    h.vision.current = door('other-model')
    const out = await requestResearch(h.pool, {
      accountId: h.accountId,
      opportunity: h.opportunity,
      requestId: 'menu-again-1',
      now: () => later,
      again: { ...h.deps, onlyParts: ['menu-file', 'menu-photos'] }
    })
    assert.deepEqual(
      out.plan.run.map((r) => r.part),
      ['menu-file', 'menu-photos']
    )
    const run = (await h.pool.query('select * from wo_place_job where id = $1', [out.job.place_job_id]))
      .rows[0]
    assert.equal(run.started_by, 'account')
    assert.deepEqual(
      run.again_plan.run.map((r) => r.part),
      ['menu-file', 'menu-photos']
    )
  }
)

// #1687 follow-up: the customer door read its keys without the vision model, so its Read menu again said `not_configured`
// while /ops ran. The doors take the host's runtime, the one /ops reads.
test(
  "the customer's Read menu again preview plans the menu photos with the host's vision model",
  opts,
  async () => {
    const h = await fixture()
    h.vision.current = door('other-model')
    const ORIGIN = 'http://tracy.test:8080'
    const config = readConfig({
      TRACY_ORIGIN: ORIGIN,
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k'
    })
    const runtimeOf = (keys) => async () => ({ keys, settings: h.deps.settings })
    const routes = (keys) =>
      websiteOpportunitiesRoutes({
        config,
        pool: h.pool,
        host: woHost,
        request: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
        ensureAccount,
        loadDomain: async () => h.domain,
        objects: null,
        runtime: runtimeOf(keys),
        fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
      })
    await h.pool.query(
      `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
       on conflict (id) do update set overrides = excluded.overrides`,
      [JSON.stringify({ 'website-opportunities': true })]
    )
    const cookie = `tracy_sess=${await mintSession('menu@tracy.test', config.sessionSecret)}`
    const preview = async (keys) => {
      const res = await routes(keys).fetch(
        new Request(
          `${ORIGIN}/api/website-opportunities/${h.opportunity.id}/research-again?parts=menu-file,menu-photos`,
          { headers: { origin: ORIGIN, cookie } }
        )
      )
      assert.equal(res.status, 200)
      return (await res.json()).plan
    }
    const ready = await preview(h.deps.keys)
    assert.deepEqual(
      ready.run.map((r) => [r.part, r.reason, r.photos]),
      [['menu-photos', 'rule-changed', 2]]
    )
    // A host with no vision model: the photos are not read, and the preview says why.
    const none = await preview({ google: 'test-google' })
    assert.deepEqual(none.run, [])
    assert.ok(none.kept.some((k) => k.part === 'menu-photos'))
  }
)
