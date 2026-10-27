// J10 — what a stranger can and cannot claim, and the draft/published switch, on the run's shared
// WordPress site.
//
// The draft gate is gone (16/09/2026, `apps/tracy-web/src/bar/route.js`): a stranger reads a
// draft copy with 200, and J2b already checks that, the 401 of `/__tracy/errors` and robots.txt.
// This journey checks the rest:
//   1. A forged `tracy_sess` — a valid signature over another payload, a missing signature, junk —
//      names nobody: `/auth/me` has no email, `/api/sites` refuses, `/__tracy/errors` asks to sign in.
//   2. Identity headers a client sends itself (`x-tracy-email`/`-tier`/`-role`) are dropped:
//      on Tracy's host they change nothing, and on the site the CMS backend does not sign the
//      stranger in (`site-proxy.js` strips them before setting its own; WordPress's Tracy Access
//      plugin signs in on `x-tracy-tier: editor`), while the owner IS signed in.
//   3. The site may be framed by the workspace: every `frame-ancestors` it answers with admits
//      `https://cowork.tracy.site`.
//   4. Publish → unpublish through `POST /api/sites/:key/go-live` (owner), the only door that moves
//      the flag (`POST /state {publish}` answers 409 `PUBLISH_BY_GO_LIVE`): the host's job ends,
//      published drops Tracy's robots.txt and the draft badge (`managed` instead); draft brings both
//      back, with the bar's `x-robots-tag: noindex`.

import { test } from 'node:test'
import { Client } from '../lib/api.mjs'
import { mintCookie } from '../lib/dev.mjs'
import { ENV, runEmail } from '../lib/env.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { goLive, noteAccount, runAccount, sharedSite } from '../lib/run-site.mjs'

/** The draft robots.txt the bar answers with (`ROBOTS` in `bar/route.js`), by its one unique line. */
const DRAFT_ROBOTS = /^Content-Signal: search=no/m

/**
 * The variant of the seat badge stamped into a proxied HTML page, or null without one. The tag is
 * `badgeTagFor`'s (`bar/badge.js`): `data-variant` first, `data-team-href` always present.
 */
function badgeVariant(html) {
  return /<script\b[^>]*\bdata-variant="([a-z]+)"[^>]*\bdata-team-href="/.exec(html)?.[1] ?? null
}

/** Every `frame-ancestors` source list in a response's CSP headers. */
function frameAncestors(headers) {
  const csp = headers.get('content-security-policy') ?? ''
  return [...csp.matchAll(/frame-ancestors([^;,]*)/gi)].map((m) => m[1].trim().split(/\s+/).filter(Boolean))
}

/** Does one source list admit `origin` as a parent? (`'self'` is the site itself, not the workspace.) */
function admits(sources, origin) {
  const host = new URL(origin).hostname
  return sources.some((s) => {
    if (s === '*' || s === origin || s === `${origin}/`) return true
    const wild = /^https:\/\/\*\.(.+)$/.exec(s)
    return Boolean(wild && host.endsWith(`.${wild[1]}`))
  })
}

/** Base64url, as `session.js` writes a token's payload. */
const b64url = (s) => Buffer.from(s).toString('base64url')

