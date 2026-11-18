import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  externalPassiveAsset,
  createAssetTransport,
  fulfillExternalAsset,
  MAX_ASSET_BYTES
} from '../template-kit/lib/asset-transport.mjs'

const site = { siteUrl: 'http://site.test:51710', hostHeader: 'customer.test' }
const request = (url, type = 'image', method = 'GET') => ({
  url: () => url,
  resourceType: () => type,
  method: () => method
})

test('external passive asset transport preserves the original URL and excludes active or same-site requests', () => {
  for (const type of ['image', 'font', 'stylesheet']) {
    assert.equal(externalPassiveAsset(request('http://assets.test/picture?signature=kept', type), site), true)
    assert.equal(externalPassiveAsset(request('https://assets.test/picture', type), site), true)
  }
  for (const type of ['document', 'script', 'fetch', 'xhr', 'media', 'other'])
    assert.equal(externalPassiveAsset(request('http://assets.test/file', type), site), false)
  for (const url of [
    'http://site.test:51710/file',
    'https://customer.test/file',
    'file:///asset',
    'data:image/png;base64,AA',
    'http://user:password@assets.test/file'
  ])
    assert.equal(externalPassiveAsset(request(url), site), false)
  assert.equal(externalPassiveAsset(request('http://assets.test/file', 'image', 'POST'), site), false)
})

function routeOf({ body = Buffer.from('actual asset bytes'), headers = {}, status = 200, fetchError } = {}) {
  const calls = []
  const response = {
    headers: () => headers,
    status: () => status,
    body: async () => {
      calls.push('body')
      return body
    },
    dispose: async () => {
      calls.push('dispose')
    }
  }
  const route = {
    fetch: async (options) => {
      calls.push({ fetch: options })
      if (fetchError) throw fetchError
      return response
    },
    fulfill: async (options) => {
      calls.push({ fulfill: options })
    }
  }
  return { route, response, body, calls }
}

test('passive transport preserves bytes, headers, status and browser-followed redirects with bounded fetch options', async () => {
  const fixture = routeOf({
    headers: { 'content-type': 'image/png', location: 'http://next.test/image' },
    status: 302
  })
  assert.equal(await fulfillExternalAsset(fixture.route), true)
  assert.deepEqual(fixture.calls[0], { fetch: { timeout: 15000, maxRedirects: 0 } })
  assert.deepEqual(fixture.calls[2], { fulfill: { response: fixture.response, body: fixture.body } })
  assert.equal(fixture.calls.at(-1), 'dispose')
})

test('oversized or failed passive fetches fall back without fulfilling or aborting the browser request', async () => {
  const declared = routeOf({ headers: { 'content-length': String(MAX_ASSET_BYTES + 1) } })
  const measured = routeOf({ body: Buffer.alloc(MAX_ASSET_BYTES + 1) })
  const failed = routeOf({ fetchError: new Error('timed out') })
  for (const fixture of [declared, measured, failed]) {
    assert.equal(await fulfillExternalAsset(fixture.route), false)
    assert.equal(
      fixture.calls.some((c) => c?.fulfill),
      false
    )
  }
  assert.equal(declared.calls.includes('body'), false)
  assert.equal(declared.calls.at(-1), 'dispose')
  assert.equal(measured.calls.at(-1), 'dispose')
})

test('one context bounds concurrent passive fetches and waiting requests', async () => {
  const transport = createAssetTransport({ maxConcurrent: 2, maxWaiting: 1 })
  const releases = []
  let active = 0
  let peak = 0
  const fixtures = Array.from({ length: 4 }, () => {
    const fixture = routeOf()
    const fetch = fixture.route.fetch
    fixture.route.fetch = async (options) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => releases.push(resolve))
      active--
      return fetch(options)
    }
    return fixture
  })
  const jobs = fixtures.slice(0, 3).map((f) => transport(f.route))
  assert.equal(await transport(fixtures[3].route), false, 'a full queue preserves the browser request')
  assert.equal(releases.length, 2)
  releases.shift()()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(releases.length, 2, 'the queued request takes the released slot')
  for (const release of releases) release()
  assert.deepEqual(await Promise.all(jobs), [true, true, true])
  assert.equal(peak, 2)
  for (const fixture of fixtures.slice(0, 3)) assert.equal(fixture.calls.at(-1), 'dispose')
})

test('body and fulfillment errors dispose the response without masking an already handled route', async () => {
  const unreadable = routeOf()
  unreadable.response.body = async () => {
    throw new Error('unreadable body')
  }
  assert.equal(await fulfillExternalAsset(unreadable.route), false)
  assert.equal(unreadable.calls.at(-1), 'dispose')
  const closed = routeOf()
  closed.route.fulfill = async () => {
    throw new Error('context closed')
  }
  await assert.rejects(fulfillExternalAsset(closed.route), /context closed/)
  assert.equal(closed.calls.at(-1), 'dispose')
})
