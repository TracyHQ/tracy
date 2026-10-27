/**
 * The creation workspace under `/new/` — plan `tasks/plan-first-site-build-onboarding.md` §3, the
 * transport half of T01–T10.
 *
 * WHAT THESE PIN, AND WHY THEY EXIST. Measured 13/09 on the running cluster (evidence in
 * `tasks/evidence/first-site-onboarding/`): `/agent?inspiration=…&platform=joomla` answered 200,
 * then every asset, RPC and the socket of that page came back as root requests carrying no
 * intent and got 404 / `NO_SITES` — a blank page. A viewer WITH a site was sent to
 * `/<site>/agent?…`, which dsh answers 404. Every case below fails against that code.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import http from 'node:http'
import { test, after, before, beforeEach } from 'node:test'
import { seatTokenCookieName } from '../src/lib/cookies.js'
import { mintSession } from '../src/lib/session.js'
import { start } from '../src/server.js'
import { SITE_COOKIE, siteForRequest, workspaceResolver, workspaceRoutes } from '../src/workspace/route.js'
import {
  buildIntentOf,
  grantFingerprint,
  ONBOARDING_SITE,
  ONBOARDING_TOOLSETS,
  onboardingGrant,
  scopeForPath,
  seatCookieValue,
  seatTokenFromCookie,
  upstreamUrl
} from '../src/workspace/scope.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbUrl = process.env.TEST_DATABASE_URL
const dbOpts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

const secret = 's'.repeat(32)
const config = {
  sessionSecret: secret,
  secure: false,
  defaultHost: 'local',
  onboardingHome: '/desk-home/onboarding'
}
const sess = async (email) => `tracy_sess=${await mintSession(email, secret)}`

function fakeSites(overrides = {}) {
  return {
    hostOf: async (key) => (key === 'wpdemo.localhost' ? 'local' : null),
    dshOf: () => ({ origin: 'http://127.0.0.1:1', seatSecret: 'k' }),
    labelOf: async (key) => key,
    siteScope: async () => 'wpdemo',
    ...overrides
  }
}

/** An upstream that records what reached it and answers what the test asks. */
async function upstream(
  answer = (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(
      `path=${req.url} prefix=${req.headers['x-forwarded-prefix'] ?? '-'} cookie=${req.headers.cookie ?? ''}`
    )
  }
) {
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, prefix: req.headers['x-forwarded-prefix'], cookie: req.headers.cookie })
    answer(req, res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  return { seen, origin, close: () => new Promise((r) => server.close(r)) }
}

async function onboardingCookie(dshOrigin, email, token = 'onb-tok') {
  const fp = await grantFingerprint(onboardingGrant(email, config), 'onboarding', secret)
  return `${seatTokenCookieName(dshOrigin, 'onboarding')}=${seatCookieValue(fp, token)}`
}

// ── The pure half ─────────────────────────────────────────────────────────────────────────────

test('scopeForPath: /new is the creation workspace, a dotted segment is a site, the rest is the root', () => {
  assert.deepEqual(scopeForPath('/new'), { scope: 'onboarding', siteKey: null, mount: '/new', rest: '/' })
  assert.deepEqual(scopeForPath('/new/'), { scope: 'onboarding', siteKey: null, mount: '/new', rest: '/' })
  assert.deepEqual(scopeForPath('/new/assets/x.js'), {
    scope: 'onboarding',
    siteKey: null,
    mount: '/new',
    rest: '/assets/x.js'
  })
  assert.deepEqual(scopeForPath('/new/s/abc'), {
    scope: 'onboarding',
    siteKey: null,
    mount: '/new',
    rest: '/s/abc'
  })
  // The Worker-era shell path folds to `/` — dsh serves `/` and `/s/<id>`, never `/agent`.
  assert.equal(scopeForPath('/new/agent').rest, '/')
  assert.equal(scopeForPath('/wpdemo.localhost/agent').rest, '/')
  // `new` with a dot is a site, `newer` is the root: the mount is exactly one segment.
  assert.equal(scopeForPath('/new.tracy.test/x').scope, 'site')
  assert.equal(scopeForPath('/newer/x').scope, 'root')
  assert.equal(scopeForPath('/news').scope, 'root')
  assert.equal(scopeForPath('/manifest.webmanifest').scope, 'root')
})

/**
 * 🔒 ONE LIST, TWO DOORS. `INTENT_PLATFORMS` (this door: may a link open the creation workspace)
 * and `CREATE_PLATFORMS` (`sites/route.js`: may a press create a site) answer different questions
 * about the same set. They drifted once — EmDash could create a site for a day while a link
 * carrying it fell through to the landing page, silently — so the agreement is asserted, not
 * remembered.
 */
test('the platforms a link may name are the platforms the create door builds', async () => {
  const source = await readFile(new URL('../src/sites/route.js', import.meta.url), 'utf8')
  const declared = /const CREATE_PLATFORMS = new Set\(\[([^\]]*)\]\)/.exec(source)
  assert.ok(declared, 'sites/route.js no longer declares CREATE_PLATFORMS as a literal set')
  const create = declared[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  for (const platform of create)
    assert.deepEqual(
      buildIntentOf(`?inspiration=stripe&platform=${platform}`),
      { inspiration: 'stripe', platform },
      `${platform} builds sites but cannot be named in a build link`
    )
})

