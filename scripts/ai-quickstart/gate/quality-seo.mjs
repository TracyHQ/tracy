// The SEO items of template quality (ticket #586, product decision 4): read from the renders the marker test already
// took, so no page is visited again. Every page must have a title that no other page shares, a meta description, an
// og:image, a viewport meta, a language on its html element, an alt attribute on every picture (empty is allowed: a
// picture that only decorates), and a declared favicon that loads. A missing item on a page the build writes blocks;
// on a system page the template titles itself it is compared with the untouched template (`quality.mjs`). The favicons are fetched by the caller (`faviconsOf` lists them); one not fetched leaves the
// measurement incomplete. Pure.
import { parseHTML } from 'linkedom'

/** One render per page path: the first that answered 200 with markup. */
function pagesOf(renders) {
  const out = new Map()
  for (const r of renders ?? []) if (r.status === 200 && r.html && !out.has(r.path)) out.set(r.path, r)
  return [...out.values()]
}

const text = (v) => String(v ?? '').trim()

/** The absolute address of a page's declared favicon, or null. */
function iconOf(doc, base) {
  for (const link of doc.querySelectorAll('link[rel]')) {
    const rel = String(link.getAttribute('rel')).toLowerCase().split(/\s+/)
    if (!rel.includes('icon')) continue
    const href = text(link.getAttribute('href'))
    if (!href) continue
    try {
      return new URL(href, base).toString()
    } catch {
      return null
    }
  }
  return null
}

/** What one page has, as the record keeps it. */
function readPage(r, origin) {
  const { document } = parseHTML(r.html)
  const meta = (selector) => text(document.querySelector(selector)?.getAttribute('content'))
  const base = origin + '/' + String(r.path ?? '').replace(/^\/+/, '')
  return {
    page: r.path,
    title: text(document.querySelector('title')?.textContent),
    description: meta('meta[name="description"]'),
    ogImage: meta('meta[property="og:image"]'),
    viewport: meta('meta[name="viewport"]'),
    lang: text(document.querySelector('html')?.getAttribute('lang')),
    noAlt: [...document.querySelectorAll('img')].filter((img) => !img.hasAttribute('alt')).length,
    icon: iconOf(document, base)
  }
}

/** The favicon addresses the pages declare, each once, for the caller to fetch. */
export function faviconsOf(renders, origin) {
  return [
    ...new Set(
      pagesOf(renders)
        .map((r) => readPage(r, origin).icon)
        .filter(Boolean)
    )
  ]
}

/**
 * @param {object[]} renders the marker test's renders (`{path, status, html}`)
 * @param {{origin: string, favicons?: Map<string, number>}} input `favicons`: the status each favicon answered
 * @returns {{status: string, pages: number, missing: Array<{page: string, item: string, detail?: string}>,
 *   unchecked: string[]}}
 */
export function seoOf(renders, { origin, favicons = new Map() } = {}) {
  const read = pagesOf(renders).map((r) => readPage(r, origin))
  if (!read.length) return { status: 'incomplete', pages: 0, missing: [], unchecked: [], reason: 'no_page' }
  const missing = []
  const miss = (page, item, detail) => missing.push({ page, item, ...(detail ? { detail } : {}) })
  const titles = new Map()
  for (const p of read) if (p.title) titles.set(p.title, (titles.get(p.title) ?? 0) + 1)
  const unchecked = new Set()
  for (const p of read) {
    if (!p.title) miss(p.page, 'title')
    else if (titles.get(p.title) > 1)
      miss(p.page, 'unique title', 'shared by ' + titles.get(p.title) + ' pages')
    if (!p.description) miss(p.page, 'description')
    if (!p.ogImage) miss(p.page, 'og:image')
    if (!p.viewport) miss(p.page, 'viewport')
    if (!p.lang) miss(p.page, 'html[lang]')
    if (p.noAlt) miss(p.page, 'alt', p.noAlt + ' picture(s) with no alt')
    if (!p.icon) miss(p.page, 'favicon', 'none declared')
    else if (!favicons.has(p.icon)) unchecked.add(p.icon)
    else if (favicons.get(p.icon) !== 200) miss(p.page, 'favicon', 'answered ' + favicons.get(p.icon))
  }
  const status = missing.length ? 'failed' : unchecked.size ? 'incomplete' : 'passed'
  return { status, pages: read.length, missing, unchecked: [...unchecked] }
}
