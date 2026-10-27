// A conversation in Voice (`src/host/voice-reply.mjs`): the page's word of what it is about to send,
// the step that takes those words, and the spoken-reply rule it gets.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  readVoiceReport,
  SPOKEN_CHARS,
  spokenWords,
  VOICE_FRESH_MS,
  VOICE_REPLY,
  voiceReplyRule
} from '../src/host/voice-reply.mjs'

const SESSION = 'session-1234abcd'

test('the page’s word: its session and the words it is about to send; an older page’s yes or no is taken and ignored', () => {
  assert.deepEqual(readVoiceReport({ sessionId: SESSION, spoken: '  Đổi tiêu đề\n trang chủ. ' }), {
    sessionId: SESSION,
    spoken: 'Đổi tiêu đề trang chủ.'
  })
  // A page loaded before this one still says `voice`: never refused, never acted on.
  assert.deepEqual(readVoiceReport({ sessionId: SESSION, voice: true }), { sessionId: SESSION, spoken: null })
  for (const body of [
    null,
    [],
    'voice',
    { sessionId: SESSION },
    { sessionId: SESSION, spoken: '   ' },
    { sessionId: SESSION, spoken: 3 },
    { sessionId: 'not-a-session', spoken: 'Đổi tiêu đề.' },
    { sessionId: SESSION, voice: 'yes' },
    // The open page's own report never carries these: one is never read as the other.
    { sessionId: SESSION, voice: true, visible: true, url: '/' },
    { sessionId: SESSION, spoken: 'Đổi tiêu đề.', visible: true }
  ]) {
    assert.equal(readVoiceReport(body), null, JSON.stringify(body))
  }
})

test('words said in Voice are taken once, by the step whose message they are; a message typed anywhere else never is', () => {
  let clock = 1_000_000
  const words = spokenWords(() => clock)
  const message = (text) => [{ type: 'text', text }]
  words.mark(SESSION, 'Đổi tiêu đề trang chủ.')
  // Typed in another tab while this one is in Voice (council 18/10/2026: it got the rule).
  assert.equal(words.take(SESSION, message('Thêm logo vào đầu trang.')), false)
  assert.equal(words.take('session-other999', message('Đổi tiêu đề trang chủ.')), false)
  assert.equal(
    words.take(SESSION, message('Đổi tiêu đề  trang chủ.')),
    true,
    'the spoken message, spacing aside'
  )
  assert.equal(words.take(SESSION, message('Đổi tiêu đề trang chủ.')), false, 'once')
  // Two in a row (a correction steered in): each its own.
  words.mark(SESSION, 'Đổi màu nút sang xanh.')
  words.mark(SESSION, 'À không, sang đỏ.')
  assert.equal(words.take(SESSION, message('À không, sang đỏ.')), true)
  assert.equal(words.take(SESSION, message('Đổi màu nút sang xanh.')), true)
  // Not taken in time: forgotten.
  words.mark(SESSION, 'Xoá trang giới thiệu.')
  clock += VOICE_FRESH_MS + 1
  assert.equal(words.take(SESSION, message('Xoá trang giới thiệu.')), false)
  // A long message is compared as far as the page sends it.
  const long = 'Viết lại phần giới thiệu. '.repeat(80)
  words.mark(SESSION, long.slice(0, SPOKEN_CHARS))
  assert.equal(words.take(SESSION, message(long)), true)
})

test('a turn the person spoke in Voice gets the spoken-reply rule; one not in Voice, or with no words, does not', () => {
  const rule = voiceReplyRule([{ type: 'text', text: 'Đổi tiêu đề trang chủ.' }], true)
  assert.equal(rule?.text, VOICE_REPLY)
  assert.equal(voiceReplyRule('Đổi tiêu đề trang chủ.', false), null)
  assert.equal(voiceReplyRule('   ', true), null)
  // What it asks for, as the page reads it: an opening paragraph, said plainly, then the details.
  assert.match(VOICE_REPLY, /first paragraph/)
  assert.match(VOICE_REPLY, /numbers, prices and dates in words/)
  // Words heard may be misheard: a value that does not fit is asked about, and the one used said back.
  assert.match(VOICE_REPLY, /ask instead of guessing, and say back the value you used/)
  // A change hard to take back is asked first (council 17/10/2026) — by the door's own question where a
  // door asks (ADR 0034), never by a question of the agent's before it; by the agent where none does.
  assert.match(
    VOICE_REPLY,
    /deleting or hiding a page or post, a price, many places at once, the look of the whole site/
  )
  assert.match(
    VOICE_REPLY,
    /make it first, say that question out loud and wait; never ask your own before it/
  )
  assert.match(
    VOICE_REPLY,
    /like removing a section of a page: say exactly what will change and ask; do it only after a clear yes/
  )
})
