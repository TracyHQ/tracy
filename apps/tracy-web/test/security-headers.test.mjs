/**
 * #805 (F-S1-020) — the pages this app renders itself answer with hardening headers, and the
 * Content-Security-Policy among them still lets each page load what it really loads.
 *
 * WHAT THIS FILE RUNS. The real routers, in one process, with no database: every page is asked for
 * the way a browser asks, the answer's headers are read, and the answer's HTML is parsed
 * (`linkedom`) to list what the page needs — stylesheets, the favicon, inline script and style,
 * form targets — which the policy ON THAT SAME ANSWER must allow. The policy is read from the
 * response, never imported, so a page and its policy cannot drift apart unnoticed.
 *
 * WHAT IT DOES NOT RUN. No browser enforces the policy here: the matcher below is this file's own
 * reading of CSP3 source matching (`'self'`, `'none'`, a scheme, an exact host with an optional
 * scheme), deliberately without wildcards — a policy that needs one fails. Which host a font
 * stylesheet fetches its files from is not in the page; `FONT_FILES` records what the two
 * stylesheets answered when measured on 03/10/2026.
 *
 *   node --test apps/tracy-web/test/security-headers.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'
import { parseHTML } from 'linkedom'

import { buildApp } from '../src/app.js'
import {
  messagePage,
  noSitesPage,
  refusedHostPage,
  unknownSitePage,
  workspaceUnavailablePage
} from '../src/bar/pages.js'
import { readConfig } from '../src/config.js'
import { docsRedirects, docsRoutes } from '../src/docs/route.js'
import { authorizeUrl, PROVIDERS } from '../src/identity/oauth.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { WEB_LANGUAGES } from '../src/lib/i18n/index.js'
import { pageSecurityHeaders } from '../src/lib/security-headers.js'
import { mintSession } from '../src/lib/session.js'
import { signTeamInvite } from '../src/lib/team-invite.js'
import { opsRoutes } from '../src/ops/route.js'
import { seatsRoutes } from '../src/seats/route.js'

// Where this suite's scratch folders go: a runner that keeps its files in one place names it,
// everything else uses the system's temporary folder.
const SCRATCH_ROOT = process.env.TRACY_TEST_ARTIFACTS_DIR
  ? resolve(process.env.TRACY_TEST_ARTIFACTS_DIR)
  : tmpdir()

const ORIGIN = 'https://cowork.example'
const ENV = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'example',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  GOOGLE_OAUTH_CLIENT_ID: 'g-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
  GITHUB_OAUTH_CLIENT_ID: 'h-id',
  GITHUB_OAUTH_CLIENT_SECRET: 'h-secret'
}
const config = readConfig(ENV)

/** The file each font stylesheet pulls in, as the stylesheets answered on 03/10/2026. Fontshare
 * writes its files protocol-relative (`//cdn.fontshare.com/…`), so on a laptop's `http://` page
 * the file is asked for over `http://` too. */
const FONT_FILES = {
  'api.fontshare.com': '//cdn.fontshare.com/wf/sample.woff2',
  'fonts.googleapis.com': 'https://fonts.gstatic.com/s/sample.ttf'
}

// ── A reader for the policy ─────────────────────────────────────────────────────────────────────

/** `Content-Security-Policy` → Map of directive name to its source list. */
function parseCsp(value) {
  const policy = new Map()
  for (const part of String(value ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) policy.set(name.toLowerCase(), sources)
  }
  return policy
}

/** Directives that fall back to `default-src` when absent (the others allow everything). */
const FETCH_DIRECTIVES = new Set([
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src'
])

function sourcesFor(policy, directive) {
  return policy.get(directive) ?? (FETCH_DIRECTIVES.has(directive) ? policy.get('default-src') : undefined)
}

