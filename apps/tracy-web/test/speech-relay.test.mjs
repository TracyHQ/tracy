// Voice input's socket (`src/speech/relay.js`): who may open it, what reaches the speech service,
// what comes back to the page, and every rule that ends a session. The service is a local stand-in
// (`ws` server); the relay is given its address through `connect`, so nothing leaves this machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { ANONYMOUS_SPEECH } from '../src/lib/speech.js'
import { switchWatch } from '../src/lib/speech-switch.js'
import {
  CHARGE_SECONDS,
  HINT_LANGUAGES,
  SPEECH_LIMITS,
  SPEECH_STREAM_PATH,
  afterKept,
  audioChunk,
  boundedKeyterms,
  fromService,
  isRestart,
  rereads,
  serviceAddress,
  speechRelay,
  sttSlots,
  TURN_SILENCE_SECONDS
} from '../src/speech/relay.js'

const ORIGIN = 'http://tracy.test:51710'
const KEY = 'test-speech-key'
const SECOND = Buffer.alloc(32_000, 1)

/** A relay on a real HTTP server, a stand-in service, and the records a test reads. */
async function stand({
  speech = { apiKey: KEY },
  over = () => false,
  now,
  refuse = null,
  switchOn,
  extra = {}
} = {}) {
  const service = new WebSocketServer({ port: 0 })
  const seen = { handshakes: [], frames: [], buckets: [], logs: [], sockets: [] }
  let serviceSocket = null
  const pages = new Set()
  const ready = new Promise((resolve) => {
    service.on('connection', (socket, req) => {
      seen.handshakes.push({ url: req.url, key: req.headers['xi-api-key'] })
      serviceSocket = socket
      const mine = []
      seen.sockets.push({ socket, frames: mine })
      socket.on('message', (data) => {
        const frame = JSON.parse(data.toString())
        seen.frames.push(frame)
        mine.push(frame)
      })
      resolve(socket)
    })
  })
  if (refuse) service.options.verifyClient = (_info, done) => done(false, refuse.status, refuse.body)
  await once(service, 'listening')
  const relay = speechRelay({
    config: { origin: ORIGIN, sessionSecret: 's', speech },
    count: async (bucket, amount, max, windowMs) => {
      seen.buckets.push({ bucket, amount, max, windowMs })
      return over(bucket)
    },
    log: { log: (line) => seen.logs.push(line), warn: (line) => seen.logs.push(line) },
    session: async (cookie) => (cookie?.startsWith('who=') ? cookie.slice(4) : null),
    connect: (address, options) => {
      seen.address = address
      return new WebSocket(
        `ws://127.0.0.1:${service.address().port}${address.pathname}${address.search}`,
        options
      )
    },
    ...(now ? { now } : {}),
    ...(switchOn ? { switchOn } : {}),
    ...extra
  })
  const server = createServer((_req, res) => res.end())
  server.on('upgrade', (req, socket, head) => {
    if (relay.handles(req)) void relay.upgrade(req, socket, head)
    else socket.destroy()
  })
  server.listen(0)
  await once(server, 'listening')
  const url = `ws://127.0.0.1:${server.address().port}${SPEECH_STREAM_PATH}`
  return {
    relay,
    seen,
    ready,
    service: () => serviceSocket,
    open(headers = {}, query = '', options = {}) {
      const page = new WebSocket(`${url}${query}`, {
        headers: { origin: ORIGIN, cookie: 'who=ana@example.com', ...headers },
        ...options
      })
      pages.add(page)
      page.on('close', () => pages.delete(page))
      const said = []
      page.on('message', (data) => said.push(JSON.parse(data.toString())))
      const ended = new Promise((resolve) => page.on('close', () => resolve(said)))
      const status = new Promise((resolve) => {
        page.on('unexpected-response', (_req, res) => resolve(res.statusCode))
        page.on('open', () => resolve(101))
      })
      return { page, said, ended, status }
    },
    async close() {
      for (const page of pages) {
        page.on('error', () => {})
        page.terminate()
      }
      for (const socket of service.clients) socket.terminate()
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => service.close(resolve))
      ])
    }
  }
}

const tell = (socket, message) => socket.send(JSON.stringify(message))
const until = async (check) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
  assert.ok(check(), 'condition never held')
}

test('the service address asks for the realtime model, 16 kHz PCM, phrases by voice activity, and the heard language — a language only when given', () => {
  const url = serviceAddress()
  assert.equal(url.origin + url.pathname, 'wss://api.elevenlabs.io/v1/speech-to-text/realtime')
  assert.equal(url.searchParams.get('model_id'), 'scribe_v2_realtime')
  assert.equal(url.searchParams.get('audio_format'), 'pcm_16000')
  assert.equal(url.searchParams.get('commit_strategy'), 'vad')
  assert.equal(url.searchParams.get('include_language_detection'), 'true')
  assert.equal(url.searchParams.has('language_code'), false)
  assert.equal(url.searchParams.has('token'), false)
  assert.equal(serviceAddress(undefined, 'vi').searchParams.get('language_code'), 'vi')
  assert.equal(serviceAddress(undefined, 'vi').searchParams.get('include_language_detection'), 'true')
})

test('an audio frame goes out as one input_audio_chunk at 16 kHz', () => {
  assert.deepEqual(JSON.parse(audioChunk(Buffer.from([1, 0, 2, 0]))), {
    message_type: 'input_audio_chunk',
    audio_base_64: 'AQACAA==',
    commit: false,
    sample_rate: 16000
  })
  assert.equal(JSON.parse(audioChunk(Buffer.alloc(0), true)).commit, true)
})

test('a phrase the service sends twice is told once, in either order; its copy only names the language', () => {
  const state = { plain: 0, stamped: 0, language: null }
  const say = (message) => fromService(message, state).out
  const stamped = (text, language_code) => ({
    message_type: 'committed_transcript_with_timestamps',
    text,
    language_code
  })
  const plain = (text) => ({ message_type: 'committed_transcript', text })
  assert.deepEqual(say({ message_type: 'session_started', session_id: 'x' }), [{ type: 'ready' }])
  assert.deepEqual(say({ message_type: 'partial_transcript', text: 'xin' }), [
    { type: 'partial', text: 'xin' }
  ])
  // The live service's order (measured 15/10/2026): the stamped copy first, the plain one 1 ms later.
  assert.deepEqual(say(stamped('Xin chào.', 'vi')), [
    { type: 'committed', text: 'Xin chào.' },
    { type: 'language', code: 'vi' }
  ])
  assert.deepEqual(say(plain('Xin chào.')), [])
  // The person really said it again: paired by count, never by text.
  assert.deepEqual(say(stamped('Xin chào.', 'vi')), [{ type: 'committed', text: 'Xin chào.' }])
  assert.deepEqual(say(plain('Xin chào.')), [])
  // The other order holds too, and a new language is told.
  assert.deepEqual(say(plain('Hello.')), [{ type: 'committed', text: 'Hello.' }])
  assert.deepEqual(say(stamped('Hello.', 'en')), [{ type: 'language', code: 'en' }])
})

