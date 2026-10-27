// apps/tracy-web/test/shard-node-session-names.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearSessionCookie,
  mintSession,
  primarySessionToken,
  sessionCookie,
  sessionFromCookieHeader,
  withSessionCookieName
} from '../src/lib/session.js'

const shardSecret = 's'.repeat(32)
const masterSecret = 'm'.repeat(32)
const at = 1_760_000_000_000

test('outside a shard scope only tracy_sess is read, exactly as before', async () => {
  const token = await mintSession('a@b.c', shardSecret, at)
  assert.equal(await sessionFromCookieHeader(`tracy_sess_s2=${token}`, shardSecret, at), null)
  assert.equal(await sessionFromCookieHeader(`tracy_sess=${token}`, shardSecret, at), 'a@b.c')
})

test('a shard reads its own cookie and the legacy name, and the master’s token beside it changes nothing', async () => {
  const own = await mintSession('a@b.c', shardSecret, at)
  const masters = await mintSession('a@b.c', masterSecret, at)
  await withSessionCookieName('tracy_sess_s2', async () => {
    assert.equal(
      await sessionFromCookieHeader(`tracy_sess=${masters}; tracy_sess_s2=${own}`, shardSecret, at),
      'a@b.c'
    )
    // The dsh plugins call back with `tracy_sess=<the shard's token>`.
    assert.equal(await sessionFromCookieHeader(`tracy_sess=${own}`, shardSecret, at), 'a@b.c')
    assert.equal(await sessionFromCookieHeader(`tracy_sess_s3=${own}`, shardSecret, at), null)
  })
})

test('two valid copies naming two people are still nobody, across both names', async () => {
  const a = await mintSession('a@b.c', shardSecret, at)
  const b = await mintSession('b@b.c', shardSecret, at)
  await withSessionCookieName('tracy_sess_s2', async () => {
    assert.equal(await sessionFromCookieHeader(`tracy_sess=${a}; tracy_sess_s2=${b}`, shardSecret, at), null)
  })
})

test('the primary token is the shard’s own name first, the legacy one only when it is absent', async () => {
  await withSessionCookieName('tracy_sess_s2', async () => {
    assert.equal(primarySessionToken('tracy_sess=M; tracy_sess_s2=S'), 'S')
    assert.equal(primarySessionToken('tracy_sess=M'), 'M')
    assert.equal(primarySessionToken('other=1'), null)
  })
  assert.equal(primarySessionToken('tracy_sess=M; tracy_sess_s2=S'), 'M')
})

test('the cookie is written under the name it is given, tracy_sess by default', () => {
  assert.match(
    sessionCookie('T', { name: 'tracy_sess_s2', domain: 'tracy.ai', secure: true }),
    /^tracy_sess_s2=T; HttpOnly; Secure; SameSite=Lax; Domain=tracy\.ai; Path=\/; Max-Age=\d+$/
  )
  assert.match(sessionCookie('T', { secure: false }), /^tracy_sess=T; /)
  assert.match(clearSessionCookie({ name: 'tracy_sess_s2', secure: true }), /^tracy_sess_s2=; .*Max-Age=0$/)
})
