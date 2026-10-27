/**
 * Issue #806 — the two findings a source change can fix, and the origin-side half of a third.
 *
 * F-S8-003: `/tracy-badge.js` fell back to the dev surface (`cowork.tracy.site`) when its tag
 * named no `data-origin`, so a production embed sent visitors to dev. F-S1-011: a signed-in
 * `GET /<label>/join` drew its page with status 405. Both are reproduced here on the real route
 * functions with no database: the pool is a stub that answers three exact queries and throws on
 * anything else, so a GET that wrote, or read something new, fails the test instead of passing.
 *
 * The cache assertions at the end read what THIS app sends. What an edge in front of it does to
 * those headers (F-S8-002) cannot be seen from here.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseHTML } from 'linkedom'

import { docsReferenceRoutes } from '../src/api-reference/route.js'
import { badgeRoutes } from '../src/badge/route.js'
import { DEFAULT_TRACY_ORIGIN as DEMO_DEFAULT_ORIGIN } from '../src/lib/build-with-tracy-demo.js'
import { translate } from '../src/lib/i18n/index.js'
import { pageSecurityHeaders } from '../src/lib/security-headers.js'
import { mintSession } from '../src/lib/session.js'
import { DEFAULT_TRACY_ORIGIN, badgeHref, badgeSnippet } from '../src/lib/tracy-badge.js'
import { seatsRoutes } from '../src/seats/route.js'

const PRODUCTION = 'https://cowork.tracy.ai'
const DEVELOPMENT = 'https://cowork.tracy.site'
const PRODUCTION_CTA = `${PRODUCTION}/design-inspiration?open=ja-kinetic&provider=JoomlArt`
const DEVELOPMENT_CTA = `${DEVELOPMENT}/design-inspiration?open=ja-kinetic&provider=JoomlArt`

// ── F-S8-003: the badge's default origin ────────────────────────────────────────────────────────

/** `/tracy-badge.js` exactly as a deployment serves it; the deployment's own origin is the dev one
 * on purpose, to show the script's fallback does not come from where the script was fetched. */
const servedBadge = async () => {
  const res = await badgeRoutes({ config: { origin: DEVELOPMENT } }).fetch(
    new Request(`${DEVELOPMENT}/tracy-badge.js`)
  )
  assert.equal(res.status, 200)
  return res.text()
}

/**
 * Run the served script the way a JoomlArt demo would (the convention of
 * `build-with-tracy-demo.test.mjs`): a document whose `currentScript` is the tag the page carries.
 * `tag: null` runs it with no `currentScript` at all.
 */
function runBadge(
  script,
  { tag = '<script data-template="ja-kinetic"></script>', location = {}, marked = false } = {}
) {
  const { document } = parseHTML(
    `<!doctype html><html><head></head><body><h1>Demo</h1>${tag ?? ''}</body></html>`
  )
  Object.defineProperty(document, 'currentScript', { value: tag ? document.querySelector('script') : null })
  const window = { location }
  if (marked) window.__tracyBadge = true
  new Function('window', 'document', script)(window, document)
  const host = document.getElementById('tracy-badge')
  return { host, cta: host?.shadowRoot?.querySelector('a.cta') ?? null }
}

const pageAt = (href) => {
  const url = new URL(href)
  return { href: url.href, hostname: url.hostname, origin: url.origin }
}
const JOOMLART_DEMO = pageAt('https://ja-kinetic.demo.joomlart.com/')
const tagWith = (attributes) =>
  `<script src="${PRODUCTION}/tracy-badge.js" data-template="ja-kinetic"${attributes}></script>`

test('#806 F-S8-003: the served badge with no data-origin opens Tracy production', async () => {
  const script = await servedBadge()
  // A tag with no `data-origin` at all, and one whose `data-origin` is empty: both are "not named".
  for (const attributes of ['', ' data-origin=""']) {
    const { cta } = runBadge(script, { tag: tagWith(attributes), location: JOOMLART_DEMO })
    assert.ok(cta, `the badge renders for tag attributes "${attributes}"`)
    assert.equal(cta.getAttribute('href'), PRODUCTION_CTA)
  }
  assert.ok(!script.includes(DEVELOPMENT), 'the served bytes name no dev origin')
})

