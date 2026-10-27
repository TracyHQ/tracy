import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Hono } from 'hono'
import { withRealDb } from './_invitations-real.mjs'
import { contentCampaign, contentZip } from './_invitations-real-content.mjs'
import { GMAIL_SCOPES, invitationsGmailRoutes } from '../src/invitations/gmail.js'
import { readRealRecipient, updateRealCampaignSettings } from '../src/invitations/real-import.js'
import {
  approveRealDraft,
  generateRealDrafts,
  previewRealTemplate,
  saveRealTemplate
} from '../src/invitations/real-content.js'
import {
  listCampaignSends,
  listRecipientSends,
  readSendingStatus,
  reconcileRealSend,
  sendRealInvitation,
  sendRealTest,
  sweepRealSends,
  unsubscribeByToken
} from '../src/invitations/real-send.js'
import { invitationsUnsubscribeRoutes } from '../src/invitations/real-unsubscribe.js'
import { buildMessage, encodeHeader } from '../src/invitations/real-mime.js'
const opts = { skip: !process.env.TEST_DATABASE_URL }
const origin = 'http://localhost:8080'
const TO = 'tester@fixture.test'
const gmailConfig = {
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  keyId: 'fixture-key-1',
  key: Buffer.alloc(32, 7).toString('base64'),
  address: 'sender@example.com'
}
const config = (over = {}) => ({
  origin,
  secure: false,
  invitationsGmail: gmailConfig,
  invitationsReal: { enabled: true },
  invitationsSending: {
    mode: 'test',
    testRecipients: [TO, 'other@fixture.test'],
    testDailyLimit: 50,
    ...over
  }
})

/** A fake Google: OAuth, send and search, counting every send. `send` decides each send's answer. */
function google({
  send = () => Response.json({ id: 'gmail-1', threadId: 'thread-1' }),
  search = () => []
} = {}) {
  const calls = { send: 0, search: 0, raws: [] }
  const fetcher = async (url, init) => {
    const u = String(url)
    if (u.endsWith('/token'))
      return Response.json({
        access_token: 'fixture-access',
        refresh_token: 'fixture-refresh',
        scope: GMAIL_SCOPES.join(' ')
      })
    if (u.endsWith('/profile')) return Response.json({ emailAddress: 'sender@example.com' })
    if (u.endsWith('/messages/send')) {
      calls.send++
      calls.raws.push(Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8'))
      return send(calls.send)
    }
    if (u.includes('/messages?')) {
      calls.search++
      return Response.json({ messages: search(calls.search) })
    }
    throw new Error(`unexpected provider request ${u}`)
  }
  return { fetcher, calls }
}

/** Connect the mailbox through the real OAuth doors, as an owner would. */
async function connect(pool, fetcher) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('invitationsActor', { email: 'owner@fixture.test', role: 'owner' })
    await next()
  })
  app.route('/gmail', invitationsGmailRoutes({ pool, config: config(), fetcher }))
  const session = 'tracy_sess=fixture-signed-session'
  const begun = await app.fetch(
    new Request(`${origin}/gmail/connect`, { method: 'POST', headers: { cookie: session, origin } })
  )
  const state = new URL((await begun.json()).authorizationUrl).searchParams.get('state')
  const done = await app.fetch(
    new Request(`${origin}/gmail/callback?state=${state}&code=fixture-code`, {
      redirect: 'manual',
      headers: { cookie: `${session}; tracy_invitations_gmail_state=${state}` }
    })
  )
  assert.equal(done.headers.get('location'), '/ops/invitations?gmail=connected')
}

/** A campaign with one approved draft (with an image) ready to send. */
async function approvedDraft({ pool, keys, html = undefined }) {
  const c = await contentCampaign({ pool, keys, total: 3 })
  const p = await previewRealTemplate({
    ...c,
    group: 'group_1',
    subject: 'Xin chào {{first_name}}',
    zipBytes: await contentZip(html ? { html } : {}),
    requestKey: randomUUID()
  })
  c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
  c.revision = (
    await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
  ).revision
  const rid = (await pool.query('select recipient_id from invitations_real_draft limit 1')).rows[0]
    .recipient_id
  const d = await readRealRecipient({ ...c, recipientId: rid })
  c.revision = (await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })).revision
  const approved = await readRealRecipient({ ...c, recipientId: rid })
  assert.equal(approved.draft.contentApproved, true)
  return { c, rid, draftRevision: approved.draft.revision }
}
const send = (deps, c, rid, draftRevision, { config: sendingOver, ...over } = {}) =>
  sendRealTest({
    pool: deps.pool,
    keys: deps.keys,
    config: config(sendingOver),
    campaignId: c.campaignId,
    actorId: c.actorId,
    recipientId: rid,
    to: TO,
    requestKey: randomUUID(),
    draftRevision,
    fetcher: deps.fetcher,
    ...over
  })

