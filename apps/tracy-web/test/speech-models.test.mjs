import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifySpeechModels,
  discoverSpeechModels,
  readSpeechModels,
  saveSpeechModels
} from '../src/lib/speech-models.js'
import { parseSpeechProfile, speechTtsRequest } from '../src/lib/speech-provider.js'
import { speechOpsRoutes } from '../src/ops/speech.js'
import { mintSession } from '../src/lib/session.js'
const secret = 'speech-model-tests-only',
  origin = 'https://voice.test'
const cloud = {
  provider: 'elevenlabs',
  configured: true,
  key: 'private-key-never-return',
  profile: { sttModel: 'scribe_v2_realtime', ttsModel: 'eleven_flash_v2_5' }
}
const local = {
  provider: 'voicestudio',
  configured: true,
  key: 'local-token-never-return',
  profile: { baseUrl: 'http://127.0.0.1:47990', ttsModel: 'omnivoice', voice: 'default' }
}
const payload = [
  { model_id: 'eleven_v4', name: 'Eleven v4', can_do_text_to_speech: true },
  { model_id: 'eleven_v3', can_do_text_to_speech: true },
  { model_id: 'eleven_flash_v2_5', can_do_text_to_speech: true },
  { model_id: 'eleven_english_sts_v2', can_do_text_to_speech: false },
  { model_id: 'future_model', can_do_text_to_speech: true }
]
function database() {
  const db = { cache: null, role: 'admin', active: 'voicestudio', writes: 0 }
  db.query = async (sql, args) => {
    if (sql.includes('seat_workspace')) return { rows: db.role ? [{ role: db.role }] : [] }
    if (sql.includes('select provider')) return { rows: [] }
    if (sql.startsWith('select models')) return { rows: db.cache ? [db.cache] : [] }
    if (sql.startsWith('insert into speech_model_cache')) {
      db.cache = { models: JSON.parse(args[1]), read_at: args[2], fingerprint: args[3] }
      db.writes++
      return { rows: [] }
    }
    throw Error('Unexpected query: ' + sql)
  }
  return db
}

