// The homepage read's two tiers (`src/escalating-fetch.js`): Node's pinned fetch first, then one escalation to a
// Chrome-fingerprint client through the guarded proxy when the first answer is a refusal or a bot challenge.
// Network replaced by fakes; nothing here leaves the machine.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import http from 'node:http'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startGuardedProxy } from '../src/guarded-connect-proxy.js'
import { createEscalatingFetch, isChallengePage } from '../src/escalating-fetch.js'
import { fetchLimited } from '../domain/fetch-limited.mjs'

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }]
const PROXY_URL = 'http://tracy:secret@127.0.0.1:1'
const HOME = '<html><head><title>Pho Ba</title></head><body>' + 'menu '.repeat(200) + '</body></html>'
const CF = '<html><head><title>Just a moment...</title></head><body><div id="cf_chl_opt"></div></body></html>'
const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } })

/** A fake `impit` module: records each client and request, answers with `answer(url, init)`. */
function fakeImpit(answer) {
  const seen = { clients: [], requests: [] }
  class Impit {
    constructor(options) {
      seen.clients.push(options)
    }
    async fetch(url, init) {
      seen.requests.push({ url: String(url), init })
      return answer(String(url), init)
    }
  }
  return { seen, loadImpit: async () => ({ Impit }) }
}

function world({ base, impit = () => html(HOME), enabled = true, loadImpit, getProxy, budgets, log } = {}) {
  const fake = fakeImpit(impit)
  const asked = []
  const warned = []
  const startRead = createEscalatingFetch({
    baseFetch: async (u, init) => {
      asked.push(String(u))
      return base(String(u), init)
    },
    getProxy: getProxy ?? (async () => ({ proxyUrl: PROXY_URL, close() {}, stats: () => ({}) })),
    loadImpit: loadImpit ?? fake.loadImpit,
    isEnabled: () => enabled,
    budgets,
    log: log ?? { warn: (m) => warned.push(m) }
  })
  return { startRead, asked, impit: fake.seen, warned }
}

const read = (r, url = 'https://phoba.example/') =>
  fetchLimited(url, {
    fetch: r.fetch,
    resolve: PUBLIC,
    maxBytes: 2 * 1024 * 1024,
    timeoutMs: r.remainingMs(),
    headers: { accept: 'text/html' }
  })

test('a readable homepage stays on tier 1 and impit is never loaded', async () => {
  let loaded = 0
  const w = world({
    base: () => html(HOME),
    loadImpit: async () => {
      loaded++
      throw new Error('not here')
    }
  })
  const r = w.startRead()
  assert.equal(r.enabled, true)
  const got = await read(r)
  assert.equal(got.status, 200)
  assert.equal(new TextDecoder().decode(got.bytes), HOME, 'the peek did not eat the body')
  assert.equal(r.via(), 'node')
  assert.deepEqual(
    r.attempts().map(({ tier, status, reason }) => ({ tier, status, reason })),
    [{ tier: 1, status: 200, reason: 'ok' }]
  )
  assert.equal(typeof r.attempts()[0].ms, 'number')
  assert.equal(loaded, 0)
})

test('403 escalates once to impit through the guarded proxy, with Chrome headers and TLS checks on', async () => {
  const w = world({ base: () => html('no', 403), impit: () => html(HOME) })
  const r = w.startRead()
  const got = await read(r)
  assert.equal(got.status, 200)
  assert.equal(new TextDecoder().decode(got.bytes), HOME)
  assert.equal(r.via(), 'impit')
  assert.deepEqual(
    r.attempts().map(({ tier, status, reason }) => ({ tier, status, reason })),
    [
      { tier: 1, status: 403, reason: 'http_403' },
      { tier: 2, status: 200, reason: 'ok' }
    ]
  )
  const [client] = w.impit.clients
  assert.equal(client.browser, 'chrome')
  assert.equal(client.proxyUrl, PROXY_URL)
  assert.equal(client.followRedirects, false)
  assert.equal(client.http3, false)
  assert.notEqual(client.ignoreTlsErrors, true)
  const [req] = w.impit.requests
  const sent = new Headers(req.init.headers)
  assert.equal(sent.get('accept'), 'text/html', "the caller's accept is kept")
  assert.equal(sent.get('user-agent'), null, "impit's Chrome profile sets the UA, never Tracy's")
  assert.equal(req.init.redirect, 'manual')
  assert.ok(req.init.signal instanceof AbortSignal)
})

