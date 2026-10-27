// The creation screen's chat (David, 26/10/2026): files a customer attaches to a Help question are stored
// with the account and served only to them, and Help's answers there may offer the start actions.

import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  claimFiles,
  filesNote,
  kindOf,
  LOOSE_TTL_MS,
  MAX_FILE_BYTES,
  sweepLoose
} from '../src/assistant/files.js'
import { ACTION_SCHEME, navigationFor, startActions, systemPrompt } from '../src/assistant/prompt.js'
import { assistantRoutes } from '../src/assistant/route.js'
import { historyOf } from '../src/assistant/store.js'
import { createSupport } from '../src/assistant/support.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { accountByEmail, ensureAccount, sitesOfAccount } from '../src/seats/store.js'
import { canonicalSiteKey, publicSiteFields } from '../src/sites/address.js'
import { briefOf } from '../src/sites/brief-store.js'
import { siteByKey } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
let databaseNow
beforeEach(async () => {
  await db.reset()
  // PostgreSQL keeps its own wall clock when the clock-shift preload moves JavaScript's clock.
  // Match the route's cleanup clock to the database that stamps uploaded fixture rows.
  const { rows } = await db.pool.query('select extract(epoch from clock_timestamp()) * 1000 as ms')
  databaseNow = Number(rows[0].ms)
})
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const readers = { accountByEmail, sitesOfAccount, siteByKey, briefOf, publicSiteFields, canonicalSiteKey }
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
const SESSION = 'session-1b227e26'

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
      yield { text: 'Press [Create a new site](tracy-action:create).' }
    }
  }
}

async function account(pool, email) {
  await pool.query('insert into account (email) values ($1) on conflict do nothing', [email])
}

function harness(
  pool,
  { objects = fakeObjects(), now = () => databaseNow, model = fakeModel(), support } = {}
) {
  const config = readConfig(env)
  const app = assistantRoutes({
    pool,
    config,
    readers,
    ensureAccount,
    support,
    model,
    objects,
    ...(now ? { now } : {}),
    log: { warn() {} }
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const upload = async (email, name, bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])) => {
    const form = new FormData()
    form.append('file', new Blob([bytes]), name)
    form.append('session', SESSION)
    return app.fetch(
      new Request('http://tracy.test/api/assistant/attachments', {
        method: 'POST',
        headers: { cookie: await cookieFor(email) },
        body: form
      })
    )
  }
  const ask = async (email, body) =>
    app.fetch(
      new Request('http://tracy.test/api/assistant/turns', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: await cookieFor(email) },
        body: JSON.stringify({ session: { id: SESSION, anchorSeq: 0 }, ...body })
      })
    )
  const get = async (email, path) =>
    app.fetch(new Request(`http://tracy.test${path}`, { headers: { cookie: await cookieFor(email) } }))
  return { app, model, objects, upload, ask, get }
}

// ── pure parts ──────────────────────────────────────────────────────────────────────────────────

test('the kind of a file comes from its name, never from what the browser claims', () => {
  assert.deepEqual(kindOf('Logo.PNG'), { type: 'image/png', picture: true })
  assert.equal(kindOf('menu.pdf')?.type, 'application/pdf')
  assert.equal(kindOf('prices.xlsx')?.picture, false)
  assert.equal(kindOf('page.html'), null)
  assert.equal(kindOf('logo.svg'), null, 'SVG can carry script')
  assert.equal(kindOf('noextension'), null)
})

test('the model reads names, kinds and sizes of the files, and is told it cannot open them', () => {
  const note = filesNote([
    { name: 'logo.png', type: 'image/png', bytes: 120 * 1024 },
    { name: 'menu.pdf', type: 'application/pdf', bytes: 2.1 * 1024 * 1024 }
  ])
  assert.match(note, /logo\.png \(PNG image, 120 KB\)/)
  assert.match(note, /menu\.pdf \(PDF document, 2\.1 MB\)/)
  assert.match(note, /cannot open or see their content/)
  assert.equal(filesNote([]), '')
})

test('the start actions are listed only for the creation screen, and Build from my business follows its switch', () => {
  const start = navigationFor(null, { start: true, hidden: [] }).map((l) => l.href)
  assert.ok(start.includes(`${ACTION_SCHEME}create`))
  assert.ok(start.includes(`${ACTION_SCHEME}create?platform=wordpress`))
  assert.ok(start.includes(`${ACTION_SCHEME}create?platform=joomla`))
  assert.ok(start.includes(`${ACTION_SCHEME}create?platform=emdash`))
  assert.ok(start.includes(`${ACTION_SCHEME}templates`))
  assert.ok(start.includes(`${ACTION_SCHEME}import`))
  assert.ok(start.includes(`${ACTION_SCHEME}business`))
  const off = startActions(['site-from-business']).map((l) => l.href)
  assert.ok(!off.includes(`${ACTION_SCHEME}business`))
  // A /help in a site's chat (no `start`) and a site on screen never get them.
  assert.ok(!navigationFor(null).some((l) => l.href.startsWith(ACTION_SCHEME)))
  const onSite = { current: { siteKey: 'a.test', workspaceUrl: '/a.test/', name: 'A' }, sites: [] }
  assert.ok(!navigationFor(onSite, { start: true }).some((l) => l.href.startsWith(ACTION_SCHEME)))
})