/** Does the policy let a page at `pageOrigin` use `target` (a URL, or `'inline'`) for `directive`? */
function allows(policy, directive, target, pageOrigin = ORIGIN) {
  const list = sourcesFor(policy, directive)
  if (list === undefined) return true
  if (target === 'inline') return list.includes("'unsafe-inline'")
  const page = new URL(pageOrigin)
  const url = new URL(target, pageOrigin)
  return list.some((source) => {
    if (source === "'self'") return url.origin === page.origin
    if (source.startsWith("'")) return false
    if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) return url.protocol === source.toLowerCase()
    const m = /^(?:(https?):\/\/)?([a-z0-9.-]+)$/i.exec(source)
    if (!m || url.hostname !== m[2].toLowerCase()) return false
    if (m[1]) return url.protocol === `${m[1]}:` || url.protocol === 'https:'
    // A host with no scheme matches the page's own scheme, or the secure upgrade of it.
    return url.protocol === page.protocol || url.protocol === 'https:'
  })
}

/** Everything one rendered document needs from the policy: `[directive, target]` pairs. */
function needsOf(html, pageOrigin = ORIGIN) {
  const { document } = parseHTML(html)
  const needs = []
  for (const link of document.querySelectorAll('link[href]')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase()
    const href = link.getAttribute('href')
    if (rel === 'stylesheet') {
      needs.push(['style-src', href])
      const host = new URL(href, pageOrigin).hostname
      assert.ok(FONT_FILES[host], `a stylesheet host this test has no font file recorded for: ${host}`)
      needs.push(['font-src', FONT_FILES[host]])
    } else if (rel === 'icon') needs.push(['img-src', href])
    else assert.equal(rel, 'preconnect', `a <link rel> this test does not know: ${rel}`)
  }
  for (const script of document.querySelectorAll('script')) {
    needs.push(['script-src', script.getAttribute('src') ?? 'inline'])
  }
  if (document.querySelector('style, [style]')) needs.push(['style-src', 'inline'])
  for (const name of document.documentElement.outerHTML.matchAll(/\son[a-z]+=/g)) {
    assert.fail(`an inline event handler (${name[0].trim()}) — the pages are expected to carry none`)
  }
  for (const img of document.querySelectorAll('img[src]')) needs.push(['img-src', img.getAttribute('src')])
  for (const form of document.querySelectorAll('form')) {
    needs.push(['form-action', form.getAttribute('action') ?? pageOrigin])
    // The page's own script posts a form with `fetch(form.getAttribute('action'))`.
    needs.push(['connect-src', form.getAttribute('action') ?? pageOrigin])
  }
  for (const tag of ['iframe', 'object', 'embed', 'base']) {
    assert.equal(document.querySelector(tag), null, `the pages are expected to carry no <${tag}>`)
  }
  return needs
}

const HARDENING = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store'
}

/**
 * One answer, checked whole: it is HTML, it carries every hardening header, and its own policy
 * allows everything its own document needs. `framable` is for the pages served on a customer
 * site's hostname, which Tracy's preview pane shows inside a frame.
 */