test("the service's errors end the session with a reason the page can word", () => {
  const state = { plain: 0, stamped: 0, language: null }
  const end = (message_type) => fromService({ message_type, error: 'x' }, state).end
  assert.equal(end('auth_error'), 'provider')
  // The key's credits used up (`limited` in the health record): not available, never "busy".
  assert.equal(end('quota_exceeded'), 'provider')
  assert.equal(end('rate_limited'), 'provider-busy')
  assert.equal(end('session_time_limit_exceeded'), 'time-limit')
  assert.equal(end('insufficient_audio_activity'), 'silence')
  assert.equal(end('transcriber_error'), 'provider')
  assert.equal(fromService({ message_type: 'warning', warning: 'slow' }, state).end, null)
})

test('a handshake is refused without a key (404), from another origin or site (403), and without a session (401)', async () => {
  const off = await stand({ speech: null })
  assert.equal(await off.open().status, 404)
  await off.close()
  const on = await stand()
  assert.equal(await on.open({ origin: 'http://shop.tracy.test:51710' }).status, 403)
  assert.equal(await on.open({ 'sec-fetch-site': 'same-site' }).status, 403)
  assert.equal(await on.open({ cookie: '' }).status, 401)
  assert.equal(on.seen.handshakes.length, 0, 'nothing refused ever reached the service')
  await on.close()
})

test('the operator’s voice switch: off refuses every handshake (404), unreadable refuses for now (503)', async () => {
  const off = await stand({ switchOn: async () => false })
  assert.equal(await off.open().status, 404)
  await off.close()
  const unknown = await stand({
    switchOn: async () => {
      throw new Error('database down')
    }
  })
  assert.equal(await unknown.open().status, 503)
  assert.equal(unknown.seen.handshakes.length, 0, 'nothing refused ever reached the service')
  await unknown.close()
})

test('a session: audio goes out with the key, words come back, stop confirms the last phrase', async () => {
  const s = await stand()
  const { page, said, ended, status } = s.open()
  assert.equal(await status, 101)
  const service = await s.ready
  assert.equal(s.seen.handshakes[0].key, KEY, 'the key travels only to the service, as its header')
  assert.equal(s.seen.address.searchParams.get('model_id'), 'scribe_v2_realtime')
  tell(service, { message_type: 'session_started', session_id: 'abc', config: {} })
  page.send(SECOND)
  page.send(Buffer.alloc(3200, 2))
  await until(() => s.seen.frames.length === 2)
  assert.equal(s.seen.frames[0].message_type, 'input_audio_chunk')
  assert.equal(s.seen.frames[0].sample_rate, 16000)
  assert.equal(Buffer.from(s.seen.frames[0].audio_base_64, 'base64').length, 32_000)
  tell(service, { message_type: 'partial_transcript', text: 'make the' })
  tell(service, {
    message_type: 'committed_transcript_with_timestamps',
    text: 'Make the hero darker.',
    language_code: 'en'
  })
  tell(service, { message_type: 'committed_transcript', text: 'Make the hero darker.' })
  tell(service, { message_type: 'partial_transcript', text: 'and add' })
  await until(() => said.length === 5)
  page.send(JSON.stringify({ type: 'stop' }))
  await until(() => s.seen.frames.at(-1)?.commit === true)
  tell(service, { message_type: 'committed_transcript', text: 'And add a button.' })
  const all = await ended
  assert.deepEqual(all, [
    { type: 'ready' },
    { type: 'partial', text: 'make the' },
    { type: 'committed', text: 'Make the hero darker.' },
    { type: 'language', code: 'en' },
    { type: 'partial', text: 'and add' },
    { type: 'committed', text: 'And add a button.' },
    { type: 'end', reason: 'stopped', settled: true }
  ])
  assert.ok(!JSON.stringify(all).includes(KEY), 'the page never sees the key')
  assert.equal(s.relay.live, 0)
  assert.match(
    s.seen.logs.at(-1),
    /^\[speech\] ended \(stopped\) after 1\.1 s of audio, first words after \d+ ms$/
  )
  assert.ok(!s.seen.logs.join('\n').includes('hero'), 'no word is logged')
  await s.close()
})

test('a late copy of a finished phrase sent as a partial is dropped, so the phrase is never written twice', async () => {
  const s = await stand()
  const { page, said, ended } = s.open()
  const service = await s.ready
  tell(service, { message_type: 'partial_transcript', text: 'トップページ' })
  tell(service, {
    message_type: 'committed_transcript_with_timestamps',
    text: '見出しを変更して。',
    language_code: 'ja'
  })
  tell(service, { message_type: 'committed_transcript', text: '見出しを変更して。' })
  // The race measured on the live service: the finished text again, as a partial, 12 ms later.
  tell(service, { message_type: 'partial_transcript', text: '見出しを変更して。' })
  tell(service, { message_type: 'partial_transcript', text: 'ボタン' })
  await until(() => said.some((m) => m.text === 'ボタン'))
  page.send(JSON.stringify({ type: 'stop' }))
  await until(() => s.seen.frames.at(-1)?.commit === true)
  tell(service, { message_type: 'committed_transcript', text: 'ボタンを追加。' })
  // After the confirmed last phrase of a stopped session, nothing is a new phrase.
  tell(service, { message_type: 'partial_transcript', text: 'ボタンを追加。' })
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'partial' || m.type === 'committed'),
    [
      { type: 'partial', text: 'トップページ' },
      { type: 'committed', text: '見出しを変更して。' },
      { type: 'partial', text: 'ボタン' },
      { type: 'committed', text: 'ボタンを追加。' }
    ]
  )
  await s.close()
})

test('a second reading of a finished phrase is dropped too; a new phrase is not', () => {
  const phrase = 'À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé.'
  // Measured on the stand, 17/10/2026: this came 200 ms after the phrase, and was never confirmed.
  assert.equal(rereads('À, tiêu đề chỉ viết hoa chứ cái đầu thôi, hả?', phrase), true)
  assert.equal(rereads('Thêm', phrase), false)
  assert.equal(rereads('Thêm một nút', phrase), false)
  assert.equal(rereads('À, tiêu đề', phrase), false, 'too short a part of the phrase')
  assert.equal(rereads('Xanh lá nhé', 'Xanh lá nhé.'), true)
  assert.equal(rereads('Đổi màu nút liên hệ sang xanh', phrase), false)
})

test('the service reading a finished phrase again as a partial does not write it twice or hold it', async () => {
  const s = await stand()
  const { page, said, ended } = s.open()
  const service = await s.ready
  tell(service, { message_type: 'partial_transcript', text: 'À, tiêu đề chi?' })
  tell(service, {
    message_type: 'committed_transcript',
    text: 'À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé.'
  })
  tell(service, { message_type: 'partial_transcript', text: 'À, tiêu đề chỉ viết hoa chứ cái đầu thôi, hả?' })
  tell(service, { message_type: 'partial_transcript', text: 'Thêm' })
  await until(() => said.some((m) => m.text === 'Thêm'))
  page.send(JSON.stringify({ type: 'stop' }))
  await until(() => s.seen.frames.at(-1)?.commit === true)
  tell(service, { message_type: 'committed_transcript', text: 'Thêm một nút.' })
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'partial' || m.type === 'committed'),
    [
      { type: 'partial', text: 'À, tiêu đề chi?' },
      { type: 'committed', text: 'À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé.' },
      { type: 'partial', text: 'Thêm' },
      { type: 'committed', text: 'Thêm một nút.' }
    ]
  )
  await s.close()
})

