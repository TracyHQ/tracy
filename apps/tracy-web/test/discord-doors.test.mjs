/**
 * The doors Tracy's Discord bot calls (`src/discord/route.js`): a member proves an address with
 * the sign-in letter, and a linked member's posts become `/ops` signals.
 *
 * What is pinned, and why it matters:
 *   - only the bot's secret opens a door, and with none configured the doors do not exist — door 1
 *     mails people, so an open one is a mail cannon;
 *   - the start door answers the same `{ok:true}` whether the address is a customer or not;
 *   - a code is the member's own: another member cannot redeem it, it dies when spent, expired or
 *     guessed at too often;
 *   - an unlinked member's activity records nothing.
 *
 *   node --test apps/tracy-web/test/discord-doors.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { createOpsSignal, signalText } from '../src/lib/ops-signal.js'
import { DISCORD_MAIL_LIMIT_PER_MEMBER_PER_HOUR, MAX_ATTEMPTS } from '../src/lib/policy.js'

const SECRET = 'discord-doors-secret-0123456789abcdef'
const MEMBER = '123456789012345678'
const OTHER = '876543210987654321'
const THREAD = '111122223333444455'
const ENV = {
  TRACY_ORIGIN: 'https://cowork.example',
  SITE_DOMAIN: 'example',
  SESSION_SECRET: 'discord-doors-session-secret',
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  DISCORD_LINK_SECRET: SECRET
}

function makeApp({ env = {}, now = null, fetchImpl = null } = {}) {
  const mailbox = []
  const config = readConfig({ ...ENV, ...env })
  const signal = createOpsSignal({ pool: null, config, log: { warn() {} } })
  const app = buildApp({
    config,
    identity: memoryIdentityStore(),
    mail: { send: async (message) => void mailbox.push(message) },
    signal,
    ...(now ? { now } : {}),
    ...(fetchImpl ? { fetchImpl } : {})
  })
  return { app, mailbox, events: signal.events }
}

const post = (app, path, body, secret = SECRET) =>
  app.fetch(
    new Request(`https://cowork.example${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-tracy-discord-secret': secret } : {})
      },
      body: JSON.stringify(body)
    })
  )
const start = (app, email = 'Lee@Example.com', discordId = MEMBER) =>
  post(app, '/api/discord/link/start', { discordId, email })
const verify = (app, code, discordId = MEMBER) => post(app, '/api/discord/link/verify', { discordId, code })
const codeIn = (message) => message.subject.match(/\d{6}/)[0]
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')

test('no secret configured: every door answers 404', async () => {
  const { app, mailbox } = makeApp({ env: { DISCORD_LINK_SECRET: '' } })
  for (const path of ['/api/discord/link/start', '/api/discord/link/verify', '/api/discord/events'])
    assert.equal((await post(app, path, { discordId: MEMBER, email: 'a@b.co' })).status, 404)
  assert.equal(mailbox.length, 0)
})

test('a missing or wrong secret is 404, and nothing is mailed', async () => {
  const { app, mailbox } = makeApp()
  assert.equal(
    (await post(app, '/api/discord/link/start', { discordId: MEMBER, email: 'a@b.co' }, null)).status,
    404
  )
  assert.equal(
    (await post(app, '/api/discord/link/start', { discordId: MEMBER, email: 'a@b.co' }, 'x'.repeat(40)))
      .status,
    404
  )
  assert.equal(mailbox.length, 0)
})

test('a short secret is refused when the config is read', () => {
  assert.throws(() => readConfig({ ...ENV, DISCORD_LINK_SECRET: 'short' }), /DISCORD_LINK_SECRET/)
})

test('malformed input is 400', async () => {
  const { app } = makeApp()
  assert.equal((await start(app, 'not-an-address')).status, 400)
  assert.equal((await start(app, 'a@b.co', 'abc')).status, 400)
  assert.equal((await verify(app, '12345')).status, 400)
  assert.equal((await post(app, '/api/discord/events', { kind: 'nope', discordId: MEMBER })).status, 400)
})

test('the round: the code mailed to the address links the member and records discord.linked', async () => {
  const { app, mailbox, events } = makeApp()
  const started = await start(app)
  assert.equal(started.status, 200)
  assert.deepEqual(await started.json(), { ok: true })
  assert.equal(mailbox.length, 1)
  assert.equal(mailbox[0].to, 'lee@example.com')
  const code = codeIn(mailbox[0])

  assert.equal((await verify(app, wrong(code))).status, 401)
  assert.equal((await verify(app, code, OTHER)).status, 401, 'another member cannot redeem it')
  const done = await verify(app, code)
  assert.equal(done.status, 200)
  assert.deepEqual(await done.json(), { ok: true })
  assert.equal((await verify(app, code)).status, 401, 'a code is spent once used')

  const linked = events.filter((e) => e.kind === 'discord.linked')
  assert.equal(linked.length, 1)
  assert.equal(linked[0].data.email, 'lee@example.com')
  assert.equal(linked[0].data.discord_id, MEMBER)
})

test('an expired code is refused', async () => {
  let clock = Date.parse('2026-10-08T03:00:00Z')
  const { app, mailbox } = makeApp({ now: () => clock })
  await start(app)
  clock += 11 * 60_000
  assert.equal((await verify(app, codeIn(mailbox[0]))).status, 401)
})

test('too many wrong guesses spend the code', async () => {
  const { app, mailbox } = makeApp()
  await start(app)
  const code = codeIn(mailbox[0])
  for (let i = 0; i < MAX_ATTEMPTS; i++) assert.equal((await verify(app, wrong(code))).status, 401)
  assert.equal((await verify(app, code)).status, 401)
})

test('one member cannot ask for more than its hourly codes', async () => {
  const { app, mailbox } = makeApp()
  for (let i = 0; i < DISCORD_MAIL_LIMIT_PER_MEMBER_PER_HOUR; i++)
    assert.equal((await start(app, `p${i}@example.com`)).status, 200)
  assert.equal((await start(app, 'one-more@example.com')).status, 429)
  assert.equal(mailbox.length, DISCORD_MAIL_LIMIT_PER_MEMBER_PER_HOUR)
})

test('legacy beta gate on: a non-member receives a code and can link Discord', async () => {
  let membershipCalls = 0
  const fetchImpl = async () => {
    membershipCalls++
    return Response.json({ ok: true, user_id: 0, subscriptions: {} })
  }
  const { app, mailbox } = makeApp({
    env: { BETA_GATE: 'on', AMEMBER_API_KEY: 'dedicated-test-key' },
    fetchImpl
  })
  const answer = await start(app, 'stranger@example.com')
  assert.equal(answer.status, 200)
  assert.deepEqual(await answer.json(), { ok: true })
  assert.equal(mailbox.length, 1)
  assert.equal(mailbox[0].to, 'stranger@example.com')
  assert.equal(membershipCalls, 0)
  assert.equal((await verify(app, codeIn(mailbox[0]))).status, 200)
})

test('beta gate on: a paying JoomlArt member is mailed the code', async () => {
  // Plan 10 (JA Template) is a paid plan; 18 would not do, `parseAccess` excludes it.
  const fetchImpl = async () => Response.json({ ok: true, user_id: 12, subscriptions: { 10: '2099-12-31' } })
  const { app, mailbox } = makeApp({
    env: { BETA_GATE: 'on', AMEMBER_API_KEY: 'dedicated-test-key' },
    fetchImpl
  })
  assert.equal((await start(app, 'member@example.com')).status, 200)
  assert.equal(mailbox.length, 1)
  assert.equal(mailbox[0].to, 'member@example.com')
})

test("events: nothing for an unlinked member; a linked member's bug report is recorded once", async () => {
  const { app, mailbox, events } = makeApp()
  const report = {
    kind: 'bug_report',
    discordId: MEMBER,
    data: {
      threadId: THREAD,
      title: 'Save button does nothing',
      url: `https://discord.com/channels/1/2/${THREAD}`
    }
  }
  const before = await post(app, '/api/discord/events', report)
  assert.deepEqual(await before.json(), { ok: true, linked: false })
  assert.equal(events.filter((e) => e.kind.startsWith('discord.')).length, 0)

  await start(app)
  await verify(app, codeIn(mailbox[0]))
  assert.deepEqual(await (await post(app, '/api/discord/events', report)).json(), { ok: true, linked: true })
  await post(app, '/api/discord/events', report)
  const bugs = events.filter((e) => e.kind === 'discord.bug_report')
  assert.equal(bugs.length, 1, 'one thread, one signal')
  assert.equal(bugs[0].data.email, 'lee@example.com')
  assert.equal(bugs[0].data.title, 'Save button does nothing')
  assert.equal(bugs[0].data.url, report.data.url)

  await post(app, '/api/discord/events', {
    ...report,
    data: { threadId: '999988887777666655', title: 'x', url: 'https://evil.example/' }
  })
  assert.equal(
    events.filter((e) => e.kind === 'discord.bug_report')[1].data.url,
    undefined,
    'only discord.com links'
  )

  await post(app, '/api/discord/events', { kind: 'left', discordId: MEMBER })
  assert.equal(events.filter((e) => e.kind === 'discord.left').length, 1)
})

test('proving the same address from another Discord account moves the link', async () => {
  const { app, mailbox } = makeApp()
  await start(app)
  await verify(app, codeIn(mailbox[0]))
  await start(app, 'lee@example.com', OTHER)
  await verify(app, codeIn(mailbox[1]), OTHER)
  const old = await post(app, '/api/discord/events', { kind: 'left', discordId: MEMBER })
  assert.deepEqual(await old.json(), { ok: true, linked: false })
  const moved = await post(app, '/api/discord/events', { kind: 'left', discordId: OTHER })
  assert.deepEqual(await moved.json(), { ok: true, linked: true })
})

test('the Discord username rides beside the id on every signal, cut at 32 characters, and is optional', async () => {
  const { app, mailbox, events } = makeApp()
  await start(app)
  await post(app, '/api/discord/link/verify', {
    discordId: MEMBER,
    discordName: '0x_krayz',
    code: codeIn(mailbox[0])
  })
  const linked = events.find((e) => e.kind === 'discord.linked')
  assert.equal(linked.data.discord_name, '0x_krayz')
  assert.equal(linked.data.discord_id, MEMBER)
  assert.match(signalText(linked, 'dev'), /Discord user: 0x_krayz \(\d+\)/)

  await post(app, '/api/discord/events', {
    kind: 'bug_report',
    discordId: MEMBER,
    discordName: 'x'.repeat(40),
    data: { threadId: THREAD, title: 'Broken', url: `https://discord.com/channels/1/2/${THREAD}` }
  })
  const bug = events.find((e) => e.kind === 'discord.bug_report')
  assert.equal(bug.data.discord_name, 'x'.repeat(32))
  assert.match(signalText(bug, 'dev'), /Discord: x{32} \(\d+\)/)

  await post(app, '/api/discord/events', { kind: 'left', discordId: MEMBER })
  const left = events.find((e) => e.kind === 'discord.left')
  assert.equal(left.data.discord_name, undefined, 'no name sent, none recorded')
})