test('#806 F-S8-003: the link helper and the snippet default to Tracy production', () => {
  assert.equal(DEFAULT_TRACY_ORIGIN, PRODUCTION)
  assert.equal(badgeHref({ template: 'ja-kinetic' }), PRODUCTION_CTA)
  assert.equal(badgeHref({ origin: undefined, template: 'ja-kinetic' }), PRODUCTION_CTA)
  // An origin no URL can be built from falls back to the default, as it always did.
  assert.equal(badgeHref({ origin: 'not a url', template: 'ja-kinetic' }), PRODUCTION_CTA)
  assert.equal(badgeHref({ origin: '', template: 'ja-kinetic' }), PRODUCTION_CTA)
  const tag = badgeSnippet({ scriptUrl: `${PRODUCTION}/tracy-badge.js`, template: 'ja-kinetic' })
  assert.match(tag, /data-origin="https:\/\/cowork\.tracy\.ai"/)
  assert.ok(!tag.includes(DEVELOPMENT))
})

test('#806 F-S8-003: the two advert scripts agree on the default origin', () => {
  assert.equal(DEFAULT_TRACY_ORIGIN, DEMO_DEFAULT_ORIGIN)
})

test('#806 F-S8-003: a deployment with no configured origin documents and links production', async () => {
  const res = await badgeRoutes({}).fetch(new Request(`${PRODUCTION}/tracy-badge?template=ja-kinetic`))
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes(`<script async src="${PRODUCTION}/tracy-badge.js"`))
  assert.ok(html.includes(`data-origin="${PRODUCTION}"`))
  assert.ok(html.includes(`<code>${PRODUCTION}</code> by default`))
  assert.ok(!html.includes(DEVELOPMENT))
})

test('an explicit development origin still wins over the default', async () => {
  const script = await servedBadge()
  const { cta } = runBadge(script, {
    tag: tagWith(` data-origin="${DEVELOPMENT}"`),
    location: JOOMLART_DEMO
  })
  assert.equal(cta.getAttribute('href'), DEVELOPMENT_CTA)
  // A trailing slash on the named origin is dropped, not doubled.
  const slashed = runBadge(script, {
    tag: tagWith(` data-origin="${DEVELOPMENT}/"`),
    location: JOOMLART_DEMO
  })
  assert.equal(slashed.cta.getAttribute('href'), DEVELOPMENT_CTA)
  assert.equal(badgeHref({ origin: DEVELOPMENT, template: 'ja-kinetic' }), DEVELOPMENT_CTA)
  assert.match(
    badgeSnippet({ scriptUrl: `${DEVELOPMENT}/tracy-badge.js`, template: 'ja-kinetic', origin: DEVELOPMENT }),
    /data-origin="https:\/\/cowork\.tracy\.site"/
  )
  // The deployment's own demo page names its own origin, whatever the default is.
  const page = await badgeRoutes({ config: { origin: DEVELOPMENT } }).fetch(
    new Request(`${DEVELOPMENT}/tracy-badge?template=ja-kinetic`)
  )
  assert.ok((await page.text()).includes(`data-origin="${DEVELOPMENT}"`))
})

test('a template id the gallery cannot open still yields the gallery, on the default origin', async () => {
  const script = await servedBadge()
  const { cta } = runBadge(script, {
    tag: `<script src="${PRODUCTION}/tracy-badge.js" data-template="../../admin" data-origin="${DEVELOPMENT}"></script>`,
    location: JOOMLART_DEMO
  })
  assert.equal(cta.getAttribute('href'), `${DEVELOPMENT}/design-inspiration?provider=JoomlArt`)
  assert.equal(
    badgeHref({ origin: DEVELOPMENT, template: '../../admin' }),
    `${DEVELOPMENT}/design-inspiration?provider=JoomlArt`
  )
})

