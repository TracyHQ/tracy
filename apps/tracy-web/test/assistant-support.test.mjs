// The AI Assistant hands a conversation to a person (`assistant/support.js`, `assistant/route.js`):
// one Telegram topic per handoff, staff replies (text and photos) relayed to the right account only,
// the model silent while a person holds the conversation, and a conversation that survives the
// browser until it is cleared. Telegram and the artifact store are fakes; Postgres is real.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { assistantRoutes, wantsHuman } from '../src/assistant/route.js'
import { createSupport, summaryText } from '../src/assistant/support.js'
import { splitText, telegramApi } from '../src/assistant/telegram.js'
import { accountByEmail, sitesOfAccount } from '../src/seats/store.js'
import { siteByKey } from '../src/sites/store.js'
import { briefOf } from '../src/sites/brief-store.js'
import { canonicalSiteKey, publicSiteFields } from '../src/sites/address.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const readers = { accountByEmail, sitesOfAccount, siteByKey, briefOf, publicSiteFields, canonicalSiteKey }
const CHAT = '-1001234567890'
const SECRET = 'w'.repeat(40)
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

async function account(pool, email, name = null) {
  const { rows } = await pool.query(
    `insert into account (email, display_name) values ($1, $2)
     on conflict (email) do update set email = excluded.email returning id`,
    [email, name]
  )
  return rows[0].id
}

async function siteWithOwner(pool, siteKey, email) {
  await pool.query(
    "insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'wordpress')",
    [siteKey, siteKey.split('.')[0]]
  )
  const id = await account(pool, email)
  await pool.query(
    'insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
    [siteKey, id, 'owner']
  )
}

/** Telegram, as far as the outbox and `receive` use it. */
function fakeTelegram() {
  const calls = []
  let nextTopic = 500
  const files = new Map()
  return {
    calls,
    files,
    fail: null,
    async createTopic(chatId, name) {
      if (this.fail) throw this.fail
      calls.push({ m: 'createTopic', chatId, name })
      return { message_thread_id: nextTopic++ }
    },
    async sendText(chatId, topicId, text) {
      if (this.fail) throw this.fail
      calls.push({ m: 'sendText', chatId, topicId, text })
      return { message_id: calls.length }
    },
    async closeTopic(chatId, topicId) {
      calls.push({ m: 'closeTopic', chatId, topicId })
      return true
    },
    /** Topic ids deleted in Telegram: reopening one answers what Telegram answers. */
    deleted: new Set(),
    async reopenTopic(chatId, topicId) {
      calls.push({ m: 'reopenTopic', chatId, topicId })
      if (this.deleted.has(topicId))
        throw Object.assign(new Error('FAILED'), {
          code: 'FAILED',
          status: 400,
          description: 'Bad Request: TOPIC_ID_INVALID'
        })
      return true
    },
    async download(fileId) {
      const bytes = files.get(fileId)
      if (!bytes) throw Object.assign(new Error('FAILED'), { code: 'FAILED' })
      return { bytes, size: bytes.byteLength }
    },
    async getUpdates() {
      return []
    }
  }
}

function fakeObjects() {
  const store = new Map()
  return {
    store,
    async put(key, bytes) {
      store.set(key, bytes)
      return true
    },
    async get(key) {
      return store.has(key) ? new Response(store.get(key)) : null
    },
    async delete(key) {
      store.delete(key)
    }
  }
}

function fakeModel() {
  const calls = []
  return {
    calls,
    async *stream({ messages }) {
      calls.push(messages)
      yield { model: 'fake-1' }
      yield { text: 'AI answer' }
    }
  }
}

