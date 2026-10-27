/**
 * The whitelist confirmation goes through `lib/i18n` (#797, F-S1-018): its words are catalogue
 * keys, the language is the one of the request, and nothing else about the private door moved:
 * the bearer check comes first, the visitor's data is escaped, the WordPress template still
 * overrides the body, and the FIRST stored payload is the one every retry sends.
 *
 * No database here: `fakePool` answers the handful of statements the door runs, so the route's
 * own path (store first, lease, send, acknowledge) is walked on any machine. What a real Postgres
 * adds (the advisory lock, the atomic daily budget) is covered by `whitelist-confirmation.test.mjs`
 * on CI.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confirmationRoutes } from '../src/beta/confirmation.js'
import { confirmationMail } from '../src/mail/confirmation-mail.js'
import { WEB_LANGUAGES, htmlLang, translate } from '../src/lib/i18n/index.js'
import { en } from '../src/lib/i18n/strings.js'

const secret = 's'.repeat(32)
const body = {
  email: 'visitor@example.com',
  name: 'Visitor',
  platforms: ['WordPress', 'Joomla'],
  role: 'own',
  site_count: 'one',
  // Already in the form the door normalizes a website to, so stored and expected mails compare equal.
  website: 'https://example.com/'
}
const ORIGIN = 'https://tracy.example'

/** The English mail exactly as it read before it moved into the catalogue. */
const ENGLISH_TEXT = [
  'Hi Visitor,',
  '',
  "Thanks for joining the Tracy whitelist. We'll email you at visitor@example.com with next steps.",
  '',
  'What you told us',
  'Platforms: WordPress, Joomla',
  'Sites you manage: one',
  'Main website: https://example.com/',
  '',
  'See how Tracy works: https://tracy.example/how-it-works/',
  '',
  // 06/10/2026 (Sarah): the sign-in mail's sentence and box, and the footer's two pages.
  'Did not request this? You can safely ignore this email.',
  '',
  'Terms: https://tracy.ai/terms · Privacy: https://tracy.ai/privacy'
].join('\n')

const CONFIRMATION_KEYS = [
  'mail.confirmationSubject',
  'mail.confirmationGreeting',
  'mail.confirmationThanks',
  'mail.confirmationSummary',
  'mail.confirmationPlatforms',
  'mail.confirmationSiteCount',
  'mail.confirmationWebsite',
  'mail.confirmationHowItWorks'
]

