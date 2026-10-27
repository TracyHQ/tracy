/**
 * The site-access assertion, signer side: tracy-web vouches for who is viewing a site's own copy
 * with a signed assertion instead of bare `x-tracy-*` headers any container on the network could
 * send (P0, tasks/todo-tch-opensource.md, the signature-contract section).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/access-signature.test.mjs
 *
 * The vectors in fixtures/access-signature-vectors.json were computed by openssl over hand-written
 * canonical JSON; the PHP verifiers run the same file (access-signature-php.test.mjs).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  ASSERT_HEADER,
  SIG_HEADER,
  readSiteAccessKey,
  signAssertion,
  siteAccessHeaders
} from '../../../../apps/tracy-web/src/bar/site-access.js'
import { proxySite } from '../../../../apps/tracy-web/src/bar/site-proxy.js'

const VECTORS = JSON.parse(
  readFileSync(new URL('./fixtures/access-signature-vectors.json', import.meta.url), 'utf8')
)
const KEY = Buffer.from(VECTORS.key.hex, 'hex')
const ACCESS = { site: VECTORS.key.site, kid: VECTORS.key.kid, key: KEY }
const claimsOf = (headers) =>
  JSON.parse(Buffer.from(headers.get(ASSERT_HEADER), 'base64url').toString('utf8'))

for (const vector of VECTORS.sign) {
  test(`signer reproduces the shared vector: ${vector.name}`, () => {
    assert.deepEqual(signAssertion(vector.claims, KEY), { assert: vector.assert, sig: vector.sig })
  })
}

test('a fresh assertion lives 30 s from now and carries a new nonce every time', () => {
  const ask = {
    ...ACCESS,
    email: 'a@b.c',
    role: 'owner',
    tier: 'editor',
    host: 'h',
    method: 'GET',
    target: '/'
  }
  const one = siteAccessHeaders({ ...ask, now: 1790000000123 })
  const two = siteAccessHeaders({ ...ask, now: 1790000000123 })
  const a = JSON.parse(Buffer.from(one[ASSERT_HEADER], 'base64url').toString('utf8'))
  const b = JSON.parse(Buffer.from(two[ASSERT_HEADER], 'base64url').toString('utf8'))
  assert.equal(a.iat, 1790000000)
  assert.equal(a.exp, 1790000030)
  assert.equal(a.v, 1)
  assert.match(a.nonce, /^[A-Za-z0-9_-]{22}$/)
  assert.notEqual(a.nonce, b.nonce)
  assert.deepEqual(signAssertion(a, KEY), { assert: one[ASSERT_HEADER], sig: one[SIG_HEADER] })
})

/** What the site's own copy receives for one proxied request. */
async function reached(request, target, input) {
  let seen = null
  await proxySite(request, target, {
    sameHost: true,
    viewerProto: 'http',
    publish: 'draft',
    variant: 'none',
    badgeUrl: '',
    ...input,
    fetchImpl: async (req) => {
      seen = req
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }
  })
  return seen
}

test('the proxy signs the seat it vouches for, bound to the host, method and target the site sees', async () => {
  const req = await reached(
    new Request('http://p0acc-wpa.tracy.test:8080/wp-admin/?x=1', {
      method: 'POST',
      body: 'a=1',
      headers: { [ASSERT_HEADER]: 'forged', [SIG_HEADER]: 'forged' }
    }),
    new URL('http://p0acc-wpa-web-1/wp-admin/?x=1'),
    { email: 'owner@example.test', role: 'owner', viewerHost: 'p0acc-wpa.tracy.test:8080', access: ACCESS }
  )
  const claims = claimsOf(req.headers)
  assert.equal(claims.site, 'p0acc-wpa')
  assert.equal(claims.kid, 'k1-test')
  assert.equal(claims.email, 'owner@example.test')
  assert.equal(claims.role, 'owner')
  assert.equal(claims.tier, 'editor')
  assert.equal(claims.host, req.headers.get('x-forwarded-host'))
  assert.equal(claims.method, 'POST')
  assert.equal(claims.target, '/wp-admin/?x=1')
  assert.deepEqual(signAssertion(claims, KEY).sig, req.headers.get(SIG_HEADER))
  // Sent alongside the old headers until every site runs the strict verifier.
  assert.equal(req.headers.get('x-tracy-email'), 'owner@example.test')
})

