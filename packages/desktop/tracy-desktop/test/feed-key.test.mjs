import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createFeedKey, readFeedSigningKey } from '../build/feed-key.mjs'

const require = createRequire(import.meta.url)
const { signFeed, verifyFeed } = require('../src/feed-signature.js')
const { FEED_PUBLIC_KEYS } = require('../src/feed-key.js')

const scratch = () => mkdtempSync(path.join(tmpdir(), 'feed-key-test-'))

test('create writes a private key only its owner reads, and returns the public key to pin', () => {
  const dir = scratch()
  try {
    const file = path.join(dir, 'tracy-feed-ed25519.key')
    const { publicKey } = createFeedKey({ file })
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.match(readFileSync(file, 'utf8'), /^-----BEGIN PRIVATE KEY-----/)
    // What it signs verifies under the public key it printed.
    const privateKey = readFeedSigningKey({ file })
    const signature = signFeed({ channelFile: 'dev.yml', text: 'version: 1.0.0\n', privateKey })
    assert.deepEqual(
      verifyFeed({ channelFile: 'dev.yml', text: 'version: 1.0.0\n', signature, publicKeys: [publicKey] }),
      { ok: true }
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('create never replaces an existing key — that would orphan every app pinned to it', () => {
  const dir = scratch()
  try {
    const file = path.join(dir, 'k.key')
    createFeedKey({ file })
    const before = readFileSync(file, 'utf8')
    assert.throws(() => createFeedKey({ file }), /already exists/)
    assert.equal(readFileSync(file, 'utf8'), before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the signing key is refused when missing, readable by others, or not an Ed25519 key', () => {
  const dir = scratch()
  try {
    const file = path.join(dir, 'k.key')
    assert.throws(() => readFeedSigningKey({ file }), /no feed signing key.*build\/feed-key\.mjs create/s)
    createFeedKey({ file })
    chmodSync(file, 0o644)
    assert.throws(() => readFeedSigningKey({ file }), /readable by others/)
    writeFileSync(file, 'not a key', { mode: 0o600 })
    chmodSync(file, 0o600)
    assert.throws(() => readFeedSigningKey({ file }), /not an Ed25519 private key/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the pinned keys are a list of raw Ed25519 public keys in base64', () => {
  assert.ok(Array.isArray(FEED_PUBLIC_KEYS))
  for (const key of FEED_PUBLIC_KEYS) assert.equal(Buffer.from(key, 'base64').length, 32, key)
})
