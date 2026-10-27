import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicRoutes } from '../src/public/route.js'
import { publicTarget } from '../src/public/design-page.js'

const SECRET = 'sk-do-not-leak-this-value'

function baseConfig(overrides = {}) {
  return {
    model: null,
    turnstileSecret: null,
    turnstileDisabled: false,
    guestSiteKey: 'tracy.localhost',
    siteDomain: 'localhost',
    defaultHost: 'local',
    hosts: new Map([
      [
        'local',
        {
          origin: 'http://127.0.0.1:8090',
          dshOrigin: 'http://127.0.0.1:51790',
          hostSecret: 'h',
          seatSecret: 'seat-k'
        }
      ]
    ]),
    ...overrides
  }
}

const unreachableFetch = async () => {
  throw new Error('a test must never reach the network')
}

// `publicTarget` now does a DNS lookup (C2 fix) — every test that reaches it must inject a
// resolver, or it makes a REAL DNS query. `fakeResolve` answers with a public-looking address for
// any host; `unreachableResolve` asserts the code path under test never needs to resolve at all.
const fakeResolve = async () => ['93.184.216.34']
const unreachableResolve = async () => {
  throw new Error('a test must never reach the network (DNS)')
}

// `apiWords`/`apiBrand` now rate-limit through the same Postgres `overLimit` as `apiRead` (C1
// fix) — a test that means to exercise the rest of the door, not its rate limit, needs a pool that
// always says "under the limit".
// The provider book is asked too (`llm_assignment`), and it must answer "nothing assigned" or the door
// would read this double's count row as an assigned provider that is switched off.
const permissivePool = {
  query: async (sql) => ({ rows: String(sql).includes('llm_assignment') ? [] : [{ count: 1 }] })
}

// ── the model door: MODEL_API_KEY absent → 503, never a crash and never a fallback credential ──

test('api/words: no MODEL_API_KEY configured answers 503 MODEL_NOT_CONFIGURED', async () => {
  const app = publicRoutes({ config: baseConfig(), fetchImpl: unreachableFetch })
  const res = await app.fetch(
    new Request('http://tracy.test/design-inspiration/api/words', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: 'a coffee shop downtown' })
    })
  )
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), {
    code: 'MODEL_NOT_CONFIGURED',
    message: 'Writing from a description is not switched on here yet.'
  })
})

// ── the model door: same transport shape, same parsing, different wire ──

test('api/words: a fetchImpl completion becomes the words wordsFromModel expects', async () => {
  const completion = {
    name: 'Bean & Co',
    eyebrow: 'Local roast',
    headline: 'Coffee, done right',
    sub: 'Small-batch coffee, roasted daily just for the neighborhood.',
    nav: ['Menu', 'About', 'Visit'],
    cta: 'Order now',
    cta2: 'Visit us'
  }
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(completion) } }] }), {
      status: 200
    })
  }
  const config = baseConfig({
    model: {
      apiKey: SECRET,
      baseUrl: 'https://openrouter.ai/api/v1',
      words: 'meta-llama/llama-3.3-70b-instruct'
    }
  })
  const app = publicRoutes({ config, fetchImpl, pool: permissivePool })
  const res = await app.fetch(
    new Request('http://tracy.test/design-inspiration/api/words', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: 'a coffee shop downtown' })
    })
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.site.site.name, 'Bean & Co')
  assert.equal(body.site.site.headline, 'Coffee, done right')
  assert.deepEqual(body.site.site.nav, ['Menu', 'About', 'Visit'])
  // OpenAI shape, at the exact address `config.model.baseUrl` names — not a Workers AI call.
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(calls[0].init.headers.authorization, `Bearer ${SECRET}`)
  const sent = JSON.parse(calls[0].init.body)
  assert.equal(sent.model, 'meta-llama/llama-3.3-70b-instruct')
  assert.equal(sent.messages[1].content, 'a coffee shop downtown')
})

// ── the key must never reach a response body, success or failure ──

