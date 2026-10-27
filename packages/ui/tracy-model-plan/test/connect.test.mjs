/**
 * The connect flow on its own (`src/client/connect.ts`, exported as `@tracy/dsh-model-plan/connect`):
 * one vendor's sign-in from `connect/start` to a connected status, without React. Settings › AI
 * accounts and the desktop first-run screen (`@tracy/dsh-onboard`) both drive it.
 *
 *   node --test packages/ui/tracy-model-plan/test/connect.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-model-plan-connect-'))
  const outfile = path.join(outDir, 'connect.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'connect.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const STATUS = {
  next: { connectionId: 'k1', name: 'Claude' },
  enabled: true,
  providers: [{ id: 'claude', name: 'Claude' }],
  connections: [
    { connectionId: 'k1', provider: 'claude', name: 'Claude', account: 'lee@example.com', connected: true }
  ],
  routing: { enabled: true, connectionOrder: ['tracy'], version: 0 }
}
const BROWSER = {
  attemptId: 'a1',
  signIn: 'browser',
  authorizeUrl: 'https://claude.ai/oauth?x=1',
  state: 'st-b'
}
const DEVICE = {
  attemptId: 'a2',
  signIn: 'device',
  authorizeUrl: 'https://github.com/login/device',
  userCode: 'WDJB-MJHT',
  intervalMs: 5000,
  state: 'st-d'
}

/** A fake `call`: answers per door, in order, and records each request. */
function fakeCall(answers) {
  const requests = []
  const call = async (door, method = 'GET', body) => {
    requests.push({ door, method, body })
    const queue = answers[door]
    const answer = Array.isArray(queue) ? queue.shift() : queue
    if (answer instanceof Error) throw answer
    return answer
  }
  return { call, requests }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
async function settle() {
  for (let i = 0; i < 6; i += 1) await tick()
}

/** @type {any[]} */
let states = []
/** @type {string[]} */
let opened = []
beforeEach(() => {
  states = []
  opened = []
})
const kinds = () => states.map((s) => s.kind)

test('a browser sign-in: the vendor page opens, the pasted callback URL finishes it with the status', async () => {
  const { call, requests } = fakeCall({ 'connect/start': BROWSER, 'connect/complete': STATUS })
  const session = lib.startConnect('claude', {
    call,
    onState: (s) => states.push(s),
    openBrowser: (u) => opened.push(u)
  })
  await settle()
  assert.deepEqual(requests[0], {
    door: 'connect/start',
    method: 'POST',
    body: { provider: 'claude', surface: 'web' }
  })
  assert.deepEqual(opened, [BROWSER.authorizeUrl])
  assert.equal(states.at(-1).kind, 'browser')
  assert.equal(states.at(-1).authorizeUrl, BROWSER.authorizeUrl)
  session.submit('https://callback.example/?code=1&state=st-b')
  await settle()
  assert.deepEqual(requests[1].body, { attemptId: 'a1', url: 'https://callback.example/?code=1&state=st-b' })
  assert.deepEqual(kinds(), ['starting', 'browser', 'completing', 'connected'])
  assert.deepEqual(states.at(-1).status, STATUS)
})

test('a browser sign-in finishes by itself when the app hands back the callback with the same state', async () => {
  const events = new EventTarget()
  const { call, requests } = fakeCall({ 'connect/start': BROWSER, 'connect/complete': STATUS })
  lib.startConnect('claude', { call, onState: (s) => states.push(s), events })
  await settle()
  const back = (url) =>
    events.dispatchEvent(Object.assign(new Event('tracy-subscription-callback'), { detail: { url } }))
  back('https://callback.example/?code=1&state=someone-else')
  await settle()
  assert.equal(requests.length, 1, 'a callback for another attempt is ignored')
  back('https://callback.example/?code=1&state=st-b')
  await settle()
  assert.equal(states.at(-1).kind, 'connected')
})

test('a device sign-in shows the code, polls until confirmed, then answers the status', async () => {
  const waits = []
  const { call, requests } = fakeCall({
    'connect/start': DEVICE,
    'connect/complete': [{ pending: true }, STATUS]
  })
  lib.startConnect('copilot', {
    call,
    onState: (s) => states.push(s),
    openBrowser: (u) => opened.push(u),
    sleep: async (ms) => void waits.push(ms)
  })
  await settle()
  assert.equal(states[1].kind, 'device')
  assert.equal(states[1].attempt.userCode, 'WDJB-MJHT')
  assert.deepEqual(opened, [], 'a device page opens only when the person asks')
  assert.deepEqual(
    requests.filter((r) => r.door === 'connect/complete').map((r) => r.body),
    [
      { attemptId: 'a2', state: 'st-d' },
      { attemptId: 'a2', state: 'st-d' }
    ]
  )
  assert.deepEqual(waits, [5000, 5000])
  assert.equal(states.at(-1).kind, 'connected')
})

test('the start says which surface signs in: the desktop app when the page runs in it, else the web', async () => {
  const { call, requests } = fakeCall({ 'connect/start': [DEVICE, BROWSER] })
  const session = lib.startConnect('codex', {
    call,
    onState: (s) => states.push(s),
    sleep: () => new Promise(() => {})
  })
  await settle()
  session.cancel()
  globalThis.window = { tracyDesktop: { links: {} } }
  try {
    lib.startConnect('codex', { call, onState: (s) => states.push(s) }).cancel()
    await settle()
  } finally {
    delete globalThis.window
  }
  assert.deepEqual(
    requests.map((r) => r.body),
    [
      { provider: 'codex', surface: 'web' },
      { provider: 'codex', surface: 'desktop' }
    ]
  )
})

test("a Codex device sign-in shows OpenAI's page and the code the broker sent, nothing of GitHub", async () => {
  const CODEX = {
    attemptId: 'a3',
    signIn: 'device',
    authorizeUrl: 'https://auth.openai.com/codex/device',
    userCode: 'WXYZ-9876',
    intervalMs: 5000,
    state: 'st-c'
  }
  const { call } = fakeCall({ 'connect/start': CODEX })
  const session = lib.startConnect('codex', {
    call,
    onState: (s) => states.push(s),
    sleep: () => new Promise(() => {})
  })
  await settle()
  session.cancel()
  assert.deepEqual(states[1], {
    kind: 'device',
    provider: 'codex',
    attempt: {
      provider: 'codex',
      attemptId: 'a3',
      state: 'st-c',
      userCode: 'WXYZ-9876',
      authorizeUrl: 'https://auth.openai.com/codex/device',
      intervalMs: 5000
    }
  })
})

test('a refused start fails with the server message; a timeout fails as timeout', async () => {
  const { call } = fakeCall({ 'connect/start': new Error('Claude is turned off') })
  lib.startConnect('claude', { call, onState: (s) => states.push(s) })
  await settle()
  assert.deepEqual(states.at(-1), {
    kind: 'failed',
    provider: 'claude',
    reason: 'refused',
    message: 'Claude is turned off'
  })

  states = []
  let now = 0
  const slow = fakeCall({ 'connect/start': DEVICE, 'connect/complete': () => ({ pending: true }) })
  const pendingForever = async (door, method, body) => {
    if (door === 'connect/complete') return { pending: true }
    return slow.call(door, method, body)
  }
  lib.startConnect('copilot', {
    call: pendingForever,
    onState: (s) => states.push(s),
    sleep: async () => void (now += 60_000),
    now: () => now
  })
  await settle()
  for (let i = 0; i < 30 && states.at(-1).kind !== 'failed'; i += 1) await settle()
  assert.equal(states.at(-1).kind, 'failed')
  assert.equal(states.at(-1).reason, 'timeout')
})

test('cancel stops polling and nothing more is reported', async () => {
  let release
  const { call, requests } = fakeCall({ 'connect/start': DEVICE, 'connect/complete': STATUS })
  const session = lib.startConnect('copilot', {
    call,
    onState: (s) => states.push(s),
    sleep: () => new Promise((resolve) => (release = resolve))
  })
  await settle()
  session.cancel()
  release()
  await settle()
  assert.deepEqual(kinds(), ['starting', 'device'])
  assert.equal(requests.filter((r) => r.door === 'connect/complete').length, 0)
})

test('a wrong pasted URL fails that attempt with the server message', async () => {
  const { call } = fakeCall({
    'connect/start': BROWSER,
    'connect/complete': new Error('That URL is not the callback')
  })
  const session = lib.startConnect('claude', { call, onState: (s) => states.push(s) })
  await settle()
  session.submit('nonsense')
  await settle()
  assert.deepEqual(states.at(-1), {
    kind: 'failed',
    provider: 'claude',
    reason: 'refused',
    message: 'That URL is not the callback'
  })
})

/** A fetch answer as the page sees one: a status, a content type, a body read as text. */
function reply(status, body, type = 'application/json; charset=utf-8') {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': type }),
    text: async () => text,
    json: async () => JSON.parse(text)
  }
}

