/**
 * #804 F-S1-009 — a deployment with no `MAIL` value still boots, and a mail it did not send is
 * reported as NOT sent.
 *
 * Without `MAIL` the transport is the console one. Outside the guarded laptop mode
 * (`LOCAL_LOGIN_PREVIEW`) it used to answer every send as a success and write the whole letter,
 * sign-in code included, to stdout: the sign-in page said "We sent an email" and nothing left.
 *
 * WHAT THIS FILE RUNS. The real boot (`start` in `src/server.js`, no database, a real socket) for
 * the sign-in door and the lane door, so the path from the environment to the answer is the one a
 * deployment takes; the real `seatsRoutes`/`workspacesRoutes`/`createBetaLogin` over the real
 * transport for the doors that need a seat book.
 *
 * WHAT IT DOES NOT RUN. No PostgreSQL: a seat book is a fixture pool that answers only the
 * statements listed and records any other. No mail provider: Resend is the real transport over a
 * recorded `fetch`. No browser: pages are read as DOM. The whitelist confirmation door
 * (`beta/confirmation.js`) needs a pool with transactions and is not driven here; it is covered
 * only by the transport's own behaviour.
 *
 *   node --test apps/tracy-web/test/mail-unavailable.test.mjs
 */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import http from 'node:http'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'

import { ConfigError, readConfig } from '../src/config.js'
import { generateCode, hashCode } from '../src/identity/otp.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { createBetaLogin } from '../src/lib/beta-login.js'
import { translate, WEB_LANGUAGES } from '../src/lib/i18n/index.js'
import { mintSession } from '../src/lib/session.js'
import * as emails from '../src/mail/emails.js'
import { consoleTransport, resendTransport, transportFor } from '../src/mail/transport.js'
import { actingEditor, actingOwner } from '../src/seats/roles.js'
import { seatsRoutes } from '../src/seats/route.js'
import { accountByEmail, ensureAccount, grantFor } from '../src/seats/store.js'
import { start } from '../src/server.js'
import { workspacesRoutes } from '../src/workspaces/route.js'

const ORIGIN = 'http://tracy.test'
const ACTOR_SECRET = 'mail-unavailable-actor-secret'
const NOW = 1_790_000_000_000
const SITE = 'acme.test'

const BASE_ENV = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: ACTOR_SECRET,
  PORT: '0'
}

const {
  inviteMail,
  addedToWorkspace,
  joinRequestMail,
  teamInviteMail,
  removalCodeMail,
  signInCodeMail,
  betaMail
} = emails

/** Everything the process wrote, as one string per call — what `docker logs` would hold. */
function recorder() {
  const lines = []
  const write = (...args) => void lines.push(args.map(String).join(' '))
  return { lines, log: { log: write, warn: write, error: write }, text: () => lines.join('\n') }
}

/** Nothing a letter carries may reach the log: no six digits in a row, no letter, no recipient. */
function assertNoLetterIn(logText, ...secrets) {
  assert.doesNotMatch(logText, /\[mail\] to=/, 'no letter header in the log')
  assert.doesNotMatch(logText, /\b\d{6}\b/, 'no sign-in code in the log')
  assert.doesNotMatch(logText, /sign-in code|invited you|\/invite\//i, 'no letter text in the log')
  for (const secret of secrets) assert.ok(!logText.includes(secret), `the log does not carry ${secret}`)
}

const notConfiguredLines = (lines) => lines.filter((line) => /MAIL is not configured/.test(line))

/** Boot the real service on a free port with no database, and speak HTTP to it as `tracy.test`. */
async function boot(env) {
  const out = recorder()
  const running = await start({ env: { ...BASE_ENV, ...env }, log: out.log })
  const request = (path, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: running.port, path, method, headers: { host: 'tracy.test', ...headers } },
        (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              text: Buffer.concat(chunks).toString('utf8')
            })
          )
        }
      )
      req.on('error', reject)
      req.setTimeout(10_000, () => req.destroy(new Error('request timed out')))
      if (body !== undefined) req.write(body)
      req.end()
    })
  return {
    out,
    close: running.close,
    json: (path, body, headers = {}) =>
      request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      }),
    form: (path, fields, headers = {}) =>
      request(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: ORIGIN,
          'sec-fetch-site': 'same-origin',
          ...headers
        },
        body: new URLSearchParams(fields).toString()
      }),
    get: (path) => request(path)
  }
}

