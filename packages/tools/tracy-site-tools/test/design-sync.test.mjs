/**
 * The lane's half of the design record (ADR 0023, "Addendum 29/09"): the requests site-tools sends
 * to tracy-web to record what a site wears (the build's PUT) and to read it back (the copy's GET).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  designGetRequest,
  designPutRequest,
  designSigner,
  siteKeyInFolder
} from '../src/host/design-sync.mjs'

const prompter = { as: 'prompter', assertion: 'v1.a.b', origin: 'http://tracy-web:8080/' }
const viewer = { as: 'viewer', cookie: 'tracy_sess=x', origin: 'http://tracy-web:8080' }

test('the PUT is signed as the person who pressed, and a viewer cookie is not enough', () => {
  const put = designPutRequest(prompter, 'lantern.tracy.test', { id: 'apple', source: 'catalog' })
  assert.equal(put.url, 'http://tracy-web:8080/api/sites/lantern.tracy.test/design')
  assert.equal(put.init.method, 'PUT')
  assert.equal(put.init.headers['x-tracy-actor'], 'v1.a.b')
  assert.equal(put.init.headers.cookie, undefined)
  assert.deepEqual(JSON.parse(put.init.body), { id: 'apple', source: 'catalog' })
  // tracy-web accepts only the build's signed assertion; a cookie would be refused — do not send it.
  assert.equal(designPutRequest(viewer, 'lantern.tracy.test', {}), null)
  assert.equal(designPutRequest(null, 'lantern.tracy.test', {}), null)
})

test('the GET reads as whoever this conversation acts as, cookie or assertion', () => {
  assert.equal(
    designGetRequest(prompter, 'lantern.tracy.test', 'http://tracy-web:8080').init.headers['x-tracy-actor'],
    'v1.a.b'
  )
  const byCookie = designGetRequest(viewer, 'lantern.tracy.test', 'http://tracy-web:8080')
  assert.equal(byCookie.init.headers.cookie, 'tracy_sess=x')
  assert.equal(byCookie.init.method, 'GET')
  assert.equal(designGetRequest(null, 'lantern.tracy.test', 'http://tracy-web:8080'), null)
  // An address that is not a site key is refused here rather than sent in a path.
  assert.equal(designGetRequest(prompter, '../etc', 'http://tracy-web:8080'), null)
})

test('siteKeyInFolder reads the key the fleet wrote, or null', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = (await import('node:path')).default
  const folder = mkdtempSync(path.join(tmpdir(), 'design-sync-'))
  assert.equal(await siteKeyInFolder(folder), null)
  mkdirSync(path.join(folder, '.tracy'))
  writeFileSync(path.join(folder, '.tracy', 'site.json'), '{"siteKey":"lantern.tracy.test"}')
  assert.equal(await siteKeyInFolder(folder), 'lantern.tracy.test')
})

// Measured 29/09 on dev (session "API"): a site built from the Build FORM had its design record in
// the folder and none in tracy-web — nobody typed in that session, so there was no prompter to sign
// the PUT, the lane answered 409 NO_ACTOR, and the build stayed green. The person who pressed is
// this session's own viewer: tracy-web names them from their cookie, and the gate signs for them.
const TRACY = 'https://cowork.tracy.test/'
test('a build nobody typed in is signed as the person who pressed: the session’s own viewer, named by tracy-web', async () => {
  const viewer = { as: 'viewer', cookie: 'tracy_sess=abc', origin: 'https://cowork.tracy.test/' }
  /** @type {any[]} */
  const asked = []
  const http = async (url, init) => {
    asked.push({ url, cookie: init?.headers?.cookie })
    return new Response(JSON.stringify({ email: 'owner@x.y', defaultSite: null }), { status: 200 })
  }
  const minted = []
  const mint = (email) => {
    minted.push(email)
    return 'v1.signed'
  }
  assert.deepEqual(await designSigner(viewer, { origin: TRACY, bound: true, mint, http }), {
    as: 'prompter',
    assertion: 'v1.signed',
    origin: 'https://cowork.tracy.test/'
  })
  assert.deepEqual(asked, [{ url: 'https://cowork.tracy.test/auth/me', cookie: 'tracy_sess=abc' }])
  assert.deepEqual(minted, ['owner@x.y'])

  // The person who typed signs as themselves; nothing is asked.
  const prompter = { as: 'prompter', assertion: 'v1.typed', origin: 'https://cowork.tracy.test' }
  asked.length = 0
  assert.deepEqual(await designSigner(prompter, { origin: TRACY, bound: true, mint, http }), {
    ...prompter,
    origin: TRACY
  })
  assert.equal(asked.length, 0)

  // Never another session's viewer (a host dsh's `latest`), never a cookie tracy-web does not know,
  // never without the gate's signer, never when tracy-web does not answer.
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: false, mint, http }), null)
  assert.equal(asked.length, 0)
  const nobody = async () => new Response(JSON.stringify({ email: null }), { status: 200 })
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: true, mint, http: nobody }), null)
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: true, mint: undefined, http }), null)
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: true, mint: () => null, http }), null)
  const down = async () => {
    throw new Error('down')
  }
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: true, mint, http: down }), null)
  assert.equal(await designSigner(null, { origin: TRACY, bound: true, mint, http }), null)

  // tracy-web failing is logged as itself, not as "nobody signed"; a cookie it does not name is not a failure.
  /** @type {string[]} */
  const lines = []
  const warn = (line) => lines.push(line)
  const refused = async () => new Response('{}', { status: 503 })
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: true, mint, http: refused, warn }), null)
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: true, mint, http: down, warn }), null)
  assert.equal(await designSigner(viewer, { origin: TRACY, bound: true, mint, http: nobody, warn }), null)
  assert.deepEqual(lines, [
    '[site-design] /auth/me answered 503; nobody signed',
    '[site-design] /auth/me unreachable: down'
  ])
})

