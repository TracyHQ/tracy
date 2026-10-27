#!/usr/bin/env node
/**
 * Site changes said "Could not reach the site" on the first network blip: a `fetch` that throws (the
 * connection dropped, the dev proxy restarted) was final. `retryOnNetworkError` asks once more
 * before the tab gives up; a door's own answer (a 4xx/5xx, a 202 still building) is never retried
 * here — those have their own handling in the views.
 *
 *   node --test packages/core/tracy-core/test/network-retry.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { retryOnNetworkError } from '../src/site-tabs/network-retry.ts'

const noWait = { waitMs: 0 }

test('a fetch that throws once is asked again and its answer used', async () => {
  let asks = 0
  const answer = await retryOnNetworkError(async () => {
    asks += 1
    if (asks === 1) throw new TypeError('Failed to fetch')
    return 'rows'
  }, noWait)
  assert.equal(answer, 'rows')
  assert.equal(asks, 2)
})

test('a fetch that throws twice gives up with the network error', async () => {
  let asks = 0
  await assert.rejects(
    retryOnNetworkError(async () => {
      asks += 1
      throw new TypeError('Failed to fetch')
    }, noWait),
    TypeError
  )
  assert.equal(asks, 2)
})

test("a door's own refusal is not retried", async () => {
  class Refusal extends Error {}
  let asks = 0
  await assert.rejects(
    retryOnNetworkError(async () => {
      asks += 1
      throw new Refusal('FLEET_JOB_PENDING')
    }, noWait),
    Refusal
  )
  assert.equal(asks, 1)
})

test('waits before asking again', async () => {
  let asks = 0
  const started = Date.now()
  await retryOnNetworkError(
    async () => {
      asks += 1
      if (asks === 1) throw new TypeError('Failed to fetch')
      return null
    },
    { waitMs: 50 }
  )
  assert.ok(Date.now() - started >= 45)
})