async function assertHardenedPage(
  response,
  { status, framable = false, origin = ORIGIN, label, referrerPolicy }
) {
  assert.equal(response.status, status, label)
  assert.match(response.headers.get('content-type') ?? '', /^text\/html; charset=utf-8$/i, label)
  for (const [name, value] of Object.entries(HARDENING)) {
    const expected = name === 'referrer-policy' && referrerPolicy ? referrerPolicy : value
    assert.equal(response.headers.get(name), expected, `${label}: ${name}`)
  }
  const policy = parseCsp(response.headers.get('content-security-policy'))
  assert.ok(policy.size > 0, `${label}: content-security-policy`)
  if (framable) {
    assert.equal(response.headers.get('x-frame-options'), null, `${label}: x-frame-options`)
    assert.equal(policy.has('frame-ancestors'), false, `${label}: frame-ancestors`)
  } else {
    assert.equal(response.headers.get('x-frame-options'), 'DENY', `${label}: x-frame-options`)
    assert.deepEqual(policy.get('frame-ancestors'), ["'none'"], `${label}: frame-ancestors`)
  }
  assert.deepEqual(policy.get('object-src'), ["'none'"], `${label}: object-src`)
  assert.deepEqual(policy.get('base-uri'), ["'none'"], `${label}: base-uri`)
  assert.ok(policy.has('default-src') && policy.has('form-action'), `${label}: default-src, form-action`)
  for (const [directive, sources] of policy) {
    for (const source of sources) {
      assert.doesNotMatch(source, /\*|^https?:$/i, `${label}: ${directive} is wider than a named host`)
    }
  }
  const html = await response.text()
  const needs = needsOf(html, origin)
  assert.ok(needs.length > 0 || !html.includes('<style'), label)
  for (const [directive, target] of needs) {
    assert.ok(
      allows(policy, directive, target, origin),
      `${label}: ${directive} refuses ${target.slice(0, 80)}`
    )
  }
  // Nothing from an origin the pages never name.
  for (const directive of [...FETCH_DIRECTIVES, 'form-action']) {
    assert.equal(allows(policy, directive, 'https://evil.example/x', origin), false, `${label}: ${directive}`)
  }
  return { html, policy }
}

// ── The sign-in pages ───────────────────────────────────────────────────────────────────────────

function identityApp(extraEnv = {}) {
  const sent = []
  const identity = memoryIdentityStore()
  const origin = extraEnv.TRACY_ORIGIN ?? ORIGIN
  const app = buildApp({
    config: readConfig({ ...ENV, ...extraEnv }),
    identity,
    mail: { send: async (m) => void sent.push(m) }
  })
  const get = (path, headers = {}) => app.fetch(new Request(`${origin}${path}`, { headers }))
  const form = (path, fields, headers = {}) =>
    app.fetch(
      new Request(`${origin}${path}`, {
        method: 'POST',
        // `origin: null` sends no Origin header at all (an old browser's form post).
        headers: Object.fromEntries(
          Object.entries({ 'content-type': 'application/x-www-form-urlencoded', origin, ...headers }).filter(
            ([, value]) => value !== null
          )
        ),
        body: new URLSearchParams(fields).toString()
      })
    )
  return { app, sent, identity, get, form }
}

test('#805: GET /login answers with every hardening header, in every language', async () => {
  const { get } = identityApp()
  for (const lang of WEB_LANGUAGES) {
    const { html } = await assertHardenedPage(await get(`/login?lang=${lang}`), {
      status: 200,
      label: `/login?lang=${lang}`
    })
    // The body font differs by language (Be Vietnam Pro / General Sans): both must be asked for
    // somewhere in this loop, or the loop proved less than it claims.
    assert.match(html, /fonts\.googleapis\.com/)
    assert.match(html, lang === 'vi' ? /Be\+Vietnam\+Pro/ : /api\.fontshare\.com/)
  }
})

test('#805: every state of the sign-in page is hardened — 400, 401, 429 and the code step', async () => {
  const { form } = identityApp()
  for (const lang of WEB_LANGUAGES) {
    const q = `?lang=${lang}`
    await assertHardenedPage(await form(`/login${q}`, { email: 'not-an-address' }), {
      status: 400,
      label: `invalid email (${lang})`
    })
    await assertHardenedPage(await form(`/login${q}`, { email: `ok-${lang}@b.c`, next: '/' }), {
      status: 200,
      label: `code step (${lang})`
    })
    await assertHardenedPage(await form(`/verify${q}`, { email: `ok-${lang}@b.c`, code: '000000' }), {
      status: 401,
      label: `wrong code (${lang})`
    })
  }
  for (let i = 0; i < 5; i++) await form('/login', { email: 'cap@b.c' })
  await assertHardenedPage(await form('/login', { email: 'cap@b.c' }), { status: 429, label: 'over the cap' })
})

