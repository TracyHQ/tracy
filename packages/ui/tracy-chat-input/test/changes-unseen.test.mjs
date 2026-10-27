/**
 * The unseen-changes count told to the right column (`changes-unseen.mjs`): said on every change of
 * the store, answered in place when a tab asks, silent after stop.
 *
 *   node --test packages/ui/tracy-chat-input/test/changes-unseen.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tellChangesCount, UNSEEN_EVENT, UNSEEN_STATE_EVENT } from '../src/client/changes-unseen.mjs'

const SITE = 'badgewp.badge.tracy.test'

/** A store whose count the test moves by hand. */
function fakeStore(initial = null) {
  let count = initial
  const listeners = new Set()
  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getSnapshot: () => count,
    set(n) {
      count = n
      for (const fn of listeners) fn()
    },
    listeners: () => listeners.size
  }
}

test('says the count on start and on every change, with the site; the same number twice is said once', () => {
  const store = fakeStore(null)
  const target = new EventTarget()
  const heard = []
  target.addEventListener(UNSEEN_EVENT, (e) => heard.push(e.detail))
  const stop = tellChangesCount({ store, siteKey: SITE, target })
  store.set(3)
  store.set(3)
  store.set(0)
  assert.deepEqual(heard, [
    { siteKey: SITE, count: null },
    { siteKey: SITE, count: 3 },
    { siteKey: SITE, count: 0 }
  ])
  stop()
})

test('answers a tab’s ask in place for this site, and leaves another site’s ask alone', () => {
  const store = fakeStore(2)
  const target = new EventTarget()
  const stop = tellChangesCount({ store, siteKey: SITE, target })
  const mine = new CustomEvent(UNSEEN_STATE_EVENT, { detail: { siteKey: SITE } })
  target.dispatchEvent(mine)
  assert.equal(mine.detail.count, 2)
  const other = new CustomEvent(UNSEEN_STATE_EVENT, { detail: { siteKey: 'other.test' } })
  target.dispatchEvent(other)
  assert.equal('count' in other.detail, false)
  const bare = new CustomEvent(UNSEEN_STATE_EVENT, { detail: {} })
  target.dispatchEvent(bare)
  assert.equal(bare.detail.count, 2, 'an ask naming no site is this page’s')
  stop()
})

test('after stop: nothing said, nothing answered, no listener left on the store', () => {
  const store = fakeStore(1)
  const target = new EventTarget()
  const heard = []
  target.addEventListener(UNSEEN_EVENT, (e) => heard.push(e.detail.count))
  const stop = tellChangesCount({ store, siteKey: SITE, target })
  stop()
  store.set(5)
  const ask = new CustomEvent(UNSEEN_STATE_EVENT, { detail: { siteKey: SITE } })
  target.dispatchEvent(ask)
  assert.deepEqual(heard, [1])
  assert.equal('count' in ask.detail, false)
  assert.equal(store.listeners(), 0)
})
