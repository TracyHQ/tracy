/**
 * The site delete, as one flow both doors run: My Sites' `…` → Delete site…, and the dsh sidebar's
 * site row on a site page (`site-row-menu.tsx`). Pinned here: a delete is sent once however often it
 * is pressed, a refusal is written for the person and takes the cover down, an answer that is not a
 * confirmed complete delete raises the notice, and deleting the site the page stands in moves the
 * page on only after the notice is acknowledged.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runSiteDelete } from '../src/client/delete-flow.ts'

const CLEAN = { removed: true, host: true, repo: true, sessions: true, seats: true }

/** A recorded run: every callback the flow can call, and a fetch answering `answers` in turn. */
function harness({ answers = [{ status: 200, body: CLEAN }], current = null, siteKey = 'one.example' } = {}) {
  const log = []
  const requests = []
  let acknowledge
  const input = {
    siteKey,
    siteName: 'One',
    current,
    t: (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
    setBusy: (busy) => log.push(['busy', busy]),
    tellFailure: (sentence) => log.push(['failure', sentence]),
    closeDialog: () => log.push(['close']),
    changed: () => log.push(['changed']),
    navigate: (to) => log.push(['navigate', to]),
    mountCover: () => {
      log.push(['cover up'])
      return () => log.push(['cover down'])
    },
    showResult: (_doc, notice) => {
      log.push(['notice', notice.outcome.kind, notice.cover])
      return new Promise((resolve) => {
        acknowledge = () => {
          log.push(['acknowledged'])
          resolve()
        }
      })
    },
    document: {},
    fetch: async (url, init) => {
      requests.push([url, init.method])
      const a = answers.shift()
      return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body }
    }
  }
  return { input, log, requests, acknowledge: () => acknowledge() }
}

test('two presses in one tick send one DELETE', async () => {
  const h = harness()
  await Promise.all([runSiteDelete(h.input), runSiteDelete(h.input)])
  assert.deepEqual(h.requests, [['/api/sites/one.example', 'DELETE']])
})

test('a complete delete of another site closes the dialog and re-reads, with no cover and no move', async () => {
  const h = harness()
  await runSiteDelete(h.input)
  assert.deepEqual(h.log, [['busy', true], ['busy', false], ['close'], ['changed']])
})

test('a refusal is written for the person and the cover comes down', async () => {
  const h = harness({ answers: [{ status: 403, body: { code: 'NOT_SITE_OWNER' } }], current: 'one.example' })
  await runSiteDelete(h.input)
  const failure = h.log.find((e) => e[0] === 'failure')
  assert.ok(failure, 'the refusal is told')
  assert.notEqual(failure[1], '', 'with a sentence')
  assert.deepEqual(
    h.log.filter((e) => e[0] !== 'failure'),
    [['cover up'], ['busy', true], ['busy', false], ['cover down']]
  )
})

test('a 200 with parts left behind raises the notice instead of reading as deleted', async () => {
  const h = harness({ answers: [{ status: 200, body: { ...CLEAN, repo: 'failed' } }] })
  await runSiteDelete(h.input)
  // Another site: the page stays, so the list re-reads at once while the notice waits on its own.
  assert.deepEqual(h.log, [
    ['busy', true],
    ['busy', false],
    ['notice', 'partial', false],
    ['close'],
    ['changed']
  ])
})

test('deleting the site the page stands in moves to / only after the notice is acknowledged', async () => {
  const h = harness({ answers: [{ status: 200, body: { ...CLEAN, host: false } }], current: 'one.example' })
  const run = runSiteDelete(h.input)
  await new Promise((r) => setTimeout(r, 0))
  assert.ok(!h.log.some((e) => e[0] === 'navigate'), 'no move while the notice waits')
  h.acknowledge()
  await run
  assert.deepEqual(h.log.at(-1), ['navigate', '/'])
  assert.ok(!h.log.some((e) => e[0] === 'changed'), 'the page goes; nothing re-reads')
})

test('a complete delete of the site the page stands in goes straight to /', async () => {
  const h = harness({ current: 'one.example' })
  await runSiteDelete(h.input)
  assert.deepEqual(h.log, [['cover up'], ['busy', true], ['busy', false], ['navigate', '/']])
})

test('a delete the host has not finished says so, takes the cover down and re-reads', async () => {
  const h = harness({ answers: [{ status: 202, body: {} }], current: 'one.example' })
  await runSiteDelete(h.input)
  assert.deepEqual(h.log, [
    ['cover up'],
    ['busy', true],
    ['busy', false],
    ['failure', 'delete.pending'],
    ['cover down'],
    ['changed']
  ])
})
