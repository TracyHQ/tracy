// Whether the speech service takes the key (`src/speech/health.js`): the two probes, the record they
// and every session or reading feed, and what `GET /api/speech` then offers the chat box.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { createSpeechHealth } from '../src/lib/speech-health.js'
import { probeListening, probeReading, startSpeechHealth } from '../src/speech/health.js'
import { speechRoutes } from '../src/speech/route.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'

/** A stand-in for the realtime service: answers the handshake as `answer` says. */
async function service(answer) {
  const http = createServer((_q, r) => r.end())
  const wss = new WebSocketServer({
    noServer: true
  })
  http.on('upgrade', (req, socket, head) => {
    if (answer.status) {
      const body = answer.body ? JSON.stringify(answer.body) : ''
      socket.end(
        `HTTP/1.1 ${answer.status} Refused\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
      )
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => ws.send(JSON.stringify(answer.message)))
  })
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const connect = (address, options) =>
    new WebSocket(`ws://127.0.0.1:${http.address().port}${address.pathname}${address.search}`, options)
  return { connect, close: () => new Promise((r) => http.close(r)) }
}

test('speech to text: a session that starts takes the key; the service’s word refuses it or limits the account; nothing else says anything', async () => {
  for (const [answer, expected] of [
    [{ message: { message_type: 'session_started', session_id: 's' } }, 'ok'],
    // As the service answered a made-up key, 18/10/2026.
    [
      { message: { message_type: 'auth_error', error: 'You must be authenticated to use this endpoint.' } },
      'refused'
    ],
    [{ status: 401, body: { detail: { status: 'invalid_api_key' } } }, 'refused'],
    // A status with no word of the service's says nothing of the key (council 18/10/2026).
    [{ status: 401 }, null],
    [{ message: { message_type: 'quota_exceeded' } }, 'limited'],
    [{ message: { message_type: 'rate_limited' } }, null]
  ]) {
    const s = await service(answer)
    const result = await probeListening({ key: 'k', connect: s.connect, timeoutMs: 3000 })
    assert.equal(result.outcome, expected, JSON.stringify(answer))
    await s.close()
  }
})

test('text to speech: one character read takes the key; 401 refuses it with the service’s word; a busy service says nothing', async () => {
  const asked = []
  const fetchImpl =
    (status, body = {}) =>
    async (url, init) => {
      asked.push(JSON.parse(init.body).text)
      return new Response(status === 200 ? new Uint8Array([1, 2]) : JSON.stringify(body), { status })
    }
  assert.deepEqual(await probeReading({ key: 'k', fetchImpl: fetchImpl(200) }), {
    outcome: 'ok',
    reason: null
  })
  assert.deepEqual(
    await probeReading({
      key: 'k',
      fetchImpl: fetchImpl(401, { detail: { status: 'missing_permissions' } })
    }),
    {
      outcome: 'refused',
      reason: 'missing_permissions'
    }
  )
  assert.equal((await probeReading({ key: 'k', fetchImpl: fetchImpl(429) })).outcome, null)
  // A made-up key, as the service answered it 18/10/2026: 400, not 401 — refused all the same.
  assert.deepEqual(
    await probeReading({
      key: 'k',
      fetchImpl: fetchImpl(400, {
        detail: { status: 'invalid_api_key', code: 'invalid_api_key', type: 'authentication_error' }
      })
    }),
    { outcome: 'refused', reason: 'invalid_api_key' }
  )
  // Credits used up limit the account; they never say the key is refused.
  assert.deepEqual(
    await probeReading({ key: 'k', fetchImpl: fetchImpl(401, { detail: { status: 'quota_exceeded' } }) }),
    { outcome: 'limited', reason: 'quota_exceeded' }
  )
  assert.deepEqual(asked, ['.', '.', '.', '.', '.'], 'one character each time')
})

test('the job tries the key while voice is on, notes refusals, and tries again at once when a key is saved', async () => {
  const health = createSpeechHealth(() => 1_000)
  let reads = 0
  const s = await service({ message: { message_type: 'auth_error' } })
  const warned = []
  const job = startSpeechHealth({
    readKey: async () => 'k',
    switchOn: async () => true,
    health,
    connect: s.connect,
    fetchImpl: async () => {
      reads += 1
      return new Response(JSON.stringify({ detail: { status: 'missing_permissions' } }), { status: 401 })
    },
    log: { log: () => {}, warn: (line) => warned.push(line) },
    every: 3_600_000
  })
  await job.check()
  assert.equal(health.refused('stt'), true)
  assert.equal(health.refused('tts'), true)
  assert.equal(warned.length, 2, 'said once each in the log')
  const before = reads
  health.kick()
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(reads > before, 'a saved key is tried at once')
  job.stop()
  await s.close()
  // Voice off: nothing is tried.
  const off = createSpeechHealth()
  let tried = false
  const quiet = startSpeechHealth({
    readKey: async () => 'k',
    switchOn: async () => false,
    health: off,
    fetchImpl: async () => {
      tried = true
      return new Response('')
    },
    every: 3_600_000
  })
  await quiet.check()
  quiet.stop()
  assert.equal(tried, false)
})

test('GET /api/speech: speech to text refused → no microphone; text to speech refused → no Voice, dictation stays', async () => {
  const config = { sessionSecret: 'secret', origin: 'http://tracy.test', speech: { apiKey: 'k' } }
  const cookie = `${SESSION_COOKIE}=${await mintSession('ana@example.com', config.sessionSecret)}`
  const ask = async (health) => {
    const { readSpeechProfile } = await import('../src/lib/speech-provider.js')
    if (!health.revision()) health.bind((await readSpeechProfile(null, config)).revision)
    const app = speechRoutes({ config, pool: null, health })
    const res = await app.request('/api/speech', { headers: { cookie } })
    return res.json()
  }
  const health = createSpeechHealth()
  const fine = await ask(health)
  assert.equal(fine.available, true)
  assert.ok(fine.speak, 'Voice offered')
  health.note('tts', 'refused', 'missing_permissions')
  const noReading = await ask(health)
  assert.equal(noReading.available, true, 'dictation stays')
  assert.equal(noReading.speak, undefined, 'no Voice')
  health.note('stt', 'refused', 'auth_error')
  assert.equal((await ask(health)).available, false, 'no microphone')
  health.note('stt', 'ok')
  health.note('tts', 'ok')
  const back = await ask(health)
  assert.equal(back.available, true)
  assert.ok(back.speak, 'a key taken again brings it back')
})

test('a key saved while the old one is being tried: the old try is dropped, the new key is tried right after', async () => {
  const health = createSpeechHealth(() => 1_000)
  let key = 'old'
  /** @type {Array<() => void>} */
  const holds = []
  const job = startSpeechHealth({
    readKey: async () => key,
    switchOn: async () => true,
    health,
    connect: () => {
      throw new Error('no socket in this test')
    },
    fetchImpl: async (_url, init) => {
      const tried = init.headers['xi-api-key']
      if (tried === 'old') await new Promise((resolve) => holds.push(resolve))
      return tried === 'old'
        ? new Response(JSON.stringify({ detail: { status: 'invalid_api_key' } }), { status: 400 })
        : new Response(new Uint8Array([1]), { status: 200 })
    },
    log: { log: () => {}, warn: () => {} },
    every: 3_600_000
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(holds.length, 1, 'the old key is being tried')
  key = 'new'
  health.kick()
  holds[0]()
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(health.refused('tts'), false, 'the old key’s refusal is not noted against the new one')
  assert.equal(health.get().tts?.outcome, 'ok', 'the new key was tried right after')
  job.stop()
})

test('a limit real readings met stands against a one-character probe; a reading that gets through clears it', () => {
  let at = 0
  const health = createSpeechHealth(() => at)
  health.note('tts', 'limited', 'quota_exceeded', { generation: health.generation() })
  at = 60_000
  health.note('tts', 'ok', null, { generation: health.generation(), probe: true })
  assert.equal(health.get().tts?.outcome, 'limited')
  health.note('tts', 'ok', null, { generation: health.generation() })
  assert.equal(health.get().tts?.outcome, 'ok')
  // A result of a key no longer saved is dropped.
  const old = health.generation()
  health.reset()
  health.note('stt', 'refused', 'auth_error', { generation: old })
  assert.equal(health.get().stt, null)
})
