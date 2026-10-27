/**
 * The Comments counters. Akemi 02/10/2026: this person's UNREAD open threads (`viewModel` `unread`), null
 * until their read marks are in; the status filter `Open | Resolved` keeps its totals (`statusCounts`).
 * Lee 04/10/2026: every count outside the list answers "how much is left" — the OPEN threads, all
 * authors, in grey (`openCounts`, `badgeCount`) — and "is anything new" is a red dot while the unread
 * number is above 0 (`unreadBadge`): the page filter's two pills, the Comments tab badge, the start
 * screen's Comments card, and the Browser toolbar's "Comments N", told both numbers by `comment-unread.mjs`.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { UNREAD_EVENT, UNREAD_STATE_EVENT, tellUnreadCount } from '../src/client/comment-unread.mjs'
import {
  badgeCount,
  commentBadge,
  createCommentLists,
  openCountsOf,
  rowsOf,
  unreadBadge,
  viewModel
} from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 9, 2, 12)
const MIN = 60_000
const HOME = 'https://kinetic.tracy.site/'
const PRICING = 'https://kinetic.tracy.site/pricing/'
const AKEMI = { accountId: 'a1', email: 'kimdesigner@example.com', name: 'Akemi', initial: 'A' }
const LEE = { accountId: 'a2', email: 'lee@example.com', name: 'Lee', initial: 'L' }
const c = (id, extra = {}) => ({
  id,
  n: 1,
  url: HOME,
  text: `words of ${id}`,
  status: 'pending',
  createdAt: NOW - 10 * MIN,
  element: null,
  author: LEE,
  can: { edit: false, delete: false },
  ...extra
})
const COMMENTS = [
  c('h1'),
  c('h2'),
  c('mine', { author: AKEMI }),
  c('hr', { status: 'resolved', resolvedAt: NOW }),
  c('p1', { url: PRICING }),
  c('p2', { url: PRICING }),
  c('pr', { url: PRICING, status: 'resolved', resolvedAt: NOW })
]
/** The Browser tab's list as the fork sends it. */
const tabList = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'kinetic',
  host: 'kinetic.tracy.site',
  active: true,
  url: HOME,
  comments
})
function lists(marks, comments = COMMENTS) {
  const store = createCommentLists()
  store.accept(tabList(comments))
  store.focus('s1')
  store.setViewer(AKEMI.email)
  if (marks !== undefined) store.setReads(marks)
  return store
}

test('before the read marks are in, no unread count at all (no number to take back later)', () => {
  const vm = viewModel(lists().getSnapshot())
  assert.equal(vm.unread, null)
  assert.deepEqual(vm.statusCounts, { open: 3, resolved: 1 }, 'the status totals do not wait')
})

test("unread counts open threads others wrote, this page and the whole site, whatever the status filter; one's own words never count", () => {
  const store = lists([])
  for (const status of /** @type {const} */ (['open', 'resolved'])) {
    const vm = viewModel(store.getSnapshot(), { status })
    assert.deepEqual(vm.unread, { page: 2, all: 4 }, status)
  }
  assert.deepEqual(viewModel(store.getSnapshot(), { filter: 'all' }).statusCounts, { open: 5, resolved: 2 })
})

test('opening a thread, marking it unread, and a Delete waiting out its Undo move the unread counts at once', () => {
  const store = lists([])
  store.markRead('h1', NOW)
  assert.deepEqual(viewModel(store.getSnapshot()).unread, { page: 1, all: 3 })
  store.markRead('p1', NOW)
  store.markRead('p2', NOW)
  store.markRead('h2', NOW)
  assert.deepEqual(viewModel(store.getSnapshot()).unread, { page: 0, all: 0 })
  store.markRead('h2', null)
  assert.deepEqual(viewModel(store.getSnapshot()).unread, { page: 1, all: 1 })
  // h2's Delete waits out its window: not counted; the status total leaves it out too.
  store.accept({
    sessionId: 's1',
    tabId: 'tab-a',
    siteKey: 'kinetic',
    host: 'kinetic.tracy.site',
    active: true,
    url: HOME,
    comments: COMMENTS.map((x) => (x.id === 'h2' ? { ...x, deleting: NOW + 10_000 } : x))
  })
  const vm = viewModel(store.getSnapshot())
  assert.deepEqual(vm.unread, { page: 0, all: 0 })
  assert.equal(vm.statusCounts.open, 2)
})

