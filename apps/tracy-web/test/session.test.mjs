import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SESSION_TTL_S } from '../src/lib/policy.js'
import {
  clearSessionCookie,
  cookieDomainFor,
  mintSession,
  sessionCookie,
  sessionFromCookieHeader,
  verifySession
} from '../src/lib/session.js'

const secret = 'x'.repeat(32)

test('a minted token verifies to the lower-cased email', async () => {
  const token = await mintSession('Ceo@Tracy.ai', secret)
  assert.equal(await verifySession(token, secret), 'ceo@tracy.ai')
})

/**
 * The exact token `mintSession` produced for these inputs — and the exact one
 * `workers/fleet-bar/src/session.js` produced for them, byte for byte, while that file existed
 * (deleted 16/09/2026; this test used to call it as the oracle).
 *
 * 🔒 THE WIRE FORMAT IS NOT AN IMPLEMENTATION DETAIL. Every signed-in browser holds one of these in
 * a cookie, and `apps/tracy-host`, the lane gateway's actor assertions and this app all read the
 * same three dot-separated parts. A change that reformats the token signs everyone out at once,
 * and nothing else in the suite would notice.
 */
const TOKEN_AT_A_FIXED_CLOCK =
  'v1.eyJlbWFpbCI6ImNlb0B0cmFjeS5haSIsImV4cCI6MTcwMDI1OTIwMH0.TGzWBQ0VEMEoEcO31M6N7ztZJv6JmlXdDuS3e04wJlk'

test('the wire format is the one every signed-in browser is already holding', async () => {
  // Since 11/10/2026 a token also carries the sign-in's `jti` (`lib/session-revocation.js`), so
  // a fresh mint is no longer byte-equal to this one; the three parts and the signature are the
  // same, and a token minted before (`TOKEN_AT_A_FIXED_CLOCK`, no `jti`) still verifies.
  const fresh = await mintSession('ceo@tracy.ai', secret, 1_700_000_000_000, { jti: 'j' })
  const [version, payload] = fresh.split('.')
  assert.equal(version, 'v1')
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), {
    email: 'ceo@tracy.ai',
    exp: 1_700_000_000 + SESSION_TTL_S,
    jti: 'j'
  })
  // Inside its lifetime it verifies; the expiry itself is covered below.
  assert.equal(
    await verifySession(TOKEN_AT_A_FIXED_CLOCK, secret, 1_700_000_000_000 + 60_000),
    'ceo@tracy.ai'
  )
})

test('tampered, expired and foreign-secret tokens all answer null', async () => {
  const token = await mintSession('a@b.c', secret)
  assert.equal(await verifySession(`${token}x`, secret), null)
  assert.equal(await verifySession(token, 'y'.repeat(32)), null)
  const old = await mintSession('a@b.c', secret, Date.now() - (SESSION_TTL_S + 3600) * 1000)
  assert.equal(await verifySession(old, secret), null)
})

test('cookie attributes follow the deployment: domain only when set, Secure only on https', () => {
  assert.equal(
    sessionCookie('t', { domain: null, secure: false }),
    `tracy_sess=t; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_S}`
  )
  assert.equal(
    sessionCookie('t', { domain: '.tracy.ai', secure: true }),
    `tracy_sess=t; HttpOnly; Secure; SameSite=Lax; Domain=.tracy.ai; Path=/; Max-Age=${SESSION_TTL_S}`
  )
  assert.match(clearSessionCookie({ domain: null, secure: false }), /^tracy_sess=; .*Max-Age=0$/)
})

test('the email is read straight off a cookie header', async () => {
  const token = await mintSession('a@b.c', secret)
  assert.equal(await sessionFromCookieHeader(`other=1; tracy_sess=${token}`, secret), 'a@b.c')
  assert.equal(await sessionFromCookieHeader(null, secret), null)
})

// ── a Domain= the host is not under is not a narrower cookie, it is no cookie ──────────────────
//
// Measured 10/09, minutes after `SESSION_DOMAIN` moved to `tracy.test`: signing in over the
// `localhost` alias answered 303 with `Set-Cookie: ... Domain=tracy.test`, curl and the browser
// both dropped it on the floor, and `/auth/me` came back `{"email":null}`. Sign-in reported
// success and left the person signed out, with nothing in any log to say why. `SITE_DOMAIN_ALIASES`
// means more than one suffix reaches this app on purpose, so this is the ordinary case.
test('cookieDomainFor: writes the Domain only for a host actually under it', () => {
  // Under it — the app's own host, and any site hostname beneath it.
  assert.equal(cookieDomainFor('tracy.test', 'tracy.test'), 'tracy.test')
  assert.equal(cookieDomainFor('tracy.test:8080', 'tracy.test'), 'tracy.test')
  assert.equal(cookieDomainFor('wpfix3.tracy.test:8080', 'tracy.test'), 'tracy.test')
  assert.equal(cookieDomainFor('a.b.tracy.test', 'tracy.test'), 'tracy.test')
  assert.equal(cookieDomainFor('TRACY.TEST:8080', 'tracy.test'), 'tracy.test')
  // A leading dot is the same domain written the old way.
  assert.equal(cookieDomainFor('wpfix3.tracy.test', '.tracy.test'), '.tracy.test')

  // NOT under it — host-only, which works, rather than a Domain that is silently discarded.
  assert.equal(cookieDomainFor('localhost:8080', 'tracy.test'), undefined)
  assert.equal(cookieDomainFor('wpfix3.localhost:8080', 'tracy.test'), undefined)
  assert.equal(cookieDomainFor('127.0.0.1:8080', 'tracy.test'), undefined)
  // The suffix must be a LABEL boundary: `nottracy.test` is not under `tracy.test`.
  assert.equal(cookieDomainFor('nottracy.test', 'tracy.test'), undefined)
  assert.equal(cookieDomainFor('eviltracy.test:8080', 'tracy.test'), undefined)

  // No sessionDomain configured at all: host-only everywhere, unchanged.
  assert.equal(cookieDomainFor('tracy.test', ''), undefined)
  assert.equal(cookieDomainFor('tracy.test', undefined), undefined)
  assert.equal(cookieDomainFor(undefined, 'tracy.test'), undefined)
})

test('an invalid parent-domain cookie cannot shadow a valid local session', async () => {
  const valid = await mintSession('qa@example.test', secret)
  const foreign = await mintSession('old@example.test', 'foreign-secret')
  for (const cookies of [
    [foreign, valid],
    [valid, foreign]
  ]) {
    assert.equal(
      await sessionFromCookieHeader(cookies.map((t) => `tracy_sess=${t}`).join('; '), secret),
      'qa@example.test'
    )
  }
  assert.equal(await sessionFromCookieHeader(`tracy_sess=${foreign}`, secret), null)
})

test('conflicting valid identities are refused while duplicate tokens are harmless', async () => {
  const a = await mintSession('a@example.test', secret)
  const b = await mintSession('b@example.test', secret)
  assert.equal(await sessionFromCookieHeader(`tracy_sess=${a}; tracy_sess=${b}`, secret), null)
  assert.equal(await sessionFromCookieHeader(`tracy_sess=${a}; tracy_sess=${a}`, secret), 'a@example.test')
})
