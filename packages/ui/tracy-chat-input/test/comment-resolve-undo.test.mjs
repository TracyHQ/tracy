/**
 * UI fine-tune 30/09 (U24–U26, U33): Delete all hides what the filter shows, and a Resolve pressed while
 * the Resolved group is hidden waits {@link RESOLVE_UNDO_MS} as an in-place "Resolved. Undo" line —
 * nothing reaches the Browser tab until the time is up (or the page hides), Undo sends nothing.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPendingClear, createPendingResolve, RESOLVE_UNDO_MS } from '../src/client/comment-clear.mjs'
import { createCommentLists, viewModel } from '../src/client/comment-view.mjs'

const HOME = 'https://capiwl1643.tracy.test/'
const SERVICES = 'https://capiwl1643.tracy.test/services/'
const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)
const c = (id, extra = {}) => ({
  id,
  url: HOME,
  text: id,
  status: 'pending',
  createdAt: NOW,
  element: null,
  author: { accountId: 'a', email: 'lee@example.com', name: 'Lee', initial: 'L' },
  replyCount: 0,
  sentToTracy: false,
  ...extra
})
const listOf = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'capiwl1643',
  host: 'capiwl1643.tracy.test',
  active: true,
  url: HOME,
  comments
})

/** Timers the test runs by hand. */
function manualTimers() {
  /** @type {Map<number, () => void>} */
  const due = new Map()
  let next = 1
  return {
    set: (/** @type {() => void} */ fn) => {
      due.set(next, fn)
      return next++
    },
    clear: (/** @type {unknown} */ h) => void due.delete(/** @type {number} */ (h)),
    /** Run every timer set so far, once. */
    fire() {
      const now = [...due.entries()]
      due.clear()
      for (const [, fn] of now) fn()
    },
    get size() {
      return due.size
    }
  }
}

test('U24: Delete all on All pages hides and then clears every open comment of the site', () => {
  const lists = createCommentLists()
  lists.accept(
    listOf([c('h1'), c('s1', { url: SERVICES }), c('hx', { status: 'resolved', resolvedAt: NOW })])
  )
  const acts = []
  const timers = manualTimers()
  const clearing = createPendingClear({ lists, act: (a) => acts.push(a), timers, delayMs: 1000 })
  assert.equal(clearing.start({ filter: 'all' }), 2)
  assert.deepEqual(viewModel(lists.getSnapshot(), { filter: 'all' }).open, [])
  timers.fire()
  assert.deepEqual(
    acts.map((a) => [a.kind, a.ids]),
    [
      ['hide', ['h1', 's1']],
      ['clear', ['h1', 's1']]
    ],
    'the hidden resolved one is never named (U26)'
  )
})

test('U33: a Resolve waits as "Resolved. Undo"; the time up sends it, Undo sends nothing', () => {
  const acts = []
  const timers = manualTimers()
  const resolving = createPendingResolve({ act: (a) => acts.push(a), timers })
  const detail = { tabId: 'tab-a', sessionId: 's1', kind: 'resolve', ids: ['h1'] }
  resolving.start(detail)
  resolving.start({ ...detail, ids: ['h2'] })
  assert.deepEqual([...resolving.get()], ['h1', 'h2'])
  assert.deepEqual(acts, [], 'nothing reaches the Browser tab during the window')
  resolving.undo('h2')
  assert.deepEqual([...resolving.get()], ['h1'])
  timers.fire()
  assert.deepEqual(acts, [detail], 'only the one not undone')
  assert.deepEqual([...resolving.get()], [])
})

test('U33: the window is about 5 s; leaving the page sends what waits', () => {
  assert.equal(RESOLVE_UNDO_MS, 5000)
  const acts = []
  const timers = manualTimers()
  const resolving = createPendingResolve({ act: (a) => acts.push(a), timers })
  resolving.start({ tabId: 'tab-a', sessionId: 's1', kind: 'resolve', ids: ['h1'] })
  resolving.commit()
  assert.equal(acts.length, 1)
  assert.equal(timers.size, 0)
  timers.fire()
  assert.equal(acts.length, 1, 'never twice')
})
