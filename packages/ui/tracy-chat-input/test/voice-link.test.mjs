/**
 * Voice input's socket, the chat box's side (`voice-link.mjs`): the address, frames held until the
 * socket opens, words gathered phrase by phrase, and exactly one end. A fake WebSocket stands in.
 *
 *   node --test packages/ui/tracy-chat-input/test/voice-link.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { openSpeechLink, pageSite, speechHttpPath, speechSocketUrl } from '../src/client/voice-link.mjs'

test('native widget uses only the explicit speech bridge; normal native mounts stay root-scoped', () => {
  const where = { protocol: 'https:', host: 'tracy.test:8443', pathname: '/widget/native/s/session-own' }
  assert.equal(
    speechSocketUrl(where, 'vi', true),
    'wss://tracy.test:8443/widget/api/speech/stream?language=vi&turns=voice'
  )
  assert.equal(speechHttpPath('/api/speech/say', where), '/widget/backend/api/speech/say')
  assert.equal(speechHttpPath('/api/speech', where), '/widget/backend/api/speech')
  assert.equal(speechHttpPath('/api/speech', { pathname: '/new/s/session-own' }), '/api/speech')
  assert.equal(speechHttpPath('/api/speech', { pathname: '/widget/native-other/' }), '/api/speech')
  assert.throws(() => speechHttpPath('/api/team', where), /SPEECH_PATH_INVALID/)
})

class FakeSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static last = null
  constructor(url) {
    super()
    this.url = url
    this.readyState = FakeSocket.CONNECTING
    this.sent = []
    FakeSocket.last = this
  }
  send(data) {
    this.sent.push(data)
  }
  close() {
    this.readyState = FakeSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
  open() {
    this.readyState = FakeSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }
  say(message) {
    const event = new Event('message')
    event.data = JSON.stringify(message)
    this.dispatchEvent(event)
  }
}

function link() {
  const seen = { words: [], languages: [], ends: [], ready: 0 }
  const handle = openSpeechLink(
    {
      onReady: () => seen.ready++,
      onWords: (committed, partial) => seen.words.push([[...committed], partial]),
      onLanguage: (code) => seen.languages.push(code),
      onEnd: (reason, settled) => seen.ends.push([reason, settled])
    },
    { url: 'ws://tracy.test/api/speech/stream', WebSocketImpl: FakeSocket }
  )
  return { handle, seen, socket: FakeSocket.last }
}

test('the socket is tracy-web’s door at the bare root, wss on https', () => {
  assert.equal(
    speechSocketUrl({ protocol: 'https:', host: 'cowork.tracy.ai' }),
    'wss://cowork.tracy.ai/api/speech/stream'
  )
  assert.equal(
    speechSocketUrl({ protocol: 'http:', host: 'tracy.test:51710' }),
    'ws://tracy.test:51710/api/speech/stream'
  )
})

test('the chat’s main language rides the address; anything that is not a code is left off', () => {
  const where = { protocol: 'https:', host: 'cowork.tracy.ai' }
  assert.equal(speechSocketUrl(where, 'vi'), 'wss://cowork.tracy.ai/api/speech/stream?language=vi')
  assert.equal(speechSocketUrl(where, ''), 'wss://cowork.tracy.ai/api/speech/stream')
  assert.equal(speechSocketUrl(where, 'vi&x=1'), 'wss://cowork.tracy.ai/api/speech/stream')
  assert.equal(speechSocketUrl(where, 'VI'), 'wss://cowork.tracy.ai/api/speech/stream')
  // A voice conversation asks for shorter phrase ends; dictation does not.
  assert.equal(
    speechSocketUrl(where, 'vi', true),
    'wss://cowork.tracy.ai/api/speech/stream?language=vi&turns=voice'
  )
  assert.equal(speechSocketUrl(where, '', true), 'wss://cowork.tracy.ai/api/speech/stream?turns=voice')
})

test('a browser without URLSearchParams.size (Safari before 17) still sends the hints', () => {
  const where = { protocol: 'https:', host: 'cowork.tracy.ai' }
  const size = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'size')
  delete (/** @type {any} */ (URLSearchParams.prototype).size)
  try {
    assert.equal(
      speechSocketUrl(where, 'vi', true),
      'wss://cowork.tracy.ai/api/speech/stream?language=vi&turns=voice'
    )
  } finally {
    if (size) Object.defineProperty(URLSearchParams.prototype, 'size', size)
  }
})