test('J10 stranger claims and the publish switch', async (t) => {
  const run = runContext()
  const { runId, manifest } = run
  await journey(t, { id: 'J10', cms: null }, async ({ details, notes }) => {
    const owner = await runAccount(run, 'owner')
    const site = await sharedSite(run, owner, 'wordpress')
    details.site = { siteKey: site.siteKey, reused: !site.created }
    const keyPath = `/api/sites/${encodeURIComponent(site.siteKey)}`

    // ── 1. forged session cookies ───────────────────────────────────────────────────────────────
    // A real signature, but over another account's payload: the owner's address with it.
    const malloryEmail = runEmail(runId, 'mallory')
    noteAccount(manifest, malloryEmail, { only: 'a signature to graft onto a forged payload' })
    const mallory = await mintCookie(malloryEmail)
    const [, , malSig] = mallory.split('.')
    const ownerPayload = b64url(
      JSON.stringify({ email: owner.email, exp: Math.floor(Date.now() / 1000) + 3600 })
    )
    const forged = {
      grafted: `v1.${ownerPayload}.${malSig}`,
      unsigned: `v1.${ownerPayload}.`,
      noSignature: `v1.${ownerPayload}`,
      junk: 'v1.junk.junk'
    }
    details.forgedCookie = {}
    for (const [kind, token] of Object.entries(forged)) {
      const c = new Client({ name: `forged-${kind}`, token })
      const me = await c.get('/auth/me')
      const sites = await c.get('/api/sites')
      const errors = await c.get(`${site.origin}/__tracy/errors`)
      details.forgedCookie[kind] = {
        authMe: me.status,
        named: me.json?.email ?? null,
        apiSites: sites.status,
        siteErrorsDoor: errors.status
      }
      check(
        me.json?.email == null,
        `forged cookie (${kind}): /auth/me named ${JSON.stringify(me.json?.email)}`
      )
      check(sites.status === 401, `forged cookie (${kind}): GET /api/sites answered ${sites.status}`)
      check(errors.status === 401, `forged cookie (${kind}): /__tracy/errors answered ${errors.status}`)
    }

    // ── 2. identity headers a client sends itself ──────────────────────────────────────────────
    const claim = { 'x-tracy-email': owner.email, 'x-tracy-tier': 'editor', 'x-tracy-role': 'owner' }
    const liar = new Client({ name: 'stranger-claiming' })
    const meLiar = await liar.get('/auth/me', { headers: claim })
    const sitesLiar = await liar.get('/api/sites', { headers: claim })
    const errorsLiar = await liar.get(`${site.origin}/__tracy/errors`, { headers: claim })
    const adminLiar = await liar.get(`${site.origin}/wp-admin/`, {
      headers: { ...claim, accept: 'text/html' }
    })
    const homeLiar = await liar.get(`${site.origin}/`, { headers: { ...claim, accept: 'text/html' } })
    const adminOwner = await owner.get(`${site.origin}/wp-admin/`, { headers: { accept: 'text/html' } })
    const liarLocation = adminLiar.headers.get('location') ?? ''
    details.forgedHeaders = {
      authMe: { status: meLiar.status, named: meLiar.json?.email ?? null },
      apiSites: sitesLiar.status,
      siteErrorsDoor: errorsLiar.status,
      wpAdmin: { status: adminLiar.status, location: liarLocation.replace(/\?.*$/, '?…') },
      homeNamesViewer: /\bdata-viewer="/.test(homeLiar.text),
      ownerWpAdmin: {
        status: adminOwner.status,
        location: (adminOwner.headers.get('location') ?? '').replace(/\?.*$/, '?…')
      }
    }
    check(
      meLiar.json?.email == null,
      `x-tracy-email on Tracy's host: /auth/me named ${JSON.stringify(meLiar.json?.email)}`
    )
    check(
      sitesLiar.status === 401,
      `x-tracy-email on Tracy's host: GET /api/sites answered ${sitesLiar.status}`
    )
    check(
      errorsLiar.status === 401,
      `x-tracy-email on the site: /__tracy/errors answered ${errorsLiar.status}`
    )
    check(
      !details.forgedHeaders.homeNamesViewer,
      'x-tracy-email on the site: the badge names the claimed viewer'
    )
    // The positive control first: without it, a refused stranger proves nothing.
    check(
      adminOwner.status === 200,
      `the owner is not signed in to /wp-admin/ (HTTP ${adminOwner.status} → ${details.forgedHeaders.ownerWpAdmin.location || '—'})`
    )
    check(
      adminLiar.status !== 200 && /wp-login\.php/.test(liarLocation),
      `a stranger claiming x-tracy-tier: editor reached /wp-admin/ (HTTP ${adminLiar.status} → ${liarLocation || '—'})`
    )

    // ── 3. framing by the workspace ─────────────────────────────────────────────────────────────
    const home = await owner.get(`${site.origin}/`, { headers: { accept: 'text/html' } })
    const lists = frameAncestors(home.headers)
    details.framing = {
      status: home.status,
      frameAncestors: lists.map((l) => l.join(' ')),
      xFrameOptions: home.headers.get('x-frame-options')
    }
    check(lists.length > 0, 'the site answers with no frame-ancestors at all')
    check(
      lists.every((l) => admits(l, ENV.origin)),
      `a frame-ancestors list does not admit ${ENV.origin}: ${details.framing.frameAncestors.join(' | ')}`
    )

    // ── 4. publish, then back to draft ──────────────────────────────────────────────────────────
    const stranger = new Client({ name: 'stranger' })
    const look = async () => {
      const robots = await stranger.get(`${site.origin}/robots.txt`)
      // The same file past any cache in front (the bar ignores the query on `/robots.txt`).
      const fresh = await stranger.get(`${site.origin}/robots.txt?e2e=${Date.now()}`)
      const page = await stranger.get(`${site.origin}/`, { headers: { accept: 'text/html' } })
      const state = await owner.get(`${keyPath}/state`)
      return {
        state: state.json?.publish ?? `http-${state.status}`,
        home: page.status,
        draftRobots: DRAFT_ROBOTS.test(robots.text),
        draftRobotsUncached: DRAFT_ROBOTS.test(fresh.text),
        robotsCache: {
          cfCacheStatus: robots.headers.get('cf-cache-status'),
          cacheControl: robots.headers.get('cache-control'),
          age: robots.headers.get('age')
        },
        robots: robots.status,
        xRobotsTag: page.headers.get('x-robots-tag'),
        badge: badgeVariant(page.text)
      }
    }
    details.before = await look()
    check(details.before.state === 'draft', `the site starts as ${details.before.state}, not draft`)
    try {
      const pub = await goLive(owner, site.siteKey, 'live')
      details.publish = pub
      check(pub.status === 202, `POST go-live live answered ${pub.status} ${pub.code ?? ''}`)
      check(
        pub.ended === 'done',
        `go-live live ended ${pub.ended} after ${pub.ms} ms (flag ${pub.publish}, operation ${JSON.stringify(pub.operation)})`
      )
      details.published = await look()
      const p = details.published
      check(p.state === 'published', `state after publish reads ${p.state}`)
      check(p.home === 200, `published home answered ${p.home} to a stranger`)
      check(!p.draftRobots, 'published site still answers the draft robots.txt')
      // The host's job lifts the site's own `noindex` (a WordPress copy sends `noindex, nofollow,
      // noarchive` until then, measured 04/10/2026): a published home says nothing of noindex.
      check(!/noindex/.test(p.xRobotsTag ?? ''), `published home still sends x-robots-tag ${p.xRobotsTag}`)
      check(p.badge === 'managed', `published home carries badge variant ${p.badge}, expected managed`)
    } finally {
      // Back to draft whatever happened, so the shared site is left as the next journey expects it.
      details.unpublish = await goLive(owner, site.siteKey, 'draft')
    }
    const u = details.unpublish
    check(u.status === 202, `POST go-live draft answered ${u.status} ${u.code ?? ''}`)
    check(u.ended === 'done', `go-live draft ended ${u.ended} after ${u.ms} ms (flag ${u.publish})`)
    details.after = await look()
    const a = details.after
    check(a.state === 'draft', `state after unpublish reads ${a.state}`)
    check(
      a.draftRobots,
      `unpublished site does not answer the draft robots.txt again (cf-cache-status ${a.robotsCache.cfCacheStatus}, age ${a.robotsCache.age}; past the cache: ${a.draftRobotsUncached ? 'draft' : 'not draft either'})`
    )
    check(/noindex/.test(a.xRobotsTag ?? ''), `unpublished home sends x-robots-tag ${a.xRobotsTag}`)
    check(a.badge === 'draft', `unpublished home carries badge variant ${a.badge}, expected draft`)
    if (a.home !== 200) notes.push(`unpublished home answered ${a.home} to a stranger`)
  })
})
