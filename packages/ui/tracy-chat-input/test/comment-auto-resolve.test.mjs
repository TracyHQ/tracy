/**
 * Comments Tracy resolves on proof of a write (ADR 0025, Brian 03–04/10/2026), the chat column's half:
 * a comment Tracy resolved reads "Tracy marked this done"; "Ask Tracy to edit all" leaves the open
 * comments already sent and waiting unticked (the server's `/comments/sent`), each with its "Sent
 * 23:43"; and the report under a comment turn sorts the turn's comments into done and not confirmed
 * (the server's `/comments/report`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { reportOf, reportDoor } from '../src/client/comment-report.mjs'
import {
  checklistDefaults,
  createCommentLists,
  readCommentList,
  readSentList,
  revealDetail,
  rowsOf,
  statusOf,
  viewModel
} from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 9, 4, 12)
const MIN = 60_000
const HOME = 'https://kinetic.tracy.site/'
const LEE = { accountId: 'a2', email: 'patowner@example.com', name: 'Lee', initial: 'L' }
const TRACY = { accountId: '', email: '', name: 'Tracy', initial: 'T', tracy: true }
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
const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'kinetic',
  host: 'kinetic.tracy.site',
  active: true,
  url: HOME,
  comments
})
function lists(l) {
  const store = createCommentLists()
  store.accept(l)
  store.focus('s1')
  return store
}

test('a comment Tracy resolved is tagged "Tracy marked this done"; one a person resolved is not', () => {
  const byTracy = readCommentList(
    list([c('x', { status: 'resolved', resolvedAt: NOW, resolvedBy: TRACY, sentToTracy: true })])
  )?.comments[0]
  assert.equal(statusOf(byTracy), 'tracy')
  const byLee = readCommentList(
    list([c('x', { status: 'resolved', resolvedAt: NOW, resolvedBy: LEE, sentToTracy: true })])
  )?.comments[0]
  assert.notEqual(statusOf(byLee), 'tracy')
  // The server's own flag reads the same, whatever `resolvedBy` the source kept.
  const flagged = readCommentList(list([c('x', { status: 'resolved', resolvedByTracy: true })]))?.comments[0]
  assert.equal(statusOf(flagged), 'tracy')
  // Reopened (a reply): open again, so never Tracy's.
  const reopened = readCommentList(list([c('x', { status: 'pending', resolvedByTracy: false })]))?.comments[0]
  assert.notEqual(statusOf(reopened), 'tracy')
})

test('a comment Tracy did, reopened by a reply, loses "Done by Tracy" in the list (e2e E4.4b)', () => {
  const sends = [
    {
      author: LEE,
      at: new Date(NOW - 9 * MIN).toISOString(),
      answeredAt: new Date(NOW - 8 * MIN).toISOString()
    }
  ]
  // Done and resolved by Tracy: "Tracy marked this done".
  const resolved = lists(
    list([
      c('c2', {
        status: 'resolved',
        resolvedAt: NOW - 8 * MIN,
        resolvedByTracy: true,
        sentToTracy: true,
        sends
      })
    ])
  )
  assert.equal(rowsOf(resolved.getSnapshot()).find((r) => r.id === 'c2')?.status, 'tracy')
  // Answered but not resolved, nobody wrote since: still "Done by Tracy".
  const answered = lists(list([c('c2', { sentToTracy: true, sends })]))
  assert.equal(rowsOf(answered.getSnapshot()).find((r) => r.id === 'c2')?.status, 'done')
  // A reply after Tracy's write reopened it (status pending, resolvedByTracy false): the write no
  // longer answers the thread, so the row waits for its next send — a note, not "Done by Tracy".
  const reopened = lists(
    list([
      c('c2', { status: 'pending', resolvedByTracy: false, sentToTracy: true, sends }),
      c('reply', { replyTo: 'c2', createdAt: NOW - 7 * MIN })
    ])
  )
  assert.equal(rowsOf(reopened.getSnapshot()).find((r) => r.id === 'c2')?.status, 'note')
  // A reply written BEFORE Tracy's write does not undo it.
  const earlier = lists(
    list([c('c2', { sentToTracy: true, sends }), c('reply', { replyTo: 'c2', createdAt: NOW - 8.5 * MIN })])
  )
  assert.equal(rowsOf(earlier.getSnapshot()).find((r) => r.id === 'c2')?.status, 'done')
})

test('the sent list as the server answers it: ids with their send time; anything malformed dropped', () => {
  const sent = readSentList({
    sent: [
      { id: 'a', at: '2026-10-04T11:43:00.000Z' },
      { id: 'b', at: 'not a time' },
      { id: 7, at: '2026-10-04T11:43:00.000Z' },
      null
    ]
  })
  assert.deepEqual([...sent], [['a', Date.parse('2026-10-04T11:43:00.000Z')]])
  assert.deepEqual([...readSentList(null)], [])
  assert.deepEqual([...readSentList({ sent: 'x' })], [])
})

test('"Ask Tracy to edit all" ticks the comments never sent or written to since; the rest wait unticked', () => {
  const store = lists(
    list([
      c('never'),
      c('waiting', { sentToTracy: true }),
      c('again', { sentToTracy: true }),
      c('r', { replyTo: 'again' })
    ])
  )
  const vm = viewModel(store.getSnapshot(), { filter: 'all' })
  // The server lists `waiting` only: `again` got a reply after its send; `elsewhere` is not in the view.
  const sent = new Map([
    ['waiting', NOW - 5 * MIN],
    ['elsewhere', NOW]
  ])
  const { unticked, sentAt } = checklistDefaults(vm, sent)
  assert.deepEqual([...unticked], ['waiting'])
  assert.deepEqual([...sentAt], [['waiting', NOW - 5 * MIN]])
  // Nothing known from the server: every comment ticked, as before.
  assert.deepEqual([...checklistDefaults(vm, new Map()).unticked], [])
})

test('the report of a comment turn: done and not confirmed, in send order; nothing when the turn sent no comment', () => {
  const report = reportOf({
    turn: 's1:2',
    comments: [
      { id: 'a', text: 'Footer says Lantern', done: true },
      { id: 'b', text: 'Header says Lantern', done: false },
      { id: 'c', text: '', done: true },
      { id: 4, text: 'malformed', done: true }
    ]
  })
  assert.deepEqual(report, {
    done: [
      { id: 'a', text: 'Footer says Lantern' },
      { id: 'c', text: '' }
    ],
    unconfirmed: [{ id: 'b', text: 'Header says Lantern' }]
  })
  assert.equal(reportOf({ turn: 's1:2', comments: [] }), null)
  assert.equal(reportOf(null), null)
  assert.equal(
    reportDoor('kinetic.tracy.site', 'sess-1', 3),
    '/api/sites/kinetic.tracy.site/comments/report?turn=sess-1%3A3'
  )
})

test('a report line reveals its comment through the Browser tab that lists it, or nowhere', () => {
  const store = lists(list([c('a'), c('b', { status: 'resolved', resolvedByTracy: true, resolvedAt: NOW })]))
  assert.deepEqual(revealDetail(store.getSnapshot(), 'b'), {
    tabId: 'tab-a',
    sessionId: 's1',
    kind: 'reveal',
    ids: ['b']
  })
  assert.equal(revealDetail(store.getSnapshot(), 'gone'), null)
  assert.ok(rowsOf(store.getSnapshot()).some((r) => r.id === 'b'))
})
