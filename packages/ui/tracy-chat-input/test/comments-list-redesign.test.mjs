/**
 * The Comments list redesign A + L1 (Akemi 01/10/2026, `tasks/comments-list-redesign-plan.md`), its model:
 * each row's number, handle, tag (Note · Asked Tracy · Tracy working… · Done by Tracy), read state, the
 * comment whose Delete waits out its window, the thread open on the page; the Open / Resolved filter
 * and its counts; the page shown always a group; the picture a comment is anchored on; mentions. Plus
 * the two small modules behind it: this person's read marks on the server (`comment-reads.mjs`) and
 * the comments a watched turn works on (`comment-working.mjs`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readMarksOf, createCommentReads } from '../src/client/comment-reads.mjs'
import {
  badgeCount,
  clearAct,
  createCommentLists,
  handleOf,
  pageGroups,
  pictureOf,
  readCommentList,
  rowsOf,
  seenOf,
  statusOf,
  textParts,
  viewModel
} from '../src/client/comment-view.mjs'
import { watchWorkingComments } from '../src/client/comment-working.mjs'

const NOW = Date.UTC(2026, 9, 1, 12)
const MIN = 60_000
const HOME = 'https://kinetic.tracy.site/'
const PRICING = 'https://kinetic.tracy.site/pricing/'
const AKEMI = { accountId: 'a1', email: 'kimdesigner@example.com', name: 'Akemi', initial: 'A' }
const LEE = { accountId: 'a2', email: 'patowner@example.com', name: 'Lee', initial: 'L' }
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
const list = (comments, extra = {}) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'kinetic',
  host: 'kinetic.tracy.site',
  active: true,
  url: HOME,
  comments,
  ...extra
})
/** Lists that heard `l`, Akemi signed in, her read marks `marks` (or none known). */
function lists(l, marks) {
  const store = createCommentLists()
  store.accept(l)
  store.focus('s1')
  store.setViewer('kimdesigner@example.com')
  if (marks !== undefined) store.setReads(marks)
  return store
}
const row = (store, id) => rowsOf(store.getSnapshot()).find((r) => r.id === id)

test('a row carries its number, the handle (the e-mail before its at sign) and the whole address', () => {
  const r = row(lists(list([c('x', { n: 12 })])), 'x')
  assert.equal(r?.n, 12)
  assert.equal(r?.handle, 'patowner')
  assert.equal(r?.email, 'patowner@example.com')
  assert.equal(handleOf({ name: 'Tracy' }), 'Tracy', 'no e-mail: the name')
  assert.equal(readCommentList(list([c('x', { n: 0 })]))?.comments[0].n, undefined, 'not a number: none')
})

test("the tag: Note when never sent; Asked Tracy when sent; Done by Tracy when a write of Tracy's cited the latest send; Tracy working… while a watched turn works on it", () => {
  const sent = (lastSend) => readCommentList(list([c('x', { sentToTracy: true, ...lastSend })]))?.comments[0]
  assert.equal(statusOf(readCommentList(list([c('x')]))?.comments[0]), 'note')
  assert.equal(statusOf(sent({})), 'asked', 'the list only says it was sent')
  assert.equal(statusOf(sent({ lastSend: { at: NOW } })), 'asked')
  assert.equal(statusOf(sent({ lastSend: { at: NOW, answeredAt: NOW + MIN } })), 'done')
  // The server's own shape: the last of `sends` (oldest first) decides.
  const server = (sends) => readCommentList(list([c('x', { sentToTracy: true, sends })]))?.comments[0]
  assert.equal(
    statusOf(
      server([
        { at: '2026-10-01T10:00:00Z', answeredAt: '2026-10-01T10:01:00Z' },
        { at: '2026-10-01T11:00:00Z', answeredAt: null }
      ])
    ),
    'asked',
    'sent again since: asked again'
  )
  assert.equal(statusOf(server([{ at: '2026-10-01T10:00:00Z', answeredAt: '2026-10-01T10:01:00Z' }])), 'done')
  assert.equal(statusOf(sent({ lastSend: { at: NOW } }), new Set(['x'])), 'working')
  const store = lists(list([c('x', { sentToTracy: true })]))
  store.setWorking(['x'])
  assert.equal(row(store, 'x')?.status, 'working')
  store.setWorking([])
  assert.equal(row(store, 'x')?.status, 'asked')
})

