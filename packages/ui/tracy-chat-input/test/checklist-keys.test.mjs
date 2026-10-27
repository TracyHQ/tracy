/**
 * The "Send N" checklist's keys (Brian's no-extra-hotkeys rule): Enter sends the ticked comments while
 * the checklist is open — also from a focused checkbox (Space still toggles it, the browser's own) —
 * and Esc closes it; since round 5 ⌘/Ctrl+Enter send too. Enter on a focused button is that button's own (Cancel).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checklistKey } from '../src/client/comment-view.mjs'

const key = (k, extra = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  onButton: false,
  ...extra
})

test('Enter sends, from the checklist or a focused checkbox; Esc closes', () => {
  assert.equal(checklistKey(key('Enter')), 'send')
  assert.equal(checklistKey(key('Escape')), 'close')
})

// Round 5 (acceptance INPUT-new-4): ⌘/Ctrl+Enter send here as in every other box — `comments-r5.test.mjs`.
test('no Shift/Alt+Enter binding, no send while composing, and Enter on a button is the button’s', () => {
  for (const mod of ['shiftKey', 'altKey'])
    assert.equal(checklistKey(key('Enter', { [mod]: true })), null, mod)
  assert.equal(checklistKey(key('Enter', { isComposing: true })), null)
  assert.equal(checklistKey(key('Enter', { onButton: true })), null)
  assert.equal(checklistKey(key(' ')), null, 'Space is the checkbox’s own toggle')
})
