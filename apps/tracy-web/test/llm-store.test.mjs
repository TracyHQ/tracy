// The provider book: what a row means, and the three ways a careless one would leak or lie.

import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import * as llmStoreForTest from '../src/lib/llm-store.js'
import {
  assignDoor,
  deleteProvider,
  readAssignments,
  readProviders,
  resolveDoor,
  saveProvider
} from '../src/lib/llm-store.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const SECRET = 's'.repeat(32)

test('a saved provider keeps its key sealed, and the row never carries plaintext', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-secret-abc' },
    SECRET,
    'me@tracy.test'
  )
  const { rows } = await pool.query('select api_key_cipher from llm_provider where id = $1', ['deepseek'])
  assert.ok(!rows[0].api_key_cipher.includes('sk-secret-abc'), 'plaintext reached the table')
  assert.match(rows[0].api_key_cipher, /^v1\./)
})

test('reading providers for a SCREEN never answers a key — only a hint', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-secret-abc' },
    SECRET,
    'me@tracy.test'
  )
  const list = await readProviders(pool, SECRET)
  const row = list.find((p) => p.id === 'deepseek')
  assert.equal(row.configured, true)
  assert.equal(row.keyHint, 'sk-… (13 chars)')
  assert.ok(!JSON.stringify(list).includes('sk-secret-abc'), 'a key reached the screen payload')
})

test('saving without an apiKey field keeps the key that is already there', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-first' },
    SECRET,
    'me@tracy.test'
  )
  // Editing the base URL must not silently clear the credential — the screen does not send a key
  // it never showed, so "absent" has to mean "unchanged", not "erase".
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', baseUrl: 'https://x.test' },
    SECRET,
    'me@tracy.test'
  )
  const row = (await readProviders(pool, SECRET)).find((p) => p.id === 'deepseek')
  assert.equal(row.configured, true)
  assert.equal(row.baseUrl, 'https://x.test')
  // And an explicit empty string DOES clear it — that is the deliberate "remove this key".
  await saveProvider(pool, { id: 'deepseek', presetId: 'deepseek', apiKey: '' }, SECRET, 'me@tracy.test')
  assert.equal((await readProviders(pool, SECRET)).find((p) => p.id === 'deepseek').configured, false)
})

test('resolveDoor hands back the real key, the base url and the model', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-or-live', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(
    pool,
    'web',
    { providerId: 'openrouter', model: 'deepseek/deepseek-chat-v3.1' },
    'me@tracy.test'
  )
  const door = await resolveDoor(pool, 'web', SECRET)
  assert.equal(door.apiKey, 'sk-or-live')
  assert.equal(door.baseUrl, 'https://openrouter.ai/api/v1')
  assert.equal(door.model, 'deepseek/deepseek-chat-v3.1')
})

test('a door assigned to a DISABLED provider resolves to nothing, rather than to a key', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-or-live', enabled: false },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(pool, 'web', { providerId: 'openrouter', model: 'm' }, 'me@tracy.test')
  // `enabled` is the switch a person flips to take a provider out of service. If a door kept
  // using it anyway, the switch would be decoration.
  assert.equal(await resolveDoor(pool, 'web', SECRET), null)
})

test('a provider still doing a job cannot be deleted out from under it', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'k', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(pool, 'web', { providerId: 'openrouter', model: 'm' }, 'me@tracy.test')
  const result = await deleteProvider(pool, 'openrouter')
  assert.equal(result.error, 'PROVIDER_IN_USE')
  assert.deepEqual(result.doors, ['web'])
  assert.equal((await readProviders(pool, SECRET)).length, 1)
})

test('a key sealed under a rotated secret reads as no key, not as a broken row', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-old', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  const list = await readProviders(pool, 'x'.repeat(32))
  assert.equal(list[0].configured, false)
  assert.equal(list[0].keyHint, null)
  // The screen must be able to SAY this, rather than showing an ordinary unconfigured provider:
  // the fix (type the key again) is different from the fix for one that was never set.
  assert.equal(list[0].keyUnreadable, true)
})

test('readAssignments answers every door, named, even the ones nobody assigned', opts, async () => {
  const { pool } = db
  const all = await readAssignments(pool)
  assert.deepEqual(Object.keys(all).sort(), [
    'agent',
    'assistant',
    'seedImage',
    'seedText',
    'vision',
    'web',
    'woEditorial'
  ])
  assert.equal(all.web, null)
})

// ── The fallback that makes this table optional ───────────────────────────────────────────────

test('modelForDoor prefers the book, and falls back to the environment unchanged', opts, async () => {
  const { pool } = db
  const { modelForDoor } = await import('../src/lib/llm-door.js')
  const fromEnv = { apiKey: 'sk-env', baseUrl: 'https://env.test/v1', words: 'env-model' }
  // Nothing configured: the door gets exactly what `config.js` read from the environment, so a
  // deployment that never opens the screen behaves as it did before these tables existed.
  assert.deepEqual(await modelForDoor(pool, 'web', { model: fromEnv, sessionSecret: SECRET }), fromEnv)

  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-book', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(pool, 'web', { providerId: 'openrouter', model: 'book-model' }, 'me@tracy.test')
  assert.deepEqual(await modelForDoor(pool, 'web', { model: fromEnv, sessionSecret: SECRET }), {
    apiKey: 'sk-book',
    baseUrl: 'https://openrouter.ai/api/v1',
    words: 'book-model'
  })
})