test('buildIntentOf: an inspiration and a buildable platform, nothing less', () => {
  assert.deepEqual(buildIntentOf('?inspiration=stripe&platform=joomla'), {
    inspiration: 'stripe',
    platform: 'joomla'
  })
  assert.deepEqual(buildIntentOf('?inspiration=brand:acme.com&platform=wordpress'), {
    inspiration: 'brand:acme.com',
    platform: 'wordpress'
  })
  assert.equal(buildIntentOf('?inspiration=stripe'), null)
  assert.equal(buildIntentOf('?platform=joomla'), null)
  // EmDash builds, and has since the template cards landed: a card whose only platform is EmDash
  // (Tracy SaaS) would otherwise drop its presser on the landing page with nothing said.
  assert.deepEqual(buildIntentOf('?inspiration=tracy-saas&platform=emdash'), {
    inspiration: 'tracy-saas',
    platform: 'emdash'
  })
  assert.equal(buildIntentOf('?inspiration=stripe&platform=drupal'), null)
  assert.equal(buildIntentOf('?inspiration=../x&platform=joomla'), null)
  assert.equal(buildIntentOf('?inspiration=Stripe&platform=joomla'), null)
})

test('onboardingGrant: editor, content only, a root the door makes a folder under — never the root itself', () => {
  const grant = onboardingGrant('A@Example.com', config)
  assert.equal(grant.role, 'editor')
  assert.deepEqual(grant.folders, [])
  assert.equal(grant.home, '/desk-home/onboarding')
  assert.equal(grant.site, ONBOARDING_SITE)
  assert.deepEqual(grant.toolsets, [...ONBOARDING_TOOLSETS])
  assert.deepEqual(grant.toolsets, ['content'])
})

test('grantFingerprint: keyed, stable, and different for another subject, role, toolset or scope', async () => {
  const a = await grantFingerprint(onboardingGrant('a@x.test', config), 'onboarding', secret)
  assert.match(a, /^[0-9a-f]{24}$/)
  assert.equal(a, await grantFingerprint(onboardingGrant('a@x.test', config), 'onboarding', secret))
  assert.equal(a, await grantFingerprint(onboardingGrant('A@X.TEST', config), 'onboarding', secret))
  assert.notEqual(a, await grantFingerprint(onboardingGrant('b@x.test', config), 'onboarding', secret))
  assert.notEqual(a, await grantFingerprint(onboardingGrant('a@x.test', config), 'wpdemo', secret))
  assert.notEqual(
    a,
    await grantFingerprint(onboardingGrant('a@x.test', config), 'onboarding', 'other-secret')
  )
  const site = {
    role: 'editor',
    email: 'a@x.test',
    folders: ['/site/x'],
    site: 'x.test',
    toolsets: ['content']
  }
  const wider = { ...site, toolsets: ['content', 'code'] }
  const promoted = { ...site, role: 'owner' }
  assert.notEqual(await grantFingerprint(site, 'x', secret), await grantFingerprint(wider, 'x', secret))
  assert.notEqual(await grantFingerprint(site, 'x', secret), await grantFingerprint(promoted, 'x', secret))
})

test('seatTokenFromCookie: the token behind a matching fingerprint, null for a mismatch or a bare token', () => {
  const name = 'tracy_tok_x__onboarding'
  assert.equal(seatTokenFromCookie(`${name}=${seatCookieValue('abc', 'tok')}`, name, 'abc'), 'tok')
  assert.equal(seatTokenFromCookie(`${name}=${seatCookieValue('abc', 'tok')}`, name, 'xyz'), null)
  assert.equal(seatTokenFromCookie(`${name}=tok`, name, 'abc'), null)
  assert.equal(seatTokenFromCookie(`${name}=~tok`, name, ''), null)
  assert.equal(seatTokenFromCookie(null, name, 'abc'), null)
  // A JWT carries dots and dashes but never `~`, so the split is unambiguous.
  assert.equal(seatTokenFromCookie(`${name}=abc~eyJ.hb.c-_`, name, 'abc'), 'eyJ.hb.c-_')
})