test('isChallengePage: real challenges yes; a contact form with reCAPTCHA or a page script alone no', () => {
  assert.equal(isChallengePage(CF), true)
  assert.equal(isChallengePage('<script src="https://geo.captcha-delivery.com/c.js"></script>'), true)
  assert.equal(isChallengePage('<iframe src="/_Incapsula_Resource?x=1"></iframe>'), true)
  assert.equal(isChallengePage('<div id="px-captcha"></div>'), true)
  assert.equal(isChallengePage(HOME), false)
  assert.equal(
    isChallengePage(
      '<form><div class="g-recaptcha"></div><script src="https://www.google.com/recaptcha/api.js"></script></form>'
    ),
    false
  )
  assert.equal(
    isChallengePage(
      '<div class="h-captcha" data-sitekey="x"></div><script src="https://hcaptcha.com/1/api.js"></script>'
    ),
    false
  )
  assert.equal(
    isChallengePage('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'),
    false
  )
  assert.equal(isChallengePage('', new Headers({ 'cf-mitigated': 'challenge' })), true)
})

test('a challenge escalates at any status except 401; cf-mitigated header alone is enough', async () => {
  for (const [status, body, headers] of [
    [200, CF, {}],
    [503, CF, {}],
    [429, CF, {}],
    [200, 'x', { 'cf-mitigated': 'challenge' }]
  ]) {
    const w = world({ base: () => html(body, status, headers) })
    const r = w.startRead()
    const got = await read(r)
    assert.equal(got.status, 200, `${status} escalated`)
    assert.equal(r.via(), 'impit')
    assert.equal(r.attempts()[0].reason, 'challenge')
  }
  const w = world({ base: () => html(CF, 401) })
  const r = w.startRead()
  assert.equal((await read(r)).status, 401)
  assert.equal(w.impit.requests.length, 0, '401 never escalates')
})

test('no escalation: 401, 429 without a challenge, 5xx, a small 200, reCAPTCHA contact form', async () => {
  for (const [status, body, reason] of [
    [401, 'login', 'http_401'],
    [500, 'oops', 'http_500'],
    [503, 'busy', 'http_503'],
    [200, '<html>hi</html>', 'small_body'],
    [200, HOME + '<script src="https://www.google.com/recaptcha/api.js"></script>', 'ok']
  ]) {
    const w = world({ base: () => html(body, status) })
    const r = w.startRead()
    const got = await read(r)
    assert.equal(got.status, status)
    assert.equal(w.impit.requests.length, 0, `${reason}: not escalated`)
    assert.equal(r.via(), 'node')
    assert.equal(r.attempts()[0].reason, reason)
  }
})

test('429 without a challenge sets a per-host cooldown from Retry-After: a later 403 of that host is not escalated', async () => {
  let answer = () => html('slow down', 429, { 'retry-after': '120' })
  const w = world({ base: () => answer() })
  const first = w.startRead()
  assert.equal((await read(first)).status, 429)
  assert.equal(first.attempts()[0].reason, 'http_429')
  answer = () => html('no', 403)
  const second = w.startRead()
  assert.equal((await read(second)).status, 403)
  assert.equal(w.impit.requests.length, 0)
  assert.deepEqual(
    second.attempts().map((a) => a.reason),
    ['http_403', 'cooldown']
  )
  const other = w.startRead()
  await read(other, 'https://other.example/')
  assert.equal(w.impit.requests.length, 1, 'another host is not cooling down')
})