const PROXY_502 =
  '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>Bad Gateway</body></html>'

test('seatPlanApi: JSON in and out under /api/seat-plan/, a refusal throws its message', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url, init })
    return url.endsWith('bad') ? reply(400, { message: 'no' }) : reply(200, { fine: true })
  }
  const call = lib.seatPlanApi(fetchFn)
  assert.deepEqual(await call('connect/start', 'POST', { provider: 'claude' }), { fine: true })
  assert.equal(seen[0].url, '/api/seat-plan/connect/start')
  assert.equal(seen[0].init.method, 'POST')
  assert.equal(seen[0].init.credentials, 'same-origin')
  assert.equal(seen[0].init.body, '{"provider":"claude"}')
  await assert.rejects(call('bad'), /no/)
})

test("publishStatus hands a status to the page's copy, which the account menu's row follows", () => {
  lib.publishStatus(STATUS)
  assert.equal(lib.pageAccountStatus().current(), STATUS)
})

test('seatPlanApi: an HTML error page from the proxy (502) is a TransientError, never a JSON parse error', async () => {
  const call = lib.seatPlanApi(async () => reply(502, PROXY_502, 'text/html'))
  const error = await call('connect/complete', 'POST', { attemptId: 'a', state: 's' }).catch((e) => e)
  assert.ok(
    error instanceof lib.TransientError,
    `expected TransientError, got ${error?.name}: ${error?.message}`
  )
  assert.equal(error.transient, true)
  assert.doesNotMatch(String(error.message), /Unexpected token|JSON/)
})