// 20/09 (tasks/pa-dia-chi-mot-duong-cho-site.md, part A). A site named on the path
// keeps its mount on the forwarded path, exactly as the creation workspace does — that is the one
// condition dsh's webserver puts on honouring `x-forwarded-prefix` (`unmount`, `webserver/src/index.ts:58`),
// and with it dsh answers `<base href="/<siteKey>/">`, scopes its seat cookie to that path and
// writes `/<siteKey>/s/<id>` on the address bar. This was live on 13 lanes from 05/09 (Worker era,
// KV `prefix:<label>`) and was lost in the port: the column `prefix_aware` came across, nothing read
// it, and a site went back to the root "as before". `prefixed: false` is that column's way out.
test('upstreamUrl: the creation workspace AND a site named on the path keep their mount; a site resolved from the pointer, or one switched off, is forwarded at the root', () => {
  const onb = upstreamUrl('http://dsh:8080', scopeForPath('/new/s/abc'), '?tab=x')
  assert.equal(onb.href, 'http://dsh:8080/new/s/abc?tab=x')
  const site = upstreamUrl('http://dsh:8080', scopeForPath('/wpdemo.localhost/s/abc'), '')
  assert.equal(site.href, 'http://dsh:8080/wpdemo.localhost/s/abc')
  const bare = upstreamUrl('http://dsh:8080', scopeForPath('/wpdemo.localhost'), '')
  assert.equal(bare.href, 'http://dsh:8080/wpdemo.localhost/')
  // The way out: a site whose row says `prefix_aware = false` runs at the root, as until today.
  const off = upstreamUrl('http://dsh:8080', scopeForPath('/wpdemo.localhost/s/abc'), '', { prefixed: false })
  assert.equal(off.href, 'http://dsh:8080/s/abc')
  // A root path that only the pointer cookie tied to a site names no mount — forwarded as it came.
  const pointed = upstreamUrl(
    'http://dsh:8080',
    siteForRequest({
      pathname: '/assets/a.js',
      cookieHeader: 'tracy_site=wpdemo.localhost',
      origin: 'http://t'
    }),
    ''
  )
  assert.equal(pointed.href, 'http://dsh:8080/assets/a.js')
})

// ── T01: the six rows of the state machine (plan §2) ──────────────────────────────────────────

test('T01 row 1/2: signed out — a build intent is kept through the sign-in door, /agent folds to /new', async () => {
  const app = workspaceRoutes({ config, sites: fakeSites() })
  const entry = await app.fetch(new Request('http://tracy.test/agent?inspiration=stripe&platform=joomla'))
  assert.equal(entry.status, 302)
  assert.equal(entry.headers.get('location'), '/new/?inspiration=stripe&platform=joomla')
  const door = await app.fetch(new Request('http://tracy.test/new/?inspiration=stripe&platform=joomla'))
  assert.equal(door.status, 302)
  assert.equal(
    door.headers.get('location'),
    '/login?next=%2Fnew%2F%3Finspiration%3Dstripe%26platform%3Djoomla'
  )
  // Without an intent, `/agent` is `/` — and `/` for a stranger is the sign-in (no guest site here).
  const bare = await app.fetch(new Request('http://tracy.test/agent'))
  assert.equal(bare.headers.get('location'), '/')
  assert.equal((await app.fetch(new Request('http://tracy.test/'))).headers.get('location'), '/login')
})

test('T01 row 3: signed in, no site, no intent — the creation workspace, bare: the first-run cards are the door', async () => {
  const app = workspaceRoutes({
    config,
    sites: fakeSites(),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] }
  })
  const res = await app.fetch(
    new Request('http://tracy.test/', { headers: { cookie: await sess('a@x.test'), accept: 'text/html' } })
  )
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/new/')
})

test('T01 row 4: signed in, no site, intent — the door is asked for the creation grant, the intent survives the mint', async () => {
  const dsh = await upstream()
  let grantSeen = null
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    seatDoor: {
      mintSeatSession: async ({ grant, origin }) => {
        grantSeen = { grant, origin }
        return 'onb-tok'
      }
    }
  })
  const cookie = await sess('a@x.test')
  const first = await app.fetch(
    new Request('http://tracy.test/new/?inspiration=stripe&platform=joomla', {
      headers: { cookie, accept: 'text/html' }
    })
  )
  assert.equal(first.status, 302)
  assert.equal(first.headers.get('location'), '/new/?inspiration=stripe&platform=joomla')
  assert.equal(grantSeen.origin, dsh.origin)
  assert.deepEqual(grantSeen.grant, {
    role: 'editor',
    email: 'a@x.test',
    folders: [],
    home: '/desk-home/onboarding',
    site: ONBOARDING_SITE,
    toolsets: ['content']
  })
  const planted = first.headers.getSetCookie().find((c) => c.startsWith('tracy_tok_'))
  assert.match(
    planted,
    /^tracy_tok_.*__onboarding=[0-9a-f]{24}~onb-tok; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/
  )
  assert.ok(
    !first.headers.getSetCookie().some((c) => c.startsWith(SITE_COOKIE)),
    'no site pointer for the creation workspace'
  )

  // Second pass with the planted cookie: forwarded under `/new` with the prefix header, and only
  // dsh's own cookie name reaches dsh.
  const pair = planted.split(';')[0]
  const second = await app.fetch(
    new Request('http://tracy.test/new/?inspiration=stripe&platform=joomla', {
      headers: { cookie: `${cookie}; ${pair}`, accept: 'text/html' }
    })
  )
  assert.equal(second.status, 200)
  assert.equal(dsh.seen.at(-1).url, '/new/?inspiration=stripe&platform=joomla')
  assert.equal(dsh.seen.at(-1).prefix, '/new')
  assert.equal(dsh.seen.at(-1).cookie, 'dsh_gateway_token=onb-tok')
  await dsh.close()
})