test('the message is UTF-8 safe, carries managed images inline and refuses header injection', () => {
  const raw = buildMessage({
    from: { name: 'Brian', address: 'sender@example.com' },
    to: TO,
    subject: '[Test] Xin chào Đặng',
    html: '<p>Hi</p><img src="images/logo.png" alt="Logo">',
    text: 'Hi',
    messageId: 'abc@cowork.tracy.site',
    date: new Date('2026-10-12T00:00:00Z'),
    images: [{ path: 'images/logo.png', mediaType: 'image/png', bytes: Buffer.from('png'), cid: 'img-1@x' }]
  })
  assert.match(raw, /^From: Brian <sender@example\.com>\r\n/m)
  assert.match(raw, /^Subject: =\?UTF-8\?B\?/m)
  assert.match(raw, /^Message-ID: <abc@cowork\.tracy\.site>\r$/m)
  assert.match(raw, /Content-ID: <img-1@x>/)
  const html = Buffer.from(
    raw
      .split('text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1]
      .split('\r\n--')[0]
      .replace(/\r\n/g, ''),
    'base64'
  ).toString()
  assert.ok(html.includes('src="cid:img-1@x"'))
  assert.throws(() => encodeHeader('a\r\nBcc: x@y.z'))
  assert.throws(() =>
    buildMessage({
      from: { name: 'B', address: 'sender@example.com' },
      to: 'x@y.z\r\nBcc: a@b.c',
      subject: 's',
      html: '',
      text: '',
      messageId: 'a@b'
    })
  )
})

test(
  'a test send goes to an allowed address once, is ledgered before the call, and a repeat changes nothing',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher }
      const requestKey = randomUUID()
      const sent = await send(deps, c, rid, draftRevision, { requestKey })
      assert.equal(sent.state, 'sent')
      assert.equal(sent.to, TO)
      assert.equal(sent.subject, '[Test] Xin chào there')
      assert.equal(g.calls.send, 1)
      const raw = g.calls.raws[0]
      assert.match(raw, /^From: Sarah <sender@example\.com>/m)
      assert.match(raw, new RegExp(`^To: ${TO}`, 'm'))
      assert.match(raw, /Content-ID: </)
      assert.match(raw, /^X-Tracy-Test: yes/m)
      // The same click again (double click, reload) answers the first row and sends nothing.
      const again = await send(deps, c, rid, draftRevision, { requestKey })
      assert.equal(again.id, sent.id)
      assert.equal(g.calls.send, 1)
      await assert.rejects(
        () => send(deps, c, rid, draftRevision, { requestKey, to: 'other@fixture.test' }),
        {
          code: 'REAL_REQUEST_KEY_REUSED'
        }
      )
      const listed = await listRecipientSends({ pool, keys, campaignId: c.campaignId, recipientId: rid })
      assert.equal(listed.items.length, 1)
      const row = (await pool.query('select payload::text p from invitations_real_send')).rows[0]
      assert.ok(!row.p.includes(TO), 'the address is sealed, not stored in clear')
    })
)

test(
  'only the server-held list, only approved drafts, only a usable mailbox, only within the daily cap',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher }
      await assert.rejects(() => send(deps, c, rid, draftRevision), { code: 'REAL_MAILBOX_NOT_READY' })
      await connect(pool, g.fetcher)
      await assert.rejects(() => send(deps, c, rid, draftRevision, { config: { mode: 'off' } }), {
        code: 'REAL_SENDING_OFF'
      })
      await assert.rejects(() => send(deps, c, rid, draftRevision, { to: 'customer@example.com' }), {
        code: 'REAL_SEND_NOT_ALLOWED'
      })
      await assert.rejects(() => send(deps, c, rid, draftRevision + 1), { code: 'REAL_STALE_DRAFT' })
      const other = (
        await pool.query('select recipient_id from invitations_real_draft where recipient_id<>$1 limit 1', [
          rid
        ])
      ).rows[0]?.recipient_id
      if (other) {
        const d = await readRealRecipient({ ...c, recipientId: other })
        await assert.rejects(() => send(deps, c, other, d.draft.revision), { code: 'REAL_NOT_APPROVED' })
      }
      await send(deps, c, rid, draftRevision, { config: { testDailyLimit: 1 } })
      await assert.rejects(() => send(deps, c, rid, draftRevision, { config: { testDailyLimit: 1 } }), {
        code: 'REAL_SEND_QUOTA'
      })
      assert.equal(g.calls.send, 1)
      const status = await readSendingStatus({ pool, config: config() })
      assert.deepEqual([status.mode, status.testUsed, status.customersEnabled], ['test', 1, false])
    })
)

test('no answer means unknown, never a second send; reconcile by Message-ID settles it', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    let found = []
    const g = google({
      send: () => {
        throw new Error('socket hang up')
      },
      search: () => found
    })
    await connect(pool, g.fetcher)
    const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
    const deps = { pool, keys, fetcher: g.fetcher }
    const unknown = await send(deps, c, rid, draftRevision)
    assert.equal(unknown.state, 'send_unknown')
    assert.equal(g.calls.send, 1)
    const input = {
      pool,
      keys,
      config: config(),
      campaignId: c.campaignId,
      sendId: unknown.id,
      fetcher: g.fetcher
    }
    let r = await reconcileRealSend(input)
    assert.equal(r.state, 'send_unknown', 'not found yet proves nothing')
    assert.equal(r.reconcileAttempts, 1)
    found = [{ id: 'gmail-9', threadId: 'thread-9' }]
    r = await reconcileRealSend(input)
    assert.equal(r.state, 'sent')
    assert.equal(r.gmailMessageId, 'gmail-9')
    assert.equal(g.calls.send, 1, 'reconcile only reads')
  })
)

test(
  'a refusal is failed and frees the cap; a row a stopped process left in sending becomes unknown',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google({
        send: () =>
          Response.json(
            { error: { status: 'RESOURCE_EXHAUSTED', errors: [{ reason: 'rateLimitExceeded' }] } },
            { status: 429 }
          )
      })
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher }
      const failed = await send(deps, c, rid, draftRevision)
      assert.deepEqual([failed.state, failed.errorCode], ['failed', 'SEND_RATE_LIMITED'])
      assert.equal((await readSendingStatus({ pool, config: config() })).testUsed, 0)
      await pool.query("update invitations_real_send set state='sending',error_code=null")
      const swept = await sweepRealSends({ pool, keys, config: config(), fetcher: g.fetcher })
      assert.equal(swept.recovered, 1)
      const row = (await pool.query('select state,error_code from invitations_real_send')).rows[0]
      assert.equal(row.state, 'send_unknown')
      assert.equal(g.calls.send, 1, 'recovery never sends')
    })
)