test('stop with nothing being spoken ends at once, settled', async () => {
  const s = await stand()
  const { page, ended } = s.open()
  const service = await s.ready
  tell(service, { message_type: 'committed_transcript', text: 'Done.' })
  await new Promise((r) => setTimeout(r, 50))
  page.send(JSON.stringify({ type: 'stop' }))
  assert.deepEqual((await ended).at(-1), { type: 'end', reason: 'stopped', settled: true })
  await s.close()
})

test('stop whose last phrase is never confirmed ends unsettled after the wait', async () => {
  const s = await stand()
  const { page, ended } = s.open()
  const service = await s.ready
  tell(service, { message_type: 'partial_transcript', text: 'and then' })
  await new Promise((r) => setTimeout(r, 50))
  const at = Date.now()
  page.send(JSON.stringify({ type: 'stop' }))
  assert.deepEqual((await ended).at(-1), { type: 'end', reason: 'stopped', settled: false })
  assert.ok(Date.now() - at >= SPEECH_LIMITS.settleMs - 50)
  await s.close()
})

test('a second session of the same account ends the first (elsewhere)', async () => {
  const s = await stand()
  const first = s.open()
  await s.ready
  const second = s.open()
  assert.equal(await second.status, 101)
  assert.deepEqual((await first.ended).at(-1), { type: 'end', reason: 'elsewhere', settled: true })
  second.page.close()
  await s.close()
})

test('places at a speech service: taken while one is free, given back only by the session holding it, one pool per service', () => {
  const slots = sttSlots(2)
  assert.equal(slots.take('elevenlabs', 1), true)
  assert.equal(slots.take('elevenlabs', 1), true, 'the same session asking again holds one place')
  assert.equal(slots.take('elevenlabs', 2), true)
  assert.equal(slots.take('elevenlabs', 3), false, 'every place held: refused, never queued')
  assert.equal(slots.take('voicestudio', 3), true, 'another service has places of its own')
  // A late callback of a session that holds nothing there frees nobody's place.
  slots.release('elevenlabs', 3)
  slots.release('elevenlabs', 99)
  assert.equal(slots.size('elevenlabs'), 2)
  slots.release('elevenlabs', 1)
  slots.release('elevenlabs', 1)
  assert.equal(slots.size('elevenlabs'), 1, 'given back once, however often asked')
  assert.equal(slots.take('elevenlabs', 4), true)
  assert.equal(slots.size(), 3)
})

test('the most sessions at once: one more ends as provider-busy after the upgrade, never reaching the service; a place frees at the end', async () => {
  const s = await stand({ extra: { maxConcurrent: 1 } })
  const first = s.open()
  assert.equal(await first.status, 101)
  const service = await s.ready
  tell(service, { message_type: 'session_started', session_id: 'a', config: {} })
  await until(() => first.said.some((m) => m.type === 'ready'))
  assert.equal(s.relay.busy, 1)
  // Another account while the only place is held: told the service is busy, and nothing waits.
  const second = s.open({ cookie: 'who=bob@example.com' })
  assert.equal(await second.status, 101)
  assert.deepEqual(await second.ended, [{ type: 'end', reason: 'provider-busy', settled: true }])
  assert.equal(s.seen.handshakes.length, 1, 'the refused session never reached the service')
  assert.match(s.seen.logs.at(-1), /ended \(provider-busy\).*all 1 sessions at elevenlabs are taken/)
  assert.equal(s.relay.busy, 1, 'the refused session never held, nor freed, a place')
  // The same account opening again ends its older session first: its place is the new one's.
  const again = s.open()
  assert.deepEqual((await first.ended).at(-1), { type: 'end', reason: 'elsewhere', settled: true })
  await until(() => s.seen.handshakes.length === 2)
  assert.equal(s.relay.busy, 1)
  again.page.send(JSON.stringify({ type: 'stop' }))
  await again.ended
  await until(() => s.relay.busy === 0)
  // Freed at the end: the next session goes through.
  const third = s.open({ cookie: 'who=bob@example.com' })
  await until(() => s.seen.handshakes.length === 3)
  assert.equal(s.relay.busy, 1)
  third.page.close()
  await until(() => s.relay.busy === 0)
  await s.close()
})

test('today’s budget is looked at before the service is called, charging nothing; used up, it never is', async () => {
  const s = await stand({ over: (bucket) => bucket === 'speech-seconds:ana@example.com' })
  const { ended } = s.open()
  assert.deepEqual(await ended, [{ type: 'end', reason: 'quota', settled: true }])
  assert.equal(s.seen.handshakes.length, 0)
  assert.deepEqual(
    s.seen.buckets.map((b) => [b.bucket, b.amount, b.max, b.windowMs]),
    [
      ['speech-seconds:ana@example.com', 0, SPEECH_LIMITS.accountMinutesPerDay * 60 - 1, 86_400_000],
      ['speech-seconds', 0, SPEECH_LIMITS.totalMinutesPerDay * 60 - 1, 86_400_000]
    ]
  )
  await s.close()
})

const ANONYMOUS = 'widget-guest+0123456789abcdef@widget.invalid'

test('an anonymous widget visitor has a smaller day, and every anonymous visitor’s day is looked at too', async () => {
  const s = await stand({ over: (bucket) => bucket === `speech-seconds:${ANONYMOUS_SPEECH.bucket}` })
  const { ended } = s.open({ cookie: `who=${ANONYMOUS}` })
  assert.deepEqual(await ended, [{ type: 'end', reason: 'quota', settled: true }])
  assert.equal(s.seen.handshakes.length, 0, 'the anonymous day used up: the service is never called')
  assert.deepEqual(
    s.seen.buckets
      .filter((b) => b.bucket.startsWith('speech-seconds'))
      .map((b) => [b.bucket, b.amount, b.max, b.windowMs]),
    [
      [`speech-seconds:${ANONYMOUS}`, 0, 3 * 60 - 1, 86_400_000],
      ['speech-seconds', 0, SPEECH_LIMITS.totalMinutesPerDay * 60 - 1, 86_400_000],
      ['speech-seconds:widget-anonymous', 0, 30 * 60 - 1, 86_400_000]
    ]
  )
  assert.ok(ANONYMOUS_SPEECH.totalSecondsPerDay <= (SPEECH_LIMITS.totalMinutesPerDay * 60) / 2)
  await s.close()
})

test('an anonymous visitor’s audio is charged to its day, the deployment’s and the anonymous visitors’ alike', async () => {
  const s = await stand()
  const { page, ended } = s.open({ cookie: `who=${ANONYMOUS}` })
  const service = await s.ready
  tell(service, { message_type: 'partial_transcript', text: 'đổi tiêu đề' })
  for (let i = 0; i < 15; i++) page.send(Buffer.alloc(16_000))
  await until(() => s.seen.frames.length >= 15)
  page.close()
  await ended
  const charged = (bucket) => s.seen.buckets.filter((b) => b.bucket === bucket).map((b) => [b.amount, b.max])
  await until(() => charged('speech-seconds:widget-anonymous').length === 3)
  assert.deepEqual(charged(`speech-seconds:${ANONYMOUS}`), [
    [0, 179],
    [CHARGE_SECONDS, 180],
    [3, 180]
  ])
  assert.deepEqual(
    charged('speech-seconds:widget-anonymous').map(([amount]) => amount),
    [0, CHARGE_SECONDS, 3]
  )
  assert.deepEqual(
    charged('speech-seconds').map(([amount]) => amount),
    [0, CHARGE_SECONDS, 3]
  )
  await s.close()
})

