import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { seatPlanRoutes } from '../src/seat-plan/route.js'
import { csrfGuard } from '../src/lib/csrf.js'
import { mintSession } from '../src/lib/session.js'
const config = { sessionSecret: 's'.repeat(32), actorSecret: 'a'.repeat(32), origin: 'https://cowork.test' }
const app = new Hono()
app.use('*', csrfGuard({ config }))
app.route(
  '/',
  seatPlanRoutes({
    config,
    broker: {
      account: async (email) => ({ id: email }),
      status: async (id) => ({ account: id, connections: [] }),
      saveRouting: async () => ({ saved: true })
    }
  })
)
test('subscription management requires its cookie; actor execution does not accept a session cookie as an actor', async () => {
  assert.equal((await app.request('https://cowork.test/api/seat-plan/status')).status, 401)
  const cookie = `tracy_sess=${await mintSession('one@test.example', config.sessionSecret)}`
  const read = await app.request('https://cowork.test/api/seat-plan/status', { headers: { cookie } })
  assert.equal(read.status, 200)
  assert.equal((await read.json()).account, 'one@test.example')
  const actor = await mintSession('one@test.example', config.actorSecret)
  const wrong = await app.request('https://cowork.test/internal/seat-plan/pin', {
    method: 'POST',
    headers: { 'x-tracy-actor': actor, 'content-type': 'application/json' },
    body: '{}'
  })
  assert.equal(wrong.status, 401)
})
test('sibling site cannot change account routing with the viewer cookie', async () => {
  const cookie = `tracy_sess=${await mintSession('one@test.example', config.sessionSecret)}`
  const request = (origin) =>
    app.request('https://cowork.test/api/seat-plan/routing', {
      method: 'PUT',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{}'
    })
  assert.equal((await request('https://customer.test')).status, 403)
  assert.equal((await request(config.origin)).status, 200)
})

test("the host's pin and run doors refuse in the account's language, not the default", async () => {
  const { createHmac } = await import('node:crypto')
  const { PlanFailure } = await import('../src/seat-plan/broker.js')
  const actor = (email) => {
    const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
      'base64url'
    )
    return `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
  }
  const vi = new Hono()
  vi.route(
    '/',
    seatPlanRoutes({
      config,
      broker: {
        account: async (email) => ({ id: email, language: 'vi' }),
        pin: async () => {
          throw new PlanFailure('noAccess', 403)
        }
      }
    })
  )
  // The host's dsh sends no Accept-Language: before, every refusal came back in English.
  const call = (path, body) =>
    vi.request(`https://cowork.test/internal/seat-plan/${path}`, {
      method: 'POST',
      headers: { 'x-tracy-actor': actor('one@test.example'), 'content-type': 'application/json' },
      body
    })
  const { translator } = await import('../src/lib/i18n/index.js')
  const pin = await call('pin', JSON.stringify({ sessionId: 's1' }))
  assert.equal(pin.status, 403)
  const pinBody = await pin.json()
  assert.equal(pinBody.code, 'noAccess')
  assert.equal(pinBody.message, translator('vi')('subscription.noAccess'))
  assert.notEqual(pinBody.message, translator('en')('subscription.noAccess'))
  const run = await call('run', '{}')
  assert.equal(run.status, 400)
  assert.equal((await run.json()).message, translator('vi')('subscription.invalid'))
})

test('a pasted API key connects through its own door, and each refusal keeps its status', async () => {
  const { PlanFailure } = await import('../src/seat-plan/broker.js')
  const seen = []
  const keyed = new Hono()
  keyed.use('*', csrfGuard({ config }))
  keyed.route(
    '/',
    seatPlanRoutes({
      config,
      broker: {
        account: async (email) => ({ id: email }),
        connectKey: async (id, provider, key) => {
          seen.push([id, provider, key])
          const refused = { 'bad-key': ['key', 401], 'no-plan': ['plan', 403], down: ['vendor', 502] }[key]
          if (refused) throw new PlanFailure(...refused)
          if (key === '') throw new PlanFailure('invalid', 400)
          return { account: id, connections: [{ provider, account: 'API key …1234' }] }
        }
      }
    })
  )
  const cookie = `tracy_sess=${await mintSession('one@test.example', config.sessionSecret)}`
  const send = (body, headers = { cookie, origin: config.origin }) =>
    keyed.request('https://cowork.test/api/seat-plan/connect/key', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  const ok = await send({ provider: 'glm', key: 'good-1234' })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await ok.json()).connections, [{ provider: 'glm', account: 'API key …1234' }])
  assert.deepEqual(seen[0], ['one@test.example', 'glm', 'good-1234'])
  for (const [key, status, code] of [
    ['bad-key', 401, 'key'],
    ['no-plan', 403, 'plan'],
    ['down', 502, 'vendor'],
    ['', 400, 'invalid']
  ]) {
    const res = await send({ provider: 'glm', key })
    assert.equal(res.status, status, key)
    const body = await res.json()
    assert.equal(body.code, code)
    assert.equal(typeof body.message, 'string')
    assert.ok(!JSON.stringify(body).includes(key) || key === '', 'the key is never echoed')
  }
  assert.equal((await send('not json')).status, 400)
  // Same guards as the other management doors: the viewer cookie, from Tracy's own origin.
  assert.equal((await send({ provider: 'glm', key: 'good-1234' }, { origin: config.origin })).status, 401)
  assert.equal(
    (await send({ provider: 'glm', key: 'good-1234' }, { cookie, origin: 'https://customer.test' })).status,
    403
  )
  assert.equal(seen.length, 5)
})