/**
 * The one step of the sign-in page a reader sees. The page always carries both steps and hides one
 * with `hidden`, so the text of the whole page proves nothing about what was shown.
 */
function shownStep(html) {
  const { document } = parseHTML(html)
  const steps = [...document.querySelectorAll('#email-step, #code-step')]
  assert.equal(steps.length, 2, 'the page carries its two steps')
  const visible = steps.filter((step) => !step.hasAttribute('hidden'))
  assert.equal(visible.length, 1, 'exactly one step is shown')
  const [step] = visible
  const alert = [...step.querySelectorAll('[role="alert"]')].find((node) => !node.hasAttribute('hidden'))
  // The sentence sits in the alert's `…-text` span, beside a decorative mark.
  const sentence = alert?.querySelector('[id$="-text"]')?.textContent.trim() ?? ''
  return { id: step.getAttribute('id'), step, text: step.textContent, alert: sentence }
}

function actor(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
    'base64url'
  )
  return `v1.${payload}.${createHmac('sha256', ACTOR_SECRET).update(payload).digest('base64url')}`
}

/** The ways a deployment ends up without a mail provider and without the laptop mode. */
const UNCONFIGURED = {
  'MAIL unset': {},
  'MAIL empty': { MAIL: '' },
  'MAIL blank, preview 0': { MAIL: '', LOCAL_LOGIN_PREVIEW: '0' },
  'MAIL=console': { MAIL: 'console' },
  'MAIL unset in production': { NODE_ENV: 'production' }
}

// ── The transport itself ──────────────────────────────────────────────────────────────────────

const LETTER = {
  to: 'person@example.test',
  subject: '482913 is your Tracy sign-in code',
  text: 'Your Tracy sign-in code is 482913.',
  html: '<p>482913</p>'
}

test('F-S1-009: the console transport outside local preview refuses the send and logs no letter', async () => {
  for (const make of [
    (log) => transportFor({ kind: 'console' }, log),
    (log) => transportFor({ kind: 'console' }, log, { localPreview: false }),
    (log) => consoleTransport(log),
    (log) => consoleTransport(log, { localPreview: false })
  ]) {
    const lines = []
    const transport = make((line) => void lines.push(String(line)))
    assert.equal(transport.available, false)
    await assert.rejects(() => transport.send(LETTER))
    assert.equal(lines.length, 1, 'one line')
    assert.match(lines[0], /MAIL is not configured/)
    assert.doesNotMatch(lines[0], /\n/)
    assertNoLetterIn(lines.join('\n'), LETTER.to, '482913')
  }
})

test('F-S1-009: a recipient or subject made of markup and control characters never reaches the unavailable line', async () => {
  const lines = []
  const transport = transportFor({ kind: 'console' }, (line) => void lines.push(String(line)))
  const hostile = {
    to: 'x@example.test\n[mail] to=forged@example.test',
    subject: '<script>alert(1)</script>\r\n\u001b[31m654321',
    text: 'body 654321',
    html: '<img src=x onerror=alert(1)>'
  }
  await assert.rejects(() => transport.send(hostile))
  assert.equal(lines.length, 1)
  for (const piece of ['\r', '\n', '\u001b', 'forged', 'script', '654321', 'onerror'])
    assert.ok(!lines[0].includes(piece), `the line does not carry ${JSON.stringify(piece)}`)
})

test('F-S1-009: with local preview on, the console transport writes the letter exactly as before', async () => {
  for (const make of [
    (log) => transportFor({ kind: 'console' }, log, { localPreview: true }),
    (log) => consoleTransport(log, { localPreview: true })
  ]) {
    const lines = []
    const transport = make((line) => void lines.push(String(line)))
    assert.equal(transport.available, true)
    assert.equal(await transport.send(LETTER), undefined)
    assert.deepEqual(lines, [
      `[mail] to=${LETTER.to} subject=${JSON.stringify(LETTER.subject)}\n${LETTER.text}`
    ])
  }
})