function harness(pool, { staffIds = [] } = {}) {
  const config = {
    ...readConfig(env),
    csTelegram: { mode: 'webhook', token: 't', chatId: CHAT, webhookSecret: SECRET, staffIds }
  }
  const api = fakeTelegram()
  const objects = fakeObjects()
  const support = createSupport({ pool, cs: config.csTelegram, api, objects, log: { warn() {} } })
  const model = fakeModel()
  // The app hands both the same store client (`app.js`): the door reads a staff photo through it.
  const app = assistantRoutes({ pool, config, readers, model, support, objects, log: { warn() {} } })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const call = async (method, path, email, body, headers = {}) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(email ? { cookie: await cookieFor(email) } : {}),
          ...headers
        },
        ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
      })
    )
  const conversation = async (email, after) =>
    (await call('GET', `/api/assistant/conversation${after ? `?after=${after}` : ''}`, email)).json()
  const say = async (email, message, conversationId) => {
    const res = await call('POST', '/api/assistant/turns', email, {
      message,
      ...(conversationId ? { conversationId } : {})
    })
    return { status: res.status, text: await res.text() }
  }
  /** A staff message in a topic, the shape Telegram delivers. */
  const staff = (topicId, extra = {}) => ({
    message_id: Math.floor(Math.random() * 1e9),
    chat: { id: Number(CHAT), type: 'supergroup' },
    from: { id: 42, is_bot: false, first_name: 'Anna' },
    is_topic_message: true,
    message_thread_id: topicId,
    text: 'Hello from support',
    ...extra
  })
  return { app, api, objects, support, model, call, conversation, say, staff }
}

/** A, with a site and a short AI exchange, handed to a person; returns the topic id. */
async function handedOff(h, pool) {
  await siteWithOwner(pool, 'bakery.localhost', 'a@x.y')
  await siteWithOwner(pool, 'secret-b.localhost', 'b@x.y')
  await h.say('a@x.y', 'My contact form does not send emails')
  const { conversationId } = await h.conversation('a@x.y')
  const res = await h.call('POST', '/api/assistant/handoff', 'a@x.y', {
    conversationId,
    site: 'bakery.localhost'
  })
  assert.equal(res.status, 202)
  await h.support.drain()
  const topic = h.api.calls.find((c) => c.m === 'createTopic')
  return { conversationId, topicId: 500, topic }
}

// ── pure parts ──────────────────────────────────────────────────────────────────────────────────

test('wantsHuman matches a request for a person in several languages, not ordinary questions', () => {
  for (const s of [
    'I want to talk to a person',
    'cho mình gặp nhân viên',
    'Kundendienst bitte',
    '我要人工客服',
    'parler à un conseiller'
  ])
    assert.ok(wantsHuman(s), s)
  for (const s of [
    'How do I add a site?',
    'Đổi số điện thoại ở chân trang',
    'What is a human-readable URL?'.replace('human', 'plain')
  ])
    assert.ok(!wantsHuman(s), s)
})

test('splitText cuts long text at line breaks and never inside a surrogate pair', () => {
  const pieces = splitText(`${'a'.repeat(9)}\n${'b'.repeat(9)}`, 12)
  assert.deepEqual(pieces, ['a'.repeat(9), 'b'.repeat(9)])
  const emoji = splitText(`${'x'.repeat(11)}😀yy`, 12)
  assert.ok(emoji.every((p) => !/[\ud800-\udbff]$/.test(p)))
  assert.equal(emoji.join(''), `${'x'.repeat(11)}😀yy`)
})

test('summaryText names the customer, the site on screen and the last turns, as plain text', () => {
  const text = summaryText({
    email: 'a@x.y',
    site: { name: 'bakery.localhost', platform: 'wordpress' },
    turns: [
      { role: 'user', content: 'Form   broken\n<b>help</b>' },
      { role: 'assistant', content: 'Try Site changes' }
    ]
  })
  assert.match(text, /Customer: a@x\.y/)
  assert.match(text, /bakery\.localhost \(wordpress\)/)
  assert.match(text, /Customer: Form broken <b>help<\/b>/)
  assert.match(text, /Tracy AI: Try Site changes/)
})

test('telegramApi returns a code and never the URL or token on failure', async () => {
  const api = telegramApi({
    token: 'SECRET-TOKEN',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 7 } }),
        { status: 429 }
      )
  })
  await assert.rejects(
    api.sendText(CHAT, 1, 'x'),
    (e) => e.code === 'RATE_LIMITED' && e.retryAfter === 7 && !String(e.message).includes('SECRET')
  )
  const down = telegramApi({
    token: 'SECRET-TOKEN',
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED https://api.telegram.org/botSECRET-TOKEN/x')
    }
  })
  await assert.rejects(
    down.sendText(CHAT, 1, 'x'),
    (e) => e.code === 'UNREACHABLE' && !JSON.stringify(e).includes('SECRET')
  )
})