test('a viewer with no seat is vouched for as an anonymous guest, so a stale CMS session can be ended', async () => {
  const req = await reached(
    new Request('http://p0acc-wpa.tracy.test:8080/'),
    new URL('http://p0acc-wpa-web-1/'),
    { email: null, role: null, viewerHost: 'p0acc-wpa.tracy.test:8080', access: ACCESS }
  )
  const claims = claimsOf(req.headers)
  assert.deepEqual([claims.email, claims.role, claims.tier], ['', '', 'guest'])
})

test('no key for the site: no assertion, and a client-sent one never rides through', async () => {
  const req = await reached(
    new Request('http://p0acc-wpa.tracy.test:8080/', {
      headers: { [ASSERT_HEADER]: 'forged', [SIG_HEADER]: 'forged' }
    }),
    new URL('http://p0acc-wpa-web-1/'),
    { email: 'owner@example.test', role: 'owner', viewerHost: 'p0acc-wpa.tracy.test:8080', access: null }
  )
  assert.equal(req.headers.get(ASSERT_HEADER), null)
  assert.equal(req.headers.get(SIG_HEADER), null)
})

test("on a customer's own domain the assertion names the canonical host the CMS is told", async () => {
  const req = await reached(new Request('https://www.shop.example/'), new URL('http://p0acc-wpa-web-1/'), {
    email: null,
    role: null,
    viewerHost: 'www.shop.example',
    viewerProto: 'https',
    canonical: new URL('https://p0acc-wpa.tracy.site'),
    access: ACCESS
  })
  assert.equal(claimsOf(req.headers).host, 'p0acc-wpa.tracy.site')
})

test('a site on another host is never signed for: the key lives beside the site', async () => {
  const req = await reached(
    new Request('http://p0acc-wpa.tracy.test:8080/'),
    new URL('https://p0acc-wpa.other-sites.tracy.site/'),
    {
      email: 'owner@example.test',
      role: 'owner',
      sameHost: false,
      viewerHost: 'p0acc-wpa.tracy.test:8080',
      access: ACCESS
    }
  )
  assert.equal(req.headers.get(ASSERT_HEADER), null)
})

test('the key reader takes <dir>/<label>/key.json and refuses anything else', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-access-'))
  try {
    const write = (label, body) => {
      mkdirSync(path.join(dir, label), { recursive: true })
      writeFileSync(path.join(dir, label, 'key.json'), typeof body === 'string' ? body : JSON.stringify(body))
    }
    write('p0acc-wpa', { v: 1, kid: 'k1-test', site: 'p0acc-wpa', key: KEY.toString('base64url') })
    write('short-key', { v: 1, kid: 'k1', site: 'short-key', key: Buffer.alloc(16).toString('base64url') })
    write('other-site', { v: 1, kid: 'k1', site: 'p0acc-wpa', key: KEY.toString('base64url') })
    write('broken', '{')
    assert.deepEqual(readSiteAccessKey(dir, 'p0acc-wpa'), ACCESS)
    assert.equal(readSiteAccessKey(dir, 'short-key'), null)
    assert.equal(readSiteAccessKey(dir, 'other-site'), null)
    assert.equal(readSiteAccessKey(dir, 'broken'), null)
    assert.equal(readSiteAccessKey(dir, 'absent'), null)
    assert.equal(readSiteAccessKey(dir, '../p0acc-wpa'), null)
    assert.equal(readSiteAccessKey('', 'p0acc-wpa'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
