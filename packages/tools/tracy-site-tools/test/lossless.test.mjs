/**
 * An answer dsh can keep (`lossless.mjs`), judged by dsh's OWN rule: `isJsonValue` from the vendored
 * `@deepseek-ai/dsh-values` build (`pnpm dsh:build`; CI builds it before the tests), so "lossless" is
 * measured against the check that failed the A1 call, not against a copy of it.
 *
 *   node --test packages/tools/tracy-site-tools/test/lossless.test.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { losslessAnswer } from '../src/host/lossless.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')
const { isJsonValue } = await import(
  pathToFileURL(path.join(REPO, 'vendor/tracy/deepseek-harness/packages/util/values/lib/index.js')).href
)

test('an answer that already is lossless JSON leaves as it is: the same object, nothing reported', () => {
  const answer = {
    ok: true,
    kind: 'templatePart',
    id: 80,
    key: 'header',
    verified: { chars_sent: 7849 },
    list: [1, 'a', null]
  }
  const seen = []
  assert.equal(
    losslessAnswer(answer, (p) => seen.push(...p)),
    answer
  )
  assert.deepEqual(seen, [])
  assert.equal(isJsonValue(answer), true)
})

test('🔒 every shape dsh refuses is repaired the way JSON.stringify writes it, and each path is named', () => {
  class Receipt {
    constructor() {
      this.applyId = 'wp-1'
    }
  }
  const cyclic = { name: 'loop' }
  cyclic.self = cyclic
  const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
  const withSymbol = { ok: true, [Symbol('x')]: 1 }
  const answer = {
    ok: true,
    key: undefined,
    stored: NaN,
    size: Infinity,
    delta: -0,
    at: new Date('2026-09-27T00:00:00Z'),
    receipt: new Receipt(),
    list: [undefined, () => 1],
    sparse,
    cyclic,
    big: 12n,
    withSymbol
  }
  assert.equal(isJsonValue(answer), false, 'the input is what dsh refuses')
  /** @type {string[]} */
  const seen = []
  const out = /** @type {any} */ (losslessAnswer(answer, (p) => seen.push(...p)))
  assert.equal(isJsonValue(out), true, 'what leaves is what dsh keeps')
  assert.deepEqual(out, {
    ok: true,
    stored: null,
    size: null,
    delta: 0,
    at: '2026-09-27T00:00:00.000Z',
    receipt: { applyId: 'wp-1' },
    list: [null, null],
    sparse: [1, null, 3],
    cyclic: { name: 'loop', self: null },
    big: '12',
    withSymbol: { ok: true }
  })
  assert.ok(seen.includes('$.key=undefined'), String(seen))
  assert.ok(seen.includes('$.stored=NaN'))
  assert.ok(seen.includes('$.delta=-0'))
  assert.ok(seen.length <= 8, 'the log line stays short')
})

test('a value that is not an object leaves as JSON too', () => {
  assert.equal(losslessAnswer('text'), 'text')
  assert.equal(losslessAnswer(undefined), null)
  assert.equal(losslessAnswer(NaN), null)
  assert.equal(isJsonValue(losslessAnswer([undefined])), true)
})