test("unread: nothing before the read marks are known; then someone else's words never opened, or numbered above what she saw, or marked unread", () => {
  const theirs = c('t', { n: 4 })
  const mine = c('m', { author: AKEMI, can: { edit: true, delete: true } })
  assert.equal(row(lists(list([theirs])), 't')?.unread, false, 'marks not known yet')
  assert.equal(row(lists(list([theirs]), []), 't')?.unread, true, 'never opened')
  assert.equal(row(lists(list([mine]), []), 'm')?.unread, false, 'her own words')
  assert.equal(row(lists(list([theirs]), [['t', 4]]), 't')?.unread, false, 'seen up to #4')
  const reply = c('r', { n: 6, replyTo: 't' })
  assert.equal(row(lists(list([theirs, reply]), [['t', 4]]), 't')?.unread, true, 'a reply above what she saw')
  // By number, not time: a reply older in time than the mark still counts when she never saw it.
  const early = c('r', { n: 6, replyTo: 't', createdAt: NOW - 20 * MIN })
  assert.equal(row(lists(list([theirs, early]), [['t', 4]]), 't')?.unread, true, 'written before, not seen')
  const myReply = c('r', { n: 6, replyTo: 't', author: AKEMI })
  assert.equal(row(lists(list([theirs, myReply]), [['t', 4]]), 't')?.unread, false, 'her own reply')
  // A reply to a reply is the thread's too (`rootOf`).
  const deep = c('d', { n: 9, replyTo: 'r' })
  assert.equal(row(lists(list([theirs, myReply, deep]), [['t', 6]]), 't')?.unread, true, 'a reply at depth 2')
  assert.equal(row(lists(list([mine]), [['m', null]]), 'm')?.unread, true, 'Mark as unread')
  const store = lists(list([theirs]), [])
  store.markRead('t', 4)
  assert.equal(row(store, 't')?.unread, false)
  store.markRead('t', null)
  assert.equal(row(store, 't')?.unread, true)
  store.markRead('t', undefined)
  assert.equal(row(store, 't')?.unread, true, 'forgotten: never opened again')
})

test('seenOf: the largest number of the other people’s messages in the thread the rows are drawn from', () => {
  const theirs = c('t', { n: 4 })
  const store = lists(
    list([theirs, c('r', { n: 7, replyTo: 't' }), c('d', { n: 9, replyTo: 'r', author: AKEMI })]),
    []
  )
  assert.equal(seenOf(store.getSnapshot(), 't'), 7, 'her own #9 is not what she saw of others')
  store.markRead('t', seenOf(store.getSnapshot(), 't'))
  assert.equal(row(store, 't')?.unread, false, 'a thread marked with it reads as read at once')
  assert.equal(seenOf(store.getSnapshot(), 'nope'), 0, 'not listed: 0')
  assert.equal(seenOf(lists(list([c('m', { n: 3, author: AKEMI })]), []).getSnapshot(), 'm'), 0, 'only hers')
})

test('the thread card open on the page marks its row selected', () => {
  const store = lists(list([c('a'), c('b')], { thread: 'b' }))
  assert.equal(row(store, 'a')?.selected, false)
  assert.equal(row(store, 'b')?.selected, true)
  assert.equal(viewModel(store.getSnapshot()).thread, 'b')
})

test('a comment whose Delete waits out its window is drawn in place and counted nowhere', () => {
  const store = lists(
    list([
      c('a', { createdAt: NOW - 2 * MIN }),
      c('gone', { createdAt: NOW - MIN, deleting: NOW + 9000 }),
      c('p', { url: PRICING })
    ])
  )
  const vm = viewModel(store.getSnapshot(), { filter: 'all' })
  assert.deepEqual(
    vm.rows.map((r) => r.id),
    ['gone', 'a', 'p'],
    'in its place, newest first'
  )
  assert.equal(vm.rows[0].deleting, NOW + 9000)
  assert.deepEqual(vm.counts, { page: 1, all: 2 })
  assert.deepEqual(vm.statusCounts, { open: 2, resolved: 0 })
  assert.equal(vm.badge, 2)
  assert.equal(badgeCount(store.getSnapshot()), 2)
  assert.deepEqual(
    vm.visible.map((r) => r.id),
    ['a', 'p'],
    'Delete all never names it'
  )
  assert.deepEqual(
    vm.sendAll.map((r) => r.id),
    ['a', 'p']
  )
  assert.deepEqual(clearAct(store.getSnapshot(), { filter: 'all' })?.ids, ['a', 'p'])
  const home = pageGroups(vm.rows, vm.current).find((g) => g.onPage)
  assert.equal(home?.count, 1)
})