test('seatPlanApi: a 503/504 with a JSON body, an HTML body with 200, and a network failure are all transient', async () => {
  for (const answer of [
    reply(503, { message: 'restarting' }),
    reply(504, { message: 'gateway timeout' }),
    reply(200, PROXY_502, 'text/html')
  ]) {
    const error = await lib
      .seatPlanApi(async () => answer)('status')
      .catch((e) => e)
    assert.ok(error instanceof lib.TransientError, `status ${answer.status}`)
  }
  const offline = lib.seatPlanApi(async () => {
    throw new TypeError('Failed to fetch')
  })
  const error = await offline('status').catch((e) => e)
  assert.ok(error instanceof lib.TransientError)
  assert.equal(error.code, 'network')
})

test('seatPlanApi: a 400 with a JSON message keeps that message and is not transient', async () => {
  const error = await lib
    .seatPlanApi(async () => reply(400, { message: 'Codex is turned off' }))('connect/start')
    .catch((e) => e)
  assert.equal(error.message, 'Codex is turned off')
  assert.equal(error instanceof lib.TransientError, false)
})

test('seatPlanApi: a 200 JSON answer is the data, whatever the content type spells', async () => {
  assert.deepEqual(await lib.seatPlanApi(async () => reply(200, { pending: true }))('x'), { pending: true })
  assert.deepEqual(await lib.seatPlanApi(async () => reply(200, { ok: 1 }, 'text/plain'))('x'), { ok: 1 })
})

test('a start the server never answered (proxy page, network) fails as transient, not as the parse error', async () => {
  const call = lib.seatPlanApi(async () => reply(502, PROXY_502, 'text/html'))
  lib.startConnect('codex', { call, onState: (s) => states.push(s) })
  await settle()
  assert.deepEqual(states.at(-1), { kind: 'failed', provider: 'codex', reason: 'transient', message: '' })
})

test('a device sign-in keeps its code while the server restarts: retrying while polls fail, cleared at the next answer', async () => {
  const { call } = fakeCall({
    'connect/start': DEVICE,
    'connect/complete': [new lib.TransientError('unavailable'), { pending: true }, STATUS]
  })
  lib.startConnect('copilot', { call, onState: (s) => states.push(s), sleep: async () => {} })
  for (let i = 0; i < 4; i += 1) await settle()
  assert.deepEqual(kinds(), ['starting', 'device', 'device', 'device', 'connected'])
  assert.equal(states[1].retrying, undefined)
  assert.equal(states[2].retrying, true)
  assert.equal(states[2].attempt.userCode, 'WDJB-MJHT')
  assert.equal(states[3].retrying, undefined)
})
