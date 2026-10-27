/**
 * Leaving a site, as one flow both doors run: My Sites' `…` → Leave site, and the dsh sidebar's
 * site row on a site page (`site-row-menu.tsx`). Pinned here: the seat book's refusal is written for
 * the person in their words, a success closes the dialog and re-reads, and leaving the site the page
 * stands in moves the page to `/` (the root picks where a viewer lands), because the seat this page
 * runs on is gone.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runSiteLeave } from '../src/client/leave-flow.ts'

function harness({ status = 200, body = {}, throws = false, current = null } = {}) {
  const log = []
  const requests = []
  const input = {
    siteKey: 'one.example',
    current,
    t: (key) => key,
    setBusy: (busy) => log.push(['busy', busy]),
    tellFailure: (sentence) => log.push(['failure', sentence]),
    closeDialog: () => log.push(['close']),
    changed: () => log.push(['changed']),
    navigate: (to) => log.push(['navigate', to]),
    fetch: async (url, init) => {
      requests.push([url, init.method])
      if (throws) throw new Error('offline')
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }
  }
  return { input, log, requests }
}

test('leaving another site posts to the leave door, closes the dialog and re-reads', async () => {
  const h = harness()
  await runSiteLeave(h.input)
  assert.deepEqual(h.requests, [['/api/sites/one.example/leave', 'POST']])
  assert.deepEqual(h.log, [['busy', true], ['busy', false], ['close'], ['changed']])
})

test('leaving the site the page stands in moves the page to /', async () => {
  const h = harness({ current: 'one.example' })
  await runSiteLeave(h.input)
  assert.deepEqual(h.log, [['busy', true], ['busy', false], ['close'], ['navigate', '/']])
})

test('the last Owner refused by the seat book is told why, and the dialog stays', async () => {
  const h = harness({ status: 409, body: { code: 'LAST_OWNER' }, current: 'one.example' })
  await runSiteLeave(h.input)
  const failure = h.log.find((e) => e[0] === 'failure')
  assert.ok(failure && failure[1] !== '', 'a sentence is written')
  assert.ok(!h.log.some((e) => e[0] === 'close' || e[0] === 'navigate' || e[0] === 'changed'))
})

test('no answer at all says the action failed', async () => {
  const h = harness({ throws: true })
  await runSiteLeave(h.input)
  assert.deepEqual(h.log, [
    ['busy', true],
    ['failure', 'error.failed'],
    ['busy', false]
  ])
})