test('T05: assets, plugin modules and RPC of the creation page carry no intent and are still routed — never NO_SITES', async () => {
  const dsh = await upstream()
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    seatDoor: { mintSeatSession: async () => 'onb-tok' }
  })
  const cookie = `${await sess('a@x.test')}; ${await onboardingCookie(dsh.origin, 'a@x.test')}`
  for (const path of [
    '/new/assets/index-abc.js',
    '/new/plugins/??@deepseek-ai/dsh-client-modules/client.js&rev=1',
    '/new/api/tracy-design-inspiration/catalog',
    '/new/api/tracy-site-build-joomla/job?session=s1',
    '/new/api/dsh-passwords/directory-picker/list?path=/desk-home/onboarding/x'
  ]) {
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, { headers: { cookie, accept: 'application/json' } })
    )
    assert.equal(res.status, 200, path)
    assert.equal(dsh.seen.at(-1).url, path)
    assert.equal(dsh.seen.at(-1).prefix, '/new')
  }
  // A POST keeps its method and body.
  const post = await app.fetch(
    new Request('http://tracy.test/new/api/session/create', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{"a":1}'
    })
  )
  assert.equal(post.status, 200)
  await dsh.close()
})

test('T01 row 5/6: a viewer WITH a site — no intent lands on the site; an intent opens the creation workspace, never the site', async () => {
  const app = workspaceRoutes({
    config,
    sites: fakeSites(),
    pool: {},
    seats: { defaultSiteFor: async () => 'wpdemo.localhost', pendingInvitesFor: async () => [] }
  })
  const cookie = await sess('o@x.test')
  const root = await app.fetch(
    new Request('http://tracy.test/', { headers: { cookie, accept: 'text/html' } })
  )
  assert.equal(root.headers.get('location'), '/wpdemo.localhost/')
  const intent = await app.fetch(
    new Request('http://tracy.test/agent?inspiration=stripe&platform=joomla', {
      headers: { cookie, accept: 'text/html' }
    })
  )
  assert.equal(intent.status, 302)
  assert.equal(intent.headers.get('location'), '/new/?inspiration=stripe&platform=joomla')
  // An intent typed at the bare root means the same.
  const bare = await app.fetch(
    new Request('http://tracy.test/?inspiration=stripe&platform=wordpress', {
      headers: { cookie, accept: 'text/html' }
    })
  )
  assert.equal(bare.headers.get('location'), '/new/?inspiration=stripe&platform=wordpress')
})

// 20/09: the fold to `/` still happens, and since a site keeps its mount (Part A) the folded path
// reaches dsh UNDER that mount — `/wpdemo.localhost/`, which dsh unmounts to `/` itself.
test('a site page asked for /agent reaches dsh at the mount root, so the Worker-era link keeps opening the workspace', async () => {
  const dsh = await upstream()
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { accountByEmail: async () => ({ id: 'a' }), grantFor: async () => ({ role: 'owner' }) }
  })
  // No toolset reader wired: the seat is minted with NONE (never an absent list), and the cookie's
  // fingerprint covers that list.
  const grant = {
    role: 'owner',
    email: 'o@x.test',
    folders: ['/site/wpdemo.localhost'],
    site: 'wpdemo.localhost',
    toolsets: []
  }
  const fp = await grantFingerprint(grant, 'wpdemo', secret)
  const cookie = `${await sess('o@x.test')}; ${seatTokenCookieName(dsh.origin, 'wpdemo')}=${seatCookieValue(fp, 't')}`
  const res = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/agent?x=1', { headers: { cookie } })
  )
  assert.equal(res.status, 200)
  assert.equal(dsh.seen.at(-1).url, '/wpdemo.localhost/?x=1')
  assert.equal(dsh.seen.at(-1).prefix, '/wpdemo.localhost')
  await dsh.close()
})

// ── T08: another account on the same browser ──────────────────────────────────────────────────

test("T08: B signs in on a browser still holding A's creation cookie — A's token is never forwarded, B is minted afresh", async () => {
  const dsh = await upstream()
  const minted = []
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    seatDoor: {
      mintSeatSession: async ({ grant }) => {
        minted.push(grant.email)
        return `tok-for-${grant.email}`
      }
    }
  })
  const aCookie = await onboardingCookie(dsh.origin, 'a@x.test', 'a-token')
  const res = await app.fetch(
    new Request('http://tracy.test/new/', {
      headers: { cookie: `${await sess('b@x.test')}; ${aCookie}`, accept: 'text/html' }
    })
  )
  assert.equal(res.status, 302)
  assert.deepEqual(minted, ['b@x.test'])
  assert.equal(dsh.seen.length, 0, "nothing reached dsh on A's token")
  const planted = res.headers.getSetCookie().find((c) => c.startsWith('tracy_tok_'))
  assert.match(planted, /~tok-for-b@x\.test;/)
  await dsh.close()
})

