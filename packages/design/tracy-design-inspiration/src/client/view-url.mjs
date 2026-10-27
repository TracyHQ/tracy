/**
 * The view, in the address: what the picker chose AND which preview is open. Each is a query
 * parameter, so what is on screen is a link someone can send — `?cat=Community`,
 * `?cat=Editorial %C2%B7 Studio&brand=airbnb`, `?open=clay`.
 *
 * WHY THE ADDRESS AND NOT REACT STATE ALONE. The page had one hidden switch — `?source=community`
 * — that turned a shelf on and nothing else, so the address could say what data was loaded but
 * never what was on screen (decided 08/09: "each filter in the dropdown on the left maps to its own
 * URL"). One parameter per thing the picker can choose makes reload, share and Back all show the
 * same view, and it retires the switch: the community shelf is now simply `cat=Community`.
 *
 * BOTH SURFACES USE IT. The public page keeps its whole view here; the tab in a lane keeps the same
 * two things beside `?tab=` and `?site=` (which `tracy-tab-link` owns and preserves), so a link
 * copied out of the side card opens on the same filter and the same preview.
 *
 * Plain `.mjs`, not `.ts`, so `test/view-url.test.mjs` can import it — the same reason `groups.mjs`
 * is plain, and the same reason it is worth testing: the failure mode is a link that opens the
 * wrong view, which looks like a working page.
 */

/** Ticked categories, by the catalog's own `category` string. */
export const CAT = 'cat'
/** Inspirations picked by name, by id (`airbnb`, `brand:joomlart.com`). */
export const BRAND = 'brand'
/** The one inspiration whose preview dialog is open, by id. */
export const OPEN = 'open'
/** Chosen CMS chips (`platforms.mjs`), by id: `joomla`, `wordpress`, `emdash`. */
export const PLATFORM = 'platform'

/** Categories carry `&` and `·` but never a comma, so one comma-joined parameter stays readable. */
const SEP = ','

/** @param {string | null} value */
const listOf = (value) =>
  typeof value === 'string'
    ? value
        .split(SEP)
        .map((s) => s.trim())
        .filter(Boolean)
    : []

/**
 * What the address asks for. Unreadable input is an empty view, never a throw: a bad link should
 * open the library, not a blank page. `platform` is present only when the address names one, so a
 * view read off an address written before the CMS chips existed has exactly the shape it had then.
 *
 * @param {string | undefined | null} search
 * @returns {{ cat: string[], brand: string[], open: string | null, platform?: string[] }}
 */
export function viewFromSearch(search) {
  try {
    const params = new URLSearchParams(search ?? '')
    const open = (params.get(OPEN) ?? '').trim()
    const platform = listOf(params.get(PLATFORM))
    return {
      cat: listOf(params.get(CAT)),
      brand: listOf(params.get(BRAND)),
      open: open === '' ? null : open,
      ...(platform.length > 0 ? { platform } : {})
    }
  } catch {
    return { cat: [], brand: [], open: null }
  }
}

/**
 * The address for a view — every OTHER parameter kept as it was, because `?domain=` is how a shared
 * link and the sign-in round trip carry the site being read.
 *
 * @param {string | undefined | null} search
 * @param {{ cat: Iterable<string>, brand: Iterable<string>, open?: string | null, platform?: Iterable<string> }} view
 * @returns {string} `?cat=…&brand=…&open=…`, or `''` when there is nothing to say
 */
export function searchWithView(search, view) {
  const params = new URLSearchParams(search ?? '')
  params.delete(CAT)
  params.delete(BRAND)
  params.delete(OPEN)
  params.delete(PLATFORM)
  // Legacy: the switch this file replaces. Drop it wherever it is still on an address.
  params.delete('source')
  const cat = [...view.cat]
  const brand = [...view.brand]
  if (cat.length > 0) params.set(CAT, cat.join(SEP))
  if (brand.length > 0) params.set(BRAND, brand.join(SEP))
  if (view.open) params.set(OPEN, view.open)
  const platform = [...(view.platform ?? [])]
  if (platform.length > 0) params.set(PLATFORM, platform.join(SEP))
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}
