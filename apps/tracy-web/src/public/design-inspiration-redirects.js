/**
 * The old Design inspiration page addresses move to the public Templates pages (issue #1762).
 *
 *   /design-inspiration, /design-inspiration/         301 to /templates/
 *   /design-inspiration?open=<id>                     301 to /templates/<id>/ when <id> is published, else /templates/
 *   /design-inspiration/<id>                          the same rule (a deep link)
 *
 * Only a page navigation moves. A path that ends in a file extension (the built page's assets and the
 * library files the brand reader and the dsh plugin read) and everything under `/design-inspiration/api/`
 * are NOT touched: they go on to `public/route.js` and answer exactly as before. Query keys `utm_*` ride
 * along so campaign tracking survives the move.
 *
 * When the Templates pages live on another host (production: `https://tracy.ai`), the move lands there
 * in one hop: an absolute address on that origin, not `/templates/…` here, which would 301 a second time.
 *
 * DOMAIN-PURE (`test/module-graph.test.mjs`): imports `hono` and its own folder only; the template
 * source arrives from `app.js`, the one `public/templates-page.js` reads.
 */
import { Hono } from 'hono'
import { publicOriginOf, servedElsewhere } from './templates-indexing.js'

const MOUNT = '/design-inspiration'
/** The shape of a template id; the same one the template page accepts. */
const TEMPLATE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/

/** The query the new address keeps: the campaign keys only. */
function utmQuery(url) {
  const kept = new URLSearchParams()
  for (const [key, value] of url.searchParams)
    if (key.toLowerCase().startsWith('utm_')) kept.append(key, value)
  const text = kept.toString()
  return text ? `?${text}` : ''
}

/**
 * @param {object} deps
 * @param {() => Promise<any[] | null>} deps.readTemplates - the published template cards; asked per request.
 * @param {{origin?: string, templatesPublicOrigin?: string}} [deps.config] - where the Templates pages live.
 * @returns {import('hono').Hono}
 */
export function designInspirationRedirects({ readTemplates, config = {} }) {
  const app = new Hono()

  /** Whether `id` is a published template right now; a source that cannot be read says no. */
  async function isPublished(id) {
    if (!TEMPLATE_ID.test(id)) return false
    try {
      return ((await readTemplates()) ?? []).some((t) => t?.id === id)
    } catch (error) {
      console.warn(
        `[templates] old address redirect could not read the templates: ${error instanceof Error ? error.message : error}`
      )
      return false
    }
  }

  async function move(c, id) {
    const url = new URL(c.req.url)
    const target = id && (await isPublished(id)) ? `/templates/${id}/` : '/templates/'
    const base = servedElsewhere(config) ? publicOriginOf(config) : ''
    return c.redirect(`${base}${target}${utmQuery(url)}`, 301)
  }

  app.get(MOUNT, (c) => move(c, new URL(c.req.url).searchParams.get('open')))

  app.get(`${MOUNT}/*`, (c, next) => {
    const rest = new URL(c.req.url).pathname.slice(MOUNT.length).replace(/^\/+/, '')
    const [first, ...more] = rest.split('/').filter(Boolean)
    // The doors and the page's own files stay where they were.
    if (first === 'api' || /\.[a-z0-9]+$/i.test(rest)) return next()
    if (!first) return move(c, new URL(c.req.url).searchParams.get('open'))
    return move(c, more.length === 0 ? first : null)
  })

  return app
}
