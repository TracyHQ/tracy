/**
 * What a crawler reads to find the public Templates pages (issue #1762, ticket 4).
 *
 *   GET /sitemap.xml   every Templates address: the gallery and each template page
 *   GET /llms.txt      the same templates as plain text, for AI readers: one line each
 *   GET /robots.txt    crawlers may read /templates/; the sitemap is named
 *   GET /templates/sitemap.xml, GET /templates/llms.txt   the same two files inside the Templates
 *                      section, so they also exist on the public origin (`https://tracy.ai`), whose
 *                      Worker forwards only `/templates*` here. robots.txt names this sitemap.
 *
 * 🔒 THE SITEMAP READS THE SAME SOURCE AS THE PAGES, PER REQUEST (`readTemplates`, the cards
 * `GET /api/templates` answers): a template an admin publishes is listed on the next fetch, one they
 * take down is gone on the next fetch, so the list can never name a page that answers 404.
 *
 * No `<lastmod>`: the published card carries no publish date (the release's `publishedAt` is not part
 * of the card `GET /api/templates` shows), and a made-up date is worse than none.
 *
 * robots.txt opens NOTHING new: a crawler could read every public address before (the file was empty),
 * and no signed-in area is named here. It only names the Templates section and the sitemap.
 *
 * DOMAIN-PURE (`test/module-graph.test.mjs`): `lib/` and its own folder only.
 */
import { Hono } from 'hono'
import { isIndexable, publicOriginOf } from './templates-indexing.js'
import { industryOf } from './templates-industry.js'
import { platformName, platformsOf, templatePath } from './templates-page-html.js'
import { RESERVED_SEGMENTS } from './templates-words.js'

const xml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The addresses the sitemap lists, in reading order: gallery, template pages. */
export function templatePaths(all) {
  return [
    '/templates/',
    ...all
      .filter((t) => typeof t?.id === 'string' && !RESERVED_SEGMENTS.includes(t.id))
      .map((t) => templatePath(t.id))
  ]
}

const oneLine = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** The /llms.txt body: what Tracy Templates are, then one line per published template. */
export function llmsText(all, origin) {
  const lines = all
    .filter((t) => typeof t?.id === 'string' && !RESERVED_SEGMENTS.includes(t.id))
    .map((t) => {
      const name = oneLine(t.label) || t.id
      const blurb = oneLine(t.card?.blurb).replace(/[.\s]+$/, '')
      const cms = platformsOf(t).map(platformName).join(', ')
      return `- [${name}](${origin}${templatePath(t.id)}): ${blurb ? `${blurb}. ` : ''}${cms ? `CMS: ${cms}. ` : ''}Industry: ${industryOf(t)}.`
    })
  return `# Tracy Templates

> Tracy Templates are free, ready-made website templates for WordPress, Joomla and EmDash. Each template page shows a live demo, its demo pages, the industry it suits and the CMS it runs on, and lets you start a new site from it in Tracy.

Gallery: ${origin}/templates/

## Templates

${lines.join('\n')}
`
}

/**
 * @param {object} deps
 * @param {{origin: string}} deps.config
 * @param {() => Promise<any[] | null>} deps.readTemplates
 * @returns {import('hono').Hono}
 */
export function templatesDiscoveryRoutes({ config, readTemplates }) {
  const app = new Hono()
  // Read per request: a config without an origin (a bare test app) only fails when asked.
  const originOf = () => publicOriginOf(config)

  const sitemap = async (c) => {
    // Off production the sitemap still answers (it is harmless) but tells crawlers not to index it.
    if (!isIndexable(config)) c.header('x-robots-tag', 'noindex')
    let all
    try {
      all = (await readTemplates()) ?? []
    } catch (error) {
      console.warn(
        `[templates] sitemap could not read the templates: ${error instanceof Error ? error.message : error}`
      )
      return c.body('The template list is not available right now.', 503, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'retry-after': '60'
      })
    }
    const urls = templatePaths(all).map((path) => `  <url><loc>${xml(`${originOf()}${path}`)}</loc></url>`)
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
    return c.body(body, 200, {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-content-type-options': 'nosniff'
    })
  }

  const llms = async (c) => {
    if (!isIndexable(config)) c.header('x-robots-tag', 'noindex')
    let all
    try {
      all = (await readTemplates()) ?? []
    } catch (error) {
      console.warn(
        `[templates] llms.txt could not read the templates: ${error instanceof Error ? error.message : error}`
      )
      return c.body('The template list is not available right now.', 503, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'retry-after': '60'
      })
    }
    return c.body(llmsText(all, originOf()), 200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-content-type-options': 'nosniff'
    })
  }

  app.get('/sitemap.xml', sitemap)
  app.get('/templates/sitemap.xml', sitemap)
  app.get('/llms.txt', llms)
  app.get('/templates/llms.txt', llms)

  app.get('/robots.txt', (c) => {
    // Off production: nothing is crawlable and no sitemap is named.
    if (!isIndexable(config))
      return c.body('User-agent: *\nDisallow: /\n', 200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300'
      })
    return c.body(
      `User-agent: *\nAllow: /templates/\n\nSitemap: ${originOf()}/templates/sitemap.xml\n`,
      200,
      {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300'
      }
    )
  })

  return app
}