test('with the start actions listed, the prompt asks for the fitting action as a link and states the file facts', () => {
  const links = navigationFor(null, { start: true, hidden: [] })
  const prompt = systemPrompt(null, links, new Date('2026-10-26T00:00:00Z'), [], 'make me a WordPress site')
  assert.match(prompt, /give the matching start action as a link/)
  assert.match(prompt, /tracy-action:create\?platform=wordpress/)
  assert.match(prompt, /You cannot open or see a file's content/)
  assert.doesNotMatch(prompt, /never add a link for a button/)
  // An older page that does not say `start` keeps the button-name wording.
  const old = systemPrompt(null, navigationFor(null), new Date('2026-10-26T00:00:00Z'), [], 'hello')
  assert.match(old, /never add a link for a button/)
  assert.doesNotMatch(old, /tracy-action:/)
})

// ── the doors ───────────────────────────────────────────────────────────────────────────────────

test(
  'a picked file is stored loose with the account; a question claims it and the restore shows it',
  opts,
  async () => {
    const { pool } = db
    await account(pool, 'new@x.y')
    const h = harness(pool)
    const up = await h.upload('new@x.y', 'Logo.png')
    assert.equal(up.status, 201)
    const { file } = await up.json()
    assert.match(file.id, /^[0-9a-f-]{36}$/)
    assert.equal(file.name, 'Logo.png')
    assert.equal(file.type, 'image/png')
    assert.equal(file.url, `/api/assistant/attachments/${file.id}`)
    assert.equal(h.objects.store.size, 1)

    // A question may be only files; it carries the stored id and the model reads the file line.
    const res = await h.ask('new@x.y', { message: '', attachments: [file.id], start: true })
    assert.equal(res.status, 200)
    await res.text()
    const sent = h.model.calls.at(-1)
    assert.match(sent.at(-1).content, /Logo\.png \(PNG image/)
    assert.ok(sent[0].content.includes('tracy-action:create'), 'the creation screen lists the start actions')

    const restored = await (
      await h.get('new@x.y', `/api/assistant/conversation?session=${SESSION}&start=1`)
    ).json()
    const question = restored.turns.find((t) => t.role === 'user')
    assert.deepEqual(
      question.files.map((f) => f.id),
      [file.id]
    )
    assert.ok(restored.links.some((l) => l.href === 'tracy-action:import'))

    // A follow-up still knows what was attached earlier.
    const account_ = await accountByEmail(pool, 'new@x.y')
    const conv = (await pool.query('select conversation_id from assistant_turn limit 1')).rows[0]
      .conversation_id
    const history = await historyOf(pool, account_.id, conv)
    assert.match(history[0].content, /Logo\.png/)

    // A claimed file cannot ride a second question.
    const again = await h.ask('new@x.y', { message: 'again', attachments: [file.id] })
    assert.equal(again.status, 409)
  }
)

test(
  'only the owner reads a file: a picture opens in place, any other file downloads and cannot run as a page',
  opts,
  async () => {
    const { pool } = db
    await account(pool, 'own@x.y')
    await account(pool, 'other@x.y')
    const h = harness(pool)
    const pic = (await (await h.upload('own@x.y', 'shop.png')).json()).file
    const doc = (await (await h.upload('own@x.y', 'menu.pdf', new Uint8Array([37, 80, 68, 70]))).json()).file

    const mine = await h.get('own@x.y', pic.url)
    assert.equal(mine.status, 200)
    assert.equal(mine.headers.get('content-type'), 'image/png')
    assert.match(mine.headers.get('content-disposition'), /^inline;/)
    assert.equal(mine.headers.get('x-content-type-options'), 'nosniff')
    assert.match(mine.headers.get('content-security-policy'), /sandbox/)

    const pdf = await h.get('own@x.y', doc.url)
    assert.equal(pdf.headers.get('content-type'), 'application/pdf')
    assert.match(pdf.headers.get('content-disposition'), /^attachment; filename="menu\.pdf"/)

    assert.equal((await h.get('other@x.y', pic.url)).status, 404)
    // Another account cannot send someone else's file either.
    const stolen = await h.ask('other@x.y', { message: 'look', attachments: [pic.id] })
    assert.equal(stolen.status, 409)
  }
)

test('the upload door refuses what the chat box refuses, and says so', opts, async () => {
  const { pool } = db
  await account(pool, 'a@x.y')
  const h = harness(pool)
  assert.equal((await h.upload('a@x.y', 'page.html')).status, 415)
  assert.equal((await h.upload('a@x.y', 'empty.png', new Uint8Array([]))).status, 400)
  assert.equal((await h.upload('a@x.y', 'big.pdf', new Uint8Array(MAX_FILE_BYTES + 1))).status, 413)
  const noStore = harness(pool, { objects: null })
  const res = await noStore.upload('a@x.y', 'logo.png')
  assert.equal(res.status, 503)
  assert.equal((await res.json()).code, 'FILE_STORE_UNAVAILABLE')
  // More than ten files, or a repeated id, is not a question.
  const ids = Array.from({ length: 11 }, () => crypto.randomUUID())
  assert.equal((await h.ask('a@x.y', { message: 'x', attachments: ids })).status, 400)
  const one = crypto.randomUUID()
  assert.equal((await h.ask('a@x.y', { message: 'x', attachments: [one, one] })).status, 400)
})

test('a file never sent is swept with its bytes after a day, on the next upload', opts, async () => {
  const { pool } = db
  await account(pool, 'a@x.y')
  let clock = Date.parse('2026-10-26T00:00:00Z')
  const objects = fakeObjects()
  const h = harness(pool, { objects, now: () => clock })
  const first = (await (await h.upload('a@x.y', 'old.png')).json()).file
  await pool.query('update assistant_attachment set created_at = $2 where id = $1', [
    first.id,
    new Date(clock - LOOSE_TTL_MS - 1000)
  ])
  clock += 1000
  await h.upload('a@x.y', 'new.png')
  const { rows } = await pool.query('select name from assistant_attachment order by created_at')
  assert.deepEqual(
    rows.map((r) => r.name),
    ['new.png']
  )
  assert.equal(objects.store.size, 1)
})

test(
  'a verified first-time user can ask Help and upload before onboarding creates an account',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    const read = await h.get('first@x.y', '/api/assistant/conversation')
    assert.equal(read.status, 200)
    assert.equal(await accountByEmail(pool, 'first@x.y'), null, 'reading never creates an account')
    const answer = await h.ask('first@x.y', { message: 'How do I start?', start: true })
    assert.equal(answer.status, 200)
    await answer.text()
    assert.ok(await accountByEmail(pool, 'first@x.y'))
    const upload = await h.upload('upload-first@x.y', 'logo.png')
    assert.equal(upload.status, 201)
  }
)

test('a retry reuses the stored question and its files, without adding another user turn', opts, async () => {
  const { pool } = db
  const h = harness(pool)
  const file = (await (await h.upload('retry@x.y', 'logo.png')).json()).file
  const first = await h.ask('retry@x.y', { message: 'Use this logo', attachments: [file.id] })
  await first.text()
  const id = String((await pool.query("select id from assistant_turn where role = 'user'")).rows[0].id)
  const again = await h.ask('retry@x.y', {
    message: 'Use this logo',
    attachments: [file.id],
    retryTurnId: id
  })
  assert.equal(again.status, 200)
  await again.text()
  assert.equal(
    Number((await pool.query("select count(*) from assistant_turn where role = 'user'")).rows[0].count),
    1
  )
  assert.equal(
    (await h.ask('foreign@x.y', { message: 'Use this logo', attachments: [file.id], retryTurnId: id }))
      .status,
    409
  )
})

test('failed object deletion keeps the cleanup row and succeeds on a later sweep', opts, async () => {
  const { pool } = db
  const objects = fakeObjects()
  const h = harness(pool, { objects })
  const file = (await (await h.upload('cleanup@x.y', 'logo.png')).json()).file
  const owner = await accountByEmail(pool, 'cleanup@x.y')
  await pool.query("update assistant_attachment set created_at = now() - interval '2 days' where id = $1", [
    file.id
  ])
  assert.equal(await sweepLoose(pool, { delete: async () => false }, owner.id), 0)
  assert.equal((await h.get('cleanup@x.y', file.url)).status, 200)
  assert.equal(await sweepLoose(pool, objects, owner.id), 1)
  assert.equal((await h.get('cleanup@x.y', file.url)).status, 404)
})

test(
  'a file cannot be claimed twice and a renamed executable cannot be an inline picture',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    assert.equal(kindOf('x.constructor'), null)
    assert.equal((await h.upload('format@x.y', 'fake.png', new TextEncoder().encode('<script>'))).status, 415)
    const file = (await (await h.upload('format@x.y', 'logo.png')).json()).file
    const response = await h.ask('format@x.y', { message: 'logo', attachments: [file.id] })
    await response.text()
    const row = (
      await pool.query('select account_id, turn_id from assistant_attachment where id = $1', [file.id])
    ).rows[0]
    await assert.rejects(() => claimFiles(pool, row.account_id, row.turn_id, [file.id]), {
      code: 'ATTACHMENT_NOT_FOUND'
    })
  }
)

