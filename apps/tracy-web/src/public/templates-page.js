/**
 * The public Templates section (issue #1762): one server-rendered page per published template at
 * `/templates/<template id>/`, readable with no sign-in and no script.
 *
 *   GET /templates/<id>    301 to the slash form (the slash form is canonical)
 *   GET /templates/<id>/   the template's page; 404 with a way back when the id is not published
 *
 * 🔒 ONE SOURCE: the cards `GET /api/templates` answers (`lib/customer-template-cards.js`), handed in
 * as `readTemplates` and asked on EVERY request, never baked at build time. A template an admin
 * publishes has its page on the next request; one they take down answers 404 on the next request.
 *
 * Mounted in `app.js` ahead of the workspace catch-all, which would otherwise send `/templates/…`
 * to sign-in. The gallery is `/templates/`; its CMS chips filter in place (no per-platform pages:
 * `/templates/<platform>/` answers 301 to the gallery), and platform names stay reserved so a
 * template id can never take one.
 *
 * DOMAIN-PURE (`test/module-graph.test.mjs`): imports `lib/` and its own folder only; the template
 * source arrives from `app.js`.
 */
import { Hono } from 'hono'
import { requestLanguage } from '../lib/i18n/index.js'
import { templatesDiscoveryRoutes } from './templates-discovery.js'
import {
  fromPublicProxy,
  isIndexable,
  publicOriginOf,
  servedElsewhere,
  withNoindexMeta
} from './templates-indexing.js'
import { FILTER_SCRIPT_SOURCE, galleryPage } from './templates-gallery-html.js'
import { notFoundPage, templatePage } from './templates-page-html.js'
import { INLINE_SCRIPT_SOURCES } from './templates-chrome-html.js'
import { carryLanguage, languageInAddress } from './templates-language-links.js'
import { PREVIEW_SCRIPT_SOURCE, livePreview } from './templates-preview-html.js'
import { RESERVED_SEGMENTS, wordsFor } from './templates-words.js'

/** The shape of a template id (`ja-fresco`, `tracy-business`); anything else is not a template. */
const TEMPLATE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/
/** A browser or the edge may keep a page this long; a newly published template waits at most this. */
const PAGE_MAX_AGE_S = 60

/**
 * What this page may load: its own inline style, Google Fonts, pictures over https (the card's shots
 * and the landing site's backdrop and logo), and only its own inline scripts (theme boot and
 * toggles), allowed by hash so no other script can run.
 *
 * A template page with a live preview also runs the preview's script (by hash), may ask that
 * template's `demo-frame` probe (`connect-src`, the probe's origin only) and may frame that
 * template's demo (`frame-src`, the demo's origin only). Both origins come from the card itself,
 * so no page can frame anything but its own template's demo.
 * @param {ReturnType<typeof livePreview>} [live]
 */
