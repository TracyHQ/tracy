import assert from 'node:assert/strict'
import { test } from 'node:test'
import { engineReply, pageKind } from '../src/host/doors.mjs'

test('WordPress login HTML is recognized before and after an engine reply', () => {
  assert.equal(pageKind('<form id="loginform"><input name="log"><input name="pwd"></form>'), 'login_form')
  assert.equal(pageKind('<html><h1>Security check</h1></html>'), 'challenge')
})

test('only complete PHP notice lines may surround a complete engine reply', () => {
  const reply = { ok: true, done: false, sql_b64: 'YTs=' }
  const notice = 'PHP Warning: test in /example.php on line 9'
  assert.deepEqual(engineReply(`${notice}\n${JSON.stringify(reply)}\n${notice}\n`), reply)
  assert.equal(engineReply(`${JSON.stringify(reply)}\n<html>blocked</html>`), null)
  assert.equal(engineReply(`{"ok":true\n${notice}`), null)
})
