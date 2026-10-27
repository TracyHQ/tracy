// Chat or Voice (`src/client/voice-mode-view.mjs`): the voice view is chosen by pressing dsh's own tab
// button, once the strip is there, and the page keeps which conversations show it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAT_VIEW as COMMENTS_CHAT_VIEW } from '../src/client/comments-open.mjs'
import {
  CHAT_VIEW,
  flag,
  pressViewTab,
  shownSessions,
  SPOKEN_CHARS,
  tellSpoken,
  VOICE_VIEW,
  viewTab
} from '../src/client/voice-mode-view.mjs'

const tabOf = (selected) => {
  const tab = {
    clicks: 0,
    getAttribute: (name) => (name === 'aria-selected' ? String(selected) : null),
    click: () => void (tab.clicks += 1)
  }
  return tab
}

test('the tab is pressed once the strip renders, never when already shown, and given up on after a while', () => {
  const frames = []
  const frame = (fn) => frames.push(fn)
  const tab = tabOf(false)
  let rendered = false
  pressViewTab(() => (rendered ? tab : null), frame)
  assert.equal(tab.clicks, 0)
  rendered = true
  frames.shift()()
  assert.equal(tab.clicks, 1)

  const shown = tabOf(true)
  pressViewTab(() => shown, frame)
  assert.equal(shown.clicks, 0, 'the view on screen is not pressed again')

  const before = frames.length
  pressViewTab(() => null, frame)
  for (let i = 0; i < 40 && frames.length > before; i += 1) frames.pop()()
  assert.equal(frames.length, before, 'no strip: it stops asking')
})

test('the tab buttons are found by their view id', () => {
  const asked = []
  viewTab({ querySelector: (s) => asked.push(s) && null }, VOICE_VIEW)
  assert.deepEqual(asked, ['[data-conversation-tabs] [role="tab"][data-view="tracy-voice"]'])
  // Back to Chat is the very view the Comments view goes back to (`comments-open.mjs`).
  assert.equal(CHAT_VIEW, COMMENTS_CHAT_VIEW)
})

test('the conversations showing Voice, and the wanted flag, say each change once', () => {
  const shown = shownSessions()
  let told = 0
  shown.subscribe(() => (told += 1))
  shown.mark('a', true)
  shown.mark('a', true)
  assert.equal(shown.has('a'), true)
  shown.mark('a', false)
  assert.equal(shown.has('a'), false)
  assert.equal(told, 2)
  const wanted = flag(false)
  let flips = 0
  wanted.subscribe(() => (flips += 1))
  wanted.set(true)
  wanted.set(true)
  wanted.set(false)
  assert.equal(flips, 2)
})

test('the words about to be sent in Voice are told to the host first; a host that does not answer costs only the rule', async () => {
  const posts = []
  await tellSpoken(
    async (body, signal) => {
      posts.push(body)
      assert.ok(signal instanceof AbortSignal)
    },
    'session-a',
    '  Đổi tiêu đề\n trang chủ. '
  )
  assert.deepEqual(posts, [{ sessionId: 'session-a', spoken: 'Đổi tiêu đề trang chủ.' }])
  // As long as the host compares, never longer.
  await tellSpoken(async (body) => void posts.push(body), 'session-a', 'x'.repeat(SPOKEN_CHARS + 50))
  assert.equal(posts.at(-1).spoken.length, SPOKEN_CHARS)
  // A host that refuses, or never answers within the wait: the sending goes on.
  await tellSpoken(async () => Promise.reject(new Error('down')), 'session-a', 'Xin chào.')
  const at = Date.now()
  await tellSpoken(
    (_body, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    'session-a',
    'Xin chào.',
    50
  )
  assert.ok(Date.now() - at < 1000)
  await tellSpoken(async () => assert.fail('nothing to tell'), 'session-a', '   ')
})
