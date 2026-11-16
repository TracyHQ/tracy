// "See another look" on a Website Opportunities demo's share link (10Web idea 5): the business owner previews the same
// demo in a few other design systems and says which look they like, nothing written to the demo.
//   - which systems (`sites/design-system-demo-systems.js` `demoSystemChoice`, `systemsOf`, `eligible`);
//   - the preview layer: each look is the Design system preview's ticket, read by the site proxy's live page, which lays
//     in the bytes an apply would write and nothing else (`lib/ds-preview-ticket.js`, `design-system-live-page.js`);
//   - the share page (`opportunities-build/demo-look-page.js`) and its headers;
//   - the switch `wo-demo-looks` and the doors (`opportunities-build/demo-link-route.js`) on a real Postgres, with the
//     seller's read on the opportunity and /ops/wo. No outbound call is made.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { readDsPreviewTicket } from '../src/lib/ds-preview-ticket.js'
import { translate } from '../src/lib/i18n/index.js'
import { FEATURED_REFERO_SYSTEMS } from '../src/lib/ds-slot.js'
import { pageSecurityHeaders } from '../src/lib/security-headers.js'
import { mintSession } from '../src/lib/session.js'
import { UI_CATALOGUE, uiSwitchOn } from '../src/lib/ui-setting.js'
import { listWoQueue } from '../src/lib/wo-ops.js'
import {
  DEMO_SYSTEM_PICKS_PER_HOUR,
  DEMO_SYSTEMS_READS_PER_HOUR,
  programAgent,
  systemPicksShape
} from '../src/lib/wo-demo-links.js'
import { DEMO_LOOKS_SWITCH } from '../src/opportunities-build/demo-link-route.js'
import { demoLookPage } from '../src/opportunities-build/demo-look-page.js'
import {
  DEMO_SYSTEMS_MAX,
  demoSystemChoice,
  designSystemDemoSystems,
  SURVEY_KEEP_MS
} from '../src/sites/design-system-demo-systems.js'
import { designSystemLivePages } from '../src/sites/design-system-live-page.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { fileDb } from './_db.mjs'

const SECRET = 's'.repeat(32)
const NOW = Date.parse('2026-11-15T10:00:00Z')
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ref = (u) => `refero:${u}`
/** A library row as `referoLibrary` answers it. */
const row = (u, name, ok = true) => ({
  id: ref(u),
  uuid: u,
  name,
  ok,
  colors: ['#112233', '#ffffff', 'nope']
})

// ─── Which systems ────────────────────────────────────────────────────────────────────────────────────────────────

test('the systems offered are the featured ones the library offers, in the featured order, without the worn one', () => {
  const featured = [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5), uuid(6)]
  const offered = [
    row(uuid(9), 'Not featured'),
    row(uuid(4), 'Four'),
    row(uuid(2), 'Two'),
    row(uuid(3), 'Three', false),
    row(uuid(1), 'One'),
    row(uuid(6), 'Six'),
    row(uuid(5), 'Five')
  ]
  const ids = (rows) => rows.map((r) => r.uuid)
  assert.deepEqual(ids(demoSystemChoice(offered, { featured })), [
    uuid(1),
    uuid(2),
    uuid(4),
    uuid(5),
    uuid(6)
  ])
  // The worn system is never offered as "another" look; a refused or missing featured row is skipped silently.
  assert.deepEqual(ids(demoSystemChoice(offered, { featured, worn: ref(uuid(2)) })), [
    uuid(1),
    uuid(4),
    uuid(5),
    uuid(6)
  ])
  assert.deepEqual(demoSystemChoice([], { featured }), [])
  assert.deepEqual(demoSystemChoice(null, { featured }), [])
  // By default the rule is the library's own featured list: nothing is named by hand here.
  const library = FEATURED_REFERO_SYSTEMS.map((u, i) => row(u, `System ${i}`))
  assert.deepEqual(ids(demoSystemChoice(library)), [...FEATURED_REFERO_SYSTEMS])
})

