import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { json, normalizeSiteKey, requireViewer, viewer } from '../src/lib/http.js'
import { mintSession } from '../src/lib/session.js'

test('normalizeSiteKey: a real domain survives scheme, www, and a trailing path', () => {
  assert.equal(normalizeSiteKey('HTTPS://WWW.JoomlArt.com/'), 'joomlart.com')
})

test('normalizeSiteKey: junk that is not a registrable host answers empty', () => {
  for (const raw of ['x.y', 'bad key', 'a..b']) assert.equal(normalizeSiteKey(raw), '')
})

test('normalizeSiteKey: a .localhost site key is registrable', () => {
  assert.equal(normalizeSiteKey('wpdemo.localhost'), 'wpdemo.localhost')
})

const config = { sessionSecret: 'x'.repeat(32) }

test('json: content-type is application/json; charset=utf-8, and the body round-trips', async () => {
  const app = new Hono()
  app.get('/x', (c) => json(c, { ok: true }, 201))
  const res = await app.fetch(new Request('http://t/x'))
  assert.equal(res.status, 201)
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await res.json(), { ok: true })
})

test('viewer: the email behind a valid tracy_sess cookie, null with none', async () => {
  const token = await mintSession('Ceo@Tracy.ai', config.sessionSecret)
  const app = new Hono()
  app.get('/x', async (c) => json(c, { email: await viewer(c, config) }))

  const signedIn = await app.fetch(new Request('http://t/x', { headers: { cookie: `tracy_sess=${token}` } }))
  assert.deepEqual(await signedIn.json(), { email: 'ceo@tracy.ai' })

  const anon = await app.fetch(new Request('http://t/x'))
  assert.deepEqual(await anon.json(), { email: null })
})

test('requireViewer: the email when signed in, a 401 NOT_SIGNED_IN Response otherwise', async () => {
  const token = await mintSession('a@b.c', config.sessionSecret)
  const app = new Hono()
  app.get('/x', async (c) => {
    const result = await requireViewer(c, config)
    return result instanceof Response ? result : json(c, { email: result })
  })

  const signedIn = await app.fetch(new Request('http://t/x', { headers: { cookie: `tracy_sess=${token}` } }))
  assert.deepEqual(await signedIn.json(), { email: 'a@b.c' })

  const anon = await app.fetch(new Request('http://t/x'))
  assert.equal(anon.status, 401)
  assert.equal(anon.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await anon.json(), { code: 'NOT_SIGNED_IN' })
})

test('normalizeSiteKey: a NUL or a broken percent-escape answers empty, never throws (QA run 20/10/2026)', () => {
  for (const raw of ['%FF%FE-x', '%E0%A4%A', 'a%00b.com', 'a\u0000b.com', '%'])
    assert.equal(normalizeSiteKey(raw), '')
})
