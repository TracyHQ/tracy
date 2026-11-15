/**
 * The share link door (`lib/wo-demo-links.js`, migration 216), on Tracy's own origin, no sign-in:
 *
 *   GET /d/:token      302 to the demo's address; counts the open
 *   GET /d/:token/*    the same, to that path of the demo (`/d/<token>/menu` → `<address>/menu`)
 *
 * An unknown or revoked token answers 404, a link whose demo was deleted 410, both with no body and nothing counted.
 * Counting never holds the redirect: a database that cannot write the open still sends the person on.
 *
 * "SEE ANOTHER LOOK" (10Web idea 5, switch `wo-demo-looks`, off by default): while the switch is on, a person's own
 * visit (a browser's top-level navigation, never a program, a prefetch or a frame) of a demo whose release can wear a
 * design system (`sites/design-system-demo-systems.js` `eligible`, no read in its container) is answered with the share
 * page (`demo-look-page.js`) instead of the 302: the same demo page in a frame, counted exactly as the 302 is, with a
 * control that previews the demo in a few other design systems. Any other visit, or any doubt, is the 302 as before.
 *
 *   GET  /api/demo-links/:token/systems        the looks the page offers: `{origin, param, systems: [{id, n, colors,
 *                                              ticket}]}`, or `systems: []` with the `reason` there are none. Each
 *                                              ticket is the Design system preview's (`lib/ds-preview-ticket.js`):
 *                                              the demo wears the system in the frame and nothing is written to it.
 *   POST /api/demo-links/:token/systems/pick   `{id}` (`current` or a look of the list above): the owner liked it. A
 *                                              person's pick is counted like an open (`recordSystemPick`); a program,
 *                                              the seller's own session and picks past the hourly cap are answered
 *                                              `counted: false` with the reason, and nothing is written.
 *
 * Both doors answer only for a live link while the switch is on (`404 FEATURE_OFF` otherwise), and the pick door only
 * to Tracy's own pages (`Sec-Fetch-Site: same-origin`, or `Origin` exactly Tracy's): another site cannot cast a pick.
 */
import { Hono } from 'hono'
import { bornSiteAddress } from '../lib/site-address.js'
import { viewer } from '../lib/http.js'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { overLimit } from '../lib/rate.js'
import { pageSecurityHeaders } from '../lib/security-headers.js'
import { DS_PREVIEW_PARAM } from '../lib/ds-preview-ticket.js'
import {
  askedPath,
  automatedOpen,
  CURRENT_LOOK,
  DEMO_LINK_TOKEN,
  DEMO_OPENS_PER_HOUR,
  DEMO_SYSTEM_PICKS_PER_HOUR,
  DEMO_SYSTEMS_READS_PER_HOUR,
  demoTarget,
  deviceClassOf,
  PICKED_LOOK,
  programAgent,
  recordOpen,
  recordSystemPick
} from '../lib/wo-demo-links.js'
import { demoLookPage } from './demo-look-page.js'

/** The operator's switch for "See another look" on a demo's share page (`ui-switches/catalogue.json`). */
export const DEMO_LOOKS_SWITCH = 'wo-demo-looks'

const LINK_ROW = `select l.id, l.account_id, l.revoked_at, a.email, b.label, b.state, b.demo_deleted_at,
    b.site_key, st.address, o.name as business
  from wo_demo_link l
  join wo_build b on b.id = l.build_id
  join account a on a.id = l.account_id
  left join site st on st.site_key = b.site_key
  left join wo_revision r on r.id = b.revision_id
  left join wo_opportunity o on o.id = r.opportunity_id
  where l.token = $1`

/** The words of the share page, in the visitor's language. */
const WORDS = ['open', 'current', 'numbered', 'note', 'like', 'sent', 'own', 'failed', 'close', 'frameTitle']

/**
 * Whether a write to a share link's doors came from Tracy's own page: `Sec-Fetch-Site`, when the browser sent it,
 * decides alone (`lib/csrf.js` rule 1); without it `Origin` must be exactly Tracy's. Unlike the session guard, a
 * request with neither is refused: these doors carry no session to stand in for one.
 */
function fromTracyPage(headers, origin) {
  if (headers.has('sec-fetch-site')) return headers.get('sec-fetch-site') === 'same-origin'
  return headers.get('origin') === String(origin ?? '').replace(/\/+$/, '')
}

