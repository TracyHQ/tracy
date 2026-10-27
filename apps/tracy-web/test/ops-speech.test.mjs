// /ops › Agents › Voice (`src/ops/speech.js`): the voice switch, the speech key typed there, the
// limits and today's use. A stand-in pool answers what the doors ask: the staff role (`admit`), the
// switch (`ui_setting`), the saved key (`speech_setting`) and today's buckets (`rate_bucket`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { speechOpsRoutes } from '../src/ops/speech.js'
import { SPEAK_LIMITS, SPEECH_LIMITS } from '../src/lib/speech.js'

const SECRET = 'ops-speech-secret'
const ORIGIN = 'https://cowork.tracy.test'
const NOW = Date.UTC(2026, 9, 15, 9, 30)
const KEY = 'sk_saved_on_ops_0123456789'

function poolOf({
  role = 'admin',
  switchOn,
  switchThrows = false,
  // 11 min 5 s of audio: shown as 12 minutes, to the next whole one.
  usage = { seconds: 665, accounts: 3 },
  spoken = { chars: 1800, accounts: 2 },
  // Voice turns as the pages reported them (`ops_signal`, kind `voice.turn`), and staff addresses.
  traces = [],
  staff = [],
  // The keyterms pilot's sites (`speech_setting.keyterm_sites`); null: no row.
  keyterms = null
} = {}) {
  const pool = {
    asked: [],
    row: null,
    keyterms,
    async query(sql, params) {
      pool.asked.push({ sql, params })
      if (sql.startsWith('select keyterm_sites'))
        return { rows: pool.keyterms === null ? [] : [{ keyterm_sites: pool.keyterms }] }
      if (sql.includes('insert into speech_setting (id, keyterm_sites')) {
        pool.keyterms = params[0]
        return { rows: [] }
      }
      if (sql.includes('ops_signal')) return { rows: traces }
      if (sql.includes('distinct lower(a.email)')) return { rows: staff.map((email) => ({ email })) }
      if (sql.includes('seat_workspace')) return { rows: role ? [{ role }] : [] }
      if (sql.includes('ui_setting')) {
        if (switchThrows) throw new Error('database down')
        return { rows: switchOn === undefined ? [] : [{ on: switchOn }] }
      }
      if (sql.startsWith('select provider')) return { rows: pool.row ? [pool.row] : [] }
      if (sql.startsWith('select api_key_cipher')) return { rows: pool.row ? [pool.row] : [] }
      if (sql.includes('insert into speech_setting')) {
        pool.row = { api_key_cipher: params[0], updated_by: params[1], updated_at: new Date(NOW) }
        return { rows: [] }
      }
      if (sql.includes('speak-chars')) return { rows: [spoken] }
      if (sql.includes('rate_bucket')) return { rows: [usage] }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  return pool
}

const quiet = { log() {} }

async function call({
  pool,
  speech = null,
  method = 'GET',
  path = '/api/ops/speech',
  body,
  origin = ORIGIN,
  signedIn = true,
  fetchImpl
}) {
  const app = speechOpsRoutes({
    pool,
    config: { origin: ORIGIN, sessionSecret: SECRET, speech },
    now: () => NOW,
    log: quiet,
    ...(fetchImpl ? { fetchImpl } : {})
  })
  const headers = { origin, 'content-type': 'application/json' }
  if (signedIn) headers.cookie = `${SESSION_COOKIE}=${await mintSession('ops@example.com', SECRET)}`
  return app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

test('an admin reads the switch (on by default), the key, the limits and today’s use', async () => {
  const pool = poolOf()
  const res = await call({ pool, speech: { apiKey: 'env-key-123' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()
  const { provider, health, runtime, turns, ...legacy } = body
  assert.equal(turns.day.turns, 0, 'no voice turn reported yet')
  assert.equal(provider.provider, 'elevenlabs')
  assert.equal(runtime, null)
  assert.deepEqual(health, { stt: null, tts: null })
  assert.deepEqual(legacy, {
    on: true,
    configured: true,
    key: {
      configured: true,
      hint: 'env… (11 chars)',
      source: 'env',
      unreadable: false,
      updatedBy: null,
      updatedAt: null
    },
    writable: true,
    service: { provider: 'ElevenLabs', model: 'scribe_v2_realtime' },
    limits: {
      sessionSeconds: SPEECH_LIMITS.sessionSeconds,
      silenceSeconds: SPEECH_LIMITS.silenceSeconds,
      accountMinutesPerDay: SPEECH_LIMITS.accountMinutesPerDay,
      totalMinutesPerDay: SPEECH_LIMITS.totalMinutesPerDay
    },
    today: { day: '2026-10-15', minutes: 12, seconds: 665, accounts: 3 },
    // The voice conversation the same switch turns on: who reads out loud, its limits, today's characters.
    speak: {
      service: { provider: 'ElevenLabs', model: 'eleven_flash_v2_5' },
      limits: { ...SPEAK_LIMITS },
      today: { day: '2026-10-15', chars: 1800, accounts: 2 }
    },
    // The keyterms pilot: off (no site listed) until an operator lists one.
    keyterms: { sites: [], limits: { sites: 100, terms: 30, chars: 20 } }
  })
  const usage = pool.asked.find((q) => q.sql.includes('rate_bucket'))
  assert.equal(usage.params[0].toISOString(), '2026-10-15T00:00:00.000Z', 'the budget’s UTC day window')
  assert.ok(!JSON.stringify(body).includes('env-key-123'), 'the key itself is never in an answer')
})

test('the switch as the operator pressed it; unreadable, it is said as unknown (null)', async () => {
  assert.equal((await (await call({ pool: poolOf({ switchOn: false }) })).json()).on, false)
  assert.equal((await (await call({ pool: poolOf({ switchOn: true }) })).json()).on, true)
  assert.equal((await (await call({ pool: poolOf({ switchThrows: true }) })).json()).on, null)
})

test('no key saved and none in the environment: not configured', async () => {
  const body = await (await call({ pool: poolOf() })).json()
  assert.equal(body.configured, false)
  assert.equal(body.key.source, null)
})

test('an admin saves a key on /ops: sealed, used before the environment’s, never sent back; empty removes it', async () => {
  const pool = poolOf()
  const saved = await call({
    pool,
    speech: { apiKey: 'env-key-123' },
    method: 'PUT',
    path: '/api/ops/speech/key',
    body: { apiKey: ` ${KEY} ` }
  })
  assert.equal(saved.status, 200)
  const body = await saved.json()
  assert.equal(body.key.source, 'ops')
  assert.equal(body.key.updatedBy, 'ops@example.com')
  assert.ok(!JSON.stringify(body).includes(KEY))
  assert.ok(!pool.row.api_key_cipher.includes(KEY))
  const removed = await call({
    pool,
    speech: { apiKey: 'env-key-123' },
    method: 'PUT',
    path: '/api/ops/speech/key',
    body: { apiKey: '' }
  })
  assert.equal((await removed.json()).key.source, 'env')
})

test('saving or testing a key: owner or admin only, from this origin only, a well-formed key only', async () => {
  const put = (opts) => call({ method: 'PUT', path: '/api/ops/speech/key', body: { apiKey: KEY }, ...opts })
  assert.equal((await put({ pool: poolOf({ role: 'member' }) })).status, 403)
  assert.equal((await put({ pool: poolOf(), origin: 'https://evil.example' })).status, 403)
  assert.equal(
    (await call({ pool: poolOf(), method: 'PUT', path: '/api/ops/speech/key', body: { apiKey: 'a b' } }))
      .status,
    400
  )
  assert.equal(
    (
      await call({
        pool: poolOf({ role: 'member' }),
        method: 'POST',
        path: '/api/ops/speech/key/test',
        body: {}
      })
    ).status,
    403
  )
  const member = await (await call({ pool: poolOf({ role: 'member' }) })).json()
  assert.equal(member.writable, false)
  const signedOut = await call({ pool: poolOf(), signedIn: false })
  assert.equal(signedOut.status, 302)
  assert.equal((await call({ pool: poolOf({ role: null }) })).status, 403)
})

test('the key test tries the typed key, else the one in use, and says what the service answered', async () => {
  const tried = []
  const fetchImpl = async (_url, init) => {
    tried.push(init.headers['xi-api-key'])
    return init.headers['xi-api-key'] === KEY
      ? new Response(JSON.stringify({ token: 'sutkn' }), { status: 200 })
      : new Response(
          JSON.stringify({
            detail: { status: 'missing_permissions', message: 'missing the permission speech_to_text' }
          }),
          { status: 401 }
        )
  }
  const typed = await call({
    pool: poolOf(),
    method: 'POST',
    path: '/api/ops/speech/key/test',
    body: { apiKey: KEY },
    fetchImpl
  })
  assert.deepEqual(await typed.json(), { ok: true })
  const inUse = await call({
    pool: poolOf(),
    speech: { apiKey: 'env-key-123' },
    method: 'POST',
    path: '/api/ops/speech/key/test',
    body: {},
    fetchImpl
  })
  const answer = await inUse.json()
  assert.equal(answer.ok, false)
  assert.equal(answer.reason, 'missing_permissions')
  assert.deepEqual(tried, [KEY, 'env-key-123'])
  const nothing = await call({
    pool: poolOf(),
    method: 'POST',
    path: '/api/ops/speech/key/test',
    body: {},
    fetchImpl
  })
  assert.equal((await nothing.json()).reason, 'no_key')
})

test('voice turn timings: medians from 20 turns, the 95th percentile from 100, shares by the Usage rules, staff left out by the query', async () => {
  const at = (hoursAgo) => new Date(NOW - hoursAgo * 3_600_000)
  const turn = (ms, { hoursAgo = 1, ...flags } = {}) => ({
    occurred_at: at(hoursAgo),
    data: {
      email: 'ana@example.com',
      speech_to_commit: 600,
      commit_to_sent: 300,
      sent_to_ack: 50,
      sent_to_reply: ms - 900,
      speech_to_reply: ms,
      ack_cached: 1,
      error: 0,
      interrupted: 0,
      pressed: 0,
      ...flags
    }
  })
  // 19 turns today, 101 over the week (82 of them three days ago), and one pressed Send now.
  const traces = [
    ...Array.from({ length: 19 }, (_, i) => turn(2000 + i * 100)),
    ...Array.from({ length: 81 }, (_, i) => turn(3000 + i * 10, { hoursAgo: 72 })),
    turn(9000, { hoursAgo: 72, error: 1, interrupted: 0 }),
    turn(60_000, { hoursAgo: 2, pressed: 1 })
  ]
  const pool = poolOf({ traces, staff: ['ops@example.com'] })
  const { turns } = await (await call({ pool })).json()
  // The last day: 20 turns, one pressed, so 19 timed — a count, never a median.
  assert.equal(turns.day.days, 1)
  assert.equal(turns.day.turns, 20)
  assert.equal(turns.day.pressed, 1)
  assert.deepEqual(turns.day.spans.speechToReply, { n: 19, p50: null, p95: null })
  assert.deepEqual(turns.day.errors, { a: 0, b: 20, rate: 0 })
  // The week: 101 timed turns, enough for both.
  assert.equal(turns.week.turns, 102)
  assert.equal(turns.week.spans.speechToReply.n, 101)
  assert.equal(typeof turns.week.spans.speechToReply.p50, 'number')
  assert.equal(typeof turns.week.spans.speechToReply.p95, 'number')
  assert.ok(turns.week.spans.speechToReply.p95 >= turns.week.spans.speechToReply.p50)
  assert.notEqual(turns.week.spans.speechToReply.p95, 60_000, 'a press’s own pause is no turn time')
  assert.deepEqual(turns.week.errors, { a: 1, b: 102, rate: 0.01 })
  assert.deepEqual(turns.week.ackCached, { a: 102, b: 102, rate: 1 })
  // Staff are left out where the rows are read, as Beta › Usage leaves them out.
  const read = pool.asked.find((q) => q.sql.includes("kind = 'voice.turn'"))
  assert.match(read.sql, /lower\(coalesce\(data->>'email', ''\)\) <> all\(\$2::text\[\]\)/)
  assert.deepEqual(read.params[1], ['ops@example.com'])
  assert.equal(read.params[0].toISOString(), new Date(NOW - 7 * 86_400_000).toISOString(), 'a week back')
})

test('the keyterms pilot: off by default; an owner or admin lists sites from this origin, and the list is checked', async () => {
  const pool = poolOf()
  assert.deepEqual(
    (await (await call({ pool })).json()).keyterms.sites,
    [],
    'no site in the pilot by default'
  )
  const put = (body, opts = {}) =>
    call({ pool, method: 'PUT', path: '/api/ops/speech/keyterms', body, ...opts })
  const saved = await put({ sites: [' Shop.Example.com', 'shop.example.com', 'b.tracy.site'] })
  assert.equal(saved.status, 200)
  assert.equal(saved.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await saved.json()).keyterms.sites, ['shop.example.com', 'b.tracy.site'])
  assert.deepEqual((await (await call({ pool })).json()).keyterms.sites, ['shop.example.com', 'b.tracy.site'])
  assert.deepEqual(await (await put({ sites: ['not a site'] })).json(), { error: 'SITE_KEY_INVALID' })
  assert.equal((await put({ sites: 'shop.example.com' })).status, 400)
  assert.equal((await put({ sites: [] }, { pool: poolOf({ role: 'member' }) })).status, 403)
  assert.equal((await put({ sites: [] }, { origin: 'https://evil.example' })).status, 403)
  assert.deepEqual(pool.keyterms, ['shop.example.com', 'b.tracy.site'], 'a refused press changes nothing')
  const off = await put({ sites: [] })
  assert.deepEqual((await off.json()).keyterms.sites, [], 'an empty list turns the pilot off')
  const unreadable = poolOf()
  unreadable.query = async (sql) => {
    if (sql.startsWith('select keyterm_sites')) throw new Error('column missing')
    return poolOf().query(sql)
  }
  assert.equal(
    (await (await call({ pool: unreadable })).json()).keyterms,
    null,
    'unreadable: said as unknown'
  )
})