test('F-S1-009: the Resend transport is available, sends text and HTML, and a provider refusal is not a success', async () => {
  const payloads = []
  const answers = [
    () => Response.json({ id: 'provider-id' }),
    () => new Response('nope', { status: 422 }),
    () => {
      throw new Error('network down')
    }
  ]
  const transport = transportFor({
    kind: 'resend',
    key: 'fixture-key',
    from: 'Tracy <noreply@tracy.test>',
    fetchImpl: async (_url, options) => {
      payloads.push(JSON.parse(options.body))
      return answers[payloads.length - 1]()
    }
  })
  // A real-looking address: the deployed transport drops reserved test domains (next test).
  const letter = { ...LETTER, to: 'person@tracy.ai' }
  assert.equal(transport.available, true)
  await transport.send(letter)
  assert.equal(payloads[0].text, LETTER.text)
  assert.equal(payloads[0].html, LETTER.html)
  await assert.rejects(() => transport.send(letter), /resend answered 422/)
  await assert.rejects(() => transport.send(letter), /network down/)
  // An acknowledgement that names no message is not one.
  const silent = resendTransport({
    key: 'k',
    from: 'f',
    fetchImpl: async () => Response.json({})
  })
  await assert.rejects(() => silent.send({ ...LETTER, idempotencyKey: 'job-1' }), /acknowledgement missing/)
})

// ── Configuration ─────────────────────────────────────────────────────────────────────────────

test('F-S1-009: a missing or empty MAIL is still a readable configuration, never a boot error', () => {
  for (const [name, env] of Object.entries(UNCONFIGURED)) {
    const config = readConfig({ ...BASE_ENV, ...env })
    assert.deepEqual(config.mail, { kind: 'console' }, name)
    assert.equal(config.localLoginPreview, false, name)
  }
})

test('F-S1-009: local preview is still refused in production, off a local origin, or beside Resend', () => {
  const refused = {
    production: { LOCAL_LOGIN_PREVIEW: '1', NODE_ENV: 'production' },
    'public https origin': { LOCAL_LOGIN_PREVIEW: '1', TRACY_ORIGIN: 'https://cowork.example.com' },
    'https subdomain': { LOCAL_LOGIN_PREVIEW: '1', TRACY_ORIGIN: 'https://site.tracy.test' },
    'public origin': { LOCAL_LOGIN_PREVIEW: '1', TRACY_ORIGIN: 'http://cowork.example.com' },
    resend: { LOCAL_LOGIN_PREVIEW: '1', MAIL: 'resend:key', MAIL_FROM: 'Tracy <a@tracy.test>' }
  }
  for (const [name, env] of Object.entries(refused)) {
    assert.throws(() => readConfig({ ...BASE_ENV, ...env }), ConfigError, name)
  }
  assert.equal(
    readConfig({ ...BASE_ENV, LOCAL_LOGIN_PREVIEW: '1', TRACY_ORIGIN: 'https://tracy.test' })
      .localLoginPreview,
    true,
    'the guarded HTTPS stand supports microphone access'
  )
  assert.throws(() => readConfig({ ...BASE_ENV, MAIL: 'smtp:somewhere' }), ConfigError)
  assert.throws(() => readConfig({ ...BASE_ENV, MAIL: 'resend:key' }), ConfigError, 'MAIL_FROM is required')
})

// ── The sign-in door, through the real boot ───────────────────────────────────────────────────

for (const [name, env] of Object.entries(UNCONFIGURED)) {
  test(`F-S1-009: sign-in answers that the mail was not sent (${name})`, async () => {
    const app = await boot(env)
    try {
      const email = 'person@example.test'
      const answered = await app.json('/login', { email })
      assert.equal(answered.status, 503)
      assert.deepEqual(JSON.parse(answered.text), { code: 'MAIL_UNAVAILABLE' })

      const page = await app.form('/login', { email, next: '/' })
      assert.equal(page.status, 503)
      const shown = shownStep(page.text)
      assert.equal(shown.id, 'email-step', 'the "We sent an email" step stays hidden')
      assert.equal(shown.alert, 'Could not send a code. Try again.', 'the existing failure sentence')
      assert.doesNotMatch(shown.text, /We sent an email/)
      assert.equal(shown.step.querySelector('input[type="email"][name="email"]').getAttribute('value'), email)

      assertNoLetterIn(app.out.text(), email)
      assert.ok(notConfiguredLines(app.out.lines).length >= 1, 'the log says mail is not configured')
    } finally {
      await app.close()
    }
  })
}