// ── T09: the door is not there ────────────────────────────────────────────────────────────────

test('T09: a refusing door answers a navigation with a retryable page that keeps the intent, a fetch with a code — never NO_SITES', async () => {
  const { workspaceUnavailablePage } = await import('../src/bar/pages.js')
  const app = workspaceRoutes({
    config,
    sites: fakeSites(),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    seatDoor: { mintSeatSession: async () => null },
    pages: { noSites: null, workspaceUnavailable: workspaceUnavailablePage }
  })
  const cookie = await sess('a@x.test')
  const page = await app.fetch(
    new Request('http://tracy.test/new/?inspiration=stripe&platform=joomla', {
      headers: { cookie, accept: 'text/html' }
    })
  )
  assert.equal(page.status, 503)
  const body = await page.text()
  assert.match(body, /not available right now/)
  assert.match(body, /href="\/new\/\?inspiration=stripe&amp;platform=joomla"/)
  assert.doesNotMatch(body, /No sites/i)
  const fetched = await app.fetch(new Request('http://tracy.test/new/api/x', { headers: { cookie } }))
  assert.equal(fetched.status, 502)
  assert.deepEqual(await fetched.json(), { code: 'SEAT_DOOR_REFUSED', reason: 'the workspace door refused' })
  // No dsh configured for the default host at all.
  const noHost = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => null }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    pages: { noSites: null, workspaceUnavailable: workspaceUnavailablePage }
  })
  const none = await noHost.fetch(new Request('http://tracy.test/new/', { headers: { cookie } }))
  assert.equal(none.status, 501)
  assert.equal((await none.json()).code, 'HOST_NOT_CONFIGURED')
})

test('a 401 from dsh on the creation workspace clears its cookie and returns a terminal retryable failure', async () => {
  const dsh = await upstream((_req, res) => {
    res.writeHead(401)
    res.end()
  })
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] }
  })
  const cookie = `${await sess('a@x.test')}; ${await onboardingCookie(dsh.origin, 'a@x.test')}`
  const res = await app.fetch(new Request('http://tracy.test/new/s/abc?tab=x', { headers: { cookie } }))
  assert.equal(res.status, 502)
  assert.equal(res.headers.get('location'), null)
  assert.equal((await res.json()).code, 'SEAT_UPSTREAM_UNAVAILABLE')
  assert.equal(
    res.headers.get('set-cookie'),
    `${seatTokenCookieName(dsh.origin, 'onboarding')}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
  await dsh.close()
})

test('a redirect from the creation workspace already carries /new and is not prefixed twice', async () => {
  const dsh = await upstream((_req, res) => {
    res.writeHead(302, { location: '/new/s/fresh' })
    res.end()
  })
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] }
  })
  const cookie = `${await sess('a@x.test')}; ${await onboardingCookie(dsh.origin, 'a@x.test')}`
  const res = await app.fetch(new Request('http://tracy.test/new/', { headers: { cookie } }))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/new/s/fresh')
  await dsh.close()
})

// ── P05: a site seat carries the seat book's resolved toolsets ────────────────────────────────

test("P05: the site mint sends the role's fixed toolsets (ADR 0028) — a viewer's empty list sent as one, stored policies ignored", async () => {
  const { permissionsFor, toolsetsFor } = await import('../src/seats/roles.js')
  const minted = []
  const make = (role, seats = {}) =>
    workspaceRoutes({
      config,
      sites: fakeSites(),
      pool: {},
      seats: {
        accountByEmail: async () => ({ id: 'e' }),
        grantFor: async () => ({ role }),
        // A stored policy that would once have narrowed or widened the role: never read now.
        rolePolicy: async () => ({ policy: { [role]: { content: false, lifecycle: true } } }),
        ...seats
      },
      workspaces: { workspaceRolePolicyForSite: async () => ({ policy: { [role]: { content: false } } }) },
      seatDoor: {
        mintSeatSession: async ({ grant }) => {
          minted.push(grant.toolsets)
          return 'tok'
        }
      }
    })
  const cookie = await sess('e@x.test')
  const req = () => new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } })
  await make('editor', { toolsetsFor }).fetch(req())
  assert.deepEqual(minted.at(-1), ['content', 'code', 'site'])
  await make('owner', { toolsetsFor }).fetch(req())
  assert.deepEqual(minted.at(-1), ['content', 'code', 'site', 'lifecycle'])
  await make('viewer', { toolsetsFor }).fetch(req())
  assert.deepEqual(minted.at(-1), [], 'a viewer is read-only, and the door is told so')
  // The older wiring (`permissionsFor` only) answers the same.
  await make('editor', { permissionsFor }).fetch(req())
  assert.deepEqual(minted.at(-1), ['content', 'code', 'site'])
  // Nothing wired: nothing granted — never an absent list the door would fill with its default.
  await make('editor').fetch(req())
  assert.deepEqual(minted.at(-1), [])
})

test('P07: a cookie minted under one role is not honoured once the seat book answers another — the door is asked again', async () => {
  const { permissionsFor } = await import('../src/seats/roles.js')
  const dsh = await upstream()
  const minted = []
  let role = 'owner'
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: {
      accountByEmail: async () => ({ id: 'e' }),
      grantFor: async () => ({ role }),
      rolePolicy: async () => null,
      permissionsFor
    },
    workspaces: { workspaceRolePolicyForSite: async () => null },
    seatDoor: {
      mintSeatSession: async ({ grant }) => {
        minted.push(grant.role)
        return `tok-${grant.role}`
      }
    }
  })
  const cookie = await sess('e@x.test')
  const first = await app.fetch(new Request('http://tracy.test/wpdemo.localhost/', { headers: { cookie } }))
  const pair = first.headers
    .getSetCookie()
    .find((c) => c.startsWith('tracy_tok_'))
    .split(';')[0]
  const asOwner = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/x', { headers: { cookie: `${cookie}; ${pair}` } })
  )
  assert.equal(asOwner.status, 200)
  assert.equal(dsh.seen.at(-1).cookie, 'dsh_gateway_token=tok-owner')
  // The owner demotes them. The very next request with the SAME cookie is re-minted as editor;
  // the owner token never reaches dsh again.
  role = 'editor'
  const demoted = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/x', { headers: { cookie: `${cookie}; ${pair}` } })
  )
  assert.equal(demoted.status, 302)
  assert.deepEqual(minted, ['owner', 'editor'])
  assert.equal(dsh.seen.length, 1)
  await dsh.close()
})

// ── The socket goes through the same resolver ─────────────────────────────────────────────────

function acceptKey(key) {
  return crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
}

function echoDsh() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`path=${req.url}`)
  })
  server.upgrades = []
  server.sockets = []
  server.on('upgrade', (req, socket) => {
    server.upgrades.push({
      url: req.url,
      prefix: req.headers['x-forwarded-prefix'],
      cookie: req.headers.cookie
    })
    server.sockets.push(socket)
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(req.headers['sec-websocket-key'])}\r\n\r\n`
    )
    socket.once('data', (chunk) => socket.write(chunk))
  })
  return server
}

