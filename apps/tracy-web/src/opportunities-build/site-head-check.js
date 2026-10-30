/**
 * The final checks of the SEO stage (spec TracyHQ/tracy#189, criteria 8.1 to 8.5, R12 group G), on the served pages of any
 * CMS. The engine's writes are not proof: a CMS adds its own title, a template prints its own description, a framework
 * prints no share preview. So every served page is read, records included:
 *
 *   page-title        missing or the template's own (blocker); without the business name, said on another page too, or
 *                     outside about 40 to 60 characters (minor)
 *   page-description  missing or the template's own (blocker); said on another page too, or outside about 120 to 160
 *                     characters (minor)
 *   page-h1           no main heading (blocker); more than one (minor)
 *   share-preview     og:title, og:description, og:image or og:url missing (minor)
 *   business-schema   the home page has no LocalBusiness record, or one that does not say the plan's name or phone (minor)
 *   sitemap           no /sitemap.xml, a served page it does not list, or a robots.txt that does not point to it (minor)
 *   picture-alt       a picture with no alt text at all (minor; `alt=""` is a decorative frame's and is right)
 *
 * Pure: the served HTML, the sitemap and robots files as read, and the site plan.
 */
import { servedDescription, servedTitle } from './page-seo-check.js'

/** Words a template's own page title or description advertises itself with; no business writes them. */
const TEMPLATE_WORDS = [
  /\b(?:joomla|wordpress|emdash)\b[^.|]*\b(?:template|theme)s?\b/i,
  /\b(?:template|theme)\b[^.|]*\b(?:joomla|wordpress|emdash)\b/i,
  /\blorem ipsum\b/i
]
export const TITLE_BAND = Object.freeze([40, 60])
export const DESCRIPTION_BAND = Object.freeze([120, 160])

const length = (/** @type {string} */ t) => [...t].length
const served = (/** @type {any[]} */ pages) =>
  (pages ?? []).filter(
    (p) => (p.status === undefined || p.status === 200) && /<html\b/i.test(String(p.html ?? ''))
  )
/** The demo words a value carries, or null. */
const demoIn = (/** @type {string} */ text) =>
  TEMPLATE_WORDS.find((re) => re.test(text))?.exec(text)?.[0] ?? null

/** The `content` of the first `<meta>` whose attribute `attr` is `name`; null when there is none. */
export function metaOf(/** @type {string} */ html, /** @type {string} */ attr, /** @type {string} */ name) {
  for (const [tag] of String(html ?? '').matchAll(/<meta\b[^>]*>/gi)) {
    if (!new RegExp(`\\b${attr}\\s*=\\s*["']${name}["']`, 'i').test(tag)) continue
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    return (content?.[1] ?? content?.[2] ?? '').trim()
  }
  return null
}

/** The page's body, scripts and styles taken out. */
const bodyOf = (/** @type {string} */ html) =>
  String(html ?? '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/^[\s\S]*?<body\b[^>]*>/i, '')

const finding = (kind, severity, page, found, why) => ({ kind, severity, page, found, why })

/**
 * Titles, descriptions, main headings and share previews of every served page.
 * @param {{ pages: Array<{path: string, status?: number, html: string}>, sitePlan?: any }} input
 */
export function checkPageHeads({ pages, sitePlan = null }) {
  const out = []
  const name = String(sitePlan?.brand?.name?.value ?? '').trim()
  const list = served(pages)
  const titles = new Map()
  const descriptions = new Map()
  for (const page of list) {
    const html = String(page.html)
    const title = servedTitle(html)
    const description = servedDescription(html) ?? ''
    if (title === '')
      out.push(finding('page-title', 'blocker', page.path, '(none)', `${page.path} has no title`))
    else if (demoIn(title))
      out.push(
        finding('page-title', 'blocker', page.path, title, `The title of ${page.path} is the template's own`)
      )
    else {
      if (name !== '' && !title.toLowerCase().includes(name.toLowerCase()))
        out.push(
          finding(
            'page-title',
            'minor',
            page.path,
            title,
            `The title of ${page.path} does not name the business`
          )
        )
      if (length(title) < TITLE_BAND[0] || length(title) > TITLE_BAND[1])
        out.push(
          finding(
            'page-title',
            'minor',
            page.path,
            title,
            `The title of ${page.path} is ${length(title)} characters, not about ${TITLE_BAND.join(' to ')}`
          )
        )
      titles.set(title, [...(titles.get(title) ?? []), page.path])
    }
    if (description === '')
      out.push(finding('page-description', 'blocker', page.path, '(none)', `${page.path} has no description`))
    else if (demoIn(description))
      out.push(
        finding(
          'page-description',
          'blocker',
          page.path,
          description,
          `The description of ${page.path} is the template's own`
        )
      )
    else {
      if (length(description) < DESCRIPTION_BAND[0] || length(description) > DESCRIPTION_BAND[1])
        out.push(
          finding(
            'page-description',
            'minor',
            page.path,
            description,
            `The description of ${page.path} is ${length(description)} characters, not about ${DESCRIPTION_BAND.join(' to ')}`
          )
        )
      descriptions.set(description, [...(descriptions.get(description) ?? []), page.path])
    }
    const h1 = (bodyOf(html).match(/<h1\b/gi) ?? []).length
    if (h1 === 0)
      out.push(finding('page-h1', 'blocker', page.path, '0', `${page.path} has no main heading (h1)`))
    else if (h1 > 1)
      out.push(
        finding('page-h1', 'minor', page.path, String(h1), `${page.path} has ${h1} main headings (h1)`)
      )
    const missing = ['og:title', 'og:description', 'og:image', 'og:url'].filter(
      (p) => !metaOf(html, 'property', p)
    )
    if (missing.length > 0)
      out.push(
        finding(
          'share-preview',
          'minor',
          page.path,
          missing.join(', '),
          `A link to ${page.path} shared has no ${missing.join(', ')}`
        )
      )
  }
  for (const [kind, seen] of [
    ['page-title', titles],
    ['page-description', descriptions]
  ])
    for (const [text, paths] of /** @type {Map<string, string[]>} */ (seen))
      if (paths.length > 1)
        for (const path of paths.slice(1))
          out.push(
            finding(
              kind,
              'minor',
              path,
              text,
              `${path} says the same ${kind === 'page-title' ? 'title' : 'description'} as ${paths[0]}`
            )
          )
  return out
}

/** Every JSON-LD object of a page, `@graph` members included. */
export function jsonLdOf(/** @type {string} */ html) {
  const out = []
  for (const m of String(html ?? '').matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const read = JSON.parse(m[1])
      for (const item of [read].flat())
        out.push(item, ...(Array.isArray(item?.['@graph']) ? item['@graph'] : []))
    } catch {
      // A block that is not JSON states nothing.
    }
  }
  return out.filter((o) => o && typeof o === 'object')
}

