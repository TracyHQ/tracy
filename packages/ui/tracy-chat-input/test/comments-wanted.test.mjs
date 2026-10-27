/**
 * Start screen Case 2 (Akemi 01/10/2026): a session with no message shows the start screen whether
 * or not the site has comments. The Comments view counts as activity only while the person asked for
 * it (`comments.wanted`), and leaving the view clears the ask (`forgetWhenLeft`).
 *
 * The bug this guards (reproduced on the local stand 01/10): one comment in the Browser tab's list,
 * resolved or open, flipped a blank session from the start screen to an empty chat column with a
 * header and a Chat / Comments strip, because the view's definition answered "active" whenever the
 * list held a comment.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { forgetWhenLeft } from '../src/client/comments-wanted.mjs'
import { commentsViewDefinition } from '../src/client/comment-view.mjs'

/** The same observable cell `CommentsView.tsx` keeps its state in. */
function cell(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return
      value = next
      for (const fn of listeners) fn()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

test('the view definition follows the ask only: comments in the list do not make a blank session active', () => {
  const wanted = cell(false)
  const definition = commentsViewDefinition('tracy-comments', () => wanted.get())
  // What index.tsx registers: the list may hold any number of comments, the answer is the ask.
  assert.equal(definition.isActive(null), false)
  wanted.set(true)
  assert.equal(definition.isActive(null), true)
})

test('leaving the view clears the ask, so a blank session gets its start screen back', () => {
  const open = cell(new Set())
  const wanted = cell(false)
  const stop = forgetWhenLeft(open, wanted)
  wanted.set(true) // the Comments start card, or the Browser toolbar's Comments button
  assert.equal(wanted.get(), true, 'the wait between the press and the view mounting keeps the ask')
  open.set(new Set(['s-1'])) // the view mounted in session s-1
  assert.equal(wanted.get(), true)
  open.set(new Set()) // back to Chat, or to another conversation
  assert.equal(wanted.get(), false)
  stop()
})

test('one session leaving while another still shows the view keeps the ask', () => {
  const open = cell(new Set(['s-1', 's-2']))
  const wanted = cell(true)
  const stop = forgetWhenLeft(open, wanted)
  open.set(new Set(['s-2']))
  assert.equal(wanted.get(), true)
  stop()
  open.set(new Set())
  assert.equal(wanted.get(), true, 'a stopped watcher changes nothing')
})
