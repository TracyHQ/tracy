import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { scratchPool } from './_db.mjs'
import {
  readSpeechProfile,
  parseSpeechProfile,
  saveSpeechProfile,
  speechProfileFacts
} from '../src/lib/speech-provider.js'
import { saveSpeechKey } from '../src/lib/speech.js'
import { readSpeechModels, saveSpeechModels } from '../src/lib/speech-models.js'

test('speech providers PostgreSQL: migration preserves a legacy sealed key; atomic Apply keeps each profile and token', {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const { pool, close } = await scratchPool()
  const config = { sessionSecret: 'pg-provider-secret', speech: { apiKey: 'old-env-key' } }
  try {
    await pool.query(
      await readFile(new URL('../src/db/migrations/106-speech-setting.sql', import.meta.url), 'utf8')
    )
    await saveSpeechKey(pool, 'legacy-sealed-key', config.sessionSecret, 'legacy-admin')
    const before = (await pool.query('select api_key_cipher from speech_setting')).rows[0].api_key_cipher
    await pool.query(
      await readFile(new URL('../src/db/migrations/124-speech-provider.sql', import.meta.url), 'utf8')
    )
    let snapshot = await readSpeechProfile(pool, config)
    assert.equal(snapshot.provider, 'elevenlabs')
    assert.equal(snapshot.key, 'legacy-sealed-key')
    assert.equal(
      (await pool.query('select api_key_cipher from speech_setting')).rows[0].api_key_cipher,
      before
    )
    const apply = async (provider, profile) => {
      const parsed = parseSpeechProfile({ provider, profile })
      assert.equal(parsed.ok, true)
      await saveSpeechProfile(pool, parsed, config.sessionSecret, 'new-admin')
      return readSpeechProfile(pool, config)
    }
    const local = {
      baseUrl: 'http://127.0.0.1:3900',
      ttsModel: 'omnivoice',
      voice: 'default',
      fallbackEnabled: true
    }
    snapshot = await apply('voicestudio', { ...local, token: 'sealed-local-token' })
    assert.equal(snapshot.key, 'sealed-local-token')
    const revision = snapshot.revision
    snapshot = await apply('elevenlabs', {
      sttModel: 'scribe_v2_realtime',
      ttsModel: 'eleven_flash_v2_5',
      fallbackEnabled: false
    })
    assert.notEqual(snapshot.revision, revision)
    assert.equal(snapshot.profiles.voicestudio.fallbackEnabled, true)
    assert.equal(snapshot.profile.fallbackEnabled, false)
    snapshot = await apply('voicestudio', local)
    assert.equal(snapshot.key, 'sealed-local-token')
    assert.equal(snapshot.alternative.key, 'legacy-sealed-key')
    assert.equal(snapshot.alternative.alternative, undefined)
    assert.ok(!JSON.stringify(speechProfileFacts(snapshot)).includes('sealed-local-token'))
    assert.equal((await pool.query('select count(*)::int as n from speech_setting')).rows[0].n, 1)
    await pool.query(
      await readFile(new URL('../src/db/migrations/125-speech-model-cache.sql', import.meta.url), 'utf8')
    )
    const unchanged = snapshot.revision
    await saveSpeechModels(
      pool,
      snapshot,
      config.sessionSecret,
      [{ id: 'omnivoice', kind: 'tts', selectable: true }],
      12345
    )
    assert.equal((await readSpeechModels(pool, snapshot, config.sessionSecret)).models[0].id, 'omnivoice')
    assert.equal((await readSpeechProfile(pool, config)).revision, unchanged)
    assert.ok(
      !JSON.stringify((await pool.query('select * from speech_model_cache')).rows).includes(
        'sealed-local-token'
      )
    )
  } finally {
    await close()
  }
})
