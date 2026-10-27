// VoiceStudio's hold (`src/lib/speech-voicestudio.js`): audio spoken while the local server is still
// finishing the last phrase. A slow server is not a failure: the hold is bounded (`HELD_MAX_BYTES`),
// its pauses are shortened, the newest audio wins when it is full, the phrase being finished is never
// lost, and the session goes on — the relay tells the page its last words may be missing. The server
// is an in-process stand-in; nothing leaves this machine.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter, once } from 'node:events'
import { createServer } from 'node:http'
import WebSocket from 'ws'
import { VoiceStudioListening } from '../src/lib/speech-voicestudio.js'
import { speechRelay } from '../src/speech/relay.js'

const ORIGIN = 'http://voice.test'
/** The adapter's bounds: five seconds held at most, a pause in it kept to half a second. */
const HELD_MAX_BYTES = 5 * 32_000
const HELD_PAUSE_BYTES = 0.5 * 32_000
const profile = {
  baseUrl: 'http://127.0.0.1:47990',
  ttsModel: 'omnivoice',
  voice: 'default',
  fallbackEnabled: false
}

/** A frame of `seconds` of 16 kHz PCM at `level` (0 is silence; 1000 and up is speech). */
const pcm = (seconds, level) => {
  const frame = Buffer.alloc(Math.round(32_000 * seconds))
  for (let i = 0; i + 1 < frame.length; i += 2) frame.writeInt16LE(i % 4 === 0 ? level : -level, i)
  return frame
}
const chunk = (frame) => JSON.stringify({ audio_base_64: frame.toString('base64') })
const levelOf = (frame) => Math.abs(frame.readInt16LE(0))
const bytes = (frames) => frames.reduce((sum, f) => sum + f.length, 0)