test(
  'two sends at once: one holds the mailbox, the other is told to wait and sends nothing',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      let release
      const gate = new Promise((r) => {
        release = r
      })
      const g = google({
        send: async () => {
          await gate
          return Response.json({ id: 'gmail-1', threadId: 'thread-1' })
        }
      })
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher }
      const first = send(deps, c, rid, draftRevision)
      while (!g.calls.send) await new Promise((r) => setTimeout(r, 5))
      await assert.rejects(() => send(deps, c, rid, draftRevision), { code: 'REAL_SEND_BUSY' })
      release()
      assert.equal((await first).state, 'sent')
      assert.equal(g.calls.send, 1)
    })
)

test(
  'over HTTP: the doors exist for owners only, sending reads off by default, and no customer door opens',
  opts,
  async () => {
    const { realOps } = await import('./_invitations-real-ops.mjs')
    return withRealDb(async (deps) => {
      const h = await realOps(deps)
      const c = await contentCampaign(deps)
      const status = await (await h.request('/sending')).json()
      assert.deepEqual([status.mode, status.customersEnabled, status.testRecipients], ['off', false, []])
      assert.equal((await h.request('/sending', { role: 'developer' })).status, 403)
      const refused = await h.request(
        `/campaigns/${c.campaignId}/recipients/${c.recipients[0].id}/send-test`,
        {
          method: 'POST',
          body: { to: 'customer@example.com', requestKey: randomUUID(), draftRevision: 1 }
        }
      )
      assert.equal(refused.status, 403)
      assert.equal((await refused.json()).code, 'REAL_SENDING_OFF')
      for (const path of ['/send', '/simulate', '/recipients/x/send'])
        assert.equal(
          (await h.request(`/campaigns/${c.campaignId}${path}`, { method: 'POST', body: {} })).status,
          404
        )
      assert.deepEqual(h.outbound, [])
    })
  }
)

test(
  'over HTTP: Email format saves every field it has, including clickTracking, and refuses others',
  opts,
  async () => {
    const { realOps } = await import('./_invitations-real-ops.mjs')
    const { MAIL_FORMAT_DEFAULT } = await import('../src/invitations/real-mail-format.js')
    return withRealDb(async (deps) => {
      const h = await realOps(deps)
      const current = await (await h.request('/mail-format')).json()
      assert.deepEqual(Object.keys(current).sort(), Object.keys(MAIL_FORMAT_DEFAULT).sort())
      const next = { ...current, clickTracking: true, openImage: false }
      const saved = await h.request('/mail-format', { method: 'POST', body: next })
      assert.equal(saved.status, 200)
      assert.deepEqual(await saved.json(), next)
      assert.deepEqual(await (await h.request('/mail-format')).json(), next)
      const extra = await h.request('/mail-format', { method: 'POST', body: { ...next, other: true } })
      assert.equal(extra.status, 400)
    })
  }
)

const pilot = (over = {}) => ({
  ...config({
    mode: 'pilot',
    pilotMax: 2,
    pacingSeconds: 180,
    ...over
  }),
  beta: { apiKey: 'fixture-amember', apiUrl: 'https://amember.fixture.test/api/check-access/by-email' }
})
/** aMember: `answer(email)` is the JSON body; counts calls. */
function amember(answer = () => ({ ok: true, user_id: 7, subscriptions: { 10: '2099-01-01' } })) {
  const calls = []
  return {
    calls,
    fetcher: async (url) => {
      const email = new URL(url).searchParams.get('email')
      calls.push(email)
      return Response.json(answer(email))
    }
  }
}
const invite = (deps, c, rid, draftRevision, { config: cfg = pilot(), ...over } = {}) =>
  sendRealInvitation({
    pool: deps.pool,
    keys: deps.keys,
    config: cfg,
    campaignId: c.campaignId,
    actorId: c.actorId,
    recipientId: rid,
    requestKey: randomUUID(),
    draftRevision,
    fetcher: deps.fetcher,
    memberFetcher: deps.member.fetcher,
    ...over
  })
