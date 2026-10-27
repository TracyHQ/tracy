/**
 * The brand engine's safe fetch takes `fetch` and `Agent` from the SAME `undici`.
 *
 *   node --test scripts/test/od-brand-engine-undici.test.mjs
 *
 * Why a source-level test: the failure only exists inside the dsh image, where the profile holds ONE
 * flat `undici` (8.10.1, for `dsh-subscriptions`) while Node 24's global `fetch` is undici 7. An
 * undici-8 `Agent` passed to the global `fetch` as `dispatcher` throws "invalid onRequestStart
 * method" on every request, so every brand extraction answered NO_MATERIAL (measured 29/09/2026 on a
 * local stand; broken since the 24/09 dsh-subscriptions install). No network test can reproduce the
 * version split outside the image, so this pins the one rule that makes the split harmless.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../vendor/tracy/od-brand-engine')
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
// A call to the GLOBAL fetch, whatever precedes it: `await fetch(`, `return fetch(`, `(fetch(`,
// `globalThis.fetch(`. safe-fetch binds undici's as `undiciFetch`, so a bare `fetch(` there is global.
const GLOBAL_FETCH_CALL = /(?<![\w$])(?:globalThis\s*\.\s*)?fetch\s*\(/

test('the global-fetch pattern catches every shape of a call, and not the undici binding', () => {
  for (const call of [
    'await fetch(url)',
    'return fetch(url)',
    'const p = fetch(url)',
    '(fetch (url))',
    'globalThis.fetch(url)'
  ])
    assert.match(call, GLOBAL_FETCH_CALL, call)
  for (const ok of ['await undiciFetch(url)', 'fetchExternalBrandAsset(url)', 'prefetch(url)'])
    assert.doesNotMatch(ok, GLOBAL_FETCH_CALL, ok)
})

test('safe-fetch imports fetch from undici together with Agent, and never calls the global fetch', () => {
  const src = code(readFileSync(path.join(PKG, 'src/safe-fetch.ts'), 'utf8'))
  const undiciImport = /import\s*\{([^}]*)\}\s*from\s*['"]undici['"]/.exec(src)
  assert.ok(undiciImport, 'safe-fetch imports from undici')
  assert.match(undiciImport[1], /\bAgent\b/)
  assert.match(undiciImport[1], /\bfetch\b/, 'fetch comes from undici, beside Agent')
  assert.doesNotMatch(src, GLOBAL_FETCH_CALL, 'no call to the global fetch')
})

test('the committed dist carries the same rule', () => {
  const dist = readFileSync(path.join(PKG, 'dist/index.js'), 'utf8')
  const imports = [...dist.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']undici["']/g)]
    .map((m) => m[1])
    .join(',')
  assert.match(imports, /\bAgent\b/)
  assert.match(imports, /\bfetch\b/, 'dist/index.js imports fetch from undici')
})
