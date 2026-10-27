// One-click unsubscribe (spam hints C1-B, Akemi 05/10/2026): every notification email carries
// `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058). The one-click POST turns off the EMAIL
// switch of that letter's group only; the Inbox stays on and every other group is untouched. The
// link is a signed token naming the account and the group, never the address; a forged, tampered or
// expired one changes nothing. The locked join-request group carries no header and refuses a token.
// A GET (a mail client opening the link, a scanner) changes nothing by itself. Sign-in mail carries
// no header: it is not a notification.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { mintUnsubscribeToken } from '../src/lib/unsubscribe-token.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const ONE_CLICK = 'List-Unsubscribe=One-Click'

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function world(_t) {
  const { pool } = db
  const config = readConfig(env)
  const sent = []
  const app = buildApp({ config, pool, mail: { send: async (m) => sent.push(m) } })
  const account = async (email) =>
    (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
  const mention = (recipient, actor) =>
    app.notifier.notify({
      recipients: [recipient],
      kind: 'comment.mention',
      siteKey: 'kinetic.vn',
      actor,
      data: { commentId: 'c1', quote: 'Look here', page: '/' }
    })
  /** Gmail's one-click: a server-side POST to the header's URL, form body, no cookie, no Origin. */
  const oneClick = (link, body = ONE_CLICK) =>
    app.fetch(
      new Request(link, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body
      })
    )
  const prefs = async (accountId) =>
    Object.fromEntries(
      (
        await pool.query('select group_id, inbox, email from notification_preference where account_id = $1', [
          accountId
        ])
      ).rows.map((r) => [r.group_id, { inbox: r.inbox, email: r.email }])
    )
  return { pool, config, app, sent, account, mention, oneClick, prefs }
}

/** The `<…>` URL of a List-Unsubscribe header. */
const linkOf = (mail) => mail.headers?.['List-Unsubscribe']?.match(/^<(https?:\/\/[^>]+)>$/)?.[1]

test('a notification mail carries the one-click headers, and the token names no address', opts, async (t) => {
  const w = await world(t)
  const lee = await w.account('lee@lab3.example')
  const akemi = await w.account('akemi@lab3.example')
  await w.mention(akemi, lee)
  assert.equal(w.sent.length, 1)
  const [mail] = w.sent
  const link = linkOf(mail)
  assert.ok(link, 'List-Unsubscribe names one https URL')
  assert.match(link, /^http:\/\/tracy\.test\/api\/notifications\/unsubscribe\?t=[\w.-]+$/)
  assert.equal(mail.headers['List-Unsubscribe-Post'], ONE_CLICK)
  const token = new URL(link).searchParams.get('t')
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  assert.ok(!JSON.stringify(claims).includes('@'), 'no address in the token')
  assert.equal(claims.g, 'mentions-replies')
  // D3-A: the letter also says the same thing is in the Inbox.
  assert.ok(mail.html.includes('You can also find this in your Inbox in Tracy.'))
})

test('one click turns off that group’s email only, and stays idempotent', opts, async (t) => {
  const w = await world(t)
  const lee = await w.account('lee@lab3.example')
  const akemi = await w.account('akemi@lab3.example')
  await w.mention(akemi, lee)
  const link = linkOf(w.sent[0])

  const first = await w.oneClick(link)
  assert.equal(first.status, 200)
  assert.ok((await first.text()).includes('You are unsubscribed'))
  assert.deepEqual(await w.prefs(akemi), { 'mentions-replies': { inbox: true, email: false } })

  const again = await w.oneClick(link)
  assert.equal(again.status, 200, 'a second click is not an error')
  assert.deepEqual(await w.prefs(akemi), { 'mentions-replies': { inbox: true, email: false } })

  // The next mention still reaches the Inbox, and no email goes.
  await w.mention(akemi, lee)
  assert.equal(w.sent.length, 1)
  const { rows } = await w.pool.query(
    "select in_inbox from notification where account_id = $1 and kind = 'comment.mention'",
    [akemi]
  )
  assert.deepEqual(
    rows.map((r) => r.in_inbox),
    [true, true]
  )
})

test(
  'a signed-in browser of someone else gets the same answer: the token decides, not the cookie',
  opts,
  async (t) => {
    const w = await world(t)
    const lee = await w.account('lee@lab3.example')
    const akemi = await w.account('akemi@lab3.example')
    await w.mention(akemi, lee)
    const link = linkOf(w.sent[0])
    const { mintSession } = await import('../src/lib/session.js')
    const res = await w.app.fetch(
      new Request(link, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: `tracy_sess=${await mintSession('lee@lab3.example', w.config.sessionSecret)}`,
          'sec-fetch-site': 'cross-site'
        },
        body: ONE_CLICK
      })
    )
    assert.equal(res.status, 200)
    assert.deepEqual(await w.prefs(akemi), { 'mentions-replies': { inbox: true, email: false } })
    assert.deepEqual(await w.prefs(lee), {}, 'the cookie holder’s own settings are untouched')
  }
)

