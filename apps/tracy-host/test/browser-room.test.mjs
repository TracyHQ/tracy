// How much browser work a host runs at once (`src/browser-room.js`), and the slots that hold it to that.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browserRunsOf, demoQaTabsOf, visionStreamsOf } from '../src/browser-room.js'
import { createVisionCapturer } from '../src/vision-capture.js'
import { visionSlot } from '../src/vision-stream.js'

const GB = 1024 ** 3

test('a small host keeps one QA run and one tab; a bigger one runs more, up to three', () => {
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

test('capture streams are their own count: an 8 GB host shoots four pages at once, a tiny one keeps one', () => {
  assert.equal(visionStreamsOf({}, 1.5 * GB), 1)
  assert.equal(visionStreamsOf({}, 7.6 * GB), 3)
  assert.equal(visionStreamsOf({}, 8.3 * GB), 4)
  assert.equal(visionStreamsOf({}, 64 * GB), 4)
  assert.equal(visionStreamsOf({ TRACY_VISION_STREAMS: '2' }, 64 * GB), 2)
  for (const bad of ['0', '-1', '1.5', 'many', ''])
    assert.equal(visionStreamsOf({ TRACY_VISION_STREAMS: bad }, 8.3 * GB), 4, bad)
})

test('the capturer runs as many page streams at once as it is given, and no more', async () => {
  let open = 0
  let most = 0
  let letGo
  const held = new Promise((resolve) => {
    letGo = resolve
  })
  // Every page view stops in `prepare`; the count of views waiting there at once is the capturer's concurrency.
  const browser = { newContext: async () => ({ close: async () => {} }) }
  const capture = createVisionCapturer({
    launched: async () => browser,
    prepare: async () => {
      open++
      most = Math.max(most, open)
      await held
      open--
      throw Object.assign(new Error('stop here'), { code: 'FIXTURE_STOP' })
    },
    streams: 4
  })
  const drain = async () => {
    const frames = []
    for await (const frame of capture({
      layouts: [{ key: 'home', path: '/' }],
      base: 'http://fixture.invalid',
      signal: AbortSignal.timeout(5000)
    }))
      frames.push(frame)
    return frames
  }
  const runs = Array.from({ length: 6 }, drain)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(most, 4)
  letGo()
  const all = await Promise.all(runs)
  assert.ok(all.every((frames) => frames.at(-1).type === 'end' && frames.at(-1).complete === false))
  assert.equal(most, 4)
})
