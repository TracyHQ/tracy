/**
 * A Comments row pressed while no Browser tab holds its comment (Brian 03/10/2026): a row the server
 * read names no tab, so its press asks `tracy-site-tabs` to open one (`tracy:comment-open`) instead of
 * sending a `reveal` nobody hears.
 *
 *   node --test packages/ui/tracy-chat-input/test/comment-open.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { COMMENT_OPEN_EVENT as SITE_TABS_OPEN_EVENT } from '../../../site/tracy-site-tabs/src/client/comment-reveal.mjs'
import { COMMENT_OPEN_EVENT, revealOf } from '../src/client/comment-open.mjs'

const URL_EN = 'http://scv2jo.scv2.tracy.test:34080/en/'

test('a row a Browser tab listed asks that tab to reveal it', () => {
  assert.deepEqual(revealOf({ id: 'c1', tabId: 't1', sessionId: 's1', url: URL_EN }), {
    type: 'act',
    detail: { tabId: 't1', sessionId: 's1', kind: 'reveal', ids: ['c1'] }
  })
})

test('a row the server read (no tab) asks for a Browser tab on its page', () => {
  assert.deepEqual(revealOf({ id: 'c1', tabId: '', sessionId: '', url: URL_EN }), {
    type: 'open',
    detail: { id: 'c1', url: URL_EN }
  })
})

test('a tabless row with no page, or a deleted one, has nothing to open', () => {
  assert.equal(revealOf({ id: 'c1', tabId: '', sessionId: '', url: '' }), null)
  assert.equal(revealOf({ id: 'c1', tabId: '', sessionId: '' }), null)
  assert.equal(revealOf({ id: 'c1', tabId: '', sessionId: '', url: URL_EN, deleted: true }), null)
})

test('a tabless row is pressable: CommentItem asks revealOf, not the tab, whether a press opens it', () => {
  const item = readFileSync(new URL('../src/client/CommentItem.tsx', import.meta.url), 'utf8')
  assert.match(item, /const openable = revealOf\(row\) !== null/)
  assert.match(item, /const still = frozen \|\| !openable/)
  // Corner and menu still need a tab to act through.
  assert.match(item, /\{live && !frozen && \(/)
  assert.match(item, /menuOpen && live && !frozen/)
})

test('the event is the one tracy-site-tabs listens for', () => {
  assert.equal(COMMENT_OPEN_EVENT, SITE_TABS_OPEN_EVENT)
})

test('the row press goes through revealOf', () => {
  const view = readFileSync(new URL('../src/client/CommentsView.tsx', import.meta.url), 'utf8')
  const open = view.indexOf('open: (r) => {')
  assert.ok(open !== -1)
  const body = view.slice(open, view.indexOf('resolve: (r) =>', open))
  assert.match(body, /revealOf\(r\)/)
  assert.match(body, /COMMENT_OPEN_EVENT/)
  assert.doesNotMatch(body, /kind: 'reveal'/)
})