// ── conversation ────────────────────────────────────────────────────────────────────────────────

test(
  'the conversation survives the page: a later restore shows every turn, and a stale id is 409',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await siteWithOwner(pool, 'bakery.localhost', 'a@x.y')
    await h.say('a@x.y', 'first question')
    const restored = await h.conversation('a@x.y')
    assert.deepEqual(
      restored.turns.map((t) => [t.role, t.text]),
      [
        ['user', 'first question'],
        ['assistant', 'AI answer']
      ]
    )
    assert.equal(restored.state, 'ai')
    assert.ok(Array.isArray(restored.links))
    const later = await h.conversation('a@x.y', restored.turns[0].id)
    assert.deepEqual(
      later.turns.map((t) => t.text),
      ['AI answer']
    )
    assert.equal(later.links, undefined)
    const stale = await h.say('a@x.y', 'x', '00000000-0000-4000-8000-000000000000')
    assert.equal(stale.status, 409)
  }
)

test(
  'clear starts a new conversation for the whole account; the old turns are gone from the panel',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await siteWithOwner(pool, 'bakery.localhost', 'a@x.y')
    await h.say('a@x.y', 'remember me')
    const { conversationId } = await h.conversation('a@x.y')
    const res = await h.call('POST', '/api/assistant/conversation/clear', 'a@x.y', { conversationId })
    const fresh = await res.json()
    assert.notEqual(fresh.conversationId, conversationId)
    assert.deepEqual((await h.conversation('a@x.y')).turns, [])
    // The model is not handed the cleared turns either.
    await h.say('a@x.y', 'what did I say?')
    assert.ok(!JSON.stringify(h.model.calls.at(-1)).includes('remember me'))
  }
)

// ── handoff ─────────────────────────────────────────────────────────────────────────────────────

test(
  'a handoff opens one topic named after the customer and posts a summary of their own data only',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    const { topic } = await handedOff(h, pool)
    assert.equal(topic.chatId, CHAT)
    assert.match(topic.name, /^a@x\.y · [0-9a-f]{6}$/)
    const summary = h.api.calls.find((c) => c.m === 'sendText')
    assert.equal(summary.topicId, 500)
    assert.match(summary.text, /My contact form does not send emails/)
    assert.match(summary.text, /bakery\.localhost/)
    assert.ok(!summary.text.includes('secret-b'))
    assert.equal((await h.conversation('a@x.y')).state, 'waiting_human')
    // Pressing again while it is open opens nothing new.
    const { conversationId } = await h.conversation('a@x.y')
    await h.call('POST', '/api/assistant/handoff', 'a@x.y', { conversationId })
    await h.support.drain()
    assert.equal(h.api.calls.filter((c) => c.m === 'createTopic').length, 1)
  }
)

test(
  'while a person holds it the model is silent and the customer’s words go to the topic',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await handedOff(h, pool)
    const before = h.model.calls.length
    const out = await h.say('a@x.y', 'still there?')
    assert.equal(out.status, 200)
    assert.match(out.text, /"state":"waiting_human"/)
    assert.ok(!out.text.includes('event: delta'))
    assert.equal(h.model.calls.length, before)
    await h.support.drain()
    assert.deepEqual(h.api.calls.at(-1), {
      m: 'sendText',
      chatId: CHAT,
      topicId: 500,
      text: 'Customer: still there?'
    })
  }
)

test(
  'a staff reply reaches the right account, flips the state to human and counts as unread',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await handedOff(h, pool)
    assert.equal(await h.support.receive(h.staff(500, { text: 'Hi, I am looking at it' })), 'RELAYED')
    const conv = await h.conversation('a@x.y')
    assert.equal(conv.state, 'human')
    const last = conv.turns.at(-1)
    assert.deepEqual([last.role, last.text, last.staffName], ['staff', 'Hi, I am looking at it', 'Anna'])
    assert.equal(conv.unread, 1)
    // B sees nothing of it.
    assert.ok(!(await h.conversation('b@x.y')).turns.some((t) => t.role === 'staff'))
    await h.call('POST', '/api/assistant/conversation/read', 'a@x.y', {
      conversationId: conv.conversationId,
      through: last.id
    })
    assert.equal((await h.conversation('a@x.y')).unread, 0)
  }
)