/**
 * The home page's LocalBusiness record against the plan's.
 * @param {{ pages: any[], sitePlan?: any }} input
 */
export function checkBusinessSchema({ pages, sitePlan = null }) {
  const plan = sitePlan?.seo?.schema
  if (!plan) return []
  const home = served(pages).find((p) => p.path === '/')
  if (!home) return []
  const types = new Set(['LocalBusiness', String(plan['@type'] ?? '')])
  const found = jsonLdOf(home.html).find((o) => [o['@type']].flat().some((t) => types.has(String(t))))
  if (!found)
    return [
      finding(
        'business-schema',
        'minor',
        '/',
        '(none)',
        'The home page has no LocalBusiness record for search engines'
      )
    ]
  const out = []
  for (const field of ['name', 'telephone'])
    if (plan[field] && String(found[field] ?? '') !== String(plan[field]))
      out.push(
        finding(
          'business-schema',
          'minor',
          '/',
          String(found[field] ?? '(none)'),
          `The LocalBusiness record's ${field} is not the business's`
        )
      )
  return out
}

/**
 * The sitemap lists every served page and robots.txt points to it.
 * @param {{ pages: any[], files?: Record<string, {status?: number | null, html?: string} | null> }} input
 */
export function checkSitemap({ pages, files = {} }) {
  const sitemap = files?.['/sitemap.xml']
  if (!sitemap || sitemap.status !== 200 || !/<urlset\b|<sitemapindex\b/i.test(String(sitemap.html ?? '')))
    return [
      finding(
        'sitemap',
        'minor',
        '/sitemap.xml',
        String(sitemap?.status ?? 'unread'),
        'The site has no sitemap.xml'
      )
    ]
  const out = []
  const listed = new Set(
    [...String(sitemap.html).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => {
      try {
        return new URL(m[1]).pathname.replace(/\/+$/, '') || '/'
      } catch {
        return m[1]
      }
    })
  )
  for (const page of served(pages))
    if (!listed.has(page.path.replace(/\/+$/, '') || '/'))
      out.push(finding('sitemap', 'minor', page.path, 'not listed', `The sitemap does not list ${page.path}`))
  const robots = files?.['/robots.txt']
  if (
    !robots ||
    robots.status !== 200 ||
    !/^\s*sitemap\s*:\s*\S*sitemap\.xml/im.test(String(robots.html ?? ''))
  )
    out.push(
      finding(
        'sitemap',
        'minor',
        '/robots.txt',
        'no Sitemap line',
        'robots.txt does not point to the sitemap'
      )
    )
  return out
}

/**
 * A picture with no alt attribute at all, one finding per page.
 * @param {{ pages: any[] }} input
 */
export function checkPictureAlt({ pages }) {
  const out = []
  for (const page of served(pages)) {
    const bare = [...bodyOf(page.html).matchAll(/<img\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => !/\balt\s*=/i.test(tag) && !/\bwidth\s*=\s*["']?1\b/i.test(tag))
    if (bare.length > 0)
      out.push(
        finding(
          'picture-alt',
          'minor',
          page.path,
          String(bare.length),
          `${bare.length} picture(s) on ${page.path} have no alt text`
        )
      )
  }
  return out
}
