import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assetCache } from '../src/lib/asset-cache.js'

const payload = Buffer.from('{"chosen":"one design system"}')
const descriptor = {
  sha256: createHash('sha256').update(payload).digest('hex'),
  bytes: payload.length
}

test('real HTTP: concurrent selection downloads once, survives restart offline, repairs corrupt cache', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tracy-asset-cache-'))
  let calls = 0
  const server = createServer((req, res) => {
    calls++
    assert.equal(req.url, `/assets/blobs/${descriptor.sha256}`)
    res.end(payload)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}/assets`
  try {
    const cache = assetCache({ origin, directory })
    assert.equal(calls, 0)
    const files = await Promise.all(Array.from({ length: 8 }, () => cache.ensure(descriptor)))
    assert.equal(new Set(files).size, 1)
    assert.equal(calls, 1)
    assert.deepEqual(await readFile(files[0]), payload)
    await writeFile(files[0], Buffer.alloc(payload.length))
    await cache.ensure(descriptor)
    assert.equal(calls, 2)
    const offline = assetCache({
      origin,
      directory,
      fetchImpl: () => {
        throw new Error('offline')
      }
    })
    assert.equal(await offline.ensure(descriptor), files[0])
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})

test('refuses truncated, oversized and wrong-hash data without installing it; failed fetch is retryable', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tracy-asset-cache-'))
  let body = Buffer.alloc(payload.length)
  const cache = assetCache({
    origin: 'https://assets.example.test/v1/',
    directory,
    fetchImpl: async (_, options) => {
      assert.equal(options.redirect, 'error')
      return new Response(body)
    }
  })
  try {
    for (const bad of [
      Buffer.alloc(payload.length),
      payload.subarray(1),
      Buffer.concat([payload, payload])
    ]) {
      body = bad
      await assert.rejects(cache.ensure(descriptor))
      assert.deepEqual(await readdir(directory), [])
    }
    body = payload
    assert.deepEqual(await readFile(await cache.ensure(descriptor)), payload)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects unsafe base URLs and invalid descriptors before any fetch', async () => {
  for (const origin of [
    'http://example.test',
    'file:///tmp',
    'https://user:pass@example.test',
    'https://example.test/?token=x'
  ])
    assert.throws(() => assetCache({ origin, directory: '/tmp/cache' }))
  const cache = assetCache({
    origin: 'https://assets.example.test',
    directory: '/tmp/cache',
    fetchImpl: () => {
      throw new Error('must not fetch')
    }
  })
  for (const asset of [
    { ...descriptor, sha256: '../escape' },
    { ...descriptor, bytes: 0 },
    { ...descriptor, bytes: 100_000_000 }
  ])
    await assert.rejects(cache.ensure(asset), /Invalid asset descriptor/)
})

test('cache budget evicts older verified blobs and preserves unrelated files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tracy-asset-budget-'))
  try {
    await writeFile(path.join(directory, 'notes.txt'), 'keep')
    const blobs = new Map()
    const cache = assetCache({
      origin: 'https://assets.example.test',
      directory,
      maxBytes: 30,
      cacheBytes: 60,
      fetchImpl: async (url) => new Response(blobs.get(new URL(url).pathname.split('/').at(-1)))
    })
    for (const value of ['a', 'b', 'c']) {
      const bytes = Buffer.from(value.repeat(30))
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      blobs.set(sha256, bytes)
      await cache.ensure({ sha256, bytes: bytes.length })
    }
    assert.equal((await readdir(directory)).filter((n) => /^[a-f0-9]{64}$/.test(n)).length, 2)
    assert.equal(await readFile(path.join(directory, 'notes.txt'), 'utf8'), 'keep')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
