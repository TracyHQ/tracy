import assert from 'node:assert/strict'
import { test } from 'node:test'

import { openContext } from '../content-coverage/lib/render.mjs'

async function handler(siteUrl = 'http://site.test:51710') {
  let routeHandler
  const browser = {
    newContext: async () => ({
      route: async (_pattern, fn) => {
        routeHandler = fn
      }
    })
  }
  await openContext(browser, 'desktop', { siteUrl })
  return routeHandler
}

function routeOf({
  url = 'http://assets.test/font.css',
  type = 'stylesheet',
  method = 'GET',
  fail = false
} = {}) {
  const calls = []
  const body = Buffer.from('body { font-family: original-font; }')
  const response = {
    headers: () => ({ 'content-type': 'text/css' }),
    body: async () => body,
    dispose: async () => calls.push('dispose')
  }
  return {
    calls,
    body,
    response,
    request: () => ({ url: () => url, resourceType: () => type, method: () => method }),
    fetch: async (options) => {
      calls.push({ fetch: options, url })
      if (fail) throw new Error('asset unavailable')
      return response
    },
    fulfill: async (options) => calls.push({ fulfill: options }),
    continue: async () => calls.push('continue'),
    abort: async (reason) => calls.push({ abort: reason })
  }
}

test('coverage external passive assets keep their URL and response bytes through bounded transport', async () => {
  const run = await handler()
  for (const type of ['stylesheet', 'font', 'image']) {
    const route = routeOf({ type })
    await run(route)
    assert.deepEqual(route.calls, [
      { fetch: { timeout: 15000, maxRedirects: 0 }, url: 'http://assets.test/font.css' },
      { fulfill: { response: route.response, body: route.body } },
      'dispose'
    ])
  }
})

test('coverage keeps same-site and active GET requests native and blocks every write before asset transport', async () => {
  const run = await handler()
  for (const options of [
    { url: 'http://site.test:51710/font.css' },
    ...['script', 'document', 'fetch', 'xhr', 'media'].map((type) => ({ type }))
  ]) {
    const route = routeOf(options)
    await run(route)
    assert.deepEqual(route.calls, ['continue'])
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const route = routeOf({ method })
    await run(route)
    assert.deepEqual(route.calls, [{ abort: 'blockedbyclient' }])
  }
  for (const method of ['HEAD', 'OPTIONS']) {
    const route = routeOf({ method })
    await run(route)
    assert.deepEqual(route.calls, ['continue'])
  }
})

test('coverage falls back to the browser after failed external fetches or without an explicit site boundary', async () => {
  const run = await handler()
  const failed = routeOf({ fail: true })
  await run(failed)
  assert.deepEqual(failed.calls, [
    { fetch: { timeout: 15000, maxRedirects: 0 }, url: 'http://assets.test/font.css' },
    'continue'
  ])
  const native = routeOf()
  await (await handler(null))(native)
  assert.deepEqual(native.calls, ['continue'])
})