test('one address holds two anonymous sessions at once and starts them in a burst; a person is not counted so', async () => {
  const s = await stand()
  const from = (address, email = ANONYMOUS) => ({ cookie: `who=${email}`, 'cf-connecting-ip': address })
  const first = s.open(from('203.0.113.7'))
  assert.equal(await first.status, 101)
  const second = s.open(from('203.0.113.7', 'widget-guest+fedcba9876543210@widget.invalid'))
  assert.equal(await second.status, 101)
  const third = s.open(from('203.0.113.7', 'widget-guest+00000000000000aa@widget.invalid'))
  assert.equal(await third.status, 429)
  assert.equal(await s.open(from('198.51.100.4', 'widget-guest+00000000000000bb@widget.invalid')).status, 101)
  // A signed-in person from the same address is neither limited nor counted.
  assert.equal(await s.open(from('203.0.113.7', 'ana@example.com')).status, 101)
  first.page.close()
  await first.ended
  await until(() => s.relay.live === 3)
  assert.equal(await s.open(from('203.0.113.7', 'widget-guest+00000000000000cc@widget.invalid')).status, 101)
  assert.deepEqual(
    s.seen.buckets
      .filter((b) => b.bucket.startsWith('widget-speech-starts') && b.bucket.endsWith(':203.0.113.7'))
      .slice(0, 2)
      .map((b) => [b.bucket, b.amount, b.max, b.windowMs]),
    [
      ['widget-speech-starts:203.0.113.7', 1, 3, 60_000],
      ['widget-speech-starts-10m:203.0.113.7', 1, 20, 600_000]
    ]
  )
  await s.close()
  const burst = await stand({ over: (bucket) => bucket === 'widget-speech-starts:203.0.113.7' })
  assert.equal(await burst.open(from('203.0.113.7')).status, 429)
  assert.equal(burst.seen.handshakes.length, 0)
  assert.equal(
    burst.seen.buckets.some((b) => b.bucket.startsWith('speech-seconds')),
    false,
    'refused before any budget is read'
  )
  await burst.close()
})

// Both limits at once (#1477 on #1478): an anonymous visitor holds a place at the service AND counts
// against its address; its end gives both back, so neither leaks a slot.
test('an anonymous visitor holds a place at the service and counts against its address; its end gives both back', async () => {
  const s = await stand({ extra: { maxConcurrent: 1 } })
  const from = (address, email) => ({ cookie: `who=${email}`, 'cf-connecting-ip': address })
  const first = s.open(from('203.0.113.7', ANONYMOUS))
  assert.equal(await first.status, 101)
  await until(() => s.relay.busy === 1)
  const other = s.open(from('198.51.100.4', 'widget-guest+00000000000000bb@widget.invalid'))
  assert.equal(await other.status, 101)
  assert.deepEqual(await other.ended, [{ type: 'end', reason: 'provider-busy', settled: true }])
  first.page.close()
  await first.ended
  await until(() => s.relay.busy === 0)
  const again = s.open(from('203.0.113.7', 'widget-guest+00000000000000cc@widget.invalid'))
  assert.equal(await again.status, 101, 'the address count was given back')
  await until(() => s.relay.busy === 1)
  again.page.close()
  await until(() => s.relay.busy === 0)
  await s.close()
})

test('the audio received is charged in seconds — a short phrase costs its seconds, never a minute', async () => {
  const s = await stand()
  const { page, ended } = s.open()
  const service = await s.ready
  tell(service, { message_type: 'partial_transcript', text: 'đổi tiêu đề' })
  // 7.5 s of audio: one step of five while it runs, the rest (2.5 → 3) at its end.
  for (let i = 0; i < 15; i++) page.send(Buffer.alloc(16_000))
  await until(() => s.seen.frames.length >= 15)
  page.close()
  await ended
  await until(() => s.seen.buckets.filter((b) => b.bucket === 'speech-seconds:ana@example.com').length === 3)
  const mine = s.seen.buckets
    .filter((b) => b.bucket === 'speech-seconds:ana@example.com')
    .map((b) => b.amount)
  assert.deepEqual(mine, [0, CHARGE_SECONDS, 3], 'looked at, then 5 s while it ran, then the rest')
  assert.equal(
    mine.reduce((a, b) => a + b, 0),
    8
  )
  await s.close()
})

test('a voice conversation asks the service for a shorter silence at the end of a phrase; dictation keeps its default', async () => {
  const voice = await stand()
  const talking = voice.open({}, '?language=vi&turns=voice')
  await voice.ready
  assert.equal(await talking.status, 101)
  assert.match(voice.seen.handshakes[0].url, new RegExp(`vad_silence_threshold_secs=${TURN_SILENCE_SECONDS}`))
  talking.page.close()
  await talking.ended
  await voice.close()
  const dictation = await stand()
  const typing = dictation.open({}, '?language=vi')
  await dictation.ready
  assert.equal(await typing.status, 101)
  assert.doesNotMatch(dictation.seen.handshakes[0].url, /vad_silence_threshold_secs/)
  typing.page.close()
  await typing.ended
  await dictation.close()
})

test('a key the service refuses ends the session with provider, and the log says what the service answered', async () => {
  const s = await stand({ refuse: { status: 401, body: 'missing the permission speech_to_text' } })
  const { ended } = s.open()
  assert.deepEqual((await ended).at(-1), { type: 'end', reason: 'provider', settled: true })
  assert.match(s.seen.logs.at(-1), /the service answered 401/)
  await s.close()
})

test('a frame longer than a second, or of odd length, never reaches the service', async () => {
  const s = await stand()
  const { page } = s.open()
  const service = await s.ready
  page.send(Buffer.alloc(SPEECH_LIMITS.frameBytes + 2))
  page.send(Buffer.alloc(301))
  page.send(Buffer.alloc(320))
  await until(() => s.seen.frames.length === 1)
  assert.equal(Buffer.from(s.seen.frames[0].audio_base_64, 'base64').length, 320)
  service.close()
  await s.close()
})

test('thirty seconds without a word ends the session (silence)', async () => {
  let clock = 1_000_000
  const s = await stand({ now: () => clock })
  const { page, ended } = s.open()
  await s.ready
  page.send(Buffer.alloc(3200))
  clock += SPEECH_LIMITS.silenceSeconds * 1000 + 1
  page.send(Buffer.alloc(3200))
  assert.deepEqual((await ended).at(-1), { type: 'end', reason: 'silence', settled: true })
  await s.close()
})