test('#805: a hostile email and next stay escaped on a hardened page', async () => {
  const { get, form } = identityApp()
  // The space keeps it from passing as an address, so the form post is re-rendered with it.
  const hostile = '"><script>alert(1)</script> @b.c'
  const asked = await assertHardenedPage(
    await get(`/login?email=${encodeURIComponent(hostile)}&next=${encodeURIComponent('//evil.example/')}`),
    { status: 200, label: 'reflected query' }
  )
  assert.doesNotMatch(asked.html, /<script>alert\(1\)/)
  assert.doesNotMatch(asked.html, /evil\.example/)
  const posted = await assertHardenedPage(
    await form('/login', { email: hostile, next: 'https://evil.example/' }),
    { status: 400, label: 'reflected form' }
  )
  assert.doesNotMatch(posted.html, /<script>alert\(1\)/)
  assert.doesNotMatch(posted.html, /evil\.example/)
})

test('#805: the policy lets the edge’s analytics beacon load and report, and nothing next to it', async () => {
  // Cloudflare injects this script into every HTML answer in front of the deployed app; no source
  // file names it, so `needsOf` cannot find it. Hold the two hosts here instead.
  const beacon =
    'https://static.cloudflareinsights.com/beacon.min.js/vcd15cbe7772f49c399c6a5babf22c1241717689176015'
  const report = 'https://cloudflareinsights.com/cdn-cgi/rum'
  for (const options of [undefined, { framable: true }]) {
    const policy = parseCsp(pageSecurityHeaders(options)['content-security-policy'])
    assert.ok(policy.get('script-src').includes('static.cloudflareinsights.com'))
    assert.ok(policy.get('connect-src').includes('cloudflareinsights.com'))
    assert.ok(allows(policy, 'script-src', beacon), 'script-src refuses the beacon')
    assert.ok(allows(policy, 'connect-src', report), 'connect-src refuses the beacon report')
    assert.ok(allows(policy, 'connect-src', `${ORIGIN}/login`), 'connect-src refuses this origin')
    // Exact hosts: the script host may not be reported to, the report host may not serve script,
    // and no other subdomain is let in.
    assert.equal(allows(policy, 'connect-src', 'https://static.cloudflareinsights.com/x'), false)
    assert.equal(allows(policy, 'script-src', 'https://cloudflareinsights.com/x.js'), false)
    assert.equal(allows(policy, 'script-src', 'https://evil.cloudflareinsights.com/x.js'), false)
    assert.equal(allows(policy, 'script-src', 'https://evil.example/x.js'), false)
  }
  // The page the app really answers carries the same policy.
  const page = await identityApp().get('/login')
  const served = parseCsp(page.headers.get('content-security-policy'))
  assert.ok(allows(served, 'script-src', beacon))
  assert.ok(allows(served, 'connect-src', report))
})

test('#805: the sign-in page on a laptop (http, local preview) still loads its fonts', async () => {
  const origin = 'http://localhost:8787'
  const { get, form } = identityApp({
    TRACY_ORIGIN: origin,
    SITE_DOMAIN: 'localhost',
    LOCAL_LOGIN_PREVIEW: '1'
  })
  await assertHardenedPage(await get('/login'), { status: 200, origin, label: 'local /login' })
  const { html } = await assertHardenedPage(await form('/login', { email: 'dev@b.c' }), {
    status: 200,
    origin,
    label: 'local code step'
  })
  assert.match(html, /\b\d{6}\b/)
})

test('#805: the provider buttons are forms, and the policy lets each one reach its provider', async () => {
  const { get } = identityApp()
  const response = await get('/login')
  const policy = parseCsp(response.headers.get('content-security-policy'))
  const { document } = parseHTML(await response.text())
  for (const provider of PROVIDERS) {
    const button = document.querySelector(`form[action="/signin/${provider}"]`)
    assert.ok(button, `${provider}: the button is a form`)
    // A browser applies `form-action` to the redirect a form submission is answered with.
    const started = await get(`/signin/${provider}`)
    assert.equal(started.status, 302)
    const target = started.headers.get('location')
    assert.equal(new URL(target).origin, new URL(authorizeUrl(provider, config, 'state')).origin)
    assert.ok(allows(policy, 'form-action', target), `${provider}: form-action refuses ${target}`)
  }
})

