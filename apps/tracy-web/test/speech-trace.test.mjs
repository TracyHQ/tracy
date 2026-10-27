// How long a voice turn took (`src/speech/trace.js`, `src/lib/voice-trace.js`): who may report one,
// what of a report is kept (numbers only), that a turn is kept once, and the limits on the door.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import {
  MIN_FOR_MEDIAN,
  MIN_FOR_P95,
  parseVoiceTrace,
  percentiles,
  summarizeVoiceTurns,
  VOICE_TRACE_MAX_BYTES,
  VOICE_TRACES_PER_HOUR
} from '../src/lib/voice-trace.js'
import { MIN_FOR_P90, MIN_FOR_RATE } from '../src/ops/usage.js'
import { speechRoutes } from '../src/speech/route.js'

const SECRET = 'speech-trace-secret'
const cookie = async (email = 'ana@example.com') => `${SESSION_COOKIE}=${await mintSession(email, SECRET)}`
const quiet = { log() {}, warn() {} }

const REPORT = {
  id: '6f1d9c1e-2a7b-4f00-9e1a-3c5d7e9f0a1b',
  speechToCommit: 640.4,
  commitToSent: 310,
  sentToAck: 45,
  sentToReply: 2210,
  speechToReply: 3160,
  ackCached: 1,
  error: 0,
  interrupted: 0,
  pressed: 0
}

