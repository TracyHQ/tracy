/**
 * The Comments tab's model since stage 6 (stories CommentsTabPeopleOnly · CommentsTabRowOpensCard ·
 * PageCommentBox · CommentsTabPeopleOnlyEmpty · SendNChecklist in
 * `packages/dev/tracy-design/src/mockups/browser-comment.mock.stories.tsx`; contract §H2): people
 * comments only, groups Open and Resolved; a row is avatar in the author's colour, name, time, chip,
 * words, "N replies" and a quick Resolve; no status words and no Tracy lines. The Open head's "Clear
 * all" acts on the comments of THIS page, "Send all (N) to Tracy" on every open one (round 3); the badge counts every open comment of
 * the site, all authors.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NEUTRAL_FACE_COLOUR as CORE_NEUTRAL } from '@tracy/core/team/address-face'

import {
  COMMENT_ACT_EVENT,
  COMMENT_LIST_EVENT
} from '../../../site/tracy-site-tabs/src/client/comment-reveal.mjs'

import {
  ACT_EVENT,
  authorOf,
  NEUTRAL_FACE_COLOUR,
  badgeCount,
  clearAct,
  createCommentLists,
  elementKind,
  LIST_EVENT,
  readCommentList,
  sendAct,
  shortAge,
  viewModel
} from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 8, 29, 21, 0, 0)
const MIN = 60_000
const HOME = 'https://northgate-ind.ru/'
const NEWS = 'https://northgate-ind.ru/news'
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L', color: '#4f46e5' }
const MAI = { accountId: 'a-mai', email: 'mai@northgate.ru', name: 'Mai', initial: 'M', color: '#0d9488' }
const MENU = {
  url: HOME,
  selector: 'nav a:nth-of-type(3)',
  label: 'Menu item "Services"',
  tag: 'a',
  marks: ['menuItem:104']
}
const STAT = { url: HOME, selector: '.stats p', text: '13 subsidiaries', tag: 'p' }

/** @param {string} id @param {object} [extra] */
const c = (id, extra = {}) => ({
  id,
  n: 1,
  url: HOME,
  text: `words of ${id}`,
  status: 'pending',
  createdAt: NOW - 10 * MIN,
  element: MENU,
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
  siteKey: 'northgate',
  host: 'northgate-ind.ru',
  active: true,
  url: HOME,
  comments,
  ...extra
})
const model = (...lists) => {
  const store = createCommentLists()
  for (const l of lists) store.accept(l)
  return { store, vm: viewModel(store.getSnapshot()), snapshot: store.getSnapshot() }
}

// Site changes listens for the list and sends the reveal act on the same window events (comment-reveal.mjs).
test('the event names are the ones Site changes uses', () => {
  assert.equal(LIST_EVENT, COMMENT_LIST_EVENT)
  assert.equal(ACT_EVENT, COMMENT_ACT_EVENT)
})

test('a stage-6 row needs no status and no number; old rows (with them) still read', () => {
  const read = readCommentList(
    list([
      { id: 'p1', url: HOME, text: 'no status, no n', createdAt: NOW, element: MENU, author: MAI },
      c('p2', { status: 'done', n: 7 }),
      c('p3', { status: 'draft' }),
      { id: 'p4', text: '' },
      null
    ])
  )
  assert.deepEqual(
    read?.comments.map((x) => x.id),
    ['p1', 'p2']
  )
})

test('open or resolved is all a comment is: any old status reads open, `resolved` (or a resolvedAt alone) resolved', () => {
  const { vm } = model(
    list([
      c('o1', { status: 'sent' }),
      c('o2', { status: 'asked' }),
      c('o3', { status: undefined }),
      c('r1', { status: 'resolved', resolvedAt: NOW - MIN, resolvedBy: MAI }),
      c('r2', { status: undefined, resolvedAt: NOW - 2 * MIN })
    ])
  )
  assert.deepEqual(
    vm.open.map((r) => r.id),
    ['o1', 'o2', 'o3']
  )
  assert.deepEqual(
    vm.resolved.map((r) => r.id),
    ['r1', 'r2']
  )
  // Brian 23:45: who resolved it is the thread card's to say, not the row's.
  assert.equal('resolvedBy' in vm.resolved[0], false)
})

