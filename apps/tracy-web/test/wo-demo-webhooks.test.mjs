// Webhooks of `/v1/demos` (`opportunities-build/demo-webhooks.js`, migration 217): one https address per account,
// registered through the account-token doors; events made by the sweep from committed rows, once each; a signed POST
// per attempt, delivered, retried with back-off or given up. The account token, DNS, the photo fetch and the webhook
// receiver are fakes: no call leaves the machine.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import * as domain from 'website-opportunities/domain'
import { publicDemoRoutes } from '../src/opportunities-build/public-demos-route.js'
import { COMPLETED, createPublicDemos, FAILED } from '../src/opportunities-build/public-demos.js'
import {
  checkWebhookUrl,
  createDemoWebhooks,
  removeWebhook,
  retryDelayMs,
  signatureHeader,
  WEBHOOK_LIMITS
} from '../src/opportunities-build/demo-webhooks.js'
import { recordOpen } from '../src/lib/wo-demo-links.js'
import { openSecret } from '../src/lib/secret-box.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const SECRET = 's'.repeat(32)
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const HOOK = 'https://hooks.example/tracy'
const PUBLIC_DNS = async (host) => [
  {
    address: host.endsWith('.internal')
      ? '10.0.0.5'
      : host === 'rebind.example'
        ? '127.0.0.1'
        : '93.184.216.34'
  }
]

const demoRequest = () => ({
  schema: 'website-opportunities/demo-request/v1',
  business: { name: 'Pho Hanoi', address: '12 Hang Bac, Hanoi', items: [{ name: 'Pho bo' }] },
  photos: [{ url: 'https://images.example/pho.jpg' }],
  cms: 'wordpress'
})