test('#805: the device pages keep refusing a frame, and gain the rest — 200, 400, 401, 403', async () => {
  const { app, get, form } = identityApp()
  const cookie = `tracy_sess=${await mintSession('owner@example.com', config.sessionSecret, Date.now())}`
  const round = await (
    await app.fetch(
      new Request(`${ORIGIN}/auth/link/browser`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device: '<b>Chrome</b> on "macOS"' })
      })
    )
  ).json()
  const unknown = 'f'.repeat(64)
  for (const lang of WEB_LANGUAGES) {
    const { html } = await assertHardenedPage(
      await get(`/signin?n=${round.nonce}&lang=${lang}`, { cookie }),
      {
        status: 200,
        // Its form posts to /signin/approve, which checks Origin; under no-referrer a browser sends
        // `Origin: null` for that post (identity/route.js, GET /signin).
        referrerPolicy: 'same-origin',
        label: `confirm (${lang})`
      }
    )
    assert.doesNotMatch(html, /<b>Chrome<\/b>/)
    await assertHardenedPage(await get(`/signin?n=${unknown}&lang=${lang}`, { cookie }), {
      status: 400,
      referrerPolicy: 'same-origin',
      label: `gone (${lang})`
    })
  }
  await assertHardenedPage(await form('/signin/approve', { n: round.nonce }, { cookie, origin: null }), {
    status: 403,
    label: 'no Origin header'
  })
  await assertHardenedPage(await form('/signin/approve', { n: 'nope' }, { cookie }), {
    status: 400,
    label: 'bad nonce'
  })
  await assertHardenedPage(await form('/signin/approve', { n: round.nonce }), {
    status: 401,
    label: 'no session'
  })
  await assertHardenedPage(await form('/signin/approve', { n: round.nonce }, { cookie }), {
    status: 200,
    label: 'approved'
  })
  await assertHardenedPage(await form('/signin/approve', { n: round.nonce }, { cookie }), {
    status: 400,
    label: 'approved twice'
  })
})

// ── The seat pages ──────────────────────────────────────────────────────────────────────────────

/** A pool for the pages that need none of the seat book: the rate upsert answers `rate()`, every
 * other statement finds nothing. */
function emptyPool({ rate = () => 1 } = {}) {
  return {
    async query(sql) {
      if (/^\s*insert into rate_bucket\b/.test(String(sql))) return { rows: [{ count: await rate() }] }
      return { rows: [] }
    }
  }
}

function seatsApp(poolOptions) {
  const app = new Hono()
  app.route(
    '/',
    seatsRoutes({
      pool: emptyPool(poolOptions),
      config,
      mail: { send: async () => {} },
      sites: { labelOf: async () => null }
    })
  )
  return (path, headers = {}) => app.fetch(new Request(`${ORIGIN}${path}`, { headers }))
}

test('#805: the invitation and team pages are hardened — 403, 404 and 429', async () => {
  const token = await signTeamInvite(
    { email: 'invited@example.test', role: 'editor', siteKeys: ['acme.example'] },
    config.sessionSecret
  )
  const cookie = `tracy_sess=${await mintSession('other@example.test', config.sessionSecret, Date.now())}`
  for (const lang of WEB_LANGUAGES) {
    const get = seatsApp()
    const q = `?lang=${lang}`
    await assertHardenedPage(await get(`/invite/not-a-token${q}`), {
      status: 404,
      label: `bad invite (${lang})`
    })
    await assertHardenedPage(await get(`/invite/${token}${q}`, { cookie }), {
      status: 403,
      label: `wrong account (${lang})`
    })
    await assertHardenedPage(await get(`/nosuchsite/team${q}`), { status: 404, label: `team (${lang})` })
    await assertHardenedPage(await get(`/nosuchsite/join${q}`), { status: 404, label: `join (${lang})` })
    const limited = seatsApp({ rate: () => 10_000 })
    await assertHardenedPage(await limited(`/invite/${token}${q}`), {
      status: 429,
      label: `too many (${lang})`
    })
  }
  const failing = seatsApp({ rate: () => Promise.reject(new Error('connection refused')) })
  await assertHardenedPage(await failing(`/invite/${token}`), { status: 429, label: 'rate table down' })
})

