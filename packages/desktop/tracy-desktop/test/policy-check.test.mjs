/**
 * The policy check (src/policy-check.js): read the channel file and its signature, verify, and take
 * the policy out — without electron-updater, so it runs with automatic checks off (C6) and never
 * starts a download.
 *
 *   node --test packages/desktop/tracy-desktop/test/policy-check.test.mjs
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { fetchFeedPolicy } = require('../src/policy-check.js')
const { signFeed, publicKeyText } = require('../src/feed-signature.js')

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const publicKeys = [publicKeyText(publicKey)]
const FEED = 'https://update.tracy.site/dev'
const yml = (extra = '') => `version: 0.6.0-dev.12\npath: a.zip\n${extra}`

/** A fetch answering from a map of URL → body (or a thrown error / a status). */
const fakeFetch =
  (served, seen = []) =>
  async (url, init) => {
    seen.push({ url, init })
    const body = served[url]
    if (body instanceof Error) throw body
    if (body === undefined) return { ok: false, status: 404, text: async () => '' }
    return { ok: true, status: 200, text: async () => body }
  }

const signed = (text, channelFile = 'dev-mac.yml') => ({
  [`${FEED}/${channelFile}`]: text,
  [`${FEED}/${channelFile}.sig`]: signFeed({ channelFile, text, privateKey })
})

test('a signed channel file gives its policy', async () => {
  const text = yml('minimumVersion: 0.6.0-dev.10\npolicyRevision: 2\n')
  const seen = []
  const result = await fetchFeedPolicy({
    fetch: fakeFetch(signed(text), seen),
    feedUrl: FEED,
    channelFile: 'dev-mac.yml',
    publicKeys
  })
  assert.deepEqual(result, { kind: 'ok', policy: { minimumVersion: '0.6.0-dev.10', policyRevision: 2 } })
  // Fresh every time: a cached channel file could hide a raised minimum.
  assert.ok(seen.every(({ init }) => init?.cache === 'no-store'))
})

test('a signed channel file without policy lines gives null (revision 0)', async () => {
  const result = await fetchFeedPolicy({
    fetch: fakeFetch(signed(yml())),
    feedUrl: `${FEED}/`,
    channelFile: 'dev-mac.yml',
    publicKeys
  })
  assert.deepEqual(result, { kind: 'ok', policy: null })
})

test('a tampered channel file is refused, policy and all', async () => {
  const served = signed(yml('minimumVersion: 0.6.0-dev.10\npolicyRevision: 2\n'))
  served[`${FEED}/dev-mac.yml`] = yml('minimumVersion: 0.6.0-dev.12\npolicyRevision: 2\n')
  const result = await fetchFeedPolicy({
    fetch: fakeFetch(served),
    feedUrl: FEED,
    channelFile: 'dev-mac.yml',
    publicKeys
  })
  assert.equal(result.kind, 'refused')
})

test('a missing signature is refused; a signed but malformed policy is refused', async () => {
  const unsigned = { [`${FEED}/dev-mac.yml`]: yml() }
  assert.equal(
    (
      await fetchFeedPolicy({
        fetch: fakeFetch(unsigned),
        feedUrl: FEED,
        channelFile: 'dev-mac.yml',
        publicKeys
      })
    ).kind,
    'refused'
  )
  const malformed = signed(yml('minimumVersion: 0.6.0-dev.10\n'))
  assert.equal(
    (
      await fetchFeedPolicy({
        fetch: fakeFetch(malformed),
        feedUrl: FEED,
        channelFile: 'dev-mac.yml',
        publicKeys
      })
    ).kind,
    'refused'
  )
})

test('no network, or a server error, is unreachable — not a refusal', async () => {
  const down = { [`${FEED}/dev-mac.yml`]: new TypeError('fetch failed') }
  assert.equal(
    (await fetchFeedPolicy({ fetch: fakeFetch(down), feedUrl: FEED, channelFile: 'dev-mac.yml', publicKeys }))
      .kind,
    'unreachable'
  )
  assert.equal(
    (await fetchFeedPolicy({ fetch: fakeFetch({}), feedUrl: FEED, channelFile: 'dev-mac.yml', publicKeys }))
      .kind,
    'unreachable'
  )
})
