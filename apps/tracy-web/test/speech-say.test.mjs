// Voice conversation's spoken replies (`src/speech/say.js`): the door that reads the start of Tracy's
// reply out loud — its switches, its limits, the service's answers, and what it never logs.
import { test } from 'node:test'
import { Hono } from 'hono'
import { createSpeechHealth } from '../src/lib/speech-health.js'
import assert from 'node:assert/strict'
import { memoryRateLimiter } from '../src/lib/rate.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import {
  ANONYMOUS_SPEECH,
  SPEAK_LIMITS,
  SPEAK_SERVICE,
  SPEAK_VOICES,
  speechSwitchOn
} from '../src/lib/speech.js'
import { switchWatch } from '../src/lib/speech-switch.js'
import { mountSpeak, parseSpeakRequest, providerRefusal } from '../src/speech/say.js'
import { speechRoutes } from '../src/speech/route.js'

const SECRET = 'speech-say-secret'
const EMAIL = 'ana@example.com'
const cookie = async () => `${SESSION_COOKIE}=${await mintSession(EMAIL, SECRET)}`
const REPLY = 'Xong rồi. Mình đã đổi nút liên hệ sang màu xanh lá.'

/**
 * A database stand-in: the voice switch as given (an Error makes the read throw), no saved key, and
 * the `rate_bucket` counts kept in a map the test reads.
 */
function poolWith({ voice = true } = {}) {
  const counts = new Map()
  return {
    counts,
    async query(sql, params) {
      if (sql.includes('ui_setting')) {
        assert.equal(params[0], 'composer-voice-input', 'the one voice switch')
        if (voice instanceof Error) throw voice
        return { rows: [{ on: voice }] }
      }
      if (sql.includes('speech_setting')) return { rows: [] }
      if (sql.includes('rate_bucket')) {
        const [bucket, , amount] = params
        const next = Math.max(0, (counts.get(bucket) ?? 0) + amount)
        counts.set(bucket, next)
        return { rows: [{ count: next }] }
      }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

/** The speech service stand-in: records each request, answers with `answer(request)`. */
function serviceWith(answer) {
  const asked = []
  const fetchImpl = async (url, init) => {
    const request = { url: new URL(String(url)), init, body: JSON.parse(init.body) }
    asked.push(request)
    return answer(request)
  }
  return { asked, fetchImpl }
}

const pcm = (bytes) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes.slice(0, 3)))
        controller.enqueue(new Uint8Array(bytes.slice(3)))
        controller.close()
      }
    }),
    { status: 200 }
  )

function door({ pool = poolWith(), fetchImpl, speech = { apiKey: 'sk_test' }, health } = {}) {
  const lines = []
  const log = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')) }
  const app = speechRoutes({
    config: { sessionSecret: SECRET, speech },
    pool,
    fetchImpl,
    log,
    ...(health ? { health } : {})
  })
  return { app, lines, pool }
}

