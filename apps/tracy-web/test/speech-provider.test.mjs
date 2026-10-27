import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter, once } from 'node:events'
import { createServer } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'
import { readFile } from 'node:fs/promises'
import {
  parseSpeechBase,
  parseSpeechProfile,
  readSpeechProfile,
  saveSpeechProfile,
  speechProfileFacts,
  speechVoices
} from '../src/lib/speech-provider.js'
import { saveSpeechKey, SPEAK_VOICES } from '../src/lib/speech.js'
import { createSpeechHealth } from '../src/lib/speech-health.js'
import { activeSpeechSession, bindSpeechSession, resolveSpeechSession } from '../src/lib/speech-session.js'
import { VoiceStudioListening } from '../src/lib/speech-voicestudio.js'
import { probeSpeechProfile } from '../src/lib/speech-probe.js'
import { metadataAddress } from '../src/lib/speech-network.js'
import { speechOpsRoutes } from '../src/ops/speech.js'
import { speechRoutes } from '../src/speech/route.js'
import { speechRelay } from '../src/speech/relay.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'

const SECRET = 'isolated-provider-tests-secret'
const ORIGIN = 'http://voice.test'
const localProfile = {
  baseUrl: 'http://127.0.0.1:47990',
  ttsModel: 'omnivoice',
  voice: 'default',
  fallbackEnabled: false
}
const cloudProfile = { sttModel: 'scribe_v2_realtime', ttsModel: 'eleven_flash_v2_5', fallbackEnabled: false }
const config = { origin: ORIGIN, sessionSecret: SECRET, speech: { apiKey: 'cloud-secret-123' } }
const quiet = { log() {}, warn() {} }
function database(role = 'admin') {
  const db = { row: null, role, writes: [] }
  db.query = async (sql, args) => {
    if (sql.includes('seat_workspace')) return { rows: db.role ? [{ role: db.role }] : [] }
    if (sql.includes('insert into rate_bucket')) return { rows: [{ count: db.quota ? 999999999 : 0 }] }
    if (sql.includes('ui_setting')) return { rows: [{ on: true }] }
    if (sql.startsWith('select')) {
      if (sql.includes('speech_setting')) return { rows: db.row ? [db.row] : [] }
      if (sql.includes('rate_bucket')) return { rows: [] }
    }
    if (sql.includes('insert into speech_setting')) {
      db.writes.push(args)
      if (sql.includes('jsonb_build_object')) {
        const [by, provider, raw] = args
        const profile = JSON.parse(raw)
        const profiles = { ...db.row?.profiles, [provider]: { ...db.row?.profiles?.[provider], ...profile } }
        db.row = { ...db.row, provider, profiles, revision: (db.row?.revision ?? 0) + 1, updated_by: by }
      } else db.row = { ...db.row, api_key_cipher: args[0], updated_by: args[1] }
      return { rows: [] }
    }
    throw new Error('Unexpected test query')
  }
  return db
}
async function save(db, provider, profile) {
  const parsed = parseSpeechProfile({ provider, profile })
  assert.equal(parsed.ok, true)
  await saveSpeechProfile(db, parsed, SECRET, 'admin@example.test')
  return readSpeechProfile(db, config)
}
async function request(
  app,
  path,
  { method = 'GET', body, origin = ORIGIN, signed = true, signal, email = 'admin@example.test' } = {}
) {
  return app.request(
    new Request(ORIGIN + path, {
      method,
      headers: {
        origin,
        'content-type': 'application/json',
        ...(signed ? { cookie: `${SESSION_COOKIE}=${await mintSession(email, SECRET)}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal
    })
  )
}

test('speech providers: legacy key and environment defaults survive; profiles and independent fallback settings persist sealed', async () => {
  const db = database()
  const legacy = await readSpeechProfile(db, config)
  assert.equal(legacy.provider, 'elevenlabs')
  assert.deepEqual(speechVoices(legacy), SPEAK_VOICES)
  assert.equal(legacy.profile.fallbackEnabled, false)
  await saveSpeechKey(db, 'saved-cloud-key', SECRET, 'admin')
  await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: false })
  const local = await save(db, 'voicestudio', {
    ...localProfile,
    token: 'local-secret-token',
    fallbackEnabled: true
  })
  assert.equal(local.key, 'local-secret-token')
  assert.equal(local.alternative.key, 'saved-cloud-key')
  assert.equal(local.alternative.alternative, undefined, 'both directions never recurse')
  const facts = JSON.stringify(speechProfileFacts(local))
  assert.ok(
    !facts.includes('local-secret-token') &&
      !facts.includes('saved-cloud-key') &&
      !facts.includes('tokenCipher')
  )
  assert.notEqual(db.row.profiles.voicestudio.tokenCipher, 'local-secret-token')
  const back = await save(db, 'elevenlabs', cloudProfile)
  assert.equal(back.profile.fallbackEnabled, false)
  assert.equal(back.profiles.voicestudio.fallbackEnabled, true)
  const again = await save(db, 'voicestudio', { ...localProfile, fallbackEnabled: true })
  assert.equal(again.key, 'local-secret-token', 'omitting token preserves it')
  const removed = await save(db, 'voicestudio', { ...localProfile, token: '' })
  assert.equal(removed.key, null)
  assert.equal(removed.configured, true, 'loopback needs no token')
})

test('speech providers: URLs and model inputs reject credentials, metadata, fragments, bad protocols and injection', async () => {
  for (const url of [
    'file:///tmp/key',
    'http://u:p@localhost',
    'http://localhost/#secret',
    'http://localhost/?url=x',
    'http://169.254.169.254',
    'http://metadata.google.internal',
    'http://[fe80::1]'
  ])
    assert.equal(parseSpeechBase(url), null, url)
  assert.equal(parseSpeechBase('http://192.168.1.2:3900'), 'http://192.168.1.2:3900')
  assert.equal(parseSpeechBase('https://gpu.example.test/subpath/'), 'https://gpu.example.test/subpath')
  assert.equal(metadataAddress('169.254.169.254'), true)
  assert.equal(metadataAddress('fd00:ec2::254'), true)
  assert.equal(metadataAddress('127.0.0.1'), false)
  assert.equal(parseSpeechProfile({ provider: 'unknown', profile: {} }).ok, false)
  assert.equal(
    parseSpeechProfile({ provider: 'voicestudio', profile: { ...localProfile, ttsModel: '../etc/passwd' } })
      .ok,
    false
  )
  assert.equal(
    parseSpeechProfile({ provider: 'voicestudio', profile: { ...localProfile, fallbackEnabled: 'yes' } }).ok,
    false
  )
})

test('speech providers: only same-origin admins apply or test; no browser secret and draft tests never apply', async () => {
  const db = database()
  const app = speechOpsRoutes({ pool: db, config, log: quiet })
  const body = { provider: 'voicestudio', profile: { ...localProfile, token: 'never-return-this' } }
  assert.equal(
    (await request(app, '/api/ops/speech/provider', { method: 'PUT', body, signed: false })).status,
    302
  )
  assert.equal(
    (await request(app, '/api/ops/speech/provider', { method: 'PUT', body, origin: 'http://other.test' }))
      .status,
    403
  )
  db.role = 'developer'
  assert.equal((await request(app, '/api/ops/speech/provider', { method: 'PUT', body })).status, 403)
  assert.equal((await request(app, '/api/ops/speech/provider/test', { method: 'POST', body })).status, 403)
  assert.equal(db.writes.length, 0)
  db.role = 'admin'
  const res = await request(app, '/api/ops/speech/provider', { method: 'PUT', body })
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.ok(!text.includes('never-return-this') && !text.includes('cloud-secret-123'))
  assert.equal(JSON.parse(text).service.provider, 'VoiceStudio')
  const before = db.writes.length
  const invalid = await request(app, '/api/ops/speech/provider/test', {
    method: 'POST',
    body: { ...body, profile: { ...localProfile, baseUrl: 'ftp://localhost' } }
  })
  assert.equal(invalid.status, 400)
  assert.equal(db.writes.length, before)
})

test('speech providers: health from an older revision cannot override new configuration', () => {
  const health = createSpeechHealth(() => 10)
  health.bind('old')
  health.note('stt', 'refused', 'old_key', 'old')
  health.bind('new')
  health.note('tts', 'ok', null, 'new')
  health.note('stt', 'refused', 'late_old_probe', 'old')
  assert.deepEqual(health.get(), { stt: null, tts: { outcome: 'ok', at: 10, reason: null } })
})

test('speech providers: VoiceStudio summary commits once, explicit finalization, cancellation drops late output', async () => {
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
    sockets.push(ws)
    queueMicrotask(() => {
      ws.emit('open')
      ws.emit(
        'message',
        Buffer.from(JSON.stringify({ type: 'session.started', protocol: 'voicestudio.speech.v1' }))
      )
    })
    return ws
  }
  const adapter = new VoiceStudioListening({ profile: localProfile, key: null }, { connect })
  const out = []
  adapter.on('message', (raw) => out.push(JSON.parse(raw)))
  await new Promise((r) => setImmediate(r))
  const loud = Buffer.alloc(3200)
  for (let i = 0; i < loud.length; i += 2) loud.writeInt16LE(1000, i)
  adapter.send(JSON.stringify({ audio_base_64: loud.toString('base64') }))
  for (let n = 0; n < 8; n++)
    adapter.send(JSON.stringify({ audio_base_64: Buffer.alloc(3200).toString('base64') }))
  assert.equal(JSON.parse(sockets[0].sent.at(-1)).type, 'input_audio.end')
  const message = (value) => sockets[0].emit('message', Buffer.from(JSON.stringify(value)))
  message({ type: 'final', final_kind: 'utterance', text: 'Hello' })
  message({ type: 'final', final_kind: 'summary', text: 'Hello' })
  message({ type: 'final', final_kind: 'summary', text: 'Hello' })
  assert.equal(out.filter((x) => x.message_type === 'committed_transcript').length, 1)
  adapter.terminate()
  const before = out.length
  sockets.at(-1).emit('message', Buffer.from(JSON.stringify({ type: 'partial', text: 'late' })))
  assert.equal(out.length, before)
})

test('speech providers: TTS primary healthy, A-off/B-on, both-on no loop, unconfigured target and partial stream failure', async () => {
  const db = database()
  await save(db, 'voicestudio', { ...localProfile, fallbackEnabled: true })
  await save(db, 'elevenlabs', cloudProfile)
  let calls = []
  let mode = 'fail'
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    if (mode === 'healthy') return new Response(Buffer.alloc(20))
    if (mode === 'partial')
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1, 0]))
          },
          pull(c) {
            c.error(new Error('stream_broken'))
          }
        })
      )
    return new Response('{}', { status: 503 })
  }
  const app = speechRoutes({ pool: db, config, fetchImpl, log: quiet })
  const say = () =>
    request(app, '/api/speech/say', {
      method: 'POST',
      body: { text: 'Hello' },
      email: 'tts-provider@example.test'
    })
  assert.equal((await say()).status, 502)
  assert.equal(calls.length, 1, 'A off ignores B on')
  calls = []
  await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
  assert.equal((await say()).status, 502)
  assert.equal(calls.length, 2, 'both on tries once each')
  calls = []
  mode = 'healthy'
  const healthy = await say()
  assert.equal(healthy.status, 200)
  await healthy.arrayBuffer()
  assert.equal(calls.length, 1)
  calls = []
  mode = 'partial'
  const partial = await say()
  await assert.rejects(partial.arrayBuffer())
  assert.equal(calls.length, 1, 'never replay partly streamed audio')
  calls = []
  mode = 'fail'
  db.row.profiles.voicestudio.baseUrl = ''
  await say()
  assert.equal(calls.length, 1, 'unconfigured target is not called')
})

test('speech providers: an active listening snapshot keeps TTS coherent and revision changes require restart', async () => {
  const db = database()
  await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
  let snapshot = await save(db, 'voicestudio', { ...localProfile, fallbackEnabled: true })
  bindSpeechSession('coherent@example.test', snapshot)
  let called = 0
  const app = speechRoutes({
    pool: db,
    config,
    fetchImpl: async () => {
      called++
      return new Response('{}', { status: 503 })
    },
    log: quiet
  })
  const say = () =>
    request(app, '/api/speech/say', {
      method: 'POST',
      body: { text: 'Hello' },
      email: 'coherent@example.test'
    })
  await say()
  assert.equal(called, 1, 'active session never mixes TTS provider')
  await save(db, 'elevenlabs', cloudProfile)
  assert.equal((await say()).status, 409)
  assert.equal(called, 1)
})

test('speech providers: migration adds default ElevenLabs without replacing the existing cipher', async () => {
  const sql = await readFile(new URL('../src/db/migrations/124-speech-provider.sql', import.meta.url), 'utf8')
  assert.match(sql, /default 'elevenlabs'/)
  assert.match(sql, /revision bigint/)
  assert.doesNotMatch(sql, /drop |update speech_setting|api_key_cipher\s*=/i)
})

for (const refusal of ['auth_error', 'quota_exceeded'])
  test(`speech providers: STT ${refusal} fallback is one hop before audio; effective TTS stays coherent`, async () => {
    const db = database()
    await save(db, 'voicestudio', { ...localProfile, fallbackEnabled: true })
    const snapshot = await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
    const service = new WebSocketServer({ port: 0 })
    await once(service, 'listening')
    const paths = [],
      audio = []
    service.on('connection', (ws, req) => {
      paths.push(req.url)
      if (req.url.includes('speech-to-text')) {
        ws.send(JSON.stringify({ message_type: refusal, error: refusal }))
        return
      }
      ws.send(JSON.stringify({ type: 'session.started', protocol: 'voicestudio.speech.v1' }))
      ws.on('message', (raw, binary) => {
        if (binary) {
          audio.push(raw)
          return
        }
        if (JSON.parse(raw).type === 'input_audio.end')
          ws.send(JSON.stringify({ type: 'final', final_kind: 'summary', text: 'Hello Tracy' }))
      })
    })
    const relay = speechRelay({
      config,
      resolveProfile: async () => snapshot,
      session: async () => `fallback-session-${refusal}@example.test`,
      switchOn: async () => true,
      count: async () => false,
      log: quiet,
      connect: (url, options) =>
        new WebSocket(`ws://127.0.0.1:${service.address().port}${url.pathname}${url.search}`, options)
    })
    const server = createServer()
    server.on('upgrade', (req, socket, head) => void relay.upgrade(req, socket, head))
    server.listen(0)
    await once(server, 'listening')
    const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/speech/stream`, {
      headers: { origin: ORIGIN }
    })
    const received = []
    client.on('message', (raw) => received.push(JSON.parse(raw)))
    try {
      await once(client, 'open')
      client.send(Buffer.alloc(3200, 4))
      for (let i = 0; i < 200 && !received.some((x) => x.type === 'ready'); i++)
        await new Promise((r) => setTimeout(r, 5))
      const ready = received.find((x) => x.type === 'ready')
      assert.equal(ready.provider, 'voicestudio')
      assert.equal(ready.fallbackUsed, true)
      assert.equal(ready.voices[0].id, 'default')
      assert.equal(paths.length, 2)
      assert.equal(activeSpeechSession(`fallback-session-${refusal}@example.test`).provider, 'voicestudio')
      for (let i = 0; i < 200 && audio.length === 0; i++) await new Promise((r) => setTimeout(r, 5))
      assert.equal(audio.length, 1, 'queued input sent once to accepted target')
      let called
      const app = speechRoutes({
        pool: db,
        config,
        log: quiet,
        fetchImpl: async (url, init) => {
          called = { url: String(url), body: JSON.parse(init.body) }
          return new Response(Buffer.alloc(10))
        }
      })
      const answer = await request(app, '/api/speech/say', {
        method: 'POST',
        body: { text: 'Hello', voice: SPEAK_VOICES[0].id, sessionToken: ready.sessionToken },
        email: `fallback-session-${refusal}@example.test`
      })
      await answer.arrayBuffer()
      assert.match(called.url, /v1\/audio\/speech$/)
      assert.equal(called.body.voice, 'default')
      assert.equal(answer.headers.get('x-speech-fallback'), 'true')
    } finally {
      client.terminate()
      for (const ws of service.clients) ws.terminate()
      await new Promise((r) => server.close(r))
      await new Promise((r) => service.close(r))
    }
  })

test('speech providers: a fallback before ready takes its place at the other service; that one full, the session is busy', async () => {
  const db = database()
  const local = await save(db, 'voicestudio', { ...localProfile, fallbackEnabled: true })
  const cloud = await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
  const service = new WebSocketServer({ port: 0 })
  await once(service, 'listening')
  const paths = []
  service.on('connection', (ws, req) => {
    paths.push(req.url)
    if (req.url.includes('speech-to-text')) {
      ws.send(JSON.stringify({ message_type: 'auth_error', error: 'auth_error' }))
      return
    }
    ws.send(JSON.stringify({ type: 'session.started', protocol: 'voicestudio.speech.v1' }))
  })
  // The first session listens on VoiceStudio and holds its only place; the second starts on ElevenLabs.
  const snapshots = [local, cloud]
  const relay = speechRelay({
    config,
    maxConcurrent: 1,
    resolveProfile: async () => snapshots.shift() ?? cloud,
    session: async (cookie) => cookie,
    switchOn: async () => true,
    count: async () => false,
    log: quiet,
    connect: (url, options) =>
      new WebSocket(`ws://127.0.0.1:${service.address().port}${url.pathname}${url.search}`, options)
  })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => void relay.upgrade(req, socket, head))
  server.listen(0)
  await once(server, 'listening')
  const open = (who) => {
    const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/speech/stream`, {
      headers: { origin: ORIGIN, cookie: who }
    })
    const received = []
    client.on('message', (raw) => received.push(JSON.parse(raw)))
    return { client, received, closed: once(client, 'close') }
  }
  const first = open('first@example.test')
  const second = { client: null }
  try {
    for (let i = 0; i < 200 && !first.received.some((x) => x.type === 'ready'); i++)
      await new Promise((r) => setTimeout(r, 5))
    assert.equal(first.received.find((x) => x.type === 'ready')?.provider, 'voicestudio')
    assert.equal(relay.busy, 1)
    Object.assign(second, open('second@example.test'))
    await second.closed
    assert.deepEqual(second.received.at(-1), { type: 'end', reason: 'provider-busy', settled: true })
    assert.equal(paths.filter((p) => p.includes('speech-to-text')).length, 1, 'ElevenLabs was tried once')
    assert.equal(paths.length, 2, 'no second VoiceStudio session was opened past its only place')
    assert.equal(relay.busy, 1, 'the first session keeps its place; the second gave its own back')
  } finally {
    first.client.terminate()
    second.client?.terminate()
    for (const ws of service.clients) ws.terminate()
    await new Promise((r) => server.close(r))
    await new Promise((r) => service.close(r))
  }
})

test('speech providers: user cancellation and Tracy quotas forbid fallback; upstream quota permits one pre-output attempt', async () => {
  const db = database()
  await save(db, 'voicestudio', localProfile)
  await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
  let calls = 0
  const abort = new AbortController()
  const app = speechRoutes({
    pool: db,
    config,
    log: quiet,
    fetchImpl: async (_url, _init) => {
      calls++
      if (abort.signal.aborted) throw new Error('cancelled')
      abort.abort()
      throw new Error('cancelled')
    }
  })
  await request(app, '/api/speech/say', {
    method: 'POST',
    body: { text: 'Hello' },
    signal: abort.signal,
    email: 'cancel-only@example.test'
  })
  assert.equal(calls, 1)
  calls = 0
  db.quota = true
  assert.equal(
    (await request(app, '/api/speech/say', { method: 'POST', body: { text: 'Hello' } })).status,
    429
  )
  assert.equal(calls, 0)
  db.quota = false
  const busy = speechRoutes({
    pool: db,
    config,
    log: quiet,
    fetchImpl: async () => {
      calls++
      return new Response('{}', { status: 429 })
    }
  })
  await request(busy, '/api/speech/say', { method: 'POST', body: { text: 'Hello' } })
  assert.equal(calls, 2)
})

test('speech sessions: tokens isolate simultaneous primary/fallback tabs, fence legacy ambiguity and expire', () => {
  const primary = { provider: 'elevenlabs', revision: 'same' }
  const fallback = { provider: 'voicestudio', revision: 'same', fallbackUsed: true }
  const a = bindSpeechSession('tabs@example.test', primary, 100)
  const b = bindSpeechSession('tabs@example.test', fallback, 100)
  assert.equal(resolveSpeechSession('tabs@example.test', 'same', a, 101).snapshot.provider, 'elevenlabs')
  assert.equal(resolveSpeechSession('tabs@example.test', 'same', b, 101).snapshot.provider, 'voicestudio')
  assert.equal(resolveSpeechSession('tabs@example.test', 'same', undefined, 101).ok, false)
  assert.equal(resolveSpeechSession('other@example.test', 'same', a, 101).ok, false)
  assert.equal(resolveSpeechSession('tabs@example.test', 'new', a, 101).ok, false)
  assert.equal(resolveSpeechSession('tabs@example.test', 'same', a, 31 * 60_000).ok, false)
})

test('speech profiles: primary, key and fallback are read from one consistent database row', async () => {
  let reads = 0
  const db = database()
  await save(db, 'voicestudio', localProfile)
  await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
  const query = db.query
  db.query = async (...args) => {
    if (args[0].startsWith('select')) reads++
    return query(...args)
  }
  const snapshot = await readSpeechProfile(db, config)
  assert.equal(reads, 1)
  assert.equal(snapshot.provider, 'elevenlabs')
  assert.equal(snapshot.alternative.provider, 'voicestudio')
})

test('speech say: actual tokens keep two tabs on different providers and reject cross-account or legacy ambiguity', async () => {
  const db = database()
  await save(db, 'voicestudio', localProfile)
  const primary = await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
  const a = bindSpeechSession('http-tabs@example.test', primary)
  const b = bindSpeechSession('http-tabs@example.test', primary.alternative)
  const calls = []
  const app = speechRoutes({
    pool: db,
    config,
    log: quiet,
    fetchImpl: async (url) => {
      calls.push(String(url))
      return new Response(Buffer.alloc(10))
    }
  })
  const say = (sessionToken, email = 'http-tabs@example.test') =>
    request(app, '/api/speech/say', { method: 'POST', email, body: { text: 'Hello', sessionToken } })
  const first = await say(a)
  await first.arrayBuffer()
  assert.equal(first.headers.get('x-speech-provider'), 'elevenlabs')
  const second = await say(b)
  await second.arrayBuffer()
  assert.equal(second.headers.get('x-speech-provider'), 'voicestudio')
  assert.equal((await say(undefined)).status, 409)
  assert.equal((await say(a, 'other-http-tab@example.test')).status, 409)
  assert.equal((await say('unknown')).status, 409)
  assert.equal(calls.length, 2)
})

test('speech probes: local STT finalizes before TTS admission; transient busy does not claim a refused key', async () => {
  const db = database()
  const snapshot = await save(db, 'voicestudio', localProfile)
  let busy = true,
    called = 0
  const connect = () => {
    const ws = new EventEmitter()
    ws.readyState = WebSocket.OPEN
    ws.bufferedAmount = 0
    ws.terminate = ws.close = () => {
      ws.readyState = WebSocket.CLOSED
    }
    ws.send = (raw) => {
      if (typeof raw === 'string' && JSON.parse(raw).type === 'input_audio.end')
        setTimeout(() => {
          busy = false
          ws.emit('message', Buffer.from(JSON.stringify({ type: 'final', final_kind: 'summary', text: '' })))
        }, 5)
    }
    queueMicrotask(() => {
      ws.emit('open')
      ws.emit(
        'message',
        Buffer.from(JSON.stringify({ type: 'session.started', protocol: 'voicestudio.speech.v1' }))
      )
    })
    return ws
  }
  const result = await probeSpeechProfile(snapshot, {
    connect,
    fetchImpl: async () => {
      called++
      assert.equal(busy, false, 'a shared GPU must not receive competing probe jobs')
      return new Response(Buffer.alloc(10))
    }
  })
  assert.equal(called, 1)
  assert.equal(result.stt.outcome, 'ok')
  assert.equal(result.tts.outcome, 'ok')
  const transient = await probeSpeechProfile(
    { ...snapshot, provider: 'elevenlabs', key: 'test' },
    {
      connect: () => {
        const ws = new EventEmitter()
        ws.terminate = () => {}
        queueMicrotask(() =>
          ws.emit('message', Buffer.from(JSON.stringify({ message_type: 'session_started' })))
        )
        return ws
      },
      fetchImpl: async () => new Response('{}', { status: 429 })
    }
  )
  assert.equal(transient.tts.outcome, null)
})

test('speech STT: failure after ready and partial audio stops without fallback or replay', async () => {
  const db = database()
  await save(db, 'voicestudio', localProfile)
  const snapshot = await save(db, 'elevenlabs', { ...cloudProfile, fallbackEnabled: true })
  let connections = 0,
    sent = 0
  const connect = () => {
    connections++
    const ws = new EventEmitter()
    ws.readyState = WebSocket.OPEN
    ws.bufferedAmount = 0
    ws.send = () => {
      sent++
      queueMicrotask(() => {
        ws.emit(
          'message',
          Buffer.from(JSON.stringify({ message_type: 'partial_transcript', text: 'A partial phrase' }))
        )
        ws.emit(
          'message',
          Buffer.from(JSON.stringify({ message_type: 'quota_exceeded', error: 'quota_exceeded' }))
        )
      })
    }
    ws.terminate = () => {
      ws.readyState = WebSocket.CLOSED
    }
    queueMicrotask(() => {
      ws.emit('open')
      ws.emit('message', Buffer.from(JSON.stringify({ message_type: 'session_started' })))
    })
    return ws
  }
  const relay = speechRelay({
    config,
    resolveProfile: async () => snapshot,
    session: async () => 'partial-failure@example.test',
    switchOn: async () => true,
    count: async () => false,
    log: quiet,
    connect
  })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => void relay.upgrade(req, socket, head))
  server.listen(0)
  await once(server, 'listening')
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/speech/stream`, {
    headers: { origin: ORIGIN }
  })
  const messages = []
  client.on('message', (raw) => messages.push(JSON.parse(raw)))
  try {
    await once(client, 'open')
    client.send(Buffer.alloc(3200, 4))
    await once(client, 'close')
    assert.equal(connections, 1)
    assert.equal(sent, 1)
    assert.equal(messages.filter((x) => x.type === 'partial').length, 1)
    assert.equal(messages.filter((x) => x.type === 'committed').length, 0)
    // Credits used up: Voice is not available, not "busy, try again in a minute".
    assert.equal(messages.at(-1).reason, 'provider')
  } finally {
    client.terminate()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('speech sessions: repeated legacy sessions with the same provider and revision stay compatible', () => {
  const snapshot = { provider: 'elevenlabs', revision: 'legacy-compatible' }
  bindSpeechSession('serial-legacy@example.test', snapshot, 100)
  bindSpeechSession('serial-legacy@example.test', snapshot, 101)
  assert.equal(
    resolveSpeechSession('serial-legacy@example.test', 'legacy-compatible', undefined, 102).ok,
    true
  )
  assert.equal(resolveSpeechSession('serial-legacy@example.test', 'changed', undefined, 102).ok, false)
})

test('speech revisions: rotating the fallback provider key fences its existing session', async () => {
  const db = database()
  await saveSpeechKey(db, 'old-target-key', SECRET, 'admin')
  const first = await save(db, 'voicestudio', { ...localProfile, fallbackEnabled: true })
  const token = bindSpeechSession('rotated-fallback@example.test', first.alternative)
  await saveSpeechKey(db, 'new-target-key', SECRET, 'admin')
  const next = await readSpeechProfile(db, config)
  assert.notEqual(next.revision, first.revision)
  assert.equal(next.alternative.key, 'new-target-key')
  assert.equal(resolveSpeechSession('rotated-fallback@example.test', next.revision, token).ok, false)
})

test('VoiceStudio: silence never publishes hallucinated words or starts another agent prompt', async () => {
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
    sockets.push(ws)
    queueMicrotask(() => {
      ws.emit('open')
      ws.emit(
        'message',
        Buffer.from(JSON.stringify({ type: 'session.started', protocol: 'voicestudio.speech.v1' }))
      )
    })
    return ws
  }
  const adapter = new VoiceStudioListening({ profile: localProfile, key: null }, { connect })
  const output = []
  adapter.on('message', (raw) => output.push(JSON.parse(raw)))
  await new Promise((resolve) => setImmediate(resolve))
  for (let i = 0; i < 10; i++)
    adapter.send(JSON.stringify({ audio_base_64: Buffer.alloc(3200).toString('base64') }))
  assert.equal(sockets[0].sent.length, 0, 'idle silence does not become an ASR job')
  sockets[0].emit('message', Buffer.from(JSON.stringify({ type: 'partial', text: 'Thank you.' })))
  assert.equal(output.filter((x) => x.message_type === 'partial_transcript').length, 0)
  adapter.send(JSON.stringify({ commit: true }))
  sockets[0].emit(
    'message',
    Buffer.from(JSON.stringify({ type: 'final', final_kind: 'summary', text: 'Thank you.' }))
  )
  assert.deepEqual(
    output.filter((x) => x.message_type === 'committed_transcript').map((x) => x.text),
    ['']
  )
  adapter.terminate()
})

test('dialogue say uses v4 Turbo socket, upstream credits fallback once, partial audio and Tracy quota never retry', async () => {
  for (const mode of ['healthy', 'credits', 'partial', 'tracy-quota', 'cancel']) {
    const db = database()
    await save(db, 'voicestudio', localProfile)
    await save(db, 'elevenlabs', { ...cloudProfile, ttsModel: 'eleven_v4_turbo', fallbackEnabled: true })
    let sockets = 0,
      localCalls = 0
    const abort = new AbortController()
    const connect = () => {
      sockets++
      const ws = new EventEmitter()
      ws.terminate = () => {}
      ws.send = (raw) => {
        if (!JSON.parse(raw).inputs) return
        queueMicrotask(() => {
          if (mode === 'credits') ws.emit('message', Buffer.from('{"error_type":"quota_exceeded"}'))
          else {
            ws.emit('message', Buffer.from('{"audio":"AQACAA=="}'))
            if (mode === 'partial')
              setTimeout(() => ws.emit('message', Buffer.from('{"error_type":"quota_exceeded"}')), 5)
            else ws.emit('message', Buffer.from('{"is_final":true}'))
          }
        })
      }
      queueMicrotask(() => ws.emit('open'))
      return ws
    }
    if (mode === 'tracy-quota') db.quota = true
    if (mode === 'cancel') abort.abort()
    const app = speechRoutes({
      config,
      pool: db,
      connect,
      fetchImpl: async () => {
        localCalls++
        return new Response(new Uint8Array([3, 0]))
      },
      log: quiet
    })
    const response = await request(app, '/api/speech/say', {
      method: 'POST',
      body: { text: 'Ready.' },
      signal: abort.signal,
      email: `dialogue-${mode}@example.test`
    })
    if (mode === 'tracy-quota') {
      assert.equal(response.status, 429)
      assert.equal(sockets, 0)
    } else if (mode === 'cancel') {
      assert.equal(sockets, 0)
      assert.equal(response.status, 502)
    } else {
      assert.equal(response.status, 200)
      assert.equal(
        response.headers.get('x-speech-provider'),
        mode === 'credits' ? 'voicestudio' : 'elevenlabs'
      )
      if (mode === 'partial') await assert.rejects(response.arrayBuffer())
      else assert.ok((await response.arrayBuffer()).byteLength)
      assert.equal(sockets, 1)
    }
    assert.equal(localCalls, mode === 'credits' ? 1 : 0)
  }
})

test('profile health probes the selected dialogue transport rather than the legacy TTS endpoint', async () => {
  const snapshot = {
    provider: 'elevenlabs',
    configured: true,
    key: 'secret',
    profile: { ...cloudProfile, ttsModel: 'eleven_v4_turbo' }
  }
  const urls = []
  const result = await probeSpeechProfile(snapshot, {
    fetchImpl: async () => {
      throw Error('Dialogue WS must not use HTTP TTS')
    },
    connect: (url) => {
      urls.push(String(url))
      const ws = new EventEmitter()
      ws.terminate = () => {}
      ws.send = (raw) => {
        if (JSON.parse(raw).inputs)
          queueMicrotask(() => ws.emit('message', Buffer.from('{"audio":"AQACAA==","is_final":true}')))
      }
      queueMicrotask(() => {
        ws.emit('open')
        if (String(url).includes('speech-to-text'))
          ws.emit('message', Buffer.from('{"message_type":"session_started"}'))
      })
      return ws
    }
  })
  assert.equal(result.stt.outcome, 'ok')
  assert.equal(result.tts.outcome, 'ok')
  assert.ok(
    urls.some(
      (url) => url.includes('text-to-dialogue/stream-input') && url.includes('model_id=eleven_v4_turbo')
    )
  )
})
