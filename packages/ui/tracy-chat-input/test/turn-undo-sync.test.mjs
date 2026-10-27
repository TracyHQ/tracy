/**
 * The chat follows an undo pressed at another door (toolbar contract §3, `turn-undo-sync.mjs`): the
 * page's turns book reads that chat again, never for another site, never while its own undo runs,
 * and never says the event back.
 *
 *   node --test packages/ui/tracy-chat-input/test/turn-undo-sync.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TURN_UNDONE_EVENT } from '@tracy/core/turn-undo'
import { followTurnUndone } from '../src/client/turn-undo-sync.mjs'

function fakeBook(entries) {
  const refreshed = []
  return {
    refreshed,
    get: (siteKey, sessionId) => entries[`${siteKey}|${sessionId}`],
    refresh: async (siteKey, sessionId) => void refreshed.push([siteKey, sessionId])
  }
}
const say = (target, detail) => target.dispatchEvent(new CustomEvent(TURN_UNDONE_EVENT, { detail }))

test('an undo of a chat this page read: that chat reads again; others and other sites do not', () => {
  const target = new EventTarget()
  const book = fakeBook({ 'demo.tracy.site|s1': { undoing: false }, 'demo.tracy.site|s2': { undoing: true } })
  const heard = []
  target.addEventListener(TURN_UNDONE_EVENT, (e) => heard.push(e.detail))
  const stop = followTurnUndone({ book, siteKey: 'demo.tracy.site', target })
  say(target, { sessionId: 's1', siteKey: 'demo.tracy.site', turnIds: ['s1:2'] })
  say(target, { sessionId: 's1', siteKey: 'other.tracy.site', turnIds: [] })
  // This page's own undo of s2 is running: its press reads again when it answers.
  say(target, { sessionId: 's2', siteKey: 'demo.tracy.site', turnIds: [] })
  // A chat never read here has no card to redraw.
  say(target, { sessionId: 's3', siteKey: 'demo.tracy.site', turnIds: [] })
  say(target, { nonsense: true })
  assert.deepEqual(book.refreshed, [['demo.tracy.site', 's1']])
  assert.equal(heard.length, 5, 'nothing said back')
  stop()
  say(target, { sessionId: 's1', siteKey: 'demo.tracy.site', turnIds: [] })
  assert.equal(book.refreshed.length, 1)
})

test('the creation workspace (no site) follows nothing', () => {
  const target = new EventTarget()
  const book = fakeBook({ 'x|s1': { undoing: false } })
  followTurnUndone({ book, siteKey: null, target })
  say(target, { sessionId: 's1', siteKey: 'x', turnIds: [] })
  assert.deepEqual(book.refreshed, [])
})
