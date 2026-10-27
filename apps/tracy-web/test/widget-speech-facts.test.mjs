import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openWidgetSpeechLink, readySpeechFacts } from '../src/widget/assets/speech-facts.js'

test('fallback replaces cloud voices and never carries cloud TTS capabilities into local speech', () => {
  const before = {
    provider: 'elevenlabs',
    revision: 'a',
    voices: [{ id: 'cloud' }],
    speak: { answerMs: 10000 }
  }
  const after = readySpeechFacts(before, {
    provider: 'voicestudio',
    revision: 'b',
    voices: [{ id: 'local' }],
    transcriptWaitMs: 90000,
    speak: { answerMs: 90000 }
  })
  assert.equal(after.actualProvider, 'voicestudio')
  assert.equal(after.voices[0].id, 'local')
  assert.equal(after.speak.answerMs, 90000)
  assert.equal(after.transcriptWaitMs, 90000)
  assert.equal(after.revision, 'b')
  const incomplete = readySpeechFacts(before, { provider: 'voicestudio' })
  assert.deepEqual(incomplete.voices, [])
  assert.equal(incomplete.speak, undefined)
  assert.equal(readySpeechFacts(before, { type: 'ready' }), before)
})

test('ready metadata reaches widget exactly once through the committed shared link', () => {
  let socket
  class Socket extends EventTarget {
    static OPEN = 1
    static CONNECTING = 0
    constructor() {
      super()
      socket = this
      this.readyState = 1
    }
    send() {}
    close() {}
  }
  const received = []
  openWidgetSpeechLink(
    { onReady: (facts) => received.push(facts), onEnd() {}, onWords() {} },
    { url: 'wss://example.invalid', WebSocketImpl: Socket }
  )
  socket.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({ type: 'ready', provider: 'voicestudio', voices: [{ id: 'local' }] })
    })
  )
  assert.equal(received.length, 1)
  assert.equal(received[0].provider, 'voicestudio')
  assert.equal(received[0].voices[0].id, 'local')
})

test('ready accepts the finalized backend snapshot and preserves primary provider', () => {
  const facts = readySpeechFacts(
    { provider: 'elevenlabs' },
    {
      provider: 'voicestudio',
      actualProvider: 'voicestudio',
      primaryProvider: 'elevenlabs',
      fallbackUsed: true,
      revision: 'revision-2',
      voices: [{ id: 'preset', name: 'Configured voice' }],
      capabilities: { tts: { streaming: false, sampleRate: 24000 } },
      speak: { maxChars: 600, sampleRate: 24000, answerMs: 90000 },
      transcriptWaitMs: 90000
    }
  )
  assert.equal(facts.provider, 'elevenlabs')
  assert.equal(facts.actualProvider, 'voicestudio')
  assert.equal(facts.fallbackUsed, true)
  assert.equal(facts.capabilities.tts.streaming, false)
  assert.equal(facts.speak.answerMs, 90000)
})

test('each ready replaces the session token even when provider and revision are unchanged', () => {
  const initial = { provider: 'voicestudio', revision: 'same', sessionToken: 'other-tab' }
  const a = readySpeechFacts(initial, { provider: 'voicestudio', revision: 'same', sessionToken: 'tab-a' })
  const b = readySpeechFacts(initial, { provider: 'voicestudio', revision: 'same', sessionToken: 'tab-b' })
  assert.equal(a.sessionToken, 'tab-a')
  assert.equal(b.sessionToken, 'tab-b')
  assert.equal(initial.sessionToken, 'other-tab')
  assert.equal(readySpeechFacts(a, { provider: 'voicestudio', revision: 'same' }).sessionToken, undefined)
})
