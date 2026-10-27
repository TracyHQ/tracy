// Encrypting a credential this deployment holds on somebody's behalf.
//
// The properties worth testing are not "it round-trips" — they are the ways a home-made box
// silently stops protecting anything: a deterministic ciphertext that leaks equality, a tag
// nobody checks so an edited row decrypts to something else, and a value that still opens after
// the secret it was bound to has been rotated away.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sealSecret, openSecret } from '../src/lib/secret-box.js'

const SECRET = 's'.repeat(32)

test('a sealed value opens again under the same secret', async () => {
  const sealed = await sealSecret('sk-or-v1-abc', SECRET)
  assert.equal(await openSecret(sealed, SECRET), 'sk-or-v1-abc')
})

test('the same value sealed twice is two different ciphertexts', async () => {
  // A deterministic box would let anybody holding the table see that two providers carry the SAME
  // key, and that a key did not change between two revisions — without opening anything.
  const a = await sealSecret('sk-same', SECRET)
  const b = await sealSecret('sk-same', SECRET)
  assert.notEqual(a, b)
  assert.equal(await openSecret(a, SECRET), await openSecret(b, SECRET))
})

test('a tampered ciphertext does not open — it refuses, it does not return a different string', async () => {
  const sealed = await sealSecret('sk-or-v1-abc', SECRET)
  const parts = sealed.split('.')
  // Flip one character of the payload. Without an authentication tag this would decrypt to
  // garbage and be passed to a provider as if it were a key.
  const body = parts.at(-1)
  parts[parts.length - 1] = (body[0] === 'A' ? 'B' : 'A') + body.slice(1)
  assert.equal(await openSecret(parts.join('.'), SECRET), null)
})

test('a value sealed under one secret does not open under another', async () => {
  const sealed = await sealSecret('sk-or-v1-abc', SECRET)
  assert.equal(await openSecret(sealed, 'x'.repeat(32)), null)
})

test('a row this code no longer understands opens as null, never as a crash', async () => {
  for (const bad of ['', 'plain-text', 'v9.aaa.bbb.ccc', 'v1.only-two.parts', null, undefined]) {
    assert.equal(await openSecret(bad, SECRET), null, String(bad))
  }
})

test('sealing refuses an empty value rather than storing an openable empty string', async () => {
  // "No key" must be the absence of a row value (null), never a sealed empty string — otherwise
  // `configured` reads true for a provider that cannot authenticate anything.
  await assert.rejects(() => sealSecret('', SECRET))
})
