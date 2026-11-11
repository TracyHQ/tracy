import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { storeObjects } from '../src/lib/store-objects.js'

const credentials = { bucket: 'test-media', accessKey: 'test-key', secretKey: 'test-secret' }

async function serverFor(t, handle) {
  const server = createServer(handle)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    return new Promise((resolve) => server.close(resolve))
  })
  return { ...credentials, endpoint: `http://127.0.0.1:${server.address().port}` }
}

for (const method of ['PUT', 'GET', 'HEAD', 'DELETE']) {
  test(`object ${method} aborts stalled headers and releases its connection`, {
    timeout: 5000
  }, async (t) => {
    let closed
    const disconnected = new Promise((resolve) => {
      closed = resolve
    })
    const store = await serverFor(t, (req) => req.on('close', closed))
    const objects = storeObjects(store, fetch, { timeoutMs: 100 })
    const result =
      method === 'PUT'
        ? await objects.put('photo.png', Buffer.from('picture'), 'image/png')
        : await objects[method === 'DELETE' ? 'delete' : method.toLowerCase()]('photo.png')
    assert.equal(result, ['PUT', 'DELETE'].includes(method) ? false : null)
    await disconnected
  })
}

test('object GET deadline remains active after headers and first bytes', { timeout: 5000 }, async (t) => {
  let closed
  const disconnected = new Promise((resolve) => {
    closed = resolve
  })
  const store = await serverFor(t, (req, res) => {
    req.on('close', closed)
    res.writeHead(206, { 'content-type': 'image/png', 'content-range': 'bytes 0-9/10' })
    res.write('first')
  })
  const objects = storeObjects(store, fetch, { timeoutMs: 150 })
  const response = await objects.get('photo.png')
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 0-9/10')
  assert.match(response.url, /\/test-media\/photo\.png\?/)
  await assert.rejects(response.arrayBuffer(), (error) => ['AbortError', 'TimeoutError'].includes(error.name))
  await disconnected
})

test('caller cancellation aborts object GET body and PUT before the deadline', {
  timeout: 5000
}, async (t) => {
  const store = await serverFor(t, (_req, res) => {
    res.writeHead(200)
    res.write('first')
  })
  const objects = storeObjects(store, fetch, { timeoutMs: 4000 })
  const controller = new AbortController()
  const response = await objects.get('photo.png', { signal: controller.signal })
  const body = response.arrayBuffer()
  controller.abort()
  await assert.rejects(body, { name: 'AbortError' })
  assert.equal(
    await objects.put('photo.png', Buffer.from('picture'), 'image/png', { signal: controller.signal }),
    false
  )
})

test('object responses preserve bytes and status; metadata calls release unused bodies', async (t) => {
  const bytes = Buffer.from([1, 4, 8, 16])
  const store = await serverFor(t, (req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-length': String(bytes.length) })
      res.end()
    } else if (req.method === 'DELETE') {
      res.writeHead(404)
      res.end()
    } else if (req.method === 'PUT') {
      req.resume()
      req.on('end', () => {
        res.writeHead(201)
        res.end('unused')
      })
    } else {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(bytes)
    }
  })
  const objects = storeObjects(store, fetch)
  assert.equal(await objects.put('photo.png', bytes, 'image/png'), true)
  assert.deepEqual(await objects.head('photo.png'), { size: bytes.length })
  const response = await objects.get('photo.png')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  assert.equal(await objects.delete('absent.png'), true)
  assert.equal(await objects.publicUrl('photo.png'), null)
  assert.equal(storeObjects(null, fetch), null)
})

test('injected object transports retain signals and failed requests retain false/null results', async () => {
  const seen = []
  const objects = storeObjects(
    { ...credentials, endpoint: 'https://storage.example' },
    async (_url, init) => {
      seen.push(init)
      throw new Error('Transport unavailable')
    }
  )
  assert.equal(await objects.put('photo.png', new Uint8Array([1]), 'image/png'), false)
  assert.equal(await objects.get('photo.png'), null)
  assert.equal(await objects.head('photo.png'), null)
  assert.equal(await objects.delete('photo.png'), false)
  assert.deepEqual(
    seen.map((init) => init.method),
    ['PUT', 'GET', 'HEAD', 'DELETE']
  )
  assert.ok(seen.every((init) => init.signal instanceof AbortSignal))
})

test('status-only object operations cancel unused bodies and reject missing or invalid sizes', async () => {
  let cancelled = 0
  let length = null
  const objects = storeObjects(
    { ...credentials, endpoint: 'https://storage.example' },
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled += 1
          }
        }),
        {
          headers: length === null ? {} : { 'content-length': length }
        }
      )
  )
  assert.equal(await objects.put('photo.png', new Uint8Array([1]), 'image/png'), true)
  assert.equal(await objects.head('photo.png'), null)
  length = '-1'
  assert.equal(await objects.head('photo.png'), null)
  length = 'not-a-number'
  assert.equal(await objects.head('photo.png'), null)
  assert.equal(await objects.delete('photo.png'), true)
  assert.equal(cancelled, 5)
})

test('caller cancellation interrupts an active object upload', { timeout: 5000 }, async (t) => {
  let arrived
  const receiving = new Promise((resolve) => {
    arrived = resolve
  })
  let closed
  const disconnected = new Promise((resolve) => {
    closed = resolve
  })
  const store = await serverFor(t, (req, res) => {
    res.on('close', closed)
    req.resume()
    arrived()
  })
  const objects = storeObjects(store, fetch, { timeoutMs: 4000 })
  const controller = new AbortController()
  const upload = objects.put('photo.png', Buffer.alloc(1024 * 1024), 'image/png', {
    signal: controller.signal
  })
  await receiving
  controller.abort()
  assert.equal(await upload, false)
  await disconnected
})
