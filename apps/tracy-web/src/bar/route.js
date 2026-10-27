/**
 * Every customer site hostname enters tracy-web through here — the port of `fleet-bar`
 * (`workers/fleet-bar/src/index.js`) into this process. `app.js` mounts this BEFORE every other
 * domain (identity, seats, sites, workspaces, the dsh workspace proxy): a request whose `Host`
 * names a site must never reach any of those, the same way a Cloudflare zone routed a customer
 * hostname to this Worker and nothing else.
 *
 * 🔒 THIS ROUTER GATES NOTHING (16/09/2026). It proxies the copy, puts the badge on it, and
 * vouches for who is watching (`x-tracy-email` + `x-tracy-tier`/`x-tracy-role`, read by the Tracy
 * Access plugin on the site). It
 * does not decide who may read a site: the draft gate ("This copy is private"), the CMS-backend
 * redirect, and the three sign-in doors it used to serve on a customer's hostname
 * (`/__tracy/login`, `/__tracy/signin/:provider`, `/__tracy/team`) are gone — ADR 0018. Signing in
 * happens on Tracy's own hostname and nowhere else.
 *
 * Dropped relative to the Worker, by the task's own instruction:
 * - `/__tracy/proposals`, `label--slug` addressing, `x-tracy-variant` — proposals are not carried.
 * - The Cloudflare Access reads (`looksLikeTracy`/`tracyRead`/`verifiedEmail`) — there is no
 *   upstream Access layer in front of this process whose header this code must not be fooled by.
 *
 * NOT dropped: `x-tracy-tier`/`x-tracy-role`. An earlier port dropped them believing nothing read
 * either; both Tracy Access plugins do (WordPress `tracy-access.php`, Joomla `TracyAccess.php`) and
 * sign a person in to the CMS backend only on `tier: editor`, so their loss sent every owner's
 * "Open admin" to the CMS login page (#339). `site-proxy.js` sets them from the seat role below.
 */
import { Hono } from 'hono'
import { sessionWithExpiry } from '../lib/session.js'
import { roleOnSite } from '../lib/role-on-site.js'
import { proxySite } from './site-proxy.js'
import { readDsPreviewTicket } from '../lib/ds-preview-ticket.js'
import { locationKeepingTicket, splitDsPreview } from './ds-preview.js'
import { previewFor } from './preview.js'
import { usedTicketStore } from '../lib/preview-ticket.js'
import { badgeVariantFor } from './badge.js'
import { unknownSitePage, refusedHostPage, messagePage } from './pages.js'
import { requestLanguage, translate } from '../lib/i18n/index.js'
import { isApiHost } from '../lib/api-host.js'
import { isDocsHost } from '../lib/docs-host.js'
import { isAdminPath, originProjection } from './own-domain.js'
import { isIP } from 'node:net'
import { OWN_READ_HEADER, isOwnRead } from '../lib/own-read.js'

const PREFIX = '/__tracy'
/** Where Tracy asks an own domain whether it reaches its site, and the header its question rides. */
export const OWN_DOMAIN_PROBE_PATH = '/__tracy/domain-probe'
export const OWN_DOMAIN_PROBE_HEADER = 'x-tracy-domain-probe'
export const OWN_DOMAIN_PROBE_PAGE_HEADER = 'x-tracy-domain-probe-page'
// Ported verbatim from `workers/fleet-bar/src/index.js`'s own preview-errors constants.
const PREVIEW_ERRORS_MAX_BODY = 64 * 1024
const PREVIEW_ERRORS_MAX_MESSAGE = 2_000
// How long a demo's template id is trusted before the release book is read again. A release is
// re-read on a webhook, not per page view, so a few minutes of staleness costs nothing a person
// would notice and keeps every demo page from parsing ~90 release rows.
const DEMO_TEMPLATE_TTL_MS = 5 * 60 * 1000
// How long a site's connected own domain (or its having none) is trusted before it is read again, so an
// anonymous page view of a published site does not cost a query each. Connecting or removing a domain
// therefore takes effect on the Tracy address's 301 (see `barRoutes`) within this long.
const OWN_DOMAIN_TTL_MS = 60 * 1000

/**
 * Whether a request is the Design system panel's preview of the page (`ds-preview.js`): a GET with
 * `tracy_ds_preview` that the browser marks as a frame, or that carries no `Sec-Fetch-Dest` — the same
 * requests that get the previewed page. A top-level navigation with the parameter is not.
 * @param {string} method
 * @param {URL} url
 * @param {string | undefined} dest - `Sec-Fetch-Dest`
 */
