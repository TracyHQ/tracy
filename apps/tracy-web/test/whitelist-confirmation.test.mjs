import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { confirmationRoutes } from '../src/beta/confirmation.js'
import { confirmationMail } from '../src/mail/confirmation-mail.js'
import { resendTransport } from '../src/mail/transport.js'
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pgOnly = { skip: !process.env.TEST_DATABASE_URL }
const secret = 's'.repeat(32)
const body = {
  email: 'visitor@example.com',
  name: 'Visitor',
  platforms: ['WordPress'],
  role: 'own',
  site_count: 'one'
}
function harness(send, daily = 80) {
  const app = confirmationRoutes({
    confirmationMail,
    config: { beta: { confirmationSecret: secret, confirmationDaily: daily } },
    pool: db.pool,
    mail: { send }
  })
  return (data = body, token = secret) =>
    app.request('/internal/beta/confirmation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    })
}
test('confirmation escapes HTML and optional website is omitted', () => {
  const mail = confirmationMail(body.email, { ...body, name: '<script>', website: null })
  assert.match(mail.html, /&lt;script&gt;/)
  assert.doesNotMatch(mail.text, /Main website/)
  assert.doesNotMatch(mail.text, /early access|free|soon/i)
})
test('Resend confirmation forwards HTML and idempotency and requires provider id', async () => {
  let payload, headers
  const mail = resendTransport({
    key: 'fixture',
    from: 'Tracy <noreply@tracy.ai>',
    fetchImpl: async (_u, o) => {
      payload = JSON.parse(o.body)
      headers = o.headers
      return Response.json({ id: 'mail-1' })
    }
  })
  assert.equal(
    await mail.send({ to: body.email, ...confirmationMail(body.email, body), idempotencyKey: 'stable' }),
    'mail-1'
  )
  assert.equal(headers['Idempotency-Key'], 'stable')
  assert.ok(payload.html)
  assert.ok(payload.text)
})
test('private auth, validation, stable retry payload and duplicate acknowledgement', pgOnly, async () => {
  const sent = []
  let fail = true
  const post = harness(async (p) => {
    const { signal, ...payload } = p
    assert.ok(signal instanceof AbortSignal)
    sent.push(payload)
    if (fail) throw Error('timeout')
    return 'mail-1'
  })
  assert.equal((await post(body, 'wrong')).status, 401)
  assert.equal((await post({ ...body, platforms: [] })).status, 400)
  assert.equal((await post()).status, 503)
  fail = false
  assert.equal((await post({ ...body, name: 'Changed' })).status, 200)
  assert.deepEqual(sent[0], sent[1])
  assert.equal((await post()).status, 200)
  assert.equal(sent.length, 2)
})
test('lease prevents concurrent sends and daily reservation is atomic', pgOnly, async () => {
  let release
  const gate = new Promise((r) => {
    release = r
  })
  let sends = 0
  const post = harness(async () => {
    sends++
    await gate
    return 'mail-1'
  }, 1)
  const first = post()
  while (!sends) await new Promise((r) => setTimeout(r, 5))
  assert.equal((await post()).status, 202)
  assert.equal((await post({ ...body, email: 'other@example.com' })).status, 202)
  release()
  assert.equal((await first).status, 200)
  assert.equal(sends, 1)
})
test('ambiguous older attempt requires review rather than another send', pgOnly, async () => {
  let sends = 0
  const post = harness(async () => {
    sends++
    throw Error('unknown')
  })
  await post()
  await db.pool.query("update whitelist_confirmation set first_attempt_at=now()-interval '24 hours'")
  assert.equal((await post()).status, 409)
  assert.equal(sends, 1)
})

test(
  'rendered WordPress template is immutable and environments have independent provider keys',
  pgOnly,
  async () => {
    const sent = []
    const post = harness(async ({ signal: _signal, ...p }) => {
      sent.push(p)
      if (sent.length === 1) throw Error('retry')
      return 'ack'
    })
    const original = { ...body, confirmation: { html: '<p>Sarah template</p>', text: 'Sarah template' } }
    assert.equal((await post({ ...body, confirmation: { html: 1, text: 'bad' } })).status, 400)
    assert.equal((await post(original)).status, 503)
    assert.equal(
      (await post({ ...original, confirmation: { html: '<p>Changed</p>', text: 'Changed' } })).status,
      200
    )
    assert.deepEqual(sent[0], sent[1])
    assert.equal(sent[0].html, original.confirmation.html)
    const key = sent[0].idempotencyKey
    await db.pool.query('delete from whitelist_confirmation')
    assert.equal((await post(original)).status, 200)
    assert.notEqual(sent[2].idempotencyKey, key)
  }
)
test('missing provider acknowledgement never marks confirmation sent', pgOnly, async () => {
  const post = harness(async () => undefined)
  assert.equal((await post()).status, 503)
  assert.equal((await db.pool.query('select status from whitelist_confirmation')).rows[0].status, 'queued')
  const mail = resendTransport({
    key: 'fixture',
    from: 'fixture@example.com',
    fetchImpl: async () => Response.json({})
  })
  await assert.rejects(
    mail.send({ ...confirmationMail(body.email, body), to: body.email, idempotencyKey: 'fixture' }),
    /acknowledgement missing/
  )
})

test('disabled relay and malformed authentication fail before any persistence or mail', async () => {
  const config = { beta: {} }
  const app = confirmationRoutes({
    confirmationMail,
    config,
    pool: {
      query: () => {
        throw Error('must not touch database')
      }
    },
    mail: {
      send: () => {
        throw Error('must not send')
      }
    }
  })
  assert.equal(
    (
      await app.request('/internal/beta/confirmation', {
        method: 'POST',
        headers: { authorization: 'Bearer undefined' }
      })
    ).status,
    401
  )
  config.beta.confirmationSecret = secret
  assert.equal(
    (
      await app.request('/internal/beta/confirmation', {
        method: 'POST',
        headers: { authorization: `Bearer ${'é'.repeat(32)}` }
      })
    ).status,
    401
  )
})
test(
  'the form answers are kept for /ops; an identical retry changes nothing, new answers do',
  pgOnly,
  async () => {
    const post = harness(async () => 'mail-1')
    const read = async () =>
      (
        await db.pool.query(
          'select name, website, platforms, role, site_count, created_at, updated_at from beta_waitlist where email = $1',
          [body.email]
        )
      ).rows
    assert.equal((await post({ ...body, website: 'shop.example.com' })).status, 200)
    const [first] = await read()
    assert.equal(first.name, 'Visitor')
    assert.equal(first.website, 'https://shop.example.com/')
    assert.deepEqual(first.platforms, ['WordPress'])
    assert.equal(first.role, 'own')
    assert.equal(first.site_count, 'one')
    // WordPress retries the door every hour until the mail is sent: the same answers again.
    await post({ ...body, website: 'shop.example.com' })
    const [again] = await read()
    assert.equal(again.updated_at.getTime(), first.updated_at.getTime())
    // The person sends the form again with other answers.
    await post({ ...body, website: 'shop.example.com', platforms: ['Joomla'], site_count: '2-10' })
    const rows = await read()
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].platforms, ['Joomla'])
    assert.equal(rows[0].site_count, '2-10')
    assert.equal(rows[0].created_at.getTime(), first.created_at.getTime())
    assert.ok(rows[0].updated_at.getTime() > first.updated_at.getTime())
  }
)
test('the form page utm_* are cleaned and kept; a retry without them keeps the source', pgOnly, async () => {
  const post = harness(async () => 'mail-1')
  const source = async () =>
    (await db.pool.query('select source from beta_waitlist where email = $1', [body.email])).rows[0]?.source
  await post({
    ...body,
    utm_source: 'Pricing',
    utm_medium: 'Newsletter',
    utm_content: 'plan-card<script>',
    utm_term: 'ignored'
  })
  assert.deepEqual(await source(), { source: 'pricing', medium: 'other', content: 'plan-cardscript' })
  await post(body)
  assert.deepEqual(await source(), { source: 'pricing', medium: 'other', content: 'plan-cardscript' })
})
test('deliver: false keeps the form and sends nothing; the later call mails as before', pgOnly, async () => {
  const sent = []
  const post = harness(async (p) => {
    sent.push(p.to)
    return 'mail-1'
  })
  const held = await post({ ...body, deliver: false, utm_source: 'pricing' })
  assert.equal(held.status, 200)
  assert.deepEqual(await held.json(), { status: 'stored' })
  assert.equal(sent.length, 0)
  assert.equal((await db.pool.query('select count(*)::int as n from whitelist_confirmation')).rows[0].n, 0)
  assert.equal(
    (await db.pool.query('select name from beta_waitlist where email = $1', [body.email])).rows[0].name,
    'Visitor'
  )
  const mailed = await post({ ...body, utm_source: 'pricing' })
  assert.equal(mailed.status, 200)
  assert.deepEqual(sent, [body.email])
  // A bad call is refused before anything is kept, store-only or not.
  assert.equal((await post({ ...body, email: 'not-an-address', deliver: false })).status, 400)
})