test('Open / Resolved: the rows of one status; the pills count that status; the status filter counts both for the page filter', () => {
  const store = lists(
    list([
      c('o1'),
      c('o2', { url: PRICING }),
      c('r1', { status: 'resolved', resolvedAt: NOW }),
      c('r2', { url: PRICING, status: 'resolved', resolvedAt: NOW }),
      c('r3', { url: PRICING, status: 'resolved', resolvedAt: NOW })
    ])
  )
  const open = viewModel(store.getSnapshot())
  assert.deepEqual(
    open.rows.map((r) => r.id),
    ['o1']
  )
  assert.deepEqual(open.counts, { page: 1, all: 2 })
  assert.deepEqual(open.statusCounts, { open: 1, resolved: 1 })
  const resolved = viewModel(store.getSnapshot(), { status: 'resolved', filter: 'all' })
  assert.deepEqual(resolved.rows.map((r) => r.id).sort(), ['r1', 'r2', 'r3'])
  assert.deepEqual(resolved.counts, { page: 1, all: 3 })
  assert.deepEqual(resolved.statusCounts, { open: 2, resolved: 3 })
  assert.deepEqual(resolved.sendAll, [], 'Ask Tracy to edit all is for open comments')
  assert.equal(resolved.badge, 2, 'the tab counts open comments, whatever the view')
})

test('L1: the page shown is always a group, first, even with no row of the chosen status', () => {
  const store = lists(list([c('p', { url: PRICING })]))
  const vm = viewModel(store.getSnapshot(), { filter: 'all' })
  const groups = pageGroups(vm.rows, vm.current)
  assert.deepEqual(
    groups.map((g) => [g.path, g.onPage, g.count]),
    [
      ['/', true, 0],
      ['/pricing/', false, 1]
    ]
  )
  assert.deepEqual(
    pageGroups(vm.rows).map((g) => g.path),
    ['/pricing/'],
    'no page shown: none forced'
  )
})

test('a comment anchored on a picture: its address and file name; nothing a page should not load', () => {
  assert.deepEqual(
    pictureOf({ image: { src: 'https://kinetic.tracy.site/img/hero%20panel.webp?v=2#x', alt: 'Ship fast' } }),
    {
      src: 'https://kinetic.tracy.site/img/hero%20panel.webp?v=2#x',
      name: 'hero panel.webp',
      alt: 'Ship fast'
    }
  )
  assert.deepEqual(pictureOf({ image: { src: '/', alt: 'Logo' } }), { src: '/', name: 'Logo', alt: 'Logo' })
  assert.equal(pictureOf({ image: { src: 'javascript:alert(1)' } }), null)
  assert.equal(pictureOf({ image: { src: 'data:image/png;base64,AAAA' } }), null)
  assert.equal(pictureOf({ tag: 'h1' }), null)
  const r = row(lists(list([c('i', { element: { tag: 'img', image: { src: '/a/b.png', alt: '' } } })])), 'i')
  assert.equal(r?.image?.name, 'b.png')
})

test('mentions: "@handle" at the start or after a space, never inside an e-mail address', () => {
  assert.deepEqual(textParts('@kimdesigner change this to “3,000+”'), [
    { text: '@kimdesigner', mention: true },
    { text: ' change this to “3,000+”', mention: false }
  ])
  assert.deepEqual(textParts('mail lee@example.com, cc @lee.'), [
    { text: 'mail lee@example.com, cc ', mention: false },
    { text: '@lee', mention: true },
    { text: '.', mention: false }
  ])
  assert.deepEqual(textParts('no mention'), [{ text: 'no mention', mention: false }])
})

// ── comment-reads.mjs ──

/**
 * A fake door: answers GET /reads with `reads`, POST /read with the number sent (or `keep`, the one the
 * server already held), /unread with null — or refuses. `hold` keeps GET /reads waiting until released.
 */
function door({ reads = [], keep, refuse = false, hold = false } = {}) {
  const calls = []
  let release = () => {}
  const fetch = async (url, init = {}) => {
    calls.push([init.method ?? 'GET', url, ...(init.body ? [JSON.parse(init.body)] : [])])
    if (refuse) return new Response('{}', { status: 403 })
    if (url.endsWith('/reads')) {
      if (hold) await new Promise((r) => (release = r))
      return new Response(JSON.stringify({ reads }), { status: 200 })
    }
    const unread = url.endsWith('/unread')
    const id = decodeURIComponent(url.split('/').at(-2))
    const seenN = unread ? null : Math.max(JSON.parse(init.body).seenN, keep ?? 0)
    return new Response(JSON.stringify({ read: { id, seenN } }), { status: 200 })
  }
  return { fetch, calls, release: () => release() }
}