test('a resolved thread never counts as unread', () => {
  const store = lists([])
  const resolvedUnread = viewModel(store.getSnapshot(), {
    status: 'resolved',
    filter: 'all'
  }).resolved.filter((r) => r.unread)
  assert.equal(resolvedUnread.length, 2, 'they are unread rows')
  assert.deepEqual(viewModel(store.getSnapshot()).unread, { page: 2, all: 4 }, 'but not in the count')
})

test("the dot's number is the All pages pill's unread one: unreadBadge === unread.all, null before the marks", () => {
  assert.equal(unreadBadge(lists().getSnapshot()), null, 'no number before the read marks are in')
  const store = lists([])
  const same = () => {
    const vm = viewModel(store.getSnapshot())
    assert.equal(unreadBadge(store.getSnapshot()), vm.unread?.all)
    assert.notEqual(unreadBadge(store.getSnapshot()), badgeCount(store.getSnapshot()), 'not the open total')
  }
  same()
  assert.equal(unreadBadge(store.getSnapshot()), 4)
  store.markRead('h1', NOW)
  store.markRead('p1', NOW)
  assert.equal(unreadBadge(store.getSnapshot()), 2, 'opening threads lowers it at once')
  store.markRead('p1', null)
  assert.equal(unreadBadge(store.getSnapshot()), 3, 'Mark as unread raises it at once')
  for (const id of ['h2', 'p1', 'p2']) store.markRead(id, NOW)
  assert.equal(unreadBadge(store.getSnapshot()), 0, 'all read: 0, which the callers draw as no dot')
})

test("Lee 04/10: the page filter's grey numbers are the OPEN threads, all authors, whatever the status filter (never `counts`), without waiting for the read marks", () => {
  for (const marks of [undefined, []]) {
    const store = lists(marks)
    for (const status of /** @type {const} */ (['open', 'resolved'])) {
      const vm = viewModel(store.getSnapshot(), { status })
      assert.deepEqual(vm.openCounts, { page: 3, all: 5 }, `${status}, marks ${marks ? 'in' : 'not in'}`)
      assert.equal(vm.badge, 5)
    }
    assert.deepEqual(
      viewModel(store.getSnapshot(), { status: 'resolved' }).counts,
      { page: 1, all: 2 },
      '`counts` follows the chosen status: the trap the pills must not fall into'
    )
    assert.deepEqual(openCountsOf(rowsOf(store.getSnapshot())), { page: 3, all: 5 })
    assert.equal(badgeCount(store.getSnapshot()), 5, 'the badge is the All pages number')
  }
  // A Delete waiting out its Undo window leaves both numbers at once.
  const store = lists([])
  store.accept(tabList(COMMENTS.map((x) => (x.id === 'h2' ? { ...x, deleting: NOW + 10_000 } : x))))
  assert.deepEqual(viewModel(store.getSnapshot()).openCounts, { page: 2, all: 4 })
})

/** Three open threads Lee wrote on the page shown, and one resolved one. */
const THREE = [c('x1'), c('x2'), c('x3'), c('xr', { status: 'resolved', resolvedAt: NOW })]

/** What the toolbar hears first from a page that starts saying the badge for `store`. */
function firstSaid(store) {
  const target = new EventTarget()
  /** @type {unknown[]} */
  const heard = []
  target.addEventListener(UNREAD_EVENT, (e) => heard.push(/** @type {CustomEvent} */ (e).detail))
  const stop = tellUnreadCount({ lists: store, target })
  stop()
  return heard
}