test(
  'only the configured chat, an open topic, and a person may reach a customer; a redelivery lands once',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await handedOff(h, pool)
    assert.equal(await h.support.receive(h.staff(500, { chat: { id: -100999 } })), 'OTHER_CHAT')
    assert.equal(await h.support.receive(h.staff(500, { from: { id: 7, is_bot: true } })), 'NOT_A_PERSON')
    assert.equal(await h.support.receive(h.staff(500, { sender_chat: { id: Number(CHAT) } })), 'NOT_A_PERSON')
    assert.equal(await h.support.receive(h.staff(777)), 'NO_OPEN_HANDOFF')
    assert.equal(
      await h.support.receive(h.staff(500, { is_topic_message: false, message_thread_id: undefined })),
      'NO_TOPIC'
    )
    const once = h.staff(500, { message_id: 99 })
    assert.equal(await h.support.receive(once), 'RELAYED')
    assert.equal(await h.support.receive(once), 'DUPLICATE')
    assert.equal((await h.conversation('a@x.y')).turns.filter((t) => t.role === 'staff').length, 1)
  }
)

test('with a staff allowlist, a group member outside it is not relayed', opts, async () => {
  const { pool } = db
  const h = harness(pool, { staffIds: ['42'] })
  await handedOff(h, pool)
  assert.equal(
    await h.support.receive(h.staff(500, { from: { id: 43, is_bot: false, first_name: 'Eve' } })),
    'NOT_STAFF'
  )
  assert.equal(await h.support.receive(h.staff(500)), 'RELAYED')
})

test(
  'a staff photo is kept in the store and served to its own account only; other media get a note',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await handedOff(h, pool)
    h.api.files.set('big', new Uint8Array([0xff, 0xd8, 1, 2, 3]))
    const photo = h.staff(500, {
      text: undefined,
      caption: 'See this',
      photo: [
        { file_id: 'small', file_size: 10 },
        { file_id: 'big', file_size: 20 }
      ]
    })
    assert.equal(await h.support.receive(photo), 'RELAYED')
    const turn = (await h.conversation('a@x.y')).turns.at(-1)
    assert.equal(turn.text, 'See this')
    assert.match(turn.attachmentId, /^[0-9a-f-]{36}$/)
    const mine = await h.call('GET', `/api/assistant/attachments/${turn.attachmentId}`, 'a@x.y')
    assert.equal(mine.status, 200)
    assert.equal(mine.headers.get('content-type'), 'image/jpeg')
    assert.deepEqual(new Uint8Array(await mine.arrayBuffer()), new Uint8Array([0xff, 0xd8, 1, 2, 3]))
    assert.equal(
      (await h.call('GET', `/api/assistant/attachments/${turn.attachmentId}`, 'b@x.y')).status,
      404
    )
    assert.equal((await h.call('GET', `/api/assistant/attachments/${turn.attachmentId}`)).status, 401)

    assert.equal(
      await h.support.receive(h.staff(500, { text: undefined, document: { file_id: 'd' } })),
      'UNSUPPORTED'
    )
    await h.support.drain()
    assert.match(h.api.calls.at(-1).text, /Only text and photos/)
  }
)

test(
  'Resolved returns to the AI, notes the reason in the topic and closes it; the topic then reaches no one',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    const { conversationId } = await handedOff(h, pool)
    await h.support.receive(h.staff(500))
    const res = await h.call('POST', '/api/assistant/handoff/end', 'a@x.y', {
      conversationId,
      reason: 'resolved'
    })
    assert.deepEqual(await res.json(), { state: 'ai' })
    await h.support.drain()
    const [note, close] = h.api.calls.slice(-2)
    assert.match(note.text, /marked this as resolved/)
    assert.deepEqual(close, { m: 'closeTopic', chatId: CHAT, topicId: 500 })
    assert.equal(await h.support.receive(h.staff(500, { text: 'late' })), 'NO_OPEN_HANDOFF')
    // The AI answers again.
    const before = h.model.calls.length
    await h.say('a@x.y', 'back to you, bot')
    assert.equal(h.model.calls.length, before + 1)
    // Asking again reopens the same topic, with a summary that says so, and staff replies there
    // reach the customer again.
    await h.call('POST', '/api/assistant/handoff', 'a@x.y', { conversationId })
    await h.support.drain()
    assert.equal(h.api.calls.filter((c) => c.m === 'createTopic').length, 1)
    const reopened = h.api.calls.findIndex((c) => c.m === 'reopenTopic')
    assert.deepEqual(h.api.calls[reopened], { m: 'reopenTopic', chatId: CHAT, topicId: 500 })
    assert.match(h.api.calls[reopened + 1].text, /^The customer asked for a person again/)
    assert.equal(await h.support.receive(h.staff(500, { text: 'welcome back' })), 'RELAYED')
    assert.equal((await h.conversation('a@x.y')).turns.at(-1).text, 'welcome back')
  }
)