test('no currentScript, a second copy of the script, or a page that is not a JoomlArt demo: nothing renders', async () => {
  const script = await servedBadge()
  assert.equal(runBadge(script, { tag: null, location: JOOMLART_DEMO }).host, null, 'no currentScript')
  assert.equal(
    runBadge(script, { tag: tagWith(''), location: JOOMLART_DEMO, marked: true }).host,
    null,
    'the script already ran on this page'
  )
  for (const href of ['https://ja-kinetic-wordpress.tracy.site/', 'https://joomlart.com.example.org/']) {
    assert.equal(runBadge(script, { tag: tagWith(''), location: pageAt(href) }).host, null, href)
  }
})

// ── F-S1-011: GET /<label>/join ─────────────────────────────────────────────────────────────────

const ORIGIN = 'http://tracy.test'
const SECRET = 's'.repeat(32)
const SITE_KEY = 'joinlabel.example'
const LABEL = 'joinlabel-example'
const VIEWER = 'asker@x.y'
const ACCOUNT = { id: 'acct-1', email: VIEWER, display_name: null, avatar_url: null }

const SITE_BY_LABEL = 'select site_key from site where label = $1'
const ACCOUNT_BY_EMAIL = 'select id, email, display_name, avatar_url from account where email = $1'
const SEAT_ROW = 'select * from seat where site_key = $1 and account_id = $2'

/**
 * The seat door on a book that answers exactly the three reads a join page needs. Any other
 * statement throws, so a GET that wrote a grant or asked something new cannot pass by accident;
 * every mail function records its call.
 */
function joinDoor({ account = null, seat = null } = {}) {
  const queries = []
  const mailCalls = []
  const pool = {
    query: async (sql, params = []) => {
      queries.push({ sql, params })
      if (sql === SITE_BY_LABEL) return { rows: params[0] === LABEL ? [{ site_key: SITE_KEY }] : [] }
      if (sql === ACCOUNT_BY_EMAIL) return { rows: account && params[0] === account.email ? [account] : [] }
      if (sql === SEAT_ROW)
        return { rows: seat && params[0] === SITE_KEY && params[1] === account?.id ? [seat] : [] }
      throw new Error(`unexpected SQL in a join GET: ${sql}`)
    },
    connect: async () => {
      throw new Error('a join GET must not open a transaction')
    }
  }
  const record = (name) => (input) => {
    mailCalls.push({ name, input })
    return { subject: '', text: '' }
  }
  const mail = {
    send: async (message) => {
      mailCalls.push({ name: 'send', input: message })
    },
    inviteMail: record('inviteMail'),
    addedToWorkspace: record('addedToWorkspace'),
    joinRequestMail: record('joinRequestMail'),
    teamInviteMail: record('teamInviteMail')
  }
  const app = seatsRoutes({
    pool,
    config: { origin: ORIGIN, sessionSecret: SECRET },
    mail,
    sites: {}
  })
  const get = (path, cookie) =>
    app.fetch(new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} }))
  return { get, queries, mailCalls }
}

const sessionCookie = async (email = VIEWER, secret = SECRET, now = Date.now()) =>
  `tracy_sess=${await mintSession(email, secret, now)}`

const seatRow = (over = {}) => ({
  site_key: SITE_KEY,
  account_id: ACCOUNT.id,
  role: 'editor',
  granted_by: 'acct-owner',
  accepted_at: null,
  requested_at: null,
  revoked_at: null,
  declined_at: null,
  ...over
})

const en = (key, params) => translate('en', key, params)
const ASK_FORM = '<form method="post">'
const ACCEPT_FORM = `<form method="post" action="/api/sites/${encodeURIComponent(SITE_KEY)}/accept"`

/** Every state a signed-in visitor can be in, and the page that state has always drawn. */
const JOIN_STATES = [
  { name: 'no account yet', door: {}, title: null, form: ASK_FORM },
  { name: 'an account with no grant', door: { account: ACCOUNT }, title: null, form: ASK_FORM },
  {
    name: 'a pending request',
    door: { account: ACCOUNT, seat: seatRow({ requested_at: '2026-10-01T00:00:00Z' }) },
    title: 'seats.requestedTitle',
    form: null
  },
  {
    name: 'an invitation',
    door: { account: ACCOUNT, seat: seatRow() },
    title: 'seats.invitedTitle',
    form: ACCEPT_FORM
  },
  {
    name: 'an accepted membership',
    door: { account: ACCOUNT, seat: seatRow({ accepted_at: '2026-10-01T00:00:00Z' }) },
    title: 'seats.grantedTitle',
    form: null
  },
  {
    name: 'a revoked grant',
    door: {
      account: ACCOUNT,
      seat: seatRow({ accepted_at: '2026-09-01T00:00:00Z', revoked_at: '2026-10-01T00:00:00Z' })
    },
    title: null,
    form: ASK_FORM
  },
  {
    name: 'a declined grant',
    door: { account: ACCOUNT, seat: seatRow({ declined_at: '2026-10-01T00:00:00Z' }) },
    title: null,
    form: ASK_FORM
  }
]

