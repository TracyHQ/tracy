/**
 * #794 — what Tracy's own mail and the pages around it say must be what the code does.
 *
 *   F-S1-005  every statement of how long a sign-in code lives is derived from `CODE_TTL_MS`;
 *   F-S1-006  the "request sent" page promises nothing no code path delivers;
 *   F-S1-010  the Tracy staff invitation carries the link its own door answers;
 *   F-S1-017  the four letters whose HTML was built and dropped now reach the provider whole.
 *
 * WHAT THIS FILE RUNS. The real routers (`seatsRoutes`, `workspacesRoutes`, `opsRoutes`,
 * `identityRoutes`, `laneRoutes`) and the real Resend transport, with `fetch` replaced by a
 * recorder. The database is `fixturePool`: it answers only the statements a test lists, and any
 * other statement is refused AND remembered, so a route that quietly reads or writes something
 * else fails the test instead of passing on an empty answer.
 *
 * WHAT IT DOES NOT RUN. PostgreSQL (constraints, triggers and conflict clauses are not exercised),
 * a real mail provider, and a mail client rendering the HTML.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { readConfig } from '../src/config.js'
import { identityRoutes } from '../src/identity/route.js'
import { LOGIN_RATE_LIMITED_MESSAGE, loginPage } from '../src/identity/pages.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { laneRoutes } from '../src/lanes/route.js'
import { translator, WEB_LANGUAGES } from '../src/lib/i18n/index.js'
import { en } from '../src/lib/i18n/strings.js'
import { loginMailLimiter } from '../src/lib/login-mail-rate.js'
import { CODE_TTL_MS, LOGIN_MAIL_LIMIT_PER_IP_PER_HOUR, MAX_ATTEMPTS } from '../src/lib/policy.js'
import { mintSession } from '../src/lib/session.js'
import * as emails from '../src/mail/emails.js'
import { resendTransport } from '../src/mail/transport.js'
import { opsRoutes } from '../src/ops/route.js'
import { joinPage } from '../src/seats/pages.js'
import { seatsRoutes } from '../src/seats/route.js'
import { actingEditor, actingOwner } from '../src/seats/roles.js'
import { accountByEmail, ensureAccount, grantFor } from '../src/seats/store.js'
import { workspacesRoutes } from '../src/workspaces/route.js'
import { acceptWorkspaceGrant, tracyAdminWorkspace } from '../src/workspaces/store.js'
// The Team tab's side of the invitation rule (#798). A namespace import: the last test names what it needs.
import * as teamRoster from '../../../packages/core/tracy-core/src/team/roster.ts'

/** Results without the inviter's own `inviteUrl` (spam hints D2), which these tests check apart. */
const withoutLink = (results) => results.map(({ inviteUrl: _link, ...rest }) => rest)

/** Letter HTML as the reader sees it: the invisible joiners that stop autolinks taken out. */
const visible = (html) => String(html).replaceAll('&zwnj;', '')

const ORIGIN = 'https://tracy.test'
const MINUTES = CODE_TTL_MS / 60_000
const NOW = 1_790_000_000_000

const config = readConfig({
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})

const { inviteMail, addedToWorkspace, joinRequestMail, teamInviteMail, removalCodeMail, signInCodeMail } =
  emails

/**
 * A pool that answers only what `fixtures` list: `[pattern, (params) => rows]`, first match wins.
 * Every statement is recorded in `seen`; one nothing matches is recorded in `unexpected` and
 * rejected — a route may catch the rejection, so tests assert on the list.
 */
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

/** The real Resend transport over a recorded `fetch`; `answer` decides what the provider says. */
function provider(answer = () => Response.json({ id: 'provider-id' })) {
  const payloads = []
  const transport = resendTransport({
    key: 'fixture-key',
    from: 'Tracy <noreply@tracy.test>',
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body)
      payloads.push(payload)
      return answer(payload)
    }
  })
  return { payloads, send: transport.send }
}

const sessionOf = (email) => mintSession(email, config.sessionSecret, Date.now())

