// The standalone Website Opportunities server (ADR 0036 decision 2) on a real socket and an EMPTY database:
// it applies the package schema, makes the operator principal, listens on localhost, and answers the open
// doors to the local operator. No network: every outbound call goes to `fetchImpl`.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createDiskObjects } from '../src/standalone/disk-objects.js'
import { startStandaloneServer } from '../src/standalone/server.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const BASE = '/api/website-opportunities'
const PLACES = {
  places: Array.from({ length: 3 }, (_, i) => ({
    id: `ChIJ-${i}`,
    displayName: { text: `Cafe ${i}` },
    location: { latitude: 52.37 + i / 1000, longitude: 4.89 },
    rating: 4.5,
    userRatingCount: 100 + i,
    primaryType: 'cafe',
    primaryTypeDisplayName: { text: 'Cafe' },
    ...(i === 1 ? { websiteUri: 'https://cafe-one.example/' } : {})
  }))
}

let scratch
let dataDir
let running
const fetched = []
const askedGoogle = []
const quiet = { info() {}, warn() {}, error() {}, log() {} }

const start = () =>
  startStandaloneServer({
    env: { DATABASE_URL: scratch.url, PORT: '0', GOOGLE_PLACES_API_KEY: 'fake-key', DATA_DIR: dataDir },
    fetchImpl: async (input, init) => {
      const href = String(input instanceof Request ? input.url : input)
      fetched.push(href)
      if (href.startsWith('https://places.googleapis.com/'))
        askedGoogle.push({ href, body: JSON.parse(init?.body ?? '{}') })
      if (href.startsWith('https://places.googleapis.com/')) return Response.json(PLACES)
      return new Response('not found', { status: 404 })
    },
    // A public address: documentation ranges are refused like private ones.
    resolve: async () => [{ address: '2606:4700:4700::1111', family: 6 }],
    log: quiet
  })

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  scratch = await scratchDatabase()
  dataDir = await mkdtemp(join(tmpdir(), 'wo-standalone-'))
  running = await start()
})