test('F-S1-009: the sign-in failure sentence is shown in each of the eight languages', async () => {
  const app = await boot({})
  try {
    for (const lang of WEB_LANGUAGES) {
      const page = await app.form(`/login?lang=${lang}`, { email: 'person@example.test', next: '/' })
      assert.equal(page.status, 503, lang)
      const shown = shownStep(page.text)
      assert.equal(shown.id, 'email-step', lang)
      assert.equal(shown.alert, translate(lang, 'login.sendFailed'), lang)
      assert.ok(!shown.text.includes(translate(lang, 'login.sentTo', { email: 'person@example.test' })), lang)
    }
  } finally {
    await app.close()
  }
})

test('F-S1-009: the answer is the same for every address and for a request past the hourly cap', async () => {
  const app = await boot({})
  try {
    // Seven asks for one inbox: past the per-inbox cap of five, and still the same answer.
    for (let i = 0; i < 7; i++) {
      const res = await app.json('/login', { email: 'same@example.test' })
      assert.equal(res.status, 503, `ask ${i + 1}`)
      assert.deepEqual(JSON.parse(res.text), { code: 'MAIL_UNAVAILABLE' })
    }
    for (const email of ['nobody@example.test', 'owner@example.test']) {
      const res = await app.json('/login', { email })
      assert.equal(res.status, 503)
      assert.deepEqual(JSON.parse(res.text), { code: 'MAIL_UNAVAILABLE' })
    }
    // A malformed address is still its own refusal, before any of this.
    assert.equal((await app.json('/login', { email: 'not-an-address' })).status, 400)
    assertNoLetterIn(app.out.text(), 'same@example.test')
  } finally {
    await app.close()
  }
})

test('F-S1-009: nobody can sign in with a code that was never sent', async () => {
  const app = await boot({})
  try {
    await app.json('/login', { email: 'person@example.test' })
    for (const code of ['000000', '123456']) {
      const res = await app.json('/verify', { email: 'person@example.test', code })
      assert.equal(res.status, 401)
      assert.equal(res.headers['set-cookie'], undefined)
    }
  } finally {
    await app.close()
  }
})

// ── The beta gate must not hide it ────────────────────────────────────────────────────────────

const BETA_ENV = {
  BETA_GATE: 'on',
  AMEMBER_API_KEY: 'fixture-key',
  BETA_WAITLIST_URL: 'https://tracy.ai/whitelist/'
}

test('F-S1-009: with the beta gate on, sign-in and the lane still answer that the mail was not sent', async () => {
  const fetched = []
  const out = recorder()
  const running = await start({
    env: { ...BASE_ENV, ...BETA_ENV },
    log: out.log,
    deps: {
      fetchImpl: async (url) => {
        fetched.push(String(url))
        return Response.json({ ok: true, access: true })
      }
    }
  })
  const post = (path, body, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: running.port,
          path,
          method: 'POST',
          headers: { host: 'tracy.test', 'content-type': 'application/json', ...headers }
        },
        (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () =>
            resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') })
          )
        }
      )
      req.on('error', reject)
      req.end(JSON.stringify(body))
    })
  try {
    // Past the cap too: the gate's quiet `{ok:true}` over the cap must not cover a missing provider.
    for (let i = 0; i < 7; i++) {
      const res = await post('/login', { email: 'member@example.test' })
      assert.equal(res.status, 503, `ask ${i + 1}`)
      assert.deepEqual(JSON.parse(res.text), { code: 'MAIL_UNAVAILABLE' })
    }
    for (let i = 0; i < 7; i++) {
      const res = await post(
        '/auth/otp/start',
        { email: 'member@example.test' },
        { 'x-tracy-actor': actor('lane@example.test') }
      )
      assert.equal(res.status, 503, `lane ask ${i + 1}`)
      assert.deepEqual(JSON.parse(res.text), { code: 'MAIL_UNAVAILABLE' })
    }
    // Nothing was queued, so the membership service is never asked and no code is ever written.
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(fetched, [])
    assertNoLetterIn(out.text(), 'member@example.test')
  } finally {
    await running.close()
  }
})