const say = async (app, body, headers = {}) =>
  app.request('/api/speech/say', {
    method: 'POST',
    headers: { cookie: await cookie(), 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })

test('POST /api/speech/say streams the reply spoken, as raw PCM at the rate it says', async () => {
  const sound = [1, 2, 3, 4, 5, 6, 7, 8]
  const service = serviceWith(() => pcm(sound))
  const { app, lines, pool } = door({ fetchImpl: service.fetchImpl })
  const res = await say(app, { text: `  ${REPLY}  `, voice: SPEAK_VOICES[3].id, language: 'VI' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/octet-stream')
  assert.equal(res.headers.get('x-sample-rate'), String(SPEAK_SERVICE.sampleRate))
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], sound)

  const [asked] = service.asked
  assert.equal(asked.url.pathname, `/v1/text-to-speech/${SPEAK_VOICES[3].id}/stream`)
  assert.equal(asked.url.searchParams.get('output_format'), SPEAK_SERVICE.format)
  assert.equal(asked.init.headers['xi-api-key'], 'sk_test')
  assert.deepEqual(asked.body, { text: REPLY, model_id: SPEAK_SERVICE.model, language_code: 'vi' })

  // Counted per account and for the deployment, by characters (not UTF-16 units).
  assert.equal(pool.counts.get(`speak-chars:${EMAIL}`), [...REPLY].length)
  assert.equal(pool.counts.get('speak-chars'), [...REPLY].length)
  // One line, with no word of the reply and no key.
  assert.equal(lines.length, 1)
  assert.match(lines[0], /said \d+ characters, done, first sound \d+ ms/)
  assert.ok(!lines[0].includes('Xong') && !lines[0].includes('sk_test'))
})

test('the default voice when none is named, and no language the service is not told about', async () => {
  const service = serviceWith(() => pcm([0, 0]))
  const { app } = door({ fetchImpl: service.fetchImpl })
  assert.equal((await say(app, { text: 'Done.', language: 'ja' })).status, 200)
  assert.equal(service.asked[0].url.pathname, `/v1/text-to-speech/${SPEAK_VOICES[0].id}/stream`)
  assert.equal('language_code' in service.asked[0].body, false)
})

test('a request it cannot read is 400, and costs nothing', async () => {
  const service = serviceWith(() => pcm([0, 0]))
  const { app, pool } = door({ fetchImpl: service.fetchImpl })
  const code = async (body) => (await (await say(app, body)).json()).code
  assert.equal(await code({}), 'TEXT_MISSING')
  assert.equal(await code({ text: '   ' }), 'TEXT_MISSING')
  assert.equal(await code({ text: 'a'.repeat(SPEAK_LIMITS.maxChars + 1) }), 'TEXT_TOO_LONG')
  assert.equal(await code({ text: 'Done.', voice: 'not-a-voice' }), 'VOICE_UNKNOWN')
  assert.equal(service.asked.length, 0)
  assert.equal(pool.counts.size, 0)
  // Exactly the limit is read.
  assert.equal(parseSpeakRequest({ text: 'ở'.repeat(SPEAK_LIMITS.maxChars) }).ok, true)
})

test('without a session it is 401; voice off or no key is 404', async () => {
  const { app } = door({ fetchImpl: serviceWith(() => pcm([0])).fetchImpl })
  const res = await app.request('/api/speech/say', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Done.' })
  })
  assert.equal(res.status, 401)
  for (const setup of [{ pool: poolWith({ voice: false }) }, { pool: poolWith(), speech: null }]) {
    const service = serviceWith(() => pcm([0]))
    const { app: off } = door({ ...setup, fetchImpl: service.fetchImpl })
    const answer = await say(off, { text: 'Done.' })
    assert.equal(answer.status, 404)
    assert.deepEqual(await answer.json(), { code: 'VOICE_OFF' })
    assert.equal(service.asked.length, 0)
  }
  // No database (a laptop): the catalogue default, which is on, and the characters counted in memory.
  const service = serviceWith(() => pcm([0, 0]))
  const { app: laptop } = door({ pool: null, fetchImpl: service.fetchImpl })
  assert.equal((await say(laptop, { text: 'Done.' })).status, 200)
})

test('a switch the database cannot read refuses for now (503), never reads aloud', async () => {
  const service = serviceWith(() => pcm([0]))
  const { app } = door({
    pool: poolWith({ voice: new Error('database down') }),
    fetchImpl: service.fetchImpl
  })
  const res = await say(app, { text: 'Done.' })
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { code: 'SPEAK_UNAVAILABLE' })
  assert.equal(service.asked.length, 0)
})

test('over the account’s characters for today is 429, and the refused reading costs nothing', async () => {
  const service = serviceWith(() => pcm([0, 0]))
  const pool = poolWith()
  pool.counts.set(`speak-chars:${EMAIL}`, SPEAK_LIMITS.accountCharsPerDay - 3)
  pool.counts.set('speak-chars', 100)
  const { app } = door({ pool, fetchImpl: service.fetchImpl })
  const res = await say(app, { text: 'Done now.' })
  assert.equal(res.status, 429)
  assert.deepEqual(await res.json(), { code: 'SPEAK_QUOTA' })
  assert.equal(service.asked.length, 0)
  assert.equal(pool.counts.get(`speak-chars:${EMAIL}`), SPEAK_LIMITS.accountCharsPerDay - 3)
  assert.equal(pool.counts.get('speak-chars'), 100)
  // What is left still reads.
  assert.equal((await say(app, { text: 'Ok.' })).status, 200)
})