test('the model key never appears in any response, on success or on failure', async () => {
  const scenarios = [
    // The model answers with an error body that happens to echo back request-shaped text — this
    // must not leak into the message even when the "upstream" itself is hostile.
    {
      name: 'non-ok model response',
      fetchImpl: async () => new Response(`bad request, saw authorization: Bearer ${SECRET}`, { status: 400 })
    },
    {
      name: 'fetch throws',
      fetchImpl: async () => {
        throw new Error(`network died holding ${SECRET}`)
      }
    },
    {
      name: 'unusable answer',
      fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
    }
  ]
  for (const { name, fetchImpl } of scenarios) {
    const config = baseConfig({
      model: { apiKey: SECRET, baseUrl: 'https://openrouter.ai/api/v1', words: 'm' }
    })
    const app = publicRoutes({ config, fetchImpl, pool: permissivePool })
    const res = await app.fetch(
      new Request('http://tracy.test/design-inspiration/api/words', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief: 'a coffee shop downtown' })
      })
    )
    // Confirm this scenario actually reached the model call this test means to exercise, not the
    // rate limiter — a 429 here would make the assertion below pass for the wrong reason.
    assert.notEqual(res.status, 429, `${name}: unexpectedly rate-limited instead of reaching the model`)
    const text = await res.text()
    assert.ok(!text.includes(SECRET), `${name}: response body must not contain the key, got: ${text}`)
  }
})

// ── api/words: this door spends MODEL_API_KEY on every call — it must be rate-limited too (C1) ──

test('api/words: over the daily limit is refused before ever spending the model key', async () => {
  const config = baseConfig({
    model: { apiKey: SECRET, baseUrl: 'https://openrouter.ai/api/v1', words: 'm' }
  })
  // WORDS_PER_IP_DAY is 20; the provider book answers "nothing assigned" (see `permissivePool`).
  const pool = {
    query: async (sql) => ({ rows: String(sql).includes('llm_assignment') ? [] : [{ count: 21 }] })
  }
  const app = publicRoutes({ config, pool, fetchImpl: unreachableFetch })
  const res = await app.fetch(
    new Request('http://tracy.test/design-inspiration/api/words', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: 'a coffee shop downtown' })
    })
  )
  assert.equal(res.status, 429)
  assert.equal((await res.json()).code, 'RATE_LIMITED')
})

test('api/words: no pool configured fails closed too — the door bumpCounter used to leave wide open', async () => {
  const config = baseConfig({
    model: { apiKey: SECRET, baseUrl: 'https://openrouter.ai/api/v1', words: 'm' }
  })
  const app = publicRoutes({ config, fetchImpl: unreachableFetch })
  const res = await app.fetch(
    new Request('http://tracy.test/design-inspiration/api/words', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: 'a coffee shop downtown' })
    })
  )
  assert.equal(res.status, 429)
  assert.equal((await res.json()).code, 'RATE_LIMITED')
})

// ── api/read: a public door that fetches an arbitrary URL must be rate-limited, fail closed ──

function readRequest(url = 'example.com') {
  return new Request(`http://tracy.test/design-inspiration/api/read?url=${encodeURIComponent(url)}`)
}

test('api/read: no pool configured fails closed — never an open, unlimited proxy', async () => {
  const app = publicRoutes({ config: baseConfig(), fetchImpl: unreachableFetch, resolve: fakeResolve })
  const res = await app.fetch(readRequest())
  assert.equal(res.status, 429)
  assert.equal((await res.json()).code, 'RATE_LIMITED')
})

test('api/read: a pool the rate check cannot reach fails closed too', async () => {
  const pool = {
    query: async () => {
      throw new Error('the database is unreachable')
    }
  }
  const app = publicRoutes({ config: baseConfig(), pool, fetchImpl: unreachableFetch, resolve: fakeResolve })
  const res = await app.fetch(readRequest())
  assert.equal(res.status, 429)
  assert.equal((await res.json()).code, 'RATE_LIMITED')
})