test('F-S1-009: a queued beta sign-in whose mail cannot be sent is kept for retry, with no letter in the log', async () => {
  const out = recorder()
  const store = memoryIdentityStore()
  const config = readConfig({ ...BASE_ENV, ...BETA_ENV })
  const beta = createBetaLogin({
    access: {
      enabled: true,
      decide: async () => ({ status: 'allow', badge: 'member', plans: [], gate: true })
    },
    identity: store,
    mail: { send: transportFor(config.mail, out.log.log).send, signInCodeMail, betaMail },
    otp: { generateCode, hashCode },
    config,
    signal: { record: async () => null },
    now: () => NOW,
    log: out.log
  })
  try {
    await assert.rejects(() =>
      beta.sendOutcome('member@example.test', { status: 'allow', badge: 'member', plans: [], gate: true })
    )
    await beta.enqueue('member@example.test')
    await beta.drain()
    assert.ok(out.lines.some((line) => /delivery failed; queued for retry/.test(line)))
    assertNoLetterIn(out.text(), 'member@example.test')
  } finally {
    await beta.stop()
  }
})

test('F-S1-009: a slow send for a replaced beta request does not drop the request that replaced it', async () => {
  const releases = []
  const payloads = []
  const transport = resendTransport({
    key: 'fixture-key',
    from: 'Tracy <noreply@tracy.test>',
    fetchImpl: (_url, options) =>
      new Promise((resolve) => {
        payloads.push(JSON.parse(options.body))
        releases.push(() => resolve(Response.json({ id: `id-${payloads.length}` })))
      })
  })
  let clock = NOW
  const config = readConfig({ ...BASE_ENV, ...BETA_ENV })
  const beta = createBetaLogin({
    access: {
      enabled: true,
      decide: async () => ({ status: 'allow', badge: 'member', plans: [], gate: true })
    },
    identity: memoryIdentityStore(),
    mail: { send: transport.send, signInCodeMail, betaMail },
    otp: { generateCode, hashCode },
    config,
    signal: { record: async () => null },
    now: () => clock,
    log: { warn() {}, log() {} }
  })
  const until = async (condition) => {
    for (let i = 0; i < 200 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5))
    assert.ok(condition(), 'the awaited step happened')
  }
  try {
    await beta.enqueue('member@example.test')
    const first = beta.drain()
    await until(() => releases.length === 1)
    // A second press replaces the request while the first letter is still on the wire.
    await beta.enqueue('member@example.test')
    releases[0]()
    await first
    clock += 1
    const second = beta.drain()
    await until(() => releases.length === 2)
    releases[1]()
    await second
    assert.equal(payloads.length, 2, 'the replacing request was still delivered')
  } finally {
    await beta.stop()
  }
})

// ── The lane door ─────────────────────────────────────────────────────────────────────────────

for (const [name, env] of Object.entries(UNCONFIGURED)) {
  test(`F-S1-009: the lane door answers 503 MAIL_UNAVAILABLE (${name})`, async () => {
    const app = await boot(env)
    try {
      const signed = { 'x-tracy-actor': actor('lane@example.test') }
      const res = await app.json('/auth/otp/start', { email: 'editor@example.test' }, signed)
      assert.equal(res.status, 503)
      assert.deepEqual(JSON.parse(res.text), { code: 'MAIL_UNAVAILABLE' })
      const verify = await app.json(
        '/auth/otp/verify',
        { email: 'editor@example.test', code: '000000' },
        signed
      )
      assert.equal(verify.status, 401, 'no code was written to guess at')
      // The caller is still proven first: an unsigned ask learns nothing about the configuration.
      assert.equal((await app.json('/auth/otp/start', { email: 'editor@example.test' })).status, 401)
      assertNoLetterIn(app.out.text(), 'editor@example.test')
    } finally {
      await app.close()
    }
  })
}

// ── Local preview: exactly as before ──────────────────────────────────────────────────────────

