// The `tracy` builder in the standalone server, end to end against a fake Tracy: the operator connects on the
// Operator page, then one press builds a demo, its status is followed to `ready`, a limit is surfaced, a cancel
// reaches Tracy, and a timeout never makes a second demo.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { migrate } from '../src/schema/index.js'
import { readStandaloneConfig } from '../src/standalone/config.js'
import { ensureOperatorPrincipal } from '../src/standalone/operator-principal.js'
import { createStandaloneApp } from '../src/standalone/server.js'
import { scratchDatabase } from './scratch-database.mjs'
import { startFakeTracy } from './tracy-fake.mjs'
import { validateDemoRequest } from '../domain/demo-request.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const BASE = '/api/website-opportunities'
const OP = `${BASE}/operator`
const TOKEN = 'operator-token-for-the-tracy-builder-tests'
const quiet = { info() {}, warn() {}, error() {}, log() {} }

let scratch
let dataDir
let tracy
let app
let ticks
let principal
const clock = { t: Date.now() }
const GOOGLE_KEY = 'google-key-for-the-tracy-builder-tests'
const PHOTO_URI = 'https://lh3.googleusercontent.com/place-photos/AbC=s1600-w1600'
const googleAsked = []

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  scratch = await scratchDatabase()
  await migrate(scratch.pool)
  principal = (await ensureOperatorPrincipal(scratch.pool)).id
  dataDir = await mkdtemp(join(tmpdir(), 'wo-tracy-builder-'))
  tracy = await startFakeTracy()
  const config = readStandaloneConfig({
    DATABASE_URL: scratch.url,
    DATA_DIR: dataDir,
    OPERATOR_TOKEN: TOKEN,
    TRACY_URL: tracy.url,
    GOOGLE_PLACES_API_KEY: GOOGLE_KEY
  })
  const made = createStandaloneApp({
    config,
    pool: scratch.pool,
    // Research and crawls stay offline; only the Tracy calls go out (to the fake).
    fetchImpl: async (input, init) => {
      const href = String(input instanceof Request ? input.url : input)
      // Places photo media (skipHttpRedirect): answers the public photoUri, key in a header only.
      if (href.startsWith('https://places.googleapis.com/v1/places/ChIJx/photos/AbC/media')) {
        googleAsked.push({ href, key: new Headers(init?.headers).get('x-goog-api-key') })
        return Response.json({ name: 'places/ChIJx/photos/AbC/media', photoUri: PHOTO_URI })
      }
      return new Response('offline', { status: 404 })
    },
    resolve: async () => [{ address: '2606:4700:4700::1111', family: 6 }],
    tracyFetch: fetch,
    tracyTimeoutMs: 300,
    now: () => clock.t,
    log: quiet
  })
  app = made.app
  ticks = made.ticks
})

after(async () => {
  await tracy?.close()
  await scratch?.close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

async function call(method, path, body) {
  const res = await app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  )
  return { status: res.status, body: await res.json().catch(() => null) }
}

const tick = () => ticks.find((t) => t.name === 'tracy').run()

async function newOpportunity(name) {
  const { rows } = await scratch.pool.query(
    `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
     values ($1, $2, 'osm', $3, $4) returning id`,
    [
      principal,
      name,
      `node/${Math.random()}`,
      { name, address: '1 Main Street, Springfield', phone: '+1 555 0100', lat: 40.7, lon: -74 }
    ]
  )
  return rows[0].id
}

test('the Operator page has a Tracy tab', opts, async () => {
  const me = await call('GET', `${OP}/me`)
  assert.equal(me.body.tracy, true)
})

test('Build before connecting answers TRACY_NOT_CONNECTED and sends nothing', opts, async () => {
  const id = await newOpportunity('Early Bird')
  const out = await call('POST', `${BASE}/${id}/tracy/demo`, {})
  assert.equal(out.status, 409)
  assert.equal(out.body.code, 'TRACY_NOT_CONNECTED')
  assert.equal(tracy.state.demos.size, 0)
  assert.equal((await call('GET', `${BASE}/${id}`)).body.demo, null)
})

test('connect and disconnect need a JSON body', opts, async () => {
  const res = await app.fetch(
    new Request(`http://localhost${OP}/tracy/connect`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' },
      body: '{}'
    })
  )
  assert.equal(res.status, 415)
})

