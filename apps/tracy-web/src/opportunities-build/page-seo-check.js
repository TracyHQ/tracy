/**
 * The final check of every kept page's search title and description, and of the not-found page (spec TracyHQ/tracy#189, round
 * 9, class G and I). The engine's write is not proof: a CMS adds the site name to a title, a plugin rewrites the home's, and
 * a template prints its own description. So the served pages are read and held against the site plan (`page-seo.mjs`):
 *
 *   page-seo        a kept page whose served `<title>` or `<meta name="description">` is not the plan's (major)
 *   not-found-page  the not-found page does not name the business, or says the CMS's own words (minor)
 *
 * Beside the findings it lists the brief's content no served page shows (`unused`), each with why: the owner's posts, their
 * videos, their social figures. That list is a report, never a finding: what a template has no room for stays unused.
 *
 * Framework-wide (Joomla T3/T4, WordPress, EmDash): read from the served HTML and the site plan. Pure.
 */
import { decodeEntities } from '../lib/template-customization-question-readiness/readers/joomla-row-text.js'

/** The words a CMS's own not-found page prints, which no business wrote (Joomla's error layouts, WordPress's 404). */
const CMS_NOT_FOUND = [
  /An error has occurred while processing your request/i,
  /You may not be able to visit this page because of/i,
  /It looks like nothing was found at this location/i,
  /Oops! That page can(?:'|’)t be found/i
]

const flat = (/** @type {unknown} */ text) =>
  decodeEntities(String(text ?? ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A page's served title. */
export const servedTitle = (/** @type {string} */ html) =>
  flat(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? ''))?.[1] ?? '')

/** A page's served meta description; null when it has none. */
export function servedDescription(/** @type {string} */ html) {
  for (const [tag] of String(html ?? '').matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    return flat(content?.[1] ?? content?.[2] ?? '')
  }
  return null
}

/** The language a page says it is in (`<html lang>`), lower-cased; '' when it says none. */
const langOf = (/** @type {string} */ html) =>
  (/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(String(html ?? ''))?.[1] ?? '').toLowerCase()

const pathKey = (/** @type {unknown} */ path) => `/${String(path ?? '').replace(/^\/+|\/+$/g, '')}`

/**
 * @param {{ pages: Array<{path: string, status?: number, html: string}>, sitePlan?: any, missingPath?: string }} input
 * @returns {Array<{kind: 'page-seo' | 'not-found-page', severity: 'major' | 'minor', page: string, found: string,
 *   expected: string, why: string}>}
 */
export function checkPageSeo({ pages, sitePlan = null, missingPath = null }) {
  const out = []
  const plans = Array.isArray(sitePlan?.seo?.pages) ? sitePlan.seo.pages : []
  const served = (pages ?? []).filter((p) => p.status === undefined || p.status === 200)
  for (const plan of plans) {
    if (typeof plan?.path !== 'string') continue
    const page = served.find((p) => pathKey(p.path) === pathKey(plan.path))
    // A page that was not read is said by the reader (`unread`), never judged here; the plan is written in English.
    if (!page || !/^(en\b|$)/.test(langOf(page.html))) continue
    const title = servedTitle(page.html)
    if (title !== flat(plan.title))
      out.push({
        kind: /** @type {const} */ ('page-seo'),
        severity: /** @type {const} */ ('major'),
        page: page.path,
        found: title,
        expected: flat(plan.title),
        why: `The title of ${page.path} is "${title}", not the planned "${flat(plan.title)}"`
      })
    const description = servedDescription(page.html)
    if (flat(plan.description) !== '' && description !== flat(plan.description))
      out.push({
        kind: /** @type {const} */ ('page-seo'),
        severity: /** @type {const} */ ('major'),
        page: page.path,
        found: description ?? '(none)',
        expected: flat(plan.description),
        why: `The description of ${page.path} is ${description === null ? 'missing' : `"${description}"`}, not the planned one`
      })
  }
  const notFound = sitePlan?.seo?.notFound
  const name = flat(sitePlan?.brand?.name?.value ?? '')
  const probe = (pages ?? []).find(
    (p) => p.status === 404 && (missingPath === null || p.path === missingPath)
  )
  if (notFound && probe) {
    const text = flat(String(probe.html ?? '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' '))
    const cms = CMS_NOT_FOUND.find((re) => re.test(text))
    if (cms || (name !== '' && !text.includes(name)))
      out.push({
        kind: /** @type {const} */ ('not-found-page'),
        severity: /** @type {const} */ ('minor'),
        page: probe.path,
        found: cms ? (cms.exec(text)?.[0] ?? '') : 'no business name',
        expected: notFound.message,
        why: cms
          ? 'The not-found page says the CMS’s own words, not the business’s'
          : 'The not-found page does not name the business'
      })
  }
  return out
}

/**
 * The brief's content no served page shows, each with why (#189 round 9, item I3): a report for the owner and the team.
 * @param {{ pages: Array<{path: string, status?: number, html: string}>, brief: any, sitePlan?: any }} input
 * @returns {Array<{kind: 'post' | 'video' | 'social-figure', id: string, label: string, why: string}>}
 */
export function unusedBriefContent({ pages, brief, sitePlan = null }) {
  const served = (pages ?? []).filter((p) => p.status === undefined || p.status === 200)
  const text = served.map((p) => flat(p.html)).join('\n').toLowerCase()
  const out = []
  const pagesPlan = Array.isArray(sitePlan?.pages) ? sitePlan.pages : []
  const blogKept = pagesPlan.some((p) => p.decision === 'keep' && p.role === 'blog')
  const sampleBlog = pagesPlan.some(
    (p) => p.decision === 'drop' && p.reason === 'showcase-page' && /blog|news|article/i.test(String(p.id))
  )
  const postWhy = blogKept
    ? 'the blog page is kept, but this post is not on it'
    : sampleBlog
      ? "the template lists posts only on its sample pages, which were taken off: it keeps no blog of its own"
      : 'the template keeps no page that lists posts'
  for (const item of Array.isArray(brief?.content?.items) ? brief.content.items : []) {
    if (item?.authorship !== 'page') continue
    const title = flat(item.title)
    if (title === '' || text.includes(title.toLowerCase())) continue
    out.push({ kind: /** @type {const} */ ('post'), id: String(item.id), label: title, why: postWhy })
  }
  const videos = (Array.isArray(brief?.assets) ? brief.assets : []).filter((a) => a?.kind === 'video')
  const shownVideos = served.reduce(
    (n, p) => n + (String(p.html).match(/<video\b|<iframe\b[^>]*(?:youtube|vimeo)[^>]*src=["'][^"']*\/(?:embed|video)\/[\w-]+/gi) ?? []).length,
    0
  )
  for (const video of videos.slice(shownVideos))
    out.push({
      kind: /** @type {const} */ ('video'),
      id: String(video.id),
      label: String(video.depicts?.evidence?.quote ?? video.id).slice(0, 80),
      why: 'no video slot of the template was given this video'
    })
  for (const fact of Array.isArray(brief?.facts) ? brief.facts : []) {
    if (fact?.field !== 'socialFigures' || typeof fact.value?.amount !== 'number') continue
    const amount = String(fact.value.amount)
    if (new RegExp(`(?<![\\d.,])${amount}(?![\\d])`).test(text)) continue
    out.push({
      kind: /** @type {const} */ ('social-figure'),
      id: String(fact.id ?? fact.value.label),
      label: `${fact.value.amount} ${fact.value.label ?? ''}`.trim(),
      why: 'no statistic slot of the template was given this figure'
    })
  }
  return out
}
