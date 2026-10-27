/**
 * A reply sent from the Browser tab (plan `tasks/todo-comment-thread.md` § "B addendum"): the v2 item
 * carries `replyTo` (the parent's number) and `thread: [{author, at, text, status, answer?}]`; the
 * turn prints both. When the item brings no thread (or no `replyTo`), the Comments view's own lists
 * say what it continues (`replyContext`): its parent's number and the parent alone as the thread.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listenForComments, SEND_EVENT } from '../src/client/comment-send.mjs'
import { buildCommentTurn } from '../src/client/comment-turn.mjs'

const SITE = 'northgate.tracy.site'
const SESSION = 'session-1'
const NOW = Date.UTC(2026, 8, 29, 9, 0, 0)
const MIN = 60_000
const ELEMENT = {
  url: 'https://northgate.tracy.site/',
  selector: 'h1',
  label: 'Hero',
  text: 'Industrial construction'
}
const PARENT = { author: 'Lee', at: NOW - 9 * MIN, text: 'Change the heading', status: 'done' }

function world(replyContext) {
  const target = new EventTarget()
  const session = { getSnapshot: () => ({ running: false, subagent: null, removed: false }) }
  const sends = []
  const conversation = { sendSession: async (...args) => (sends.push(args), { kind: 'success' }) }
  listenForComments({
    target,
    sessions: { binding: (id) => (id === SESSION ? { session } : undefined) },
    conversation,
    siteKey: () => SITE,
    replyContext,
    now: () => NOW
  })
  const send = async (items, requestId) => {
    target.dispatchEvent(
      new CustomEvent(SEND_EVENT, {
        detail: { v: 2, requestId, sessionId: SESSION, siteKey: SITE, mode: 'queue', items }
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { sends, send }
}

const reply = (extra = {}) => ({
  n: 6,
  url: ELEMENT.url,
  text: 'Shorter still',
  element: ELEMENT,
  locate: null,
  ...extra
})

test('the thread the Browser tab sends is the thread the turn prints', async () => {
  const thread = [
    PARENT,
    { author: { email: 'akemi@x.io' }, at: NOW - 2 * MIN, text: 'Too long', status: 'saved' }
  ]
  const w = world(() => {
    throw new Error('the lists are not asked when the item says it all')
  })
  const author = { accountId: 'a-1', email: 'lee@x.io', name: 'Lee', initial: 'L' }
  await w.send([reply({ replyTo: 1, thread, author })], 'r-1')
  assert.equal(w.sends.length, 1)
  assert.equal(w.sends[0][1], buildCommentTurn({ items: [reply({ replyTo: 1, thread, author })], now: NOW }))
  assert.match(w.sends[0][1], /\nthread: akemi \(2m ago\): Too long\nthread: Lee \(now\): Shorter still\n/)
})

test('no thread on the item: the lists give the parent, alone', async () => {
  const w = world((sessionId, n) =>
    sessionId === SESSION && n === 6 ? { replyTo: 1, thread: [PARENT] } : null
  )
  await w.send([reply()], 'r-2')
  assert.equal(
    w.sends[0][1],
    buildCommentTurn({ items: [reply({ replyTo: 1, thread: [PARENT] })], now: NOW })
  )
  assert.match(w.sends[0][1], /<mentioned-element n="6" reply-to="1" /)
  // Stage 6 (Rule 7): Tracy's old step (`tracy: ✓ updated`) is no longer a thread line.
  assert.match(w.sends[0][1], /\nthread: Lee \(9m ago\): Change the heading\n(?!thread: tracy:)/)
})

test('`replyTo` on the item wins over the lists; their parent line fills a missing thread', async () => {
  const w = world(() => ({ replyTo: 2, thread: [PARENT] }))
  await w.send([reply({ replyTo: 1 })], 'r-3')
  assert.match(w.sends[0][1], /reply-to="1" /)
  assert.match(w.sends[0][1], /\nthread: Lee /)
})

test('not a reply: the turn is the one it always was', async () => {
  const w = world(() => null)
  const plain = reply()
  await w.send([plain, { ...plain, n: 7, text: 'Other' }], 'r-4')
  assert.equal(w.sends[0][1], buildCommentTurn({ items: [plain, { ...plain, n: 7, text: 'Other' }] }))
})

test('F1: the item’s own author closes the thread; without one, the lists name it', async () => {
  const editor = { accountId: 'a-2', email: 'capi-e2e-editor@example.com', initial: 'C' }
  const own = world(() => {
    throw new Error('not asked')
  })
  await own.send([reply({ replyTo: 1, thread: [PARENT], author: editor })], 'r-5')
  assert.match(own.sends[0][1], /\nthread: capi-e2e-editor \(now\): Shorter still\n/)

  const listed = world((sessionId, n) =>
    sessionId === SESSION && n === 6 ? { replyTo: 1, thread: [PARENT], author: editor } : null
  )
  await listed.send([reply({ replyTo: 1, thread: [PARENT] })], 'r-6')
  assert.match(
    listed.sends[0][1],
    /\nthread: Lee \(9m ago\): Change the heading\nthread: capi-e2e-editor \(now\): Shorter still\n/
  )
})

test('N1: a top-level comment the Browser tab sends with the replies under it prints them as later lines', async () => {
  const w = world(() => null)
  const author = { accountId: 'a-1', email: 'lee@x.io', name: 'Lee', initial: 'L' }
  const thread = [
    { author: { email: 'akemi@x.io' }, at: NOW - 2 * MIN, text: 'No, keep it', status: 'saved', later: true }
  ]
  await w.send([reply({ thread, author })], 'r-n1')
  assert.equal(w.sends.length, 1)
  assert.doesNotMatch(w.sends[0][1], /reply-to=/)
  assert.match(
    w.sends[0][1],
    /\nthread: Lee \(now, written before the lines after it\): Shorter still\nthread: akemi \(2m ago, written after this one\): No, keep it\n/
  )
})

test('F16: a reply the Browser tab sends with the words now and the words then prints text: now, was: then; the chip quotes now', async () => {
  const w = world(() => null)
  const element = { ...ELEMENT, text: 'EST. CHARLIE', was: 'Established 2004' }
  await w.send([reply({ replyTo: 1, thread: [PARENT], element })], 'r-was')
  const turn = w.sends[0][1]
  assert.match(turn, /\ntext: EST\. CHARLIE\nwas: Established 2004\n/)
  const { parseCommentTurn, chipLabel } = await import('../src/client/comment-turn.mjs')
  const parsed = parseCommentTurn(turn)
  assert.equal(chipLabel(parsed.items[0].element, { many: true }), '"EST. CHARLIE"')
})