test('the English mail kept its words', () => {
  const mail = confirmationMail(body.email, body, ORIGIN)
  assert.equal(mail.subject, "You're on the Tracy whitelist")
  assert.equal(mail.text, ENGLISH_TEXT)
  assert.deepEqual(confirmationMail(body.email, body, ORIGIN, 'en'), mail)
  // Since 04/10 the notification letter's layout: its title, the summary as one paragraph, the
  // one-line footer, and no sign-off or trademark line.
  const shown = mail.html.replaceAll('&zwnj;', '')
  assert.match(shown, /<h1 class="mail-title"[^>]*>You&#39;re on the Tracy whitelist<\/h1>/)
  assert.match(shown, />Hi Visitor,<\/p>/)
  assert.match(
    shown,
    />What you told us<br>Platforms: WordPress, Joomla<br>Sites you manage: one<br>Main website: https:\/\/example\.com\/<\/p>/
  )
  assert.match(
    shown,
    /<strong style="color:#1a1715;">Did not request this\?<\/strong> You can safely ignore this email\.<\/p>/
  )
  // C3-B (05/10/2026): the brand name is plain text, not a link; Terms and Privacy before it.
  assert.match(
    shown,
    /<p style="margin:0;"><a href="https:\/\/tracy\.ai\/terms" style="color:#8a817c;">Terms<\/a> &middot; <a href="https:\/\/tracy\.ai\/privacy" style="color:#8a817c;">Privacy<\/a> &middot; <span style="color:#8a817c;">tracy\.ai<\/span><\/p>/
  )
  assert.doesNotMatch(shown, /Anthropic|The Tracy team/)
})

test('every sentence of the mail is a catalogue key, in every language', () => {
  for (const key of CONFIRMATION_KEYS) assert.equal(typeof en[key], 'string', `strings.js lacks ${key}`)
  const vars = {
    name: body.name,
    email: body.email,
    platforms: body.platforms.join(', '),
    count: body.site_count,
    website: body.website,
    url: `${ORIGIN}/how-it-works/`
  }
  for (const lang of WEB_LANGUAGES) {
    const mail = confirmationMail(body.email, body, ORIGIN, lang)
    assert.equal(mail.subject, translate(lang, 'mail.confirmationSubject'), lang)
    const lines = mail.text.split('\n').filter(Boolean)
    const expected = [
      ...CONFIRMATION_KEYS.slice(1).map((key) => translate(lang, key, vars)),
      `${translate(lang, 'mail.signInNotRequested')} ${translate(lang, 'mail.signInNotRequestedRest')}`,
      `${translate(lang, 'mail.footerTerms')}: https://tracy.ai/terms · ${translate(lang, 'mail.footerPrivacy')}: https://tracy.ai/privacy`
    ]
    assert.deepEqual(lines, expected, `${lang}: a line of the mail is not a catalogue string`)
  }
})

test('the mail follows the language of the request: its html lang', () => {
  for (const lang of WEB_LANGUAGES) {
    const mail = confirmationMail(body.email, body, ORIGIN, lang)
    assert.match(mail.html, new RegExp(`<html lang="${htmlLang(lang)}">`), lang)
    assert.doesNotMatch(mail.html + mail.text, /Anthropic/, `${lang}: no trademark line`)
  }
})

test('a language the product does not ship, or a value that is not one, reads as English', () => {
  const english = confirmationMail(body.email, body, ORIGIN)
  for (const lang of ['ja', '', 'DE', 'de-AT', null, undefined, 7, {}, '__proto__', 'constructor']) {
    assert.deepEqual(confirmationMail(body.email, body, ORIGIN, lang), english, JSON.stringify(lang))
  }
})

test('what the visitor typed is text in every language: escaped in HTML, never re-read as a placeholder', () => {
  for (const lang of WEB_LANGUAGES) {
    const mail = confirmationMail(
      'a&b@example.com',
      { ...body, name: '<script>alert(1)</script> {email}', website: 'https://x.test/?a="><img src=x>' },
      ORIGIN,
      lang
    )
    // The layout's own logo is an <img>; what the visitor typed must never become one.
    assert.doesNotMatch(mail.html, /<script|<img src=x/, lang)
    assert.match(mail.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; \{email\}/, lang)
    assert.match(mail.html.replaceAll('&zwnj;', ''), /a&amp;b@example\.com/, lang)
    assert.match(mail.html, /\?a=&quot;&gt;&lt;img src=x&gt;/, lang)
    // The plain-text part carries the data as typed; `{email}` inside the name stays literal.
    assert.match(mail.text, /<script>alert\(1\)<\/script> \{email\}/, lang)
  }
})

test('optional fields stay optional', () => {
  for (const lang of WEB_LANGUAGES) {
    const mail = confirmationMail(body.email, { ...body, website: null }, undefined, lang)
    // The footer's Terms and Privacy addresses are the only ones left.
    assert.deepEqual(
      mail.text.match(/https:\/\/\S+/g),
      ['https://tracy.ai/terms', 'https://tracy.ai/privacy'],
      `${lang}: no website line and no marketing link`
    )
    assert.doesNotMatch(mail.text, /\{[a-zA-Z]+\}/, `${lang}: no unfilled placeholder`)
    assert.doesNotMatch(mail.text, /early access|free|soon/i, lang)
  }
})

// ── The door ────────────────────────────────────────────────────────────────────────────────

/** The statements the door runs, answered from memory. An unknown statement throws: no silent pass. */
function fakePool() {
  const rows = new Map()
  const log = []
  let nextId = 1
  const run = async (sql, params = []) => {
    const text = sql.replace(/\s+/g, ' ').trim()
    log.push(text)
    if (/^(begin|commit|rollback)$/.test(text) || text.startsWith('select pg_advisory_xact_lock'))
      return { rows: [] }
    if (text.startsWith('insert into whitelist_confirmation')) {
      const [email, payload] = params
      if (!rows.has(email))
        rows.set(email, {
          id: nextId++,
          email,
          // The driver stores JSON: what comes back is a copy, not the object that was passed in.
          payload: JSON.parse(JSON.stringify(payload)),
          status: 'queued',
          provider_id: null,
          first_attempt_at: null,
          locked_until: null,
          attempts: 0
        })
      return { rows: [], rowCount: 1 }
    }
    // The door judges both ages in SQL; here the fake's one clock stands in for the database's.
    if (/^select \*, .* from whitelist_confirmation where email=\$1 for update$/.test(text)) {
      const row = rows.get(params[0])
      if (!row) return { rows: [] }
      const past_window = row.first_attempt_at !== null && Date.now() - row.first_attempt_at >= 23 * 3600_000
      const locked = row.locked_until !== null && row.locked_until > new Date()
      return { rows: [{ ...row, past_window, locked }] }
    }
    // The form's answers for `/ops` › Beta › Waitlist; what they hold is `whitelist-confirmation.test.mjs`'s.
    if (text.startsWith('insert into beta_waitlist')) return { rows: [], rowCount: 1 }
    if (text.startsWith('insert into whitelist_mail_budget')) return { rows: [{ reserved: 1 }], rowCount: 1 }
    if (text.startsWith('update whitelist_confirmation set locked_until=now()+interval')) {
      const row = rows.get(params[0])
      row.first_attempt_at ??= new Date()
      row.attempts += 1
      return { rows: [], rowCount: 1 }
    }
    if (text.startsWith("update whitelist_confirmation set status='sent'")) {
      const row = rows.get(params[0])
      row.status = 'sent'
      row.provider_id = params[1]
      return { rows: [], rowCount: 1 }
    }
    if (text.startsWith('update whitelist_confirmation set locked_until=null'))
      return { rows: [], rowCount: 1 }
    throw new Error(`fakePool: unexpected statement: ${text}`)
  }
  return { rows, log, query: run, connect: async () => ({ query: run, release() {} }) }
}

function door(send) {
  const pool = fakePool()
  const app = confirmationRoutes({
    confirmationMail,
    config: { beta: { confirmationSecret: secret, confirmationDaily: 80, waitlistOrigin: ORIGIN } },
    pool,
    mail: { send }
  })
  const post = (data = body, { token = secret, headers = {}, query = '', raw } = {}) =>
    app.request(`/internal/beta/confirmation${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
      body: raw ?? JSON.stringify(data)
    })
  return { pool, post }
}

const recorder = () => {
  const sent = []
  return {
    sent,
    send: async ({ signal: _signal, ...payload }) => {
      sent.push(payload)
      return `mail-${sent.length}`
    }
  }
}

test('the door writes the mail in the language of the request', async () => {
  for (const lang of WEB_LANGUAGES) {
    const { sent, send } = recorder()
    const { post } = door(send)
    const res = await post(body, { headers: { 'accept-language': `${lang}-XX, ${lang};q=0.9, en;q=0.1` } })
    assert.equal(res.status, 200, lang)
    assert.equal(sent.length, 1, lang)
    assert.deepEqual(
      { subject: sent[0].subject, text: sent[0].text, html: sent[0].html },
      confirmationMail(body.email, body, ORIGIN, lang),
      lang
    )
    assert.equal(sent[0].to, body.email)
    assert.equal(sent[0].idempotencyKey, 'tracy-whitelist/1')
  }
  const { sent, send } = recorder()
  const { post } = door(send)
  assert.equal((await post(body, { query: '?lang=de', headers: { 'accept-language': 'fr' } })).status, 200)
  assert.match(sent[0].html, /<html lang="de">/, '?lang= comes before the header')
})

test('no language, an unknown one or a malformed header: English', async () => {
  for (const header of [undefined, '', 'ja, ko;q=0.9', 'de;q=0', ';;;', 'x'.repeat(2000)]) {
    const { sent, send } = recorder()
    const { post } = door(send)
    const res = await post(body, { headers: header === undefined ? {} : { 'accept-language': header } })
    assert.equal(res.status, 200, String(header).slice(0, 20))
    assert.equal(sent[0].text, ENGLISH_TEXT, String(header).slice(0, 20))
  }
})

test('refusals come before any side effect, whatever language is asked for', async () => {
  const { sent, send } = recorder()
  const { pool, post } = door(send)
  const lang = { headers: { 'accept-language': 'de' } }
  assert.equal((await post(body, { ...lang, token: 'wrong' })).status, 401)
  assert.equal((await post(body, { ...lang, token: '' })).status, 401)
  assert.equal((await post(body, { ...lang, token: `${secret}x` })).status, 401)
  assert.equal((await post(body, { ...lang, raw: '{not json' })).status, 400)
  assert.equal((await post({ ...body, platforms: [] }, lang)).status, 400)
  assert.equal((await post({ ...body, email: 'not-an-address' }, lang)).status, 400)
  assert.equal((await post({ ...body, name: 'n'.repeat(121) }, lang)).status, 400)
  assert.equal((await post({ ...body, replyTo: 'nope' }, lang)).status, 400)
  assert.equal((await post({ ...body, confirmation: { html: 1, text: 'bad' } }, lang)).status, 400)
  assert.equal(
    (await post({ ...body, confirmation: { html: 'h'.repeat(24001), text: 't' } }, lang)).status,
    400
  )
  assert.equal(
    (await post({ ...body, confirmation: { html: '<p>h</p>', text: 't'.repeat(8001) } }, lang)).status,
    400
  )
  assert.deepEqual(pool.log, [], 'no statement ran')
  assert.equal(pool.rows.size, 0)
  assert.equal(sent.length, 0, 'no mail left')
})

test('the WordPress template still replaces the body; the subject stays the catalogue’s', async () => {
  const { sent, send } = recorder()
  const { post } = door(send)
  const rendered = { html: '<p>Sarah template</p>', text: 'Sarah template' }
  const res = await post({ ...body, confirmation: rendered }, { headers: { 'accept-language': 'fr' } })
  assert.equal(res.status, 200)
  assert.equal(sent[0].html, rendered.html)
  assert.equal(sent[0].text, rendered.text)
  assert.equal(sent[0].subject, translate('fr', 'mail.confirmationSubject'))
})

test('a retry in another language sends the payload stored first, unchanged', async () => {
  const sent = []
  let fail = true
  const { pool, post } = door(async ({ signal: _signal, ...payload }) => {
    sent.push(payload)
    if (fail) throw new Error('timeout')
    return 'mail-1'
  })
  const first = await post(body, { headers: { 'accept-language': 'de' } })
  assert.equal(first.status, 503)
  assert.deepEqual(await first.json(), { status: 'queued' })
  assert.equal(pool.rows.get(body.email).status, 'queued', 'a send that failed is not recorded as sent')
  fail = false
  const second = await post({ ...body, name: 'Changed' }, { headers: { 'accept-language': 'vi' } })
  assert.equal(second.status, 200)
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[1], sent[0], 'same payload, same idempotency key')
  assert.match(sent[1].html, /<html lang="de">/, 'the first language is kept')
  assert.match(sent[1].text, /^Hallo Visitor,/, 'and so is the first name, in the first language')
  // Acknowledged: a third call sends nothing.
  const third = await post(body, { headers: { 'accept-language': 'es' } })
  assert.equal(third.status, 200)
  assert.deepEqual(await third.json(), { status: 'sent', id: 'mail-1' })
  assert.equal(sent.length, 2)
})

test('a provider that does not acknowledge leaves the mail unsent', async () => {
  for (const answer of [undefined, null, '']) {
    const { pool, post } = door(async () => answer)
    const res = await post(body, { headers: { 'accept-language': 'it' } })
    assert.equal(res.status, 503, JSON.stringify(answer))
    assert.equal(pool.rows.get(body.email).status, 'queued', JSON.stringify(answer))
    assert.equal(pool.rows.get(body.email).provider_id, null)
  }
})

test('two requests for one address in two languages: one stored payload, the first one', async () => {
  const { sent, send } = recorder()
  const { pool, post } = door(send)
  const [a, b] = await Promise.all([
    post(body, { headers: { 'accept-language': 'nl' } }),
    post(body, { headers: { 'accept-language': 'es' } })
  ])
  assert.deepEqual([a.status, b.status].sort(), [200, 200])
  assert.equal(pool.rows.size, 1)
  const stored = pool.rows.get(body.email).payload
  for (const mail of sent) assert.equal(mail.text, stored.text, 'every send used the stored payload')
})