async function call(app, path, { method = 'GET', email, body, headers = {} } = {}) {
  const cookie = email ? `tracy_sess=${await sessionOf(email)}` : null
  return app.fetch(
    new Request(new URL(path, ORIGIN), {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  )
}

// ── F-S1-005 — one lifetime, said the same way everywhere ─────────────────────────────────────────

const LIFETIME_KEYS = ['login.codeLifetime', 'login.localCode', 'mail.signInPreheader', 'mail.signInValid']

test('F-S1-005: every sign-in lifetime string takes its number from a placeholder, in all eight languages', () => {
  for (const lang of WEB_LANGUAGES) {
    const t = translator(lang)
    for (const key of LIFETIME_KEYS) {
      const raw = t(key)
      assert.match(raw, /\{minutes\}/, `${lang} ${key} must carry {minutes}, got: ${raw}`)
      const said = t(key, { minutes: 7, code: '123456' })
      assert.match(said, /(^|\D)7(\D|$)/, `${lang} ${key} must print the number it is given`)
      assert.doesNotMatch(said, /\{[a-zA-Z]+\}/, `${lang} ${key} left a placeholder unfilled`)
      assert.doesNotMatch(said, /(^|\D)10(\D|$)/, `${lang} ${key} still hard-codes ten`)
    }
  }
})

test('F-S1-005: the login page, the local preview and the mail all state CODE_TTL_MS', () => {
  for (const lang of WEB_LANGUAGES) {
    const t = translator(lang)
    const page = loginPage({
      next: '/',
      email: 'a@x.test',
      origin: ORIGIN,
      step: 'code',
      localPreview: true,
      localCode: '123456',
      lang
    })
    assert.ok(
      page.includes(t.html('login.codeLifetime', { minutes: MINUTES })),
      `${lang}: code step lifetime`
    )
    assert.ok(
      page.includes(
        t.html('login.localCode', { code: '<strong id="local-code">123456</strong>', minutes: MINUTES })
      ),
      `${lang}: local preview lifetime`
    )
    assert.doesNotMatch(page, /\{minutes\}/, `${lang}: login page left {minutes} unfilled`)

    const mail = signInCodeMail('123456', lang)
    assert.ok(mail.text.includes(t('mail.signInValid', { minutes: MINUTES })), `${lang}: text lifetime`)
    assert.ok(mail.html.includes(t.html('mail.signInValid', { minutes: MINUTES })), `${lang}: html lifetime`)
    assert.ok(
      mail.html.includes(t.html('mail.signInPreheader', { code: '123456', minutes: MINUTES })),
      `${lang}: preheader lifetime`
    )
    assert.doesNotMatch(mail.text + mail.html, /\{minutes\}|\{\{/, `${lang}: mail left a slot unfilled`)
  }
  const english = loginPage({ next: '/', email: 'a@x.test', origin: ORIGIN, step: 'code' })
  assert.match(english, new RegExp(`The code works for ${MINUTES} minutes\\.`))
  assert.doesNotMatch(english, /a few minutes/)
})

/**
 * The whole of what an over-the-cap request is told (#794, class "unconditional code validity"):
 * requests for codes are limited, try again later. The door that answers 429 does not look at the
 * code table, so the sentence says nothing about a code — not that one was sent, exists, still
 * works, has tries left or when it expires — and names no waiting time. The fixture is the exact
 * text per language; a reworded sentence is a change to this table, reviewed against that rule.
 */
const RATE_LIMITED_COPY = {
  en: 'Too many sign-in codes were asked for. Try again later.',
  vi: 'Đã có quá nhiều yêu cầu mã đăng nhập. Hãy thử lại sau.',
  de: 'Es wurden zu viele Anmeldecodes angefordert. Versuchen Sie es später erneut.',
  it: 'Sono stati richiesti troppi codici di accesso. Riprovi più tardi.',
  fr: 'Trop de codes de connexion ont été demandés. Réessayez plus tard.',
  nl: 'Er zijn te veel aanmeldcodes aangevraagd. Probeer het later opnieuw.',
  zh: '请求的登录验证码过多。请稍后再试。',
  es: 'Se solicitaron demasiados códigos de inicio de sesión. Inténtelo de nuevo más tarde.'
}

test('F-S1-005: the rate-limit sentence is the restricted one, stored whole in each of the eight languages', () => {
  assert.deepEqual(Object.keys(RATE_LIMITED_COPY).sort(), [...WEB_LANGUAGES].sort())
  assert.equal(en['login.rateLimited'], RATE_LIMITED_COPY.en)
  for (const lang of WEB_LANGUAGES) {
    const expected = RATE_LIMITED_COPY[lang]
    assert.doesNotMatch(expected, /[{}\d]/, `${lang}: the fixture itself names a slot or a number`)
    if (lang !== 'en') {
      // The stored translation, not what a fallback to English would print.
      const raw = JSON.parse(
        readFileSync(new URL(`../src/lib/i18n/locales/${lang}.json`, import.meta.url), 'utf8')
      )
      assert.equal(raw['login.rateLimited'], expected, `${lang}: stored text`)
      assert.notEqual(raw['login.rateLimited'], RATE_LIMITED_COPY.en, `${lang}: not translated`)
    }
    const t = translator(lang)
    assert.equal(t('login.rateLimited'), expected, `${lang}: translated text`)
    // Handing it a duration changes nothing: there is no slot for one.
    assert.equal(t('login.rateLimited', { minutes: 7, code: '123456' }), expected, `${lang}: takes no number`)
  }
})

test('F-S1-005: every consumer of the rate-limit sentence prints the restricted text', () => {
  assert.equal(LOGIN_RATE_LIMITED_MESSAGE, RATE_LIMITED_COPY.en, 'the exported English message')
  for (const lang of WEB_LANGUAGES) {
    const said = JSON.stringify(RATE_LIMITED_COPY[lang])
    for (const step of ['email', 'code']) {
      const page = loginPage({ next: '/', email: 'a@x.test', origin: ORIGIN, step, lang })
      // One script line serves the first request (email step) and "Send a new code" (code step).
      const line = page.split('\n').find((row) => row.includes('response.status === 429'))
      assert.ok(line, `${lang} ${step}: the script has a 429 branch`)
      assert.ok(
        line.includes(
          `showError(resending ? codeError : emailError, resending ? codeErrorText : emailErrorText, response.status === 429 ? ${said} : `
        ),
        `${lang} ${step}: the first-request and resend branches show the restricted text: ${line}`
      )
      assert.doesNotMatch(page, /\{minutes\}/, `${lang} ${step}: unfilled slot`)
      // A server-rendered error on either step is the same sentence, escaped once.
      const rendered = loginPage({
        next: '/',
        email: 'a@x.test',
        origin: ORIGIN,
        step,
        lang,
        error: translator(lang)('login.rateLimited')
      })
      assert.equal(alertText(rendered), RATE_LIMITED_COPY[lang], `${lang} ${step}: the rendered alert`)
    }
  }
})

const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/** The text of the one visible `role="alert"` block of a sign-in page, entities decoded. */
function alertText(html) {
  const shown = [
    ...html.matchAll(
      /<div class="alert destructive" role="alert" id="([a-z-]+)">.*?<span id="\1-text">(.*?)<\/span>/g
    )
  ]
  assert.equal(shown.length, 1, `expected one visible alert, found ${shown.length}`)
  return shown[0][2].replace(/&(amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity])
}

/**
 * Codes come from the production `generateCode`; only its random source is replaced, for the
 * length of one test (`t.mock`, restored when the test ends), so two codes mailed to one inbox are
 * certain to differ.
 */
function distinctCodes(t) {
  let draw = 100_000
  const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
  t.mock.method(globalThis.crypto, 'getRandomValues', (array) => {
    if (!(array instanceof Uint32Array) || array.length !== 1) return original(array)
    draw += 7
    array[0] = draw
    return array
  })
}

/**
 * `/login` and `/verify` over the real memory store and the REAL limiter, with a clock the test
 * moves.
 */
function signInHarness() {
  const clock = { now: NOW }
  const store = memoryIdentityStore()
  const sent = []
  const app = new Hono()
  app.route(
    '/',
    identityRoutes({
      store,
      config,
      now: () => clock.now,
      mail: { send: async (m) => void sent.push(m), signInCodeMail },
      mailRate: loginMailLimiter({ now: () => clock.now })
    })
  )
  const post = (path, fields, { ip, lang = 'en', json = false } = {}) =>
    app.fetch(
      new Request(new URL(`${path}?lang=${lang}`, ORIGIN), {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded',
          origin: ORIGIN,
          'cf-connecting-ip': ip
        },
        body: json ? JSON.stringify(fields) : new URLSearchParams(fields)
      })
    )
  let filler = 0
  return {
    clock,
    store,
    sent,
    ask: (email, options) => post('/login', { email, next: '/' }, options),
    verify: (email, code, options) => post('/verify', { email, code, next: '/' }, options),
    /** The code in the latest mail to `email`. */
    codeFor(email) {
      const mails = sent.filter((m) => m.to === email)
      return mails.at(-1).text.match(/\b\d{6}\b/)[0]
    },
    /** Spend what is left of one client address's hour on other inboxes, one request each. */
    async fill(ip, alreadyAsked) {
      for (let i = alreadyAsked; i < LOGIN_MAIL_LIMIT_PER_IP_PER_HOUR; i += 1) {
        filler += 1
        assert.equal(
          (await post('/login', { email: `filler${filler}@x.test`, next: '/' }, { ip })).status,
          200
        )
      }
    }
  }
}

/**
 * One row of the state matrix, run in every language: `arrange` puts the inbox in the state and
 * says how many requests it spent and which code (if any) must still open the door afterwards;
 * then the client address is filled to its cap and the inbox asks once more. Whatever the state,
 * the answer is 429 with the restricted sentence, nothing is mailed, and the code table is left
 * exactly as it was.
 */
async function limitedInState(t, arrange) {
  distinctCodes(t)
  let n = 0
  for (const lang of WEB_LANGUAGES) {
    // A fresh store, limiter and clock per language: no language runs on another's leftovers.
    const h = signInHarness()
    n += 1
    const email = `person-${lang}@x.test`
    const ip = `203.0.113.${n}`
    const { asked, dead = [], live = null } = await arrange(h, email, { ip, lang })
    await h.fill(ip, asked)
    const before = structuredClone(await h.store.takeCode(email))
    const mails = h.sent.length

    const refused = await h.ask(email, { ip, lang })
    assert.equal(refused.status, 429, `${lang}: the request over the cap is refused`)
    assert.equal(alertText(await refused.text()), RATE_LIMITED_COPY[lang], `${lang}: the page text`)
    const viaScript = await h.ask(email, { ip, lang, json: true })
    assert.equal(viaScript.status, 429, `${lang}: the script's request is refused too`)
    assert.deepEqual(await viaScript.json(), { code: 'RATE_LIMITED' }, `${lang}: protocol answer`)
    assert.equal(h.sent.length, mails, `${lang}: nothing was mailed`)
    assert.deepEqual(await h.store.takeCode(email), before, `${lang}: the code table is untouched`)

    for (const code of dead) {
      assert.equal((await h.verify(email, code, { ip, lang })).status, 401, `${lang}: ${code} stays rejected`)
    }
    if (live) {
      const opened = await h.verify(email, live, { ip, lang })
      assert.equal(opened.status, 303, `${lang}: the latest valid code still signs in`)
      assert.match(opened.headers.get('set-cookie') ?? '', /^tracy_sess=v1\./)
    }
  }
}

test('F-S1-005 state matrix: an inbox that was never mailed a code, refused by the per-client cap', async (t) => {
  await limitedInState(t, async (h, email) => {
    assert.equal(await h.store.takeCode(email), null)
    // Nothing was ever mailed here; a guess at a code is all there is to reject.
    return { asked: 0, dead: ['123456'] }
  })
})

test('F-S1-005 state matrix: a code used up by wrong tries', async (t) => {
  await limitedInState(t, async (h, email, at) => {
    assert.equal((await h.ask(email, at)).status, 200)
    const code = h.codeFor(email)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_ATTEMPTS + 1; i += 1) {
      assert.equal((await h.verify(email, wrong, at)).status, 401)
    }
    assert.equal(await h.store.takeCode(email), null, 'the exhausted code is deleted')
    return { asked: 1, dead: [code] }
  })
})

test('F-S1-005 state matrix: a code already used to sign in', async (t) => {
  await limitedInState(t, async (h, email, at) => {
    assert.equal((await h.ask(email, at)).status, 200)
    const code = h.codeFor(email)
    assert.equal((await h.verify(email, code, at)).status, 303)
    assert.equal(await h.store.takeCode(email), null, 'the used code is deleted')
    return { asked: 1, dead: [code] }
  })
})

test('F-S1-005 state matrix: a code past its lifetime', async (t) => {
  await limitedInState(t, async (h, email, at) => {
    assert.equal((await h.ask(email, at)).status, 200)
    const code = h.codeFor(email)
    const row = await h.store.takeCode(email)
    // One millisecond past the lifetime, still inside the hour the limiter counts in.
    h.clock.now = row.expiresAt + 1
    assert.equal(Math.floor(h.clock.now / 3_600_000), Math.floor(NOW / 3_600_000), 'same rate window')
    return { asked: 1, dead: [code] }
  })
})

test('F-S1-005 state matrix: a code replaced by "Send a new code" — the earlier one is rejected, the latest signs in', async (t) => {
  await limitedInState(t, async (h, email, at) => {
    assert.equal((await h.ask(email, at)).status, 200)
    const first = h.codeFor(email)
    assert.equal((await h.ask(email, at)).status, 200)
    const second = h.codeFor(email)
    assert.notEqual(first, second, 'two distinct codes were mailed')
    assert.equal(h.sent.filter((m) => m.to === email).length, 2)
    // The first mail may arrive late, or simply be the one the person opens: it opens nothing.
    return { asked: 2, dead: [first], live: second }
  })
})

test('F-S1-005 state matrix: the latest valid code is kept through the refusal, lifetime included', async (t) => {
  await limitedInState(t, async (h, email, at) => {
    assert.equal((await h.ask(email, at)).status, 200)
    const row = await h.store.takeCode(email)
    assert.equal(row.expiresAt, h.clock.now + CODE_TTL_MS)
    assert.equal(row.attempts, 0)
    return { asked: 1, live: h.codeFor(email) }
  })
})

// ── F-S1-006 — the request page promises only what happens ────────────────────────────────────────

/** How each language's old sentence promised a message; none of it may come back. */
const PROMISE = {
  en: /email/i,
  vi: /email/i,
  de: /E-Mail/i,
  it: /scriveremo/i,
  fr: /écrirons/i,
  nl: /mailen/i,
  zh: /邮件/,
  es: /escribiremos/i
}

test('F-S1-006: the "request sent" page makes no promise of a reply by mail, in any language', () => {
  for (const lang of WEB_LANGUAGES) {
    const t = translator(lang)
    const note = t('seats.requestedNote')
    assert.doesNotMatch(note, PROMISE[lang], `${lang}: still promises mail: ${note}`)
    if (lang !== 'en') assert.notEqual(note, en['seats.requestedNote'], `${lang}: not translated`)
    const page = joinPage({ siteKey: 'acme.test', requested: true, email: 'a@x.test', lang })
    assert.ok(page.includes(t.html('seats.requestedNote')), `${lang}: the page prints the note`)
  }
})

/** How each language said "come back and you will see the answer"; a declined request shows none. */
const ANSWER_PROMISE = {
  en: /see the answer/i,
  vi: /xem câu trả lời/i,
  de: /Antwort zu sehen/i,
  it: /vedere la risposta/i,
  fr: /voir la réponse/i,
  nl: /antwoord te zien/i,
  zh: /查看答复/,
  es: /ver la respuesta/i
}

test('F-S1-006: the note does not say the page will show an answer, in any language', () => {
  for (const lang of WEB_LANGUAGES) {
    const note = translator(lang)('seats.requestedNote')
    assert.doesNotMatch(note, ANSWER_PROMISE[lang], `${lang}: still promises a visible answer: ${note}`)
  }
})

/** `GET /:label/join` for one asker, with the seat row the book holds for them. */
function joinPageFixtures(row) {
  return [
    [/^select site_key from site where label = \$1$/, () => [{ site_key: 'acme.test' }]],
    [
      /^select id, email, display_name, avatar_url from account where email = \$1$/,
      () => [{ id: 'acc-asker', email: 'asker@else.test', display_name: null, avatar_url: null }]
    ],
    [
      /^select \* from seat where site_key = \$1 and account_id = \$2$/,
      () => (row ? [{ site_key: 'acme.test', account_id: 'acc-asker', role: 'editor', ...row }] : [])
    ]
  ]
}

test('F-S1-006: reopening the join page shows what the note says: waiting, approved, and nothing for a declined request', async () => {
  const t = translator('en')
  const at = new Date(NOW)
  const open = async (row) => {
    const pool = fixturePool(joinPageFixtures(row))
    const mail = provider()
    const res = await call(seatsApp(pool, mail), '/acme/join', { email: 'asker@else.test' })
    assert.deepEqual(pool.unexpected, [])
    // A signed-in read of the page answers 200 in every state it renders.
    assert.equal(res.status, 200)
    assert.deepEqual(mail.payloads, [], 'opening the page mails nobody')
    return res.text()
  }
  const base = { accepted_at: null, requested_at: at, declined_at: null, revoked_at: null }

  const waiting = await open(base)
  assert.ok(waiting.includes(t.html('seats.requestedTitle')))
  assert.ok(waiting.includes(t.html('seats.requestedNote')))

  // "When it is approved, this page says you have access."
  const approved = await open({ ...base, accepted_at: at })
  assert.ok(approved.includes(t.html('seats.grantedTitle', { site: 'acme.test' })))
  assert.ok(!approved.includes(t.html('seats.requestedTitle')))

  // A declined request is not announced here: the page goes back to the request form, which is
  // why the note may not promise that the answer will be shown.
  const declined = await open({ ...base, declined_at: at })
  assert.ok(declined.includes(t.html('seats.joinHeading', { site: 'acme.test' })))
  assert.ok(!declined.includes(t.html('seats.requestedTitle')))
  assert.ok(!declined.includes(t.html('seats.grantedTitle', { site: 'acme.test' })))
  assert.doesNotMatch(declined, /declined|refused|turned down/i)
})

// ── F-S1-010 — the staff invitation carries its link ──────────────────────────────────────────────

const STAFF_WORKSPACE = { id: '7b0c1a52-6f0e-4c58-9a57-0d7f6a1c2e11', display_name: 'Tracy' }
const STAFF_LINK = `${ORIGIN}/ops/invite/${STAFF_WORKSPACE.id}`

test('F-S1-010: both invitation builders print the action link they are given, in text and HTML', () => {
  const url = `${ORIGIN}/ops/invite/a%20b?x=1&y=<2>`.replace('<2>', '2')
  for (const build of [inviteMail, addedToWorkspace]) {
    for (const lang of WEB_LANGUAGES) {
      const t = translator(lang)
      const letter = build({
        inviterEmail: 'boss@tracy.test',
        workspaceName: 'Tracy & <Co>',
        siteKeys: [],
        acceptUrl: url,
        lang
      })
      // On the notification template (#809) the link is the letter's button: label and address.
      assert.ok(letter.text.includes(url), `${build.name} ${lang}: text carries the link`)
      assert.ok(
        letter.text.includes(`${t('mail.n.invited.accept')}: ${url}`),
        `${build.name} ${lang}: text says what it is`
      )
      assert.match(
        visible(letter.html),
        new RegExp(
          `<a href="${url.replaceAll('&', '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>${t.html('mail.n.invited.accept')}</a>`
        ),
        `${build.name} ${lang}: html carries the link, attribute-escaped`
      )
      assert.doesNotMatch(visible(letter.html), /<Co>/, 'a workspace name is escaped')
      assert.match(visible(letter.html), /Tracy &amp; &lt;Co&gt;/)
    }
  }
})

/** Strings that look like `http(s)://…` and that no mail client can open, or that carry a login. */
const UNOPENABLE_URLS = [
  'https://%/ops/invite/x',
  'https:///ops/invite/x',
  'https://',
  'https://?x=1',
  'https://#x',
  'https://:443/ops/invite/x',
  'https://tracy.test:port/ops/invite/x',
  'https://tracy.test:99999/ops/invite/x',
  'https://[::1/ops/invite/x',
  'https://a..b^c/ops/invite/x',
  'https://user:pass@tracy.test/ops/invite/x',
  'https://user@tracy.test/ops/invite/x',
  'https://tracy.test\\@evil.test/ops/invite/x',
  'http://exa mple.test/x'
]

test('every mail that carries a link refuses an address that does not parse, and keeps one that does', () => {
  const builders = {
    inviteMail: (url) => inviteMail({ inviterEmail: 'boss@tracy.test', acceptUrl: url }),
    addedToWorkspace: (url) => addedToWorkspace({ inviterEmail: 'boss@tracy.test', acceptUrl: url }),
    teamInviteMail: (url) =>
      teamInviteMail({
        inviterEmail: 'boss@tracy.test',
        role: 'editor',
        siteKeys: ['a.test'],
        acceptUrl: url
      }),
    joinRequestMail: (url) =>
      joinRequestMail({ requesterEmail: 'asker@else.test', siteKey: 'a.test', reviewUrl: url }),
    betaMail: (url) => emails.betaMail({ url })
  }
  const kept = [
    'https://tracy.test/ops/invite/7b0c1a52-6f0e-4c58-9a57-0d7f6a1c2e11',
    'http://localhost:8787/team/accept?token=a.b-c_d&email=a%40x.test',
    'https://xn--bcher-kva.example/join?next=%2Facme%2Fteam',
    'https://[2001:db8::1]:8443/x'
  ]
  for (const [name, build] of Object.entries(builders)) {
    for (const url of UNOPENABLE_URLS) {
      assert.throws(() => build(url), TypeError, `${name} must refuse ${JSON.stringify(url)}`)
    }
    for (const url of kept) {
      const letter = build(url)
      assert.ok(letter.text.includes(url), `${name}: the text carries the address as written`)
      assert.ok(letter.html.includes(`href="${url.replaceAll('&', '&amp;')}"`), `${name}: so does the link`)
    }
  }
})

test('F-S1-010: a missing link leaves the letter as it was; an unsafe one is refused, never rewritten', () => {
  for (const build of [inviteMail, addedToWorkspace]) {
    const plain = build({ inviterEmail: 'boss@tracy.test', workspaceName: 'Agency', siteKeys: ['a.test'] })
    // The template's footer always links Settings and tracy.ai (#809); a missing link means no button.
    const t = translator('en')
    assert.ok(!plain.html.includes(t.html('mail.n.invited.accept')), `${build.name}: no button`)
    assert.ok(!plain.text.includes(t('mail.n.invited.accept')), `${build.name}: no link line`)
    assert.doesNotMatch(visible(plain.html), /\/ops\/invite|\/invite\//)
    for (const acceptUrl of [
      '',
      null,
      42,
      'javascript:alert(1)',
      '/ops/invite/x',
      'https://tracy.test/" onclick="alert(1)',
      'https://tracy.test/a b',
      'https://tracy.test/<script>',
      ...UNOPENABLE_URLS
    ]) {
      assert.throws(
        () => build({ inviterEmail: 'boss@tracy.test', workspaceName: 'Tracy', acceptUrl }),
        /acceptUrl must be an http\(s\) URL/,
        `${build.name} must refuse ${JSON.stringify(acceptUrl)}`
      )
    }
  }
})

/** The statements `POST /tracy-admin/members` makes for a brand-new invitee, and nothing else. */
function staffInviteFixtures({ inviteeHasAccount }) {
  const boss = { id: 'acc-boss', email: 'boss@tracy.test', display_name: null, avatar_url: null }
  const invitee = { id: 'acc-new', email: 'new@tracy.test', display_name: null, avatar_url: null }
  let granted = false
  return [
    RATE,
    ...NOTIFY_READS,
    [
      /^select id, email, display_name, avatar_url from account where email = \$1$/,
      ([email]) =>
        email === boss.email ? [boss] : email === invitee.email && inviteeHasAccount ? [invitee] : []
    ],
    [
      /^select sw\.role from seat_workspace sw join workspace w .* limit 1$/,
      ([id]) => (id === boss.id ? [{ role: 'owner' }] : [])
    ],
    [/^select id, display_name from workspace where kind = 'tracy_admin' limit 2$/, () => [STAFF_WORKSPACE]],
    [
      /^select sw\.\*, a\.email as account_email, a\.display_name as account_display_name from seat_workspace sw/,
      () =>
        granted
          ? [
              {
                workspace_id: STAFF_WORKSPACE.id,
                account_id: invitee.id,
                role: 'developer',
                accepted_at: null,
                revoked_at: null,
                declined_at: null,
                requested_at: null,
                granted_at: new Date(NOW),
                account_email: invitee.email,
                account_display_name: null
              }
            ]
          : []
    ],
    [/^insert into account \(email\) values \(\$1\)/, () => [{ id: invitee.id }]],
    [
      /^insert into seat_workspace \(workspace_id, account_id, role, granted_by, granted_at, accepted_at, requested_at\)/,
      (params) => {
        assert.deepEqual(params.slice(0, 4), [STAFF_WORKSPACE.id, invitee.id, 'developer', boss.id])
        granted = true
        return [{ workspace_id: STAFF_WORKSPACE.id, account_id: invitee.id, role: 'developer' }]
      }
    ],
    [/^select site_key from workspace_site where workspace_id = \$1 order by site_key asc$/, () => []]
  ]
}

function workspacesApp(pool, mail, appConfig = config) {
  return workspacesRoutes({
    pool,
    config: appConfig,
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

for (const inviteeHasAccount of [false, true]) {
  test(`F-S1-010 + F-S1-017: inviting Tracy staff mails the /ops/invite link, HTML and text (${inviteeHasAccount ? 'has an account' : 'no account yet'})`, async () => {
    const pool = fixturePool(staffInviteFixtures({ inviteeHasAccount }))
    const mail = provider()
    const res = await call(workspacesApp(pool, mail), '/tracy-admin/members', {
      method: 'POST',
      email: 'boss@tracy.test',
      body: { email: 'new@tracy.test', role: 'developer' }
    })
    assert.deepEqual(pool.unexpected, [])
    assert.equal(res.status, 201)
    assert.equal((await res.json()).notified, true)
    assert.equal(mail.payloads.length, 1)
    const [payload] = mail.payloads
    const expected = (inviteeHasAccount ? addedToWorkspace : inviteMail)({
      inviterEmail: 'boss@tracy.test',
      workspaceName: 'Tracy',
      siteKeys: [],
      acceptUrl: STAFF_LINK
    })
    assert.equal(payload.to, 'new@tracy.test')
    assert.equal(payload.subject, expected.subject)
    assert.equal(payload.text, expected.text)
    assert.equal(payload.html, expected.html)
    assert.ok(payload.text.includes(STAFF_LINK))
    assert.ok(payload.html.includes(`<a href="${STAFF_LINK}"`))
  })
}

test('F-S1-010: a staff invitation the provider rejects keeps the grant and answers 202 notified:false', async () => {
  for (const answer of [
    () => new Response('nope', { status: 500 }),
    () => {
      throw new Error('socket closed')
    }
  ]) {
    const pool = fixturePool(staffInviteFixtures({ inviteeHasAccount: false }))
    const mail = provider(answer)
    const res = await call(workspacesApp(pool, mail), '/tracy-admin/members', {
      method: 'POST',
      email: 'boss@tracy.test',
      body: { email: 'new@tracy.test', role: 'developer' }
    })
    assert.deepEqual(pool.unexpected, [])
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.notified, false)
    assert.equal(body.invited, true)
    assert.ok(pool.seen.some((q) => q.text.startsWith('insert into seat_workspace')))
  }
})

test('F-S1-010: an origin that makes an unopenable link mails nothing and answers 202 notified:false', async () => {
  // The session check reads the same origin, so the request names it too; only the link is under test.
  for (const origin of ['https://%', 'https://user:pass@tracy.test', 'https://tracy.test:port']) {
    const pool = fixturePool(staffInviteFixtures({ inviteeHasAccount: false }))
    const mail = provider()
    const res = await call(workspacesApp(pool, mail, { ...config, origin }), '/tracy-admin/members', {
      method: 'POST',
      email: 'boss@tracy.test',
      body: { email: 'new@tracy.test', role: 'developer' }
    })
    assert.deepEqual(pool.unexpected, [], origin)
    assert.equal(res.status, 202, origin)
    const body = await res.json()
    assert.equal(body.notified, false, origin)
    assert.equal(body.invited, true, origin)
    assert.deepEqual(mail.payloads, [], `${origin}: a letter with a dead link was sent`)
  }
})

/** `GET /ops/invite/:marker` over the real store functions and a strict pool. */
function opsApp(pool) {
  return opsRoutes({
    pool,
    config,
    workspaces: { app: new Hono(), tracyAdminWorkspace, acceptWorkspaceGrant, accountByEmail }
  })
}

const ACCEPT =
  /^update seat_workspace set accepted_at = now\(\) where workspace_id = \$1 and account_id = \$2 and revoked_at is null and declined_at is null and accepted_at is null returning \*$/

test('F-S1-010: the mailed link sends a signed-out reader to sign in and back to the same link', async () => {
  const pool = fixturePool([])
  const res = await call(opsApp(pool), new URL(STAFF_LINK).pathname)
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent(new URL(STAFF_LINK).pathname)}`)
  assert.deepEqual(pool.seen, [], 'nothing is read or written before sign-in')
})

test('F-S1-010: the invited account accepts its OWN pending grant through the mailed link', async () => {
  const invitee = { id: 'acc-new', email: 'new@tracy.test', display_name: null, avatar_url: null }
  const accepted = []
  const pool = fixturePool([
    [/^select id, display_name from workspace where kind = 'tracy_admin' limit 2$/, () => [STAFF_WORKSPACE]],
    [
      /^select id, email, display_name, avatar_url from account where email = \$1$/,
      ([email]) => (email === invitee.email ? [invitee] : [])
    ],
    [
      ACCEPT,
      (params) => {
        accepted.push(params)
        return [{ workspace_id: params[0], account_id: params[1] }]
      }
    ]
  ])
  const res = await call(opsApp(pool), new URL(STAFF_LINK).pathname, { email: invitee.email })
  assert.deepEqual(pool.unexpected, [])
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/ops')
  assert.deepEqual(accepted, [[STAFF_WORKSPACE.id, invitee.id]])
})

test('F-S1-010: another account, a revoked grant or no grant opens nothing through the same link', async () => {
  const other = { id: 'acc-other', email: 'other@tracy.test', display_name: null, avatar_url: null }
  for (const known of [true, false]) {
    const attempted = []
    const pool = fixturePool([
      [
        /^select id, display_name from workspace where kind = 'tracy_admin' limit 2$/,
        () => [STAFF_WORKSPACE]
      ],
      [
        /^select id, email, display_name, avatar_url from account where email = \$1$/,
        () => (known ? [other] : [])
      ],
      [
        // The conditional UPDATE matches no row for an account with no live pending grant —
        // somebody else's, a revoked one, or none at all.
        ACCEPT,
        (params) => {
          attempted.push(params)
          return []
        }
      ]
    ])
    const res = await call(opsApp(pool), new URL(STAFF_LINK).pathname, { email: other.email })
    assert.deepEqual(pool.unexpected, [])
    // 410 and this heading since #796: the page was 200 and claimed the invitation was withdrawn
    // or used, which the door cannot know. What it opens is unchanged: nothing.
    assert.equal(res.status, 410)
    assert.equal(res.headers.get('location'), null, 'no redirect into /ops')
    assert.match(await res.text(), /This invitation is not open for this address/)
    // Only ever the CALLER's own account id — the marker in the path selects nobody.
    assert.deepEqual(attempted, known ? [[STAFF_WORKSPACE.id, other.id]] : [])
  }
})

// ── F-S1-017 — the HTML the builders write reaches the provider ───────────────────────────────────

const SITE = 'acme.test'

function seatsApp(pool, mail) {
  return seatsRoutes({
    pool,
    config,
    now: () => NOW,
    mail: { send: mail.send, inviteMail, addedToWorkspace, joinRequestMail, teamInviteMail },
    sites: { labelOf: async () => 'acme' }
  })
}

function teamInviteFixtures() {
  const boss = { id: 'acc-boss' }
  const invitee = { id: 'acc-new' }
  return [
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
    ],
    [/^insert into ops_event\b/, () => []],
    // #809: the inviter's name for the letter, and the invitee's own language when they chose one.
    [
      /^select id, email, display_name from account where id = \$1$/,
      () => [{ id: boss.id, email: 'boss@acme.test', display_name: null }]
    ],
    [
      /^select email, language from account where email = any\(\$1::text\[\]\) and language is not null$/,
      () => []
    ]
  ]
}

test('F-S1-017: the team invitation reaches the provider with the HTML the builder wrote', async () => {
  const pool = fixturePool(teamInviteFixtures())
  const mail = provider()
  const res = await call(seatsApp(pool, mail), '/api/team/invite', {
    method: 'POST',
    email: 'boss@acme.test',
    body: { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE] }
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(
    pool.unexpected.filter((q) => !/ops_event|ops_signal/.test(q)),
    []
  )
  assert.equal(body.results[0].notified, true)
  assert.equal(mail.payloads.length, 1)
  const [payload] = mail.payloads
  assert.equal(payload.to, 'new@acme.test')
  const link = payload.text.match(/https:\/\/tracy\.test\/invite\/[^\s/]+/)?.[0]
  assert.ok(link, 'the text names the accept link')
  const expected = teamInviteMail({
    inviterEmail: 'boss@acme.test',
    role: 'editor',
    siteKeys: [SITE],
    acceptUrl: link,
    declineUrl: `${link}/decline`
  })
  assert.equal(payload.text, expected.text)
  assert.equal(payload.html, expected.html)
  assert.ok(payload.html.includes(`<a href="${link}"`))
})

test('F-S1-017: a rejected team invitation keeps the seat and answers notified:false', async () => {
  for (const answer of [
    () => new Response('nope', { status: 422 }),
    () => {
      throw new Error('network down')
    }
  ]) {
    const pool = fixturePool(teamInviteFixtures())
    const mail = provider(answer)
    const res = await call(seatsApp(pool, mail), '/api/team/invite', {
      method: 'POST',
      email: 'boss@acme.test',
      body: { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE] }
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.results[0].notified, false)
    assert.ok(
      pool.seen.some((q) => q.text.startsWith('insert into seat ')),
      'the seat was still written'
    )
  }
})

function joinRequestFixtures() {
  const requester = { id: 'acc-asker' }
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
  return [
    RATE,
    ...NOTIFY_READS,
    [/^insert into account \(email\) values \(\$1\)/, () => [requester]],
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
  ]
}

// Since #809 a join request reaches its admins through the notifier (`notify`, bound in by
// `app.js`): one row and one letter per Owner/Admin, each in their own language, sent from the
// mail outbox. The letter's HTML reaching the provider is pinned on a real database by
// `team-notifications.test.mjs` (T2) and `notify.test.mjs` (one failed send stays owed, the others go).
// Here: the door hands EVERY admin to the notifier, and a notifier that fails undoes nothing.
function joinRequestApp(pool, notify) {
  return seatsRoutes({
    pool,
    config,
    now: () => NOW,
    mail: { send: async () => {}, inviteMail, addedToWorkspace, joinRequestMail, teamInviteMail },
    sites: { labelOf: async () => 'acme' },
    notify
  })
}

const JOIN_TEAM_FIXTURE = [
  /^select s\.\*, a\.email as account_email/,
  () => [
    {
      site_key: SITE,
      account_id: 'acc-owner',
      role: 'owner',
      accepted_at: new Date(NOW),
      revoked_at: null,
      declined_at: null
    },
    {
      site_key: SITE,
      account_id: 'acc-editor',
      role: 'editor',
      accepted_at: new Date(NOW),
      revoked_at: null,
      declined_at: null
    }
  ]
]

test('F-S1-017: a join request reaches every owner (never an editor), through the notifier', async () => {
  const pool = fixturePool([JOIN_TEAM_FIXTURE, ...joinRequestFixtures()])
  const told = []
  const res = await call(
    joinRequestApp(pool, async (n) => {
      told.push(n)
      return []
    }),
    `/me/sites/${SITE}/join-request`,
    { method: 'POST', email: 'asker@else.test' }
  )
  assert.deepEqual(pool.unexpected, [])
  assert.equal(res.status, 201)
  assert.deepEqual(await res.json(), { requested: true, already: false })
  assert.equal(told.length, 1)
  assert.equal(told[0].kind, 'team.join_request')
  assert.deepEqual([...told[0].recipients].sort(), ['acc-owner'])
  assert.equal(told[0].ref, `join:${SITE}:acc-asker`)
})

test('F-S1-017: a notifier that fails does not undo the request', async () => {
  const pool = fixturePool([JOIN_TEAM_FIXTURE, ...joinRequestFixtures()])
  const res = await call(
    joinRequestApp(pool, async () => {
      throw new Error('outbox down')
    }),
    `/me/sites/${SITE}/join-request`,
    { method: 'POST', email: 'asker@else.test' }
  )
  assert.deepEqual(pool.unexpected, [])
  assert.equal(res.status, 201)
  assert.deepEqual(await res.json(), { requested: true, already: false })
  assert.ok(
    pool.seen.some((q) => q.text.startsWith('insert into seat ')),
    'the request stays on the book'
  )
})

function removalFixtures() {
  const boss = { id: 'acc-boss', email: 'boss@tracy.test', display_name: null, avatar_url: null }
  return [
    [/^select id, email, display_name, avatar_url from account where email = \$1$/, () => [boss]],
    [/^select sw\.role from seat_workspace sw join workspace w .* limit 1$/, () => [{ role: 'owner' }]],
    [/^select id, display_name from workspace where kind = 'tracy_admin' limit 2$/, () => [STAFF_WORKSPACE]],
    [
      /^select sw\.\*, a\.email as account_email, a\.display_name as account_display_name from seat_workspace sw/,
      () => [
        {
          workspace_id: STAFF_WORKSPACE.id,
          account_id: 'acc-target',
          role: 'developer',
          accepted_at: new Date(NOW),
          revoked_at: null,
          declined_at: null,
          account_email: 'target@tracy.test',
          account_display_name: null
        }
      ]
    ]
  ]
}

test('F-S1-017: the removal code reaches the caller with the HTML the builder wrote', async () => {
  const pool = fixturePool(removalFixtures())
  const mail = provider()
  const res = await call(workspacesApp(pool, mail), '/tracy-admin/members/acc-target/code', {
    method: 'POST',
    email: 'boss@tracy.test'
  })
  assert.deepEqual(pool.unexpected, [])
  assert.equal(res.status, 200)
  assert.equal((await res.json()).sent, true)
  assert.equal(mail.payloads.length, 1)
  const [payload] = mail.payloads
  assert.equal(payload.to, 'boss@tracy.test', 'to the caller, never to the target')
  const code = payload.text.match(/\b\d{6}\b/)?.[0]
  assert.ok(code)
  const expected = removalCodeMail({ code, targetEmail: 'target@tracy.test' })
  assert.equal(payload.subject, expected.subject)
  assert.equal(payload.text, expected.text)
  assert.equal(payload.html, expected.html)
  assert.match(visible(payload.html), /target@tracy\.test/)
})

test('F-S1-017: a removal code the provider refuses still answers 502 MAIL_NOT_SENT', async () => {
  for (const answer of [
    () => new Response('nope', { status: 500 }),
    () => {
      throw new Error('network down')
    }
  ]) {
    const pool = fixturePool(removalFixtures())
    const res = await call(workspacesApp(pool, provider(answer)), '/tracy-admin/members/acc-target/code', {
      method: 'POST',
      email: 'boss@tracy.test'
    })
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), { code: 'MAIL_NOT_SENT' })
  }
})

test('F-S1-005: the code a lane asks for expires CODE_TTL_MS after it was written', async () => {
  const actorSecret = 'a'.repeat(32)
  const laneConfig = readConfig({
    TRACY_ORIGIN: ORIGIN,
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k',
    MCP_TRACY_ACTOR_SECRET: actorSecret
  })
  const payload = Buffer.from(
    JSON.stringify({ email: 'lane@tracy.test', exp: Math.floor(Date.now() / 1000) + 50 })
  ).toString('base64url')
  const actor = `v1.${payload}.${createHmac('sha256', actorSecret).update(payload).digest('base64url')}`
  // The actor assertion is checked against the clock, so this door runs on a real one, frozen.
  const at = Date.now()
  const put = []
  const sent = []
  const app = laneRoutes({
    pool: null,
    config: laneConfig,
    now: () => at,
    store: { putCode: async (row) => void put.push(row) },
    mail: { send: async (m) => void sent.push(m), signInCodeMail },
    seats: {},
    otp: { generateCode: () => '123456', hashCode: async () => 'hash' },
    mailRate: { over: async () => false, overLane: async () => false }
  })
  const res = await call(app, '/auth/otp/start', {
    method: 'POST',
    body: { email: 'a@x.test' },
    headers: { 'x-tracy-actor': actor }
  })
  assert.equal(res.status, 200)
  assert.equal(put.length, 1)
  assert.equal(put[0].expiresAt, at + CODE_TTL_MS)
  // The mail that carries this code states the same number the door enforces.
  assert.ok(sent[0].text.includes(translator('en')('mail.signInValid', { minutes: MINUTES })))
  assert.match(sent[0].text, new RegExp(`valid for ${MINUTES} minutes`))
})

// ── #798 F-S3-004 — who may invite whom: the door's rule, held so the screen can follow it ────────
//
// The rule (ADR 0028, 08/10/2026): an ACCEPTED Owner or Editor invites as Viewer or Editor; a Viewer
// invites nobody; Owners are never invited (made from the Team list). The Team tab reads the same rule from `inviteRolesFor`
// (`@tracy/core/team`), and the last test here puts the two side by side.

const INVITER = 'inviter@acme.test'
const OTHER_SITE = 'other.test'
const LIVE_GRANT =
  /^select \* from seat where account_id = \$1 and site_key = \$2 and revoked_at is null and declined_at is null and accepted_at is not null$/

/**
 * The inviter's own seats, by site key. The live-grant statement is matched by its WHOLE text, so
 * the three filters it names are the ones this fixture applies; PostgreSQL itself is not run.
 */
function inviteRuleFixtures(seats) {
  const inviter = { id: 'acc-inviter' }
  const invitee = { id: 'acc-new' }
  return [
    RATE,
    ...NOTIFY_READS,
    [/^insert into account \(email\) values \(\$1\)/, ([email]) => [email === INVITER ? inviter : invitee]],
    [
      LIVE_GRANT,
      ([accountId, siteKey]) => {
        const seat = accountId === inviter.id ? seats[siteKey] : undefined
        const live = seat && !seat.revoked_at && !seat.declined_at && seat.accepted_at
        return live ? [{ account_id: inviter.id, site_key: siteKey, ...seat }] : []
      }
    ],
    [/^select \* from seat where account_id = \$1 and site_key = \$2$/, () => []],
    [/^select \* from seat where site_key = \$1 and account_id = \$2$/, () => []],
    [
      /^insert into seat \(site_key, account_id, role, granted_by, granted_at, accepted_at, requested_at, created_by_proof\)/,
      (p) => [{ site_key: p[0], account_id: p[1], role: p[2] }]
    ],
    [/^insert into ops_event\b/, () => []]
  ]
}

const acceptedSeat = (role) => ({ role, accepted_at: new Date(NOW) })

/** One invitation through the real router; what it answered and every effect it left. */
async function inviteAs(seats, body) {
  const pool = fixturePool(inviteRuleFixtures(seats))
  const mail = provider()
  const res = await call(seatsApp(pool, mail), '/api/team/invite', { method: 'POST', email: INVITER, body })
  const answer = await res.json().catch(() => null)
  return {
    status: res.status,
    answer,
    mails: mail.payloads,
    seatWrites: pool.seen.filter((q) => q.text.startsWith('insert into seat ')),
    accountWrites: pool.seen.filter((q) => q.text.startsWith('insert into account ')),
    unexpected: pool.unexpected.filter((q) => !/ops_event|ops_signal/.test(q))
  }
}

/** Nothing was invited: no seat row, no account for the invitee, no mail. */
function assertNoInvitationEffects(run, label) {
  assert.deepEqual(run.seatWrites, [], `${label}: no seat is written`)
  assert.deepEqual(run.mails, [], `${label}: no mail is sent`)
  assert.ok(
    run.accountWrites.every((q) => q.params[0] === INVITER),
    `${label}: no account is made for the invited address`
  )
  assert.deepEqual(run.unexpected, [], `${label}: no other statement`)
}

for (const role of ['owner', 'editor']) {
  test(`F-S3-004: an accepted ${role} invites an editor: the seat is written and the mail is sent`, async () => {
    const run = await inviteAs(
      { [SITE]: acceptedSeat(role) },
      { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE] }
    )
    assert.equal(run.status, 200)
    assert.deepEqual(run.unexpected, [])
    assert.deepEqual(withoutLink(run.answer.results), [
      { email: 'new@acme.test', notified: true, sites: [{ siteKey: SITE, outcome: 'invited' }] }
    ])
    assert.match(run.answer.results[0].inviteUrl, /^https:\/\/tracy\.test\/invite\/[\w.-]+$/)
    assert.equal(run.seatWrites.length, 1)
    assert.deepEqual(run.seatWrites[0].params.slice(0, 4), [SITE, 'acc-new', 'editor', 'acc-inviter'])
    assert.equal(run.seatWrites[0].params[4], null, 'the invited seat is not accepted for them')
    assert.equal(run.mails.length, 1)
    assert.equal(run.mails[0].to, 'new@acme.test')
  })

  test(`F-S3-004: an accepted ${role} invites a viewer: the seat is written as viewer`, async () => {
    const run = await inviteAs(
      { [SITE]: acceptedSeat(role) },
      { role: 'viewer', emails: ['new@acme.test'], siteKeys: [SITE] }
    )
    assert.equal(run.status, 200)
    assert.deepEqual(run.answer.results[0].sites, [{ siteKey: SITE, outcome: 'invited' }])
    assert.deepEqual(run.seatWrites[0].params.slice(0, 3), [SITE, 'acc-new', 'viewer'])
  })
}

for (const invited of ['editor', 'viewer']) {
  test(`F-S3-004: an accepted viewer inviting a ${invited} is refused NOT_SITE_EDITOR, with no effect`, async () => {
    const run = await inviteAs(
      { [SITE]: acceptedSeat('viewer') },
      { role: invited, emails: ['new@acme.test'], siteKeys: [SITE] }
    )
    assert.equal(run.status, 200)
    assert.deepEqual(run.answer.results, [
      {
        email: 'new@acme.test',
        notified: false,
        sites: [{ siteKey: SITE, outcome: 'refused', code: 'NOT_SITE_EDITOR' }]
      }
    ])
    assertNoInvitationEffects(run, `viewer invites ${invited}`)
  })
}

test('F-S3-004: owner and the retired roles are never invited, whoever asks', async () => {
  for (const role of ['owner', 'editor']) {
    for (const invited of ['owner', 'admin', 'developer']) {
      const run = await inviteAs(
        { [SITE]: acceptedSeat(role) },
        { role: invited, emails: ['new@acme.test'], siteKeys: [SITE] }
      )
      assert.equal(run.status, 400, `${role} invites ${invited}`)
      assertNoInvitationEffects(run, `${role} invites ${invited}`)
    }
  }
})

test('F-S3-004: a seat that is pending, revoked, declined or missing invites nobody: SEAT_NOT_AUTHORIZED', async () => {
  const states = {
    'pending editor': { role: 'editor', accepted_at: null },
    'pending owner': { role: 'owner', accepted_at: null },
    'pending viewer': { role: 'viewer', accepted_at: null },
    'revoked owner': { ...acceptedSeat('owner'), revoked_at: new Date(NOW) },
    'revoked editor': { ...acceptedSeat('editor'), revoked_at: new Date(NOW) },
    'declined viewer': { role: 'viewer', accepted_at: null, declined_at: new Date(NOW) },
    'declined editor': { role: 'editor', accepted_at: null, declined_at: new Date(NOW) },
    'no seat': undefined
  }
  for (const [label, seat] of Object.entries(states)) {
    for (const invited of ['editor', 'viewer']) {
      const run = await inviteAs(seat ? { [SITE]: seat } : {}, {
        role: invited,
        emails: ['new@acme.test'],
        siteKeys: [SITE]
      })
      assert.equal(run.status, 200, label)
      assert.deepEqual(
        run.answer.results,
        [
          {
            email: 'new@acme.test',
            notified: false,
            sites: [{ siteKey: SITE, outcome: 'refused', code: 'SEAT_NOT_AUTHORIZED' }]
          }
        ],
        `${label} invites ${invited}`
      )
      assertNoInvitationEffects(run, `${label} invites ${invited}`)
    }
  }
})

test('F-S3-004: each site answers for itself inside one HTTP-200 reply', async () => {
  // An editor here, nobody there: the editor seat is invited to, the other site is refused.
  const partly = await inviteAs(
    { [SITE]: acceptedSeat('editor') },
    { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE, OTHER_SITE] }
  )
  assert.equal(partly.status, 200)
  assert.deepEqual(withoutLink(partly.answer.results), [
    {
      email: 'new@acme.test',
      notified: true,
      sites: [
        { siteKey: SITE, outcome: 'invited' },
        { siteKey: OTHER_SITE, outcome: 'refused', code: 'SEAT_NOT_AUTHORIZED' }
      ]
    }
  ])
  assert.deepEqual(
    partly.seatWrites.map((q) => q.params[0]),
    [SITE]
  )
  assert.equal(partly.mails.length, 1)
  assert.ok(!partly.mails[0].text.includes(OTHER_SITE), 'the mail names only the site that was granted')

  // A viewer here, an owner there, inviting an editor: only the site where they may invite takes it.
  const split = await inviteAs(
    { [SITE]: acceptedSeat('viewer'), [OTHER_SITE]: acceptedSeat('owner') },
    { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE, OTHER_SITE] }
  )
  assert.deepEqual(split.answer.results[0].sites, [
    { siteKey: SITE, outcome: 'refused', code: 'NOT_SITE_EDITOR' },
    { siteKey: OTHER_SITE, outcome: 'invited' }
  ])
  assert.deepEqual(
    split.seatWrites.map((q) => [q.params[0], q.params[2]]),
    [[OTHER_SITE, 'editor']]
  )
})

test('F-S3-004: a request the door cannot read is INVALID_REQUEST and leaves nothing behind', async () => {
  const good = { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE] }
  const bodies = {
    'no role': { ...good, role: undefined },
    'role owner': { ...good, role: 'owner' },
    'role admin (retired)': { ...good, role: 'admin' },
    'role developer (retired)': { ...good, role: 'developer' },
    'role member': { ...good, role: 'member' },
    'role as a list': { ...good, role: ['editor'] },
    'no emails': { ...good, emails: undefined },
    'emails empty': { ...good, emails: [] },
    'emails as text': { ...good, emails: 'new@acme.test' },
    'an address that is not one': { ...good, emails: ['new@acme.test', 'not-an-address'] },
    'an address that is a number': { ...good, emails: [7] },
    'no sites': { ...good, siteKeys: undefined },
    'sites empty': { ...good, siteKeys: [] },
    'sites as text': { ...good, siteKeys: SITE },
    'an empty site key': { ...good, siteKeys: [''] },
    'a site key that is a number': { ...good, siteKeys: [7] },
    'a site key that is null': { ...good, siteKeys: [SITE, null] }
  }
  for (const [label, body] of Object.entries(bodies)) {
    const run = await inviteAs({ [SITE]: acceptedSeat('owner') }, body)
    assert.equal(run.status, 400, label)
    assert.deepEqual(run.answer, { code: 'INVALID_REQUEST' }, label)
    assertNoInvitationEffects(run, label)
    assert.deepEqual(run.accountWrites, [], `${label}: not even the inviter's account is touched`)
  }

  // A body that is not JSON at all.
  const pool = fixturePool(inviteRuleFixtures({ [SITE]: acceptedSeat('owner') }))
  const mail = provider()
  const res = await seatsApp(pool, mail).fetch(
    new Request(new URL('/api/team/invite', ORIGIN), {
      method: 'POST',
      headers: { cookie: `tracy_sess=${await sessionOf(INVITER)}`, 'content-type': 'application/json' },
      body: '{"role":"editor",'
    })
  )
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' })
  assert.deepEqual(mail.payloads, [])
  assert.ok(!pool.seen.some((q) => /^insert into (seat|account) /.test(q.text)))
})

test('F-S3-004: an editor’s invitation the provider rejects keeps the seat and answers notified:false', async () => {
  const pool = fixturePool(inviteRuleFixtures({ [SITE]: acceptedSeat('editor') }))
  const mail = provider(() => new Response('nope', { status: 422 }))
  const res = await call(seatsApp(pool, mail), '/api/team/invite', {
    method: 'POST',
    email: INVITER,
    body: { role: 'editor', emails: ['new@acme.test'], siteKeys: [SITE] }
  })
  assert.equal(res.status, 200)
  const answer = await res.json()
  assert.deepEqual(withoutLink(answer.results), [
    { email: 'new@acme.test', notified: false, sites: [{ siteKey: SITE, outcome: 'invited' }] }
  ])
  assert.ok(answer.results[0].inviteUrl, 'the inviter still gets the link when the mail failed')
  assert.equal(pool.seen.filter((q) => q.text.startsWith('insert into seat ')).length, 1)
})

test('F-S3-004: the roles the Team tab offers a seat are exactly the ones the door accepts from it', async () => {
  assert.equal(
    typeof teamRoster.inviteRolesFor,
    'function',
    '@tracy/core/team has one description of who may invite which role'
  )
  for (const role of ['owner', 'editor', 'viewer']) {
    const accepted = []
    for (const invited of teamRoster.INVITABLE_ROLES) {
      const run = await inviteAs(
        { [SITE]: acceptedSeat(role) },
        { role: invited, emails: ['new@acme.test'], siteKeys: [SITE] }
      )
      if (run.answer.results[0].sites[0].outcome === 'invited') accepted.push(invited)
    }
    assert.deepEqual([...teamRoster.inviteRolesFor(role)], accepted, role)
  }
  // No role, or a word the seat book does not have: the door finds no live grant, the tab offers nothing.
  for (const none of [null, undefined, 'member', '']) {
    assert.deepEqual([...teamRoster.inviteRolesFor(none)], [], String(none))
  }
})
