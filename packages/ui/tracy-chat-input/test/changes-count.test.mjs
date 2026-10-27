/**
 * The start screen's Site changes count (plan `tasks/todo-site-changes-badge-count.md` §3): a store
 * that reads `/activity/unseen`, drops to 0 the moment the tab says the list was looked at, and reads
 * again when the site may have moved on. Pure: a fake read and fake window/document targets.
 *
 *   node --test packages/ui/tracy-chat-input/test/changes-count.test.mjs
 */
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { CHANGES_SEEN_EVENT, createChangesCount } from '../src/client/changes-count.mjs'
import { TURN_END_EVENT } from '../src/client/comment-status.mjs'

const SITE = 'scv2wp.scv2.tracy.test'

/** A read whose answers the test hands out in order, one deferred at a time. */
function fakeRead() {
  /** @type {{resolve: (v: any) => void, reject: (e: any) => void}[]} */
  const pending = []
  const read = () =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject })
    })
  return {
    read,
    calls: () => pending.length,
    answer: (count, i = pending.length - 1, extra = {}) =>
      pending[i].resolve({ count, since: 's', readAt: 'r', complete: true, ...extra }),
    fail: (i = pending.length - 1) => pending[i].reject(new Error('down'))
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function fakeDoc(state = 'visible') {
  const doc = new EventTarget()
  doc.visibilityState = state
  return doc
}

test('null until the first answer, then the count; a subscriber hears each change', async () => {
  const r = fakeRead()
  const store = createChangesCount({ siteKey: SITE, read: r.read, target: new EventTarget(), doc: fakeDoc() })
  let heard = 0
  store.subscribe(() => heard++)
  assert.equal(store.getSnapshot(), null)
  assert.equal(r.calls(), 1)
  r.answer(3)
  await tick()
  assert.equal(store.getSnapshot(), 3)
  assert.equal(heard, 1)
  store.stop()
})

test('the tab marked this site seen: 0 at once, then a fresh read; another site is ignored', async () => {
  const r = fakeRead()
  const target = new EventTarget()
  const store = createChangesCount({ siteKey: SITE, read: r.read, target, doc: fakeDoc() })
  r.answer(5)
  await tick()
  target.dispatchEvent(
    new CustomEvent(CHANGES_SEEN_EVENT, { detail: { siteKey: 'other.test', seenAt: 'x' } })
  )
  assert.equal(store.getSnapshot(), 5)
  assert.equal(r.calls(), 1)
  target.dispatchEvent(new CustomEvent(CHANGES_SEEN_EVENT, { detail: { siteKey: SITE, seenAt: 'x' } }))
  assert.equal(store.getSnapshot(), 0)
  assert.equal(r.calls(), 2)
  r.answer(0)
  await tick()
  assert.equal(store.getSnapshot(), 0)
  store.stop()
})

test('a turn ended on this site (or on no named site), the page shown again, the window focused: read again', async () => {
  const r = fakeRead()
  const target = new EventTarget()
  const doc = fakeDoc('hidden')
  const store = createChangesCount({ siteKey: SITE, read: r.read, target, doc })
  r.answer(1)
  await tick()
  target.dispatchEvent(
    new CustomEvent(TURN_END_EVENT, { detail: { sessionId: 's', requestId: 'q', siteKey: 'other.test' } })
  )
  assert.equal(r.calls(), 1)
  target.dispatchEvent(
    new CustomEvent(TURN_END_EVENT, { detail: { sessionId: 's', requestId: 'q', siteKey: SITE } })
  )
  assert.equal(r.calls(), 2)
  target.dispatchEvent(new CustomEvent(TURN_END_EVENT, { detail: { sessionId: 's', requestId: 'q' } }))
  assert.equal(r.calls(), 3)
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(r.calls(), 3, 'hidden: no read')
  doc.visibilityState = 'visible'
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(r.calls(), 4)
  target.dispatchEvent(new Event('focus'))
  assert.equal(r.calls(), 5)
  store.stop()
})

test('only the newest read lands; a failed read keeps the old count; nothing lands after stop', async () => {
  const r = fakeRead()
  const target = new EventTarget()
  const store = createChangesCount({ siteKey: SITE, read: r.read, target, doc: fakeDoc() })
  r.answer(2)
  await tick()
  store.refresh()
  store.refresh()
  assert.equal(r.calls(), 3)
  r.answer(9, 2)
  await tick()
  assert.equal(store.getSnapshot(), 9)
  r.answer(7, 1)
  await tick()
  assert.equal(store.getSnapshot(), 9, 'an older read landing late changes nothing')
  store.refresh()
  r.fail()
  await tick()
  assert.equal(store.getSnapshot(), 9)
  store.refresh()
  store.stop()
  r.answer(1)
  await tick()
  assert.equal(store.getSnapshot(), 9)
  target.dispatchEvent(new Event('focus'))
  assert.equal(r.calls(), 5, 'stopped: no listener left')
})

test('on a clock while the page is shown: read again every `everyMs`; a hidden page asks nothing; stop ends it', async () => {
  mock.timers.enable({ apis: ['setInterval'] })
  try {
    const r = fakeRead()
    const doc = fakeDoc('visible')
    const store = createChangesCount({
      siteKey: SITE,
      read: r.read,
      target: new EventTarget(),
      doc,
      everyMs: 1000
    })
    assert.equal(r.calls(), 1)
    mock.timers.tick(1000)
    assert.equal(r.calls(), 2)
    doc.visibilityState = 'hidden'
    mock.timers.tick(1000)
    assert.equal(r.calls(), 2)
    doc.visibilityState = 'visible'
    mock.timers.tick(1000)
    assert.equal(r.calls(), 3)
    store.stop()
    mock.timers.tick(5000)
    assert.equal(r.calls(), 3)
  } finally {
    mock.timers.reset()
  }
})

test('`everyMs: 0` never asks on a clock', () => {
  mock.timers.enable({ apis: ['setInterval'] })
  try {
    const r = fakeRead()
    const store = createChangesCount({
      siteKey: SITE,
      read: r.read,
      target: new EventTarget(),
      doc: fakeDoc(),
      everyMs: 0
    })
    mock.timers.tick(120_000)
    assert.equal(r.calls(), 1)
    store.stop()
  } finally {
    mock.timers.reset()
  }
})

test('an answer that says `pulling` is asked once more after PULL_SETTLE_MS, not again after that', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  try {
    const r = fakeRead()
    const store = createChangesCount({
      siteKey: SITE,
      read: r.read,
      target: new EventTarget(),
      doc: fakeDoc(),
      everyMs: 0
    })
    r.answer(0, 0, { pulling: true })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(r.calls(), 1)
    mock.timers.tick(2500)
    assert.equal(r.calls(), 2, 'one follow-up ask once the pull had time to settle')
    r.answer(2, 1)
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(store.getSnapshot(), 2)
    mock.timers.tick(10_000)
    assert.equal(r.calls(), 2, 'an answer without pulling schedules nothing')
    store.stop()
  } finally {
    mock.timers.reset()
  }
})