test('Brian 23:25: both groups list NEWEST FIRST by the thread’s last activity — its own time or its latest reply', () => {
  const { vm } = model(
    list([
      c('old-busy', { createdAt: NOW - 60 * MIN }),
      c('r1', { replyTo: 'old-busy', createdAt: NOW - 2 * MIN }),
      c('mid', { createdAt: NOW - 20 * MIN }),
      c('new', { createdAt: NOW - 5 * MIN }),
      c('res-old', { status: 'resolved', createdAt: NOW - 90 * MIN, resolvedAt: NOW - MIN }),
      c('res-new', { status: 'resolved', createdAt: NOW - 30 * MIN, resolvedAt: NOW - 50 * MIN }),
      c('r2', { replyTo: 'res-old', createdAt: NOW - 80 * MIN })
    ])
  )
  assert.deepEqual(
    vm.open.map((r) => r.id),
    ['old-busy', 'new', 'mid'],
    'a reply 2 minutes ago puts its hour-old thread on top'
  )
  assert.deepEqual(
    vm.resolved.map((r) => r.id),
    ['res-new', 'res-old'],
    'by activity (words and replies), not by when it was resolved'
  )
  assert.equal(vm.open[0].lastActivity, NOW - 2 * MIN)
  // "Send all" lists the same order.
  assert.deepEqual(
    vm.sendAll.map((r) => r.id),
    ['old-busy', 'new', 'mid']
  )
})

test('a row: author, initial and colour, chip words, kind, words; replies collapse into a count', () => {
  const { vm } = model(
    list([
      c('p1', { author: MAI, element: STAT, text: 'We have 14 subsidiaries now.', replyCount: 2 }),
      c('r1', { replyTo: 'p1', author: LEE, text: 'The About page says 13 as well.' })
    ])
  )
  assert.equal(vm.open.length, 1, 'a reply is never a row of its own')
  const [row] = vm.open
  assert.equal(row.author, 'Mai')
  assert.equal(row.initial, 'M')
  assert.equal(row.color, MAI.color, "the server's colour, drawn as sent")
  assert.equal(row.chip, '"13 subsidiaries"')
  assert.equal(row.kind, 'text')
  assert.equal(row.text, 'We have 14 subsidiaries now.')
  assert.equal(row.replies, 2)
  assert.equal(row.path, '/')
  assert.equal(row.onPage, true)
})

test('"N replies" without a replyCount (an older fork): the replies it lists, live ones only', () => {
  const { vm } = model(
    list([
      c('p1', { replyCount: undefined }),
      c('r1', { replyTo: 'p1' }),
      c('r2', { replyTo: 'p1' }),
      c('r3', { replyTo: 'p1', removed: true, text: '' })
    ])
  )
  assert.equal(vm.open[0].replies, 2)
})

test('a comment on another page says its path (UI fine-tune: no site name); a whole-page comment is the page kind with its path', () => {
  const { store } = model(list([c('n1', { url: NEWS, element: null }), c('g1', { element: null })]))
  const vm = viewModel(store.getSnapshot(), { filter: 'all' })
  const byId = Object.fromEntries(vm.open.map((r) => [r.id, r]))
  assert.equal(byId.n1.path, '/news')
  assert.equal(byId.n1.onPage, false)
  assert.equal(byId.n1.kind, 'page')
  assert.equal(byId.n1.chip, '/news')
  assert.equal(byId.g1.onPage, true)
  assert.equal(byId.g1.chip, '/')
})