// ── The pages `bar/pages.js` answers with ───────────────────────────────────────────────────────

test('#805: the workspace pages on Tracy’s own address refuse a frame and keep their status', async () => {
  for (const lang of WEB_LANGUAGES) {
    await assertHardenedPage(noSitesPage('a@b.c', { signInHref: '/login', lang }), {
      status: 404,
      label: `no sites (${lang})`
    })
    await assertHardenedPage(
      noSitesPage('a@b.c', {
        signInHref: '/login',
        invites: [{ label: 'acme', siteKey: 'acme.example' }],
        lang
      }),
      { status: 404, label: `invitation waiting (${lang})` }
    )
    const unavailable = workspaceUnavailablePage('a@b.c', { retryHref: '/?x=1', reason: '<i>down</i>', lang })
    assert.equal(unavailable.headers.get('retry-after'), '5')
    const { html } = await assertHardenedPage(unavailable, { status: 503, label: `unavailable (${lang})` })
    assert.doesNotMatch(html, /<i>down<\/i>/)
  }
})

test('#805: the pages shown on a customer site’s address are hardened and stay framable', async () => {
  // Tracy's preview pane and Live site tab show the site's address inside a frame; a page this
  // app answers there ("site unavailable", "unknown site") must still be readable in it.
  const origin = 'https://acme.example'
  for (const lang of WEB_LANGUAGES) {
    await assertHardenedPage(unknownSitePage('acme.example', lang, ORIGIN), {
      status: 404,
      framable: true,
      origin,
      label: `unknown site (${lang})`
    })
    // #796: the refused hostname is a page too now, on an address that is not Tracy's own.
    await assertHardenedPage(refusedHostPage({ lang, origin: ORIGIN }), {
      status: 404,
      framable: true,
      origin,
      label: `refused host (${lang})`
    })
    for (const status of [200, 404, 405, 502]) {
      await assertHardenedPage(messagePage('<Title>', 'Body & more', status, lang), {
        status,
        framable: true,
        origin,
        label: `message ${status} (${lang})`
      })
    }
  }
})

// ── The fallback pages of /ops and /docs ────────────────────────────────────────────────────────

test('#805: the /ops fallback pages are hardened — the closed invitation and the missing bundle', async () => {
  const cookie = `tracy_sess=${await mintSession('staff@example.com', config.sessionSecret, Date.now())}`
  // No database: the invitation could not be looked up, which is not a closed invitation (#796).
  const unchecked = new Hono()
  unchecked.route('/', opsRoutes({ pool: null, config }))
  await assertHardenedPage(
    await unchecked.fetch(new Request(`${ORIGIN}/ops/invite/any`, { headers: { cookie } })),
    {
      status: 503,
      label: 'invitation cannot be checked'
    }
  )
  const closed = new Hono()
  closed.route(
    '/',
    opsRoutes({
      pool: {},
      config,
      workspaces: {
        tracyAdminWorkspace: async () => ({ id: 'ws-1' }),
        accountByEmail: async () => ({ id: 'acct-1' }),
        acceptWorkspaceGrant: async () => null
      }
    })
  )
  await assertHardenedPage(
    await closed.fetch(new Request(`${ORIGIN}/ops/invite/any`, { headers: { cookie } })),
    {
      status: 410,
      label: 'invitation not open for this address'
    }
  )

  const staffPool = { query: async () => ({ rows: [{ role: 'owner' }] }) }
  const empty = new Hono()
  empty.route(
    '/',
    opsRoutes({ pool: staffPool, config, staticDir: join(SCRATCH_ROOT, 'tracy-805-no-such-dir') })
  )
  await assertHardenedPage(await empty.fetch(new Request(`${ORIGIN}/ops`, { headers: { cookie } })), {
    status: 503,
    label: 'ops bundle missing'
  })
})

