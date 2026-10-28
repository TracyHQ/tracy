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

import { afterPhpNotices, answerKind, apiDoors, engineReply, isEngineAnswer } from '../src/host/doors.mjs'

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

// PHP's notices in front of the engine's JSON (beta report, 27/10/2026: PHP 8.5, display_errors on).

test('the engine reply after PHP notices is the engine reply; HTML or plain notices, one or several', () => {
  const html =
    '<br />\n<b>Deprecated</b>:  Function curl_close() is deprecated since 8.5, as it has no effect since PHP 8.0 in <b>/home/u1/Uploader.php</b> on line <b>53</b><br />\n{"ok":true,"part":1}'
  assert.deepEqual(engineReply(html), { ok: true, part: 1 })
  const plain =
    '\nDeprecated: Function curl_close() is deprecated in /x/Uploader.php on line 53\nPHP Warning:  Undefined array key "a" in /x/Engine.php on line 9\n{"ok":false,"error":"read_failed"}'
  assert.deepEqual(engineReply(plain), { ok: false, error: 'read_failed' })
})

test('only PHP notice lines are taken off, and what remains must be the engine', () => {
  assert.equal(engineReply('<b>Fatal error</b>: Allowed memory size exhausted in /x.php on line 3\n{"ok":true}'), null)
  assert.equal(engineReply('Please wait on line 3\n{"ok":true}'), null)
  assert.equal(
    engineReply('<br />\n<b>Deprecated</b>:  x in <b>/a.php</b> on line <b>1</b><br />\n<html>Coming soon</html>'),
    null
  )
  assert.equal(engineReply('Deprecated: x in /a.php on line 1\n{"error":true,"code":403}'), null)
  assert.equal(afterPhpNotices('{"ok":true}'), null)
})

test('what came back instead of the engine is named by kind, never by its text', () => {
  assert.equal(answerKind(''), 'empty')
  assert.equal(answerKind('<br />\n<b>Fatal error</b>: Allowed memory size of 134217728 bytes exhausted'), 'php_fatal')
  assert.equal(answerKind('<br />\n<b>Warning</b>:  x in <b>/a.php</b> on line <b>2</b><br />\n<html></html>'), 'php_notice')
  assert.equal(answerKind('<!DOCTYPE html><html></html>'), 'html')
  assert.equal(answerKind('{"error":true,"code":403}'), 'json')
  assert.equal(answerKind('0'), 'json')
  assert.equal(answerKind('Service unavailable'), 'text')
})

