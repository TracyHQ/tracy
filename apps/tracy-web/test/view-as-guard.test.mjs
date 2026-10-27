import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { viewAsGuard } from '../src/lib/view-as-guard.js'
import { mintSession, mintViewSession, sessionFromCookieHeader, VIEW_COOKIE } from '../src/lib/session.js'

const secret = 'x'.repeat(32)
const config = { sessionSecret: secret, origin: 'https://tracy.test' }
const NOW = Date.now()

function app() {
  const a = new Hono()
  a.use('*', viewAsGuard({ config, now: () => NOW }))
  a.get('/page', async (c) => {
    const who = await sessionFromCookieHeader(c.req.header('cookie') ?? null, secret, NOW)
    return c.html(`<html><body><p>hello ${who}</p></body></html>`)
  })
  a.get('/api/thing', (c) => c.json({ ok: true }))
  a.post('/api/thing', (c) => c.json({ wrote: true }))
  a.put('/api/thing', (c) => c.json({ wrote: true }))
  a.delete('/api/thing', (c) => c.json({ wrote: true }))
  a.post('/auth/view-as/exit', (c) => c.json({ exited: true }))
  a.post('/auth/signout', (c) => c.json({ ok: true }))
  a.get('/api/ops/who', async (c) =>
    c.json({ who: await sessionFromCookieHeader(c.req.header('cookie') ?? null, secret, NOW) })
  )
  a.post('/api/ops/thing', (c) => c.json({ wrote: true }))
  return a
}

const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
const own = await mintSession('ceo@tracy.ai', secret, NOW)
const viewing = `tracy_sess=${own}; ${VIEW_COOKIE}=${view}`
const req = (path, init = {}) =>
  app().request(path, { ...init, headers: { cookie: viewing, ...init.headers } })

test('with no view cookie nothing changes: no banner is added', async () => {
  const res = await app().request('/api/thing', { method: 'POST', headers: { cookie: `tracy_sess=${own}` } })
  assert.equal(res.status, 200)
  const page = await app().request('/page', { headers: { cookie: `tracy_sess=${own}` } })
  assert.doesNotMatch(await page.text(), /Viewing as/)
})

test('a view session answers as the customer', async () => {
  const res = await req('/page')
  const html = await res.text()
  assert.match(html, /hello customer@example\.com/)
  assert.equal((await req('/api/thing')).status, 200)
})

test('nothing is locked: a write in a view reaches its door like any other', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = await req('/api/thing', { method })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { wrote: true })
  }
})

test('/ops keeps the admin as the admin and keeps its writes', async () => {
  const who = await (await req('/api/ops/who')).json()
  assert.equal(who.who, 'ceo@tracy.ai')
  assert.equal((await req('/api/ops/thing', { method: 'POST' })).status, 200)
})

test('every HTML page in a view carries the banner, naming the customer, with an exit form', async () => {
  const html = await (await req('/page')).text()
  assert.match(html, /Viewing as customer@example\.com/)
  assert.match(html, /<form method="post" action="https:\/\/tracy\.test\/auth\/view-as\/exit"/)
  assert.ok(html.indexOf('Viewing as') < html.indexOf('</body>'))
})

test('the banner escapes the email', async () => {
  const evil = await mintViewSession('a"><script>x</script>@e.com', 'ceo@tracy.ai', secret, NOW)
  const res = await app().request('/page', { headers: { cookie: `${VIEW_COOKIE}=${evil}` } })
  const html = await res.text()
  const barHtml = html.slice(html.indexOf('data-view-as-bar'))
  assert.doesNotMatch(barHtml, /<script>/)
  assert.match(barHtml, /&lt;script&gt;/)
})

test('JSON and other non-HTML answers are left alone', async () => {
  const res = await req('/api/thing')
  assert.deepEqual(await res.json(), { ok: true })
})