test('the operator connects: code and link, then Connected as the account, never a token', opts, async () => {
  const pending = await call('POST', `${OP}/tracy/connect`, {})
  assert.equal(pending.status, 200)
  assert.equal(pending.body.state, 'pending')
  assert.match(pending.body.userCode, /^[0-9A-F]{4}-[0-9A-F]{4}$/)
  assert.ok(pending.body.verificationUriComplete.startsWith(tracy.url))
  tracy.decide(pending.body.userCode)
  const done = await call('GET', `${OP}/tracy`)
  assert.equal(done.body.state, 'connected')
  assert.equal(done.body.account.email, 'seller@example.com')
  assert.equal(JSON.stringify(done.body).includes('tra_'), false)
  assert.equal((await call('GET', `${BASE}/tracy/connection`)).body.state, 'connected')
})

let built
test('Build it with Tracy sends the place, then the tick follows the demo to ready', opts, async () => {
  built = await newOpportunity('Corner Cafe')
  const sent = await call('POST', `${BASE}/${built}/tracy/demo`, {})
  assert.equal(sent.status, 202, JSON.stringify(sent.body))
  assert.equal(sent.body.demo.status, 'queued')
  assert.deepEqual(sent.body.demo.demos, { live: 1, limit: 20 }, 'Tracy’s count of live demos is kept')
  const [demo] = [...tracy.state.demos.values()]
  assert.equal(demo.body.schema, 'website-opportunities/demo-request/v1')
  assert.equal(demo.body.business.name, 'Corner Cafe')
  assert.deepEqual(demo.body.business.location, { lat: 40.7, lon: -74 })

  const again = await call('POST', `${BASE}/${built}/tracy/demo`, {})
  assert.equal(again.status, 200, 'a second press answers the same demo')
  assert.equal(tracy.state.demos.size, 1)

  // The site exists and waits for the operator's AI in Tracy's chat: the card links that chat.
  tracy.advance(demo.id, 'waiting-for-you')
  clock.t += 15_000
  await tick()
  const waiting = (await call('GET', `${BASE}/${built}`)).body.demo
  assert.equal(waiting.status, 'waiting-for-you')
  assert.equal(
    waiting.editUrl,
    `https://tracy.example/corner-cafe/s/wo-demo-${demo.id}?wo-demo-chat=${demo.id}`
  )
  assert.equal((await call('POST', `${BASE}/${built}/tracy/demo`, {})).status, 200, 'still the same demo')

  tracy.advance(demo.id, 'building')
  clock.t += 60_000
  await tick()
  assert.equal((await call('GET', `${BASE}/${built}`)).body.demo.status, 'building')

  tracy.advance(demo.id, 'ready')
  clock.t += 15_000
  await tick()
  const detail = (await call('GET', `${BASE}/${built}`)).body.demo
  assert.equal(detail.status, 'ready')
  assert.equal(detail.url, 'https://corner-cafe.example')
  assert.equal(detail.editUrl, 'https://tracy.example/s/corner-cafe')
  assert.equal(detail.expiresAt, demo.expiresAt)
  // A ready demo moves the row to the Outreach stage with a draft carrying its link.
  const listed = (await call('GET', `${BASE}?ids=${built}`)).body.opportunities[0]
  assert.equal(listed.stage, 'outreach')
  assert.match(listed.outreach.message.auto, /corner-cafe\.example/)
})

