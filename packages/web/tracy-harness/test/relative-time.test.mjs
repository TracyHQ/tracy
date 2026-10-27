/**
 * The relative-time formatter the Demos "Deployed" column shows ("2 hours ago"). A pure function,
 * so `node --test` can pin its boundaries — the drawer that renders it has no test harness
 * in this package. `now` is passed in so the assertions never depend on the wall clock.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootRequire = createRequire(path.resolve(pkgRoot, '..', '..', '..', 'package.json'))

// Bundled with the i18n glob so the words come from the English dictionary, as on /ops.
let relativeTime
let ciRelativeTime
before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { relativeTime } from './cms/relative-time'
      export { relativeTime as ciRelativeTime } from './ci-api'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
  relativeTime = mod.relativeTime
  ciRelativeTime = mod.ciRelativeTime
})

const NOW = Date.parse('2026-09-17T12:00:00Z')
const at = (ms) => new Date(NOW - ms).toISOString()

test('a null, missing, or unparseable timestamp has no relative time — never "NaN ago"', () => {
  assert.equal(relativeTime(null, NOW), null)
  assert.equal(relativeTime(undefined, NOW), null)
  assert.equal(relativeTime('', NOW), null)
  assert.equal(relativeTime('not a date', NOW), null)
})

test('under a minute reads "just now"', () => {
  assert.equal(relativeTime(at(0), NOW), 'just now')
  assert.equal(relativeTime(at(59_000), NOW), 'just now')
})

test('minutes, singular at one', () => {
  assert.equal(relativeTime(at(60_000), NOW), '1 minute ago')
  assert.equal(relativeTime(at(5 * 60_000), NOW), '5 minutes ago')
  assert.equal(relativeTime(at(59 * 60_000), NOW), '59 minutes ago')
})

test('hours, singular at one, at the hour boundary', () => {
  assert.equal(relativeTime(at(60 * 60_000), NOW), '1 hour ago')
  assert.equal(relativeTime(at(2 * 3_600_000), NOW), '2 hours ago')
  assert.equal(relativeTime(at(23 * 3_600_000), NOW), '23 hours ago')
})

test('days, singular at one, at the day boundary', () => {
  assert.equal(relativeTime(at(24 * 3_600_000), NOW), '1 day ago')
  assert.equal(relativeTime(at(3 * 86_400_000), NOW), '3 days ago')
})

test('the CI and statistics screens read the same words, with a dash where there is no time', () => {
  assert.equal(ciRelativeTime(at(3 * 60_000), NOW), '3 minutes ago')
  assert.equal(ciRelativeTime(at(0), NOW), 'just now')
  assert.equal(ciRelativeTime(null, NOW), '—')
  assert.equal(ciRelativeTime('invalid', NOW), '—')
})
