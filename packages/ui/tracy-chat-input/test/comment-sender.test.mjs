/**
 * The words typed in a thread card are the SENDER's (round 3, found by the fork agent 30/09): the v3 item's
 * `author` is the comment's author (the chip's bubble), so the turn printed `<root author> (now): <typed words>`
 * — Mai's name on Lee's words, which the thread sentence tells Tracy to read as Mai speaking. The chat column
 * knows who is signed in; the `(now)` line now carries that person, told apart from a namesake by the start of
 * their e-mail. A send of a comment as it stands (Send all, a row) keeps its author: those are their words.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listenForComments } from '../src/client/comment-send.mjs'
import { createCommentLists, senderOf, storedTextOf } from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)
const MIN = 60_000
const HOME = 'https://northgate-ind.ru/'
const STAT = { url: HOME, selector: '.stats p', text: '13 subsidiaries' }
const MAI = { name: 'Mai', email: 'mai@northgate.ru' }
const LEE = { name: 'Lee', email: 'lee@example.com' }
const LEE_OTHER = { name: 'Lee', email: 'lee.nguyen@northgate.ru' }

/** Send one v3 detail through the real listener; resolve with the turn text handed to dsh. */
async function send(detail, deps) {
  const target = new EventTarget()
  /** @type {string[]} */
  const sent = []
  const session = { getSnapshot: () => ({ running: false, subagent: null }) }
  const stop = listenForComments({
    target,
    sessions: { binding: () => ({ session }) },
    conversation: {
      sendSession: async (_s, text) => {
        sent.push(text)
        return { kind: 'success' }
      }
    },
    siteKey: () => 'northgate',
    now: () => NOW,
    ...deps
  })
  const done = new Promise((resolve) => {
    target.addEventListener('tracy:comment-sent', resolve, { once: true })
    target.addEventListener('tracy:comment-failed', resolve, { once: true })
  })
  target.dispatchEvent(
    new CustomEvent('tracy:comment-send', {
      detail: { v: 3, sessionId: 's1', siteKey: 'northgate', ...detail }
    })
  )
  await done
  stop()
  return sent[0] ?? ''
}
const threadLines = (turn) => [...turn.matchAll(/\nthread: ([^\n]*)/g)].map((m) => m[1])

/** A thread card send: Mai's comment and Lee's reply are the thread; Lee typed new words. */
const fromCard = (typedBy) => ({
  requestId: `card-${typedBy.email}`,
  items: [
    {
      n: 200,
      url: HOME,
      element: STAT,
      text: 'Update it on both pages, please.',
      author: MAI,
      commentId: 'c-mai',
      thread: [
        { author: MAI, at: NOW - 20 * MIN, text: 'We have 14 subsidiaries now.' },
        { author: LEE, at: NOW - 6 * MIN, text: 'The About page says 13 as well.' }
      ]
    }
  ]
})
const stored = (id) => (id === 'c-mai' ? 'We have 14 subsidiaries now.' : undefined)

test('a thread card send whose root author is not the sender: the (now) line is the sender', async () => {
  const turn = await send(fromCard(LEE), { sender: () => LEE, storedText: stored })
  assert.deepEqual(threadLines(turn), [
    'Mai (20m ago): We have 14 subsidiaries now.',
    'Lee (6m ago): The About page says 13 as well.',
    'Lee (now): Update it on both pages, please.'
  ])
  // The chip still wears the comment's author.
  assert.match(turn, /<mentioned-element n="200" [^\n]* author="Mai">/)
})

test('a sender who shares a name with someone in the thread is told apart by the start of the e-mail', async () => {
  const turn = await send(fromCard(LEE_OTHER), { sender: () => LEE_OTHER, storedText: stored })
  assert.deepEqual(threadLines(turn).slice(1), [
    'Lee (lee) (6m ago): The About page says 13 as well.',
    'Lee (lee.nguyen) (now): Update it on both pages, please.'
  ])
})

test('Send all / a row: the comment goes as it stands — its author and its time, no (now) (e2e v5, V5S-7)', async () => {
  const turn = await send(
    {
      requestId: 'row',
      items: [
        {
          n: 201,
          url: HOME,
          element: STAT,
          text: 'We have 14 subsidiaries now.',
          author: MAI,
          at: NOW - 20 * MIN,
          commentId: 'c-mai',
          thread: [{ author: LEE, at: NOW - 6 * MIN, text: 'The About page says 13 as well.' }]
        }
      ]
    },
    { sender: () => LEE, storedText: stored }
  )
  assert.deepEqual(threadLines(turn), [
    'Mai (20m ago): We have 14 subsidiaries now.',
    'Lee (6m ago): The About page says 13 as well.'
  ])
})