export function isDsPreviewFrame(method, url, dest) {
  return (
    method === 'GET' && splitDsPreview(url.search).id !== null && (dest === undefined || dest === 'iframe')
  )
}

/**
 * Whether a visitor's request on a Tracy address is answered there even when the site has an own
 * domain: the back office (`isAdminPath`), the CMS's sign-in and the machinery it reaches it through
 * — WordPress `wp-login.php`, its REST API (`/wp-json/`, `?rest_route=`); Joomla's web services
 * (`/api/`); every EmDash `/_emdash/` path (its API, the magic-link and OAuth sign-in, the passkey RP
 * ID) — and a request that names its own credentials (`Authorization`: an application password, an
 * agent's token), which a redirect to another host would drop.
 * @param {string|null|undefined} platform
 * @param {URL} url
 * @param {Headers} headers
 */
export function staysOnTracyAddress(platform, url, headers) {
  if (headers.has('authorization')) return true
  if (isAdminPath(platform, url.pathname)) return true
  const path = url.pathname.toLowerCase()
  const under = (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  if (platform === 'joomla') return under('/api')
  if (platform === 'emdash') return under('/_emdash')
  if (platform === 'wordpress' || platform === undefined || platform === null)
    return path === '/wp-login.php' || under('/wp-json') || url.searchParams.has('rest_route')
  return false
}

/**
 * What a working copy says to crawlers while it is a draft. Ported verbatim from `ROBOTS`
 * (`workers/fleet-bar/src/index.js:47-52`).
 */
export const ROBOTS = `# This is a private working copy of a website, held by Tracy for its owner.
# It is not the live site and must not be indexed, archived or used for training.
User-agent: *
Content-Signal: search=no, ai-input=no, ai-train=no
Disallow: /
`

/**
 * Which "kind" of front door a `Host` header names. Pure — no lookup of whether a `site` kind's
 * label actually names a live site; that is `barRoutes`'s job (a lookup miss is a 404 for a
 * different reason than a hostname this deployment's own domains never claimed).
 *
 * @param {string} hostHeader - the raw `Host` header, port and all.
 * @param {object} config - `readConfig`'s value (`origin`, `apiOrigin`, `docsOrigin`, `siteDomain`, `siteDomainAliases`).
 * @returns {{kind:'tracy'}|{kind:'api'}|{kind:'docs'}|{kind:'site',label:string}|{kind:'custom',hostname:string}|{kind:'unknown'}}
 */
export function hostKind(hostHeader, config) {
  const hostname = String(hostHeader ?? '')
    .split(':')[0]
    .toLowerCase()
    .trim()
  if (!hostname) return { kind: 'unknown' }

  const tracyHost = new URL(config.origin).hostname.toLowerCase()
  if (hostname === tracyHost) return { kind: 'tracy' }
  // The public API host (`API_ORIGIN`, tasks/todo-api-public.md S2) — BEFORE the site-domain loop:
  // `api.tracy.ai` is also `api.<siteDomain>`, and with an API origin configured it is the API,
  // not the reserved site label `api`. Without one, it stays the site label it is today.
  if (isApiHost(hostname, config)) return { kind: 'api' }
  // The documentation host (`DOCS_ORIGIN`), for the same reason: `docs.tracy.ai` is also the
  // reserved site label `docs` on `tracy.ai`, and with a docs origin configured it is the docs host.
  if (isDocsHost(hostname, config)) return { kind: 'docs' }

  const domains = [config.siteDomain, ...(config.siteDomainAliases ?? [])]
    .filter(Boolean)
    .map((d) => d.toLowerCase())
  for (const domain of domains) {
    const suffix = `.${domain}`
    if (!hostname.endsWith(suffix)) continue
    const label = hostname.slice(0, -suffix.length)
    if (!label) continue
    // A preview/proposal address (`label--slug.zone`) is not carried into this migration — the
    // task's own instruction is that this SHAPE now means nothing, not that it falls through to
    // a site lookup that would silently ignore the slug.
    if (label.includes('--')) return { kind: 'unknown' }
    return { kind: 'site', label }
  }
  return { kind: 'custom', hostname }
}

/**
 * Whether a hostname that is none of this deployment's own (`hostKind` says `custom`) is an address
 * INSIDE the machine or its private network rather than a name on the public internet — the one
 * exception to "a hostname no site holds is refused" (`app.js`). These are how the deployment's own
 * parts and its operator reach this process, and none of them can be a customer's domain:
 *
 *   an IP literal            `127.0.0.1`, `10.0.0.5`, `[::1]` — a health check, a port-forward
 *   a single label           `localhost`, `tracy-web` — a container or service name
 *   a reserved private zone  `*.localhost`, `*.test` (RFC 6761: never in public DNS — a local
 *                            stand's `tracy.test`), `*.internal`, `*.local` — `host.docker.internal`,
 *                            a cloud's instance name, mDNS; no registry sells a name under them, so
 *                            none can be connected as a customer's domain either (`address.js`
 *                            refuses a name that is not under a public suffix)
 *
 * 🔒 THE LIST IS THE EXCEPTION, AND IT IS CLOSED. Everything else — any name with a public suffix —
 * is somebody's domain pointed at this deployment, and is answered by the site router: the site
 * that holds it, or the refusal page. Never Tracy's own sign-in page on a stranger's hostname.
 * @param {string} hostname - lower case, as `hostKind` returns it (an IPv6 literal arrives as `[`)
 */
export function localHostName(hostname) {
  const name = String(hostname ?? '')
  if (name === '') return false
  if (name.startsWith('[') || isIP(name) !== 0) return true
  if (!name.includes('.')) return /^[a-z0-9_-]+$/.test(name)
  return /\.(?:localhost|test|internal|local)$/.test(name)
}

/**
 * Everything a customer site hostname may ask for. `pool`/`sites`/`seats` are all optional the way
 * every other domain in `app.js` treats its dependencies: missing one turns off exactly the
 * feature that needs it, never the whole router.
 *
 * @param {object} deps
 * @param {import('pg').Pool|null} deps.pool
 * @param {object} deps.config
 * @param {object} deps.sites - the site-domain reads/writes this router needs, threaded through
 *   rather than imported directly (module graph: `bar/` is its own domain, and `sites/`,
 *   `seats/` are siblings, not shared ones) — all from `sites/store.js` and
 *   `sites/resolver.js` unless noted:
 *   `byLabel(pool, label)` (`siteByLabel`), `target(site, config)` (`siteTarget`),
 *   `appendPreviewErrors(pool, siteKey, events)`,
 *   `previewErrorsFor(pool, siteKey)`; and, optional, `templateOfTag(pool, tag)` — the template
 *   card id of the release a demo was installed from (`lib/quickstart-releases.js`), for the
 *   demo's "Create with Tracy" link. Missing, a demo's pill opens the creation workspace bare.
 *   For a customer's own domain (`sites/address.js`): `ownDomain(pool, hostname)` — the site that
 *   holds the name and the name's state, or null — and `probeAnswer(own, challenge)` — the proof
 *   `/__tracy/domain-probe` answers with, or null — and `probePage(own, { method, path })` — the
 *   signer of what this router SENT when this request is the page the probe is asking for right
 *   now, or null — with `readWhole(body)` and `bodyDigest(bytes)`, by which the whole body is read
 *   and named before it is signed. Missing, every own domain is refused.
 *   And, optional, `connectedOwnDomain(pool, siteKey)` — the connected own domain a visitor of the
 *   Tracy address is sent to with a 301, or null. Missing, the Tracy address serves every visitor.
 * @param {{accountByEmail: Function, grantFor: Function}|null} [deps.seats] - `seats/store.js`'s
 *   functions, for "does this viewer hold a seat on this site" (`../lib/role-on-site.js`'s
 *   `roleOnSite`, shared with `workspace/route.js`). NOT a gate here: the answer only decides
 *   whether this request carries a vouched `x-tracy-email` (and the seat's `x-tracy-tier`/
 *   `x-tracy-role`) on to the site.
 * @param {(siteKey: string, role: string|null) => Promise<boolean>} [deps.mayPick] - whether a live
 *   seat role (any role, viewer included) may use the comment picker (`lib/preview-ticket.js`'s `pickAllowed`, bound at
 *   `app.js`). Missing, nobody may — the picker fails closed.
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @returns {import('hono').Hono}
 */
export function barRoutes({
  ensureFramePolicy = null,
  pool,
  config,
  sites,
  seats = null,
  mayPick = async () => false,
  fetchImpl = fetch,
  now = Date.now
}) {
  const app = new Hono()
  // One per process: the comment picker's single-use ticket ledger (see `usedTicketStore`).
  const usedTickets = usedTicketStore(now)

  /** @type {Map<string, {id: string|null, at: number}>} */
  const demoTemplates = new Map()

  /** The template id of the release a demo was installed from, cached for `DEMO_TEMPLATE_TTL_MS`. */
  async function demoTemplateId(site) {
    let templateId = null
    const tag = site.quickstart_tag
    if (tag && sites.templateOfTag) {
      const cached = demoTemplates.get(tag)
      if (cached && now() - cached.at < DEMO_TEMPLATE_TTL_MS) templateId = cached.id
      else {
        try {
          templateId = await sites.templateOfTag(pool, tag)
          demoTemplates.set(tag, { id: templateId, at: now() })
        } catch (error) {
          // The pill still opens Build; it just cannot preselect the template this time.
          console.error(`[bar] could not read the template of ${tag}: ${error.message}`)
        }
      }
    }
    return templateId
  }

  /** @type {Map<string, {name: string|null, at: number}>} */
  const ownDomains = new Map()

  /** The site's connected own domain, or null, cached for `OWN_DOMAIN_TTL_MS` (null too). */
  async function connectedOwnDomainOf(siteKey) {
    const cached = ownDomains.get(siteKey)
    if (cached && now() - cached.at < OWN_DOMAIN_TTL_MS) return cached.name
    const name = (await sites.connectedOwnDomain(pool, siteKey)) ?? null
    // Bounded: one entry per site, and a sweep of the spent ones before the map grows past them.
    if (ownDomains.size >= 10_000) {
      for (const [key, entry] of ownDomains) if (now() - entry.at >= OWN_DOMAIN_TTL_MS) ownDomains.delete(key)
    }
    ownDomains.set(siteKey, { name, at: now() })
    return name
  }

  /**
   * A request whose `Host` is a domain of a customer's own (#1037).
   *
   *   refused (404, Tracy's page, the CMS never asked)
   *     a name no site holds, one let go, one still being connected, one whose site is a draft or
   *     has no address yet
   *   `/__tracy/domain-probe`
   *     Tracy's own question "does this name reach THIS site" (`sites/domain-probe.js`): answered
   *     for a name that is connected or whose route the host has installed, with a proof only this
   *     row can give. It opens nothing else of a name still being connected.
   *   everything else of a connected name on a published site
   *     the site, through the same proxy as its Tracy address — with three differences, all one
   *     rule: THIS HOSTNAME IS NOT TRACY'S. No session is read (so nobody is vouched for, and no
   *     header a client sent is believed), no Tracy cookie goes in or comes out, and a navigation
   *     to the CMS back office is sent to the Tracy address, where signing in works.
   */
  async function serveOwnDomain(c, url, hostname) {
    const refused = () => refusedHostPage({ lang: requestLanguage(c), origin: config.origin })
    if (!pool || !sites.ownDomain) return refused()
    const own = await sites.ownDomain(pool, hostname)
    if (!own?.site) return refused()
    const { site } = own
    if (url.pathname === OWN_DOMAIN_PROBE_PATH) {
      const answer = sites.probeAnswer
        ? await sites.probeAnswer(own, c.req.header(OWN_DOMAIN_PROBE_HEADER) ?? null)
        : null
      if (answer === null) return refused()
      return new Response(answer, {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
      })
    }
    // 🔒 THE PAGE THE PROBE IS ASKING FOR RIGHT NOW IS THE ONE THING A NAME STILL BEING CONNECTED
    // IS SHOWN ITS SITE FOR — and which request that is, is decided by the name's ROW, never by
    // anything the request carries (`sites/domain-probe.js` `probePage`): a GET of the exact path
    // the prober wrote there, while the window it opened is open. The probe's request is an
    // ordinary one, so whatever stands at the domain cannot answer it differently from a
    // visitor's. The answer carries a signature, made with the row's nonce, of the status and of
    // every byte of the body that is sent — so "connected" is written on a page the CMS itself
    // served through this very route, and on no other body.
    const probed = sites.probePage
      ? await sites.probePage(own, { method: c.req.method, path: `${url.pathname}${url.search}` })
      : null
    if (site.publish !== 'published') return refused()
    if (own.state !== 'active' && !probed) return refused()
    let canonical
    try {
      canonical = new URL(new URL(site.address).origin)
    } catch {
      // No address to speak to the CMS as: nothing to serve on another name either.
      return refused()
    }
    const viewerProto = c.req.header('x-forwarded-proto')?.split(',')[0].trim() === 'http' ? 'http' : 'https'
    // The back office lives at the Tracy address; a method with a body is the site's own to answer.
    if ((c.req.method === 'GET' || c.req.method === 'HEAD') && isAdminPath(site.platform, url.pathname)) {
      return new Response(null, {
        status: 302,
        headers: {
          location: new URL(`${url.pathname}${url.search}`, canonical).href,
          'cache-control': 'no-store'
        }
      })
    }
    if (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) {
      // Tracy's own doors about the copy, as nobody: no session is read on this hostname.
      return serveTracyPage(c, { pool, sites }, url, site, null, null)
    }
    const target = sites.target(site, config)
    target.pathname = url.pathname
    // An address of the site inside the query (`?redirect_to=`) is told in the CMS's own terms.
    target.search = originProjection(new URL(`${viewerProto}://${url.host}`), canonical).search(url.search)
    const answer = await proxySite(c.req.raw, target, {
      email: null,
      role: null,
      sameHost: site.host === config.hostName,
      viewerHost: url.host,
      viewerProto,
      publish: site.publish,
      // The customer's own domain carries the customer's own page: no Tracy pill, as it never had
      // one while the ingress sent the name straight to the site.
      variant: 'none',
      badgeUrl: config.badgeUrl,
      canonical,
      access: sites.accessKey?.(site.label) ?? null,
      fetchImpl
    })
    if (!probed) return answer
    // 🔒 THE PROOF IS SIGNED OVER THE WHOLE BODY THIS RESPONSE SENDS, AND ONLY ONCE ALL OF IT IS IN
    // HAND. The body is read to its end here — the very bytes that go out, after projection — and
    // its digest is signed with the status, the content type and the `Location`. A body that fails,
    // stalls or is past the ceiling is answered WITHOUT a proof: nothing that was not read whole is
    // vouched for. `no-transform`: an intermediary that rewrote the page (minifying it, obfuscating
    // an address in it) would be sending other bytes than the ones signed.
    const read = sites.readWhole ? await sites.readWhole(answer.body) : { error: 'PAGE_INCOMPLETE' }
    if (read.error) {
      console.error(`[bar] no page proof for ${hostname}${url.pathname}: ${read.error}`)
      return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } })
    }
    const headers = new Headers(answer.headers)
    headers.delete('content-length')
    headers.set(
      OWN_DOMAIN_PROBE_PAGE_HEADER,
      await probed({
        status: answer.status,
        contentType: headers.get('content-type'),
        location: headers.get('location'),
        digest: sites.bodyDigest(read.bytes)
      })
    )
    headers.set('cache-control', 'no-store, no-transform')
    // A status that carries no body (204, 205, 304) is given none.
    const body = read.bytes.length === 0 ? null : read.bytes
    return new Response(body, { status: answer.status, statusText: answer.statusText, headers })
  }

  app.all('/*', async (c) => {
    const url = new URL(c.req.url)
    const kind = hostKind(c.req.header('host') ?? url.host, config)

    if (kind.kind === 'tracy') {
      // This router is mounted only for a non-tracy Host (`app.js`'s gate) — reaching here
      // directly (a test calling `barRoutes` on its own) has nothing to proxy to.
      return refusedHostPage({ lang: requestLanguage(c), origin: config.origin })
    }
    // 🔒 A CUSTOMER'S OWN DOMAIN IS ITS OWN BRANCH, AND IT IS THE STRICT ONE (#1037). Since the
    // host's ingress sends such a name HERE instead of straight to the site's port, this is the only
    // gate the name passes — so the row decides, and nothing else: no lookup by label, no fallback
    // to another site, no reading of the managed-name book for a name that is not managed.
    if (kind.kind === 'custom') return serveOwnDomain(c, url, kind.hostname)
    const publicHost = url.hostname.toLowerCase()
    const probe = c.req.header('x-tracy-address-probe') ?? null
    const namedSite = pool && sites.byName ? await sites.byName(pool, publicHost, probe) : null
    if (namedSite && probe && url.pathname === '/__tracy/address-probe') {
      c.header('cache-control', 'no-store')
      return c.text(probe)
    }
    if (kind.kind !== 'site' && !namedSite) {
      // 'unknown': a `--` label, or a hostname this deployment's own domains never claimed.
      return refusedHostPage({ lang: requestLanguage(c), origin: config.origin })
    }
    if (!pool) return c.json({ code: 'SITE_BOOK_UNAVAILABLE' }, 501)

    const site = namedSite ?? (await sites.byLabel(pool, kind.label))
    if (!site) return unknownSitePage(url.hostname, requestLanguage(c), config.origin)
    // A demo has no `site_name` row: it is reached by its label under the zone's wildcard. Before it
    // is marked live, `lib/demo-sites.js` asks this path on its public name and requires the token
    // back, so a stale DNS record or tunnel rule that routes the name elsewhere is caught
    // (`ADDRESS_SHADOWED`) instead of reported live.
    if (site.demo && probe && url.pathname === '/__tracy/address-probe') {
      c.header('cache-control', 'no-store')
      return c.text(probe)
    }

    // The bar's own crawler policy — only while the copy is a draft. A published site's own
    // robots.txt speaks for the live site, so this proxies through the normal pipeline below
    // exactly like any other GET (no special case needed for that branch).
    if (url.pathname === '/robots.txt' && site.publish !== 'published') {
      return new Response(ROBOTS, {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
      })
    }

    const cookieHeader = c.req.header('cookie') ?? null
    const session = await sessionWithExpiry(cookieHeader, config.sessionSecret)
    const email = session?.email ?? null
    const role = await roleOnSite(pool, seats, email, site.site_key)

    if (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) {
      return serveTracyPage(c, { pool, sites }, url, site, email, role)
    }

    // 🔒 A PUBLISHED SITE WITH A CONNECTED OWN DOMAIN IS SHOWN TO THE PUBLIC THERE, NOT HERE. Measured
    // on production (15/10/2026): such a site answered on both names with the same page, the Tracy
    // address with a 200 even for a crawler, its own `rel=canonical` and its own robots.txt — two
    // copies, each claiming to be the original. So a visitor's GET or HEAD is sent, path and query
    // kept, to the own domain with a 301. Not sent: a seat holder (Tracy's app, the admin, the
    // comment picker and previews run at this address), the back office and the CMS sign-in, which
    // only work here (`own-domain.js` header), a request that carries its own credentials, a method
    // with a body, the Design system preview frame (below, always `noindex`), and Tracy's own reads of
    // the page (`lib/own-read.js`: the mark skips this 301 and nothing else; the read is served as
    // nobody). `no-store`: a browser keeps a 301 without one indefinitely, and even a bounded age would
    // keep sending a person who met it signed out away after they sign in or gain a seat, or after the
    // domain is removed, without asking the server; search engines read the status, not the lifetime.
    // The own domain itself is cached per process for `OWN_DOMAIN_TTL_MS`.
    if (
      role === null &&
      site.publish === 'published' &&
      (c.req.method === 'GET' || c.req.method === 'HEAD') &&
      sites.connectedOwnDomain &&
      !staysOnTracyAddress(site.platform, url, c.req.raw.headers) &&
      !isDsPreviewFrame(c.req.method, url, c.req.header('sec-fetch-dest')) &&
      !isOwnRead(config.sessionSecret, url.hostname.toLowerCase(), c.req.header(OWN_READ_HEADER), now())
    ) {
      const own = await connectedOwnDomainOf(site.site_key)
      if (own) {
        return new Response(null, {
          status: 301,
          headers: { location: `https://${own}${url.pathname}${url.search}`, 'cache-control': 'no-store' }
        })
      }
    }

    // 🔒 NO GATE STANDS HERE, AND THAT IS THE DECISION, NOT AN OVERSIGHT (16/09/2026).
    // This router used to refuse two kinds of request: a stranger's GET on a draft copy (403
    // "This copy is private") and anyone without a seat reaching `/wp-admin` or `/administrator`
    // (302 onto Tracy's own sign-in). Both are gone. The bar proxies the copy, puts the badge on
    // it, and vouches for who is watching — it does not decide who may look.
    //
    // WHY IT HAD TO GO, in two measurements. The gate answers a request that carries no session
    // with 403, which is exactly the shape every machine takes: the EmDash build's own `check`
    // stage asks the site as nobody and sat out its whole budget against that 403 (16/09, site
    // `site-d6ggmf`). And the same bar is about to sit in front of a public JoomlArt demo — a
    // page with no seat book behind it, where a copy called "private" would mean nothing.
    //
    // WHAT THIS COSTS, said plainly: a draft copy is readable by anyone who knows its hostname
    // (`ROBOTS` above still asks crawlers to stay out, which is a request, not a lock), and a
    // site's CMS backend is reachable from the internet behind the CMS's own login. `guest_open`
    // is now a column nobody reads.
    const variant = badgeVariantFor(site)
    // A demo's badge opens ITS OWN template on the Design inspiration page, so the release's card
    // id is read the same way the create pill read it — and a release with no card simply sends
    // people to the gallery rather than to a dialog on nothing.
    const badgeTemplate = variant === 'advert' ? await demoTemplateId(site) : null
    const viewerProto =
      c.req.header('x-forwarded-proto')?.split(',')[0].trim() ||
      new URL(config.origin).protocol.replace(':', '')
    // The Design system preview popup's live frame (`ds-preview.js`): the page as a visitor sees it,
    // scripts and all, wearing the one system the door's ticket names, nothing written. Asked as nobody
    // (no seat header: a signed-in CMS would draw its admin bar into the frame), and only for a frame —
    // a top-level visit with the parameter is the page as it is, the parameter dropped, and so is a frame
    // whose ticket is not one this server signed for this site (`lib/ds-preview-ticket.js`). Every answer
    // of this branch is `noindex, nofollow`, whatever the site's publish state: an address with the
    // parameter is never a page of its own to index.
    const dsAsk = c.req.method === 'GET' ? splitDsPreview(url.search) : { search: url.search, id: null }
    if (dsAsk.id !== null) {
      const dest = c.req.header('sec-fetch-dest')
      const target = sites.target(site, config)
      target.pathname = url.pathname
      target.search = dsAsk.search
      const claims =
        (dest === undefined || dest === 'iframe') && sites.dsLivePage
          ? readDsPreviewTicket(config.sessionSecret, dsAsk.id, site.site_key, now())
          : null
      if (claims && ensureFramePolicy && !(await ensureFramePolicy(site))) {
        const lang = requestLanguage(c.req.raw)
        return messagePage(
          translate(lang, 'bar.siteUnavailableTitle'),
          translate(lang, 'bar.siteUnavailableBody'),
          503,
          lang
        )
      }
      const inner = new URL(target.origin)
      const pub = new URL(`${viewerProto}://${url.host}`)
      const answer = await proxySite(c.req.raw, target, {
        email: null,
        role: null,
        sameHost: site.host === config.hostName,
        viewerHost: url.host,
        viewerProto,
        publish: site.publish,
        variant: 'none',
        badgeOrigin: config.origin,
        label: site.label,
        transformHtml: claims
          ? (html) =>
              sites.dsLivePage({
                html,
                claims,
                ticket: /** @type {string} */ (dsAsk.id),
                site,
                inner,
                pub,
                parentOrigin: String(config.origin ?? '').replace(/\/+$/, ''),
                fetchImpl
              })
          : null,
        fetchImpl
      })
      const headers = new Headers(answer.headers)
      headers.set('x-robots-tag', 'noindex, nofollow')
      // A same-site redirect keeps the ticket, so the page it leads to wears the system too.
      if (claims && answer.status >= 300 && answer.status < 400) {
        const kept = locationKeepingTicket(headers.get('location'), {
          asked: `${viewerProto}://${url.host}${url.pathname}`,
          ticket: /** @type {string} */ (dsAsk.id)
        })
        if (kept) headers.set('location', kept)
      }
      return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
    }
    // The comment picker (plan §S). With `TRACY_COMMENT_PICKER` off this returns `url.search`
    // unchanged and no verdict; on, the ticket is gone from `search` before the site is asked.
    const preview = await previewFor({
      request: c.req.raw,
      url,
      site,
      email,
      sessionExp: session?.exp ?? null,
      role,
      config,
      viewerProto,
      viewerHost: url.host,
      mayPick,
      usedTickets,
      now: now()
    })
    if (preview.redirect) return preview.redirect
    // Reconcile before requesting the upstream document, so a stale CSP never reaches this frame.
    if (preview.pick && ensureFramePolicy && !(await ensureFramePolicy(site))) {
      const lang = requestLanguage(c.req.raw)
      return messagePage(
        translate(lang, 'bar.siteUnavailableTitle'),
        translate(lang, 'bar.siteUnavailableBody'),
        503,
        lang
      )
    }
    const target = sites.target(site, config)
    target.pathname = url.pathname
    target.search = preview.search
    return proxySite(c.req.raw, target, {
      // `x-tracy-email` only when there IS a seat — never merely "someone is signed in
      // somewhere on tracy.ai" (the exact bug `workers/fleet-bar/src/index.js`'s own comment on
      // this gate warns about: the session cookie's domain covers every site at once).
      email: role ? email : null,
      // The same live role decides the CMS tier the site's Access plugin signs in on (#339).
      role,
      sameHost: site.host === config.hostName,
      viewerHost: url.host,
      // The scheme the BROWSER used, which this process cannot read off its own socket: TLS ends
      // at Cloudflare and the tunnel hands us plain HTTP, so `url.protocol` is `http:` on a site
      // served over https. `x-forwarded-proto` is what the edge in front of us says, and
      // `config.origin` is what this deployment claims to be when nothing is in front at all.
      viewerProto,
      publish: site.publish,
      variant,
      badgeUrl: config.badgeUrl,
      badgeScriptUrl: `${String(config.origin ?? '').replace(/\/+$/, '')}/tracy-badge.js`,
      badgeTemplate,
      badgeOrigin: config.origin,
      label: site.label,
      preview: preview.pick,
      report: preview.report,
      access: sites.accessKey?.(site.label) ?? null,
      fetchImpl
    })
  })

  return app
}