test('opening the link (GET) changes nothing by itself and offers the one-click form', opts, async (t) => {
  const w = await world(t)
  const lee = await w.account('lee@lab3.example')
  const akemi = await w.account('akemi@lab3.example')
  await w.mention(akemi, lee)
  const link = linkOf(w.sent[0])
  const res = await w.app.fetch(new Request(link))
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes('method="post"'))
  assert.ok(html.includes(new URL(link).search.replace('?', '?').slice(1)), 'the form posts the same token')
  assert.deepEqual(await w.prefs(akemi), {})
})

test('a forged, tampered, expired or locked-group token changes nothing', opts, async (t) => {
  const w = await world(t)
  const akemi = await w.account('akemi@lab3.example')
  const secret = w.config.sessionSecret
  const base = 'http://tracy.test/api/notifications/unsubscribe?t='
  const good = await mintUnsubscribeToken({ accountId: akemi, groupId: 'teammates', secret })
  const [p, payload, sig] = good.split('.')
  const otherPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), g: 'about-you' })
  ).toString('base64url')
  const tokens = [
    'nope',
    `${p}.${otherPayload}.${sig}`,
    await mintUnsubscribeToken({ accountId: akemi, groupId: 'teammates', secret: 'x'.repeat(32) }),
    await mintUnsubscribeToken({
      accountId: akemi,
      groupId: 'teammates',
      secret,
      now: Date.now() - 400 * 86_400_000
    }),
    await mintUnsubscribeToken({ accountId: akemi, groupId: 'join-requests', secret }),
    await mintUnsubscribeToken({ accountId: akemi, groupId: 'no-such-group', secret })
  ]
  for (const token of tokens) {
    const res = await w.oneClick(base + encodeURIComponent(token))
    assert.equal(res.status, 400, `refused: ${token.slice(0, 24)}`)
  }
  const missing = await w.oneClick('http://tracy.test/api/notifications/unsubscribe')
  assert.equal(missing.status, 400)
  assert.deepEqual(await w.prefs(akemi), {})
})

test('the locked join-request letters carry no one-click header', opts, async (t) => {
  const w = await world(t)
  const lee = await w.account('lee@lab3.example')
  const akemi = await w.account('akemi@lab3.example')
  await w.pool.query("insert into site (site_key, label, host) values ('kinetic.vn', 'kinetic', 'local')")
  await w.app.notifier.notify({
    recipients: [akemi],
    kind: 'team.join_request',
    siteKey: 'kinetic.vn',
    actor: lee,
    data: { role: 'editor' }
  })
  for (const mail of w.sent) assert.equal(mail.headers?.['List-Unsubscribe'], undefined)
})

test('the sign-in code mail carries no one-click header', async () => {
  const sent = []
  const app = buildApp({
    config: readConfig(env),
    identity: memoryIdentityStore(),
    mail: { send: async (m) => sent.push(m) },
    now: () => 1_700_000_000_000
  })
  await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ceo@tracy.ai' })
    })
  )
  assert.equal(sent.length, 1)
  assert.equal(sent[0].headers, undefined)
})

test('the Resend transport hands the one-click headers on, and nothing when there are none', async () => {
  const { resendTransport } = await import('../src/mail/transport.js')
  const bodies = []
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return new Response('{}', { status: 200 })
  }
  const mail = resendTransport({ key: 'k', from: 'Tracy <noreply@tracy.ai>', fetchImpl })
  const headers = { 'List-Unsubscribe': '<https://x.test/u?t=1>', 'List-Unsubscribe-Post': ONE_CLICK }
  await mail.send({ to: 'a@b.test', subject: 's', text: 't', headers })
  await mail.send({ to: 'a@b.test', subject: 's', text: 't' })
  assert.deepEqual(bodies[0].headers, headers)
  assert.equal('headers' in bodies[1], false)
})

test(
  'the invitation unsubscribe doors are mounted and pass the cross-site guard without a session',
  opts,
  async (t) => {
    const { app } = await world(t)
    const token = 'x'.repeat(43)
    const page = await app.fetch(new Request(`http://tracy.test/invitations/unsubscribe/${token}`))
    assert.equal(page.status, 200)
    assert.match(await page.text(), /unsubscribe-form/)
    // Gmail's one-click: no cookie, no Origin. An unknown token is "not found", never `CSRF_ORIGIN`.
    const click = await app.fetch(
      new Request(`http://tracy.test/invitations/one-click/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: ONE_CLICK
      })
    )
    assert.equal(click.status, 404)
    assert.equal(await click.text(), 'Not found')
  }
)

test('the invitation open image is mounted, public and sets no cookie', opts, async (t) => {
  const { app } = await world(t)
  const res = await app.fetch(new Request(`http://tracy.test/o/${'x'.repeat(43)}.gif`))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/gif')
  assert.equal(res.headers.get('set-cookie'), null)
})