function policyFor(live = null, gallery = false) {
  return [
    "default-src 'none'",
    `script-src ${[...INLINE_SCRIPT_SOURCES, ...(live ? [PREVIEW_SCRIPT_SOURCE] : []), ...(gallery ? [FILTER_SCRIPT_SOURCE] : [])].join(' ')}`,
    "style-src 'unsafe-inline' fonts.googleapis.com",
    'font-src fonts.gstatic.com',
    "img-src 'self' data: https:",
    ...(live
      ? [`connect-src ${live.connectOrigins.join(' ')}`, `frame-src ${live.frameOrigins.join(' ')}`]
      : []),
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
}

function pageHeaders(status, policy = policyFor()) {
  return {
    'content-type': 'text/html; charset=utf-8',
    // The words follow the visitor's language (`tracy_lang` cookie, then Accept-Language), so a shared cache keeps one copy per choice.
    vary: 'Cookie, Accept-Language',
    // A 404 is not kept: the template may be published a minute later.
    'cache-control': status === 200 ? `public, max-age=${PAGE_MAX_AGE_S}` : 'no-store',
    'content-security-policy': policy,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin'
  }
}

/** Middleware: `X-Robots-Tag: noindex` on every answer unless the deployment is production. */
const noindexOffProduction = (config) => async (c, next) => {
  await next()
  if (!isIndexable(config)) c.header('x-robots-tag', 'noindex')
}

/**
 * Middleware: when the pages live on another host (production: `https://tracy.ai`, whose Cloudflare
 * Worker forwards `/templates*` here), a visitor or crawler asking this app directly is sent there with
 * a 301 to the same path and query, so search engines see one address per page. The Worker's own
 * subrequest (`CF-Worker: <public host>`) is served as usual.
 *
 * 🔒 The 301 is `no-store` and both answers `Vary: CF-Worker`: a cached 301 handed to the Worker
 * would send tracy.ai back to itself in a loop.
 */
const toPublicOrigin = (config) => async (c, next) => {
  if (!servedElsewhere(config) || !['GET', 'HEAD'].includes(c.req.method)) return next()
  if (fromPublicProxy(config, c.req.header('cf-worker'))) {
    await next()
    c.header('vary', 'CF-Worker', { append: true })
    return
  }
  const url = new URL(c.req.url)
  return c.body(null, 301, {
    location: `${publicOriginOf(config)}${url.pathname}${url.search}`,
    'cache-control': 'no-store',
    vary: 'CF-Worker'
  })
}

/**
 * @param {object} deps
 * @param {{origin: string}} deps.config - the origin canonical and share addresses are built on.
 * @param {() => Promise<any[] | null>} deps.readTemplates - the published template cards, as
 *   `GET /api/templates` answers them; null when the source cannot be read right now.
 * @param {() => number} [deps.now] - test seam for the footer's year.
 * @returns {import('hono').Hono}
 */
export function publicTemplatesRoutes({ config, readTemplates, now = Date.now }) {
  const app = new Hono()
  const year = () => new Date(now()).getUTCFullYear()

  // Served from another host: every Templates address moves there, unless that host's Worker asks.
  app.use('/templates', toPublicOrigin(config))
  app.use('/templates/*', toPublicOrigin(config))
  // Only production is indexable: on dev and laptops every Templates address says noindex.
  app.use('/templates', noindexOffProduction(config))
  app.use('/templates/*', noindexOffProduction(config))
  const page = (html, c) => {
    const carried = carryLanguage(html, languageInAddress(c), config.origin)
    return isIndexable(config) ? carried : withNoindexMeta(carried)
  }

  /** A template id from the address, or null when the segment cannot name one. */
  const idOf = (c) => {
    const id = c.req.param('id')
    return TEMPLATE_ID.test(id) && !RESERVED_SEGMENTS.includes(id) ? id : null
  }

  /** Every published template, or a 503 answer when the source cannot be read right now. */
  const readAll = async (c) => {
    try {
      return { all: (await readTemplates()) ?? [] }
    } catch (error) {
      console.warn(
        `[templates] reading the published templates failed: ${error instanceof Error ? error.message : error}`
      )
      return {
        failed: c.body(wordsFor(requestLanguage(c)).unavailable, 503, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          vary: 'Cookie, Accept-Language',
          'retry-after': '60'
        })
      }
    }
  }

  /** The gallery: `/templates/`. The CMS chips filter in place, so there is no page per platform. */
  const gallery = async (c) => {
    const { all, failed } = await readAll(c)
    if (failed) return failed
    return c.body(
      page(
        galleryPage({
          all,
          origin: publicOriginOf(config),
          appOrigin: config.origin,
          year: year(),
          lang: requestLanguage(c)
        }),
        c
      ),
      200,
      pageHeaders(200, policyFor(null, true))
    )
  }

  // Without the trailing slash the address moves to the slash form, which is the canonical one.
  const toSlashForm = (c) => {
    const url = new URL(c.req.url)
    return c.redirect(`${url.pathname}/${url.search}`, 301)
  }
  app.get('/templates', toSlashForm)
  app.get('/templates/', gallery)

  // An address that cannot name a template or a platform is not this page's: it goes on to the routes after it.
  app.get('/templates/:id', (c, next) => {
    const segment = c.req.param('id')
    if (!idOf(c) && !RESERVED_SEGMENTS.includes(segment)) return next()
    return toSlashForm(c)
  })

  app.get('/templates/:id/', async (c, next) => {
    const segment = c.req.param('id')
    // The old per-platform addresses moved: the chips on the gallery are the filter now.
    if (RESERVED_SEGMENTS.includes(segment)) return c.redirect('/templates/', 301)
    const id = idOf(c)
    if (!id) return next()
    const { all, failed } = await readAll(c)
    if (failed) return failed
    const template = all.find((t) => t?.id === id)
    if (!template)
      return c.body(
        carryLanguage(
          notFoundPage({ year: year(), appOrigin: config.origin, lang: requestLanguage(c) }),
          languageInAddress(c),
          config.origin
        ),
        404,
        pageHeaders(404)
      )
    const html = templatePage({
      template,
      all,
      origin: publicOriginOf(config),
      appOrigin: config.origin,
      search: new URL(c.req.url).search,
      year: year(),
      lang: requestLanguage(c)
    })
    return c.body(page(html, c), 200, pageHeaders(200, policyFor(livePreview(template))))
  })

  app.route('/', templatesDiscoveryRoutes({ config, readTemplates }))

  return app
}
