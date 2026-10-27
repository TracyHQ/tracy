/**
 * What /ops pushes to the machine the seeder runs on: the keys, and now which provider and model each
 * seed job was assigned.
 *
 * 🔒 MEASURED 23/09/2026 ON THE DEV HOST: /ops assigned `seedText` to openrouter / openai/gpt-5.4-mini
 * and `seedImage` to openrouter / google/gemini-3.1-flash-lite-image, and the seeder wrote with
 * DeepSeek and drew nothing — the push carried keys only, and the seeder chose a provider by the
 * order of its environment. A choice made on a screen that never reaches the thing it names is
 * worse than no screen: it reads as configured.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { modelKeysFor } from '../src/lib/llm-push.js'

const providers = [
  { providerId: 'deepseek', apiKey: 'ds-key' },
  { providerId: 'openrouter', apiKey: 'or-key' }
]

test('the keys go under the names the seeder and dsh read, as before', () => {
  assert.deepEqual(modelKeysFor({ providers }), { DEEPSEEK_API_KEY: 'ds-key', OPENROUTER_API_KEY: 'or-key' })
})

test('the seed jobs carry their assigned provider and model', () => {
  const keys = modelKeysFor({
    providers,
    seedText: { providerId: 'openrouter', model: 'openai/gpt-5.4-mini' },
    seedImage: { providerId: 'openrouter', model: 'google/gemini-3.1-flash-lite-image' }
  })
  assert.equal(keys.TRACY_SEED_TEXT_PROVIDER, 'openrouter')
  assert.equal(keys.TRACY_SEED_TEXT_MODEL, 'openai/gpt-5.4-mini')
  assert.equal(keys.TRACY_SEED_IMAGE_MODEL, 'google/gemini-3.1-flash-lite-image')
})

test('an assignment to a provider whose key is not pushed is not pushed either', () => {
  // A seeder told "use openrouter" with no openrouter key would fail every build; saying nothing
  // leaves it on the provider it can actually reach.
  const keys = modelKeysFor({
    providers: [{ providerId: 'deepseek', apiKey: 'ds-key' }],
    seedText: { providerId: 'openrouter', model: 'openai/gpt-5.4-mini' },
    seedImage: { providerId: 'openrouter', model: 'google/gemini-3.1-flash-lite-image' }
  })
  assert.deepEqual(keys, { DEEPSEEK_API_KEY: 'ds-key' })
})

test('a provider this machine has no variable for is not named', () => {
  const keys = modelKeysFor({ providers, seedText: { providerId: 'custom:acme', model: 'm' } })
  assert.equal(keys.TRACY_SEED_TEXT_PROVIDER, undefined)
})

test('an assigned agent door narrows the push to the providers a door here uses', () => {
  const keys = modelKeysFor({ providers, agent: { providerId: 'openrouter' } })
  assert.deepEqual(keys, { OPENROUTER_API_KEY: 'or-key' })
  // Unassigned: every enabled provider, as before.
  assert.deepEqual(Object.keys(modelKeysFor({ providers })).sort(), [
    'DEEPSEEK_API_KEY',
    'OPENROUTER_API_KEY'
  ])
})

test('pushModelKeys sends every dsh host, and an EMPTY book is an explicit clear, never a skipped call', async () => {
  const { pushModelKeys } = await import('../src/lib/llm-push.js')
  const calls = []
  const hostCall = async (_c, host, path, body) => {
    calls.push({ host, path, body })
    return { ok: true, body: { wrote: Object.keys(body.keys) } }
  }
  const config = {
    defaultHost: 'a',
    hosts: new Map([
      ['a', { dshOrigin: 'http://a' }],
      ['b', { dshOrigin: 'http://b' }],
      ['demo', { dshOrigin: null }]
    ])
  }
  const emptyBook = { query: async () => ({ rows: [] }) }
  const out = await pushModelKeys({ pool: emptyBook, secret: 's'.repeat(32), config, hostCall })
  assert.equal(out.ok, true)
  assert.equal(out.cleared, true)
  assert.deepEqual(
    calls.map((c) => c.host),
    ['a', 'b'],
    'demo-only host has no dsh and is skipped'
  )
  assert.ok(calls.every((c) => c.body.clear === true && Object.keys(c.body.keys).length === 0))
})
