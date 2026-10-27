/**
 * The Add site form's design system preview (12/10/2026): the template the customer picked,
 * wearing one design system, before the site exists.
 *
 * - GET /api/design-system/preview?quickstart=<tag>&platform=<cms>&id=<library id>   any signed-in
 *   seat (like the library door): the home page of the quickstart's live demo, as the demo serves it
 *   now, with the exact bytes an apply would write for that system (`lib/ds-slot.js` `emitFor`: Joomla's
 *   `<link>` + `<style id="tracy-ds-slot">`, EmDash's stylesheet as its layout inlines it) and a
 *   `<base href>` at the demo's public address so its pictures and stylesheets load. WordPress never
 *   serves the variation an apply writes: it prints it, merged with the theme's theme.json, into its
 *   global styles block, and the page gets that block as WordPress would print it
 *   (`design-system-preview-wordpress.js`). `text/html`; the popup puts it in an
 *   `<iframe sandbox srcDoc>`, like the Design inspiration preview.
 *
 * - …&path=<same-site path>   another page of the same demo, asked by a link of a served preview: every
 *   same-site link of a served page points back here with its own `path` (12/10/2026, option B),
 *   so browsing inside the popup's frame keeps wearing the system; a link elsewhere opens a new tab.
 *   `path` is a path only (`design-system-preview-links.js` `previewPathOf`); the host is always the
 *   demo's. With `path`, every refusal is a small `text/html` page with the same status (the frame shows
 *   it), and a page the demo has not got is `404`/`409` with `reason` `PAGE_NOT_FOUND`, `NOT_A_PAGE`
 *   or `LEAVES_SITE`.
 *
 * - …&live=1   the popup's LIVE frame (18/10/2026, as the running site's door since 17/10/2026): after the same gates,
 *   `{ live: true, src, mode, modes }`, `src` the demo's home at its own address with a signed ticket
 *   (`lib/ds-preview-ticket.js`, for the demo's site row, the system, the contract and template judged here). The
 *   site proxy lays the very bytes an apply would write into the page it serves (`design-system-live-page.js`) and the
 *   popup frames it with the page's scripts running, so a carousel, a sticky header or a lazy picture comes out as Try
 *   on shows it; the static page above left those unbuilt (PREVIEW-PARITY static/door, 18/10/2026). Nothing is read
 *   here. Not wired (no secret) or a demo row without its key: the static page, as before.
 *
 * 🔒 NOTHING IS WRITTEN TO THE DEMO. The page is read over the network and changed in this process only.
 *
 * 🔒 ONLY THE DEMO THE SERVER RESOLVED IS READ. The request names a quickstart tag, never an address:
 * the demo is the `site` row `liveDemoOf` finds for that tag, read at the address `siteReadOrigin` gives
 * it (its web container on this host, its public address on another), told its public address the way the site proxy tells it. A
 * redirect is followed only to the same demo (its public address, or that container), and always read
 * back on the container.
 *
 * 🔒 THE ANSWER IS SANDBOXED ON ITS OWN. It is a third party's page served from Tracy's origin, so it
 * carries `Content-Security-Policy: sandbox`: opened as a page, it runs as an opaque origin with no
 * script, no cookie and no form, exactly like the popup's frame.
 *
 * Not available (`409 DS_PREVIEW_UNAVAILABLE`, with `reason`), and the popup says so, while picking
 * still works:
 *   - `NO_DEMO`: the quickstart has no live demo on this server;
 *   - `NO_SLOT`: the demo's release cannot wear a system (its contract, judged like a new site's);
 *   - `DEMO_UNREADABLE`: the demo did not answer with a page in time.
 *
 * A template the customer lock closes (`lib/design-system-customer-lock.js`) answers a customer `403
 * DS_TEMPLATE_LOCKED`; staff and this server's own door probe get the page.
 *
 * Kept in memory per (quickstart, demo deploy: release, its checksum and published port; system; path), `PREVIEW_KEEP_MS`, at most `PREVIEW_KEPT_MAX`
 * pages (the oldest goes first); one read per key at a time.
 *
 * Capped per signed-in account (`429 RATE_LIMITED` + `Retry-After`), one budget with the running
 * site's preview door: {@link previewRateLimiter}.
 */

