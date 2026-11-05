// The readers rewritten for the release's CodeQL run (polynomial-redos, release 2026-11-05) answer what
// their old patterns answered on ordinary text, and answer a long run of slashes at once: a slow reader
// holds the one dsh event loop every site on the host shares.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { withoutTrailingDotsAndSpace, withoutTrailingSlashes } from '../src/host/design-systems-switch.mjs'
import { parseRoute } from '../src/host/host.ts'

/** Milliseconds `fn` takes. @param {() => unknown} fn */
const timed = (fn) => {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

/**
 * Asserts `run` grows linearly, with the same verdict under the load of test files running in parallel.
 * After one warm-up call: twice the given size answers under 300 ms (one try of three is enough; a try
 * over 900 ms ends them). Then the size doubles (up to 64 times the given one) until one run takes 20 ms,
 * and four times that input must take under eight times as long, plus 10 ms (best of seven each): a
 * linear reader takes four times as long, a quadratic one sixteen, and a few ms of scheduling or GC
 * cannot cross that gap the way it crossed a 2.8 bound on runs of 2 ms. The comparison gets three tries.
 * @param {string} label @param {(n: number) => unknown} run @param {number} n
 */
const assertLinear = (label, run, n) => {
  /** Least of `tries` runs at `k`, stopping at the first run under `enough` or over `cut`. */
  const best = (/** @type {number} */ k, tries = 7, enough = 0, cut = Infinity) => {
    let least = Infinity
    for (let i = 0; i < tries; i += 1) {
      const ms = timed(() => run(k))
      if (ms < least) least = ms
      if (ms < enough || ms > cut) break
    }
    return least
  }
  run(n)
  const big = best(2 * n, 3, 300, 900)
  assert.ok(big < 300, `${label}: ${big.toFixed(1)} ms at 2n`)
  let k = n
  while (k < 64 * n && best(k, 3) < 20) k *= 2
  // a pause of the whole process can still land on one side; a linear reader passes one of three tries,
  // a quadratic one fails all three
  let one = 0
  let four = Infinity
  for (let t = 0; t < 3 && !(four < 8 * one + 10); t += 1) {
    one = best(k)
    four = best(4 * k)
  }
  assert.ok(four < 8 * one + 10, `${label}: ${one.toFixed(1)} ms at ${k}, ${four.toFixed(1)} ms at ${4 * k}`)
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

test('withoutTrailingDotsAndSpace drops what `/[.\\s]+$/` dropped, at once on a run of tabs', () => {
  // [fleet reason, what `replace(/[.\s]+$/, '')` gave]
  for (const [s, old] of [
    ['disk full.', 'disk full'],
    ['disk full. \n', 'disk full'],
    ['v1.2 failed...\t', 'v1.2 failed'],
    ['a.b', 'a.b'],
    [' . \u00a0', ''],
    ['', '']
  ]) {
    assert.equal(s.replace(/[.\s]+$/, ''), old, `old pattern on ${JSON.stringify(s)}`)
    assert.equal(withoutTrailingDotsAndSpace(s), old, s)
  }
  assertLinear('withoutTrailingDotsAndSpace', (n) => withoutTrailingDotsAndSpace(`${'\t'.repeat(n)}x`), 100_000)
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
