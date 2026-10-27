import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'

// Tracy -tracy.4: Claude's OAuth client no longer accepts the old
// console.anthropic.com code-paste redirect (the authorize page answers
// "Invalid request format"). The plugin now uses the loopback redirect the
// current Claude CLI flow uses (pi-ai 0.87.1: http://localhost:53692/callback),
// so the default config catches the callback itself and the code exchange
// sends that same redirect_uri.

const CLAUDE_LOOPBACK = 'http://localhost:53692/callback'

function fakeCtx() {
  const routes = []
  const cleanups = []
  const saved = new Map()
  const ctx = {
    log: { warn() {}, error() {}, info() {} },
    logger: () => ({ warn() {}, error() {}, info() {} }),
    emit() {},
    provide() { return () => {} },
    effect(fn) {
      const c = fn()
      cleanups.push(typeof c === 'function' ? c : () => {})
      return () => {}
    },
    inject(names, fn) { fn(ctx); return () => {} },
    llm: { registerAdapter() { return { dispose() {} } } },
    credentials: {
      get: async (ref) => saved.get(ref) ?? null,
      resolve: async (ref) => (saved.has(ref) ? { value: saved.get(ref) } : null),
      set: async (ref, value) => { saved.set(ref, value) },
      unset: async (ref) => { saved.delete(ref) },
      list: async () => [],
      clearRef: async () => {},
    },
    webServer: {
      register(spec) { routes.push(spec); return () => {} },
      tapIndex(html) { return html },
    },
    tools: { register() { return () => {} } },
  }
  return { ctx, routes, cleanups }
}

// The redirect is fixed at :53692. When something already listens there (a Claude sign-in in
// progress in a running dsh), stop: hitting it with a test code would spend that real sign-in.
function portFree(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, host, () => probe.close(() => resolve(true)))
  })
}

async function getJson(route, url) {
  const out = { code: 0, body: null }
  const req = {
    method: 'GET',
    url,
    headers: { host: '127.0.0.1:51731', origin: 'http://127.0.0.1:51731' },
  }
  const res = {
    writeHead(c) { out.code = c },
    setHeader() {},
    end(b) { out.body = b ? JSON.parse(String(b)) : null },
  }
  await route.handler(req, res)
  return out
}

test('Claude connect with default config: loopback redirect, auto catch, same redirect in the code exchange', async (t) => {
  for (const host of ['localhost', '127.0.0.1']) {
    assert.ok(await portFree(53692, host), `port 53692 on ${host} is busy (a Claude sign-in in progress?); not touching it`)
  }
  const tokenBodies = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    if (u.startsWith('https://platform.claude.com/v1/oauth/token')) {
      tokenBodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    if (u.startsWith('http://localhost:53692') || u.startsWith('http://127.0.0.1:53692')) {
      return realFetch(url, init)
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const mod = await import('../lib/index.js')
  const { ctx, routes, cleanups } = fakeCtx()
  mod.apply(ctx, mod.plainConfig(mod.Config({})))
  t.after(() => {
    globalThis.fetch = realFetch
    for (const c of cleanups) { try { c() } catch { /* ignore */ } }
  })

  const start = routes.find((r) => r.path === '/dsh-subscriptions/oauth/start')
  const out = await getJson(start, '/dsh-subscriptions/oauth/start?provider=claude&index=1')
  assert.equal(out.code, 200)
  assert.equal(out.body.redirectUri, CLAUDE_LOOPBACK)
  assert.equal(out.body.autoCatch, true)

  const url = new URL(out.body.url)
  assert.equal(url.origin + url.pathname, 'https://claude.ai/oauth/authorize')
  assert.equal(url.searchParams.get('redirect_uri'), CLAUDE_LOOPBACK)
  assert.equal(url.searchParams.get('code'), 'true')
  assert.equal(url.searchParams.get('client_id'), '9d1c250a-e61b-44d9-88ed-5944d1962f5e')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(
    url.searchParams.get('scope'),
    'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload',
  )

  // Anthropic redirects the browser to the loopback with code + state.
  const state = url.searchParams.get('state')
  let cb
  for (let i = 0; i < 50; i++) {
    try {
      cb = await realFetch(`http://localhost:53692/callback?code=the-code&state=${encodeURIComponent(state)}`)
      break
    } catch { await new Promise((r) => setTimeout(r, 20)) }
  }
  assert.ok(cb, 'loopback on :53692 answered')
  assert.equal(cb.status, 200)
  await cb.text()

  assert.equal(tokenBodies.length, 1)
  assert.equal(tokenBodies[0].grant_type, 'authorization_code')
  assert.equal(tokenBodies[0].code, 'the-code')
  assert.equal(tokenBodies[0].redirect_uri, CLAUDE_LOOPBACK)
  assert.equal(tokenBodies[0].state, state)
  assert.ok(tokenBodies[0].code_verifier)
})