// A signed assertion is accepted by every actor door, the Apply door included, for 300 s. The
// viewer's origin comes from its hello's `x-forwarded-host`/`host` — whatever the caller typed on a
// path that reaches dsh without the fleet proxy (a direct port, a stand). Asking THAT host who a
// cookie is and PUTting the assertion there would mint an assertion for any address a host I pick
// names, and hand it to that host. Only the configured Tracy origin is asked, and only it is sent to.
test('the design signer asks and sends only to the configured Tracy origin, never the hello’s host', async () => {
  const viewer = { as: 'viewer', cookie: 'tracy_sess=abc', origin: 'https://attacker.test' }
  /** @type {string[]} */
  const asked = []
  const http = async (/** @type {string} */ url) => {
    asked.push(url)
    return new Response(JSON.stringify({ email: 'victim@x.y' }), { status: 200 })
  }
  const mint = () => 'v1.signed'
  assert.deepEqual(
    await designSigner(viewer, { origin: 'https://cowork.tracy.test', bound: true, mint, http }),
    {
      as: 'prompter',
      assertion: 'v1.signed',
      origin: 'https://cowork.tracy.test'
    }
  )
  assert.deepEqual(asked, ['https://cowork.tracy.test/auth/me'])

  // No configured origin: nothing is asked and nothing is signed (the build logs NO_ACTOR).
  asked.length = 0
  for (const origin of [null, undefined, '', '  '])
    assert.equal(await designSigner(viewer, { origin, bound: true, mint, http }), null)
  assert.equal(asked.length, 0)

  // The person who typed: their assertion goes to the configured origin too, whatever origin the
  // plan carries; with none configured nothing is signed (`relayPlan` keeps the same pin).
  const typed = { as: 'prompter', assertion: 'v1.typed', origin: 'https://attacker.test' }
  assert.deepEqual(
    await designSigner(typed, { origin: 'https://cowork.tracy.test', bound: true, mint, http }),
    {
      as: 'prompter',
      assertion: 'v1.typed',
      origin: 'https://cowork.tracy.test'
    }
  )
  assert.equal(await designSigner(typed, { origin: null, bound: true, mint, http }), null)
  assert.equal(asked.length, 0)
})

test("the GET goes to the configured Tracy origin only — never the viewer's hello host, whose cookie or assertion it carries", () => {
  const spoofed = { ...viewer, origin: 'http://attacker.example' }
  const r = designGetRequest(spoofed, 'lantern.tracy.test', 'http://tracy-web:8080')
  assert.equal(r.url, 'http://tracy-web:8080/api/sites/lantern.tracy.test/design')
  const p = designGetRequest(
    { ...prompter, origin: 'http://attacker.example' },
    'lantern.tracy.test',
    'http://tracy-web:8080/'
  )
  assert.equal(p.url, 'http://tracy-web:8080/api/sites/lantern.tracy.test/design')
  assert.equal(designGetRequest(spoofed, 'lantern.tracy.test', null), null)
  assert.equal(designGetRequest(spoofed, 'lantern.tracy.test', ''), null)
})