const decodeParts = (raw) =>
  raw
    .split(/Content-Transfer-Encoding: base64\r\n\r\n/)
    .slice(1)
    .map((part) => Buffer.from(part.split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString())
    .join('\n')

test(
  "a pilot invitation goes to the customer's own address after aMember says yes, with a live unsubscribe",
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const member = amember()
      const deps = { pool, keys, fetcher: g.fetcher, member }
      const email = (await readRealRecipient({ ...c, recipientId: rid })).email
      await assert.rejects(invite(deps, c, rid, draftRevision, { config: config() }), {
        code: 'REAL_PILOT_OFF'
      })
      const sent = await invite(deps, c, rid, draftRevision)
      assert.equal(sent.state, 'sent')
      assert.equal(sent.kind, 'invitation')
      assert.equal(sent.to, email)
      assert.deepEqual(member.calls, [email])
      const raw = g.calls.raws[0]
      assert.ok(raw.includes(`To: ${email}`))
      assert.doesNotMatch(raw, /X-Tracy-Test/)
      const token =
        /List-Unsubscribe: <http:\/\/localhost:8080\/invitations\/one-click\/([A-Za-z0-9_-]{43})>/.exec(
          raw
        )?.[1]
      assert.ok(token)
      assert.match(raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/)
      const body = decodeParts(raw)
      assert.ok(body.includes(`/invitations/unsubscribe/${token}`))
      assert.ok(body.includes('You received this email because you signed up on our website'))
      assert.doesNotMatch(body, /Unsubscribe will be available/)
      // Once per customer, and pacing holds the next one.
      await assert.rejects(invite(deps, c, rid, draftRevision), { code: 'REAL_ALREADY_INVITED' })
      const status = await readSendingStatus({ pool, config: pilot() })
      assert.equal(status.pilotUsed, 1)
      assert.equal(status.pilotMax, 2)
      assert.ok(status.nextInvitationAt)
      assert.equal(status.customersEnabled, true)
      // The token suppresses that address in this campaign; a test to it still works, a second
      // invitation never does.
      const app = invitationsUnsubscribeRoutes({ pool, keys })
      const page = await app.fetch(new Request(`${origin}/invitations/unsubscribe/${token}`))
      assert.equal(page.status, 200)
      assert.match(await page.text(), /unsubscribe-form/)
      assert.equal(
        (await pool.query('select count(*)::int n from invitations_real_suppression')).rows[0].n,
        0
      )
      const click = await app.fetch(
        new Request(`${origin}/invitations/one-click/${token}`, { method: 'POST' })
      )
      assert.equal(click.status, 200)
      const again = await app.fetch(
        new Request(`${origin}/invitations/unsubscribe/${token}`, { method: 'POST' })
      )
      assert.match(await again.text(), /You are unsubscribed/)
      const rows = (await pool.query('select reason,identity from invitations_real_suppression')).rows
      assert.equal(rows.length, 1)
      assert.equal(rows[0].reason, 'one_click')
      assert.ok(!rows[0].identity.includes('@'))
      const bad = await app.fetch(
        new Request(`${origin}/invitations/one-click/${'x'.repeat(43)}`, { method: 'POST' })
      )
      assert.equal(bad.status, 404)
      assert.equal(g.calls.send, 1)
    })
)

test(
  'a campaign for past customers invites a customer with no plan, and still stops when aMember cannot answer',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher }
      const no = amember(() => ({ ok: false, code: -1, msg: 'Failure' }))
      const lapsed = amember(() => ({ ok: true, user_id: 7, subscriptions: { 10: '2024-01-01' } }))
      // The default audience refuses both: no account answer and an expired plan.
      await assert.rejects(invite({ ...deps, member: no }, c, rid, draftRevision), {
        code: 'REAL_NOT_MEMBER'
      })
      await assert.rejects(invite({ ...deps, member: lapsed }, c, rid, draftRevision), {
        code: 'REAL_NOT_MEMBER'
      })
      c.revision = (
        await updateRealCampaignSettings({ ...c, audience: 'past_customers', groupLabels: {} })
      ).revision
      // Changing the audience leaves approved content approved.
      assert.equal((await readRealRecipient({ ...c, recipientId: rid })).draft.contentApproved, true)
      const broken = amember(() => ({ error: true, message: 'API Error 10001' }))
      await assert.rejects(invite({ ...deps, member: broken }, c, rid, draftRevision), {
        code: 'REAL_MEMBERSHIP_UNKNOWN'
      })
      assert.equal(g.calls.send, 0)
      await invite({ ...deps, member: lapsed }, c, rid, draftRevision)
      assert.equal(g.calls.send, 1)
      assert.deepEqual(lapsed.calls.length, 2)
      // Every other check still holds: the same customer is not invited twice.
      await assert.rejects(invite({ ...deps, member: lapsed }, c, rid, draftRevision), {
        code: 'REAL_ALREADY_INVITED'
      })
    })
)

test(
  'a pilot invitation is refused without aMember yes, past the budget, inside pacing or when suppressed',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher }
      const no = amember(() => ({ ok: false, code: -1, msg: 'Failure' }))
      await assert.rejects(invite({ ...deps, member: no }, c, rid, draftRevision), {
        code: 'REAL_NOT_MEMBER'
      })
      const broken = amember(() => ({ error: true, message: 'API Error 10001' }))
      await assert.rejects(invite({ ...deps, member: broken }, c, rid, draftRevision), {
        code: 'REAL_MEMBERSHIP_UNKNOWN'
      })
      await assert.rejects(
        invite({ ...deps, member: amember() }, c, rid, draftRevision, { config: { ...pilot(), beta: {} } }),
        { code: 'REAL_MEMBERSHIP_UNKNOWN' }
      )
      await assert.rejects(
        invite({ ...deps, member: amember() }, c, rid, draftRevision, { config: pilot({ pilotMax: 0 }) }),
        { code: 'REAL_PILOT_FULL' }
      )
      // A test send leaves a token; using it suppresses the test address, not the customer.
      await send(deps, c, rid, draftRevision)
      const token = /\/one-click\/([A-Za-z0-9_-]{43})>/.exec(g.calls.raws[0])[1]
      assert.deepEqual(await unsubscribeByToken({ pool, keys, token, reason: 'unsubscribe' }), { done: true })
      await assert.rejects(send(deps, c, rid, draftRevision), { code: 'REAL_SUPPRESSED' })
      // Pacing: one invitation sent, the next customer must wait.
      await invite({ ...deps, member: amember() }, c, rid, draftRevision)
      const other = (
        await pool.query('select recipient_id from invitations_real_draft where recipient_id<>$1 limit 1', [
          rid
        ])
      ).rows[0].recipient_id
      const od = await readRealRecipient({ ...c, recipientId: other })
      c.revision = (
        await approveRealDraft({ ...c, recipientId: other, draftRevision: od.draft.revision })
      ).revision
      const otherRevision = (await readRealRecipient({ ...c, recipientId: other })).draft.revision
      await assert.rejects(invite({ ...deps, member: amember() }, c, other, otherRevision), {
        code: 'REAL_PILOT_PACING'
      })
      const paced = await invite({ ...deps, member: amember() }, c, other, otherRevision, {
        config: pilot({ pacingSeconds: 0 })
      })
      assert.equal(paced.state, 'sent')
      assert.equal(
        (await pool.query("select count(*)::int n from invitations_real_send where kind='invitation'"))
          .rows[0].n,
        2
      )
    })
)