/** The `/v1/demos` doors and the webhook sweep on one clock, with every outside party faked. */
function world() {
  const clock = { at: Date.parse('2026-11-12T10:00:00Z') }
  const now = () => clock.at
  const sent = []
  const answers = []
  const deps = {
    pool: db.pool,
    config: {
      origin: 'https://cowork.tracy.test',
      apiOrigin: 'https://api.tracy.test',
      sessionSecret: SECRET
    },
    isApiHost: () => true,
    requireAccountToken: async (c, scope) => {
      const m = /^Bearer acct:(.+)$/.exec(c.req.header('authorization') ?? '')
      if (/^Bearer trk_/.test(c.req.header('authorization') ?? '')) return c.json({}, 500)
      if (!m || scope !== 'demos') return c.json({ error: { code: 'NOT_SIGNED_IN' } }, 401)
      return { accountId: m[1], grantId: null }
    },
    loadDomain: async () => domain,
    resolve: PUBLIC_DNS,
    fetchImpl: async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }),
    imageInfo: async () => ({ width: 800, height: 600, palette: null, dhash: null, features: null }),
    objects: { put: async () => true },
    templateCards: async () => ({
      cards: [{ id: 'ja-food', platforms: [{ platform: 'wordpress', tag: 'ja-food/wp', version: '1.0.0' }] }]
    }),
    woSettings: async () => ({ pinnedTemplates: {}, defaultCms: 'wordpress' }),
    switchOn: async () => true,
    now
  }
  const app = new Hono()
  app.route('/', publicDemoRoutes(deps))
  const call = async (method, path, { account, json, headers = {} } = {}) => {
    const res = await app.request(`https://api.tracy.test${path}`, {
      method,
      headers: {
        ...(account ? { authorization: `Bearer acct:${account}` } : {}),
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {})
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const webhooks = createDemoWebhooks({
    pool: db.pool,
    sessionSecret: SECRET,
    // The receiver: each attempt is kept; `answers` says what it answers (a status, or an Error to throw).
    fetchImpl: async (url, init) => {
      sent.push({ url, init, at: clock.at })
      const answer = answers.shift() ?? 200
      if (answer instanceof Error) throw answer
      return new Response([204, 205, 304].includes(answer) ? null : 'ok', { status: answer })
    },
    demoBody: createPublicDemos(deps).snapshot,
    completed: [...COMPLETED],
    failed: [...FAILED],
    now,
    log: { warn: () => {} }
  })
  let n = 0
  const demo = async (account) =>
    (
      await call('POST', '/v1/demos', {
        account,
        json: demoRequest(),
        headers: { 'idempotency-key': `hook-demo-${String(++n).padStart(4, '0')}` }
      })
    ).body.demo
  return { clock, call, webhooks, sent, answers, demo }
}

async function account(email = 'builder@test.example') {
  return (await db.pool.query('insert into account(email) values ($1) returning id', [email])).rows[0].id
}

/** A demo's build with its site, as the runner leaves it, and its action set to `status`. */
async function finish(acct, demoId, status, error = null) {
  const a = (
    await db.pool.query(
      'select a.* from wo_demo_action a join wo_public_demo d on d.action_id = a.id where d.id = $1',
      [demoId]
    )
  ).rows[0]
  if (status !== 'failed') {
    await db.pool.query(
      `insert into wo_revision (id, opportunity_id, account_id, n, brief, brief_md) values ($1,$2,$3,1,'{}','')
       on conflict do nothing`,
      [a.revision_id, a.opportunity_id, acct]
    )
    await db.pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, state, qa, choice, choice_key)
       values ($1,$2,$3,$4,$5,'done','{"state":"passed"}'::jsonb,
         '{"cms":"wordpress","template":{"quickstart":"ja-food/wp","design":"ja-food"}}'::jsonb, 'fixture')`,
      [acct, a.revision_id, a.build_request_id, a.id, `demo-${demoId.slice(0, 8)}.tracy.test`]
    )
  }
  await db.pool.query('update wo_demo_action set status = $2, error = $3 where id = $1', [
    a.id,
    status,
    error
  ])
}

const events = async (acct) =>
  (
    await db.pool.query(
      'select * from wo_demo_webhook_event where account_id = $1 order by created_at, type, dedupe_key',
      [acct]
    )
  ).rows

test('the signature is the hex HMAC-SHA256 of "<t>.<body>" keyed with the whole secret', () => {
  const secret = 'whsec_dGVzdC12ZWN0b3Itc2VjcmV0'
  const body = '{"id":"4d2c1b0a-0000-4000-8000-000000000001","type":"demo.accepted"}'
  // Computed apart with `openssl dgst -sha256 -hmac`: a change of the scheme breaks every receiver.
  assert.equal(
    signatureHeader(secret, body, 1762905600),
    't=1762905600,v1=dd23e53f0c15ffa6949b481e57089c164c817cfcdbbac38b9954d5d70d2c4d19'
  )
  assert.equal(
    signatureHeader(secret, body, 1762905600).split('v1=')[1],
    createHmac('sha256', secret).update(`1762905600.${body}`).digest('hex')
  )
  assert.notEqual(signatureHeader(secret, `${body} `, 1762905600), signatureHeader(secret, body, 1762905600))
  assert.notEqual(signatureHeader(secret, body, 1762905601), signatureHeader(secret, body, 1762905600))
  // Back-off: 30 s tripling, 6 h at most; eight attempts in all.
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map(retryDelayMs),
    [30_000, 90_000, 270_000, 810_000, 2_430_000, 7_290_000, 21_600_000]
  )
  assert.equal(WEBHOOK_LIMITS.maxAttempts, 8)
  assert.equal(WEBHOOK_LIMITS.timeoutMs, 10_000)
  assert.ok(WEBHOOK_LIMITS.keepDays >= WEBHOOK_LIMITS.lookbackDays, 'a kept event is its own dedupe key')
})

test('a webhook address is https, on the default port, without credentials, on a public host', async () => {
  const check = (url, resolve = PUBLIC_DNS) => checkWebhookUrl(url, { domain, resolve })
  assert.deepEqual(await check('https://hooks.example/tracy?x=1#part'), {
    url: 'https://hooks.example/tracy?x=1'
  })
  const refused = {
    'http://hooks.example/tracy': 'HTTPS_REQUIRED',
    'ftp://hooks.example/': 'HTTPS_REQUIRED',
    'https://user:pass@hooks.example/': 'CREDENTIALS_NOT_ALLOWED',
    'https://token@hooks.example/': 'CREDENTIALS_NOT_ALLOWED',
    'https://hooks.example:8443/': 'PORT_NOT_ALLOWED',
    'https://127.0.0.1/': 'PRIVATE_ADDRESS',
    'https://10.1.2.3/hook': 'PRIVATE_ADDRESS',
    'https://169.254.169.254/latest/meta-data': 'PRIVATE_ADDRESS',
    'https://[::1]/': 'PRIVATE_ADDRESS',
    'https://[fe80::1]/': 'PRIVATE_ADDRESS',
    'https://[::ffff:192.168.1.1]/': 'PRIVATE_ADDRESS',
    'https://localhost/': 'PRIVATE_ADDRESS',
    'https://api.localhost/': 'PRIVATE_ADDRESS',
    'https://db.internal/': 'PRIVATE_ADDRESS',
    'https://rebind.example/': 'PRIVATE_ADDRESS',
    'not a url': 'INVALID_URL',
    '': 'INVALID_URL'
  }
  for (const [url, code] of Object.entries(refused)) assert.deepEqual(await check(url), { code }, url)
  assert.deepEqual(await check(`https://hooks.example/${'x'.repeat(2048)}`), { code: 'INVALID_URL' })
  assert.deepEqual(await check(42), { code: 'INVALID_URL' })
  assert.deepEqual(
    await check('https://gone.example/', async () => {
      throw new Error('ENOTFOUND')
    }),
    { code: 'HOST_NOT_FOUND' }
  )
})

test(
  'register, read and remove: the secret is answered once and kept sealed; the token decides the account',
  opts,
  async () => {
    const acct = await account()
    const other = await account('other@test.example')
    const { call } = world()
    assert.equal((await call('GET', '/v1/demos/webhook')).status, 401)
    assert.equal(
      (await call('PUT', '/v1/demos/webhook', { headers: { authorization: 'Bearer trk_abc' }, json: {} }))
        .status,
      403
    )
    assert.deepEqual((await call('GET', '/v1/demos/webhook', { account: acct })).body, { webhook: null })

    const http = await call('PUT', '/v1/demos/webhook', {
      account: acct,
      json: { url: 'http://hooks.example/' }
    })
    assert.equal(http.status, 422)
    assert.equal(http.body.error.code, 'INVALID_WEBHOOK_URL')
    assert.deepEqual(http.body.errors, [{ path: 'url', code: 'HTTPS_REQUIRED' }])
    const inside = await call('PUT', '/v1/demos/webhook', {
      account: acct,
      json: { url: 'https://169.254.169.254/' }
    })
    assert.deepEqual(inside.body.errors, [{ path: 'url', code: 'PRIVATE_ADDRESS' }])
    assert.equal((await call('PUT', '/v1/demos/webhook', { account: acct, json: {} })).status, 422)
    assert.equal(
      (await db.pool.query('select count(*)::int as n from wo_demo_webhook')).rows[0].n,
      0,
      'nothing kept for a refused address'
    )

    const made = await call('PUT', '/v1/demos/webhook', { account: acct, json: { url: HOOK } })
    assert.equal(made.status, 200)
    const secret = made.body.webhook.secret
    assert.match(secret, /^whsec_[A-Za-z0-9_-]{43}$/)
    assert.equal(made.body.webhook.url, HOOK)
    assert.deepEqual(made.body.webhook.events, [
      'demo.accepted',
      'demo.completed',
      'demo.failed',
      'demo.opened'
    ])
    const row = (await db.pool.query('select * from wo_demo_webhook where account_id = $1', [acct])).rows[0]
    assert.ok(!row.secret_box.includes(secret), 'sealed, never stored as it is')
    assert.equal(await openSecret(row.secret_box, SECRET), secret)
    const read = await call('GET', '/v1/demos/webhook', { account: acct })
    assert.equal(read.body.webhook.url, HOOK)
    assert.equal('secret' in read.body.webhook, false, 'the secret is answered once')
    assert.deepEqual(read.body.webhook.deliveries, { pending: 0, failed: 0, lastDeliveredAt: null })
    assert.deepEqual((await call('GET', '/v1/demos/webhook', { account: other })).body, { webhook: null })

    // Replacing makes a new secret and keeps when the account's events began.
    const replaced = await call('PUT', '/v1/demos/webhook', {
      account: acct,
      json: { url: 'https://other-hooks.example/in' }
    })
    assert.notEqual(replaced.body.webhook.secret, secret)
    assert.equal(replaced.body.webhook.since, made.body.webhook.since)
    assert.equal(
      (await db.pool.query('select count(*)::int as n from wo_demo_webhook where revoked_at is null')).rows[0]
        .n,
      1
    )
    assert.deepEqual((await call('DELETE', '/v1/demos/webhook', { account: acct })).body, {
      webhook: null,
      removed: true
    })
    assert.equal((await call('DELETE', '/v1/demos/webhook', { account: acct })).body.removed, false)
    assert.deepEqual((await call('GET', '/v1/demos/webhook', { account: acct })).body, { webhook: null })
  }
)

test(
  'each event of a demo accepted after registration is made once, from committed state, with the demo as GET answers it',
  opts,
  async () => {
    const acct = await account()
    const { clock, call, webhooks, demo } = world()
    const before = await demo(acct)
    clock.at += 1000
    await call('PUT', '/v1/demos/webhook', { account: acct, json: { url: HOOK } })
    clock.at += 1000
    const done = await demo(acct)
    const broken = await demo(acct)
    const stopped = await demo(acct)

    assert.equal(await webhooks.enqueue(), 3)
    let made = await events(acct)
    assert.deepEqual(
      made.map((e) => `${e.demo_id} ${e.type}`).sort(),
      [done.id, broken.id, stopped.id].map((id) => `${id} demo.accepted`).sort(),
      'nothing for the demo accepted before the webhook'
    )
    const madeDone = made.find((e) => e.demo_id === done.id)
    const accepted = JSON.parse(madeDone.body)
    assert.deepEqual(Object.keys(accepted).sort(), ['createdAt', 'demo', 'id', 'type'])
    assert.equal(accepted.id, madeDone.id)
    assert.equal(accepted.type, 'demo.accepted')
    assert.deepEqual(
      accepted.demo,
      (await call('GET', `/v1/demos/${done.id}`, { account: acct })).body.demo,
      'the same shape as GET /v1/demos/:id'
    )
    assert.equal(await webhooks.enqueue(), 0, 'each event once')

    // A build that wrote its ending and rolled it back made nothing: only committed state counts.
    const client = await db.pool.connect()
    await client.query('begin')
    await client.query(
      "update wo_demo_action set status = 'completed' where id = (select action_id from wo_public_demo where id = $1)",
      [done.id]
    )
    assert.equal(await webhooks.enqueue(), 0)
    await client.query('rollback')
    client.release()

    await finish(acct, done.id, 'completed')
    await finish(acct, broken.id, 'failed', 'DEMO_STEP_TIMEOUT')
    await finish(acct, before.id, 'completed')
    assert.equal((await call('POST', `/v1/demos/${stopped.id}/cancel`, { account: acct })).status, 200)
    assert.equal(await webhooks.enqueue(), 2, 'completed and failed; a cancelled demo is no failure')
    made = await events(acct)
    const completed = JSON.parse(made.find((e) => e.type === 'demo.completed').body)
    assert.equal(completed.demo.id, done.id)
    assert.equal(completed.demo.status, 'ready')
    assert.match(completed.demo.site.shareUrl, /^https:\/\/cowork\.tracy\.test\/d\/[A-Za-z0-9_-]{32}$/)
    assert.deepEqual(completed.demo.opens, {
      total: 0,
      phone: 0,
      desktop: 0,
      lastOpenedAt: null,
      firstOpenedAt: null
    })
    const failed = JSON.parse(made.find((e) => e.type === 'demo.failed').body)
    assert.equal(failed.demo.id, broken.id)
    assert.deepEqual(failed.demo.error, { code: 'DEMO_STEP_TIMEOUT' })

    // Each counted open of its share link is one event.
    const link = (await db.pool.query('select id from wo_demo_link')).rows[0]
    clock.at += 1000
    await recordOpen(db.pool, { linkId: link.id, path: '/', device: 'phone', at: clock.at })
    await recordOpen(db.pool, { linkId: link.id, path: '/menu', device: 'desktop', at: clock.at + 1 })
    assert.equal(await webhooks.enqueue(), 2)
    const opened = (await events(acct)).filter((e) => e.type === 'demo.opened').map((e) => JSON.parse(e.body))
    assert.equal(opened.length, 2)
    assert.ok(opened.every((e) => e.demo.id === done.id))
    assert.equal(Math.max(...opened.map((e) => e.demo.opens.total)), 2)
    assert.equal(await webhooks.enqueue(), 0)
    assert.equal(
      (
        await db.pool.query('select count(*)::int as n from wo_demo_webhook_event where demo_id = $1', [
          before.id
        ])
      ).rows[0].n,
      0
    )
  }
)

test(
  'delivery: a signed POST, 2xx delivers; a failure waits and retries; the 8th failure, or no address, gives up',
  opts,
  async () => {
    const acct = await account()
    const { clock, call, webhooks, sent, answers, demo } = world()
    const secret = (await call('PUT', '/v1/demos/webhook', { account: acct, json: { url: HOOK } })).body
      .webhook.secret
    clock.at += 1000
    await demo(acct)
    await webhooks.enqueue()
    const [event] = await events(acct)

    // 1. The receiver fails: kept, retried after 30 s, with the same body and id.
    answers.push(500)
    assert.deepEqual(await webhooks.deliver(), { delivered: 0, retried: 1, gaveUp: 0 })
    assert.equal(sent.length, 1)
    const first = sent[0]
    assert.equal(first.url, HOOK)
    assert.equal(first.init.method, 'POST')
    assert.equal(first.init.redirect, 'manual', 'never follows a redirect')
    assert.ok(first.init.signal instanceof AbortSignal, 'bounded by a timeout')
    assert.equal(first.init.body, event.body)
    assert.equal(first.init.headers['content-type'], 'application/json')
    assert.equal(first.init.headers['x-tracy-event-id'], event.id)
    assert.equal(first.init.headers['x-tracy-event-type'], 'demo.accepted')
    const t = Math.floor(clock.at / 1000)
    assert.equal(first.init.headers['x-tracy-signature'], signatureHeader(secret, event.body, t))
    let row = (await events(acct))[0]
    assert.deepEqual([row.attempts, row.last_status, row.last_error], [1, 500, 'HTTP_500'])
    assert.equal(row.next_at.getTime(), clock.at + 30_000)
    assert.equal(row.delivered_at, null)

    // Not due yet: nothing sent.
    clock.at += 29_000
    assert.deepEqual(await webhooks.deliver(), { delivered: 0, retried: 0, gaveUp: 0 })
    // 2. Due: a network error, then a timeout, then a redirect, each retried later.
    clock.at += 1_000
    answers.push(new TypeError('fetch failed'))
    await webhooks.deliver()
    clock.at += retryDelayMs(2)
    answers.push(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    await webhooks.deliver()
    clock.at += retryDelayMs(3)
    answers.push(302)
    await webhooks.deliver()
    row = (await events(acct))[0]
    assert.deepEqual([row.attempts, row.last_error], [4, 'HTTP_302'])
    assert.deepEqual(
      sent.map((s) => s.init.body),
      Array(4).fill(event.body),
      'every attempt sends the same bytes'
    )
    assert.ok(new Set(sent.map((s) => s.init.headers['x-tracy-event-id'])).size === 1)

    // 3. A 2xx delivers; a delivered event is never sent again.
    clock.at += retryDelayMs(4)
    answers.push(204)
    assert.deepEqual(await webhooks.deliver(), { delivered: 1, retried: 0, gaveUp: 0 })
    row = (await events(acct))[0]
    assert.ok(row.delivered_at)
    assert.equal(row.attempts, 5)
    clock.at += 3_600_000
    await webhooks.deliver()
    assert.equal(sent.length, 5)
    const read = (await call('GET', '/v1/demos/webhook', { account: acct })).body.webhook.deliveries
    assert.equal(read.lastDeliveredAt, row.delivered_at.toISOString())

    // 4. The 8th failed attempt gives up.
    clock.at += 1000
    await demo(acct)
    await webhooks.enqueue()
    const second = (await events(acct)).find((e) => !e.delivered_at)
    await db.pool.query('update wo_demo_webhook_event set attempts = 7 where id = $1', [second.id])
    answers.push(503)
    assert.deepEqual(await webhooks.deliver(), { delivered: 0, retried: 0, gaveUp: 1 })
    row = (await events(acct)).find((e) => e.id === second.id)
    assert.equal(row.attempts, 8)
    assert.ok(row.gave_up_at)
    clock.at += 7 * 3_600_000
    await webhooks.deliver()
    assert.equal(sent.length, 6, 'a given-up event is never sent again')
    assert.equal(
      (await call('GET', '/v1/demos/webhook', { account: acct })).body.webhook.deliveries.failed,
      1
    )

    // 5. A replaced address takes the pending events, signed with its own secret; a removed one gives them up unsent.
    clock.at += 1000
    await demo(acct)
    await webhooks.enqueue()
    const moved = await call('PUT', '/v1/demos/webhook', {
      account: acct,
      json: { url: 'https://other-hooks.example/in' }
    })
    await webhooks.deliver()
    const last = sent.at(-1)
    assert.equal(last.url, 'https://other-hooks.example/in')
    assert.equal(
      last.init.headers['x-tracy-signature'],
      signatureHeader(moved.body.webhook.secret, last.init.body, Math.floor(clock.at / 1000))
    )
    clock.at += 1000
    await demo(acct)
    await webhooks.enqueue()
    await removeWebhook(db.pool, acct, clock.at)
    const before = sent.length
    assert.deepEqual(await webhooks.deliver(), { delivered: 0, retried: 0, gaveUp: 1 })
    assert.equal(sent.length, before, 'nothing sent without an address')
    const orphan = (await events(acct)).find((e) => e.last_error === 'WEBHOOK_REMOVED')
    assert.ok(orphan?.gave_up_at)
    // No address: no new events either.
    clock.at += 1000
    await demo(acct)
    assert.equal(await webhooks.enqueue(), 0)
  }
)

test(
  'the sweep makes then sends in one tick, one tick at a time, and keeps old settled events a month',
  opts,
  async () => {
    const acct = await account()
    const { clock, call, webhooks, sent, demo } = world()
    await call('PUT', '/v1/demos/webhook', { account: acct, json: { url: HOOK } })
    clock.at += 1000
    await demo(acct)
    const [one, two] = await Promise.all([webhooks.tick(), webhooks.tick()])
    assert.deepEqual(one, { made: 1, delivered: 1, retried: 0, gaveUp: 0 })
    assert.equal(two, one, 'a second tick while one runs waits for it')
    assert.equal(sent.length, 1)
    clock.at += (WEBHOOK_LIMITS.keepDays + 1) * 86_400_000
    await webhooks.tick()
    assert.equal((await events(acct)).length, 0, 'a delivered event older than the month is deleted')
  }
)
