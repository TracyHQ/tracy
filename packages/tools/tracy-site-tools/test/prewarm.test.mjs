/**
 * The pre-warm of the SHIPPED bundle (`lib/index.js`, #7 of the v6 plan): at `agent/created` on a
 * Joomla, WordPress or EmDash site, the relay's describe probe and the home page's locate index are
 * asked once, not awaited, as the person the session acts as — so the agent's own first
 * `content.read {describe}` and a first pick find them warm.
 *
 * 🔒 WHAT IT MUST NEVER DO, EACH HELD BELOW: hold agent creation up (a warm still on the wire when
 * the listener has returned), ask more than once per site in five minutes, act as nobody or as
 * another session's viewer (no viewer → nothing asked until that session's hello), carry the
 * session header (a warm is not the conversation arriving: no presence, no lease), or throw.
 *
 *   node --test packages/tools/tracy-site-tools/test/prewarm.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { apply } from '../lib/index.js'

const ORIGIN = 'http://tracy.test'

/** A fetch that records each Apply call and answers it only when the test says so. */
function door(answer = () => Response.json({ ok: true })) {
  const calls = []
  const fetch = (url, init) =>
    new Promise((resolve, reject) => {
      calls.push({
        url: String(url),
        init,
        body: JSON.parse(init.body),
        answer: () => answer(resolve, reject)
      })
    })
  const settle = async () => {
    for (const call of calls.splice(0)) call.answer()
    await new Promise((resolve) => setImmediate(resolve))
  }
  return { calls, fetch, settle }
}

/** The plugin on a HostContext that keeps its web route, listeners and log lines. */
function boot(fetch, extra = {}) {
  const listeners = new Map()
  const warnings = []
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
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) => (name === 'logger' ? { warn: (line) => warnings.push(line) } : undefined)
  }
  apply(ctx, {
    fetch,
    origin: ORIGIN,
    emdash: { cms: async () => assert.fail('agent creation must not ask docker') },
    ...extra
  })
  return { listeners, warnings, route: () => route }
}

/** The site container answering one MCP read, as `mcp-exec` writes it; tests never reach docker. */
const mcpAnswered = async () => ({
  code: 0,
  stdout: `TRACY_MCP 200\n${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"items":[]}' }] } })}`,
  stderr: '',
  timedOut: false
})

/** A sites root with one site whose record names its platform. */
function site(platform, label = 'site1') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-prewarm-'))
  const folder = path.join(root, label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  if (platform !== null)
    writeFileSync(
      path.join(folder, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `${label}.tracy.test`, platform })
    )
  process.env.TRACY_SITES_ROOT = root
  return folder
}

// Session ids are unique per test: the viewer book (`bySession`) belongs to the module, not to one boot.
const agentAt = (cwd, id) => ({
  session: { id, header: { cwd } },
  ctx: { tools: { restrict: () => () => {}, register: () => () => {} } }
})

async function created(listeners, agent) {
  for (const fn of listeners.get('agent/created') ?? []) await fn({ agent, source: 'startup' })
}

/** The browser of one session saying hello, as the Browser tab does when it opens. */
async function hello(route, sessionId) {
  const req = new PassThrough()
  req.method = 'POST'
  req.url = '/api/tracy-site-tools/hello'
  req.headers = { cookie: 'tracy_sess=abc', host: 'tracy.test' }
  req.socket = { remoteAddress: '10.0.0.9' }
  const done = new Promise((resolve) => {
    route.handler(req, { writeHead: () => {}, end: (text) => resolve(JSON.parse(text)) })
  })
  req.end(JSON.stringify({ sessionId }))
  return done
}

test.beforeEach(() => {
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})
test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test('a WordPress agent warms describe and the home locate once, without waiting, as its own viewer', async () => {
  const cwd = site('wordpress')
  const { calls, fetch, settle } = door()
  const { listeners, warnings, route } = boot(fetch)
  assert.deepEqual(await hello(route(), 'session-w1'), { ok: true, seen: true, bound: true })
  await created(listeners, agentAt(cwd, 'session-w1'))
  // The listener has returned; both reads are still on the wire.
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.url, `${ORIGIN}/api/sites/_conversation/apply`)
    assert.equal(call.init.headers.cookie, 'tracy_sess=abc')
    assert.equal(call.init.headers['x-tracy-workspace-label'], 'site1')
    assert.equal(call.init.headers['x-tracy-session'], undefined, 'a warm is not the conversation arriving')
  }
  assert.deepEqual(
    calls.map((call) => call.body),
    [
      { action: 'content.read', params: { describe: true } },
      { action: 'content.locate', params: { url: '/', warm: true } }
    ]
  )
  await settle()
  // Another agent on the same site within five minutes asks nothing.
  await hello(route(), 'session-w2')
  await created(listeners, agentAt(cwd, 'session-w2'))
  assert.equal(calls.length, 0)
  assert.deepEqual(warnings, [])
})