test(
  'estimated opens: only a customer invitation carries the image; a load is counted once as opened, never on a test',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher, member: amember() }
      const test = await send(deps, c, rid, draftRevision)
      assert.equal(test.opens, null)
      assert.doesNotMatch(decodeParts(g.calls.raws[0]), /\/o\//)
      assert.equal((await readSendingStatus({ pool, config: pilot() })).opens, null)
      const sent = await invite(deps, c, rid, draftRevision)
      assert.deepEqual(sent.opens, { firstAt: null, count: 0 })
      const body = decodeParts(g.calls.raws[1])
      const token = /src="http:\/\/localhost:8080\/o\/([A-Za-z0-9_-]{43})\.gif" width="1" height="1"/.exec(
        body
      )?.[1]
      assert.ok(token)
      // The image sits inside the footer, after the unsubscribe link.
      assert.ok(body.indexOf(`/o/${token}.gif`) > body.indexOf('UNSUBSCRIBE'))
      assert.deepEqual((await readSendingStatus({ pool, config: pilot() })).opens, { tracked: 1, opened: 0 })
      const app = invitationsUnsubscribeRoutes({ pool, keys })
      for (let i = 0; i < 3; i++) {
        const res = await app.fetch(new Request(`${origin}/o/${token}.gif`))
        assert.equal(res.status, 200)
        assert.equal(res.headers.get('content-type'), 'image/gif')
        assert.match(res.headers.get('cache-control'), /no-store/)
        assert.equal(res.headers.get('set-cookie'), null)
        assert.equal(
          Buffer.from(await res.arrayBuffer())
            .subarray(0, 6)
            .toString(),
          'GIF89a'
        )
      }
      // Unknown and malformed tokens answer the same image and count nothing.
      for (const path of [`/o/${'x'.repeat(43)}.gif`, '/o/nope.gif', '/o/nope'])
        assert.equal((await app.fetch(new Request(`${origin}${path}`))).status, 200)
      const [row] = (await listRecipientSends({ pool, keys, campaignId: c.campaignId, recipientId: rid }))
        .items
      assert.equal(row.kind, 'invitation')
      assert.equal(row.opens.count, 3)
      assert.ok(row.opens.firstAt)
      assert.deepEqual((await readSendingStatus({ pool, config: pilot() })).opens, { tracked: 1, opened: 1 })
      const raw = (
        await pool.query(
          'select open_token_hash from invitations_real_send where open_token_hash is not null'
        )
      ).rows
      assert.equal(raw.length, 1)
      assert.notEqual(raw[0].open_token_hash, token)
    })
)

test('trackLinks rewrites web links only, one place per address, at most 50 places', async () => {
  const { trackLinks } = await import('../src/invitations/real-footer.js')
  const many = Array.from({ length: 52 }, (_, i) => `<a href="https://a.test/${i}">${i}</a>`).join('')
  const { html, targets } = trackLinks(
    `<p><a href="https://a.test/x">A</a><a href="mailto:m@a.test">M</a><a href="#top">T</a><a href=" HTTP://a.test/x ">B</a><a href="https://a.test/x">C</a></p>${many}`,
    (n) => `https://t.test/c/${n}`
  )
  assert.deepEqual(targets.slice(0, 2), ['https://a.test/x', 'HTTP://a.test/x'])
  assert.equal(targets.length, 50)
  assert.ok(
    html.startsWith(
      '<p><a href="https://t.test/c/0">A</a><a href="mailto:m@a.test">M</a><a href="#top">T</a><a href="https://t.test/c/1">B</a><a href="https://t.test/c/0">C</a></p>'
    )
  )
  // Past 50 different addresses, the rest stay as written.
  assert.ok(html.includes('<a href="https://a.test/50">50</a>'))
  assert.ok(html.includes('<a href="https://t.test/c/49">47</a>'))
})

