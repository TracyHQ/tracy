#!/usr/bin/env node
/**
 * A site's workspace starts on a preset for THAT site's CMS.
 *
 * The bundle default is `designer-wordpress`, and nothing re-picked it per site: measured 14/09,
 * an imported Joomla site (`fijitrips.example`, `platform=joomla`) opened its workspace on
 * "Designer · WordPress", so the agent carried WordPress tools and skills into a Joomla webroot.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { presetForSite, shouldFollowSite, siteKeyFrom } from '../src/client/site-platform.mjs'

const ROSTER = ['designer-wordpress', 'designer-joomla', 'writer-wordpress', 'writer-joomla']

test('a Joomla site on the WordPress default moves to the same role on Joomla', () => {
  assert.equal(presetForSite('designer-wordpress', 'joomla', ROSTER), 'designer-joomla')
  assert.equal(presetForSite('writer-wordpress', 'joomla', ROSTER), 'writer-joomla')
})

test('already on the site platform: nothing to change', () => {
  assert.equal(presetForSite('designer-joomla', 'joomla', ROSTER), null)
})

test('an unknown or missing platform changes nothing', () => {
  assert.equal(presetForSite('designer-wordpress', null, ROSTER), null)
  assert.equal(presetForSite('designer-wordpress', 'shopify', ROSTER), null)
})

test('a target the roster does not carry is never picked', () => {
  assert.equal(presetForSite('designer-wordpress', 'emdash', ROSTER), null)
})

test("a preset outside Tracy's twelve starts from the default role", () => {
  assert.equal(presetForSite('standard', 'joomla', ROSTER), 'designer-joomla')
})

test('the site is named by the path first, the pointer cookie second', () => {
  assert.equal(siteKeyFrom('/fijitrips.example/s/session-1', ''), 'fijitrips.example')
  assert.equal(siteKeyFrom('/s/session-1', 'a=1; tracy_site=lantern.tracy.test'), 'lantern.tracy.test')
  assert.equal(siteKeyFrom('/new/s/session-1', ''), null)
})

test('the creation workspace names no site, even with a stale pointer', () => {
  assert.equal(siteKeyFrom('/new/', 'tracy_site=lantern.tracy.test', '/new/'), null)
})

/**
 * 🔒 THE SECOND HALF OF THE SAME BUG, measured 19/09/2026 — it survived the 14/09 fix because that fix
 * fixed exactly the part under test. `presetForSite` always answered right; what broke is that the call
 * to it RAN ONLY ONCE per page, while a page can open many chats. The second chat on the same site
 * started on the bundle default and kept it, no error, no log.
 */
const followState = ({ followed = [], ...over } = {}) => ({
  followed: new Set(followed),
  sessionId: 'session-1',
  picked: false,
  locked: false,
  ...over
})

test('a second chat opened on the same site is followed too — the flag is per session', () => {
  // Session 1 opens and is followed.
  assert.equal(shouldFollowSite(followState({ followed: [], sessionId: 'session-1' })), true)
  // Same session asked again: no follow — once per session.
  assert.equal(shouldFollowSite(followState({ followed: ['session-1'], sessionId: 'session-1' })), false)
  // 🔒 SESSION 2 OPENS IN THE SAME PAGE. This is exactly `6b59999b0b1b`: before the 19/09 fix this returned
  // false, and its 19-step · 127.3 s turn ran WordPress tools on a Joomla webroot.
  assert.equal(shouldFollowSite(followState({ followed: ['session-1'], sessionId: 'session-2' })), true)
})

test('a person who picked a preset is never overridden, and a session mid-work is left alone', () => {
  assert.equal(shouldFollowSite(followState({ picked: true })), false)
  // dsh refuses to change the preset of a session that has run a turn — following it only makes an error.
  assert.equal(shouldFollowSite(followState({ locked: true })), false)
})

test('the follow done before any session exists does not count for the session born next', () => {
  // `null` is an identity, not "unknown": a page loaded with no session yet still follows
  // (so the hero chip shows the right platform), then the first session born MUST be followed again.
  // Page loaded with no session yet: empty set → follow (the hero chip must show the right platform).
  assert.equal(shouldFollowSite(followState({ followed: [], sessionId: null })), true)
  // Followed in the no-session state; the first session born MUST be followed again.
  assert.equal(shouldFollowSite(followState({ followed: [null], sessionId: 'session-1' })), true)
  // And no second follow for that same no-session state.
  assert.equal(shouldFollowSite(followState({ followed: [null], sessionId: null })), false)
  // 🔒 AND FLIPPING BACK AND FORTH MAKES NO NEW FOLLOW — this is the 7-switches bug measured on `979571fd`:
  // the page jumps `null` ↔ `'session-1'` every time `sessions.list` changes, and a set remembers both.
  assert.equal(shouldFollowSite(followState({ followed: [null, 'session-1'], sessionId: null })), false)
  assert.equal(
    shouldFollowSite(followState({ followed: [null, 'session-1'], sessionId: 'session-1' })),
    false
  )
})
