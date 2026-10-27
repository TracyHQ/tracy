// The desktop sign-in round (`src/signin-handoff.js`), driven through its public interface only:
// a fake server answers the contract doors, a fake clock and sleep stand in for time, and every
// URL, header, log line and value handed to the window is recorded so the tests can prove where
// the client secret went — and where it never went.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import handoff from '../src/signin-handoff.js'

const { createSigninHandoff } = handoff

const HOME = 'https://cowork.example'
const NONCE = 'n0nce-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const SECRET = 'S3CRET-client-value-never-leaves-main'
const MATCH = 'ABCD-EFGH'

/**
 * A fake Tracy server for the contract doors, with a scripted list of poll answers.
 * @param {object} options
 * @param {string[]} [options.polls] - statuses the poll door answers, in order; the last repeats.
 * @param {(n: number) => Response | Promise<Response>} [options.redeem] - answer of the session door.
 * @param {() => Response} [options.me] - answer of `/auth/me`.
 * @param {number} [options.expiresAt] - the round's expiry, epoch ms.
 */
function fakeServer({ polls = ['approved'], redeem, me, expiresAt = 1_000_000 } = {}) {
  const calls = []
  let pollIndex = 0
  let redeemCount = 0
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const { pathname } = new URL(url)
    if (pathname === '/auth/link/browser') {
      return Response.json({ nonce: NONCE, clientSecret: SECRET, matchCode: MATCH, expiresAt })
    }
    if (pathname === `/auth/link/${NONCE}`) {
      const status = polls[Math.min(pollIndex, polls.length - 1)]
      pollIndex += 1
      return Response.json({ status })
    }
    if (pathname === `/auth/link/${NONCE}/session`) {
      redeemCount += 1
      return redeem ? redeem(redeemCount) : new Response(null, { status: 204 })
    }
    if (pathname === `/auth/link/${NONCE}/cancel`) return new Response(null, { status: 204 })
    if (pathname === '/auth/me') return me ? me() : Response.json({ email: null })
    return new Response('not found', { status: 404 })
  }
  return { fetch, calls }
}

/** A clock that only moves when the fake sleep is called. */
function fakeTime(start = 0) {
  let t = start
  const sleeps = []
  return {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms)
      t += ms
    },
    sleeps
  }
}

/**
 * Build a handoff with every dependency faked and recorded.
 * @param {object} server - from `fakeServer`.
 * @param {object} [overrides] - replaces any default dependency.
 */
function harness(server, overrides = {}) {
  const time = fakeTime()
  const opened = []
  const logs = []
  const instance = createSigninHandoff({
    home: HOME,
    fetch: server.fetch,
    now: time.now,
    sleep: time.sleep,
    random: () => 0.5,
    openExternal: (url) => opened.push(url),
    log: (line) => logs.push(line),
    ...overrides
  })
  return { instance, time, opened, logs }
}

test('happy path: start, open the browser, poll until approved, redeem, signed in', async () => {
  const server = fakeServer({ polls: ['pending', 'pending', 'approved'] })
  const { instance, opened } = harness(server)
  const codes = []

  const result = await instance.start({ onCode: (info) => codes.push(info) })

  assert.equal(result.outcome, 'signed-in')
  assert.deepEqual(opened, [`${HOME}/signin?n=${NONCE}`])
  assert.deepEqual(codes, [{ matchCode: MATCH, expiresAt: 1_000_000 }])

  const [startCall] = server.calls
  assert.equal(startCall.url, `${HOME}/auth/link/browser`)
  assert.equal(startCall.init.method, 'POST')
  assert.deepEqual(JSON.parse(startCall.init.body), { purpose: 'desktop', device: 'Tracy Cowork for Mac' })

  const polls = server.calls.filter((c) => c.url === `${HOME}/auth/link/${NONCE}`)
  assert.equal(polls.length, 3)

  const redeem = server.calls.find((c) => c.url === `${HOME}/auth/link/${NONCE}/session`)
  assert.equal(redeem.init.method, 'POST')
  assert.deepEqual(JSON.parse(redeem.init.body), { clientSecret: SECRET })
  assert.equal(redeem.init.headers.Origin, HOME)
  assert.equal(redeem.init.headers['Content-Type'], 'application/json')
  assert.equal(redeem.init.credentials, 'include')
  assert.equal(redeem.init.redirect, 'error')
  assert.equal(redeem.init.cache, 'no-store')
  assert.ok(redeem.init.signal instanceof AbortSignal, 'the redeem carries a timeout signal')
  assert.equal(instance.active, false)
})

