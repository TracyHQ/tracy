// The readers rewritten for the release's CodeQL run (polynomial-redos, release 2026-11-05) answer what
// their old patterns answered on ordinary text, and answer a long run of slashes at once: a slow reader
// holds the one dsh event loop every site on the host shares.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { withoutTrailingSlashes } from '../src/host/design-systems-switch.mjs'
import { parseRoute } from '../src/host/host.ts'

/** Milliseconds `fn` takes. @param {() => unknown} fn */
const timed = (fn) => {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

/**
 * Asserts `run` grows linearly: twice the input takes about twice the time (best of five each), never the
 * four times a quadratic reader takes.
 * @param {string} label @param {(n: number) => unknown} run @param {number} n
 */
const assertLinear = (label, run, n) => {
  const best = (/** @type {number} */ k) => Math.min(...Array.from({ length: 5 }, () => timed(() => run(k))))
  const one = best(n)
  const two = best(2 * n)
  assert.ok(two < 2.8 * one + 3, `${label}: ${one.toFixed(1)} ms at n, ${two.toFixed(1)} ms at 2n`)
  assert.ok(two < 300, `${label}: ${two.toFixed(1)} ms at 2n`)
}

test('withoutTrailingSlashes drops what `/\\/+$/` dropped, at once on a run of slashes', () => {
  // [origin, what `replace(/\/+$/, '')` gave]
  for (const [s, old] of [
    ['https://a.test/', 'https://a.test'],
    ['https://a.test///', 'https://a.test'],
    ['https://a.test', 'https://a.test'],
    ['/', ''],
    ['', ''],
    ['a//b/', 'a//b']
  ])
    assert.equal(withoutTrailingSlashes(s), old, s)
  assertLinear('withoutTrailingSlashes', (n) => withoutTrailingSlashes(`${'/'.repeat(n)}x`), 100_000)
})

test('parseRoute reads the door as before, at once on a path of slashes', () => {
  const prefix = '/api/plugins/x'
  // [method, url, what the route read with `/^\/+/` and `/\/+$/`]
  for (const [method, url, old] of [
    ['POST', `${prefix}/start`, 'start'],
    ['POST', `${prefix}//start//`, 'start'],
    ['GET', `${prefix}/job/?session=a`, 'job'],
    ['GET', `${prefix}/start`, null],
    ['GET', '/elsewhere/job', null],
    ['GET', `${prefix}/jobs`, null]
  ])
    assert.equal(parseRoute(prefix, method, url), old, `${method} ${url}`)
  assertLinear('parseRoute', (n) => parseRoute(prefix, 'GET', `${prefix}/x${'/'.repeat(n)}y`), 100_000)
})