/** Stand-in VoiceStudio sockets: each opens and starts its session at once, and answers only when told. */
function standIn() {
  const sockets = []
  const connect = () => {
    const ws = new EventEmitter()
    ws.readyState = WebSocket.OPEN
    ws.bufferedAmount = 0
    ws.sent = []
    ws.send = (raw) => ws.sent.push(raw)
    ws.close = ws.terminate = () => {
      ws.readyState = WebSocket.CLOSED
    }
    ws.tell = (message) => ws.emit('message', Buffer.from(JSON.stringify(message)))
    ws.audio = () => ws.sent.filter((x) => Buffer.isBuffer(x))
    ws.ended = () => ws.sent.some((x) => typeof x === 'string' && JSON.parse(x).type === 'input_audio.end')
    sockets.push(ws)
    queueMicrotask(() => {
      ws.emit('open')
      ws.tell({ type: 'session.started', protocol: 'voicestudio.speech.v1' })
    })
    return ws
  }
  return { sockets, connect }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('VoiceStudio: speech while the server finishes a phrase is held within its bound; the session never fails for it', async () => {
  const { sockets, connect } = standIn()
  const adapter = new VoiceStudioListening({ profile, key: null }, { connect })
  const out = []
  adapter.on('message', (raw) => out.push(JSON.parse(raw)))
  await tick()
  // The first phrase, then the pause that sends it to be finished.
  adapter.send(chunk(pcm(1, 1000)))
  for (let i = 0; i < 8; i++) adapter.send(chunk(pcm(0.1, 0)))
  assert.ok(sockets[0].ended(), 'the first phrase is being finished')
  // A slow server: twelve seconds of dictation, in short phrases with pauses, before it answers.
  for (let second = 1; second <= 12; second++) {
    for (let i = 0; i < 6; i++) adapter.send(chunk(pcm(0.1, 1000 + second)))
    for (let i = 0; i < 4; i++) adapter.send(chunk(pcm(0.1, 0)))
    assert.ok(adapter.bufferedAmount <= HELD_MAX_BYTES, `held audio stays bounded (${second} s)`)
    assert.ok(bytes(adapter.pending) <= HELD_MAX_BYTES)
  }
  assert.equal(adapter.closed, false, 'still running')
  assert.equal(out.filter((x) => x.message_type === 'provider_error').length, 0, 'never a provider failure')
  assert.ok(adapter.droppedBytes > 0, 'the hold gave way, and says how much')
  // The phrase being finished is never lost.
  sockets[0].tell({ type: 'final', final_kind: 'summary', text: 'First phrase.' })
  assert.deepEqual(
    out.filter((x) => x.message_type === 'committed_transcript').map((x) => x.text),
    ['First phrase.']
  )
  await tick()
  // The next phrase gets the newest audio held, in order, at most the bound.
  const next = sockets[1].audio()
  assert.ok(bytes(next) <= HELD_MAX_BYTES)
  const levels = next.map(levelOf).filter((level) => level > 0)
  assert.equal(levels.at(-1), 1012, 'the newest speech is kept')
  assert.deepEqual(
    levels,
    [...levels].sort((a, b) => a - b),
    'in the order it was spoken'
  )
  assert.ok(!levels.includes(1001), 'the oldest gave way')
  adapter.terminate()
})

test('VoiceStudio: long pauses in held audio are shortened, so a held phrase with pauses fits whole', async () => {
  const { sockets, connect } = standIn()
  const adapter = new VoiceStudioListening({ profile, key: null }, { connect })
  await tick()
  adapter.send(chunk(pcm(1, 1000)))
  for (let i = 0; i < 8; i++) adapter.send(chunk(pcm(0.1, 0)))
  // Three seconds of speech with two-second pauses: nine seconds spoken, about four held.
  for (let phrase = 0; phrase < 3; phrase++) {
    for (let i = 0; i < 10; i++) adapter.send(chunk(pcm(0.1, 2000 + phrase)))
    for (let i = 0; i < 20; i++) adapter.send(chunk(pcm(0.1, 0)))
  }
  assert.equal(adapter.droppedBytes, 0, 'no speech dropped')
  assert.ok(adapter.bufferedAmount <= 3 * 32_000 + 3 * HELD_PAUSE_BYTES)
  sockets[0].tell({ type: 'final', final_kind: 'summary', text: 'One.' })
  await tick()
  const speech = sockets[1].audio().filter((frame) => levelOf(frame) > 0)
  assert.equal(bytes(speech), 3 * 32_000, 'every word held reaches the next phrase')
  adapter.terminate()
})

test('voice relay: a session on a slow VoiceStudio outlives a full hold, keeps both phrases, and ends unsettled — never as provider', async () => {
  const { sockets, connect } = standIn()
  const snapshot = { provider: 'voicestudio', configured: true, key: null, revision: 'held-audio', profile }
  const logs = []
  const relay = speechRelay({
    config: { origin: ORIGIN, sessionSecret: 's', speech: null },
    resolveProfile: async () => snapshot,
    session: async () => 'held-audio@example.test',
    switchOn: async () => true,
    count: async () => false,
    log: { log: (line) => logs.push(line), warn: (line) => logs.push(line) },
    connect
  })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => void relay.upgrade(req, socket, head))
  server.listen(0)
  await once(server, 'listening')
  const page = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/speech/stream`, {
    headers: { origin: ORIGIN }
  })
  const said = []
  page.on('message', (raw) => said.push(JSON.parse(raw)))
  const until = async (check) => {
    for (let i = 0; i < 300 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
    assert.ok(check(), 'condition never held')
  }
  try {
    await once(page, 'open')
    await until(() => said.some((x) => x.type === 'ready'))
    page.send(pcm(1, 1000))
    for (let i = 0; i < 8; i++) page.send(pcm(0.1, 0))
    await until(() => sockets[0]?.ended())
    // Eight seconds more while the server is still on the first phrase.
    for (let i = 0; i < 16; i++) page.send(pcm(0.5, 1500))
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(said.filter((x) => x.type === 'end').length, 0, 'the session goes on')
    sockets[0].tell({ type: 'final', final_kind: 'summary', text: 'First phrase.' })
    await until(() => sockets[1]?.audio().length > 0)
    page.send(JSON.stringify({ type: 'stop' }))
    await until(() => sockets[1].ended())
    sockets[1].tell({ type: 'final', final_kind: 'summary', text: 'Second phrase.' })
    await until(() => said.some((x) => x.type === 'end'))
    assert.deepEqual(
      said.filter((x) => x.type === 'committed').map((x) => x.text),
      ['First phrase.', 'Second phrase.']
    )
    // Words were dropped, so the page is told the last words may be missing.
    assert.deepEqual(said.at(-1), { type: 'end', reason: 'stopped', settled: false })
    assert.match(logs.at(-1), /s of audio dropped while the speech server was busy/)
  } finally {
    page.terminate()
    await new Promise((r) => server.close(r))
  }
})
