// The http-only gap: a page served off localhost over plain http has `crypto.getRandomValues`
// but no `crypto.randomUUID`, and dsh 0.1.7's client calls it unguarded. The brand plugin fills
// it at import time; this test drives the same function against a stripped `crypto`.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { webcrypto } from 'node:crypto'

const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('function ensureRandomUuid'), source.indexOf('ensureRandomUuid()\n'))
// Strip the two TypeScript annotations so plain Node can evaluate the function.
const js = body.replace('(): void', '()').replace('as Crypto & { randomUUID?: () => string }', '')
const ensure = new Function(`${js}; return ensureRandomUuid`)()

test('fills randomUUID with a v4 uuid when the context lacks it', () => {
  const stripped = { getRandomValues: (a) => webcrypto.getRandomValues(a) }
  const saved = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', { value: stripped, configurable: true })
  try {
    ensure()
    const id = stripped.randomUUID()
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.notEqual(id, stripped.randomUUID())
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true })
  }
})

test('leaves a platform implementation alone', () => {
  const own = () => 'platform'
  const c = { getRandomValues: (a) => a, randomUUID: own }
  const saved = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', { value: c, configurable: true })
  try {
    ensure()
    assert.equal(c.randomUUID, own)
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true })
  }
})
