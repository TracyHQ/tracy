// Voice input's HTTP doors (`src/speech/route.js`): whether the chat box draws its microphone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { speechRoutes } from '../src/speech/route.js'
import { SPEECH_LIMITS } from '../src/speech/relay.js'
import { SPEAK_LIMITS, SPEAK_SERVICE, SPEAK_VOICES } from '../src/lib/speech.js'

const SECRET = 'speech-route-secret'
const cookie = async () => `${SESSION_COOKIE}=${await mintSession('ana@example.com', SECRET)}`

test('GET /api/speech: available with a key, off without one, and the limits the chat box shows', async () => {
  const on = speechRoutes({ config: { sessionSecret: SECRET, speech: { apiKey: 'k' } } })
  const res = await on.request('/api/speech', { headers: { cookie: await cookie() } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()
  const { revision, provider, actualProvider, fallbackUsed, transcriptWaitMs, capabilities, ...legacy } = body
  assert.equal(capabilities.tts.streaming, true)
  assert.equal(capabilities.stt.sampleRate, 16000)
  assert.equal(provider, 'elevenlabs')
  assert.equal(actualProvider, 'elevenlabs')
  assert.equal(fallbackUsed, false)
  assert.equal(transcriptWaitMs, 6000)
  assert.match(revision, /^[a-f0-9]{24}$/)
  assert.deepEqual(legacy, {
    available: true,
    sessionSeconds: SPEECH_LIMITS.sessionSeconds,
    silenceSeconds: SPEECH_LIMITS.silenceSeconds,
    voices: SPEAK_VOICES.map(({ id, name }) => ({ id, name })),
    speak: { maxChars: SPEAK_LIMITS.maxChars, sampleRate: SPEAK_SERVICE.sampleRate, answerMs: 10_000 }
  })
  assert.ok(!JSON.stringify(body).includes('"k"'), 'the key is never in an answer')
  const off = speechRoutes({ config: { sessionSecret: SECRET, speech: null } })
  assert.equal(
    (await (await off.request('/api/speech', { headers: { cookie: await cookie() } })).json()).available,
    false
  )
})

test('GET /api/speech without a session is 401 NOT_SIGNED_IN', async () => {
  const app = speechRoutes({ config: { sessionSecret: SECRET, speech: { apiKey: 'k' } } })
  const res = await app.request('/api/speech')
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { code: 'NOT_SIGNED_IN' })
})

test('GET /api/speech/stream over plain HTTP is 426, never a page from the dsh catch-all', async () => {
  const app = speechRoutes({ config: { sessionSecret: SECRET, speech: { apiKey: 'k' } } })
  const res = await app.request('/api/speech/stream')
  assert.equal(res.status, 426)
  assert.equal(res.headers.get('upgrade'), 'websocket')
  assert.deepEqual(await res.json(), { code: 'UPGRADE_REQUIRED' })
})

test('GET /api/speech: the operator’s voice switch off, or unreadable, is unavailable', async () => {
  const poolOf = (answer) => ({
    async query(sql) {
      if (sql.includes('speech_setting')) return { rows: [] }
      assert.match(sql, /ui_setting/)
      if (answer instanceof Error) throw answer
      return { rows: [{ on: answer }] }
    }
  })
  const ask = async (pool) =>
    (
      await (
        await speechRoutes({ config: { sessionSecret: SECRET, speech: { apiKey: 'k' } }, pool }).request(
          '/api/speech',
          { headers: { cookie: await cookie() } }
        )
      ).json()
    ).available
  assert.equal(await ask(poolOf(false)), false)
  assert.equal(await ask(poolOf(true)), true)
  assert.equal(await ask(poolOf(new Error('database down'))), false)
})

test('GET /api/speech: a key saved on /ops makes voice available with no key in the environment', async () => {
  const { sealSecret } = await import('../src/lib/secret-box.js')
  const cipher = await sealSecret('sk_saved', SECRET)
  const pool = {
    async query(sql) {
      if (sql.includes('speech_setting'))
        return { rows: [{ api_key_cipher: cipher, updated_by: 'a', updated_at: new Date() }] }
      return { rows: [] }
    }
  }
  const res = await speechRoutes({ config: { sessionSecret: SECRET, speech: null }, pool }).request(
    '/api/speech',
    {
      headers: { cookie: await cookie() }
    }
  )
  assert.equal((await res.json()).available, true)
})