/** The looks module with every dependency a test's own. */
function looksWorld({
  site = {},
  fit = { contract: 'joomla-ja-alpha' },
  templateKey = 'joomla/ja-alpha',
  worn = null,
  emits = () => true,
  locked = () => false,
  survey = null,
  library = FEATURED_REFERO_SYSTEMS.map((u, i) => row(u, `System ${i}`)),
  secret = SECRET,
  servedHere = () => true,
  support = { supported: true }
} = {}) {
  const calls = { survey: 0, emit: [] }
  let clock = NOW
  const theSite = {
    site_key: 'pho-ba.tracy.test',
    label: 'pho-ba',
    platform: 'joomla',
    origin: 'fleet_born',
    host: 'local',
    address: 'https://pho-ba.tracy.test',
    quickstart_tag: 'ja-alpha/j6',
    quickstart_version: '1.0.4',
    ...site
  }
  const looks = designSystemDemoSystems({
    siteByKey: async (key) => (key === theSite.site_key ? theSite : null),
    ds: {
      quickstartTemplateOf: ({ tag }) => (tag ? templateKey : null),
      supportForNewSite: () => support,
      emitFor: async (q) => {
        calls.emit.push(q)
        return emits(q)
          ? { ok: true, platform: 'joomla', html: `<style id="tracy-ds-slot">/* ${q.id} */</style>` }
          : { ok: false, code: 'DS_REFUSED' }
      },
      fontFaces: async () => []
    },
    offered: async () => library,
    survey:
      survey ??
      (async () => {
        calls.survey++
        return { read: { ok: true, slot: worn ? { id: worn, name: 'Worn' } : null }, templateKey, fit }
      }),
    lockedFor: async (email, key) => locked(email, key),
    publicOf: (s) => s.address,
    secret,
    servedHere,
    platforms: new Set(['joomla', 'wordpress', 'emdash']),
    now: () => clock
  })
  return { looks, calls, site: theSite, tick: (ms) => (clock += ms) }
}

test('a demo offers its first four featured systems its contract emits, each a preview ticket for exactly that system', async () => {
  const F = FEATURED_REFERO_SYSTEMS
  // The demo wears the first featured system; the third does not emit through this contract.
  const { looks, calls, site } = looksWorld({ worn: ref(F[0]), emits: (q) => q.id !== ref(F[2]) })
  const out = await looks.systemsOf(site.site_key)
  assert.equal(out.ok, true)
  assert.equal(out.origin, 'https://pho-ba.tracy.test')
  // Fifteen featured systems could be offered: the page shows the first four that wear, numbered from 1.
  assert.equal(out.systems.length, DEMO_SYSTEMS_MAX)
  assert.deepEqual(
    out.systems.map((s) => [s.id, s.n]),
    [
      [ref(F[1]), 1],
      [ref(F[3]), 2],
      [ref(F[4]), 3],
      [ref(F[5]), 4]
    ]
  )
  // The palette is the library's, only colours.
  assert.deepEqual(out.systems[0].colors, ['#112233', '#ffffff'])
  for (const s of out.systems) {
    // 🔒 The ticket is the Design system preview's, for this site, this system and the judged contract and template:
    // the site proxy reads exactly these claims and lays in the bytes an apply would write.
    const claims = readDsPreviewTicket(SECRET, s.ticket, site.site_key, NOW)
    assert.deepEqual(
      { site: claims.site, id: claims.id, contract: claims.contract, template: claims.template },
      { site: site.site_key, id: s.id, contract: 'joomla-ja-alpha', template: 'joomla/ja-alpha' }
    )
    assert.equal(readDsPreviewTicket(SECRET, s.ticket, 'other.tracy.test', NOW), null, 'never another site')
  }
  assert.equal(calls.emit[0].contract, 'joomla-ja-alpha')
  // The read in the container and each emit are kept a while: a second ask runs neither.
  const emitted = calls.emit.length
  await looks.systemsOf(site.site_key)
  assert.equal(calls.survey, 1)
  assert.equal(calls.emit.length, emitted)
})

