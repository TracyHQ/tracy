/**
 * "Open comment" lands on the thread — `src/client/comment-reveal.mjs` (W-F2, W-F3).
 *
 *   node --test packages/site/tracy-site-tabs/test/comment-reveal.test.mjs
 *
 * Quiet failures guarded here: the reveal asked before the comments overlay has listed anything (it
 * was a one-shot, W-F2), asked of a tab behind another conversation, asked while the page is still
 * loading (a reveal on another page navigates, and asking again restarts that load), asked behind
 * the boot cover, and asked forever.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  COMMENT_ACT_EVENT,
  COMMENT_LIST_EVENT,
  COMMENT_OPEN_EVENT,
  MAX_REVEALS,
  OTHER_PAGE_GRACE_MS,
  readCommentOpen,
  readCommentParam,
  REVEAL_DEADLINE_MS,
  REVEAL_TICK_MS,
  revealComment,
  stripCommentParam
} from '../src/client/comment-reveal.mjs'

const ID = '6f1c2a3b-0000-4000-8000-00000000c0de'
const PAGE = 'http://demo.localhost:8080/menu/?lang=vi'

/** A fake window with a clock: list events in, acts out. */
function harness({ main = 's-main', covered = false } = {}) {
  const listeners = new Map()
  const acts = []
  let now = 0
  let tick = null
  const state = { main, covered, outcome: null, opened: [] }
  const target = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    dispatchEvent: (event) => {
      if (event.type === COMMENT_ACT_EVENT) acts.push(event.detail)
      return true
    }
  }
  const stop = revealComment(ID, {
    target,
    event: (type, detail) => ({ type, detail }),
    mainSession: () => state.main,
    covered: () => state.covered,
    now: () => now,
    every: (fn) => {
      tick = fn
      return () => {
        tick = null
      }
    },
    done: (outcome) => {
      state.outcome = outcome
    },
    openComments: (sessionId) => state.opened.push(sessionId)
  })
  return {
    state,
    acts,
    stop,
    reveals: () => acts.filter((a) => a.kind === 'reveal'),
    list: (detail) => listeners.get(COMMENT_LIST_EVENT)?.({ detail }),
    advance: (ms) => {
      for (let t = 0; t < ms; t += REVEAL_TICK_MS) {
        now += REVEAL_TICK_MS
        tick?.()
      }
    },
    listening: () => listeners.has(COMMENT_LIST_EVENT)
  }
}

const listed = (over = {}) => ({
  sessionId: 's-main',
  tabId: 'tab2',
  active: true,
  url: PAGE,
  thread: null,
  comments: [{ id: ID, url: PAGE }],
  ...over
})

test('the address: comment= read once, validated, and taken off with everything else kept', () => {
  assert.equal(readCommentParam(`?open=browser&comment=${ID}`), ID)
  assert.equal(readCommentParam('?comment=a"b'), null)
  assert.equal(readCommentParam('?open=browser'), null)
  assert.equal(stripCommentParam(`?a=1&comment=${ID}&b=2`), '?a=1&b=2')
  assert.equal(stripCommentParam(`?comment=${ID}`), '')
})

test('nothing is asked until the tab on screen has listed the comment; then one reveal, to that tab', () => {
  const h = harness()
  h.advance(3 * REVEAL_TICK_MS)
  assert.equal(h.reveals().length, 0, 'no reveal before any list')
  // Every tick asks the tabs of the conversation on screen for their list.
  assert.ok(h.acts.some((a) => a.kind === 'list' && a.tabId === '' && a.sessionId === 's-main'))
  // A list before the server's comments arrived: still waiting.
  h.list(listed({ comments: [] }))
  assert.equal(h.reveals().length, 0)
  h.list(listed())
  assert.deepEqual(h.reveals(), [{ tabId: 'tab2', sessionId: 's-main', kind: 'reveal', ids: [ID] }])
  // The thread opened: done, and the listener is gone.
  h.list(listed({ thread: ID }))
  assert.equal(h.state.outcome, 'shown')
  assert.equal(h.listening(), false)
  // ACC-41 (dev, 03/10): the thread card alone left the chat column on its start screen. The
  // Comments view of the conversation on screen opens with it, once, as the toolbar's Comments does.
  assert.deepEqual(h.state.opened, ['s-main'])
  h.list(listed({ thread: ID }))
  assert.deepEqual(h.state.opened, ['s-main'], 'once')
})

