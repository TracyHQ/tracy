// The pages of the write order (ticket #597): the home page first and only one, each page's menu entry and its search
// and share details, built without a model (decision of 13/11 on #597, Q5) from the plan's page names and the settled
// business facts. Pure. No glue words are added, so the details read the same in every plan language.
//
//   title        the business name on the home page; `<page name> | <business name>` elsewhere, the page name alone
//                when both are the same or the pair is over the title limit, cut at the limit. Never a page id.
//   description  the page name, the business name, its tagline and address, cut at 160 characters; never empty.
//   shareImage   the first own or generated picture the page shows (its hero first), else the home page's share
//                image (`from: 'home'`), else the logo (`source: 'logo'`), else the first picture the site shows
//                (`from: 'site'`); null only when the order has no picture and no logo picture.
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** The longest search description the order holds, in characters. */
export const SEO_DESCRIPTION_LIMIT = 160
/** The longest page title, in characters, when the template's mapping declares none. */
export const SEO_TITLE_LIMIT = 60

/** The SEO limits of the order: the mapping's title limit when it declares one. */
export function seoLimitsOf(mapping) {
  const title = mapping?.seo?.titleLimit
  return {
    title: Number.isInteger(title) && title > 0 ? title : SEO_TITLE_LIMIT,
    description: SEO_DESCRIPTION_LIMIT
  }
}

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
 *   logo?: object | null, limits?: {title: number, description: number}}} context `homeShare`: the home page's share
 *   image; `logo`: the order's look logo
 */
export function seoOf(
  page,
  { home, facts, pictures, homeShare = null, logo = null, limits = seoLimitsOf() }
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
  return { title, description, shareImage }
}

/** The menu entry of a page: the plan's page name, in page order. */
export const menuOf = (page, order) => ({ label: isText(page.name) ? page.name.trim() : page.id, order })
