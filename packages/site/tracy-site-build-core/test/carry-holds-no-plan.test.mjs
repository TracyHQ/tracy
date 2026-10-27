/**
 * The carry survives a sign-in reload. A design PLAN must not.
 *
 * `readCarry` is the only thing that outlives the reload the sign-in window forces, and what it
 * holds decides what a customer sees when the form comes back. The requested design belongs there —
 * losing it would send them back to the picker. The plan does NOT: which template a design actually
 * builds with is the fleet's answer, pinned to a registry revision, and a copy of it sitting in
 * localStorage is an answer that can be a week old while the form presents it as current.
 *
 * So this is not a test that a field is absent for tidiness. It is the test that says the form can
 * only get a plan by asking, which is what makes `DESIGN_PLAN_CHANGED` reachable at all: a carried
 * plan would be re-sent with its stale revision on every press after a reload.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { carryKey, readCarry, writeCarry } from '../src/client/carry.mjs'

/** localStorage, as much of it as the carry uses. */
function storage(initial = {}) {
  const slots = new Map(Object.entries(initial))
  return {
    getItem: (k) => slots.get(k) ?? null,
    setItem: (k, v) => slots.set(k, v),
    removeItem: (k) => slots.delete(k),
    slots
  }
}

test('the carry keeps the design that was PICKED, so a reload does not send the customer back', () => {
  const store = storage()
  writeCarry({ id: 'stripe', platform: 'joomla', answers: { name: 'Harbour Air' } }, store)
  const back = readCarry(store)
  assert.equal(back.id, 'stripe')
  assert.equal(back.platform, 'joomla')
  assert.deepEqual(back.answers, { name: 'Harbour Air' })
})

test('and it hands back nothing else, so a plan cannot ride across the reload', () => {
  const store = storage()
  // What a careless caller might try to stash: the whole plan, next to the answers.
  store.setItem(
    carryKey,
    JSON.stringify({
      id: 'stripe',
      platform: 'joomla',
      answers: {},
      designPlan: {
        requestedDesign: 'stripe',
        effectiveDesign: 'airbnb',
        contractProfile: 'tracy-airbnb/j6/1.0.0',
        registryRevision: 'f'.repeat(64),
        fallback: false
      }
    })
  )
  const back = readCarry(store)
  assert.deepEqual(Object.keys(back).sort(), ['answers', 'id', 'platform'])
  assert.equal('designPlan' in back, false)
  // The effective design in that blob was a lie — Stripe has no Joomla template. Reading it back
  // would have told the customer they were getting Airbnb.
  assert.equal(back.id, 'stripe')
})

test('a carry that lost its design is no carry at all, rather than one with an empty design', () => {
  // The id is what the form re-asks the plan for. A carry without it would mount the form with no
  // design, fetch no plan, and show no fallback notice — a silent wrong answer.
  for (const broken of [
    { platform: 'joomla', answers: {} },
    { id: '', platform: 'joomla', answers: {} },
    { id: 'stripe', platform: '', answers: {} },
    { id: 'stripe', platform: 'joomla' },
    { id: 'stripe', platform: 'joomla', answers: [] }
  ]) {
    const store = storage({ [carryKey]: JSON.stringify(broken) })
    assert.equal(readCarry(store), null, `expected ${JSON.stringify(broken)} to read as no carry`)
  }
})

test('storage that throws loses the carry instead of the press', () => {
  const angry = {
    getItem() {
      throw new Error('site data blocked')
    },
    setItem() {
      throw new Error('site data blocked')
    },
    removeItem() {
      throw new Error('site data blocked')
    }
  }
  assert.equal(readCarry(angry), null)
  assert.doesNotThrow(() => writeCarry({ id: 'stripe', platform: 'joomla', answers: {} }, angry))
  assert.doesNotThrow(() => writeCarry(null, angry))
})

test('a carry written by another CMS is not adopted — two CMSes from one inspiration', () => {
  // Measured 21/09/2026. A customer built `tracy-business` with Joomla, then picked the SAME
  // inspiration with WordPress. `BuildForm` matched on the inspiration alone, adopted the Joomla
  // carry, and restored its `buildId`. `site_creation` is keyed by (account, buildId) and the
  // claim's `payload_hash` includes the platform, so the second press read as a changed request
  // under an old name: "The site could not be started: IDEMPOTENCY_CONFLICT".
  const store = storage()
  writeCarry(
    { id: 'tracy-business', platform: 'joomla', answers: { name: 'Harbour Air' }, buildId: 'b-joomla' },
    store
  )
  assert.equal(readCarry(store, { platform: 'wordpress' }), null, 'the WordPress form took Joomla’s carry')
  // Asked for by its own CMS it is still there, buildId and all — a retry is still the same build.
  assert.equal(readCarry(store, { platform: 'joomla' })?.buildId, 'b-joomla')
  // 🔒 AND IT IS STILL ON DISK. Another account's carry is dropped; another CMS's is the other
  // Build tab's live work, and all three plugins run in one page.
  assert.ok(store.slots.has(carryKey), 'the other CMS’s carry was thrown away')
  // No platform asked for: every caller that does not care reads it exactly as before.
  assert.equal(readCarry(store)?.platform, 'joomla')
})

// ── `pressedAt` is what tells an interrupted press from a site still waiting to be answered ─────
//
// A claim writes a carry with a `siteKey` and no `pressedAt`; the BUILD press writes one with
// both. `BuildForm`'s resume effect reads exactly that difference: a claimed site whose questions
// have not been answered must sit and wait for its customer, while a press whose page went away
// must continue. Without the stamp the two are the same carry, and resuming would build a site out
// of half a form.

test('the carry remembers WHEN the build was pressed, and refuses a stamp that is not a number', () => {
  const store = storage()
  const at = Date.now()
  writeCarry(
    { id: 'stripe', platform: 'joomla', answers: { name: 'Harbour Air' }, siteKey: 's.test', pressedAt: at },
    store
  )
  assert.equal(readCarry(store).pressedAt, at)

  // A claim's carry: the same site, no stamp — and the field must be ABSENT, not null, so the
  // resume effect's `typeof !== 'number'` guard reads it the way it reads a carry from before
  // this field existed.
  writeCarry({ id: 'stripe', platform: 'joomla', answers: { name: 'Harbour Air' }, siteKey: 's.test' }, store)
  assert.equal('pressedAt' in readCarry(store), false)

  // Anything that is not a number is not a stamp: a resumed page must not act on it.
  store.setItem(
    carryKey,
    JSON.stringify({ id: 'stripe', platform: 'joomla', answers: { name: 'x' }, pressedAt: 'now' })
  )
  assert.equal('pressedAt' in readCarry(store), false)
})

test('the carry keeps the provision job a press started, so a reload can wait for its handover', () => {
  const store = storage()
  writeCarry(
    { id: 'tracy-business', platform: 'wordpress', answers: { name: 'x' }, pressedAt: 1, jobId: 'job-7' },
    store
  )
  assert.equal(readCarry(store).jobId, 'job-7')
  store.setItem(
    carryKey,
    JSON.stringify({ id: 'tracy-business', platform: 'wordpress', answers: {}, jobId: 7 })
  )
  assert.equal('jobId' in readCarry(store), false, 'a job id that is not a string is no job id')
})
