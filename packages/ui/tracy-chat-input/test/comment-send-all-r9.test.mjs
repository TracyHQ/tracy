/**
 * Send all types no words (stage-6 acceptance e2e v5, SEND-v5-new-13 / V5S-7, 30/09): every comment goes
 * as it stands, so every thread line keeps its real author and time. Measured on the stand: a comment
 * written 3–4 h earlier, sent alone by Send all, reached Tracy as `thread: e2e3-send-a (now): …` (the same
 * comment in a grouped block read `(4h ago, comment 115)`), and each thread carried 5–6 repeated
 * `thread: sent to Tracy by …` lines. `(now)` belongs only to words typed in this send by the sender; an
 * earlier send is one line, however many comments of one block (or the item and its thread) list it.
 *
 * The fixture is a real Send all, v3 detail as the fork builds it (`commentSendDetailV3` over
 * `itemOf(c, null)`: the comment's stored words as `text`, its `createdAt` as `at`, the replies under it
 * and the server's `sends` of its first message as `thread`), through the real listener.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listenForComments } from '../src/client/comment-send.mjs'
import { buildCommentTurn } from '../src/client/comment-turn.mjs'

const NOW = Date.UTC(2026, 8, 30, 8, 0, 0)
const MIN = 60_000
const HOUR = 60 * MIN
const HOME = 'https://e3sw0330.tracy.test/'
const H1 = { url: HOME, selector: 'h1', label: 'Heading', text: 'Building the groundwork' }
const H2 = { url: HOME, selector: 'section.services h2', label: 'Heading', text: 'Four core service lines' }
const FOOT = { url: HOME, selector: 'footer p', label: 'Paragraph', text: 'Company info' }
const ABOUT = { url: HOME, selector: '.about p', label: 'Paragraph', text: 'Founded in 1998' }
const A = { name: 'Sam Tester', email: 'e2e3-send-a@example.test' }
const B = { name: 'Sam Tester', email: 'e2e3-send-b@example.test' }

/** What the Comments view lists: every comment's stored words, by id (a tombstone lists ''). */
const STORED = new Map([
  ['c-h1', 'E3S-X01 A: shorten this heading.'],
  ['c-h2a', 'E3S-X01 A: call them service areas.'],
  ['c-h2b', 'E3S-S06 B: keep "lines", it is the brand word.'],
  // Stored as typed (trailing spaces, a Windows line break); the fork sends it trimmed.
  ['c-foot', 'E5S footer:\r\nadd the tax number.  '],
  ['c-tomb', '']
])

/** One earlier Send all at 07:00 carried every thread, so each first message lists that send. */
const SEND_ALL_1 = NOW - HOUR
/** A second one at 07:30 carried only H1 (and the group, whose two rows share that instant). */
const SEND_ALL_2 = NOW - 30 * MIN

const detail = {
  v: 3,
  sessionId: 's1',
  siteKey: 'e3sw0330',
  requestId: 'send-all-r9',
  items: [
    // A lone comment written 3 h ago, sent twice before, one reply by B.
    {
      n: 130,
      url: HOME,
      element: H1,
      locate: null,
      text: STORED.get('c-h1'),
      author: A,
      at: NOW - 3 * HOUR,
      commentId: 'c-h1',
      thread: [
        { author: B, at: NOW - 2 * HOUR - 30 * MIN, text: 'Agreed, it wraps on phones.' },
        { author: A, at: SEND_ALL_1, sent: true },
        { author: A, at: SEND_ALL_2, sent: true }
      ]
    },
    // Two comments on one element: ONE block. Each first message lists the same two Send alls (one
    // request row per comment, same instant) — each is one line in the block, not two.
    {
      n: 131,
      url: HOME,
      element: H2,
      locate: null,
      text: STORED.get('c-h2a'),
      author: A,
      at: NOW - 4 * HOUR,
      commentId: 'c-h2a',
      // Its rows a few ms off the other comment's (one POST, rows written one by one).
      thread: [
        { author: A, at: SEND_ALL_1 - 40, sent: true },
        { author: A, at: SEND_ALL_2 - 40, sent: true }
      ]
    },
    {
      n: 132,
      url: HOME,
      element: H2,
      locate: null,
      text: STORED.get('c-h2b'),
      author: B,
      at: NOW - 3 * HOUR - 10 * MIN,
      commentId: 'c-h2b',
      thread: [
        { author: A, at: SEND_ALL_1, sent: true },
        { author: A, at: SEND_ALL_2, sent: true }
      ]
    },
    // A lone comment whose stored words differ from the item's only by white space, one reply.
    {
      n: 133,
      url: HOME,
      element: FOOT,
      locate: null,
      text: 'E5S footer:\nadd the tax number.',
      author: B,
      at: NOW - 5 * HOUR,
      commentId: 'c-foot',
      thread: [{ author: A, at: NOW - 4 * HOUR, text: 'And the VAT id.' }]
    },
    // A root its author deleted while B's reply stands (TH-4): no words, only its reply.
    {
      n: 134,
      url: HOME,
      element: ABOUT,
      locate: null,
      text: '',
      author: A,
      at: NOW - 6 * HOUR,
      commentId: 'c-tomb',
      thread: [
        { author: B, at: NOW - 5 * HOUR, text: 'Say 1997, not 1998.' },
        { author: A, at: SEND_ALL_1, sent: true }
      ]
    }
  ]
}

