/**
 * Round 5 of the Comments tab (stage-6 acceptance e2e v3, 30/09 — the owner away, the agent decided):
 *   - TH-4 / TH-10 / TH-6: a root deleted while replies stand under it is a row that reads "Comment
 *     deleted" with its replies' count (the server keeps it as a tombstone, `deletedRoot`; the fork
 *     forwards it as `removed`); two people sharing a display name are told apart on rows as
 *     `Name (e-mail local part)`, the way the turn to Tracy already names them.
 *   - INPUT-new-4: ⌘/Ctrl+Enter in the "Send all" list sends, like every other box and dsh's composer.
 *   - TH-2 / T04: the list root carries the comment door's length limit (`limits.maxChars`, 4,000 when
 *     the list does not say — the server's `MAX_TEXT`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FAILED_EVENT, listenForComments, SEND_EVENT, SENT_EVENT } from '../src/client/comment-send.mjs'
import { buildCommentTurn, parseCommentTurn } from '../src/client/comment-turn.mjs'

import {
  checklistKey,
  createCommentLists,
  DEFAULT_MAX_CHARS,
  viewModel
} from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 8, 30, 4, 0, 0)
const MIN = 60_000
const HOME = 'https://r2e2308.tracy.test/'
const H3 = { url: HOME, selector: 'h3', label: 'Heading', tag: 'h3', text: 'Maintenance & retrofit' }
const A = { accountId: 'a', email: 'e2e3-thread-a@example.test', name: 'Sam Tester', initial: 'S' }
const B = { accountId: 'b', email: 'e2e3-thread-b@example.test', name: 'Sam Tester', initial: 'S' }
const LEE = { accountId: 'l', email: 'lee@example.com', name: 'Lee', initial: 'L' }

const c = (id, extra = {}) => ({
  id,
  url: HOME,
  text: `words of ${id}`,
  createdAt: NOW - 10 * MIN,
  element: H3,
  author: LEE,
  sentToTracy: false,
  ...extra
})
const list = (comments, extra = {}) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'r2e2308',
  host: 'r2e2308.tracy.test',
  active: true,
  url: HOME,
  comments,
  ...extra
})
const storeOf = (...lists) => {
  const store = createCommentLists()
  for (const l of lists) store.accept(l)
  return store
}

// ── TH-4: a deleted root with replies stays a thread ──

test('a root deleted while replies stand under it is a row: "deleted", no words, its replies counted', () => {
  const vm = viewModel(
    storeOf(
      list([
        c('root', { text: '', removed: true, replyCount: 2 }),
        c('r1', { replyTo: 'root', author: B }),
        c('r2', { replyTo: 'root', author: A })
      ])
    ).getSnapshot()
  )
  assert.equal(vm.open.length, 1)
  assert.equal(vm.open[0].id, 'root')
  assert.equal(vm.open[0].deleted, true)
  assert.equal(vm.open[0].text, '')
  assert.equal(vm.open[0].replies, 2)
  assert.equal(vm.badge, 1)
})

test('the server’s own tombstone mark (`deletedRoot`) reads the same; with no reply left, no row', () => {
  const snap = storeOf(
    list([
      c('t1', { text: '', deletedRoot: true, deletedAt: '2026-09-30T03:00:00Z' }),
      c('t1r', { replyTo: 't1' }),
      c('gone', { text: '', removed: true, replyCount: 0 })
    ])
  ).getSnapshot()
  const vm = viewModel(snap)
  assert.deepEqual(
    vm.open.map((r) => [r.id, r.deleted === true]),
    [['t1', true]]
  )
})

test('a comment hidden for Delete all’s Undo window is no "deleted" row, even with replies', () => {
  const store = storeOf(list([c('root', { replyCount: 1 }), c('r1', { replyTo: 'root' })]))
  store.hide(['root'])
  assert.deepEqual(viewModel(store.getSnapshot()).open, [])
})

test('a live comment is never "deleted"', () => {
  const vm = viewModel(storeOf(list([c('x')])).getSnapshot())
  assert.equal(vm.open[0].deleted, undefined)
})

// ── TH-6: two people, one display name ──

test('two people sharing a display name are told apart on rows by their e-mail’s local part; one person is not', () => {
  const vm = viewModel(
    storeOf(
      list([
        c('a1', { author: A, createdAt: NOW - 3 * MIN }),
        c('b1', { author: B, createdAt: NOW - 2 * MIN }),
        c('l1', { author: LEE, createdAt: NOW - MIN }),
        c('l2', { author: LEE, createdAt: NOW })
      ])
    ).getSnapshot()
  )
  const byId = Object.fromEntries(vm.open.map((r) => [r.id, r.author]))
  assert.equal(byId.a1, 'Sam Tester (e2e3-thread-a)')
  assert.equal(byId.b1, 'Sam Tester (e2e3-thread-b)')
  assert.equal(byId.l1, 'Lee')
  assert.equal(byId.l2, 'Lee')
})

test('a reply’s author sharing a row author’s name counts too (they meet in the thread)', () => {
  const vm = viewModel(
    storeOf(list([c('a1', { author: A }), c('b-reply', { author: B, replyTo: 'a1' })])).getSnapshot()
  )
  assert.equal(vm.open[0].author, 'Sam Tester (e2e3-thread-a)')
})

// ── INPUT-new-4: ⌘/Ctrl+Enter in the Send all list ──

const key = (extra) => ({
  key: 'Enter',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  onButton: false,
  ...extra
})

test('the Send all list: Enter, ⌘+Enter and Ctrl+Enter send; Shift, Alt and Ctrl+⌘ do not', () => {
  assert.equal(checklistKey(key({})), 'send')
  assert.equal(checklistKey(key({ metaKey: true })), 'send')
  assert.equal(checklistKey(key({ ctrlKey: true })), 'send')
  assert.equal(checklistKey(key({ shiftKey: true })), null)
  assert.equal(checklistKey(key({ altKey: true })), null)
  assert.equal(checklistKey(key({ ctrlKey: true, metaKey: true })), null)
  assert.equal(checklistKey(key({ shiftKey: true, metaKey: true })), null)
  assert.equal(checklistKey(key({ metaKey: true, isComposing: true })), null)
  assert.equal(checklistKey(key({ ctrlKey: true, repeat: true })), null)
})

// ── TH-2: the length limit ──

test('the list root’s `limits.maxChars` is the tab’s limit; 4,000 (the server’s) when it does not say', () => {
  assert.equal(DEFAULT_MAX_CHARS, 4000)
  assert.equal(viewModel(storeOf(list([c('x')])).getSnapshot()).maxChars, 4000)
  assert.equal(
    viewModel(storeOf(list([c('x')], { limits: { maxChars: 5000 } })).getSnapshot()).maxChars,
    5000
  )
  assert.equal(viewModel(storeOf(list([c('x')], { limits: { maxChars: -3 } })).getSnapshot()).maxChars, 4000)
})

// ── Server round 5 in the turn to Tracy (contract H1 "Round 5") ──

test('a tombstone root sent to Tracy (Send all): its words are "(comment deleted)", its replies ride as the thread', async () => {
  const target = new EventTarget()
  const replies = []
  for (const type of [SENT_EVENT, FAILED_EVENT]) target.addEventListener(type, (e) => replies.push(e.detail))
  const sends = []
  const session = { getSnapshot: () => ({ running: false, subagent: null, removed: false }) }
  listenForComments({
    target,
    sessions: { binding: (id) => (id === 's1' ? { session } : undefined) },
    conversation: { sendSession: async (...args) => (sends.push(args), { kind: 'success' }) },
    siteKey: () => 'r2e2308',
    now: () => NOW,
    // The list holds the tombstone with no words: nothing here was typed by anyone.
    storedText: () => '',
    sender: () => ({ name: 'Lee', email: 'lee@example.com' })
  })
  target.dispatchEvent(
    new CustomEvent(SEND_EVENT, {
      detail: {
        v: 3,
        sessionId: 's1',
        requestId: 'req-tomb',
        siteKey: 'r2e2308',
        items: [
          {
            n: 41,
            url: HOME,
            element: H3,
            text: '',
            author: A,
            commentId: 'root',
            thread: [
              { author: A, at: NOW - 9 * MIN, text: '' },
              { author: B, at: NOW - 5 * MIN, text: 'Still B please' }
            ]
          }
        ]
      }
    })
  )
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(replies, [{ requestId: 'req-tomb', sessionId: 's1', queued: false }])
  const turn = sends[0][1]
  assert.ok(turn.startsWith('(comment deleted)\n'), turn.slice(0, 80))
  const threadLines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.equal(threadLines.length, 1, 'the root’s gone words are no thread line; the reply is')
  assert.match(threadLines[0], /Still B please$/)
  assert.ok(!turn.includes('(now)'), 'nobody typed words now')
})

test('`content.locate` answering `unavailable` (no Content API on the site) reads as unchecked, and parses back', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 7,
        text: 'Shorter heading, please.',
        element: H3,
        locate: {
          status: 'unavailable',
          code: 'CONTENT_ADAPTER_UNSUPPORTED',
          message: 'Content identity is not set up on this site yet.'
        }
      }
    ],
    numbered: true,
    now: NOW
  })
  assert.match(turn, /status="unchecked"/)
  assert.equal(parseCommentTurn(turn)?.items[0].n, 7)
  const printed = turn.replace('status="unchecked"', 'status="unavailable"')
  assert.equal(parseCommentTurn(printed)?.element?.status, 'unavailable')
})