test('modelForDoor answers null when neither the book nor the environment has one', opts, async () => {
  const { pool } = db
  const { modelForDoor } = await import('../src/lib/llm-door.js')
  // `null` is what every one of these doors already treats as "the feature is off" — it must not
  // become an object with empty strings, which would send an empty bearer token to a vendor.
  assert.equal(await modelForDoor(pool, 'web', { model: null, sessionSecret: SECRET }), null)
})

test(
  'modelForDoor without a pool is the environment — a deployment with no database still works',
  opts,
  async () => {
    const { modelForDoor } = await import('../src/lib/llm-door.js')
    const fromEnv = { apiKey: 'sk-env', baseUrl: 'https://env.test/v1', words: 'env-model' }
    assert.deepEqual(await modelForDoor(null, 'web', { model: fromEnv, sessionSecret: SECRET }), fromEnv)
  }
)

// ── An assigned door that cannot answer is NOT the environment's ─────────────────────────────

test('an assigned door whose provider is switched off answers null, not the environment', opts, async () => {
  const { pool } = db
  const { modelForDoor, modelForChain } = await import('../src/lib/llm-door.js')
  const fromEnv = { apiKey: 'sk-env', baseUrl: 'https://env.test/v1', words: 'env-model' }
  const config = { model: fromEnv, sessionSecret: SECRET }
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-book', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(pool, 'web', { providerId: 'openrouter', model: 'book-model' }, 'me@tracy.test')
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', enabled: false },
    SECRET,
    'me@tracy.test'
  )
  const warnings = []
  const log = { warn: (m) => warnings.push(m) }
  assert.equal(await modelForDoor(pool, 'web', config, { log }), null)
  assert.match(warnings[0], /"web".*disabled/)
  // A broken door ends the chain: `assistant` assigned-but-off must not lend out `web`'s budget.
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-ds', enabled: false },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(pool, 'assistant', { providerId: 'deepseek', model: 'q-model' }, 'me@tracy.test')
  assert.equal(await modelForChain(pool, ['assistant', 'web'], config, { log }), null)
  // An unassigned door in the chain still falls through to the next one, then the environment.
  assert.equal((await modelForChain(pool, ['seedText', 'web'], config, { log })).words, 'book-model')
})

test('an assigned door whose key will not open answers null, not the environment', opts, async () => {
  const { pool } = db
  const { modelForDoor } = await import('../src/lib/llm-door.js')
  const config = {
    model: { apiKey: 'sk-env', baseUrl: 'https://env.test/v1', words: 'm' },
    sessionSecret: SECRET
  }
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-book', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(pool, 'web', { providerId: 'openrouter', model: 'book-model' }, 'me@tracy.test')
  const rotated = { ...config, sessionSecret: 'r'.repeat(32) }
  const warnings = []
  assert.equal(await modelForDoor(pool, 'web', rotated, { log: { warn: (m) => warnings.push(m) } }), null)
  assert.match(warnings[0], /unreadable/)
})

test('saving without a name or address leaves them as they were', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    {
      id: 'custom:gw',
      presetId: null,
      name: 'Gateway',
      baseUrl: 'https://gw.test/v1',
      apiKey: 'sk-gw',
      enabled: false
    },
    SECRET,
    'me@tracy.test'
  )
  const saved = await saveProvider(
    pool,
    { id: 'custom:gw', presetId: null, enabled: true },
    SECRET,
    'me@tracy.test'
  )
  assert.equal(saved.enabled, true)
  assert.equal(saved.name, 'Gateway')
  assert.equal(saved.baseUrl, 'https://gw.test/v1')
})

test('a key pasted with a trailing newline is stored trimmed', opts, async () => {
  const { pool } = db
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-abc\n', enabled: true },
    SECRET,
    'me@tracy.test'
  )
  await assignDoor(pool, 'web', { providerId: 'deepseek', model: 'm' }, 'me@tracy.test')
  assert.equal((await resolveDoor(pool, 'web', SECRET)).apiKey, 'sk-abc')
})

test('a provider on this machine’s own network may run with no key; a public address may not', () => {
  const { onLocalNetwork } = llmStoreForTest
  for (const ok of [
    'http://localhost:11434/v1',
    'http://192.168.1.20:8000/v1',
    'http://litellm.internal/v1',
    'http://10.0.0.5/v1'
  ])
    assert.equal(onLocalNetwork(ok), true, ok)
  for (const no of ['https://api.deepseek.com', 'http://203.0.113.9/v1', 'nonsense'])
    assert.equal(onLocalNetwork(no), false, no)
})