import { DS_TEMPLATE_LOCKED } from '../lib/design-system-customer-lock.js'
import { DS_PREVIEW_PARAM, mintDsPreviewTicket } from '../lib/ds-preview-ticket.js'
import { DS_PREVIEW_PER_MINUTE_PER_ACCOUNT } from '../lib/policy.js'
import { previewDemoGap } from '../lib/preview-demo.js'
import { memoryRateLimiter, overLimitDetail } from '../lib/rate.js'
import { assetLinkOf } from './design-system-preview-assets.js'
import { doorLinkOf, framedRefusal, PREVIEW_CSP, previewPathOf } from './design-system-preview-links.js'
import { slotOf, themeFoldersFor, wornPageOf } from './design-system-preview-page.js'

/** How long a rendered preview is kept: a demo changes only when it is redeployed. */
export const PREVIEW_KEEP_MS = 10 * 60_000
/** Previews kept at most (a page is ~60 KB to 1.5 MB). */
export const PREVIEW_KEPT_MAX = 48

const PLATFORMS = new Set(['emdash', 'wordpress', 'joomla'])

/**
 * A short memory of built previews: each key built once and kept `keepMs` (at most `max` pages, the
 * oldest goes first); requests that come while it is built wait for the same build. Only an answer
 * with `html` is kept. `forget(prefix)` drops every key starting with it, builds under way included:
 * a build that started before the forget still answers its waiters but is never kept.
 * @param {{ keepMs: number, max: number, now?: () => number }} p
 */
export function previewShelf({ keepMs, max, now = Date.now }) {
  /** @type {Map<string, { at: number, html: string, modes: boolean }>} */
  const kept = new Map()
  /** @type {Map<string, { n: number, read: Promise<any> }>} */
  const reading = new Map()
  /** @type {Map<string, number>} prefix → how many builds had started when it was last forgotten */
  const forgotten = new Map()
  let started = 0
  const forgottenSince = (/** @type {string} */ key, /** @type {number} */ n) => {
    for (const [prefix, at] of forgotten) if (key.startsWith(prefix) && at > n) return true
    return false
  }
  return {
    /**
     * @param {string} key
     * @param {() => Promise<any>} build
     * @returns {Promise<any>} the kept page as `{ html, modes }` (`modes`: the template has two, the door's header), or
     *   what `build` answered
     */
    async take(key, build) {
      const hit = kept.get(key)
      if (hit && now() - hit.at < keepMs)
        return hit.modes ? { html: hit.html, modes: true } : { html: hit.html }
      let job = reading.get(key)
      if (!job) {
        job = { n: started++, read: build() }
        reading.set(key, job)
      }
      try {
        const answer = await job.read
        if (answer && typeof answer.html === 'string' && !forgottenSince(key, job.n)) {
          kept.delete(key)
          kept.set(key, { at: now(), html: answer.html, modes: answer.modes === true })
          while (kept.size > max) kept.delete(/** @type {string} */ (kept.keys().next().value))
        }
        return answer
      } finally {
        if (reading.get(key) === job) reading.delete(key)
      }
    },
    /** @param {string} prefix */
    forget(prefix) {
      forgotten.set(prefix, started)
      for (const k of kept.keys()) if (k.startsWith(prefix)) kept.delete(k)
      for (const k of reading.keys()) if (k.startsWith(prefix)) reading.delete(k)
    }
  }
}

/**
 * A built preview as both doors answer it: a third party's page served from Tracy's origin, so it is
 * sandboxed on its own (`PREVIEW_CSP`: no script, no form; a link may open a new tab) and never sniffed.
 * @param {any} c
 * @param {string} html
 * @param {number} [maxAge] seconds the browser may keep it
 */