const STATE_TITLES = ['seats.requestedTitle', 'seats.invitedTitle', 'seats.grantedTitle']

test('#806 F-S1-011: a signed-in GET /<label>/join answers 200 with the page of each state', async () => {
  const cookie = await sessionCookie()
  for (const state of JOIN_STATES) {
    const { get } = joinDoor(state.door)
    const res = await get(`/${LABEL}/join`, cookie)
    assert.equal(res.status, 200, state.name)
    assert.equal(res.headers.get('allow'), null, `${state.name}: a 200 names no Allow`)
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/, state.name)
    const html = await res.text()
    if (state.title)
      assert.ok(
        html.includes(`<h1 class="card-title">${en(state.title, { site: SITE_KEY })}</h1>`),
        state.name
      )
    else {
      assert.ok(html.includes(`<title>${en('seats.joinTitle', { site: SITE_KEY })}`), state.name)
      for (const key of STATE_TITLES)
        assert.ok(
          !html.includes(`<h1 class="card-title">${en(key, { site: SITE_KEY })}</h1>`),
          `${state.name}: not ${key}`
        )
    }
    for (const form of [ASK_FORM, ACCEPT_FORM])
      assert.equal(html.includes(form), form === state.form, `${state.name}: ${form}`)
  }
})

test('a join GET only reads: three exact queries at most, no write, no mail', async () => {
  const cookie = await sessionCookie()
  for (const state of JOIN_STATES) {
    const { get, queries, mailCalls } = joinDoor(state.door)
    const res = await get(`/${LABEL}/join`, cookie)
    assert.ok(res.status < 500, `${state.name}: the stub refused a statement`)
    assert.deepEqual(
      queries.map((q) => q.sql),
      state.door.account ? [SITE_BY_LABEL, ACCOUNT_BY_EMAIL, SEAT_ROW] : [SITE_BY_LABEL, ACCOUNT_BY_EMAIL],
      state.name
    )
    for (const { sql } of queries) assert.match(sql, /^select /, `${state.name}: ${sql}`)
    assert.deepEqual(mailCalls, [], `${state.name}: a GET sent mail`)
  }
})

test('a rendered join page carries the page security headers', async () => {
  const { get } = joinDoor({ account: ACCOUNT, seat: seatRow() })
  const res = await get(`/${LABEL}/join`, await sessionCookie())
  for (const [name, value] of Object.entries(pageSecurityHeaders()))
    assert.equal(res.headers.get(name), value, name)
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
})