test(
  'estimated clicks: with the switch on, web links of a customer invitation go through /c/, a press is forwarded to the link as written and counted unless it looks like a scanner',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      await connect(pool, g.fetcher)
      const cta = 'https://cowork.tracy.ai/?utm_source=joomlart&utm_content=ceo-invite-g1'
      const { c, rid, draftRevision } = await approvedDraft({
        pool,
        keys,
        html: `<p>Hello {{first_name}}</p><p><a href="${cta}">Try Tracy</a> or <a href="mailto:help@joomlart.com">write</a></p><p><a href="${cta}">Try it</a> <a href="https://www.joomlart.com/">JoomlArt</a></p>`
      })
      const deps = { pool, keys, fetcher: g.fetcher, member: amember() }
      const { getMailFormat, setMailFormat } = await import('../src/invitations/real-mail-format.js')
      // Off by default: links stay as written.
      assert.equal((await getMailFormat({ db: pool })).clickTracking, false)
      await send(deps, c, rid, draftRevision)
      assert.doesNotMatch(decodeParts(g.calls.raws[0]), /\/c\//)
      await setMailFormat({
        db: pool,
        value: { ...(await getMailFormat({ db: pool })), clickTracking: true },
        actorId: c.actorId
      })
      // With the switch on, a test send carries the same tracked links, so a test inbox shows the mail
      // as customers get it; its link forwards like a customer's, and stays out of the figures.
      const tested = await send(deps, c, rid, draftRevision)
      const testLink = /href="http:\/\/localhost:8080\/c\/([A-Za-z0-9_-]{43})\/0"/.exec(
        decodeParts(g.calls.raws[1])
      )?.[1]
      assert.ok(testLink)
      assert.deepEqual(tested.clicks, { firstAt: null, count: 0 })
      const forwarded = await invitationsUnsubscribeRoutes({ pool, keys }).fetch(
        new Request(`${origin}/c/${testLink}/0`)
      )
      assert.equal(forwarded.status, 302)
      assert.equal(forwarded.headers.get('location'), cta)
      const sent = await invite(deps, c, rid, draftRevision)
      assert.deepEqual(sent.clicks, { firstAt: null, count: 0 })
      const body = decodeParts(g.calls.raws[2])
      const links = [...body.matchAll(/href="http:\/\/localhost:8080\/c\/([A-Za-z0-9_-]{43})\/(\d+)"/g)]
      // The same address twice shares one place; the unsubscribe link stays as written.
      assert.deepEqual(
        links.map((m) => m[2]),
        ['0', '0', '1']
      )
      assert.match(body, /href="http:\/\/localhost:8080\/invitations\/unsubscribe\/[A-Za-z0-9_-]{43}"/)
      assert.ok(!body.includes('utm_content=ceo-invite-g1'))
      const token = links[0][1]
      const app = invitationsUnsubscribeRoutes({ pool, keys })
      const press = (n, ua = 'Mozilla/5.0 (Macintosh)') =>
        app.fetch(new Request(`${origin}/c/${token}/${n}`, { headers: { 'user-agent': ua } }))
      const clicks = async () =>
        (await listRecipientSends({ pool, keys, campaignId: c.campaignId, recipientId: rid })).items.find(
          (s) => s.kind === 'invitation'
        )
      // A scanner on arrival: forwarded, not counted.
      let res = await press(0)
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('location'), cta)
      assert.equal(res.headers.get('set-cookie'), null)
      assert.deepEqual((await clicks()).clicks, { firstAt: null, count: 0 })
      // Later, a person: counted, and the press counts as an open too.
      await pool.query("update invitations_real_send set created_at=created_at - interval '5 minutes'")
      res = await press(1)
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('location'), 'https://www.joomlart.com/')
      const row = await clicks()
      assert.equal(row.clicks.count, 1)
      assert.ok(row.clicks.firstAt)
      assert.equal(row.opens.count, 1)
      // A robot's agent: forwarded, not counted.
      assert.equal((await press(0, 'python-requests/2.31')).status, 302)
      assert.equal((await clicks()).clicks.count, 1)
      // Unknown place, unknown or malformed token: a page, never a redirect.
      for (const path of [`/c/${token}/7`, `/c/${token}/x`, `/c/${'x'.repeat(43)}/0`, '/c/nope/0']) {
        const r = await app.fetch(new Request(`${origin}${path}`))
        assert.equal(r.status, 404)
        assert.equal(r.headers.get('location'), null)
      }
      // Per-group numbers are one campaign's: none server-wide, none for another campaign.
      assert.deepEqual(
        (await readSendingStatus({ pool, config: pilot(), campaignId: c.campaignId })).groups,
        [{ group: 'group_1', sent: 1, opens: { tracked: 1, opened: 1 }, clicks: { tracked: 1, clicked: 1 } }]
      )
      assert.deepEqual((await readSendingStatus({ pool, config: pilot() })).groups, [])
      assert.deepEqual(
        (await readSendingStatus({ pool, config: pilot(), campaignId: randomUUID() })).groups,
        []
      )
      const stored = (
        await pool.query(
          "select click_token_hash from invitations_real_send where click_token_hash is not null and kind='invitation'"
        )
      ).rows
      assert.equal(stored.length, 1)
      assert.notEqual(stored[0].click_token_hash, token)
    })
)

test('the Send tab list holds every send of the campaign, each naming its recipient', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    const g = google()
    await connect(pool, g.fetcher)
    const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
    const deps = { pool, keys, fetcher: g.fetcher, member: amember() }
    await send(deps, c, rid, draftRevision)
    await invite(deps, c, rid, draftRevision)
    const { items } = await listCampaignSends({ pool, keys, campaignId: c.campaignId })
    assert.deepEqual(
      items.map((i) => [i.kind, i.recipientId, i.state]),
      [
        ['invitation', rid, 'sent'],
        ['test', rid, 'sent']
      ]
    )
    assert.deepEqual(items[0].opens, { firstAt: null, count: 0 })
    assert.equal(items[1].opens, null)
  })
)