/** The door alone, its rows kept in memory (`createOpsSignal` without a pool). */
function door() {
  const signals = createOpsSignal({ pool: null, config: {}, log: quiet })
  const app = speechRoutes({
    config: { sessionSecret: SECRET, speech: { apiKey: 'k' } },
    signals,
    log: quiet
  })
  const post = async (body, { type = 'application/json', signedIn = true, email } = {}) =>
    app.request('/api/speech/trace', {
      method: 'POST',
      headers: { 'content-type': type, ...(signedIn ? { cookie: await cookie(email) } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  return { signals, post }
}

test('a signed-in page reports a turn: kept as one voice.turn row of numbers, under its account', async () => {
  const { signals, post } = door()
  const res = await post(REPORT)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
  assert.equal(signals.events.length, 1)
  const [row] = signals.events
  assert.equal(row.kind, 'voice.turn')
  assert.deepEqual(row.data, {
    speech_to_commit: 640,
    commit_to_sent: 310,
    sent_to_ack: 45,
    sent_to_reply: 2210,
    speech_to_reply: 3160,
    ack_cached: 1,
    error: 0,
    interrupted: 0,
    pressed: 0,
    email: 'ana@example.com'
  })
  // Without a session: nobody to keep it for.
  assert.equal((await post(REPORT, { signedIn: false })).status, 401)
  assert.equal(signals.events.length, 1)
})

test('one row per turn id: the fetch and the beacon both arriving keep one', async () => {
  const { signals, post } = door()
  assert.equal((await post(REPORT)).status, 200)
  // The beacon's copy: the same JSON as `text/plain`.
  assert.equal((await post(JSON.stringify(REPORT), { type: 'text/plain;charset=UTF-8' })).status, 200)
  assert.equal(signals.events.length, 1)
  assert.equal((await post({ ...REPORT, id: 'another-turn-0001' })).status, 200)
  assert.equal(signals.events.length, 2)
})

test('numbers only: words and unknown fields are dropped, a span out of range or not finite is no span, a flag is 1 or 0', () => {
  const parsed = parseVoiceTrace({
    ...REPORT,
    speechToCommit: -5,
    commitToSent: 600_001,
    sentToAck: '45',
    sentToReply: Number.NaN,
    text: 'Đổi màu nút liên hệ',
    words: ['xin', 'chào'],
    ip: '203.0.113.9',
    error: true,
    interrupted: 2,
    pressed: 1
  })
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.data, {
    speech_to_reply: 3160,
    ack_cached: 1,
    error: 0,
    interrupted: 0,
    pressed: 1
  })
  assert.ok(!JSON.stringify(parsed).includes('nút'))
})

test('a report that is not one is refused: no object, no id, a malformed id, not JSON, too large', async () => {
  const { signals, post } = door()
  for (const [body, code] of [
    ['[1,2]', 'INVALID_TRACE'],
    ['null', 'INVALID_TRACE'],
    ['{"speechToReply":1}', 'INVALID_TRACE_ID'],
    [JSON.stringify({ ...REPORT, id: 'short' }), 'INVALID_TRACE_ID'],
    [JSON.stringify({ ...REPORT, id: 'has spaces in it' }), 'INVALID_TRACE_ID'],
    ['{"id":', 'INVALID_TRACE']
  ]) {
    const res = await post(body)
    assert.equal(res.status, 400, body)
    assert.deepEqual(await res.json(), { code })
  }
  const large = await post(JSON.stringify({ ...REPORT, padding: 'x'.repeat(VOICE_TRACE_MAX_BYTES) }))
  assert.equal(large.status, 413)
  assert.deepEqual(await large.json(), { code: 'TRACE_TOO_LARGE' })
  assert.equal(signals.events.length, 0)
})

test('an account reports at most so many turns an hour; past that the door refuses and keeps nothing', async () => {
  const { signals, post } = door()
  for (let i = 0; i < VOICE_TRACES_PER_HOUR; i += 1)
    assert.equal((await post({ ...REPORT, id: `turn-${String(i).padStart(6, '0')}` })).status, 200)
  const over = await post({ ...REPORT, id: 'turn-one-too-many' })
  assert.equal(over.status, 429)
  assert.deepEqual(await over.json(), { code: 'RATE_LIMITED' })
  assert.equal(signals.events.length, VOICE_TRACES_PER_HOUR)
  // Another account has its own count.
  assert.equal((await post({ ...REPORT, id: 'bob-turn-000001' }, { email: 'bob@example.com' })).status, 200)
})

test('through the whole app: a customer page on a sibling site is refused; Tracy’s own page may send JSON or the beacon’s text', async () => {
  const ORIGIN = 'http://tracy.test'
  const config = readConfig({
    TRACY_ORIGIN: ORIGIN,
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  const app = buildApp({ config, identity: memoryIdentityStore(), mail: { send: async () => {} } })
  const session = `tracy_sess=${await mintSession('ana@example.com', 's'.repeat(32))}`
  const send = (headers, body = JSON.stringify(REPORT)) =>
    app.fetch(new Request(`${ORIGIN}/api/speech/trace`, { method: 'POST', headers, body }))
  const sibling = await send({
    cookie: session,
    origin: 'http://acme.tracy.test',
    'sec-fetch-site': 'same-site',
    'content-type': 'text/plain'
  })
  assert.equal(sibling.status, 403)
  for (const type of ['application/json', 'text/plain;charset=UTF-8']) {
    const own = await send({
      cookie: session,
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'content-type': type
    })
    assert.equal(own.status, 200, type)
  }
  // A form is still no report.
  const form = await send({
    cookie: session,
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/x-www-form-urlencoded'
  })
  assert.equal(form.status, 415)
})

test('the Usage rules: no median under 20 turns, no 95th percentile under 100; a press’s turn is counted, never timed', () => {
  assert.equal(MIN_FOR_MEDIAN, MIN_FOR_RATE, 'the same rule as Beta › Usage')
  assert.equal(MIN_FOR_P95, MIN_FOR_P90)
  const values = (n) => Array.from({ length: n }, (_, i) => i + 1)
  assert.deepEqual(percentiles(values(19)), { n: 19, p50: null, p95: null })
  assert.deepEqual(percentiles(values(20)), { n: 20, p50: 10, p95: null })
  assert.deepEqual(percentiles(values(100)), { n: 100, p50: 50, p95: 95 })
  const row = (data) => ({ data: { speech_to_reply: 1000, ...data } })
  const summary = summarizeVoiceTurns([
    ...Array.from({ length: 18 }, () => row({})),
    row({ error: 1 }),
    row({ interrupted: 1 }),
    row({ pressed: 1, speech_to_reply: 90_000 })
  ])
  assert.equal(summary.turns, 21)
  assert.equal(summary.pressed, 1)
  assert.deepEqual(summary.spans.speechToReply, { n: 20, p50: 1000, p95: null })
  assert.deepEqual(summary.errors, { a: 1, b: 21, rate: 0.048 })
  assert.deepEqual(summary.interrupted, { a: 1, b: 21, rate: 0.048 })
  assert.deepEqual(summary.spans.sentToAck, { n: 0, p50: null, p95: null })
  assert.deepEqual(summary.ackCached, { a: 0, b: 0, rate: null })
})
