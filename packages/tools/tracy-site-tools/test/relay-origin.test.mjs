/**
 * Where the Apply relay sends a write, through the SHIPPED bundle (`lib/index.js`): only to the
 * configured Tracy origin (`config.origin`, else `MCP_TRACY_ORIGIN`), never to the host a browser's
 * hello names.
 *
 * WHY. A viewer's origin is its hello's `x-forwarded-host`/`host`. On the fleet the proxy in front
 * of dsh overwrites that header, but a path that reaches dsh without that proxy (a direct port, a
 * stand) keeps whatever the caller typed. `relayPlan` used to fall back to that origin when none was
 * configured, so the signed actor assertion of the person who typed — accepted by every actor door
 * for 300 s — or a viewer's cookie went to any host a caller picked. The same rule PR #624 set for
 * the design record (`design-sync.mjs`): the configured origin or nobody.
 *
 *   node --test packages/tools/tracy-site-tools/test/relay-origin.test.mjs
 */
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { apply } from '../lib/index.js'

const SPOOFED = 'attacker.example'

/** A fetch that records every request and answers the Apply door with ok. */
function recorder() {
  /** @type {{ url: string, headers: Record<string, string> }[]} */
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: { ...init.headers } })
    return Response.json({ ok: true })
  }
  return { calls, fetch }
}

/** A person who typed in this session, stamped by the gate (`latestPrompter`). */
const typed = [
  {
    type: 'user/message',
    data: {
      source: { kind: 'user', rpcId: 'r1', prompter: { user: 'sb', email: 'bee@team.test' } },
      content: 'change the phone'
    }
  }
]

/** The plugin on a HostContext that keeps its web route; `events` is every session's log. */
function boot(config, events = []) {
  let route = null
  const ctx = {
    webServer: {
      register: (r) => {
        route = r
        return () => {}
      }
    },
    tools: { register: () => () => {}, schemas: () => [{ name: 'tracy_site' }] },
    effect: (setup) => {
      setup()
    },
    on: () => {},
    get: (name) =>
      name === 'sessions'
        ? { get: () => ({ snapshotEvents: () => events }) }
        : name === 'tracyAssertion'
          ? { mint: (email) => `signed:${email}` }
          : name === 'logger'
            ? { warn: () => {} }
            : undefined
  }
  apply(ctx, config)
  return () => route
}

/** One request to the plugin's route, from `remoteAddress`, with `headers`. */
async function call(route, url, headers, body, remoteAddress = '127.0.0.1') {
  const req = new PassThrough()
  req.method = 'POST'
  req.url = url
  req.headers = headers
  req.socket = { remoteAddress }
  const done = new Promise((resolve) => {
    let status = 0
    route.handler(req, {
      writeHead: (s) => {
        status = s
      },
      end: (text) => resolve({ status, body: JSON.parse(text) })
    })
  })
  req.end(JSON.stringify(body))
  return done
}

/** A browser whose hello names a host of the caller's choosing — a path with no fleet proxy in front. */
const spoofedHello = (route, sessionId) =>
  call(
    route,
    '/api/tracy-site-tools/hello',
    { cookie: 'tracy_sess=abc', host: 'dsh.local', 'x-forwarded-host': SPOOFED },
    { sessionId },
    '10.0.0.9'
  )

/** The build engine's loopback call for one session. */
const engineApply = (route, sessionId) =>
  call(
    route,
    '/api/tracy-site-tools/apply',
    {},
    {
      sessionId,
      siteKey: 'site1.tracy.test',
      action: 'content.read',
      params: { describe: true }
    }
  )

test.beforeEach(() => {
  delete process.env.MCP_TRACY_ORIGIN
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})

test('a configured origin receives the write; the spoofed hello host receives nothing, for a viewer and for the person who typed', async () => {
  for (const events of [[], typed]) {
    const door = recorder()
    const route = boot({ origin: 'http://tracy-web:8080', fetch: door.fetch }, events)
    const sid = `session-${events.length === 0 ? 'viewer' : 'typed'}-1`
    await spoofedHello(route(), sid)
    const answer = await engineApply(route(), sid)
    assert.equal(answer.status, 200)
    const applies = door.calls.filter((c) => c.url.includes('/apply'))
    assert.deepEqual(
      applies.map((c) => c.url),
      ['http://tracy-web:8080/api/sites/site1.tracy.test/apply']
    )
    if (events.length === 0) assert.equal(applies[0].headers.cookie, 'tracy_sess=abc')
    else assert.equal(applies[0].headers['x-tracy-actor'], 'signed:bee@team.test')
    assert.equal(
      door.calls.filter((c) => c.url.includes(SPOOFED)).length,
      0,
      'the hello host must never receive a request'
    )
  }
})

test('MCP_TRACY_ORIGIN stands in for the plugin config, with the same pin', async () => {
  process.env.MCP_TRACY_ORIGIN = 'https://cowork.tracy.test'
  const door = recorder()
  const route = boot({ fetch: door.fetch }, typed)
  await spoofedHello(route(), 'session-env-1')
  await engineApply(route(), 'session-env-1')
  assert.deepEqual(
    door.calls.map((c) => c.url).filter((u) => u.includes('/apply')),
    ['https://cowork.tracy.test/api/sites/site1.tracy.test/apply']
  )
  assert.equal(door.calls.filter((c) => c.url.includes(SPOOFED)).length, 0)
})

test('no configured origin: nobody is sent anything, and the call is refused NO_VIEWER as before', async () => {
  for (const events of [[], typed]) {
    const door = recorder()
    const route = boot({ fetch: door.fetch }, events)
    const sid = `session-none-${events.length}`
    await spoofedHello(route(), sid)
    const answer = await engineApply(route(), sid)
    assert.equal(answer.status, 409)
    assert.equal(answer.body.code, 'NO_VIEWER')
    assert.deepEqual(door.calls, [], 'no request leaves without a configured Tracy origin')
  }
})

test('content.renderedWords from the engine goes out under the actor of the person who typed; a viewer alone sends a cookie the door refuses', async () => {
  for (const events of [typed, []]) {
    const door = recorder()
    const route = boot({ origin: 'http://tracy-web:8080', fetch: door.fetch }, events)
    const sid = `session-rw-${events.length}`
    await spoofedHello(route(), sid)
    const answer = await call(
      route(),
      '/api/tracy-site-tools/apply',
      {},
      {
        sessionId: sid,
        siteKey: 'site1.tracy.test',
        action: 'content.renderedWords',
        params: { operation: 'inspect', path: '/contact-us/', targets: [{ kind: 'text', old: 'x' }] }
      }
    )
    assert.equal(answer.status, 200)
    const [sent] = door.calls.filter((c) => c.url.includes('/apply'))
    assert.equal(sent.url, 'http://tracy-web:8080/api/sites/site1.tracy.test/apply')
    if (events.length > 0) {
      assert.equal(sent.headers['x-tracy-actor'], 'signed:bee@team.test')
      assert.equal(sent.headers.cookie, undefined)
    } else {
      // tracy-web answers this one ACTION_AGENT_ONLY; the engine then keeps the words (rendered-words.mjs).
      assert.equal(sent.headers['x-tracy-actor'], undefined)
      assert.equal(sent.headers.cookie, 'tracy_sess=abc')
    }
  }
})