function upgrade(port, path, cookie) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        cookie,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64')
      }
    })
    req.on('upgrade', (res, socket) => resolve({ status: res.statusCode, socket }))
    req.on('response', (res) => resolve({ status: res.statusCode, socket: null }))
    req.on('error', (e) => resolve({ status: 0, socket: null, error: e }))
    req.end()
  })
}

test(
  'T05/T06: the creation workspace socket is admitted by path alone — no intent, no Referer, no site pointer',
  dbOpts,
  async (t) => {
    const dsh = echoDsh()
    await new Promise((r) => dsh.listen(0, '127.0.0.1', r))
    const dshOrigin = `http://127.0.0.1:${dsh.address().port}`
    const { url: dbUrlForApp } = db
    const env = {
      TRACY_ORIGIN: 'http://tracy.test',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: secret,
      DATABASE_URL: dbUrlForApp,
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://127.0.0.1:1',
      HOST_local_DSH_ORIGIN: dshOrigin,
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      PORT: '0'
    }
    const seatDoor = { mintSeatSession: async () => 'onb-tok' }
    const { port, close } = await start({ env, log: { log: () => {}, warn: () => {} }, deps: { seatDoor } })
    const sockets = []
    t.after(async () => {
      for (const s of sockets) s?.destroy()
      for (const s of dsh.sockets) s.destroy()
      await close()
      await new Promise((r) => dsh.close(r))
    })
    const cookie = `${await sess('a@x.test')}; ${await onboardingCookie(dshOrigin, 'a@x.test')}`
    const ws = await upgrade(port, '/new/api/remote.mux', cookie)
    sockets.push(ws.socket)
    assert.equal(ws.status, 101)
    assert.equal(dsh.upgrades.at(-1).url, '/new/api/remote.mux')
    assert.equal(dsh.upgrades.at(-1).prefix, '/new')
    assert.equal(dsh.upgrades.at(-1).cookie, 'dsh_gateway_token=onb-tok')

    // A bare token (no fingerprint), a fingerprint for another account, no session: all refused.
    const bare = `${await sess('a@x.test')}; ${seatTokenCookieName(dshOrigin, 'onboarding')}=onb-tok`
    assert.notEqual((await upgrade(port, '/new/api/remote.mux', bare)).status, 101)
    const other = `${await sess('b@x.test')}; ${await onboardingCookie(dshOrigin, 'a@x.test')}`
    assert.notEqual((await upgrade(port, '/new/api/remote.mux', other)).status, 101)
    assert.notEqual(
      (await upgrade(port, '/new/api/remote.mux', await onboardingCookie(dshOrigin, 'a@x.test'))).status,
      101
    )
    assert.equal(dsh.upgrades.length, 1)
  }
)