test(
  'partial stream then retry keeps both answers linked to the original question for reload',
  opts,
  async () => {
    const { pool } = db
    let attempt = 0
    const h = harness(pool, {
      model: {
        async *stream() {
          yield { model: 'retry-model' }
          yield { text: ++attempt === 1 ? 'Partial' : 'Complete answer' }
          if (attempt === 1) throw new Error('provider disconnected')
        }
      }
    })
    const file = (await (await h.upload('partial@x.y', 'logo.png')).json()).file
    await (await h.ask('partial@x.y', { message: 'Logo', attachments: [file.id] })).text()
    const before = await (await h.get('partial@x.y', `/api/assistant/conversation?session=${SESSION}`)).json()
    const question = before.turns.find((t) => t.role === 'user')
    await (
      await h.ask('partial@x.y', { message: 'Logo', attachments: [file.id], retryTurnId: question.id })
    ).text()
    const after = await (await h.get('partial@x.y', `/api/assistant/conversation?session=${SESSION}`)).json()
    assert.equal(after.turns.filter((t) => t.role === 'user').length, 1)
    assert.equal(after.turns.filter((t) => t.replyToId === question.id).at(-1).text, 'Complete answer')
    assert.equal(after.turns.find((t) => t.id === question.id).files[0].id, file.id)
  }
)