test('two Browser tabs of one site list the same server comments once, the shown tab’s copy', () => {
  const { vm, snapshot } = model(
    list([c('p1'), c('p2')], { tabId: 'tab-b', active: false }),
    list([c('p1'), c('p2')], { tabId: 'tab-a', active: true })
  )
  assert.deepEqual(
    vm.open.map((r) => `${r.tabId}:${r.id}`),
    ['tab-a:p1', 'tab-a:p2']
  )
  assert.equal(badgeCount(snapshot), 2)
})

test('the badge (redesign A, Akemi 01/10/2026): every open comment of the site, all authors — other pages counted, replies and resolved not', () => {
  const { snapshot } = model(
    list([
      c('mine'),
      c('theirs', { author: MAI, can: { edit: false, delete: false } }),
      c('elsewhere', { url: NEWS }),
      c('reply', { replyTo: 'mine' }),
      c('done', { status: 'resolved', resolvedAt: NOW }),
      c('gone', { removed: true, text: '' })
    ])
  )
  assert.equal(badgeCount(snapshot), 3)
  assert.equal(badgeCount(createCommentLists().getSnapshot()), 0)
})

test('Send all (round 3; UI fine-tune: on All pages): every open comment listed, anyone’s, sent before or not, any page', () => {
  const { store } = model(
    list([
      c('p5', { sentToTracy: true }),
      c('p6', { sentToTracy: true }),
      c('p1', { author: MAI, sentToTracy: true }),
      c('p2', { author: MAI, can: { edit: false, delete: false } }),
      c('p3'),
      c('n1', { url: NEWS }),
      c('r1', { replyTo: 'p2' }),
      c('p4', { status: 'resolved', resolvedAt: NOW })
    ])
  )
  const vm = viewModel(store.getSnapshot(), { filter: 'all' })
  assert.deepEqual(vm.sendAll.map((r) => r.id).sort(), ['n1', 'p1', 'p2', 'p3', 'p5', 'p6'])
  assert.deepEqual(sendAct(vm, ['p2', 'p3']), {
    tabId: 'tab-a',
    sessionId: 's1',
    kind: 'send',
    ids: ['p2', 'p3']
  })
  // Only what is still on the list is sent; nothing ticked is no act.
  assert.deepEqual(sendAct(vm, ['p3', 'gone']), {
    tabId: 'tab-a',
    sessionId: 's1',
    kind: 'send',
    ids: ['p3']
  })
  assert.equal(sendAct(vm, []), null)
})

test('Delete all (UI fine-tune 30/09, redesign A): what Current page shows, everyone’s; the chosen status only; never another page’s', () => {
  const { snapshot } = model(
    list([
      c('mine'),
      c('theirs', { author: MAI, can: { edit: false, delete: false } }),
      c('elsewhere', { url: NEWS }),
      c('done', { status: 'resolved', resolvedAt: NOW })
    ])
  )
  assert.deepEqual(clearAct(snapshot), {
    tabId: 'tab-a',
    sessionId: 's1',
    kind: 'clear',
    ids: ['mine', 'theirs']
  })
  // Comments list redesign A: the Resolved view deletes what it shows, the resolved ones only.
  assert.deepEqual(clearAct(snapshot, { status: 'resolved' })?.ids, ['done'])
  assert.equal(clearAct(model(list([c('elsewhere', { url: NEWS })])).snapshot), null)
})

test('empty: nothing heard, or a tab with no comment', () => {
  assert.equal(viewModel(createCommentLists().getSnapshot()).empty, true)
  assert.equal(model(list([])).vm.empty, true)
  assert.equal(model(list([c('p1')])).vm.empty, false)
})

// The face contract (`tasks/evidence/team-badge-count/contract.md` §3): the server decides a person's
// letter and colour by ACCOUNT; two people with one name keep their own colours.
const SAM_1 = {
  accountId: 'acc-sam-1',
  email: 'sam.one@example.com',
  name: 'Sam Tester',
  initial: 'S',
  color: '#db2777'
}
const SAM_2 = {
  accountId: 'acc-sam-2',
  email: 'sam.two@example.com',
  name: 'Sam Tester',
  initial: 'S',
  color: '#c026d3'
}