test('the tick waits as long as Retry-After says', opts, async () => {
  const id = await newOpportunity('Slow Bakery')
  await call('POST', `${BASE}/${id}/tracy/demo`, {})
  const demo = [...tracy.state.demos.values()].at(-1)
  tracy.state.retryAfter = 120
  try {
    clock.t += 15_000
    await tick()
    const polls = demo.polls
    clock.t += 60_000
    await tick()
    assert.equal(demo.polls, polls, 'not asked again inside Retry-After')
    clock.t += 61_000
    await tick()
    assert.equal(demo.polls, polls + 1)
  } finally {
    tracy.state.retryAfter = null
  }
})

test('cancel reaches Tracy', opts, async () => {
  const id = await newOpportunity('Cancel Corner')
  await call('POST', `${BASE}/${id}/tracy/demo`, {})
  const out = await call('POST', `${BASE}/${id}/tracy/demo/cancel`, {})
  assert.equal(out.status, 200, JSON.stringify(out.body))
  assert.equal(out.body.demo.status, 'cancelled')
  assert.equal([...tracy.state.demos.values()].at(-1).status, 'cancelled')
})

test('a timeout never makes a second demo: the retry sends the same key and body', opts, async () => {
  const id = await newOpportunity('Timeout Tavern')
  const before = tracy.state.demos.size
  tracy.state.stallNextCreateMs = 1_000
  const sent = await call('POST', `${BASE}/${id}/tracy/demo`, {})
  assert.equal(sent.status, 202)
  assert.equal(sent.body.demo.status, 'submitting', 'not confirmed yet')
  assert.equal(tracy.state.demos.size, before + 1, 'Tracy made it anyway')
  await new Promise((r) => setTimeout(r, 1_100))
  clock.t += 60_000
  await tick()
  assert.equal(tracy.state.demos.size, before + 1, 'the retry found the same demo')
  assert.equal((await call('GET', `${BASE}/${id}`)).body.demo.status, 'queued')
})

test('the live demo limit comes back with its numbers', opts, async () => {
  const id = await newOpportunity('Full House')
  tracy.state.limit = 2
  try {
    const out = await call('POST', `${BASE}/${id}/tracy/demo`, {})
    assert.equal(out.status, 409)
    assert.equal(out.body.code, 'DEMO_LIMIT_REACHED')
    assert.equal(out.body.limit, 2)
    assert.ok(out.body.live >= 2)
    const demo = (await call('GET', `${BASE}/${id}`)).body.demo
    assert.equal(demo.status, 'refused')
    assert.equal(demo.error.code, 'DEMO_LIMIT_REACHED')
  } finally {
    tracy.state.limit = 20
  }
  // Room again: the same place can be sent.
  const retry = await call('POST', `${BASE}/${id}/tracy/demo`, {})
  assert.equal(retry.status, 202, JSON.stringify(retry.body))
})

test('the sponsor budget refusal is surfaced as it is', opts, async () => {
  const id = await newOpportunity('Budget Bistro')
  tracy.state.budgetExhausted = true
  try {
    const out = await call('POST', `${BASE}/${id}/tracy/demo`, {})
    assert.equal(out.status, 503)
    assert.equal(out.body.code, 'SPONSOR_BUDGET_EXHAUSTED')
  } finally {
    tracy.state.budgetExhausted = false
  }
})

