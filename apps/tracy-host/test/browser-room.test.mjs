// How much browser work a host runs at once (`src/browser-room.js`), and the slots that hold it to that.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browserRunsOf, demoQaTabsOf } from '../src/browser-room.js'
import { visionSlot } from '../src/vision-stream.js'

const GB = 1024 ** 3

test('a small host keeps one QA run, one capture and one tab; a bigger one runs more, up to three', () => {
  assert.equal(browserRunsOf({}, 7.6 * GB), 1)
  assert.equal(browserRunsOf({}, 16 * GB), 2)
  assert.equal(browserRunsOf({}, 64 * GB), 3)
  assert.equal(demoQaTabsOf({}, 7.6 * GB), 1)
  assert.equal(demoQaTabsOf({}, 16 * GB), 3)
})

test('a setting overrides the memory rule; anything but a positive whole number is ignored', () => {
  assert.equal(browserRunsOf({ TRACY_BROWSER_RUNS: '4' }, 7.6 * GB), 4)
  assert.equal(demoQaTabsOf({ TRACY_DEMO_QA_TABS: '2' }, 64 * GB), 2)
  for (const bad of ['0', '-1', '1.5', 'many', ''])
    assert.equal(browserRunsOf({ TRACY_BROWSER_RUNS: bad }, 7.6 * GB), 1, bad)
})

test('a slot of two lets two runs in, the third waits in order and a waiter past its deadline leaves', async () => {
  const slot = visionSlot(Infinity, 2)
  const signal = new AbortController().signal
  const a = await slot(signal)
  const b = await slot(signal)
  const order = []
  const late = new AbortController()
  const gone = slot(late.signal).then(
    () => order.push('gone'),
    () => order.push('expired')
  )
  const c = slot(signal).then((release) => (order.push('c'), release))
  late.abort(new Error('deadline'))
  await gone
  a()
  const releaseC = await c
  assert.deepEqual(order, ['expired', 'c'])
  b()
  releaseC()
  // Freed slots are free again.
  const d = await slot(signal)
  const e = await slot(signal)
  d()
  e()
})

test('one slot is the old one-at-a-time queue, with its bounded waiting line', async () => {
  const slot = visionSlot(1, 1)
  const signal = new AbortController().signal
  const a = await slot(signal)
  const waiting = slot(signal)
  await assert.rejects(slot(signal), { code: 'CAPTURE_BUSY' })
  a()
  ;(await waiting)()
})

test("the incremental QA's read cache holds a few sites of ~50 pages: a 32nd of the memory, 64 to 512 MB", async () => {
  const { demoReadCacheBytesOf } = await import('../src/browser-room.js')
  const MB = 1024 * 1024
  assert.equal(demoReadCacheBytesOf({}, 1 * GB), 64 * MB)
  assert.equal(demoReadCacheBytesOf({}, 8 * GB), 256 * MB)
  assert.equal(demoReadCacheBytesOf({}, 64 * GB), 512 * MB)
  assert.equal(demoReadCacheBytesOf({ TRACY_DEMO_QA_CACHE_MB: '100' }, 64 * GB), 100 * MB)
})