test('a demo that cannot wear a look offers none, and says why', async () => {
  const reason = async (opts) => {
    const w = looksWorld(opts)
    return (await w.looks.systemsOf(w.site.site_key)).reason
  }
  assert.equal(await reason({ secret: null }), 'NOT_WIRED')
  assert.equal(await reason({ site: { platform: 'shopify' } }), 'PLATFORM')
  assert.equal(await reason({ site: { origin: 'migrated' } }), 'IMPORTED')
  assert.equal(await reason({ servedHere: () => false }), 'NOT_SERVED_HERE')
  assert.equal(await reason({ site: { address: 'ftp://pho-ba' } }), 'NO_ADDRESS')
  assert.equal(await reason({ survey: async () => ({ failed: 'job failed' }) }), 'SITE_UNREADABLE')
  assert.equal(await reason({ fit: { reason: 'TEMPLATE_NOT_READY' } }), 'NO_SLOT')
  // A WordPress template whose theme folder is unknown cannot be dressed by the proxy: no look rather than a false one.
  assert.equal(
    await reason({ site: { platform: 'wordpress' }, templateKey: 'joomla/not-a-theme' }),
    'NO_SLOT'
  )
  // Judged as a customer: the owner holds no seat, so the lock is asked with no email.
  const asked = []
  assert.equal(
    await reason({
      locked: (email, key) => {
        asked.push([email, key])
        return true
      }
    }),
    'TEMPLATE_LOCKED'
  )
  assert.deepEqual(asked, [[null, 'joomla/ja-alpha']])
  assert.equal(await reason({ emits: () => false }), 'NO_SYSTEM')
  assert.equal(await reason({ library: [] }), 'NO_SYSTEM')
  const w = looksWorld()
  assert.equal((await w.looks.systemsOf('unknown.tracy.test')).reason, 'NO_SITE')
})

test('eligible answers without a read in the container: the release can wear a system and its template is open', async () => {
  const yes = looksWorld()
  assert.equal(await yes.looks.eligible(yes.site.site_key), true)
  assert.equal(yes.calls.survey, 0, 'no read in the container')
  const no = async (opts) => {
    const w = looksWorld(opts)
    return w.looks.eligible(w.site.site_key)
  }
  assert.equal(await no({ support: { supported: false } }), false)
  assert.equal(await no({ locked: () => true }), false)
  assert.equal(await no({ site: { quickstart_tag: null } }), false)
  assert.equal(await no({ site: { origin: 'migrated' } }), false)
  assert.equal(await no({ servedHere: () => false }), false)
  assert.equal(
    await no({
      locked: () => {
        throw new Error('db down')
      }
    }),
    false,
    'any doubt is no'
  )
  assert.equal(await yes.looks.eligible('unknown.tracy.test'), false)
})

test('a read in the container is trusted two minutes, then read again', async () => {
  const w = looksWorld()
  await w.looks.systemsOf(w.site.site_key)
  w.tick(SURVEY_KEEP_MS - 1)
  await w.looks.systemsOf(w.site.site_key)
  assert.equal(w.calls.survey, 1)
  w.tick(2)
  await w.looks.systemsOf(w.site.site_key)
  assert.equal(w.calls.survey, 2)
})

// ─── The preview layer ────────────────────────────────────────────────────────────────────────────────────────────

test('a look changes only what an apply would write: the worn slot goes, the system’s slot comes, nothing else moves', async () => {
  const F = FEATURED_REFERO_SYSTEMS
  const { looks, site } = looksWorld({ worn: ref(F[0]) })
  const [first] = (await looks.systemsOf(site.site_key)).systems
  const claims = readDsPreviewTicket(SECRET, first.ticket, site.site_key, NOW)
  const page =
    '<!doctype html><html><head><title>Pho Ba</title><link rel="stylesheet" href="/templates/ja_alpha/css/template.css">' +
    `<style id="tracy-ds-slot">/* tracy-ds-slot: ${ref(F[0])} */</style></head>` +
    '<body><h1>Pho Ba</h1><img src="/images/bowl.jpg" alt="A bowl"></body></html>'
  const emitted = []
  const pages = designSystemLivePages({
    emitFor: async (q) => {
      emitted.push(q)
      return {
        ok: true,
        platform: 'joomla',
        html: `<style id="tracy-ds-slot">/* tracy-ds-slot: ${q.id} */</style>`
      }
    },
    fontFaces: async () => [],
    modeHookOf: () => ({}),
    now: () => NOW
  })
  const worn = await pages.pageOf({
    html: page,
    claims,
    ticket: first.ticket,
    site: { platform: 'joomla' },
    inner: new URL('http://pho-ba-web-1'),
    pub: new URL('https://pho-ba.tracy.test'),
    parentOrigin: 'https://cowork.tracy.test',
    fetchImpl: async () => {
      throw new Error('nothing is read for Joomla')
    }
  })
  assert.deepEqual(
    emitted.map((q) => [q.platform, q.contract, q.id]),
    [['joomla', 'joomla-ja-alpha', first.id]]
  )
  assert.match(worn, new RegExp(`tracy-ds-slot: ${first.id}`))
  assert.doesNotMatch(worn, new RegExp(`tracy-ds-slot: ${ref(F[0])}`), 'the slot the demo wears is taken off')
  // The page's own content and stylesheet stay exactly as the site served them.
  for (const kept of [
    '<h1>Pho Ba</h1>',
    '<img src="/images/bowl.jpg" alt="A bowl">',
    'ja_alpha/css/template.css'
  ])
    assert.ok(worn.includes(kept), kept)
  // The frame script talks to Tracy's origin only and keeps the ticket on same-site links.
  assert.match(worn, /data-parent-origin="https:\/\/cowork\.tracy\.test"/)
})

