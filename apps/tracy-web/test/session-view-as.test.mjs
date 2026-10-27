import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VIEW_COOKIE,
  VIEW_SESSION_TTL_S,
  clearViewCookie,
  mintSession,
  mintViewSession,
  proxiedSessionToken,
  sessionWithExpiry,
  viewCookie,
  withSessionRevocations,
  withViewAs
} from '../src/lib/session.js'

const secret = 'x'.repeat(32)
const NOW = 1_700_000_000_000

const cookies = (...pairs) => pairs.join('; ')

test('a view token reads as the viewed person, with the admin who opened it in `act`', async () => {
  const view = await mintViewSession('Customer@Example.com', 'Ceo@Tracy.ai', secret, NOW)
  const s = await withViewAs(true, () => sessionWithExpiry(`${VIEW_COOKIE}=${view}`, secret, NOW + 1000))
  assert.equal(s.email, 'customer@example.com')
  assert.equal(s.act, 'ceo@tracy.ai')
  assert.equal(s.exp, Math.floor(NOW / 1000) + VIEW_SESSION_TTL_S)
})

test('a view token wins over the admin’s own sign-in instead of making the two conflict', async () => {
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
  const own = await mintSession('ceo@tracy.ai', secret, NOW)
  const s = await withViewAs(true, () =>
    sessionWithExpiry(cookies(`tracy_sess=${own}`, `${VIEW_COOKIE}=${view}`), secret, NOW + 1000)
  )
  assert.equal(s.email, 'customer@example.com')
  assert.equal(s.act, 'ceo@tracy.ai')
})

test('where the view is switched off (/ops) the admin is simply the admin', async () => {
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
  const own = await mintSession('ceo@tracy.ai', secret, NOW)
  const header = cookies(`tracy_sess=${own}`, `${VIEW_COOKIE}=${view}`)
  const s = await withViewAs(false, () => sessionWithExpiry(header, secret, NOW + 1000))
  assert.equal(s.email, 'ceo@tracy.ai')
  assert.equal(s.act, undefined)
})

test('outside any scope the view cookie is ignored: a bare reader never acts as someone else', async () => {
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
  assert.equal(await sessionWithExpiry(`${VIEW_COOKIE}=${view}`, secret, NOW + 1000), null)
})

test('the view lasts thirty minutes and then reads as nothing', async () => {
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
  // test-quality: contract a view lasts thirty minutes; the docs and the cookie's Max-Age state the same figure
  assert.equal(VIEW_SESSION_TTL_S, 1800)
  const late = NOW + (VIEW_SESSION_TTL_S + 1) * 1000
  assert.equal(await withViewAs(true, () => sessionWithExpiry(`${VIEW_COOKIE}=${view}`, secret, late)), null)
})

test('a tampered or foreign-secret view token reads as nothing', async () => {
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
  assert.equal(
    await withViewAs(true, () => sessionWithExpiry(`${VIEW_COOKIE}=${view}x`, secret, NOW + 1)),
    null
  )
  assert.equal(
    await withViewAs(true, () => sessionWithExpiry(`${VIEW_COOKIE}=${view}`, 'y'.repeat(32), NOW + 1)),
    null
  )
})

test('a view token cannot pass as the admin’s own sign-in: it is only read from its own cookie', async () => {
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
  const s = await withViewAs(true, () => sessionWithExpiry(`tracy_sess=${view}`, secret, NOW + 1))
  // Forwarded as a session it is still the viewed person AND still carries `act`, which is what
  // lets every door that sees it tell a view from a sign-in.
  assert.equal(s.email, 'customer@example.com')
  assert.equal(s.act, 'ceo@tracy.ai')
})

test('an ended view is refused from then on', async () => {
  const ended = new Set()
  const book = { isRevoked: async (jti) => ended.has(jti), revoke: async (jti) => ended.add(jti) }
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW, { jti: 'v1j' })
  const read = () =>
    withSessionRevocations(book, () =>
      withViewAs(true, () => sessionWithExpiry(`${VIEW_COOKIE}=${view}`, secret, NOW + 1))
    )
  assert.equal((await read()).email, 'customer@example.com')
  ended.add('v1j')
  assert.equal(await read(), null)
})

test('the view cookie is HttpOnly, lives thirty minutes, and clears cleanly', () => {
  const set = viewCookie('tok', { secure: true, domain: '.tracy.ai' })
  assert.match(
    set,
    /^tracy_view=tok; HttpOnly; Secure; SameSite=Lax; Domain=\.tracy\.ai; Path=\/; Max-Age=1800$/
  )
  assert.match(clearViewCookie({ secure: true }), /^tracy_view=; .*Max-Age=0$/)
})

test('the dsh proxy forwards the view token, never the admin’s own sign-in, while a view is open', async () => {
  const view = await mintViewSession('customer@example.com', 'ceo@tracy.ai', secret, NOW)
  const own = await mintSession('ceo@tracy.ai', secret, NOW)
  const header = cookies(`tracy_sess=${own}`, `${VIEW_COOKIE}=${view}`)
  assert.equal(
    withViewAs(true, () => proxiedSessionToken(header)),
    view
  )
  assert.equal(
    withViewAs(false, () => proxiedSessionToken(header)),
    own
  )
  assert.equal(proxiedSessionToken(header), own)
})