test('a session ends after five minutes of audio (time-limit), and every second received is charged', async () => {
  const s = await stand()
  const { page, ended } = s.open()
  const service = await s.ready
  // Words keep coming, so silence never ends it first.
  const talk = setInterval(
    () => tell(service, { message_type: 'partial_transcript', text: 'still talking' }),
    20
  )
  // Sent in batches the service drains, as a real microphone would pace them: a burst of five
  // minutes at once is what the `network` rule exists to end.
  for (let i = 0; i <= SPEECH_LIMITS.sessionSeconds; i++) {
    page.send(SECOND)
    if (i % 4 === 3 && i < SPEECH_LIMITS.sessionSeconds) await until(() => s.seen.frames.length >= i + 1)
  }
  assert.deepEqual((await ended).at(-1), { type: 'end', reason: 'time-limit', settled: true })
  clearInterval(talk)
  const charged = () =>
    s.seen.buckets
      .filter((b) => b.bucket === 'speech-seconds:ana@example.com')
      .reduce((sum, b) => sum + b.amount, 0)
  await until(() => charged() === SPEECH_LIMITS.sessionSeconds + 1)
  assert.equal(charged(), SPEECH_LIMITS.sessionSeconds + 1, 'one count per second received')
  await s.close()
})

/** `seconds` of 16-bit PCM at one level: 0 is silence, 2000 is a person speaking. */
const pcm = (seconds, level) => {
  const frame = Buffer.alloc(Math.round(32_000 * seconds))
  for (let i = 0; i + 1 < frame.length; i += 2) frame.writeInt16LE(i % 4 === 0 ? level : -level, i)
  return frame
}

test('the chat’s language reaches the service only where it was measured to help (vi)', async () => {
  assert.deepEqual([...HINT_LANGUAGES], ['vi'])
  for (const [query, expected] of [
    ['?language=vi', 'vi'],
    ['?language=en', null],
    ['?language=ja', null],
    ['?language=vi%26model_id%3Dx', null],
    ['', null]
  ]) {
    const s = await stand()
    const { page } = s.open({}, query)
    await s.ready
    const asked = new URL(s.seen.handshakes[0].url, 'ws://x').searchParams
    assert.equal(asked.get('language_code'), expected, query)
    assert.equal(asked.get('model_id'), 'scribe_v2_realtime', 'nothing else the page sends rides along')
    page.close()
    await s.close()
  }
})

test('a hinted session that hears speech with no word is reopened without the hint, the phrase replayed', async () => {
  const s = await stand()
  const { page, said, ended } = s.open({}, '?language=vi')
  const hinted = await s.ready
  tell(hinted, { message_type: 'session_started', session_id: 'a' })
  // Silence never counts as speech.
  page.send(pcm(1, 0))
  page.send(pcm(1, 0))
  page.send(pcm(1, 0))
  await until(() => s.seen.sockets[0].frames.length === 3)
  // Speech the hint makes nothing of (Japanese, measured: `vi` on it comes back empty).
  page.send(pcm(1, 2000))
  page.send(pcm(1, 2000))
  page.send(pcm(0.6, 2000))
  await until(() => s.seen.sockets.length === 2)
  const second = s.seen.sockets[1]
  assert.equal(new URL(s.seen.handshakes[1].url, 'ws://x').searchParams.has('language_code'), false)
  assert.equal(s.seen.handshakes[1].key, KEY)
  // Everything since the last finished phrase, the frame that tipped it included, in order.
  await until(() => second.frames.length === 6)
  assert.deepEqual(
    second.frames.map((f) => Buffer.from(f.audio_base_64, 'base64').length),
    [32_000, 32_000, 32_000, 32_000, 32_000, 19_200]
  )
  assert.equal(s.seen.sockets[0].frames.length, 5, 'the tipping frame never went to the hinted session')
  await until(() => s.seen.sockets[0].socket.readyState === WebSocket.CLOSED)
  // The old session's late words are not this session's any more, and the page hears `ready` once.
  tell(second.socket, { message_type: 'session_started', session_id: 'b' })
  tell(second.socket, { message_type: 'partial_transcript', text: '見出しを' })
  page.send(pcm(1, 2000))
  page.send(pcm(1, 2000))
  page.send(pcm(1, 2000))
  await until(() => second.frames.length === 9)
  assert.equal(s.seen.sockets.length, 2, 'reopened once only')
  tell(second.socket, {
    message_type: 'committed_transcript_with_timestamps',
    text: '見出しを変更して。',
    language_code: 'ja'
  })
  await until(() => said.some((m) => m.type === 'language'))
  page.send(JSON.stringify({ type: 'stop' }))
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type !== 'ready'),
    [
      { type: 'partial', text: '見出しを' },
      { type: 'committed', text: '見出しを変更して。' },
      { type: 'language', code: 'ja' },
      { type: 'end', reason: 'stopped', settled: true }
    ]
  )
  assert.equal(all.filter((m) => m.type === 'ready').length, 1, 'ready once, from the first session')
  assert.match(s.seen.logs.at(-1), /, hinted vi, reopened without the hint$/)
  await s.close()
})

test('a reopened session gets the replayed phrase before any live frame, also when audio waits for the service to start', async () => {
  // The operator's profile path (`resolveProfile`): audio waits for `session_started`, not for the
  // socket to open. Live frames arriving between the reopened socket's open and its start must
  // queue behind the replay, or the service hears the phrase out of order.
  const snapshot = {
    provider: 'elevenlabs',
    configured: true,
    key: KEY,
    revision: 'rescue-order',
    profile: { sttModel: 'scribe_v2_realtime', ttsModel: 'eleven_flash_v2_5', fallbackEnabled: false }
  }
  const s = await stand({ extra: { resolveProfile: async () => snapshot } })
  try {
    const { page, ended } = s.open({}, '?language=vi')
    const hinted = await s.ready
    tell(hinted, { message_type: 'session_started', session_id: 'a' })
    page.send(pcm(1, 2000))
    page.send(pcm(1, 2000))
    page.send(pcm(0.6, 2000))
    await until(() => s.seen.sockets.length === 2)
    const second = s.seen.sockets[1]
    // The relay's side of the reopened socket is open; the service has not started its session.
    await new Promise((r) => setTimeout(r, 60))
    page.send(pcm(0.2, 3000))
    page.send(pcm(0.3, 3000))
    await new Promise((r) => setTimeout(r, 60))
    tell(second.socket, { message_type: 'session_started', session_id: 'b' })
    await until(() => second.frames.length === 5)
    assert.deepEqual(
      second.frames.map((f) => Buffer.from(f.audio_base_64, 'base64').length),
      [32_000, 32_000, 19_200, 6_400, 9_600],
      'the replayed phrase first, then the live frames in the order they were spoken'
    )
    // Started, live frames go straight on again.
    page.send(pcm(0.1, 3000))
    await until(() => second.frames.length === 6)
    assert.equal(Buffer.from(second.frames[5].audio_base_64, 'base64').length, 3_200)
    page.send(JSON.stringify({ type: 'stop' }))
    await until(() => second.frames.at(-1)?.commit === true)
    tell(second.socket, { message_type: 'committed_transcript', text: '' })
    await ended
  } finally {
    await s.close()
  }
})

