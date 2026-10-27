/**
 * Stage-6 acceptance e2e v3 (input, 30/09): a "Send all" while Tracy was busy went into dsh's queue and
 * was sent when the running turn stopped — yet the Browser tab showed "The chat did not answer. Your
 * text is kept — try again." The tab waits 10 s for `tracy:comment-sent` (`COMMENT_SEND_TIMEOUT_MS`),
 * and this side answered only once `conversation.sendSession` settled, which for a queued message on a
 * busy host can take longer than that: the message was already in dsh's queue strip, the answer was
 * not. A send into a RUNNING session is now answered `sent` with `queued: true` as soon as dsh holds it
 * (at most {@link QUEUED_ACK_MS} after the hand-over), whatever the admission still takes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FAILED_EVENT,
  listenForComments,
  QUEUED_ACK_MS,
  SEND_EVENT,
  SENT_EVENT
} from '../src/client/comment-send.mjs'

const SITE = 'northgate.tracy.site'
const SESSION = 'session-q'
const ELEMENT = { url: 'https://northgate.tracy.site/', selector: 'h1', label: 'Heading', text: 'Hello' }

function world({ running, settle }) {
  const target = new EventTarget()
  const replies = []
  for (const type of [SENT_EVENT, FAILED_EVENT])
    target.addEventListener(type, (e) => replies.push({ type, detail: e.detail }))
  const session = { getSnapshot: () => ({ running, subagent: null, removed: false }) }
  const sends = []
  const shown = []
  const conversation = {
    sendSession: (...args) => {
      sends.push(args)
      return settle
    }
  }
  listenForComments({
    target,
    sessions: { binding: (id) => (id === SESSION ? { session } : undefined) },
    conversation,
    siteKey: () => SITE,
    showChat: (id) => shown.push(id),
    queuedAckMs: 20
  })
  const send = (requestId) =>
    target.dispatchEvent(
      new CustomEvent(SEND_EVENT, {
        detail: {
          v: 3,
          sessionId: SESSION,
          requestId,
          siteKey: SITE,
          items: [
            { n: 7, url: ELEMENT.url, element: ELEMENT, text: 'Shorter heading, please.' },
            { n: 8, url: ELEMENT.url, element: { ...ELEMENT, selector: 'h2' }, text: 'And this one.' }
          ]
        }
      })
    )
  return { replies, sends, shown, send }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('the queued answer comes well inside the Browser tab’s 10-second wait', () => {
  assert.ok(QUEUED_ACK_MS > 0 && QUEUED_ACK_MS <= 3_000, `QUEUED_ACK_MS is ${QUEUED_ACK_MS}`)
})

test('Send all while Tracy is busy: dsh still admitting the queued message → answered sent, queued, and the chat shows', async () => {
  const w = world({ running: true, settle: new Promise(() => {}) })
  w.send('req-busy')
  await wait(60)
  assert.equal(w.sends.length, 1)
  assert.equal(w.sends[0][3], 'queue')
  assert.deepEqual(w.replies, [
    { type: SENT_EVENT, detail: { requestId: 'req-busy', sessionId: SESSION, queued: true } }
  ])
  assert.deepEqual(w.shown, [SESSION])
})

test('a queued send that settles later is not answered twice; a repeat of its id repeats the one answer', async () => {
  let done
  const w = world({ running: true, settle: new Promise((resolve) => (done = resolve)) })
  w.send('req-once')
  await wait(60)
  done({ kind: 'success' })
  await wait(10)
  assert.equal(w.replies.length, 1)
  w.send('req-once')
  await wait(10)
  assert.equal(w.replies.length, 2)
  assert.deepEqual(w.replies[1], w.replies[0])
  assert.equal(w.sends.length, 1, 'never sent twice')
})

test('an idle session still waits for dsh: its refusal is answered as failed, not as sent', async () => {
  const w = world({ running: false, settle: wait(40).then(() => ({ kind: 'error' })) })
  w.send('req-idle')
  await wait(80)
  assert.deepEqual(w.replies, [{ type: FAILED_EVENT, detail: { requestId: 'req-idle', code: 'rejected' } }])
})

test('a busy session whose dsh refuses at once is answered failed (the refusal beats the queued answer)', async () => {
  const w = world({ running: true, settle: Promise.resolve({ kind: 'error' }) })
  w.send('req-refused')
  await wait(60)
  assert.deepEqual(w.replies, [
    { type: FAILED_EVENT, detail: { requestId: 'req-refused', code: 'rejected' } }
  ])
})

// Every Ask Tracy to edit starts from a saved comment, so no send is a page box's: a failure is the code only.
test('a failed send carries only its code, whole-page item or element', async () => {
  const target = new EventTarget()
  const replies = []
  target.addEventListener(FAILED_EVENT, (e) => replies.push(e.detail))
  const session = { getSnapshot: () => ({ running: false, subagent: null, removed: false }) }
  listenForComments({
    target,
    sessions: { binding: (id) => (id === SESSION ? { session } : undefined) },
    conversation: { sendSession: async () => ({ kind: 'error' }) },
    siteKey: () => SITE
  })
  const send = (requestId, items) =>
    target.dispatchEvent(
      new CustomEvent(SEND_EVENT, { detail: { v: 3, sessionId: SESSION, requestId, siteKey: SITE, items } })
    )
  send('req-page', [{ n: 12, url: ELEMENT.url, element: null, text: '  Make the header darker ' }])
  send('req-el', [{ n: 13, url: ELEMENT.url, element: ELEMENT, text: 'Shorter.' }])
  await wait(20)
  assert.deepEqual(replies, [
    { requestId: 'req-page', code: 'rejected' },
    { requestId: 'req-el', code: 'rejected' }
  ])
})