test('a lost response before meta retries by request id and keeps one stored question', opts, async () => {
  const { pool } = db
  const h = harness(pool)
  const file = (await (await h.upload('lost@x.y', 'logo.png')).json()).file
  const body = { message: 'Logo', attachments: [file.id], requestId: crypto.randomUUID() }
  await (await h.ask('lost@x.y', body)).text()
  const retried = await h.ask('lost@x.y', body)
  assert.equal(retried.status, 200)
  await retried.text()
  assert.equal(
    Number((await pool.query("select count(*) from assistant_turn where role = 'user'")).rows[0].count),
    1
  )
})

test(
  'human-held file questions keep raw text and retry keys, including a retry after AI handoff',
  opts,
  async () => {
    const { pool } = db
    const support = createSupport({ pool, cs: { mode: 'webhook', chatId: 'test', staffIds: [] }, api: {} })
    const h = harness(pool, { support })
    const email = 'human-files@x.y'
    const file = (await (await h.upload(email, 'logo.png')).json()).file
    await pool.query("update assistant_conversation set state = 'waiting_human'")
    await pool.query(`insert into assistant_handoff (id, account_id, conversation_id, chat_id)
      select gen_random_uuid(), account_id, id, 'test' from assistant_conversation`)
    const requestId = crypto.randomUUID()
    const input = { message: 'Please use this logo', attachments: [file.id], requestId }
    const first = await h.ask(email, input)
    assert.equal(first.status, 200)
    await first.text()
    const row = (await pool.query("select * from assistant_turn where role = 'user'")).rows[0]
    assert.equal(row.content, input.message)
    assert.equal(row.request_id, requestId)
    for (const retry of [input, { ...input, retryTurnId: String(row.id) }]) {
      const response = await h.ask(email, retry)
      assert.equal(response.status, 200)
      await response.text()
    }
    assert.equal(
      (await pool.query("select count(*)::int as n from assistant_turn where role = 'user'")).rows[0].n,
      1
    )
    const outbox = (await pool.query('select payload from assistant_outbox')).rows
    assert.equal(outbox.length, 1, 'retry never queues the same question twice')
    assert.match(outbox[0].payload.text, /Please use this logo[\s\S]*logo\.png/)
    assert.equal(h.model.calls.length, 0)
    // A question stored while AI held the conversation remains reusable after handoff.
    await pool.query("update assistant_conversation set state = 'ai'")
    const secondFile = (await (await h.upload(email, 'menu.pdf', new Uint8Array([37, 80, 68, 70]))).json())
      .file
    const second = { message: 'Menu', attachments: [secondFile.id], requestId: crypto.randomUUID() }
    await (await h.ask(email, second)).text()
    await pool.query("update assistant_conversation set state = 'waiting_human'")
    assert.equal((await h.ask(email, second)).status, 200)
    assert.equal(
      (await pool.query("select count(*)::int as n from assistant_turn where role = 'user'")).rows[0].n,
      2
    )
  }
)
