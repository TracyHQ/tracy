// The readers rewritten for the release's CodeQL run (polynomial-redos, release 2026-11-05) answer what
// their old patterns answered on ordinary text, and answer a long run of one character at once: a slow
// reader holds the one dsh event loop every site on the host shares.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenValue } from '../src/host/library-brand.mjs'
import { withoutTrailingSlashes } from '../src/host/templates.mjs'

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
    ['a/b', 'a/b'],
    ['a//b/', 'a//b']
  ])
    assert.equal(withoutTrailingSlashes(s), old, s)
  assertLinear('withoutTrailingSlashes', (n) => withoutTrailingSlashes(`${'/'.repeat(n)}x`), 100_000)
})

test('tokenValue reads the value its pattern read, with the name as plain text, at once on a sheet with no `;`', () => {
  // [tokens.css, name, what the pattern built from the name found]
  for (const [css, name, old] of [
    [':root{--font-display: "Inter",\n  sans-serif;}', '--font-display', '"Inter", sans-serif'],
    ['--radius-md:8px;--radius-sm:4px;', '--radius-sm', '4px'],
    ['--a: ;--a:1;', '--a', ''],
    ['--a:;--a:1;', '--a', '1'],
    ['--ab:1;--a:2;', '--a', '2'],
    ['--a :\n red ;', '--a', 'red'],
    ['--a:1', '--a', null],
    ['x--a-bc: 3;', '--a-b', null],
    ['', '--a', null]
  ])
    assert.equal(tokenValue(css, name), old, JSON.stringify([css, name]))
  // a name is text: its `.` is a dot, not any character
  assert.equal(tokenValue('--axb: 1;--a.b: 2;', '--a.b'), '2')
  assertLinear('tokenValue, no `;`', (n) => tokenValue('--a:'.repeat(n), '--a'), 20_000)
  assertLinear('tokenValue, spaces', (n) => tokenValue(`--a:${' '.repeat(n)}`, '--a'), 100_000)
})