/**
 * `/__tracy/*` — the door tracy-web still answers on a customer's own hostname: `/__tracy/errors`,
 * Tracy's own data about the copy, not the copy itself. It guards its OWN data: `GET` answers only
 * a live seat on this site. Every other path under `/__tracy/` is Tracy's 404 page, never the
 * customer's copy.
 *
 * 🔒 `/__tracy/build` IS RETIRED (11/10/2026, J15.2): it promised what the copy was built from,
 * but nothing had written a manifest since the Worker's fleet hook went away, so every site
 * answered `{"built":null}`. The signed `POST`, `SITE_BUILD_SECRET` and the store's two functions
 * went with it. Table `site_build` is left in place, empty.
 *
 * 🔒 THE SIGN-IN DOORS ARE GONE (16/09/2026): `/__tracy/login` (OTP), `/__tracy/signin/:provider`
 * (OAuth) and `/__tracy/team` (roster + the guest switch) were removed with the gates they served.
 * Signing in happens on Tracy's own hostname and nowhere else, and inviting people had already
 * moved to the workspace (ADR 0046). `git log -- apps/tracy-web/src/bar/route.js` keeps them.
 */
async function serveTracyPage(c, { pool, sites }, url, site, email, role) {
  if (url.pathname === `${PREFIX}/errors`) return servePreviewErrors(c, { pool, sites }, site, email, role)
  const lang = requestLanguage(c)
  return messagePage(translate(lang, 'bar.notFoundTitle'), translate(lang, 'bar.notFoundBody'), 404, lang)
}