test('denied in the browser: the round ends denied and never redeems', async () => {
  const server = fakeServer({ polls: ['pending', 'denied'] })
  const { instance } = harness(server)

  const result = await instance.start()

  assert.equal(result.outcome, 'denied')
  assert.equal(server.calls.filter((c) => c.url.endsWith('/session')).length, 0)
})

test('expired by the server: the round ends expired and never redeems', async () => {
  const server = fakeServer({ polls: ['pending', 'expired'] })
  const { instance } = harness(server)

  const result = await instance.start()

  assert.equal(result.outcome, 'expired')
  assert.equal(server.calls.filter((c) => c.url.endsWith('/session')).length, 0)
})

test('expired by the clock: polling stops at expiresAt even while the server says pending', async () => {
  // Expiry 12 s after start; polls every 5 s → at most three polls (t=0, 5, 10), none after 12.
  const server = fakeServer({ polls: ['pending'], expiresAt: 12_000 })
  const { instance, time } = harness(server)

  const result = await instance.start()

  assert.equal(result.outcome, 'expired')
  assert.equal(server.calls.filter((c) => c.url === `${HOME}/auth/link/${NONCE}`).length, 3)
  assert.ok(time.now() >= 12_000)
})

test('poll interval is 5 s with jitter of at most 1 s', async () => {
  const server = fakeServer({ polls: ['pending', 'pending', 'pending', 'approved'] })
  const randoms = [0, 0.999, 0.5]
  const { instance, time } = harness(server, { random: () => randoms.shift() })

  await instance.start()

  assert.deepEqual(
    time.sleeps.map((ms) => Math.round(ms)),
    [4_000, 5_998, 5_000]
  )
})

test('cancel mid-poll: start resolves cancelled, no more polls, never redeems', async () => {
  const server = fakeServer({ polls: ['pending'] })
  let release
  // The first sleep never ends by itself: the round is parked between two polls.
  const sleep = () => new Promise((resolve) => (release = resolve))
  const { instance } = harness(server, { sleep })

  const pending = instance.start()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(instance.active, true)
  const pollsBefore = server.calls.length

  instance.cancel()
  const result = await pending
  release()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(result.outcome, 'cancelled')
  assert.equal(instance.active, false)
  const after = server.calls.slice(pollsBefore).map((c) => c.url)
  assert.deepEqual(
    after,
    [`${HOME}/auth/link/${NONCE}/cancel`],
    'no poll after cancel, only the cancel itself'
  )
})

test('polls never overlap, even when one poll is slow', async () => {
  const base = fakeServer({ polls: ['pending', 'pending', 'approved'] })
  let inFlight = 0
  let maxInFlight = 0
  const fetch = async (url, init) => {
    const isPoll = String(url) === `${HOME}/auth/link/${NONCE}`
    if (isPoll) {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      // A slow poll: answers only after several turns of the event loop.
      for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve))
    }
    try {
      return await base.fetch(url, init)
    } finally {
      if (isPoll) inFlight -= 1
    }
  }
  // A sleep that returns at once: if polling were timer-driven rather than sequential, polls
  // would pile up here.
  const { instance } = harness({ fetch }, { sleep: async () => {} })

  const result = await instance.start()

  assert.equal(result.outcome, 'signed-in')
  assert.equal(maxInFlight, 1)
})

