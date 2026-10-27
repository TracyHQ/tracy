import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryDelayOf, withProviderRetry } from '../domain/provider-retry.mjs'
import { tripadvisorJson, litescrapeCall } from '../src/tripadvisor.js'
import { googleMapsSerpapiCall } from '../src/google-maps-serpapi.js'
import { fetchPlaceDetails } from '../domain/gplaces-details.mjs'

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

/** A fake clock: records every wait instead of sleeping. */
const fakeSleep = () => {
  const waits = []
  return { waits, sleep: async (ms) => void waits.push(ms) }
}

/** A fetch that answers each call with the next response of `answers`. */
const scripted = (answers) => {
  const calls = []
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init })
      const next = answers[Math.min(calls.length - 1, answers.length - 1)]
      return typeof next === 'function' ? next() : next
    }
  }
}

const httpError = (status, retryAfter = null) =>
  Object.assign(new Error(`HTTP_${status}`), { code: `HTTP_${status}`, status, retryAfter })

test('retry: a 429 then a success returns the success after one backoff wait', async () => {
  const clock = fakeSleep()
  let n = 0
  const out = await withProviderRetry(
    async () => {
      n += 1
      if (n === 1) throw httpError(429)
      return 'ok'
    },
    { sleep: clock.sleep, baseDelayMs: 300, maxWaitMs: 4000 }
  )
  assert.equal(out, 'ok')
  assert.equal(n, 2)
  assert.deepEqual(clock.waits, [300])
})

test('retry: transient 5xx (500, 502, 503, 504) are retried with growing backoff', async () => {
  for (const status of [500, 502, 503, 504]) {
    const clock = fakeSleep()
    let n = 0
    const out = await withProviderRetry(
      async () => {
        n += 1
        if (n < 3) throw httpError(status)
        return status
      },
      { sleep: clock.sleep, retries: 2, baseDelayMs: 200, maxWaitMs: 4000 }
    )
    assert.equal(out, status)
    assert.deepEqual(clock.waits, [200, 400])
  }
})

test('retry: Retry-After in seconds or as an HTTP date sets the wait', () => {
  assert.equal(retryDelayOf(httpError(429, '2'), 0, { baseDelayMs: 300 }), 2000)
  const now = Date.parse('2026-10-27T10:00:00Z')
  assert.equal(
    retryDelayOf(httpError(429, 'Tue, 27 Oct 2026 10:00:03 GMT'), 0, { baseDelayMs: 300, now: () => now }),
    3000
  )
  // An unreadable header falls back to the backoff.
  assert.equal(retryDelayOf(httpError(429, 'soon'), 1, { baseDelayMs: 300 }), 600)
})

test('retry: 402 (paid quota spent) and other 4xx are never retried', async () => {
  for (const status of [400, 401, 402, 403, 404]) {
    const clock = fakeSleep()
    let n = 0
    await assert.rejects(
      withProviderRetry(
        async () => {
          n += 1
          throw httpError(status)
        },
        { sleep: clock.sleep }
      ),
      { code: `HTTP_${status}` }
    )
    assert.equal(n, 1, `HTTP ${status} is tried once`)
    assert.deepEqual(clock.waits, [])
  }
})

test('retry: the total wait stays within maxWaitMs; a Retry-After beyond it is not waited for', async () => {
  const clock = fakeSleep()
  let n = 0
  await assert.rejects(
    withProviderRetry(
      async () => {
        n += 1
        throw httpError(429)
      },
      { sleep: clock.sleep, retries: 5, baseDelayMs: 1000, maxWaitMs: 2500 }
    ),
    { code: 'HTTP_429' }
  )
  // 1000 then 2000 would pass 2500: one wait only.
  assert.deepEqual(clock.waits, [1000])
  assert.equal(n, 2)

  const late = fakeSleep()
  let m = 0
  await assert.rejects(
    withProviderRetry(
      async () => {
        m += 1
        throw httpError(429, '60')
      },
      { sleep: late.sleep, maxWaitMs: 4000 }
    ),
    { code: 'HTTP_429' }
  )
  assert.equal(m, 1)
  assert.deepEqual(late.waits, [])
})

