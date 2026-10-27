/**
 * #804 F-S3-017 — the link in a team invitation mail works for seven days, counted from the
 * token's own `iat`.
 *
 * WHAT THIS FILE RUNS. The real `seatsRoutes` door `GET /invite/:token` and the real mail builder,
 * with a clock the test holds (`now`) and tokens signed here with the door's own secret, so an
 * `iat` of any age or shape can be put in front of it.
 *
 * WHAT IT DOES NOT RUN. There is no database: `pool` answers only the statements its fixture
 * lists, records every statement it sees, and rejects (and remembers) anything else. The seat
 * book is a small map this file keeps, so the conditional `update seat` of `acceptGrant` is
 * modelled, not executed; two people racing on a real PostgreSQL row is not covered here.
 *
 * The last section runs `POST /api/team/invite` the same way: the expired page tells its reader to
 * ask for a new invitation, so that door must be able to send one for a seat still waiting.
 *
 *   node --test apps/tracy-web/test/invite-expiry.test.mjs
 */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseHTML } from 'linkedom'

import { PEOPLE_ROUTES } from '../src/api-reference/routes/people.js'
import { readConfig } from '../src/config.js'
import { WEB_LANGUAGES, translate } from '../src/lib/i18n/index.js'
import { en } from '../src/lib/i18n/strings.js'
import * as policy from '../src/lib/policy.js'
import { mintSession } from '../src/lib/session.js'
import { signTeamInvite } from '../src/lib/team-invite.js'
import * as emails from '../src/mail/emails.js'
import { seatsRoutes } from '../src/seats/route.js'

const ORIGIN = 'https://tracy.test'
const INVITED = 'invited@example.test'
const SITE = 'acme.tracy.test'
const OTHER_SITE = 'beta.tracy.test'
const THIRD_SITE = 'gamma.tracy.test'
const FOURTH_SITE = 'delta.tracy.test'
const NOW = 1_790_000_000_000
const NOW_S = NOW / 1000
const DAY_S = 24 * 60 * 60
const SEVEN_DAYS_S = 7 * DAY_S

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

/**
 * A token with exactly the body given, signed the way `signTeamInvite` signs (`team-invite:` +
 * payload, HMAC-SHA256, base64url). The library stamps `iat` with the wall clock and offers no way
 * to choose it, so the tokens of this file are built here.
 */
function tokenOf(body, secret = config.sessionSecret) {
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`team-invite:${payload}`).digest('base64url')
  return `${payload}.${signature}`
}

const inviteBody = (iat, extra = {}) => ({
  v: 1,
  email: INVITED,
  role: 'editor',
  siteKeys: [SITE],
  ...(iat === undefined ? {} : { iat }),
  ...extra
})

/**
 * The seat book and the pool over it. `seats` maps a site key to its row for the invited account
 * (or nothing). Statements outside the list are rejected and kept in `unexpected`.
 */
function book(seats = {}) {
  const rows = new Map(Object.entries(seats))
  const seen = []
  const unexpected = []
  const fixtures = [
    [/^insert into rate_bucket\b/, () => [{ count: 1 }]],
    // The reads the #809 notifier adds to these doors; this file pins the seat writes.
    [
      /^select email, language from account where email = any\(\$1::text\[\]\) and language is not null$/,
      () => []
    ],
    [/^select id, email, display_name from account where id = \$1$/, () => []],
    [
      /^select s\.\*, a\.email as account_email, a\.display_name as account_display_name, a\.avatar_url as account_avatar_url from seat s join account a on a\.id = s\.account_id where s\.site_key = \$1\b/,
      () => []
    ],
    [/^insert into account \(email\) values \(\$1\)/, () => [{ id: 'acc-invited' }]],
    [
      /^select \* from seat where site_key = \$1 and account_id = \$2$/,
      ([siteKey]) => (rows.has(siteKey) ? [rows.get(siteKey)] : [])
    ],
    [
      /^update seat set accepted_at = now\(\) where site_key = \$1 and account_id = \$2 and revoked_at is null and declined_at is null and accepted_at is null returning \*$/,
      ([siteKey]) => {
        const row = rows.get(siteKey)
        if (!row || row.revoked_at || row.declined_at || row.accepted_at) return []
        row.accepted_at = new Date(NOW)
        return [row]
      }
    ]
  ]
  return {
    rows,
    seen,
    unexpected,
    writes: () => seen.filter((q) => !/^(select|insert into rate_bucket)\b/.test(q.text)),
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim()
      seen.push({ text, params })
      for (const [pattern, answer] of fixtures) {
        if (pattern.test(text)) return { rows: await answer(params) }
      }
      unexpected.push(text)
      throw new Error(`book: unexpected statement: ${text}`)
    }
  }
}