test('the client secret appears in no URL, no log line, and nothing handed to the window', async () => {
  const server = fakeServer({ polls: ['pending', 'approved'] })
  const { instance, opened, logs } = harness(server)
  const shown = []

  await instance.start({ onCode: (info) => shown.push(JSON.stringify(info)) })

  for (const call of server.calls) assert.ok(!call.url.includes(SECRET), `secret in URL ${call.url}`)
  for (const url of opened) assert.ok(!url.includes(SECRET), 'secret in the browser URL')
  for (const line of logs) assert.ok(!line.includes(SECRET), `secret in log line ${line}`)
  for (const value of shown) assert.ok(!value.includes(SECRET), 'secret handed to the window')
  // It travels exactly once: in the body of the redeem.
  const carriers = server.calls.filter((c) => String(c.init.body ?? '').includes(SECRET))
  assert.deepEqual(
    carriers.map((c) => c.url),
    [`${HOME}/auth/link/${NONCE}/session`]
  )
})

test('redeem answer lost but /auth/me says signed in: the round is signed in', async () => {
  const server = fakeServer({
    redeem: () => {
      throw new TypeError('network connection lost')
    },
    me: () => Response.json({ email: 'person@example.com' })
  })
  const { instance } = harness(server)

  const result = await instance.start()

  assert.equal(result.outcome, 'signed-in')
  const me = server.calls.find((c) => c.url === `${HOME}/auth/me`)
  assert.ok(me, '/auth/me was asked')
  assert.equal(me.init.credentials, 'include')
  assert.equal(server.calls.filter((c) => c.url.endsWith('/session')).length, 1, 'never redeems twice')
})

test('redeem answer lost and /auth/me says nobody: the round fails', async () => {
  const server = fakeServer({
    redeem: () => {
      throw new TypeError('network connection lost')
    }
  })
  const { instance } = harness(server)

  const result = await instance.start()

  assert.equal(result.outcome, 'failed')
})

test('redeem refused by the server: the round fails without asking /auth/me', async () => {
  const server = fakeServer({ redeem: () => new Response(null, { status: 409 }) })
  const { instance } = harness(server)

  const result = await instance.start()

  assert.equal(result.outcome, 'failed')
  assert.equal(server.calls.filter((c) => c.url === `${HOME}/auth/me`).length, 0)
})

test('starting while a round is active cancels the old round', async () => {
  const first = fakeServer({ polls: ['pending'] })
  let parked
  let fetchImpl = first.fetch
  const { instance, opened } = harness(
    { fetch: (url, init) => fetchImpl(url, init) },
    {
      // The first round parks in its first pause; later rounds do not pause at all.
      sleep: () => (parked === undefined ? new Promise((resolve) => (parked = resolve)) : Promise.resolve())
    }
  )

  const firstRound = instance.start()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(instance.active, true)

  const second = fakeServer({ polls: ['approved'] })
  fetchImpl = second.fetch
  const secondRound = instance.start()

  assert.equal((await firstRound).outcome, 'cancelled')
  assert.equal((await secondRound).outcome, 'signed-in')
  assert.equal(opened.length, 2)
  assert.equal(first.calls.filter((c) => c.url.endsWith('/session')).length, 0, 'old round never redeems')
  assert.equal(instance.active, false)
})

test('start request failing ends the round as failed without opening the browser', async () => {
  const { instance, opened } = harness({
    fetch: async () => {
      throw new TypeError('offline')
    }
  })

  const result = await instance.start()

  assert.equal(result.outcome, 'failed')
  assert.deepEqual(opened, [])
})

test('an email typed on the sign-in page travels in the start body, never in a URL', async () => {
  const server = fakeServer()
  const { instance, opened, logs } = harness(server)

  const result = await instance.start({ email: '  lee@example.com ' })

  assert.equal(result.outcome, 'signed-in')
  const [startCall] = server.calls
  assert.deepEqual(JSON.parse(startCall.init.body), {
    purpose: 'desktop',
    device: 'Tracy Cowork for Mac',
    email: 'lee@example.com'
  })
  assert.ok(
    !server.calls.some((c) => c.url.includes('lee%40example.com') || c.url.includes('lee@example.com'))
  )
  assert.deepEqual(opened, [`${HOME}/signin?n=${NONCE}`])
  assert.ok(!logs.some((line) => line.includes('lee@example.com')), 'the address stays out of the log')
})

