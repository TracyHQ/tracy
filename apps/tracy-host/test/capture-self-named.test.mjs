/**
 * A capture opens a demo at the name it gives itself and is served from the address that answers, as `/demo-qa`
 * already does. Local stand 24/10/2026: the vision look shot home at `http://<label>-web-1/` and nothing else —
 * WordPress answered every other page with a 301 to `http://<label>-web-1:8080/…` (the request's host with its own
 * site port), nothing listens there, and five of seven pages came back `ERR_CONNECTION_REFUSED`.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import { captureBody, runCapture } from '../src/capture.js'
import { demoAddress } from '../src/demo-qa.js'

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

test('self-named response bodies are released after fulfillment, failed fulfillment and every redirect hop', async () => {
  const { selfNamedServer } = await import('../src/self-named.js')
  for (const mode of ['success', 'failed-fulfill', 'redirect-loop']) {
    let heldBytes = 0
    let fetched = 0
    let disposed = 0
    let aborted = false
    const url = new URL('http://acme.tracy.test:8080/photo.png')
    const { serve } = selfNamedServer({ url: url.href, serveFrom: 'http://acme-web-1/' })
    const route = {
      request: () => ({ url: () => url.href, headers: () => ({}), isNavigationRequest: () => false }),
      fetch: async () => {
        fetched++
        heldBytes += 4 * 1024 * 1024
        return {
          status: () => (mode === 'redirect-loop' ? 302 : 200),
          headers: () => (mode === 'redirect-loop' ? { location: url.href } : {}),
          dispose: async () => {
            disposed++
            heldBytes -= 4 * 1024 * 1024
          }
        }
      },
      fulfill: async () => {
        await new Promise((resolve) => setImmediate(resolve))
        assert.ok(heldBytes > 0, 'the body must remain available until fulfillment finishes')
        if (mode === 'failed-fulfill') throw new Error('page closed')
      },
      abort: async () => {
        aborted = true
      }
    }
    if (mode === 'failed-fulfill') await assert.rejects(serve(route, url), /page closed/)
    else await serve(route, url)
    assert.equal(heldBytes, 0, mode)
    assert.equal(disposed, fetched, mode)
    assert.equal(fetched, mode === 'redirect-loop' ? 5 : 1)
    assert.equal(aborted, mode === 'redirect-loop')
  }
})

test('isolated sites use the configured proxy with their own Host and require its routing receipt', async () => {
  const seen = []
  const backend = createServer((req, res) => {
    seen.push({ host: req.headers.host, proto: req.headers['x-forwarded-proto'], method: req.method })
    const label = req.headers.host.split('.')[0]
    if (['acme', 'second'].includes(label)) res.setHeader('x-tracy-site-response', label)
    res.end('control-plane responses alone are not site evidence')
  })
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${backend.address().port}`
  const asked = (label) => ({
    label,
    platform: 'joomla',
    host: `${label}.tracy.test`,
    publicOrigin: `https://${label}.tracy.test`
  })
  try {
    const answers = await Promise.all(
      ['acme', 'second'].map((label) =>
        demoAddress(asked(label), { reach: async () => null, proxyOrigin: origin })
      )
    )
    assert.deepEqual(
      answers,
      ['acme', 'second'].map((label) => ({
        base: `https://${label}.tracy.test/`,
        serveFrom: `${origin}/`,
        serveFromIsProxy: true,
        proxySiteLabel: label
      }))
    )
    assert.deepEqual(seen.map((r) => r.host).sort(), ['acme.tracy.test', 'second.tracy.test'])
    assert.ok(seen.every((r) => r.method === 'HEAD' && r.proto === 'https'))
    const unknown = await demoAddress(asked('unknown'), { reach: async () => null, proxyOrigin: origin })
    assert.notEqual(unknown.serveFrom, `${origin}/`)
    assert.equal(unknown.serveFromIsProxy, undefined)
    const direct = await demoAddress(asked('acme'), {
      reach: async () => 'http://acme-web-1/',
      proxyOrigin: origin,
      proxyFetch: async () => {
        throw Error('must keep the direct road')
      }
    })
    assert.equal(direct.serveFrom, 'http://acme-web-1/')
  } finally {
    backend.closeAllConnections()
    await new Promise((resolve) => backend.close(resolve))
  }
})

test('a wrong site receipt, login response or failed proxy cannot supply a site address', async () => {
  const asked = {
    label: 'acme',
    platform: 'joomla',
    host: 'acme.tracy.test',
    publicOrigin: 'https://acme.tracy.test'
  }
  for (const response of [
    new Response('', { headers: { 'x-tracy-site-response': 'other' } }),
    new Response('Login'),
    new Response('', { status: 503, headers: { 'x-tracy-site-response': 'acme' } })
  ]) {
    const result = await demoAddress(asked, {
      reach: async () => null,
      proxyOrigin: 'http://tracy-web:51710',
      proxyFetch: async () => response
    })
    assert.equal(result.serveFromIsProxy, undefined)
  }
  const controller = new AbortController()
  controller.abort(new Error('cancelled read'))
  await assert.rejects(
    demoAddress(asked, {
      signal: controller.signal,
      reach: async () => null,
      proxyOrigin: 'http://tracy-web:51710',
      proxyFetch: async (_url, init) => {
        init.signal.throwIfAborted()
      }
    }),
    /cancelled read/
  )
})

test('a proxy backend is not added to the site aliases or rewritten after an outside redirect', async () => {
  const { selfNamedServer } = await import('../src/self-named.js')
  const transport = selfNamedServer({
    url: 'https://acme.tracy.test/',
    serveFrom: 'http://tracy-web:51710',
    serveFromIsProxy: true,
    proxySiteLabel: 'acme'
  })
  assert.equal(transport.selfNamed(new URL('http://tracy-web:51710/api/sites')), false)
  assert.equal(transport.selfNamed(new URL('https://other.tracy.test/')), false)
  assert.equal(transport.selfNamed(new URL('https://acme.tracy.test/menu')), true)
  let fetched = 0
  let disposed = 0
  const response = {
    headers: () => ({ location: 'http://tracy-web:51710/login', 'x-tracy-site-response': 'acme' }),
    status: () => 302,
    dispose: async () => {
      disposed++
    }
  }
  await transport.serve(
    {
      request: () => ({
        headers: () => ({}),
        isNavigationRequest: () => true,
        url: () => 'https://acme.tracy.test/'
      }),
      fetch: async () => {
        fetched++
        return response
      },
      fulfill: async () => assert.fail('an outside navigation must not be fulfilled'),
      abort: async (reason) => assert.equal(reason, 'failed')
    },
    new URL('https://acme.tracy.test/')
  )
  assert.equal(fetched, 1)
  assert.equal(disposed, 1)
})

test('the site routing receipt is set by the web proxy and cannot be forged by the CMS', async () => {
  const { proxySite } = await import('../../tracy-web/src/bar/site-proxy.js')
  for (const label of ['acme', null]) {
    const response = await proxySite(new Request('http://acme.tracy.test/'), new URL('http://acme-web-1/'), {
      label,
      viewerHost: 'acme.tracy.test',
      viewerProto: 'http',
      variant: 'none',
      fetchImpl: async () =>
        new Response('site', {
          headers: { 'content-type': 'text/plain', 'x-tracy-site-response': 'forged-other' }
        })
    })
    assert.equal(response.headers.get('x-tracy-site-response'), label)
    await response.body.cancel()
  }
})

test('a direct HTTP 500 remains the measured road instead of being hidden by a healthy proxy', async () => {
  const { reachableBase } = await import('../src/demo-qa.js')
  let proxyCalls = 0
  const result = await demoAddress(
    { label: 'acme', platform: 'joomla', host: 'acme.tracy.test', publicOrigin: 'https://acme.tracy.test' },
    {
      reach: (candidates, options) =>
        reachableBase(candidates, {
          ...options,
          fetchImpl: async () => new Response('broken CMS', { status: 500 })
        }),
      proxyOrigin: 'http://tracy-web:51710',
      proxyFetch: async () => {
        proxyCalls++
        return { status: 200, headers: new Headers({ 'x-tracy-site-response': 'acme' }) }
      }
    }
  )
  assert.equal(proxyCalls, 0)
  assert.equal(result.serveFromIsProxy, undefined)
})

test('each proxied navigation requires the same site receipt and disposes failed responses', async () => {
  const { selfNamedServer } = await import('../src/self-named.js')
  for (const receipt of [null, 'other', 'acme']) {
    const transport = selfNamedServer({
      url: 'https://acme.tracy.test/',
      serveFrom: 'http://tracy-web:51710',
      serveFromIsProxy: true,
      proxySiteLabel: 'acme'
    })
    let fulfilled = 0,
      aborted = 0,
      disposed = 0
    await transport.serve(
      {
        request: () => ({
          headers: () => ({}),
          isNavigationRequest: () => true,
          url: () => 'https://acme.tracy.test/menu'
        }),
        fetch: async () => ({
          status: () => 200,
          headers: () => ({ 'x-tracy-site-response': receipt }),
          dispose: async () => {
            disposed++
          }
        }),
        fulfill: async () => {
          fulfilled++
        },
        abort: async () => {
          aborted++
        }
      },
      new URL('https://acme.tracy.test/menu')
    )
    assert.equal(fulfilled, receipt === 'acme' ? 1 : 0)
    assert.equal(aborted, receipt === 'acme' ? 0 : 1)
    assert.equal(disposed, 1)
  }
})

test('cancelling a proxy probe while headers are pending closes its HTTP request', async () => {
  const controller = new AbortController()
  let closed
  const didClose = new Promise((resolve) => {
    closed = resolve
  })
  const server = createServer((_req, res) => {
    res.once('close', closed)
    controller.abort(new Error('cancel pending proxy'))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await assert.rejects(
      demoAddress(
        {
          label: 'acme',
          platform: 'joomla',
          host: 'acme.tracy.test',
          publicOrigin: 'https://acme.tracy.test'
        },
        {
          reach: async () => null,
          proxyOrigin: `http://127.0.0.1:${server.address().port}`,
          signal: controller.signal
        }
      ),
      /cancel pending proxy/
    )
    await didClose
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('capture and QA abort a failed proxy navigation without trying the public address directly', async () => {
  const { makeShoot } = await import('../src/browser.js')
  const { readDemoPage } = await import('../src/demo-qa-browser.js')
  const url = 'http://acme.tracy.test/pricing/'
  const options = { serveFrom: 'http://tracy-web:51710/', serveFromIsProxy: true, proxySiteLabel: 'acme' }
  let handler
  const page = {
    on() {},
    off() {},
    route: async (_pattern, fn) => {
      handler = fn
    },
    unroute: async () => {},
    setViewportSize: async () => {},
    url: () => url,
    goto: async () => {
      throw new Error('navigation aborted')
    },
    evaluate: async () => ({}),
    waitForTimeout: async () => {},
    screenshot: async () => Buffer.from('png')
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async () => ({ route: page.route, newPage: async () => page, close: async () => {} })
      })
    }
  }
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  for (const mode of ['capture', 'qa']) {
    if (mode === 'capture') await shoot({ url, width: 1440, height: 900, ...options }).catch(() => {})
    else await readDemoPage(page, url, '/pricing/', options)
    let aborted = 0,
      fetched = 0
    await handler({
      request: () => ({ url: () => url, headers: () => ({}), isNavigationRequest: () => true }),
      fetch: async () => {
        fetched++
        throw new Error('proxy reset')
      },
      abort: async (reason) => {
        assert.equal(reason, 'failed')
        aborted++
      },
      continue: async () => assert.fail(`${mode} must never bypass its proxy receipt`),
      fulfill: async () => assert.fail('a failed response cannot be fulfilled')
    })
    assert.equal(fetched, 1, mode)
    assert.equal(aborted, 1, mode)
  }
})
