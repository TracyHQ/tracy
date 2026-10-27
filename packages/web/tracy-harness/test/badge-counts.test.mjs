import assert from 'node:assert/strict'
import test from 'node:test'

import { pressHandled } from '../src/beta/api.ts'
import { watchBadgeCounts } from '../src/shell/badge-counts.ts'

function browser() {
  const timers = new Map()
  let timerId = 0
  const win = Object.assign(new EventTarget(), {
    document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    setInterval(fn, delay) {
      timers.set(++timerId, { fn, delay })
      return timerId
    },
    clearInterval(id) {
      timers.delete(id)
    }
  })
  return { win, timers }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

function setup() {
  const b = browser()
  const values = { attention: 95, stuck: 9 }
  const seen = { attention: [], stuck: [] }
  const reads = []
  const start = () =>
    watchBadgeCounts({
      win: b.win,
      fetchAttentionCount: async (signal) => {
        reads.push(signal)
        if (values.attention instanceof Error) throw values.attention
        return values.attention
      },
      fetchStuckCount: async (signal) => {
        reads.push(signal)
        if (values.stuck instanceof Error) throw values.stuck
        return values.stuck
      },
      onAttentionCount: (n) => seen.attention.push(n),
      onStuckCount: (n) => seen.stuck.push(n)
    })
  return { ...b, values, seen, reads, start }
}

test('returning to a long-open tab refreshes both sidebar counts', async () => {
  const b = setup()
  const stop = b.start()
  await settle()
  assert.deepEqual(b.seen, { attention: [95], stuck: [9] })
  b.values.attention = 80
  b.values.stuck = 4
  b.win.dispatchEvent(new Event('focus'))
  await settle()
  assert.deepEqual(b.seen, { attention: [95, 80], stuck: [9, 4] })
  stop()
})

test('a visible tab refreshes within 30 seconds and releases its timer on stop', async () => {
  const b = setup()
  const stop = b.start()
  await settle()
  assert.equal(b.timers.size, 1)
  const timer = [...b.timers.values()][0]
  assert.ok(timer.delay > 0 && timer.delay <= 30_000)
  b.values.stuck = 0
  timer.fn()
  await settle()
  assert.deepEqual(b.seen.stuck, [9, 0])
  stop()
  assert.equal(b.timers.size, 0)
})

test('a failed refresh clears the old count instead of preserving it as current', async () => {
  const b = setup()
  const stop = b.start()
  await settle()
  b.values.attention = null
  b.values.stuck = new Error('offline')
  b.win.dispatchEvent(new Event('focus'))
  await settle()
  assert.deepEqual(b.seen, { attention: [95, null], stuck: [9, null] })
  stop()
})

test('hidden tabs wait until visible again, then read both current counts', async () => {
  const b = setup()
  const stop = b.start()
  await settle()
  b.win.document.visibilityState = 'hidden'
  for (const timer of b.timers.values()) timer.fn()
  b.win.dispatchEvent(new Event('focus'))
  await settle()
  assert.equal(b.reads.length, 2)
  b.values.stuck = 3
  b.win.document.visibilityState = 'visible'
  b.win.document.dispatchEvent(new Event('visibilitychange'))
  await settle()
  assert.deepEqual(b.seen.stuck, [9, 3])
  stop()
})

test('restarting the watcher on navigation aborts old reads and loads the new counts', async () => {
  const b = setup()
  const stop = b.start()
  stop()
  b.values.attention = 90
  b.values.stuck = 7
  const stopNext = b.start()
  await settle()
  assert.ok(b.reads[0].aborted && b.reads[1].aborted)
  assert.deepEqual(b.seen, { attention: [90], stuck: [7] })
  stopNext()
  b.win.dispatchEvent(new Event('focus'))
  b.win.dispatchEvent(new Event('tracy:stuck-changed'))
  b.win.document.dispatchEvent(new Event('visibilitychange'))
  await settle()
  assert.equal(b.reads.length, 4)
})

test('an older slow response cannot overwrite a newer refresh', async () => {
  const b = browser()
  const pending = []
  const seen = []
  const stop = watchBadgeCounts({
    win: b.win,
    fetchAttentionCount: async () => 95,
    fetchStuckCount: (signal) => new Promise((resolve) => pending.push({ signal, resolve })),
    onAttentionCount: () => {},
    onStuckCount: (n) => seen.push(n)
  })
  b.win.dispatchEvent(new Event('focus'))
  assert.equal(pending[0].signal.aborted, true)
  pending[1].resolve(4)
  await settle()
  pending[0].resolve(9)
  await settle()
  assert.deepEqual(seen, [4])
  stop()
})

test('mark handled invalidates a badge read begun before the change', async () => {
  const b = browser()
  const pending = []
  const seen = []
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  globalThis.window = b.win
  globalThis.fetch = async () => new Response(null, { status: 204 })
  const stop = watchBadgeCounts({
    win: b.win,
    fetchAttentionCount: async () => 95,
    fetchStuckCount: (signal) => new Promise((resolve) => pending.push({ signal, resolve })),
    onAttentionCount: () => {},
    onStuckCount: (n) => seen.push(n)
  })
  try {
    assert.deepEqual(await pressHandled('site-one'), { ok: true })
    // The page reports the fresh count after its successful POST and reload.
    seen.push(8)
    pending[0].resolve(9)
    await settle()
    assert.deepEqual(seen, [8], 'the pre-action read must not restore the old badge count')
    assert.equal(pending[0].signal.aborted, true)
    pending[1].resolve(8)
    await settle()
    assert.deepEqual(seen, [8, 8])
  } finally {
    stop()
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('only successful handled and reopen requests announce a count change', async () => {
  const win = new EventTarget()
  const events = []
  win.addEventListener('tracy:stuck-changed', (event) => events.push(event))
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  globalThis.window = win
  let ok = false
  globalThis.fetch = async () =>
    ok ? new Response(null, { status: 204 }) : Response.json({ code: 'FORBIDDEN' }, { status: 403 })
  try {
    assert.deepEqual(await pressHandled('site-one'), { ok: false, code: 'FORBIDDEN' })
    assert.equal(events.length, 0)
    ok = true
    assert.deepEqual(await pressHandled('site-one'), { ok: true })
    assert.deepEqual(await pressHandled('site-one', true), { ok: true })
    assert.equal(events.length, 2)
    assert.ok(
      events.every((event) => !('detail' in event)),
      'no customer data in the notification'
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})
