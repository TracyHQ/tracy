/**
 * The public Find's `Api` (council 23/10/2026, P1): every method answers an `Answer` and never
 * throws; only `/find/api/*` is ever requested; the polls stop on their exact codes; a search sends
 * a point or a name with the radius, nothing else, and a point wins.
 *
 *   node --test packages/web/tracy-wo-find-page/test/public-api.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPublicApi, publicSearchBody } from '../src/public-api.ts'

function recorder(answer = () => Response.json({ ok: true })) {
  const asked = []
  const fetchImpl = async (url, init = {}) => {
    asked.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null })
    return answer(url)
  }
  return { asked, fetchImpl }
}

test('every method of the Api answers without throwing, and only the public doors are asked', async () => {
  const { asked, fetchImpl } = recorder()
  const api = createPublicApi(fetchImpl)
  for (const [name, method] of Object.entries(api)) {
    const answer = await method('x', 'y', 'z')
    assert.equal(typeof answer.ok, 'boolean', name)
  }
  assert.deepEqual(asked.map((a) => `${a.method} ${a.url.split('?')[0]}`).sort(), [
    'GET /find/api/capabilities',
    'GET /find/api/places/suggest',
    'GET /find/api/places/suggest/x',
    'GET /find/api/research-again',
    'POST /find/api/research-again',
    'POST /find/api/search'
  ])
  assert.equal((await api.siteChecks(['https://x.example/'])).code, 'CHECKS_UNAVAILABLE')
  assert.equal((await api.socialStats([])).code, 'SOCIAL_STATS_UNAVAILABLE')
  assert.equal((await api.research('id', 'req')).code, 'UNSUPPORTED')
  assert.equal((await api.approxLocation()).code, 'UNSUPPORTED')
})

test('a search sends a point or an area name with the radius; a point wins; nothing else rides along', async () => {
  const { asked, fetchImpl } = recorder()
  const api = createPublicApi(fetchImpl)
  await api.search({
    query: 'Da Nang',
    lat: 16.05,
    lon: 108.2,
    radiusM: 3000,
    intent: 'place',
    depth: 'standard',
    kinds: ['bars']
  })
  await api.search({ query: 'Hai Chau', radiusM: 1000, placeId: 'ChIJ-x', sessionToken: 's' })
  assert.deepEqual(
    asked.map((a) => a.body),
    [
      { lat: 16.05, lon: 108.2, radiusM: 3000 },
      { query: 'Hai Chau', radiusM: 1000 }
    ]
  )
  assert.deepEqual(publicSearchBody({ lat: Number.NaN, lon: 1, query: 'X', radiusM: 5000 }), {
    query: 'X',
    radiusM: 5000
  })
})

test('a refusal keeps the server code; a network failure is NETWORK; neither throws', async () => {
  const limited = createPublicApi(
    recorder(() => Response.json({ code: 'DAILY_LIMIT', message: 'm' }, { status: 429 })).fetchImpl
  )
  assert.deepEqual(await limited.search({ query: 'A', radiusM: 1000 }), {
    ok: false,
    status: 429,
    code: 'DAILY_LIMIT'
  })
  const down = createPublicApi(async () => {
    throw new Error('offline')
  })
  assert.deepEqual(await down.search({ query: 'A', radiusM: 1000 }), {
    ok: false,
    status: 0,
    code: 'NETWORK'
  })
  const html = createPublicApi(recorder(() => new Response('<html>', { status: 502 })).fetchImpl)
  assert.deepEqual(await html.capabilities(), { ok: false, status: 502, code: 'HTTP_502' })
})

test('the place box asks the public suggest doors with its typing session and language', async () => {
  const { asked, fetchImpl } = recorder((url) =>
    Response.json(
      url.includes('/suggest/') ? { label: 'Downtown', lat: 25.2, lon: 55.27 } : { suggestions: [] }
    )
  )
  const api = createPublicApi(fetchImpl)
  await api.suggestPlaces('down town', '11111111-2222-4333-8444-555555555555', 'vi')
  const picked = await api.resolvePlace('ChIJ-x', '11111111-2222-4333-8444-555555555555', 'vi')
  assert.deepEqual(
    asked.map((a) => a.url),
    [
      '/find/api/places/suggest?q=down%20town&session=11111111-2222-4333-8444-555555555555&lang=vi',
      '/find/api/places/suggest/ChIJ-x?session=11111111-2222-4333-8444-555555555555&lang=vi'
    ]
  )
  assert.deepEqual(picked.body, { label: 'Downtown', lat: 25.2, lon: 55.27 })
  const fenced = createPublicApi(
    recorder(() => Response.json({ code: 'RATE_LIMITED' }, { status: 429 })).fetchImpl
  )
  assert.deepEqual(await fenced.suggestPlaces('downtown', 's'), {
    ok: false,
    status: 429,
    code: 'RATE_LIMITED'
  })
})

test('Research sends place ids only, and progress asks by place id and receipt', async () => {
  const { asked, fetchImpl } = recorder()
  const api = createPublicApi(fetchImpl)
  // Whatever a caller passes, only the ids leave the page.
  await api.publicResearch(['ChIJ-a', 'ChIJ-b'])
  await api.publicResearchStatus({ placeIds: ['ChIJ-a'], receipts: ['r-1', 'r 2'] })
  assert.deepEqual(asked, [
    { url: '/find/api/research', method: 'POST', body: { placeIds: ['ChIJ-a', 'ChIJ-b'] } },
    { url: '/find/api/research?placeIds=ChIJ-a&receipts=r-1%2Cr+2', method: 'GET', body: null }
  ])
  // Nothing to ask asks nobody.
  assert.deepEqual((await api.publicResearchStatus({})).body, { places: [], receipts: {} })
  assert.equal((await api.publicResearch([])).code, 'INVALID_RESEARCH')
  assert.equal(asked.length, 2)
})

test('Research again asks its own public doors with the place id and nothing else', async () => {
  const { asked, fetchImpl } = recorder()
  const api = createPublicApi(fetchImpl)
  await api.publicAgainPreview('ChIJ-a b')
  await api.publicResearchAgain('ChIJ-a')
  assert.deepEqual(asked, [
    { url: '/find/api/research-again?placeId=ChIJ-a+b', method: 'GET', body: null },
    { url: '/find/api/research-again', method: 'POST', body: { placeId: 'ChIJ-a' } }
  ])
  // A signed-in door stays shut on the public page.
  assert.equal((await api.researchAgain('id', 'req')).code, 'UNSUPPORTED')
  assert.equal((await api.researchAgainPreview('id')).code, 'UNSUPPORTED')
  assert.equal(asked.length, 2)
})
