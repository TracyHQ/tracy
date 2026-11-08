// `site.systemPages`: the legal pages the template ships, what its not-found page prints, and the page whose layout a
// new plain page would take (a single article in the template's default article layout). Pure: it takes the pages read
// in the browser and the answer of an address that does not exist.

const LEGAL = /\b(?:privacy|terms|legal|cookies?|imprint|impressum|gdpr|disclaimer|conditions)\b/i

/** Pages whose title or path names a legal text. @param {Array<{pageId: string, path: string, title?: string}>} pages */
export const legalPagesOf = (pages) =>
  pages
    .filter((p) => LEGAL.test(p.title ?? '') || LEGAL.test(p.path.replace(/[-/]/g, ' ')))
    .map((p) => p.pageId)

/**
 * A link to the site itself as its path (a template that prints `Uri::root()` writes the full address of the stand it
 * was read on, which no other site shares); any other link as it is.
 */
function sitePathOf(href, siteUrl) {
  if (!siteUrl || typeof href !== 'string') return href
  try {
    const u = new URL(href)
    return u.origin === new URL(siteUrl).origin ? `${u.pathname}${u.search}${u.hash}` : href
  } catch {
    return href
  }
}

/**
 * What the not-found answer prints: its status, whether the template draws it (its header shows), and its words.
 * @param {{status: number|null, siteUrl?: string, read?: {h1s?: object[], texts?: string[], links?: object[], hasHeader?: boolean}} | null} answer
 */
export function notFoundOf(answer) {
  if (!answer) return { pageId: null, status: null, rendersTemplate: null, slots: [] }
  const r = answer.read ?? {}
  const slots = [
    ...(r.h1s ?? []).filter((h) => h.text).map((h) => ({ kind: 'heading', text: h.text })),
    ...(r.texts ?? []).map((t) => ({ kind: 'message', text: t })),
    ...(r.links ?? []).map((l) => ({
      kind: 'link',
      text: l.label,
      target: sitePathOf(l.href, answer.siteUrl)
    }))
  ]
  return { pageId: null, status: answer.status, rendersTemplate: r.hasHeader ?? null, slots }
}

/**
 * The page a new plain page would look like: of the pages that show one article (body marked as an article view),
 * the one with the fewest blocks around the article, then the shortest path. A body with no view class counts when
 * the page read one article view in its content (`articleView`).
 * @param {Array<{pageId: string, path: string, bodyClass?: string, articleView?: boolean, blockCount?: number}>} pages
 */
export function articleLayoutOf(pages) {
  const articles = pages.filter(
    (p) =>
      /\bview-article\b/.test(p.bodyClass ?? '') ||
      /\bsingle(?:-post)?\b/.test(p.bodyClass ?? '') ||
      p.articleView === true
  )
  articles.sort((a, b) => (a.blockCount ?? 99) - (b.blockCount ?? 99) || a.path.length - b.path.length)
  return { pageId: articles[0]?.pageId ?? null, candidates: articles.length }
}

/** @returns {{systemPages: object, errors: object[]}} */
export function buildSystemPages({ pages, notFound }) {
  const errors = []
  const article = articleLayoutOf(pages)
  const nf = notFoundOf(notFound)
  if (!article.pageId)
    errors.push({
      kind: 'missing',
      field: 'site.systemPages.articleLayoutForNewPage',
      reason: 'no page shows one article'
    })
  if (nf.status === null)
    errors.push({
      kind: 'missing',
      field: 'site.systemPages.notFound',
      reason: 'the not-found address was not read'
    })
  else if (nf.status !== 404)
    errors.push({
      kind: 'not-found-status',
      field: 'site.systemPages.notFound.status',
      reason: `answers ${nf.status}`
    })
  return {
    systemPages: { legal: legalPagesOf(pages), notFound: nf, articleLayoutForNewPage: article.pageId },
    errors
  }
}