test('a topic deleted in Telegram is replaced by a new one when the customer asks again', opts, async () => {
  const { pool } = db
  const h = harness(pool)
  const { conversationId } = await handedOff(h, pool)
  await h.call('POST', '/api/assistant/handoff/end', 'a@x.y', { conversationId, reason: 'back_to_ai' })
  await h.support.drain()
  h.api.deleted.add(500)
  await h.call('POST', '/api/assistant/handoff', 'a@x.y', { conversationId })
  await h.support.drain()
  assert.deepEqual(
    h.api.calls.filter((c) => c.m === 'createTopic').map((c) => c.m),
    ['createTopic', 'createTopic']
  )
  const summary = h.api.calls.at(-1)
  assert.equal(summary.topicId, 501)
  assert.equal(await h.support.receive(h.staff(501)), 'RELAYED')
  assert.equal(await h.support.receive(h.staff(500)), 'NO_OPEN_HANDOFF')
})

test('the summary shows an answer’s links as their labels and drops Markdown marks', () => {
  const text = summaryText({
    email: 'a@x.y',
    site: null,
    turns: [
      {
        role: 'assistant',
        content: 'Press **Talk to a person**, or open [Site changes](/?tab=tracy:changes&site=x) and `Undo`.'
      }
    ]
  })
  assert.match(text, /Tracy AI: Press Talk to a person, or open Site changes and Undo\./)
  assert.ok(!text.includes('/?tab='))
})

test(
  'clearing during a handoff ends it with a note, drops unsent customer words, and stale staff replies go nowhere',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    const { conversationId } = await handedOff(h, pool)
    h.api.fail = Object.assign(new Error('UNREACHABLE'), { code: 'UNREACHABLE' })
    await h.say('a@x.y', 'my password is hunter2')
    await h.support.drain()
    h.api.fail = null
    await pool.query('update assistant_outbox set next_at = now()')
    await h.call('POST', '/api/assistant/conversation/clear', 'a@x.y', { conversationId })
    await h.support.drain()
    const texts = h.api.calls.filter((c) => c.m === 'sendText').map((c) => c.text)
    assert.ok(!texts.some((t) => t.includes('hunter2')))
    assert.match(texts.at(-1), /cleared the conversation/)
    assert.equal(h.api.calls.at(-1).m, 'closeTopic')
    assert.equal(await h.support.receive(h.staff(500)), 'NO_OPEN_HANDOFF')
    assert.deepEqual((await h.conversation('a@x.y')).turns, [])
  }
)

test('the outbox waits for its topic, keeps order per handoff, and backs off on failure', opts, async () => {
  const { pool } = db
  const h = harness(pool)
  await siteWithOwner(pool, 'bakery.localhost', 'a@x.y')
  await h.say('a@x.y', 'hello')
  const { conversationId } = await h.conversation('a@x.y')
  h.api.fail = Object.assign(new Error('FAILED'), { code: 'FAILED' })
  await h.call('POST', '/api/assistant/handoff', 'a@x.y', { conversationId })
  await h.say('a@x.y', 'second')
  assert.equal(await h.support.drain(), 0)
  const { rows } = await pool.query(
    'select kind, attempts, error, next_at > now() as later from assistant_outbox order by id'
  )
  assert.deepEqual(
    rows.map((r) => [r.kind, r.attempts]),
    [
      ['create_topic', 1],
      ['send_text', 0],
      ['send_text', 0]
    ]
  )
  assert.equal(rows[0].error, 'FAILED')
  assert.ok(rows[0].later)
  h.api.fail = null
  await pool.query('update assistant_outbox set next_at = now()')
  assert.equal(await h.support.drain(), 3)
  assert.deepEqual(
    h.api.calls.map((c) => c.m),
    ['createTopic', 'sendText', 'sendText']
  )
  assert.equal(h.api.calls[2].text, 'Customer: second')
})