export function sendPreview(c, html, maxAge = 60, extra = {}) {
  return c.body(html, 200, {
    ...extra,
    'content-type': 'text/html; charset=utf-8',
    // `no-transform`: the answer leaves through Cloudflare, whose Email Address Obfuscation rewrote the
    // addresses the door had put back (`cloudflare-email.js`); the frame runs no script to undo that.
    'cache-control': `private, max-age=${maxAge}, no-transform`,
    'content-security-policy': PREVIEW_CSP,
    'x-content-type-options': 'nosniff'
  })
}

/**
 * The header a preview page of a two-mode template is sent with (`both`): its contract wears both sides of the
 * template's light/dark switch, so the popup offers Light | Dark (the framed page runs no script, its own toggle
 * cannot be pressed). The running site's popup learns the same from the design-system read (`modes`).
 */
export const MODES_HEADER = 'x-tracy-ds-modes'

/** The preview window: one minute. */
const PREVIEW_RATE_WINDOW_MS = 60_000

/**
 * The cap on design system previews: {@link DS_PREVIEW_PER_MINUTE_PER_ACCOUNT} a minute per signed-in
 * account, ONE budget for both preview doors (this one and `design-system-site-reads.js`'s), so a popup cannot
 * be a way around the other. Every ask is counted, a kept page and a refused one alike: the cap is
 * on asking, and counting only the expensive ones would let a caller learn which those are.
 *
 * With a database: the fixed-window `rate_bucket` every other door counts in (`lib/rate.js`
 * `overLimitDetail`, bucket `ds-preview:<email>`), shared by every tracy-web process, and a read it
 * cannot make refuses (fail closed, `overLimitOrClosed`'s rule). Without one (a laptop on the memory
 * identity store, and tests): this process's own count (`memoryRateLimiter`); with several processes
 * each would allow its own thirty, which is why production always passes `pool`.
 *
 * Fixed windows, not a sliding one: the shape every limiter here has. At a window's edge an account
 * can ask up to twice the cap within a few seconds, at most sixty a minute.
 *
 * @param {{ pool?: import('pg').Pool | null, now?: () => number }} [deps]
 * @returns {(email: string) => Promise<{ over: boolean, retryAfterS: number }>}
 */
export function previewRateLimiter({ pool = null, now = Date.now } = {}) {
  const memory = pool ? null : memoryRateLimiter()
  return async (email) => {
    const bucket = `ds-preview:${String(email).trim().toLowerCase()}`
    const at = now()
    if (pool)
      return overLimitDetail(
        pool,
        bucket,
        DS_PREVIEW_PER_MINUTE_PER_ACCOUNT,
        at,
        PREVIEW_RATE_WINDOW_MS
      ).catch(() => ({ over: true, retryAfterS: 60 }))
    const over = /** @type {any} */ (memory).overLimit(
      bucket,
      DS_PREVIEW_PER_MINUTE_PER_ACCOUNT,
      at,
      PREVIEW_RATE_WINDOW_MS
    )
    const next = (Math.floor(at / PREVIEW_RATE_WINDOW_MS) + 1) * PREVIEW_RATE_WINDOW_MS
    return { over, retryAfterS: Math.max(1, Math.ceil((next - at) / 1000)) }
  }
}

/** The refusal both preview doors send over the cap: `429 RATE_LIMITED`, `Retry-After`, never cached. */
export function previewRateLimited(c, retryAfterS) {
  c.header('Cache-Control', 'private, no-store')
  c.header('Retry-After', String(retryAfterS))
  return c.json({ code: 'RATE_LIMITED' }, 429)
}

