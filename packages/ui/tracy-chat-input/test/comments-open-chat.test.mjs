/**
 * After any Send to Tracy the chat column switches to its Chat tab (stage 6, rule 5 of the story file),
 * the reverse of what `tracy:comments-open` does: the one public road is dsh's own tab button
 * (`[data-conversation-tabs] [data-view="chat"]`), clicked once the strip is there.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHAT_VIEW, openChatView } from '../src/client/comments-open.mjs'

const tab = (selected) => {
  const clicks = []
  return {
    clicks,
    getAttribute: (name) => (name === 'aria-selected' ? String(selected) : null),
    click: () => clicks.push(1)
  }
}

test('the Chat tab is pressed when it is not the one shown', () => {
  assert.equal(CHAT_VIEW, 'chat')
  const chat = tab(false)
  const asked = []
  openChatView({ findTab: (view) => (asked.push(view), chat), frame: () => assert.fail('no wait needed') })
  assert.deepEqual(asked, ['chat'])
  assert.equal(chat.clicks.length, 1)
})

test('already on Chat: nothing is pressed', () => {
  const chat = tab(true)
  openChatView({ findTab: () => chat, frame: () => {} })
  assert.equal(chat.clicks.length, 0)
})

test('no strip yet: it waits a frame at a time, then gives up quietly', () => {
  const frames = []
  let found = null
  openChatView({ findTab: () => found, frame: (fn) => frames.push(fn) })
  assert.equal(frames.length, 1)
  const chat = tab(false)
  found = chat
  frames.shift()()
  assert.equal(chat.clicks.length, 1)
  // A strip that never comes: at most 30 frames.
  const waits = []
  openChatView({ findTab: () => null, frame: (fn) => (waits.push(1), fn()) })
  assert.equal(waits.length, 29)
})
