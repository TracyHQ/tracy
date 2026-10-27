/**
 * Stage-6 acceptance e2e v4 (send, SEND-v4-new-1, 30/09/2026): after switching conversations in one tab
 * and coming back, ONE "Add a comment…" send and ONE "Send all" went into TWO conversations — the one on
 * screen and the one left, whose Browser view stays mounted (hidden) and keeps sending its lists.
 *
 * The Comments tab picked "the tab shown" as the active one heard last, with no regard to WHICH
 * conversation is on screen; a hidden view that spoke last (or said `active`) became the target of the
 * page box, Send all, Delete all and a row's Reveal/Resolve. The lists now know the conversation on
 * screen (`focus`, fed from dsh's main view by `index.tsx`), and every act chat-input dispatches names a
 * Browser tab OF THAT conversation — never one of a background conversation. (The fork, on its side,
 * lets only the on-screen conversation's controller act: `fix/comment-r6-fork`.)
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  badgeCount,
  clearAct,
  createCommentLists,
  rowsOf,
  sendAct,
  shownTab,
  viewModel
} from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 8, 30, 6, 0, 0)
const HOME = 'https://e3sw0330.tracy.test/'
const RU = 'https://e3sw0330.tracy.test/ru/'
const A = { accountId: 'a', email: 'a@example.test', name: 'A', initial: 'A' }
const comment = (id, url = HOME) => ({
  id,
  url,
  text: `words of ${id}`,
  createdAt: NOW - 60_000,
  element: { url, selector: 'h1', tag: 'h1', text: 'Heading' },
  author: A
})
const list = (sessionId, tabId, url, comments, active = true) => ({
  sessionId,
  tabId,
  siteKey: 'e3sw0330.tracy.test',
  host: 'e3sw0330.tracy.test',
  active,
  url,
  comments
})

/** X on screen with its Browser tab; Y left, its hidden Browser view still mounted and speaking last. */
function twoConversations() {
  const store = createCommentLists()
  store.accept(list('session-x', 'tab-x', HOME, [comment('c1'), comment('c2')]))
  store.accept(list('session-y', 'tab-y', RU, [comment('c1'), comment('c2'), comment('c3', RU)]))
  store.focus('session-x')
  return store
}

test('the tab shown is the on-screen conversation’s, even when a hidden view spoke last and said active', () => {
  const store = twoConversations()
  assert.equal(shownTab(store.getSnapshot())?.tabId, 'tab-x')
})

test('every act names the on-screen conversation’s Browser tab: Send all, Delete all, row acts', () => {
  const snapshot = twoConversations().getSnapshot()
  const vm = viewModel(snapshot)
  assert.equal(sendAct(vm, ['c1', 'c2'])?.tabId, 'tab-x')
  assert.equal(clearAct(snapshot)?.tabId, 'tab-x')
  for (const row of rowsOf(snapshot)) assert.equal(row.tabId, 'tab-x', `row ${row.id}`)
})

test('a switch moves the target with it — live, no new list needed', () => {
  const store = twoConversations()
  store.focus('session-y')
  const snapshot = store.getSnapshot()
  assert.equal(shownTab(snapshot)?.tabId, 'tab-y')
  assert.equal(shownTab(snapshot)?.url, RU)
})

test('the conversation on screen has no Browser tab: nothing to act on, never a background tab', () => {
  const store = twoConversations()
  store.focus('session-z')
  const snapshot = store.getSnapshot()
  assert.equal(shownTab(snapshot), null)
  assert.equal(clearAct(snapshot), null)
  assert.equal(badgeCount(snapshot), 0)
})

test('focus fires the subscribers once per change', () => {
  const store = twoConversations()
  let calls = 0
  store.subscribe(() => {
    calls += 1
  })
  store.focus('session-x')
  store.focus('session-y')
  assert.equal(calls, 1)
})

test('before the page knows which conversation is on screen, the old rule stands (active, heard last)', () => {
  const store = createCommentLists()
  store.accept(list('session-x', 'tab-x', HOME, [comment('c1')]))
  store.accept(list('session-y', 'tab-y', RU, [comment('c1')]))
  assert.equal(shownTab(store.getSnapshot())?.tabId, 'tab-y')
})

test('every act also carries the on-screen conversation’s id (the fork acts only when tabId AND sessionId are its own)', () => {
  const store = twoConversations()
  const check = (/** @type {string} */ want) => {
    const snapshot = store.getSnapshot()
    // All pages (UI fine-tune 30/09): c1 is on Home, and session Y's tab shows /ru/.
    const vm = viewModel(snapshot, { filter: 'all' })
    assert.equal(sendAct(vm, ['c1'])?.sessionId, want)
    assert.equal(clearAct(snapshot, { filter: 'all' })?.sessionId, want)
    for (const row of rowsOf(snapshot)) assert.equal(row.sessionId, want, `row ${row.id}`)
  }
  check('session-x')
  // Followed live: a switch moves the id with it.
  store.focus('session-y')
  check('session-y')
})

test('a tab with no scope (sessionId "") on screen: the act names the conversation on screen, not ""', () => {
  const store = createCommentLists()
  store.accept(list('', 'tab-u', HOME, [comment('c1')]))
  store.focus('session-x')
  assert.deepEqual(clearAct(store.getSnapshot()), {
    tabId: 'tab-u',
    sessionId: 'session-x',
    kind: 'clear',
    ids: ['c1']
  })
})

test('before the page knows the conversation on screen, an act names its tab’s own conversation', () => {
  const store = createCommentLists()
  store.accept(list('session-x', 'tab-x', HOME, [comment('c1')]))
  assert.equal(clearAct(store.getSnapshot())?.sessionId, 'session-x')
})

// Round 6 (fork side, contract H2): tab ids are per conversation — two conversations can both have a
// `tab3` — so a list is filed by sessionId + tabId; one must never overwrite the other.
test('two conversations with the same tabId are two tabs: each keeps its own list, acts follow the one on screen', () => {
  const store = createCommentLists()
  store.accept(list('session-x', 'tab3', HOME, [comment('c1')]))
  store.accept(list('session-y', 'tab3', RU, [comment('c9', RU)]))
  assert.equal(store.getSnapshot().tabs.size, 2)
  store.focus('session-x')
  assert.equal(shownTab(store.getSnapshot())?.url, HOME)
  assert.deepEqual(
    rowsOf(store.getSnapshot()).map((r) => r.id),
    ['c1']
  )
  store.focus('session-y')
  assert.equal(shownTab(store.getSnapshot())?.url, RU)
  assert.equal(clearAct(store.getSnapshot())?.sessionId, 'session-y')
})

test('a tab leaving the screen says active:false once: it stops being the shown tab of its conversation', () => {
  const store = createCommentLists()
  store.accept(list('session-x', 'tab1', HOME, [comment('c1')]))
  store.accept(list('session-x', 'tab2', RU, [comment('c1')], false))
  store.focus('session-x')
  assert.equal(shownTab(store.getSnapshot())?.tabId, 'tab1')
  store.accept(list('session-x', 'tab1', HOME, [comment('c1')], false))
  store.accept(list('session-x', 'tab2', RU, [comment('c1')], true))
  assert.equal(shownTab(store.getSnapshot())?.tabId, 'tab2')
})
