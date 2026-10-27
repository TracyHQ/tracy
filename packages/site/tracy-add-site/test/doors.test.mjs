#!/usr/bin/env node
/**
 * Two doors to one Joomla API.
 *
 * The extension answers `option=com_claudecowork&task=api.exec` twice: on the site client and on
 * the administrator client (the system plugin answers before routing on both). A site whose front
 * end is gated — coming soon, offline, maintenance — still opens the back door, so the host tries
 * the doors in order and keeps the first that answers like the engine. Pinned here: the order, the
 * exact URLs, and what counts as an engine answer versus a gate's HTML dressed as 200.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apiDoors, engineReply, isEngineAnswer } from '../src/host/doors.mjs'

test('the front door comes first, the administrator door second', () => {
  assert.deepEqual(apiDoors('https://example.com'), [
    'https://example.com/index.php?option=com_claudecowork&task=api.exec&format=json',
    'https://example.com/administrator/index.php?option=com_claudecowork&task=api.exec&format=json'
  ])
})

test('a webroot under a subpath keeps the subpath on both doors', () => {
  assert.deepEqual(apiDoors('https://homeof.example.org/office'), [
    'https://homeof.example.org/office/index.php?option=com_claudecowork&task=api.exec&format=json',
    'https://homeof.example.org/office/administrator/index.php?option=com_claudecowork&task=api.exec&format=json'
  ])
})

test('a trailing slash on the webroot does not double up', () => {
  assert.equal(
    apiDoors('https://example.com/')[0],
    'https://example.com/index.php?option=com_claudecowork&task=api.exec&format=json'
  )
})

test('an engine answer is an object with a boolean ok — refusals included', () => {
  assert.equal(isEngineAnswer({ ok: true, info: {} }), true)
  assert.equal(isEngineAnswer({ ok: false, error: 'unauthorized' }), true)
})

test('anything else is not the engine: HTML parsed to nothing, arrays, null, a bare string', () => {
  assert.equal(isEngineAnswer(null), false)
  assert.equal(isEngineAnswer(undefined), false)
  assert.equal(isEngineAnswer('<!DOCTYPE html>'), false)
  assert.equal(isEngineAnswer([]), false)
  assert.equal(isEngineAnswer({ error: true, code: 403 }), false)
})

// ── What a reply body is, before anyone calls `.json()` on it ────────────────────────────────
//
// `callPlugin` used to call `response.json()` on whatever came back. A parked domain answered the
// component URL with 405 and an empty body, `JSON.parse('')` threw, and the wizard said "Something
// went wrong" with no cause anywhere (joomlar.com, 2026-09-06). The body is read as text first and
// judged by shape; only an engine answer goes on.

test('an engine reply parses to the object the engine sent', () => {
  assert.deepEqual(engineReply('{"ok":true,"tables":["a"]}'), {
    ok: true,
    tables: ['a']
  })
  assert.deepEqual(engineReply('{"ok":false,"error":"unauthorized"}'), {
    ok: false,
    error: 'unauthorized'
  })
})

test('an empty body is not an engine reply', () => {
  assert.equal(engineReply(''), null)
})

test('a page of HTML is not an engine reply', () => {
  assert.equal(engineReply('<!DOCTYPE html><html><body>Coming soon</body></html>'), null)
})

test("Joomla's own JSON error for a guest is not an engine reply", () => {
  assert.equal(engineReply('{"error":true,"code":403,"message":"Forbidden"}'), null)
})