test('no email, or one no server would take, starts the round exactly as before', async () => {
  for (const email of [undefined, null, '', '   ', 42, 'x'.repeat(250) + '@a.io']) {
    const server = fakeServer()
    const { instance } = harness(server)
    await instance.start({ email })
    assert.deepEqual(JSON.parse(server.calls[0].init.body), {
      purpose: 'desktop',
      device: 'Tracy Cowork for Mac'
    })
  }
})

test('a redeem refused because the address is not admitted says so in the result', async () => {
  const server = fakeServer({
    redeem: () => Response.json({ code: 'SIGN_IN_REFUSED', reason: 'NOT_ADMITTED' }, { status: 403 })
  })
  const { instance } = harness(server)
  const result = await instance.start()
  assert.equal(result.outcome, 'failed')
  assert.equal(result.refusal, 'not-admitted')
})

test('any other refused redeem carries no refusal word', async () => {
  for (const body of [{ code: 'SIGN_IN_REFUSED', reason: 'ACCESS_UNAVAILABLE' }, { code: 'LINK_INVALID' }]) {
    const server = fakeServer({ redeem: () => Response.json(body, { status: 404 }) })
    const { instance } = harness(server)
    const result = await instance.start()
    assert.equal(result.outcome, 'failed', JSON.stringify(body))
    assert.equal(result.refusal, undefined, JSON.stringify(body))
  }
})

test('cancelling a started round tells the server, with the secret in the body only', async () => {
  const server = fakeServer({ polls: ['pending'] })
  let release
  const sleep = () => new Promise((resolve) => (release = resolve))
  const { instance, logs } = harness(server, { sleep })

  const pending = instance.start()
  await new Promise((resolve) => setImmediate(resolve))
  instance.cancel()
  assert.equal((await pending).outcome, 'cancelled')
  release()
  await new Promise((resolve) => setImmediate(resolve))

  const cancels = server.calls.filter((c) => c.url === `${HOME}/auth/link/${NONCE}/cancel`)
  assert.equal(cancels.length, 1)
  assert.equal(cancels[0].init.method, 'POST')
  assert.equal(cancels[0].init.headers.Origin, HOME)
  assert.equal(cancels[0].init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(cancels[0].init.body), { clientSecret: SECRET })
  assert.equal(cancels[0].init.signal.aborted, false, 'not bound to the cancelled round')
  for (const call of server.calls) assert.ok(!call.url.includes(SECRET))
  for (const line of logs) assert.ok(!line.includes(SECRET))
})

test('a cancel the server cannot take never throws and never blocks', async () => {
  const server = fakeServer({ polls: ['pending'] })
  const fetch = (url, init) =>
    String(url).endsWith('/cancel') ? Promise.reject(new Error('offline')) : server.fetch(url, init)
  const { instance } = harness({ fetch }, { sleep: () => new Promise(() => {}) })
  const pending = instance.start()
  await new Promise((resolve) => setImmediate(resolve))
  instance.cancel()
  assert.equal((await pending).outcome, 'cancelled')
  await new Promise((resolve) => setImmediate(resolve))
})

test('a round that ended by itself, or never started, sends no cancel', async () => {
  for (const polls of [['approved'], ['denied'], ['expired']]) {
    const server = fakeServer({ polls })
    const { instance } = harness(server)
    await instance.start()
    instance.cancel()
    assert.equal(server.calls.filter((c) => c.url.endsWith('/cancel')).length, 0, polls[0])
  }
})

test('a new round replacing an active one cancels the old one on the server', async () => {
  const server = fakeServer({ polls: ['pending'] })
  // Every round parks in its first pause.
  const { instance } = harness(server, { sleep: () => new Promise(() => {}) })
  const first = instance.start()
  await new Promise((resolve) => setImmediate(resolve))
  const second = instance.start()
  assert.equal((await first).outcome, 'cancelled')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(server.calls.filter((c) => c.url.endsWith('/cancel')).length, 1)
  instance.cancel()
  assert.equal((await second).outcome, 'cancelled')
})