test('api/read: under the daily limit reaches the network; over it is refused, not fetched', async () => {
  // `overLimit` reports the bucket's count AFTER this call; 30 is READ_LIMIT_PER_DAY (design-page.js,
  // the Worker's own daily cap carried forward as an actual number), so 30 is still allowed and 31
  // is over — the assertion doesn't care that the window is a day rather than an hour, only that the
  // pool call this test controls the count of is the one thing standing between "allowed" and "refused".
  const counts = [30, 31]
  let n = 0
  const pool = { query: async () => ({ rows: [{ count: counts[n++] }] }) }
  const fetchCalls = []
  const fetchImpl = async (url) => {
    fetchCalls.push(url)
    return new Response('<html><head><title>Example</title></head><body><h1>Example</h1></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })
  }
  const app = publicRoutes({ config: baseConfig(), pool, fetchImpl, resolve: fakeResolve })
  const allowed = await app.fetch(readRequest())
  assert.equal(allowed.status, 200)
  assert.equal(fetchCalls.length, 1)
  const refused = await app.fetch(readRequest())
  assert.equal(refused.status, 429)
  assert.equal((await refused.json()).code, 'RATE_LIMITED')
  // The refusal happened before ever touching the network — no second fetch was made.
  assert.equal(fetchCalls.length, 1)
})

test('api/read: only http(s), no private or loopback address — a stranger cannot use this as an SSRF probe', async () => {
  const app = publicRoutes({
    config: baseConfig(),
    pool: permissivePool,
    fetchImpl: unreachableFetch,
    // None of these should even reach DNS — the string-level checks refuse them first.
    resolve: unreachableResolve
  })
  for (const url of [
    '127.0.0.1',
    'localhost',
    '169.254.169.254',
    '10.0.0.5',
    'ftp://example.com',
    'file:///etc/passwd'
  ]) {
    const res = await app.fetch(readRequest(url))
    assert.equal(res.status, 400, `expected ${url} to be refused as BAD_URL`)
  }
})

test('api/read: a nip.io-shaped host is refused — a public-looking name that resolves privately', async () => {
  // `127.0.0.1.nip.io` (same idea as sslip.io, xip.io) has a dot and matches no PRIVATE_HOST
  // pattern as TEXT — it only reveals itself as private once resolved. C2 fix: publicTarget does
  // that resolution now, so a resolver answering with a private address refuses it regardless of
  // how innocent the hostname looks.
  const app = publicRoutes({
    config: baseConfig(),
    pool: permissivePool,
    fetchImpl: unreachableFetch,
    resolve: async (host) => {
      assert.equal(host, '127.0.0.1.nip.io')
      return ['127.0.0.1']
    }
  })
  const res = await app.fetch(readRequest('127.0.0.1.nip.io'))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'BAD_URL')
})

test('publicTarget: an IPv4-mapped IPv6 address is refused, in both textual shapes Node can hand back', async () => {
  // Verified directly against a real `dns.lookup` call (not just composed by hand): Node returns
  // `::ffff:7f00:1` UNCHANGED, not normalized to `::ffff:127.0.0.1` — so both shapes are real
  // strings a resolver can answer with, and a check on only one is the same hole with a disguise.
  const mappedPrivate = [
    '::ffff:127.0.0.1', // dotted-quad form of 127.0.0.1 (RFC 5952's recommended textual form)
    '::ffff:7f00:1', // the SAME address as two hex hextets
    '::ffff:10.0.0.5', // dotted-quad form of a different private address
    '[::ffff:127.0.0.1]' // bracketed, as a URL's own host is sometimes carried
  ]
  for (const addr of mappedPrivate) {
    const target = await publicTarget('evil.example.com', async () => [addr])
    assert.equal(target, null, `expected ${addr} to be refused`)
  }
  // Not over-broad: an IPv4-mapped form of a PUBLIC address must still be allowed through.
  const target = await publicTarget('fine.example.com', async () => ['::ffff:93.184.216.34'])
  assert.notEqual(target, null, 'an IPv4-mapped PUBLIC address must not be refused')
})

test('publicTarget: the rest of the IPv6 private space — ::, ::1, fe80::/10, fc00::/7', async () => {
  const private_ = ['::', '::1', 'fe80::1', 'fe90::1', 'fea0::1', 'feb0::1', 'fc00::1', 'fd12::3456']
  for (const addr of private_) {
    const target = await publicTarget('evil.example.com', async () => [addr])
    assert.equal(target, null, `expected ${addr} to be refused`)
  }
  // Outside fe80::/10 (the second hextet's range is fe80-febf) and a plain public address — must
  // NOT be caught, or the pattern is now too broad rather than too narrow.
  for (const addr of ['fec0::1', '2001:db8::1']) {
    const target = await publicTarget('evil.example.com', async () => [addr])
    assert.notEqual(target, null, `expected ${addr} to be treated as public`)
  }
})