// ─── The share page ───────────────────────────────────────────────────────────────────────────────────────────────

const WORDS = {
  open: 'See another look',
  current: 'Current look',
  numbered: 'Look {n}',
  note: 'Preview only. Nothing on the site changes.',
  like: 'I like this look',
  sent: 'Thanks. Your choice was sent.',
  own: 'Not counted: this is your own demo.',
  failed: 'Not sent. Try again later.',
  close: 'Close',
  frameTitle: 'Demo site'
}

test('the share page frames the asked demo page, hides its control until looks load, and carries no system name', () => {
  const html = demoLookPage({
    htmlLang: 'en',
    title: 'Pho </title><script>alert(1)</script>',
    target: 'https://pho-ba.tracy.test/menu?lang=vi',
    systemsUrl: '/api/demo-links/T/systems',
    pickUrl: '/api/demo-links/T/systems/pick',
    words: { ...WORDS, current: '</script><script>alert(2)</script>' }
  })
  assert.match(
    html,
    /<iframe class="dl-frame" id="dl-frame" src="https:\/\/pho-ba\.tracy\.test\/menu\?lang=vi" title="Demo site">/
  )
  assert.match(html, /<div class="dl" data-demo-looks hidden>/, 'no control until the looks door answers')
  assert.ok(!html.includes('<script>alert(1)</script>'), 'the title is escaped')
  assert.ok(!html.includes('</script><script>alert(2)'), 'the data block cannot close its script')
  const data = JSON.parse(/<script type="application\/json" id="dl-data">([\s\S]*?)<\/script>/.exec(html)[1])
  assert.deepEqual(
    { origin: data.origin, path: data.path, search: data.search, param: data.param },
    { origin: 'https://pho-ba.tracy.test', path: '/menu', search: '?lang=vi', param: 'tracy_ds_preview' }
  )
  assert.equal(data.words.numbered, 'Look {n}')
  // Tokens from the page shell, a dark side, focus as a 1px stroke that changes colour, never a halo.
  assert.match(html, /--ring:oklch/)
  assert.match(html, /@media \(prefers-color-scheme:dark\)/)
  assert.match(html, /focus-visible\{border-color:var\(--ring\)\}/)
  assert.doesNotMatch(html, /box-shadow:\s*0 0 0 [1-9]/)
  assert.doesNotMatch(html, /ring-[23]|outline:\s*[2-9]px/)
  // Every word the script shows comes from the data block: no English sentence in the script itself.
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1]
  for (const w of Object.values(WORDS)) assert.ok(!script.includes(w), w)
})

test('the share page may frame the demo origin only, and refuses to be framed itself', () => {
  const headers = pageSecurityHeaders({ frameSrc: 'https://pho-ba.tracy.test' })
  assert.match(headers['content-security-policy'], /; frame-src https:\/\/pho-ba\.tracy\.test(;|$)/)
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/)
  assert.equal(headers['x-frame-options'], 'DENY')
  // Anything but one bare origin adds nothing: `default-src 'self'` keeps deciding.
  for (const bad of ['*', "'self' https://x.test", 'https://x.test/path', 'javascript:x', ''])
    assert.doesNotMatch(pageSecurityHeaders({ frameSrc: bad })['content-security-policy'], /frame-src/, bad)
})

// ─── The switch ───────────────────────────────────────────────────────────────────────────────────────────────────