const pending = (role = 'editor') => ({
  site_key: SITE,
  account_id: 'acc-invited',
  role,
  accepted_at: null,
  revoked_at: null,
  declined_at: null,
  requested_at: null
})

function door(pool, now = () => NOW) {
  return seatsRoutes({
    pool,
    config,
    now,
    mail: { send: async () => {} },
    sites: { labelOf: async () => 'acme' }
  })
}

const sessionOf = (email) => mintSession(email, config.sessionSecret, Date.now())

async function open(pool, token, { email = INVITED, lang, now } = {}) {
  const cookie = email ? `tracy_sess=${await sessionOf(email)}` : null
  const url = new URL(`/invite/${token}`, ORIGIN)
  if (lang) url.searchParams.set('lang', lang)
  const response = await door(pool, now).fetch(
    new Request(url, { redirect: 'manual', headers: cookie ? { cookie } : {} })
  )
  const html = await response.text()
  const { document } = parseHTML(html)
  return { response, html, document, heading: document.querySelector('h1')?.textContent ?? '' }
}

const untouched = (pool, token) => {
  assert.deepEqual(pool.unexpected, [])
  assert.deepEqual(pool.writes(), [], 'no account, seat or audit write')
  const rate = pool.seen.filter((q) => q.text.startsWith('insert into rate_bucket'))
  assert.equal(rate.length, 1, 'the open is still counted')
  assert.equal(rate[0].params[0], `invite-accept:${token}`)
  assert.equal(pool.seen.length, 1, 'and nothing else is asked of the database')
}

// ── The policy value ──────────────────────────────────────────────────────────────────────────

test('F-S3-017: the invitation link lifetime is one policy value, seven days', () => {
  assert.equal(policy.TEAM_INVITE_TTL_S, SEVEN_DAYS_S)
  assert.equal(policy.TEAM_INVITE_TTL_DAYS, 7)
})

// ── Inside the lifetime ───────────────────────────────────────────────────────────────────────

test('F-S3-017: a link 6 days 23 hours old is accepted', async () => {
  const pool = book({ [SITE]: pending() })
  const token = tokenOf(inviteBody(NOW_S - (SEVEN_DAYS_S - 3600)))
  const { response } = await open(pool, token)
  assert.equal(response.status, 200)
  assert.deepEqual(pool.unexpected, [])
  assert.ok(pool.rows.get(SITE).accepted_at, 'the seat was accepted')
})

test('F-S3-017: a link exactly 7 days old is still accepted', async () => {
  const pool = book({ [SITE]: pending() })
  const { response } = await open(pool, tokenOf(inviteBody(NOW_S - SEVEN_DAYS_S)))
  assert.equal(response.status, 200)
  assert.ok(pool.rows.get(SITE).accepted_at)
})

// ── Past the lifetime ─────────────────────────────────────────────────────────────────────────

test('F-S3-017: a link 7 days and 1 second old is refused and nothing is written', async () => {
  const pool = book({ [SITE]: pending() })
  const token = tokenOf(inviteBody(NOW_S - SEVEN_DAYS_S - 1))
  const { response, heading, html } = await open(pool, token)
  assert.equal(response.status, 410)
  assert.equal(response.headers.get('location'), null)
  assert.equal(heading, 'This invitation link has expired')
  assert.match(html, /works for 7 days/)
  assert.match(html, /send a new invitation/)
  untouched(pool, token)
  assert.equal(pool.rows.get(SITE).accepted_at, null, 'the seat row is as it was')
})

test('F-S3-017: an expired link says so to a signed-out reader too, instead of sending them to sign in', async () => {
  for (const email of [null, 'other@example.test']) {
    const pool = book({ [SITE]: pending() })
    const token = tokenOf(inviteBody(NOW_S - 30 * DAY_S))
    const { response, heading } = await open(pool, token, { email })
    assert.equal(response.status, 410, `viewer ${email}`)
    assert.equal(response.headers.get('location'), null)
    assert.equal(heading, 'This invitation link has expired')
    untouched(pool, token)
  }
})

test('F-S3-017: the age is read against the clock the door is given, to the second', async () => {
  const iat = NOW_S - SEVEN_DAYS_S
  const token = tokenOf(inviteBody(iat))
  const before = book({ [SITE]: pending() })
  assert.equal((await open(before, token, { now: () => NOW + 999 })).response.status, 200)
  const after = book({ [SITE]: pending() })
  assert.equal((await open(after, token, { now: () => NOW + 1000 })).response.status, 410)
  untouched(after, token)
})