test('the service refusing gives the characters back: a bad key is 502, its own rate 503', async () => {
  for (const [status, expected] of [
    [401, { status: 502, code: 'SPEAK_PROVIDER' }],
    [429, { status: 503, code: 'SPEAK_PROVIDER_BUSY' }],
    [500, { status: 502, code: 'SPEAK_PROVIDER' }]
  ]) {
    assert.deepEqual(providerRefusal(status), expected)
    const service = serviceWith(
      () => new Response(JSON.stringify({ detail: { status: 'refused_here', message: REPLY } }), { status })
    )
    const { app, pool, lines } = door({ fetchImpl: service.fetchImpl })
    const res = await say(app, { text: REPLY })
    assert.equal(res.status, expected.status)
    assert.deepEqual(await res.json(), { code: expected.code })
    assert.equal(pool.counts.get(`speak-chars:${EMAIL}`), 0)
    assert.equal(pool.counts.get('speak-chars'), 0)
    assert.match(lines.join('\n'), new RegExp(`refused ${status} refused_here`))
    assert.ok(
      !lines.join('\n').includes('Xong'),
      'the service’s message, which may quote the reply, is not logged'
    )
  }
  const unreachable = door({
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }
  })
  const res = await say(unreachable.app, { text: 'Done.' })
  assert.equal(res.status, 502)
  assert.equal(unreachable.pool.counts.get('speak-chars'), 0)
})

test('letting go of the reading cuts the service’s stream too', async () => {
  let aborted = false
  let pulls = 0
  const service = serviceWith(({ init }) => {
    init.signal.addEventListener('abort', () => {
      aborted = true
    })
    return new Response(
      new ReadableStream({
        pull(controller) {
          pulls += 1
          controller.enqueue(new Uint8Array(4800))
          return new Promise((resolve) => setTimeout(resolve, 5))
        }
      }),
      { status: 200 }
    )
  })
  const { app, lines } = door({ fetchImpl: service.fetchImpl })
  const res = await say(app, { text: REPLY })
  const reader = res.body.getReader()
  await reader.read()
  await reader.cancel()
  assert.equal(aborted, true)
  const before = pulls
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.ok(pulls <= before + 1, 'nothing more is asked of the service once the page let go')
  assert.match(lines.at(-1), /let go/)
})

test('what a reading meets is told by the service’s word: a made-up key (400) refuses, credits used up only limit', async () => {
  for (const [status, detail, outcome] of [
    // As the service answered a made-up key, 18/10/2026.
    [400, { status: 'invalid_api_key', code: 'invalid_api_key', type: 'authentication_error' }, 'refused'],
    [401, { status: 'quota_exceeded' }, 'limited'],
    [429, { status: 'too_many_concurrent_requests' }, undefined]
  ]) {
    const health = createSpeechHealth()
    const service = serviceWith(() => new Response(JSON.stringify({ detail }), { status }))
    const { app } = door({ fetchImpl: service.fetchImpl, health })
    await say(app, { text: REPLY })
    assert.equal(health.get().tts?.outcome, outcome, JSON.stringify(detail))
  }
  // A reading begun under a key that was then replaced says nothing of the new one.
  const health = createSpeechHealth()
  const service = serviceWith(() => {
    health.reset()
    return new Response(JSON.stringify({ detail: { status: 'invalid_api_key' } }), { status: 400 })
  })
  const { app } = door({ fetchImpl: service.fetchImpl, health })
  await say(app, { text: REPLY })
  assert.equal(health.get().tts, null)
})