test(
  'Email format: every switch changes only what it names, for tests and invitations alike',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const g = google()
      await connect(pool, g.fetcher)
      const { c, rid, draftRevision } = await approvedDraft({ pool, keys })
      const deps = { pool, keys, fetcher: g.fetcher, member: amember() }
      const { getMailFormat, setMailFormat, MAIL_FORMAT_DEFAULT } = await import(
        '../src/invitations/real-mail-format.js'
      )
      assert.deepEqual(await getMailFormat({ db: pool }), { ...MAIL_FORMAT_DEFAULT })
      // Defaults: one-click headers, notice footer, Message-ID on the Tracy host, full HTML.
      await send(deps, c, rid, draftRevision)
      const first = g.calls.raws[0]
      assert.match(first, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/)
      assert.match(first, /^Message-ID: <[0-9a-f-]{36}@localhost>\r$/m)
      assert.match(first, /^Content-ID: <[^>]+@localhost>\r$/m)
      assert.match(decodeParts(first), /You received this email because you signed up/)
      await assert.rejects(
        setMailFormat({ db: pool, value: { oneClickHeader: false }, actorId: c.actorId }),
        {
          code: 'REAL_INVALID_MAIL_FORMAT'
        }
      )
      const off = {
        oneClickHeader: false,
        footer: 'personal',
        messageIdDomain: 'sender',
        html: 'simple',
        openImage: false,
        clickTracking: false
      }
      assert.deepEqual(await setMailFormat({ db: pool, value: off, actorId: c.actorId }), off)
      await send(deps, c, rid, draftRevision)
      const second = g.calls.raws[1]
      assert.doesNotMatch(second, /List-Unsubscribe/)
      assert.match(second, /^Message-ID: <[0-9a-f-]{36}@example\.com>\r$/m)
      assert.match(second, /^Content-ID: <[^>]+@example\.com>\r$/m)
      const body = decodeParts(second)
      assert.match(
        body,
        /If you would rather not hear from me about Tracy, <a href="http:\/\/localhost:8080\/invitations\/unsubscribe\/[A-Za-z0-9_-]{43}">unsubscribe here<\/a>/
      )
      assert.doesNotMatch(body, /<title>|You received this email because/)
      assert.ok(body.includes('<div dir="ltr">'))
      // The unsubscribe link still works without the header.
      const token = /unsubscribe\/([A-Za-z0-9_-]{43})/.exec(body)[1]
      assert.deepEqual(await unsubscribeByToken({ pool, keys, token, reason: 'unsubscribe' }), { done: true })
      // No open image in a customer invitation when it is off.
      await pool.query('delete from invitations_real_suppression')
      const sent = await invite(deps, c, rid, draftRevision)
      assert.equal(sent.opens, null)
      assert.doesNotMatch(decodeParts(g.calls.raws[2]), /\/o\//)
      const audit = (
        await pool.query(
          "select count(*)::int n from invitations_real_audit where action='mail_format_setting'"
        )
      ).rows[0].n
      assert.equal(audit, 1)
    })
)

test(
  'send queue: sends approved emails one per pass under the same checks, skips a customer refusal, pauses on unknown',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const { startRealQueue, readRealQueue, runRealQueues, pauseRealQueue, resumeRealQueue } = await import(
        '../src/invitations/real-queue.js'
      )
      let unknownNext = false
      const g = google({
        send: () =>
          unknownNext
            ? new Response('', { status: 503 })
            : Response.json({ id: `gmail-${Math.random()}`, threadId: 't' })
      })
      await connect(pool, g.fetcher)
      const { c, rid } = await approvedDraft({ pool, keys })
      // Approve every drafted recipient of the fixture.
      const others = (
        await pool.query('select recipient_id from invitations_real_draft where recipient_id<>$1', [rid])
      ).rows.map((r) => r.recipient_id)
      for (const id of others) {
        const d = await readRealRecipient({ ...c, recipientId: id })
        c.revision = (
          await approveRealDraft({ ...c, recipientId: id, draftRevision: d.draft.revision })
        ).revision
      }
      const all = [rid, ...others]
      const emails = new Map()
      for (const id of all) emails.set((await readRealRecipient({ ...c, recipientId: id })).email, id)
      // aMember: the second approved customer has no plan.
      const order = (
        await startRealQueue({
          pool,
          keys,
          config: pilot({ pilotMax: 10, pacingSeconds: 0 }),
          campaignId: c.campaignId,
          actorId: c.actorId,
          groups: { group_1: 10 }
        })
      ).items.map((i) => i.recipientId)
      assert.deepEqual([...order].sort(), [...all].sort())
      const member = async (url) => {
        const id = emails.get(new URL(url).searchParams.get('email'))
        if (url.toString().includes('check-access'))
          return Response.json(
            id === order[1]
              ? { ok: false, code: -1, msg: 'Failure' }
              : { ok: true, user_id: 1, subscriptions: { 10: '2099-01-01' } }
          )
        return g.fetcher(url)
      }
      const fetcher = async (url, init) =>
        String(url).includes('check-access') ? member(url) : g.fetcher(url, init)
      await assert.rejects(
        startRealQueue({
          pool,
          keys,
          config: pilot(),
          campaignId: c.campaignId,
          actorId: c.actorId,
          groups: { group_1: 10 }
        }),
        { code: 'REAL_QUEUE_RUNNING' }
      )
      const cfg = pilot({ pilotMax: 10, pacingSeconds: 0 })
      // Pass 1 sends the first customer.
      assert.equal((await runRealQueues({ pool, keys, config: cfg, fetcher })).sent, 1)
      // Pause stops the cron; resume lets it go on.
      assert.equal(
        (await pauseRealQueue({ pool, keys, campaignId: c.campaignId })).pauseReason,
        'BY_OPERATOR'
      )
      assert.equal((await runRealQueues({ pool, keys, config: cfg, fetcher })).sent, 0)
      await resumeRealQueue({ pool, keys, campaignId: c.campaignId })
      // Pacing holds the next pass without consuming anything.
      const paced = pilot({ pilotMax: 10, pacingSeconds: 180 })
      assert.equal((await runRealQueues({ pool, keys, config: paced, fetcher })).sent, 0)
      // Next pass skips the customer with no plan, sends the third, Gmail does not answer: pause, no resend.
      unknownNext = true
      const before = g.calls.send
      const r = await runRealQueues({ pool, keys, config: cfg, fetcher })
      assert.deepEqual(
        r.paused.map((p) => p.reason),
        ['SEND_UNKNOWN']
      )
      assert.equal(g.calls.send, before + 1)
      let q = await readRealQueue({ pool, keys, campaignId: c.campaignId })
      assert.deepEqual(
        q.items.map((i) => [i.state, i.reason]),
        [
          ['sent', null],
          ['skipped', 'REAL_NOT_MEMBER'],
          ['sent', 'SEND_UNKNOWN']
        ]
      )
      assert.equal(q.state, 'paused')
      assert.equal((await runRealQueues({ pool, keys, config: cfg, fetcher })).sent, 0)
      assert.equal(g.calls.send, before + 1)
      // Sending off pauses a running queue.
      unknownNext = false
      await resumeRealQueue({ pool, keys, campaignId: c.campaignId })
      assert.deepEqual(
        (await runRealQueues({ pool, keys, config: config(), fetcher })).paused.map((p) => p.reason),
        ['REAL_PILOT_OFF']
      )
      // With nothing left and sending on, the queue is done.
      await resumeRealQueue({ pool, keys, campaignId: c.campaignId })
      await runRealQueues({ pool, keys, config: cfg, fetcher })
      q = await readRealQueue({ pool, keys, campaignId: c.campaignId })
      assert.equal(q.state, 'done')
      assert.deepEqual(q.counts, { pending: 0, sent: 2, skipped: 1 })
      const stored = JSON.stringify((await pool.query('select * from invitations_real_queue_item')).rows)
      assert.ok(!stored.includes('@'))
    })
)

