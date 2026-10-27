/**
 * A page open on a deleted site stops saying hello (issue #340) — and only that page.
 *
 * Measured 24/09 on dev: a tab left open on a deleted site sent both plugins' hellos every time it
 * became visible, each redirected to `/<label>/join` and answered 404. The same door also redirects
 * a live seat holder (a renewed seat token sends the request back to its own address), which must
 * not silence the page.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { helloUntilGone, siteIsGone } from '../src/hello/index.mjs'

/** What `fetch` hands back after following the redirects to `path`. */
const landed = (path, status, redirected = true) => ({
  redirected,
  status,
  url: `https://cowork.tracy.site${path}`
})

test('a seat holder keeps saying hello', async () => {
  let sent = 0
  const h = helloUntilGone(async () => {
    sent += 1
    return landed('/wp.tracy.site/api/tracy-site-tools/hello', 204, false)
  })
  await h.hello()
  await h.hello()
  assert.equal(sent, 2)
  assert.equal(h.stopped(), false)
})

test('a renewed seat token redirects the hello to its own address: the page keeps greeting', async () => {
  // `workspace/route.js`: `if (minted) return c.redirect(url.pathname + url.search, 302)` — fetch
  // follows it as a GET, which the hello door does not serve.
  let sent = 0
  const h = helloUntilGone(async () => {
    sent += 1
    return landed('/wp.tracy.site/api/tracy-site-tools/hello', 404)
  })
  await h.hello()
  await h.hello()
  assert.equal(h.stopped(), false)
  assert.equal(sent, 2)
})

test('a revoked seat lands on a join page that exists: a seat can be given back, so the page keeps greeting', async () => {
  const h = helloUntilGone(async () => landed('/wp/join', 200))
  await h.hello()
  assert.equal(h.stopped(), false)
})

test('the join page of a site the book no longer holds stops every later hello from this page', async () => {
  let sent = 0
  const h = helloUntilGone(async () => {
    sent += 1
    return landed('/qa-jo-0924/join', 404)
  })
  await h.hello()
  assert.equal(h.stopped(), true)
  for (let i = 0; i < 10; i += 1) await h.hello() // the tab coming back into view, ten times
  assert.equal(sent, 1)
})

test('a failed request is not a deleted site: the next hello goes out', async () => {
  let sent = 0
  const h = helloUntilGone(async () => {
    sent += 1
    if (sent === 1) throw new TypeError('network')
    return landed('/wp.tracy.site/api/tracy-site-tools/hello', 204, false)
  })
  await h.hello()
  assert.equal(h.stopped(), false)
  await h.hello()
  assert.equal(sent, 2)
})

test('siteIsGone reads only a followed redirect ending at a join page that answered 404', () => {
  assert.equal(siteIsGone(landed('/gone/join', 404)), true)
  assert.equal(
    siteIsGone(landed('/gone/join', 404, false)),
    false,
    'not redirected: the page asked for it itself'
  )
  assert.equal(siteIsGone(landed('/gone/join', 200)), false)
  assert.equal(siteIsGone(landed('/gone/team', 404)), false)
  assert.equal(siteIsGone(undefined), false)
})
