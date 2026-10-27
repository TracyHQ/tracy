import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pinSession, getPinnedAccountRef, pruneSessionPins } from '../lib/session-pin.js'

// Test helper: prune with Infinity clears all entries
function clearSessionPins() {
  pruneSessionPins(Infinity)
}

test('pin then read returns the bound account', () => {
  clearSessionPins()
  pinSession('s1', 'REF_A')
  assert.equal(getPinnedAccountRef('s1'), 'REF_A')
})

test('unknown and empty session ids return null', () => {
  clearSessionPins()
  assert.equal(getPinnedAccountRef('missing'), null)
  assert.equal(getPinnedAccountRef(''), null)
  assert.equal(getPinnedAccountRef(undefined), null)
  assert.equal(getPinnedAccountRef(null), null)
})

test('pinning without session or account is a no-op', () => {
  clearSessionPins()
  pinSession('', 'REF_A')
  pinSession('s2', '')
  pinSession(undefined, undefined)
  assert.equal(getPinnedAccountRef('s2'), null)
  assert.equal(getPinnedAccountRef(''), null)
})

test('expired pins are dropped on read', async () => {
  clearSessionPins()
  pinSession('s3', 'REF_B', 1)
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(getPinnedAccountRef('s3'), null)
  assert.equal(getPinnedAccountRef('s3'), null)
})

test('a later pin replaces the earlier one', () => {
  clearSessionPins()
  pinSession('s4', 'REF_OLD')
  pinSession('s4', 'REF_NEW')
  assert.equal(getPinnedAccountRef('s4'), 'REF_NEW')
})

test('pins expire and are pruned', () => {
  clearSessionPins()
  pinSession('s5', 'REF_C', -1)
  pinSession('s6', 'REF_D', 100000)
  pruneSessionPins()
  assert.equal(getPinnedAccountRef('s5'), null)
  assert.equal(getPinnedAccountRef('s6'), 'REF_D')
  clearSessionPins()
  assert.equal(getPinnedAccountRef('s6'), null)
})

test('pruneSessionPins purges expired entries without reading them', async () => {
  clearSessionPins()
  pinSession('s-exp', 'REF_EXP', 1)
  await new Promise((r) => setTimeout(r, 5))
  pruneSessionPins()
  assert.equal(getPinnedAccountRef('s-exp'), null)
})
