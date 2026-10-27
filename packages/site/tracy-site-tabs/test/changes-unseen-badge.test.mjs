/**
 * The count on the Site changes tab (`changes-unseen-badge.mjs`): kept from the chat column's word,
 * asked once on start, and the fork told (`invalidateTabBadges`) so every chip re-reads `badge`.
 *
 *   node --test packages/site/tracy-site-tabs/test/changes-unseen-badge.test.mjs
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import {
  resetUnseenCounts,
  UNSEEN_EVENT,
  UNSEEN_STATE_EVENT,
  unseenBadgeOf,
  unseenCountFor,
  watchChangesUnseen
} from '../src/client/changes-unseen-badge.mjs'

const SITE = 'badgewp.badge.tracy.test'

/** A side card that counts how often it was told the badges moved. */
function fakeSidebar() {
  const sidebar = { told: 0, invalidateTabBadges: () => void (sidebar.told += 1) }
  return sidebar
}

beforeEach(resetUnseenCounts)

test('nothing kept: no count, no badge', () => {
  assert.equal(unseenCountFor(SITE), null)
  assert.equal(unseenBadgeOf(SITE), null)
  assert.equal(unseenBadgeOf(null), null)
})

test('the chat column’s word is kept for its site and the fork is told; another site is ignored', () => {
  const target = new EventTarget()
  const sidebar = fakeSidebar()
  const stop = watchChangesUnseen({ target, siteKey: SITE, sidebar })
  target.dispatchEvent(new CustomEvent(UNSEEN_EVENT, { detail: { siteKey: SITE, count: 3 } }))
  assert.equal(unseenCountFor(SITE), 3)
  assert.equal(unseenBadgeOf(SITE), 3)
  assert.equal(sidebar.told, 1, 'a new number: the fork is told once')
  target.dispatchEvent(new CustomEvent(UNSEEN_EVENT, { detail: { siteKey: 'other.test', count: 9 } }))
  assert.equal(unseenCountFor(SITE), 3)
  assert.equal(unseenCountFor('other.test'), null)
  assert.equal(sidebar.told, 1, 'another site’s word is not this site’s change')
  // 0 and null draw nothing; the same number again is not a second word to the fork.
  target.dispatchEvent(new CustomEvent(UNSEEN_EVENT, { detail: { siteKey: SITE, count: 0 } }))
  target.dispatchEvent(new CustomEvent(UNSEEN_EVENT, { detail: { siteKey: SITE, count: 0 } }))
  assert.equal(unseenBadgeOf(SITE), null)
  assert.equal(sidebar.told, 2)
  stop()
  target.dispatchEvent(new CustomEvent(UNSEEN_EVENT, { detail: { siteKey: SITE, count: 7 } }))
  assert.equal(unseenCountFor(SITE), 0, 'stopped: the word is no longer kept')
})

test('on start it asks the chat column once and keeps what it answered in place', () => {
  const target = new EventTarget()
  target.addEventListener(UNSEEN_STATE_EVENT, (e) => {
    if (e.detail.siteKey === SITE) e.detail.count = 5
  })
  const sidebar = fakeSidebar()
  const stop = watchChangesUnseen({ target, siteKey: SITE, sidebar })
  assert.equal(unseenBadgeOf(SITE), 5)
  assert.equal(sidebar.told, 1)
  stop()
})

test('a side card without invalidateTabBadges still keeps the number (an older fork draws no badge)', () => {
  const target = new EventTarget()
  const stop = watchChangesUnseen({ target, siteKey: SITE, sidebar: {} })
  target.dispatchEvent(new CustomEvent(UNSEEN_EVENT, { detail: { siteKey: SITE, count: 2 } }))
  assert.equal(unseenBadgeOf(SITE), 2)
  stop()
})
