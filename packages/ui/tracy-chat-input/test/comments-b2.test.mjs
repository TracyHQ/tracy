/**
 * `tracy:comments-open` — the Browser toolbar's "Comments N" button (rule 8 of the story file: one
 * button, no menu): the view is wanted and activated (a blank session stops being blank) and its tab is
 * selected through dsh's own tab button (`comments-open.mjs`); the Browser tab has already left
 * fullscreen (fork). The Comments tab's own drawing is held by `comments-people-render.test.mjs`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { OPEN_EVENT, openCommentsView, readOpenDetail } from '../src/client/comments-open.mjs'

// ── Opening the tab from the Browser toolbar ─────────────────────────────────────────────────

test("the event name is the fork's COMMENTS_OPEN_EVENT", () => {
  assert.equal(OPEN_EVENT, 'tracy:comments-open')
})

test('readOpenDetail: a session id is required; anything else is no request', () => {
  assert.deepEqual(readOpenDetail({ sessionId: 's1', tabId: 'native-7' }), { sessionId: 's1' })
  for (const bad of [null, undefined, 'x', {}, { sessionId: '' }, { sessionId: 3 }])
    assert.equal(readOpenDetail(bad), null)
})

/** Fakes for the four things `openCommentsView` does, in the order it does them. */
function harness({ tabAfter = 0, selected = false, activateThrows = false } = {}) {
  const calls = []
  const frames = []
  let seen = 0
  const tab = {
    getAttribute: (name) => (name === 'aria-selected' ? String(selected) : null),
    click: () => calls.push('click')
  }
  const deps = {
    want: () => calls.push('want'),
    activate: (sessionId) => {
      calls.push(`activate:${sessionId}`)
      if (activateThrows) throw new Error('no binding')
    },
    findTab: () => (seen++ >= tabAfter ? tab : null),
    frame: (fn) => frames.push(fn)
  }
  const runFrames = (max = 100) => {
    for (let i = 0; i < max && frames.length > 0; i += 1) frames.shift()()
  }
  return { calls, frames, deps, runFrames }
}

test('open: the view is wanted and activated, then its tab is clicked', () => {
  const h = harness()
  openCommentsView({ sessionId: 's1' }, h.deps)
  assert.deepEqual(h.calls, ['want', 'activate:s1', 'click'])
})

test('open: a tab strip that renders a few frames later is waited for', () => {
  const h = harness({ tabAfter: 3 })
  openCommentsView({ sessionId: 's1' }, h.deps)
  assert.deepEqual(h.calls, ['want', 'activate:s1'])
  h.runFrames()
  assert.deepEqual(h.calls, ['want', 'activate:s1', 'click'])
})

test('open: a tab already selected is not clicked again; a strip that never comes is given up', () => {
  const on = harness({ selected: true })
  openCommentsView({ sessionId: 's1' }, on.deps)
  assert.deepEqual(on.calls, ['want', 'activate:s1'])
  const never = harness({ tabAfter: Number.POSITIVE_INFINITY })
  openCommentsView({ sessionId: 's1' }, never.deps)
  never.runFrames(1_000)
  assert.equal(never.frames.length, 0, 'it stops asking for frames')
  assert.ok(!never.calls.includes('click'))
})

test('open: a session this page holds no binding for still tries the tab', () => {
  const h = harness({ activateThrows: true })
  assert.doesNotThrow(() => openCommentsView({ sessionId: 'gone' }, h.deps))
  assert.deepEqual(h.calls, ['want', 'activate:gone', 'click'])
})