test('workspaceResolver: one object answers both the route and the splice', async () => {
  const resolver = workspaceResolver({ config, sites: fakeSites() })
  const located = resolver.locate({ pathname: '/new/api/remote.mux', origin: 'http://tracy.test' })
  assert.equal(located.scope, 'onboarding')
  const seat = await resolver.seatFor({ located, email: 'a@x.test' })
  assert.equal(seat.cookieName, seatTokenCookieName('http://127.0.0.1:1', 'onboarding'))
  assert.equal(
    resolver.tokenFor({ seat, cookieHeader: `${seat.cookieName}=${seatCookieValue(seat.fingerprint, 'x')}` }),
    'x'
  )
  assert.equal(resolver.tokenFor({ seat, cookieHeader: `${seat.cookieName}=x` }), null)
  // A site with no live seat is refused before any host is looked up.
  const site = resolver.locate({ pathname: '/wpdemo.localhost/', origin: 'http://tracy.test' })
  assert.deepEqual(await resolver.seatFor({ located: site, email: 'a@x.test' }), { refused: 'no-seat' })
})

test('T04/T08: a stale tracy_site pointer from another account never captures a creation intent', async () => {
  // B signs in on a browser that still carries A's `tracy_site`. The intent door must open B's
  // own creation workspace — measured 13/09 the other way: B landed on "Ask to join" for A's site.
  const app = workspaceRoutes({
    config,
    sites: fakeSites(),
    pool: {},
    seats: {
      defaultSiteFor: async () => null,
      pendingInvitesFor: async () => [],
      accountByEmail: async () => ({ id: 'b' }),
      grantFor: async () => null
    }
  })
  const cookie = `${await sess('b@x.test')}; ${SITE_COOKIE}=wpdemo.localhost`
  for (const path of ['/agent?inspiration=stripe&platform=joomla', '/?inspiration=stripe&platform=joomla']) {
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, { headers: { cookie, accept: 'text/html' } })
    )
    assert.equal(res.status, 302, path)
    assert.equal(res.headers.get('location'), '/new/?inspiration=stripe&platform=joomla', path)
  }
  // Signed out with the same stale pointer: the sign-in door, carrying the intent.
  const out = await app.fetch(
    new Request('http://tracy.test/agent?inspiration=stripe&platform=joomla', {
      headers: { cookie: `${SITE_COOKIE}=wpdemo.localhost`, accept: 'text/html' }
    })
  )
  assert.equal(out.headers.get('location'), '/new/?inspiration=stripe&platform=joomla')
})

test('a tracy_site pointer the signed-in viewer holds no seat on is forgotten at the root, not turned into a join page', async () => {
  // The plain case the intent test above does not cover: B signs in with NO intent on a browser
  // still carrying A's pointer and opens `/`. Measured 14/09: B's first screen was "Ask to join
  // <A's site>". B never asked for that site — nothing in the path names it — so the pointer is
  // dropped (Max-Age=0) and B lands as a person with no sites.
  let grantCalls = 0
  const app = workspaceRoutes({
    config,
    sites: fakeSites(),
    pool: {},
    seats: {
      defaultSiteFor: async () => null,
      pendingInvitesFor: async () => [],
      accountByEmail: async () => ({ id: 'b' }),
      grantFor: async () => {
        grantCalls += 1
        return null // no seat for b on wpdemo
      }
    }
  })
  const res = await app.fetch(
    new Request('http://tracy.test/', {
      headers: { cookie: `${await sess('b@x.test')}; ${SITE_COOKIE}=wpdemo.localhost`, accept: 'text/html' }
    })
  )
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/new/')
  assert.match(res.headers.get('set-cookie') ?? '', /tracy_site=; .*Max-Age=0/)
  assert.ok(grantCalls >= 1, 'the seat book was asked before the pointer was dropped')

  // A path that NAMES the site is a different question: a viewer who typed it still gets the
  // join door, pointer or not — the guard above is only for the pointer-resolved root.
  const named = await app.fetch(
    new Request('http://tracy.test/wpdemo.localhost/', {
      headers: { cookie: `${await sess('b@x.test')}`, accept: 'text/html' }
    })
  )
  assert.equal(named.status, 302)
  assert.match(named.headers.get('location'), /^\/wpdemo\.localhost\/join\?next=/)
})

// ── A press enters on its session (20/09) ─────────────────────────────────────────────────────

/** A dsh that answers the RPC door: `session/create` with one id, everything else as the plain upstream. */
async function dshMakingSessions(answer = { sessionId: 'session-ahead-1' }) {
  const calls = []
  const dsh = await upstream((req, res) => {
    const endpoint = /^\/new\/api\/(workspace\/create|session\/create)$/.exec(req.url)?.[1]
    if (req.method === 'POST' && endpoint !== undefined) {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString())
        calls.push({ endpoint, body, cookie: req.headers.cookie, prefix: req.headers['x-forwarded-prefix'] })
        // The folder's id first — the session is made BY THAT ID, never by cwd (a cwd session is
        // dropped by the gateway's first-baseline seeding; `creationSessionAhead` says so).
        const value =
          endpoint === 'workspace/create'
            ? {
                workspace: { workspaceId: 'ws-personal', path: body.payload.args.request.path },
                created: false
              }
            : answer
        if (value === null) {
          res.writeHead(403)
          res.end()
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value } }))
      })
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`path=${req.url}`)
  })
  return { ...dsh, calls }
}

