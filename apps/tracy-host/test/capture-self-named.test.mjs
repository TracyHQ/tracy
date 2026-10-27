/**
 * A capture opens a demo at the name it gives itself and is served from the address that answers, as `/demo-qa`
 * already does. Local stand 24/10/2026: the vision look shot home at `http://<label>-web-1/` and nothing else —
 * WordPress answered every other page with a 301 to `http://<label>-web-1:8080/…` (the request's host with its own
 * site port), nothing listens there, and five of seven pages came back `ERR_CONNECTION_REFUSED`.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { captureBody, runCapture } from '../src/capture.js'
import { demoAddress } from '../src/demo-qa.js'
import { signHostCall } from '../../tracy-web/src/host/client.js'

const config = { hostName: 'demo', hostSecret: 'host-secret', sitesRoot: process.cwd() }

async function post(app, path, body) {
  const raw = JSON.stringify(body)
  const headers = await signHostCall({ secret: 'host-secret', path, body: raw })
  return app.fetch(new Request(`http://tracy-host.test${path}`, { method: 'POST', headers, body: raw }))
}

test('captureBody keeps a public origin only on the demo’s own name', () => {
  const body = {
    label: 'acme',
    platform: 'wordpress',
    layouts: [{ key: 'home', path: '/' }],
    host: 'acme.tracy.test'
  }
  assert.equal(
    captureBody({ ...body, publicOrigin: 'http://acme.tracy.test:8080' }).publicOrigin,
    'http://acme.tracy.test:8080'
  )
  assert.match(captureBody({ ...body, publicOrigin: 'http://evil.test' }).error, /public origin/)
  assert.equal(captureBody(body).publicOrigin, null)
})

test('demoAddress: the site’s own name served from the address that answers; no alias when they are one', async () => {
  const reach = async () => 'http://acme-web-1/'
  assert.deepEqual(
    await demoAddress(
      {
        label: 'acme',
        platform: 'wordpress',
        host: 'acme.tracy.test',
        publicOrigin: 'http://acme.tracy.test:8080'
      },
      { reach }
    ),
    { base: 'http://acme.tracy.test:8080/', serveFrom: 'http://acme-web-1/' }
  )
  assert.deepEqual(
    await demoAddress(
      {
        label: 'acme',
        platform: 'wordpress',
        host: 'acme.tracy.site',
        publicOrigin: 'https://acme.tracy.site'
      },
      { reach: async () => 'https://acme.tracy.site/' }
    ),
    { base: 'https://acme.tracy.site/', serveFrom: null }
  )
  // A caller naming no origin keeps the reached address (template shots are taken as before).
  assert.deepEqual(await demoAddress({ label: 'acme', platform: 'wordpress', host: null }, { reach }), {
    base: 'http://acme-web-1/',
    serveFrom: null
  })
})

test('runCapture hands each shot the address to serve the site’s own name from', async () => {
  const seen = []
  await runCapture({
    label: 'acme',
    platform: 'wordpress',
    layouts: [{ key: 'p', path: '/pricing/' }],
    shoot: async ({ url, serveFrom, siteHosts }) => {
      seen.push({ url, serveFrom, siteHosts })
      return Buffer.from('png')
    },
    timeoutMs: 1000,
    base: 'http://acme.tracy.test:8080/',
    serveFrom: 'http://acme-web-1/',
    host: 'acme.tracy.test'
  })
  assert.deepEqual(seen[0], {
    url: 'http://acme.tracy.test:8080/pricing/',
    serveFrom: 'http://acme-web-1/',
    siteHosts: ['acme.tracy.test']
  })
})

test('the capture route opens pages at the public origin and serves them from the address that answered', async () => {
  const server = createServer((_req, res) => res.end('<!doctype html><title>home</title>'))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const seen = []
  const app = buildApp({
    config,
    run: async () => ({ code: 0, tail: [] }),
    shoot: async ({ url, serveFrom }) => {
      seen.push([url, serveFrom])
      return Buffer.from('png')
    }
  })
  try {
    const res = await post(app, '/_host/capture', {
      label: 'acme',
      platform: 'wordpress',
      port,
      host: 'acme.tracy.test',
      publicOrigin: 'http://acme.tracy.test:8080',
      layouts: [{ key: 'p', path: '/pricing/' }]
    })
    assert.equal(res.status, 200)
    assert.deepEqual(seen[0], ['http://acme.tracy.test:8080/pricing/', `http://127.0.0.1:${port}/`])
  } finally {
    server.close()
  }
})

test('makeShoot serves a self-named request from the answering address, following its redirects there', async () => {
  const { makeShoot } = await import('../src/browser.js')
  let handler = null
  const page = {
    goto: async () => {},
    evaluate: async (fn) => (String(fn).includes('scrollHeight') ? 900 : undefined),
    waitForTimeout: async () => {},
    screenshot: async () => Buffer.from('png')
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async () => ({
          route: async (_glob, fn) => {
            handler = fn
          },
          newPage: async () => page,
          close: async () => {}
        })
      })
    }
  }
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  await shoot({
    url: 'http://acme.tracy.test:8080/pricing/',
    width: 1440,
    height: 900,
    serveFrom: 'http://acme-web-1/',
    siteHosts: ['acme.tracy.test']
  })
  assert.equal(typeof handler, 'function')
  const fetched = []
  let fulfilled = null
  const route = (url) => ({
    request: () => ({ url: () => url, headers: () => ({ accept: '*/*' }), isNavigationRequest: () => true }),
    fetch: async (opts) => {
      fetched.push([opts.url, opts.headers.host])
      // WordPress's canonical redirect names the request's host with its own site port.
      return opts.url.endsWith('/pricing')
        ? { status: () => 301, headers: () => ({ location: 'http://acme.tracy.test:8080/pricing/' }) }
        : { status: () => 200, headers: () => ({}) }
    },
    fulfill: async ({ response }) => {
      fulfilled = response.status()
    },
    continue: async () => assert.fail('a self-named request is never left to the browser'),
    abort: async () => {}
  })
  await handler(route('http://acme.tracy.test:8080/pricing'))
  assert.deepEqual(fetched, [
    ['http://acme-web-1/pricing', 'acme.tracy.test:8080'],
    ['http://acme-web-1/pricing/', 'acme.tracy.test:8080']
  ])
  assert.equal(fulfilled, 200)
})
