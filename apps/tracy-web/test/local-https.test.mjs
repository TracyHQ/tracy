import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { localHttpsNavigation } from '../src/lib/local-https.js'
const app = (origin = 'https://tracy.test:8443') => {
  const a = new Hono()
  a.use('*', localHttpsNavigation({ origin }))
  a.all('*', (c) => c.text('original route'))
  return a
}
const navigation = { host: 'tracy.test:8080', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
test('local HTTPS redirects only browser document GETs and preserves path/query without changing authority', async () => {
  const r = await app().request('http://tracy.test:8080/widget?lang=vi', { headers: navigation })
  assert.equal(r.status, 308)
  assert.equal(r.headers.get('location'), 'https://tracy.test:8443/widget?lang=vi')
  const hostile = await app().request('http://tracy.test:8080//other.test/path', { headers: navigation })
  assert.equal(hostile.status, 200)
  const insecureBrowser = await app().request('http://tracy.test:8080/widget', {
    headers: { host: 'tracy.test:8080', 'user-agent': 'Mozilla/5.0 Chrome', accept: 'text/html' }
  })
  assert.equal(insecureBrowser.status, 308)
  assert.equal(insecureBrowser.headers.get('location'), 'https://tracy.test:8443/widget')
})
test('local HTTPS leaves internal API calls, writes, customer hosts and existing HTTP deployments unchanged', async () => {
  for (const [origin, path, options] of [
    ['https://tracy.test:8443', '/api/sites', { headers: { host: 'tracy.test:8080' } }],
    ['https://tracy.test:8443', '/widget/api/turn', { method: 'POST', headers: navigation }],
    ['https://tracy.test:8443', '/', { headers: { ...navigation, host: 'customer.tracy.test:8080' } }],
    ['https://tracy.test:8443', '/widget', { headers: { ...navigation, host: 'tracy.test:8443' } }],
    ['https://tracy.test:8443', '/widget', { headers: { ...navigation, 'x-forwarded-proto': 'https' } }],
    [
      'https://tracy.test:8443',
      '/api/sites',
      { headers: { ...navigation, accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome' } }
    ],
    [
      'https://tracy.test:8443',
      '/widget',
      { headers: { host: 'tracy.test:8080', accept: 'text/html', 'user-agent': 'node' } }
    ],
    ['http://tracy.test:8080', '/widget', { headers: navigation }]
  ])
    assert.equal((await app(origin).request('http://tracy.test:8080' + path, options)).status, 200)
})