test('F-S3-017: an expired link takes away nothing a person already holds', async () => {
  const accepted = { ...pending(), accepted_at: new Date(NOW - 20 * DAY_S * 1000) }
  const pool = book({ [SITE]: accepted })
  const token = tokenOf(inviteBody(NOW_S - 20 * DAY_S))
  const { response } = await open(pool, token)
  assert.equal(response.status, 410)
  untouched(pool, token)
  assert.deepEqual(pool.rows.get(SITE), accepted)
})

test('F-S3-017: the expired page states the lifetime in each of the eight languages', async () => {
  const seenHeadings = new Set()
  for (const lang of WEB_LANGUAGES) {
    const pool = book({ [SITE]: pending() })
    const { response, heading, document } = await open(pool, tokenOf(inviteBody(NOW_S - 8 * DAY_S)), {
      lang
    })
    assert.equal(response.status, 410, lang)
    const text = document.querySelector('main').textContent
    assert.ok(heading.length > 0, lang)
    assert.match(text, /7/, `${lang}: the page names the number of days`)
    assert.doesNotMatch(text, /[{}]/, `${lang}: no placeholder is left in the page`)
    assert.doesNotMatch(text, /seats\.[a-zA-Z]/, `${lang}: no raw key is printed`)
    seenHeadings.add(heading)
  }
  assert.equal(seenHeadings.size, WEB_LANGUAGES.length, 'each language has its own heading')
})

// ── An `iat` the door cannot age ──────────────────────────────────────────────────────────────

test('F-S3-017: a link dated in the future is refused and nothing is written', async () => {
  for (const ahead of [1, 60, 365 * DAY_S]) {
    const pool = book({ [SITE]: pending() })
    const token = tokenOf(inviteBody(NOW_S + ahead))
    const { response, heading } = await open(pool, token)
    assert.equal(response.status, 404, `${ahead}s ahead`)
    assert.equal(response.headers.get('location'), null)
    assert.equal(heading, 'This invitation link is not valid')
    untouched(pool, token)
  }
})

test('F-S3-017: a link with no usable iat is refused and nothing is written', async () => {
  const cases = {
    missing: undefined,
    null: null,
    string: String(NOW_S - 60),
    fraction: NOW_S - 60.5,
    negative: -1,
    unsafe: Number.MAX_SAFE_INTEGER + 2,
    huge: 1e308,
    boolean: true,
    array: [NOW_S - 60],
    object: { s: NOW_S - 60 }
  }
  for (const [name, iat] of Object.entries(cases)) {
    const pool = book({ [SITE]: pending() })
    const body = name === 'missing' ? inviteBody(undefined) : { ...inviteBody(0), iat }
    const token = tokenOf(body)
    const { response, heading } = await open(pool, token)
    assert.equal(response.status, 404, name)
    assert.equal(response.headers.get('location'), null, name)
    assert.equal(heading, 'This invitation link is not valid', name)
    untouched(pool, token)
  }
})

// ── Refusals that were already there ──────────────────────────────────────────────────────────

test('F-S3-017: a forged, broken or foreign token is still refused whatever its age', async () => {
  const fresh = inviteBody(NOW_S - 60)
  const good = tokenOf(fresh)
  const [payload, signature] = good.split('.')
  const tokens = {
    'wrong secret': tokenOf(fresh, 'x'.repeat(32)),
    'payload swapped': `${Buffer.from(JSON.stringify({ ...fresh, email: 'thief@example.test' })).toString('base64url')}.${signature}`,
    'signature cut': `${payload}.${signature.slice(0, -4)}`,
    'no signature': payload,
    'three parts': `${good}.x`,
    'not base64': '%%%.%%%',
    'not json': tokenOf('<script>alert(1)</script>'),
    'wrong version': tokenOf({ ...fresh, v: 2 }),
    'workspace shaped': tokenOf({
      v: 1,
      email: INVITED,
      role: 'owner',
      workspaceId: 'ws_1',
      iat: NOW_S - 60
    }),
    'no sites': tokenOf({ ...fresh, siteKeys: [] }),
    'unknown role': tokenOf({ ...fresh, role: 'owner' })
  }
  for (const [name, token] of Object.entries(tokens)) {
    const pool = book({ [SITE]: pending() })
    const { response, html } = await open(pool, encodeURIComponent(token))
    assert.equal(response.status, 404, name)
    assert.doesNotMatch(html, /<script>alert|thief@example\.test/, name)
    assert.deepEqual(pool.writes(), [], name)
    assert.equal(pool.rows.get(SITE).accepted_at, null, name)
  }
})