/** Send `d` through the real listener, the signed-in seat `sender`; resolve with the turn handed to dsh. */
async function send(d, sender = () => A) {
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
    siteKey: () => 'e3sw0330',
    now: () => NOW,
    sender,
    storedText: (id) => STORED.get(id)
  })
  const done = new Promise((resolve) => {
    target.addEventListener('tracy:comment-sent', resolve, { once: true })
    target.addEventListener('tracy:comment-failed', resolve, { once: true })
  })
  target.dispatchEvent(new CustomEvent('tracy:comment-send', { detail: d }))
  const answer = /** @type {CustomEvent} */ (await done)
  stop()
  assert.equal(answer.type, 'tracy:comment-sent', JSON.stringify(answer.detail))
  return sent[0]
}

/** The `thread:` lines of the block whose head names comment `n`. */
function blockThread(turn, n) {
  const block = turn.split('```tracy-element\n').find((b) => b.startsWith(`<mentioned-element n="${n}" `))
  assert.ok(block, `no block for comment ${n}`)
  return [...block.split('\n```')[0].matchAll(/\nthread: ([^\n]*)/g)].map((m) => m[1])
}

test('Send all: no line of any thread is marked (now) — nobody typed words in this send', async () => {
  const turn = await send(detail)
  assert.doesNotMatch(turn, /\(now[,)]/)
})

test('Send all: a lone comment keeps its real author and time, first, and each earlier send is one line', async () => {
  const turn = await send(detail)
  assert.deepEqual(blockThread(turn, 130), [
    'Sam Tester (e2e3-send-a) (3h ago): E3S-X01 A: shorten this heading.',
    'Sam Tester (e2e3-send-b) (2h ago): Agreed, it wraps on phones.',
    'sent to Tracy by Sam Tester (e2e3-send-a) (1h ago)',
    'sent to Tracy by Sam Tester (e2e3-send-a) (30m ago)'
  ])
})

test('Send all: a grouped block names each earlier send once, not once per comment', async () => {
  const turn = await send(detail)
  assert.deepEqual(blockThread(turn, 131), [
    'Sam Tester (e2e3-send-a) (4h ago, comment 131): E3S-X01 A: call them service areas.',
    'Sam Tester (e2e3-send-b) (3h ago, comment 132): E3S-S06 B: keep "lines", it is the brand word.',
    'sent to Tracy by Sam Tester (e2e3-send-a) (1h ago)',
    'sent to Tracy by Sam Tester (e2e3-send-a) (30m ago)'
  ])
})

test('Send all: stored words that differ only by white space are not words typed now', async () => {
  const turn = await send(detail, () => ({ name: 'Lee', email: 'lee@example.com' }))
  assert.deepEqual(blockThread(turn, 133), [
    'Sam Tester (e2e3-send-b) (5h ago): E5S footer: add the tax number.',
    'Sam Tester (e2e3-send-a) (4h ago): And the VAT id.'
  ])
})

test('Send all: a deleted root carries its reply and its send, no words of its own and no (now)', async () => {
  const turn = await send(detail)
  assert.deepEqual(blockThread(turn, 134), [
    'Sam Tester (e2e3-send-b) (5h ago): Say 1997, not 1998.',
    'sent to Tracy by Sam Tester (e2e3-send-a) (1h ago)'
  ])
})

test('Send all by a seat who wrote none of it: still no (now), still the real authors', async () => {
  const turn = await send(detail, () => ({ name: 'Lee', email: 'lee@example.com' }))
  assert.doesNotMatch(turn, /\(now[,)]/)
  assert.doesNotMatch(turn, /thread: Lee /)
})

test('a thread card send still marks the words typed now as the sender’s (now) line, last', async () => {
  const card = {
    ...detail,
    requestId: 'card-r9',
    items: [
      {
        ...detail.items[0],
        text: 'Make it “Groundwork for industry”.',
        thread: [{ author: A, at: NOW - 3 * HOUR, text: STORED.get('c-h1') }, ...detail.items[0].thread]
      }
    ]
  }
  const turn = await send(card, () => B)
  assert.deepEqual(blockThread(turn, 130), [
    'Sam Tester (e2e3-send-a) (3h ago): E3S-X01 A: shorten this heading.',
    'Sam Tester (e2e3-send-b) (2h ago): Agreed, it wraps on phones.',
    'sent to Tracy by Sam Tester (e2e3-send-a) (1h ago)',
    'sent to Tracy by Sam Tester (e2e3-send-a) (30m ago)',
    'Sam Tester (e2e3-send-b) (now): Make it “Groundwork for industry”.'
  ])
})

test('a thread card send with no sender known: the quoted root shows the words are typed now', async () => {
  const card = {
    ...detail,
    requestId: 'card-r9-nosender',
    items: [
      {
        ...detail.items[0],
        text: 'Make it “Groundwork for industry”.',
        thread: [{ author: A, at: NOW - 3 * HOUR, text: STORED.get('c-h1') }]
      }
    ]
  }
  const turn = await send(card, () => null)
  // Only A is named in this turn, so no e-mail part is needed to tell anyone apart.
  assert.equal(blockThread(turn, 130).at(-1), 'Sam Tester (now): Make it “Groundwork for industry”.')
})

test('one earlier send listed by the item and by its thread is one line', () => {
  const turn = buildCommentTurn({
    now: NOW,
    numbered: true,
    items: [
      {
        n: 140,
        text: 'Shorten it.',
        element: H1,
        author: A,
        at: NOW - 3 * HOUR,
        sends: [{ author: A, at: SEND_ALL_1 }],
        thread: [{ author: A, at: SEND_ALL_1, sent: true }]
      }
    ]
  })
  assert.deepEqual(blockThread(turn, 140), [
    'Sam Tester (3h ago): Shorten it.',
    'sent to Tracy by Sam Tester (1h ago)'
  ])
})
