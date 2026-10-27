/**
 * Round 3 of the Comments tab (Brian tested on the local stand, 30/09):
 *   1. "Delete all" and "Send all (N) to Tracy" stay put at the head of Open: they never appear or vanish as
 *      rows are clicked (a click reveals a comment, which may move the Browser tab to another page); with
 *      nothing to act on they are disabled, "Send all (0)".
 *   2. N = every open comment the tab lists (the whole site), not only those never sent; the checklist lists
 *      the same N, all ticked.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checklistCount,
  checklistKey,
  createCommentLists,
  headActions,
  sendAct,
  viewModel
} from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)
const MIN = 60_000
const HOME = 'https://northgate-ind.ru/'
const NEWS = 'https://northgate-ind.ru/news'
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L' }
const MAI = { accountId: 'a-mai', email: 'mai@northgate.ru', name: 'Mai', initial: 'M' }
const MENU = { url: HOME, selector: 'nav a:nth-of-type(3)', label: 'Menu item "Services"', tag: 'a' }

/** @param {string} id @param {object} [extra] */
const c = (id, extra = {}) => ({
  id,
  url: HOME,
  text: `words of ${id}`,
  createdAt: NOW - 10 * MIN,
  element: MENU,
  author: LEE,
  sentToTracy: false,
  ...extra
})
/** @param {object[]} comments @param {object} [extra] */
const list = (comments, extra = {}) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'northgate',
  host: 'northgate-ind.ru',
  active: true,
  url: HOME,
  comments,
  ...extra
})
const vmOf = (...lists) => {
  const store = createCommentLists()
  for (const l of lists) store.accept(l)
  return viewModel(store.getSnapshot())
}
/** The same on All pages (UI fine-tune 30/09). */
const allOf = (...lists) => {
  const store = createCommentLists()
  for (const l of lists) store.accept(l)
  return viewModel(store.getSnapshot(), { filter: 'all' })
}

test('Send all on All pages: N is every open comment the tab lists, sent before or not, on any page', () => {
  const vm = allOf(
    list([
      c('p1', { sentToTracy: true }),
      c('p2', { author: MAI }),
      c('n1', { url: NEWS }),
      c('r1', { replyTo: 'p2' }),
      c('done', { status: 'resolved', resolvedAt: NOW })
    ])
  )
  assert.deepEqual(
    vm.sendAll.map((r) => r.id).sort(),
    ['n1', 'p1', 'p2'],
    'replies ride with their thread; resolved comments are not sent'
  )
  assert.deepEqual(
    headActions(vm).sendAll,
    { shown: true, count: 3, disabled: false },
    'threads: p2 carries its reply r1, counted once'
  )
  assert.deepEqual(sendAct(vm, ['p1', 'n1']), {
    tabId: 'tab-a',
    sessionId: 's1',
    kind: 'send',
    ids: ['p1', 'n1']
  })
})

test('UI fine-tune round 2, rule 7 (Brian 30/09, reverses bug 3): N counts THREADS — a thread with replies is 1 — and the replies still go with it', () => {
  const vm = vmOf(
    list([
      c('p1', { replyCount: 1 }),
      c('p2', { replyCount: 3 }),
      c('p3'),
      c('done', { status: 'resolved', resolvedAt: NOW, replyCount: 4 })
    ])
  )
  assert.deepEqual(
    headActions(vm).sendAll,
    { shown: true, count: 3, disabled: false },
    'U47: a thread with 3 replies is +1, not +4'
  )
  assert.equal(headActions(vmOf(list([c('solo', { replyCount: 1 })]))).sendAll.count, 1)
  // The checklist ticks threads and counts threads, so all ticked reads the button's N.
  assert.deepEqual(checklistCount(vm, new Set()), { count: 3, total: 3 })
  assert.deepEqual(checklistCount(vm, new Set(['p2'])), { count: 2, total: 3 })
  assert.deepEqual(checklistCount(vm, new Set(['p1', 'p2', 'p3'])), { count: 0, total: 3 })
})

test('the head stays put on All pages: the same two buttons whichever page the Browser tab moved to after a row click', () => {
  const comments = [c('p1', { sentToTracy: true }), c('p2'), c('n1', { url: NEWS })]
  const onHome = headActions(allOf(list(comments)))
  // A click on the /news row reveals it: the Browser tab now shows /news and lists the same comments (U15).
  const onNews = headActions(allOf(list(comments, { url: NEWS })))
  assert.deepEqual(onHome.sendAll, { shown: true, count: 3, disabled: false }, 'three comments, no reply')
  assert.deepEqual(onNews.sendAll, onHome.sendAll, 'N does not jump with the page shown')
  assert.equal(onHome.deleteAll.disabled, false)
  assert.equal(onNews.deleteAll.disabled, false)
  assert.equal(onHome.shown, true)
  assert.equal(onNews.shown, true)
})

test('nothing open (redesign A): the toolbar keeps its status filter, with no Delete all and no Ask Tracy to edit all', () => {
  const vm = vmOf(list([c('done', { status: 'resolved', resolvedAt: NOW })]))
  assert.deepEqual(
    headActions(vm),
    {
      shown: true,
      deleteAll: { shown: false, disabled: false },
      sendAll: { shown: false, count: 0, disabled: false }
    },
    "U26/U28: nothing open, and the resolved one is the Resolved view's"
  )
  const elsewhere = vmOf(list([c('done', { url: NEWS, status: 'resolved', resolvedAt: NOW })]))
  assert.deepEqual(
    headActions(elsewhere),
    {
      shown: true,
      deleteAll: { shown: false, disabled: false },
      sendAll: { shown: false, count: 0, disabled: false }
    },
    'nothing open on this page: no buttons'
  )
})

test('no comment at all: the empty state, no toolbar', () => {
  assert.equal(headActions(vmOf(list([]))).shown, false)
})

const check = (k, extra = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  onButton: false,
  ...extra
})

test('the Send-all checklist Enter has the same IME and repeat guards', () => {
  assert.equal(checklistKey(check('Enter')), 'send')
  assert.equal(checklistKey(check('Enter', { keyCode: 229 })), null)
  assert.equal(checklistKey(check('Enter', { recentlyComposing: true })), null)
  assert.equal(checklistKey(check('Enter', { repeat: true })), null)
  assert.equal(checklistKey(check('Escape', { repeat: true })), 'close')
})