test('a hinted session whose words keep coming is never reopened', async () => {
  const s = await stand()
  const { page } = s.open({}, '?language=vi')
  const hinted = await s.ready
  const words = ['Đổi', 'Đổi màu', 'Đổi màu nền', 'Đổi màu nền trang', 'Đổi màu nền trang chủ']
  for (const text of words) {
    page.send(pcm(1, 2000))
    await until(() => s.seen.sockets[0].frames.length === words.indexOf(text) + 1)
    tell(hinted, { message_type: 'partial_transcript', text })
    await new Promise((r) => setTimeout(r, 20))
  }
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(s.seen.sockets.length, 1)
  page.close()
  await s.close()
})

test('a phrase the service starts again where the language switched keeps the words already shown', async () => {
  const s = await stand()
  const { page, said, ended } = s.open({}, '?language=vi')
  const service = await s.ready
  // Measured 15/10/2026 (`language_code=vi`, a Vietnamese request ending in English): the service
  // dropped the Vietnamese it had and began the phrase again at the English, and committed that only.
  tell(service, { message_type: 'partial_transcript', text: 'Đổi màu nền trang chủ sang xanh đậm. And' })
  tell(service, { message_type: 'partial_transcript', text: 'And add a contact' })
  tell(service, { message_type: 'partial_transcript', text: 'And add a contact button.' })
  tell(service, {
    message_type: 'committed_transcript_with_timestamps',
    text: 'And add a contact button.',
    language_code: 'en'
  })
  tell(service, { message_type: 'committed_transcript', text: 'And add a contact button.' })
  // Next phrase: the restart is said again, but this time the commit holds both parts.
  tell(service, { message_type: 'partial_transcript', text: 'Thêm một ảnh lớn ở đầu trang. Then' })
  tell(service, { message_type: 'partial_transcript', text: 'Then make it full width' })
  tell(service, {
    message_type: 'committed_transcript_with_timestamps',
    text: 'Thêm một ảnh lớn ở đầu trang. Then make it full width.',
    language_code: 'vi'
  })
  // The late copy the service sends right after a commit is its own text, and is dropped.
  tell(service, {
    message_type: 'partial_transcript',
    text: 'Thêm một ảnh lớn ở đầu trang. Then make it full width.'
  })
  await until(() => said.filter((m) => m.type === 'committed').length === 4)
  page.send(JSON.stringify({ type: 'stop' }))
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'committed'),
    [
      { type: 'committed', text: 'Đổi màu nền trang chủ sang xanh đậm.' },
      { type: 'committed', text: 'And add a contact button.' },
      { type: 'committed', text: 'Thêm một ảnh lớn ở đầu trang.' },
      { type: 'committed', text: 'Then make it full width.' }
    ]
  )
  assert.ok(
    !all.some((m) => m.type === 'partial' && m.text.startsWith('Thêm một ảnh lớn ở đầu trang. Then make'))
  )
  assert.match(s.seen.logs.at(-1), /, kept 2 restarted phrase\(s\)$/)
  await s.close()
})

test('a restart is a phrase begun elsewhere; a revision, a growing phrase or a short one never is', () => {
  // Begun again at the last word(s) of what it had: those words are not kept twice.
  assert.equal(isRestart('Đổi màu nền trang chủ sang xanh đậm. And', 'And add a contact'), 1)
  assert.equal(isRestart('Thêm nút liên hệ ở cuối trang add a', 'add a contact button'), 2)
  // Measured on the real page: the restart repeated five words.
  assert.equal(
    isRestart(
      'Đổi màu nên trang chủ sang xanh đạm. And add a contact button.',
      'And add a contact button under the headline.'
    ),
    5
  )
  // Begun with nothing in common: all of it is kept.
  assert.equal(isRestart('Đổi màu nền trang chủ', 'Make the header sticky'), -1)
  // Not restarts.
  assert.equal(isRestart('Đổi màu nền', 'Đổi màu nền trang chủ'), 0)
  assert.equal(isRestart('doi mau nen trang', 'Đổi màu nền trang'), 0, 'marks added are a revision')
  assert.equal(isRestart('make the', 'Make the hero darker'), 0)
  assert.equal(isRestart('the hero image darker', 'Make the hero image darker'), 0, 'a word put in front')
  assert.equal(isRestart('見出しを変更', 'ボタンを追加'), 0, 'no spaces: never read as a restart')
  assert.equal(isRestart('', 'And add'), 0)
})

test('a commit repeating the kept words says only what follows them, marks and punctuation aside', () => {
  assert.equal(
    afterKept('Thêm một ảnh lớn ở đầu trang. Then make it.', 'Thêm một ảnh lớn ở đầu trang.'),
    'Then make it.'
  )
  assert.equal(afterKept('Them mot anh — lon. Then', 'Thêm một ảnh lớn'), 'Then')
  assert.equal(afterKept('Đổi màu nền', 'Đổi màu nền'), '')
  assert.equal(afterKept('And add a button.', 'Đổi màu nền'), null)
  assert.equal(afterKept('Đổi màu', 'Đổi màu nền'), null, 'shorter than the kept words')
})

test('a hinted phrase that comes back empty after speech is replayed without the hint, also after stop', async () => {
  const s = await stand()
  const { page, ended } = s.open({}, '?language=vi')
  const hinted = await s.ready
  tell(hinted, { message_type: 'session_started', session_id: 'a' })
  // Measured 15/10/2026, Japanese under `vi`: a few wrong words, then an empty phrase.
  page.send(pcm(1, 2000))
  tell(hinted, { message_type: 'partial_transcript', text: 'Thôi.' })
  page.send(pcm(1, 2000))
  tell(hinted, { message_type: 'partial_transcript', text: 'Top page của mình là' })
  await until(() => s.seen.sockets[0].frames.length === 2)
  page.send(JSON.stringify({ type: 'stop' }))
  await until(() => s.seen.sockets[0].frames.at(-1)?.commit === true)
  tell(hinted, { message_type: 'committed_transcript_with_timestamps', text: '', language_code: 'vi' })
  tell(hinted, { message_type: 'committed_transcript', text: '' })
  await until(() => s.seen.sockets.length === 2)
  const second = s.seen.sockets[1]
  assert.equal(new URL(s.seen.handshakes[1].url, 'ws://x').searchParams.has('language_code'), false)
  // The phrase's audio, then the stop's commit asked again.
  await until(() => second.frames.length === 3)
  assert.deepEqual(
    second.frames.map((f) => [Buffer.from(f.audio_base_64, 'base64').length, f.commit]),
    [
      [32_000, false],
      [32_000, false],
      [0, true]
    ]
  )
  tell(second.socket, { message_type: 'partial_transcript', text: 'トップページの' })
  tell(second.socket, {
    message_type: 'committed_transcript_with_timestamps',
    text: 'トップページの見出しを変更して。',
    language_code: 'ja'
  })
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type !== 'ready'),
    [
      { type: 'partial', text: 'Thôi.' },
      { type: 'partial', text: 'Top page của mình là' },
      { type: 'partial', text: 'トップページの' },
      { type: 'committed', text: 'トップページの見出しを変更して。' },
      { type: 'language', code: 'ja' },
      { type: 'end', reason: 'stopped', settled: true }
    ]
  )
  await s.close()
})

