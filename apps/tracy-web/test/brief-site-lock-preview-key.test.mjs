/**
 * The preview key of the rebuilding lock (#189): a site whose plugin also lets Tracy read it with a preview key
 * (`info.site_offline.bypass_also` lists "preview-key") gets a fresh random key with its lock, the key lives only in the
 * row's lock state while the site is locked, and it never reaches a receipt. A plugin without it is locked as before.
 * Fictional businesses of two trades; the door is a double.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createSiteLock,
  lockSite,
  PREVIEW_KEY_RENEW_MS,
  PREVIEW_KEY_SHAPE,
  publicLock
} from '../src/sites/site-lock.js'
import { joomlaSiteLock, offersPreviewKey } from '../src/sites/brief-engines/site-lock-joomla.js'

const LOCK = {
  version: 1,
  fields: ['offline', 'offline_message', 'display_offline_message'],
  bypass: 'authorization-bearer'
}
const WITH_KEY = { ok: true, info: { site_offline: { ...LOCK, bypass_also: ['preview-key'] } } }
const WITHOUT_KEY = { ok: true, info: { site_offline: LOCK } }

function door(info) {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    return call.action === 'info' ? info : { ok: true }
  }
  return { calls, apply }
}

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

const TRADES = [
  { trade: 'bicycle repair', siteKey: 'spoke-and-chain.tracy.test' },
  { trade: 'florist', siteKey: 'meadow-lane-flowers.tracy.test' }
]

test('the preview key is offered only when the lock lists it beside the bearer', () => {
  assert.equal(offersPreviewKey(WITH_KEY), true)
  assert.equal(offersPreviewKey(WITHOUT_KEY), false)
  assert.equal(
    offersPreviewKey({ ok: true, info: { site_offline: { ...LOCK, bypass_also: 'preview-key' } } }),
    false
  )
})

for (const { trade, siteKey } of TRADES) {
  test(`${trade}: a site whose plugin takes a preview key is locked with a fresh random one`, async () => {
    const { calls, apply } = door(WITH_KEY)
    const first = await lockSite({ writer: joomlaSiteLock, apply, siteKey, applyId: 'site-lock-r1' })
    const second = await lockSite({ writer: joomlaSiteLock, apply, siteKey, applyId: 'site-lock-r2' })
    assert.equal(first.state, 'locked')
    assert.match(first.previewKey, PREVIEW_KEY_SHAPE)
    assert.equal(first.previewKey.length, 48)
    assert.notEqual(first.previewKey, second.previewKey, 'every lock has its own key')
    const set = calls.find((c) => c.action === 'site.identity')
    assert.equal(set.params.fields.offline_preview_key, first.previewKey)
    assert.equal(set.params.fields.offline, 1)
    assert.equal(set.params.apply_id.includes(first.previewKey), false, 'never in an apply id')
    assert.deepEqual(publicLock(first), { version: 1, state: 'locked' })
  })

  test(`${trade}: without the capability the lock is as before, with no key`, async () => {
    const { calls, apply } = door(WITHOUT_KEY)
    const got = await lockSite({ writer: joomlaSiteLock, apply, siteKey, applyId: 'site-lock-r3' })
    assert.deepEqual(got, { version: 1, state: 'locked' })
    const set = calls.find((c) => c.action === 'site.identity')
    assert.equal('offline_preview_key' in set.params.fields, false)
  })

  test(`${trade}: the key is answered while the site is locked and dies at unlock`, async () => {
    const pool = lockPool(null)
    const { apply } = door(WITH_KEY)
    const lock = createSiteLock({
      pool,
      writers: { joomla: joomlaSiteLock },
      applyFor: () => apply,
      holds: async () => true,
      tokenOf: async () => 'site-token'
    })
    const ctx = { siteKey, platform: 'joomla', email: 'owner@example.test', runId: 'run-7' }
    const locked = await lock.lock(ctx)
    assert.equal(await lock.previewKey(siteKey), null, 'the row does not say locked yet')
    pool.state.lock = locked
    assert.equal(await lock.previewKey(siteKey), locked.previewKey)
    const unlocked = await lock.unlock(ctx)
    assert.deepEqual(unlocked, { version: 1, state: 'unlocked' })
    assert.equal(pool.state.lock.previewKey, undefined, 'the row forgets the key')
    assert.equal(await lock.previewKey(siteKey), null)
  })

  test(`${trade}: an unlock that fails keeps the key on the row but never answers it`, async () => {
    const pool = lockPool({
      version: 1,
      state: 'locked',
      previewKey: 'k'.repeat(48),
      previewKeyAt: Date.now()
    })
    const apply = async () => ({ ok: false, error: 'busy' })
    const lock = createSiteLock({
      pool,
      writers: { joomla: joomlaSiteLock },
      applyFor: () => apply,
      holds: async () => true,
      tokenOf: async () => null
    })
    const got = await lock.unlock({
      siteKey,
      platform: 'joomla',
      email: 'owner@example.test',
      runId: 'run-8'
    })
    assert.equal(got.state, 'locked')
    assert.equal(got.previewKey, undefined, 'the answer goes to the receipt: no key')
    assert.equal(pool.state.lock.previewKey, 'k'.repeat(48), 'still locked, so Tracy can still read it')
    assert.equal(await lock.previewKey(siteKey), 'k'.repeat(48))
  })
}

for (const { trade, siteKey } of TRADES) {
  test(`${trade}: a lock held near the plugin's 6 hour expiry gets a fresh key, sent again with offline 1`, async () => {
    let clock = 1_000_000
    const pool = lockPool(null)
    const { calls, apply } = door(WITH_KEY)
    const writers = []
    const lock = createSiteLock({
      pool,
      writers: { joomla: joomlaSiteLock },
      applyFor: (email, run) => {
        writers.push({ email, run })
        return apply
      },
      holds: async () => true,
      tokenOf: async () => null,
      now: () => clock
    })
    const ctx = { siteKey, platform: 'joomla', email: 'owner@example.test', runId: 'run-9' }
    pool.state.lock = await lock.lock(ctx)
    const first = pool.state.lock.previewKey
    clock += PREVIEW_KEY_RENEW_MS - 1
    assert.equal(await lock.previewKey(siteKey, 'editor@example.test'), first, 'still fresh: the same key')
    clock += 2
    assert.equal(
      await lock.previewKey(siteKey, null),
      null,
      'nobody to write as: no key rather than a dead one'
    )
    const renewed = await lock.previewKey(siteKey, 'editor@example.test')
    assert.match(renewed, PREVIEW_KEY_SHAPE)
    assert.notEqual(renewed, first)
    const set = calls.filter((c) => c.action === 'site.identity').at(-1)
    assert.equal(set.params.fields.offline, 1, 'a key is only ever sent with offline 1')
    assert.equal(set.params.fields.offline_preview_key, renewed)
    assert.deepEqual(writers.at(-1), { email: 'editor@example.test', run: 'run-9' })
    assert.equal(pool.state.lock.previewKey, renewed)
    assert.equal(pool.state.lock.previewKeyAt, clock)
    assert.equal(await lock.previewKey(siteKey, 'editor@example.test'), renewed)
    const unlocked = await lock.unlock(ctx)
    assert.deepEqual(unlocked, { version: 1, state: 'unlocked' })
    assert.equal(
      'offline_preview_key' in calls.at(-1).params.fields,
      false,
      'the unlock never carries a key (the plugin refuses one with offline 0)'
    )
  })
}