/**
 * `/__tracy/errors` — what broke inside this working copy (ADR 0089 §3), ported from
 * `servePreviewErrors` (`workers/fleet-bar/src/index.js`). `POST` is the page itself reporting,
 * no signature (a page cannot hold one) — bounded instead: body size, batch size, message
 * length, and a ring `sites/store.js`'s `appendPreviewErrors` prunes on every write. `GET` needs
 * a live seat ON THIS SITE (any role, Editor included — ADR 0089 §7): the line is "somebody on
 * this site's book", not a role gate. `role` is the one `roleOnSite` answer `barRoutes` already
 * read for `x-tracy-email`, so the two can never disagree about who holds a seat. A session alone
 * is not enough: the cookie's domain covers every site at once, so "signed in" means "any Tracy
 * account", and until 28/09 that read one customer's page errors (URLs, messages) to all of them.
 * No seat answers 403 with a fixed body — the same whether the ring holds errors or is empty.
 */
async function servePreviewErrors(c, { pool, sites }, site, email, role) {
  if (c.req.method === 'GET') {
    if (!email) return c.text('sign in first', 401)
    if (!role) return c.text('no seat on this site', 403)
    const events = pool ? await sites.previewErrorsFor(pool, site.site_key) : []
    return c.json({ events })
  }
  if (c.req.method !== 'POST') return c.text('Only GET and POST.', 405)
  const body = await c.req.text()
  if (body.length > PREVIEW_ERRORS_MAX_BODY) return c.text('too large', 413)
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return c.text('not json', 400)
  }
  const fresh = sanitizePreviewErrors(payload, new Date().toISOString())
  // 204 either way — a report is observation, never something a customer's page should see fail.
  if (fresh.length === 0 || !pool) return c.body(null, 204)
  await sites.appendPreviewErrors(pool, site.site_key, fresh)
  return c.body(null, 204)
}

/** Only what the envelope declares (ADR 0089 §2) survives; ported verbatim from
 * `sanitizePreviewErrors` (`workers/fleet-bar/src/index.js`). */
export function sanitizePreviewErrors(payload, now) {
  const events = Array.isArray(payload?.events) ? payload.events : []
  const out = []
  for (const event of events) {
    if (out.length >= 50) break
    const message =
      typeof event?.message === 'string' ? event.message.slice(0, PREVIEW_ERRORS_MAX_MESSAGE).trim() : ''
    if (!message) continue
    const level = event?.level === 'warn' || event?.level === 'fatal' ? event.level : 'error'
    out.push({
      tier: 'browser',
      source: typeof event?.source === 'string' ? event.source.slice(0, 300) : '/',
      message,
      level,
      // Stamped HERE, never by the page: a clock the reporter controls is a clock that can
      // backdate a failure out of an Apply's window.
      at: now
    })
  }
  return out
}