test('F-S3-017: a link inside its lifetime still sends a signed-out reader to sign in and refuses another account', async () => {
  const token = tokenOf(inviteBody(NOW_S - 60))
  const signedOut = book({ [SITE]: pending() })
  const first = await open(signedOut, token, { email: null })
  assert.equal(first.response.status, 303)
  assert.equal(
    first.response.headers.get('location'),
    `/login?next=${encodeURIComponent(`/invite/${token}`)}`
  )
  assert.deepEqual(signedOut.writes(), [])

  const other = book({ [SITE]: pending() })
  const second = await open(other, token, { email: 'other@example.test' })
  assert.equal(second.response.status, 403)
  assert.deepEqual(other.writes(), [])
  assert.equal(other.rows.get(SITE).accepted_at, null)
})

test('F-S3-017: inside the lifetime the seat row still decides — accepted, revoked, declined, requested, gone', async () => {
  const at = new Date(NOW - DAY_S * 1000)
  const states = {
    pending: { row: pending(), heading: 'You are on 1 site now', accepts: true },
    accepted: { row: { ...pending(), accepted_at: at }, heading: 'This invitation was already accepted' },
    revoked: { row: { ...pending(), revoked_at: at }, heading: 'This invitation was withdrawn' },
    declined: { row: { ...pending(), declined_at: at }, heading: 'This invitation was withdrawn' },
    requested: { row: { ...pending(), requested_at: at }, heading: 'This invitation was withdrawn' },
    gone: { row: null, heading: 'This invitation was withdrawn' }
  }
  for (const [name, { row, heading, accepts = false }] of Object.entries(states)) {
    const pool = book(row ? { [SITE]: row } : {})
    const before = row ? { ...row } : null
    const { response, heading: seen } = await open(pool, tokenOf(inviteBody(NOW_S - 60)))
    assert.equal(response.status, 200, name)
    assert.equal(seen, heading, name)
    assert.deepEqual(pool.unexpected, [], name)
    if (accepts) assert.ok(pool.rows.get(SITE).accepted_at, name)
    else assert.deepEqual(pool.rows.get(SITE) ?? null, before, `${name}: the row is as it was`)
  }
})

test('F-S3-017: opening an accepted link again accepts nothing twice', async () => {
  const pool = book({ [SITE]: pending() })
  const token = tokenOf(inviteBody(NOW_S - 60))
  assert.equal((await open(pool, token)).heading, 'You are on 1 site now')
  const again = await open(pool, token)
  assert.equal(again.heading, 'This invitation was already accepted')
  assert.equal(pool.seen.filter((q) => q.text.startsWith('update seat ')).length, 1)
})

test('F-S3-017: a row revoked between the read and the write is not revived', async () => {
  const pool = book({ [SITE]: pending() })
  const query = pool.query.bind(pool)
  pool.query = async (sql, params) => {
    if (/^\s*update seat set accepted_at/.test(String(sql))) pool.rows.get(SITE).revoked_at = new Date(NOW)
    return query(sql, params)
  }
  const { response, heading } = await open(pool, tokenOf(inviteBody(NOW_S - 60)))
  assert.equal(response.status, 200)
  assert.equal(heading, 'This invitation was withdrawn')
  assert.equal(pool.rows.get(SITE).accepted_at, null)
})

test('F-S3-017: the grant comes from the seat row, never from the role the token names', async () => {
  // A link signed before ADR 0028 names `admin` (it reads as `editor`); the row holds `viewer`.
  const pool = book({ [SITE]: pending('viewer'), [OTHER_SITE]: undefined })
  pool.rows.delete(OTHER_SITE)
  const token = tokenOf(inviteBody(NOW_S - 60, { role: 'admin', siteKeys: [SITE, OTHER_SITE] }))
  const { response } = await open(pool, token)
  assert.equal(response.status, 200)
  const updates = pool.seen.filter((q) => q.text.startsWith('update seat '))
  assert.equal(updates.length, 1, 'only the site that has a pending row')
  assert.deepEqual(updates[0].params, [SITE, 'acc-invited'])
  assert.doesNotMatch(updates[0].text, /role/)
  assert.equal(pool.rows.get(SITE).role, 'viewer')
  assert.equal(pool.rows.has(OTHER_SITE), false, 'no seat is created for a site the book does not list')
})

test('F-S3-017: the rate cap still answers before the link is read, expired or not', async () => {
  for (const iat of [NOW_S - 60, NOW_S - 30 * DAY_S]) {
    const pool = book({ [SITE]: pending() })
    const query = pool.query.bind(pool)
    pool.query = async (sql, params) => {
      const answer = await query(sql, params)
      return /^\s*insert into rate_bucket/.test(String(sql))
        ? { rows: [{ count: policy.WRITE_LIMIT_PER_HOUR + 1 }] }
        : answer
    }
    const { response } = await open(pool, tokenOf(inviteBody(iat)))
    assert.equal(response.status, 429)
    assert.deepEqual(pool.writes(), [])
  }
  // A rate store that fails closes the door too.
  const pool = book({ [SITE]: pending() })
  pool.query = async () => {
    throw new Error('rate store down')
  }
  assert.equal((await open(pool, tokenOf(inviteBody(NOW_S - 60)))).response.status, 429)
})

