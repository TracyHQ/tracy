#!/usr/bin/env node
/**
 * `scripts/measure-provenance.mjs` load helpers: reading a web container's worker ceiling, choosing
 * the concurrency from it, and halving it when the site strains.
 *
 *   node --test scripts/test/measure-provenance-load.test.mjs
 *
 * The probe texts below are the shapes measured on the local stand on 27/09/2026
 * (`wordpress:php8.3-apache` and `joomla:6-apache`, both Apache prefork, MaxRequestWorkers 150).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  chooseConcurrency,
  createBackoff,
  FALLBACK_CONCURRENCY,
  MAX_CONCURRENCY,
  median,
  parseWorkerCeiling
} from '../measure-provenance.mjs'

const PREFORK_150 = [
  'mpm prefork',
  '# These need to be set in /etc/apache2/envvars',
  '<IfModule mpm_prefork_module>',
  '\tStartServers\t\t\t 5',
  '\tMaxRequestWorkers\t  150',
  '\tMaxConnectionsPerChild   0',
  '</IfModule>'
].join('\n')

test('Apache prefork: the enabled MaxRequestWorkers is the ceiling', () => {
  assert.deepEqual(parseWorkerCeiling(PREFORK_150), {
    workers: 150,
    source: 'Apache prefork MaxRequestWorkers 150'
  })
})

test('Apache with no directive falls back to the MPM default; the old MaxClients name still counts', () => {
  assert.equal(parseWorkerCeiling('mpm prefork\n').workers, 256)
  assert.equal(parseWorkerCeiling('mpm event\n').workers, 400)
  assert.equal(parseWorkerCeiling('mpm prefork\nMaxClients 40\n').workers, 40)
})

test('commented directives are ignored and the last active one wins', () => {
  assert.equal(
    parseWorkerCeiling('mpm prefork\n# MaxRequestWorkers 5\nMaxRequestWorkers 20\nMaxRequestWorkers 30')
      .workers,
    30
  )
})

test('PHP-FPM: pm.max_children; behind Apache the smaller of the two is the ceiling', () => {
  assert.deepEqual(parseWorkerCeiling('fpm\npm = dynamic\npm.max_children = 5\n'), {
    workers: 5,
    source: 'PHP-FPM pm.max_children 5'
  })
  assert.equal(parseWorkerCeiling(`${PREFORK_150}\nfpm\npm.max_children = 12`).workers, 12)
})

test('nothing recognisable is null, not a guess', () => {
  assert.equal(parseWorkerCeiling(''), null)
  assert.equal(parseWorkerCeiling('mpm \n'), null)
  assert.equal(parseWorkerCeiling('fpm\n;pm.max_children = 5'), null)
})

test('concurrency is min(flag, workers − 1, cap), and says which bound won', () => {
  const ceiling = { workers: 150, source: 'Apache prefork MaxRequestWorkers 150' }
  assert.equal(chooseConcurrency({ ceiling }).value, MAX_CONCURRENCY)
  assert.equal(chooseConcurrency({ requested: 2, ceiling }).value, 2)
  assert.match(chooseConcurrency({ requested: 2, ceiling }).reason, /bound by --concurrency 2/)
  assert.equal(chooseConcurrency({ requested: 32, ceiling }).value, MAX_CONCURRENCY)
  const small = chooseConcurrency({
    requested: 6,
    ceiling: { workers: 4, source: 'PHP-FPM pm.max_children 4' }
  })
  assert.equal(small.value, 3)
  assert.match(small.reason, /bound by PHP-FPM pm\.max_children 4 − 1 = 3/)
  assert.equal(chooseConcurrency({ ceiling: { workers: 1, source: 'x' } }).value, 1)
})

test('an uninspectable container falls back to the flag, else the default', () => {
  assert.equal(chooseConcurrency({ ceiling: null }).value, FALLBACK_CONCURRENCY)
  assert.equal(chooseConcurrency({ requested: 12, ceiling: null }).value, 12)
  assert.match(chooseConcurrency({ ceiling: null }).reason, /container not inspected/)
})

test('back-off: two strained answers in a row halve the limit; one alone does not', () => {
  const b = createBackoff({ limit: 8, slowMs: 1000 })
  b.record({ status: 200, ms: 1500, startedAt: 0, now: 10 })
  b.record({ status: 200, ms: 100, startedAt: 1, now: 11 })
  b.record({ status: 200, ms: 1500, startedAt: 2, now: 12 })
  assert.equal(b.limit(), 8)
  b.record({ status: 503, ms: 5, startedAt: 3, now: 13 })
  assert.equal(b.limit(), 4)
  assert.deepEqual(b.halvings, [{ at: 13, from: 8, to: 4, why: 'HTTP 503' }])
})

test('back-off: calls already in flight at a halving do not halve again', () => {
  const b = createBackoff({ limit: 8, slowMs: 1000 })
  b.record({ status: 429, ms: 5, startedAt: 0, now: 10 })
  b.record({ status: 429, ms: 5, startedAt: 1, now: 11 })
  assert.equal(b.limit(), 4)
  for (let i = 0; i < 6; i++) b.record({ status: 429, ms: 5, startedAt: 5, now: 12 + i })
  assert.equal(b.limit(), 4)
  b.record({ status: 200, ms: 2000, startedAt: 20, now: 30 })
  b.record({ status: 200, ms: 2000, startedAt: 21, now: 31 })
  assert.equal(b.limit(), 2)
  assert.equal(b.halvings[1].why, 'slower than 1000 ms')
})

test('back-off never goes below one', () => {
  const b = createBackoff({ limit: 1, slowMs: 10 })
  for (let i = 0; i < 5; i++) b.record({ status: 503, ms: 5, startedAt: i, now: i })
  assert.equal(b.limit(), 1)
  assert.deepEqual(b.halvings, [])
})

test('median', () => {
  assert.equal(median([]), null)
  assert.equal(median([5, 1, 3]), 3)
  assert.equal(median([4, 1, 3, 2]), 2.5)
})
