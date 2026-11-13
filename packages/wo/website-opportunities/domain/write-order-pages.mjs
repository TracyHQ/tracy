// The pages of the write order (ticket #597): the home page first and only one, each page's menu entry and its search
// and share details. Pure.
//
// The writer writes each page's title and description (locked brand decision 21, #594: `seo` of a written page); the
// order takes them as written. Only a page the writer gave none (a page of data fields only, or an older writer
// output) falls back to the ones code builds (decision of 13/11 on #597, Q5) from the plan's page names and the settled
// business facts, with no glue words, so they read the same in every plan language:
//
//   title        the business name on the home page; `<page name> | <business name>` elsewhere, the page name alone
//                when both are the same or the pair is over the title limit, cut at the limit. Never a page id.
//   description  the page name, the business name, its tagline and address, cut at 160 characters; never empty.
//   shareImage   the first own or generated picture the page shows (its hero first), else the home page's share
//                image (`from: 'home'`), else the logo (`source: 'logo'`), else the first picture the site shows
//                (`from: 'site'`); null only when the order has no picture and no logo picture.
import { seoLimitsOf } from './seo-limits.mjs'

export { SEO_DESCRIPTION_LIMIT, SEO_TITLE_LIMIT, seoLimitsOf } from './seo-limits.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The plan pages in write order: the home page (`pageType: 'home'`, else the first page) first. */
export function pagesInOrder(plan) {
  const pages = list(plan?.pages)
  const home = pages.find((p) => p.pageType === 'home') ?? pages[0]
  return home ? [home, ...pages.filter((p) => p !== home)] : []
}

const factOf = (facts, kind) => facts.find((f) => f.kind === kind && isText(f.value))?.value ?? null
const length = (text) => [...text].length
const cut = (text, limit) => {
  const chars = [...text]
  return chars.length <= limit
    ? text
    : `${chars
        .slice(0, limit - 3)
        .join('')
        .trimEnd()}...`
}
const nameOf = (page) => (isText(page.name) ? page.name.trim() : null)
const shows = (p) => (p.source === 'own' || p.source === 'generated') && (p.file || p.ref || p.generate)

/** The share image of one page from its own pictures (any page's when `page` is null), or null. */
function ownShareImage(page, pictures) {
  const own = pictures.filter((p) => (page === null || p.page === page.id) && shows(p))
  const picture = own.find((p) => p.place === 'hero' && !p.sameAs) ?? own.find((p) => !p.sameAs) ?? own[0]
  return picture
    ? { frame: picture.frame, ...(picture.file ? { file: picture.file } : {}), source: picture.source }
    : null
}

/**
 * The search and share details of one page.
 * @param {object} page the plan page
 * @param {{home: boolean, facts: Array<{kind: string, value: string}>, pictures: object[], homeShare?: object | null,
 *   logo?: object | null, limits?: {title: number, description: number}, written?: {title?: string, description?:
 *   string}}} context `homeShare`: the home page's share image; `logo`: the order's look logo; `written`: the title and
 *   description the writer wrote for the page, each preferred to the code built one
 */
export function seoOf(
  page,
  { home, facts, pictures, homeShare = null, logo = null, limits = seoLimitsOf(), written = null }
) {
  const business = factOf(facts, 'business.name')
  const name = nameOf(page)
  const pair = name && business && name !== business ? `${name} | ${business}` : null
  const title = cut(
    home ? (business ?? name ?? '') : pair && length(pair) <= limits.title ? pair : (name ?? business ?? ''),
    limits.title
  )
  const parts = [
    home ? null : name,
    business,
    factOf(facts, 'business.tagline'),
    factOf(facts, 'contact.address')
  ]
  const joined = [...new Set(parts.filter(isText))].join(', ')
  const description = cut(isText(joined) ? joined : title, limits.description)
  const logoImage =
    logo?.kind === 'own' || isText(logo?.file)
      ? { source: 'logo', ...(logo.file ? { file: logo.file } : {}) }
      : null
  const site = ownShareImage(null, pictures)
  const shareImage =
    ownShareImage(page, pictures) ??
    (homeShare ? { ...homeShare, from: 'home' } : null) ??
    logoImage ??
    (site ? { ...site, from: 'site' } : null)
  return {
    title: isText(written?.title) ? written.title.trim() : title,
    description: isText(written?.description) ? written.description.trim() : description,
    shareImage
  }
}

/** The menu entry of a page: the plan's page name, in page order. */
export const menuOf = (page, order) => ({ label: isText(page.name) ? page.name.trim() : page.id, order })