after(async () => {
  await running?.close()
  await scratch?.close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

const operators = async () =>
  (await scratch.pool.query("select id from wo_principal where kind = 'operator'")).rows.map((r) => r.id)

test('boots on an empty database: the package schema and one operator principal', opts, async () => {
  const { rows } = await scratch.pool.query('select name from wo_schema_migration order by name')
  assert.ok(rows.some((r) => r.name === '0001-baseline.sql'))
  assert.equal(
    (await scratch.pool.query("select to_regclass('account') is null as absent")).rows[0].absent,
    true,
    'no table of a host product'
  )
  assert.equal((await operators()).length, 1)
  assert.deepEqual(await call('GET', '/healthz'), { status: 200, body: { ok: true } })
})

test('a second boot on the same database keeps the operator principal', opts, async () => {
  const before = await operators()
  const again = await start()
  try {
    assert.deepEqual(await operators(), before)
  } finally {
    await again.close()
  }
})

const call = async (method, path, { body, headers = {} } = {}) => {
  const res = await fetch(`${running.url}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  return { status: res.status, body: await res.json() }
}

test('listens on localhost only when no operator token is set', opts, () => {
  assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+$/)
})

test('capabilities: Google on, no demo templates, no vision', opts, async () => {
  const { status, body } = await call('GET', `${BASE}/capabilities`)
  assert.equal(status, 200, JSON.stringify(body))
  assert.equal(body.discovery['google-places'], true)
  assert.equal(body.discovery['google-maps'], false)
  for (const cms of Object.values(body.templates)) assert.deepEqual(cms.templates, [])
})

test('settings name the Tracy builder the server runs with, and the Tracy it connects to', opts, async () => {
  assert.deepEqual(await call('GET', `${BASE}/settings`), {
    status: 200,
    body: { builder: 'tracy', tracyUrl: 'https://cowork.tracy.ai' }
  })
})

test('the browser page is served at / without any build step', opts, async () => {
  const res = await fetch(`${running.url}/`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /text\/html/)
  assert.match(await res.text(), /<script type="module" src="\.\/app\.js">/)
  const app = await fetch(`${running.url}/app.js`)
  assert.equal(app.status, 200)
})

test('the manual builder answers its brief door for a saved opportunity', opts, async () => {
  const found = await call('POST', `${BASE}/search`, { body: { lat: 52.37, lon: 4.89, radiusM: 1000 } })
  const saved = await call('POST', BASE, { body: { candidate: found.body.candidates[2] } })
  const id = saved.body.opportunity?.id ?? saved.body.id
  assert.ok(id, JSON.stringify(saved.body))
  const { status, body } = await call('POST', `${BASE}/${id}/manual/brief`)
  // An unresearched place may not make a valid brief yet; either way the door is the builder's, not a 404.
  assert.ok(
    status === 200 || (status === 422 && body.code === 'BRIEF_INVALID'),
    JSON.stringify({ status, body })
  )
})

test('a search finds the places Google answers', opts, async () => {
  const { status, body } = await call('POST', `${BASE}/search`, {
    body: { lat: 52.37, lon: 4.89, radiusM: 1000 }
  })
  assert.equal(status, 200, JSON.stringify(body))
  assert.equal(body.provider, 'google-places')
  assert.deepEqual(body.candidates.map((c) => c.providerId).sort(), ['ChIJ-0', 'ChIJ-1', 'ChIJ-2'])
  assert.ok(fetched.some((href) => href.startsWith('https://places.googleapis.com/')))
})

test('an opportunity saved from a search belongs to the operator principal', opts, async () => {
  const [operator] = await operators()
  const found = await call('POST', `${BASE}/search`, { body: { lat: 52.37, lon: 4.89, radiusM: 1000 } })
  const { status, body } = await call('POST', BASE, { body: { candidate: found.body.candidates[0] } })
  assert.ok([200, 201].includes(status), JSON.stringify(body))
  const { rows } = await scratch.pool.query('select account_id from wo_opportunity')
  assert.ok(rows.length >= 1)
  for (const row of rows) assert.equal(row.account_id, operator)
})

test('a stored picture is read back from the data folder through the media door', opts, async () => {
  const [operator] = await operators()
  const opportunity = (
    await scratch.pool.query(
      "insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, 'Pho', 'url', 'pho') returning id",
      [operator]
    )
  ).rows[0].id
  const bytes = Buffer.from('a stored picture')
  const key = `opportunities/${opportunity}/${'a'.repeat(64)}.jpg`
  assert.equal(await createDiskObjects({ dir: dataDir }).put(key, bytes, 'image/jpeg'), true)
  const media = (
    await scratch.pool.query(
      `insert into wo_media (account_id, opportunity_id, sha256, object_key, mime, kind, source, source_url)
       values ($1, $2, $3, $4, 'image/jpeg', 'image', 'website', 'https://pho.example/a.jpg') returning id`,
      [operator, opportunity, 'a'.repeat(64), key]
    )
  ).rows[0].id
  const res = await fetch(`${running.url}${BASE}/media/${media}`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes)
})

test('a request naming another host is not the operator', opts, async () => {
  // `fetch` drops a custom Host header, so a raw request: a page elsewhere rebinding its name to 127.0.0.1.
  const answer = await new Promise((resolve, reject) => {
    const req = request(`${running.url}${BASE}/settings`, { headers: { host: 'evil.example' } }, (res) => {
      let text = ''
      res.on('data', (chunk) => (text += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }))
    })
    req.on('error', reject)
    req.end()
  })
  assert.equal(answer.status, 401)
  assert.equal(answer.body.code, 'UNAUTHENTICATED')
})

test(
  'the operator doors answer the local operator; keys come from the environment, read-only',
  opts,
  async () => {
    const me = await call('GET', `${BASE}/operator/me`)
    assert.deepEqual(me, {
      status: 200,
      body: { operator: true, email: 'operator@localhost', hub: false, tracy: true, keysWritable: false }
    })
    const { status, body } = await call('GET', `${BASE}/operator/settings`)
    assert.equal(status, 200)
    assert.deepEqual(body.keys.providers.google, { configured: true, source: 'env', hint: 'fak… (8 chars)' })
    assert.equal(body.keysWritable, false)
    const spend = await call('GET', `${BASE}/operator/spend`)
    assert.equal(spend.status, 200)
    assert.equal(spend.body.days, 30)
    const queue = await call('GET', `${BASE}/operator/queue`)
    assert.equal(queue.status, 200)
    assert.equal((await call('PUT', `${BASE}/operator/keys/google`, { body: { apiKey: 'x' } })).status, 409)
  }
)

test('an area search finds every kind of local business unless one kind is asked for', opts, async () => {
  const caps = await call('GET', `${BASE}/capabilities`)
  assert.ok(caps.body.trades.includes('beauty') && caps.body.trades.includes('food'))
  assert.ok(!caps.body.trades.includes('other'))

  // Away from the other tests' point: the places cache would answer their request without asking Google.
  askedGoogle.length = 0
  const any = await call('POST', `${BASE}/search`, { body: { lat: 52.374, lon: 4.89, radiusM: 1000 } })
  assert.equal(any.status, 200, JSON.stringify(any.body))
  assert.ok(askedGoogle[0].href.endsWith('places:searchNearby'))
  assert.ok(askedGoogle[0].body.includedTypes.includes('plumber'))
  assert.equal(any.body.candidates[0].trade, 'food')

  askedGoogle.length = 0
  await call('POST', `${BASE}/search`, { body: { lat: 52.374, lon: 4.89, radiusM: 1000, trade: 'beauty' } })
  assert.ok(askedGoogle[0].body.includedTypes.includes('nail_salon'))
  assert.ok(!askedGoogle[0].body.includedTypes.includes('restaurant'))

  askedGoogle.length = 0
  await call('POST', `${BASE}/search`, {
    body: { lat: 52.374, lon: 4.89, radiusM: 1000, cuisines: ['italian'] }
  })
  assert.ok(askedGoogle[0].href.endsWith('places:searchText'), 'a cuisine is a food search')

  const bad = await call('POST', `${BASE}/search`, {
    body: { lat: 52.374, lon: 4.89, radiusM: 1000, trade: 'government' }
  })
  assert.equal(bad.status, 400)
  assert.match(bad.body.next, /"trade"/)
  const mixed = await call('POST', `${BASE}/search`, {
    body: { lat: 52.374, lon: 4.89, radiusM: 1000, trade: 'auto', cuisines: ['italian'] }
  })
  assert.equal(mixed.status, 400, 'a cuisine is only a food filter')
})

test('a saved place keeps the kind of business it was found as', opts, async () => {
  const candidate = {
    provider: 'google-places',
    providerId: 'ChIJ-salon',
    name: 'Salon Rosa',
    primaryType: 'hair_salon',
    trade: 'beauty'
  }
  const saved = await call('POST', BASE, { body: { candidate } })
  assert.ok([200, 201].includes(saved.status), JSON.stringify(saved.body))
  const { rows } = await scratch.pool.query(
    "select candidate->>'trade' as trade from wo_opportunity where provider_id = 'ChIJ-salon'"
  )
  assert.equal(rows[0].trade, 'beauty')
  const forged = await call('POST', BASE, {
    body: { candidate: { ...candidate, providerId: 'ChIJ-x', trade: 'spaceship' } }
  })
  assert.ok([200, 201].includes(forged.status))
  const again = await scratch.pool.query(
    "select candidate ? 'trade' as has from wo_opportunity where provider_id = 'ChIJ-x'"
  )
  assert.equal(again.rows[0].has, false, 'an unknown trade is not kept')
})

test('a name search keeps a business of any kind, not only food and drink', opts, async () => {
  const found = await call('POST', `${BASE}/search`, {
    body: { query: 'Cafe 0, Amsterdam', intent: 'place', radiusM: 1000 }
  })
  assert.equal(found.status, 200, JSON.stringify(found.body))
  assert.ok(askedGoogle.at(-1).href.endsWith('places:searchText'))
  assert.equal(found.body.candidates[0]?.trade, 'food', 'each place says its kind of business')
})
