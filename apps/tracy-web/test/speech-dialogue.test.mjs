import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { openDialogueReading, openSpeechTts } from '../src/lib/speech-tts.js'
import { speechTtsRequest, speechSpeakFacts, parseSpeechProfile } from '../src/lib/speech-provider.js'
import { readSpeechModels } from '../src/lib/speech-models.js'
const snapshot = {
  provider: 'elevenlabs',
  key: 'server-secret',
  profile: { ttsModel: 'eleven_v4_turbo', fallbackEnabled: false }
}
const asked = { text: 'Ready.', voice: 'voice', language: 'vi' }
function socket() {
  const ws = new EventEmitter()
  ws.sent = []
  ws.send = (raw) => ws.sent.push(JSON.parse(raw))
  ws.terminate = () => {
    ws.stopped = true
  }
  return ws
}
function setup(options = {}) {
  const ws = socket(),
    abort = new AbortController()
  let connection
  const promise = openDialogueReading(speechTtsRequest(snapshot, asked), {
    connect: (url, opts) => {
      connection = { url, opts }
      return ws
    },
    signal: abort.signal,
    ...options
  })
  return { ws, abort, promise, connection }
}
const audio = (ws) =>
  ws.emit(
    'message',
    Buffer.from(JSON.stringify({ audio: Buffer.from([1, 0, 2, 0]).toString('base64') })),
    false
  )
const event = (ws, message) => ws.emit('message', Buffer.from(JSON.stringify(message)), false)
test('dialogue model request uses exact transport, voice and language; secrets only headers', async () => {
  const http = speechTtsRequest({ ...snapshot, profile: { ttsModel: 'eleven_v4' } }, asked)
  assert.match(http.url, /text-to-dialogue\/stream\?output_format=pcm_24000/)
  assert.deepEqual(JSON.parse(http.body), {
    model_id: 'eleven_v4',
    inputs: [{ text: 'Ready.', voice_id: 'voice' }],
    language_code: 'vi'
  })
  const { ws, promise, connection } = setup()
  assert.equal(connection.url.searchParams.get('model_id'), 'eleven_v4_turbo')
  assert.equal(connection.url.searchParams.get('language_code'), 'vi')
  assert.equal(connection.opts.headers['xi-api-key'], 'server-secret')
  assert.equal(connection.opts.followRedirects, false)
  assert.ok(!connection.url.toString().includes('server-secret'))
  ws.emit('open')
  audio(ws)
  event(ws, { is_final_audio_for_turn: true })
  assert.deepEqual(ws.sent, [
    { voices: ['voice'] },
    { inputs: [{ text: 'Ready.', voice_id: 'voice' }], close_socket: true }
  ])
  assert.deepEqual([...new Uint8Array(await (await promise).arrayBuffer())], [1, 0, 2, 0])
  assert.equal(ws.stopped, true)
  assert.equal(speechSpeakFacts(snapshot).answerMs, 30000)
})
test('HTTP dialogue validates audio and joins split PCM samples', async () => {
  const response = await openSpeechTts({ ...snapshot, profile: { ttsModel: 'eleven_v4' } }, asked, {
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1]))
            c.enqueue(new Uint8Array([0, 2, 0]))
            c.close()
          }
        }),
        { headers: { 'content-type': 'audio/pcm' } }
      )
  })
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 0, 2, 0])
  const empty = await openSpeechTts({ ...snapshot, profile: { ttsModel: 'eleven_v4' } }, asked, {
    fetchImpl: async () => new Response('', { headers: { 'content-type': 'audio/pcm' } })
  })
  assert.equal(empty.status, 502)
})
for (const status of [400, 401, 402, 403, 429])
  test(`dialogue handshake preserves safe status ${status}`, async () => {
    const { ws, promise } = setup()
    ws.emit('unexpected-response', {}, { statusCode: status, resume() {} })
    assert.equal((await promise).status, status)
    assert.equal(ws.stopped, true)
  })
for (const message of [
  null,
  [],
  { audio: '%%%=' },
  { audio: 'AQ==' },
  { is_final: true },
  { error_type: 'provider_failed' }
])
  test(`dialogue rejects invalid/empty before output ${JSON.stringify(message)}`, async () => {
    const { ws, promise } = setup()
    event(ws, message)
    assert.equal((await promise).status, 502)
  })