test('F-S3-017: a token the library signs today opens the door', async () => {
  const pool = book({ [SITE]: pending() })
  const token = await signTeamInvite(
    { email: INVITED, role: 'editor', siteKeys: [SITE] },
    config.sessionSecret
  )
  const { response } = await open(pool, token, { now: Date.now })
  assert.equal(response.status, 200)
  assert.ok(pool.rows.get(SITE).accepted_at)
})

// ── The mail says the same number ─────────────────────────────────────────────────────────────

test('F-S3-017: the invitation mail states the lifetime from the policy value, text and HTML, in eight languages', () => {
  const days = String(policy.TEAM_INVITE_TTL_DAYS)
  assert.equal(days, '7')
  assert.match(en['mail.teamLinkLifetime'] ?? '', /\{days\}/, 'the number is a placeholder, not typed')
  const sentences = new Set()
  for (const lang of WEB_LANGUAGES) {
    const letter = emails.teamInviteMail({
      inviterEmail: 'boss@example.test',
      role: 'editor',
      siteKeys: [SITE],
      acceptUrl: `${ORIGIN}/invite/TOKEN`,
      lang
    })
    const sentence = translate(lang, 'mail.teamLinkLifetime', { days })
    assert.ok(sentence.includes(days), `${lang}: the sentence carries the number`)
    assert.doesNotMatch(sentence, /[{}]|mail\.teamLinkLifetime/, `${lang}: translated, nothing left open`)
    assert.ok(letter.text.split('\n').includes(sentence), `${lang}: in the text part`)
    const { document } = parseHTML(`<main>${letter.html}</main>`)
    const paragraphs = [...document.querySelectorAll('p')].map((p) => p.textContent)
    assert.ok(paragraphs.includes(sentence), `${lang}: in the HTML part`)
    assert.doesNotMatch(letter.text + letter.html, /\{[a-zA-Z]+\}/, `${lang}: no placeholder left`)
    sentences.add(sentence)
  }
  assert.equal(sentences.size, WEB_LANGUAGES.length, 'each language has its own sentence')
})

// ── No second copy of the number ──────────────────────────────────────────────────────────────

test('F-S3-017: the API reference states the invitation link lifetime from the policy value', () => {
  const doc = PEOPLE_ROUTES.find((row) => row.method === 'POST' && row.path === '/api/team/invite')
  assert.ok(doc, 'the invite door is documented')
  assert.ok(
    doc.description.includes(`the link works for ${policy.TEAM_INVITE_TTL_DAYS} days`),
    'the reference says the policy number'
  )
  assert.doesNotMatch(doc.description, /\$\{|undefined|NaN/, 'the number was filled in')
})

test('F-S3-017: no source file or dictionary types the invitation lifetime by hand', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url))
  const POLICY = join('lib', 'policy.js')
  // The Welcome popup's scenes are a recorded picture of the app (like the language, vocabulary and
  // origins gates, this check leaves them out): they show the invite screen as it looked, not a rule.
  const SCENES = join('welcome', 'scenes') + '/'
  // A count of days written as a digit, in English or in any of the seven translations.
  const typedDays = /\d+\s*-?\s*(days?|ngày|tage?|jours?|giorni|dagen|días|天)(?![\p{L}])/iu
  const aboutInvite = /invit|mời|einlad|uitnodig|邀请/iu
  const offenders = []
  for (const name of readdirSync(src, { recursive: true })) {
    const isDictionary = name.includes(join('i18n', 'locales')) && name.endsWith('.json')
    if (name === POLICY || name.startsWith(SCENES) || !(name.endsWith('.js') || isDictionary)) continue
    readFileSync(join(src, name), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (typedDays.test(line) && aboutInvite.test(line)) offenders.push(`${name}:${i + 1}`)
      })
  }
  assert.deepEqual(offenders, [], 'the lifetime is read from lib/policy.js, never typed')
})

// ── Asking for a new invitation ───────────────────────────────────────────────────────────────

const BOSS = 'boss@example.test'

/**
 * The invite door over the same kind of book: the caller's own accepted seat (`callerRole`) and
 * the invited account's rows (`seats`, by site key). Returns the pool, every letter the door sent,
 * and the door itself, so a link taken from a letter can be opened on it.
 */