/**
 * @param {import('hono').Hono} app
 * @param {{
 *   signedIn?: (c: any) => Promise<{ error?: Response, email?: string, probe?: boolean }>,
 *   previewRate?: (email: string) => Promise<{ over: boolean, retryAfterS: number }>,
 *   customerLock?: { blocked: (email: string | null | undefined, templateKey: string | null | undefined) => Promise<boolean> },
 *   demoOf: (tag: string) => Promise<{ host: string, label: string, platform: string | null,
 *     address: string | null, quickstart_version: string | null, site_key?: string } | null>,
 *   innerOf: (demo: { host: string, label: string, platform: string, address: string | null }) => URL,
 *   fetchImpl: typeof fetch,
 *   ds: {
 *     refero: () => Promise<{ id: string, ok: boolean }[]>,
 *     quickstartContractOf: (q: { platform: string, tag: string, version: string | null }) =>
 *       { contract: string, template?: string } | { reason: string },
 *     emitFor: (q: any) => Promise<any>,
 *     fontFaces?: (href: string | null) => Promise<any[]>,
 *     modesOf?: (contract: string) => boolean
 *   },
 *   now?: () => number,
 *   waitMs?: number,
 *   origin?: string | null,
 *   secret?: string,
 *   liveServed?: (demo: { host?: string }) => boolean
 * }} deps - `origin`: Tracy's own origin (`TRACY_ORIGIN`), where the links of a served page point back
 *   at this door (`doorLinkOf`); none: the request's own. `ds.fontFaces`: Google's @font-face rules a WordPress variation carries, as an apply
 *   resolves them (`googleFontFaces`). `ds.refero`: the library the doors offer (Refero only, 12/10/2026); any other id, an
 *   OpenDesign one (`od:<id>`) included, is `DS_UNKNOWN`. `demoOf`: the live demo of a tag (`liveDemoOf`); `innerOf`: where this process reaches its
 *   web container (`siteTarget`); its `platform` decides the emitter and the read path (the
 *   request's `platform` is a hint only). `signedIn`: none means every ask is 401 (fails closed).
 *   `previewRate`: the per-account cap ({@link previewRateLimiter}), the SAME instance the running site's
 *   door gets; none: this mount's own in-memory count. `waitMs`: tests only. `ds.modesOf`: whether a slot
 *   contract wears both sides of the template's light/dark switch (`lib/ds-slot.js`); such a page is sent with
 *   {@link MODES_HEADER} `both`, so the Add site popup offers Light | Dark as the running site's popup does. None: never.
 *   `secret`: what signs the live frame's ticket (`config.sessionSecret`, read back by the site proxy); none: `live=1`
 *   gets the static page. `liveServed`: whether this server's site proxy answers the demo's address (its host is this
 *   one); false: `live=1` gets the static page. None: always.
 */