/**
 * @param {{ pool: import('pg').Pool, config: { origin: string, sessionSecret: string, siteDomain?: string },
 *   now?: () => number, log?: Pick<Console, 'warn'>,
 *   systems?: { eligible: (siteKey: string) => Promise<boolean>, systemsOf: (siteKey: string) => Promise<any> } | null,
 *   switchOn?: () => Promise<boolean> }} deps `systems`: a demo's other looks (`sites/design-system-demo-systems.js`,
 *   handed in by `app.js`); none: the share link only redirects. `switchOn`: whether `wo-demo-looks` is on (throws when
 *   it cannot be read, which reads as off).
 */
export function demoLinkRoutes({
  pool,
  config,
  now = Date.now,
  log = console,
  systems = null,
  switchOn = async () => false
}) {
  const app = new Hono()
  const empty = (c, status) => {
    c.header('cache-control', 'no-store')
    c.header('x-robots-tag', 'noindex')
    return c.body(null, status)
  }
  const answer = (c, body, status = 200) => {
    c.header('cache-control', 'no-store')
    c.header('x-robots-tag', 'noindex')
    c.header('referrer-policy', 'no-referrer')
    return c.json(body, status)
  }
  const looksOn = async () => {
    if (!systems) return false
    try {
      return (await switchOn()) === true
    } catch {
      return false
    }
  }

  /** The demo's address, or null. */
  const addressOf = (link) =>
    link.address ?? (link.label && config.siteDomain ? bornSiteAddress(link.label, config) : null)

  /** A live link of a demo not deleted, or the status to answer. */
  async function liveLink(token) {
    if (!DEMO_LINK_TOKEN.test(token)) return { status: 404 }
    const link = (await pool.query(LINK_ROW, [token])).rows[0]
    if (!link || link.revoked_at) return { status: 404 }
    if (link.demo_deleted_at || link.state === 'deleted') return { status: 410 }
    return { link }
  }

  async function open(c) {
    const token = c.req.param('token')
    const live = await liveLink(token)
    if (!live.link) return empty(c, live.status)
    const { link } = live
    const address = addressOf(link)
    const path = askedPath(c.req.path.slice(`/d/${token}`.length))
    const target = address ? demoTarget(address, path, new URL(c.req.url).search) : null
    if (!target) return empty(c, 404)
    if (await counted(c, link)) {
      const at = now()
      try {
        if (!(await overLimit(pool, `wo-demo-open:${link.id}`, DEMO_OPENS_PER_HOUR, at)))
          await recordOpen(pool, { linkId: link.id, path, device: deviceClassOf(c.req.raw.headers), at })
      } catch (error) {
        log.warn?.(`[wo-demo-link] open not counted: ${error?.code ?? error?.message ?? 'error'}`)
      }
    }
    if (await sharePage(c, link)) return pageOf(c, token, link, target)
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    c.header('x-robots-tag', 'noindex')
    return c.redirect(target, 302)
  }

  /**
   * Whether this visit gets the share page: a person's own top-level visit (no program, prefetch or frame) while the
   * switch is on, of a demo that can wear a look. Any doubt is false: the visit is then the plain 302.
   */
  async function sharePage(c, link) {
    if (automatedOpen(c.req.method, c.req.raw.headers)) return false
    const dest = c.req.header('sec-fetch-dest')
    if (dest !== undefined && dest !== 'document') return false
    if (!link.site_key || !(await looksOn())) return false
    try {
      return (await systems?.eligible(link.site_key)) === true
    } catch {
      return false
    }
  }

  function pageOf(c, token, link, target) {
    const t = translator(requestLanguage(c.req.raw))
    const words = Object.fromEntries(WORDS.map((w) => [w, t(`demoLooks.${w}`)]))
    const business = typeof link.business === 'string' ? link.business.trim() : ''
    const html = demoLookPage({
      htmlLang: t.htmlLang,
      title: business || words.frameTitle,
      target,
      systemsUrl: `/api/demo-links/${token}/systems`,
      pickUrl: `/api/demo-links/${token}/systems/pick`,
      words: /** @type {any} */ (words)
    })
    for (const [name, value] of Object.entries(pageSecurityHeaders({ frameSrc: new URL(target).origin })))
      c.header(name, value)
    c.header('x-robots-tag', 'noindex')
    return c.html(html, 200)
  }

  /** A person opening it, who is not the seller signed in to Tracy in this browser. */
  async function counted(c, link) {
    if (automatedOpen(c.req.method, c.req.raw.headers)) return false
    return !(await sellerOwn(c, link))
  }

  /** The seller who made the link, signed in to Tracy in this browser. */
  async function sellerOwn(c, link) {
    const email = await viewer(c, config).catch(() => null)
    return Boolean(email) && String(email).toLowerCase() === String(link.email).toLowerCase()
  }

  /** The looks of a live link's demo: `{origin, systems}` (each with its `name`, kept server-side) or `{reason}`. */
  async function looksOf(link) {
    if (!link.site_key || !systems) return { reason: 'NOT_WIRED' }
    const address = addressOf(link)
    const home = address ? demoTarget(address, '/') : null
    if (!home) return { reason: 'NO_ADDRESS' }
    const out = await systems.systemsOf(link.site_key)
    if (!out?.ok) return { reason: out?.reason ?? 'UNAVAILABLE' }
    // The page frames one origin only (its `frame-src`): a look served elsewhere would not load there.
    if (out.origin !== new URL(home).origin) return { reason: 'NO_ADDRESS' }
    return { origin: out.origin, systems: out.systems }
  }

  app.get('/api/demo-links/:token/systems', async (c) => {
    const live = await liveLink(c.req.param('token'))
    if (!live.link)
      return answer(c, { code: live.status === 410 ? 'DEMO_DELETED' : 'NOT_FOUND' }, live.status)
    if (!(await looksOn())) return answer(c, { code: 'FEATURE_OFF' }, 404)
    const { link } = live
    if (await overLimit(pool, `wo-demo-systems:${link.id}`, DEMO_SYSTEMS_READS_PER_HOUR, now()))
      return answer(c, { code: 'RATE_LIMITED' }, 429)
    let looks
    try {
      looks = await looksOf(link)
    } catch (error) {
      log.warn?.(`[wo-demo-link] looks not read: ${error?.code ?? error?.message ?? 'error'}`)
      looks = { reason: 'UNAVAILABLE' }
    }
    if (!looks.systems)
      return answer(c, { origin: null, param: DS_PREVIEW_PARAM, systems: [], reason: looks.reason })
    return answer(c, {
      origin: looks.origin,
      param: DS_PREVIEW_PARAM,
      // Never the library's name: the page names a look by its number (`demo-look-page.js`).
      systems: looks.systems.map((s) => ({ id: s.id, n: s.n, colors: s.colors, ticket: s.ticket }))
    })
  })

  app.post('/api/demo-links/:token/systems/pick', async (c) => {
    const live = await liveLink(c.req.param('token'))
    if (!live.link)
      return answer(c, { code: live.status === 410 ? 'DEMO_DELETED' : 'NOT_FOUND' }, live.status)
    if (!(await looksOn())) return answer(c, { code: 'FEATURE_OFF' }, 404)
    const headers = c.req.raw.headers
    if (!fromTracyPage(headers, config.origin)) return answer(c, { code: 'CSRF_ORIGIN' }, 403)
    if (!/^application\/json\b/i.test(headers.get('content-type') ?? ''))
      return answer(c, { code: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
    const body = await c.req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!PICKED_LOOK.test(id)) return answer(c, { code: 'INVALID_LOOK' }, 400)
    const { link } = live
    let shown = null
    if (id !== CURRENT_LOOK) {
      let looks
      try {
        looks = await looksOf(link)
      } catch {
        looks = { reason: 'UNAVAILABLE' }
      }
      shown = looks.systems?.find((s) => s.id === id) ?? null
      if (!shown) return answer(c, { code: 'LOOK_NOT_OFFERED' }, 400)
    }
    if (programAgent(headers)) return answer(c, { counted: false, reason: 'PROGRAM' })
    if (await sellerOwn(c, link)) return answer(c, { counted: false, reason: 'OWN' })
    const at = now()
    try {
      if (await overLimit(pool, `wo-demo-pick:${link.id}`, DEMO_SYSTEM_PICKS_PER_HOUR, at))
        return answer(c, { counted: false, reason: 'RATE_LIMITED' })
      await recordSystemPick(pool, {
        linkId: link.id,
        systemId: id,
        n: shown?.n ?? null,
        name: shown?.name ?? null,
        device: deviceClassOf(headers),
        at
      })
    } catch (error) {
      log.warn?.(`[wo-demo-link] pick not counted: ${error?.code ?? error?.message ?? 'error'}`)
      return answer(c, { counted: false, reason: 'NOT_SAVED' }, 503)
    }
    return answer(c, { counted: true })
  })

  app.get('/d/:token', open)
  app.get('/d/:token/*', open)
  return app
}
