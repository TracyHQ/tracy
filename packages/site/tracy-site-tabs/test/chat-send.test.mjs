/**
 * "Ask Tracy to revert" sends at one press — `src/client/chat-send.ts`.
 *
 *   node --test packages/site/tracy-site-tabs/test/chat-send.test.mjs
 *
 * Quiet failures guarded here: the message sent to a conversation that is not on screen, "sent"
 * claimed when nothing took it, a running agent interrupted (steer), the text changed on the way.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sendToChat } from '../src/client/chat-send.ts'

const face = (snapshot = {}) => ({ getSnapshot: () => snapshot })

function conversation(outcome = { kind: 'success' }) {
  const calls = []
  return {
    calls,
    sendSession: async (session, text, attachments, mode) => {
      calls.push({ session, text, attachments, mode })
      if (outcome instanceof Error) throw outcome
      return outcome
    }
  }
}

test('sent once, verbatim, to the conversation on screen, queued — never steered', async () => {
  const main = face()
  const other = face()
  const c = conversation()
  const text = 'Revert “x” — only this change.\n\n```tracy-revert\nRecorded: …\n```'
  const result = await sendToChat('s-main', (id) => (id === 's-main' ? main : other), c, text)
  assert.equal(result, 'sent')
  assert.equal(c.calls.length, 1)
  assert.equal(c.calls[0].session, main)
  assert.equal(c.calls[0].text, text)
  assert.deepEqual(c.calls[0].attachments, [])
  assert.equal(c.calls[0].mode, 'queue')
})

test('no conversation on screen, no session, no conversation service, a subagent’s view: no-chat, nothing sent', async () => {
  const c = conversation()
  assert.equal(await sendToChat(undefined, () => face(), c, 't'), 'no-chat')
  assert.equal(await sendToChat('s', () => undefined, c, 't'), 'no-chat')
  assert.equal(await sendToChat('s', () => face(), undefined, 't'), 'no-chat')
  assert.equal(await sendToChat('s', () => face({ subagent: { id: 'a' } }), c, 't'), 'no-chat')
  assert.equal(await sendToChat('s', () => face({ removed: true }), c, 't'), 'no-chat')
  assert.equal(c.calls.length, 0)
})

test('refused or thrown: failed, never sent', async () => {
  assert.equal(await sendToChat('s', () => face(), conversation({ kind: 'error' }), 't'), 'failed')
  assert.equal(await sendToChat('s', () => face(), conversation(new Error('x')), 't'), 'failed')
})