test('an agent whose browser has not said hello waits for that hello, and never acts as another session', async () => {
  const cwd = site('joomla')
  const { calls, fetch, settle } = door()
  const { listeners, route } = boot(fetch)
  // Somebody else's session is open on this host dsh: never a stand-in for this one.
  await hello(route(), 'session-j0')
  await created(listeners, agentAt(cwd, 'session-j1'))
  assert.equal(calls.length, 0)
  await hello(route(), 'session-j1')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].init.headers['x-tracy-workspace-label'], 'site1')
  await settle()
  // Said once: a second hello of the same session asks nothing more.
  await hello(route(), 'session-j1')
  assert.equal(calls.length, 0)
})

test('a warm that fails is one log line, never an error, and a site of no known CMS is not warmed', async () => {
  const cwd = site('emdash')
  const { calls, fetch, settle } = door((resolve, reject) =>
    calls.length === 0 ? reject(new Error('connection refused')) : resolve(Response.json({ ok: true }))
  )
  const { listeners, warnings, route } = boot(fetch, { exec: mcpAnswered })
  await hello(route(), 'session-e1')
  await created(listeners, agentAt(cwd, 'session-e1'))
  assert.equal(calls.length, 2)
  await settle()
  assert.equal(warnings.length, 1)
  assert.match(
    warnings[0],
    /^\[site-tools\] pre-warm on site1 did not finish: content\.read .*content\.locate/
  )

  const unknown = site(null, 'site2')
  const again = door()
  const other = boot(again.fetch)
  await hello(other.route(), 'session-e2')
  await created(other.listeners, agentAt(unknown, 'session-e2'))
  assert.equal(again.calls.length, 0)
})

test('a refusal the door answers (no reader on an EmDash site) is logged by its code', async () => {
  const cwd = site('emdash')
  const { calls, fetch, settle } = door((resolve) =>
    resolve(
      Response.json({ error: { code: 'CONTENT_ADAPTER_UNSUPPORTED', message: 'no reader' } }, { status: 501 })
    )
  )
  const { listeners, warnings, route } = boot(fetch, { exec: mcpAnswered })
  await hello(route(), 'session-e3')
  await created(listeners, agentAt(cwd, 'session-e3'))
  assert.equal(calls.length, 2)
  await settle()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(warnings.length, 1)
  assert.match(
    warnings[0],
    /content\.read CONTENT_ADAPTER_UNSUPPORTED; content\.locate CONTENT_ADAPTER_UNSUPPORTED/
  )
})

test("an EmDash agent also warms the site's MCP road with one read that needs no argument; other CMSes never exec", async () => {
  // 16/10/2026: the agent's EmDash reads go through the site's MCP server in its container, whose first
  // call after a start paid 20–40 s; the two door reads above do not touch that road.
  const execs = []
  const exec = async (input) => {
    execs.push(input)
    return { code: 0, stdout: '', stderr: '', timedOut: false }
  }
  const cwd = site('emdash')
  const { calls, fetch, settle } = door()
  const { listeners, warnings, route } = boot(fetch, { exec })
  await hello(route(), 'session-e1')
  await created(listeners, agentAt(cwd, 'session-e1'))
  assert.equal(calls.length, 2, 'the two door reads as before')
  await settle()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(execs.length, 1)
  const request = JSON.parse(execs[0].stdin)
  assert.equal(request.method, 'tools/call')
  assert.deepEqual(request.params, { name: 'schema_list_collections', arguments: {} })
  // an answer the warm cannot read is one log line of its own, never an error
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /pre-warm of the MCP road on site1 did not finish: emdash /)

  const wpExecs = []
  const wpCwd = site('wordpress', 'site2')
  const wp = door()
  const wpBoot = boot(wp.fetch, {
    exec: async (input) => (wpExecs.push(input), { code: 0, stdout: '', stderr: '' })
  })
  await hello(wpBoot.route(), 'session-e2')
  await created(wpBoot.listeners, agentAt(wpCwd, 'session-e2'))
  await wp.settle()
  assert.equal(wpExecs.length, 0)

  const joExecs = []
  const joCwd = site('joomla', 'site3')
  const jo = door()
  const joBoot = boot(jo.fetch, {
    exec: async (input) => (joExecs.push(input), { code: 0, stdout: '', stderr: '' })
  })
  await hello(joBoot.route(), 'session-e4')
  await created(joBoot.listeners, agentAt(joCwd, 'session-e4'))
  await jo.settle()
  assert.equal(joExecs.length, 0, 'a Joomla agent warms through the door only')
})

// The stand acceptance of 16/10/2026 found every EmDash warm-up refused: it called `content_list` without the
// `collection` EmDash requires. The tool it calls must take no required argument in EmDash's own server.
test('the MCP warm-up calls an EmDash tool whose input needs no argument (read from EmDash itself)', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const server = readFileSync(
    fileURLToPath(
      new URL('../../../../vendor/emdash/emdash/packages/core/src/mcp/server.ts', import.meta.url)
    ),
    'utf8'
  )
  const at = server.indexOf('"schema_list_collections"')
  assert.ok(at > 0, 'EmDash still has schema_list_collections')
  const block = server.slice(at, server.indexOf('registerTool(', at))
  assert.match(block, /inputSchema: z\.object\(\{\}\)/, 'no argument to send')
  assert.match(block, /readOnlyHint: true/, 'a read: warming changes nothing')
})
