#!/usr/bin/env node
/**
 * The role follows a change made while the page is open (#1036), `src/client/seat-role.mjs`:
 * `createSeatRole().refresh`, `roleShift`, `createPromotedNotice`, `watchRoleSignals`,
 * `mirrorViewerAttr`.
 *
 *   node --test packages/ui/tracy-chat-input/test/seat-role-live.test.mjs
 *
 * What can go wrong: a Viewer made Editor keeps the Viewer screen until a reload (or the reverse),
 * an older answer paints over a newer one, or a removed seat's page turns into an editing screen.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createAskedSites,
  createPromotedNotice,
  createSeatRole,
  mirrorViewerAttr,
  roleShift,
  watchRoleSignals
} from '../src/client/seat-role.mjs'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const answer = (role, extra = {}) => ({
  status: 200,
  body: { sites: role === undefined ? [] : [{ siteKey: 'a.test', role, ...extra }] }
})

/** A `read` whose next answer the test sets, recording the options of every call. */
function fakeRead(first) {
  const calls = []
  let next = first
  return {
    calls,
    set: (a) => {
      next = a
    },
    read: async (options) => {
      calls.push(options)
      return next
    }
  }
}

test('refresh reads the door again with refresh, and a new role tells every listener', async () => {
  const door = fakeRead(answer('viewer'))
  const store = createSeatRole({ siteKey: 'a.test', read: door.read })
  await tick()
  assert.equal(store.getSnapshot(), 'viewer')
  assert.equal(door.calls[0], undefined, 'the first read takes the page answer')
  let told = 0
  const shifts = []
  store.subscribe(() => told++)
  store.onChange((prev, next) => shifts.push([prev, next]))
  door.set(answer('editor'))
  await store.refresh()
  assert.deepEqual(door.calls[1], { refresh: true })
  assert.equal(store.getSnapshot(), 'editor')
  assert.equal(told, 1)
  assert.deepEqual(shifts, [['viewer', 'editor']])
  // The same role again: nothing to tell.
  await store.refresh()
  assert.equal(told, 1)
  // And back: Editor made Viewer.
  door.set(answer('viewer'))
  await store.refresh()
  assert.equal(store.getSnapshot(), 'viewer')
  assert.deepEqual(shifts.at(-1), ['editor', 'viewer'])
  store.stop()
})

test('a failed refresh or a vanished row keeps the role the page knows', async () => {
  const door = fakeRead(answer('viewer'))
  const store = createSeatRole({ siteKey: 'a.test', read: door.read })
  await tick()
  door.set({ status: 500, body: null })
  await store.refresh()
  assert.equal(store.getSnapshot(), 'viewer')
  door.set(answer(undefined))
  await store.refresh()
  assert.equal(store.getSnapshot(), 'viewer', 'a removed seat does not turn into an editing screen')
  store.stop()
})

test('only the newest read writes: an older answer arriving last is dropped', async () => {
  const resolvers = []
  const store = createSeatRole({
    siteKey: 'a.test',
    read: () => new Promise((resolve) => resolvers.push(resolve))
  })
  await tick()
  const second = store.refresh()
  await tick()
  resolvers[1](answer('editor'))
  await second
  resolvers[0](answer('viewer'))
  await tick()
  assert.equal(store.getSnapshot(), 'editor')
  store.stop()
})

test('a role change answers a waiting request: the bar offers the button again later', async () => {
  const door = fakeRead(answer('viewer', { editRequestedAt: '2026-10-08T00:00:00Z' }))
  const asked = createAskedSites()
  const store = createSeatRole({ siteKey: 'a.test', read: door.read, asked })
  await tick()
  assert.equal(asked.has('a.test'), true)
  door.set(answer('editor'))
  await store.refresh()
  assert.equal(asked.has('a.test'), false)
  store.stop()
})

test('roleShift: Viewer to Editor or Owner is a promotion, back to Viewer a demotion', () => {
  assert.equal(roleShift('viewer', 'editor'), 'promoted')
  assert.equal(roleShift('viewer', 'owner'), 'promoted')
  assert.equal(roleShift('editor', 'viewer'), 'demoted')
  assert.equal(roleShift('owner', 'viewer'), 'demoted')
  assert.equal(roleShift(null, 'editor'), null, 'the first read is not news')
  assert.equal(roleShift(null, 'viewer'), null)
  assert.equal(roleShift('editor', 'owner'), null)
  assert.equal(roleShift('viewer', 'admin'), null, 'an unknown role claims nothing')
})