test(
  'handoff refusals: no session 401, unknown conversation 409, burst 429, no CS bot 503',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await siteWithOwner(pool, 'bakery.localhost', 'a@x.y')
    const { conversationId } = await h.conversation('a@x.y')
    assert.equal((await h.call('POST', '/api/assistant/handoff', null, { conversationId })).status, 401)
    assert.equal(
      (
        await h.call('POST', '/api/assistant/handoff', 'a@x.y', {
          conversationId: '00000000-0000-4000-8000-000000000000'
        })
      ).status,
      409
    )
    for (let i = 0; i < 3; i++) {
      await h.call('POST', '/api/assistant/handoff', 'a@x.y', { conversationId })
      await h.call('POST', '/api/assistant/handoff/end', 'a@x.y', { conversationId, reason: 'back_to_ai' })
    }
    assert.equal((await h.call('POST', '/api/assistant/handoff', 'a@x.y', { conversationId })).status, 429)

    const config = readConfig(env)
    const off = assistantRoutes({
      pool,
      config,
      readers,
      model: fakeModel(),
      support: createSupport({ pool, cs: null, api: null })
    })
    const res = await off.fetch(
      new Request('http://tracy.test/api/assistant/handoff', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `tracy_sess=${await mintSession('a@x.y', config.sessionSecret)}`
        },
        body: JSON.stringify({ conversationId })
      })
    )
    assert.equal(res.status, 503)
    const conv = await off.fetch(
      new Request('http://tracy.test/api/assistant/conversation', {
        headers: { cookie: `tracy_sess=${await mintSession('a@x.y', config.sessionSecret)}` }
      })
    )
    assert.equal((await conv.json()).supportAvailable, false)
  }
)

test('the webhook relays only with the exact secret, through buildApp and its CSRF guard', opts, async () => {
  const { pool } = db
  const config = {
    ...readConfig(env),
    csTelegram: { mode: 'webhook', token: 't', chatId: CHAT, webhookSecret: SECRET, staffIds: [] }
  }
  const api = fakeTelegram()
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    telegramApi: api,
    log: { warn() {}, log() {}, info() {}, error() {} }
  })
  const h = { ...harness(pool) }
  await siteWithOwner(pool, 'bakery.localhost', 'a@x.y')
  // Open a handoff through the real app so its support owns the topic.
  const cookie = `tracy_sess=${await mintSession('a@x.y', config.sessionSecret)}`
  const conv = await (
    await app.fetch(new Request('http://tracy.test/api/assistant/conversation', { headers: { cookie } }))
  ).json()
  const opened = await app.fetch(
    new Request('http://tracy.test/api/assistant/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ conversationId: conv.conversationId })
    })
  )
  assert.equal(opened.status, 202)
  await app.assistantSupport.drain()
  const update = JSON.stringify({ update_id: 1, message: h.staff(500, { text: 'via webhook' }) })
  const hook = (secret, extra = {}) =>
    app.fetch(
      new Request('http://tracy.test/api/assistant/telegram/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}),
          ...extra
        },
        body: update
      })
    )
  assert.equal((await hook(null)).status, 404)
  assert.equal((await hook('x'.repeat(40))).status, 404)
  // A valid customer cookie riding along changes nothing: the secret is the whole authority.
  assert.equal((await hook(null, { cookie, 'sec-fetch-site': 'cross-site' })).status, 404)
  assert.equal((await hook(SECRET, { cookie, 'sec-fetch-site': 'cross-site' })).status, 200)
  const after = await (
    await app.fetch(new Request('http://tracy.test/api/assistant/conversation', { headers: { cookie } }))
  ).json()
  assert.equal(after.turns.at(-1).text, 'via webhook')
  assert.equal(after.state, 'human')
})
