// A business name a site brief holds off the site (#1791: `name-differs-from-own-marks`, or the owner's off) is named by
// nothing the site is built from: not the brief's brand, not the research brand an agent reads. Pure, no imports: the
// brief and the app's build paths both read it.

/** Whether a brief holds its business name off the site: its `name` fact is decided off. */
export const nameHeldOf = (brief) =>
  (Array.isArray(brief?.facts) ? brief.facts : []).some((f) => f?.field === 'name' && f.onSite === false)

/** The reasons the brief's `name` fact is held off the site, as the fact records them. */
export const nameHeldReasonsOf = (brief) =>
  (Array.isArray(brief?.facts) ? brief.facts : []).find((f) => f?.field === 'name' && f.onSite === false)
    ?.reasons ?? []

const NAME_KEYS = ['name', 'displayName', 'handle', 'username']
const unnamed = (o) =>
  o && typeof o === 'object' && !Array.isArray(o)
    ? Object.fromEntries(Object.entries(o).filter(([k]) => !NAME_KEYS.includes(k)))
    : o

/**
 * A brand observation with no name in it (pure): its own name and the names of the website and social pages it was
 * read from are dropped, so no reader falls back to a held name or a handle. Other fields stay as they are.
 */
export function brandWithoutName(brand) {
  if (!brand || typeof brand !== 'object') return brand
  const out = unnamed(brand)
  for (const key of ['website', 'social']) if (brand[key]) out[key] = unnamed(brand[key])
  return out
}

/**
 * The name the site goes by (pure): the business name when it is on the site; while it is held, the neutral identity
 * the brief already gives a business it may not name, its home page title made without the name (`seoOf`, for
 * example "Coaching team in Dubai"). Null when a held name has no such title (a brief made before it had one).
 */
export function siteNameOf(brief) {
  if (!nameHeldOf(brief)) return brief?.business?.name ?? null
  const home = (Array.isArray(brief?.sitemap) ? brief.sitemap : []).find((p) => p?.slug === 'home')
  const title = home?.seo?.title
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

/**
 * The business as the site builders read it (pure): itself when its name is on the site; while the name is held, its
 * `name` and `displayName` are the neutral identity (`siteNameOf`), so no site title, pin, copy or meta prints the held
 * name. Every other field stays as it is.
 */
export function siteBusinessOf(brief) {
  const business = brief?.business ?? {}
  if (!nameHeldOf(brief)) return business
  const name = siteNameOf(brief)
  return {
    ...business,
    name,
    ...('displayName' in business ? { displayName: name } : {})
  }
}

/** The brief as the site builders read it: its business is the site's view of it (`siteBusinessOf`). */
export const siteBriefOf = (brief) =>
  brief && typeof brief === 'object' && nameHeldOf(brief)
    ? { ...brief, business: siteBusinessOf(brief) }
    : brief