export function mountDesignSystemPreview(app, deps) {
  const refuse = (c, status, body) => {
    c.header('Cache-Control', 'private, no-store')
    return c.json(body, status)
  }
  const {
    // Fail closed: a caller that forgets the check gets every ask refused, never an open door.
    signedIn = async (c) => ({ error: refuse(c, 401, { code: 'NOT_SIGNED_IN' }) }),
    demoOf,
    innerOf,
    fetchImpl,
    ds,
    liveServed = () => true,
    now = Date.now
  } = deps
  const previewRate = deps.previewRate ?? previewRateLimiter({ now })
  const shelf = previewShelf({ keepMs: PREVIEW_KEEP_MS, max: PREVIEW_KEPT_MAX, now })

  /** The page for one key: built once, kept, shared by the requests that wait for it. */
  async function build({ tag, platform, id, demo, path, doorOf, assetOf }) {
    const fit = ds.quickstartContractOf({ platform, tag, version: demo.quickstart_version ?? null })
    if (!('contract' in fit)) return { reason: 'NO_SLOT' }
    const out = await ds.emitFor({ platform, contract: fit.contract, id, fontFaces: ds.fontFaces })
    const slot = out.ok ? slotOf(out) : null
    if (slot === null) return { reason: 'NO_SLOT' }
    let pub
    try {
      pub = new URL(String(demo.address))
    } catch {
      return { reason: 'NO_DEMO' }
    }
    if (pub.protocol !== 'http:' && pub.protocol !== 'https:') return { reason: 'NO_DEMO' }
    // The address goes with it: a demo on another host is read at its public address (`siteReadOrigin`).
    const inner = innerOf({ host: demo.host, label: demo.label, platform, address: demo.address })
    const page = await wornPageOf({
      platform,
      ...slot,
      themes: themeFoldersFor(fit.template),
      inner,
      pub,
      fetchImpl,
      waitMs: deps.waitMs,
      path,
      doorOf,
      assetOf
    })
    if ('miss' in page) return { reason: 'DEMO_UNREADABLE', miss: page.miss }
    return { ...page, modes: ds.modesOf ? ds.modesOf(fit.contract) === true : false }
  }

  /**
   * The live frame's answer (`live=1`): `{ live: true, src, mode, modes }`, `src` the demo's home at its own address
   * with a ticket signed for what this door judged; `mode` the side the system opens on (the mode line in its bytes).
   */
  async function liveFrame({ c, tag, platform, id, demo }) {
    const unavailable = (/** @type {string} */ reason) =>
      refuse(c, 409, { code: 'DS_PREVIEW_UNAVAILABLE', reason })
    const fit = ds.quickstartContractOf({ platform, tag, version: demo.quickstart_version ?? null })
    if (!('contract' in fit)) return unavailable('NO_SLOT')
    let slot = null
    try {
      const out = await ds.emitFor({ platform, contract: fit.contract, id, fontFaces: ds.fontFaces })
      slot = out.ok ? slotOf(out) : null
    } catch {
      slot = null
    }
    if (slot === null) return unavailable('NO_SLOT')
    let pub
    try {
      pub = new URL(String(demo.address))
    } catch {
      return unavailable('NO_DEMO')
    }
    if (pub.protocol !== 'http:' && pub.protocol !== 'https:') return unavailable('NO_DEMO')
    const mode =
      /\/\*\s*mode:\s*(dark|light)\s*\*\//.exec(`${slot.bytes}${slot.globalCss ?? ''}`)?.[1] ?? null
    const ticket = mintDsPreviewTicket(
      /** @type {string} */ (deps.secret),
      { site: String(demo.site_key), id, contract: String(fit.contract), template: fit.template ?? '' },
      now()
    )
    const src = new URL('/', pub)
    src.searchParams.set(DS_PREVIEW_PARAM, ticket)
    c.header('Cache-Control', 'private, no-store')
    return c.json({
      live: true,
      src: src.href,
      mode,
      modes: ds.modesOf ? ds.modesOf(fit.contract) === true : false
    })
  }

  app.get('/api/design-system/preview', async (c) => {
    // `path`: a page of the demo other than its home, asked by a link of a served preview inside the
    // popup's frame (`design-system-preview-links.js`). Every refusal of such an ask is a small page in
    // the frame, with the same status; an ask without it answers JSON, as the popup reads it.
    const rawPath = c.req.query('path')
    const inFrame = rawPath !== undefined
    const doorOf = doorLinkOf(c.req.url, { origin: deps.origin, keep: ['quickstart', 'platform', 'id'] })
    const assetOf = assetLinkOf(c.req.url, { origin: deps.origin })
    const say = (status, body, why) =>
      inFrame
        ? framedRefusal(c, status, {
            why,
            home: why === 'INVALID_PATH' || status === 404 ? doorOf('/') : null
          })
        : refuse(c, status, body)
    const who = await signedIn(c)
    if (who.error) return inFrame ? framedRefusal(c, who.error.status, { why: 'NOT_SIGNED_IN' }) : who.error
    // Counted before anything is read or checked: every ask of a signed-in account spends one, a page
    // opened by a link inside the preview as much as the popup's first.
    const rate = await previewRate(String(who.email ?? ''))
    if (rate.over)
      return inFrame
        ? framedRefusal(c, 429, { why: 'RATE_LIMITED', retryAfterS: rate.retryAfterS })
        : previewRateLimited(c, rate.retryAfterS)
    const tag = String(c.req.query('quickstart') ?? '')
    // `platform` is the browser's hint only: a malformed one is refused, but which emitter and
    // which read path are used is the demo's own platform (below), never this value.
    const hint = c.req.query('platform')
    const raw = String(c.req.query('id') ?? '')
    if (!tag || tag.length > 200 || (hint !== undefined && !PLATFORMS.has(hint)) || !raw || raw.length > 120)
      return say(400, { code: 'INVALID_REQUEST' }, 'INVALID_REQUEST')
    // A path of the demo only: never a host, a scheme or an escape (`previewPathOf`).
    const path = inFrame ? previewPathOf(rawPath) : '/'
    if (path === null) return say(400, { code: 'INVALID_REQUEST', reason: 'PATH' }, 'INVALID_PATH')
    // The library id as the library door spells it (`refero:<uuid>`): only an offered system.
    const id = raw
    const entry = (await ds.refero()).find((s) => s.id === id)
    if (!entry) return say(400, { code: 'DS_UNKNOWN' }, 'DS_UNKNOWN')
    if (!entry.ok) return say(400, { code: 'DS_REFUSED' }, 'DS_REFUSED')
    let demo = null
    try {
      demo = await demoOf(tag)
    } catch {
      demo = null
    }
    const unavailable = (reason, status = 409) =>
      say(status, { code: 'DS_PREVIEW_UNAVAILABLE', reason }, reason)
    // The same predicate as the Road to live rule DEMO-1 (`lib/preview-demo.js`): no demo, or one
    // whose platform (the row's, the one it was built on) is not recorded, cannot be dressed.
    const gap = previewDemoGap(demo)
    if (gap !== null || !demo) return unavailable(gap ?? 'NO_DEMO')
    const platform = String(demo.platform)
    // The customer lock: a template customers may not pick a system for shows none to them.
    if (deps.customerLock && !who.probe) {
      const fit = ds.quickstartContractOf({ platform, tag, version: demo.quickstart_version ?? null })
      const templateKey = fit && 'template' in fit ? fit.template : null
      if ('contract' in fit && (await deps.customerLock.blocked(who.email, templateKey)))
        return say(403, { code: DS_TEMPLATE_LOCKED }, DS_TEMPLATE_LOCKED)
    }
    // The live frame: the demo itself, framed with its scripts running (see the file comment).
    // Only for a demo this server answers at its own address (`liveServed`): the frame wears the system only
    // where the site proxy lays it in. A demo on another host (fleet01) is served there straight through its
    // tunnel, so a live frame showed the template's own colours (measured 18/10/2026); it gets the static page,
    // which lays the system in here.
    if (c.req.query('live') === '1' && !inFrame && deps.secret && demo.site_key && liveServed(demo))
      return liveFrame({ c, tag, platform, id, demo })
    // Kept per demo deploy and page: its release, the release file's checksum and the port it was
    // published on (a redeploy of the same release number publishes again), the system, the path.
    const key = [
      tag,
      platform,
      demo.quickstart_version ?? '',
      demo.quickstart_sha256 ?? '',
      demo.port ?? '',
      id,
      path
    ].join('\n')
    const answer = await shelf.take(key, () =>
      build({ tag, platform, id, demo, path, doorOf, assetOf }).catch(() => ({ reason: 'DEMO_UNREADABLE' }))
    )
    if ('reason' in answer) {
      // Inside the frame, a page the demo has not got says so; the popup's own ask keeps its one reason.
      if (inFrame && answer.miss && answer.miss !== 'UNREADABLE')
        return unavailable(answer.miss, answer.miss === 'PAGE_NOT_FOUND' ? 404 : 409)
      return unavailable(answer.reason)
    }
    return sendPreview(c, answer.html, 300, answer.modes ? { [MODES_HEADER]: 'both' } : {})
  })
}