test('api/read: a redirect to a private address is refused, not followed', async () => {
  // The public URL itself resolves fine; its 302 points at a hostname that ALSO looks fine as
  // text, and only resolving IT reveals it as private. `fetchPage`'s manual redirect walk must
  // catch this — `redirect: 'follow'` (the Worker's own choice) never would have.
  let fetchCalls = 0
  const fetchImpl = async () => {
    fetchCalls++
    if (fetchCalls > 1) throw new Error('must not follow the redirect a second time')
    return new Response(null, {
      status: 302,
      headers: { location: 'https://internal.example.net/' }
    })
  }
  const resolve = async (host) => (host === 'internal.example.net' ? ['10.0.0.5'] : ['93.184.216.34'])
  const app = publicRoutes({ config: baseConfig(), pool: permissivePool, fetchImpl, resolve })
  const res = await app.fetch(readRequest('public-site.example.com'))
  assert.equal(res.status, 502)
  assert.equal((await res.json()).code, 'BLOCKED')
  // Exactly the one hop that was actually allowed to happen — the redirect target was never dialed.
  assert.equal(fetchCalls, 1)
})

// ── the brand door: a GUEST seat, never a real one ──

test('api/brand/<host> mints a GUEST session, not a real seat', async () => {
  const calls = []
  const config = baseConfig()
  const app = publicRoutes({
    config,
    fleetLabel: async (siteKey, zone) => {
      assert.equal(siteKey, 'tracy.localhost')
      assert.equal(zone, 'localhost')
      return 'tracy'
    },
    seatDoor: {
      mintSeatSession: async (input) => {
        calls.push(input)
        return 'guest-token-1'
      }
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:51790/api/tracy-brand-engine/extract/example.com')
      assert.equal(init.headers.cookie, 'dsh_gateway_token=guest-token-1')
      return new Response(JSON.stringify({ state: 'done', fresh: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
  })
  const res = await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { state: 'done', fresh: true })
  assert.equal(calls.length, 1)
  // The one assertion that matters: a bug here hands a stranger a real seat.
  assert.equal(calls[0].grant.role, 'guest')
  assert.equal(calls[0].grant.site, 'tracy.localhost')
  assert.deepEqual(calls[0].grant.folders, ['/site/tracy'])
  assert.equal(calls[0].origin, 'http://127.0.0.1:51790')
  assert.equal(calls[0].secret, 'seat-k')
})

test('the brand door is unavailable, not crashed, with no guestSiteKey configured', async () => {
  const app = publicRoutes({
    config: baseConfig({ guestSiteKey: null }),
    fetchImpl: unreachableFetch
  })
  const res = await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  // 503, never 502: Cloudflare swaps an origin 502 (and 504) for its own `error code: 502`
  // text/plain page, so the translated JSON below never reached a visitor (#811 F-S5-001).
  assert.equal(res.status, 503)
  assert.match(res.headers.get('content-type') ?? '', /application\/json/)
  assert.equal((await res.json()).code, 'LANE_UNAVAILABLE')
})

function guestLaneApp(fetchImpl, extra = {}) {
  return publicRoutes({
    config: baseConfig(),
    fleetLabel: async () => 'tracy',
    seatDoor: { mintSeatSession: async () => 'guest-token-1' },
    fetchImpl,
    ...extra
  })
}

async function assertLaneUnavailable(res) {
  assert.equal(res.status, 503)
  assert.match(res.headers.get('content-type') ?? '', /application\/json/)
  const body = await res.json()
  assert.equal(body.code, 'LANE_UNAVAILABLE')
  assert.equal(body.message, 'The brand reader is not available right now.')
}

test('the brand door answers 503 JSON, not a crash, when the guest lane cannot be reached', async () => {
  const app = guestLaneApp(async () => {
    throw new TypeError('fetch failed')
  })
  await assertLaneUnavailable(
    await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  )
})

test('the brand door answers 503 JSON when minting the guest session throws', async () => {
  const app = guestLaneApp(unreachableFetch, {
    seatDoor: {
      mintSeatSession: async () => {
        throw new Error('dsh refused the seat secret')
      }
    }
  })
  await assertLaneUnavailable(
    await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  )
})

test('a lane 502/504 is answered as 503 JSON, never passed through for the edge to replace', async () => {
  for (const status of [502, 504]) {
    const app = guestLaneApp(
      async () => new Response('Bad Gateway', { status, headers: { 'content-type': 'text/plain' } })
    )
    await assertLaneUnavailable(
      await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com/tokens.css'))
    )
  }
})

test("the lane's own JSON answers still pass through untouched (404 of an unmeasured host)", async () => {
  const app = guestLaneApp(
    async () =>
      new Response(JSON.stringify({ code: 'UNKNOWN_ID' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
  )
  const res = await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { code: 'UNKNOWN_ID' })
})

test('a guest lane that never answers is cut off and answered as 503 JSON', async () => {
  const app = guestLaneApp(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      }),
    { laneTimeoutMs: 20 }
  )
  await assertLaneUnavailable(
    await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  )
})

// Review of #1181 (BD-1): the lane's time limit covers minting the guest session too, and ends once
// the lane has answered — a large body still streaming past it is not cut off halfway.

test('a guest session mint that never answers is cut off and answered as 503 JSON', async () => {
  const app = guestLaneApp(async () => new Response('{}'), {
    seatDoor: { mintSeatSession: () => new Promise(() => {}) },
    laneTimeoutMs: 20
  })
  await assertLaneUnavailable(
    await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  )
})

test('a lane answer whose body streams past the time limit is delivered whole', async () => {
  const app = guestLaneApp(
    async (_url, init) => {
      const body = new ReadableStream({
        async start(controller) {
          // A real fetch errors the body when its signal aborts mid-stream.
          init.signal?.addEventListener('abort', () => controller.error(init.signal.reason))
          controller.enqueue(new TextEncoder().encode('{"part":'))
          await new Promise((r) => setTimeout(r, 80))
          controller.enqueue(new TextEncoder().encode('"whole"}'))
          controller.close()
        }
      })
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    },
    { laneTimeoutMs: 20 }
  )
  const res = await app.fetch(new Request('http://tracy.test/design-inspiration/api/brand/example.com'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { part: 'whole' })
})

// ── Turnstile: fails CLOSED (missing config is never an open door), three states ──

function brandRequest() {
  return new Request('http://tracy.test/design-inspiration/api/brand', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'example.com' })
  })
}

test('POST api/brand: neither TURNSTILE_SECRET nor TURNSTILE_DISABLED — refused, not skipped', async () => {
  const config = baseConfig({ turnstileSecret: null, turnstileDisabled: false })
  const app = publicRoutes({
    config,
    fleetLabel: async () => 'tracy',
    seatDoor: { mintSeatSession: async () => 'guest-token-1' },
    resolve: fakeResolve,
    fetchImpl: async (url) => {
      // The one pre-check this branch may still make is the "already measured?" read, and only
      // that one — it is wrapped in `.catch(() => null)` upstream, so failing it here is safe and
      // proves nothing further (the actual extraction) was ever reached.
      if (url.endsWith('/extract/example.com')) return new Response('{}', { status: 404 })
      throw new Error(`must not fetch ${url} with no Turnstile secret and no explicit disable flag`)
    }
  })
  const res = await app.fetch(brandRequest())
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'TURNSTILE')
})

