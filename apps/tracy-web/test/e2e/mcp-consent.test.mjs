/** A real browser submits the real signed consent form; no request leaves this fixture. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mintSession } from '../../src/lib/session.js'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { NATIVE_CLIENTS } from '../../src/mcp/clients.js'
import { oauthRoutes } from '../../src/mcp/oauth.js'

const require = createRequire(import.meta.url)
const host = fileURLToPath(new URL('../../../tracy-host/', import.meta.url))
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [host] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium
const origin = 'https://tracy.test'
const secret = 's'.repeat(32)
const email = 'reviewer@example.test'
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect'
let browser
before(async () => {
  browser = await chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] })
})
after(async () => {
  await browser?.close()
})

function fixture(clientId = 'tracy-chatgpt', redirectUri = redirect) {
  const codes = []
  const app = oauthRoutes({
    config: { origin, apiOrigin: 'http://api.tracy.test', apiKeyPepper: 'fixture', sessionSecret: secret },
    pool: {
      async query(sql, values) {
        if (/insert into rate_bucket/.test(sql)) return { rows: [{ count: 1 }] }
        assert.match(sql, /insert into mcp_oauth_code/)
        codes.push(values)
        return { rows: [] }
      }
    },
    seats: {
      accountByEmail: async (_pool, who) => {
        assert.equal(who, email)
        return { id: 'fixture-account' }
      }
    },
    listSites: async () => [{ site_key: 'sample.tracy.test', display_name: 'Sample' }],
    resolvePrincipal: () => assert.fail('consent must not resolve an API principal'),
    isApiHost: () => true
  })
  const url = new URL('/oauth/authorize', origin)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'content',
    resource: `${origin}/mcp`,
    code_challenge_method: 'S256',
    code_challenge: 'a'.repeat(43),
    state: 'fixture-state'
  }).toString()
  return { app, codes, url: url.href }
}

for (const decision of ['allow', 'deny']) {
  test(`browser consent ${decision}: same-origin POST passes the strict Origin check without leaking a referrer`, async () => {
    const f = fixture()
    const context = await browser.newContext()
    try {
      await context.addCookies([{ name: 'tracy_sess', value: await mintSession(email, secret), url: origin }])
      const posts = []
      const callbacks = []
      await context.route('**/*', async (route) => {
        const request = route.request()
        const headers = await request.allHeaders()
        const url = new URL(request.url())
        if (url.origin === origin && url.pathname === '/oauth/authorize') {
          const response = await f.app.request(request.url(), {
            method: request.method(),
            headers,
            ...(request.method() === 'POST' ? { body: request.postData() } : {})
          })
          if (request.method() === 'POST') {
            posts.push({
              headers,
              body: request.postData(),
              status: response.status,
              location: response.headers.get('location'),
              policy: response.headers.get('referrer-policy')
            })
            // Stop the real OAuth redirect here: redirect chains can bypass Playwright routing.
            await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Fixture consent processed' })
          } else {
            const html = (await response.text()).replace(
              '</body>',
              '<a id="fixture-external" href="http://callback.tracy.test/fixture">Fixture callback</a></body>'
            )
            await route.fulfill({
              status: response.status,
              headers: Object.fromEntries(response.headers),
              body: html
            })
          }
        } else if (url.origin === 'http://callback.tracy.test') {
          callbacks.push({ url, headers })
          await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Fixture callback' })
        } else await route.abort()
      })
      const page = await context.newPage()
      await page.goto(f.url)
      await page.locator(`button[name="decision"][value="${decision}"]`).click()
      assert.equal(posts.length, 1)
      assert.equal(posts[0].headers.origin, origin)
      assert.equal(posts[0].status, 303)
      assert.equal(posts[0].policy, 'same-origin')
      const target = new URL(posts[0].location)
      assert.equal(target.origin + target.pathname, redirect)
      const result = target.searchParams
      assert.equal(result.get('state'), 'fixture-state')
      assert.equal(result.get('iss'), origin)
      if (decision === 'allow') {
        assert.match(result.get('code'), /^[A-Za-z0-9_-]{43}$/)
        assert.equal(f.codes.length, 1)
        assert.equal(f.codes[0][3], 'sample.tracy.test')
      } else {
        assert.equal(result.get('error'), 'access_denied')
        assert.equal(f.codes.length, 0)
      }
      for (const bad of ['null', 'https://evil.test']) {
        const response = await f.app.request(`${origin}/oauth/authorize`, {
          method: 'POST',
          headers: { ...posts[0].headers, origin: bad },
          body: posts[0].body
        })
        assert.equal(response.status, 403)
        assert.deepEqual(await response.json(), { error: 'access_denied' })
      }
      assert.equal(f.codes.length, decision === 'allow' ? 1 : 0)
      await page.goto(f.url)
      await page.locator('#fixture-external').click()
      await page.waitForURL('http://callback.tracy.test/fixture')
      assert.equal(callbacks.length, 1)
      assert.equal(callbacks[0].headers.referer, undefined)
    } finally {
      await context.close()
    }
  })
}

// These listeners belong to this test. Redirects leave the browser routing layer, so receive
// them on actual loopback sockets; never follow a hosted callback or grant a real account.
for (const client of NATIVE_CLIENTS) {
  const uri = client.redirectUris.find((value) => value.startsWith('http:'))
  for (const decision of ['allow', 'deny']) {
    test(`native ${client.id} ${decision}: browser follows CSP through to the exact loopback callback`, async () => {
      const received = []
      const listener = createServer((request, response) => {
        received.push(new URL(request.url, uri))
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end('Synthetic OAuth callback received')
      })
      listener.listen(Number(new URL(uri).port), '127.0.0.1')
      await once(listener, 'listening')
      const f = fixture(client.id, uri)
      const context = await browser.newContext()
      try {
        await context.addCookies([
          { name: 'tracy_sess', value: await mintSession(email, secret), url: origin }
        ])
        await context.route('**/*', async (route) => {
          const request = route.request()
          if (new URL(request.url()).origin !== origin) return route.continue()
          const response = await f.app.request(request.url(), {
            method: request.method(),
            headers: await request.allHeaders(),
            ...(request.method() === 'POST' ? { body: request.postData() } : {})
          })
          await route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: await response.text()
          })
        })
        const page = await context.newPage()
        await page.goto(f.url)
        await page.locator(`button[name="decision"][value="${decision}"]`).click()
        await page.waitForURL((url) => url.origin + url.pathname === uri)
        assert.equal(received.length, 1)
        assert.equal(received[0].searchParams.get('iss'), origin)
        assert.equal(received[0].searchParams.get('state'), 'fixture-state')
        assert.equal(f.codes.length, decision === 'allow' ? 1 : 0)
        if (decision === 'allow') assert.match(received[0].searchParams.get('code'), /^[A-Za-z0-9_-]{43}$/)
        else assert.equal(received[0].searchParams.get('error'), 'access_denied')
      } finally {
        await context.close()
        listener.closeAllConnections()
        await new Promise((resolve) => listener.close(resolve))
      }
    })
  }
}