test('the badge (Lee 04/10): open 3 with 1 unread → the number 3 and a dot; 0 unread → no dot; marks not in → 3, no dot; nothing open → nothing', () => {
  // (a) Akemi opened two of Lee's three threads.
  const a = lists(
    [
      ['x1', NOW],
      ['x2', NOW]
    ],
    THREE
  )
  assert.deepEqual(commentBadge(a.getSnapshot()), { open: 3, unread: 1 })
  assert.equal(badgeCount(a.getSnapshot()), 3, 'the card and the tab draw 3')
  assert.equal(unreadBadge(a.getSnapshot()), 1, 'above 0: the dot shows')
  assert.deepEqual(firstSaid(a), [{ count: 1, open: 3 }])
  // (b) all three read.
  const b = lists(
    THREE.map((x) => [x.id, NOW]),
    THREE
  )
  assert.deepEqual(commentBadge(b.getSnapshot()), { open: 3, unread: 0 }, 'the number stays, no dot')
  assert.deepEqual(firstSaid(b), [{ count: 0, open: 3 }])
  // (c) the read marks not in yet: the number does not wait; the dot does.
  const c3 = lists(undefined, THREE)
  assert.deepEqual(commentBadge(c3.getSnapshot()), { open: 3, unread: null })
  assert.deepEqual(firstSaid(c3), [{ count: null, open: 3 }])
  // (d) nothing open: no number, no dot.
  const d = lists([], [THREE[3]])
  assert.deepEqual(commentBadge(d.getSnapshot()), { open: 0, unread: 0 })
  assert.deepEqual(firstSaid(d), [{ count: 0, open: 0 }])
})

test("the start screen's Comments card and the page filter draw the open count, with the dot from unreadBadge (source pin)", () => {
  const src = (file) => readFileSync(new URL(`../src/client/${file}`, import.meta.url), 'utf8')
  const index = src('index.tsx')
  const site = index.slice(index.indexOf('function SiteStart('), index.indexOf('function Dock('))
  assert.match(
    site,
    /badgeCount\(comments\.lists\.getSnapshot\(\)\)/,
    'the Comments card counts open threads'
  )
  assert.match(site, /unreadBadge\(comments\.lists\.getSnapshot\(\)\)/, 'its dot reads unreadBadge')
  assert.match(site, /count=\{openComments\}/)
  assert.match(site, /dot=\{unread !== null\}/)
  assert.match(site, /const unread = unreadWords\(unreadComments, t\)/)
  const view = src('CommentsView.tsx')
  const filter = view.slice(view.indexOf('function FilterBar('), view.indexOf('function FilterSide('))
  assert.match(filter, /vm\.openCounts\.page,\s+vm\.unread\?\.page \?\? null/)
  assert.match(filter, /vm\.openCounts\.all,\s+vm\.unread\?\.all \?\? null/)
  assert.doesNotMatch(filter, /vm\.counts/, 'never the chosen status’s counts')
})