test('a phrase that comes back empty keeps the words shown — not a stray word, and not with no speech', async () => {
  const s = await stand()
  const { page, said, ended } = s.open()
  const service = await s.ready
  // Measured, unhinted, on a switch to English: the words were shown, the phrase came back empty.
  tell(service, { message_type: 'partial_transcript', text: '... And add a contact button.' })
  tell(service, { message_type: 'committed_transcript', text: '' })
  // A cough read as one word, then taken back: nothing is kept.
  tell(service, { message_type: 'partial_transcript', text: 'Thôi.' })
  tell(service, { message_type: 'committed_transcript', text: '' })
  await until(() => said.filter((m) => m.type === 'committed').length === 2)
  page.send(JSON.stringify({ type: 'stop' }))
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'committed'),
    [
      { type: 'committed', text: '... And add a contact button.' },
      { type: 'committed', text: '' }
    ]
  )
  assert.equal(s.seen.sockets.length, 1, 'an unhinted session is never reopened')
  await s.close()
})

test('unhinted, a restart that shares no word is the service taking back a wrong guess: not kept', async () => {
  const s = await stand()
  const { page, said, ended } = s.open()
  const service = await s.ready
  // Measured, unhinted, a Vietnamese request: the first partials were a Korean guess, taken back.
  tell(service, { message_type: 'partial_transcript', text: '팀 러버 크라이시 바' })
  tell(service, { message_type: 'partial_transcript', text: 'Team level price vào header, đổi font' })
  tell(service, {
    message_type: 'committed_transcript',
    text: 'Team level price vào header, đổi font sang Inter.'
  })
  await until(() => said.some((m) => m.type === 'committed'))
  page.send(JSON.stringify({ type: 'stop' }))
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'committed'),
    [{ type: 'committed', text: 'Team level price vào header, đổi font sang Inter.' }]
  )
  await s.close()
})

test('a restart that repeats a long end of the phrase keeps the rest once, never the repeated words twice', async () => {
  const s = await stand()
  const { page, said, ended } = s.open({}, '?language=vi')
  const service = await s.ready
  // Measured on the real dsh page, 15/10/2026 (`vi`, a Vietnamese request ending in English).
  tell(service, { message_type: 'partial_transcript', text: 'Đổi màu nên trang chủ sang xanh đàm. And' })
  tell(service, {
    message_type: 'partial_transcript',
    text: 'Đổi màu nên trang chủ sang xanh đạm. And add a contact button.'
  })
  tell(service, { message_type: 'partial_transcript', text: 'And add a contact button under the headline.' })
  tell(service, {
    message_type: 'committed_transcript_with_timestamps',
    text: 'And add a contact button under the headline.',
    language_code: 'vi'
  })
  await until(() => said.filter((m) => m.type === 'committed').length === 2)
  page.send(JSON.stringify({ type: 'stop' }))
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'committed').map((m) => m.text),
    ['Đổi màu nên trang chủ sang xanh đạm.', 'And add a contact button under the headline.']
  )
  await s.close()
})

test('a new phrase alike the last one, said after it, is shown and never taken for a second reading', async () => {
  const s = await stand()
  const { page, said, ended } = s.open()
  const service = await s.ready
  tell(service, { message_type: 'committed_transcript', text: 'Xoá ảnh thứ hai.' })
  await until(() => said.some((m) => m.type === 'committed'))
  // The person goes on (speech reaches the relay), and the service reads the new phrase.
  page.send(pcm(0.3, 2000))
  await until(() => s.seen.frames.length >= 1)
  tell(service, { message_type: 'partial_transcript', text: 'xoá ảnh thứ ba' })
  await until(() => said.some((m) => m.text === 'xoá ảnh thứ ba'))
  // Done right then: the service is asked to finish the phrase, and its answer is waited for.
  page.send(JSON.stringify({ type: 'stop' }))
  await until(() => s.seen.frames.at(-1)?.commit === true)
  tell(service, { message_type: 'committed_transcript', text: 'Xoá ảnh thứ ba.' })
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'committed').map((m) => m.text),
    ['Xoá ảnh thứ hai.', 'Xoá ảnh thứ ba.']
  )
  assert.deepEqual(all.at(-1), { type: 'end', reason: 'stopped', settled: true })
  await s.close()
})

test('Done before the service showed a word still asks it to finish what was said', async () => {
  const s = await stand()
  const { page, said, ended } = s.open()
  const service = await s.ready
  page.send(pcm(0.4, 2000))
  await until(() => s.seen.frames.length >= 1)
  page.send(JSON.stringify({ type: 'stop' }))
  await until(() => s.seen.frames.at(-1)?.commit === true)
  tell(service, { message_type: 'committed_transcript', text: 'Có.' })
  const all = await ended
  assert.deepEqual(
    said.filter((m) => m.type === 'committed').map((m) => m.text),
    ['Có.']
  )
  assert.deepEqual(all.at(-1), { type: 'end', reason: 'stopped', settled: true })
  await s.close()
})

test('a re-reading never shown is still waited for on Done, and its finishing adds nothing', async () => {
  const s = await stand()
  const { page, said, ended } = s.open()
  const service = await s.ready
  tell(service, {
    message_type: 'committed_transcript',
    text: 'À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé.'
  })
  tell(service, { message_type: 'partial_transcript', text: 'À, tiêu đề chỉ viết hoa chứ cái đầu thôi, hả?' })
  await until(() => said.some((m) => m.type === 'committed'))
  page.send(JSON.stringify({ type: 'stop' }))
  await until(() => s.seen.frames.at(-1)?.commit === true)
  tell(service, {
    message_type: 'committed_transcript',
    text: 'À, tiêu đề chỉ viết hoa chứ cái đầu thôi, hả?'
  })
  const all = await ended
  assert.deepEqual(
    all.filter((m) => m.type === 'partial' || m.type === 'committed').map((m) => m.text),
    ['À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé.'],
    'written once'
  )
  assert.deepEqual(all.at(-1), { type: 'end', reason: 'stopped', settled: true })
  await s.close()
})

test('a page that stops sending audio ends its session; one that never answers a ping is let go', async () => {
  const quiet = await stand({ extra: { framesGoneMs: 150 } })
  const one = quiet.open()
  await quiet.ready
  one.page.send(SECOND)
  assert.deepEqual((await one.ended).at(-1), { type: 'end', reason: 'silence', settled: true })
  await quiet.close()
  const gone = await stand({ extra: { pingEveryMs: 100, framesGoneMs: 60_000 } })
  const two = gone.open({}, '', { autoPong: false })
  await gone.ready
  await two.ended
  assert.equal(gone.relay.live, 0, 'its slot is free')
  await gone.close()
})

test('a count that cannot be made ends the session as unavailable, never as today’s minutes used up', async () => {
  const s = await stand({
    over: () => {
      throw new Error('database down')
    }
  })
  const { ended } = s.open()
  assert.deepEqual((await ended).at(-1), { type: 'end', reason: 'unavailable', settled: true })
  await s.close()
})