function inviteDoor({ seats = {}, callerRole = 'owner', send } = {}) {
  const rows = new Map(Object.entries(seats))
  const seen = []
  const unexpected = []
  const letters = []
  const fixtures = [
    [/^insert into rate_bucket\b/, () => [{ count: 1 }]],
    // The reads the #809 notifier adds to the invite and accept doors: the inviter's name, the
    // invitee's language, and the site's team for the rows an accepted seat writes.
    [
      /^select s\.\*, a\.email as account_email, a\.display_name as account_display_name, a\.avatar_url as account_avatar_url from seat s join account a on a\.id = s\.account_id where s\.site_key = \$1\b/,
      () => []
    ],
    [/^select id, email, display_name from account where id = \$1$/, () => []],
    [
      /^select email, language from account where email = any\(\$1::text\[\]\) and language is not null$/,
      () => []
    ],
    [
      /^insert into account \(email\) values \(\$1\)/,
      ([email]) => [{ id: email === BOSS ? 'acc-boss' : 'acc-invited' }]
    ],
    [
      /^select \* from seat where account_id = \$1 and site_key = \$2 and revoked_at is null and declined_at is null and accepted_at is not null$/,
      ([accountId, siteKey]) =>
        accountId === 'acc-boss'
          ? [{ account_id: 'acc-boss', site_key: siteKey, role: callerRole, accepted_at: new Date(NOW) }]
          : []
    ],
    [/^select \* from seat where account_id = \$1 and site_key = \$2$/, () => []],
    [
      /^select \* from seat where site_key = \$1 and account_id = \$2$/,
      ([siteKey, accountId]) => (accountId === 'acc-invited' && rows.has(siteKey) ? [rows.get(siteKey)] : [])
    ],
    [
      /^insert into seat \(site_key, account_id, role, granted_by, granted_at, accepted_at, requested_at, created_by_proof\)/,
      ([siteKey, accountId, role]) => {
        const held = rows.get(siteKey)
        if (held && !held.revoked_at && !held.declined_at) return []
        const row = { ...pending(role), site_key: siteKey, account_id: accountId }
        rows.set(siteKey, row)
        return [row]
      }
    ],
    [
      /^update seat set accepted_at = now\(\) where site_key = \$1 and account_id = \$2 and revoked_at is null and declined_at is null and accepted_at is null returning \*$/,
      ([siteKey]) => {
        const row = rows.get(siteKey)
        if (!row || row.revoked_at || row.declined_at || row.accepted_at) return []
        row.accepted_at = new Date(NOW)
        return [row]
      }
    ]
  ]
  const pool = {
    rows,
    seen,
    unexpected,
    seatWrites: () => seen.filter((q) => /^(insert into|update) seat\b/.test(q.text)),
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim()
      seen.push({ text, params })
      for (const [pattern, answer] of fixtures) {
        if (pattern.test(text)) return { rows: await answer(params) }
      }
      unexpected.push(text)
      throw new Error(`inviteDoor: unexpected statement: ${text}`)
    }
  }
  const app = seatsRoutes({
    pool,
    config,
    now: () => NOW,
    mail: {
      teamInviteMail: emails.teamInviteMail,
      send:
        send ??
        (async (letter) => {
          letters.push(letter)
        })
    },
    sites: { labelOf: async () => 'acme' }
  })
  return { pool, letters, app }
}