test('the Comments tab badge: the open count on that tab only, the dot while something is unread, nothing at 0', async () => {
  const pkgRoot = fileURLToPath(new URL('..', import.meta.url))
  const require = createRequire(import.meta.url)
  const out = mkdtempSync(path.join(tmpdir(), 'tci-badge-'))
  try {
    await require('esbuild').build({
      stdin: {
        contents: "export { createCommentsState, watchCommentsBadge } from './CommentsView'",
        resolveDir: path.join(pkgRoot, 'src', 'client'),
        loader: 'tsx'
      },
      absWorkingDir: pkgRoot,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      nodePaths: [path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core', 'node_modules')],
      outfile: path.join(out, 'badge.cjs'),
      logLevel: 'silent'
    })
    const { document, MutationObserver } = require('linkedom').parseHTML(
      '<html><body><div data-conversation-tabs><button role="tab">Chat</button><button role="tab">Comments</button></div></body></html>'
    )
    Object.assign(globalThis, { document, MutationObserver })
    const { createCommentsState, watchCommentsBadge } = require(path.join(out, 'badge.cjs'))
    const state = createCommentsState({ storage: null })
    state.lists.accept(tabList(COMMENTS))
    state.lists.focus('s1')
    state.lists.setViewer(AKEMI.email)
    const [chat, tab] = document.querySelectorAll('[role="tab"]')
    const painted = () => new Promise((resolve) => setTimeout(resolve, 0))
    const stop = watchCommentsBadge(state, () => 'Comments')
    await painted()
    // Five open threads on the site, all authors; the read marks are not in, so no dot yet.
    assert.equal(tab.getAttribute('data-tracy-count'), '5')
    assert.equal(tab.hasAttribute('data-tracy-unread'), false)
    assert.equal(chat.hasAttribute('data-tracy-count'), false, 'only the Comments tab carries the badge')
    state.lists.setReads([])
    await painted()
    assert.equal(tab.getAttribute('data-tracy-count'), '5')
    assert.equal(tab.getAttribute('data-tracy-unread'), '4', 'the open threads others wrote')
    state.lists.accept(tabList(COMMENTS.map((x) => ({ ...x, status: 'resolved', resolvedAt: NOW }))))
    await painted()
    assert.equal(tab.hasAttribute('data-tracy-count'), false, 'at 0 the pill goes')
    assert.equal(tab.hasAttribute('data-tracy-unread'), false)
    stop()
  } finally {
    delete globalThis.document
    delete globalThis.MutationObserver
    rmSync(out, { recursive: true, force: true })
  }
})

test('the Browser toolbar hears both numbers: tracy:comment-unread {count, open} whenever EITHER changes, and the answer to tracy:comment-unread-state', () => {
  const target = new EventTarget()
  /** @type {{ count: number | null, open: number }[]} */
  const heard = []
  target.addEventListener(UNREAD_EVENT, (e) => heard.push(/** @type {CustomEvent} */ (e).detail))
  const ask = () => {
    /** @type {{ count?: unknown, open?: unknown }} */
    const detail = {}
    target.dispatchEvent(new CustomEvent(UNREAD_STATE_EVENT, { detail }))
    return detail
  }
  const store = lists()
  const stop = tellUnreadCount({ lists: store, target })
  assert.deepEqual(heard, [{ count: null, open: 5 }], 'before the read marks: the number, no dot')
  assert.deepEqual(ask(), { count: null, open: 5 })
  store.setReads([])
  store.markRead('h1', NOW)
  assert.deepEqual(
    heard.map((d) => d.count),
    [null, 4, 3],
    'the marks in, then an opened thread: each change once'
  )
  assert.ok(
    heard.every((d) => d.open === 5),
    'opening a thread leaves the open number'
  )
  store.markRead('h1', null)
  assert.deepEqual(heard.at(-1), { count: 4, open: 5 }, 'Mark as unread')
  // Akemi writes a new comment of her own: one more open thread, nothing new to her — the toolbar
  // must still move to 6 (a count-only check would have said nothing).
  const said = heard.length
  store.accept(tabList([...COMMENTS, c('mine2', { author: AKEMI })]))
  assert.equal(heard.length, said + 1, 'said once')
  assert.deepEqual(heard.at(-1), { count: 4, open: 6 })
  store.accept(tabList(COMMENTS.map((x) => (x.id === 'h2' ? { ...x, deleting: NOW + 10_000 } : x))))
  assert.deepEqual(heard.at(-1), { count: 3, open: 4 }, 'a Delete waiting out its Undo leaves both at once')
  assert.deepEqual(
    ask(),
    { count: unreadBadge(store.getSnapshot()), open: badgeCount(store.getSnapshot()) },
    'a toolbar mounting late asks and gets the same two numbers'
  )
  const vm = viewModel(store.getSnapshot())
  assert.deepEqual(
    ask(),
    { count: vm.unread?.all, open: vm.openCounts.all },
    'the All pages pill and its dot'
  )
  // A change that moves neither number says nothing.
  const quiet = heard.length
  store.accept(
    tabList(COMMENTS.map((x) => (x.id === 'h2' ? { ...x, deleting: NOW + 10_000, text: 'edited' } : x)))
  )
  assert.equal(heard.length, quiet, 'same two numbers: nothing said')
  store.markRead('h1', NOW)
  assert.equal(heard.length, quiet + 1)
  stop()
  store.markRead('h1', null)
  assert.equal(heard.length, quiet + 1, 'stopped: nothing more said')
  assert.deepEqual(ask(), {}, 'nor answered')
})