test('no session, a forged one or an expired one: the join page still redirects to sign-in', async () => {
  const expired = await sessionCookie(VIEWER, SECRET, Date.now() - 400 * 24 * 60 * 60 * 1000)
  const forged = await sessionCookie(VIEWER, 'x'.repeat(32))
  for (const [name, cookie] of [
    ['no cookie', undefined],
    ['garbage', 'tracy_sess=not-a-session'],
    ['signed with another secret', forged],
    ['expired', expired]
  ]) {
    const { get, queries, mailCalls } = joinDoor({ account: ACCOUNT, seat: seatRow() })
    const res = await get(`/${LABEL}/join`, cookie)
    assert.equal(res.status, 303, name)
    assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent(`/${LABEL}/team`)}`, name)
    // Nothing about the visitor is read before they are known.
    assert.deepEqual(
      queries.map((q) => q.sql),
      [SITE_BY_LABEL],
      name
    )
    assert.deepEqual(mailCalls, [], name)
  }
})

test('an unknown, malformed or reserved label is still a 404, signed in or not', async () => {
  const cookie = await sessionCookie()
  for (const who of [undefined, cookie]) {
    const unknown = joinDoor({ account: ACCOUNT, seat: seatRow() })
    const res = await unknown.get('/nosuchsite/join', who)
    assert.equal(res.status, 404)
    assert.ok((await res.text()).includes(en('seats.unknownSiteTitle')))
    assert.deepEqual(
      unknown.queries.map((q) => q.sql),
      [SITE_BY_LABEL]
    )
    // A label the door refuses outright never reaches the book.
    for (const path of ['/api/join', '/Join.Label/join', '/join%20label/join', '/joinlabel.example/join']) {
      const refused = joinDoor({ account: ACCOUNT, seat: seatRow() })
      const answer = await refused.get(path, who)
      assert.equal(answer.status, 404, path)
      assert.deepEqual(refused.queries, [], path)
      assert.deepEqual(refused.mailCalls, [], path)
    }
  }
})

test('an outside or malformed next never becomes where the Accept button lands', async () => {
  const cookie = await sessionCookie()
  const landing = async (next) => {
    const { get } = joinDoor({ account: ACCOUNT, seat: seatRow() })
    const res = await get(`/${LABEL}/join?next=${encodeURIComponent(next)}`, cookie)
    const html = await res.text()
    const redirect = /data-redirect="([^"]*)"/.exec(html)?.[1]
    assert.ok(redirect, `the Accept form names a landing spot for ${next}`)
    return redirect
  }
  for (const next of [
    'https://evil.example/x',
    '//evil.example/x',
    '/\\evil.example/x',
    'javascript:alert(1)',
    'http://tracy.test.evil.example/'
  ])
    assert.equal(await landing(next), `${ORIGIN}/`, next)
  // Dot segments that reduce to a `//`-shaped path stay pinned to this origin.
  assert.ok((await landing('/..//evil.example')).startsWith(`${ORIGIN}/`))
  assert.equal(await landing('/somewhere?x=1'), `${ORIGIN}/somewhere?x=1`)
  // With no `next`, the site's own team page.
  const { get } = joinDoor({ account: ACCOUNT, seat: seatRow() })
  const plain = await (await get(`/${LABEL}/join`, cookie)).text()
  assert.equal(/data-redirect="([^"]*)"/.exec(plain)?.[1], `${ORIGIN}/${LABEL}/team`)
  // Not signed in: `next` is handed to the sign-in page as a query VALUE, which sanitises it itself.
  const anonymous = await joinDoor().get(
    `/${LABEL}/join?next=${encodeURIComponent('https://evil.example/x')}`
  )
  assert.equal(anonymous.status, 303)
  assert.equal(
    anonymous.headers.get('location'),
    `/login?next=${encodeURIComponent('https://evil.example/x')}`
  )
})

// ── Origin-side cache policy (F-S8-002 is NOT settled by these: they cannot see an edge) ────────

test('the three badge scripts leave this app with a five-minute public cache', async () => {
  const app = badgeRoutes({ config: { origin: PRODUCTION } })
  for (const path of ['/badge.js', '/tracy-badge.js', '/build-with-tracy-demo.js']) {
    const res = await app.fetch(new Request(`${PRODUCTION}${path}`))
    assert.equal(res.status, 200, path)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=300', path)
  }
})

test('the Scalar bundle is immutable only under its own content hash', async () => {
  const app = docsReferenceRoutes({ buildSpec: () => ({}), apiOrigin: null })
  const page = await (await app.request('/api/reference/')).text()
  const hashed = /<script src="(\/api\/reference\/scalar\.js\?v=[0-9a-f]+)"/.exec(page)?.[1]
  assert.ok(hashed, 'the page names the bundle by its hash')
  const exact = await app.request(hashed)
  assert.equal(exact.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  for (const path of [
    '/api/reference/scalar.js',
    '/api/reference/scalar.js?v=0000000000000000',
    '/api/reference/scalar.js?v='
  ])
    assert.equal((await app.request(path)).headers.get('cache-control'), 'public, max-age=300', path)
})