test('a reading under way outlives a voice switch the database cannot read; Voice turned off still cuts it', async () => {
  for (const later of [new Error('database down'), false]) {
    let reads = 0
    const pool = poolWith()
    const query = pool.query.bind(pool)
    // The door's own fresh read before the reading starts says on; every read after it is `later`.
    pool.query = async (sql, params) => {
      if (sql.includes('ui_setting') && reads++ > 0) {
        if (later instanceof Error) throw later
        return { rows: [{ on: later }] }
      }
      return query(sql, params)
    }
    let aborted = false
    const service = serviceWith(({ init }) => {
      init.signal.addEventListener('abort', () => {
        aborted = true
      })
      return new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(4800))
            return new Promise((resolve) => setTimeout(resolve, 5))
          }
        }),
        { status: 200 }
      )
    })
    const app = new Hono()
    const memory = memoryRateLimiter()
    mountSpeak(app, {
      config: { sessionSecret: SECRET, speech: { apiKey: 'sk_test' } },
      pool,
      count: async (bucket, amount, max, windowMs) =>
        memory.overLimitBy(bucket, amount, max, Date.now(), windowMs),
      fetchImpl: service.fetchImpl,
      log: { log() {}, warn() {} },
      switchEveryMs: 20,
      watchSwitch: switchWatch(() => speechSwitchOn(pool), { freshMs: 0 })
    })
    const res = await say(app, { text: REPLY })
    assert.equal(res.status, 200)
    const reader = res.body.getReader()
    try {
      await reader.read()
      // Longer than one watch of the switch ever was (1 s).
      await new Promise((resolve) => setTimeout(resolve, 1200))
      assert.ok(reads > 3, 'the switch was asked again and again')
      assert.equal(aborted, later === false, later instanceof Error ? 'unreadable is not off' : 'off is off')
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
})

test('an anonymous widget visitor reads from a smaller day, counted in every anonymous visitor’s day too', async () => {
  const visitor = 'widget-guest+0123456789abcdef@widget.invalid'
  const as = async (email) => `${SESSION_COOKIE}=${await mintSession(email, SECRET)}`
  const service = serviceWith(() => pcm([0, 0]))
  const pool = poolWith()
  const { app } = door({ pool, fetchImpl: service.fetchImpl })
  assert.equal((await say(app, { text: REPLY }, { cookie: await as(visitor) })).status, 200)
  const chars = [...REPLY].length
  assert.equal(pool.counts.get(`speak-chars:${visitor}`), chars)
  assert.equal(pool.counts.get('speak-chars'), chars)
  assert.equal(pool.counts.get(`speak-chars:${ANONYMOUS_SPEECH.bucket}`), chars)
  assert.ok(ANONYMOUS_SPEECH.totalCharsPerDay <= SPEAK_LIMITS.totalCharsPerDay / 2)
  // Its own day is the visitor's, not a person's.
  pool.counts.set(`speak-chars:${visitor}`, ANONYMOUS_SPEECH.visitorCharsPerDay - 3)
  const over = await say(app, { text: 'Done now.' }, { cookie: await as(visitor) })
  assert.equal(over.status, 429)
  assert.deepEqual(await over.json(), { code: 'SPEAK_QUOTA' })
  assert.equal(pool.counts.get(`speak-chars:${ANONYMOUS_SPEECH.bucket}`), chars, 'given back')
  // Every anonymous visitor together: another visitor is refused once their shared day is used.
  pool.counts.set(`speak-chars:${ANONYMOUS_SPEECH.bucket}`, ANONYMOUS_SPEECH.totalCharsPerDay)
  const shared = await say(
    app,
    { text: 'Ok.' },
    { cookie: await as('widget-guest+fedcba9876543210@widget.invalid') }
  )
  assert.equal(shared.status, 429)
  // A person is counted as before, in two buckets only.
  assert.equal((await say(app, { text: 'Ok.' })).status, 200)
  assert.equal(pool.counts.get(`speak-chars:${ANONYMOUS_SPEECH.bucket}`), ANONYMOUS_SPEECH.totalCharsPerDay)
  assert.equal(service.asked.length, 2)
})
