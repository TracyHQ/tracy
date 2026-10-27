// apps/tracy-web/test/shards-cookies.test.mjs
/** The cookies of the shard beta (spec §1, §4.3; review amendment 2; docs/sre/hop-dong-cua-shard.md §3). */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COOKIE_LEDGER,
  HANDOFF_COOKIE,
  SHARD_COOKIE,
  clearHandoffCookie,
  clearShardCookie,
  handoffCookie,
  outgoingCookieHeader,
  shardCookie,
  shardCookieName,
  signOutCookies
} from '../src/lib/cookies.js'

const opts = { domain: 'tracy.test', secure: true }
const NONCE = '0123456789abcdef0123456789abcdef'

test('the shard pointer is host-only: __Host- over https, unprefixed on a plain-HTTP stand, never a Domain', () => {
  // test-quality: contract hop-dong-cua-shard.md §3 names the pointer cookie; every host reads it by this name
  assert.equal(SHARD_COOKIE, '__Host-tracy_shard')
  assert.equal(shardCookieName(true), '__Host-tracy_shard')
  assert.equal(shardCookieName(false), 'tracy_shard')
  assert.equal(
    shardCookie('s1', opts),
    '__Host-tracy_shard=s1; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000',
    'the session domain in opts is ignored: __Host- forbids a Domain'
  )
  assert.equal(
    clearShardCookie(opts),
    '__Host-tracy_shard=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0'
  )
  assert.equal(
    shardCookie('s1', { secure: false }),
    'tracy_shard=s1; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'
  )
})

test('the handoff nonce lives sixty seconds on Path=/ under the session domain, and host-only on a stand without one', () => {
  // test-quality: contract hop-dong-cua-shard.md §3 names the handoff cookie the master sets and the shard reads
  assert.equal(HANDOFF_COOKIE, 'tracy_handoff')
  assert.equal(
    handoffCookie(NONCE, opts),
    `tracy_handoff=${NONCE}; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=tracy.test; Max-Age=60`
  )
  assert.equal(
    handoffCookie(NONCE, { domain: undefined, secure: false }),
    `tracy_handoff=${NONCE}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`
  )
  assert.equal(
    clearHandoffCookie(opts),
    'tracy_handoff=; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=tracy.test; Max-Age=0'
  )
})

test('sign-out keeps the shard pointer and clears a handoff nonce the browser presented', () => {
  const config = { secure: true, sessionDomain: 'tracy.test', deploymentRole: 'master' }
  const out = signOutCookies(
    `tracy_sess=x; ${SHARD_COOKIE}=s1; ${HANDOFF_COOKIE}=${NONCE}`,
    config,
    'cowork.tracy.test'
  )
  assert.ok(out.includes(clearHandoffCookie(opts)))
  assert.equal(
    out.some((value) => value.startsWith(`${SHARD_COOKIE}=`)),
    false,
    '__Host-tracy_shard outlives sign-out'
  )
  assert.equal(
    signOutCookies('tracy_sess=x', config, 'cowork.tracy.test').some((value) =>
      value.startsWith(`${HANDOFF_COOKIE}=`)
    ),
    false
  )
  assert.equal(COOKIE_LEDGER.find((row) => row.name === SHARD_COOKIE).outlivesSignout, true)
  assert.equal(COOKIE_LEDGER.find((row) => row.name === HANDOFF_COOKIE).outlivesSignout, false)
})

test("on a shard, sign-out clears its own tracy_sess_<name> with tracy_sess's attributes", () => {
  const shard = {
    secure: true,
    sessionDomain: 'tracy.test',
    deploymentRole: 'shard',
    sessionCookieName: 'tracy_sess_s1'
  }
  const out = signOutCookies('', shard, 's1.tracy.test')
  assert.ok(out.includes('tracy_sess=; HttpOnly; Secure; SameSite=Lax; Domain=tracy.test; Path=/; Max-Age=0'))
  assert.ok(
    out.includes('tracy_sess_s1=; HttpOnly; Secure; SameSite=Lax; Domain=tracy.test; Path=/; Max-Age=0')
  )
})

test('on the master, sign-out clears every tracy_sess_<n> the browser presents, and nothing that only looks like one', () => {
  const master = { secure: true, sessionDomain: 'tracy.test', deploymentRole: 'master' }
  const out = signOutCookies(
    'tracy_sess=m; tracy_sess_s1=a; tracy_sess_d1=b; tracy_sess_=c; tracy_sess_S1=d; tracy_sessx=e; tracy_sess_s1_x=f',
    master,
    'cowork.tracy.test'
  )
  const attrs = 'HttpOnly; Secure; SameSite=Lax; Domain=tracy.test; Path=/; Max-Age=0'
  assert.ok(out.includes(`tracy_sess_s1=; ${attrs}`), out.join(' | '))
  assert.ok(out.includes(`tracy_sess_d1=; ${attrs}`), out.join(' | '))
  for (const name of ['tracy_sess_=', 'tracy_sess_S1=', 'tracy_sessx=', 'tracy_sess_s1_x='])
    assert.equal(
      out.some((v) => v.startsWith(name)),
      false,
      `${name} is not a shard session name`
    )
  assert.equal(new Set(out).size, out.length, 'one header per cookie')
  assert.equal(
    signOutCookies('tracy_sess=m', master, 'cowork.tracy.test').some((v) => v.startsWith('tracy_sess_')),
    false,
    'nothing is cleared that was not presented'
  )
})

test('the site door never forwards the pointer or the nonce to a customer container', () => {
  assert.equal(
    outgoingCookieHeader(`${SHARD_COOKIE}=s1; tracy_shard=s1; ${HANDOFF_COOKIE}=n; theme=dark`, null),
    'theme=dark'
  )
})
