/**
 * `discord/store.js` against a real PostgreSQL, after the real migrations (`080-discord-link.sql`):
 * the doors test runs the memory store, so this is the only place the SQL itself runs.
 *
 *   TEST_DATABASE_URL=postgres://… node --test apps/tracy-web/test/discord-store.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readConfig } from '../src/config.js'
import { createPool, migrate } from '../src/db/index.js'
import { discordRoutes } from '../src/discord/route.js'
import { pgDiscordStore } from '../src/discord/store.js'
import { generateCode, hashCode } from '../src/identity/otp.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { signInCodeMail } from '../src/mail/emails.js'

const url = process.env.TEST_DATABASE_URL
const skip = url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
const SECRET = 'discord-store-secret-0123456789abcdef'
const A = `9${String(process.pid).padStart(17, '0')}`
const B = `8${String(process.pid).padStart(17, '0')}`
const THREAD = `7${String(process.pid).padStart(17, '0')}`
const EMAIL = `discord-store-${process.pid}@example.test`
const OTHER_EMAIL = `discord-store-other-${process.pid}@example.test`

async function clean(pool) {
  await pool.query('delete from discord_link_code where discord_id = any($1)', [[A, B]])
  await pool.query('delete from discord_link where discord_id = any($1) or email = any($2)', [
    [A, B],
    [EMAIL, OTHER_EMAIL]
  ])
  await pool.query(`delete from ops_signal where kind like 'discord.%' and data->>'email' = any($1)`, [
    [EMAIL, OTHER_EMAIL]
  ])
  await pool.query(`delete from rate_bucket where bucket like 'discord-member:%' or bucket like $1`, [
    'login-email:discord-store-%'
  ])
}

test('pgDiscordStore: codes, links moving between members, and unlink, after the real migration', {
  skip
}, async () => {
  const pool = createPool(url)
  try {
    await migrate(pool)
    await clean(pool)
    const store = pgDiscordStore(pool)

    await store.putCode({ discordId: A, email: EMAIL, codeHash: 'one', expiresAt: Date.now() + 60_000 })
    assert.equal(await store.bumpAttempts(A), 1)
    assert.equal(await store.bumpAttempts(A), 2)
    await store.putCode({ discordId: A, email: EMAIL, codeHash: 'two', expiresAt: Date.now() + 60_000 })
    const row = await store.takeCode(A)
    assert.equal(row.codeHash, 'two', 'a new code replaces the old one')
    assert.equal(row.email, EMAIL)
    assert.equal(typeof row.expiresAt, 'number')
    assert.equal(await store.bumpAttempts(A), 1, 'and resets its attempts')
    await store.deleteCode(A)
    assert.equal(await store.takeCode(A), null)
    assert.equal(await store.bumpAttempts(A), Number.POSITIVE_INFINITY, 'no code, no attempts left')

    await store.link({ discordId: A, email: EMAIL })
    assert.equal(await store.emailOf(A), EMAIL)
    await store.link({ discordId: B, email: EMAIL })
    assert.equal(await store.emailOf(A), null, 'the address moved to the other member')
    assert.equal(await store.emailOf(B), EMAIL)
    await store.link({ discordId: B, email: OTHER_EMAIL })
    assert.equal(await store.emailOf(B), OTHER_EMAIL, 'a member proving another address moves too')
    const { rows } = await pool.query('select count(*)::int as n from discord_link where discord_id = $1', [
      B
    ])
    assert.equal(rows[0].n, 1)

    await store.unlink(B)
    assert.equal(await store.emailOf(B), null)
  } finally {
    await clean(pool).catch(() => {})
    await pool.end()
  }
})

test('the three doors on PostgreSQL: the round links, a bug report and leaving land in ops_signal', {
  skip
}, async () => {
  const pool = createPool(url)
  try {
    await migrate(pool)
    await clean(pool)
    const config = readConfig({
      TRACY_ORIGIN: 'https://cowork.example',
      SITE_DOMAIN: 'example',
      SESSION_SECRET: 'discord-store-session-secret',
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      DISCORD_LINK_SECRET: SECRET
    })
    const mailbox = []
    const app = discordRoutes({
      config,
      pool,
      store: pgDiscordStore(pool),
      mail: { send: async (m) => void mailbox.push(m), available: true, signInCodeMail },
      otp: { generateCode, hashCode },
      signal: createOpsSignal({ pool, config, log: { warn() {} } })
    })
    const post = (path, body) =>
      app.fetch(
        new Request(`https://cowork.example${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-tracy-discord-secret': SECRET },
          body: JSON.stringify(body)
        })
      )

    assert.equal((await post('/api/discord/link/start', { discordId: A, email: EMAIL })).status, 200)
    const code = mailbox[0].subject.match(/\d{6}/)[0]
    const verified = await post('/api/discord/link/verify', { discordId: A, discordName: 'kray', code })
    assert.equal(verified.status, 200)
    assert.equal((await post('/api/discord/link/verify', { discordId: A, code })).status, 401, 'spent')

    const report = {
      kind: 'bug_report',
      discordId: A,
      discordName: 'kray',
      data: { threadId: THREAD, title: 'Broken save', url: `https://discord.com/channels/1/2/${THREAD}` }
    }
    assert.deepEqual(await (await post('/api/discord/events', report)).json(), { ok: true, linked: true })
    await post('/api/discord/events', report)
    assert.deepEqual(await (await post('/api/discord/events', { kind: 'left', discordId: A })).json(), {
      ok: true,
      linked: true
    })
    assert.deepEqual(await (await post('/api/discord/events', report)).json(), { ok: true, linked: false })

    const signals = (
      await pool.query(
        `select kind, data from ops_signal where kind like 'discord.%' and data->>'email' = $1 order by id`,
        [EMAIL]
      )
    ).rows
    assert.deepEqual(
      signals.map((s) => s.kind),
      ['discord.linked', 'discord.bug_report', 'discord.left'],
      'one bug report per thread, nothing after leaving'
    )
    assert.equal(signals[0].data.discord_id, A)
    assert.equal(signals[0].data.discord_name, 'kray')
    assert.equal(signals[1].data.thread_id, THREAD)
  } finally {
    await clean(pool).catch(() => {})
    await pool.end()
  }
})