test('tier 1 reset or TLS handshake failure escalates; DNS, certificate, refused and timeout errors do not', async () => {
  const err = (code, message = code) => Object.assign(new Error(message), { code })
  const cases = [
    [err('ECONNRESET'), true],
    [err('ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE', 'sslv3 alert handshake failure'), true],
    [Object.assign(new TypeError('fetch failed'), { cause: err('ECONNRESET') }), true],
    [err('ENOTFOUND'), false],
    [err('CERT_HAS_EXPIRED'), false],
    [err('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), false],
    [err('ECONNREFUSED'), false],
    [err('ETIMEDOUT'), false],
    [err('URL_BLOCKED'), false]
  ]
  for (const [error, escalates] of cases) {
    const w = world({
      base: () => {
        throw error
      }
    })
    const r = w.startRead()
    if (escalates) {
      assert.equal((await read(r)).status, 200, `${error.code ?? error.cause?.code} escalated`)
      assert.equal(r.via(), 'impit')
    } else {
      await assert.rejects(read(r), { code: 'FETCH_FAILED' }, `${error.code} is the tier-1 error`)
      assert.equal(w.impit.requests.length, 0)
      assert.equal(r.via(), null)
    }
  }
})

test('sticky: after escalating, later redirect hops of the same read go straight to impit; a new read starts on tier 1', async () => {
  const w = world({
    base: () => html('no', 403),
    impit: (url) =>
      url === 'https://phoba.example/'
        ? new Response(null, { status: 301, headers: { location: 'https://www.phoba.example/' } })
        : html(HOME)
  })
  const r = w.startRead()
  const got = await read(r)
  assert.equal(got.url, 'https://www.phoba.example/')
  assert.deepEqual(w.asked, ['https://phoba.example/'], 'tier 1 asked only the first hop')
  assert.deepEqual(
    w.impit.requests.map((q) => q.url),
    ['https://phoba.example/', 'https://www.phoba.example/']
  )
  assert.deepEqual(
    r.attempts().map(({ tier, status }) => [tier, status]),
    [
      [1, 403],
      [2, 301],
      [2, 200]
    ]
  )
  const next = w.startRead()
  await read(next)
  assert.equal(w.asked.length, 2, 'the next read starts on tier 1 again')
  assert.equal(next.attempts()[0].tier, 1, 'ledgers are per read')
})

test('tier 2 failure keeps the tier-1 answer: an exception, a 5xx, a mid-stream error, or a proxy that will not start', async () => {
  const brokenStream = () =>
    new Response(
      new ReadableStream({
        pull(c) {
          c.error(new Error('stream reset'))
        }
      }),
      { status: 200, headers: { 'content-type': 'text/html' } }
    )
  for (const [label, opts] of [
    ['throws', { impit: () => Promise.reject(new Error('h2 protocol error')) }],
    ['5xx', { impit: () => html('bad gateway', 502) }],
    ['stream', { impit: brokenStream }],
    [
      'proxy',
      {
        getProxy: async () => {
          throw new Error('listen EADDRINUSE')
        }
      }
    ]
  ]) {
    const w = world({ base: () => html('forbidden page', 403), ...opts })
    const r = w.startRead()
    const got = await read(r)
    assert.equal(got.status, 403, `${label}: the tier-1 answer stands`)
    assert.equal(new TextDecoder().decode(got.bytes), 'forbidden page')
    assert.equal(r.via(), 'node')
    assert.equal(r.attempts().at(-1).tier, 2)
    assert.notEqual(r.attempts().at(-1).reason, 'ok')
  }
})

test('impit that cannot load warns once per process, disables tier 2 and keeps the tier-1 answer', async () => {
  let loads = 0
  const w = world({
    base: () => html('no', 403),
    loadImpit: async () => {
      loads++
      throw new Error("impit couldn't load native bindings")
    }
  })
  const one = w.startRead()
  assert.equal((await read(one)).status, 403)
  assert.equal(one.attempts().at(-1).reason, 'impit_unavailable')
  const two = w.startRead()
  assert.equal(two.enabled, false, 'tier 2 is off for the rest of the process')
  assert.equal(loads, 1)
  assert.equal(w.warned.length, 1)
})

test('switch off: the read is the base fetch, untouched, with no ledger', async () => {
  const w = world({ enabled: false, base: () => html('no', 403) })
  const r = w.startRead()
  assert.equal(r.enabled, false)
  assert.equal((await read(r)).status, 403)
  assert.equal(w.impit.requests.length, 0)
  assert.deepEqual(r.attempts(), [])
  assert.equal(r.via(), null)
})

test('the challenge peek is bounded and leaves the caller a full, cancellable body', async () => {
  let pulled = 0
  let cancelled = false
  const chunk = new TextEncoder().encode('a'.repeat(16 * 1024))
  const endless = () =>
    new Response(
      new ReadableStream({
        pull(c) {
          pulled++
          c.enqueue(chunk)
        },
        cancel() {
          cancelled = true
        }
      }),
      { status: 200, headers: { 'content-type': 'text/html' } }
    )
  const w = world({ base: endless })
  const r = w.startRead()
  const got = await fetchLimited('https://phoba.example/', {
    fetch: r.fetch,
    resolve: PUBLIC,
    maxBytes: 100 * 1024,
    timeoutMs: r.remainingMs()
  })
  assert.equal(got.bytes.length, 100 * 1024, 'the cap is the caller’s')
  assert.equal(got.truncated, true)
  assert.ok(pulled <= 10, `pulled ${pulled} chunks, not the whole stream`)
  assert.equal(cancelled, true, 'cancel reached the upstream body')
  assert.equal(r.via(), 'node')
})

test('the tier-2 body is capped by the caller and cancelling it aborts the impit response', async () => {
  let aborted = 0
  let cancelled = false
  const chunk = new TextEncoder().encode('b'.repeat(16 * 1024))
  const w = world({
    base: () => html('no', 403),
    impit: () => {
      const res = new Response(
        new ReadableStream({
          pull(c) {
            c.enqueue(chunk)
          },
          cancel() {
            cancelled = true
          }
        }),
        { status: 200, headers: { 'content-type': 'text/html', 'set-cookie': 'a=1' } }
      )
      res.headers.append('set-cookie', 'b=2')
      res.abort = () => {
        aborted++
      }
      return res
    }
  })
  const r = w.startRead()
  const res = await r.fetch('https://phoba.example/', { redirect: 'manual', headers: {} })
  assert.deepEqual(res.headers.getSetCookie(), ['a=1', 'b=2'], 'multiple set-cookie survive')
  await res.body.cancel()
  assert.equal(cancelled, true)
  assert.ok(aborted >= 1, 'the impit response was aborted')
})

test('budgets: a slow tier 1 is cut at its own cap; tier 2 gets at most its cap and what is left of the read', async () => {
  const hang = (u, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
  const w = world({ base: hang, budgets: { readMs: 400, tier1Ms: 60, tier2Ms: 1000 } })
  const r = w.startRead()
  const t0 = Date.now()
  await assert.rejects(read(r), { code: 'FETCH_FAILED' })
  assert.ok(Date.now() - t0 < 300, 'tier 1 stopped at its cap, not the read deadline')
  assert.equal(r.attempts()[0].reason, 'timeout')
  assert.equal(w.impit.requests.length, 0, 'a timeout is not escalated')

  const w2 = world({
    base: () => html('no', 403),
    budgets: { readMs: 300, tier1Ms: 100, tier2Ms: 5000, minTier2Ms: 10 }
  })
  const r2 = w2.startRead()
  await read(r2)
  const [client] = w2.impit.clients
  const [req] = w2.impit.requests
  assert.ok(
    req.init.timeout <= 300 && req.init.timeout > 0,
    `tier-2 timeout ${req.init.timeout} within the read`
  )
  assert.ok(client.timeout == null || client.timeout <= 5000)

  const shared = w2.startRead({ deadlineAt: Date.now() - 1 })
  assert.equal(shared.remainingMs(), 0, 'a retry shares the first read’s deadline')
})

test('the ledger holds 12 entries, then says it was truncated', async () => {
  const w = world({
    base: () => new Response(null, { status: 302, headers: { location: 'https://phoba.example/' } })
  })
  const r = w.startRead()
  for (let i = 0; i < 15; i++) await r.fetch('https://phoba.example/', { redirect: 'manual', headers: {} })
  const list = r.attempts()
  assert.equal(list.length, 13)
  assert.deepEqual(list.at(-1), { truncated: true })
  assert.equal(list[0].reason, 'redirect')
})

// The real chain once: `impit` (Chrome profile) -> the guarded proxy -> a local plain-http server. `impit` is an
// optional dependency; in this monorepo it is installed for apps/tracy-web.
const APP_IMPIT = fileURLToPath(
  new URL('../../../../apps/tracy-web/node_modules/impit/index.wrapper.js', import.meta.url)
)
async function realImpit() {
  try {
    return await import('impit')
  } catch {
    return existsSync(APP_IMPIT) ? import(pathToFileURL(APP_IMPIT).href) : null
  }
}
const impitModule = await realImpit()

test('real impit through the real guarded proxy: Chrome UA reaches the site, the body is capped, the socket closes', {
  skip: impitModule ? false : 'impit is not installed (optional dependency)'
}, async () => {
  const seen = []
  const closed = []
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, ua: req.headers['user-agent'], accept: req.headers.accept })
    req.socket.once('close', () => closed.push(req.url))
    if (req.url === '/endless') {
      res.writeHead(200, { 'content-type': 'text/html' })
      const chunk = Buffer.alloc(16 * 1024, 'x')
      const pump = () => {
        while (res.write(chunk)) {}
        res.once('drain', pump)
      }
      res.on('error', () => {})
      pump()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(HOME)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  const proxy = await startGuardedProxy({
    isBlockedAddress: () => false,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    allowedPorts: [port]
  })
  try {
    const startRead = createEscalatingFetch({
      baseFetch: async () => html('no', 403),
      getProxy: async () => proxy,
      loadImpit: async () => impitModule,
      isEnabled: true,
      budgets: { maxBytes: 64 * 1024 },
      log: { warn() {} }
    })
    const r = startRead()
    const got = await fetchLimited(`http://site.test:${port}/`, {
      fetch: r.fetch,
      resolve: PUBLIC,
      allowPorts: [port],
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: r.remainingMs(),
      headers: { accept: 'text/html' }
    })
    assert.equal(new TextDecoder().decode(got.bytes), HOME)
    assert.equal(r.via(), 'impit')
    assert.match(seen[0].ua ?? '', /Chrome\//, 'the Chrome profile UA')
    assert.doesNotMatch(seen[0].ua ?? '', /TracyWebsiteOpportunities/)
    assert.equal(seen[0].accept, 'text/html')

    const capped = startRead()
    const big = await fetchLimited(`http://site.test:${port}/endless`, {
      fetch: capped.fetch,
      resolve: PUBLIC,
      allowPorts: [port],
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: capped.remainingMs()
    })
    assert.equal(capped.via(), 'impit')
    assert.ok(big.bytes.length <= 64 * 1024 + 1, `${big.bytes.length} bytes: capped at tier 2's limit`)
    const until = Date.now() + 5000
    while (!closed.includes('/endless') && Date.now() < until) await new Promise((r) => setTimeout(r, 50))
    assert.ok(closed.includes('/endless'), 'the upstream socket was closed after the cap')
  } finally {
    await proxy.close()
    server.closeAllConnections?.()
    await new Promise((r) => server.close(r))
  }
})
