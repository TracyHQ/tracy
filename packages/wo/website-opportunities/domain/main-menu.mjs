import { pageRole } from './page-plan.mjs'
import { neutralText } from './neutral-copy.mjs'

const locales = ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es', 'ja', 'ar']
const genericLabels = new Set(locales.map((l) => neutralText('neutral.cta.learnMore', l).toLowerCase()))
const contactLabels = new Set(locales.map((l) => neutralText('neutral.cta.contact', l).toLowerCase()))

// A main menu names the kept pages, by their roles. Native adapters supply the template's declared placement; the
// model chooses the business's words. No copy pin, neutral placeholder or page heading decides a main-menu label.

/** Refine a kept page's navigation role without changing which pages the page planner keeps. */
export function mainMenuRole(page) {
  const own = String(page.id ?? '')
    .split('/')
    .at(-1)
    .replace(/_/g, '-')
  if (/\b(?:booking|reservations?|book-now)\b/i.test(own)) return 'booking'
  if (/\b(?:classes|lessons|treatments|workshops)\b/i.test(own)) return 'services'
  if (
    (!page.role || page.role === 'other') &&
    String(page.id ?? '')
      .split('/')
      .slice(0, -1)
      .some((part) =>
        /^(?:services?|offerings?|menus?|products?|classes|lessons|treatments|workshops)$/i.test(part)
      )
  )
    return 'offering-detail'
  return page.role && page.role !== 'other' ? page.role : pageRole({ ...page, id: String(page.id ?? '') })
}

/** Compare native routes and rendered routes, including Joomla's index.php front controller. */
export function menuPath(value) {
  try {
    return (
      decodeURI(new URL(String(value), 'https://navigation.invalid').pathname)
        .replace(/^\/index\.php(?:\/|$)/, '/')
        .replace(/\/+$/, '') || '/'
    )
  } catch {
    return ''
  }
}

/** A generic action cannot name a page; Contact can name only a contact page. */
export function invalidMenuLabel(value, role, max = 60) {
  const label = String(value ?? '').trim()
  if (!label) return 'empty-label'
  if (genericLabels.has(label.toLowerCase())) return 'generic-label'
  if (contactLabels.has(label.toLowerCase()) && role !== 'contact') return 'wrong-page-role'
  if ([...label].length > max || /[<>\n\r]/.test(label)) return 'invalid-label'
  if (
    /^(?:(?:learn|read|see|view|find out|discover|explore) (?:more|details?)|details?|click here|page|link|information)$/i.test(
      label
    )
  )
    return 'generic-label'
  if (/^(?:contact|contact us|get in touch)$/i.test(label) && role !== 'contact') return 'wrong-page-role'
  return null
}

/** Kept pages, in plan order. Explicit native page IDs resolve routes a CMS keeps outside the content map. */
export function mainMenuTargets(sitePlan, items = []) {
  const kept = (sitePlan?.pages ?? [])
    .filter((p) => p.decision === 'keep')
    .map((p) => ({ ...p, role: mainMenuRole(p) }))
  return kept.map((p) => {
    // EmDash page IDs may be collection names, not routes. Accept a native destination by role only when both are unique.
    const candidates = [
      ...new Set(
        items.filter((i) => mainMenuRole({ id: menuPath(i.path) }) === p.role).map((i) => menuPath(i.path))
      )
    ]
    const uniqueRole =
      p.role !== 'other' && kept.filter((k) => k.role === p.role).length === 1 && candidates.length === 1
    return {
      ...p,
      path:
        p.role === 'home'
          ? '/'
          : (p.path ?? items.find((i) => i.pageId === p.id)?.path ?? (uniqueRole ? candidates[0] : null))
    }
  })
}

/** The role of each declared main-menu placement, from the kept pages alone. */
export function mainMenuItems(sitePlan, items) {
  const pages = mainMenuTargets(sitePlan, items)
  return items.flatMap((item) => {
    const page = pages.find(
      (p) => item.pageId === p.id || (p.path && menuPath(p.path) === menuPath(item.path))
    )
    return page ? [{ ...item, role: page.role, pageId: page.id }] : []
  })
}
