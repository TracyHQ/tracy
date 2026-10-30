/**
 * The rebuilding lock of a brief build (#189): a site is put on its rebuilding page before the build writes, Tracy still
 * reads the real site while it is locked, a full site is unlocked, and a site whose plugin cannot be locked is built open
 * with a note. Fictional businesses of two trades; the door is a double.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createSiteLock,
  LOCK_UNSUPPORTED_NOTE,
  lockedRead,
  lockSite,
  REBUILDING_MESSAGE,
  unlockSite
} from '../src/sites/site-lock.js'
import { joomlaSiteLock, offersSiteLock } from '../src/sites/brief-engines/site-lock-joomla.js'
import { unlockFullSite } from '../src/opportunities-build/build-site-lock.js'

const CAPABLE = {
  ok: true,
  info: {
    site_offline: {
      version: 1,
      fields: ['offline', 'offline_message', 'display_offline_message'],
      bypass: 'authorization-bearer'
    }
  }
}

/** A Cowork door double: answers `info` as told and records every other call. */
function door(info) {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    return call.action === 'info' ? info : { ok: true, changed: Object.keys(call.params.fields ?? {}) }
  }
  return { calls, apply }
}

const TRADES = [
  { trade: 'locksmith', siteKey: 'brightkey-locks.tracy.test' },
  { trade: 'tea room', siteKey: 'willow-tea-room.tracy.test' }
]

for (const { trade, siteKey } of TRADES) {
  test(`${trade}: a capable Joomla site is locked on its rebuilding page, then unlocked`, async () => {
    const { calls, apply } = door(CAPABLE)
    const locked = await lockSite({ writer: joomlaSiteLock, apply, siteKey, applyId: 'site-lock-run1' })
    assert.deepEqual(locked, { version: 1, state: 'locked' })
    const set = calls.find((c) => c.action === 'site.identity')
    assert.deepEqual(set.params, {
      operation: 'set',
      apply_id: 'site-lock-run1',
      fields: { offline: 1, offline_message: REBUILDING_MESSAGE, display_offline_message: 1 }
    })
    const unlocked = await unlockSite({ writer: joomlaSiteLock, apply, siteKey, applyId: 'site-unlock-run1' })
    assert.deepEqual(unlocked, { version: 1, state: 'unlocked' })
    assert.deepEqual(calls.at(-1).params.fields, { offline: 0 })
  })

  test(`${trade}: a plugin without the lock is never turned offline (the build goes on open)`, async () => {
    for (const info of [
      { ok: true, info: {} },
      { ok: false, error: 'bad_action' }
    ]) {
      const { calls, apply } = door(info)
      const got = await lockSite({ writer: joomlaSiteLock, apply, siteKey, applyId: 'site-lock-run2' })
      assert.equal(got.state, 'unsupported')
      assert.equal(
        calls.some((c) => c.action === 'site.identity'),
        false
      )
    }
    const none = await lockSite({ writer: undefined, apply: door(CAPABLE).apply, siteKey, applyId: 'x' })
    assert.equal(none.state, 'unsupported', 'a CMS with no lock writer is built open')
  })
}

test('the lock is offered only with the bearer read and all three fields', () => {
  assert.equal(offersSiteLock(CAPABLE), true)
  const without = structuredClone(CAPABLE)
  without.info.site_offline.bypass = 'none'
  assert.equal(offersSiteLock(without), false)
  const short = structuredClone(CAPABLE)
  short.info.site_offline.fields = ['offline']
  assert.equal(offersSiteLock(short), false)
})

test('the message a visitor reads is formal plain text without dashes', () => {
  assert.ok(REBUILDING_MESSAGE.length <= 1000)
  assert.doesNotMatch(REBUILDING_MESSAGE, new RegExp('[\\u2013\\u2014<>!]|\\s-\\s'))
  assert.doesNotMatch(LOCK_UNSUPPORTED_NOTE, new RegExp('[\\u2013\\u2014]'))
})

test('a read of a locked site carries the token to the site itself only, never to a font host', () => {
  assert.deepEqual(lockedRead({ accept: 'text/html' }, 'tok-1', true), {
    accept: 'text/html',
    authorization: 'Bearer tok-1'
  })
  assert.deepEqual(lockedRead({ accept: 'text/css' }, 'tok-1', false), { accept: 'text/css' })
  assert.deepEqual(lockedRead({}, null, true), {})
})

/** A pool double holding one site_brief row's `timings.siteLock`. */
function lockPool(initial) {
  const state = { lock: initial, writes: [] }
  return {
    state,
    async query(sql, params) {
      if (/^\s*select b\.timings->'siteLock'/.test(sql))
        return { rows: state.lock ? [{ lock: state.lock }] : [] }
      if (/update site_brief set timings/.test(sql)) {
        state.lock = JSON.parse(params[1])
        state.writes.push(state.lock)
        return { rows: [] }
      }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

for (const { trade, siteKey } of TRADES) {
  test(`${trade}: only a site a judging build holds is locked, and only a locked site sends the bearer`, async () => {
    const pool = lockPool(null)
    const { apply } = door(CAPABLE)
    let held = false
    const lock = createSiteLock({
      pool,
      writers: { joomla: joomlaSiteLock },
      applyFor: () => apply,
      holds: async () => held,
      tokenOf: async () => 'site-token'
    })
    const ctx = { siteKey, platform: 'joomla', email: 'owner@example.test', runId: 'run-3' }
    assert.equal(await lock.lock(ctx), null, 'the Add site popup Apply never locks')
    held = true
    assert.equal((await lock.lock(ctx)).state, 'locked')
    assert.equal(await lock.bearer(siteKey), null, 'the row does not say locked yet')
    pool.state.lock = { version: 1, state: 'locked' }
    assert.equal(await lock.bearer(siteKey), 'site-token')
    assert.deepEqual(await lock.unlock(ctx), { version: 1, state: 'unlocked' })
    assert.equal(pool.state.lock.state, 'unlocked')
    assert.equal(await lock.bearer(siteKey), null)
    const writes = pool.state.writes.length
    await lock.unlock(ctx)
    assert.equal(pool.state.writes.length, writes, 'a site not locked is not written again')
  })
}

test('the runner unlocks a full site once and keeps the lock on the receipt', async () => {
  const saved = []
  const db = {
    async query(_sql, params) {
      saved.push(JSON.parse(params[1]))
      return { rows: [{ id: params[0], receipt: JSON.parse(params[1]) }] }
    }
  }
  const asked = []
  const unlock = async (input) => {
    asked.push(input)
    return { version: 1, state: 'unlocked' }
  }
  const build = { id: 'b-1', site_key: 'willow-tea-room.tracy.test', receipt: {} }
  const after = await unlockFullSite(db, { build, platform: 'joomla', email: 'owner@example.test', unlock })
  assert.deepEqual(after.receipt.siteLock, { version: 1, state: 'unlocked' })
  assert.equal(asked[0].siteKey, 'willow-tea-room.tracy.test')
  await unlockFullSite(db, { build: after, platform: 'joomla', email: 'owner@example.test', unlock })
  assert.equal(asked.length, 1, 'an unlocked site is not unlocked again')
})