test('an author’s face is the server’s: its letter and colour as sent, nothing hashed in the browser', () => {
  assert.deepEqual(
    [authorOf(SAM_1), authorOf(SAM_2)].map((a) => [a.name, a.initial, a.color]),
    [
      ['Sam Tester', 'S', '#db2777'],
      ['Sam Tester', 'S', '#c026d3']
    ]
  )
  assert.equal(authorOf({ ...LEE, color: '#0284c7' }).color, '#0284c7')
  // No colour from the server (a comment written a moment ago, an older server): the neutral grey,
  // never a colour guessed from the name.
  const { color: _, ...noColour } = LEE
  assert.equal(authorOf(noColour).color, NEUTRAL_FACE_COLOUR)
  assert.equal(authorOf(undefined).color, NEUTRAL_FACE_COLOUR)
  // A bad colour is not trusted either.
  assert.equal(authorOf({ ...LEE, color: 'red;background:url(x)' }).color, NEUTRAL_FACE_COLOUR)
})

test('the grey of a face with no server colour is core’s own, not a second copy', () => {
  assert.equal(NEUTRAL_FACE_COLOUR, CORE_NEUTRAL)
})

test('an author’s photo rides with their face: authorOf and the row keep the server’s avatarUrl', () => {
  const photo = 'https://cdn.example.test/lee.png'
  assert.equal(authorOf({ ...LEE, avatarUrl: photo }).avatarUrl, photo)
  assert.equal(authorOf(LEE).avatarUrl, null, 'no photo sent: none')
  assert.equal(authorOf({ ...LEE, avatarUrl: 42 }).avatarUrl, null, 'not a string: none')
  assert.equal(authorOf(undefined).avatarUrl, null)
  const { vm } = model(list([c('p1', { author: { ...LEE, avatarUrl: photo } }), c('p2')]))
  assert.deepEqual(
    vm.open.map((r) => [r.id, r.initial, r.color, r.avatarUrl]),
    [
      ['p1', 'L', '#4f46e5', photo],
      ['p2', 'L', '#4f46e5', null]
    ]
  )
})

test('authorOf: the real name, else the email before the at sign, never "You"; the initial', () => {
  assert.deepEqual([authorOf(LEE).name, authorOf(LEE).initial], ['Lee', 'L'])
  assert.deepEqual(
    [
      authorOf({ email: 'akemi.sato@example.com' }).name,
      authorOf({ email: 'akemi.sato@example.com' }).initial
    ],
    ['akemi.sato', 'A']
  )
  assert.equal(authorOf(undefined).name, '')
})

test('element kinds: image, menu item, link, heading, words, region; page for none', () => {
  assert.equal(elementKind(null), 'page')
  assert.equal(elementKind({ tag: 'img' }), 'image')
  assert.equal(elementKind(MENU), 'menu')
  assert.equal(elementKind({ tag: 'a' }), 'link')
  assert.equal(elementKind({ tag: 'h2', text: 'x' }), 'heading')
  assert.equal(elementKind(STAT), 'text')
  assert.equal(elementKind({ tag: 'section' }), 'section')
})

test("a row's time, short (redesign A): now, then minutes, hours, days, weeks, years", () => {
  assert.deepEqual(shortAge(NOW - 30_000, NOW), { key: 'comments.age.now' })
  assert.deepEqual(shortAge(NOW - 2 * MIN, NOW), { key: 'comments.age.minutes', count: 2 })
  assert.deepEqual(shortAge(NOW - 3 * 60 * MIN, NOW), { key: 'comments.age.hours', count: 3 })
  assert.deepEqual(shortAge(NOW - 30 * 60 * MIN, NOW), { key: 'comments.age.days', count: 1 })
  assert.deepEqual(shortAge(NOW - 15 * 24 * 60 * MIN, NOW), { key: 'comments.age.weeks', count: 2 })
  assert.deepEqual(shortAge(NOW - 800 * 24 * 60 * MIN, NOW), { key: 'comments.age.years', count: 2 })
})