test('the notice shows on a promotion, goes after its time, and goes at once on a demotion', async () => {
  const door = fakeRead(answer('viewer'))
  const store = createSeatRole({ siteKey: 'a.test', read: door.read })
  await tick()
  const timers = []
  const notice = createPromotedNotice({
    seatRole: store,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false }
      timers.push(t)
      return t
    },
    clearTimer: (t) => {
      t.cleared = true
    }
  })
  let told = 0
  notice.subscribe(() => told++)
  assert.equal(notice.getSnapshot(), false)
  door.set(answer('editor'))
  await store.refresh()
  assert.equal(notice.getSnapshot(), true)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 8000)
  timers[0].fn()
  assert.equal(notice.getSnapshot(), false)
  assert.equal(told, 2)

  door.set(answer('viewer'))
  await store.refresh()
  door.set(answer('owner'))
  await store.refresh()
  assert.equal(notice.getSnapshot(), true)
  door.set(answer('viewer'))
  await store.refresh()
  assert.equal(notice.getSnapshot(), false, 'demoted: no notice of its own, the old one goes')
  assert.equal(timers.at(-1).cleared, true)
  notice.stop()
  store.stop()
})

test('the first read of a Viewer or an Editor shows no notice', async () => {
  const store = createSeatRole({ siteKey: 'a.test', read: async () => answer('editor') })
  const notice = createPromotedNotice({ seatRole: store, setTimer: () => 0, clearTimer: () => {} })
  await tick()
  assert.equal(store.getSnapshot(), 'editor')
  assert.equal(notice.getSnapshot(), false)
})

/** A tiny event target and document for `watchRoleSignals`. */
function fakeTargets() {
  const target = new EventTarget()
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  return { target, doc }
}

test('the page reads the role again on the book-changed event and on coming back into sight', () => {
  const { target, doc } = fakeTargets()
  let now = 100_000
  let asks = 0
  const stop = watchRoleSignals({
    refresh: () => asks++,
    event: 'tracy:team-changed',
    target,
    doc,
    now: () => now
  })
  target.dispatchEvent(new Event('tracy:team-changed'))
  assert.equal(asks, 1, 'the Inbox saw a team row: read again')
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(asks, 1, 'back in sight right after a read: no second ask')
  now += 10_000
  doc.visibilityState = 'hidden'
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(asks, 1, 'going out of sight asks nothing')
  doc.visibilityState = 'visible'
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(asks, 2, 'back in sight later: one read')
  target.dispatchEvent(new Event('tracy:team-changed'))
  assert.equal(asks, 3, 'every book-changed event reads again')
  stop()
  target.dispatchEvent(new Event('tracy:team-changed'))
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(asks, 3, 'stopped: nothing heard')
})

test('the viewer attribute on <html> follows the role both ways and goes on stop', async () => {
  const attrs = new Set()
  const root = {
    toggleAttribute: (name, force) => (force ? attrs.add(name) : attrs.delete(name)),
    removeAttribute: (name) => attrs.delete(name)
  }
  const door = fakeRead(answer('viewer'))
  const store = createSeatRole({ siteKey: 'a.test', read: door.read })
  const stop = mirrorViewerAttr(root, store, 'data-tracy-seat-viewer')
  assert.equal(attrs.has('data-tracy-seat-viewer'), false, 'not read yet: as every seat')
  await tick()
  assert.equal(attrs.has('data-tracy-seat-viewer'), true)
  door.set(answer('editor'))
  await store.refresh()
  assert.equal(attrs.has('data-tracy-seat-viewer'), false)
  door.set(answer('viewer'))
  await store.refresh()
  assert.equal(attrs.has('data-tracy-seat-viewer'), true)
  stop()
  assert.equal(attrs.has('data-tracy-seat-viewer'), false)
})

// J7.8 (e2e 04/10): a seat taken back while its page was open sent a message into silence. The store
// says so once a read that had the site's row finds it gone; the role it knew stays as it was.
test('a row that vanishes after the page had it marks the seat removed; a failed read does not', async () => {
  const door = fakeRead(answer('editor'))
  const store = createSeatRole({ siteKey: 'a.test', read: door.read })
  let heard = 0
  store.subscribe(() => heard++)
  await tick()
  assert.equal(store.isRemoved(), false)
  door.set({ status: 500, body: null })
  await store.refresh()
  assert.equal(store.isRemoved(), false, 'no answer is not a removal')
  door.set(answer(undefined))
  await store.refresh()
  assert.equal(store.isRemoved(), true)
  assert.equal(store.getSnapshot(), 'editor')
  assert.ok(heard >= 2, 'listeners hear the removal')
  store.stop()
})

test('a first read without the row is not a removal (a site the list has not caught up with yet)', async () => {
  const door = fakeRead(answer(undefined))
  const store = createSeatRole({ siteKey: 'a.test', read: door.read })
  await tick()
  assert.equal(store.isRemoved(), false)
  store.stop()
})

test('a seat invited again after removal is no longer removed', async () => {
  const door = fakeRead(answer('editor'))
  const store = createSeatRole({ siteKey: 'a.test', read: door.read })
  await tick()
  door.set(answer(undefined))
  await store.refresh()
  door.set(answer('viewer'))
  await store.refresh()
  assert.equal(store.isRemoved(), false)
  assert.equal(store.getSnapshot(), 'viewer')
  store.stop()
})