test('F-S1-009: with local preview on, sign-in works from the log and the page, as it did', async () => {
  const app = await boot({ LOCAL_LOGIN_PREVIEW: '1', NODE_ENV: 'development' })
  try {
    const email = 'person@example.test'
    const answered = await app.json('/login', { email })
    assert.equal(answered.status, 200)
    const body = JSON.parse(answered.text)
    assert.equal(body.ok, true)
    assert.match(body.localCode, /^\d{6}$/)
    const logged = app.out.lines.find((line) => line.startsWith(`[mail] to=${email} subject=`))
    assert.ok(logged, 'the letter is in the log')
    assert.ok(logged.includes(body.localCode), 'with its code')
    assert.deepEqual(notConfiguredLines(app.out.lines), [])

    const verified = await app.json('/verify', { email, code: body.localCode })
    assert.equal(verified.status, 200)
    assert.match(String(verified.headers['set-cookie']), /tracy_sess=/)

    const page = await app.form('/login', { email, next: '/' })
    assert.equal(page.status, 200)
    const shown = shownStep(page.text)
    assert.equal(shown.id, 'code-step', 'the code step is shown')
    assert.equal(shown.alert, '')
    assert.match(shown.step.querySelector('#local-code').textContent, /^\d{6}$/)

    const lane = await app.json(
      '/auth/otp/start',
      { email: 'editor@example.test' },
      { 'x-tracy-actor': actor('lane@example.test') }
    )
    assert.equal(lane.status, 200)
    assert.deepEqual(JSON.parse(lane.text), { ok: true })
  } finally {
    await app.close()
  }
})

// ── Doors over a seat book ────────────────────────────────────────────────────────────────────

const config = readConfig(BASE_ENV)

function fixturePool(fixtures) {
  const seen = []
  const unexpected = []
  return {
    seen,
    unexpected,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim()
      seen.push({ text, params })
      for (const [pattern, answer] of fixtures) {
        if (pattern.test(text)) return { rows: await answer(params) }
      }
      unexpected.push(text)
      throw new Error(`fixturePool: unexpected statement: ${text}`)
    }
  }
}

const RATE = [/^insert into rate_bucket\b/, () => [{ count: 1 }]]
// The reads the #809 notifier adds to these doors: an actor's name for the Inbox row and the
// site's team for the rows it writes, and the invitee's chosen language for the letter. This file pins the mail and the seat writes, not them.
const NOTIFY_READS = [
  [
    /^select email, language from account where email = any\(\$1::text\[\]\) and language is not null$/,
    () => []
  ],
  [/^select id, email, display_name from account where id = \$1$/, () => []],
  [
    /^select s\.\*, a\.email as account_email, a\.display_name as account_display_name, a\.avatar_url as account_avatar_url from seat s join account a on a\.id = s\.account_id where s\.site_key = \$1\b/,
    () => []
  ]
]