test('frames spoken before the socket opens are sent once it does, in order', () => {
  const { handle, socket } = link()
  const a = new ArrayBuffer(4)
  const b = new ArrayBuffer(8)
  handle.sendAudio(a)
  handle.sendAudio(b)
  assert.deepEqual(socket.sent, [])
  socket.open()
  assert.deepEqual(socket.sent, [a, b])
  handle.sendAudio(a)
  assert.equal(socket.sent.length, 3)
})

test('partials are revised in place; a committed phrase is kept and the next partial starts fresh', () => {
  const { seen, socket } = link()
  socket.open()
  socket.say({ type: 'ready' })
  socket.say({ type: 'partial', text: 'xin' })
  socket.say({ type: 'partial', text: 'xin chào' })
  socket.say({ type: 'committed', text: 'Xin chào.' })
  socket.say({ type: 'language', code: 'vi' })
  socket.say({ type: 'partial', text: 'đổi màu' })
  assert.equal(seen.ready, 1)
  assert.deepEqual(seen.words, [
    [[], 'xin'],
    [[], 'xin chào'],
    [['Xin chào.'], ''],
    [['Xin chào.'], 'đổi màu']
  ])
  assert.deepEqual(seen.languages, ['vi'])
})

test('stop asks the relay, and its end is reported once, settled as it says', () => {
  const { handle, seen, socket } = link()
  socket.open()
  handle.stop()
  assert.equal(socket.sent.at(-1), JSON.stringify({ type: 'stop' }))
  socket.say({ type: 'end', reason: 'stopped', settled: false })
  socket.close()
  assert.deepEqual(seen.ends, [['stopped', false]])
})

test('a socket that drops without an end is network, unsettled', () => {
  const { seen, socket } = link()
  socket.open()
  socket.close()
  assert.deepEqual(seen.ends, [['network', false]])
})

test('stop before the socket opened ends at once; close never reports', () => {
  const first = link()
  first.handle.stop()
  assert.deepEqual(first.seen.ends, [['stopped', true]])
  const second = link()
  second.socket.open()
  second.handle.close()
  assert.deepEqual(second.seen.ends, [])
})

test('the site the page stands in rides the address, for the relay to look up its names; never any other word', () => {
  const where = { protocol: 'https:', host: 'cowork.tracy.ai' }
  assert.equal(
    speechSocketUrl(where, 'vi', true, 'shop.example.com'),
    'wss://cowork.tracy.ai/api/speech/stream?language=vi&turns=voice&site=shop.example.com'
  )
  assert.equal(speechSocketUrl(where, '', false, ''), 'wss://cowork.tracy.ai/api/speech/stream')
  assert.equal(
    speechSocketUrl(where, '', false, 'Bánh mì Phượng'),
    'wss://cowork.tracy.ai/api/speech/stream',
    'not a site key: not sent'
  )
  assert.equal(speechSocketUrl(where, '', false, 'new'), 'wss://cowork.tracy.ai/api/speech/stream')
  assert.equal(pageSite({ baseURI: 'https://cowork.tracy.ai/shop.example.com/' }), 'shop.example.com')
  assert.equal(
    pageSite({ baseURI: 'https://cowork.tracy.ai/new/' }),
    '',
    'the creation workspace stands in no site'
  )
  assert.equal(pageSite({ baseURI: 'https://tracy.test:8443/widget/native/s/x' }), '')
  assert.equal(pageSite(undefined), '')
})
