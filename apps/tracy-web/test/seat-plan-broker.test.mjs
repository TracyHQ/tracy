import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { fileDb } from './_db.mjs'
import { createSeatPlanBroker } from '../src/seat-plan/broker.js'
import { providers } from '../src/seat-plan/providers.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: !process.env.TEST_DATABASE_URL }
let n = 0
async function setup() {
  const a = randomUUID(),
    b = randomUUID()
  await db.pool.query("insert into account(id,email) values($1,'a@test.example'),($2,'b@test.example')", [
    a,
    b
  ])
  await db.pool.query(
    "insert into site(site_key,label,host) values('x.test','x','test'),('y.test','y','test')"
  )
  await db.pool.query(
    "insert into seat(account_id,site_key,role,accepted_at) values($1,'x.test','editor',now()),($1,'y.test','editor',now()),($2,'x.test','owner',now())",
    [a, b]
  )
  const attempts = []
  const calls = []
  const responses = new Map()
  let code = 'one'
  const wire = Object.fromEntries(
    ['claude', 'codex'].map((id) => [
      id,
      {
        ...providers[id],
        usage: async () => null,
        exchangeCode: async (_cfg, _pkce, asked) => ({ accessToken: asked, expiresAt: Date.now() + 3600000 }),
        async *streamOnce({ blob, options }) {
          attempts.push(options)
          calls.push(blob.accessToken)
          const result = responses.get(blob.accessToken)
          if (result instanceof Error) throw result
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text: 'hello' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
      }
    ])
  )
  const llm = { connect: true, providers: ['claude', 'codex'] }
  const broker = createSeatPlanBroker({
    pool: db.pool,
    kek: Buffer.alloc(32, 1).toString('base64'),
    policy: async () => ({ llm }),
    providers: wire,
    identify: async (_p, blob) => ({ subject: blob.accessToken, label: blob.accessToken })
  })
  // These connections sign in through the browser callback, the desktop app's way for every vendor
  // here (on the web, Codex signs in by a device code instead).
  async function connect(owner = a, provider = 'claude', token = code) {
    const started = await broker.start(owner, 'cookie', provider, 'desktop')
    await broker.complete(owner, 'cookie', { attemptId: started.attemptId, url: `${token}#${started.state}` })
    return (await broker.status(owner)).connections.find((x) => x.account === token).connectionId
  }
  const run = async (owner = a, site = 'x', session = `s${++n}`) =>
    Array.fromAsync(broker.run(owner, site, session, { messages: [] }, new AbortController().signal))
  return { a, b, broker, connect, run, calls, responses, llm, wire, attempts }
}
test(
  'account connections and routing are shared across sites, while another member cannot spend them',
  opts,
  async () => {
    const h = await setup()
    await h.connect()
    await h.run(h.a, 'x', 'a-x')
    await h.run(h.a, 'y', 'a-y')
    assert.deepEqual(h.calls, ['one', 'one'])
    assert.equal((await h.broker.status(h.b)).connections.length, 0)
    await assert.rejects(h.run(h.b, 'x', 'a-x'), { code: 'notOwner' })
    await db.pool.query("update seat set revoked_at=now() where account_id=$1 and site_key='x.test'", [h.a])
    await assert.rejects(h.run(h.a, 'x', 'a-x'), { code: 'noAccess' })
    await h.run(h.a, 'y', 'a-y')
    assert.equal((await h.broker.status(h.a)).connections[0].connected, true)
  }
)
test('two Claude subscriptions count separately and exhaustion follows account order', opts, async () => {
  const h = await setup()
  const first = await h.connect()
  const second = await h.connect(h.a, 'claude', 'two')
  const state = await h.broker.status(h.a)
  assert.equal(state.connections.length, 2)
  await h.broker.saveRouting(h.a, {
    enabled: true,
    connectionOrder: [first, second, 'tracy'],
    expectedVersion: state.routing.version
  })
  h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
  const chunks = await h.run(h.a, 'x', 'route')
  assert.deepEqual(h.calls, ['one', 'two'])
  assert.equal(chunks.find((c) => c.route).route.connectionId, second)
  assert.equal((await h.broker.inspect(h.a, 'x', 'route')).route.connectionId, second)
  await h.broker.disconnect(h.a, first)
  await h.connect(h.a, 'claude', 'one')
  assert.deepEqual((await h.broker.status(h.a)).routing.connectionOrder, [first, second, 'tracy'])
})
test(
  'routing cannot contain another account connection and stale settings cannot overwrite a newer choice',
  opts,
  async () => {
    const h = await setup()
    const a = await h.connect()
    const b = await h.connect(h.b, 'codex', 'other')
    await assert.rejects(
      h.broker.saveRouting(h.a, { enabled: true, connectionOrder: [b, 'tracy'], expectedVersion: 0 }),
      { code: 'invalid' }
    )
    await h.broker.saveRouting(h.a, { enabled: false, connectionOrder: [a, 'tracy'], expectedVersion: 0 })
    await assert.rejects(
      h.broker.saveRouting(h.a, { enabled: true, connectionOrder: [a, 'tracy'], expectedVersion: 0 }),
      { code: 'conflict' }
    )
  }
)
test(
  'with automatic switching off, a failing subscription goes to Tracy AI without spending another one',
  opts,
  async () => {
    const h = await setup()
    const first = await h.connect()
    const second = await h.connect(h.a, 'codex', 'two')
    await h.broker.saveRouting(h.a, {
      enabled: false,
      connectionOrder: [first, second, 'tracy'],
      expectedVersion: 0
    })
    h.responses.set('one', Object.assign(new Error('usage limit reached'), { status: 429 }))
    assert.equal((await h.run()).at(-1).fallback, true)
    assert.deepEqual(h.calls, ['one'])
    await db.pool.query('update seat_plan_connection set cooldown_until=null')
    // A transient 429 is retried once on the same subscription, then Tracy AI answers.
    h.responses.set('one', Object.assign(new Error('too many requests'), { status: 429 }))
    assert.equal((await h.run()).at(-1).fallback, true)
    assert.deepEqual(h.calls, ['one', 'one', 'one'])
    h.responses.set('one', Object.assign(new Error('bad token'), { status: 401 }))
    assert.equal((await h.run()).at(-1).fallback, true)
    assert.equal((await h.broker.status(h.a)).connections[0].connected, false)
    assert.ok(!h.calls.includes('two'))
  }
)
test(
  'operator disabling a provider or all subscriptions blocks existing conversations without deleting connections',
  opts,
  async () => {
    const h = await setup()
    await h.connect()
    await h.run(h.a, 'x', 'existing')
    h.llm.connect = false
    await assert.rejects(h.run(h.a, 'x', 'existing'), { code: 'disabled' })
    assert.equal((await h.broker.status(h.a)).connections[0].connected, true)
    h.llm.connect = true
    h.llm.providers = ['codex']
    await assert.rejects(h.run(h.a, 'x', 'existing'), { code: 'disabled' })
  }
)
test(
  'OAuth completion is bound to the account, browser and state and may only be claimed once',
  opts,
  async () => {
    const h = await setup()
    const started = await h.broker.start(h.a, 'cookie', 'claude')
    const input = { attemptId: started.attemptId, url: `one#${started.state}` }
    await assert.rejects(h.broker.complete(h.b, 'cookie', input), { code: 'expired' })
    await assert.rejects(h.broker.complete(h.a, 'other-cookie', input), { code: 'expired' })
    await assert.rejects(h.broker.complete(h.a, 'cookie', { ...input, url: 'one#wrong' }), {
      code: 'expired'
    })
    await h.broker.complete(h.a, 'cookie', input)
    await assert.rejects(h.broker.complete(h.a, 'cookie', input), { code: 'expired' })
  }
)

test('disconnect during OAuth exchange cannot resurrect a connection', opts, async () => {
  const h = await setup()
  const id = await h.connect()
  const started = await h.broker.start(h.a, 'cookie', 'claude')
  let release, entered
  const waiting = new Promise((r) => {
    entered = r
  })
  h.wire.claude.exchangeCode = async () => {
    entered()
    await new Promise((r) => {
      release = r
    })
    return { accessToken: 'one' }
  }
  const completing = h.broker.complete(h.a, 'cookie', {
    attemptId: started.attemptId,
    url: `one#${started.state}`
  })
  const rejected = assert.rejects(completing, { code: 'expired' })
  await waiting
  await h.broker.disconnect(h.a, id)
  release()
  await rejected
  assert.equal((await h.broker.status(h.a)).connections[0].connected, false)
})
test(
  'simultaneous calls refresh one credential once, and disconnect wins over an in-flight refresh',
  opts,
  async () => {
    const h = await setup()
    h.wire.claude.exchangeCode = async () => ({ accessToken: 'one', refreshToken: 'refresh', expiresAt: 1 })
    const id = await h.connect()
    let refreshes = 0
    h.wire.claude.refresh = async () => {
      refreshes++
      return { accessToken: 'fresh', expiresAt: Date.now() + 3600000 }
    }
    await Promise.all([h.run(h.a, 'x', 'parallel-one'), h.run(h.a, 'y', 'parallel-two')])
    assert.equal(refreshes, 1)
    assert.deepEqual(h.calls, ['fresh', 'fresh'])
    await h.connect()
    let release, entered
    const waiting = new Promise((r) => {
      entered = r
    })
    h.wire.claude.refresh = async () => {
      entered()
      await new Promise((r) => {
        release = r
      })
      return { accessToken: 'late', expiresAt: Date.now() + 3600000 }
    }
    const running = h.run(h.a, 'x', 'disconnect-race')
    const completed = running.then((events) => assert.equal(events.at(-1).fallback, true))
    await waiting
    await h.broker.disconnect(h.a, id)
    release()
    await completed
    assert.equal((await h.broker.status(h.a)).connections[0].connected, false)
    assert.ok(!h.calls.includes('late'))
  }
)
test('concurrent child calls converge on one root pin after quota exhaustion', opts, async () => {
  const h = await setup()
  await h.connect()
  const second = await h.connect(h.a, 'codex', 'two')
  h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
  const results = await Promise.all([h.run(h.a, 'x', 'root'), h.run(h.a, 'x', 'root')])
  for (const chunks of results) assert.equal(chunks.find((c) => c.route).route.connectionId, second)
  assert.equal((await h.broker.inspect(h.a, 'x', 'root')).route.version, 2)
})
test('partial output is never replayed onto a different subscription', opts, async () => {
  const h = await setup()
  await h.connect()
  await h.connect(h.a, 'codex', 'two')
  h.wire.claude.streamOnce = async function* () {
    yield { type: 'text-delta', index: 0, text: 'partial' }
    throw Object.assign(new Error('usage_limit_reached'), { status: 429 })
  }
  const seen = []
  await assert.rejects(
    async () => {
      for await (const event of h.broker.run(
        h.a,
        'x',
        'partial',
        { messages: [] },
        new AbortController().signal
      ))
        seen.push(event)
    },
    { code: 'providerError' }
  )
  assert.equal(seen.filter((e) => e.chunk).length, 1)
  assert.ok(!h.calls.includes('two'))
})

test(
  'a confirmed account limit records its real reset even when the provider returns a generic 429',
  opts,
  async () => {
    const h = await setup()
    const first = await h.connect()
    const second = await h.connect(h.a, 'codex', 'two')
    const resetAt = Date.now() + 3600000
    h.wire.claude.usage = async () => ({ windows: [{ id: 'five_hour', usedPercent: 100, resetAt }] })
    h.responses.set('one', Object.assign(new Error('rate limited'), { status: 429 }))
    const result = await h.run()
    assert.equal(result.find((e) => e.route).route.connectionId, second)
    const row = (await db.pool.query('select cooldown_until from seat_plan_connection where id=$1', [first]))
      .rows[0]
    assert.equal(+row.cooldown_until, resetAt)
  }
)

test('model facts follow the actual provider on each attempt after exhaustion', opts, async () => {
  const h = await setup()
  await h.connect()
  await h.connect(h.a, 'codex', 'two')
  h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
  await h.run()
  assert.equal(h.attempts.length, 2)
  assert.match(h.attempts[0].messages.at(-1).content, /Anthropic \(Claude\).*claude-sonnet-5/)
  assert.match(h.attempts[1].messages.at(-1).content, /OpenAI \(ChatGPT Codex\).*gpt-6.1-sol/)
  assert.doesNotMatch(h.attempts[1].messages.at(-1).content, /claude-sonnet-5/)
})

test(
  'Tracy AI is the last entry by default, and a conversation moved to it stays account fenced',
  opts,
  async () => {
    const h = await setup()
    const id = await h.connect()
    assert.deepEqual((await h.broker.status(h.a)).routing.connectionOrder, [id, 'tracy'])
    h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
    const events = await h.run(h.a, 'x', 'fallback')
    assert.equal(events.at(-1).fallback, true)
    assert.equal(events.at(-1).route.provider, 'seat-plan-tracy')
    assert.equal((await h.broker.inspect(h.a, 'x', 'fallback')).route.provider, 'seat-plan-tracy')
    assert.equal((await h.run(h.a, 'x', 'fallback')).at(-1).fallback, true)
    assert.deepEqual(h.calls, ['one'])
    await assert.rejects(h.run(h.b, 'x', 'fallback'), { code: 'notOwner' })
    assert.deepEqual((await h.broker.status(h.b)).routing.connectionOrder, ['tracy'])
  }
)
// (a) Tracy AI ends the walk: an entry after it is not tried in that turn.
test(
  'a subscription after Tracy AI in the order is not tried when the one before it hits its limit',
  opts,
  async () => {
    const h = await setup()
    const c1 = await h.connect()
    const c2 = await h.connect(h.a, 'codex', 'two')
    await h.broker.saveRouting(h.a, { enabled: true, connectionOrder: [c1, 'tracy', c2], expectedVersion: 0 })
    h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
    const events = await h.run(h.a, 'x', 'ends')
    assert.equal(events.at(-1).fallback, true)
    assert.deepEqual(h.calls, ['one'])
    const { route } = await h.broker.inspect(h.a, 'x', 'ends')
    assert.equal(route.provider, 'seat-plan-tracy')
    assert.deepEqual(route.switchedFrom, { vendor: 'Claude', reason: 'limit' })
  }
)
// (b) and (f): Tracy AI first is the configured choice — a pin on Tracy AI with nothing switched
// from, read against the configured order on every turn, so it stays while Tracy AI stays first.
test(
  'Tracy AI first in the order pins the conversation to Tracy AI at once, and it stays there',
  opts,
  async () => {
    const h = await setup()
    const c1 = await h.connect()
    await h.broker.saveRouting(h.a, { enabled: true, connectionOrder: ['tracy', c1], expectedVersion: 0 })
    assert.equal((await h.broker.status(h.a)).next, null)
    const pin = await h.broker.pin(h.a, 'x', 'first')
    assert.equal(pin.provider, 'seat-plan-tracy')
    assert.equal(pin.switchedFrom, null, 'the configured choice, not a fallback')
    assert.deepEqual(await h.broker.pin(h.a, 'x', 'first'), pin, 'the second turn stays on Tracy AI')
    const events = await h.run(h.a, 'x', 'first')
    assert.equal(events.at(-1).fallback, true)
    assert.equal(events.at(-1).route.switchedFrom, null)
    assert.deepEqual(h.calls, [])
  }
)
test(
  'a conversation on Tracy AI by configuration follows the order once a subscription is put first',
  opts,
  async () => {
    const h = await setup()
    const c1 = await h.connect()
    await h.broker.saveRouting(h.a, { enabled: true, connectionOrder: ['tracy', c1], expectedVersion: 0 })
    assert.equal((await h.broker.pin(h.a, 'x', 'follows')).provider, 'seat-plan-tracy')
    await h.broker.saveRouting(h.a, { enabled: true, connectionOrder: [c1, 'tracy'], expectedVersion: 1 })
    const pin = await h.broker.pin(h.a, 'x', 'follows')
    assert.equal(pin.connectionId, c1)
    assert.equal(pin.switchedFrom, null)
    assert.ok(!(await h.run(h.a, 'x', 'follows')).some((e) => e.fallback === true))
    assert.deepEqual(h.calls, ['one'])
  }
)
test(
  'an account with no connection at all keeps the plain pin: the deployment default, no broker turn',
  opts,
  async () => {
    const h = await setup()
    assert.equal(await h.broker.pin(h.a, 'x', 'plain-none'), null)
    assert.equal((await h.broker.inspect(h.a, 'x', 'plain-none')).route, null)
  }
)
test('a conversation that fell back to Tracy AI stays there once Tracy AI is put first', opts, async () => {
  const h = await setup()
  const c1 = await h.connect()
  h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
  assert.equal((await h.run(h.a, 'x', 'moved')).at(-1).fallback, true)
  await h.broker.saveRouting(h.a, { enabled: true, connectionOrder: ['tracy', c1], expectedVersion: 0 })
  h.responses.delete('one')
  await db.pool.query('update seat_plan_connection set cooldown_until = $1', [new Date(Date.now() - 60_000)])
  assert.equal((await h.broker.pin(h.a, 'x', 'moved')).provider, 'seat-plan-tracy')
  assert.equal((await h.run(h.a, 'x', 'moved')).at(-1).fallback, true)
  assert.deepEqual(h.calls, ['one'])
})
test(
  'a new conversation while the Default cools down goes to Tracy AI saying so, and comes back after',
  opts,
  async () => {
    const h = await setup()
    const c1 = await h.connect()
    await db.pool.query('update seat_plan_connection set cooldown_until = $1', [
      new Date(Date.now() + 3_600_000)
    ])
    assert.equal((await h.broker.status(h.a)).next, null)
    const pin = await h.broker.pin(h.a, 'x', 'cooling')
    assert.equal(pin.provider, 'seat-plan-tracy')
    assert.deepEqual(pin.switchedFrom, { vendor: 'Claude', reason: 'limit' })
    assert.equal((await h.run(h.a, 'x', 'cooling')).at(-1).fallback, true)
    assert.deepEqual(h.calls, [], 'a cooling subscription is not asked')
    await db.pool.query('update seat_plan_connection set cooldown_until = $1', [
      new Date(Date.now() - 60_000)
    ])
    assert.equal((await h.broker.pin(h.a, 'x', 'cooling')).connectionId, c1)
    assert.ok(!(await h.run(h.a, 'x', 'cooling')).some((e) => e.fallback === true))
    assert.deepEqual(h.calls, ['one'])
  }
)
test('temporary errors retry once, then exhaust permitted connections before Tracy AI', opts, async () => {
  const h = await setup()
  await h.connect()
  await h.connect(h.a, 'codex', 'two')
  h.responses.set('one', Object.assign(new Error('unavailable'), { status: 503 }))
  h.responses.set('two', Object.assign(new Error('bad token'), { status: 401 }))
  assert.equal((await h.run()).at(-1).fallback, true)
  assert.deepEqual(h.calls, ['one', 'one', 'two'])
  const rows = (await h.broker.status(h.a)).connections
  assert.equal(rows[0].connected, true)
  assert.equal(rows[1].connected, false)
})
test('cancellation cannot trigger Tracy AI fallback', opts, async () => {
  const h = await setup()
  await h.connect()
  const controller = new AbortController()
  h.wire.claude.streamOnce = async function* () {
    controller.abort()
    yield* []
    throw new DOMException('Cancelled', 'AbortError')
  }
  await assert.rejects(
    Array.fromAsync(h.broker.run(h.a, 'x', 'cancel', { messages: [] }, controller.signal)),
    { name: 'AbortError' }
  )
  assert.equal((await h.broker.inspect(h.a, 'x', 'cancel')).route.provider, 'seat-plan-claude')
})

test(
  'authentication failure after a refresh invalidates only the credential version actually used',
  opts,
  async () => {
    const h = await setup()
    h.wire.claude.exchangeCode = async () => ({ accessToken: 'one', refreshToken: 'refresh', expiresAt: 1 })
    await h.connect()
    h.wire.claude.refresh = async () => ({ accessToken: 'fresh', expiresAt: Date.now() + 3600000 })
    h.responses.set('fresh', Object.assign(new Error('bad token'), { status: 401 }))
    assert.equal((await h.run()).at(-1).fallback, true)
    assert.equal((await h.broker.status(h.a)).connections[0].connected, false)
  }
)

test(
  'a conversation moved to Tracy AI goes back to the subscription once it can serve again; a plain pin never moves',
  opts,
  async () => {
    const h = await setup()
    const id = await h.connect()
    h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
    assert.equal((await h.run(h.a, 'x', 'back')).at(-1).fallback, true)
    // Still limited: the pin stays on Tracy AI and the subscription is not asked again.
    assert.equal((await h.broker.pin(h.a, 'x', 'back')).provider, 'seat-plan-tracy')
    assert.deepEqual(h.calls, ['one'])
    // The limit resets (its cool-down passes): the next turn runs on the subscription again.
    h.responses.delete('one')
    await db.pool.query('update seat_plan_connection set cooldown_until = $2 where id = $1', [
      id,
      new Date(Date.now() - 60_000)
    ])
    const back = await h.broker.pin(h.a, 'x', 'back')
    assert.equal(back.provider, 'seat-plan-claude')
    assert.equal(back.connectionId, id)
    assert.equal(back.switchedFrom, null)
    const events = await h.run(h.a, 'x', 'back')
    assert.ok(!events.some((e) => e.fallback === true))
    assert.deepEqual(h.calls, ['one', 'one'])
  }
)

test('a pin made with no connection stays plain after the account connects one', opts, async () => {
  const h = await setup()
  assert.equal(await h.broker.pin(h.a, 'x', 'plain'), null)
  await h.connect()
  assert.equal(await h.broker.pin(h.a, 'x', 'plain'), null)
})

/** A broker whose Copilot signs in by GitHub's device code, answered from `polls` in turn. */
async function deviceSetup(polls) {
  const h = await setup()
  const started = []
  const polled = []
  const copilot = {
    ...providers.copilot,
    deviceStart: async () => {
      started.push(1)
      return {
        userCode: 'ABCD-1234',
        deviceAuthId: 'dev-1',
        intervalMs: 5000,
        authUrl: 'https://github.com/login/device'
      }
    },
    devicePoll: async (_cfg, session) => {
      polled.push(session)
      const next = polls.shift()
      if (next instanceof Error) throw next
      return next
    },
    async *streamOnce({ blob }) {
      h.calls.push(blob.accessToken)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'hi' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  // Codex's device sign-in (the web's), with OpenAI's device page and the same polls.
  const codex = {
    ...h.wire.codex,
    deviceStart: async () => {
      started.push(1)
      return {
        userCode: 'WXYZ-9876',
        deviceAuthId: 'deviceauth_1',
        intervalMs: 5000,
        authUrl: 'https://auth.openai.com/codex/device'
      }
    },
    devicePoll: copilot.devicePoll
  }
  const { identityOf } = await import('../src/seat-plan/providers.js')
  const broker = createSeatPlanBroker({
    pool: db.pool,
    kek: Buffer.alloc(32, 1).toString('base64'),
    policy: async () => ({ llm: { connect: true, providers: ['claude', 'codex', 'copilot'] } }),
    providers: { ...h.wire, codex, copilot },
    identify: (provider, blob, f) =>
      provider === 'copilot'
        ? identityOf(provider, blob, f)
        : { subject: blob.accessToken, label: blob.accessToken }
  })
  return { ...h, broker, started, polled }
}
const authorized = {
  status: 'authorized',
  blob: {
    accessToken: 'tid=c1',
    refreshToken: 'gho',
    expiresAt: Date.now() + 3600000,
    githubId: '4242',
    login: 'octo'
  }
}

test(
  'a device sign-in (GitHub Copilot) hands back a code to type and connects once GitHub confirms',
  opts,
  async () => {
    const h = await deviceSetup([{ status: 'pending' }, authorized])
    const attempt = await h.broker.start(h.a, 'cookie', 'copilot')
    assert.equal(attempt.signIn, 'device')
    assert.equal(attempt.userCode, 'ABCD-1234')
    assert.equal(attempt.authorizeUrl, 'https://github.com/login/device')
    assert.equal(attempt.intervalMs, 5000)
    assert.ok(!JSON.stringify(attempt).includes('dev-1'), 'the device code never leaves the server')
    const poll = { attemptId: attempt.attemptId, state: attempt.state }
    assert.deepEqual(await h.broker.complete(h.a, 'cookie', poll), { pending: true, intervalMs: 5000 })
    const doc = await h.broker.complete(h.a, 'cookie', poll)
    assert.deepEqual(
      doc.connections.map((c) => [c.provider, c.name, c.account, c.connected]),
      [['copilot', 'GitHub Copilot', 'octo', true]]
    )
    assert.deepEqual(
      h.polled.map((s) => s.deviceAuthId),
      ['dev-1', 'dev-1']
    )
    await assert.rejects(h.broker.complete(h.a, 'cookie', poll), { code: 'expired' })
    // The connection serves a turn on Copilot's default model.
    const events = await Array.fromAsync(h.broker.run(h.a, 'x', 'cop', { messages: [] }))
    assert.equal(events.find((e) => e.route).route.provider, 'seat-plan-copilot')
    assert.equal(events.find((e) => e.route).route.model, 'gpt-4.1')
    assert.deepEqual(h.calls, ['tid=c1'])
  }
)

test('a device attempt is polled only by the browser and account that started it', opts, async () => {
  const h = await deviceSetup([authorized])
  const attempt = await h.broker.start(h.a, 'cookie', 'copilot')
  const poll = { attemptId: attempt.attemptId, state: attempt.state }
  await assert.rejects(h.broker.complete(h.a, 'other-cookie', poll), { code: 'expired' })
  await assert.rejects(h.broker.complete(h.b, 'cookie', poll), { code: 'expired' })
  await assert.rejects(h.broker.complete(h.a, 'cookie', { ...poll, state: 'wrong' }), { code: 'expired' })
  assert.equal(h.polled.length, 0)
})

test(
  'a device attempt cannot be finished with a pasted callback, nor a browser one by polling',
  opts,
  async () => {
    const h = await deviceSetup([authorized])
    const device = await h.broker.start(h.a, 'cookie', 'copilot')
    await assert.rejects(
      h.broker.complete(h.a, 'cookie', { attemptId: device.attemptId, url: `code#${device.state}` }),
      { code: 'invalid' }
    )
    const browser = await h.broker.start(h.a, 'cookie', 'claude')
    assert.equal(browser.signIn, 'browser')
    await assert.rejects(
      h.broker.complete(h.a, 'cookie', { attemptId: browser.attemptId, state: browser.state }),
      {
        code: 'invalid'
      }
    )
    assert.equal(h.polled.length, 0)
  }
)

test('a device code GitHub refuses or lets expire ends the attempt', opts, async () => {
  const refused = Object.assign(new Error('expired_token'), { status: 400, code: 'DEVICE' })
  const h = await deviceSetup([refused])
  const attempt = await h.broker.start(h.a, 'cookie', 'copilot')
  const poll = { attemptId: attempt.attemptId, state: attempt.state }
  await assert.rejects(h.broker.complete(h.a, 'cookie', poll), { code: 'code' })
  await assert.rejects(h.broker.complete(h.a, 'cookie', poll), { code: 'expired' })
  assert.equal((await h.broker.status(h.a)).connections.length, 0)
})

test(
  'on the web Codex hands back a code to type; on the desktop it opens the browser sign-in',
  opts,
  async () => {
    const h = await deviceSetup([])
    const web = await h.broker.start(h.a, 'cookie', 'codex', 'web')
    assert.equal(web.signIn, 'device')
    assert.equal(web.userCode, 'WXYZ-9876')
    assert.equal(web.authorizeUrl, 'https://auth.openai.com/codex/device')
    assert.ok(!JSON.stringify(web).includes('deviceauth_1'), 'the device code never leaves the server')
    // A start that names no surface is the web's.
    assert.equal((await h.broker.start(h.a, 'cookie', 'codex')).signIn, 'device')
    const desktop = await h.broker.start(h.a, 'cookie', 'codex', 'desktop')
    assert.equal(desktop.signIn, 'browser')
    assert.equal(desktop.userCode, undefined)
    assert.equal(
      new URL(desktop.authorizeUrl).searchParams.get('redirect_uri'),
      'http://localhost:1455/auth/callback'
    )
    assert.equal(h.started.length, 2, 'only the web starts asked OpenAI for a device code')
  }
)

test('Claude opens the browser sign-in on both surfaces, Copilot a device code on both', opts, async () => {
  const h = await deviceSetup([])
  for (const surface of ['web', 'desktop', 'tablet']) {
    assert.equal((await h.broker.start(h.a, 'cookie', 'claude', surface)).signIn, 'browser')
    assert.equal((await h.broker.start(h.a, 'cookie', 'copilot', surface)).signIn, 'device')
  }
})

test('a Codex device attempt connects once OpenAI confirms', opts, async () => {
  const h = await deviceSetup([{ status: 'pending' }, authorized])
  const attempt = await h.broker.start(h.a, 'cookie', 'codex', 'web')
  const poll = { attemptId: attempt.attemptId, state: attempt.state }
  assert.deepEqual(await h.broker.complete(h.a, 'cookie', poll), { pending: true, intervalMs: 5000 })
  const doc = await h.broker.complete(h.a, 'cookie', poll)
  assert.deepEqual(
    doc.connections.map((c) => [c.provider, c.connected]),
    [['codex', true]]
  )
  assert.deepEqual(
    h.polled.map((s) => [s.deviceAuthId, s.userCode]),
    [
      ['deviceauth_1', 'WXYZ-9876'],
      ['deviceauth_1', 'WXYZ-9876']
    ]
  )
})

test('a Codex attempt finishes the way it started, whatever the vendor offers elsewhere', opts, async () => {
  const h = await deviceSetup([authorized])
  const device = await h.broker.start(h.a, 'cookie', 'codex', 'web')
  await assert.rejects(
    h.broker.complete(h.a, 'cookie', { attemptId: device.attemptId, url: `code#${device.state}` }),
    { code: 'invalid', status: 400 }
  )
  const browser = await h.broker.start(h.a, 'cookie', 'codex', 'desktop')
  await assert.rejects(
    h.broker.complete(h.a, 'cookie', { attemptId: browser.attemptId, state: browser.state }),
    {
      code: 'invalid',
      status: 400
    }
  )
  assert.equal(h.polled.length, 0)
  // Both attempts stay open for the way they started.
  const doc = await h.broker.complete(h.a, 'cookie', {
    attemptId: browser.attemptId,
    url: `desk#${browser.state}`
  })
  assert.deepEqual(
    doc.connections.map((c) => [c.provider, c.account]),
    [['codex', 'desk']]
  )
})

/** A broker whose GLM proves keys through `probe`, answered by the test. */
async function keySetup(probe = async (key) => key) {
  const h = await setup()
  const probed = []
  const glm = {
    ...providers.glm,
    fromKey: async (key, cfg, f) => {
      probed.push(key)
      await h.keyProbe(key, cfg, f)
      return { blob: { kind: 'key', v: 1, apiKey: key }, identity: keyIdentity(key) }
    },
    async *streamOnce({ blob, options }) {
      h.calls.push(blob.apiKey)
      h.attempts.push(options)
      const result = h.responses.get(blob.apiKey)
      if (result instanceof Error) throw result
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'hi' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  h.keyProbe = probe
  const llm = { connect: true, providers: ['claude', 'codex', 'copilot', 'glm'] }
  const broker = createSeatPlanBroker({
    pool: db.pool,
    kek: Buffer.alloc(32, 1).toString('base64'),
    policy: async () => ({ llm }),
    providers: { ...h.wire, copilot: providers.copilot, glm },
    identify: async (_p, blob) => ({ subject: blob.accessToken, label: blob.accessToken })
  })
  return Object.assign(h, { broker, probed, llm })
}
const { keyIdentity } = await import('../src/seat-plan/wire/api-key.js')
const KEY = 'zai.0123456789abcdefWXYZ'
const refusal = (code) => Object.assign(new Error(`api key probe failed (${code})`), { code })

test('a pasted key the vendor refuses keeps nothing, and says which refusal it was', opts, async () => {
  for (const [code, status] of [
    ['key', 401],
    ['plan', 403],
    ['vendor', 502]
  ]) {
    const h = await keySetup(async () => {
      throw refusal(code)
    })
    await assert.rejects(h.broker.connectKey(h.a, 'glm', KEY), { code, status })
    assert.equal((await h.broker.status(h.a)).connections.length, 0)
    await db.reset()
  }
})

test('a pasted key the vendor accepts connects once, and pasting it again replaces it', opts, async () => {
  const h = await keySetup()
  const doc = await h.broker.connectKey(h.a, 'glm', KEY)
  assert.deepEqual(
    doc.connections.map((c) => [c.provider, c.name, c.account, c.connected]),
    [['glm', 'GLM', 'API key …WXYZ', true]]
  )
  assert.ok(!JSON.stringify(doc).includes(KEY), 'the key never comes back')
  const before = (
    await db.pool.query('select id, version, secret, provider_subject from seat_plan_connection')
  ).rows
  assert.equal(before[0].provider_subject, keyIdentity(KEY).subject)
  assert.ok(!JSON.stringify(before[0].secret).includes(KEY), 'the key is kept sealed')
  await h.broker.connectKey(h.a, 'glm', ` ${KEY} `)
  const after = (await db.pool.query('select id, version, secret from seat_plan_connection')).rows
  assert.equal(after.length, 1)
  assert.equal(after[0].id, before[0].id)
  assert.equal(after[0].version, before[0].version + 1)
  assert.notDeepEqual(after[0].secret, before[0].secret)
  // The kept key serves a turn on GLM's default model.
  const events = await Array.fromAsync(h.broker.run(h.a, 'x', 'glm-turn', { messages: [] }))
  assert.equal(events.find((e) => e.route).route.provider, 'seat-plan-glm')
  assert.equal(events.find((e) => e.route).route.model, 'glm-5.2')
  assert.deepEqual(h.calls, [KEY])
})

test('a pasted key that is not one is refused before the vendor is asked', opts, async () => {
  const h = await keySetup()
  for (const key of ['', '   ', 'a'.repeat(513), 'bad key', 'kéy', 'line\nbreak', 42, null, undefined])
    await assert.rejects(h.broker.connectKey(h.a, 'glm', key), { code: 'invalid', status: 400 })
  await assert.rejects(h.broker.connectKey(h.a, 'nope', KEY), { code: 'invalid', status: 400 })
  // A vendor that signs in by browser or device takes no pasted key.
  await assert.rejects(h.broker.connectKey(h.a, 'claude', KEY), { code: 'invalid', status: 400 })
  assert.deepEqual(h.probed, [])
  h.llm.providers = ['claude']
  await assert.rejects(h.broker.connectKey(h.a, 'glm', KEY), { code: 'disabled' })
  assert.deepEqual(h.probed, [])
})

test('a key vendor has no browser or device sign-in to start', opts, async () => {
  const h = await keySetup()
  await assert.rejects(h.broker.start(h.a, 'cookie', 'glm'), { code: 'invalid', status: 400 })
  const { rows } = await db.pool.query('select count(*)::int as n from seat_plan_attempt')
  assert.equal(rows[0].n, 0)
})

test('status says how each vendor signs in', opts, async () => {
  const h = await keySetup()
  assert.deepEqual(
    (await h.broker.status(h.a)).providers.map((p) => [p.id, p.signIn, p.webSignIn]),
    [
      ['claude', 'browser', 'browser'],
      ['codex', 'browser', 'device'],
      ['copilot', 'device', 'device'],
      ['glm', 'key', 'key']
    ]
  )
})

test('disconnect while a pasted key is being checked cannot resurrect the connection', opts, async () => {
  const h = await keySetup()
  await h.broker.connectKey(h.a, 'glm', KEY)
  const id = (await h.broker.status(h.a)).connections[0].connectionId
  let release, entered
  const waiting = new Promise((r) => {
    entered = r
  })
  h.keyProbe = async () => {
    entered()
    await new Promise((r) => {
      release = r
    })
  }
  const connecting = h.broker.connectKey(h.a, 'glm', KEY)
  const rejected = assert.rejects(connecting, { code: 'conflict' })
  await waiting
  await h.broker.disconnect(h.a, id)
  release()
  await rejected
  assert.equal((await h.broker.status(h.a)).connections[0].connected, false)
  // Pasting the key again afterwards is a fresh decision and reconnects it.
  h.keyProbe = async () => {}
  await h.broker.connectKey(h.a, 'glm', KEY)
  assert.equal((await h.broker.status(h.a)).connections[0].connected, true)
})

test('a key connection is identified by the hash of its key', async () => {
  const { identityOf } = await import('../src/seat-plan/providers.js')
  for (const provider of ['kimi', 'glm', 'qwen'])
    assert.deepEqual(await identityOf(provider, { kind: 'key', v: 1, apiKey: KEY }), {
      subject: keyIdentity(KEY).subject,
      label: 'API key …WXYZ'
    })
})

test('a turn refused with 403 keeps a pasted key; only a 401 removes it', opts, async () => {
  const h = await keySetup()
  await h.broker.connectKey(h.a, 'glm', KEY)
  const secret = async () =>
    (await db.pool.query('select secret, cooldown_until from seat_plan_connection')).rows[0]
  // An access or policy refusal (a plan, a tool the vendor does not accept): the key stays, the
  // connection rests like a plan refusal, and the turn goes to Tracy AI.
  h.responses.set(KEY, Object.assign(new Error('vendor http 403: forbidden'), { status: 403 }))
  const refused = await Array.fromAsync(h.broker.run(h.a, 'x', 'k403', { messages: [] }))
  assert.ok(refused.some((e) => e.fallback))
  const kept = await secret()
  assert.notEqual(kept.secret, null)
  assert.ok(kept.cooldown_until && +kept.cooldown_until > Date.now())
  assert.equal((await h.broker.status(h.a)).connections[0].connected, true)
  // A wrong key: the key is removed and the person is asked to reconnect.
  await db.pool.query('update seat_plan_connection set cooldown_until=null')
  h.responses.set(KEY, Object.assign(new Error('vendor http 401: invalid key'), { status: 401 }))
  await Array.fromAsync(h.broker.run(h.a, 'x', 'k401', { messages: [] }))
  assert.equal((await secret()).secret, null)
})

test(
  'a signed-in email with no account row yet gets its row on first read, not a 401 (first run of a brand-new account)',
  opts,
  async () => {
    const h = await setup()
    const fresh = `new-${randomUUID()}@test.example`
    const person = await h.broker.account(fresh)
    assert.ok(person.id)
    assert.equal(person.email, fresh)
    assert.equal((await h.broker.account(fresh)).id, person.id)
    const s = await h.broker.status(person.id)
    assert.deepEqual(s.connections, [])
    assert.equal(
      (await db.pool.query('select count(*)::int as n from account where email=$1', [fresh])).rows[0].n,
      1
    )
  }
)

// Tracy AI is an entry of the order (migration 095): `connectionOrder` carries every connection id
// and the literal `tracy` once; the first entry is the Default.
test(
  'an account with nothing connected has Tracy AI as its whole order, and no tracyFallback',
  opts,
  async () => {
    const h = await setup()
    const state = await h.broker.status(h.a)
    assert.deepEqual(state.routing, { enabled: true, connectionOrder: ['tracy'], version: 0 })
    assert.equal(state.next, null)
  }
)
test(
  'a new connection stands before Tracy AI while Tracy AI is last, else after everything',
  opts,
  async () => {
    const h = await setup()
    const c1 = await h.connect()
    assert.deepEqual((await h.broker.status(h.a)).routing.connectionOrder, [c1, 'tracy'])
    const c2 = await h.connect(h.a, 'codex', 'two')
    assert.deepEqual((await h.broker.status(h.a)).routing.connectionOrder, [c1, c2, 'tracy'])
    await h.broker.saveRouting(h.a, { enabled: true, connectionOrder: ['tracy', c1, c2], expectedVersion: 0 })
    const c3 = await h.connect(h.a, 'claude', 'three')
    assert.deepEqual((await h.broker.status(h.a)).routing.connectionOrder, ['tracy', c1, c2, c3])
    assert.equal((await h.broker.status(h.a)).next, null, 'Tracy AI first: the effective route is Tracy AI')
  }
)
test(
  'the saved order must name every connection and Tracy AI exactly once; tracyFallback is ignored',
  opts,
  async () => {
    const h = await setup()
    const c1 = await h.connect()
    const put = (connectionOrder, extra = {}) =>
      h.broker.saveRouting(h.a, { enabled: true, connectionOrder, expectedVersion: 0, ...extra })
    await assert.rejects(put([c1]), { code: 'invalid', status: 400 })
    await assert.rejects(put([c1, 'tracy', randomUUID()]), { code: 'invalid', status: 400 })
    await assert.rejects(put([c1, 'tracy', 'tracy']), { code: 'invalid', status: 400 })
    await assert.rejects(put(['tracy']), { code: 'invalid', status: 400 })
    const saved = await put(['tracy', c1], { tracyFallback: false })
    assert.deepEqual(saved.routing, { enabled: true, connectionOrder: ['tracy', c1], version: 1 })
    assert.equal(saved.next, null)
    // A disconnected connection keeps its row, so the order still names it.
    await h.broker.disconnect(h.a, c1)
    await assert.rejects(put(['tracy'], { expectedVersion: 1 }), { code: 'invalid', status: 400 })
    assert.deepEqual((await put([c1, 'tracy'], { expectedVersion: 1 })).routing.connectionOrder, [
      c1,
      'tracy'
    ])
  }
)

// ---- pictures (12/10/2026) ------------------------------------------------------------------------
// The broker decides on EVERY attempt, from the route that attempt actually runs on, whether the
// request may carry pictures; a caller's own `supportsImages` is never believed.
const { openaiMessages, codexResponsesBody, PICTURE_NOT_SHOWN } = await import(
  '../src/seat-plan/wire/messages.js'
)
const PIXEL = 'iVBORw0KGgo='
const pictureRequest = () => ({
  supportsImages: true,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Like this:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PIXEL } }
      ]
    }
  ]
})