test(
  'a researched place sends its own public photos, a Places photo as its public photoUri, never the key',
  opts,
  async () => {
    // The brief's assets carry no address, so every demo went out with no photos and Tracy's fill
    // refused it QUICKSTART_PHOTOGRAPHS_REQUIRED (stranger run, 25/10/2026).
    const id = await newOpportunity('Photo Tavern')
    const media = [
      ['website', 'https://photo-tavern.example/img/terrace.jpg', 'space'],
      ['google-places', 'google-places:places/ChIJx/photos/AbC', 'food']
    ]
    for (const [i, [source, url, category]] of media.entries())
      await scratch.pool.query(
        `insert into wo_media (account_id, opportunity_id, sha256, kind, category, source, source_url, mime, width, height, bytes)
       values ($1, $2, $3, 'image', $4, $5, $6, 'image/jpeg', 1200, 800, 90000)`,
        [principal, id, `${'ab'.repeat(31)}${i}0`, category, source, url]
      )
    const sent = await call('POST', `${BASE}/${id}/tracy/demo`, {})
    assert.equal(sent.status, 202, JSON.stringify(sent.body))
    const demo = [...tracy.state.demos.values()].find((d) => d.body.business.name === 'Photo Tavern')
    assert.deepEqual(
      (demo.body.photos ?? []).map((p) => p.url),
      ['https://photo-tavern.example/img/terrace.jpg', PHOTO_URI]
    )
    assert.equal(googleAsked.at(-1)?.key, GOOGLE_KEY, 'the key goes to Google in a header')
    assert.match(googleAsked.at(-1).href, /skipHttpRedirect=true/)
    assert.equal(JSON.stringify(demo.body).includes(GOOGLE_KEY), false, 'the key never reaches Tracy')
    assert.equal(JSON.stringify(demo.body).includes('google-places:'), false)
  }
)

test('the template choice is Tracy’s own list of what a demo may be built with', opts, async () => {
  const out = await call('GET', `${BASE}/tracy/options`)
  assert.equal(out.status, 200, JSON.stringify(out.body))
  assert.deepEqual(
    out.body.cms.map((c) => [c.cms, c.pinned.quickstart, c.templates.map((x) => x.quickstart)]),
    [['wordpress', 'tracy-base/wp7', ['quickstart/ja-fresco/wp7', 'tracy-base/wp7']]]
  )
})

test(
  'Build sends only the parts Tracy announces, and an older Tracy gets the base request',
  opts,
  async () => {
    const older = await newOpportunity('Older Host Diner')
    assert.equal((await call('POST', `${BASE}/${older}/tracy/demo`, {})).status, 202)
    const base = [...tracy.state.demos.values()].find((d) => d.body.business.name === 'Older Host Diner')
    assert.equal(validateDemoRequest(base.body).ok, true)
    assert.equal((await call('GET', `${BASE}/tracy/options`)).body.accepts.length, 0)
    tracy.state.accepts = ['items.size', 'brand', 'not-a-part']
    try {
      const out = await call('GET', `${BASE}/tracy/options`)
      assert.deepEqual(out.body.accepts, ['items.size', 'brand', 'not-a-part'])
      const newer = await newOpportunity('Newer Host Diner')
      assert.equal((await call('POST', `${BASE}/${newer}/tracy/demo`, {})).status, 202)
      const sent = [...tracy.state.demos.values()].find((d) => d.body.business.name === 'Newer Host Diner')
      assert.equal(
        validateDemoRequest(sent.body).ok,
        true,
        JSON.stringify(validateDemoRequest(sent.body).errors)
      )
      for (const key of ['links', 'posts']) assert.equal(key in sent.body, false, key)
    } finally {
      tracy.state.accepts = null
    }
  }
)

test('a host announcing profile/1 receives v2 with the research profile', opts, async () => {
  tracy.state.accepts = ['profile/1']
  try {
    const id = await newOpportunity('Profile Gym')
    await scratch.pool.query('insert into wo_profile (opportunity_id, profile) values ($1, $2)', [
      id,
      { name: 'Profile Gym', googlePlace: { primaryType: 'gym' }, bio: 'Train here.' }
    ])
    const response = await call('POST', `${BASE}/${id}/tracy/demo`, {
      cms: 'joomla',
      template: { quickstart: 'tracy-base/j6' }
    })
    assert.equal(response.status, 202, JSON.stringify(response.body))
    const sent = tracy.state.submissions.at(-1).body
    assert.equal(sent.schema, 'website-opportunities/demo-request/v2')
    assert.equal(validateDemoRequest(sent).ok, true, JSON.stringify(validateDemoRequest(sent)))
    assert.equal(sent.profile.business.name.value, 'Profile Gym')
    assert.equal(sent.profile.classification.derivedCategories[0].value.code, 'fitness')
    assert.equal(sent.profile.quotes.find((q) => q.value.kind === 'story').value.text, 'Train here.')
    assert.deepEqual(sent.template, { quickstart: 'tracy-base/j6' })
  } finally {
    tracy.state.accepts = null
  }
})

