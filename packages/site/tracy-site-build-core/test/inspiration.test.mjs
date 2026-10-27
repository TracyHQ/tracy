/**
 * 🔒 THE HEADER KNEW AND THE FETCH DID NOT. `BuildTab` decided which inspiration it was about twice,
 * with two different expressions: the header read the job, the meta, the agent's ask AND the
 * sign-in carry; the questions fetch read only the meta and the ask. A tab whose inspiration came
 * from the job or the carry drew "Design inspiration tracy-business" over a fetch that never fired.
 *
 * The result is the worst shape that panel has — `questions` null and `questionsFailed` false, so
 * it draws the header and three grey bars: no spinner, no sentence, no Retry, nothing that ends it.
 * Measured 22/09/2026 on dev, three platforms at once, all three showing a card over nothing.
 *
 *   node --test packages/site/tracy-site-build-core/test/inspiration.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inspirationOf } from '../src/client/inspiration.mjs'

test('the carry alone names the inspiration — the case the fetch used to miss', () => {
  assert.equal(inspirationOf({ carry: { id: 'tracy-business' } }), 'tracy-business')
})

test('the job alone names it too — the other source the fetch could not see', () => {
  assert.equal(inspirationOf({ job: { inspiration: 'tracy-apple' } }), 'tracy-apple')
})

/**
 * Order is the whole content of the function, so each step is pinned against the one under it. The
 * job wins because a tab following a build that already names an inspiration must not be talked out
 * of it by a carry left over from an earlier press.
 */
test('a later source never overrides an earlier one', () => {
  const all = {
    job: { inspiration: 'from-job' },
    meta: { id: 'from-meta' },
    ask: { inspiration: 'from-ask' },
    carry: { id: 'from-carry' }
  }
  assert.equal(inspirationOf(all), 'from-job')
  assert.equal(inspirationOf({ ...all, job: null }), 'from-meta')
  assert.equal(inspirationOf({ ...all, job: null, meta: null }), 'from-ask')
  assert.equal(inspirationOf({ ...all, job: null, meta: null, ask: null }), 'from-carry')
})

/**
 * An empty string is not an id, and it must not shadow a real one below it. A meta opened without
 * an inspiration is the common case — that is precisely when the carry has to answer.
 */
test('a blank id is no id, and falls through to the next source', () => {
  assert.equal(inspirationOf({ meta: { id: '' }, carry: { id: 'tracy-business' } }), 'tracy-business')
  assert.equal(inspirationOf({ meta: { id: '   ' }, carry: { id: 'tracy-business' } }), 'tracy-business')
  assert.equal(inspirationOf({ meta: { id: 42 }, carry: { id: 'tracy-business' } }), 'tracy-business')
  // And it is trimmed, because it is compared against ids the card list spells exactly.
  assert.equal(inspirationOf({ meta: { id: '  tracy-base  ' } }), 'tracy-base')
})

/** Nothing names one: null, so the tab takes its no-inspiration road rather than fetching for ''. */
test('nothing anywhere is null, not an empty string', () => {
  assert.equal(inspirationOf(), null)
  assert.equal(inspirationOf({}), null)
  assert.equal(inspirationOf({ job: null, meta: null, ask: null, carry: null }), null)
  assert.equal(inspirationOf({ meta: {}, carry: {} }), null)
})