test('the switch is in the catalogue, off by default, and read as off when it cannot be read', async () => {
  const sw = UI_CATALOGUE.switches.find((s) => s.id === DEMO_LOOKS_SWITCH)
  assert.ok(sw, 'wo-demo-looks is a catalogue switch')
  assert.equal(sw.defaultOn, false)
  assert.equal(sw.locked, undefined)
  assert.equal(await uiSwitchOn({ query: async () => ({ rows: [] }) }, DEMO_LOOKS_SWITCH), false)
  assert.equal(await uiSwitchOn({ query: async () => ({ rows: [{ on: true }] }) }, DEMO_LOOKS_SWITCH), true)
  await assert.rejects(() =>
    uiSwitchOn(
      {
        query: async () => {
          throw new Error('down')
        }
      },
      DEMO_LOOKS_SWITCH
    )
  )
})

test('a pick is judged a program by its User-Agent alone', () => {
  const h = (ua) => new Headers(ua ? { 'user-agent': ua } : {})
  assert.equal(programAgent(h('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1')), false)
  for (const ua of ['curl/8.4.0', 'python-requests/2.31', 'Mozilla/5.0 (compatible; Googlebot/2.1)', ''])
    assert.equal(programAgent(h(ua)), true, ua)
  assert.equal(systemPicksShape(null), null)
  assert.deepEqual(systemPicksShape({ total: 0, recent: [] }), { total: 0, latest: null, recent: [] })
})

// ─── The doors, on a real Postgres ────────────────────────────────────────────────────────────────────────────────

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: SECRET,
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const ORIGIN = 'http://tracy.test:8080'
const BASE = '/api/website-opportunities'
const A = 'seller@tracy.test'
const DEMO_ORIGIN = 'http://pho-ba-demo.localhost:8080'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const LOOK_1 = ref(FEATURED_REFERO_SYSTEMS[1])
const LOOK_2 = ref(FEATURED_REFERO_SYSTEMS[2])

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** The app with the looks a test sets: `eligible` and `systemsOf` per site key. */
async function world({ eligible = true, systems = null } = {}) {
  const { pool } = db
  const config = readConfig(env)
  const domain = await websiteOpportunitiesDomain()
  const fetched = []
  const asked = { eligible: 0, systemsOf: 0 }
  const offered = systems ?? {
    ok: true,
    siteKey: 'pho-ba-demo.localhost',
    origin: DEMO_ORIGIN,
    systems: [
      { id: LOOK_1, n: 1, name: 'Notion', colors: ['#000000'], ticket: 'tk1.sig' },
      { id: LOOK_2, n: 2, name: 'Airbnb', colors: ['#ff385c'], ticket: 'tk2.sig' }
    ]
  }
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesRequest: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    demoSystems: {
      eligible: async () => {
        asked.eligible++
        return eligible
      },
      systemsOf: async () => {
        asked.systemsOf++
        return offered
      }
    },
    fetchImpl: async (input) => {
      fetched.push(String(input))
      return Response.json({ code: 'NO_NETWORK' }, { status: 500 })
    }
  })
  const setSwitches = (on) =>
    pool.query(
      `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
       on conflict (id) do update set overrides = excluded.overrides`,
      [JSON.stringify({ 'website-opportunities': true, [DEMO_LOOKS_SWITCH]: on })]
    )
  await setSwitches(false)
  const cookieOf = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const request = async (path, { method = 'GET', ua = IPHONE, email = null, headers = {}, body } = {}) => {
    const sent = { ...(ua ? { 'user-agent': ua } : {}), ...headers }
    if (email) sent.cookie = await cookieOf(email)
    const res = await app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method,
        redirect: 'manual',
        headers: sent,
        ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: res.status, body: parsed, headers: res.headers }
  }
  /** The share page's own pick, as its script sends it from Tracy's origin. */
  const pick = (token, id, extra = {}) =>
    request(`/api/demo-links/${token}/systems/pick`, {
      method: 'POST',
      body: { id },
      ...extra,
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...extra.headers }
    })
  const accountOf = async (email, name = null) =>
    (
      await pool.query(
        `insert into account (email, display_name) values ($1, $2)
         on conflict (email) do update set display_name = excluded.display_name returning id`,
        [email, name]
      )
    ).rows[0].id
  return { app, pool, config, request, pick, accountOf, fetched, asked, setSwitches, cookieOf }
}

