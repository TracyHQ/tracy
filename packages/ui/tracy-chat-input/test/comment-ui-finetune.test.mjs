/**
 * UI fine-tune of the Comments tab (30/09 morning; rules `tasks/todo-comment-people.md` §"UI fine-tune
 * 30/09", acceptance U1–U40 `tasks/evidence/comment-people/test-plan-ui-finetune.md`), the model half:
 * one meta line `<name> · <time> · <path | Current page>` that never adds a line, the sub-filter
 * `Current page | All pages`, counts of the page shown, Delete all and Send all acting on what the filter
 * shows, and the Resolved group hidden by default.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  badgeCount,
  clearAct,
  createCommentLists,
  headActions,
  readPageFilter,
  rowsOf,
  sendAct,
  viewModel,
  writePageFilter
} from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)
const MIN = 60_000
const SITE = 'https://capiwl1643.tracy.test'
const HOME = `${SITE}/`
const SERVICES = `${SITE}/services/`
const ABOUT = `${SITE}/about/`
const RU = `${SITE}/ru/`
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L' }
const MAI = { accountId: 'a-mai', email: 'mai@northgate.ru', name: 'Mai', initial: 'M' }

/** @param {string} id @param {object} [extra] */
const c = (id, extra = {}) => ({
  id,
  url: HOME,
  text: `words of ${id}`,
  status: 'pending',
  createdAt: NOW - 10 * MIN,
  element: { url: HOME, selector: 'h1', text: 'Heading', tag: 'h1' },
  author: LEE,
  can: { edit: true, delete: true },
  replyCount: 0,
  sentToTracy: false,
  ...extra
})
/** @param {object[]} comments @param {object} [extra] */
const list = (comments, extra = {}) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'capiwl1643',
  host: 'capiwl1643.tracy.test',
  active: true,
  url: HOME,
  comments,
  ...extra
})
const snap = (...lists) => {
  const store = createCommentLists()
  for (const l of lists) store.accept(l)
  return store.getSnapshot()
}
const resolved = { status: 'resolved', resolvedAt: NOW - MIN }

/** A site with 3 open + 1 resolved on Home, 2 open on /services/, 1 open on /ru/. */
const SITE_COMMENTS = [
  c('h1', { createdAt: NOW - 1 * MIN }),
  c('s1', { url: SERVICES, createdAt: NOW - 2 * MIN, author: MAI }),
  c('h2', { createdAt: NOW - 3 * MIN, replyCount: 2 }),
  c('r1', { url: RU, createdAt: NOW - 4 * MIN }),
  c('s2', { url: SERVICES, createdAt: NOW - 5 * MIN }),
  c('h3', { createdAt: NOW - 6 * MIN }),
  c('hx', { createdAt: NOW - 7 * MIN, ...resolved }),
  c('sx', { url: SERVICES, createdAt: NOW - 8 * MIN, ...resolved })
]

test('U4/U5: a row names its page by path, or "here" for the page shown; no site name, no separate line', () => {
  const rows = rowsOf(snap(list(SITE_COMMENTS)))
  const by = Object.fromEntries(rows.map((r) => [r.id, r]))
  assert.equal(by.s1.path, '/services/')
  assert.equal(by.s1.onPage, false)
  assert.equal(by.h1.path, '/')
  assert.equal(by.h1.onPage, true)
  assert.equal('where' in by.s1, false, 'the old `siteKey · path` line is gone')
})

test('U8: a #hash is the same page; U9: /ru/ is not /', () => {
  const onServicesTeam = rowsOf(snap(list(SITE_COMMENTS, { url: `${SITE}/services/#team` })))
  const by = Object.fromEntries(onServicesTeam.map((r) => [r.id, r]))
  assert.equal(by.s1.onPage, true)
  assert.equal(by.h1.onPage, false)
  const onHome = Object.fromEntries(rowsOf(snap(list(SITE_COMMENTS))).map((r) => [r.id, r]))
  assert.equal(onHome.r1.onPage, false, '/ru/ is another page than /')
})

test('U10/U11: the filter defaults to Current page, counts open comments each side, newest activity first', () => {
  const vm = viewModel(snap(list(SITE_COMMENTS)))
  assert.equal(vm.filter, 'page')
  assert.deepEqual(vm.counts, { page: 3, all: 6 })
  assert.deepEqual(
    vm.open.map((r) => r.id),
    ['h1', 'h2', 'h3']
  )
})

test('U15/U5: All pages lists the whole site in activity order, the page shown not pushed to the top', () => {
  const vm = viewModel(snap(list(SITE_COMMENTS, { url: SERVICES })), { filter: 'all' })
  assert.equal(vm.filter, 'all')
  assert.deepEqual(
    vm.open.map((r) => r.id),
    ['h1', 's1', 'h2', 'r1', 's2', 'h3']
  )
  assert.deepEqual(
    vm.open.filter((r) => r.onPage).map((r) => r.id),
    ['s1', 's2']
  )
})

test('U14: Current page follows the Browser tab to another page', () => {
  const vm = viewModel(snap(list(SITE_COMMENTS, { url: SERVICES })))
  assert.deepEqual(
    vm.open.map((r) => r.id),
    ['s1', 's2']
  )
  assert.deepEqual(vm.counts, { page: 2, all: 6 })
})