test(
  'send queue: each group stops at its own number sent, groups take turns, skips do not count, a new start sends the rest',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const { startRealQueue, readRealQueue, runRealQueues } = await import(
        '../src/invitations/real-queue.js'
      )
      const g = google({ send: () => Response.json({ id: `gmail-${Math.random()}`, threadId: 't' }) })
      await connect(pool, g.fetcher)
      // Rows 316 to 319 of the synthetic snapshot: two in group 1, two in group 2, all approved.
      const c = await contentCampaign({ pool, keys, total: 4, offset: 316 })
      for (const group of ['group_1', 'group_2']) {
        const p = await previewRealTemplate({
          ...c,
          group,
          subject: 'Xin chào {{first_name}}',
          zipBytes: await contentZip(),
          requestKey: randomUUID()
        })
        c.revision = (
          await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })
        ).revision
        c.revision = (await generateRealDrafts({ ...c, group, limit: 100, replaceExisting: false })).revision
      }
      const groupOf = new Map(c.recipients.map((r) => [r.id, r.group]))
      const emails = new Map()
      for (const r of c.recipients) {
        const d = await readRealRecipient({ ...c, recipientId: r.id })
        emails.set(d.email, r.id)
        c.revision = (
          await approveRealDraft({ ...c, recipientId: r.id, draftRevision: d.draft.revision })
        ).revision
      }
      const ids = (group) =>
        [...groupOf]
          .filter(([, g]) => g === group)
          .map(([id]) => id)
          .sort()
      const [a1, a2] = ids('group_1')
      const [b1, b2] = ids('group_2')
      assert.ok(a2 && b2)
      const cfg = pilot({ pilotMax: 10, pacingSeconds: 0 })
      const start = (groups) =>
        startRealQueue({ pool, keys, config: cfg, campaignId: c.campaignId, actorId: c.actorId, groups })
      for (const bad of [
        undefined,
        {},
        [],
        { group_9: 1 },
        { group_1: 0 },
        { group_1: 10001 },
        { group_1: '5' }
      ])
        await assert.rejects(start(bad), { code: 'REAL_INVALID_INPUT' })
      await assert.rejects(start({ group_3: 5 }), { code: 'REAL_QUEUE_EMPTY' })
      const first = await start({ group_1: 1, group_2: 2 })
      // Turns: group 1, group 2, group 1, group 2.
      assert.deepEqual(
        first.items.map((i) => i.recipientId),
        [a1, b1, a2, b2]
      )
      // aMember: the first customer of group 1 has no plan.
      const fetcher = async (url, init) => {
        if (!String(url).includes('check-access')) return g.fetcher(url, init)
        const id = emails.get(new URL(url).searchParams.get('email'))
        return Response.json(
          id === a1
            ? { ok: false, code: -1, msg: 'Failure' }
            : { ok: true, user_id: 1, subscriptions: { 10: '2099-01-01' } }
        )
      }
      // Pass 1 skips group 1's customer with no plan and sends group 2's first; pass 2 sends group 1's
      // second (group 1 now at its 1); pass 3 sends group 2's second; pass 4: both at their number, done.
      for (const expected of [1, 1, 1, 0])
        assert.equal((await runRealQueues({ pool, keys, config: cfg, fetcher })).sent, expected)
      let q = await readRealQueue({ pool, keys, campaignId: c.campaignId })
      assert.equal(q.state, 'done')
      assert.deepEqual(q.groups, [
        { group: 'group_1', limit: 1, sent: 1, skipped: 1, pending: 0 },
        { group: 'group_2', limit: 2, sent: 2, skipped: 0, pending: 0 }
      ])
      assert.equal(g.calls.send, 3)
      await assert.rejects(start({ group_2: 3 }), { code: 'REAL_QUEUE_EMPTY' })
      // Next day: customers already invited are left out; the one with no plan is asked again.
      const again = await start({ group_1: 5 })
      assert.deepEqual(
        again.items.map((i) => i.recipientId),
        [a1]
      )
      await runRealQueues({ pool, keys, config: cfg, fetcher })
      q = await readRealQueue({ pool, keys, campaignId: c.campaignId })
      assert.equal(q.state, 'done')
      assert.deepEqual(q.groups, [{ group: 'group_1', limit: 5, sent: 0, skipped: 1, pending: 0 }])
      assert.equal(g.calls.send, 3)
    })
)