test('#805: the /docs fallback page is hardened; the built documentation is served as it is', async () => {
  const missing = new Hono()
  missing.route('/', docsRoutes({ staticDir: join(SCRATCH_ROOT, 'tracy-805-no-such-dir') }))
  await assertHardenedPage(await missing.fetch(new Request(`${ORIGIN}/`)), {
    status: 404,
    label: 'docs not built'
  })
  // A deployment with no docs host says so on `/docs/` with a page of its own.
  const nowhere = new Hono()
  nowhere.route('/', docsRedirects({ docsOrigin: null }))
  await assertHardenedPage(await nowhere.fetch(new Request(`${ORIGIN}/docs/`)), {
    status: 404,
    label: 'no docs host'
  })

  const dir = await mkdtemp(join(SCRATCH_ROOT, 'tracy-805-docs-'))
  try {
    await writeFile(
      join(dir, 'index.html'),
      '<!doctype html><script src="https://cdn.example/x.js"></script>'
    )
    const built = new Hono()
    built.route('/', docsRoutes({ staticDir: dir }))
    const response = await built.fetch(new Request(`${ORIGIN}/`))
    assert.equal(response.status, 200)
    // A static site carries its own scripts; this app's page policy would break them.
    assert.equal(response.headers.get('content-security-policy'), null)
    assert.equal(response.headers.get('x-frame-options'), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ── What is NOT a rendered page keeps its own headers ───────────────────────────────────────────

test('#805: JSON doors, redirects and plain-text answers do not get a page policy', async () => {
  const { app, get } = identityApp()
  const json = await app.fetch(
    new Request(`${ORIGIN}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'json@b.c' })
    })
  )
  assert.equal(json.status, 200)
  assert.deepEqual(await json.json(), { ok: true })
  assert.equal(json.headers.get('cache-control'), 'no-store')
  for (const response of [json, await get('/auth/me')]) {
    assert.equal(response.headers.get('content-security-policy'), null)
    assert.equal(response.headers.get('x-frame-options'), null)
  }
  const cookie = `tracy_sess=${await mintSession('a@b.c', config.sessionSecret, Date.now())}`
  const sentOn = await get('/login?next=/acme/', { cookie })
  assert.equal(sentOn.status, 302)
  assert.equal(sentOn.headers.get('location'), `${ORIGIN}/acme/`)
  assert.equal(sentOn.headers.get('content-security-policy'), null)
})

test('public Google sign-in does not allow a whitelist redirect in form-action', async () => {
  const app = buildApp({
    config: readConfig({
      TRACY_ORIGIN: 'https://cowork.test',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://host',
      HOST_local_DSH_ORIGIN: 'http://dsh',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      BETA_GATE: 'on',
      AMEMBER_API_KEY: 'k',
      BETA_WAITLIST_URL: 'https://landing.test/whitelist/',
      GOOGLE_OAUTH_CLIENT_ID: 'i',
      GOOGLE_OAUTH_CLIENT_SECRET: 's',
      TRACY_ENVIRONMENT: 'dev'
    }),
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    log: { warn() {}, log() {}, error() {} }
  })
  const csp = (await app.fetch(new Request('https://cowork.test/login'))).headers.get(
    'content-security-policy'
  )
  assert.match(csp, /form-action 'self' accounts\.google\.com github\.com[;]/)
  assert.doesNotMatch(csp, /landing\.test/)
})