test('POST api/brand: TURNSTILE_DISABLED explicitly skips the check', async () => {
  const config = baseConfig({ turnstileSecret: null, turnstileDisabled: true })
  const calls = []
  const app = publicRoutes({
    config,
    fleetLabel: async () => 'tracy',
    seatDoor: { mintSeatSession: async () => 'guest-token-1' },
    resolve: fakeResolve,
    pool: permissivePool,
    fetchImpl: async (url) => {
      calls.push(url)
      if (url.endsWith('/extract/example.com')) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify({ state: 'working' }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      })
    }
  })
  const res = await app.fetch(brandRequest())
  assert.equal(res.status, 202)
  assert.ok(calls.some((u) => u.endsWith('/extract')))
})

test('POST api/brand: a configured TURNSTILE_SECRET is verified — rejected token refuses', async () => {
  const config = baseConfig({ turnstileSecret: 'ts_secret', turnstileDisabled: false })
  const app = publicRoutes({
    config,
    fleetLabel: async () => 'tracy',
    seatDoor: { mintSeatSession: async () => 'guest-token-1' },
    resolve: fakeResolve,
    fetchImpl: async (url) => {
      if (url.endsWith('/extract/example.com')) return new Response('{}', { status: 404 })
      if (url.includes('challenges.cloudflare.com')) return Response.json({ success: false })
      throw new Error(`unexpected fetch to ${url}`)
    }
  })
  const res = await app.fetch(brandRequest())
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'TURNSTILE')
})