test('PUT routing hands the body to the broker as sent: a tracyFallback field is its to ignore, not a refusal', async () => {
  const seen = []
  const routed = new Hono()
  routed.use('*', csrfGuard({ config }))
  routed.route(
    '/',
    seatPlanRoutes({
      config,
      broker: {
        account: async (email) => ({ id: email }),
        saveRouting: async (id, input) => {
          seen.push([id, input])
          return { routing: { enabled: input.enabled, connectionOrder: input.connectionOrder, version: 1 } }
        }
      }
    })
  )
  const cookie = `tracy_sess=${await mintSession('one@test.example', config.sessionSecret)}`
  const body = { enabled: true, connectionOrder: ['tracy'], expectedVersion: 0, tracyFallback: false }
  const res = await routed.request('https://cowork.test/api/seat-plan/routing', {
    method: 'PUT',
    headers: { cookie, origin: config.origin, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).routing, { enabled: true, connectionOrder: ['tracy'], version: 1 })
  assert.deepEqual(seen, [['one@test.example', body]])
})

test('connect/start hands the broker the surface the person signs in from; anything else is the web', async () => {
  const started = []
  const surfaces = new Hono()
  surfaces.use('*', csrfGuard({ config }))
  surfaces.route(
    '/',
    seatPlanRoutes({
      config,
      broker: {
        account: async (email) => ({ id: email }),
        start: async (...args) => {
          started.push(args.slice(2))
          return { attemptId: 'a', signIn: 'device' }
        }
      }
    })
  )
  const cookie = `tracy_sess=${await mintSession('one@test.example', config.sessionSecret)}`
  for (const body of [
    { provider: 'codex', surface: 'desktop' },
    { provider: 'codex', surface: 'web' },
    { provider: 'codex' },
    { provider: 'codex', surface: 'DESKTOP' },
    { provider: 'codex', surface: 42 }
  ]) {
    const res = await surfaces.request('https://cowork.test/api/seat-plan/connect/start', {
      method: 'POST',
      headers: { cookie, origin: config.origin, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    assert.equal(res.status, 200)
  }
  assert.deepEqual(started, [
    ['codex', 'desktop'],
    ['codex', 'web'],
    ['codex', 'web'],
    ['codex', 'web'],
    ['codex', 'web']
  ])
})

// ---- the run door's size and picture limits (12/10/2026) -------------------------------------------
test('the run door counts its 16 MiB in UTF-8 bytes and limits pictures per request', async () => {
  const { createHmac } = await import('node:crypto')
  const payload = Buffer.from(
    JSON.stringify({ email: 'one@test.example', exp: Math.floor(Date.now() / 1000) + 60 })
  ).toString('base64url')
  const actor = `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
  const ran = []
  const door = new Hono()
  door.route(
    '/',
    seatPlanRoutes({
      config,
      broker: {
        account: async (email) => ({ id: email }),
        async *run(_id, _site, sessionId) {
          ran.push(sessionId)
          yield { chunk: { type: 'finish', reason: { kind: 'stop' } } }
        }
      }
    })
  )
  const send = (body) =>
    door.request('https://cowork.test/internal/seat-plan/run', {
      method: 'POST',
      headers: { 'x-tracy-actor': actor, 'content-type': 'application/json' },
      body
    })
  const picture = (data = 'iVBORw0KGgo=') => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data }
  })
  const turn = (sessionId, userContent, toolContent = [{ type: 'text', text: 'ok' }]) =>
    JSON.stringify({
      sessionId,
      request: {
        messages: [
          { role: 'user', content: userContent },
          { role: 'tool', toolCallId: 'c1', content: toolContent }
        ]
      }
    })
  const refused = async (res, status, reason) => {
    assert.equal(res.status, status)
    const body = await res.json()
    assert.equal(body.code, 'invalid')
    assert.equal(body.reason, reason)
  }

  // 6 Mi characters of '€' are 6 Mi UTF-16 units but 18 MiB of UTF-8 on the wire.
  const wide = JSON.stringify({
    sessionId: 'wide',
    request: { messages: [{ role: 'user', content: '€'.repeat(6 * 1024 * 1024) }] }
  })
  assert.ok(wide.length < 16 * 1024 * 1024)
  assert.equal((await send(wide)).status, 413)

  // Twenty pictures across the user and the tool message pass; twenty-one do not.
  const ten = Array.from({ length: 10 }, () => picture())
  assert.equal((await send(turn('twenty', ten, ten))).status, 200)
  await refused(await send(turn('twenty-one', [...ten, picture()], ten)), 413, 'images')
  // A tool result inside a user message counts too.
  const nested = [{ type: 'tool-result', toolCallId: 'c2', content: [picture()] }]
  await refused(await send(turn('nested', [...ten, ...nested], ten)), 413, 'images')
  // A reference carries no bytes and is not counted (an old host sends every past picture that way).
  const ref = { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } }
  assert.equal(
    (
      await send(
        turn(
          'refs',
          Array.from({ length: 30 }, () => ref)
        )
      )
    ).status,
    200
  )

  // Base64 over 12 MiB in total, though each picture alone is small enough.
  const seven = 'A'.repeat(7 * 1024 * 1024)
  await refused(await send(turn('heavy', [picture(seven)], [picture(seven)])), 413, 'images')

  // Only inline pictures: an outside URL is refused, whatever its shape.
  for (const outside of [
    { type: 'image_url', image_url: { url: 'https://evil.example/a.png' } },
    { type: 'image', source: { type: 'url', url: 'http://evil.example/a.png' } },
    'https://evil.example/a.png'
  ])
    await refused(await send(turn('outside', [outside])), 400, 'images')

  assert.deepEqual(ran, ['twenty', 'refs'])
})