test('retry: maxWaitMs 0 turns retries off', async () => {
  const clock = fakeSleep()
  let n = 0
  await assert.rejects(
    withProviderRetry(
      async () => {
        n += 1
        throw httpError(503)
      },
      { sleep: clock.sleep, maxWaitMs: 0 }
    ),
    { code: 'HTTP_503' }
  )
  assert.equal(n, 1)
})

test('tripadvisorJson: a 429 with Retry-After is retried and the second answer is returned', async () => {
  const clock = fakeSleep()
  const net = scripted([json({ error: 'rate' }, 429, { 'retry-after': '1' }), json({ ok: true })])
  const body = await tripadvisorJson(
    'https://serpapi.com/search.json?x=1',
    { accept: 'application/json' },
    { fetch: net.fetch, retry: { sleep: clock.sleep } }
  )
  assert.deepEqual(body, { ok: true })
  assert.equal(net.calls.length, 2)
  assert.deepEqual(clock.waits, [1000])
})

test('tripadvisorJson: a 402 fails at once with its code, no retry', async () => {
  const clock = fakeSleep()
  const net = scripted([json({ error: 'quota' }, 402), json({ ok: true })])
  await assert.rejects(
    litescrapeCall(
      'search',
      { query: 'Harbour Sport Club' },
      { key: 'k', fetch: net.fetch, retry: { sleep: clock.sleep } }
    ),
    { code: 'HTTP_402' }
  )
  assert.equal(net.calls.length, 1)
  assert.deepEqual(clock.waits, [])
})

test('google maps (SerpApi): a 429 then a success reads the place', async () => {
  const clock = fakeSleep()
  const place = {
    search_metadata: { status: 'Success' },
    place_results: { place_id: 'HarbourSportClub1', data_id: '0x1a:0x2b', title: 'Harbour Sport Club' }
  }
  const net = scripted([json({ error: 'rate' }, 429), json(place)])
  const out = await googleMapsSerpapiCall(
    'place',
    { placeId: 'HarbourSportClub1' },
    { key: 'k', fetch: net.fetch, retry: { sleep: clock.sleep } }
  )
  assert.equal(out.name, 'Harbour Sport Club')
  assert.equal(net.calls.length, 2)
  assert.equal(clock.waits.length, 1)
})

test('google maps (SerpApi): a lasting 429 ends as HTTP_429 within the wait budget', async () => {
  const clock = fakeSleep()
  const net = scripted([() => json({ error: 'rate' }, 429)])
  await assert.rejects(
    googleMapsSerpapiCall(
      'place',
      { placeId: 'HarbourSportClub1' },
      { key: 'k', fetch: net.fetch, retry: { sleep: clock.sleep, maxWaitMs: 3000 } }
    ),
    { code: 'HTTP_429' }
  )
  assert.ok(clock.waits.reduce((a, b) => a + b, 0) <= 3000)
  assert.ok(net.calls.length >= 2)
})

test('Google Place Details: a 503 then a success returns the place', async () => {
  const clock = fakeSleep()
  const net = scripted([json({ error: {} }, 503), json({ id: 'HarbourSportClub1' })])
  const out = await fetchPlaceDetails('HarbourSportClub1', {
    googleKey: 'k',
    fetch: net.fetch,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    retry: { sleep: clock.sleep }
  })
  assert.equal(out.id, 'HarbourSportClub1')
  assert.equal(net.calls.length, 2)
  assert.equal(clock.waits.length, 1)
})

test('Google Place Details: a lasting 429 still ends as QUOTA', async () => {
  const clock = fakeSleep()
  const net = scripted([() => json({ error: {} }, 429, { 'retry-after': '1' })])
  await assert.rejects(
    fetchPlaceDetails('HarbourSportClub1', {
      googleKey: 'k',
      fetch: net.fetch,
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      retry: { sleep: clock.sleep, maxWaitMs: 1500 }
    }),
    { code: 'QUOTA' }
  )
  assert.deepEqual(clock.waits, [1000])
  assert.equal(net.calls.length, 2)
})