async function invite(app, { role = 'editor', siteKeys = [SITE], lang } = {}) {
  const url = new URL('/api/team/invite', ORIGIN)
  if (lang) url.searchParams.set('lang', lang)
  const response = await app.fetch(
    new Request(url, {
      method: 'POST',
      headers: { cookie: `tracy_sess=${await sessionOf(BOSS)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ role, emails: [INVITED], siteKeys })
    })
  )
  return { response, result: (await response.json()).results?.[0] }
}

/** The body of the token in a letter's accept link. */
function linkOf(letter) {
  const token = letter.text.match(/\/invite\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/)?.[1]
  assert.ok(token, 'the letter carries an invitation link')
  return { token, body: JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) }
}

test('F-S3-017: inviting again while the seat still waits sends a new link, and the row stays as it was', async () => {
  const { pool, letters, app } = inviteDoor({ seats: { [SITE]: pending() } })
  const before = JSON.stringify(pool.rows.get(SITE))

  // The link from the first invitation is past its lifetime…
  const stale = tokenOf(inviteBody(NOW_S - SEVEN_DAYS_S - 1))
  const refused = await app.fetch(
    new Request(new URL(`/invite/${stale}`, ORIGIN), {
      redirect: 'manual',
      headers: { cookie: `tracy_sess=${await sessionOf(INVITED)}` }
    })
  )
  assert.equal(refused.status, 410)

  // …so the person asks, and the inviter invites the same address again.
  const { response, result } = await invite(app)
  assert.equal(response.status, 200)
  assert.equal(result.notified, true, 'a new invitation was mailed')
  // `invited`, the outcome the wizard reads together with `notified`; `renewed` says no seat was made.
  assert.deepEqual(result.sites, [{ siteKey: SITE, outcome: 'invited', renewed: true }])
  assert.equal(letters.length, 1)
  assert.equal(letters[0].to, INVITED)
  assert.deepEqual(pool.seatWrites(), [], 'the waiting seat is not rewritten')
  assert.equal(JSON.stringify(pool.rows.get(SITE)), before)

  const { token, body } = linkOf(letters[0])
  assert.notEqual(token, stale)
  assert.deepEqual(body.siteKeys, [SITE])
  assert.equal(body.role, 'editor')
  assert.equal(policy.TEAM_INVITE_TTL_S > 0 && Number.isSafeInteger(body.iat), true)

  // The new link is one this door signed just now; the door's clock in this file is a fixed
  // instant, so it is opened on a door whose clock is the wall clock the link was stamped with.
  const accepting = seatsRoutes({
    pool,
    config,
    mail: { send: async () => {} },
    sites: { labelOf: async () => 'acme' }
  })
  const opened = await accepting.fetch(
    new Request(new URL(`/invite/${token}`, ORIGIN), {
      redirect: 'manual',
      headers: { cookie: `tracy_sess=${await sessionOf(INVITED)}` }
    })
  )
  assert.equal(opened.status, 200)
  assert.ok(pool.rows.get(SITE).accepted_at, 'the new link accepts the seat')
  assert.deepEqual(pool.unexpected, [])
})

test('F-S3-017: a waiting seat of another role is not renewed — no letter, the row as it was', async () => {
  const { pool, letters, app } = inviteDoor({ seats: { [SITE]: pending('editor') } })
  const { result } = await invite(app, { role: 'viewer' })
  assert.equal(result.notified, false, 'nothing was mailed, and the answer says so')
  assert.deepEqual(result.sites, [{ siteKey: SITE, outcome: 'already_granted' }])
  assert.deepEqual(letters, [])
  assert.equal(pool.rows.get(SITE).role, 'editor', 'the role on the row is not changed')
  assert.deepEqual(pool.seatWrites(), [])
  assert.deepEqual(pool.unexpected, [])

  // Asked for in the role the row holds, the same seat is renewed.
  const again = await invite(app, { role: 'editor' })
  assert.equal(again.result.notified, true)
  assert.deepEqual(again.result.sites, [{ siteKey: SITE, outcome: 'invited', renewed: true }])
  assert.equal(letters.length, 1)
  assert.equal(linkOf(letters[0]).body.role, 'editor')
  assert.ok(letters[0].text.includes(translate('en', 'role.editor')), 'the letter names the seat role')
  assert.deepEqual(pool.seatWrites(), [])
})

// One person, one letter, one `notified`: what the answer says about the mail is true of every
// site it reports as `invited`, whatever mix of new, waiting and held seats the request met.
const mixed = () => ({
  [OTHER_SITE]: pending('editor'),
  [THIRD_SITE]: pending('viewer'),
  [FOURTH_SITE]: { ...pending('editor'), accepted_at: new Date(NOW) }
})
const MIXED_KEYS = [SITE, OTHER_SITE, THIRD_SITE, FOURTH_SITE]

test('F-S3-017: a new seat and waiting seats of the same and of another role — one letter, one result', async () => {
  const { pool, letters, app } = inviteDoor({ seats: mixed() })
  const { result } = await invite(app, { role: 'editor', siteKeys: MIXED_KEYS })
  assert.equal(result.notified, true)
  assert.deepEqual(result.sites, [
    { siteKey: SITE, outcome: 'invited' },
    { siteKey: OTHER_SITE, outcome: 'invited', renewed: true },
    { siteKey: THIRD_SITE, outcome: 'already_granted' },
    { siteKey: FOURTH_SITE, outcome: 'already_granted' }
  ])
  assert.equal(letters.length, 1, 'never a second letter to the same person')
  const { body } = linkOf(letters[0])
  assert.equal(body.role, 'editor')
  assert.deepEqual(body.siteKeys, [SITE, OTHER_SITE], 'exactly the sites answered as invited')
  assert.equal(pool.seatWrites().length, 1, 'only the new seat is written')
  assert.deepEqual(pool.unexpected, [])
})

test('F-S3-017: when that one letter fails, every invited site reads not mailed and no other site does', async () => {
  let sends = 0
  const { pool, app } = inviteDoor({
    seats: mixed(),
    send: async () => {
      sends += 1
      throw new Error('provider said no')
    }
  })
  const { response, result } = await invite(app, { role: 'editor', siteKeys: MIXED_KEYS })
  assert.equal(response.status, 200)
  assert.equal(sends, 1, 'one send was tried, so one result describes it')
  assert.equal(result.notified, false)
  // `invited` + notified:false is "not mailed" for both sites of the letter; the two seats that
  // were never in it keep `already_granted`, which no mail result changes.
  assert.deepEqual(result.sites, [
    { siteKey: SITE, outcome: 'invited' },
    { siteKey: OTHER_SITE, outcome: 'invited', renewed: true },
    { siteKey: THIRD_SITE, outcome: 'already_granted' },
    { siteKey: FOURTH_SITE, outcome: 'already_granted' }
  ])
  assert.equal(pool.rows.get(OTHER_SITE).accepted_at, null, 'the waiting seat still waits')
  assert.deepEqual(pool.unexpected, [])
})

test('F-S3-017: somebody who may not invite cannot renew an invitation', async () => {
  // A viewer invites nobody (ADR 0028), so a waiting invitation is not renewed through them in
  // either role, the waiting one included.
  for (const role of ['editor', 'viewer']) {
    const { pool, letters, app } = inviteDoor({ seats: { [SITE]: pending('editor') }, callerRole: 'viewer' })
    const { result } = await invite(app, { role })
    assert.equal(result.notified, false, role)
    assert.deepEqual(result.sites, [{ siteKey: SITE, outcome: 'refused', code: 'NOT_SITE_EDITOR' }], role)
    assert.deepEqual(letters, [], role)
    assert.deepEqual(pool.seatWrites(), [], role)
  }
})

test('F-S3-017: a waiting seat whose role no invitation link can carry is not renewed', async () => {
  const { letters, app } = inviteDoor({ seats: { [SITE]: pending('owner') } })
  for (const role of ['editor', 'viewer']) {
    const { result } = await invite(app, { role })
    assert.equal(result.notified, false, role)
    assert.deepEqual(result.sites, [{ siteKey: SITE, outcome: 'already_granted' }], role)
  }
  assert.deepEqual(letters, [])
})

test('F-S3-017: inviting again is unchanged for an accepted, revoked or declined seat', async () => {
  const accepted = inviteDoor({ seats: { [SITE]: { ...pending(), accepted_at: new Date(NOW) } } })
  const held = await invite(accepted.app)
  assert.equal(held.result.notified, false)
  assert.deepEqual(held.result.sites, [{ siteKey: SITE, outcome: 'already_granted' }])
  assert.deepEqual(accepted.letters, [], 'somebody who already holds the seat gets no letter')
  assert.deepEqual(accepted.pool.seatWrites(), [])

  for (const gone of ['revoked_at', 'declined_at']) {
    const { pool, letters, app } = inviteDoor({
      seats: { [SITE]: { ...pending('viewer'), accepted_at: new Date(NOW), [gone]: new Date(NOW) } }
    })
    const { result } = await invite(app, { role: 'editor' })
    assert.equal(result.notified, true, gone)
    assert.deepEqual(result.sites, [{ siteKey: SITE, outcome: 'invited' }], gone)
    assert.equal(letters.length, 1, gone)
    assert.equal(linkOf(letters[0]).body.role, 'editor', `${gone}: a revived seat takes the role asked for`)
    assert.equal(pool.seatWrites().length, 1, `${gone}: the seat is granted again, as before`)
    assert.equal(pool.rows.get(SITE).accepted_at, null, gone)
    assert.deepEqual(pool.unexpected, [])
  }
})

test('F-S3-017: a renewed invitation whose mail fails answers notified:false and writes nothing', async () => {
  const { pool, app } = inviteDoor({
    seats: { [SITE]: pending() },
    send: async () => {
      throw new Error('provider said no')
    }
  })
  const { response, result } = await invite(app)
  assert.equal(response.status, 200)
  assert.equal(result.notified, false)
  assert.deepEqual(result.sites, [{ siteKey: SITE, outcome: 'invited', renewed: true }])
  assert.deepEqual(pool.seatWrites(), [])
  assert.deepEqual(pool.unexpected, [])
})

test('06/10 (Sarah): the invitation mail has no Manage notifications, the invitee may have no account yet', async () => {
  const { letters, app } = inviteDoor({ seats: {} })
  const { response } = await invite(app)
  assert.equal(response.status, 200)
  const letter = letters.at(-1)
  assert.ok(letter, 'an invitation was mailed')
  assert.doesNotMatch(letter.html + letter.text, /settings=notifications|Manage notifications/)
  assert.match(letter.html, /\/invite\/[^"]+\/decline"[^>]*>Decline</, 'the decline link stays')
})