test('no sender known: the turn stays as before (the item author), nothing invented', async () => {
  const turn = await send(fromCard(LEE), { storedText: stored })
  assert.equal(threadLines(turn).at(-1), 'Mai (now): Update it on both pages, please.')
})

const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'northgate',
  host: 'northgate-ind.ru',
  active: true,
  url: HOME,
  comments
})
const comment = (id, author, extra = {}) => ({
  id,
  url: HOME,
  text: `words of ${id}`,
  createdAt: NOW,
  element: STAT,
  author,
  ...extra
})

test('senderOf: the seat’s e-mail named as its comments name it; else the part before the at sign', () => {
  const lists = createCommentLists()
  lists.accept(list([comment('a', { ...MAI, accountId: 'm' }), comment('b', { ...LEE, accountId: 'l' })]))
  const snap = lists.getSnapshot()
  assert.deepEqual(senderOf(snap, 'LEE@example.com'), { name: 'Lee', email: 'lee@example.com' })
  assert.deepEqual(senderOf(snap, 'akemi@example.com'), { name: 'akemi', email: 'akemi@example.com' })
})

test('senderOf without an e-mail (no /auth/me here): the author of a comment the seat may edit, else null', () => {
  const lists = createCommentLists()
  lists.accept(
    list([comment('a', MAI, { can: { edit: false } }), comment('b', LEE, { can: { edit: true } })])
  )
  assert.deepEqual(senderOf(lists.getSnapshot(), null), { name: 'Lee', email: 'lee@example.com' })
  const none = createCommentLists()
  none.accept(list([comment('a', MAI, { can: { edit: false } })]))
  assert.equal(senderOf(none.getSnapshot(), null), null)
})

test('storedTextOf: the words a listed comment holds now; undefined for one not listed', () => {
  const lists = createCommentLists()
  lists.accept(list([comment('a', MAI)]))
  assert.equal(storedTextOf(lists.getSnapshot(), 'a'), 'words of a')
  assert.equal(storedTextOf(lists.getSnapshot(), 'zz'), undefined)
})

// Stage-6 acceptance e2e v4 (thread, V4-2, 30/09): A deleted a root that had B's reply; B typed in that
// card ("Comment deleted") and pressed Send to Tracy — Tracy got B's words as A's
// (`Sam Tester (e2e3-thread-a) (now): …`). The deleted root is listed with no words, so `storedTextOf`
// found nothing and no sender was set. Words typed in a card are the signed-in sender's, whatever state
// the root is in.
test('V4-2: words typed in a deleted root’s card are the sender’s, not the deleted root author’s', async () => {
  const A = { name: 'Sam Tester', email: 'e2e3-thread-a@example.test' }
  const B = { name: 'Sam Tester', email: 'e2e3-thread-b@example.test' }
  const lists = createCommentLists()
  lists.accept(
    list([
      comment('root', A, { removed: true, text: '', replyCount: 1 }),
      comment('r1', B, { replyTo: 'root', text: 'I think 14 is right.' })
    ])
  )
  const turn = await send(
    {
      requestId: 'tomb-card',
      items: [
        {
          n: 300,
          url: HOME,
          element: STAT,
          text: 'V4 TOMB3 send by B: update it everywhere.',
          author: A,
          commentId: 'root',
          thread: [{ author: B, at: NOW - 2 * MIN, text: 'I think 14 is right.' }]
        }
      ]
    },
    { sender: () => B, storedText: (id) => storedTextOf(lists.getSnapshot(), id) }
  )
  assert.equal(
    threadLines(turn).at(-1),
    'Sam Tester (e2e3-thread-b) (now): V4 TOMB3 send by B: update it everywhere.'
  )
})

test('storedTextOf: a deleted root kept for its replies holds no words (empty), not "not listed"', () => {
  const lists = createCommentLists()
  lists.accept(
    list([
      comment('root', MAI, { removed: true, text: '', replyCount: 1 }),
      comment('r', LEE, { replyTo: 'root' })
    ])
  )
  assert.equal(storedTextOf(lists.getSnapshot(), 'root'), '')
})