test('speech models classify fetched TTS and official STT without inventing API capabilities', () => {
  const models = classifySpeechModels('elevenlabs', payload)
  assert.equal(models.find((m) => m.id === 'scribe_v2_realtime').source, 'official-catalog')
  assert.equal(models.find((m) => m.id === 'scribe_v2').selectable, false)
  assert.equal(models.find((m) => m.id === 'eleven_v3').selectable, true)
  assert.equal(models.find((m) => m.id === 'eleven_v4').selectable, true)
  for (const id of ['eleven_english_sts_v2', 'future_model'])
    assert.equal(models.find((m) => m.id === id).selectable, false)
  const localModels = classifySpeechModels('voicestudio', {
    data: [
      { id: 'omnivoice', voicestudio: { kind: 'tts', alias_for_active_engine: false } },
      { id: 'gpt-4o-mini-tts', voicestudio: { kind: 'tts', alias_for_active_engine: true } },
      { id: 'mlx-whisper', voicestudio: { kind: 'stt', alias_for_active_engine: false } }
    ]
  })
  assert.equal(localModels[0].selectable, true)
  assert.equal(localModels[1].selectable, false)
  assert.equal(localModels[2].selectable, false)
  assert.throws(() => classifySpeechModels('voicestudio', { data: 'wrong' }))
})
test('speech model refresh uses sealed-server credentials, fixed metadata routes, bounded response and safe errors', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push([url, init])
    return Response.json(payload)
  }
  assert.ok((await discoverSpeechModels(cloud, { fetchImpl })).models)
  assert.equal(seen[0][0], 'https://api.elevenlabs.io/v1/models')
  assert.equal(seen[0][1].headers['xi-api-key'], cloud.key)
  assert.equal(seen[0][1].redirect, 'error')
  await discoverSpeechModels(local, {
    localFetch: async (url, init) => {
      assert.equal(url, local.profile.baseUrl + '/v1/models')
      assert.equal(init.headers.authorization, 'Bearer ' + local.key)
      return Response.json({ data: [] })
    }
  })
  assert.deepEqual(
    await discoverSpeechModels(cloud, {
      fetchImpl: async () => new Response('sensitive upstream body', { status: 401 })
    }),
    { error: 'PROVIDER_REFUSED', status: 401 }
  )
  assert.deepEqual(
    await discoverSpeechModels(cloud, {
      fetchImpl: async () => {
        throw Error(cloud.key)
      }
    }),
    { error: 'MODEL_LIST_UNAVAILABLE' }
  )
  assert.deepEqual(
    await discoverSpeechModels(cloud, {
      fetchImpl: async () => Response.json([{ model_id: 'test', name: cloud.key }])
    }),
    { error: 'MODEL_LIST_INVALID' }
  )
  assert.deepEqual(
    await discoverSpeechModels(cloud, { fetchImpl: async () => new Response('x'.repeat(1_000_001)) }),
    { error: 'MODEL_LIST_UNAVAILABLE' }
  )
})
test('speech model cache refresh never changes profile/revision; credential changes mark old list stale', async () => {
  const db = database()
  await saveSpeechModels(db, cloud, secret, classifySpeechModels('elevenlabs', payload), 12345)
  const cached = await readSpeechModels(db, cloud, secret)
  assert.equal(cached.stale, false)
  assert.equal(cached.inferenceTested, false)
  assert.equal(cached.fetchedCount, payload.length)
  assert.equal(db.active, 'voicestudio')
  assert.equal((await readSpeechModels(db, { ...cloud, key: 'rotated-key' }, secret)).stale, true)
  assert.ok(!JSON.stringify(db.cache).includes(cloud.key))
})
test('speech model ops list guards admin/origin and preserves cached list on failed refresh', async () => {
  const db = database(),
    config = { origin, sessionSecret: secret, speech: { apiKey: cloud.key } },
    cookie = 'tracy_sess=' + (await mintSession('owner@example.test', secret))
  let refused = false,
    calls = 0
  const app = speechOpsRoutes({
    pool: db,
    config,
    fetchImpl: async () => {
      calls++
      return refused ? new Response('secret', { status: 429 }) : Response.json(payload)
    }
  })
  const request = (method = 'POST', headers = { cookie, origin }) =>
    app.request('/api/ops/speech/providers/elevenlabs/models', { method, headers })
  assert.equal((await request('POST', { cookie, origin: 'https://evil.test' })).status, 403)
  db.role = 'staff'
  assert.equal((await request()).status, 403)
  assert.equal((await request('GET')).status, 200)
  db.role = 'admin'
  assert.equal((await request('POST', {})).status, 302)
  assert.equal(calls, 0)
  const ok = await (await request()).json()
  assert.ok(ok.models.length)
  const before = JSON.stringify(ok.models),
    writes = db.writes
  refused = true
  const failed = await (await request()).json()
  assert.equal(failed.error, 'PROVIDER_REFUSED')
  assert.equal(JSON.stringify(failed.models), before)
  assert.equal(db.writes, writes)
  assert.ok(!JSON.stringify(failed).includes(cloud.key))
})
test('speech Apply rejects incompatible models and never pretends VoiceStudio STT selection works', () => {
  for (const id of ['eleven_v3_conversational', 'future_model'])
    assert.equal(
      parseSpeechProfile({ provider: 'elevenlabs', profile: { ...cloud.profile, ttsModel: id } }).ok,
      false
    )
  assert.equal(
    parseSpeechProfile({ provider: 'elevenlabs', profile: { ...cloud.profile, sttModel: 'scribe_v2' } }).ok,
    false
  )
  assert.equal(
    parseSpeechProfile({ provider: 'voicestudio', profile: { ...local.profile, sttModel: 'mlx-whisper' } })
      .error,
    'STT_MODEL_READ_ONLY'
  )
  assert.equal(parseSpeechProfile({ provider: 'voicestudio', profile: local.profile }).ok, true)
  assert.equal(
    JSON.parse(
      speechTtsRequest(
        { ...cloud, profile: { ...cloud.profile, ttsModel: 'eleven_multilingual_v2' } },
        { text: 'Hello', voice: 'voice', language: 'vi' }
      ).body
    ).language_code,
    undefined
  )
})
