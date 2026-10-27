// Voice input's key, typed on /ops instead of set in the environment (`src/lib/speech.js`): saved
// sealed, read back only by the request that needs it, the environment's key as the fallback, and a
// test against the speech service that never says the key.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSpeechKey,
  readSpeechKey,
  saveSpeechKey,
  speechKeyFacts,
  testSpeechKey
} from '../src/lib/speech.js'

const SECRET = 'speech-key-secret'
const KEY = 'sk_live_0123456789abcdef0123456789abcdef'

/** `speech_setting` in memory: the one row, as the two statements the store sends shape it. */
function memoryPool() {
  const pool = {
    row: null,
    async query(sql, params) {
      if (sql.startsWith('select api_key_cipher')) return { rows: pool.row ? [pool.row] : [] }
      if (sql.includes('insert into speech_setting')) {
        pool.row = {
          api_key_cipher: params[0],
          updated_by: params[1],
          updated_at: new Date('2026-10-15T03:00:00Z')
        }
        return { rows: [] }
      }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  return pool
}

test('a key saved on /ops is sealed at rest and used before the environment’s', async () => {
  const pool = memoryPool()
  await saveSpeechKey(pool, KEY, SECRET, 'ops@example.com')
  assert.ok(!pool.row.api_key_cipher.includes(KEY), 'never stored in clear')
  assert.match(pool.row.api_key_cipher, /^v1\./)
  const read = await readSpeechKey(pool, { sessionSecret: SECRET, speech: { apiKey: 'env-key' } })
  assert.deepEqual(read, {
    key: KEY,
    source: 'ops',
    unreadable: false,
    updatedBy: 'ops@example.com',
    updatedAt: '2026-10-15T03:00:00.000Z'
  })
})

test('nothing saved: the environment’s key, or none', async () => {
  const pool = memoryPool()
  assert.equal(
    (await readSpeechKey(pool, { sessionSecret: SECRET, speech: { apiKey: 'env-key' } })).source,
    'env'
  )
  const none = await readSpeechKey(pool, { sessionSecret: SECRET, speech: null })
  assert.equal(none.key, null)
  assert.equal(none.source, null)
  assert.equal(
    (await readSpeechKey(null, { sessionSecret: SECRET, speech: { apiKey: 'env-key' } })).key,
    'env-key'
  )
})

test('an empty key removes the saved one, and the environment’s is used again', async () => {
  const pool = memoryPool()
  await saveSpeechKey(pool, KEY, SECRET, 'a@example.com')
  await saveSpeechKey(pool, '', SECRET, 'b@example.com')
  assert.equal(pool.row.api_key_cipher, null)
  const read = await readSpeechKey(pool, { sessionSecret: SECRET, speech: { apiKey: 'env-key' } })
  assert.equal(read.key, 'env-key')
  assert.equal(read.updatedBy, 'b@example.com')
})

test('a saved key this process cannot open (secret rotated) is said, not used', async () => {
  const pool = memoryPool()
  await saveSpeechKey(pool, KEY, SECRET, 'a@example.com')
  const read = await readSpeechKey(pool, { sessionSecret: 'another-secret', speech: null })
  assert.equal(read.key, null)
  assert.equal(read.unreadable, true)
})

test('what a screen may know: where the key comes from and a hint, never the key', async () => {
  const pool = memoryPool()
  await saveSpeechKey(pool, KEY, SECRET, 'a@example.com')
  const facts = await speechKeyFacts(pool, { sessionSecret: SECRET, speech: null })
  assert.equal(facts.configured, true)
  assert.equal(facts.source, 'ops')
  assert.equal(facts.hint, 'sk_… (40 chars)')
  assert.ok(!JSON.stringify(facts).includes(KEY))
  assert.equal('key' in facts, false)
})

test('a typed key: trimmed, no spaces inside, not too long; empty means remove', () => {
  assert.deepEqual(parseSpeechKey(`  ${KEY} `), { ok: true, key: KEY })
  assert.deepEqual(parseSpeechKey(''), { ok: true, key: '' })
  assert.deepEqual(parseSpeechKey('sk 1'), { ok: false, error: 'KEY_HAS_SPACES' })
  assert.deepEqual(parseSpeechKey('x'.repeat(201)), { ok: false, error: 'KEY_TOO_LONG' })
  assert.deepEqual(parseSpeechKey(42), { ok: false, error: 'KEY_NOT_STRING' })
})

test('the key test asks for a realtime session token and says what the service answered', async () => {
  const asked = []
  const answer = (status, body) => async (url, init) => {
    asked.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }
  assert.deepEqual(await testSpeechKey(KEY, answer(200, { token: 'sutkn_x' })), { ok: true })
  assert.equal(asked[0].url, 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe')
  assert.equal(asked[0].init.method, 'POST')
  assert.equal(asked[0].init.headers['xi-api-key'], KEY)
  const missing = await testSpeechKey(
    KEY,
    answer(401, {
      detail: {
        status: 'missing_permissions',
        message: 'The API key you used is missing the permission speech_to_text to execute this operation.'
      }
    })
  )
  assert.deepEqual(missing, {
    ok: false,
    status: 401,
    reason: 'missing_permissions',
    message: 'The API key you used is missing the permission speech_to_text to execute this operation.'
  })
  const offline = await testSpeechKey(KEY, async () => {
    throw new Error('getaddrinfo ENOTFOUND api.elevenlabs.io')
  })
  assert.equal(offline.ok, false)
  assert.equal(offline.status, 0)
  assert.ok(!JSON.stringify(offline).includes(KEY))
})