/** A finished, QA-passed demo with a live share link. */
async function sharedDemo(pool, accountId, { name = 'Pho Ba' } = {}) {
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, $2, 'osm', $3, $4) returning *`,
      [accountId, name, `node/${randomUUID()}`, JSON.stringify({ name })]
    )
  ).rows[0]
  const rev = await pool.query(
    `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
     values ($1, $2, 1, '{}'::jsonb, '') returning id`,
    [opp.id, accountId]
  )
  const buildId = randomUUID()
  const build = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, state, site_key, label, qa, choice,
         choice_key)
       values ($1, $2, $3, $4, 'done', 'pho-ba-demo.localhost', 'pho-ba-demo', '{"state":"passed"}'::jsonb,
         '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb,
         'fixture') returning id`,
      [accountId, rev.rows[0].id, `b-${randomUUID()}`, buildId]
    )
  ).rows[0]
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state) values ($1, $2, 'h', 'done')`,
    [accountId, buildId]
  )
  const token = randomBytes(24).toString('base64url')
  await pool.query(`insert into wo_demo_link (id, account_id, build_id, token) values ($1, $2, $3, $4)`, [
    randomUUID(),
    accountId,
    build.id,
    token
  ])
  return { opp, buildId: build.id, token }
}

/** One link's hourly bucket filled to `count`, in the window `lib/rate.js` `overLimit` counts in now. */
const fillBucket = (pool, kind, token, count) =>
  pool.query(
    `insert into rate_bucket (bucket, window_start, count)
     select $2 || ':' || l.id, $3, $4 from wo_demo_link l where l.token = $1
     on conflict (bucket, window_start) do update set count = excluded.count`,
    [token, kind, new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000), count]
  )
const opensOf = async (pool) => (await pool.query('select count(*)::int as n from wo_demo_open')).rows[0].n
const picksOf = async (pool) =>
  (await pool.query('select system_id, n, name, device from wo_demo_system_pick order by picked_at')).rows

test(
  'switch off: the share link is the plain 302 and the looks and pick doors are closed',
  opts,
  async () => {
    const { pool, request, pick, accountOf, asked, fetched } = await world()
    const { token } = await sharedDemo(pool, await accountOf(A))
    const opened = await request(`/d/${token}`, { headers: { 'sec-fetch-dest': 'document' } })
    assert.equal(opened.status, 302)
    assert.equal(opened.headers.get('location'), `${DEMO_ORIGIN}/`)
    assert.equal(asked.eligible, 0, 'nothing is judged while the switch is off')
    assert.equal(await opensOf(pool), 1, 'the open is counted as before')
    assert.deepEqual((await request(`/api/demo-links/${token}/systems`)).body, { code: 'FEATURE_OFF' })
    assert.equal((await pick(token, 'current')).status, 404)
    assert.deepEqual(await picksOf(pool), [])
    assert.deepEqual(fetched, [], 'no outbound call')
  }
)

test(
  'switch on: a person’s own visit of a demo that can wear a look gets the share page, counted like the 302',
  opts,
  async () => {
    const { pool, request, accountOf, setSwitches, asked } = await world()
    const { token } = await sharedDemo(pool, await accountOf(A))
    await setSwitches(true)
    const page = await request(`/d/${token}/menu?lang=vi`, { headers: { 'sec-fetch-dest': 'document' } })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.match(page.headers.get('content-security-policy'), new RegExp(`frame-src ${DEMO_ORIGIN}(;|$)`))
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal(page.headers.get('cache-control'), 'no-store')
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(page.headers.get('x-robots-tag'), 'noindex')
    assert.equal(page.headers.get('set-cookie'), null)
    assert.match(page.body, new RegExp(`src="${DEMO_ORIGIN}/menu\\?lang=vi"`))
    // `?lang=vi` also picks the page's own language, as on every tracy-web page.
    assert.match(page.body, /<html lang="vi">/)
    assert.ok(
      page.body.includes(translate('vi', 'demoLooks.open')),
      'the Vietnamese words, from the dictionary'
    )
    assert.match(page.body, /<title>Pho Ba<\/title>/)
    // A browser without Fetch Metadata is a person too.
    assert.equal((await request(`/d/${token}`)).status, 200)
    assert.equal(await opensOf(pool), 2)

    // Never for a program, a prefetch, a frame or a HEAD: the 302, and only people are counted.
    assert.equal((await request(`/d/${token}`, { ua: 'facebookexternalhit/1.1' })).status, 302)
    assert.equal((await request(`/d/${token}`, { headers: { 'sec-purpose': 'prefetch' } })).status, 302)
    assert.equal((await request(`/d/${token}`, { headers: { 'sec-fetch-dest': 'iframe' } })).status, 302)
    assert.equal((await request(`/d/${token}`, { method: 'HEAD' })).status, 302)
    assert.equal(await opensOf(pool), 3, 'the framed visit is a person, counted; the rest are not')
    // The seller sees the same page, uncounted.
    assert.equal((await request(`/d/${token}`, { email: A, ua: MAC })).status, 200)
    assert.equal(await opensOf(pool), 3)
    assert.ok(asked.eligible >= 3)
  }
)

test('switch on, but the demo cannot wear a look: the plain 302', opts, async () => {
  const { pool, request, accountOf, setSwitches } = await world({ eligible: false })
  const { token } = await sharedDemo(pool, await accountOf(A))
  await setSwitches(true)
  const opened = await request(`/d/${token}`, { headers: { 'sec-fetch-dest': 'document' } })
  assert.equal(opened.status, 302)
  assert.equal(await opensOf(pool), 1)
})

test(
  'the looks door answers numbers, palettes and tickets, never a library name, and says why when there are none',
  opts,
  async () => {
    const { pool, request, accountOf, setSwitches } = await world()
    const { token } = await sharedDemo(pool, await accountOf(A))
    await setSwitches(true)
    const looks = await request(`/api/demo-links/${token}/systems`)
    assert.equal(looks.status, 200)
    assert.equal(looks.headers.get('cache-control'), 'no-store')
    assert.deepEqual(looks.body, {
      origin: DEMO_ORIGIN,
      param: 'tracy_ds_preview',
      systems: [
        { id: LOOK_1, n: 1, colors: ['#000000'], ticket: 'tk1.sig' },
        { id: LOOK_2, n: 2, colors: ['#ff385c'], ticket: 'tk2.sig' }
      ]
    })
    assert.ok(!JSON.stringify(looks.body).includes('Notion'))
    assert.equal((await request(`/api/demo-links/${'x'.repeat(32)}/systems`)).status, 404)
    assert.equal((await request('/api/demo-links/short/systems')).status, 404)
    // Past the hourly cap of one link: 429.
    await fillBucket(pool, 'wo-demo-systems', token, DEMO_SYSTEMS_READS_PER_HOUR)
    assert.deepEqual((await request(`/api/demo-links/${token}/systems`)).body, { code: 'RATE_LIMITED' })
  }
)

test('a demo the looks module refuses offers no look, with its reason', opts, async () => {
  const { pool, request, accountOf, setSwitches } = await world({
    systems: { ok: false, reason: 'TEMPLATE_LOCKED' }
  })
  const { token } = await sharedDemo(pool, await accountOf(A))
  await setSwitches(true)
  assert.deepEqual((await request(`/api/demo-links/${token}/systems`)).body, {
    origin: null,
    param: 'tracy_ds_preview',
    systems: [],
    reason: 'TEMPLATE_LOCKED'
  })
})

test('looks served on another origin than the share link’s demo are not offered', opts, async () => {
  const { pool, request, accountOf, setSwitches } = await world({
    systems: {
      ok: true,
      origin: 'https://elsewhere.test',
      systems: [{ id: LOOK_1, n: 1, name: 'x', colors: [], ticket: 't' }]
    }
  })
  const { token } = await sharedDemo(pool, await accountOf(A))
  await setSwitches(true)
  assert.equal((await request(`/api/demo-links/${token}/systems`)).body.reason, 'NO_ADDRESS')
})

test(
  'a person’s pick is counted like an open; a program, the seller and picks past the cap are answered and not written',
  opts,
  async () => {
    const { pool, config, request, pick, accountOf, setSwitches } = await world()
    const { opp, token, buildId } = await sharedDemo(pool, await accountOf(A))
    await setSwitches(true)

    assert.deepEqual((await pick(token, LOOK_2)).body, { counted: true })
    assert.deepEqual((await pick(token, 'current', { ua: MAC })).body, { counted: true })
    assert.deepEqual(await picksOf(pool), [
      { system_id: LOOK_2, n: 2, name: 'Airbnb', device: 'phone' },
      { system_id: 'current', n: null, name: null, device: 'desktop' }
    ])
    // 🔒 Nothing that names the visitor: the table holds exactly these columns.
    const columns = (
      await pool.query(
        `select column_name from information_schema.columns where table_name = 'wo_demo_system_pick' order by 1`
      )
    ).rows.map((r) => r.column_name)
    assert.deepEqual(columns, ['device', 'id', 'link_id', 'n', 'name', 'picked_at', 'system_id'])

    // Not counted: a program, the seller's own session.
    assert.deepEqual((await pick(token, LOOK_1, { ua: 'curl/8.4.0' })).body, {
      counted: false,
      reason: 'PROGRAM'
    })
    assert.deepEqual((await pick(token, LOOK_1, { email: A })).body, { counted: false, reason: 'OWN' })
    // Refused: not a look offered now, not a look at all, not JSON, not from Tracy's own page.
    assert.deepEqual((await pick(token, ref(FEATURED_REFERO_SYSTEMS[9]))).body, { code: 'LOOK_NOT_OFFERED' })
    assert.deepEqual((await pick(token, 'od:linear')).body, { code: 'INVALID_LOOK' })
    assert.deepEqual((await pick(token, 42)).body, { code: 'INVALID_LOOK' })
    const notJson = await request(`/api/demo-links/${token}/systems/pick`, {
      method: 'POST',
      body: 'id=current',
      headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' }
    })
    assert.equal(notJson.status, 415)
    for (const headers of [
      { 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-site': 'cross-site', origin: ORIGIN },
      { origin: 'https://evil.test' },
      {}
    ]) {
      const res = await request(`/api/demo-links/${token}/systems/pick`, {
        method: 'POST',
        body: { id: 'current' },
        headers: { 'content-type': 'application/json', ...headers }
      })
      assert.equal(res.status, 403, JSON.stringify(headers))
      assert.equal(res.body.code, 'CSRF_ORIGIN')
    }
    // An old browser with no Fetch Metadata, from Tracy's own origin.
    const old = await request(`/api/demo-links/${token}/systems/pick`, {
      method: 'POST',
      body: { id: 'current' },
      headers: { 'content-type': 'application/json', origin: config.origin }
    })
    assert.deepEqual(old.body, { counted: true })
    assert.equal((await picksOf(pool)).length, 3)

    // Past the hourly cap: answered, not written.
    await fillBucket(pool, 'wo-demo-pick', token, DEMO_SYSTEM_PICKS_PER_HOUR)
    assert.deepEqual((await pick(token, 'current')).body, { counted: false, reason: 'RATE_LIMITED' })
    assert.equal((await picksOf(pool)).length, 3)

    // The seller reads the picks on the opportunity and /ops/wo, newest first, with the system's name.
    const detail = (await request(`${BASE}/${opp.id}`, { email: A, ua: MAC, headers: { origin: ORIGIN } }))
      .body
    assert.equal(detail.demo.systemPicks.total, 3)
    assert.equal(detail.demo.systemPicks.latest.id, 'current')
    assert.deepEqual(
      detail.demo.systemPicks.recent.map((p) => [p.id, p.n, p.name]),
      [
        ['current', null, null],
        ['current', null, null],
        [LOOK_2, 2, 'Airbnb']
      ]
    )
    const ops = (await listWoQueue(pool, readConfig(env))).opportunities.find((o) => o.id === opp.id)
    assert.equal(ops.demoSystemPicks.total, 3)
    assert.equal(ops.demoSystemPicks.recent[2].name, 'Airbnb')

    // A stopped link and a deleted demo close both doors.
    await pool.query('update wo_demo_link set revoked_at = now() where token = $1', [token])
    assert.equal((await pick(token, 'current')).status, 404)
    await pool.query('update wo_demo_link set revoked_at = null where token = $1', [token])
    await pool.query(`update wo_build set state = 'deleted', demo_deleted_at = now() where id = $1`, [
      buildId
    ])
    assert.equal((await pick(token, 'current')).status, 410)
    assert.equal((await request(`/api/demo-links/${token}/systems`)).status, 410)
  }
)

test('a build whose link was never opened reads zero picks; one with no link reads none', opts, async () => {
  const { pool, accountOf } = await world()
  const { buildId } = await sharedDemo(pool, await accountOf(A))
  const { systemPicksOf } = await import('../src/lib/wo-demo-links.js')
  assert.deepEqual((await systemPicksOf(pool, [buildId])).get(buildId), {
    total: 0,
    latest: null,
    recent: []
  })
  await pool.query('delete from wo_demo_link where build_id = $1', [buildId])
  assert.equal((await systemPicksOf(pool, [buildId])).has(buildId), false)
})
