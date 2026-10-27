import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visionSlot, visionStream, VISION_FRAME_BYTES } from '../src/vision-stream.js'
import { hostStreamCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'

const config = { hosts: new Map([['demo', { origin: 'http://host.test', hostSecret: 'secret' }]]) }
const response = (bytes) => new Response(bytes, { headers: { 'content-type': 'application/x-ndjson' } })

test('stream parser handles split UTF-8 and multiple lines without treating a network chunk as a frame', async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ type: 'tile', text: 'B\u1ebfp \u1f36a' }) +
      '\n' +
      JSON.stringify({ type: 'end', complete: true }) +
      '\n'
  )
  let i = 0
  const frames = []
  const result = await hostStreamCall(
    config,
    'demo',
    '/capture',
    {},
    {
      onFrame: (frame) => frames.push(frame),
      fetchImpl: async (_url, init) => {
        assert.ok(init.headers['x-host-signature'])
        return response(
          new ReadableStream({
            pull(c) {
              if (i === bytes.length) c.close()
              else c.enqueue(bytes.subarray(i, ++i))
            }
          })
        )
      }
    }
  )
  assert.equal(result.ok, true)
  assert.deepEqual(
    frames.map((f) => f.type),
    ['tile', 'end']
  )
  assert.equal(frames[0].text, 'B\u1ebfp \u1f36a')
})

for (const [name, data] of [
  ['missing terminal', '{"type":"tile"}\n'],
  ['unterminated terminal', '{"type":"end"}'],
  ['row after terminal', '{"type":"end"}\n{"type":"tile"}\n'],
  ['oversized frame', JSON.stringify({ type: 'tile', jpeg: 'x'.repeat(VISION_FRAME_BYTES) }) + '\n'],
  ['malformed JSON', '{broken}\n']
])
  test(`${name} is a failed transport`, async () => {
    const r = await hostStreamCall(
      config,
      'demo',
      '/capture',
      {},
      { onFrame() {}, fetchImpl: async () => response(data) }
    )
    assert.equal(r.ok, false)
  })

test('unknown host never sends an unsigned request; ordinary JSON is not a successful stream', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls++
    return new Response('{"shots":[]}')
  }
  assert.equal(
    (await hostStreamCall(config, 'unknown', '/capture', {}, { onFrame() {}, fetchImpl })).ok,
    false
  )
  assert.equal(calls, 0)
  assert.equal((await hostStreamCall(config, 'demo', '/capture', {}, { onFrame() {}, fetchImpl })).ok, false)
})

test('a consumer failure cancels the source and aborts its model-call signal', async () => {
  let cancelled = false
  let seenSignal
  const r = await hostStreamCall(
    config,
    'demo',
    '/capture',
    {},
    {
      onFrame(_frame, signal) {
        seenSignal = signal
        throw new Error('model failed')
      },
      fetchImpl: async () =>
        response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('{"type":"tile"}\n'))
            },
            cancel() {
              cancelled = true
            }
          })
        )
    }
  )
  assert.equal(r.ok, false)
  assert.equal(cancelled, true)
  assert.equal(seenSignal.aborted, true)
})

test('producer is bounded by encoded bytes, and cancellation cleans up the iterator', async () => {
  let produced = 0
  let closed = false
  async function* source() {
    try {
      for (let i = 0; i < 100; i++) {
        produced++
        yield { type: 'tile', jpeg: 'x'.repeat(200000) }
      }
      yield { type: 'end' }
    } finally {
      closed = true
    }
  }
  const reader = visionStream(source()).getReader()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(produced <= 6, `bounded queue produced ${produced} frames`)
  await reader.cancel()
  assert.equal(closed, true)
})

test('queue has finite capacity, removes aborted waiters, and never double-releases', async () => {
  const acquire = visionSlot(1)
  const first = await acquire(new AbortController().signal)
  const cancelled = new AbortController()
  const queued = acquire(cancelled.signal)
  await assert.rejects(acquire(new AbortController().signal), { code: 'CAPTURE_BUSY' })
  cancelled.abort(new Error('stopped'))
  await assert.rejects(queued, /stopped/)
  let entered = false
  const next = acquire(new AbortController().signal).then((release) => {
    entered = true
    return release
  })
  await Promise.resolve()
  assert.equal(entered, false)
  first()
  const second = await next
  first()
  let thirdEntered = false
  const third = acquire(new AbortController().signal).then((release) => {
    thirdEntered = true
    return release
  })
  await Promise.resolve()
  assert.equal(thirdEntered, false)
  second()
  ;(await third)()
})

test('stream capture keeps the existing signed target fence and leaves ordinary captures as JSON', async () => {
  const shoot = async () => Buffer.from('png')
  let received
  shoot.vision = async function* (args) {
    received = args
    yield { type: 'end', version: 'vision-tiles/1', complete: true }
  }
  const app = buildApp({
    config: { hostName: 'demo', hostSecret: 'secret', sitesRoot: process.cwd() },
    run: async () => ({ code: 0 }),
    shoot
  })
  const fetchImpl = async (url, init) => app.fetch(new Request(url, init))
  const payload = {
    label: 'acme',
    platform: 'wordpress',
    layouts: [{ key: 'home', path: '/' }],
    mode: 'vision-tiles/1'
  }
  const result = await hostStreamCall(config, 'demo', '/capture', payload, { fetchImpl, onFrame() {} })
  assert.equal(result.ok, true)
  assert.equal(received.base, 'http://acme-web-1/')
  const bad = await hostStreamCall(
    config,
    'demo',
    '/capture',
    { ...payload, layouts: [{ key: 'home', path: 'https://evil.test/' }] },
    { fetchImpl, onFrame() {} }
  )
  assert.equal(bad.ok, false)
  assert.equal(bad.status, 400)
  const unsigned = await app.request('/_host/capture', { method: 'POST', body: JSON.stringify(payload) })
  assert.equal(unsigned.status, 403)
})

test('Node HTTP adapter propagates a disconnected slow consumer back to generator cleanup', async (t) => {
  const { serve } = await import('@hono/node-server')
  let produced = 0
  let cleaned = false
  const controller = new AbortController()
  async function* frames() {
    try {
      for (let n = 0; n < 100; n++) {
        controller.signal.throwIfAborted()
        produced++
        yield { type: 'tile', jpeg: 'x'.repeat(192 * 1024) }
      }
      yield { type: 'end', complete: true }
    } finally {
      cleaned = true
    }
  }
  const server = serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) =>
      new Response(
        visionStream(frames(), {
          signal: AbortSignal.any([controller.signal, request.signal]),
          cancel: () => controller.abort()
        }),
        { headers: { 'content-type': 'application/x-ndjson' } }
      )
  })
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => {
    controller.abort()
    server.closeAllConnections()
    server.close()
  })
  const result = await fetch(`http://127.0.0.1:${server.address().port}`)
  const reader = result.body.getReader()
  await reader.read()
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(produced < 40, `socket/adapter buffering must be bounded: ${produced} tiles`)
  await reader.cancel()
  for (let attempt = 0; attempt < 50 && !cleaned; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(cleaned, true)
})