test(
  'a busy place still builds: v2 is cut to its limits, and a profile still invalid goes as v1',
  opts,
  async () => {
    tracy.state.accepts = ['profile/1']
    try {
      const busy = await newOpportunity('Busy Diner')
      await scratch.pool.query('insert into wo_profile (opportunity_id, profile) values ($1, $2)', [
        busy,
        {
          name: 'Busy Diner',
          googlePlace: {
            primaryType: 'restaurant',
            reviews: Array.from({ length: 120 }, (_, i) => ({ text: `Review ${i}`, author: `Guest ${i}` }))
          },
          menuItems: Array.from({ length: 230 }, (_, i) => ({ name: `Dish ${i}`, price: String(i + 1) }))
        }
      ])
      const response = await call('POST', `${BASE}/${busy}/tracy/demo`, {})
      assert.equal(response.status, 202, JSON.stringify(response.body))
      const sent = tracy.state.submissions.at(-1).body
      assert.equal(sent.schema, 'website-opportunities/demo-request/v2')
      assert.equal(sent.profile.offerings.length, 200)
      // Reviews go to the host, cut to the quote limit.
      assert.equal(sent.profile.quotes.length, 100)
      assert.equal(JSON.stringify(sent).includes('Guest 0'), true)

      const long = await newOpportunity('Long Name Diner')
      await scratch.pool.query('insert into wo_profile (opportunity_id, profile) values ($1, $2)', [
        long,
        { name: `Long Name Diner ${'x'.repeat(300)}` }
      ])
      const fallback = await call('POST', `${BASE}/${long}/tracy/demo`, {})
      assert.equal(fallback.status, 202, JSON.stringify(fallback.body))
      const v1 = tracy.state.submissions.at(-1).body
      assert.equal(v1.schema, 'website-opportunities/demo-request/v1')
      assert.equal(validateDemoRequest(v1).ok, true)
    } finally {
      tracy.state.accepts = null
    }
  }
)

test('an old host schema refusal falls back once to v1 under a new persisted key', opts, async () => {
  tracy.state.accepts = ['profile/1']
  tracy.state.profileRefusal = 'SCHEMA_UNSUPPORTED'
  try {
    const id = await newOpportunity('Fallback Cafe')
    const response = await call('POST', `${BASE}/${id}/tracy/demo`, {})
    assert.equal(response.status, 202, JSON.stringify(response.body))
    const [first, second] = tracy.state.submissions.slice(-2)
    assert.equal(first.body.schema, 'website-opportunities/demo-request/v2')
    assert.equal(second.body.schema, 'website-opportunities/demo-request/v1')
    assert.notEqual(first.key, second.key)
    assert.equal(second.body.business.name, 'Fallback Cafe')
    const stored = (await scratch.pool.query('select * from wo_tracy_demo where opportunity_id = $1', [id]))
      .rows[0]
    assert.equal(stored.idempotency_key, second.key)
    assert.deepEqual(JSON.parse(stored.request), second.body)
  } finally {
    tracy.state.accepts = null
    tracy.state.profileRefusal = null
  }
})

test('revoked in Tracy: the page shows Reconnect, Build says so', opts, async () => {
  tracy.revokeAll()
  const id = await newOpportunity('After Revoke')
  const out = await call('POST', `${BASE}/${id}/tracy/demo`, {})
  assert.equal(out.status, 409)
  assert.equal(out.body.code, 'TRACY_RECONNECT')
  assert.equal((await call('GET', `${OP}/tracy`)).body.state, 'reconnect')
  // Disconnect still works and leaves a clean slate.
  const off = await call('POST', `${OP}/tracy/disconnect`, {})
  assert.equal(off.body.state, 'disconnected')
})
