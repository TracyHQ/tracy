/**
 * `tracy:comment-send` v3 (stage 6, contract `tasks/evidence/comment-people/contract.md` §H2): the fork
 * records the request first (`POST /requests` hands every item its number `n`), then asks the chat to
 * send `{v:3, sessionId, requestId, siteKey, items:[{n, url, element, text, author, thread?, commentId?}]}`.
 * The chat builds ONE turn with a chip per item — always numbered, so the agent can name each request
 * to the Apply door — sends it through `sendSession` like every comment turn, answers `sent`, and then
 * switches the chat column to its Chat tab (rule 5: after any Send to Tracy the person sees the chat).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FAILED_EVENT,
  listenForComments,
  SEND_EVENT,
  SENT_EVENT,
  sentTurns
} from '../src/client/comment-send.mjs'
import { buildCommentTurn, parseCommentTurn } from '../src/client/comment-turn.mjs'

const SITE = 'northgate.tracy.site'
const SESSION = 'session-3'
const NOW = Date.UTC(2026, 8, 29, 21, 0, 0)
const ELEMENT = {
  url: 'https://northgate.tracy.site/',
  selector: 'nav a:nth-of-type(3)',
  label: 'Menu item "Services"',
  text: 'Services'
}
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L' }

function world({ outcome = { kind: 'success' } } = {}) {
  const target = new EventTarget()
  const replies = []
  for (const type of [SENT_EVENT, FAILED_EVENT])
    target.addEventListener(type, (e) => replies.push({ type, detail: e.detail }))
  const session = { getSnapshot: () => ({ running: false, subagent: null, removed: false }) }
  const sends = []
  const shown = []
  const conversation = { sendSession: async (...args) => (sends.push(args), outcome) }
  listenForComments({
    target,
    sessions: { binding: (id) => (id === SESSION ? { session } : undefined) },
    conversation,
    siteKey: () => SITE,
    now: () => NOW,
    showChat: (sessionId) => shown.push(sessionId)
  })
  const send = async (d) => {
    target.dispatchEvent(new CustomEvent(SEND_EVENT, { detail: d }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { replies, sends, shown, send }
}

const v3 = (overrides = {}) => ({
  v: 3,
  sessionId: SESSION,
  requestId: 'req-v3',
  siteKey: SITE,
  items: [
    { n: 140, url: ELEMENT.url, element: ELEMENT, text: 'Make only this menu item orange.', author: LEE }
  ],
  ...overrides
})

test('v3: one item is ONE numbered turn with its author, sent queued; the sender hears sent', async () => {
  const w = world()
  await w.send(v3())
  assert.equal(w.sends.length, 1)
  const [, text, attachments, mode] = w.sends[0]
  assert.deepEqual(attachments, [])
  assert.equal(mode, 'queue')
  assert.equal(
    text,
    buildCommentTurn({
      items: [
        { n: 140, text: 'Make only this menu item orange.', element: ELEMENT, locate: null, author: LEE }
      ],
      numbered: true,
      now: NOW
    })
  )
  assert.match(text, /^Make only this menu item orange\.\n\n```tracy-element\n<mentioned-element n="140" /)
  assert.match(text, / author="Lee">\n/)
  assert.deepEqual(w.replies, [
    { type: SENT_EVENT, detail: { requestId: 'req-v3', sessionId: SESSION, queued: false } }
  ])
})

test('v3: after a turn goes out the chat column switches to Chat — never after a refusal', async () => {
  const ok = world()
  await ok.send(v3({ requestId: 'req-v3-shown' }))
  assert.deepEqual(ok.shown, [SESSION])
  const refused = world({ outcome: { kind: 'error' } })
  await refused.send(v3({ requestId: 'req-v3-refused' }))
  assert.deepEqual(refused.shown, [])
  assert.equal(refused.replies[0].type, FAILED_EVENT)
  const elsewhere = world()
  await elsewhere.send(v3({ requestId: 'req-v3-site', siteKey: 'other.tracy.site' }))
  assert.deepEqual(elsewhere.shown, [])
})

test('v3: several items — the checklist, a page note — make one turn with a chip each', async () => {
  const w = world()
  await w.send(
    v3({
      requestId: 'req-v3-many',
      items: [
        {
          n: 141,
          url: ELEMENT.url,
          element: ELEMENT,
          text: 'Make only this menu item orange.',
          author: LEE,
          commentId: 'c-1'
        },
        {
          n: 142,
          url: 'https://northgate.tracy.site/',
          element: null,
          text: 'The phone number in the top bar is old.',
          author: { name: 'Mai' }
        }
      ]
    })
  )
  const parsed = parseCommentTurn(w.sends[0][1])
  assert.deepEqual(
    parsed?.items.map((i) => [i.n, i.element === null ? 'page' : 'element', i.text]),
    [
      [141, 'element', 'Make only this menu item orange.'],
      [142, 'page', 'The phone number in the top bar is old.']
    ]
  )
})

test('v3: a thread card send carries the thread — the typed words are the sender’s (now) line', async () => {
  const w = world()
  await w.send(
    v3({
      requestId: 'req-v3-thread',
      items: [
        {
          n: 143,
          url: ELEMENT.url,
          element: ELEMENT,
          text: 'Update it on both pages, please.',
          author: LEE,
          commentId: 'c-2',
          thread: [
            {
              author: { name: 'Mai', email: 'mai@n.ru' },
              at: NOW - 20 * 60_000,
              text: 'We have 14 subsidiaries now.'
            },
            { author: LEE, at: NOW - 6 * 60_000, text: 'The About page says 13 as well.' }
          ]
        }
      ]
    })
  )
  const lines = w.sends[0][1].split('\n').filter((l) => l.startsWith('thread: '))
  assert.deepEqual(lines, [
    'thread: Mai (20m ago): We have 14 subsidiaries now.',
    'thread: Lee (6m ago): The About page says 13 as well.',
    'thread: Lee (now): Update it on both pages, please.'
  ])
})

test('v3: a number past 99 is sent; a malformed item is rejected and nothing goes out', async () => {
  const w = world()
  await w.send(v3({ requestId: 'req-v3-big', items: [{ ...v3().items[0], n: 4096 }] }))
  assert.equal(w.sends.length, 1)
  for (const [id, items] of [
    ['bad-none', []],
    ['bad-n', [{ ...v3().items[0], n: 0 }]],
    ['bad-words', [{ ...v3().items[0], text: '  ' }]],
    ['bad-element', [{ ...v3().items[0], element: { url: 1 } }]]
  ]) {
    await w.send(v3({ requestId: id, items }))
    assert.deepEqual(
      w.replies.at(-1),
      { type: FAILED_EVENT, detail: { requestId: id, code: 'rejected' } },
      id
    )
  }
  assert.equal(w.sends.length, 1)
})

test('v3: the sent turn is on record with its site, for the progress events', async () => {
  const w = world()
  await w.send(v3({ requestId: 'req-v3-record' }))
  const record = sentTurns.get('req-v3-record')
  assert.equal(record?.sessionId, SESSION)
  assert.equal(record?.siteKey, SITE)
  assert.equal(record?.text, w.sends[0][1])
})