test('a reveal that never takes opens no Comments view', () => {
  const h = harness()
  h.list(listed())
  h.advance(REVEAL_DEADLINE_MS + REVEAL_TICK_MS)
  assert.equal(h.state.outcome, 'timeout')
  assert.deepEqual(h.state.opened, [])
})

test('a tab behind another conversation, or not on screen, is never asked', () => {
  const h = harness()
  h.list(listed({ sessionId: 's-other' }))
  h.list(listed({ active: false }))
  h.advance(2 * REVEAL_TICK_MS)
  assert.equal(h.reveals().length, 0)
})

test('the tab still loading the link’s page: no reveal (it would navigate on top of the load) until it stays elsewhere', () => {
  const h = harness()
  h.list(listed({ url: 'http://demo.localhost:8080/' }))
  h.advance(OTHER_PAGE_GRACE_MS - REVEAL_TICK_MS)
  assert.equal(h.reveals().length, 0, 'within the grace, the load is left alone')
  h.advance(2 * REVEAL_TICK_MS)
  assert.equal(h.reveals().length, 1, 'a tab that stays elsewhere is asked once to go there itself')
  h.advance(5 * REVEAL_TICK_MS)
  assert.equal(h.reveals().length, 1, 'and not again while it is still elsewhere')
  h.list(listed())
  assert.equal(h.reveals().length, 2, 'on its page with no thread open: asked again at once')
})

test('the boot cover: no reveal behind it; asked once it lifts', () => {
  const h = harness({ covered: true })
  h.list(listed())
  h.advance(3 * REVEAL_TICK_MS)
  assert.equal(h.reveals().length, 0)
  h.state.covered = false
  h.advance(REVEAL_TICK_MS)
  assert.equal(h.reveals().length, 1)
})

test('a reply: done when its ROOT’s thread is the open one', () => {
  const h = harness()
  h.list(
    listed({
      comments: [
        { id: 'root-1', url: PAGE },
        { id: ID, url: PAGE, replyTo: 'root-1' }
      ]
    })
  )
  assert.equal(h.reveals()[0].ids[0], ID)
  h.list(
    listed({
      thread: 'root-1',
      comments: [
        { id: 'root-1', url: PAGE },
        { id: ID, url: PAGE, replyTo: 'root-1' }
      ]
    })
  )
  assert.equal(h.state.outcome, 'shown')
})

test('bounded: a reveal that never takes stops after MAX_REVEALS; a comment never listed stops at the deadline', () => {
  const h = harness()
  h.list(listed())
  h.advance(20 * REVEAL_TICK_MS)
  assert.equal(h.reveals().length, MAX_REVEALS)
  assert.equal(h.state.outcome, 'timeout')
  const gone = harness()
  gone.list(listed({ comments: [{ id: 'another', url: PAGE }] }))
  gone.advance(REVEAL_DEADLINE_MS + REVEAL_TICK_MS)
  assert.equal(gone.reveals().length, 0)
  assert.equal(gone.state.outcome, 'timeout')
  assert.equal(gone.listening(), false)
})

test('stop(): a newer open cancels the wait', () => {
  const h = harness()
  h.stop()
  h.list(listed())
  assert.equal(h.reveals().length, 0)
})

test("the Comments list's open request (no Browser tab): read only when it names a comment and a page", () => {
  assert.equal(COMMENT_OPEN_EVENT, 'tracy:comment-open')
  const url = 'http://scv2jo.scv2.tracy.test:34080/en/'
  assert.deepEqual(readCommentOpen({ id: 'srv-6', url }), { id: 'srv-6', url })
  assert.equal(readCommentOpen({ id: 'srv-6', url: '' }), null)
  assert.equal(readCommentOpen({ id: 'bad id', url }), null)
  assert.equal(readCommentOpen({ url }), null)
  assert.equal(readCommentOpen(null), null)
  assert.equal(readCommentOpen('srv-6'), null)
})

test('the open request takes the road "Open comment" takes', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  const listen = source.indexOf('window.addEventListener(COMMENT_OPEN_EVENT, onOpen)')
  assert.ok(listen !== -1)
  const handler = source.slice(source.lastIndexOf('const onOpen = (event: Event): void => {', listen), listen)
  assert.match(handler, /readCommentOpen\(/)
  assert.match(handler, /openComment\(asked\)/)
})