test('the pin and the status say which inputs the pinned model takes', opts, async () => {
  const h = await keySetup()
  await h.connect()
  await h.broker.connectKey(h.a, 'glm', KEY)
  const pin = await h.broker.pin(h.a, 'x', 'modalities')
  assert.equal(pin.provider, 'seat-plan-claude')
  assert.deepEqual(pin.inputModalities, ['text', 'image'])
  assert.deepEqual((await h.broker.status(h.a)).next.inputModalities, ['text', 'image'])
  const order = (await h.broker.status(h.a)).routing.connectionOrder
  await h.broker.saveRouting(h.a, {
    enabled: true,
    connectionOrder: [order[1], order[0], 'tracy'],
    expectedVersion: (await h.broker.status(h.a)).routing.version
  })
  assert.deepEqual((await h.broker.pin(h.a, 'x', 'modalities-glm')).inputModalities, ['text'])
  assert.deepEqual((await h.broker.status(h.a)).next.inputModalities, ['text'])
})

test(
  'a turn with a picture that fails over from Claude to GLM goes on as text, and the request is untouched',
  opts,
  async () => {
    const h = await keySetup()
    await h.connect()
    await h.broker.connectKey(h.a, 'glm', KEY)
    h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
    const request = pictureRequest()
    const before = structuredClone(request)
    const events = await Array.fromAsync(h.broker.run(h.a, 'x', 'pic-glm', request))
    assert.equal(events.find((e) => e.route).route.provider, 'seat-plan-glm')
    assert.deepEqual(
      h.attempts.map((o) => [o.provider, o.supportsImages]),
      [
        ['claude', true],
        ['glm', false]
      ]
    )
    const sent = JSON.stringify(openaiMessages(h.attempts[1]))
    assert.ok(!sent.includes(PIXEL), 'GLM never gets the bytes')
    assert.ok(sent.includes(PICTURE_NOT_SHOWN))
    assert.deepEqual(request, before, 'the request is the same for every attempt')
  }
)