test('POST api/brand: a configured TURNSTILE_SECRET is verified — accepted token passes', async () => {
  const config = baseConfig({ turnstileSecret: 'ts_secret', turnstileDisabled: false })
  const calls = []
  const app = publicRoutes({
    config,
    fleetLabel: async () => 'tracy',
    seatDoor: { mintSeatSession: async () => 'guest-token-1' },
    resolve: fakeResolve,
    pool: permissivePool,
    fetchImpl: async (url) => {
      calls.push(url)
      if (url.endsWith('/extract/example.com')) return new Response('{}', { status: 404 })
      if (url.includes('challenges.cloudflare.com')) return Response.json({ success: true })
      return new Response(JSON.stringify({ state: 'working' }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      })
    }
  })
  const res = await app.fetch(
    new Request('http://tracy.test/design-inspiration/api/brand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'example.com', turnstile: 'a-real-looking-token' })
    })
  )
  assert.equal(res.status, 202)
  assert.ok(calls.some((u) => u.includes('challenges.cloudflare.com')))
})

// ── api/brand: this door triggers a shared Chromium job — it must be rate-limited too (C1) ──

test('POST api/brand: over the daily limit is refused before ever starting an extraction', async () => {
  const config = baseConfig({ turnstileDisabled: true }) // isolate the rate limit from Turnstile
  const pool = { query: async () => ({ rows: [{ count: 11 }] }) } // BRAND_PER_IP_DAY is 10
  const app = publicRoutes({
    config,
    fleetLabel: async () => 'tracy',
    seatDoor: { mintSeatSession: async () => 'guest-token-1' },
    resolve: fakeResolve,
    pool,
    fetchImpl: async (url) => {
      if (url.endsWith('/extract/example.com')) return new Response('{}', { status: 404 })
      throw new Error(`must not start an extraction over the daily limit: ${url}`)
    }
  })
  const res = await app.fetch(brandRequest())
  assert.equal(res.status, 429)
  assert.equal((await res.json()).code, 'RATE_LIMITED')
})

test('POST api/brand: no pool configured fails closed too — the door bumpCounter used to leave wide open', async () => {
  const config = baseConfig({ turnstileDisabled: true })
  const app = publicRoutes({
    config,
    fleetLabel: async () => 'tracy',
    seatDoor: { mintSeatSession: async () => 'guest-token-1' },
    resolve: fakeResolve,
    fetchImpl: async (url) => {
      if (url.endsWith('/extract/example.com')) return new Response('{}', { status: 404 })
      throw new Error(`must not start an extraction with no pool to rate-limit against: ${url}`)
    }
  })
  const res = await app.fetch(brandRequest())
  assert.equal(res.status, 429)
  assert.equal((await res.json()).code, 'RATE_LIMITED')
})

// ── api/none/* and any other unknown door answer 404, never the shell ──

test('api/none/* and unknown doors answer 404 JSON', async () => {
  const app = publicRoutes({ config: baseConfig(), fetchImpl: unreachableFetch })
  const none = await app.fetch(new Request('http://tracy.test/design-inspiration/api/none/choose'))
  assert.equal(none.status, 404)
  assert.equal((await none.json()).code, 'NO_SUCH_DOOR')
  const unknown = await app.fetch(
    new Request('http://tracy.test/design-inspiration/api/copy', { method: 'POST' })
  )
  assert.equal(unknown.status, 404)
})

// ── the static page: absent build is a stated 404, not a crash ──

test('the page falls back to a stated 404 when the build is not present on disk', async () => {
  const app = publicRoutes({
    config: baseConfig(),
    fetchImpl: unreachableFetch,
    root: '/tmp/tracy-design-page-does-not-exist-in-this-test'
  })
  const res = await app.fetch(new Request('http://tracy.test/design-inspiration'))
  assert.equal(res.status, 404)
  const text = await res.text()
  assert.match(text, /not been built/)
})
