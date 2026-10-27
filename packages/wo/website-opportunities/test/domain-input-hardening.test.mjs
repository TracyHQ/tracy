// Inputs from research (addresses, logo text, source names) are untrusted: long separator runs stay linear
// and a source named like an Object.prototype key stays an ordinary row.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { suppliedBySource } from '../domain/brief-sources.mjs'
import { cityOf } from '../domain/brief.mjs'
import { logoNameText } from '../domain/own-marks.mjs'

const RUN = '\t'.repeat(50_000)

test('an address with a long run of tabs still splits fast and finds the city', () => {
  const started = performance.now()
  assert.equal(cityOf(`Harbour Lane${RUN}-${RUN}Marina - Harbourtown - Freeland`), 'Harbourtown')
  assert.ok(performance.now() - started < 500)
})

test('logo text trims separators at either end, and a long run of them stays fast', () => {
  assert.equal(logoNameText({ showsName: true, readsAs: ' - Harbour Sport Club · ' }), 'Harbour Sport Club')
  const started = performance.now()
  assert.equal(logoNameText({ showsName: true, readsAs: `Harbour${RUN}x${RUN}` }), 'Harbour x')
  assert.equal(logoNameText({ showsName: true, readsAs: `-${' -'.repeat(50_000)}` }), '')
  assert.ok(performance.now() - started < 500)
})

test('a source named __proto__ is counted as its own row and leaves Object.prototype alone', () => {
  const out = suppliedBySource({ posts: [{ source: '__proto__' }, { source: 'instagram' }] })
  assert.deepEqual(Object.keys(out).sort(), ['__proto__', 'instagram'])
  assert.deepEqual(out.instagram, { fetched: 1 })
  assert.equal(Object.getPrototypeOf(out), Object.prototype)
  assert.equal({}.fetched, undefined)
})