test('an audio idle timer firing before its clock deadline keeps checking until the deadline', async () => {
  let clock = Date.now()
  const s = await stand({ now: () => clock, extra: { framesGoneMs: 50 } })
  const one = s.open()
  try {
    await s.ready
    one.page.send(SECOND)
    await until(() => s.seen.frames.length === 1)
    clock += 49
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert.equal(s.relay.live, 1, 'the clock has not reached the deadline')
    clock += 1
    await until(() => s.relay.live === 0)
    await until(() => one.said.some((message) => message.type === 'end'))
    assert.deepEqual(one.said.at(-1), { type: 'end', reason: 'silence', settled: true })
  } finally {
    one.page.terminate()
    await s.close()
  }
})

test('a running session outlives a voice switch the database cannot read for a while', async () => {
  let state = 'on'
  let reads = 0
  const read = async () => {
    reads += 1
    if (state === 'down') throw new Error('database down')
    return state === 'on'
  }
  const s = await stand({
    switchOn: read,
    extra: { switchEveryMs: 20, watchSwitch: switchWatch(read, { freshMs: 0 }) }
  })
  try {
    const { page, said, status } = s.open()
    assert.equal(await status, 101)
    tell(await s.ready, { message_type: 'session_started', session_id: 'abc', config: {} })
    await until(() => said.some((m) => m.type === 'ready'))
    state = 'down'
    const before = reads
    // Longer than one watch of the switch ever was (1 s), every read of it failing.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.ok(reads > before + 3, 'the switch was asked again and again')
    assert.equal(s.relay.live, 1, 'an unreadable switch is not a switch turned off')
    assert.ok(!said.some((m) => m.type === 'end'))
    assert.equal(page.readyState, WebSocket.OPEN)
  } finally {
    await s.close()
  }
})

test('Voice turned off mid-phrase ends the session as unconfirmed, so the page does not send the partial', async () => {
  let on = true
  const read = async () => on
  const s = await stand({
    switchOn: read,
    extra: { switchEveryMs: 20, watchSwitch: switchWatch(read, { freshMs: 0 }) }
  })
  try {
    const { said, ended, status } = s.open()
    assert.equal(await status, 101)
    const service = await s.ready
    tell(service, { message_type: 'session_started', session_id: 'abc', config: {} })
    tell(service, { message_type: 'partial_transcript', text: 'make the hero' })
    await until(() => said.some((m) => m.type === 'partial'))
    on = false
    assert.deepEqual((await ended).at(-1), { type: 'end', reason: 'stopped', settled: false })
  } finally {
    await s.close()
  }
})

// ── The keyterms pilot (council 19/10/2026, A1): the page names its site, the relay asks Tracy's own
// lookup for the site's names, and they reach the service's handshake only. The lookup itself (pilot
// list, seat, names) is `lib/speech-keyterms.js`, held by `speech-keyterms.test.mjs`.

test('the service address carries each keyterm as its own query key, after the session settings', () => {
  const url = serviceAddress(undefined, 'vi', true, ['Bánh mì Phượng', 'Sofa & Co'])
  assert.deepEqual(url.searchParams.getAll('keyterms'), ['Bánh mì Phượng', 'Sofa & Co'])
  assert.equal(url.searchParams.get('language_code'), 'vi')
  assert.equal(url.searchParams.get('model_id'), 'scribe_v2_realtime')
  assert.equal(serviceAddress().searchParams.has('keyterms'), false, 'none unless the pilot gives some')
})

test('the relay’s own fence: strings within the service’s bounds, at most fifty', () => {
  const many = Array.from({ length: 60 }, (_, i) => `Name ${i}`)
  assert.equal(boundedKeyterms(many).length, 50)
  assert.deepEqual(boundedKeyterms(['Fine', 'x'.repeat(21), '', '  ', 7, null, 'Ñoño']), ['Fine', 'Ñoño'])
  assert.deepEqual(boundedKeyterms('Fine'), [])
})

test('a page in a pilot site: the relay asks for the site’s names for this account, and they go in the service handshake only', async () => {
  const asked = []
  const names = ['Bánh mì Phượng', 'Sofa Lindqvist']
  const s = await stand({
    extra: {
      keyterms: async (q) => {
        asked.push(q)
        return names
      }
    }
  })
  const { status } = s.open({}, '?language=vi&turns=voice&site=shop.example.com')
  assert.equal(await status, 101)
  const service = await s.ready
  assert.deepEqual(asked, [{ email: 'ana@example.com', siteKey: 'shop.example.com', language: 'vi' }])
  assert.deepEqual(s.seen.address.searchParams.getAll('keyterms'), names)
  assert.match(s.seen.handshakes[0].url, /[?&]keyterms=/, 'the stand-in service received them')
  tell(service, { message_type: 'session_started', session_id: 'k1', config: { keyterms: names } })
  await until(() => s.seen.logs.some((line) => line.startsWith('[speech] keyterms')))
  assert.deepEqual(
    s.seen.logs.filter((line) => line.startsWith('[speech] keyterms')),
    ['[speech] keyterms: 2 sent, 2 echoed by the service']
  )
  assert.ok(!s.seen.logs.join('\n').includes('Phượng'), 'how many, never which')
  await s.close()
})

test('a service that does not echo them says so; a second session_started of the same session is not logged again', async () => {
  const s = await stand({ extra: { keyterms: async () => ['Lindqvist'] } })
  s.open({}, '?site=shop.example.com')
  const service = await s.ready
  tell(service, { message_type: 'session_started', session_id: 'k2', config: {} })
  tell(service, { message_type: 'session_started', session_id: 'k2', config: {} })
  await until(() => s.seen.logs.some((line) => line.startsWith('[speech] keyterms')))
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(
    s.seen.logs.filter((line) => line.startsWith('[speech] keyterms')),
    ['[speech] keyterms: 1 sent, none echoed by the service']
  )
  await s.close()
})

test('no site named, a site of another shape, or a lookup that fails: the session opens as before, with no keyterms', async () => {
  for (const query of [
    '',
    '?site=',
    '?site=Shop%20Example',
    '?site=..%2Fetc',
    `?site=${'a'.repeat(250)}.com`
  ]) {
    const asked = []
    const s = await stand({ extra: { keyterms: async (q) => (asked.push(q), ['Never']) } })
    const { status } = s.open({}, query)
    assert.equal(await status, 101, query)
    await s.ready
    assert.deepEqual(asked, [], `${query}: the lookup is not asked`)
    assert.equal(s.seen.address.searchParams.has('keyterms'), false, query)
    await s.close()
  }
  const failing = await stand({
    extra: {
      keyterms: async () => {
        throw new Error('database down')
      }
    }
  })
  const { status } = failing.open({}, '?site=shop.example.com')
  assert.equal(await status, 101, 'a lookup that fails never refuses a session')
  const service = await failing.ready
  assert.equal(failing.seen.address.searchParams.has('keyterms'), false)
  tell(service, { message_type: 'session_started', session_id: 'k3', config: {} })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.ok(
    !failing.seen.logs.some((line) => line.startsWith('[speech] keyterms')),
    'nothing sent, nothing said'
  )
  await failing.close()
  const none = await stand()
  const plain = none.open({}, '?site=shop.example.com')
  assert.equal(await plain.status, 101, 'a relay given no lookup ignores the site')
  await none.ready
  assert.equal(none.seen.address.searchParams.has('keyterms'), false)
  await none.close()
})