test('reads: the marks of the server are filed; opening sends what the tab drew; Mark as unread files null', async () => {
  const store = lists(list([c('t', { n: 3 }), c('r', { n: 5, replyTo: 't' })]))
  const d = door({
    reads: [
      { id: 't', seenN: 3 },
      { id: 'u', seenN: null }
    ]
  })
  const reads = createCommentReads({ lists: store, siteKey: 'kinetic', fetch: d.fetch })
  await reads.load()
  assert.deepEqual(
    [...store.getSnapshot().reads.marks],
    [
      ['t', 3],
      ['u', null]
    ]
  )
  assert.equal(row(store, 't')?.unread, true, 'reply #5 is above #3')
  assert.equal(await reads.read('t'), true)
  assert.equal(store.getSnapshot().reads.marks.get('t'), 5)
  assert.equal(row(store, 't')?.unread, false)
  assert.equal(await reads.unread('t'), true)
  assert.equal(store.getSnapshot().reads.marks.get('t'), null)
  assert.deepEqual(d.calls, [
    ['GET', '/api/sites/kinetic/comments/reads'],
    ['POST', '/api/sites/kinetic/comments/t/read', { seenN: 5 }],
    ['POST', '/api/sites/kinetic/comments/t/unread']
  ])
})

test('reads: the mark the server keeps wins — another tab of hers saw further', async () => {
  const store = lists(list([c('t', { n: 3 })]), [])
  const reads = createCommentReads({ lists: store, siteKey: 'kinetic', fetch: door({ keep: 8 }).fetch })
  assert.equal(await reads.read('t'), true)
  assert.equal(store.getSnapshot().reads.marks.get('t'), 8)
})

test('reads: a /reads answer that was on its way never undoes a mark filed meanwhile', async () => {
  const store = lists(list([c('t', { n: 3 }), c('v', { n: 4 })]))
  const d = door({ reads: [{ id: 'v', seenN: 4 }], hold: true })
  const reads = createCommentReads({ lists: store, siteKey: 'kinetic', fetch: d.fetch })
  const loading = reads.load()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(await reads.read('t'), true)
  d.release()
  await loading
  assert.deepEqual(
    [...store.getSnapshot().reads.marks].sort(),
    [
      ['t', 3],
      ['v', 4]
    ],
    'the answer had no mark for t, yet t keeps the one filed while it was on its way'
  )
})

test('reads: a mark the door refuses is taken back — the row says what the server keeps', async () => {
  const store = lists(list([c('t')]), [['t', 1]])
  const reads = createCommentReads({ lists: store, siteKey: 'kinetic', fetch: door({ refuse: true }).fetch })
  assert.equal(await reads.unread('t'), false)
  assert.equal(store.getSnapshot().reads.marks.get('t'), 1)
  assert.equal(await reads.read('new'), false)
  assert.equal(store.getSnapshot().reads.marks.has('new'), false)
  assert.equal(readMarksOf({ nope: 1 }), null)
})

test('reads: no answer means no marks known, so nothing reads as unread', async () => {
  const store = lists(list([c('t')]))
  await createCommentReads({ lists: store, siteKey: 'kinetic', fetch: door({ refuse: true }).fetch }).load()
  assert.equal(store.getSnapshot().reads.ready, false)
  assert.equal(row(store, 't')?.unread, false)
})

// ── comment-working.mjs ──

test("working: a sent turn's comments while it works; not while it waits on a question; gone when it ends", () => {
  const target = new EventTarget()
  const seen = []
  const sentTurns = new Map([
    ['req-1', { commentIds: ['c1', 'c2'] }],
    ['req-2', {}]
  ])
  const watch = watchWorkingComments({ target, sentTurns, onChange: (ids) => seen.push([...ids].sort()) })
  const say = (type, requestId) =>
    target.dispatchEvent(
      new CustomEvent(type, { detail: { requestId, sessionId: 's1', siteKey: 'kinetic' } })
    )
  say('tracy:tracy-working', 'req-2')
  say('tracy:tracy-working', 'turn:s1:3')
  assert.deepEqual(seen, [], 'a page send or a typed turn names no comment')
  say('tracy:tracy-working', 'req-1')
  assert.deepEqual(watch.ids(), new Set(['c1', 'c2']))
  say('tracy:tracy-asking', 'req-1')
  assert.deepEqual(watch.ids(), new Set())
  say('tracy:tracy-working', 'req-1')
  say('tracy:turn-end', 'req-1')
  assert.deepEqual(seen, [['c1', 'c2'], [], ['c1', 'c2'], []])
  watch.stop()
  say('tracy:tracy-working', 'req-1')
  assert.equal(seen.length, 4, 'stopped')
})