/** A lane token whose payload names the account, the way the seat door mints them. */
function laneToken(username) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '7', username })}.sig`
}

test('a press on /new/ is sent to the session made for it, intent in a cookie, seat cookie planted in the same answer', async () => {
  const dsh = await dshMakingSessions()
  const token = laneToken('s0123456789abcdef01234567_abc123')
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    seatDoor: { mintSeatSession: async () => token }
  })
  const res = await app.fetch(
    new Request('http://tracy.test/new/?inspiration=stripe&platform=joomla', {
      headers: { cookie: await sess('a@x.test'), accept: 'text/html' }
    })
  )
  assert.equal(res.status, 302)
  // The Add site wizard, carrying the template the press chose (24/09/2026: one creation flow).
  // It used to be that CMS's own Build tab; what travels is unchanged — the design and the
  // platform — and `design` rides on the ADDRESS because the wizard reads it from there, where
  // the mirror keeps it (`inspiration`/`platform` are an intent, spent on arrival and stripped).
  assert.equal(res.headers.get('location'), '/new/s/session-ahead-1?tab=tracy%3Aadd-site&design=stripe')
  const cookies = res.headers.getSetCookie()
  assert.ok(
    cookies.some((c) => /^tracy_tok_.*__onboarding=[0-9a-f]{24}~/.test(c)),
    'the seat cookie rides along'
  )
  assert.equal(
    cookies.find((c) => c.startsWith('tracy_intent=')),
    `tracy_intent=${encodeURIComponent('inspiration=stripe&platform=joomla')}; Path=/new; SameSite=Lax; Max-Age=120`
  )
  // Through the same door the page uses: the seat's cookie, the mount, the seat's own folder —
  // asked for its id first, and the session made BY THAT ID.
  assert.deepEqual(
    dsh.calls.map((c) => c.endpoint),
    ['workspace/create', 'session/create']
  )
  assert.equal(dsh.calls[0].cookie, `dsh_gateway_token=${token}`)
  assert.equal(dsh.calls[0].prefix, '/new')
  assert.deepEqual(dsh.calls[0].body.payload, {
    args: { request: { path: '/desk-home/onboarding/s0123456789abcdef01234567_abc123' } }
  })
  assert.deepEqual(dsh.calls[1].body.payload, {
    args: { request: { workspaceId: 'ws-personal', agentPreset: 'designer-joomla' } }
  })
  await dsh.close()
})

test('a press on /new/ with a seat already held is sent the same way, with no seat cookie re-minted', async () => {
  const dsh = await dshMakingSessions({ sessionId: 'session-ahead-2' })
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] },
    seatDoor: { mintSeatSession: async () => assert.fail('the held seat is enough') }
  })
  const held = await onboardingCookie(dsh.origin, 'a@x.test', laneToken('acct_1'))
  const res = await app.fetch(
    new Request('http://tracy.test/new/?inspiration=brand:acme.com&platform=emdash', {
      headers: { cookie: `${await sess('a@x.test')}; ${held}`, accept: 'text/html' }
    })
  )
  assert.equal(res.status, 302)
  assert.equal(
    res.headers.get('location'),
    '/new/s/session-ahead-2?tab=tracy%3Aadd-site&design=brand%3Aacme.com'
  )
  assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith('tracy_tok_')))
  assert.equal(dsh.calls[0].body.payload.args.request.path, '/desk-home/onboarding/acct_1')
  await dsh.close()
})

test('when dsh refuses the session, the press is forwarded as before — intent on the address, no cookie', async () => {
  const dsh = await dshMakingSessions(null)
  const app = workspaceRoutes({
    config,
    sites: fakeSites({ dshOf: () => ({ origin: dsh.origin, seatSecret: 'k' }) }),
    pool: {},
    seats: { defaultSiteFor: async () => null, pendingInvitesFor: async () => [] }
  })
  const held = await onboardingCookie(dsh.origin, 'a@x.test', laneToken('acct_1'))
  const res = await app.fetch(
    new Request('http://tracy.test/new/?inspiration=stripe&platform=joomla', {
      headers: { cookie: `${await sess('a@x.test')}; ${held}`, accept: 'text/html' }
    })
  )
  assert.equal(res.status, 200)
  assert.match(await res.text(), /^path=\/new\/\?inspiration=stripe&platform=joomla/)
  assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith('tracy_intent=')))
  // A link that already names a session, or a fetch, never asks for one.
  const onSession = await app.fetch(
    new Request('http://tracy.test/new/s/abc?inspiration=stripe&platform=joomla', {
      headers: { cookie: `${await sess('a@x.test')}; ${held}`, accept: 'text/html' }
    })
  )
  assert.equal(onSession.status, 200)
  assert.deepEqual(
    dsh.calls.map((c) => c.endpoint),
    ['workspace/create', 'session/create']
  )
  await dsh.close()
})