test('a turn with a picture that fails over from Claude to Codex keeps the picture', opts, async () => {
  const h = await setup()
  await h.connect()
  await h.connect(h.a, 'codex', 'two')
  h.responses.set('one', Object.assign(new Error('usage_limit_reached'), { status: 429 }))
  // The caller says no pictures; the broker decides from the route, and Codex takes them.
  const request = { ...pictureRequest(), supportsImages: false }
  const before = structuredClone(request)
  await Array.fromAsync(h.broker.run(h.a, 'x', 'pic-codex', request))
  assert.deepEqual(
    h.attempts.map((o) => [o.provider, o.supportsImages]),
    [
      ['claude', true],
      ['codex', true]
    ]
  )
  const codexAttempt = h.attempts.findLast((o) => o.provider === 'codex')
  assert.equal(codexAttempt.supportsImages, true)
  assert.ok(JSON.stringify(codexResponsesBody(codexAttempt, 'i', {})).includes(PIXEL))
  assert.deepEqual(request, before)
})

test('a caller cannot switch pictures on for a text-only model', opts, async () => {
  const h = await keySetup()
  await h.broker.connectKey(h.a, 'glm', KEY)
  await Array.fromAsync(h.broker.run(h.a, 'x', 'pic-forced', pictureRequest()))
  assert.equal(h.attempts.at(-1).provider, 'glm')
  assert.equal(h.attempts.at(-1).supportsImages, false)
})

test('a vendor error that echoes a picture never puts its bytes in the log', opts, async () => {
  const h = await setup()
  await h.connect()
  const bytes =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg'
  h.responses.set(
    'one',
    Object.assign(new Error(`vendor http 503: bad image data:image/png;base64,${bytes} and ${bytes}`), {
      status: 503
    })
  )
  const said = []
  const warn = console.warn
  console.warn = (...args) => said.push(args.join(' '))
  try {
    await Array.fromAsync(h.broker.run(h.a, 'x', 'echo', pictureRequest())).catch(() => {})
  } finally {
    console.warn = warn
  }
  assert.ok(said.length > 0, 'the failure is still logged')
  for (const line of said) assert.ok(!line.includes(bytes.slice(0, 40)), line)
})