test('redesign A (01/10/2026, supersedes U16): the tab count = every open comment of the site, whichever page is shown — a page with none of its own no longer reads 0', () => {
  assert.equal(badgeCount(snap(list(SITE_COMMENTS))), 6)
  assert.equal(badgeCount(snap(list(SITE_COMMENTS, { url: `${SITE}/services#x` }))), 6)
  assert.equal(badgeCount(snap(list(SITE_COMMENTS, { url: ABOUT }))), 6)
  assert.equal(viewModel(snap(list(SITE_COMMENTS))).badge, 6)
  assert.equal(viewModel(snap(list(SITE_COMMENTS))).badge, viewModel(snap(list(SITE_COMMENTS))).counts.all)
})

test('U19/U21, U46 (round 2, rule 7): Send all counts the THREADS of what the filter shows, its replies riding along', () => {
  const s = snap(list(SITE_COMMENTS))
  assert.deepEqual(
    headActions(viewModel(s)).sendAll,
    { shown: true, count: 3, disabled: false },
    'h1, h2 (2 replies), h3'
  )
  assert.deepEqual(headActions(viewModel(s, { filter: 'all' })).sendAll, {
    shown: true,
    count: 6,
    disabled: false
  })
  // U46: the button reads the filter's own number.
  assert.equal(headActions(viewModel(s)).sendAll.count, viewModel(s).counts.page)
  assert.equal(headActions(viewModel(s, { filter: 'all' })).sendAll.count, viewModel(s).counts.all)
})

test("redesign A: a row's Ask Tracy to edit (↑) is the same send as the checklist's, for that one comment", () => {
  const vm = viewModel(snap(list(SITE_COMMENTS)), { filter: 'all' })
  const one = vm.open[1]
  assert.deepEqual(sendAct(vm, [one.id]), {
    tabId: vm.shown?.tabId,
    sessionId: vm.sessionId,
    kind: 'send',
    ids: [one.id]
  })
})

test('U20: Send all on Current page sends only this page’s open comments', () => {
  const vm = viewModel(snap(list(SITE_COMMENTS)))
  assert.deepEqual(
    sendAct(
      vm,
      vm.sendAll.map((r) => r.id)
    )?.ids,
    ['h1', 'h2', 'h3']
  )
})

test('U23/U26/U27, redesign A: Delete all takes what is on screen: this page’s open ones in Open, its resolved ones in Resolved', () => {
  const s = snap(list(SITE_COMMENTS))
  assert.deepEqual(clearAct(s), { tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids: ['h1', 'h2', 'h3'] })
  assert.deepEqual(clearAct(s, { status: 'resolved' })?.ids, ['hx'])
})

test('U24: Delete all on All pages takes every open comment of the site, everyone’s', () => {
  const s = snap(list(SITE_COMMENTS))
  assert.deepEqual(clearAct(s, { filter: 'all' })?.ids, ['h1', 's1', 'h2', 'r1', 's2', 'h3'])
  assert.deepEqual(clearAct(s, { filter: 'all', status: 'resolved' })?.ids, ['hx', 'sx'])
})

test('U28, redesign A: with nothing open in the view the toolbar keeps its status filter and shows no button; Delete all never takes a resolved one from Open', () => {
  const vm = viewModel(snap(list(SITE_COMMENTS, { url: ABOUT })))
  assert.deepEqual(headActions(vm), {
    shown: true,
    deleteAll: { shown: false, disabled: false },
    sendAll: { shown: false, count: 0, disabled: false }
  })
  assert.equal(clearAct(snap(list(SITE_COMMENTS, { url: ABOUT }))), null)
  const onlyResolvedHere = viewModel(snap(list([c('hx', resolved)])))
  assert.equal(
    headActions(onlyResolvedHere).deleteAll.shown,
    false,
    'a resolved one is not deletable from Open'
  )
  assert.equal(
    headActions(viewModel(snap(list([c('hx', resolved)])), { status: 'resolved' })).deleteAll.shown,
    true
  )
})

/** A Storage stand-in: a Map, or one whose every call throws (a private window, blocked site data). */
const memory = () => {
  const m = new Map()
  return {
    getItem: (/** @type {string} */ k) => (m.has(k) ? m.get(k) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, String(v)),
    removeItem: (/** @type {string} */ k) => void m.delete(k)
  }
}
const broken = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {}
}

test('U10/U12/U13: the filter is remembered per person on this browser; a new person gets Current page', () => {
  const store = memory()
  assert.equal(readPageFilter(store, 'lee@example.com'), 'page', 'a clean browser')
  writePageFilter(store, 'lee@example.com', 'all')
  assert.equal(readPageFilter(store, 'LEE@example.com'), 'all', 'after a reload, the same person')
  assert.equal(readPageFilter(store, 'mai@northgate.ru'), 'page', 'another seat on this browser')
  writePageFilter(store, 'lee@example.com', 'page')
  assert.equal(readPageFilter(store, 'lee@example.com'), 'page')
})

test('the filter memory never throws and falls back to Current page', () => {
  assert.equal(readPageFilter(broken, 'lee@example.com'), 'page')
  assert.doesNotThrow(() => writePageFilter(broken, 'lee@example.com', 'all'))
  assert.equal(readPageFilter(null, 'lee@example.com'), 'page', 'no storage at all')
  const store = memory()
  store.setItem('tracy:comments-filter:lee@example.com', 'everything')
  assert.equal(readPageFilter(store, 'lee@example.com'), 'page', 'a value it did not write')
  writePageFilter(store, '', 'all')
  assert.equal(readPageFilter(store, ''), 'page', 'nobody known: nothing remembered')
})