test('upstream credit exhaustion is provider402, not a Tracy quota', async () => {
  const { ws, promise } = setup()
  event(ws, { error_type: 'quota_exceeded' })
  assert.equal((await promise).status, 402)
})
test('late error after first bytes errors the stream, never restarts', async () => {
  const { ws, promise } = setup()
  ws.emit('open')
  audio(ws)
  const reader = (await promise).body.getReader()
  assert.equal((await reader.read()).value.length, 4)
  event(ws, { error_type: 'quota_exceeded' })
  await assert.rejects(reader.read(), /SPEECH_STREAM_FAILED/)
  audio(ws)
  assert.equal(ws.sent.length, 2)
})
test('cancel before connection, midstream and reader cancel stop socket and late chunks', async () => {
  const first = setup()
  first.abort.abort()
  await assert.rejects(first.promise, { name: 'AbortError' })
  first.ws.emit('open')
  assert.equal(first.ws.sent.length, 0)
  const second = setup()
  audio(second.ws)
  const response = await second.promise
  second.abort.abort()
  await assert.rejects(response.arrayBuffer(), { name: 'AbortError' })
  assert.equal(second.ws.stopped, true)
  const third = setup()
  audio(third.ws)
  await (await third.promise).body.cancel()
  audio(third.ws)
  assert.equal(third.ws.stopped, true)
})
test('generation timeout and queue bounds close the provider without output', async () => {
  const timeout = setup({ firstAudioMs: 5 })
  assert.equal((await timeout.promise).status, 502)
  assert.equal(timeout.ws.stopped, true)
  const bounded = setup({ maxBufferedBytes: 2 })
  audio(bounded.ws)
  assert.equal((await bounded.promise).status, 502)
})
test('cached dialogue compatibility refreshes without changing saved preference', async () => {
  const rows = [
    {
      models: [{ id: 'eleven_v4_turbo', kind: 'tts', selectable: false, reason: 'old adapter' }],
      read_at: new Date(),
      fingerprint: ''
    }
  ]
  const result = await readSpeechModels({ query: async () => ({ rows }) }, snapshot, 'secret')
  assert.equal(result.models[0].selectable, true)
  assert.equal(result.models[0].reason, null)
  assert.equal(snapshot.profile.ttsModel, 'eleven_v4_turbo')
  assert.ok(
    !parseSpeechProfile({
      provider: 'elevenlabs',
      profile: { sttModel: 'scribe_v2_realtime', ttsModel: 'eleven_v4_turbo' }
    }).error
  )
})

test('HTTP dialogue rejects successful JSON and a truncated PCM sample', async () => {
  const http = { ...snapshot, profile: { ttsModel: 'eleven_v4' } }
  const json = await openSpeechTts(http, asked, {
    fetchImpl: async () => Response.json({ audio: 'not PCM' })
  })
  assert.equal(json.status, 502)
  await assert.rejects(
    openSpeechTts(http, asked, {
      fetchImpl: async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/pcm' } })
    }),
    /INVALID_PCM/
  )
})

test('HTTP abort between first read and output construction cannot enqueue late audio or hang', async () => {
  const abort = new AbortController()
  let cancelled = 0
  const fake = {
    ok: true,
    headers: new Headers({ 'content-type': 'audio/pcm' }),
    body: {
      getReader() {
        return {
          read: async () => {
            queueMicrotask(() => queueMicrotask(() => abort.abort()))
            return { value: new Uint8Array([1, 0]), done: false }
          },
          cancel: async () => {
            cancelled++
          }
        }
      }
    }
  }
  await assert.rejects(
    openSpeechTts({ ...snapshot, profile: { ttsModel: 'eleven_v4' } }, asked, {
      signal: abort.signal,
      fetchImpl: async () => fake
    }),
    { name: 'AbortError' }
  )
  assert.equal(cancelled, 1)
})
test('HTTP first audio/total/idle deadlines cancel blocked reader; body cancel releases its reader', async () => {
  const http = { ...snapshot, profile: { ttsModel: 'eleven_v4' } }
  for (const mode of ['first', 'total', 'idle', 'cancel']) {
    let cancelled = 0
    const response = new Response(
      new ReadableStream({
        start(c) {
          if (mode !== 'first') c.enqueue(new Uint8Array([1, 0]))
        },
        cancel() {
          cancelled++
        }
      }),
      { headers: { 'content-type': 'audio/pcm' } }
    )
    const reading = openSpeechTts(http, asked, {
      fetchImpl: async () => response,
      dialogueOptions: {
        firstAudioMs: mode === 'first' ? 5 : 100,
        totalMs: mode === 'total' ? 5 : 100,
        idleMs: mode === 'idle' ? 5 : 100
      }
    })
    if (mode === 'first') await assert.rejects(reading, /SPEECH_STREAM_TIMEOUT/)
    else if (mode === 'cancel') await (await reading).body.cancel()
    else await assert.rejects((await reading).arrayBuffer(), /SPEECH_STREAM_TIMEOUT/)
    assert.equal(cancelled, 1)
  }
})
test('WS authentication and model configuration failures retain safe distinct statuses', async () => {
  for (const [code, status] of [
    ['authentication_error', 401],
    ['model_not_found', 400]
  ]) {
    const { ws, promise } = setup()
    event(ws, { error_type: code })
    const response = await promise
    assert.equal(response.status, status)
    assert.ok(!JSON.stringify(await response.json()).includes('secret'))
  }
})
