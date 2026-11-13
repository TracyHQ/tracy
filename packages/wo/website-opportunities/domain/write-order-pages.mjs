// The pages of the write order (ticket #597): the home page first and only one, each page's menu entry and its search
// and share details, built without a model (decision of 13/11 on #597, Q5) from the plan's page names and the settled
// business facts. Pure. No glue words are added, so the details read the same in every plan language.
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** The longest search description the order holds, in characters. */
export const SEO_DESCRIPTION_LIMIT = 160

/** The plan pages in write order: the home page (`pageType: 'home'`, else the first page) first. */
export function pagesInOrder(plan) {
  const pages = list(plan?.pages)
  const home = pages.find((p) => p.pageType === 'home') ?? pages[0]
  return home ? [home, ...pages.filter((p) => p !== home)] : []
}

const factOf = (facts, kind) => facts.find((f) => f.kind === kind && isText(f.value))?.value ?? null
const cut = (text, limit) => {
  const chars = [...text]
  return chars.length <= limit
    ? text
    : `${chars
        .slice(0, limit - 3)
        .join('')
        .trimEnd()}...`
}

/**
 * The search and share details of one page.
 * @param {object} page the plan page
 * @param {boolean} home whether it is the home page
 * @param {Array<{kind: string, value: string}>} facts the settled business facts
 * @param {object[]} pictures the order's pictures of the page
 */
export function seoOf(page, home, facts, pictures) {
  const business = factOf(facts, 'business.name')
  const name = isText(page.name) ? page.name.trim() : page.id
  const title = home ? (business ?? name) : business ? `${name} | ${business}` : name
  const parts = [
    home ? null : name,
    business,
    factOf(facts, 'business.tagline'),
    factOf(facts, 'contact.address')
  ]
  const description = cut([...new Set(parts.filter(isText))].join(', '), SEO_DESCRIPTION_LIMIT)
  const hero = pictures.find(
    (p) =>
      p.page === page.id &&
      p.place === 'hero' &&
      !p.sameAs &&
      (p.source === 'own' || p.source === 'generated')
  )
  const shareImage = hero
    ? { frame: hero.frame, ...(hero.file ? { file: hero.file } : {}), source: hero.source }
    : null
  return { title, description, shareImage }
}

/** The menu entry of a page: the plan's page name, in page order. */
export const menuOf = (page, order) => ({ label: isText(page.name) ? page.name.trim() : page.id, order })