async function call(app, path, { method = 'GET', email, body } = {}) {
  const cookie = email ? `tracy_sess=${await mintSession(email, config.sessionSecret, Date.now())}` : null
  return app.fetch(
    new Request(new URL(path, ORIGIN), {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  )
}

/** The transport a deployment without `MAIL` gets, with what it wrote. */
function unconfigured() {
  const out = recorder()
  return {
    out,
    send: transportFor(config.mail, out.log.log, { localPreview: config.localLoginPreview }).send
  }
}

test('F-S1-009: a team invitation keeps the seat and answers notified:false', async () => {
  const boss = { id: 'acc-boss' }
  const invitee = { id: 'acc-new' }
  const pool = fixturePool([
    RATE,
    ...NOTIFY_READS,
    [
      /^insert into account \(email\) values \(\$1\)/,
      ([email]) => [email === 'boss@acme.test' ? boss : invitee]
    ],
    [
      /^select \* from seat where account_id = \$1 and site_key = \$2 and revoked_at is null and declined_at is null and accepted_at is not null$/,
      ([accountId]) =>
        accountId === boss.id
          ? [{ account_id: boss.id, site_key: SITE, role: 'owner', accepted_at: new Date(NOW) }]
          : []
    ],
    [/^select \* from seat where account_id = \$1 and site_key = \$2$/, () => []],
    [/^select \* from seat where site_key = \$1 and account_id = \$2$/, () => []],
    [
      /^insert into seat \(site_key, account_id, role, granted_by, granted_at, accepted_at, requested_at, created_by_proof\)/,
      (p) => [{ site_key: p[0], account_id: p[1], role: p[2] }]
    ]
  ])
  const mail = unconfigured()
  const app = seatsRoutes({
    pool,
    config,
    now: () => NOW,
    mail: { send: mail.send, inviteMail, addedToWorkspace, joinRequestMail, teamInviteMail },
    sites: { labelOf: async () => 'acme' }
  })
  const res = await call(app, '/api/team/invite', {
    method: 'POST',
    email: 'boss@acme.test',
    body: { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE] }
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.results[0].notified, false)
  assert.deepEqual(pool.unexpected, [])
  assert.ok(
    pool.seen.some((q) => q.text.startsWith('insert into seat ')),
    'the seat was still written'
  )
  assert.equal(notConfiguredLines(mail.out.lines).length, 1)
  assertNoLetterIn(mail.out.text(), 'new@acme.test')
})

test('F-S1-009: a join request is still recorded, and the answer promises no mail', async () => {
  const admin = (id, email, role) => ({
    site_key: SITE,
    account_id: id,
    role,
    accepted_at: new Date(NOW),
    revoked_at: null,
    declined_at: null,
    granted_at: new Date(NOW),
    account_email: email,
    account_display_name: null
  })
  const pool = fixturePool([
    RATE,
    ...NOTIFY_READS,
    [/^insert into account \(email\) values \(\$1\)/, () => [{ id: 'acc-asker' }]],
    [
      /^select account_id from seat where site_key = \$1 and role = 'owner'/,
      () => [{ account_id: 'acc-owner' }]
    ],
    [/^select \* from seat where site_key = \$1 and account_id = \$2$/, () => []],
    [/^select \* from seat where account_id = \$1 and site_key = \$2$/, () => []],
    [
      /^insert into seat \(site_key, account_id, role, granted_by, granted_at, requested_at\)/,
      (p) => [{ site_key: p[0], account_id: p[1] }]
    ],
    [
      /^select s\.\*, a\.email as account_email, a\.display_name as account_display_name,\s+a\.avatar_url as account_avatar_url from seat s join account a/,
      () => [admin('acc-owner', 'owner@acme.test', 'owner'), admin('acc-admin', 'admin@acme.test', 'admin')]
    ]
  ])
  const mail = unconfigured()
  const app = seatsRoutes({
    pool,
    config,
    now: () => NOW,
    mail: { send: mail.send, inviteMail, addedToWorkspace, joinRequestMail, teamInviteMail },
    sites: { labelOf: async () => 'acme' }
  })
  const res = await call(app, `/me/sites/${SITE}/join-request`, { method: 'POST', email: 'asker@acme.test' })
  assert.equal(res.status, 201)
  assert.deepEqual(await res.json(), { requested: true, already: false })
  assert.deepEqual(pool.unexpected, [])
  assert.ok(
    pool.seen.some((q) => q.text.startsWith('insert into seat ')),
    'the request is on the book'
  )
  assertNoLetterIn(mail.out.text(), 'owner@acme.test', 'admin@acme.test', 'asker@acme.test')
})

const STAFF_WORKSPACE = { id: 'ws_tracy', display_name: 'Tracy' }

function staffFixtures({ target = null } = {}) {
  const boss = { id: 'acc-boss', email: 'boss@tracy.test', display_name: null, avatar_url: null }
  const invitee = { id: 'acc-new', email: 'new@tracy.test', display_name: null, avatar_url: null }
  let granted = false
  const member = (account, role, acceptedAt) => ({
    workspace_id: STAFF_WORKSPACE.id,
    account_id: account.id,
    role,
    accepted_at: acceptedAt,
    revoked_at: null,
    declined_at: null,
    requested_at: null,
    granted_at: new Date(NOW),
    account_email: account.email,
    account_display_name: null
  })
  return [
    RATE,
    ...NOTIFY_READS,
    [
      /^select id, email, display_name, avatar_url from account where email = \$1$/,
      ([email]) => (email === boss.email ? [boss] : [])
    ],
    [
      /^select sw\.role from seat_workspace sw join workspace w .* limit 1$/,
      ([id]) => (id === boss.id ? [{ role: 'owner' }] : [])
    ],
    [/^select id, display_name from workspace where kind = 'tracy_admin' limit 2$/, () => [STAFF_WORKSPACE]],
    [
      /^select sw\.\*, a\.email as account_email, a\.display_name as account_display_name from seat_workspace sw/,
      () => [
        ...(target ? [member(target, 'developer', new Date(NOW))] : []),
        ...(granted ? [member(invitee, 'developer', null)] : [])
      ]
    ],
    [/^insert into account \(email\) values \(\$1\)/, () => [{ id: invitee.id }]],
    [
      /^insert into seat_workspace \(workspace_id, account_id, role, granted_by, granted_at, accepted_at, requested_at\)/,
      () => {
        granted = true
        return [{ workspace_id: STAFF_WORKSPACE.id, account_id: invitee.id, role: 'developer' }]
      }
    ],
    [/^select site_key from workspace_site where workspace_id = \$1 order by site_key asc$/, () => []]
  ]
}

function workspacesApp(pool, mail) {
  return workspacesRoutes({
    pool,
    config,
    now: () => NOW,
    mail: { send: mail.send, inviteMail, addedToWorkspace, removalCodeMail },
    seats: {
      accountByEmail,
      ensureAccount,
      grantFor,
      actingEditor,
      actingOwner,
      liveSiteKeys: async () => []
    }
  })
}

test('F-S1-009: a staff invitation keeps the grant and answers 202 notified:false', async () => {
  const pool = fixturePool(staffFixtures())
  const mail = unconfigured()
  const res = await call(workspacesApp(pool, mail), '/tracy-admin/members', {
    method: 'POST',
    email: 'boss@tracy.test',
    body: { email: 'new@tracy.test', role: 'developer' }
  })
  assert.deepEqual(pool.unexpected, [])
  assert.equal(res.status, 202)
  assert.equal((await res.json()).notified, false)
  assert.ok(
    pool.seen.some((q) => q.text.startsWith('insert into seat_workspace ')),
    'the grant was written'
  )
  assertNoLetterIn(mail.out.text(), 'new@tracy.test')
})

test('F-S1-009: a removal code that cannot be mailed answers 502 MAIL_NOT_SENT and stays out of the log', async () => {
  const target = { id: 'acc-target', email: 'target@tracy.test' }
  const pool = fixturePool(staffFixtures({ target }))
  const mail = unconfigured()
  const res = await call(workspacesApp(pool, mail), '/tracy-admin/members/acc-target/code', {
    method: 'POST',
    email: 'boss@tracy.test'
  })
  assert.deepEqual(pool.unexpected, [])
  assert.equal(res.status, 502)
  assert.deepEqual(await res.json(), { code: 'MAIL_NOT_SENT' })
  assertNoLetterIn(mail.out.text(), 'target@tracy.test', 'boss@tracy.test')
})

test('spam audit 05/10/2026: the deployed Resend transport sends nothing to a reserved test domain', async () => {
  const calls = []
  const lines = []
  const transport = transportFor(
    {
      kind: 'resend',
      key: 'fixture-key',
      from: 'Tracy <noreply@tracy.test>',
      fetchImpl: async (_url, options) => {
        calls.push(JSON.parse(options.body).to)
        return Response.json({ id: 'provider-id' })
      }
    },
    (line) => lines.push(line)
  )
  for (const to of [
    'e2e-r1abc-owner@example.test',
    'a@example.org',
    'a@sub.example.com',
    'a@x.invalid',
    'a@host.localhost',
    'A@EXAMPLE.NET'
  ])
    assert.equal(await transport.send({ ...LETTER, to }), undefined, to)
  assert.equal(
    await transport.send({ ...LETTER, to: 'a@example.test', idempotencyKey: 'k' }),
    'not-sent:reserved-domain'
  )
  assert.deepEqual(calls, [])
  assert.ok(
    lines.every((line) => line.startsWith('[mail] not sent: reserved test domain') && !line.includes('@'))
  )
  // Lookalikes are real domains and still go out.
  for (const to of ['a@notexample.com', 'a@example.com.vn', 'a@gmail.com', 'a@tracy.ai'])
    await transport.send({ ...LETTER, to })
  assert.deepEqual(calls, ['a@notexample.com', 'a@example.com.vn', 'a@gmail.com', 'a@tracy.ai'])
})
