/**
 * The cross-site request guard (`src/lib/csrf.js`) over a REAL HTTP socket, behind
 * `@hono/node-server` exactly as `src/server.js` serves it.
 *
 * Why a separate file: every test in `csrf.test.mjs` calls `app.fetch` in-process, where a request
 * with no body shows `body === null`. Over HTTP, node-server hands every non-GET/HEAD request a
 * body stream, so a browser's bodiless `DELETE` (no `Content-Length`, no `Transfer-Encoding`) was
 * read as "a body with no type" and refused 415 — every delete door in Tracy (comments, team
 * members, keys…) failed on dev and production from cf4cb9e27 (#662) until this was fixed. Only a
 * socket shows that framing, so only a socket can keep it fixed.
 */
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { after, before, test } from 'node:test'
import { serve } from '@hono/node-server'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { mintSession } from '../src/lib/session.js'

const ORIGIN = 'http://tracy.test'
const SECRET = 's'.repeat(32)
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: SECRET,
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://127.0.0.1:1',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

/**
 * A pool double that answers the alias lookup (`sites/address.js`: `Alias-Key` → `canon-key`) and
 * returns no rows for anything else, recording every statement — so a test can tell a door ran
 * (it queried) from a guard that refused first (it did not).
 */
function fakePool() {
  const queries = []
  return {
    queries,
    query: async (sql, params = []) => {
      const text = typeof sql === 'string' ? sql : sql.text
      queries.push(text)
      if (/from site_name where name=\$1/.test(text) && params[0] === 'alias-key')
        return { rows: [{ site_key: 'canon-key' }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    },
    connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} })
  }
}

const pool = fakePool()
let server
let port

before(async () => {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    // Stubs: with `host` the sites domain mounts, so `/api/sites/*` doors are Tracy's own and never
    // fall through to the dsh catch-all (which keeps any body type by design).
    host: { hostCall: async () => ({ ok: false }), hostJob: async () => ({ ok: false }) },
    sites: {
      hostOf: async () => 'local',
      dshOf: () => ({ origin: 'http://127.0.0.1:1', seatSecret: 'k' }),
      labelOf: async (key) => key,
      siteScope: async () => 'wpdemo',
      canonicalKey: async (key) => key
    }
  })
  server = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1', createServer }, () => resolve(s))
  })
  port = server.address().port
})

after(() => new Promise((resolve) => server.close(resolve)))

/**
 * One raw HTTP/1.1 request. Node's client sends a DELETE with nothing written exactly as a browser
 * sends `fetch(url, { method: 'DELETE' })`: no `Content-Length`, no `Transfer-Encoding`.
 * `chunks` are written one by one with `Transfer-Encoding: chunked`.
 */
function send(method, path, headers, { body, chunks } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          host: 'tracy.test',
          ...headers,
          ...(body === undefined ? {} : { 'content-length': Buffer.byteLength(body) }),
          ...(chunks ? { 'transfer-encoding': 'chunked' } : {})
        }
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (d) => (text += d))
        res.on('end', () => resolve({ status: res.statusCode, text }))
      }
    )
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    for (const chunk of chunks ?? []) req.write(chunk)
    req.end()
  })
}

const browser = async () => ({
  cookie: `tracy_sess=${await mintSession('ceo@tracy.ai', SECRET)}`,
  'sec-fetch-site': 'same-origin',
  origin: ORIGIN,
  accept: 'application/json'
})

/** Every cookie-authed DELETE door in tracy-web. None reads a body; a browser sends it bare. */
const DELETE_DOORS = [
  '/api/sites/canon-key/comments/c1',
  '/api/sites/canon-key',
  '/api/sites/canon-key/claim',
  '/api/sites/canon-key/seats/g1',
  '/api/sites/canon-key/mail/domain',
  '/api/me/keys/k1',
  '/tracy-admin/members/a1',
  '/workspaces/w1/seats/a1',
  '/api/ops/team/1',
  '/api/ops/llm/providers/p1',
  '/api/ops/llm/doors/d1',
  '/api/ops/quickstart/inspiration',
  '/api/ops/templates/t1/shots/s1.png',
  '/api/ops/demos',
  '/api/ops/mail/sites/canon-key/domain'
]

test('a bodiless same-origin DELETE over HTTP reaches its door on every delete route, never a 415', async () => {
  const headers = await browser()
  for (const path of DELETE_DOORS) {
    // The pairing proves the route is a Tracy door the body rule applies to (the dsh catch-all
    // would keep an untyped body): the same DELETE with untyped bytes is refused…
    const withBytes = await send('DELETE', path, headers, { chunks: ['x'] })
    assert.equal(withBytes.status, 415, `${path} with bytes: ${withBytes.text}`)
    // …and with none it passes the guard and is answered by the door itself.
    const res = await send('DELETE', path, headers)
    assert.notEqual(res.status, 415, `${path}: ${res.text}`)
    assert.ok(!res.text.includes('CSRF_ORIGIN'), `${path}: ${res.text}`)
  }
})

test('the alias re-dispatch replays the same HTTP request: a bodiless DELETE to an alias key is not a 415', async () => {
  const before = pool.queries.length
  const res = await send('DELETE', '/api/sites/Alias-Key/comments/c1', await browser())
  assert.notEqual(res.status, 415, res.text)
  assert.ok(!res.text.includes('CSRF_ORIGIN'), res.text)
  const ran = pool.queries.slice(before)
  assert.ok(
    ran.some((q) => /from site_name where name=\$1/.test(q)),
    'the alias was resolved'
  )
  assert.ok(ran.length > 1, 'the door ran after the replay')
})

test('over HTTP the body rule still holds: a text/plain POST and an untyped chunked DELETE are 415', async () => {
  const headers = await browser()
  const plain = await send(
    'POST',
    '/api/team/invite',
    { ...headers, 'content-type': 'text/plain' },
    { body: '{"email":"x@y.z","role":"admin"}' }
  )
  assert.equal(plain.status, 415, plain.text)
  assert.deepEqual(JSON.parse(plain.text), { code: 'UNSUPPORTED_MEDIA_TYPE' })

  const untyped = await send('POST', '/api/team/invite', headers, { body: '{"email":"x@y.z"}' })
  assert.equal(untyped.status, 415, untyped.text)

  const chunked = await send('DELETE', '/api/sites/canon-key/comments/c1', headers, {
    chunks: ['{"a":', '1}']
  })
  assert.equal(chunked.status, 415, chunked.text)
  assert.deepEqual(JSON.parse(chunked.text), { code: 'UNSUPPORTED_MEDIA_TYPE' })

  // The same through the alias replay: the framing travels with it.
  const replayed = await send('DELETE', '/api/sites/Alias-Key/comments/c1', headers, { chunks: ['x'] })
  assert.equal(replayed.status, 415, replayed.text)
})

test('over HTTP the origin rule is untouched: a same-site bodiless DELETE is still 403', async () => {
  const headers = { ...(await browser()), 'sec-fetch-site': 'same-site', origin: 'http://acme.tracy.test' }
  const res = await send('DELETE', '/api/sites/canon-key/comments/c1', headers)
  assert.equal(res.status, 403, res.text)
  assert.deepEqual(JSON.parse(res.text), { code: 'CSRF_ORIGIN' })
})
